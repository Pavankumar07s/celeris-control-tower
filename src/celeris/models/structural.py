"""Structural multiplicative model of latent monthly demand, placed on the ordering cycle (dossier 4, 5, 6.1-6.4).

This is the generator as reverse-engineered by the forensic team (dossier 4.1):

    latent[s, t] = L[s] x R[region, moy] x C[channel, moy] x TH[moy]^thermal          (season)
                        x (1 - d_LNY x share_LNY[t])^APAC x (1 - d_Ram x share_Ram[t])^MEA    (moving holidays)
                        x exp(lm[sku, channel group, t])                                (SKU macro path, lagged)
                        x exp(beta[powertrain] x (EV[t] - EV_ref))                      (EV shift, lag 0, class level)
                        x ramp[s, t] x phaseout[s, t]                                   (lifecycle)
                        x events[s, t]                                                  (Helios step, Orion shutdown)

    order[s, t] = sum over the latent months the order carries of weight x latent      (0.5 on a carried shutdown month)

Everything is estimated from data up to the origin (``OriginContext``), with mean-unbiased estimators:

1. **Factor backfit** (Poisson likelihood by cyclic exact block updates, i.e. ratio-of-sums) on single-month
   fitting cells: segment levels (series x customer run), region x calendar-month and channel x calendar-month
   seasonality (+ Thermal), LNY and Ramadan depths (day-count exposure), class-level EV betas, the measured size of
   open-ended programme steps (Helios India) and the SKU macro paths (``celeris.features.macro``).
2. **Forecast level**: ratio of sums of demand over the accumulated factors in the last ``level_window`` months of
   level cells (arithmetic, never a log mean: a log mean biases aggregates by -3 to -10 %). Series younger than
   ``young_months`` blend in a cross-sectional prior with ``young_n0`` pseudo-months (dossier 5.5); series with no
   history (cold starts) take the prior (dossier 5.4).
3. **Window events**: a programme step keeps its measured size; a planned customer shutdown in the window takes the
   measured multiplier of the most recent customer strike / shutdown in the history (Orion 2027 <- Nexon 2023,
   x0.14-0.15, no catch-up), else 1.
4. **One-offs**: bulk orders (Direct OEM / Tier-1, about 1 in 300 order months, no payback) are masked from the
   level but are real demand; the mean adds their expected excess volume measured over the last 36 months
   (``one_off_share``, +1.2 % as of 2026-10; backtest: lower mean WAPE + |bias|, dossier 9.1 #5).
5. **Orders**: latent months accumulated by the projected cycle (``predict``); structural zeros (off-phase, lost
   accounts, post-EOL) are exactly 0.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from celeris.config import CHANNELS, REGIONS
from celeris.demand.panel import N_MONTHS
from celeris.features.calendar import (
    LNY_REGION,
    LNY_WINDOW_DAYS,
    N_CALENDAR,
    RAMADAN_REGION,
    RAMADAN_WINDOW_DAYS,
    calendar_frame,
    holiday_share,
    month_index,
)
from celeris.features.lifecycle import LAUNCH_TAU, MEA_OPENING_TAU, lifecycle_matrix
from celeris.features.macro import AFTERMARKET, GroupIndex, MacroConfig, MacroData, SkuPaths, fit_sku_paths, macro_data
from celeris.anomalies.expectation import ONE_OFF_CHANNELS
from celeris.models.context import ModelInputs, OriginContext

THERMAL_FAMILY = "Thermal Management"
EV_CLASSES = ("EV", "ICE")
COMPONENTS = ("level", "f_season", "f_holiday", "f_macro", "f_ev", "f_lifecycle", "f_event")


@dataclass(frozen=True)
class StructuralConfig:
    """Hyper-parameters; the defaults are the dossier's recommendations, the backtest decides the open ones."""

    level_window: int = 24
    holiday_form: str = "linear"
    use_macro: bool = True
    use_ev: bool = True
    use_holidays: bool = True
    use_events: bool = True
    use_season: bool = True
    use_phaseout: bool = True
    ev_from_month: int = 0  # EV betas estimated on cells from this month on (dossier 9.1 #8: full sample vs post-2023)
    macro: MacroConfig = field(default_factory=MacroConfig)
    macro_gamma: float = 1.0  # amplitude applied to the fitted path (1.0 with the capped / era-factor estimator)
    launch_tau: float = LAUNCH_TAU
    mea_tau: float = MEA_OPENING_TAU
    n_iter: int = 6
    one_off_uplift: bool = True  # add the expected one-off volume to Direct OEM / Tier-1 means (dossier 9.1 #5)
    young_months: int = 24
    young_n0: float = 2.0
    season_prior_units: float = 300.0
    step_min_months: int = 3
    shade: float = 1.0


