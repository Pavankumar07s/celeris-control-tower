"""``series_profile.csv``: one row per series (3,083) for the demand explorer and the planner exception list.

Lifecycle (launch, EOL, status, tier, powertrain), ordering cycle (pattern, kind, phase, posterior, change), customer
history (first, at origin, switch), lost account, intermittency, level statistics, stock-out exposure and counts of
fixes and anomalies.

Intermittency follows Syntetos-Boylan-Croston (a Core requirement, reported only; the zeros here are scheduled by the
ordering cycle, so modelling uses ``cycle_kind``): ADI = known months / months with demand, CV^2 = squared coefficient
of variation (population) of the non-zero demand sizes, cut-offs ADI 1.32 and CV^2 0.49 -> smooth / intermittent /
erratic / lumpy. Computed on unconstrained demand over the whole life and over the last 36 months (dossier PZ
finding 15: smooth 71 %, intermittent 24 %, erratic 3.5 %, lumpy 1.4 % on shipped units).
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from celeris.cleaning.dates import month_label
from celeris.demand.panel import N_MONTHS
from celeris.demand.state import DemandState
from celeris.demand.unconstrained import METHODS

ADI_CUTOFF = 1.32
CV2_CUTOFF = 0.49
RECENT_MONTHS = 36
LEVEL_MONTHS = 12


def sbc(demand: np.ndarray, known: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """(ADI, CV^2, class) per row of ``demand`` over the ``known`` cells."""
    positive = known & (demand > 0)
    n_known, n_positive = known.sum(axis=1), positive.sum(axis=1)
    with np.errstate(all="ignore"):
        adi = np.where(n_positive > 0, n_known / n_positive, np.nan)
        sizes = np.where(positive, demand, np.nan)
        mean = _nanmean(sizes, n_positive)
        variance = _nanmean((sizes - mean[:, None]) ** 2, n_positive)
        cv2 = np.where(mean > 0, variance / mean**2, np.nan)
    label = np.select(
        [(adi < ADI_CUTOFF) & (cv2 < CV2_CUTOFF), (adi >= ADI_CUTOFF) & (cv2 < CV2_CUTOFF), (adi < ADI_CUTOFF) & (cv2 >= CV2_CUTOFF), (adi >= ADI_CUTOFF) & (cv2 >= CV2_CUTOFF)],
        ["smooth", "intermittent", "erratic", "lumpy"],
        "",
    )
    return adi, cv2, np.where(label == "", None, label)


def _nanmean(values: np.ndarray, counts: np.ndarray) -> np.ndarray:
    total = np.nansum(values, axis=1)
    return np.where(counts > 0, total / np.maximum(counts, 1), np.nan)


def build_profile(
    state: DemandState,
    master: pd.DataFrame,
    expected: np.ndarray,
    one_off: np.ndarray,
    fixes_per_series: pd.Series,
    anomaly_cells_per_series: pd.Series,
) -> pd.DataFrame:
    """The profile table (see module docstring)."""
    p, u, fit = state.panel, state.unconstrained, state.cycles
    names = np.asarray(METHODS)[u.method]
    series = p.series
    m = master.set_index("sku_id")
    out = series[["series_no", "sku_id", "region", "product_family", "sales_channel", "powertrain_application", "sku_tier", "lifecycle_status"]].copy()
    out["business_unit"] = out["sku_id"].map(m["business_unit"])
    out["launch_date"] = out["sku_id"].map(m["launch_date_effective"])
    out["eol_date"] = out["sku_id"].map(m["eol_date"])
    out["replaces_sku"] = out["sku_id"].map(m["replaces_sku"])
    out["start_date"] = [month_label(v) for v in p.start]
    out["end_date"] = [month_label(v) for v in p.end]
    out["months_in_history"] = p.life.sum(axis=1)
    frame = fit.series
    for column in ("cycle_pattern", "cycle_kind", "cycle_phase", "cycle_pattern_before"):
        out[column] = frame[column].to_numpy()
    out["cycle_posterior"] = frame["cycle_posterior"].round(4).to_numpy()
    out["cycle_change_month"] = [month_label(v) if v >= 0 else None for v in frame["cycle_change_idx"]]
    runs = state.customer_history
    out["customer_first"] = out["series_no"].map(runs.groupby("series_no")["customer"].first())
    out["customer_at_origin"] = out["series_no"].map(runs.groupby("series_no")["customer"].last())
    out["n_customers"] = out["series_no"].map(runs.groupby("series_no")["run"].max()).fillna(0).astype("int64")
    switches = state.switches.set_index("series_no")
    out["switch_month"] = out["series_no"].map(switches["switch_idx"]).map(lambda v: month_label(v) if pd.notna(v) else None)
    out["switch_level_ratio"] = out["series_no"].map(switches["level_ratio_region_adjusted"]).round(3)
    lost = state.lost_accounts.set_index("series_no")
    out["is_lost_account"] = frame["is_lost_account"].to_numpy()
    out["lost_since"] = out["series_no"].map(lost["lost_since_idx"]).map(lambda v: month_label(v) if pd.notna(v) else None)
    out["pre_loss_level"] = out["series_no"].map(lost["pre_loss_level"]).round(2)

    known = p.life & ~np.isnan(u.demand) & ~state.lost_tail
    months = np.arange(N_MONTHS)[None, :]
    recent = known & (months > p.as_of - RECENT_MONTHS)
    for suffix, cells in (("", known), ("_last36", recent)):
        adi, cv2, label = sbc(u.demand, cells)
        out[f"sbc_adi{suffix}"] = np.round(adi, 4)
        out[f"sbc_cv2{suffix}"] = np.round(cv2, 4)
        out[f"sbc_class{suffix}"] = label
    cleaned = np.where(one_off, expected, state.filled.demand_filled)
    last12 = p.life & (months > p.end[:, None] - LEVEL_MONTHS) & ~state.lost_tail
    out["level_last12"] = np.round(_nanmean(np.where(last12, cleaned, np.nan), last12.sum(axis=1)), 2)
    out["mean_monthly_demand"] = np.round(_nanmean(np.where(p.life, state.filled.demand_filled, np.nan), p.life.sum(axis=1)), 2)
    orders = known & (u.demand > 0)
    out["n_orders"] = orders.sum(axis=1)
    out["mean_order"] = np.round(_nanmean(np.where(orders, u.demand, np.nan), orders.sum(axis=1)), 2)
    out["zero_share"] = np.round(np.where(known.sum(axis=1) > 0, (known & (u.demand == 0)).sum(axis=1) / np.maximum(known.sum(axis=1), 1), np.nan), 4)
    out["n_stockout_listed"] = p.listed.sum(axis=1)
    out["n_stockout_inferred"] = (u.inferred | (names == "S5_semiconductor_imputed")).sum(axis=1)
    out["n_stockout_suspect"] = u.suspect.sum(axis=1)
    out["lost_units"] = np.round(np.nansum(np.where(p.life, u.lost_units, 0.0), axis=1), 1)
    both = ~np.isnan(u.demand) & ~np.isnan(p.units)
    out["unconstrained_uplift_units"] = np.round(np.nansum(np.where(both, u.demand - p.units, 0.0), axis=1), 1)
    out["n_missing_rows"] = p.missing_row.sum(axis=1)
    out["n_imputed"] = state.filled.is_imputed.sum(axis=1)
    out["n_one_offs"] = one_off.sum(axis=1)
    out["n_fixes"] = out["series_no"].map(fixes_per_series).fillna(0).astype("int64")
    out["n_anomaly_cells"] = out["series_no"].map(anomaly_cells_per_series).fillna(0).astype("int64")
    return out
