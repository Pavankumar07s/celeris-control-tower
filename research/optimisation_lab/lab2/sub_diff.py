"""New submission (worktree) vs the current one in the main checkout (snapshot)."""
import numpy as np, pandas as pd
pd.set_option("display.width", 250)
old = pd.read_csv("/tmp/claude-1000/-home-pavan-Desktop-mks/6e1cc0fc-f52b-4777-9b57-6e118178c7b1/scratchpad/snap/submission.csv")
new = pd.read_csv("/home/pavan/Desktop/mks-modelopt/outputs/forecast/submission.csv")
assert (old[["Date", "SKU_ID", "Region"]].values == new[["Date", "SKU_ID", "Region"]].values).all()
master = pd.read_csv("/home/pavan/Desktop/mks-modelopt/outputs/clean/sku_master_clean.csv", usecols=["sku_id", "product_family", "powertrain_application"])
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