# --------------------------------------------------------------------------------------------------- universe -----

UNIVERSE_COLUMNS = (
    "u",
    "series_no",
    "sku_id",
    "region",
    "product_family",
    "sales_channel",
    "powertrain_application",
    "sku_tier",
    "launch_idx",
    "eol_idx",
    "start_idx",
    "end_idx",
    "product_launch",
    "mea_opening",
    "customer_future",
)


def build_universe(ctx: OriginContext, cold_starts: pd.DataFrame | None = None) -> pd.DataFrame:
    """Series the model can forecast: every history series (row ``u = series_no``) plus extra cold-start series.

    ``cold_starts`` (one row per new series: sku_id, region, product_family, sales_channel, powertrain_application,
    sku_tier, launch_idx, eol_idx, customer) come from the test grid for the real forecast. A history series that
    starts after the origin is a cold start of that origin automatically (no data before its start).
    """
    p = ctx.state.panel
    columns = ["series_no", "sku_id", "region", "product_family", "sales_channel", "powertrain_application", "sku_tier", "launch_idx", "eol_idx", "start_idx", "end_idx"]
    out = p.series[columns].copy()
    out["product_launch"] = p.product_launch
    out["mea_opening"] = p.mea_opening_cohort
    out["customer_future"] = ctx.customer_at_origin()
    if cold_starts is not None and len(cold_starts):
        extra = cold_starts.copy()
        extra["series_no"] = -1
        extra["start_idx"] = extra["launch_idx"]
        extra["end_idx"] = np.where(extra["eol_idx"].isna(), N_CALENDAR - 1, extra["eol_idx"].fillna(0)).astype("int64")
        extra["product_launch"] = True
        extra["mea_opening"] = False
        extra = extra.rename(columns={"customer": "customer_future"})
        out = pd.concat([out, extra[list(out.columns)]], ignore_index=True)
    out.insert(0, "u", np.arange(len(out)))
    out["eol_idx"] = out["eol_idx"].astype("float64")
    return out.loc[:, list(UNIVERSE_COLUMNS)].reset_index(drop=True)


# --------------------------------------------------------------------------------------------------- events -------


@dataclass(frozen=True)
class EventScopes:
    """Programme-step exposure (U, 113) and customer shutdown cells (U, 113) per event id."""

    steps: dict[str, np.ndarray]
    shutdowns_history: dict[str, np.ndarray]
    shutdowns_future: dict[str, np.ndarray]


def event_scopes(inputs: ModelInputs, ctx: OriginContext, universe: pd.DataFrame) -> EventScopes:
    """Customer-scoped events on the universe x calendar grid, customer at time (history) or at origin (future).

    Open-ended customer events are programme steps (exposure 0.5 in the first month, 1 after: Helios India ran at
    about x1.12-1.14 in 2025-09 and fully from 2025-10, dossier 3); closed customer events are strikes / shutdowns,
    split into those that ended by the origin (measurable) and those that start after it (window events).
    """
    n = len(universe)
    as_of = ctx.as_of
    months = np.arange(N_CALENDAR)
    customers = np.full((n, N_CALENDAR), None, dtype=object)
    hist = universe["series_no"].to_numpy() >= 0
    customers[np.flatnonzero(hist), :N_MONTHS] = ctx.customers[universe.loc[hist, "series_no"].to_numpy()]
    customers[:, as_of + 1 :] = universe["customer_future"].to_numpy()[:, None]
    regions = universe["region"].to_numpy()
    steps: dict[str, np.ndarray] = {}
    history: dict[str, np.ndarray] = {}
    future: dict[str, np.ndarray] = {}
    for _, event in inputs.events[inputs.events["event_type"] == "Customer Event"].iterrows():
        first, last = month_index(event["start_month"]), month_index(event["end_month"])
        cells = (regions[:, None] == event["scope_region"]) & (customers == event["scope_customer"])
        inside = (months >= first) & (months <= last)
        if event["open_ended"]:
            exposure = np.where(months == first, 0.5, 1.0) * inside
            steps[str(event["event_id"])] = np.where(cells, exposure[None, :], 0.0)
        elif last <= as_of:
            history[str(event["event_id"])] = cells & inside[None, :]
        elif first > as_of:
            future[str(event["event_id"])] = cells & inside[None, :]
    return EventScopes(steps, history, future)


