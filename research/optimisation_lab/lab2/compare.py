"""Scores of cached variants on all rows and excluding in-horizon lost-account rows: python compare.py base,conv,avg"""
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
names = sys.argv[1].split(",")
origins = [45, 57, 69, 74, 50, 62, 72, 33]
rows = []
for o in origins:
    t = lab.targets_for(o)
    for n in names:
        path = lab.CACHE / f"pred_{n}_{o}.npy"
        if not path.exists():
            continue
        p = np.load(path).astype(float)
        for view, mask in (("all", t.is_scored.to_numpy()), ("xlost", (t.is_scored & ~t.final_lost_tail).to_numpy())):
            a = t.actual.to_numpy()[mask]; f = p[mask]
            w = np.abs(f - a).sum() / a.sum(); b = (f - a).sum() / a.sum()
            rows.append({"origin": lab.LABEL[o], "o": o, "variant": n, "view": view, "wape": w, "bias": b, "score": w + abs(b)})
r = pd.DataFrame(rows)
pd.set_option("display.width", 250)
for view in ("all", "xlost"):
    s = r[r.view == view].pivot(index="origin", columns="variant", values="score")[names]
    s = s.loc[[lab.LABEL[o] for o in origins if lab.LABEL[o] in s.index]]
    dec = s.loc[["2022-10", "2023-10", "2024-10", "2025-03"]]
    con = s.loc[[x for x in ["2023-03", "2024-03", "2025-01"] if x in s.index]]
    s.loc["decision mean"] = dec.mean(); s.loc["confirm mean"] = con.mean()
    print(f"== score ({view})"); print(s.round(5))
    for n in names[1:]:
        dd = dec[n] - dec[names[0]]; cc = con[n] - con[names[0]]
        print(f"   {n} vs {names[0]}: decision wins {(dd < 0).sum()}/4 mean {dd.mean():+.5f}; confirm wins {(cc < 0).sum()}/{len(cc)} mean {cc.mean():+.5f}")
r.to_csv(LAB2_DIR / "compare_last.csv", index=False)
