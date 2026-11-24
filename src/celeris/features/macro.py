"""Macro drivers: standardised indicators, the family lead/lag analysis and the shrunk multi-driver SKU macro paths
(dossier 4.7, 4.7b, 5.8, 6.2, 9.1 #1 / #9; MI findings 4-10, MI.v F4-F7).

Generator facts the estimator is built on:

- each SKU responds to the indicators of a family-specific set of about three, at integer lags of mostly 1-4 months,
  with about 0.17-0.19 log points per standard deviation and the economic sign (+ PMI, AUTO, ORD, UTIL; - INV, RAW,
  FUEL). A single driver per SKU must not be imposed: shrunk 3-driver SKU paths beat it in every backtest cell (MI.v);
- the response is log-linear with a soft upward saturation (slope 1 below u = 0.25, 0.5 above; MI.v best deviance)
  and possibly muted in 2021-01..2022-11 (MI.v: era factor about 0.9 in sample). The rolling-origin backtest preferred
  no era factor (``era_factor`` = 1.0) by a small margin; the window amplitude needs no extra scaling (gamma = 1.0;
  the x1.10 of MI belongs to its own log-linear artefact only);
- Aftermarket follows the SKU path damped by c (0.37-0.42) plus a Fuel effect at lag 1 (-0.063 per sd).

Estimation, from data up to the origin only (the indicator values of target months are known, as in the real task):

1. **Family stage.** The family log index ``r_t = log(sum demand / sum expectation without macro)`` over the fitting
   cells of non-Aftermarket series is regressed (weighted least squares, weights from the negative-binomial variance
   plus a model floor) on standardised indicators at lags 0..6; up to three drivers are added by forward selection,
   each with the economic sign. Each driver's lag posterior comes from the deviance profile over lags.
2. **SKU stage.** Per SKU the same regression on its own index, with the family drivers; each driver's lag is averaged
   over a SKU posterior (prior centred on the family lag), and the coefficients get a Gaussian prior centred on the
   family coefficients with sd ``prior_sd`` (empirical-Bayes shrinkage; true across-SKU sd about 0.04-0.05 per sd).
   Signs are clipped to the economic sign. The soft cap is fitted by Gauss-Newton.
3. **Aftermarket stage.** Pooled damping ``c`` and Fuel coefficient ``f`` from the Aftermarket SKU indices.

The indicators are standardised with the mean and sd of the months up to the origin.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from celeris.features.calendar import N_CALENDAR

INDICATORS = ("pmi", "auto", "inv", "raw", "ord", "util", "fuel")
COLUMNS = {
    "pmi": "ism_manufacturing_pmi",
    "auto": "auto_production_yoy_pct",
    "inv": "vehicle_inventory_days",
    "raw": "raw_material_cost_index",
    "ord": "new_vehicle_orders_index",
    "util": "industrial_util_rate_pct",
    "fuel": "fuel_price_index",
}
EV_COLUMN = "ev_adoption_index"
SIGN = {"pmi": 1.0, "auto": 1.0, "inv": -1.0, "raw": -1.0, "ord": 1.0, "util": 1.0, "fuel": -1.0}
MAX_LAG = 6
LEADLAG_MAX_LAG = 12
ERA_MUTED = (24, 46)  # 2021-01 .. 2022-11: muted macro amplitude (dossier 4.7)
ERAS = {"all": (0, 93), "2019-2022": (0, 47), "2023-2026": (48, 93)}
SOFT_CAP_KNEE = 0.25
SOFT_CAP_SLOPE = 0.5
FUEL_LAG = 1
AFTERMARKET = "Aftermarket"


@dataclass(frozen=True)
class MacroData:
    """Cleaned indicators over the modelling calendar and their standardisation as of an origin."""

    as_of: int
    values: np.ndarray  # (113, 7) cleaned indicator values, INDICATORS order
    mean: np.ndarray  # (7,) over months <= as_of
    sd: np.ndarray  # (7,)
    ev: np.ndarray  # (113,) EV adoption index

    @property
    def z(self) -> np.ndarray:
        return (self.values - self.mean) / self.sd

    def lagged(self, lag: int) -> np.ndarray:
        """(113, 7) standardised values at ``t - lag`` (the first months reuse 2019-01)."""
        index = np.clip(np.arange(N_CALENDAR) - lag, 0, None)
        return self.z[index]


def macro_data(macro_clean: pd.DataFrame, as_of: int) -> MacroData:
    """Indicators of ``macro_clean.csv`` (113 months) standardised on months ``<= as_of``."""
    frame = macro_clean.sort_values("date", kind="stable").reset_index(drop=True)
    if len(frame) != N_CALENDAR:
        raise AssertionError(f"macro_clean.csv must hold {N_CALENDAR} months, got {len(frame)}")
    values = frame[[COLUMNS[name] for name in INDICATORS]].to_numpy(dtype=float)
    history = values[: as_of + 1]
    return MacroData(as_of, values, history.mean(axis=0), history.std(axis=0), frame[EV_COLUMN].to_numpy(dtype=float))


def era_scale(months: np.ndarray, era_factor: float) -> np.ndarray:
    """Amplitude multiplier per month: ``era_factor`` in 2021-01..2022-11, 1 elsewhere."""
    months = np.asarray(months)
    return np.where((months >= ERA_MUTED[0]) & (months <= ERA_MUTED[1]), era_factor, 1.0)


def soft_cap(u: np.ndarray, enabled: bool = True) -> np.ndarray:
    """Soft upward saturation of the log multiplier: slope 1 below the knee, ``SOFT_CAP_SLOPE`` above (MI.v)."""
    if not enabled:
        return u
    return np.where(u > SOFT_CAP_KNEE, SOFT_CAP_KNEE + SOFT_CAP_SLOPE * (u - SOFT_CAP_KNEE), u)


def soft_cap_slope(u: np.ndarray, enabled: bool = True) -> np.ndarray:
    if not enabled:
        return np.ones_like(u)
    return np.where(u > SOFT_CAP_KNEE, SOFT_CAP_SLOPE, 1.0)


@dataclass(frozen=True)
class MacroConfig:
    """Hyper-parameters of the macro path (dossier 9.1 #1 / #9 experiments)."""

    prior_sd: float = 0.06
    era_factor: float = 1.0  # backtest: 1.0 beat 0.9 by 0.001 WAPE + |bias| in 3 of 4 folds (dossier 9.1 #1)
    soft_cap: bool = True
    max_drivers: int = 3
    min_gain: float = 9.0  # chi-square gain needed to add a family driver
    lag_decay: float = 0.5  # SKU lag prior: decay per month away from the family lag
    noise_a: float = 1.4  # order variance a x m + b x m^2 (dossier 4.10)
    noise_b: float = 0.065
    model_sd: float = 0.03  # floor on the sd of a monthly log index (family x month residual, dossier 4.7)
    min_months: int = 18
    fixed_damping: float | None = None  # Aftermarket damping; None = estimate (dossier 9.1 #9: 0.37 vs 0.42)


@dataclass(frozen=True)
class GroupIndex:
    """Monthly aggregates of one or more groups: observed demand, expectation without macro and its variance."""

    observed: np.ndarray  # (G, T)
    expected: np.ndarray  # (G, T) expectation without the macro factor
    variance: np.ndarray  # (G, T) variance of the observed sum

    def log_ratio(self) -> tuple[np.ndarray, np.ndarray]:
        """(r, w): log index and inverse-variance weight (0 where unusable)."""
        ok = (self.observed > 0) & (self.expected > 0)
        with np.errstate(all="ignore"):
            r = np.where(ok, np.log(self.observed / np.where(ok, self.expected, 1.0)), 0.0)
            rel_var = np.where(ok, self.variance / np.where(ok, self.observed, 1.0) ** 2, np.inf)
        return r, np.where(ok, 1.0 / (rel_var + 0.0), 0.0)


def _weights(index: GroupIndex, config: MacroConfig) -> tuple[np.ndarray, np.ndarray]:
    r, w = index.log_ratio()
    with np.errstate(divide="ignore"):
        var = np.where(w > 0, 1.0 / np.where(w > 0, w, 1.0), np.inf) + config.model_sd**2
    return r, np.where(np.isfinite(var), 1.0 / var, 0.0)


def _wls(r: np.ndarray, w: np.ndarray, x: np.ndarray) -> tuple[np.ndarray, float]:
    """Weighted least squares of ``r`` on ``[1, x]`` (x: (T, k)); returns (slopes, weighted RSS)."""
    sw = w.sum()
    if sw <= 0:
        return np.zeros(x.shape[1]), 0.0
    xm = (w[:, None] * x).sum(axis=0) / sw
    rm = (w * r).sum() / sw
    xc, rc = x - xm, r - rm
    a = (w[:, None, None] * xc[:, :, None] * xc[:, None, :]).sum(axis=0)
    b = (w[:, None] * xc * rc[:, None]).sum(axis=0)
    try:
        beta = np.linalg.solve(a + 1e-9 * np.eye(len(b)), b)
    except np.linalg.LinAlgError:
        beta = np.zeros(len(b))
    resid = rc - xc @ beta
    return beta, float((w * resid**2).sum())


@dataclass(frozen=True)
class Drivers:
    """The macro drivers of one family: indicator, MAP lag, lag posterior and coefficient per sd (prior for SKUs)."""

    indicators: tuple[str, ...]
    lags: tuple[int, ...]
    lag_posterior: np.ndarray  # (k, MAX_LAG + 1)
    coef: np.ndarray  # (k,)
    gains: tuple[float, ...]


def _design(macro: MacroData, months: np.ndarray, indicators: tuple[str, ...], lags: tuple[int, ...], era: np.ndarray) -> np.ndarray:
    cols = [macro.lagged(lag)[months, INDICATORS.index(name)] * era for name, lag in zip(indicators, lags, strict=True)]
    return np.stack(cols, axis=1) if cols else np.zeros((len(months), 0))


def select_drivers(r: np.ndarray, w: np.ndarray, months: np.ndarray, macro: MacroData, config: MacroConfig) -> Drivers:
    """Forward selection of up to ``max_drivers`` indicators (economic sign) at their best lag 0..6 (family stage)."""
    era = era_scale(months, config.era_factor)
    chosen: list[str] = []
    lags: list[int] = []
    gains: list[float] = []
    _, rss = _wls(r, w, np.zeros((len(months), 0)))
    for _ in range(config.max_drivers):
        best = None
        for name in INDICATORS:
            if name in chosen:
                continue
            for lag in range(MAX_LAG + 1):
                x = _design(macro, months, (*chosen, name), (*lags, lag), era)
                beta, rss_new = _wls(r, w, x)
                if np.any(beta * np.array([SIGN[n] for n in (*chosen, name)]) <= 0):
                    continue
                if best is None or rss_new < best[0]:
                    best = (rss_new, name, lag)
        if best is None or rss - best[0] < config.min_gain:
            break
        gains.append(round(rss - best[0], 2))
        rss = best[0]
        chosen.append(best[1])
        lags.append(best[2])
    posterior = np.zeros((len(chosen), MAX_LAG + 1))
    for k, name in enumerate(chosen):
        profile = np.empty(MAX_LAG + 1)
        for lag in range(MAX_LAG + 1):
            trial = list(lags)
            trial[k] = lag
            profile[lag] = _wls(r, w, _design(macro, months, tuple(chosen), tuple(trial), era))[1]
        weight = np.exp(-(profile - profile.min()) / 2.0)
        posterior[k] = weight / weight.sum()
    coef = _wls(r, w, _lag_averaged(macro, months, tuple(chosen), posterior, era))[0] if chosen else np.zeros(0)
    coef = np.where(coef * np.array([SIGN[n] for n in chosen]) > 0, coef, 0.0) if chosen else coef
    return Drivers(tuple(chosen), tuple(lags), posterior, coef, tuple(gains))


def _lag_averaged(macro: MacroData, months: np.ndarray, indicators: tuple[str, ...], posterior: np.ndarray, era: np.ndarray) -> np.ndarray:
    """(T, k) regressors: each indicator averaged over its lag posterior, times the era amplitude."""
    cols = []
    for k, name in enumerate(indicators):
        j = INDICATORS.index(name)
        stacked = np.stack([macro.lagged(lag)[months, j] for lag in range(MAX_LAG + 1)], axis=1)
        cols.append((stacked @ posterior[k]) * era)
    return np.stack(cols, axis=1) if cols else np.zeros((len(months), 0))


@dataclass(frozen=True)
class SkuPaths:
    """Per-SKU macro paths: lag posteriors and coefficients per driver; ``u`` = linear predictor over the calendar."""

    skus: tuple[str, ...]
    family_of: dict[str, str]
    drivers: dict[str, Drivers]  # by family
    lag_posterior: np.ndarray  # (n_sku, 3, MAX_LAG + 1), rows of unused drivers are 0
    coef: np.ndarray  # (n_sku, 3)
    u: np.ndarray  # (n_sku, 113) linear predictor (calendar amplitude 1)
    n_months: np.ndarray  # months used per SKU
    damping: float  # Aftermarket c
    fuel: float  # Aftermarket Fuel coefficient per sd at lag FUEL_LAG
    config: MacroConfig = field(default_factory=MacroConfig)

    def log_multiplier(self, sku_rows: np.ndarray, aftermarket: np.ndarray, macro: MacroData) -> np.ndarray:
        """(n, 113) log macro multiplier for series with SKU row ``sku_rows`` (-1 = family prior handled upstream)."""
        capped = soft_cap(self.u[sku_rows], self.config.soft_cap)
        fuel = macro.lagged(FUEL_LAG)[:, INDICATORS.index("fuel")]
        am = self.damping * capped + self.fuel * fuel[None, :]
        return np.where(np.asarray(aftermarket)[:, None], am, capped)


def fit_sku_paths(
    sku_index: GroupIndex,
    sku_names: tuple[str, ...],
    sku_family: tuple[str, ...],
    family_index: GroupIndex,
    family_names: tuple[str, ...],
    am_index: GroupIndex,
    macro: MacroData,
    config: MacroConfig,
) -> SkuPaths:
    """Steps 1-3 of the module docstring. Index arrays cover months ``0..T-1`` (T = as_of + 1)."""
    n_months = sku_index.observed.shape[1]
    months = np.arange(n_months)
    era = era_scale(months, config.era_factor)
    r_f, w_f = _weights(family_index, config)
    drivers = {name: select_drivers(r_f[k], w_f[k], months, macro, config) for k, name in enumerate(family_names)}
    r_s, w_s = _weights(sku_index, config)
    n_sku = len(sku_names)
    posterior = np.zeros((n_sku, 3, MAX_LAG + 1))
    coef = np.zeros((n_sku, 3))
    used = (w_s > 0).sum(axis=1)
    lag_grid = np.arange(MAX_LAG + 1)
    stacks = {name: np.stack([macro.lagged(lag)[:, INDICATORS.index(name)] for lag in lag_grid], axis=1) for name in INDICATORS}
    for family, d in drivers.items():
        rows = np.flatnonzero(np.asarray(sku_family) == family)
        k = len(d.indicators)
        if k == 0 or not len(rows):
            continue
        prior_lag = np.stack([config.lag_decay ** np.abs(lag_grid - lag) for lag in d.lags])  # (k, L)
        prior_lag /= prior_lag.sum(axis=1, keepdims=True)
        r, w = r_s[rows], w_s[rows]
        enough = used[rows] >= config.min_months
        post = np.repeat(d.lag_posterior[None, :, :], len(rows), axis=0)  # (n, k, L)
        for j, name in enumerate(d.indicators):
            rss = np.empty((len(rows), len(lag_grid)))
            for li, lag in enumerate(lag_grid):
                x = stacks[name][:n_months, li] * era  # (T,)
                rss[:, li] = _batched_single_rss(r, w, x)
            loglik = -(rss - rss.min(axis=1, keepdims=True)) / 2.0
            weight = np.exp(loglik) * prior_lag[j][None, :]
            weight /= weight.sum(axis=1, keepdims=True)
            post[enough, j] = weight[enough]
        x = np.einsum("tjl,njl->ntj", np.stack([stacks[n][:n_months] for n in d.indicators], axis=1), post) * era[None, :, None]
        b = _batched_ridge(r, w, x, d.coef, config.prior_sd)
        signs = np.array([SIGN[n] for n in d.indicators])
        b = np.where(b * signs > 0, b, 0.0)
        if config.soft_cap:
            full_x = x
            for _ in range(2):
                u = np.einsum("ntj,nj->nt", full_x, b)
                slope = soft_cap_slope(u)
                offset = soft_cap(u) - slope * u
                jac = full_x * slope[:, :, None]
                b = _batched_ridge(r - offset, w, jac, d.coef, config.prior_sd)
                b = np.where(b * signs > 0, b, 0.0)
        b[~enough] = d.coef
        posterior[rows, :k] = post
        coef[rows, :k] = b
    u = np.zeros((n_sku, N_CALENDAR))
    for family, d in drivers.items():
        rows = np.flatnonzero(np.asarray(sku_family) == family)
        for j, name in enumerate(d.indicators):
            u[rows] += coef[rows, j, None] * (posterior[rows, j] @ stacks[name].T)
    damping, fuel = _fit_aftermarket(am_index, u[:, :n_months], macro, config)
    return SkuPaths(
        skus=tuple(sku_names),
        family_of=dict(zip(sku_names, sku_family, strict=True)),
        drivers=drivers,
        lag_posterior=posterior,
        coef=coef,
        u=u,
        n_months=used,
        damping=damping,
        fuel=fuel,
        config=config,
    )


def _batched_single_rss(r: np.ndarray, w: np.ndarray, x: np.ndarray) -> np.ndarray:
    """Weighted RSS of ``r[n] ~ a + b x`` for every row n (x shared across rows)."""
    sw = np.maximum(w.sum(axis=1), 1e-12)
    xm = (w * x[None, :]).sum(axis=1) / sw
    rm = (w * r).sum(axis=1) / sw
    xc = x[None, :] - xm[:, None]
    rc = r - rm[:, None]
    sxx = (w * xc**2).sum(axis=1)
    sxy = (w * xc * rc).sum(axis=1)
    beta = np.where(sxx > 0, sxy / np.where(sxx > 0, sxx, 1.0), 0.0)
    return (w * (rc - beta[:, None] * xc) ** 2).sum(axis=1)


def _batched_ridge(r: np.ndarray, w: np.ndarray, x: np.ndarray, prior: np.ndarray, prior_sd: float) -> np.ndarray:
    """Per row: weighted regression of r on [1, x] with a N(prior, prior_sd^2) prior on the slopes."""
    sw = np.maximum(w.sum(axis=1), 1e-12)
    xm = np.einsum("nt,ntj->nj", w, x) / sw[:, None]
    rm = (w * r).sum(axis=1) / sw
    xc = x - xm[:, None, :]
    rc = r - rm[:, None]
    a = np.einsum("nt,nti,ntj->nij", w, xc, xc) + np.eye(x.shape[2])[None] / prior_sd**2
    b = np.einsum("nt,nti,nt->ni", w, xc, rc) + prior[None, :] / prior_sd**2
    return np.linalg.solve(a, b[:, :, None])[:, :, 0]


def _fit_aftermarket(am_index: GroupIndex, u: np.ndarray, macro: MacroData, config: MacroConfig) -> tuple[float, float]:
    """Pooled damping c and Fuel coefficient f: ``r_AM = a_sku + c x cap(u_sku) + f x z_fuel(t-1)``."""
    r, w = _weights(am_index, config)
    n_months = r.shape[1]
    fuel = macro.lagged(FUEL_LAG)[:n_months, INDICATORS.index("fuel")]
    capped = soft_cap(u, config.soft_cap)
    sw = np.maximum(w.sum(axis=1), 1e-12)
    keep = w.sum(axis=1) > 0
    def centred(v: np.ndarray) -> np.ndarray:
        return v - ((w * v).sum(axis=1) / sw)[:, None]
    x1 = centred(capped)[keep]
    x2 = centred(np.broadcast_to(fuel, r.shape))[keep]
    rc = centred(r)[keep]
    ww = w[keep]
    a = np.array([[(ww * x1 * x1).sum(), (ww * x1 * x2).sum()], [(ww * x1 * x2).sum(), (ww * x2 * x2).sum()]])
    b = np.array([(ww * x1 * rc).sum(), (ww * x2 * rc).sum()])
    damping, fuel_coef = np.linalg.solve(a + 1e-9 * np.eye(2), b)
    if config.fixed_damping is not None:
        damping = config.fixed_damping
        fuel_coef = float((ww * x2 * (rc - damping * x1)).sum() / max((ww * x2 * x2).sum(), 1e-12))
    return float(np.clip(damping, 0.0, 1.0)), float(min(fuel_coef, 0.0))


def leadlag_table(family_r: dict[str, np.ndarray], family_w: dict[str, np.ndarray], macro: MacroData, drivers_by_era: dict[str, dict[str, Drivers]]) -> pd.DataFrame:
    """Family x indicator x lag 0..12 x era: weighted correlation of the family macro index with the lagged indicator.

    ``family_r`` is the family log index without the macro factor (months 0..T-1); ``is_driver`` marks the drivers
    the forward selection picks in that era, at their MAP lag (lag stability across eras, dossier 4.7b).
    """
    names = (*INDICATORS, "ev")
    ev_z = (macro.ev - macro.ev[: macro.as_of + 1].mean()) / macro.ev[: macro.as_of + 1].std()
    rows = []
    for family, r in family_r.items():
        w = family_w[family]
        for era, (first, last) in ERAS.items():
            drivers = drivers_by_era.get(era, {}).get(family)
            for name in names:
                series = ev_z if name == "ev" else macro.z[:, INDICATORS.index(name)]
                for lag in range(LEADLAG_MAX_LAG + 1):
                    months = np.arange(max(first, lag), min(last, len(r) - 1) + 1)
                    ww = w[months]
                    x = series[months - lag]
                    y = r[months]
                    corr = _weighted_corr(x, y, ww)
                    is_driver = bool(
                        drivers is not None and name in drivers.indicators and drivers.lags[drivers.indicators.index(name)] == lag
                    )
                    rows.append({"product_family": family, "indicator": name, "lag": lag, "corr": round(corr, 4), "era": era, "is_driver": is_driver})
    return pd.DataFrame(rows)


def _weighted_corr(x: np.ndarray, y: np.ndarray, w: np.ndarray) -> float:
    keep = w > 0
    if keep.sum() < 6:
        return float("nan")
    x, y, w = x[keep], y[keep], w[keep] / w[keep].sum()
    xm, ym = (w * x).sum(), (w * y).sum()
    cov = (w * (x - xm) * (y - ym)).sum()
    sx, sy = np.sqrt((w * (x - xm) ** 2).sum()), np.sqrt((w * (y - ym) ** 2).sum())
    return float(cov / (sx * sy)) if sx > 0 and sy > 0 else float("nan")


INDICATOR_LABEL = {**COLUMNS, "ev": EV_COLUMN}  # cleaned column names of macro_clean.csv


def sensitivity_table(paths: SkuPaths, macro: MacroData) -> pd.DataFrame:
    """``macro_sensitivity.csv``: change in log latent demand per +1 unit of the cleaned indicator at each lag.

    Non-Aftermarket: ``coef x lag posterior / sd`` (slope below the soft cap); Aftermarket: ``c x`` that, plus the
    Fuel term at lag 1. Rows with |beta| < 1e-6 are dropped.
    """
    rows = []
    for i, sku in enumerate(paths.skus):
        family = paths.family_of[sku]
        d = paths.drivers.get(family)
        if d is None:
            continue
        for j, name in enumerate(d.indicators):
            sd = macro.sd[INDICATORS.index(name)]
            for lag in range(MAX_LAG + 1):
                beta = paths.coef[i, j] * paths.lag_posterior[i, j, lag] / sd
                for group, scale in (("other", 1.0), ("aftermarket", paths.damping)):
                    if abs(beta * scale) >= 1e-6:
                        rows.append({"sku_id": sku, "channel_group": group, "indicator": INDICATOR_LABEL[name], "lag": lag, "beta": beta * scale})
        fuel_beta = paths.fuel / macro.sd[INDICATORS.index("fuel")]
        if abs(fuel_beta) >= 1e-6:
            rows.append({"sku_id": sku, "channel_group": "aftermarket", "indicator": INDICATOR_LABEL["fuel"], "lag": FUEL_LAG, "beta": fuel_beta})
    out = pd.DataFrame(rows, columns=["sku_id", "channel_group", "indicator", "lag", "beta"])
    out = out.groupby(["sku_id", "channel_group", "indicator", "lag"], as_index=False, sort=True)["beta"].sum()
    out["beta"] = out["beta"].round(7)
    return out
