"""E11 blends: python blend.py structural_variant gbm_variant"""
import sys
import numpy as np, pandas as pd
sys.path.insert(0, "/tmp/claude-1000/-home-pavan-Desktop-mks/6e1cc0fc-f52b-4777-9b57-6e118178c7b1/scratchpad/lab")
import lab
S, G = sys.argv[1], sys.argv[2]
order = [45, 57, 69, 74, 50, 62, 72]
rows = []
for o in order:
    t = lab.targets_for(o)
    s = np.load(lab.CACHE / f"pred_{S}_{o}.npy").astype(float); g = np.load(lab.CACHE / f"pred_{G}_{o}.npy").astype(float)
    h = t["horizon"].to_numpy()
    sched = {"structural": np.zeros(len(h)), "gbm": np.ones(len(h)), "A": np.select([h <= 3, h <= 6], [0.5, 0.25], 0.0), "B": 0.5 * np.maximum(0, 1 - (h - 1) / 12), "equal": np.full(len(h), 0.5)}
    for view, mask in (("all", t.is_scored.to_numpy()), ("xlost", (t.is_scored & ~t.final_lost_tail).to_numpy())):
        a = t.actual.to_numpy()[mask]
        for name, w in sched.items():
            f = ((1 - w) * s + w * g)[mask]
            wa = np.abs(f - a).sum() / a.sum(); b = (f - a).sum() / a.sum()
            rows.append({"o": lab.LABEL[o], "view": view, "schedule": name, "wape": wa, "bias": b, "score": wa + abs(b)})
r = pd.DataFrame(rows)
pd.set_option("display.width", 250)
labels = [lab.LABEL[o] for o in order]
for view in ("all", "xlost"):
    p = r[r.view == view].pivot(index="schedule", columns="o", values="score")[labels]
    d = p.sub(p.loc["structural"])
    print(f"== score ({view})"); print(p.round(5))
    print(f"== delta vs structural ({view})")
    d["dec_mean"] = d[labels[:4]].mean(axis=1); d["dec_wins"] = (d[labels[:4]] < 0).sum(axis=1)
    d["conf_mean"] = d[labels[4:]].mean(axis=1); d["conf_wins"] = (d[labels[4:]] < 0).sum(axis=1)
    print(d.round(5))
r.to_csv("/tmp/claude-1000/-home-pavan-Desktop-mks/6e1cc0fc-f52b-4777-9b57-6e118178c7b1/scratchpad/lab2/blend_last.csv", index=False)
