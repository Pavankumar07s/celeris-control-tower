"""Account events: customer at time, customer switches and lost accounts (dossier 3, 4.15, 5.2, 5.6, 7.1 step 8;
LK findings 9-11, TS findings 5-7, PZ findings 11-12).

- **Customer at time.** The customer of a record is its (canonical) Customer_Name; a series' history is the sequence
  of customer runs over its observed records up to the as-of month. Customer-scoped events (EV-038 Nexon | Europe,
  EV-052 Helios | India, EV-062 Orion | North America) must be joined on this, not on the latest customer (HYD-009
  Europe was Nexon in 2023 and is Apex now).
- **Switches.** A series whose history has two customer runs switched once, on the first month of the second run
  (23 at 2026-10, 2022-07..2025-05, no gap, channel and cycle unchanged). The level step is reported as the ratio of
  monthly-equivalent demand in up to 12 months after vs before, also divided by the same ratio of all non-switch
  series of the region (TS: 0.54..2.11).
- **Lost accounts** come from the cycle step (``LOST_MIN_SILENT`` silent months on a live series); the pre-loss level is
  the monthly-equivalent demand of the 12 months up to the last order (dossier 5.2).
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from celeris.demand.cycles import CycleFit
from celeris.demand.panel import N_MONTHS, Panel

LEVEL_WINDOW = 12


def customer_history(cells: pd.DataFrame, as_of: int) -> pd.DataFrame:
    """Customer runs per series over observed records up to ``as_of``: series_no, run, customer, first / last month."""
    observed = cells[(cells["month_idx"] <= as_of) & (cells["row_status"] == "observed")]
    observed = observed.sort_values(["series_no", "month_idx"], kind="stable")
    change = observed["customer"].ne(observed.groupby("series_no")["customer"].shift())
    run = change.astype("int64").groupby(observed["series_no"]).cumsum()
    history = (
        observed.assign(run=run)
        .groupby(["series_no", "run"], sort=True)
        .agg(customer=("customer", "first"), first_idx=("month_idx", "min"), last_idx=("month_idx", "max"), n_records=("month_idx", "size"))
        .reset_index()
    )
    return history


def customer_at_time(history: pd.DataFrame, series_no: np.ndarray, month_idx: np.ndarray) -> np.ndarray:
    """Customer of each (series, month): the run that covers the month; between runs the later one; after the last
    observed record the last run (the test file confirms the last train customer for 3,058 / 3,058 series)."""
    out = np.full(len(series_no), None, dtype=object)
    runs = history.sort_values(["series_no", "run"])
    for s, group in runs.groupby("series_no", sort=False):
        rows = np.flatnonzero(series_no == s)
        if not len(rows):
            continue
        firsts = group["first_idx"].to_numpy()
        position = np.searchsorted(firsts, month_idx[rows], side="right") - 1
        position = np.where(position < 0, 0, position)
        lasts = group["last_idx"].to_numpy()
        gap = month_idx[rows] > lasts[position]
        later = np.minimum(position + gap.astype(int), len(group) - 1)
        out[rows] = group["customer"].to_numpy()[later]
    return out


def monthly_equivalent(demand: np.ndarray, life: np.ndarray, first: np.ndarray, last: np.ndarray) -> np.ndarray:
    """Mean monthly demand of each series over months ``first..last`` (inclusive) inside its life (NaN-safe sum / months)."""
    months = np.arange(N_MONTHS)
    window = (months[None, :] >= first[:, None]) & (months[None, :] <= last[:, None]) & life
    count = window.sum(axis=1)
    total = np.where(window, np.nan_to_num(demand), 0.0).sum(axis=1)
    with np.errstate(all="ignore"):
        return np.where(count > 0, total / count, np.nan)


def customer_switches(history: pd.DataFrame, filled: np.ndarray, panel: Panel) -> pd.DataFrame:
    """One row per switch: month, customers before / after and the level step (raw and region-adjusted)."""
    runs = history.groupby("series_no")["run"].max()
    switched = runs[runs >= 2].index.to_numpy()
    if (runs > 2).any():
        raise AssertionError("a series has more than one customer switch")
    second = history[(history["series_no"].isin(switched)) & (history["run"] == 2)].set_index("series_no")
    first = history[(history["series_no"].isin(switched)) & (history["run"] == 1)].set_index("series_no")
    regions = panel.series["region"].to_numpy()
    rows = []
    for s in switched:
        month = int(second.loc[s, "first_idx"])
        before = _window_level(filled, panel, month - LEVEL_WINDOW, month - 1)
        after = _window_level(filled, panel, month, month + LEVEL_WINDOW - 1)
        control = (regions == regions[s]) & ~np.isin(np.arange(panel.n_series), switched)
        ratio = after[s] / before[s] if before[s] > 0 else np.nan
        control_ratio = np.nansum(after[control] * (before[control] > 0)) / np.nansum(before[control] * (after[control] > 0))
        rows.append(
            {
                "series_no": int(s),
                "switch_idx": month,
                "customer_before": first.loc[s, "customer"],
                "customer_after": second.loc[s, "customer"],
                "gap_months": month - int(first.loc[s, "last_idx"]) - 1,
                "months_after": int(min(panel.as_of, panel.series.loc[s, "end_idx"]) - month + 1),
                "level_before": before[s],
                "level_after": after[s],
                "level_ratio": ratio,
                "level_ratio_region_adjusted": ratio / control_ratio if control_ratio > 0 else np.nan,
            }
        )
    columns = ["series_no", "switch_idx", "customer_before", "customer_after", "gap_months", "months_after",
               "level_before", "level_after", "level_ratio", "level_ratio_region_adjusted"]
    return pd.DataFrame(rows, columns=columns)


def _window_level(filled: np.ndarray, panel: Panel, first: int, last: int) -> np.ndarray:
    n = panel.n_series
    return monthly_equivalent(filled, panel.life, np.full(n, max(first, 0)), np.full(n, min(last, panel.as_of)))


def lost_account_table(fit: CycleFit, filled: np.ndarray, panel: Panel) -> pd.DataFrame:
    """One row per lost account: last order, first silent month, silent months and pre-loss monthly level."""
    frame = fit.series[fit.series["is_lost_account"]]
    s = frame["series_no"].to_numpy()
    last = frame["last_order_idx"].to_numpy()
    level = monthly_equivalent(filled[s], panel.life[s], last - LEVEL_WINDOW + 1, last)
    return pd.DataFrame(
        {
            "series_no": s,
            "last_order_idx": last,
            "lost_since_idx": last + 1,
            "silent_months": frame["trailing_silent"].to_numpy(),
            "pre_loss_level": level,
        }
    )
