"""Forecast stage (docs/architecture.md forecast contract; dossier 5, 6.4-6.6): submission contract, structural zeros,
components, quantile order, hierarchy coherence, cold starts and the Orion shutdown, reproducibility.

The stage reads two backtest outputs (the final-model decision and the calibrated uncertainty); the fixture writes a
minimal pair so this test does not need the 8-minute backtest.
"""

from __future__ import annotations

import json
import shutil

import numpy as np
import pandas as pd
import pytest

from celeris.config import Paths
from celeris.io import read_raw_csv, write_json
from celeris.models.context import load_model_inputs
from celeris.models.forecast_stage import FORECAST_COLUMNS, forecast_frame, read_backtest_decisions, run_forecast
from celeris.models.structural import COMPONENTS

CALIBRATION = {
    "noise_a": 1.0,
    "noise_b": {r: 0.06 for r in ("North America", "Europe", "Asia Pacific", "India", "Latin America", "Middle East & Africa")},
    "noise_scale": 1.0,
    "cv_level": {"mature": 0.1, "young": 0.2, "cold_start": 0.4},
    "cv_group": 0.03,
    "cv_common": 0.02,
    "coverage": {},
    "method": "test fixture",
}


@pytest.fixture(scope="module")
def forecast_run(pipeline_run, tmp_path_factory):
    root = tmp_path_factory.mktemp("forecast") / "outputs"
    shutil.copytree(pipeline_run.paths.outputs_dir, root)
    paths = Paths(outputs_dir=root)
    write_json({"ensemble": {"members": ["structural"], "final_model": "structural"}, "shade": 1.0}, root / "backtest" / "summary.json")
    write_json(CALIBRATION, root / "backtest" / "uncertainty_calibration.json")
    run_forecast(paths)
    out = pd.read_parquet(root / "forecast" / "forecast.parquet")
    submission = pd.read_csv(root / "forecast" / "submission.csv", keep_default_na=False)
    return paths, out, submission


def test_submission_contract(forecast_run) -> None:
    paths, out, submission = forecast_run
    test = read_raw_csv(paths.raw("test.csv"))
    assert list(submission.columns) == ["Date", "SKU_ID", "Region", "Units_Sold_Forecast"]
    assert len(submission) == len(test) == 58_219
    assert (submission[["Date", "SKU_ID", "Region"]].astype(str).to_numpy() == test[["Date", "SKU_ID", "Region"]].to_numpy()).all()
    values = submission["Units_Sold_Forecast"]
    assert values.dtype.kind == "i" and (values >= 0).all()
    assert (values.to_numpy() == out["forecast"].to_numpy()).all()
    assert (out["forecast"] == np.rint(out["mean"]).astype(int)).all()  # rounded to nearest, never floored


def test_forecast_parquet_columns(forecast_run) -> None:
    _, out, _ = forecast_run
    expected = [*FORECAST_COLUMNS, "pred_structural", "var_noise", "cv_level", "cv_group", "cv_common", "price_usd", "revenue_mean"]
    assert list(out.columns) == expected
    assert out["price_usd"].notna().all() and (out["price_usd"] > 0).all()
    assert np.allclose(out["revenue_mean"], (out["mean"] * out["price_usd"]).round(2))


def test_structural_zeros_are_exactly_zero(forecast_run) -> None:
    _, out, _ = forecast_run
    zero = out["structural_zero_reason"].notna()
    assert int(zero.sum()) == 8_842
    assert (out.loc[zero, ["forecast", "mean", "p10", "p50", "p90", "var_noise"]].to_numpy() == 0).all()
    assert out["structural_zero_reason"].value_counts().to_dict() == {"off_phase": 8_382, "lost_account": 304, "post_eol": 156}
    off = out["structural_zero_reason"] == "off_phase"
    assert (out.loc[off, "latent_mean"] > 0).mean() > 0.99  # latent demand is defined on off-phase rows
    lost_or_eol = out["structural_zero_reason"].isin(["lost_account", "post_eol"])
    assert (out.loc[lost_or_eol, "latent_mean"] == 0).all()