# --------------------------------------------------------------------------------------------------- factors ------


@dataclass
class Factors:
    """Fitted factor parameters (mutable during the backfit only)."""

    region_season: np.ndarray  # (6, 12), REGIONS order
    channel_season: np.ndarray  # (4, 12), CHANNELS order
    thermal_season: np.ndarray  # (12,)
    lny_depth: float = 0.0
    ramadan_depth: float = 0.0
    ev_beta: dict[str, float] = field(default_factory=lambda: {"EV": 0.0, "ICE": 0.0})
    ev_center: float = 0.0
    steps: dict[str, float] = field(default_factory=dict)
    strike_analog: float | None = None
    strike_event: str | None = None


def _ratio(codes: np.ndarray, num: np.ndarray, den: np.ndarray, size: int, prior: float = 0.0) -> np.ndarray:
    """Per code ``(sum num + prior) / (sum den + prior)``; 1 where a code has no data and no prior."""
    n = np.bincount(codes, num, minlength=size)
    d = np.bincount(codes, den, minlength=size)
    with np.errstate(all="ignore"):
        return np.where(d + prior > 0, (n + prior) / np.where(d + prior > 0, d + prior, 1.0), 1.0)


def _holiday_depth(d: np.ndarray, w: np.ndarray, mu: np.ndarray, share: np.ndarray, member: np.ndarray, current: float) -> float:
    """Poisson MLE of the depth in ``mu = base x (1 - depth x share)`` by bisection on the score (dossier 4.6)."""
    cells = member & (share > 0)
    if cells.sum() < 20:
        return current
    s = share[cells]
    base = mu[cells] / (1.0 - current * s)
    dd, ww = d[cells], w[cells]

    def score(depth: float) -> float:  # d loglik / d depth, decreasing in depth
        return float((ww * base * s).sum() - (ww * dd * s / (1.0 - depth * s)).sum())

    lo, hi = 0.0, 0.8
    if score(lo) <= 0:
        return 0.0
    if score(hi) >= 0:
        return hi
    for _ in range(50):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if score(mid) > 0 else (lo, mid)
    return (lo + hi) / 2


def _ev_beta(d: np.ndarray, w: np.ndarray, mu: np.ndarray, x: np.ndarray, current: float) -> float:
    """Poisson MLE of ``beta`` in ``mu = base x exp(beta x)`` by Newton steps (class level, dossier 4.8)."""
    if len(d) < 100 or np.ptp(x) == 0:
        return current
    base = mu * np.exp(-current * x)
    beta = current
    for _ in range(6):
        m = base * np.exp(beta * x)
        info = float((w * m * x * x).sum())
        if info <= 0:
            break
        beta += float((w * (d - m) * x).sum()) / info
    return beta


def _step_size(d: np.ndarray, w: np.ndarray, base: np.ndarray, exposure: np.ndarray, current: float) -> float:
    """Poisson MLE of the step ``S`` in ``mu = base x S^exposure`` (exposure 0.5 / 1) by Newton steps on log S."""
    log_s = np.log(current)
    for _ in range(8):
        m = base * np.exp(log_s * exposure)
        info = float((w * m * exposure * exposure).sum())
        if info <= 0:
            break
        log_s += float((w * (d - m) * exposure).sum()) / info
    return float(np.exp(log_s))


def _normalise_season(factors: Factors, channel_volume: np.ndarray) -> None:
    """Identify the seasonal factors: each region / channel / Thermal profile averages 1 over the year, and the
    volume-weighted channel factor is 1 in every calendar month (the common profile lives in the region factor)."""
    factors.channel_season /= factors.channel_season.mean(axis=1, keepdims=True)
    share = channel_volume / channel_volume.sum()
    common = (share[:, None] * factors.channel_season).sum(axis=0)
    factors.channel_season /= common[None, :]
    factors.region_season *= common[None, :]
    factors.region_season /= factors.region_season.mean(axis=1, keepdims=True)
    factors.thermal_season /= factors.thermal_season.mean()


# --------------------------------------------------------------------------------------------------- fit ----------


