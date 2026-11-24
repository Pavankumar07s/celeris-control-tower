"""As-of evidence for the launch-cohort prior: in-sample ratio of demand to prior x accumulated factors for recently
launched series, and the tier split of the smear. python prior_check.py variant origins..."""
import sys
import numpy as np, pandas as pd
sys.path.insert(0, "/tmp/claude-1000/-home-pavan-Desktop-mks/6e1cc0fc-f52b-4777-9b57-6e118178c7b1/scratchpad/lab")
import lab
from ev import V
from celeris.models.structural import fit_structural, _prior_design
from celeris.demand.cycles import accumulation_weights
from celeris.models import structural as S
name = sys.argv[1]
for o in (int(x) for x in sys.argv[2:]):
    ctx = lab.context(o)
    fit = fit_structural(lab.inputs(), ctx, V[name])
    p, cyc = ctx.state.panel, ctx.state.cycles
    n = p.n_series
    cells = ctx.level_cells
    i, t = np.nonzero(cells)
    acc = S.accumulate(fit.g[:n], cyc.accum_span[i, t], cyc.carry_weight[i, t], i, t)
    w = ctx.weight[i, t]; d = ctx.demand[i, t]
    uni = fit.universe.iloc[:n]
    launch = uni["launch_idx"].to_numpy(); start = uni["start_idx"].to_numpy(); tier = uni["sku_tier"].to_numpy()
    prior = fit.prior_level[:n]
    age_launch = o - launch
    out = {}
    for lo, hi in ((6, 24), (12, 36), (24, 48), (6, 48)):
        sel = (age_launch >= lo) & (age_launch < hi) & (start >= launch) & (tier == "tail") & (fit.level_source[:n] != "lost_account")
        m = sel[i] & (t > o - 24)
        out[f"launch{lo}-{hi}"] = round(float((w * d)[m].sum() / (w * prior[i] * acc)[m].sum()), 3)
        out[f"n{lo}-{hi}"] = int(sel.sum())
    src = fit.level_source[:n]
    mature = src == "window"
    lvl = fit.level[:n]
    for tr in ("core", "tail"):
        mm = mature & (tier == tr)
        out[f"mature_{tr}_level/prior"] = round(float(lvl[mm].sum() / prior[mm].sum()), 3)
    print(lab.LABEL[o], out, flush=True)
    del ctx, fit
