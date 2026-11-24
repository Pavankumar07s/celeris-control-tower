"""Lifecycle features: launch ramp, MEA region-opening ramp, EOL phase-out and post-EOL zeros (dossier 4.11, 4.14, 5.3,
5.4, 5.5; LM, LM.v, PZ.v).

- **Launch ramp** ``1 - exp(-(k + 1) / tau)`` with ``k`` months since the *product* launch and tau about 4.5-4.75 once
  the EV trend is controlled (``LAUNCH_TAU`` = 4.6). Never applied to series that start in 2019-01 because the window
  opens there.
- **Region opening**: the 459 MEA series of SKUs launched before 2022-01 start together in 2022-01 (EV-024) with a ramp
  of tau about 6 on the series age (``MEA_OPENING_TAU``).
- **EOL phase-out**: demand declines over the last six months before EOL; factors relative to the recent
  de-factored level 0.90, 0.81, 0.71, 0.61, 0.52, 0.42 at m = 5..0 months to EOL (LM.v linear fit, consistent with the
  ICE-controlled check of dossier 4.11). The EOL month itself sells; every month after it is a structural zero.
"""

from __future__ import annotations

import numpy as np

LAUNCH_TAU = 4.6
MEA_OPENING_TAU = 6.0
PHASEOUT_FACTORS = (0.42, 0.52, 0.61, 0.71, 0.81, 0.90)  # m = 0 (EOL month) .. 5 months to EOL


def ramp(age: np.ndarray, tau: float) -> np.ndarray:
    """``1 - exp(-(age + 1) / tau)`` for ``age >= 0``; 0 before the first month."""
    age = np.asarray(age, dtype=float)
    return np.where(age >= 0, 1.0 - np.exp(-(np.maximum(age, 0.0) + 1.0) / tau), 0.0)


def phaseout(months_to_eol: np.ndarray) -> np.ndarray:
    """Phase-out factor by months to EOL: the graded factors for 0..5, 1 earlier, 0 after EOL (NaN = no EOL -> 1)."""
    m = np.asarray(months_to_eol, dtype=float)
    factors = np.asarray(PHASEOUT_FACTORS)
    inside = (m >= 0) & (m < len(factors))
    out = np.where(inside, factors[np.clip(np.nan_to_num(m, nan=99), 0, len(factors) - 1).astype(int)], 1.0)
    return np.where(m < 0, 0.0, out)


def lifecycle_matrix(
    months: np.ndarray,
    launch_idx: np.ndarray,
    start_idx: np.ndarray,
    eol_idx: np.ndarray,
    product_launch: np.ndarray,
    mea_opening: np.ndarray,
    launch_tau: float = LAUNCH_TAU,
    mea_tau: float = MEA_OPENING_TAU,
) -> tuple[np.ndarray, np.ndarray]:
    """(ramp, phase-out) factors per (series, month): ramp on product age for launches, on series age for the MEA
    opening cohort, 1 for series present since the window start; phase-out by months to EOL (0 after EOL)."""
    months = np.asarray(months)[None, :]
    product_age = months - np.asarray(launch_idx)[:, None]
    series_age = months - np.asarray(start_idx)[:, None]
    ramp_factor = np.ones(product_age.shape)
    launch = np.asarray(product_launch, dtype=bool)
    opening = np.asarray(mea_opening, dtype=bool)
    ramp_factor[launch] = ramp(product_age[launch], launch_tau)
    ramp_factor[opening] = ramp(series_age[opening], mea_tau)
    to_eol = np.asarray(eol_idx, dtype=float)[:, None] - months
    return ramp_factor, phaseout(to_eol)
