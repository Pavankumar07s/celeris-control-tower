"""Backfit convergence traces with driver hysteresis: python conv2.py margin origins..."""
import sys, time
from dataclasses import replace
import numpy as np, pandas as pd
import lab
from celeris.models.structural import StructuralConfig, fit_structural
B = StructuralConfig()
margin = float(sys.argv[1])
VARIANTS = {"profile_hyst": replace(B, n_iter=40, ev_profile=True, holiday_profile=True, macro=replace(B.macro, switch_margin=margin))}
rows = []
for o in (int(x) for x in sys.argv[2:]):
    ctx = lab.context(o)
    for name, cfg in VARIANTS.items():
        t0 = time.perf_counter()
        f = fit_structural(lab.inputs(), ctx, cfg)
        el = time.perf_counter() - t0
        for r in f.trace:
            rows.append({"origin": o, "variant": name, **r})
        print(lab.LABEL[o], name, f"{el:.0f}s", {fam[:5]: " + ".join(f"{n}@{l}" for n, l in zip(d.indicators, d.lags)) for fam, d in f.macro_paths.drivers.items()}, flush=True)
        for r in f.trace:
            if r["iteration"] in (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20, 25, 30, 40):
                print("   ", {k: (round(v, 7) if isinstance(v, float) else v) for k, v in r.items()}, flush=True)
    del ctx
pd.DataFrame(rows).to_csv(lab.LAB / f"conv2_{sys.argv[1]}_{'_'.join(sys.argv[2:])}.csv", index=False)
