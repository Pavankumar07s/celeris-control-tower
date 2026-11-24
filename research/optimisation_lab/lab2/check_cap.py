"""New soft-cap fit (frozen settled rows) must reproduce the old one bit for bit."""
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
import numpy as np
sys.path.insert(0, str(LAB_DIR))
sys.path.insert(0, str(LAB2_DIR))
import lab, old_cap
import celeris.features.macro as M
from celeris.models.structural import StructuralConfig, fit_structural, predict
new_fn = M._soft_cap_fit
for o in (int(x) for x in sys.argv[1:]):
    ctx = lab.context(o); tg = lab.targets_for(o, ctx)
    res = {}
    for name, fn in (("new", new_fn), ("old", old_cap._soft_cap_fit)):
        M._soft_cap_fit = fn
        t0 = time.perf_counter()
        f = fit_structural(lab.inputs(), ctx, StructuralConfig())
        res[name] = (predict(f, tg)["mean"].to_numpy(), f.macro_paths.u.copy(), len(f.trace), time.perf_counter() - t0)
    print(lab.LABEL[o], "identical preds:", np.array_equal(res["new"][0], res["old"][0]), "identical u:", np.array_equal(res["new"][1], res["old"][1]),
          "iters", res["new"][2], res["old"][2], "time new/old", round(res["new"][3], 1), round(res["old"][3], 1), flush=True)
    M._soft_cap_fit = new_fn
