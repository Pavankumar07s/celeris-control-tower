import sys
import numpy as np, pandas as pd
sys.path.insert(0, "/tmp/claude-1000/-home-pavan-Desktop-mks/6e1cc0fc-f52b-4777-9b57-6e118178c7b1/scratchpad/lab")
import lab
A, B = sys.argv[1], sys.argv[2]
d = pd.read_parquet("/tmp/claude-1000/-home-pavan-Desktop-mks/6e1cc0fc-f52b-4777-9b57-6e118178c7b1/scratchpad/lab2/diag_avg.parquet")
for o in (int(x) for x in sys.argv[3:]):
    ctx = lab.context(o)
    pl = ctx.state.panel.product_launch
    t = d[(d.origin == o)].copy()
    t["pA"] = np.load(lab.CACHE / f"pred_{A}_{o}.npy")[t.index - t.index.min()] if False else None
    tg = lab.targets_for(o)
    tg["pA"] = np.load(lab.CACHE / f"pred_{A}_{o}.npy"); tg["pB"] = np.load(lab.CACHE / f"pred_{B}_{o}.npy")
    tg = tg[tg.is_scored & ~tg.final_lost_tail]
    tg = tg.merge(t[["series_no", "month_idx", "level_source"]], on=["series_no", "month_idx"], how="left")
    tg["pl"] = pl[tg.series_no.to_numpy()]
    tot = tg.actual.sum()
    g = tg.groupby(["level_source", "pl", "sku_tier"])
    r = pd.DataFrame({"share%": g.actual.sum() / tot * 100, "biasA%": (g.pA.sum() - g.actual.sum()) / g.actual.sum() * 100, "biasB%": (g.pB.sum() - g.actual.sum()) / g.actual.sum() * 100, "dpp": (g.pB.sum() - g.pA.sum()) / tot * 100})
    print(lab.LABEL[o]); print(r.round(2))
    del ctx
