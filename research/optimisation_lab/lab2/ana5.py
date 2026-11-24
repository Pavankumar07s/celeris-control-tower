import sys
import numpy as np, pandas as pd
sys.path.insert(0, "/tmp/claude-1000/-home-pavan-Desktop-mks/6e1cc0fc-f52b-4777-9b57-6e118178c7b1/scratchpad/lab")
import lab
pd.set_option("display.width", 250)
LABEL = lab.LABEL
order = ["2022-10", "2023-10", "2024-10", "2025-03", "2023-03", "2024-03", "2025-01"]
f = pd.read_parquet(sys.argv[1]); f = f[f["is_scored"] & ~f["final_lost_tail"] & (f["level_source"] == "young_blend")].copy()
f["o"] = f["origin"].map(LABEL); f["e"] = f["A"] - f["actual"]
uni = None
rows = []
inp = lab.inputs()
for o in sorted(f.origin.unique()):
    ctx = lab.context(o)
    p = ctx.state.panel
    start = p.start
    x = f[f.origin == o]
    age = o - start[x.series_no.to_numpy()]
    x = x.assign(ab=pd.cut(age, [-1, 5, 11, 17, 23], labels=["0-5", "6-11", "12-17", "18-23"]).astype(str))
    for (ab, tier), h in x.groupby(["ab", "sku_tier"]):
        rows.append({"o": LABEL[o], "age": ab, "tier": tier, "bias": h.e.sum() / h.actual.sum() * 100, "share_pp": h.actual.sum(), "n_series": h.series_no.nunique()})
    del ctx
r = pd.DataFrame(rows)
print(r.pivot_table(index=["tier", "age"], columns="o", values="bias")[[c for c in order if c in r.o.unique()]].round(1))
print(r.pivot_table(index=["tier", "age"], columns="o", values="n_series")[[c for c in order if c in r.o.unique()]])
