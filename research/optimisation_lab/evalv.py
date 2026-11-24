"""Evaluate named variants: python evalv.py variant[,variant...] origins...  (predictions cached, metrics appended)"""
import sys, time, json
import numpy as np, pandas as pd
import lab, variants, bma2
from celeris.models.structural import fit_structural, predict
names = sys.argv[1].split(",")
out = lab.LAB / "results.csv"
for o in (int(x) for x in sys.argv[2:]):
    ctx = None
    for name in names:
        path = lab.CACHE / f"pred_{name}_{o}.npy"
        if path.exists():
            continue
        ctx = ctx or lab.context(o)
        tg = lab.targets_for(o, ctx)
        t0 = time.perf_counter()
        bma2.enable() if 'bma' in name else bma2.disable()
        f = fit_structural(lab.inputs(), ctx, variants.V[name])
        p = predict(f, tg)["mean"].to_numpy()
        np.save(path, p.astype("float32"))
        m = lab.metrics(tg, p)
        row = {"variant": name, "origin": o, **m, "iters": len(f.trace), "ev": f.factors.ev_beta["EV"], "ice": f.factors.ev_beta["ICE"], "lny": f.factors.lny_depth, "ram": f.factors.ramadan_depth, "sec": round(time.perf_counter() - t0, 1)}
        pd.DataFrame([row]).to_csv(out, mode="a", header=not out.exists(), index=False)
        print(lab.LABEL[o], name, lab.fmt(m), f"it {len(f.trace)} EV {row['ev']:.4f} LNY {row['lny']:.3f} {row['sec']}s", flush=True)
    del ctx
