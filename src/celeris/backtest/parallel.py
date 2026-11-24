"""Worker processes for the backtest stage.

The backtest stage fits the structural model about 100 times (one base fit at each of the 15 grid origins, and about
17 experiment variants that need a full refit at each of the 5 scored origins); a converged fit takes 5-15 s. Every
fit is a pure function of the shared inputs, an origin and a configuration, so they can run in parallel without
changing any result:

- ``workers <= 1``: nothing here is used; ``run_backtest_folds`` runs every fit in the calling process, in grid order;
- ``workers >= 2``: a pool of worker processes (``forkserver``: a worker inherits nothing but the inputs it is given at
  start-up) runs the base fits of the inner origins (training data of the GBM) and the experiment variants that need a
  full refit, while the calling process fits the base model of each scored origin (it needs the fit object for the
  baselines, the oracle, the cheap level-stage variants and the diagnostics). Results are collected by key and
  consumed in the serial order, so every output is byte-identical whatever the number of workers.

After the folds, the stage runs the four leave-one-origin-out calibrations of the uncertainty model and the metrics of
each fold in a second pool (``celeris.backtest.stage.calibrate_folds``), for the same reason: each is a pure function of
its rows.

Memory: a worker holds one copy of the inputs and one origin's context and fit, about 0.6 GB at the latest origins; with
three workers the stage peaks at about 2.8 GB in total (proportional set size of all its processes), against 1.5 GB in
one process.
"""

from __future__ import annotations

import multiprocessing
import os
from collections.abc import Callable
from concurrent.futures import ProcessPoolExecutor
from dataclasses import dataclass

import numpy as np
import pandas as pd

from celeris.backtest.targets import backtest_targets
from celeris.cleaning.dates import month_label
from celeris.models.context import ModelInputs, OriginContext, origin_context
from celeris.models.gbm import feature_frame
from celeris.models.quantiles import TOTAL_LEVELS, calibrate, coverage
from celeris.models.structural import StructuralConfig, StructuralFit, fit_structural, predict

WORKERS_ENV = "CELERIS_WORKERS"
DEFAULT_WORKERS = 3  # 11 GB machine with a few GB free: three workers keep the stage under about 3 GB in total
GBM_KEEP = ["origin", "series_no", "month_idx", "actual", "is_scored", "zero"]


def default_workers() -> int:
    """Worker processes for the backtest: ``$CELERIS_WORKERS`` if set, else 3 (at most the number of CPUs - 1)."""
    value = os.environ.get(WORKERS_ENV, "").strip()
    if value:
        return max(int(value), 1)
    return max(min(DEFAULT_WORKERS, (os.cpu_count() or 1) - 1), 1)


@dataclass
class OriginBase:
    """The base fit of one origin and what every origin contributes to the GBM training data."""

    ctx: OriginContext
    fit: StructuralFit
    targets: pd.DataFrame
    structural: pd.DataFrame
    gbm_frame: pd.DataFrame


def origin_base(inputs: ModelInputs, final: pd.DataFrame, origin: int, config: StructuralConfig) -> OriginBase:
    """Context, base structural fit, target rows, structural forecast and GBM rows of one origin."""
    ctx = origin_context(inputs, origin)
    fit = fit_structural(inputs, ctx, config)
    targets = backtest_targets(ctx, final)
    targets["is_young"] = np.isin(fit.level_source[targets["u"].to_numpy()], ["young_blend", "cold_start"])
    targets["months_to_eol"] = fit.universe["eol_idx"].to_numpy()[targets["u"].to_numpy()] - targets["month_idx"].to_numpy()
    structural = predict(fit, targets)
    features = feature_frame(ctx, fit, targets, structural)
    gbm_frame = pd.concat([targets[GBM_KEEP].reset_index(drop=True), features.reset_index(drop=True)], axis=1).assign(
        structural=structural["mean"].to_numpy(dtype="float32")
    )
    return OriginBase(ctx, fit, targets, structural, gbm_frame)


