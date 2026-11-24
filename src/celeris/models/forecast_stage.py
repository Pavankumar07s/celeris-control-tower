"""The ``forecast`` stage: fit on all history as of 2026-10 and forecast 2026-11 .. 2028-05 (dossier 5, 6.4-6.6).

Writes, under ``outputs/forecast/``:

- ``forecast.parquet``: one row per test.csv row in test order with the contract columns: ``forecast`` (submitted,
  rounded mean), ``mean``, integer ``p10 / p50 / p90``, ``latent_mean`` (also on off-phase rows), the multiplicative
  components (their product is ``latent_mean``), cycle placement, each member's mean (``pred_<member>``), the variance
  components (``var_noise``, ``cv_level``, ``cv_group``), price and revenue;
- ``submission.csv``: ``Date,SKU_ID,Region,Units_Sold_Forecast`` (58,219 rows, non-negative integers, test order);
- ``macro_sensitivity.csv``: per SKU and channel group, the change in log latent demand per +1 unit of each indicator
  at each lag (what-if);
- ``aggregates.csv``: bottom-up sums of the submitted forecast and the mean with aggregate P10 / P50 / P90 per month for
  total, family, region, channel and family x region (coherent by construction);
- ``uncertainty.json``: the calibrated variance components and the measured backtest coverage by level;
- ``structural_factors.json``: the fitted seasonal profiles, holiday depths, EV betas, event multipliers and family
  macro drivers (for the forecast X-ray and the methodology).

The submitted value is the conditional mean of the one-off-free latent model placed on the cycle, rounded to the nearest
integer (flooring would move the bias by -0.84 points; dossier 2.8, 6.4). Structural zeros are exactly 0 with
P10 = P50 = P90 = 0.
"""

from __future__ import annotations

import json

import numpy as np
import pandas as pd

from celeris.backtest.targets import cold_start_series, forecast_targets
from celeris.config import EXPECTED, LAST_TRAIN_MONTH_IDX, Paths
from celeris.features.macro import INDICATOR_LABEL, sensitivity_table
from celeris.io import read_raw_csv, write_csv, write_json, write_parquet
from celeris.models.context import ModelInputs, load_model_inputs, origin_context
from celeris.models.gbm import GbmModel, feature_frame, predict_gbm, train_gbm
from celeris.models.quantiles import Uncertainty, lifecycle_segment, node_quantiles, row_quantiles, row_variance, with_components
from celeris.models.structural import COMPONENTS, StructuralConfig, StructuralFit, build_universe, fit_structural, predict
from celeris.quality.checks import Check, invariant_check
from celeris.quality.stagelog import StageRecord, empty_fix_log, run_stage

STAGE = "forecast"
FORECAST_COLUMNS = (
    "date",
    "sku_id",
    "region",
    "forecast",
    "mean",
    "p10",
    "p50",
    "p90",
    "latent_mean",
    *COMPONENTS,
    "accum_span",
    "carry_weight",
    "structural_zero_reason",
)
ORION_MULTIPLIER_SD = 0.25  # sd of the Orion shutdown multiplier (P10 0.10 / P90 0.80 around the 0.14-0.15 analogue)
AGGREGATE_LEVELS = {
    "total": [],
    "family": ["product_family"],
    "region": ["region"],
    "channel": ["sales_channel"],
    "family_region": ["product_family", "region"],
}


def run_forecast(paths: Paths) -> StageRecord:
    """Run the forecast stage and publish the quality files."""
    return run_stage(paths, STAGE, forecast_stage)


def read_backtest_decisions(paths: Paths) -> tuple[dict, Uncertainty]:
    """The final-model decision (``summary.json``) and the calibrated uncertainty of the backtest stage."""
    backtest = paths.outputs_dir / "backtest"
    summary = json.loads((backtest / "summary.json").read_text(encoding="utf-8"))
    calibration = json.loads((backtest / "uncertainty_calibration.json").read_text(encoding="utf-8"))
    fields = {k: calibration[k] for k in ("noise_a", "noise_b", "noise_scale", "cv_level", "cv_group", "coverage", "method")}
    return summary, Uncertainty(**fields, cv_common=float(calibration.get("cv_common", 0.0)))


