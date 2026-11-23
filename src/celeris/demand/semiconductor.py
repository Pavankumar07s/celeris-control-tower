"""Semiconductor allocation (EV-019): depth x severity model of the shortfall, estimated from the listed rows.

Every ELA cell of 2021-03 .. 2022-09 is supply-constrained, but only about 69 % are listed (dossier 2.7 I4, 4.12). On
listed rows the shortfall fraction ``sf = 1 - Fill_Rate_Pct / 100`` (the latent allocation fraction) follows

    sf[s, m] = depth[m] x severity[s] + noise (sd about 0.038),

a deterministic monthly depth curve (0.09 -> 0.51 in 2021-09 -> 0.08) times one severity per series (about
U(0.65, 1.35), split-half r 0.94). Both are fitted by alternating least squares with mean severity 1 (SU, SU.v
reproduce the curve to three decimals). The dossier's severity used for imputation is then
``sum(sf x depth) / sum(depth^2)`` over the series' listed months, or 1.0 with fewer than two listed months, and an
unlisted cell is imputed through ``fill_hat = clip(1 - depth x severity, 0.15, 0.98)`` (section 7.1 step 7, S5).
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

FILL_HAT_MIN = 0.15
FILL_HAT_MAX = 0.98
MIN_LISTED_FOR_SEVERITY = 2
ALS_ITERATIONS = 50


@dataclass(frozen=True)
class SemiconductorModel:
    """Monthly depth (index: month_idx) and per-series severity (index: series_no) of the allocation shortfall."""

    depth: pd.Series
    severity: pd.Series

    def fill_hat(self, series_no: np.ndarray, month_idx: np.ndarray) -> np.ndarray:
        """Estimated latent fill of each (series, month); severity 1.0 for series with fewer than 2 listed months."""
        depth = self.depth.reindex(month_idx).to_numpy()
        if np.isnan(depth).any():
            raise AssertionError("semiconductor depth is not estimated for every requested month")
        severity = self.severity.reindex(series_no).fillna(1.0).to_numpy()
        return np.clip(1.0 - depth * severity, FILL_HAT_MIN, FILL_HAT_MAX)


def fit_semiconductor(rows: pd.DataFrame) -> SemiconductorModel:
    """Fit depth x severity on listed semiconductor rows (``series_no``, ``month_idx``, ``fill_rate_pct``)."""
    if rows.empty:
        return SemiconductorModel(pd.Series(dtype="float64", name="depth"), pd.Series(dtype="float64", name="severity"))
    sf = 1.0 - rows["fill_rate_pct"].to_numpy(dtype="float64") / 100.0
    month_codes, months = pd.factorize(rows["month_idx"], sort=True)
    series_codes, series = pd.factorize(rows["series_no"], sort=True)
    depth = np.bincount(month_codes, sf) / np.bincount(month_codes)
    severity = np.ones(len(series))
    for _ in range(ALS_ITERATIONS):
        d = depth[month_codes]
        severity = np.bincount(series_codes, sf * d) / np.bincount(series_codes, d * d)
        s = severity[series_codes]
        depth = np.bincount(month_codes, sf * s) / np.bincount(month_codes, s * s)
        scale = severity.mean()
        severity, depth = severity / scale, depth * scale
    d = depth[month_codes]
    count = np.bincount(series_codes)
    final = np.where(count >= MIN_LISTED_FOR_SEVERITY, np.bincount(series_codes, sf * d) / np.bincount(series_codes, d * d), 1.0)
    return SemiconductorModel(
        depth=pd.Series(depth, index=pd.Index(months, name="month_idx"), name="depth"),
        severity=pd.Series(final, index=pd.Index(series, name="series_no"), name="severity"),
    )


def impute_requested(shipped: np.ndarray, fill_hat: np.ndarray, carried_in: np.ndarray) -> np.ndarray:
    """S5: own requested demand from shipped units, ``max(0, round((u + 0.5) / fill_hat) - carried_in)``, 0 if u = 0.

    ``+ 0.5`` undoes the floor in ``Shipped = floor(fill x (R + C))`` (SU: bias -0.2 %, WAPE 5.3 %); rounding is half
    up. ``carried_in`` is the back-order of a listed operational stock-out in the previous month (0 otherwise).
    """
    total = np.where(shipped > 0, np.floor((shipped + 0.5) / fill_hat + 0.5), 0.0)
    return np.maximum(total - carried_in, 0.0)


def leave_one_out_requested(rows: pd.DataFrame, model: SemiconductorModel) -> pd.Series:
    """Hide each listed row in turn and re-estimate its Requested_Units from Shipped (validation, SU section 5).

    The series' severity is recomputed without the hidden month (1.0 when fewer than two other months remain); the
    depth curve is kept (each month has about 230 listed rows). Returns the estimate aligned with ``rows``.
    """
    sf = 1.0 - rows["fill_rate_pct"].to_numpy(dtype="float64") / 100.0
    d = model.depth.reindex(rows["month_idx"]).to_numpy()
    group = rows["series_no"].to_numpy()
    sum_sd = pd.Series(sf * d).groupby(group).transform("sum").to_numpy() - sf * d
    sum_dd = pd.Series(d * d).groupby(group).transform("sum").to_numpy() - d * d
    others = pd.Series(np.ones(len(rows))).groupby(group).transform("sum").to_numpy() - 1
    severity = np.where(others >= MIN_LISTED_FOR_SEVERITY, sum_sd / np.where(sum_dd > 0, sum_dd, 1.0), 1.0)
    fill_hat = np.clip(1.0 - d * severity, FILL_HAT_MIN, FILL_HAT_MAX)
    estimate = impute_requested(
        rows["shipped_units"].to_numpy(dtype="float64"), fill_hat, rows["carried_in_units"].to_numpy(dtype="float64")
    )
    return pd.Series(estimate, index=rows.index, name="requested_estimate")
