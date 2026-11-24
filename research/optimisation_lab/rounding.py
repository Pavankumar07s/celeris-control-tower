"""E10: unrounded vs nearest-integer vs cumulative rounding of a cached variant: python rounding.py variant origins..."""
import sys
import numpy as np, pandas as pd
import lab
name = sys.argv[1]
rows = []
def cumround(t, col):
    t = t.sort_values(["series_no", "month_idx"])
    c = t.groupby("series_no")[col].cumsum()
    r = np.rint(c)
    prev = r.groupby(t["series_no"]).shift(1).fillna(0)
    return (r - prev).reindex(t.index)
for o in (int(x) for x in sys.argv[2:]):
    t = lab.targets_for(o).copy()
    t["m"] = np.load(lab.CACHE / f"pred_{name}_{o}.npy").astype(float)
    t["near"] = np.rint(t["m"])
    t["cum"] = cumround(t, "m")
    t["floor"] = np.floor(t["m"])
    for v in ("m", "near", "cum"):
        rows.append({"origin": lab.LABEL[o], "rounding": v, **lab.metrics(t, t[v].to_numpy())})
    s = t[t.is_scored]
    small = s["m"] < 3
    print(lab.LABEL[o], f"rows with 0 < mean < 3: {((s.m > 0) & small).mean():.3%}, their actual share {s.loc[small, 'actual'].sum() / s.actual.sum():.3%}")
r = pd.DataFrame(rows)
piv = r.pivot(index="rounding", columns="origin", values="score")
print(piv.round(5).to_string()); print((piv - piv.loc["m"]).round(6).assign(mean=lambda x: x.mean(axis=1)).to_string())
print(r.pivot(index="rounding", columns="origin", values="bias").mul(100).round(3).to_string())