def invoice_prices(inputs: ModelInputs, targets: pd.DataFrame) -> np.ndarray:
    """Assumed invoice price per row: the 2026 price raised by the announced January increases (EV-059 +4.5 % for
    2027, EV-065 +4.0 % for 2028); cold starts: the predecessor's 2026 price x the median successor / predecessor
    price ratio of the historical replacement pairs (an assumption, dossier 2.2)."""
    prices = inputs.prices
    by_year = prices[prices["period"].astype(str).str.fullmatch(r"\d{4}")].pivot_table(index="sku_id", columns="year", values="list_price_usd", aggfunc="first")
    events = inputs.events[inputs.events["event_type"] == "Price Change"]
    raises = {int(row.start_month[:4]): float(row.announced_pct) / 100 for row in events.itertuples() if pd.notna(row.announced_pct)}
    base = by_year[2026]
    master = inputs.master.set_index("sku_id")
    ratios = []
    for sku, predecessor in master["replaces_sku"].dropna().items():
        year = int(str(master.loc[sku, "launch_date_effective"])[:4])
        if sku in by_year.index and predecessor in by_year.index and year in by_year.columns:
            a, b = by_year.loc[sku, year], by_year.loc[predecessor, year]
            if pd.notna(a) and pd.notna(b) and b > 0:
                ratios.append(a / b)
    ratio = float(np.median(ratios)) if ratios else 1.0
    price_2026 = targets["sku_id"].map(base)
    successor = targets["sku_id"].map(master["replaces_sku"]).map(base) * ratio
    price_2026 = price_2026.fillna(successor).to_numpy(dtype=float)
    year = targets["year"].to_numpy()
    factor = np.ones(len(targets))
    for y in (2027, 2028):
        factor = np.where(year >= y, factor * (1 + raises.get(y, 0.0)), factor)
    return np.round(price_2026 * factor, 2)


def gbm_member(paths: Paths, ctx, fit: StructuralFit, targets: pd.DataFrame, structural: pd.DataFrame) -> np.ndarray:
    """The GBM member trained on every inner-origin structural forecast of the backtest stage (targets <= 2026-10)."""
    training = pd.read_parquet(paths.outputs_dir / "backtest" / "gbm_training.parquet")
    model: GbmModel = train_gbm(training[training["month_idx"] <= LAST_TRAIN_MONTH_IDX])
    frame = feature_frame(ctx, fit, targets, structural).assign(structural=structural["mean"].to_numpy(), zero=targets["zero"].to_numpy())
    return predict_gbm(model, frame)


