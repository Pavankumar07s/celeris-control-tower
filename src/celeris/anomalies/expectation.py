"""Phase-aware unconstrained expectation and one-off orders (dossier 3 ``RE.ONE_OFF_ORDER``, 4.1, 4.13, 7.1 step 10;
DG findings 1, 7, 8; DG.v).

The latent generator is multiplicative (dossier 4.1): ``latent[s, t] = L[s] x F[family, t] x R[region, t] x C[channel,
t] x P[powertrain, t] x ramp``, and an order carries the latent months since the previous on-phase month (weight 0.5
for an annual shutdown month). The expectation of an order is therefore

    mu[s, t] = L[segment] x sum over carried months of g, with g = F x R x C x P x ramp,

fitted by iterative proportional fitting (a Poisson log-linear model) on monthly-type cells that carry one month only,
with one level per series x customer run (a switch moves the level). Calendar effects, COVID, holidays, the pre-buy
and the EV trend live in the month factors, so they are not mistaken for anomalies. A local robust correction (the
median of ``demand / mu`` over the 13 nearest on-phase orders) absorbs slow series drift and level steps such as
Helios India.

The median-based local correction sits about 2 % below the mean (order / mean has median 0.965-0.97, dossier 4.10),
so the expectation is multiplied by a smearing factor ``sum(demand) / sum(expected)`` over the fitted cells.

One-off orders (OEM / Tier-1 only, about 1 in 300 order months, x3 to x10, no payback) are orders above
``ONE_OFF_RATIO`` x the expectation, or above ``ONE_OFF_RATIO_STOCKING`` x it for Direct OEM / Tier-1 orders whose
expectation is at least ``ONE_OFF_MIN_EXPECTED`` units, and at least ``ONE_OFF_MIN_EXCESS`` units above it: a bulk
order (median excess 176 units), not the noise of an order expected at one or two units (MEA-opening and India
2020-04 cells reach 3.5 x by chance). Detection runs twice: the second fit excludes the first pass's
one-offs so they cannot inflate their own expectation (masking). It always runs on unconstrained demand: a raw
neighbour median fails at back-order catch-up, on cycle series and at level steps (NR.v).
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from celeris.demand.cycles import KIND_OF
from celeris.demand.panel import N_MONTHS, row_nanmedian
from celeris.demand.state import DemandState
from celeris.demand.unconstrained import METHODS

RAMP_TAU = 4.5  # launch ramp 1 - exp(-(k+1)/tau), dossier 4.11
EOL_EXCLUDE_MONTHS = 6
IPF_ITERATIONS = 30
LOCAL_WINDOW = 13
LOCAL_MIN_ORDERS = 5
LOCAL_FLOOR = 0.3
ONE_OFF_RATIO = 3.5
ONE_OFF_RATIO_STOCKING = 3.0
ONE_OFF_MIN_EXPECTED = 25.0
ONE_OFF_MIN_EXCESS = 10.0
ONE_OFF_CHANNELS = ("Direct OEM", "Tier-1 Distributor")
OBSERVED_METHODS = ("shipped", "S1_listed_requested", "S2_carry_removed", "D1_hidden_stockout", "D2_hidden_stockout")
FACTOR_KEYS = ("product_family", "region", "sales_channel", "powertrain_application")


@dataclass(frozen=True)
class Expectation:
    """Expected orders and the pieces behind them (arrays are ``(series, month)``)."""

    latent_index: np.ndarray  # g: month factors x ramp
    level: np.ndarray  # L of the cell's series x customer run
    mu: np.ndarray  # L x accumulated g (NaN off-phase or without a level)
    local: np.ndarray  # local robust correction (median of demand / mu over nearby orders)
    expected: np.ndarray  # mu x local x smear: the phase-aware expected order (mean scale)
    ratio: np.ndarray  # demand / expected on on-phase cells
    factors: dict[str, pd.DataFrame]
    smear: float


def ramp(state: DemandState) -> np.ndarray:
    """Launch ramp per cell; 1 for series present since 2019-01 and for the MEA opening cohort (in the region factor)."""
    p = state.panel
    age = np.maximum(p.age, 0)
    return np.where(p.product_launch[:, None], 1.0 - np.exp(-(age + 1) / RAMP_TAU), 1.0)


def customer_segment(state: DemandState) -> np.ndarray:
    """(S, T) segment id = series x customer run in force (runs from the customer history)."""
    p = state.panel
    run = np.ones(p.life.shape, dtype=np.int64)
    history = state.customer_history[state.customer_history["run"] > 1]
    for s, first in zip(history["series_no"].to_numpy(), history["first_idx"].to_numpy(), strict=True):
        run[s, first:] += 1
    return np.arange(p.n_series)[:, None] * 10 + run


def fit_cells(state: DemandState, exclude: np.ndarray) -> np.ndarray:
    """Cells whose demand is an observation fit for level estimation (any cycle kind)."""
    p, u = state.panel, state.unconstrained
    names = np.asarray(METHODS)[u.method]
    eol = p.series["eol_idx"].to_numpy(dtype="float64")
    phaseout = (np.arange(N_MONTHS)[None, :] > eol[:, None] - EOL_EXCLUDE_MONTHS) & ~np.isnan(eol)[:, None]
    return (
        p.life & state.cycles.on_phase & ~np.isnan(u.demand) & np.isin(names, OBSERVED_METHODS)
        & ~state.lost_tail & ~phaseout & ~exclude
    )


def fit_expectation(state: DemandState, exclude: np.ndarray) -> Expectation:
    """IPF month factors on monthly-type single-month cells, then segment levels and accumulated expectations."""
    p, fit = state.panel, state.cycles
    demand = state.unconstrained.demand
    usable = fit_cells(state, exclude)
    kind = KIND_OF[np.clip(fit.regime, 0, None)]
    ipf = usable & np.isin(kind, ["M", "A"]) & (fit.accum_span == 1)
    segment = customer_segment(state)
    ramp_factor = ramp(state)
    i, t = np.nonzero(ipf)
    d = demand[i, t]
    seg_codes, seg_index = pd.factorize(segment[i, t])
    codes = {key: pd.factorize(p.series[key])[0] for key in FACTOR_KEYS}
    labels = {key: pd.factorize(p.series[key])[1] for key in FACTOR_KEYS}
    cell_codes = {key: codes[key][i] * N_MONTHS + t for key in FACTOR_KEYS}
    sizes = {key: len(labels[key]) * N_MONTHS for key in FACTOR_KEYS}
    factor = {key: np.ones(sizes[key]) for key in FACTOR_KEYS}
    level = np.bincount(seg_codes, d) / np.bincount(seg_codes)
    base_ramp = ramp_factor[i, t]
    for _ in range(IPF_ITERATIONS):
        month = base_ramp * np.prod([factor[key][cell_codes[key]] for key in FACTOR_KEYS], axis=0)
        level = _ratio_update(seg_codes, d, month, len(seg_index))
        for key in FACTOR_KEYS:
            others = level[seg_codes] * base_ramp * np.prod([factor[k][cell_codes[k]] for k in FACTOR_KEYS if k != key], axis=0)
            factor[key] = _ratio_update(cell_codes[key], d, others, sizes[key], default=1.0)
    latent = ramp_factor * np.prod(
        [factor[key].reshape(len(labels[key]), N_MONTHS)[codes[key]] for key in FACTOR_KEYS], axis=0
    )
    accumulated = _accumulate(latent, fit.accum_span, fit.carry_weight)
    j, u_ = np.nonzero(usable)
    seg_all, seg_all_index = pd.factorize(segment[j, u_])
    seg_level = _ratio_update(seg_all, demand[j, u_], accumulated[j, u_], len(seg_all_index), default=np.nan)
    level_cells = pd.Series(seg_level, index=seg_all_index).reindex(segment.ravel()).to_numpy().reshape(segment.shape)
    mu = np.where(fit.on_phase & p.life, level_cells * accumulated, np.nan)
    local = _local_correction(demand, mu, fit.on_phase & p.life & ~np.isnan(demand) & ~exclude)
    raw = mu * np.where(np.isnan(local), 1.0, local)
    smear = float(np.nansum(demand[usable]) / np.nansum(raw[usable]))
    expected = raw * smear
    with np.errstate(all="ignore"):
        ratio = np.where(fit.on_phase & p.life & (expected > 0), demand / expected, np.nan)
    months = pd.Index(np.arange(N_MONTHS), name="month_idx")
    factors = {
        key: pd.DataFrame(factor[key].reshape(len(labels[key]), N_MONTHS).T, index=months, columns=list(labels[key]))
        for key in FACTOR_KEYS
    }
    return Expectation(latent, level_cells, mu, local, expected, ratio, factors, smear)


def _ratio_update(codes: np.ndarray, numerator: np.ndarray, denominator: np.ndarray, size: int, default: float = 1.0) -> np.ndarray:
    num = np.bincount(codes, numerator, minlength=size)
    den = np.bincount(codes, denominator, minlength=size)
    with np.errstate(all="ignore"):
        return np.where(den > 0, num / np.where(den > 0, den, 1.0), default)


def _accumulate(latent: np.ndarray, span: np.ndarray, weight: np.ndarray) -> np.ndarray:
    """Sum of the latent index over the months each on-phase cell carries (0 off-phase)."""
    out = np.zeros(latent.shape)
    i, t = np.nonzero(span > 0)
    w = np.nan_to_num(weight[i, t], nan=1.0)
    total = np.zeros(len(i))
    for back in range(int(span.max()) if len(i) else 0):
        month = t - back
        carried = (back < span[i, t]) & (month >= 0)
        value = latent[i, np.clip(month, 0, None)]
        total += np.where(carried, value * (1.0 if back == 0 else w), 0.0)
    out[i, t] = total
    return out


def _local_correction(demand: np.ndarray, mu: np.ndarray, usable: np.ndarray) -> np.ndarray:
    """Centred rolling median of ``demand / mu`` over a series' usable on-phase orders (13 orders, at least 5).

    Orders are compressed to the left in month order, a 13-wide window slides over them (shrinking at the ends, as a
    centred rolling median with ``min_periods`` does), and the medians are put back on their months; other on-phase
    months take the nearest earlier (else later) value.
    """
    cells = usable & (mu > 0)
    with np.errstate(all="ignore"):
        ratio = np.where(cells, demand / mu, np.nan)
    order = np.argsort(~cells, axis=1, kind="stable")
    compressed = np.take_along_axis(ratio, order, axis=1)
    half = LOCAL_WINDOW // 2
    padded = np.pad(compressed, ((0, 0), (half, half)), constant_values=np.nan)
    windows = np.lib.stride_tricks.sliding_window_view(padded, LOCAL_WINDOW, axis=1)
    enough = (~np.isnan(windows)).sum(axis=-1) >= LOCAL_MIN_ORDERS
    enough &= ~np.isnan(compressed)
    medians = np.full(compressed.shape, np.nan)
    medians[enough] = row_nanmedian(windows[enough])
    local = np.full(demand.shape, np.nan)
    np.put_along_axis(local, order, np.maximum(medians, LOCAL_FLOOR), axis=1)
    filled = pd.DataFrame(local).T.ffill().bfill().T.to_numpy()
    return np.where(~np.isnan(mu), filled, np.nan)


def one_off_rule(demand: np.ndarray, expected: np.ndarray, channel: np.ndarray) -> np.ndarray:
    """Order > 3.5 x expected, or > 3 x for Direct OEM / Tier-1 with an expectation of >= 25 units; excess >= 10 units."""
    stocking = np.isin(channel, ONE_OFF_CHANNELS)[:, None]
    with np.errstate(invalid="ignore"):
        ratio = demand / expected
        rule = (ratio > ONE_OFF_RATIO) | ((ratio > ONE_OFF_RATIO_STOCKING) & stocking & (expected >= ONE_OFF_MIN_EXPECTED))
        return rule & (demand - expected >= ONE_OFF_MIN_EXCESS) & (expected > 0)


@dataclass(frozen=True)
class OneOffs:
    """Final one-off flags, first-pass flags and the final expectation."""

    flags: np.ndarray
    first_pass: np.ndarray
    expectation: Expectation


def detect_one_offs(state: DemandState) -> OneOffs:
    """Two-pass one-off detection on the unconstrained, phase-aware expectation (dossier 7.1 step 10)."""
    p = state.panel
    channel = p.series["sales_channel"].to_numpy()
    candidates = p.life & state.cycles.on_phase & (np.nan_to_num(state.unconstrained.demand) > 0)
    first = fit_expectation(state, np.zeros(p.life.shape, dtype=bool))
    demand = state.unconstrained.demand
    first_flags = candidates & one_off_rule(demand, first.expected, channel)
    second = fit_expectation(state, first_flags)
    flags = candidates & one_off_rule(demand, second.expected, channel)
    return OneOffs(flags=flags, first_pass=first_flags, expectation=second)
