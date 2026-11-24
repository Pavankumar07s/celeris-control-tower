"""The dashboard data bundle (``celeris export``): schema, totals equal to the pipeline files, determinism.

The export reads the pipeline outputs already in ``outputs/`` (it never writes there) and is run into temporary
directories, so the committed bundle in ``dashboard/public/data`` is not touched.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import pytest

from celeris.config import Paths
from celeris.export.sources import resolve
from celeris.export.stage import STARTUP_FILES, run_export
from celeris.io import sha256_file

PATHS = Paths()
REQUIRED = [PATHS.clean_dir / "train_clean.parquet", PATHS.clean_dir / "test_grid.parquet", PATHS.quality_dir / "dq_report.json",
            PATHS.anomalies_dir / "anomaly_register.csv"]
pytestmark = pytest.mark.skipif(not all(p.exists() for p in REQUIRED), reason="pipeline outputs missing: run `python -m celeris all`")


@pytest.fixture(scope="module")
def bundle(tmp_path_factory: pytest.TempPathFactory) -> Path:
    out = tmp_path_factory.mktemp("bundle")
    run_export(PATHS, bundle_dir=out)
    return out


def load(bundle: Path, name: str) -> Any:
    return json.loads((bundle / name).read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def cells() -> pd.DataFrame:
    return pd.read_parquet(PATHS.clean_dir / "train_clean.parquet",
                           columns=["series_no", "month_idx", "sku_id", "units_sold", "revenue_usd", "demand_filled"])


def test_files_and_metadata(bundle: Path) -> None:
    meta = load(bundle, "meta.json")
    for name in (*STARTUP_FILES, "forecast_detail.json", "quality.json", "anomalies.json", "stockouts.json", "macro.json",
                 "backtest.json", "exceptions.json", "profiles.json"):
        assert (bundle / name).exists(), name
    listed = {f["path"]: f for f in meta["files"]}
    assert "meta.json" not in listed
    for path, entry in listed.items():
        assert entry["sha256"] == sha256_file(bundle / path), path
        assert entry["bytes"] == (bundle / path).stat().st_size
    sources = resolve(PATHS)
    assert meta["provisional"] == sources.provisional
    assert meta["sources"] == sources.describe()
    assert len(meta["quantile_selfcheck"]) >= 5
    assert {f"backtest_origin_{o}.json" for o in meta["backtest"]["origins"]} <= set(listed)
    assert {f"lineage/{c}.json" for c in load(bundle, "dims.json")["families"]["code"]} <= set(listed)


def test_dimensions_are_consistent(bundle: Path, cells: pd.DataFrame) -> None:
    dims = load(bundle, "dims.json")
    hist = load(bundle, "history.json")
    n_series = len(dims["series"]["sku"])
    assert all(len(v) == n_series for v in dims["series"].values())
    grid = pd.read_parquet(PATHS.clean_dir / "test_grid.parquet", columns=["sku_id", "region", "series_no"])
    cold_starts = len(grid[grid["series_no"].isna()].drop_duplicates(["sku_id", "region"]))
    assert n_series == cells["series_no"].nunique() + cold_starts
    seg = dims["segments"]
    assert sum(seg["length"]) == len(cells) == len(hist["u"]) == len(hist["f"])
    assert sorted(set(seg["series"])) == list(range(cells["series_no"].nunique()))
    assert len(hist["d_gap"]) == len(hist["d_val"])
    assert dims["months"]["count"] == 113 and dims["months"]["window"] == [94, 112]
    prices = dims["prices"]
    assert len(prices["values"]) == len(dims["skus"]["id"]) * prices["width"]


def _demand(hist: dict[str, Any]) -> np.ndarray:
    d = np.array([np.nan if v is None else v for v in hist["u"]], dtype=float)
    pos = np.cumsum(hist["d_gap"])
    d[pos] = hist["d_val"]
    return d


def test_history_totals_equal_pipeline(bundle: Path, cells: pd.DataFrame) -> None:
    dims = load(bundle, "dims.json")
    hist = load(bundle, "history.json")
    units = np.array([np.nan if v is None else v for v in hist["u"]], dtype=float)
    assert np.nansum(units) == cells["units_sold"].sum()
    demand = _demand(hist)
    assert not np.isnan(demand).any()
    assert abs(demand.sum() - cells["demand_filled"].sum()) <= 0.05 * len(hist["d_val"]) + 1e-6
    # revenue = shipped units x the bundled invoice price of the SKU in that month (2022 H2 carries the surcharge)
    p = dims["prices"]
    sku_index = {s: i for i, s in enumerate(dims["skus"]["id"])}
    year = cells["month_idx"].to_numpy() // 12 + 2019
    col = np.where((year == 2022) & (cells["month_idx"].to_numpy() % 12 >= 6), p["h2_2022_column"], year - p["years"][0])
    flat = np.array([np.nan if v is None else v for v in p["values"]], dtype=float)
    price = flat[cells["sku_id"].map(sku_index).to_numpy() * p["width"] + col]
    revenue = np.nansum(units * price)
    assert abs(revenue - cells["revenue_usd"].sum()) < 1.0


def test_forecast_totals_equal_submission(bundle: Path) -> None:
    fc = load(bundle, "forecast.json")
    meta = load(bundle, "meta.json")
    sources = resolve(PATHS)
    submission = pd.read_csv(sources["submission"].path)
    forecast = pd.read_parquet(sources["forecast"].path, columns=["forecast", "mean"])
    assert len(fc["forecast"]) == len(submission) == 58_219 == sum(fc["length"])
    assert sum(fc["forecast"]) == submission["Units_Sold_Forecast"].sum() == meta["submission"]["total_units"]
    assert fc["forecast"] == submission["Units_Sold_Forecast"].tolist()
    assert abs(sum(fc["mean"]) - forecast["mean"].sum()) <= 0.05 * len(fc["mean"])
    if not sources["submission"].provisional:  # the real forecast: equal to the pipeline's submission file
        assert sources["submission"].path == PATHS.outputs_dir / "forecast" / "submission.csv"
    detail = load(bundle, "forecast_detail.json")
    p10, p50, p90 = (np.array(detail[q]) for q in ("p10", "p50", "p90"))
    assert (p10 <= p50).all() and (p50 <= p90).all()
    assert len(detail["latent_mean"]) == len(fc["forecast"])


def test_lost_sales_and_register_match_pipeline(bundle: Path) -> None:
    report = json.loads((PATHS.quality_dir / "dq_report.json").read_text())
    stock = load(bundle, "stockouts.json")
    headline = report["summary"]["stages"]["demand"]
    assert abs(sum(stock["cells"]["lost"]) - headline["lost_units"]) < 1.0
    assert abs(sum(stock["cells"]["lost_usd"]) - headline["lost_revenue_usd"]) < 0.01 * len(stock["cells"]["lost_usd"])
    register = pd.read_csv(PATHS.anomalies_dir / "anomaly_register.csv")
    anomalies = load(bundle, "anomalies.json")
    assert anomalies["n"] == len(register) == len(anomalies["id"])
    quality = load(bundle, "quality.json")
    assert quality["waterfall"][0]["value"] == report["summary"]["train_rows_raw"]
    assert quality["waterfall"][-1]["value"] == report["summary"]["train_grid_cells"]
    assert len(quality["checks"]) == report["summary"]["checks"]


def test_exceptions_are_ranked_and_explained(bundle: Path) -> None:
    ex = load(bundle, "exceptions.json")
    usd = ex["revenue_at_risk"]
    assert usd == sorted(usd, reverse=True)
    assert set(ex["rule"]) <= set(ex["rules"])
    assert all(ex["cause"]) and all(ex["action"])
    state = pd.read_csv(PATHS.clean_dir / "series_state.csv")
    assert ex["rule"].count("lost_account") == int(state["is_lost_account"].sum())


def test_export_is_deterministic(bundle: Path, tmp_path: Path) -> None:
    again = tmp_path / "again"
    run_export(PATHS, bundle_dir=again)
    first = {p.relative_to(bundle).as_posix(): sha256_file(p) for p in sorted(bundle.rglob("*.json"))}
    second = {p.relative_to(again).as_posix(): sha256_file(p) for p in sorted(again.rglob("*.json"))}
    assert first == second
