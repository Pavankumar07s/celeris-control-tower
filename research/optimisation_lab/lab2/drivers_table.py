import json
import pandas as pd
O = "/home/pavan/Desktop/mks-modelopt/outputs"
m = pd.read_csv(f"{O}/backtest/macro_drivers_by_origin.csv")
inv = {"ism_manufacturing_pmi": "pmi", "auto_production_yoy_pct": "auto", "vehicle_inventory_days": "inv", "raw_material_cost_index": "raw", "new_vehicle_orders_index": "ord", "industrial_util_rate_pct": "util", "fuel_price_index": "fuel"}
s = json.load(open(f"{O}/backtest/summary.json"))
f = json.load(open(f"{O}/forecast/structural_factors.json")) if __import__("os").path.exists(f"{O}/forecast/structural_factors.json") else None
origins = ["2021-10", "2022-10", "2023-10", "2024-10", "2025-03"]
fams = sorted(m.product_family.unique())
print("| Family | " + " | ".join(origins + ["2026-10 (final)"]) + " |")
print("|---" * (len(origins) + 2) + "|")
for fam in fams:
    cells = []
    for o in origins:
        sets = s["diagnostics_by_origin"][o]["family_driver_sets"][fam]
        txt = sets[0]["drivers"] + (f" ({sets[0]['weight']:.2f})" if sets[0]["weight"] < 0.995 else "")
        cells.append(txt)
    if f:
        sets = f["family_macro_driver_sets"][fam]
        cells.append(sets[0]["drivers"] + (f" ({sets[0]['weight']:.2f})" if sets[0]["weight"] < 0.995 else ""))
    print(f"| {fam} | " + " | ".join(cells) + " |")
for o in origins:
    print(o, {fam: v for fam, v in s["diagnostics_by_origin"][o]["family_driver_sets"].items() if len(v) > 1})
if f:
    print("final", {fam: v for fam, v in f["family_macro_driver_sets"].items() if len(v) > 1})