def forecast_frame(inputs: ModelInputs, paths: Paths, summary: dict, unc: Uncertainty) -> tuple[pd.DataFrame, StructuralFit, pd.DataFrame]:
    """Fit as of 2026-10 and assemble the contract frame (see module docstring)."""
    ctx = origin_context(inputs, LAST_TRAIN_MONTH_IDX)
    universe = build_universe(ctx, cold_start_series(inputs.test_grid))
    config = StructuralConfig(shade=float(summary.get("shade", 1.0)))
    fit = fit_structural(inputs, ctx, config, universe)
    targets = forecast_targets(inputs.test_grid, ctx.state.panel.n_series)
    structural = predict(fit, targets)
    members = {"structural": structural["mean"].to_numpy()}
    if "gbm" in summary["ensemble"]["members"]:
        members["gbm"] = gbm_member(paths, ctx, fit, targets, structural)
    mean = np.mean(np.stack(list(members.values())), axis=0)
    zero = targets["zero"].to_numpy(dtype=bool)
    mean = np.where(zero, 0.0, mean)
    out = targets[["date", "sku_id", "region"]].copy()
    out["mean"] = mean
    out["forecast"] = np.rint(mean).astype("int64")
    for column in ("latent_mean", *COMPONENTS):
        out[column] = structural[column].to_numpy()
    out["accum_span"] = targets["accum_span"].to_numpy()
    out["carry_weight"] = targets["carry_weight"].to_numpy()
    out["structural_zero_reason"] = targets["structural_zero_reason"].to_numpy()
    for name, values in members.items():
        out[f"pred_{name}"] = values
    rows = out.assign(
        product_family=targets["product_family"].to_numpy(),
        segment=lifecycle_segment(fit.level_source[targets["u"].to_numpy()]),
    )
    rows = with_components(rows, unc)
    orion = _orion_extra_variance(fit, targets, structural)
    out["var_noise"] = np.where(zero, 0.0, rows["var_noise"].to_numpy() + orion)
    # the relative error components are properties of the series / group, so they are constant on every row of it
    # (structural-zero rows included: their mean is 0, so they add nothing to an aggregate)
    out["cv_level"] = rows["cv_level"].to_numpy()
    out["cv_group"] = rows["cv_group"].to_numpy()
    out["cv_common"] = unc.cv_common
    q = row_quantiles(out["mean"].to_numpy(), row_variance(out).to_numpy())
    for name in ("p10", "p50", "p90"):
        out[name] = np.where(zero, 0, q[name]).astype("int64")
    out["price_usd"] = invoice_prices(inputs, targets)
    out["revenue_mean"] = np.round(out["mean"] * out["price_usd"], 2)
    order = [*FORECAST_COLUMNS, *[f"pred_{name}" for name in members], "var_noise", "cv_level", "cv_group", "cv_common", "price_usd", "revenue_mean"]
    extra = targets[["product_family", "sales_channel", "month_idx", "is_cold_start", "lifecycle_phase", "customer"]]
    return out.loc[:, order], fit, extra


def _orion_extra_variance(fit: StructuralFit, targets: pd.DataFrame, structural: pd.DataFrame) -> np.ndarray:
    """Extra independent variance on orders that carry a planned-shutdown month: (sd of the multiplier x the latent
    demand of the carried shutdown months without the shutdown)^2 (dossier 6.5: Orion P10 0.10 / P90 0.80)."""
    strike = fit.factors.strike_analog
    if strike is None:
        return np.zeros(len(targets))
    shut = fit.event < 1.0
    rows = targets["u"].to_numpy()
    cols = targets["month_idx"].to_numpy()
    span = targets["accum_span"].to_numpy()
    carry = np.nan_to_num(targets["carry_weight"].to_numpy(dtype=float), nan=1.0)
    latent = fit.latent() / np.where(shut, strike, 1.0)
    extra = np.zeros(len(targets))
    for back in range(int(span.max()) if len(span) else 0):
        month = cols - back
        active = (back < span) & shut[rows, month]
        extra += np.where(active, latent[rows, month] * (1.0 if back == 0 else carry), 0.0)
    return (ORION_MULTIPLIER_SD * extra) ** 2


def aggregates(out: pd.DataFrame, extra: pd.DataFrame, unc: Uncertainty) -> pd.DataFrame:
    """Bottom-up sums per month for total / family / region / channel / family x region with aggregate quantiles."""
    rows = out.assign(product_family=extra["product_family"].to_numpy(), sales_channel=extra["sales_channel"].to_numpy())
    rows["series_key"] = rows["sku_id"] + "|" + rows["region"]
    rows["group_key"] = rows["product_family"] + "|" + rows["region"]
    parts = []
    for level, keys in AGGREGATE_LEVELS.items():
        node_keys = [*keys, "date"]
        q = node_quantiles(rows, node_keys)
        sums = rows.groupby(node_keys, sort=True)[["forecast", "revenue_mean"]].sum()
        frame = sums.join(q[["mean", "p10", "p50", "p90"]]).reset_index()
        frame["node"] = frame[keys].astype(str).agg(" | ".join, axis=1) if keys else "Total"
        frame.insert(0, "level", level)
        parts.append(frame[["level", "node", "date", "forecast", "mean", "p10", "p50", "p90", "revenue_mean"]])
    table = pd.concat(parts, ignore_index=True)
    for column in ("mean", "p10", "p50", "p90", "revenue_mean"):
        table[column] = table[column].round(2)
    return table


