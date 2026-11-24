"""Full-refit config sweep: python sweep_cfg.py <set> [origins...]"""
import sys, time
from dataclasses import replace
import numpy as np, pandas as pd
import lab
from celeris.models.structural import StructuralConfig, fit_structural, predict
pd.set_option("display.width", 220)
B = StructuralConfig(); M = B.macro
SETS = {
 "macro": {
   "base": B,
   "psd0.04": replace(B, macro=replace(M, prior_sd=0.04)), "psd0.08": replace(B, macro=replace(M, prior_sd=0.08)),
   "drivers2": replace(B, macro=replace(M, max_drivers=2)),
   "lagdecay0.3": replace(B, macro=replace(M, lag_decay=0.3)), "lagdecay0.8": replace(B, macro=replace(M, lag_decay=0.8)),
   "modelsd0.02": replace(B, macro=replace(M, model_sd=0.02)), "modelsd0.05": replace(B, macro=replace(M, model_sd=0.05)),
   "mingain4": replace(B, macro=replace(M, min_gain=4.0)), "mingain16": replace(B, macro=replace(M, min_gain=16.0)),
   "gamma0.9": replace(B, macro_gamma=0.9), "gamma1.1": replace(B, macro_gamma=1.1),
   "minmonths12": replace(B, macro=replace(M, min_months=12)), "minmonths30": replace(B, macro=replace(M, min_months=30)),
 },
 "other": {
   "base": B,
   "iter10": replace(B, n_iter=10), "season100": replace(B, season_prior_units=100.0), "season1000": replace(B, season_prior_units=1000.0),
   "tau5.5": replace(B, launch_tau=5.5), "tau3.8": replace(B, launch_tau=3.8), "young36": replace(B, young_months=36), "young12": replace(B, young_months=12),
   "n0_1": replace(B, young_n0=1.0), "n0_3": replace(B, young_n0=3.0), "ev_from24": replace(B, ev_from_month=24),
 },
}
def run(name, origins):
    variants = SETS[name]
    rows = []
    for o in origins:
        t0 = time.perf_counter()
        ctx = lab.context(o); tg = lab.targets_for(o, ctx)
        for v, cfg in variants.items():
            p = predict(fit_structural(lab.inputs(), ctx, cfg), tg)["mean"].to_numpy()
            rows.append({"origin": o, "variant": v, **lab.metrics(tg, p)})
        print(f"origin {lab.LABEL[o]} {time.perf_counter()-t0:.0f}s", flush=True)
        del ctx
    df = pd.DataFrame(rows)
    df.to_csv(lab.LAB / f"sweep_{name}_{'_'.join(map(str, origins))}.csv", index=False)
    import levels
    print(levels.report(df).round(5).to_string())
if __name__ == "__main__":
    run(sys.argv[1], tuple(int(x) for x in sys.argv[2:]) or lab.DECISION)
