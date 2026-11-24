"""Compare variants against a base on decision / confirmation / stress origins: python report.py base variant..."""
import sys
import numpy as np, pandas as pd
import lab
pd.set_option("display.width", 250)
r = pd.read_csv(lab.LAB / "results.csv").drop_duplicates(["variant", "origin"], keep="last")
base = sys.argv[1]
for name in sys.argv[2:]:
    for label, os_ in (("decision", lab.DECISION), ("confirm", lab.CONFIRM), ("stress", (lab.STRESS,))):
        a = r[(r.variant == base) & r.origin.isin(os_)].set_index("origin")
        b = r[(r.variant == name) & r.origin.isin(os_)].set_index("origin")
        common = sorted(set(a.index) & set(b.index))
        if not common:
            continue
        d = b.loc[common, "score"] - a.loc[common, "score"]
        per = "  ".join(f"{lab.LABEL[o]} {b.loc[o,'wape']:.5f}/{b.loc[o,'bias']*100:+.2f}%/{b.loc[o,'score']:.5f} ({d[o]:+.5f})" for o in common)
        print(f"{name:>22} {label:>8}: mean score {b.loc[common,'score'].mean():.5f} vs {a.loc[common,'score'].mean():.5f} delta {d.mean():+.5f} wins {int((d<0).sum())}/{len(d)} | wape {b.loc[common,'wape'].mean():.5f} vs {a.loc[common,'wape'].mean():.5f} | fam {b.loc[common,'fam_month'].mean():.4f} vs {a.loc[common,'fam_month'].mean():.4f}")
        print(" " * 33 + per)
