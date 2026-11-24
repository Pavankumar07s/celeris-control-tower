"""Before (shipping snapshot) vs after (worktree outputs/backtest) for the final model."""
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
import json, sys
import numpy as np, pandas as pd
pd.set_option("display.width", 250); pd.set_option("display.max_rows", 200)
B = f"{SNAP}/backtest_shipping"
A = f"{OUT}/backtest"
master = pd.read_csv(f"{OUT}/clean/sku_master_clean.csv", usecols=["sku_id", "powertrain_application"])
DEC = ["2022-10", "2023-10", "2024-10", "2025-03"]
def ladder(path):
    s = json.load(open(f"{path}/summary.json"))
    row = [r for r in s["ladder"] if r["model"] == "final"][0]
    return s, row
sb, rb = ladder(B); sa, ra = ladder(A)
print("== final model per origin: before | after (wape / bias / score / fam-month)")
for o in [*DEC, "2021-10"]:
    b, a = rb["by_origin"][o], ra["by_origin"][o]
    print(f"{o}: {b['wape']:.5f} / {b['bias']*100:+.2f}% / {b['score']:.5f} / {b['family_month_wape']:.4f}  |  {a['wape']:.5f} / {a['bias']*100:+.2f}% / {a['score']:.5f} / {a['family_month_wape']:.4f}")
mb, ma = rb["mean_over_decision_folds"], ra["mean_over_decision_folds"]
print("mean:", {k: (mb[k], ma[k]) for k in mb})
print("ladder means after:", {r["model"]: r["score"] for r in sa["ladder"]})
print("ladder by origin after (wape/bias):")
for r in sa["ladder"]:
    print(" ", r["model"], {o: (v["wape"], round(v["bias"] * 100, 2)) for o, v in r["by_origin"].items()}, "mean", r["wape"], r["bias"], r["score"])
def slices(path):
    m = pd.read_csv(f"{path}/metrics.csv")
    m = m[(m.model == "final") & (m.level == "series")]
    return m
mb_, ma_ = slices(B), slices(A)
for st in ("family", "region", "channel", "horizon_bucket", "cycle_kind", "subset"):
    x = mb_[(mb_.origin == "mean") & (mb_.slice_type == st)].set_index("slice_value")[["wape", "bias"]]
    y = ma_[(ma_.origin == "mean") & (ma_.slice_type == st)].set_index("slice_value")[["wape", "bias"]]
    t = x.join(y, lsuffix="_before", rsuffix="_after")
    t["bias_before"] *= 100; t["bias_after"] *= 100
    print(f"== {st} (mean of decision folds)"); print(t.round(4))
print("== subset per origin (after): excl_lost_accounts")
z = ma_[(ma_.slice_type == "subset")].pivot(index="origin", columns="slice_value", values="wape")
zb = ma_[(ma_.slice_type == "subset")].pivot(index="origin", columns="slice_value", values="bias") * 100
print(z.round(5)); print(zb.round(2))
z0 = mb_[(mb_.slice_type == "subset")].pivot(index="origin", columns="slice_value", values="wape"); zb0 = mb_[(mb_.slice_type == "subset")].pivot(index="origin", columns="slice_value", values="bias") * 100
print("before:"); print(z0.round(5)); print(zb0.round(2))
# powertrain from predictions
def pt(path):
    p = pd.read_parquet(f"{path}/predictions.parquet", columns=["origin", "model", "sku_id", "actual", "pred", "is_scored"])
    p = p[(p.model == "final") & p.is_scored].merge(master, on="sku_id")
    g = p.assign(e=(p.pred - p.actual), ae=(p.pred - p.actual).abs()).groupby(["origin", "powertrain_application"])[["actual", "e", "ae"]].sum()
    g["wape"] = g.ae / g.actual; g["bias"] = g.e / g.actual * 100
    return g[["wape", "bias"]]
pb, pa = pt(B), pt(A)
t = pb.join(pa, lsuffix="_before", rsuffix="_after").reset_index()
print("== powertrain by origin"); print(t.round(4).to_string(index=False))
t2 = t[t.origin.isin(DEC)].groupby("powertrain_application")[["wape_before", "bias_before", "wape_after", "bias_after"]].mean()
print("== powertrain mean of decision folds"); print(t2.round(4))
print("== coverage")
for name, s in (("before", sb), ("after", sa)):
    c = s["coverage"]["calibrated_on_all_decision_folds"]
    print(name, "monthly", {k: v["coverage_p10_p90"] for k, v in c["monthly"].items()}, "horizon_total", {k: v["coverage_p10_p90"] for k, v in c["horizon_total"].items()})
    for o, v in s["coverage"]["leave_one_origin_out"].items():
        print("   LOO", o, {k: x["coverage_p10_p90"] for k, x in v["monthly"].items()}, {k: x["coverage_p10_p90"] for k, x in v["horizon_total"].items()})
    st = s["coverage"]["stress_fold_2021_10"]
    print("   stress", {k: x["coverage_p10_p90"] for k, x in st["monthly"].items()}, {k: x["coverage_p10_p90"] for k, x in st["horizon_total"].items()})
print("== calibration after:", json.load(open(f"{A}/uncertainty_calibration.json")))
print("== experiments after"); 
for k, v in sa["experiments"].items():
    print(k, {vv: (d["mean_score"], d["folds_better_than_default"]) for vv, d in v["variants"].items()}, "gain", v["gain_vs_default"], v.get("targeted_rows"))
print("== ensemble", sa["ensemble"])
print("== noise floor", sa["noise_floor"], sa["noise_moments"])
print("== diagnostics after", {o: (d["factors"]["ev_beta"], d["factors"]["lny_depth"], d["factors"]["ramadan_depth"], d.get("backfit_iterations"), d["factors"]["aftermarket_damping"]) for o, d in sa["diagnostics_by_origin"].items()})
for o, d in sa["diagnostics_by_origin"].items():
    print(o, d["family_driver_sets"])
