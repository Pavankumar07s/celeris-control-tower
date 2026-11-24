"""Evaluate named variants on origins: python ev.py variant[,variant] origins...  (predictions cached in lab/cache,
metrics appended to lab2/results.csv). Variants are defined in V below (src configurations only, no monkey-patching)."""
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
from pathlib import Path
import numpy as np, pandas as pd
sys.path.insert(0, str(LAB_DIR))
import lab, variants
from celeris.models.structural import fit_structural, predict
from celeris.features.macro import MacroConfig
from celeris.models.structural import StructuralConfig
# explicit configurations (independent of the package defaults, which change when a winner is integrated)
SHIP_MACRO = MacroConfig(switch_margin=None, cap_iter=2, cap_line_search=False, cap_smooth=0.0, set_averaging=False)
SHIP = StructuralConfig(n_iter=6, tol=None, ev_profile=False, holiday_profile=False, macro=SHIP_MACRO)
C = replace(SHIP, n_iter=40, tol=1e-6, ev_profile=True, holiday_profile=True,
            macro=replace(SHIP_MACRO, switch_margin=2.0, cap_iter=20, cap_line_search=True, cap_smooth=0.05))
V = {"base": SHIP, "conv": C}
V["avg"] = replace(C, macro=replace(C.macro, set_averaging=True))
V["avg_lc"] = replace(V["avg"], launch_cohort=(6, 24))
V["avg_sd12"] = replace(V["avg"], macro=replace(V["avg"].macro, prior_sd=0.12))
V["base_avg"] = replace(SHIP, macro=replace(SHIP_MACRO, set_averaging=True))
OUT = Path(__file__).resolve().parent / "results.csv"
if __name__ == "__main__":
    names = sys.argv[1].split(",")
    for o in (int(x) for x in sys.argv[2:]):
        ctx = None
        for name in names:
            path = lab.CACHE / f"pred_{name}_{o}.npy"
            if path.exists():
                continue
            ctx = ctx or lab.context(o)
            tg = lab.targets_for(o, ctx)
            t0 = time.perf_counter()
            f = fit_structural(lab.inputs(), ctx, V[name])
            p = predict(f, tg)["mean"].to_numpy()
            np.save(path, p.astype("float32"))
            m = lab.metrics(tg, p)
            sets = {fam: " | ".join(f"{'+'.join(f'{n}@{l}' for n, l in zip(d.indicators, d.lags))}:{w:.2f}" for d, w in alts) for fam, alts in f.macro_paths.driver_sets.items()}
            row = {"variant": name, "origin": o, **m, "iters": len(f.trace), "last_change": f.trace[-1]["max_dlog_g"], "ev": f.factors.ev_beta["EV"], "lny": f.factors.lny_depth, "sec": round(time.perf_counter() - t0, 1), "sets": repr(sets)}
            pd.DataFrame([row]).to_csv(OUT, mode="a", header=not OUT.exists(), index=False)
            print(lab.LABEL[o], name, lab.fmt(m), f"it {len(f.trace)} last {row['last_change']:.1e} EV {row['ev']:.4f} {row['sec']}s", flush=True)
        del ctx
