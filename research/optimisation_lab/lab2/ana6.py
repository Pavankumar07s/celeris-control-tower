# Paths are relative to the repository (research/optimisation_lab/lab2 -> lab.py one level up). CELERIS_OUTPUTS
# points at another outputs/ tree; CELERIS_LAB_SNAPSHOT at the first submission's outputs, kept with the lab's working
# files (not included in the repository).
import os as _os
from pathlib import Path as _Path
LAB2_DIR = _Path(__file__).resolve().parent
LAB_DIR = LAB2_DIR.parent
REPO = LAB_DIR.parents[1]
OUT = _os.environ.get("CELERIS_OUTPUTS", str(REPO / "outputs"))
SNAP = _os.environ.get("CELERIS_LAB_SNAPSHOT", str(REPO / "research" / "scratch" / "snap"))
import sys
import numpy as np, pandas as pd
sys.path.insert(0, str(LAB_DIR))
import lab
A, B = sys.argv[1], sys.argv[2]
d = pd.read_parquet(LAB2_DIR / "diag_avg.parquet")
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
