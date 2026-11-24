"""Bias / WAPE by age class (cold start, young <12, young 12-23, mature) for a cached variant: python youth.py variant origins..."""
import sys
import numpy as np, pandas as pd
import lab
pd.set_option("display.width", 250)
name = sys.argv[1]
rows = []
for o in (int(x) for x in sys.argv[2:]):
    ctx = lab.context(o)
    t = lab.targets_for(o, ctx).copy()
    t["m"] = np.load(lab.CACHE / f"pred_{name}_{o}.npy").astype(float)
    start = ctx.state.panel.start
    age = o - start[t["series_no"].to_numpy()]
    t["cls"] = np.select([t["is_cold_start"].to_numpy() | (age < 0), age < 12, age < 24], ["cold", "young<12", "young12-23"], "mature")
    t["ev"] = t["powertrain_application"].eq("EV")
    s = t[t.is_scored]; tot = s.actual.sum()
    for (c, ev), h in s.groupby(["cls", "ev"]):
        a = h.actual.sum()
        rows.append({"origin": lab.LABEL[o], "cls": c, "ev": ev, "share": a / tot, "bias": (h.m - h.actual).sum() / a, "wape": (h.m - h.actual).abs().sum() / a, "contrib_pp": (h.m - h.actual).sum() / tot * 100, "n_series": h.series_no.nunique()})
    del ctx
r = pd.DataFrame(rows)
print(r.round(4).to_string(index=False))
g = r.groupby(["cls", "ev"])[["share", "bias", "wape", "contrib_pp"]].mean()
print(g.round(4).to_string())
