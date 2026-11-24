import pandas as pd, numpy as np
pd.set_option("display.width", 220); pd.set_option("display.max_rows", 200)
f = pd.read_parquet("decomp_frames.parquet")
f = f[f["is_scored"]].copy()
f["cycle"] = f["cycle_kind"].astype(str)
f["lost_in_h"] = f["final_lost_tail"]
def gap(col, model="A", oracle="oracle"):
    rows = []
    for o, g in f.groupby("origin"):
        tot = g["actual"].sum()
        for v, h in g.groupby(col, observed=True):
            a = h["actual"].sum()
            rows.append({"origin": o, col: v, "share": a/tot, "wape_A": (h[model]-h["actual"]).abs().sum()/a,
                         "wape_O": (h[oracle]-h["actual"]).abs().sum()/a, "bias_A": (h[model]-h["actual"]).sum()/a,
                         "wape_swap": (h["swap_all"]-h["actual"]).abs().sum()/a,
                         "contrib": ((h[model]-h["actual"]).abs().sum() - (h[oracle]-h["actual"]).abs().sum())/tot,
                         "contrib_macro": ((h[model]-h["actual"]).abs().sum() - (h["swap_log_macro"]-h["actual"]).abs().sum())/tot})
    r = pd.DataFrame(rows).groupby(col).mean(numeric_only=True)
    r["excess_wape"] = r["wape_A"] - r["wape_O"]
    return r.round(4)
for col in ("product_family","region","sales_channel","horizon_bucket","cycle","level_source","age","size","switch_recent","one_off_recent","lost_in_h","final_one_off","calendar_month","powertrain_application","sku_tier"):
    print("\n==", col); print(gap(col).to_string())
