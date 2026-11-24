"""New submission (worktree) vs the current one in the main checkout (snapshot)."""
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
import numpy as np, pandas as pd
pd.set_option("display.width", 250)
old = pd.read_csv(f"{SNAP}/submission.csv")
new = pd.read_csv(f"{OUT}/forecast/submission.csv")
assert (old[["Date", "SKU_ID", "Region"]].values == new[["Date", "SKU_ID", "Region"]].values).all()
master = pd.read_csv(f"{OUT}/clean/sku_master_clean.csv", usecols=["sku_id", "product_family", "powertrain_application"])
d = old.rename(columns={"Units_Sold_Forecast": "old"}).assign(new=new["Units_Sold_Forecast"]).merge(master, left_on="SKU_ID", right_on="sku_id", how="left")
print("total old / new / change:", d.old.sum(), d.new.sum(), f"{(d.new.sum() / d.old.sum() - 1) * 100:+.2f} %")
for key in ("Date", "product_family", "powertrain_application", "Region"):
    g = d.groupby(key)[["old", "new"]].sum(); g["change_%"] = (g.new / g.old - 1) * 100
    print(g.round(2))
pos = d.old > 0
rel = (d.new[pos] / d.old[pos] - 1).abs()
print("rows:", len(d), "rows changing > 10 %:", int((rel > 0.10).sum()), "of", int(pos.sum()), "positive rows;", "> 5 %:", int((rel > 0.05).sum()), "; zero rows still zero:", int(((d.old == 0) & (d.new == 0)).sum()), "zero mismatches:", int(((d.old == 0) != (d.new == 0)).sum()))
ev = d[d.powertrain_application == "EV"].groupby("Date")[["old", "new"]].sum(); ev["change_%"] = (ev.new / ev.old - 1) * 100
print("EV by month"); print(ev.round(2))
big = d[pos].assign(rel=(d.new[pos] / d.old[pos] - 1)).query("abs(rel) > 0.10")
print("rows >10% by powertrain:", big.powertrain_application.value_counts().to_dict(), "by family:", big.product_family.value_counts().to_dict())
print("old units of rows changing >10%:", big.old.sum())
