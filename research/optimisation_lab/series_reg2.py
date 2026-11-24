import pandas as pd, numpy as np
pd.set_option("display.width", 220)
f = pd.read_parquet("decomp_frames.parquet")
f = f[f["is_scored"] & ~f["zero"]].copy()
f["sku"] = f["series_no"]  # placeholder
g = f.groupby(["origin","series_no"]).agg(a=("actual","sum"), A=("A","sum"), S=("swap_all","sum"), r12=("ratio12","first"), r36=("ratio36","first"),
     rall=("ratio_all","first"), rp=("ratio_prior","first"), src=("level_source","first"), cyc=("cycle_kind","first"), size=("size","first"),
     pt=("powertrain_application","first"), reg=("region","first"), chan=("sales_channel","first"), n=("actual","size")).reset_index()
t = pd.read_parquet("cache/targets_74.parquet")[["series_no","sku_id"]].drop_duplicates()
g = g.merge(t, on="series_no", how="left")
g = g[(g["src"]=="window") & (g["A"]>0) & (g["a"]>0)].copy()
g["y"] = np.log(g["a"]/g["A"]); g["yS"] = np.log(g["a"]/g["S"])
g["lr12"] = np.log(g["r12"].clip(0.05,20)); g["lr36"] = np.log(g["r36"].clip(0.05,20))
# monthly-equivalent level proxy = A / n
g["prior_size"] = pd.cut((g["A"]/g["n"])/g["rp"], [0,10,25,50,100,1e9], labels=["<10","10-25","25-50","50-100",">100"])
print(g.groupby(["prior_size","origin"]).apply(lambda d: np.average(d["y"], weights=d["A"])).unstack().round(3))
print(g.groupby(["size","origin"]).apply(lambda d: np.average(d["yS"], weights=d["A"])).unstack().round(3))
print(g.groupby(["pt","origin"]).apply(lambda d: np.average(d["yS"], weights=d["A"])).unstack().round(3))
# SKU-shared variance of y
for o, d in g.groupby("origin"):
    m = d.groupby("sku_id")["y"].transform("mean"); cnt = d.groupby("sku_id")["y"].transform("size")
    within = np.average((d["y"]-m)**2 * cnt/(cnt-1).clip(lower=1), weights=d["A"])
    total = np.average((d["y"]-np.average(d["y"],weights=d["A"]))**2, weights=d["A"])
    # leave-one-out SKU mean of y and of lr12
    s_y = d.groupby("sku_id")["y"].transform("sum"); s_r = d.groupby("sku_id")["lr12"].transform("sum")
    loo_y = (s_y - d["y"])/(cnt-1).replace(0,np.nan); loo_r = (s_r - d["lr12"])/(cnt-1).replace(0,np.nan)
    ok = loo_y.notna()
    c = np.corrcoef(d["y"][ok], loo_y[ok])[0,1]
    X = np.column_stack([np.ones(ok.sum()), d["lr12"][ok], loo_r[ok]]); w = d["A"][ok].to_numpy(); yy = d["y"][ok].to_numpy()
    b = np.linalg.solve(X.T@(w[:,None]*X), X.T@(w*yy))
    print(o, "total var", round(total,4), "within-SKU var", round(within,4), "corr(y, loo SKU mean y)", round(c,3), "coef own lr12, sku-mates lr12:", b.round(3))