@dataclass(frozen=True)
class StructuralFit:
    """A fitted structural model: universe, factors, component matrices (U, 113) and forecast levels."""

    as_of: int
    config: StructuralConfig
    universe: pd.DataFrame
    factors: Factors
    macro: MacroData
    macro_paths: SkuPaths | None
    season: np.ndarray
    holiday: np.ndarray
    log_macro: np.ndarray
    ev: np.ndarray
    lifecycle: np.ndarray
    event: np.ndarray
    level: np.ndarray
    level_source: np.ndarray
    prior_level: np.ndarray
    n_level_cells: np.ndarray
    family_index: GroupIndex | None
    family_names: tuple[str, ...]
    fitted_history: np.ndarray  # (S_hist, 94) in-sample expected order (segment level x accumulated g)
    one_off_share: float = 0.0  # expected one-off excess volume of Direct OEM / Tier-1 series (0 if not applied)

    @property
    def g(self) -> np.ndarray:
        """(U, 113) product of every factor except the level."""
        return self.season * self.holiday * np.exp(self.log_macro) * self.ev * self.lifecycle * self.event

    def uplift(self) -> np.ndarray:
        """(U,) one-off uplift factor per series: 1 + share for Direct OEM / Tier-1, 1 elsewhere."""
        stocking = self.universe["sales_channel"].isin(ONE_OFF_CHANNELS).to_numpy()
        return np.where(stocking, 1.0 + self.one_off_share, 1.0)

    def latent(self) -> np.ndarray:
        """(U, 113) latent monthly demand ``level x uplift x g``."""
        return (np.nan_to_num(self.level) * self.uplift())[:, None] * self.g

    def window_months(self) -> np.ndarray:
        return np.arange(max(self.as_of - self.config.level_window + 1, 0), self.as_of + 1)


def accumulate(values: np.ndarray, span: np.ndarray, weight: np.ndarray, rows: np.ndarray, cols: np.ndarray) -> np.ndarray:
    """``sum_j w_j values[row, col - j]`` over j < span (w_0 = 1, carried months ``weight`` / 1 if NaN); a carried
    month before 2019-01 reuses the same calendar month of 2019 (dossier 4.9, ``celeris.demand.cycles``)."""
    total = np.zeros(len(rows))
    w = np.nan_to_num(np.asarray(weight, dtype=float), nan=1.0)
    span = np.asarray(span)
    for back in range(int(span.max()) if len(span) else 0):
        month = np.asarray(cols) - back
        month = np.where(month < 0, month % 12, month)
        total += np.where(back < span, values[rows, month] * (1.0 if back == 0 else w), 0.0)
    return total


def _segments(ctx: OriginContext) -> np.ndarray:
    """(S, 94) segment id: series x customer run in force (a switch moves the level)."""
    p = ctx.state.panel
    run = np.zeros(p.life.shape, dtype=np.int64)
    history = ctx.state.customer_history[ctx.state.customer_history["run"] > 1]
    for s, first in zip(history["series_no"].to_numpy(), history["first_idx"].to_numpy(), strict=True):
        run[s, first:] += 1
    return np.arange(p.n_series)[:, None] * 4 + np.minimum(run, 3)


class _Design:
    """Static per-universe arrays of one fit (codes, lifecycle, holiday exposure)."""

    def __init__(self, inputs: ModelInputs, ctx: OriginContext, universe: pd.DataFrame, config: StructuralConfig) -> None:
        months = np.arange(N_CALENDAR)
        self.moy = months % 12
        self.region = universe["region"].map({r: k for k, r in enumerate(REGIONS)}).to_numpy()
        self.channel = universe["sales_channel"].map({c: k for k, c in enumerate(CHANNELS)}).to_numpy()
        self.thermal = (universe["product_family"] == THERMAL_FAMILY).to_numpy()
        self.powertrain = universe["powertrain_application"].to_numpy()
        self.aftermarket = (universe["sales_channel"] == AFTERMARKET).to_numpy()
        ramp, phase = lifecycle_matrix(
            months, universe["launch_idx"].to_numpy(), universe["start_idx"].to_numpy(), universe["eol_idx"].to_numpy(),
            universe["product_launch"].to_numpy(), universe["mea_opening"].to_numpy(), config.launch_tau, config.mea_tau,
        )
        self.lifecycle = ramp * (phase if config.use_phaseout else np.where(phase > 0, 1.0, 0.0))
        calendar = calendar_frame(inputs.events)
        self.lny = holiday_share(calendar["lny_days_apac"].to_numpy(), LNY_WINDOW_DAYS, config.holiday_form)
        self.ram = holiday_share(calendar["ramadan_days_mea"].to_numpy(), RAMADAN_WINDOW_DAYS, config.holiday_form)
        self.apac = (universe["region"] == LNY_REGION).to_numpy()
        self.mea = (universe["region"] == RAMADAN_REGION).to_numpy()
        self.skus = tuple(sorted(universe["sku_id"].unique()))
        first = universe.drop_duplicates("sku_id").set_index("sku_id")
        self.sku_family = tuple(first.loc[list(self.skus), "product_family"])
        self.sku_row = universe["sku_id"].map({s: k for k, s in enumerate(self.skus)}).to_numpy()
        self.families = tuple(sorted(universe["product_family"].unique()))
        self.family_row = universe["product_family"].map({f: k for k, f in enumerate(self.families)}).to_numpy()


