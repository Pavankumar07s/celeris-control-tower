import sys, time
from dataclasses import replace
import numpy as np, pandas as pd
import lab, levels
from celeris.models.structural import StructuralConfig, fit_structural, predict
pd.set_option("display.width", 220)
B = StructuralConfig()
rows = []
for o in lab.DECISION:
    ctx = lab.context(o); tg = lab.targets_for(o, ctx)
    prev = None
    for n in (6, 8, 10, 14, 20, 30):
        f = fit_structural(lab.inputs(), ctx, replace(B, n_iter=n))
        p = predict(f, tg)["mean"].to_numpy()
        m = lab.metrics(tg, p)
        chg = np.nan if prev is None else float(np.abs(p - prev).sum() / tg.loc[tg["is_scored"], "actual"].sum())
        prev = p
        rows.append({"origin": o, "variant": f"iter{n:02d}", **m, "ev": round(f.factors.ev_beta["EV"], 5), "ice": round(f.factors.ev_beta["ICE"], 5),
                     "lny": round(f.factors.lny_depth, 4), "am": round(f.macro_paths.damping, 4), "chg_vs_prev": round(chg, 5)})
        print(rows[-1], flush=True)
    del ctx
df = pd.DataFrame(rows); df.to_csv("iters.csv", index=False)
df = df.rename(columns={})
print(levels.report(df[["origin","variant","wape","bias","score","fam_month","total_month"]], base="iter06").round(5).to_string())
