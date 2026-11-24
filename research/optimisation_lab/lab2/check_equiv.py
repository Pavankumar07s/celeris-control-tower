"""Selection mode must reproduce the cached base / conv predictions exactly; time the averaging mode."""
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
import numpy as np
sys.path.insert(0, str(LAB_DIR))
import lab, variants
from celeris.models.structural import fit_structural, predict
o = int(sys.argv[1])
ctx = lab.context(o); tg = lab.targets_for(o, ctx)
for name in sys.argv[2:]:
    cfg = variants.V.get(name)
    if name == "conv_avg":
        cfg = replace(variants.CONV, macro=replace(variants.CONV.macro, set_averaging=True))
    t0 = time.perf_counter()
    f = fit_structural(lab.inputs(), ctx, cfg)
    p = predict(f, tg)["mean"].to_numpy()
    el = time.perf_counter() - t0
    m = lab.metrics(tg, p)
    ref = lab.CACHE / f"pred_{name if name != 'conv_avg' else 'conv_bma'}_{o}.npy"
    diff = np.abs(np.load(ref) - p.astype('float32')).max() if ref.exists() else float('nan')
    print(lab.LABEL[o], name, lab.fmt(m), f"it {len(f.trace)} EV {f.factors.ev_beta['EV']:.4f} {el:.1f}s maxdiff_vs_cache {diff:.3g}", lab.mem(), flush=True)
    if f.macro_paths is not None and f.macro_paths.driver_sets:
        for fam, alts in f.macro_paths.driver_sets.items():
            print("   ", fam[:14], [(" + ".join(f"{n}@{l}" for n, l in zip(d.indicators, d.lags)), round(wt, 3)) for d, wt in alts])