def _components(f: Factors, x: _Design, ev_x: np.ndarray, scopes: EventScopes) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """(season, holiday, ev, event) matrices (U, 113) for the current factors."""
    moy = x.moy
    season = f.region_season[x.region][:, moy] * f.channel_season[x.channel][:, moy]
    season = np.where(x.thermal[:, None], season * f.thermal_season[moy][None, :], season)
    holiday = np.ones(season.shape)
    holiday[x.apac] *= 1.0 - f.lny_depth * x.lny[None, :]
    holiday[x.mea] *= 1.0 - f.ramadan_depth * x.ram[None, :]
    beta = np.array([f.ev_beta.get(pt, 0.0) for pt in x.powertrain])
    ev = np.exp(beta[:, None] * ev_x[None, :])
    event = np.ones(season.shape)
    for key, exposure in scopes.steps.items():
        event *= f.steps.get(key, 1.0) ** exposure
    return season, holiday, ev, event


def fit_structural(inputs: ModelInputs, ctx: OriginContext, config: StructuralConfig, universe: pd.DataFrame | None = None) -> StructuralFit:
    """Fit the structural model as of ``ctx.as_of`` (see module docstring)."""
    universe = build_universe(ctx) if universe is None else universe
    as_of = ctx.as_of
    x = _Design(inputs, ctx, universe, config)
    macro = macro_data(inputs.macro, as_of)
    ev_center = float(macro.ev[: as_of + 1].mean())
    ev_x = macro.ev - ev_center
    scopes = event_scopes(inputs, ctx, universe) if config.use_events else EventScopes({}, {}, {})
    f = Factors(np.ones((len(REGIONS), 12)), np.ones((len(CHANNELS), 12)), np.ones(12), ev_center=ev_center)

    fit = ctx.fit_cells & (ctx.state.cycles.accum_span == 1)
    i, t = np.nonzero(fit)
    d, w = ctx.demand[i, t], ctx.weight[i, t]
    wd = w * d
    seg_all = _segments(ctx)
    seg_codes, seg_index = pd.factorize(seg_all[i, t])
    n_seg = len(seg_index)
    rm = x.region[i] * 12 + x.moy[t]
    cm = x.channel[i] * 12 + x.moy[t]
    th = x.thermal[i]
    channel_volume = np.bincount(x.channel[i], wd, minlength=len(CHANNELS))
    step_cells = {key: value[i, t] for key, value in scopes.steps.items()}
    log_macro = np.zeros((len(universe), N_CALENDAR))
    macro_paths: SkuPaths | None = None
    family_index: GroupIndex | None = None
    prior = config.season_prior_units

    def g_cells() -> np.ndarray:
        season, holiday, ev, event = _components(f, x, ev_x, scopes)
        return (season * holiday * np.exp(log_macro) * ev * x.lifecycle * event)[i, t]

    level = np.ones(n_seg)
    for iteration in range(config.n_iter):
        g = g_cells()
        level = _ratio(seg_codes, wd, w * g, n_seg)
        mu = level[seg_codes] * g
        if config.use_season:
            if iteration == 0:
                pooled = _ratio(x.moy[t], wd, w * mu, 12)
                f.region_season = np.repeat(pooled[None, :], len(REGIONS), axis=0)
                mu = mu * pooled[x.moy[t]]
            old = f.region_season.ravel()[rm]
            f.region_season = (f.region_season.ravel() * _ratio(rm, wd, w * mu, len(REGIONS) * 12, prior)).reshape(len(REGIONS), 12)
            mu = mu * f.region_season.ravel()[rm] / old
            old = f.channel_season.ravel()[cm]
            f.channel_season = (f.channel_season.ravel() * _ratio(cm, wd, w * mu, len(CHANNELS) * 12, prior)).reshape(len(CHANNELS), 12)
            mu = mu * f.channel_season.ravel()[cm] / old
            if th.any():
                f.thermal_season = f.thermal_season * _ratio(x.moy[t][th], wd[th], (w * mu)[th], 12, prior)
            _normalise_season(f, channel_volume)
            g = g_cells()
            level = _ratio(seg_codes, wd, w * g, n_seg)
            mu = level[seg_codes] * g
        if config.use_holidays:
            new = _holiday_depth(d, w, mu, x.lny[t], x.apac[i], f.lny_depth)
            mu = mu * np.where(x.apac[i], (1 - new * x.lny[t]) / (1 - f.lny_depth * x.lny[t]), 1.0)
            f.lny_depth = new
            new = _holiday_depth(d, w, mu, x.ram[t], x.mea[i], f.ramadan_depth)
            mu = mu * np.where(x.mea[i], (1 - new * x.ram[t]) / (1 - f.ramadan_depth * x.ram[t]), 1.0)
            f.ramadan_depth = new
        if config.use_ev:
            for pt in EV_CLASSES:
                cells = (x.powertrain[i] == pt) & (t >= config.ev_from_month)
                new = _ev_beta(d[cells], w[cells], mu[cells], ev_x[t[cells]], f.ev_beta[pt])
                cells = x.powertrain[i] == pt
                mu[cells] *= np.exp((new - f.ev_beta[pt]) * ev_x[t[cells]])
                f.ev_beta[pt] = new
        for key, exposure in step_cells.items():
            exposed = exposure > 0
            if np.unique(t[exposed]).size >= config.step_min_months:
                old_step = f.steps.get(key, 1.0)
                base = mu[exposed] / old_step ** exposure[exposed]
                f.steps[key] = _step_size(d[exposed], w[exposed], base, exposure[exposed], old_step)
                mu[exposed] = base * f.steps[key] ** exposure[exposed]
        if config.use_macro and iteration >= 1:
            mu0 = mu / np.exp(log_macro[i, t])
            macro_paths, family_index = _fit_macro(d, w, mu0, mu, i, t, as_of, x, macro, config.macro)
            log_macro = config.macro_gamma * macro_paths.log_multiplier(x.sku_row, x.aftermarket, macro)

    season, holiday, ev, event = _components(f, x, ev_x, scopes)
    g_full = season * holiday * np.exp(log_macro) * ev * x.lifecycle * event
    g = g_full[i, t]
    level = _ratio(seg_codes, wd, w * g, n_seg)
    fitted = _fitted_history(ctx, g_full, seg_all, level, seg_index, universe)
    f.strike_event, f.strike_analog = _strike_analog(ctx, scopes, fitted, universe)
    for cells in scopes.shutdowns_future.values():
        event[cells] *= f.strike_analog if f.strike_analog is not None else 1.0
    g_full = season * holiday * np.exp(log_macro) * ev * x.lifecycle * event
    level_u, source, prior_level, n_cells = _forecast_levels(ctx, universe, g_full, config)
    return StructuralFit(
        as_of=as_of, config=config, universe=universe, factors=f, macro=macro, macro_paths=macro_paths,
        season=season, holiday=holiday, log_macro=log_macro, ev=ev, lifecycle=x.lifecycle, event=event,
        level=level_u, level_source=source, prior_level=prior_level, n_level_cells=n_cells,
        family_index=family_index, family_names=x.families, fitted_history=fitted,
        one_off_share=one_off_share(ctx) if config.one_off_uplift else 0.0,
    )


