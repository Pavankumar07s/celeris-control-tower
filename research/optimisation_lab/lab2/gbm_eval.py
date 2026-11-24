"""E11 on a structural variant: GBM member trained as in the harness (inner origins every 3 months from 2021-10),
predictions for decision + confirmation origins. python gbm_eval.py variant"""
import sys, time
from pathlib import Path
import numpy as np, pandas as pd
sys.path.insert(0, "/tmp/claude-1000/-home-pavan-Desktop-mks/6e1cc0fc-f52b-4777-9b57-6e118178c7b1/scratchpad/lab")
import lab
from ev import V
from celeris.backtest.targets import backtest_targets
from celeris.models.gbm import feature_frame, inner_origins, predict_gbm, train_gbm
from celeris.models.structural import fit_structural, predict
name = sys.argv[1]
D = Path(__file__).resolve().parent / "gbmf"
scored = [45, 57, 69, 74, 50, 62, 72]
grid = sorted(set(inner_origins(74)) | set(scored))
for o in grid:
    path = D / f"{name}_{o}.parquet"
    if path.exists():
        continue
    t0 = time.perf_counter()
    ctx = lab.context(o)
    fit = fit_structural(lab.inputs(), ctx, V[name])
    tg = lab.targets_for(o, ctx)
    st = predict(fit, tg)
    feats = feature_frame(ctx, fit, tg, st)
    keep = ["origin", "series_no", "month_idx", "actual", "is_scored", "zero"]
    fr = pd.concat([tg[keep].reset_index(drop=True), feats.reset_index(drop=True)], axis=1).assign(structural=st["mean"].to_numpy(dtype="float32"))
    fr.to_parquet(path)
    print("frame", lab.LABEL.get(o, o), round(time.perf_counter() - t0), "s", lab.mem(), flush=True)
    del ctx, fit
frames = {o: pd.read_parquet(D / f"{name}_{o}.parquet") for o in grid}
for o in scored:
    out = lab.CACHE / f"pred_gbm_{name}_{o}.npy"
    if out.exists():
        continue
    t0 = time.perf_counter()
    inner = [t for t in inner_origins(o) if t in frames]
    train = pd.concat([frames[t][frames[t]["month_idx"] <= o] for t in inner], ignore_index=True)
    model = train_gbm(train)
    np.save(out, predict_gbm(model, frames[o]).astype("float32"))
    print("gbm", lab.LABEL[o], len(inner), "inner", model.n_rows, "rows", round(time.perf_counter() - t0), "s", flush=True)
