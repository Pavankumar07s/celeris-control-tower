import sys
import numpy as np, pandas as pd
pd.set_option("display.width", 250); pd.set_option("display.max_rows", 500); pd.set_option("display.max_columns", 20)
LABEL = {45: "2022-10", 50: "2023-03", 57: "2023-10", 62: "2024-03", 69: "2024-10", 72: "2025-01", 74: "2025-03"}
order = ["2022-10", "2023-10", "2024-10", "2025-03", "2023-03", "2024-03", "2025-01"]
f = pd.read_parquet(sys.argv[1]); f = f[f["is_scored"] & ~f["final_lost_tail"]].copy()
f["o"] = f["origin"].map(LABEL)
tot = f.groupby("o")["actual"].sum()
f["e"] = f["A"] - f["actual"]
f["grp"] = np.where(f["level_source"] == "window", "mature", np.where(f["level_source"] == "young_blend", "young", "cold"))
pp = f.groupby(["o", "grp"])["e"].sum().unstack(0)[order] / tot[order] * 100
print("contribution pp by lifecycle group"); print(pp.round(2)); print("total", (f.groupby("o")["e"].sum()[order] / tot[order] * 100).round(2).to_dict())
m = f[f.grp == "mature"]
c = m.groupby(["o", "sales_channel"])["e"].sum().unstack(0)[order] / tot[order] * 100
print("mature series: contribution pp by channel"); print(c.round(2))
b = m.groupby(["o", "sales_channel"])["e"].sum().unstack(0)[order] / m.groupby(["o", "sales_channel"])["actual"].sum().unstack(0)[order] * 100
print("mature series: bias % by channel"); print(b.round(2))
c = m.groupby(["o", "size"])["e"].sum().unstack(0)[order] / tot[order] * 100
print("mature: pp by size"); print(c.round(2))
# swap_log_macro on mature direct OEM
for col in ("A", "swap_log_macro", "swap_all", "swap_season"):
    x = m[m.sales_channel == "Direct OEM"]
    print(col, "Direct OEM mature bias %", ((x[col] - x.actual).groupby(x.o).sum() / x.actual.groupby(x.o).sum() * 100)[order].round(2).to_dict())
