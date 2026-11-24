import sys
import numpy as np, pandas as pd
pd.set_option("display.width", 250); pd.set_option("display.max_rows", 500); pd.set_option("display.max_columns", 50)
LABEL = {45: "2022-10", 50: "2023-03", 57: "2023-10", 62: "2024-03", 69: "2024-10", 72: "2025-01", 74: "2025-03"}
f = pd.read_parquet(sys.argv[1])
f = f[f["is_scored"]].copy()
f["o"] = f["origin"].map(LABEL) if f["origin"].dtype != object else f["origin"]
order = ["2022-10", "2023-10", "2024-10", "2025-03", "2023-03", "2024-03", "2025-01"]
def m(h, col="A"):
    a = h["actual"].sum(); e = h[col] - h["actual"]
    return pd.Series({"wape": e.abs().sum() / a, "bias": e.sum() / a, "score": e.abs().sum() / a + abs(e.sum() / a)})
print("== overall, all rows vs excluding in-horizon lost-account rows")
rows = []
for o, h in f.groupby("o"):
    x = h[~h["final_lost_tail"]]
    rows.append({"o": o, **m(h).add_suffix("_all"), **m(x).add_suffix("_xlost"), "lost_pp": (h.loc[h.final_lost_tail, "A"].sum()) / h["actual"].sum() * 100})
print(pd.DataFrame(rows).set_index("o").loc[order].round(5))
x = f[~f["final_lost_tail"]]
tot = x.groupby("o")["actual"].sum()
def contrib(col, model="A"):
    g = x.assign(e=x[model] - x["actual"]).groupby(["o", col], observed=True)
    c = (g["e"].sum() / tot.reindex(g["e"].sum().index.get_level_values(0)).to_numpy() * 100).unstack(0)
    b = (g["e"].sum() / g["actual"].sum() * 100).unstack(0)
    return c[order].round(2), b[order].round(2)
for col in ("sales_channel", "powertrain_application", "size", "one_off_recent", "age", "level_source", "product_family", "region", "hb", "cycle_kind"):
    c, b = contrib(col)
    print(f"== {col}: contribution to total bias (pp), excluding lost rows"); print(c)
    print(f"   {col}: bias within slice (%)"); print(b)
print("== swaps (hindsight factor, as-of level re-estimated): bias excl lost (%) / score")
rows = []
for o, h in x.groupby("o"):
    r = {"o": o}
    for col in ("A", "swap_season", "swap_holiday", "swap_log_macro", "swap_ev", "swap_event", "swap_all", "oracle"):
        mm = m(h, col); r[col] = f"{mm['bias']*100:+.2f} / {mm['score']:.4f}"
    rows.append(r)
print(pd.DataFrame(rows).set_index("o").loc[order].to_string())
