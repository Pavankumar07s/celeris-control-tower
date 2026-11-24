"""Forecast part of the bundle: the submitted forecast and the inputs of the aggregate-quantile formula (start-up
file), the per-row quantiles, latent demand and multiplicative components (lazy file), and the self-check quantiles.

Rows are grouped by series in test.csv order (each series is a contiguous run of months), so a series is described
by its unified index, first month and length, and every per-row column is one flat array.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from celeris.config import CHANNELS, REGIONS
from celeris.export.encode import Json, ints, nums
from celeris.export.history import SeriesIndex, month_index
from celeris.export.quantiles import aggregate_quantiles

FACTORS = ("level", "f_season", "f_holiday", "f_macro", "f_ev", "f_lifecycle", "f_event")
ZERO_REASONS = ("off_phase", "lost_account", "post_eol")  # code = position + 1; 0 = not a structural zero
REQUIRED = ("date", "sku_id", "region", "forecast", "mean", "p10", "p50", "p90", "latent_mean", *FACTORS, "accum_span",
            "carry_weight", "structural_zero_reason", "var_noise", "cv_level", "cv_group", "price_usd", "revenue_mean")


@dataclass(frozen=True)
class ForecastRows:
    """The forecast joined to the test grid, in test.csv order, with the bundled (rounded) quantile inputs."""

    frame: pd.DataFrame
    members: list[str]


def load_rows(forecast: pd.DataFrame, grid: pd.DataFrame, index: SeriesIndex) -> ForecastRows:
    missing = [c for c in REQUIRED if c not in forecast.columns]
    if missing:
        raise ValueError(f"forecast.parquet lacks contract columns {missing}")
    if len(forecast) != len(grid) or not (forecast[["date", "sku_id", "region"]].to_numpy()
                                          == grid[["date", "sku_id", "region"]].to_numpy()).all():
        raise ValueError("forecast.parquet rows are not in test.csv order")
    f = forecast.copy()
    for column in ("product_family", "sales_channel", "customer", "month_idx"):
        f[column] = grid[column].to_numpy()
    f["series"] = index.idx_of(f["sku_id"], f["region"])
    # the bundled values, rounded exactly as written; the self-check runs on these
    f["mean_b"] = np.round(f["mean"].to_numpy(dtype=float), 1)
    f["var_b"] = np.round(significant(f["var_noise"].to_numpy(dtype=float), 3), 3)
    f["cvl_b"] = np.round(f["cv_level"].to_numpy(dtype=float), 6)
    f["cvg_b"] = np.round(f["cv_group"].to_numpy(dtype=float), 6)
    # the market-wide term of the formula: one value for every row (0 for a forecast written before it existed)
    if "cv_common" in f.columns:
        if f["cv_common"].nunique() > 1:
            raise ValueError("cv_common is not constant: the aggregate-quantile formula needs one market-wide value")
        f["cvc_b"] = np.round(f["cv_common"].to_numpy(dtype=float), 6)
    else:
        f["cvc_b"] = 0.0
    for column, key in (("cv_level", "series"), ("cv_group", ["product_family", "region"])):
        if (f.groupby(key)[column].nunique() > 1).any():
            raise ValueError(f"{column} is not constant within its {key}: the aggregate-quantile formula needs it")
    if (f["forecast"] < 0).any() or not (f["p10"] <= f["p50"]).all() or not (f["p50"] <= f["p90"]).all():
        raise ValueError("forecast is negative or quantiles are not ordered")
    members = sorted(c for c in f.columns if c.startswith("pred_"))
    return ForecastRows(frame=f, members=members)


def significant(values: np.ndarray, digits: int) -> np.ndarray:
    """Round to ``digits`` significant digits (the noise variance needs relative, not absolute, precision)."""
    out = np.zeros_like(values)
    nz = values != 0
    scale = np.power(10.0, digits - 1 - np.floor(np.log10(np.abs(values[nz]))))
    out[nz] = np.round(values[nz] * scale) / scale
    return out


def series_runs(f: pd.DataFrame) -> pd.DataFrame:
    new = f["series"].ne(f["series"].shift())
    run = new.cumsum() - 1
    runs = f.groupby(run).agg(series=("series", "first"), start=("month_idx", "first"), length=("month_idx", "size"),
                              last=("month_idx", "last"))
    if runs["series"].duplicated().any() or not (runs["last"] - runs["start"] + 1 == runs["length"]).all():
        raise ValueError("test rows of a series are not one contiguous run of months")
    return runs.drop(columns="last").reset_index(drop=True)


def build_forecast(rows: ForecastRows, index: SeriesIndex) -> dict[str, Json]:
    f = rows.frame
    runs = series_runs(f)
    first = f.groupby("series", sort=False).first()
    groups = f.drop_duplicates(["product_family", "region"]).sort_values(["product_family", "region"])
    group_key = {(fam, reg): i for i, (fam, reg) in enumerate(zip(groups["product_family"], groups["region"], strict=True))}
    zero = f["structural_zero_reason"].map({r: i + 1 for i, r in enumerate(ZERO_REASONS)}).fillna(0).astype(int)
    return {
        "series": ints(runs["series"]),
        "start": ints(runs["start"]),
        "length": ints(runs["length"]),
        "cv_level": [float(v) for v in first.loc[runs["series"], "cvl_b"]],
        "group": [group_key[(fam, reg)] for fam, reg in zip(first.loc[runs["series"], "product_family"],
                                                            first.loc[runs["series"], "region"], strict=True)],
        "groups": {"family": [index.families.index(v) for v in groups["product_family"]],
                   "region": [REGIONS.index(v) for v in groups["region"]],
                   "cv_group": [float(v) for v in groups["cvg_b"]]},
        "cv_common": common_cv(f),
        "forecast": ints(f["forecast"]),
        "mean": nums(f["mean_b"], 1),
        "var_noise": nums(f["var_b"], 3),
        "zero_reason": [int(v) for v in zero],
        "zero_reasons": list(ZERO_REASONS),
        "price": nums(f["price_usd"], 2),
    }


def common_cv(f: pd.DataFrame) -> float:
    """The bundled market-wide coefficient of variation (the same for every row)."""
    return float(f["cvc_b"].iat[0]) if len(f) else 0.0


def build_detail(rows: ForecastRows) -> dict[str, Json]:
    f = rows.frame
    accum = f["accum_span"].astype(int) + 4 * f["carry_weight"].eq(0.5).astype(int)
    out: dict[str, Json] = {
        "p10": ints(f["p10"]), "p50": ints(f["p50"]), "p90": ints(f["p90"]),
        "latent_mean": nums(f["latent_mean"], 3),
        "accum": [int(v) for v in accum],
        "factors": {name: nums(f[name], 3 if name == "level" else 5) for name in FACTORS},
        "members": {name.removeprefix("pred_"): nums(f[name], 2) for name in rows.members},
    }
    return out


def price_assumption(rows: ForecastRows, cells: pd.DataFrame) -> dict[str, Json]:
    """Median forecast price change per forecast year vs each SKU's 2026 invoice price (computed, never typed)."""
    base = cells[cells["year"] == 2026].groupby("sku_id")["unit_price_usd"].last()
    f = rows.frame.assign(year=rows.frame["date"].str[:4].astype(int))
    ratio = f["price_usd"] / f["sku_id"].map(base)
    by_year = ratio.groupby(f["year"]).median()
    return {"vs_2026_pct": {str(int(y)): round((float(v) - 1) * 100, 2) for y, v in by_year.items() if np.isfinite(v)}}


