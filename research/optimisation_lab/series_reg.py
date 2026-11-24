import pandas as pd, numpy as np
pd.set_option("display.width", 220)
f = pd.read_parquet("decomp_frames.parquet")
f = f[f["is_scored"] & ~f["zero"]].copy()
g = f.groupby(["origin","series_no"]).agg(a=("actual","sum"), A=("A","sum"), S=("swap_all","sum"), r12=("ratio12","first"), r36=("ratio36","first"),
     rall=("ratio_all","first"), rp=("ratio_prior","first"), src=("level_source","first"), cyc=("cycle_kind","first"), size=("size","first"),
     fam=("product_family","first"), reg=("region","first"), pt=("powertrain_application","first"), n=("actual","size"))
g = g[(g["src"]=="window") & (g["A"]>0) & (g["a"]>0)]
g["y"] = np.log(g["a"]/g["A"]); g["yS"] = np.log(g["a"]/g["S"])
for c in ("r12","r36","rall","rp"):
    g["l"+c] = np.log(g[c].clip(0.05, 20))
print("weighted sd of log oracle ratio (A):", np.sqrt(np.average(g["y"]**2, weights=g["A"])).round(4), " with true factors:", np.sqrt(np.average(g["yS"]**2, weights=g["A"])).round(4))
def wls(df, ycol, xcols):
    X = np.column_stack([np.ones(len(df))] + [df[c].to_numpy() for c in xcols]); w = df["A"].to_numpy(); y = df[ycol].to_numpy()
    ok = np.isfinite(X).all(axis=1) & np.isfinite(y)
    X, w, y = X[ok], w[ok], y[ok]
    b = np.linalg.solve(X.T @ (w[:,None]*X), X.T @ (w*y))
    res = y - X @ b
    r2 = 1 - np.average(res**2, weights=w)/np.average((y-np.average(y,weights=w))**2, weights=w)
    return b, r2
for ycol in ("y","yS"):
    print("\n== target", ycol)
    for xs in (["lrp"], ["lr12"], ["lr36"], ["lrall"], ["lrp","lr12","lrall"]):
        rows = []
        for o, d in g.groupby("origin"):
            b, r2 = wls(d, ycol, xs); rows.append([o, *np.round(b,4), round(r2,4)])
        print(xs, rows)
# bias of log ratio by cycle, size, powertrain
for col in ("cyc","size","pt","reg"):
    t = g.groupby(["origin", col]).apply(lambda d: pd.Series({"mean_y": np.average(d["y"], weights=d["A"]), "sd_y": np.sqrt(np.average(d["y"]**2, weights=d["A"])), "sd_yS": np.sqrt(np.average(d["yS"]**2, weights=d["A"])), "n": len(d)})).unstack(0)
    print("\n==", col); print(t.round(3).to_string())
