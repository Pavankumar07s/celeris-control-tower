"""Lags, rolling statistics, monthly-equivalent levels and intermittency on the series x month grid (problem statement
workstream 3 Core; dossier 2.3, 6.2).

Every statistic at month ``t`` uses months ``< t`` only (a trailing window ending the month before), so the table is
a valid feature set at any origin. Lags are built on the full grid with explicit gaps: the input is ``demand_filled``
(unconstrained demand, 0 on structural zeros, a cycle-aware fill on unknown cells), never "the last available row"
(16 continuing series have no 2026-10 row, dossier 2.3).

- ``lag_k``: demand ``k`` months before (1, 2, 3, 12);
- ``roll_mean_k`` / ``roll_std_k``: trailing mean / sd over ``k`` months (3, 6, 12);
- ``level_me_12``: monthly-equivalent level over 12 months = sum of demand / sum of latent months the orders carried
  (an order of a B / Q series carries 2 / 3 months; a carried shutdown month weighs 0.5);
- ``zero_share_12``: share of zero months in the trailing 12 (scheduled off-months included);
- Syntetos-Boylan ``adi`` / ``cv2`` / class on the trailing 36 months (reporting only: the zeros are scheduled).
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from celeris.anomalies.profile import sbc
from celeris.demand.state import DemandState

LAGS = (1, 2, 3, 12)
WINDOWS = (3, 6, 12)
SBC_MONTHS = 36


def _trailing(values: np.ndarray, window: int, how: str) -> np.ndarray:
    """Statistic over months ``t - window .. t - 1`` (NaN-aware; NaN if no value)."""
    n, t_max = values.shape
    out = np.full((n, t_max), np.nan)
    for t in range(1, t_max):
        block = values[:, max(t - window, 0) : t]
        count = (~np.isnan(block)).sum(axis=1)
        with np.errstate(all="ignore"):
            if how == "mean":
                stat = np.nansum(block, axis=1) / np.maximum(count, 1)
            elif how == "std":
                mean = np.nansum(block, axis=1) / np.maximum(count, 1)
                stat = np.sqrt(np.nansum((block - mean[:, None]) ** 2, axis=1) / np.maximum(count, 1))
            elif how == "zero_share":
                stat = np.nansum(block == 0, axis=1) / np.maximum(count, 1)
            else:
                raise ValueError(how)
        out[:, t] = np.where(count > 0, stat, np.nan)
    return out


def panel_features(state: DemandState) -> dict[str, np.ndarray]:
    """(S, 94) feature arrays named as in the module docstring (NaN outside the life or without history)."""
    life = state.panel.life
    demand = np.where(life, state.filled.demand_filled, np.nan)
    out: dict[str, np.ndarray] = {}
    for k in LAGS:
        lagged = np.full(demand.shape, np.nan)
        lagged[:, k:] = demand[:, :-k]
        out[f"lag_{k}"] = lagged
    for window in WINDOWS:
        out[f"roll_mean_{window}"] = _trailing(demand, window, "mean")
        out[f"roll_std_{window}"] = _trailing(demand, window, "std")
    fit = state.cycles
    span = fit.accum_span.astype(float)
    carry = np.nan_to_num(fit.carry_weight, nan=1.0)
    effective = np.where(span > 0, 1.0 + (span - 1.0) * carry, 0.0)
    effective = np.where(np.isnan(demand), np.nan, effective)
    total = _trailing(demand, 12, "mean")
    months = _trailing(effective, 12, "mean")
    with np.errstate(all="ignore"):
        out["level_me_12"] = np.where(months > 0, total / months, np.nan)
    out["zero_share_12"] = _trailing(demand, 12, "zero_share")
    for name in out:
        out[name] = np.where(life, out[name], np.nan)
    return out


def intermittency_at(state: DemandState, as_of: int) -> pd.DataFrame:
    """Syntetos-Boylan ADI, CV^2 and class per series on the trailing 36 months up to ``as_of``."""
    demand = state.unconstrained.demand
    months = np.zeros(demand.shape, dtype=bool)
    months[:, max(as_of - SBC_MONTHS + 1, 0) : as_of + 1] = True
    known = state.panel.life & ~np.isnan(demand) & months
    adi, cv2, label = sbc(np.nan_to_num(demand), known)
    return pd.DataFrame({"series_no": np.arange(len(adi)), "sbc_adi_36": adi, "sbc_cv2_36": cv2, "sbc_class_36": label})
