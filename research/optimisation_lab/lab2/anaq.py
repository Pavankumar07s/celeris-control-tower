import sys
import numpy as np, pandas as pd
pd.set_option("display.width", 250); pd.set_option("display.max_columns", 30)
LABEL = {45: "2022-10", 50: "2023-03", 57: "2023-10", 62: "2024-03", 69: "2024-10", 72: "2025-01", 74: "2025-03"}
order = ["2022-10", "2023-10", "2024-10", "2025-03", "2023-03", "2024-03", "2025-01"]
f = pd.read_parquet(sys.argv[1]); f = f[f["is_scored"] & ~f["final_lost_tail"]].copy()
f["o"] = f["origin"].map(LABEL)
tot = f.groupby("o")["actual"].sum()
rows = []
for (o, ck), h in f.groupby(["o", "cycle_kind"]):
    a = h.actual.sum()
    ea = (h.A - h.actual).abs().sum(); eo = (h.oracle - h.actual).abs().sum(); es = (h.swap_all - h.actual).abs().sum()
    # phase errors: forecast 0 where actual > 0, or forecast > 0 where actual == 0
    miss = h.loc[(h.A < 0.5) & (h.actual > 0), "actual"].sum()
    spur = h.loc[(h.A >= 0.5) & (h.actual == 0), "A"].sum()
    rows.append({"o": o, "ck": ck, "share": a / tot[o], "wape": ea / a, "oracle": eo / a, "excess_pp_total": (ea - eo) / tot[o] * 100, "bias": (h.A - h.actual).sum() / a * 100,
                 "phase_err_share": (miss + spur) / ea, "zero_rows_with_demand": int(((h.A < 0.5) & (h.actual > 0)).sum()), "pos_rows_no_demand": int(((h.A >= 0.5) & (h.actual == 0)).sum()), "n": len(h)})
r = pd.DataFrame(rows)
for c in ("share", "wape", "oracle", "excess_pp_total", "bias", "phase_err_share", "zero_rows_with_demand", "pos_rows_no_demand"):
    print(c); print(r.pivot(index="ck", columns="o", values=c)[order].round(4))
