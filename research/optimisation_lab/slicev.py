"""Bias / WAPE by slice for two cached variants at given origins: python slicev.py A B col origins..."""
import sys
import numpy as np, pandas as pd
import lab
pd.set_option("display.width", 250); pd.set_option("display.max_rows", 400)
A, B, col = sys.argv[1], sys.argv[2], sys.argv[3]
origins = [int(x) for x in sys.argv[4:]]
rows = []
for o in origins:
    t = lab.targets_for(o)
    t["A"] = np.load(lab.CACHE / f"pred_{A}_{o}.npy"); t["B"] = np.load(lab.CACHE / f"pred_{B}_{o}.npy")
    t = t[t["is_scored"]]
    t["hb"] = pd.cut(t["horizon"], [0, 3, 6, 12, 19], labels=["01-03", "04-06", "07-12", "13-19"]).astype(str)
    t["lost"] = t["final_lost_tail"]; t["one_off"] = t["final_one_off"]
    tot = t["actual"].sum()
    for v, h in t.groupby(col, observed=True):
        a = h["actual"].sum()
        rows.append({"origin": lab.LABEL[o], col: v, "share": a / tot, "bias_A": (h.A - h.actual).sum() / max(a, 1e-9), "bias_B": (h.B - h.actual).sum() / max(a, 1e-9),
                     "wape_A": (h.A - h.actual).abs().sum() / max(a, 1e-9), "wape_B": (h.B - h.actual).abs().sum() / max(a, 1e-9), "contrib_A_pp": (h.A - h.actual).sum() / tot * 100, "contrib_B_pp": (h.B - h.actual).sum() / tot * 100})
print(pd.DataFrame(rows).round(4).to_string(index=False))
