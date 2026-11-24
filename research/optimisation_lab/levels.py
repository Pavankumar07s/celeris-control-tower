"""Fast level-estimator experiments: the factor fit is cached per origin; only the level stage changes."""

from __future__ import annotations

import pickle
import sys
import time
from dataclasses import replace

import numpy as np
import pandas as pd

import lab
from celeris.models.structural import StructuralConfig, _prior_design, accumulate, predict

CFG = StructuralConfig()


def cached_fit(origin: int, ctx=None):
    return lab.fit(origin, CFG, ctx)


def level_parts(ctx, fit):
    """Per level cell: series, month, weight, demand, accumulated g."""
    p, cyc = ctx.state.panel, ctx.state.cycles
    i, t = np.nonzero(ctx.level_cells)
    g_full = fit.g
    acc = accumulate(g_full[: p.n_series], cyc.accum_span[i, t], cyc.carry_weight[i, t], i, t)
    return i, t, ctx.weight[i, t], ctx.demand[i, t], acc


def general_levels(ctx, fit, parts, *, window=24, tau=None, tau_cap=None, precision=None, n0=2.0, shrink_k=0.0,
                   class_window=None, young_months=24, blend_long=None, size_gamma=0.0):
    """Generalised forecast level (mirrors ``_forecast_levels`` when called with defaults)."""
    p = ctx.state.panel
    T = ctx.as_of
    n = p.n_series
    i, t, w, d, acc = parts
    age_cell = T - t
    win = np.full(n, window, dtype=float)
    if class_window is not None:
        win = class_window(ctx, fit).astype(float)
    if tau is None:
        tw = (age_cell < win[i]).astype(float)
    else:
        tw = np.exp(-age_cell / tau)
        if tau_cap is not None:
            tw = tw * (age_cell < tau_cap)
    ww = w * tw
    if precision is not None:
        a, b = precision
        lvl0 = np.bincount(i, w * d * (age_cell < 24), minlength=n) / np.maximum(np.bincount(i, w * acc * (age_cell < 24), minlength=n), 1e-9)
        for _ in range(2):
            m = np.maximum(lvl0[i] * acc, 0.5)
            pw = 1.0 / (a + b * m)
            pw = pw / np.bincount(i, pw * ww, minlength=n)[i] * np.bincount(i, ww, minlength=n)[i]
            lvl0 = np.bincount(i, ww * pw * d, minlength=n) / np.maximum(np.bincount(i, ww * pw * acc, minlength=n), 1e-12)
        ww = ww * pw
    num_w = np.bincount(i, ww * d, minlength=n)
    den_w = np.bincount(i, ww * acc, minlength=n)
    num_all = np.bincount(i, w * d, minlength=n)
    den_all = np.bincount(i, w * acc, minlength=n)
    n_window = np.bincount(i[age_cell < 24], minlength=n)
    age = T - p.start
    lost = ctx.state.cycles.series["is_lost_account"].to_numpy()
    with np.errstate(all="ignore"):
        window_level = np.where(den_w > 0, num_w / den_w, np.nan)
    # prior exactly as shipped (24-month window levels of mature series)
    num24 = np.bincount(i[age_cell < 24], (w * d)[age_cell < 24], minlength=n)
    den24 = np.bincount(i[age_cell < 24], (w * acc)[age_cell < 24], minlength=n)
    with np.errstate(all="ignore"):
        lvl24 = np.where(den24 > 0, num24 / den24, np.nan)
    mature = (age >= 24) & (n_window >= 12) & ~lost & np.isfinite(lvl24) & (lvl24 > 0)
    design = _prior_design(fit.universe)
    xm = design[:n][mature]
    beta = np.linalg.solve(xm.T @ xm + 1e-3 * np.eye(xm.shape[1]), xm.T @ np.log(lvl24[mature]))
    smear = lvl24[mature].sum() / np.exp(xm @ beta).sum()
    prior = np.exp(design @ beta) * smear
    if blend_long is not None:
        window_level = blend_long(window_level, num_all, den_all, num_w, den_w)
    if shrink_k:
        with np.errstate(all="ignore"):
            window_level = np.where(den_w > 0, (num_w + shrink_k * prior[:n]) / (den_w + shrink_k), np.nan)
    level = np.full(len(fit.universe), np.nan)
    hist_level = np.where(den_w > 0, window_level, np.nan)
    young = (age < young_months) & (age >= 0)
    blend = (num_all + n0 * prior[:n]) / (den_all + n0)
    if size_gamma:
        ok = np.isfinite(hist_level) & (hist_level > 0) & ~young
        c = np.average(np.log(hist_level[ok]), weights=hist_level[ok])
        hist_level = np.where(ok, hist_level * np.exp(-size_gamma * (np.log(np.where(ok, hist_level, 1.0)) - c)), hist_level)
    level[:n] = np.where(young, blend, hist_level)
    missing = ~np.isfinite(level[:n]) | (level[:n] < 0)
    level[:n][missing] = prior[:n][missing]
    level[:n][age < 0] = prior[:n][age < 0]
    level[n:] = prior[n:]
    return level


def evaluate(origins, variants: dict, log=print):
    rows = []
    for o in origins:
        t0 = time.perf_counter()
        ctx = lab.context(o)
        tg = lab.targets_for(o, ctx)
        fit = cached_fit(o, ctx)
        parts = level_parts(ctx, fit)
        base_pred = predict(fit, tg)["mean"].to_numpy()
        for name, kw in variants.items():
            if kw is None:
                pred = base_pred
            else:
                lv = general_levels(ctx, fit, parts, **kw)
                pred = predict(replace(fit, level=lv), tg)["mean"].to_numpy()
            rows.append({"origin": o, "variant": name, **lab.metrics(tg, pred)})
        log(f"origin {lab.LABEL[o]} {time.perf_counter()-t0:.0f}s")
        del ctx, fit, parts
    return pd.DataFrame(rows)


def report(df: pd.DataFrame, base="base"):
    piv = df.pivot(index="variant", columns="origin", values="score")
    b = piv.loc[base]
    out = pd.DataFrame({"mean": piv.mean(axis=1), "delta": piv.mean(axis=1) - b.mean(), "wins": (piv.lt(b, axis=1)).sum(axis=1)})
    for o in piv.columns:
        out[lab.LABEL[o]] = piv[o] - b[o]
    out["wape"] = df.pivot(index="variant", columns="origin", values="wape").mean(axis=1)
    out["bias"] = df.pivot(index="variant", columns="origin", values="bias").mean(axis=1)
    out["fam"] = df.pivot(index="variant", columns="origin", values="fam_month").mean(axis=1)
    return out.sort_values("delta")
