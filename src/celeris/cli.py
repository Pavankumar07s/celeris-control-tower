"""Command line: ``python -m celeris <stage>``.

Stages run in the order of ``STAGE_ORDER`` (architecture: clean, demand, anomalies, features, backtest, forecast,
export). Only registered stages can be called; ``all`` runs every registered stage in order. To plug in a later stage,
write a function ``run_<stage>(paths: Paths) -> StageRecord`` in its sub-package (wrapping its body with
``celeris.quality.stagelog.run_stage``, which stores its checks, fix-log rows and outputs and republishes the quality
files) and add one ``Stage`` entry to ``STAGES``.
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path

from celeris.anomalies.stage import run_anomalies
from celeris.backtest.parallel import WORKERS_ENV
from celeris.backtest.stage import run_backtest
from celeris.cleaning.stage import run_clean
from celeris.config import RAW_FILES, STAGE_ORDER, Paths
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
    "export": Stage("export", run_export, "dashboard: write the data bundle to --bundle-dir (reads outputs/, writes nothing else)"),
}


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="celeris", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    registered = [name for name in STAGE_ORDER if name in STAGES]
    parser.add_argument("stage", choices=[*registered, "all"], help="stage to run ('all' = every registered stage in order)")
    parser.add_argument("--raw-dir", type=Path, default=Paths().raw_dir,
                        help="directory of the seven raw CSV files of the hackathon dataset (default: data/raw)")
    parser.add_argument("--out-dir", type=Path, default=Paths().outputs_dir, help="output root (clean/, quality/, ...)")
    parser.add_argument("--bundle-dir", type=Path, default=None,
                        help="where 'export' writes the dashboard data bundle (default: dashboard/public/data with the "
                             "default --out-dir, <out-dir>/dashboard_bundle with any other)")
    parser.add_argument("--workers", type=int, default=None,
                        help="worker processes for the backtest's structural fits (default: $CELERIS_WORKERS or 3; "
                             "1 runs everything in this process); outputs are identical for any value")
    return parser


def _shown(path: Path) -> str:
    """``path`` relative to the working directory when it lies inside it (shorter and free of local prefixes)."""
    try:
        return str(path.resolve().relative_to(Path.cwd().resolve()))
    except ValueError:
        return str(path)


def _missing_raw_data(raw_dir: Path, missing: Sequence[str]) -> str:
    """A short explanation instead of a traceback when the provided data is not where the pipeline expects it."""
    every = len(missing) == len(RAW_FILES)
    lines = [f"celeris: the raw data is {'missing' if every else 'incomplete'} in {_shown(raw_dir)}/",
             f"  missing{' (all seven)' if every else ''}: {', '.join(missing)}"]
    if not every:
        lines.append(f"  expected: the seven CSV files of the hackathon dataset ({', '.join(RAW_FILES)})")
    lines += ["  The dataset is distributed by the hackathon organisers and is not part of this repository. Copy the",
              "  seven files into data/raw/ (README, Quick start, step 2) or pass --raw-dir <folder>. Nothing was run."]
    return "\n".join(lines)


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    if args.workers is not None:
        os.environ[WORKERS_ENV] = str(max(args.workers, 1))
    paths = Paths(raw_dir=args.raw_dir, outputs_dir=args.out_dir, bundle_dir=args.bundle_dir)
    # Every stage hashes all seven raw files (celeris.quality.stagelog.run_stage), so check them before anything runs.
    missing = [name for name in RAW_FILES if not paths.raw(name).is_file()]
    if missing:
        print(_missing_raw_data(paths.raw_dir, missing), file=sys.stderr)
        return 2
    names = [name for name in STAGE_ORDER if name in STAGES] if args.stage == "all" else [args.stage]
    for name in names:
        started = time.perf_counter()
        STAGES[name].run(paths)
        target = paths.bundle_dir if name == "export" else paths.outputs_dir
        print(f"celeris {name}: done in {time.perf_counter() - started:.1f} s -> {target}")
    return 0
