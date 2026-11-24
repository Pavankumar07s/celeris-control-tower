"""Command line: ``python -m celeris <stage>``.

Stages run in the order of ``STAGE_ORDER`` (architecture: clean, demand, anomalies, features, backtest, forecast,
export). Only registered stages can be called; ``all`` runs every registered stage in order. To plug in a later stage,
write a function ``run_<stage>(paths: Paths) -> StageRecord`` in its sub-package (wrapping its body with
``celeris.quality.stagelog.run_stage``, which stores its checks, fix-log rows and outputs and republishes the quality
files) and add one ``Stage`` entry to ``STAGES``.
"""

from __future__ import annotations

import argparse
import time
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path

from celeris.anomalies.stage import run_anomalies
from celeris.backtest.stage import run_backtest
from celeris.cleaning.stage import run_clean
from celeris.config import STAGE_ORDER, Paths
from celeris.demand.stage import run_demand
from celeris.export.stage import run_export
from celeris.features.stage import run_features
from celeris.models.forecast_stage import run_forecast

__all__ = ["STAGES", "STAGE_ORDER", "Stage", "main"]


@dataclass(frozen=True)
class Stage:
    name: str
    run: Callable[[Paths], object]
    help: str


STAGES: dict[str, Stage] = {
    "clean": Stage("clean", run_clean, "part A: clean every raw file, write outputs/clean and outputs/quality"),
    "demand": Stage("demand", run_demand, "part B: unconstrained demand, ordering cycles, account events, test grid"),
    "anomalies": Stage("anomalies", run_anomalies, "part B: one-off orders, event masks, anomaly register, series profile"),
    "features": Stage("features", run_features, "modelling: feature tables, macro lead/lag analysis, feature catalogue"),
    "backtest": Stage("backtest", run_backtest, "modelling: rolling-origin backtest, model ladder, ensemble rule, uncertainty calibration"),
    "forecast": Stage("forecast", run_forecast, "modelling: fit as of 2026-10, forecast.parquet, submission.csv, quantiles, hierarchy checks"),
    "export": Stage("export", run_export, "dashboard: write the data bundle to dashboard/public/data (reads outputs/, writes nothing there)"),
}


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="celeris", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    registered = [name for name in STAGE_ORDER if name in STAGES]
    parser.add_argument("stage", choices=[*registered, "all"], help="stage to run ('all' = every registered stage in order)")
    parser.add_argument("--raw-dir", type=Path, default=Paths().raw_dir, help="directory of the raw CSV files")
    parser.add_argument("--out-dir", type=Path, default=Paths().outputs_dir, help="output root (clean/, quality/, ...)")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    paths = Paths(raw_dir=args.raw_dir, outputs_dir=args.out_dir)
    names = [name for name in STAGE_ORDER if name in STAGES] if args.stage == "all" else [args.stage]
    for name in names:
        started = time.perf_counter()
        STAGES[name].run(paths)
        print(f"celeris {name}: done in {time.perf_counter() - started:.1f} s -> {paths.outputs_dir}")
    return 0