def one_off_share(ctx: OriginContext, months: int = 36) -> float:
    """Excess volume of one-off orders over their expectation relative to the one-off-free demand of Direct OEM and
    Tier-1 series over the last ``months`` months (dossier 4.13, 9.1 #5: about +1.2 %). One-offs are real demand
    (uniform over time, no payback) but cannot be placed at cell level, so the mean adds their expected volume."""
    p = ctx.state.panel
    recent = np.zeros(p.life.shape, dtype=bool)
    recent[:, max(ctx.as_of - months + 1, 0) : ctx.as_of + 1] = True
    stocking = p.series["sales_channel"].isin(ONE_OFF_CHANNELS).to_numpy()[:, None] & recent
    flags = ctx.one_offs.flags & stocking
    excess = float(np.nansum((ctx.demand - ctx.one_offs.expectation.expected)[flags]))
    base = float(np.nansum(ctx.demand[(ctx.fit_cells | flags) & stocking])) - excess
    return max(excess / base, 0.0) if base > 0 else 0.0


def _fit_macro(
    d: np.ndarray, w: np.ndarray, mu0: np.ndarray, mu: np.ndarray, i: np.ndarray, t: np.ndarray, as_of: int,
    x: _Design, macro: MacroData, config: MacroConfig,
) -> tuple[SkuPaths, GroupIndex]:
    """Aggregate the fitting cells to SKU / family / Aftermarket monthly indices and fit the SKU macro paths."""
    n_t = as_of + 1
    var = w * w * (config.noise_a * mu + config.noise_b * mu * mu)
    am = x.aftermarket[i]

    def index(rows: np.ndarray, n_rows: int, cells: np.ndarray) -> GroupIndex:
        code = rows[cells] * n_t + t[cells]
        size = n_rows * n_t
        return GroupIndex(
            np.bincount(code, (w * d)[cells], minlength=size).reshape(n_rows, n_t),
            np.bincount(code, (w * mu0)[cells], minlength=size).reshape(n_rows, n_t),
            np.bincount(code, var[cells], minlength=size).reshape(n_rows, n_t),
        )

    sku_index = index(x.sku_row[i], len(x.skus), ~am)
    family_index = index(x.family_row[i], len(x.families), ~am)
    am_index = index(x.sku_row[i], len(x.skus), am)
    paths = fit_sku_paths(sku_index, x.skus, x.sku_family, family_index, x.families, am_index, macro, config)
    return paths, family_index


