"""Which part of the macro path flips between consecutive backfit iterations? python flip.py origin n"""
import sys
from dataclasses import replace
import numpy as np, pandas as pd
import lab
from celeris.models.structural import StructuralConfig, fit_structural
o, n = int(sys.argv[1]), int(sys.argv[2])
ctx = lab.context(o)
fits = [fit_structural(lab.inputs(), ctx, replace(StructuralConfig(), n_iter=k, ev_profile=True)) for k in (n, n + 1)]
a, b = fits
for fam in a.macro_paths.drivers:
    da, db = a.macro_paths.drivers[fam], b.macro_paths.drivers[fam]
    sa = " + ".join(f"{x}@{l}:{c:.3f}" for x, l, c in zip(da.indicators, da.lags, da.coef))
    sb = " + ".join(f"{x}@{l}:{c:.3f}" for x, l, c in zip(db.indicators, db.lags, db.coef))
    print(fam[:12], "|", sa, "|", sb, "| gains", da.gains, db.gains)
dl = np.abs(a.log_macro - b.log_macro)
alive = a.lifecycle > 0
print("max |dlog macro|", dl[alive].max(), "cells > 0.01:", (dl[alive] > 0.01).sum())
u = a.universe
worst = np.unravel_index(np.argmax(np.where(alive, dl, 0)), dl.shape)
print("worst", u.iloc[worst[0]][["sku_id", "region", "sales_channel", "product_family"]].to_dict(), "month", worst[1])
rows = np.flatnonzero((np.where(alive, dl, 0) > 0.01).any(axis=1))
print(u.iloc[rows].groupby(["product_family"]).size())
print("damping", a.macro_paths.damping, b.macro_paths.damping, "fuel", a.macro_paths.fuel, b.macro_paths.fuel)
for k in ("ev", "season", "holiday", "lifecycle", "event"):
    va, vb = getattr(a, k), getattr(b, k)
    print(k, float(np.max(np.abs(np.log(np.where(alive, va, 1)) - np.log(np.where(alive, vb, 1))))))
