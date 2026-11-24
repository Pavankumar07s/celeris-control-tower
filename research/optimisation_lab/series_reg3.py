import pandas as pd, numpy as np
pd.set_option("display.width", 220)
f = pd.read_parquet("decomp_frames.parquet")
f = f[f["is_scored"] & ~f["zero"]].copy()
g = f.groupby(["origin","series_no"]).agg(a=("actual","sum"), A=("A","sum"), S=("swap_all","sum"), src=("level_source","first"), size=("size","first"),
     pt=("powertrain_application","first"), reg=("region","first"), chan=("sales_channel","first"), tier=("sku_tier","first"), fam=("product_family","first"), n=("actual","size")).reset_index()
g = g[(g["src"]=="window") & (g["A"]>0) & (g["a"]>0)].copy()
g["y"] = np.log(g["a"]/g["A"])
g["lvl"] = np.log(g["A"]/g["n"])
def wm(d): return pd.Series({"y": np.average(d["y"], weights=d["A"]), "n": len(d)})
for col in ("tier","chan","reg","pt","fam"):
    t = g.groupby([col,"size"]).apply(wm)["y"].unstack().round(3)
    print("\n==", col); print(t.to_string())
# regression of y on lvl with fixed effects per origin x region x tier
rows=[]
for o, d in g.groupby("origin"):
    X = pd.get_dummies(d[["reg","tier","chan","pt"]].astype(str), drop_first=False).astype(float)
    X["lvl"] = d["lvl"] - np.average(d["lvl"], weights=d["A"])
    w = d["A"].to_numpy(); Xv = X.to_numpy(); y = d["y"].to_numpy()
    b = np.linalg.lstsq(Xv*np.sqrt(w)[:,None], y*np.sqrt(w), rcond=None)[0]
    rows.append((o, round(b[-1],4)))
print("slope of y on log level within region x tier x channel x powertrain:", rows)
