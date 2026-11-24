import sys, time
from dataclasses import replace
import numpy as np, pandas as pd
import lab, levels
from celeris.models.structural import StructuralConfig, fit_structural, predict
pd.set_option("display.width", 220)
B = StructuralConfig()
grid = [(n, True) for n in (4, 6, 8, 10, 14, 20, 30)]
rows = []
for o in (int(x) for x in sys.argv[1:]):
    ctx = lab.context(o); tg = lab.targets_for(o, ctx)
    for n, prof in grid:
        t0 = time.perf_counter()
        f = fit_structural(lab.inputs(), ctx, replace(B, n_iter=n, ev_profile=prof, holiday_profile=True))
        el = time.perf_counter() - t0
        p = predict(f, tg)["mean"].to_numpy()
        m = lab.metrics(tg, p)
        rows.append({"origin": o, "variant": f"{'prof' if prof else 'base'}{n:02d}", **{k: round(v, 5) for k, v in m.items()}, "ev": round(f.factors.ev_beta["EV"], 5), "ice": round(f.factors.ev_beta["ICE"], 5),
                     "lny": round(f.factors.lny_depth, 4), "ram": round(f.factors.ramadan_depth, 4), "sec": round(el, 1)})
        print(rows[-1], flush=True)
    del ctx
