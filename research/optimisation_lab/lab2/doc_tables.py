"""Markdown tables for docs/modelling.md from the regenerated outputs."""
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
import json
import numpy as np, pandas as pd
O = OUT
s = json.load(open(f"{O}/backtest/summary.json"))
m = pd.read_csv(f"{O}/backtest/metrics.csv")
DEC = ["2022-10", "2023-10", "2024-10", "2025-03"]
out = {}
# ladder
rows = ["| Model | 2022-10 WAPE / bias | 2023-10 WAPE / bias | 2024-10 WAPE / bias | 2025-03 WAPE / bias | Mean WAPE | Mean bias | Mean WAPE + abs(bias) | 2021-10 (stress) |", "|---|---|---|---|---|---|---|---|---|"]
for r in s["ladder"]:
    bo = r["by_origin"]
    cells = [f"{bo[o]['wape']:.4f} / {bo[o]['bias']*100:+.1f} %" for o in DEC]
    st = bo.get("2021-10")
    st = "n/a" if st is None or r["model"] == "gbm" else f"{st['wape']:.4f} / {st['bias']*100:+.1f} %"
    rows.append(f"| {r['model']} | " + " | ".join(cells) + f" | {r['wape']:.4f} | {r['bias']*100:+.1f} % | {r['score']:.4f} | {st} |")
out["ladder"] = "\n".join(rows)
# hierarchy
rows = ["| Model | series | SKU | family x region | family | region | total |", "|---|---|---|---|---|---|---|"]
mm = m[(m.origin == "mean") & (m.slice_type == "all")]
for model in [r["model"] for r in s["ladder"]]:
    x = mm[mm.model == model].set_index("level")["wape"]
    if x.empty: continue
    rows.append(f"| {model} | " + " | ".join(f"{x[l]:.4f}" for l in ("series", "sku", "family_region", "family", "region", "total")) + " |")
out["hierarchy"] = "\n".join(rows)
# ablations
comp = s["experiments"]["components"]["variants"]
labels = {"full": "none (full model)", "minus_macro": "SKU macro path", "minus_ev": "EV factor", "minus_season": "seasonality (region, channel, Thermal)",
          "minus_holidays": "moving holidays", "minus_one_off_uplift": "one-off uplift", "minus_eol_phaseout": "EOL phase-out", "minus_events": "window events (Helios, Orion)"}
rows = ["| Removed component | Mean WAPE | Mean bias | Mean WAPE + abs(bias) | Change vs full | Family x month WAPE |", "|---|---|---|---|---|---|"]
full = comp["full"]["mean_score"]
for k in ("full", "minus_macro", "minus_ev", "minus_season", "minus_holidays", "minus_one_off_uplift", "minus_eol_phaseout", "minus_events"):
    v = comp[k]
    ch = "" if k == "full" else f"{v['mean_score'] - full:+.4f}"
    rows.append(f"| {labels[k]} | {v['mean_wape']:.4f} | {v['mean_bias']*100:+.2f} % | {v['mean_score']:.4f} | {ch} | {v['mean_family_month_wape']:.4f} |")
out["ablations"] = "\n".join(rows)
# slices
def slice_table(st, name):
    a = m[(m.origin == "mean") & (m.model == "final") & (m.slice_type == st)]
    ser = a[a.level == "series"].set_index("slice_value"); fr = a[a.level == "family_region"].set_index("slice_value")
    rows = [f"| {name} | cells (4 folds) | WAPE (series x month) | bias | WAPE at family x region x month |", "|---|---|---|---|---|"]
    for v in ser.index:
        rows.append(f"| {v} | {int(ser.loc[v, 'n_cells']):,} | {ser.loc[v, 'wape']:.4f} | {ser.loc[v, 'bias']*100:+.1f} % | {fr.loc[v, 'wape']:.4f} |")
    return "\n".join(rows)
for st, name in (("family", "family"), ("region", "region"), ("horizon_bucket", "horizon bucket (months ahead)"), ("channel", "channel"), ("cycle_kind", "cycle kind (as of the origin)"), ("intermittency", "SBC intermittency class (as of the origin)"), ("subset", "with / without lost accounts and one-offs")):
    out[f"slice_{st}"] = slice_table(st, name)
# noise floor
rows = ["| Origin | final WAPE | oracle WAPE (in-hindsight level) | NB expected-absolute-deviation floor | final above oracle |", "|---|---|---|---|---|"]
for o, v in s["noise_floor"].items():
    rows.append(f"| {o} | {v['final_wape']:.4f} | {v['oracle_wape']:.4f} | {v['nb_floor_wape']:.4f} | {v['final_above_oracle']} |")
out["floor"] = "\n".join(rows)
# coverage
c = s["coverage"]
def covrow(name, d):
    mo, ht = d["monthly"], d["horizon_total"]
    return f"| {name} | {mo['series']['coverage_p10_p90']*100:.1f} % | {mo['sku']['coverage_p10_p90']*100:.1f} % | {mo['family_region']['coverage_p10_p90']*100:.1f} % | {mo['total']['coverage_p10_p90']*100:.1f} % | {ht['series']['coverage_p10_p90']*100:.1f} % | {ht['sku']['coverage_p10_p90']*100:.1f} % | {ht['family_region']['coverage_p10_p90']*100:.1f} % |"
rows = ["| Calibration / evaluation | rows (series x month) | SKU x month | family x region x month | total x month | series 19-month total | SKU 19-month total | family x region 19-month total |", "|---|---|---|---|---|---|---|---|",
        covrow("calibrated on all 4 folds (in-sample)", c["calibrated_on_all_decision_folds"])]
for o in ("2025-03", "2024-10", "2023-10", "2022-10"):
    rows.append(covrow(f"leave-one-origin-out: {o} held out", c["leave_one_origin_out"][o]))
rows.append(covrow("stress fold 2021-10 (never used)", c["stress_fold_2021_10"]))
out["coverage"] = "\n".join(rows)
unc = json.load(open(f"{O}/backtest/uncertainty_calibration.json"))
out["unc"] = f"noise a {unc['noise_a']}, b {min(unc['noise_b'].values()):.3f}..{max(unc['noise_b'].values()):.3f} {unc['noise_b']}, scale {unc['noise_scale']:.2f}, cv_level {unc['cv_level']}, cv_group {unc['cv_group']:.3f}, cv_common {unc['cv_common']:.3f}"
# experiments
e = s["experiments"]
out["experiments"] = json.dumps({k: {vv: (d["mean_score"], d["folds_better_than_default"]) for vv, d in v["variants"].items()} | {"targeted": v.get("targeted_rows")} for k, v in e.items()}, indent=0)
# forecast
agg = pd.read_csv(f"{O}/forecast/aggregates.csv")
tot = agg[agg.level == "total"].set_index("date")
out["forecast_total"] = tot[["forecast", "mean", "p10", "p90"]].to_string()
fam = agg[agg.level == "family"].groupby("node")["forecast"].sum(); reg = agg[agg.level == "region"].groupby("node")["forecast"].sum()
out["forecast_family"] = fam.to_string(); out["forecast_region"] = reg.to_string()
for k, v in out.items():
    print(f"<<<{k}>>>"); print(v)
