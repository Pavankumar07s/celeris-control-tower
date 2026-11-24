import sys
import numpy as np, pandas as pd
pd.set_option("display.width", 250)
LABEL = {45: "2022-10", 50: "2023-03", 57: "2023-10", 62: "2024-03", 69: "2024-10", 72: "2025-01", 74: "2025-03"}
order = ["2022-10", "2023-10", "2024-10", "2025-03", "2023-03", "2024-03", "2025-01"]
f = pd.read_parquet(sys.argv[1]); f = f[f["is_scored"] & ~f["final_lost_tail"]].copy()
f["o"] = f["origin"].map(LABEL); f["e"] = f["A"] - f["actual"]
f["grp"] = np.where(f["level_source"] == "window", "mature", np.where(f["level_source"] == "young_blend", "young", "cold"))
for grp in ("young", "cold"):
    x = f[f.grp == grp]
    b = (x.groupby(["o", "powertrain_application"])["e"].sum() / x.groupby(["o", "powertrain_application"])["actual"].sum() * 100).unstack(0)[order]
    a = x.groupby(["o", "powertrain_application"])["actual"].sum().unstack(0)[order]
    print(grp, "bias % by powertrain"); print(b.round(1)); print(a.round(0))
    b = (x.groupby(["o", "sku_tier"])["e"].sum() / x.groupby(["o", "sku_tier"])["actual"].sum() * 100).unstack(0)[order]
    print(grp, "bias % by tier"); print(b.round(1))
    # swap effects
    for col in ("swap_ev", "swap_log_macro", "swap_all", "oracle"):
        print(grp, col, ((x[col] - x.actual).groupby(x.o).sum() / x.actual.groupby(x.o).sum() * 100)[order].round(1).to_dict())