def factors_json(fit: StructuralFit) -> dict:
    """Fitted factors as of 2026-10 (season by region / channel / Thermal, holidays, EV, events, macro drivers)."""
    f = fit.factors
    months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    from celeris.config import CHANNELS, REGIONS

    drivers = {}
    if fit.macro_paths is not None:
        for family, d in fit.macro_paths.drivers.items():
            drivers[family] = [
                {"indicator": INDICATOR_LABEL[name], "lag": int(lag), "coef_per_sd": round(float(c), 4), "deviance_gain": g}
                for name, lag, c, g in zip(d.indicators, d.lags, d.coef, d.gains, strict=True)
            ]
    return {
        "as_of": "2026-10",
        "region_season": {r: dict(zip(months, np.round(f.region_season[k], 4).tolist(), strict=True)) for k, r in enumerate(REGIONS)},
        "channel_season": {c: dict(zip(months, np.round(f.channel_season[k], 4).tolist(), strict=True)) for k, c in enumerate(CHANNELS)},
        "thermal_season": dict(zip(months, np.round(f.thermal_season, 4).tolist(), strict=True)),
        "lny_depth_per_full_window": round(f.lny_depth, 4),
        "ramadan_depth_per_full_window": round(f.ramadan_depth, 4),
        "ev_beta_per_index_point": {k: round(v, 5) for k, v in f.ev_beta.items()},
        "programme_steps": {k: round(v, 4) for k, v in f.steps.items()},
        "shutdown_analogue": {"event": f.strike_event, "multiplier": None if f.strike_analog is None else round(f.strike_analog, 4)},
        "aftermarket": None if fit.macro_paths is None else {"damping": round(fit.macro_paths.damping, 4), "fuel_lag1_per_sd": round(fit.macro_paths.fuel, 4)},
        "family_macro_drivers": drivers,
        "level_window_months": fit.config.level_window,
        "launch_tau": fit.config.launch_tau,
        "mea_opening_tau": fit.config.mea_tau,
    }


def forecast_stage(paths: Paths) -> StageRecord:
    """Body of the ``forecast`` stage (see module docstring)."""
    inputs = load_model_inputs(paths)
    summary, unc = read_backtest_decisions(paths)
    out, fit, extra = forecast_frame(inputs, paths, summary, unc)
    test = read_raw_csv(paths.raw("test.csv"))
    submission = pd.DataFrame({"Date": test["Date"], "SKU_ID": test["SKU_ID"], "Region": test["Region"], "Units_Sold_Forecast": out["forecast"].to_numpy()})
    table = aggregates(out, extra, unc)
    target = paths.outputs_dir / "forecast"
    uncertainty = {
        **unc.to_dict(),
        "z": {"p10": -1.2816, "p50": 0.0, "p90": 1.2816},
        "orion_multiplier_sd": ORION_MULTIPLIER_SD,
        "note": "coverage measured on the backtest folds (non-zero scored rows); the forecast window uses the same components",
    }
    written = [
        write_parquet(out, target / "forecast.parquet"),
        write_csv(submission, target / "submission.csv"),
        write_csv(sensitivity_table(fit.macro_paths, fit.macro), target / "macro_sensitivity.csv"),
        write_csv(table, target / "aggregates.csv"),
        write_json(uncertainty, target / "uncertainty.json"),
        write_json(factors_json(fit), target / "structural_factors.json"),
    ]
    checks = forecast_checks(out, submission, test, fit, table, extra)
    failed = [c.check_id for c in checks if c.severity == "error" and not c.after.passed]
    if failed:
        raise AssertionError(f"forecast contract checks failed: {failed}")
    headline = {
        "final_model": summary["ensemble"]["final_model"],
        "members": summary["ensemble"]["members"],
        "units_total": int(out["forecast"].sum()),
        "mean_total": round(float(out["mean"].sum()), 1),
        "revenue_total_usd": round(float(out["revenue_mean"].sum()), 2),
        "structural_zero_rows": int((out["structural_zero_reason"].notna()).sum()),
    }
    return StageRecord(stage=STAGE, checks=checks, fix_log=empty_fix_log(), outputs=written, headline=headline, rows_clean={"sample_submission.csv": len(submission)})


