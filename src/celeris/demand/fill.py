"""Missing-cell and blank treatment from the cycle, and the cycle-aware fill for display and lags (dossier 7.1 step 9,
K13, N12; PZ findings 5-6, PZ.v).

Treatment of cells whose demand the data do not give:

- listed missing rows: demand = Requested_Units (S1, already applied);
- missing rows in an off-phase month or inside a lost-account tail: demand 0 (``missing_offphase_zero``,
  ``missing_lost_tail_zero``); the cycle is deterministic to 99.4 %, so the zero is known, not assumed;
- missing rows in an on-phase month: unknown (``missing_onphase_unknown``), never 0 (business rule 3);
- ERP blanks with an order (N12): unknown positive (``erp_unknown_order``); the off-phase one is spill (cycle pass).

``demand_filled`` completes the series for display and lag features: known demand as is, 0 in off-phase / lost
cells, and for an unknown on-phase cell ``level x accumulated regional index``, where the index ``I[region, month]``
is the median of ``demand / series mean`` over stable monthly series and the level is the median of
``order / accumulated index`` over the 12 nearest known orders of the series (PZ: WAPE 0.257-0.259, bias -1.9 to
-3.2 %). The accumulated index of a B / Q / T order sums the latent months it carries (weight 0.5 for an annual
shutdown month), so an off-phase month is never filled with a series mean.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from celeris.demand.cycles import CycleFit
from celeris.demand.panel import N_MONTHS, Panel
from celeris.demand.unconstrained import METHODS, M, Unconstrained

NEIGHBOUR_ORDERS = 12
STABLE_KINDS = ("M", "A")
UNKNOWN_METHODS = ("missing_onphase_unknown", "erp_unknown_order", "D3_hidden_second_month", "missing_after_backorder")
IMPUTED_ZERO_METHODS = ("missing_offphase_zero", "missing_lost_tail_zero")


def lost_tail(fit: CycleFit, panel: Panel) -> np.ndarray:
    """(S, T) cells after the last order of a lost account."""
    last = fit.series["last_order_idx"].to_numpy()
    lost = fit.series["is_lost_account"].to_numpy()
    return lost[:, None] & (np.arange(N_MONTHS)[None, :] > last[:, None]) & panel.life


def treat_missing(unc: Unconstrained, fit: CycleFit, panel: Panel) -> Unconstrained:
    """Resolve missing rows and unknown on-phase cells from the cycle (see module docstring)."""
    out = unc.copy()
    tail = lost_tail(fit, panel)
    off = panel.life & ~fit.on_phase
    pending = (out.method == M["missing_row"]) | (out.method == M["missing_after_backorder"])
    zero_tail = pending & tail
    zero_off = pending & off & ~tail
    out.demand[zero_tail | zero_off] = 0.0
    out.method[zero_tail] = M["missing_lost_tail_zero"]
    out.method[zero_off] = M["missing_offphase_zero"]
    out.method[(out.method == M["missing_row"])] = M["missing_onphase_unknown"]
    out.demand[(out.method == M["D3_hidden_second_month"]) & tail] = 0.0
    return out


def regional_index(demand: np.ndarray, fit: CycleFit, panel: Panel) -> pd.DataFrame:
    """``I[region, month]``: median over stable monthly-type series of ``demand / series mean`` (index months x regions).

    Stable series: monthly or annual-shutdown regime with no cycle change, not lost, present since 2019-01 or since
    the MEA opening; cells used: on-phase months that carry nothing (the shutdown month and the month after are left
    out), with known demand.
    """
    frame = fit.series
    regions = panel.series["region"].to_numpy()
    stable = (
        frame["cycle_kind"].isin(STABLE_KINDS).to_numpy()
        & (frame["cycle_change_idx"].to_numpy() < 0)
        & ~frame["is_lost_account"].to_numpy()
        & ((panel.start == 0) | panel.mea_opening_cohort)
    )
    use = stable[:, None] & fit.on_phase & (fit.accum_span == 1) & ~np.isnan(demand)
    values = np.where(use, demand, np.nan)
    count = use.sum(axis=1)
    mean = np.where(count > 0, np.nansum(values, axis=1) / np.maximum(count, 1), np.nan)
    with np.errstate(all="ignore"):
        ratio = values / mean[:, None]
    out = {}
    for region in sorted(set(regions)):
        rows = ratio[regions == region]
        observed = (~np.isnan(rows)).any(axis=0)
        column = np.full(N_MONTHS, np.nan)
        column[observed] = np.nanmedian(rows[:, observed], axis=0)
        out[region] = column
    index = pd.DataFrame(out, index=pd.Index(np.arange(N_MONTHS), name="month_idx"))
    return index.loc[: panel.as_of]


def accumulated_index(index: pd.DataFrame, fit: CycleFit, panel: Panel) -> np.ndarray:
    """(S, T) sum of the regional index over the latent months each on-phase cell carries (0 elsewhere).

    A carried month before 2019-01 (first order of a series present since the window start) takes the index of the
    same calendar month averaged over the available years.
    """
    regions = panel.series["region"].to_numpy()
    full = index.reindex(np.arange(N_MONTHS))
    by_calendar = full.groupby(full.index % 12).mean()
    values = full.to_numpy()
    calendar = by_calendar.to_numpy()
    columns = {region: j for j, region in enumerate(full.columns)}
    col = np.array([columns[r] for r in regions])
    out = np.zeros(fit.on_phase.shape)
    i, t = np.nonzero(fit.accum_span > 0)
    span = fit.accum_span[i, t]
    weight = np.nan_to_num(fit.carry_weight[i, t], nan=1.0)
    total = np.zeros(len(i))
    for back in range(int(span.max()) if len(span) else 0):
        month = t - back
        active = back < span
        value = np.where(month >= 0, values[np.clip(month, 0, N_MONTHS - 1), col[i]], calendar[month % 12, col[i]])
        total += np.where(active, value * (1.0 if back == 0 else weight), 0.0)
    out[i, t] = total
    return out


@dataclass(frozen=True)
class Filled:
    """``demand_filled`` and ``is_imputed`` arrays plus the regional index behind the fill."""

    demand_filled: np.ndarray
    is_imputed: np.ndarray
    index: pd.DataFrame


def fill_demand(unc: Unconstrained, fit: CycleFit, panel: Panel) -> Filled:
    """Complete the demand series for display and lags (see module docstring)."""
    index = regional_index(unc.demand, fit, panel)
    accumulated = accumulated_index(index, fit, panel)
    method_names = np.asarray(METHODS)[unc.method]
    unknown = np.isin(method_names, UNKNOWN_METHODS) & np.isnan(unc.demand) & panel.life
    imputed = (unknown | np.isin(method_names, IMPUTED_ZERO_METHODS)) & panel.life
    filled = unc.demand.copy()
    ratio = np.where(fit.on_phase & (unc.demand > 0) & (accumulated > 0), unc.demand / np.where(accumulated > 0, accumulated, 1.0), np.nan)
    for s, t in zip(*np.nonzero(unknown), strict=True):
        if not fit.on_phase[s, t]:
            filled[s, t] = 0.0
            continue
        known = np.flatnonzero(~np.isnan(ratio[s]))
        if len(known) == 0 or accumulated[s, t] <= 0:
            continue
        nearest = known[np.argsort(np.abs(known - t), kind="stable")[:NEIGHBOUR_ORDERS]]
        filled[s, t] = float(np.median(ratio[s, nearest]) * accumulated[s, t])
    filled[~panel.life] = np.nan
    return Filled(demand_filled=filled, is_imputed=imputed, index=index)

