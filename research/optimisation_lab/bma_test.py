import sys, time
from dataclasses import replace
import numpy as np, pandas as pd
import lab, bma
from celeris.models.structural import StructuralConfig, fit_structural, predict
B = StructuralConfig()
C = replace(B, n_iter=8, ev_profile=True, holiday_profile=True)
for o in (int(x) for x in sys.argv[1:]):
    ctx = lab.context(o); tg = lab.targets_for(o, ctx)
    for name, cfg, use in (("base", B, False), ("conv", C, False), ("conv_bma", C, True), ("base_bma", B, True)):
        bma.enable() if use else bma.disable()
        t0 = time.perf_counter()
        f = fit_structural(lab.inputs(), ctx, cfg)
        el = time.perf_counter() - t0
        m = lab.metrics(tg, predict(f, tg)["mean"].to_numpy())
        print(lab.LABEL[o], name, lab.fmt(m), f"{el:.1f}s", flush=True)
        if use:
            for fam, alts in bma.LAST["sets"].items():
                print("   ", fam[:12], [(" + ".join(f"{n}@{l}" for n, l in zip(a[0], a[1])), round(a[2], 2)) for a in alts])
    bma.disable()
