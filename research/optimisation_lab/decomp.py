"""Error decomposition of the shipping structural model against the in-hindsight oracle (oracle swaps + slices)."""

from __future__ import annotations

import sys
import time
from dataclasses import replace

import numpy as np
import pandas as pd

import lab
from celeris.models.gbm import series_statistics
from celeris.models.structural import StructuralConfig, _forecast_levels, predict

CFG = StructuralConfig()
COMPS = ("season", "holiday", "log_macro", "ev", "event")


def hindsight():
    path = lab.CACHE / "hindsight_93.npz"
    if path.exists():
        z = np.load(path)
        return {k: z[k] for k in z.files}
    ctx = lab.context(93)
    f = lab.fit(93, CFG, ctx)
    out = {k: getattr(f, k) for k in COMPS}
    np.savez(path, **out)
    return out


def swapped(fit, ctx, parts: dict):
    """Fit with some components replaced and the as-of level re-estimated on the swapped factors."""
    f = replace(fit, **parts)
    g_full = f.season * f.holiday * np.exp(f.log_macro) * f.ev * f.lifecycle * f.event
    level, source, prior, n = _forecast_levels(ctx, f.universe, g_full, CFG)
    return replace(f, level=level, level_source=source, prior_level=prior, n_level_cells=n)


def series_classes(ctx, fit, tg: pd.DataFrame) -> pd.DataFrame:
    p = ctx.state.panel
    T = ctx.as_of
    n = p.n_series
    ch = ctx.state.customer_history
    switch_recent = np.zeros(n, dtype=bool)
    sw = ch[(ch["run"] > 1) & (ch["first_idx"] > T - 24)]
    switch_recent[sw["series_no"].to_numpy()] = True
    switch_any = np.zeros(n, dtype=bool)
    switch_any[ch[ch["run"] > 1]["series_no"].to_numpy()] = True
    recent = np.zeros(p.life.shape, dtype=bool)
    recent[:, max(T - 23, 0): T + 1] = True
    one_off_recent = (ctx.one_offs.flags & recent).any(axis=1)
    lvl = np.nan_to_num(fit.level[:n])
    stats = series_statistics(ctx, fit)
    u = tg["u"].to_numpy()
    out = pd.DataFrame(index=tg.index)
    out["level_source"] = fit.level_source[u]
    out["switch_recent"] = switch_recent[u]
    out["switch_any"] = switch_any[u]
    out["one_off_recent"] = one_off_recent[u]
    out["size"] = pd.cut(lvl[u], [-1, 10, 25, 50, 100, 1e9], labels=["<10", "10-25", "25-50", "50-100", ">100"]).astype(str)
    out["age"] = pd.cut(T - p.start[u], [-1000, -1, 23, 47, 1000], labels=["cold", "<24", "24-47", ">=48"]).astype(str)
    out["ratio12"] = stats["ratio_level12"].to_numpy()[u]
    out["ratio36"] = stats["ratio_level36"].to_numpy()[u]
    out["ratio_all"] = stats["ratio_level_all"].to_numpy()[u]
    out["ratio_prior"] = stats["ratio_prior"].to_numpy()[u]
    return out


def slice_gap(frame: pd.DataFrame, model: str, oracle: str, col: str) -> pd.DataFrame:
    s = frame[frame["is_scored"]]
    total = s["actual"].sum()
    g = s.assign(em=(s[model] - s["actual"]).abs(), eo=(s[oracle] - s["actual"]).abs(), dm=s[model] - s["actual"]).groupby(col, observed=True)
    out = pd.DataFrame({
        "share": g["actual"].sum() / total,
        "wape_m": g["em"].sum() / g["actual"].sum(),
        "wape_o": g["eo"].sum() / g["actual"].sum(),
        "bias_m": g["dm"].sum() / g["actual"].sum(),
        "gap_contrib": (g["em"].sum() - g["eo"].sum()) / total,
    })
    return out


def main(origins):
    H = hindsight()
    rows = []
    frames = []
    for o in origins:
        t0 = time.perf_counter()
        ctx = lab.context(o)
        tg = lab.targets_for(o, ctx)
        fit = lab.fit(o, CFG, ctx)
        frame = tg.copy()
        frame["A"] = predict(fit, tg)["mean"].to_numpy()
        frame["oracle"] = lab.oracle_floor(frame, frame["A"].to_numpy())
        res = {"A": lab.metrics(frame, frame["A"]), "oracle": lab.metrics(frame, frame["oracle"])}
        for comp in COMPS:
            f = swapped(fit, ctx, {comp: H[comp]})
            frame[f"swap_{comp}"] = predict(f, tg)["mean"].to_numpy()
            res[f"swap_{comp}"] = lab.metrics(frame, frame[f"swap_{comp}"])
        f_all = swapped(fit, ctx, {c: H[c] for c in COMPS})
        frame["swap_all"] = predict(f_all, tg)["mean"].to_numpy()
        res["swap_all"] = lab.metrics(frame, frame["swap_all"])
        frame["oracle_all"] = lab.oracle_floor(frame, frame["swap_all"].to_numpy())
        res["oracle_all"] = lab.metrics(frame, frame["oracle_all"])
        # longer windows under hindsight factors
        for w in (12, 36, 48, 94):
            cfg = replace(CFG, level_window=w)
            for tag, base in (("asof", fit), ("hind", f_all)):
                g_full = base.season * base.holiday * np.exp(base.log_macro) * base.ev * base.lifecycle * base.event
                level, source, prior, n = _forecast_levels(ctx, base.universe, g_full, cfg)
                ff = replace(base, level=level, level_source=source, prior_level=prior, n_level_cells=n, config=cfg)
                frame[f"W{w}_{tag}"] = predict(ff, tg)["mean"].to_numpy()
                res[f"W{w}_{tag}"] = lab.metrics(frame, frame[f"W{w}_{tag}"])
        for k, m in res.items():
            rows.append({"origin": lab.LABEL[o], "variant": k, **m})
        cls = series_classes(ctx, fit, tg)
        frame = pd.concat([frame, cls], axis=1)
        frame["horizon_bucket"] = pd.cut(frame["horizon"], [0, 3, 6, 12, 19], labels=["01-03", "04-06", "07-12", "13-19"]).astype(str)
        frame["calendar_month"] = frame["month_idx"] % 12 + 1
        keep = [c for c in frame.columns if c in ("origin", "series_no", "month_idx", "horizon", "actual", "is_scored", "zero", "product_family", "region",
                                                   "sales_channel", "powertrain_application", "sku_tier", "cycle_kind", "is_cold_start", "final_lost_tail",
                                                   "final_one_off", "horizon_bucket", "calendar_month", "accum_span") or c in cls.columns
                or c in ("A", "oracle", "swap_all", "oracle_all") or c.startswith("swap_")]
        frames.append(frame[keep])
        print(f"origin {lab.LABEL[o]} done in {time.perf_counter()-t0:.0f}s {lab.mem()}", flush=True)
        del ctx, fit, f_all
    res = pd.DataFrame(rows)
    res.to_csv(lab.LAB / "decomp_scores.csv", index=False)
    allf = pd.concat(frames, ignore_index=True)
    allf.to_parquet(lab.LAB / "decomp_frames.parquet")
    pd.set_option("display.width", 200)
    print(res.pivot(index="variant", columns="origin", values="score").round(5))
    print(res.pivot(index="variant", columns="origin", values="wape").round(5))


if __name__ == "__main__":
    main(tuple(int(x) for x in sys.argv[1:]) or lab.DECISION)
