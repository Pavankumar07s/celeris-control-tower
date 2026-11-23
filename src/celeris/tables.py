"""Column contract of ``outputs/clean/train_clean.parquet`` across stages (docs/architecture.md).

``clean`` writes the part-A columns; ``demand`` rewrites the file with the part-A columns (``units_sold``,
``revenue_usd`` and ``fix_rule`` amended by the stock-out overlay) plus its own; ``anomalies`` adds its columns. A
stage reads exactly the columns of the stages before it and writes those plus its own, so re-running a stage drops
the columns of later stages (whose records ``celeris.quality.stagelog`` invalidates at the same time).
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd
import pyarrow.parquet as pq

from celeris.cleaning.train import TRAIN_CLEAN_COLUMNS
from celeris.config import Paths
from celeris.io import write_parquet

DEMAND_COLUMNS: tuple[str, ...] = (
    "demand_uc",
    "demand_uc_method",
    "is_stockout_listed",
    "is_stockout_inferred",
    "stockout_suspect",
    "backorder_in",
    "backorder_out",
    "lost_units",
    "cycle_pattern",
    "cycle_kind",
    "on_phase",
    "accum_span",
    "carry_weight",
    "is_structural_zero",
    "is_lost_account",
    "demand_filled",
    "is_imputed",
)
ANOMALY_COLUMNS: tuple[str, ...] = (
    "expected_demand",
    "is_one_off",
    "event_tags",
    "train_mask",
    "level_mask",
    "train_weight",
)
COLUMNS_BY_STAGE: dict[str, tuple[str, ...]] = {
    "clean": TRAIN_CLEAN_COLUMNS,
    "demand": DEMAND_COLUMNS,
    "anomalies": ANOMALY_COLUMNS,
}


def train_clean_path(paths: Paths) -> Path:
    return paths.clean_dir / "train_clean.parquet"


def columns_through(stage: str) -> tuple[str, ...]:
    """Columns written by ``stage`` and every stage before it, in contract order."""
    out: list[str] = []
    for name, columns in COLUMNS_BY_STAGE.items():
        out.extend(columns)
        if name == stage:
            return tuple(out)
    raise KeyError(f"stage {stage!r} does not write train_clean.parquet")


def read_train_clean(paths: Paths, through: str) -> pd.DataFrame:
    """The grid with the columns of ``through`` and earlier stages; raises if one of them has not run."""
    path = train_clean_path(paths)
    if not path.exists():
        raise FileNotFoundError(f"{path} is missing: run the clean stage first")
    wanted = list(columns_through(through))
    present = set(pq.read_schema(path).names)
    missing = [column for column in wanted if column not in present]
    if missing:
        raise RuntimeError(f"train_clean.parquet lacks {missing[:3]}...: run the stages before this one first")
    return pd.read_parquet(path, columns=wanted)


def write_train_clean(paths: Paths, frame: pd.DataFrame, stage: str) -> Path:
    """Write the grid with exactly the columns of ``stage`` and earlier stages."""
    expected = columns_through(stage)
    if tuple(frame.columns) != expected:
        raise AssertionError(f"train_clean columns for stage {stage!r} do not follow the contract")
    return write_parquet(frame, train_clean_path(paths))
