"""Prototype: Bayesian model averaging over family driver sets (patched into celeris.models.structural)."""

from __future__ import annotations

import itertools
from dataclasses import replace

import numpy as np

import celeris.features.macro as M
import celeris.models.structural as S

PENALTY = 9.0
MAX_SETS = 4
MIN_REL = 0.01
LAST = {}


def _set_fit(r, w, months, macro, config, names):
    """Lags by coordinate search (best lag per indicator given the others, 2 passes), RSS, sign check."""
    era = M.era_scale(months, config.era_factor)
    lags = []
    for name in names:  # initial: best single lag
        best = min(range(M.MAX_LAG + 1), key=lambda lag: M._wls(r, w, M._design(macro, months, (name,), (lag,), era))[1])
        lags.append(best)
    for _ in range(2):
        for k in range(len(names)):
            best = None
            for lag in range(M.MAX_LAG + 1):
                trial = list(lags); trial[k] = lag
                beta, rss = M._wls(r, w, M._design(macro, months, tuple(names), tuple(trial), era))
                if best is None or rss < best[0]:
                    best = (rss, lag)
            lags[k] = best[1]
    beta, rss = M._wls(r, w, M._design(macro, months, tuple(names), tuple(lags), era))
    ok = bool(np.all(beta * np.array([M.SIGN[n] for n in names]) > 0)) if names else True
    return tuple(lags), rss, ok


def family_sets(r, w, months, macro, config):
    """All sign-consistent driver sets of size <= max_drivers with posterior weights exp(-(RSS + PENALTY k) / 2)."""
    out = []
    for k in range(0, config.max_drivers + 1):
        for names in itertools.combinations(M.INDICATORS, k):
            lags, rss, ok = _set_fit(r, w, months, macro, config, names)
            if ok:
                out.append((rss + PENALTY * k, names, lags))
    out.sort(key=lambda z: z[0])
    best = out[0][0]
    weights = np.array([np.exp(-(z[0] - best) / 2) for z in out])
    keep = [j for j in np.argsort(-weights)[:MAX_SETS] if weights[j] >= MIN_REL * weights.max()]
    wk = weights[keep] / weights[keep].sum()
    return [(out[j][1], out[j][2], float(wk[n])) for n, j in enumerate(keep)]


def drivers_for(r, w, months, macro, config, names, lags):
    era = M.era_scale(months, config.era_factor)
    posterior = np.zeros((len(names), M.MAX_LAG + 1))
    for k in range(len(names)):
        profile = np.empty(M.MAX_LAG + 1)
        for lag in range(M.MAX_LAG + 1):
            trial = list(lags); trial[k] = lag
            profile[lag] = M._wls(r, w, M._design(macro, months, tuple(names), tuple(trial), era))[1]
        weight = np.exp(-(profile - profile.min()) / 2.0)
        posterior[k] = weight / weight.sum()
    coef = M._wls(r, w, M._lag_averaged(macro, months, tuple(names), posterior, era))[0] if names else np.zeros(0)
    coef = np.where(coef * np.array([M.SIGN[n] for n in names]) > 0, coef, 0.0) if names else coef
    return M.Drivers(tuple(names), tuple(lags), posterior, coef, tuple())


def fit_sku_paths_bma(sku_index, sku_names, sku_family, family_index, family_names, am_index, macro, config, incumbent=None):
    n_months = sku_index.observed.shape[1]
    months = np.arange(n_months)
    r_f, w_f = M._weights(family_index, config)
    sets = {name: family_sets(r_f[k], w_f[k], months, macro, config) for k, name in enumerate(family_names)}
    LAST["sets"] = sets
    u_total = np.zeros((len(sku_names), M.N_CALENDAR))
    base = None
    # run the shipped SKU stage once per alternative driver set (weights per family)
    max_alt = max(len(v) for v in sets.values())
    for a in range(max_alt):
        chosen = {}
        weight_rows = np.zeros(len(sku_names))
        for k, fam in enumerate(family_names):
            alts = sets[fam]
            names, lags, wgt = alts[a] if a < len(alts) else alts[0]
            if a >= len(alts):
                wgt = 0.0
            chosen[fam] = drivers_for(r_f[k], w_f[k], months, macro, config, names, lags)
            weight_rows[np.asarray(sku_family) == fam] = wgt
        orig = M.select_drivers
        M.select_drivers = lambda r, w, mo, ma, cf, inc=None, _c=chosen, _r=r_f: _lookup(_c, _r, r)
        try:
            paths = M.fit_sku_paths(sku_index, sku_names, sku_family, family_index, family_names, am_index, macro, config, None)
        finally:
            M.select_drivers = orig
        if base is None:
            base = paths
        u_total += weight_rows[:, None] * paths.u
    damping, fuel = M._fit_aftermarket(am_index, u_total[:, :n_months], macro, config)
    return replace(base, u=u_total, damping=damping, fuel=fuel)


def _lookup(chosen, r_f, r):
    for k, fam in enumerate(chosen):
        if r is r_f[k] or np.array_equal(r, r_f[k]):
            return chosen[fam]
    raise KeyError


def enable():
    S.fit_sku_paths = fit_sku_paths_bma


def disable():
    S.fit_sku_paths = M.fit_sku_paths
