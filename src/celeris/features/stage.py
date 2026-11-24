"""The ``features`` stage (problem statement workstream 3; dossier 4.5-4.8, 5.7-5.8, 6.2).

Builds every feature as of the final origin 2026-10 with the same pure functions the backtest calls at each fold
origin, and writes:

- ``features/feature_catalogue.csv``: name, group, definition, source and the models using each feature;
- ``features/calendar_features.csv``: one row per month 2019-01 .. 2028-05: calendar, moving-holiday day counts, the
  standardised macro indicators (as of 2026-10) and the EV factor of the EV and ICE classes;
- ``features/macro_leadlag.csv``: family x indicator x lag 0..12 x era correlations and the selected drivers per era
  (which indicator leads which family at what lag, and whether the lag structure is stable over time);
- ``features/sku_macro_drivers.csv``: per SKU its family drivers, MAP lag, lag posterior mass and coefficient per sd;
- ``features/train_features.parquet``: one row per training grid cell (lags, rolling statistics, monthly-equivalent
  level, calendar, holiday days, lifecycle, the in-sample macro and EV factors);
- ``features/test_features.parquet``: one row per test row (calendar, holiday days, the structural components, level,
  lifecycle, cycle placement, intermittency class, lags and rolling statistics at the origin).
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from celeris.backtest.targets import cold_start_series, forecast_targets
from celeris.cleaning.dates import month_label
from celeris.config import LAST_TRAIN_MONTH_IDX, Paths
from celeris.features.calendar import calendar_frame
from celeris.features.catalogue import feature_catalogue
from celeris.features.macro import ERAS, INDICATOR_LABEL, INDICATORS, _weights, leadlag_table, select_drivers
from celeris.features.panel import intermittency_at, panel_features
from celeris.io import write_csv, write_parquet
from celeris.models.context import load_model_inputs, origin_context
from celeris.models.structural import StructuralConfig, StructuralFit, build_universe, fit_structural, predict
from celeris.quality.checks import Check, invariant_check
from celeris.quality.stagelog import StageRecord, empty_fix_log, run_stage

STAGE = "features"
FILE = "train.csv"


def run_features(paths: Paths) -> StageRecord:
    """Run the features stage and publish the quality files."""
    return run_stage(paths, STAGE, features_stage)


def calendar_features(events: pd.DataFrame, fit: StructuralFit) -> pd.DataFrame:
    """Calendar + holiday days + standardised indicators + EV factors per month (2019-01 .. 2028-05)."""
    frame = calendar_frame(events)
    z = fit.macro.z
    for k, name in enumerate(INDICATORS):
        frame[f"z_{name}"] = np.round(z[:, k], 4)
    frame["ev_adoption_index"] = fit.macro.ev
    window = fit.window_months()
    ref = fit.macro.ev[window].mean()
    for cls in ("EV", "ICE"):
        frame[f"ev_factor_{cls.lower()}"] = np.round(np.exp(fit.factors.ev_beta[cls] * (fit.macro.ev - ref)), 5)
    return frame


def leadlag(fit: StructuralFit) -> pd.DataFrame:
    """``macro_leadlag.csv``: correlations by era with the forward-selection drivers of each era marked."""
    if fit.family_index is None or fit.macro_paths is None:
        raise RuntimeError("the final fit has no macro paths")
    config = fit.config.macro
    r, w = _weights(fit.family_index, config)
    family_r = {name: r[k] for k, name in enumerate(fit.family_names)}
    family_w = {name: w[k] for k, name in enumerate(fit.family_names)}
    drivers_by_era: dict[str, dict] = {"all": dict(fit.macro_paths.drivers)}
    for era, (first, last) in ERAS.items():
        if era == "all":
            continue
        months = np.arange(first, min(last, r.shape[1] - 1) + 1)
        drivers_by_era[era] = {name: select_drivers(r[k][months], w[k][months], months, fit.macro, config) for k, name in enumerate(fit.family_names)}
    table = leadlag_table(family_r, family_w, fit.macro, drivers_by_era)
    table["indicator"] = table["indicator"].map(INDICATOR_LABEL)
    return table.sort_values(["product_family", "era", "indicator", "lag"], kind="stable").reset_index(drop=True)


def era_drivers(fit: StructuralFit, table: pd.DataFrame) -> pd.DataFrame:
    """Selected driver and lag per family and era (the lag-stability summary)."""
    drivers = table[table["is_driver"]]
    return drivers.groupby(["product_family", "era"], sort=True).apply(
        lambda g: " + ".join(f"{i}@{lag}" for i, lag in zip(g["indicator"], g["lag"], strict=True)), include_groups=False
    ).rename("drivers").reset_index()


def sku_drivers(fit: StructuralFit) -> pd.DataFrame:
    """Per SKU: family drivers, MAP lag of each, its posterior mass and the SKU coefficient per sd."""
    paths = fit.macro_paths
    rows = []
    for i, sku in enumerate(paths.skus):
        d = paths.drivers.get(paths.family_of[sku])
        row = {"sku_id": sku, "product_family": paths.family_of[sku], "n_months": int(paths.n_months[i])}
        for j in range(3):
            if d is not None and j < len(d.indicators):
                post = paths.lag_posterior[i, j]
                row[f"driver{j + 1}"] = INDICATOR_LABEL[d.indicators[j]]
                row[f"driver{j + 1}_lag"] = int(post.argmax())
                row[f"driver{j + 1}_lag_mass"] = round(float(post.max()), 3)
                row[f"driver{j + 1}_coef_per_sd"] = round(float(paths.coef[i, j]), 4)
            else:
                row[f"driver{j + 1}"] = None
        rows.append(row)
    out = pd.DataFrame(rows)
    out["aftermarket_damping"] = round(paths.damping, 4)
    out["aftermarket_fuel_lag1_per_sd"] = round(paths.fuel, 4)
    return out


def train_features(ctx, fit: StructuralFit, cells: pd.DataFrame, calendar: pd.DataFrame) -> pd.DataFrame:
    """One row per grid cell: panel features, calendar, holiday days and in-sample lifecycle / macro / EV factors."""
    s = cells["series_no"].to_numpy()
    t = cells["month_idx"].to_numpy()
    out = cells[["date", "sku_id", "region", "series_no", "month_idx"]].copy()
    for name, values in panel_features(ctx.state).items():
        out[name] = values[s, t].astype("float32")
    out["month"] = t % 12 + 1
    region = cells["region"].to_numpy()
    out["lny_days"] = np.where(region == "Asia Pacific", calendar["lny_days_apac"].to_numpy()[t], 0)
    out["ramadan_days"] = np.where(region == "Middle East & Africa", calendar["ramadan_days_mea"].to_numpy()[t], 0)
    window = fit.window_months()
    macro = np.exp(fit.log_macro[: ctx.state.panel.n_series])
    out["f_macro"] = (macro[s, t] / macro[s][:, window].mean(axis=1)).astype("float32")
    ev = fit.ev[: ctx.state.panel.n_series]
    out["f_ev"] = (ev[s, t] / ev[s][:, window].mean(axis=1)).astype("float32")
    out["f_season"] = fit.season[s, t].astype("float32")
    out["f_holiday"] = fit.holiday[s, t].astype("float32")
    out["f_lifecycle"] = fit.lifecycle[s, t].astype("float32")
    out["f_event"] = fit.event[s, t].astype("float32")
    universe = fit.universe
    out["months_since_launch"] = t - universe["launch_idx"].to_numpy()[s]
    out["series_age"] = t - universe["start_idx"].to_numpy()[s]
    return out


def _row_mean(values: np.ndarray) -> np.ndarray:
    count = (~np.isnan(values)).sum(axis=1)
    return np.where(count > 0, np.nansum(values, axis=1) / np.maximum(count, 1), np.nan)


def test_features(ctx, fit: StructuralFit, targets: pd.DataFrame, calendar: pd.DataFrame) -> pd.DataFrame:
    """One row per test row: calendar, holiday days, structural components, lifecycle, cycle and origin statistics."""
    structural = predict(fit, targets)
    out = targets[["date", "sku_id", "region", "month_idx"]].copy()
    t = targets["month_idx"].to_numpy()
    out["month"] = t % 12 + 1
    region = targets["region"].to_numpy()
    out["lny_days"] = np.where(region == "Asia Pacific", calendar["lny_days_apac"].to_numpy()[t], 0)
    out["ramadan_days"] = np.where(region == "Middle East & Africa", calendar["ramadan_days_mea"].to_numpy()[t], 0)
    for column in ("level", "f_season", "f_holiday", "f_macro", "f_ev", "f_lifecycle", "f_event", "latent_mean"):
        out[column] = structural[column].to_numpy(dtype="float32")
    for column in ("months_since_launch", "series_age", "months_to_eol", "lifecycle_phase", "cycle_kind", "accum_span", "carry_weight", "p_order", "is_structural_zero"):
        out[column] = targets[column].to_numpy()
    s = targets["series_no"].fillna(-1).to_numpy(dtype="int64")
    known = s >= 0
    panel = panel_features(ctx.state)
    origin = LAST_TRAIN_MONTH_IDX
    demand = np.where(ctx.state.panel.life, ctx.state.filled.demand_filled, np.nan)
    stats = {
        "demand_at_origin": demand[:, origin],
        "roll_mean_12_at_origin": _row_mean(demand[:, origin - 11 : origin + 1]),
        "level_me_12_at_origin": panel["level_me_12"][:, origin],
        "zero_share_12_at_origin": panel["zero_share_12"][:, origin],
    }
    for name, values in stats.items():
        column = np.full(len(targets), np.nan)
        column[known] = values[s[known]]
        out[name] = column.astype("float32")
    sbc = intermittency_at(ctx.state, origin).set_index("series_no")
    out["sbc_class_36"] = pd.Series(s).map(sbc["sbc_class_36"]).to_numpy()
    out["level_source"] = fit.level_source[targets["u"].to_numpy()]
    return out


def features_stage(paths: Paths) -> StageRecord:
    """Body of the ``features`` stage (see module docstring)."""
    inputs = load_model_inputs(paths)
    ctx = origin_context(inputs, LAST_TRAIN_MONTH_IDX)
    universe = build_universe(ctx, cold_start_series(inputs.test_grid))
    fit = fit_structural(inputs, ctx, StructuralConfig(), universe)
    calendar = calendar_features(inputs.events, fit)
    table = leadlag(fit)
    cells = inputs.history.cells[["date", "sku_id", "region", "series_no", "month_idx"]]
    targets = forecast_targets(inputs.test_grid, ctx.state.panel.n_series)
    train = train_features(ctx, fit, cells, calendar)
    test = test_features(ctx, fit, targets, calendar)
    catalogue = feature_catalogue()
    drivers = sku_drivers(fit)
    out = paths.outputs_dir / "features"
    written = [
        write_csv(catalogue, out / "feature_catalogue.csv"),
        write_csv(calendar, out / "calendar_features.csv"),
        write_csv(table, out / "macro_leadlag.csv"),
        write_csv(drivers, out / "sku_macro_drivers.csv"),
        write_parquet(train, out / "train_features.parquet"),
        write_parquet(test, out / "test_features.parquet"),
    ]
    stability = era_drivers(fit, table)
    checks = feature_checks(calendar, table, train, test, len(inputs.test_grid))
    headline = {
        "features_catalogued": int(len(catalogue)),
        "family_drivers": {row.product_family: row.drivers for row in stability[stability["era"] == "all"].itertuples()},
        "family_drivers_by_era": {f"{row.product_family}|{row.era}": row.drivers for row in stability.itertuples()},
        "lny_depth": round(fit.factors.lny_depth, 4),
        "ramadan_depth": round(fit.factors.ramadan_depth, 4),
        "ev_beta": {k: round(v, 5) for k, v in fit.factors.ev_beta.items()},
        "aftermarket_damping": round(fit.macro_paths.damping, 4),
        "aftermarket_fuel_lag1_per_sd": round(fit.macro_paths.fuel, 4),
        "helios_step": {k: round(v, 4) for k, v in fit.factors.steps.items()},
        "strike_analog": {"event": fit.factors.strike_event, "multiplier": None if fit.factors.strike_analog is None else round(fit.factors.strike_analog, 4)},
    }
    return StageRecord(stage=STAGE, checks=checks, fix_log=empty_fix_log(), outputs=written, headline=headline)


def feature_checks(calendar: pd.DataFrame, table: pd.DataFrame, train: pd.DataFrame, test: pd.DataFrame, test_rows: int) -> list[Check]:
    """Holiday day counts in the window, lead-lag coverage and the row counts of the feature tables."""
    window = calendar[calendar["is_forecast_window"]]
    holiday = {month_label(int(r.month_idx)): (int(r.lny_days_apac), int(r.ramadan_days_mea)) for r in window.itertuples() if r.lny_days_apac or r.ramadan_days_mea}
    expected = {"2027-02": (10, 21), "2027-03": (0, 9), "2028-01": (6, 4), "2028-02": (4, 26)}
    mismatch = sum(holiday.get(k) != v for k, v in expected.items()) + sum(k not in expected for k in holiday)
    drivers = table[(table["era"] == "all") & table["is_driver"]]
    return [
        invariant_check(
            check_id="FEAT-HOLIDAY-DAYS",
            file="events_calendar.csv",
            rule="dossier 5.7",
            title="Moving-holiday day counts in the forecast window",
            description=f"LNY / Ramadan days by window month: {holiday}; dossier: {expected}.",
            dimension="accuracy",
            unit="months",
            checked=len(expected),
            violations_before=0,
            violations_after=int(mismatch),
            action="lny_days_apac / ramadan_days_mea features",
        ),
        invariant_check(
            check_id="FEAT-MACRO-LEADLAG",
            file="macro_indicators.csv",
            rule="workstream 3 Advanced / Expert",
            title="Family lead-lag table and drivers",
            description=f"{len(table):,} rows (7 families x 8 indicators x 13 lags x 3 eras); {len(drivers)} family drivers at the final origin.",
            dimension="completeness",
            unit="rows",
            checked=int(len(table)),
            violations_before=0,
            violations_after=int(table["corr"].isna().sum()),
            action="outputs/features/macro_leadlag.csv",
            expected_key="features.leadlag_rows",
        ),
        invariant_check(
            check_id="FEAT-TABLES",
            file="test.csv",
            rule="workstream 3",
            title="Feature tables cover every grid cell and every test row",
            description=f"train_features {len(train):,} rows (grid 245,548), test_features {len(test):,} rows (test {test_rows:,}).",
            dimension="completeness",
            unit="rows",
            checked=int(len(train) + len(test)),
            violations_before=0,
            violations_after=int(len(train) != 245_548) + int(len(test) != test_rows),
            action="train_features.parquet / test_features.parquet",
        ),
    ]


__all__ = ["features_stage", "run_features"]
