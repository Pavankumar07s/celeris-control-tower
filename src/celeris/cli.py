"""Command line: ``python -m celeris <stage>``.

Stages run in the order of ``STAGE_ORDER`` (architecture: clean, demand, anomalies, features, backtest, forecast,
export). Only registered stages can be called; ``all`` runs every registered stage in order. To plug in a later stage,
write a function ``run_<stage>(paths: Paths) -> object`` in its sub-package and add one ``Stage`` entry to ``STAGES``.
"""

from __future__ import annotations

import argparse
import time
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path

from celeris.cleaning.stage import run_clean
from celeris.config import Paths

STAGE_ORDER: tuple[str, ...] = ("clean", "demand", "anomalies", "features", "backtest", "forecast", "export")


@dataclass(frozen=True)
class Stage:
    name: str
    run: Callable[[Paths], object]
    help: str


STAGES: dict[str, Stage] = {
    "clean": Stage("clean", run_clean, "part A: clean every raw file, write outputs/clean and outputs/quality"),
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
