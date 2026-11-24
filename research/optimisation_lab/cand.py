"""Evaluate candidate combinations: python cand.py <out-tag> origins..."""
import sys, time
from dataclasses import replace
import numpy as np, pandas as pd
import lab, bma, levels
from celeris.models.structural import StructuralConfig, fit_structural, predict
pd.set_option("display.width", 220)
B = StructuralConfig()
C = replace(B, n_iter=8, ev_profile=True, holiday_profile=True)
VARIANTS = {"base": (B, False), "C1_conv": (C, False), "C2_bma": (B, True), "C1C2": (C, True)}
tag = sys.argv[1]
rows = []
for o in (int(x) for x in sys.argv[2:]):
    ctx = lab.context(o); tg = lab.targets_for(o, ctx)
    for name, (cfg, use) in VARIANTS.items():
        bma.enable() if use else bma.disable()
        t0 = time.perf_counter()
        f = fit_structural(lab.inputs(), ctx, cfg)
        p = predict(f, tg)["mean"].to_numpy()
        np.save(lab.CACHE / f"pred_{tag}_{name}_{o}.npy", p.astype("float32"))
        m = lab.metrics(tg, p)
        rows.append({"origin": o, "variant": name, **m, "ev": f.factors.ev_beta["EV"], "lny": f.factors.lny_depth})
        print(lab.LABEL[o], name, lab.fmt(m), f"EV {f.factors.ev_beta['EV']:.4f} LNY {f.factors.lny_depth:.3f}", f"{time.perf_counter()-t0:.0f}s", flush=True)
        if use:
            print("    ", {fam[:5]: [(" + ".join(f"{n}@{l}" for n, l in zip(a[0], a[1])), round(a[2], 2)) for a in alts] for fam, alts in bma.LAST["sets"].items()})
    bma.disable()
    del ctx
df = pd.DataFrame(rows); df.to_csv(lab.LAB / f"cand_{tag}.csv", index=False)
print(levels.report(df).round(5).to_string())
