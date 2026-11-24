"""Convergence trace of a named variant: python conv3.py variant origins..."""
import sys, time
import numpy as np, pandas as pd
import lab, variants
from celeris.models.structural import fit_structural, predict
name = sys.argv[1]; cfg = variants.V[name]
rows = []
for o in (int(x) for x in sys.argv[2:]):
    ctx = lab.context(o)
    t0 = time.perf_counter()
    f = fit_structural(lab.inputs(), ctx, cfg)
    el = time.perf_counter() - t0
    tr = f.trace
    rows += [{"origin": o, "variant": name, **r} for r in tr]
    print(lab.LABEL[o], name, f"{el:.0f}s iterations {len(tr)} last change {tr[-1]['max_dlog_g']:.2e}", {k: round(v, 5) for k, v in tr[-1].items() if k != "iteration"}, flush=True)
    print("    changes:", " ".join(f"{r['max_dlog_g']:.1e}" for r in tr), flush=True)
    print("    drivers:", {fam[:5]: " + ".join(f"{n}@{l}" for n, l in zip(d.indicators, d.lags)) for fam, d in f.macro_paths.drivers.items()}, flush=True)
    del ctx
pd.DataFrame(rows).to_csv(lab.LAB / f"conv3_{name}_{'_'.join(sys.argv[2:])}.csv", index=False)
