"""New soft-cap fit (frozen settled rows) must reproduce the old one bit for bit."""
import sys, time
import numpy as np
sys.path.insert(0, "/tmp/claude-1000/-home-pavan-Desktop-mks/6e1cc0fc-f52b-4777-9b57-6e118178c7b1/scratchpad/lab")
sys.path.insert(0, "/tmp/claude-1000/-home-pavan-Desktop-mks/6e1cc0fc-f52b-4777-9b57-6e118178c7b1/scratchpad/lab2")
import lab, old_cap
import celeris.features.macro as M
from celeris.models.structural import StructuralConfig, fit_structural, predict
new_fn = M._soft_cap_fit
for o in (int(x) for x in sys.argv[1:]):
    ctx = lab.context(o); tg = lab.targets_for(o, ctx)
    res = {}
    for name, fn in (("new", new_fn), ("old", old_cap._soft_cap_fit)):
        M._soft_cap_fit = fn
        t0 = time.perf_counter()
        f = fit_structural(lab.inputs(), ctx, StructuralConfig())
        res[name] = (predict(f, tg)["mean"].to_numpy(), f.macro_paths.u.copy(), len(f.trace), time.perf_counter() - t0)
    print(lab.LABEL[o], "identical preds:", np.array_equal(res["new"][0], res["old"][0]), "identical u:", np.array_equal(res["new"][1], res["old"][1]),
          "iters", res["new"][2], res["old"][2], "time new/old", round(res["new"][3], 1), round(res["old"][3], 1), flush=True)
    M._soft_cap_fit = new_fn