def _fitted_history(ctx: OriginContext, g_full: np.ndarray, seg_all: np.ndarray, level: np.ndarray, seg_index: np.ndarray, universe: pd.DataFrame) -> np.ndarray:
    """(S, 94) in-sample expected order on on-phase cells: segment level x accumulated factors (NaN elsewhere)."""
    p, fit = ctx.state.panel, ctx.state.cycles
    lookup = pd.Series(level, index=seg_index)
    seg_level = lookup.reindex(seg_all.ravel()).to_numpy().reshape(seg_all.shape)
    seg_level = pd.DataFrame(seg_level).T.ffill().bfill().T.to_numpy()  # segments without single-month cells
    i, t = np.nonzero(p.life & fit.on_phase & (fit.accum_span > 0))
    acc = accumulate(g_full[: p.n_series], fit.accum_span[i, t], fit.carry_weight[i, t], i, t)
    out = np.full(p.life.shape, np.nan)
    out[i, t] = seg_level[i, t] * acc
    return out


def _strike_analog(ctx: OriginContext, scopes: EventScopes, fitted: np.ndarray, universe: pd.DataFrame) -> tuple[str | None, float | None]:
    """Measured multiplier of the latest customer strike / shutdown before the origin on single-month cells."""
    if not scopes.shutdowns_history:
        return None, None
    key = sorted(scopes.shutdowns_history, key=lambda k: np.flatnonzero(scopes.shutdowns_history[k].any(axis=0)).max())[-1]
    cells = scopes.shutdowns_history[key][: ctx.state.panel.n_series, :N_MONTHS]
    single = ctx.state.cycles.accum_span == 1
    use = cells & single & ~np.isnan(ctx.demand) & ~np.isnan(fitted)
    if use.sum() < 10:
        return key, None
    return key, float(np.nansum(ctx.demand[use]) / np.nansum(fitted[use]))


def _prior_design(universe: pd.DataFrame) -> np.ndarray:
    """One-hot design of the cross-sectional level prior: family, tier x region, channel, powertrain."""
    parts = [
        pd.get_dummies(universe["product_family"], dtype=float),
        pd.get_dummies(universe["sku_tier"].astype(str) + "|" + universe["region"], dtype=float),
        pd.get_dummies(universe["sales_channel"], dtype=float),
        pd.get_dummies(universe["powertrain_application"], dtype=float),
    ]
    return pd.concat(parts, axis=1).to_numpy()


