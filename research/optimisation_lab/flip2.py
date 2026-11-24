"""Remaining 2-cycle after hysteresis: python flip2.py origin n"""
import sys
from dataclasses import replace
import numpy as np, pandas as pd
import lab
from celeris.models.structural import StructuralConfig, fit_structural
o, n = int(sys.argv[1]), int(sys.argv[2])
B = StructuralConfig()
import variants; cfg = variants.CONV.__class__(**{**variants.CONV.__dict__, "tol": None})
ctx = lab.context(o)
a, b = [fit_structural(lab.inputs(), ctx, replace(cfg, n_iter=k)) for k in (n, n + 1)]
alive = a.lifecycle > 0
for k in ("ev", "season", "holiday", "lifecycle", "event"):
    va, vb = getattr(a, k), getattr(b, k)
    print(k, float(np.max(np.abs(np.log(np.where(alive, va, 1)) - np.log(np.where(alive, vb, 1))))))
dl = np.where(alive, np.abs(a.log_macro - b.log_macro), 0)
print("max |dlog macro|", dl.max(), "cells > 0.005:", (dl > 0.005).sum())
u = a.universe
rows = np.flatnonzero((dl > 0.005).any(axis=1))
print(u.iloc[rows].groupby(["sku_id", "sales_channel"]).size().sort_values().tail(15))
worst = np.unravel_index(np.argmax(dl), dl.shape)
sku = u.iloc[worst[0]]["sku_id"]; print("worst", u.iloc[worst[0]][["sku_id", "region", "sales_channel"]].to_dict(), "month", worst[1])
pa, pb = a.macro_paths, b.macro_paths
k = pa.skus.index(sku)
print("coef", pa.coef[k], pb.coef[k]); print("post", pa.lag_posterior[k].round(3), pb.lag_posterior[k].round(3), sep="\n")
print("u range", pa.u[k].min(), pa.u[k].max(), "n_months", pa.n_months[k], pb.n_months[k])
print("damping", pa.damping, pb.damping, pa.fuel, pb.fuel)
diff = np.abs(pa.coef - pb.coef).max(axis=1); top = np.argsort(-diff)[:8]
print([(pa.skus[j], round(float(diff[j]), 4), int(pa.n_months[j])) for j in top])
