"""Required baselines (problem statement workstream 4 Core; dossier 6.3 #3, 6.8): last-12-month mean, seasonal naive,
moving average and the cycle-aware naive.

All of them read only the history up to the origin (``demand_filled`` of the as-of state: unconstrained demand, 0 on
structural zeros, a cycle-aware fill on unknown cells) and return one forecast per target row.

- ``naive`` (``naive_mean12``): flat mean of the last 12 months of the series (dossier: 0.503-0.506 WAPE at 2025-03);
- ``seasonal_naive``: the same calendar month of the latest available year (0.365-0.370);
- ``moving_average`` (``moving_average6``): flat mean of the last 6 months;
- ``cycle_aware`` (``cycle_naive``): the cycle mask x accumulation x a 24-month monthly-equivalent level, no seasonality (0.285 with a
  12-month level, about 0.26 with 24 months and seasonal adjustment); off-phase months and lost accounts are 0.

A series with no history before the origin (a launch after it) gets 0 from every baseline.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from celeris.models.context import OriginContext

CYCLE_LEVEL_MONTHS = 24


def _history(ctx: OriginContext) -> np.ndarray:
    """(S, as_of + 1) filled demand, NaN outside the life."""
    filled = ctx.state.filled.demand_filled[:, : ctx.as_of + 1].copy()
    filled[~ctx.state.panel.life[:, : ctx.as_of + 1]] = np.nan
    return filled


def _trailing_mean(values: np.ndarray, months: int) -> np.ndarray:
    window = values[:, -months:]
    count = (~np.isnan(window)).sum(axis=1)
    return np.where(count > 0, np.nansum(window, axis=1) / np.maximum(count, 1), 0.0)


def naive_mean12(ctx: OriginContext, targets: pd.DataFrame) -> np.ndarray:
    level = _trailing_mean(_history(ctx), 12)
    return _per_series(level, targets)


def moving_average6(ctx: OriginContext, targets: pd.DataFrame) -> np.ndarray:
    level = _trailing_mean(_history(ctx), 6)
    return _per_series(level, targets)


def seasonal_naive(ctx: OriginContext, targets: pd.DataFrame) -> np.ndarray:
    """Value of the same calendar month in the latest year before the origin (else the 12-month mean)."""
    hist = _history(ctx)
    as_of = ctx.as_of
    s = targets["series_no"].to_numpy(dtype="int64")
    m = targets["month_idx"].to_numpy(dtype="int64")
    lag = 12 * np.ceil((m - as_of) / 12).astype(int)
    source = m - lag
    out = np.full(len(targets), np.nan)
    ok = (source >= 0) & (s < hist.shape[0])
    out[ok] = hist[s[ok], source[ok]]
    fallback = _per_series(_trailing_mean(hist, 12), targets)
    return np.where(np.isnan(out), fallback, out)


def cycle_naive(ctx: OriginContext, targets: pd.DataFrame) -> np.ndarray:
    """24-month monthly-equivalent level x effective span of the projected order; 0 on structural zeros."""
    hist = _history(ctx)
    fit = ctx.state.cycles
    as_of = ctx.as_of
    first = max(as_of - CYCLE_LEVEL_MONTHS + 1, 0)
    window = hist[:, first:]
    span = fit.accum_span[:, first : as_of + 1].astype(float)
    carry = np.nan_to_num(fit.carry_weight[:, first : as_of + 1], nan=1.0)
    effective = np.where(span > 0, 1.0 + (span - 1.0) * carry, 0.0)
    effective[np.isnan(window)] = 0.0
    with np.errstate(all="ignore"):
        level = np.where(effective.sum(axis=1) > 0, np.nansum(window, axis=1) / effective.sum(axis=1), 0.0)
    target_span = targets["accum_span"].to_numpy(dtype=float)
    target_carry = np.nan_to_num(targets["carry_weight"].to_numpy(dtype=float), nan=1.0)
    eff = np.where(target_span > 0, 1.0 + (target_span - 1.0) * target_carry, 0.0)
    out = _per_series(level, targets) * eff
    return np.where(targets["zero"].to_numpy(dtype=bool), 0.0, out)


def _per_series(level: np.ndarray, targets: pd.DataFrame) -> np.ndarray:
    s = targets["series_no"].to_numpy(dtype="int64")
    out = np.zeros(len(targets))
    ok = (s >= 0) & (s < len(level))
    out[ok] = level[s[ok]]
    return np.nan_to_num(out)


BASELINES = {
    "naive": naive_mean12,
    "seasonal_naive": seasonal_naive,
    "moving_average": moving_average6,
    "cycle_aware": cycle_naive,
}
