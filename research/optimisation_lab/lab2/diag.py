"""Step 2 diagnosis frames for a variant: as-of prediction, oracle, hindsight-factor swaps (hindsight fit as of 2026-10
with the same configuration) and series classes. python diag.py variant origins..."""
# Paths are relative to the repository (research/optimisation_lab/lab2 -> lab.py one level up). CELERIS_OUTPUTS
# points at another outputs/ tree; CELERIS_LAB_SNAPSHOT at the first submission's outputs, kept with the lab's working
# files (not included in the repository).
import os as _os
from pathlib import Path as _Path
LAB2_DIR = _Path(__file__).resolve().parent
LAB_DIR = LAB2_DIR.parent
REPO = LAB_DIR.parents[1]
OUT = _os.environ.get("CELERIS_OUTPUTS", str(REPO / "outputs"))
SNAP = _os.environ.get("CELERIS_LAB_SNAPSHOT", str(REPO / "research" / "scratch" / "snap"))
import sys, time
from dataclasses import replace
import numpy as np, pandas as pd
sys.path.insert(0, str(LAB_DIR))
import lab, decomp
from ev import V
from celeris.models.structural import _forecast_levels, predict, fit_structural

COMPS = ("season", "holiday", "log_macro", "ev", "event")


def hindsight(name):
    path = lab.CACHE / f"hindsight_{name}_93.npz"
    if path.exists():
        z = np.load(path)
        return {k: z[k] for k in z.files}
    f = fit_structural(lab.inputs(), lab.context(93), V[name])
    out = {k: getattr(f, k) for k in COMPS}
    np.savez(path, **out)
    return out


def swapped(fit, ctx, parts, cfg):
    f = replace(fit, **parts)
    g_full = f.season * f.holiday * np.exp(f.log_macro) * f.ev * f.lifecycle * f.event
    level, source, prior, n = _forecast_levels(ctx, f.universe, g_full, cfg)
    return replace(f, level=level, level_source=source, prior_level=prior, n_level_cells=n)


name = sys.argv[1]
H = hindsight(name)
frames = []
for o in (int(x) for x in sys.argv[2:]):
    t0 = time.perf_counter()
    ctx = lab.context(o)
    tg = lab.targets_for(o, ctx)
    fit = fit_structural(lab.inputs(), ctx, V[name])
    fr = tg.copy()
    pr = predict(fit, tg)
    fr["A"] = pr["mean"].to_numpy()
    for c in ("level", "f_season", "f_macro", "f_ev"):
        fr[c] = pr[c].to_numpy()
    fr["oracle"] = lab.oracle_floor(fr, fr["A"].to_numpy())
    for comp in COMPS:
        fr[f"swap_{comp}"] = predict(swapped(fit, ctx, {comp: H[comp]}, V[name]), tg)["mean"].to_numpy()
    fr["swap_all"] = predict(swapped(fit, ctx, {c: H[c] for c in COMPS}, V[name]), tg)["mean"].to_numpy()
    cls = decomp.series_classes(ctx, fit, tg)
    fr = pd.concat([fr, cls], axis=1)
    fr["calendar_month"] = fr["month_idx"] % 12 + 1
    fr["hb"] = pd.cut(fr["horizon"], [0, 3, 6, 12, 19], labels=["01-03", "04-06", "07-12", "13-19"]).astype(str)
    for c in fr.columns:
        if fr[c].dtype == "float64":
            fr[c] = fr[c].astype("float32")
    frames.append(fr)
    print(lab.LABEL[o], "done", round(time.perf_counter() - t0), "s", lab.mem(), flush=True)
    del ctx, fit
pd.concat(frames, ignore_index=True).to_parquet(LAB2_DIR / f"diag_{name}.parquet")
