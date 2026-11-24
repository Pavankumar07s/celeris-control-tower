"""Experiment helpers for the optimisation round (scratch, not part of the package)."""

from __future__ import annotations

import os
import pickle
import time
from dataclasses import replace
from pathlib import Path

import numpy as np
import pandas as pd

from celeris.backtest.harness import oracle_floor
from celeris.backtest.metrics import aggregate_wape, bias, score, wape
from celeris.backtest.targets import FINAL_COLUMNS, backtest_targets
from celeris.config import Paths
from celeris.models.context import load_model_inputs, origin_context
from celeris.models.structural import StructuralConfig, fit_structural, predict
from celeris.tables import read_train_clean

LAB = Path(__file__).resolve().parent
CACHE = LAB / "cache"
CACHE.mkdir(exist_ok=True)
DECISION = (45, 57, 69, 74)
CONFIRM = (50, 62, 72)
STRESS = 33
LABEL = {33: "2021-10", 45: "2022-10", 50: "2023-03", 57: "2023-10", 62: "2024-03", 69: "2024-10", 72: "2025-01", 74: "2025-03", 93: "2026-10"}

_INPUTS = None
_FINAL = None


def inputs():
    global _INPUTS
    if _INPUTS is None:
        _INPUTS = load_model_inputs(Paths())
    return _INPUTS


def final():
    global _FINAL
    if _FINAL is None:
        _FINAL = read_train_clean(Paths(), "anomalies").loc[:, list(FINAL_COLUMNS)]
    return _FINAL


def context(origin: int):
    """As-of context (not cached on disk: /tmp is RAM-backed and a context builds in about 2 s)."""
    return origin_context(inputs(), origin)


def targets_for(origin: int, ctx=None) -> pd.DataFrame:
    path = CACHE / f"targets_{origin}.parquet"
    if path.exists():
        return pd.read_parquet(path)
    ctx = ctx or context(origin)
    t = backtest_targets(ctx, final())
    t.to_parquet(path)
    return t


def fit(origin: int, config: StructuralConfig | None = None, ctx=None):
    ctx = ctx or context(origin)
    return fit_structural(inputs(), ctx, config or StructuralConfig())


def metrics(frame: pd.DataFrame, pred: np.ndarray) -> dict:
    s = frame["is_scored"].to_numpy()
    a = frame["actual"].to_numpy()[s]
    f = np.asarray(pred)[s]
    part = frame[s].assign(pred=f)
    return {
        "wape": wape(a, f),
        "bias": bias(a, f),
        "score": score(a, f),
        "fam_month": aggregate_wape(part, ("product_family",)),
        "total_month": aggregate_wape(part, ()),
    }


def fmt(m: dict) -> str:
    return f"{m['wape']:.5f} / {m['bias']*100:+.2f}% / {m['score']:.5f} (fam {m['fam_month']:.4f})"


def run_variant(origins, config: StructuralConfig, log=print) -> dict:
    out = {}
    for o in origins:
        t0 = time.perf_counter()
        ctx = context(o)
        tg = targets_for(o, ctx)
        f = fit_structural(inputs(), ctx, config)
        p = predict(f, tg)["mean"].to_numpy()
        out[o] = metrics(tg, p)
        log(f"  {LABEL.get(o, o)}: {fmt(out[o])}  [{time.perf_counter()-t0:.0f}s]")
    return out


def summarise(res: dict, base: dict | None = None) -> str:
    os_ = sorted(res)
    mean = np.mean([res[o]["score"] for o in os_])
    s = f"mean score {mean:.5f}"
    if base:
        d = [res[o]["score"] - base[o]["score"] for o in os_]
        s += f" | delta {np.mean(d):+.5f}, better in {sum(x < 0 for x in d)}/{len(d)}: " + ", ".join(f"{LABEL[o]} {x:+.5f}" for o, x in zip(os_, d))
    return s


def mem() -> str:
    try:
        with open(f"/proc/{os.getpid()}/status") as fh:
            for line in fh:
                if line.startswith("VmHWM"):
                    return line.strip()
    except OSError:
        pass
    return ""
