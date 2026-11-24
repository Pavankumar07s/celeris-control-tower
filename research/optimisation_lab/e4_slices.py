"""Slice the cached decision-origin predictions of two variants: python e4_slices.py <tagA> <tagB>"""
import sys
import numpy as np, pandas as pd
import lab
pd.set_option("display.width", 250); pd.set_option("display.max_rows", 300)
A, B = sys.argv[1], sys.argv[2]
meta = pd.read_parquet("decomp_frames.parquet", columns=["origin", "series_no", "month_idx", "size", "age", "level_source", "horizon_bucket"])
parts = []
for o in lab.DECISION:
    t = pd.read_parquet(lab.CACHE / f"targets_{o}.parquet")
    t["A"] = np.load(lab.CACHE / f"pred_{A}_{o}.npy"); t["B"] = np.load(lab.CACHE / f"pred_{B}_{o}.npy")
    parts.append(t)
f = pd.concat(parts, ignore_index=True)
f = f.merge(meta, on=["origin", "series_no", "month_idx"], how="left")
f = f[f["is_scored"]]
f["lost"] = f["final_lost_tail"]
def table(col):
    rows = []
    for (o, v), h in f.groupby(["origin", col], observed=True):
        a = h["actual"].sum(); tot = f.loc[f["origin"] == o, "actual"].sum()
        rows.append({"origin": lab.LABEL[o], col: v, "share": a / tot, "bias_A": (h["A"] - h["actual"]).sum() / a, "bias_B": (h["B"] - h["actual"]).sum() / a,
                     "wape_A": (h["A"] - h["actual"]).abs().sum() / a, "wape_B": (h["B"] - h["actual"]).abs().sum() / a,
                     "dbias_total_pp": ((h["B"] - h["A"]).sum() / tot) * 100})
    return pd.DataFrame(rows).round(4)
for col in sys.argv[3:] or ["powertrain_application", "lost", "size", "age", "level_source"]:
    print("\n==", col); print(table(col).to_string(index=False))
