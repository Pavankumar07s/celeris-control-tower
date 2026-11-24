"""E11: fixed horizon-aware blends of structural and GBM on a backtest predictions.parquet: python gbm_blend.py path"""
import sys
import numpy as np, pandas as pd
p = pd.read_parquet(sys.argv[1], columns=["origin", "model", "date", "sku_id", "region", "horizon", "actual", "pred", "is_scored"])
p = p[p.model.isin(["structural", "gbm"]) & p.is_scored]
w = p.pivot_table(index=["origin", "date", "sku_id", "region", "horizon"], columns="model", values="pred").reset_index()
a = p[p.model == "structural"].set_index(["origin", "date", "sku_id", "region", "horizon"])["actual"]
w["actual"] = a.reindex(pd.MultiIndex.from_frame(w[["origin", "date", "sku_id", "region", "horizon"]])).to_numpy()
h = w["horizon"].to_numpy()
sched = {"structural": np.zeros_like(h, dtype=float), "A": np.select([h <= 3, h <= 6], [0.5, 0.25], 0.0), "B": 0.5 * np.maximum(0, 1 - (h - 1) / 12), "equal": np.full(len(h), 0.5)}
rows = []
for name, wt in sched.items():
    f = (1 - wt) * w["structural"] + wt * w["gbm"].fillna(w["structural"])
    for o, g in w.assign(f=f).groupby("origin"):
        s = (g.f - g.actual).abs().sum() / g.actual.sum(); b = (g.f - g.actual).sum() / g.actual.sum()
        rows.append({"schedule": name, "origin": o, "wape": s, "bias": b, "score": s + abs(b)})
r = pd.DataFrame(rows); piv = r.pivot(index="schedule", columns="origin", values="score")
dec = [c for c in piv.columns if c != "2021-10"]
print(piv.round(5).to_string()); print((piv[dec].sub(piv.loc["structural", dec])).round(5).assign(mean=lambda x: x.mean(axis=1), wins=lambda x: (x[dec] < 0).sum(axis=1)).to_string())