def test_components_multiply_to_latent_mean(forecast_run) -> None:
    _, out, _ = forecast_run
    assert np.allclose(out[list(COMPONENTS)].prod(axis=1), out["latent_mean"], rtol=1e-9, atol=1e-9)
    on = out["structural_zero_reason"].isna() & (out["accum_span"] == 1)
    assert np.allclose(out.loc[on, "mean"], out.loc[on, "latent_mean"])  # a one-month order carries its own month


def test_error_components_are_constant_within_series_and_groups(forecast_run) -> None:
    paths, out, _ = forecast_run
    grid = pd.read_parquet(paths.clean_dir / "test_grid.parquet")
    keyed = out.assign(series=out["sku_id"] + "|" + out["region"], group=grid["product_family"].to_numpy() + "|" + out["region"])
    assert (keyed.groupby("series")["cv_level"].nunique() == 1).all()
    assert (keyed.groupby("group")["cv_group"].nunique() == 1).all()
    assert keyed["cv_common"].nunique() == 1 and (keyed["cv_level"] > 0).all()


def test_quantiles_are_ordered_integers(forecast_run) -> None:
    _, out, _ = forecast_run
    assert (out["p10"] <= out["p50"]).all() and (out["p50"] <= out["p90"]).all()
    assert all(out[c].dtype.kind == "i" for c in ("p10", "p50", "p90"))
    positive = out["mean"] > 20
    assert (out.loc[positive, "p10"] < out.loc[positive, "mean"]).all() and (out.loc[positive, "p90"] > out.loc[positive, "mean"]).all()


def test_hierarchy_adds_up(forecast_run) -> None:
    paths, out, submission = forecast_run
    aggregates = pd.read_csv(paths.outputs_dir / "forecast" / "aggregates.csv", keep_default_na=False)
    total = aggregates[aggregates["level"] == "total"]
    assert total["forecast"].sum() == submission["Units_Sold_Forecast"].sum()
    test = read_raw_csv(paths.raw("test.csv"))
    family = out.assign(family=test["Product_Family"].to_numpy()).groupby(["family", "date"])["forecast"].sum()
    table = aggregates[aggregates["level"] == "family"].set_index(["node", "date"])["forecast"]
    assert (table.reindex(family.index).to_numpy() == family.to_numpy()).all()
    for level in ("region", "channel", "family_region"):
        assert aggregates.loc[aggregates["level"] == level, "forecast"].sum() == submission["Units_Sold_Forecast"].sum()
    assert (aggregates["p10"] <= aggregates["p50"]).all() and (aggregates["p50"] <= aggregates["p90"]).all()


def test_cold_starts_and_window_events(forecast_run) -> None:
    paths, out, _ = forecast_run
    grid = pd.read_parquet(paths.clean_dir / "test_grid.parquet")
    cold = grid["is_cold_start"].to_numpy()
    assert cold.sum() == 117 and (out.loc[cold, "mean"] > 0).all()
    ramp = out.loc[cold, "f_lifecycle"].to_numpy()
    first = grid.loc[cold, "months_since_launch"].to_numpy() == 0
    assert np.allclose(ramp[first], 1 - np.exp(-1 / 4.6))
    orion = (grid["customer"] == "Orion Driveline") & (grid["region"] == "North America") & grid["date"].isin(["2027-07", "2027-08"])
    assert orion.sum() == 124
    factors = json.loads((paths.outputs_dir / "forecast" / "structural_factors.json").read_text())
    analogue = factors["shutdown_analogue"]["multiplier"]
    assert 0.1 < analogue < 0.2
    assert np.allclose(out.loc[orion, "f_event"], analogue, rtol=1e-3)
    helios = (grid["customer"] == "Helios Auto Parts") & (grid["region"] == "India")
    step = factors["programme_steps"]["EV-052"]
    assert 1.15 < step < 1.35 and np.allclose(out.loc[helios, "f_event"], step, rtol=1e-3)


def test_forecast_is_reproducible(forecast_run) -> None:
    paths, out, _ = forecast_run
    summary, unc = read_backtest_decisions(paths)
    again, _, _ = forecast_frame(load_model_inputs(paths), paths, summary, unc)
    pd.testing.assert_frame_equal(out, again.reset_index(drop=True))
