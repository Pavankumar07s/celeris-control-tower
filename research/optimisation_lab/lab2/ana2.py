import sys
import numpy as np, pandas as pd
pd.set_option("display.width", 250); pd.set_option("display.max_rows", 500)
LABEL = {45: "2022-10", 50: "2023-03", 57: "2023-10", 62: "2024-03", 69: "2024-10", 72: "2025-01", 74: "2025-03"}
order = ["2022-10", "2023-10", "2024-10", "2025-03", "2023-03", "2024-03", "2025-01"]
f = pd.read_parquet(sys.argv[1]); f = f[f["is_scored"] & ~f["final_lost_tail"]].copy()
f["o"] = f["origin"].map(LABEL) if f["origin"].dtype != object else f["origin"]
tot = f.groupby("o")["actual"].sum()
def tab(keys, model="A"):
    g = f.assign(e=f[model] - f["actual"]).groupby(["o", *keys], observed=True)
    out = pd.DataFrame({"bias%": g["e"].sum() / g["actual"].sum() * 100, "pp": g["e"].sum() / tot.reindex(g["e"].sum().index.get_level_values(0)).to_numpy() * 100,
                        "wape": (f.assign(e=(f[model] - f["actual"]).abs()).groupby(["o", *keys], observed=True)["e"].sum() / g["actual"].sum()), "n": g.size()})
    return out
t = tab(["cycle_kind", "accum_span"])
print(t["bias%"].unstack(0)[order].round(2)); print(t["n"].unstack(0)[order])
# young series detail
ctxless = f.copy()
for col in ("region", "sales_channel"):
    t = tab(["age", col]); print(t.loc[(slice(None), "<24"), "pp"].unstack(0)[order].round(2) if False else t["bias%"].xs("<24", level=1).unstack(0)[order].round(1))
t = tab(["age", "level_source"]); print(t["n"].unstack(0)[order])
print(tab(["age", "hb"])["bias%"].xs("<24", level=1).unstack(0)[order].round(1))
print(tab(["age", "hb"])["bias%"].xs("cold", level=1).unstack(0)[order].round(1))