def _forecast_levels(ctx: OriginContext, universe: pd.DataFrame, g_full: np.ndarray, config: StructuralConfig) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Forecast level per universe series (ratio of sums over the level window), credibility blend for young series,
    cross-sectional prior for series without usable history (see module docstring)."""
    p, fit = ctx.state.panel, ctx.state.cycles
    as_of = ctx.as_of
    n_u, n_hist = len(universe), p.n_series
    cells = ctx.level_cells
    i, t = np.nonzero(cells)
    acc = accumulate(g_full[:n_hist], fit.accum_span[i, t], fit.carry_weight[i, t], i, t)
    w = ctx.weight[i, t]
    d = ctx.demand[i, t]
    in_window = t > as_of - config.level_window
    num_w = np.bincount(i[in_window], (w * d)[in_window], minlength=n_hist)
    den_w = np.bincount(i[in_window], (w * acc)[in_window], minlength=n_hist)
    num_all = np.bincount(i, w * d, minlength=n_hist)
    den_all = np.bincount(i, w * acc, minlength=n_hist)
    n_window = np.bincount(i[in_window], minlength=n_hist)
    age = as_of - p.start
    lost = ctx.state.cycles.series["is_lost_account"].to_numpy()
    with np.errstate(all="ignore"):
        window_level = np.where(den_w > 0, num_w / den_w, np.nan)
    mature = (age >= config.young_months) & (n_window >= 12) & ~lost & np.isfinite(window_level) & (window_level > 0)
    design = _prior_design(universe)
    xm = design[:n_hist][mature]
    ym = np.log(window_level[mature])
    beta = np.linalg.solve(xm.T @ xm + 1e-3 * np.eye(xm.shape[1]), xm.T @ ym)
    smear = window_level[mature].sum() / np.exp(xm @ beta).sum()
    prior = np.exp(design @ beta) * smear
    level = np.full(n_u, np.nan)
    source = np.full(n_u, "prior", dtype=object)
    hist_level = np.where(den_w > 0, window_level, np.nan)
    young = (age < config.young_months) & (age >= 0)
    blend = (num_all + config.young_n0 * prior[:n_hist]) / (den_all + config.young_n0)
    level[:n_hist] = np.where(young, blend, hist_level)
    source[:n_hist] = np.where(young, "young_blend", np.where(np.isfinite(hist_level), "window", "prior"))
    missing = ~np.isfinite(level[:n_hist]) | (level[:n_hist] < 0)
    level[:n_hist][missing] = prior[:n_hist][missing]
    level[:n_hist][age < 0] = prior[:n_hist][age < 0]
    source[:n_hist][age < 0] = "cold_start"
    level[n_hist:] = prior[n_hist:]
    source[n_hist:] = "cold_start"
    source[:n_hist][lost] = "lost_account"
    count = np.zeros(n_u, dtype=np.int64)
    count[:n_hist] = n_window
    return level, source, prior, count


# --------------------------------------------------------------------------------------------------- predict ------


def predict(fit: StructuralFit, targets: pd.DataFrame) -> pd.DataFrame:
    """Order means and the multiplicative components for target rows.

    ``targets`` needs ``u`` (universe row), ``month_idx``, ``accum_span`` (0 off-phase), ``carry_weight`` and
    ``zero`` (structural zero: off-phase, lost account, post-EOL). ``latent_mean`` is defined on every row (0 for lost
    accounts, after EOL and before launch); ``mean`` is the accumulated order (0 on structural zeros) times ``shade``.
    The components multiply to ``latent_mean``: the level includes the expected one-off volume of Direct OEM / Tier-1
    series and is expressed at the level-window average of the macro and EV factors, ``f_macro`` / ``f_ev`` relative to
    that average.
    """
    rows = targets["u"].to_numpy(dtype="int64")
    cols = targets["month_idx"].to_numpy(dtype="int64")
    latent_all = fit.latent()
    window = fit.window_months()
    macro_factor = np.exp(fit.log_macro)
    macro_ref = macro_factor[:, window].mean(axis=1)
    ev_ref = fit.ev[:, window].mean(axis=1)
    lost = (fit.level_source == "lost_account")[rows]
    level = np.nan_to_num(fit.level)[rows] * fit.uplift()[rows] * macro_ref[rows] * ev_ref[rows]
    level = np.where(lost, 0.0, level)
    out = pd.DataFrame(
        {
            "level": level,
            "f_season": fit.season[rows, cols],
            "f_holiday": fit.holiday[rows, cols],
            "f_macro": macro_factor[rows, cols] / macro_ref[rows],
            "f_ev": fit.ev[rows, cols] / ev_ref[rows],
            "f_lifecycle": fit.lifecycle[rows, cols],
            "f_event": fit.event[rows, cols],
        },
        index=targets.index,
    )
    out["latent_mean"] = np.where(lost, 0.0, latent_all[rows, cols])
    span = targets["accum_span"].to_numpy(dtype="int64")
    mean = accumulate(latent_all, span, targets["carry_weight"].to_numpy(dtype=float), rows, cols) * fit.config.shade
    zero = targets["zero"].to_numpy(dtype=bool) | lost
    out["mean"] = np.where(zero, 0.0, mean)
    return out
