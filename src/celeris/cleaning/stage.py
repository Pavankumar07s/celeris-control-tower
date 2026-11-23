"""The ``clean`` stage: part A of the pipeline end to end (dossier 7.1 steps 0-6, 11, 12).

Step 0 hashes every raw file, reads it as text and, at the end, asserts the hashes are unchanged. The stage writes
``outputs/clean/*`` and ``outputs/quality/*`` (contracts in ``docs/architecture.md``) and fails on any broken forensic
assertion or any ``error`` check that does not pass after cleaning.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import pandas as pd

from celeris.cleaning import events as events_step
from celeris.cleaning import macro as macro_step
from celeris.cleaning import master as master_step
from celeris.cleaning import oracle as oracle_step
from celeris.cleaning import profile as profile_step
from celeris.cleaning import stockouts as stockouts_step
from celeris.cleaning.keys import vocabularies
from celeris.cleaning.train import TrainCleaning, clean_train
from celeris.config import RAW_FILES, Paths
from celeris.io import hash_files, read_raw_csv, write_csv, write_json, write_parquet
from celeris.quality.checks import CheckLog, expect
from celeris.quality.fixlog import assemble_fix_log
from celeris.quality.manifest import build_manifest
from celeris.quality.report import build_report


@dataclass(frozen=True)
class CleanOutputs:
    """Paths written by the stage and the report summary."""

    files: tuple[Path, ...]
    summary: dict


def run_clean(paths: Paths) -> CleanOutputs:
    """Run part A and write its outputs under ``paths.outputs_dir``."""
    raw_paths = [paths.raw(name) for name in RAW_FILES]
    hashes_before = hash_files(raw_paths)
    frames = {name: read_raw_csv(paths.raw(name)) for name in RAW_FILES}
    expect("train.raw_rows", len(frames["train.csv"]))
    expect("macro.raw_rows", len(frames["macro_indicators.csv"]))
    master, test = frames["sku_master.csv"], frames["test.csv"]
    vocab = vocabularies(test)

    bu = master_step.correct_business_units(master)
    lifecycle = master_step.lifecycle_months(master)
    train = clean_train(frames["train.csv"], master, bu, lifecycle, vocab)
    master_clean = master_step.build_master_clean(master, bu, train.blocks, set(test["SKU_ID"]))
    macro = macro_step.clean_macro(frames["macro_indicators.csv"])
    events = events_step.clean_events(frames["events_calendar.csv"], vocab, set(master["Product_Family"]))
    stockouts = stockouts_step.clean_stockouts(frames["inventory_stockouts.csv"], vocab, set(master["SKU_ID"]))

    checks = CheckLog()
    checks.extend(train.checks)
    checks.extend(master_step.master_checks(master, master_clean, lifecycle, _records_before_master_launch(train.cells, master_clean)))
    checks.extend(macro_step.macro_checks(frames["macro_indicators.csv"], macro))
    checks.extend(events_step.event_checks(frames["events_calendar.csv"], events))
    checks.extend(stockouts_step.stockout_checks(stockouts))
    checks.extend(oracle_step.oracle_checks(train.cells, stockouts, train.decisions))
    checks.extend(profile_step.test_checks(test, master, master_clean, train.cells, vocab))
    checks.extend(profile_step.sample_checks(frames["sample_submission.csv"], test))

    fix_log = assemble_fix_log([train.fix_log, master_step.master_fix_log(master_clean, master), macro.changes])
    clean_dir, quality_dir = paths.clean_dir, paths.quality_dir
    written = [
        write_parquet(train.train_clean, clean_dir / "train_clean.parquet"),
        write_csv(train.price_table, clean_dir / "price_table.csv"),
        write_csv(train.blocks, clean_dir / "series_blocks.csv"),
        write_csv(macro.table, clean_dir / "macro_clean.csv"),
        write_csv(master_clean, clean_dir / "sku_master_clean.csv"),
        write_csv(events, clean_dir / "events_clean.csv"),
        write_csv(stockouts, clean_dir / "stockouts_clean.csv"),
        write_parquet(fix_log, quality_dir / "fix_log.parquet"),
        write_csv(train.decisions.drop(columns="rec_num"), quality_dir / "dedup_decisions.csv"),
        write_csv(macro.changes, quality_dir / "macro_change_log.csv"),
    ]
    rows_raw = {name: len(frame) for name, frame in frames.items()}
    rows_clean = {
        "train.csv": len(train.cells),
        "sku_master.csv": len(master_clean),
        "macro_indicators.csv": len(macro.table),
        "events_calendar.csv": len(events),
        "inventory_stockouts.csv": len(stockouts),
    }
    headline = _headline(train)
    report = build_report(checks, fix_log, rows_raw, rows_clean, headline)
    written.append(write_json(report, quality_dir / "dq_report.json"))
    manifest = build_manifest(
        {path: rows_raw[path.name] for path in raw_paths}, written, paths.raw_dir, paths.outputs_dir
    )
    written.append(write_json(manifest, quality_dir / "manifest.json"))
    if hash_files(raw_paths) != hashes_before:
        raise AssertionError("a raw input file changed during the run")
    return CleanOutputs(files=tuple(written), summary=report["summary"])


def _records_before_master_launch(cells: pd.DataFrame, master_clean: pd.DataFrame) -> int:
    launch = cells["sku_id"].map(master_clean.set_index("sku_id")["launch_date"])
    return int(((cells["row_status"] == "observed") & (cells["date"] < launch)).sum())


def _headline(train: TrainCleaning) -> dict:
    cells = train.cells
    return {
        "train_rows_raw": int(len(train.decisions) + (cells["row_status"] == "observed").sum()),
        "train_records": int((cells["row_status"] == "observed").sum()),
        "train_grid_cells": int(len(cells)),
        "train_missing_rows": int((cells["row_status"] == "missing_row").sum()),
        "train_numeric_states": {str(k): int(v) for k, v in cells["numeric_state"].value_counts().sort_index().items()},
        **{f"train_{key}": value for key, value in train.totals.items()},
    }