def forecast_checks(out: pd.DataFrame, submission: pd.DataFrame, test: pd.DataFrame, fit: StructuralFit, table: pd.DataFrame, extra: pd.DataFrame) -> list[Check]:
    """Submission contract, structural zeros, component identity, quantile order and hierarchy coherence."""
    zero = out["structural_zero_reason"].notna()
    product = out[list(COMPONENTS)].prod(axis=1)
    identity = ~np.isclose(product, out["latent_mean"], rtol=1e-9, atol=1e-9)
    order = (out["p10"] > out["p50"]) | (out["p50"] > out["p90"])
    keys_ok = (submission[["Date", "SKU_ID", "Region"]].to_numpy() == test[["Date", "SKU_ID", "Region"]].to_numpy()).all()
    values = submission["Units_Sold_Forecast"]
    bad_values = int(values.isna().sum() + (values < 0).sum() + (values != np.floor(values)).sum())
    rows = out.assign(product_family=extra["product_family"].to_numpy(), sales_channel=extra["sales_channel"].to_numpy())
    incoherent = 0
    for level, keys in AGGREGATE_LEVELS.items():
        bottom = rows.groupby([*keys, "date"], sort=True)["forecast"].sum().to_numpy()
        top = table[table["level"] == level].sort_values(["node", "date"], kind="stable")
        incoherent += int(len(bottom) != len(top)) + int(bottom.sum() != top["forecast"].sum())
    total_rows = rows.groupby("date")["forecast"].sum().sum()
    incoherent += int(total_rows != submission["Units_Sold_Forecast"].sum())
    return [
        invariant_check(
            check_id="FC-SUBMISSION-CONTRACT", file="test.csv", rule="sample_submission contract (dossier 2.8)",
            title="Submission: 58,219 rows in test order, non-negative integers",
            description=f"{len(submission):,} rows; keys equal to test.csv: {bool(keys_ok)}; invalid values: {bad_values}.",
            dimension="conformity", unit="rows", checked=len(submission), violations_before=0,
            violations_after=int(not keys_ok) + bad_values + int(len(submission) != EXPECTED["test.rows"]), action="submission.csv",
            expected_key="test.rows",
        ),
        invariant_check(
            check_id="FC-STRUCTURAL-ZEROS", file="test.csv", rule="dossier 5.1-5.3",
            title="Structural zeros are exactly 0 (forecast, mean and P10 / P50 / P90)",
            description=f"{int(zero.sum()):,} structural-zero rows (dossier 8,842).",
            dimension="validity", unit="rows", checked=int(zero.sum()), violations_before=0,
            violations_after=int((out.loc[zero, ["forecast", "mean", "p10", "p50", "p90"]].abs().sum(axis=1) > 0).sum()),
            action="forecast 0", expected_key="test_grid.structural_zero",
        ),
        invariant_check(
            check_id="FC-COMPONENTS", file="test.csv", rule="forecast contract",
            title="Multiplicative components multiply to latent_mean",
            description="level x f_season x f_holiday x f_macro x f_ev x f_lifecycle x f_event == latent_mean on every row.",
            dimension="consistency", unit="rows", checked=len(out), violations_before=0, violations_after=int(identity.sum()),
            action="forecast.parquet components",
        ),
        invariant_check(
            check_id="FC-QUANTILE-ORDER", file="test.csv", rule="dossier 6.5",
            title="Row quantiles are ordered integers (p10 <= p50 <= p90)",
            description=f"{int(order.sum())} rows out of order.",
            dimension="validity", unit="rows", checked=len(out), violations_before=0, violations_after=int(order.sum()),
            action="row quantiles from a negative binomial",
        ),
        invariant_check(
            check_id="FC-HIERARCHY", file="test.csv", rule="dossier 6.6",
            title="Bottom-up forecasts add up at every level",
            description="Sums of the submitted integers per month for total, family, region, channel and family x region equal the aggregates table and the submission total.",
            dimension="consistency", unit="levels", checked=len(AGGREGATE_LEVELS), violations_before=0, violations_after=incoherent,
            action="aggregates.csv",
        ),
    ]