def drivers_rows(origin: int, fit: StructuralFit) -> list[dict]:
    """Rows of ``macro_drivers_by_origin.csv`` for one origin's fit."""
    rows = []
    if fit.macro_paths is None:
        return rows
    for family, d in fit.macro_paths.drivers.items():
        for k, name in enumerate(d.indicators):
            rows.append(
                {
                    "origin": month_label(origin),
                    "product_family": family,
                    "rank": k + 1,
                    "indicator": name,
                    "lag": d.lags[k],
                    "lag_posterior_max": round(float(d.lag_posterior[k].max()), 3),
                    "coef_per_sd": round(float(d.coef[k]), 4),
                    "deviance_gain": d.gains[k],
                }
            )
    return rows


def variant_mean(inputs: ModelInputs, ctx: OriginContext, targets: pd.DataFrame, config: StructuralConfig) -> np.ndarray:
    """Order means of a full refit with another configuration on the same target rows."""
    return predict(fit_structural(inputs, ctx, config), targets)["mean"].to_numpy()


def held_out_coverage(train: pd.DataFrame, test: pd.DataFrame, noise_a: float, noise_b: dict[str, float]) -> dict:
    """Coverage of the ``test`` rows under uncertainty components calibrated on the ``train`` rows (leave one origin
    out; a task of its own because each calibration takes about 50 s)."""
    unc = calibrate(train, noise_a, noise_b)
    return {"monthly": coverage(test, unc), "horizon_total": coverage(test, unc, TOTAL_LEVELS)}


# ------------------------------------------------------------------------------------------------ worker side -----

_STATE: dict = {}


def _init_worker(inputs: ModelInputs, final: pd.DataFrame) -> None:
    _STATE.clear()
    _STATE.update(inputs=inputs, final=final, origin=None)


def _context(origin: int) -> tuple[OriginContext, pd.DataFrame]:
    """The worker's context and target rows of ``origin`` (the last origin's are kept; tasks come in origin order)."""
    if _STATE["origin"] != origin:
        _STATE.pop("ctx", None)
        _STATE.pop("targets", None)
        ctx = origin_context(_STATE["inputs"], origin)
        _STATE.update(origin=origin, ctx=ctx, targets=backtest_targets(ctx, _STATE["final"]))
    return _STATE["ctx"], _STATE["targets"]


def inner_task(origin: int, config: StructuralConfig) -> tuple[pd.DataFrame, list[dict]]:
    """Inner (unscored) origin: the GBM rows and the macro-driver rows of its base fit."""
    base = origin_base(_STATE["inputs"], _STATE["final"], origin, config)
    return base.gbm_frame, drivers_rows(origin, base.fit)


def variant_task(origin: int, config: StructuralConfig) -> np.ndarray:
    """Scored origin: order means of one experiment variant that needs a full refit."""
    ctx, targets = _context(origin)
    return variant_mean(_STATE["inputs"], ctx, targets, config)


def worker_pool(workers: int, initializer: Callable[..., None] | None = None, initargs: tuple = ()) -> ProcessPoolExecutor | None:
    """A ``forkserver`` pool of ``workers`` processes (a worker inherits nothing but ``initargs``), or ``None`` for
    ``workers <= 1``."""
    if workers <= 1:
        return None
    context = multiprocessing.get_context("forkserver")
    return ProcessPoolExecutor(max_workers=workers, mp_context=context, initializer=initializer, initargs=initargs)


def make_pool(workers: int, inputs: ModelInputs, final: pd.DataFrame) -> ProcessPoolExecutor | None:
    """A pool of ``workers`` processes holding the inputs for ``inner_task`` / ``variant_task``, or ``None``."""
    return worker_pool(workers, _init_worker, (inputs, final))


__all__ = [
    "DEFAULT_WORKERS",
    "WORKERS_ENV",
    "OriginBase",
    "default_workers",
    "drivers_rows",
    "held_out_coverage",
    "inner_task",
    "make_pool",
    "origin_base",
    "variant_mean",
    "variant_task",
    "worker_pool",
]