def _selection(f: pd.DataFrame, spec: dict[str, Json], index: SeriesIndex) -> pd.Series:
    mask = pd.Series(True, index=f.index)
    if spec.get("family") is not None:
        mask &= f["product_family"] == spec["family"]
    if spec.get("sku") is not None:
        mask &= f["sku_id"] == spec["sku"]
    if spec.get("region") is not None:
        mask &= f["region"] == spec["region"]
    if spec.get("channel") is not None:
        mask &= f["sales_channel"] == spec["channel"]
    if spec.get("customer") is not None:
        mask &= f["customer"] == spec["customer"]
    return mask & f["month_idx"].isin(spec["months"])


def self_check(rows: ForecastRows, index: SeriesIndex) -> list[dict[str, Json]]:
    """Aggregate quantiles of a few selections, computed on the bundled values, for the front end to reproduce."""
    f = rows.frame
    window = sorted(f["month_idx"].unique().tolist())
    top_sku = f.groupby("sku_id")["forecast"].sum().sort_values(ascending=False, kind="stable").index[0]
    by_family = f.groupby("product_family")["forecast"].sum().sort_values(ascending=False, kind="stable").index
    specs: list[dict[str, Json]] = [
        {"label": "total, first forecast month", "months": window[:1]},
        {"label": "total, 19 months", "months": window},
        {"label": f"{by_family[0]}, 19 months", "family": by_family[0], "months": window},
        {"label": f"{by_family[-1]} x Europe, 2027-07", "family": by_family[-1], "region": "Europe",
         "months": [month_index("2027-07")]},
        {"label": f"{top_sku}, 3-month cover from 2027-01", "sku": top_sku,
         "months": [month_index(m) for m in ("2027-01", "2027-02", "2027-03")]},
        {"label": "Orion Driveline x North America, 2027-07..08", "customer": "Orion Driveline",
         "region": "North America", "months": [month_index("2027-07"), month_index("2027-08")]},
        {"label": f"{CHANNELS[2]}, 19 months", "channel": CHANNELS[2], "months": window},
    ]
    out = []
    for spec in specs:
        sel = f[_selection(f, spec, index)]
        q = aggregate_quantiles(pd.DataFrame({
            "series": sel["series"], "group": sel["product_family"] + "|" + sel["region"], "mean": sel["mean_b"],
            "var_noise": sel["var_b"], "cv_level": sel["cvl_b"], "cv_group": sel["cvg_b"]}), cv_common=common_cv(f))
        out.append({**spec, "mean_sum": round(float(sel["mean_b"].sum()), 6), "p10": q[0], "p50": q[1], "p90": q[2]})
    return out


def check_submission(rows: ForecastRows, submission: pd.DataFrame) -> dict[str, Json]:
    """The bundled forecast must equal the submission file row by row."""
    f = rows.frame
    same_keys = (submission[["Date", "SKU_ID", "Region"]].to_numpy() == f[["date", "sku_id", "region"]].to_numpy()).all()
    same_values = (submission["Units_Sold_Forecast"].to_numpy() == f["forecast"].to_numpy()).all()
    if not (same_keys and same_values):
        raise ValueError("forecast.parquet and submission.csv disagree: the bundle would contradict the submission")
    return {"rows": len(submission), "total_units": int(submission["Units_Sold_Forecast"].sum()), "matches_forecast": True}
