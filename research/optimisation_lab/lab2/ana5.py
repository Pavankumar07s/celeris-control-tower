# Paths are relative to the repository (research/optimisation_lab/lab2 -> lab.py one level up). CELERIS_OUTPUTS
# points at another outputs/ tree; CELERIS_LAB_SNAPSHOT at the first submission's outputs, kept with the lab's working
# files (not included in the repository).
import os as _os
from pathlib import Path as _Path
LAB2_DIR = _Path(__file__).resolve().parent
LAB_DIR = LAB2_DIR.parent
REPO = LAB_DIR.parents[1]
OUT = _os.environ.get("CELERIS_OUTPUTS", str(REPO / "outputs"))
SNAP = _os.environ.get("CELERIS_LAB_SNAPSHOT", str(REPO / "research" / "scratch" / "snap"))
import sys
import numpy as np, pandas as pd
sys.path.insert(0, str(LAB_DIR))
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
