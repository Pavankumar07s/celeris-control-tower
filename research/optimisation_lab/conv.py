"""Backfit convergence traces: python conv.py origins..."""
import sys, time
from dataclasses import replace
import numpy as np, pandas as pd
import lab
from celeris.models.structural import StructuralConfig, fit_structural, predict
B = StructuralConfig()
VARIANTS = {"plain": replace(B, n_iter=60), "profile": replace(B, n_iter=60, ev_profile=True, holiday_profile=True)}
rows = []
for o in (int(x) for x in sys.argv[1:]):
    ctx = lab.context(o)
    for name, cfg in VARIANTS.items():
        t0 = time.perf_counter()
        f = fit_structural(lab.inputs(), ctx, cfg)
        el = time.perf_counter() - t0
        for r in f.trace:
            rows.append({"origin": o, "variant": name, **r})
        print(lab.LABEL[o], name, f"{el:.0f}s", flush=True)
        for r in f.trace:
            if r["iteration"] in (1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60):
                print("   ", {k: (round(v, 6) if isinstance(v, float) else v) for k, v in r.items()}, flush=True)
    del ctx
pd.DataFrame(rows).to_csv(lab.LAB / f"conv_{'_'.join(sys.argv[1:])}.csv", index=False)
