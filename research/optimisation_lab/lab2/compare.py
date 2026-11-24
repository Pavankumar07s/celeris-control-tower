"""Scores of cached variants on all rows and excluding in-horizon lost-account rows: python compare.py base,conv,avg"""
import sys
import numpy as np, pandas as pd
sys.path.insert(0, "/tmp/claude-1000/-home-pavan-Desktop-mks/6e1cc0fc-f52b-4777-9b57-6e118178c7b1/scratchpad/lab")
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
r.to_csv("/tmp/claude-1000/-home-pavan-Desktop-mks/6e1cc0fc-f52b-4777-9b57-6e118178c7b1/scratchpad/lab2/compare_last.csv", index=False)
