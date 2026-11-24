import sys
from dataclasses import replace
import numpy as np
import lab
from celeris.models.structural import StructuralConfig, fit_structural
B = StructuralConfig()
o = int(sys.argv[1])
ctx = lab.context(o)
for cfg in (replace(B, n_iter=6), replace(B, n_iter=30), replace(B, n_iter=8, ev_profile=True), replace(B, n_iter=30, ev_profile=True)):
    f = fit_structural(lab.inputs(), ctx, cfg)
    print(cfg.n_iter, cfg.ev_profile, {fam[:5]: " ".join(f"{n}@{l}:{c:.3f}" for n, l, c in zip(d.indicators, d.lags, d.coef)) for fam, d in f.macro_paths.drivers.items()})
