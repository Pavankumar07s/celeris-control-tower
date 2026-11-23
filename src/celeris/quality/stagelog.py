"""Per-stage quality records and the aggregator that publishes ``dq_report.json``, ``fix_log.parquet`` and
``manifest.json``.

Every stage hands back a ``StageRecord`` (its checks, its fix-log rows, the files it wrote, headline figures and
cleaned row counts). ``run_stage`` stores the record under ``outputs/quality/stages/`` (``<stage>.json`` and
``<stage>_fix_log.parquet``) and then ``publish`` merges every stored record, in stage order, into the three published
quality files. So a later stage adds checks, fix-log rows and outputs without touching the code of an earlier one.

Determinism and idempotence: records and published files contain no wall-clock value and are written in a fixed
order. Running a stage first invalidates every later stage (its record and the outputs it listed are deleted): those
outputs were computed from files the stage is about to rewrite. Running ``all`` and running the stages one at a time
in order therefore give byte-identical outputs, and re-running a stage reproduces its own outputs exactly.
"""

from __future__ import annotations

import json
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import pandas as pd

from celeris.config import RAW_FILES, STAGE_ORDER, Paths
from celeris.io import hash_files, write_json, write_parquet
from celeris.quality.checks import Check
from celeris.quality.fixlog import FIX_LOG_COLUMNS, assemble_fix_log
from celeris.quality.manifest import build_manifest
from celeris.quality.report import build_report

RECORD_VERSION = "1.0"


@dataclass(frozen=True)
class StageRecord:
    """What one stage contributes to the published quality files.

    ``outputs`` are the data files the stage wrote (absolute paths under ``outputs_dir``); ``rows_raw`` is given by the
    stage that reads the raw files first (``clean``); ``rows_clean`` maps an input file to the rows of its cleaned
    counterpart; ``headline`` holds the stage's summary figures for the report.
    """

    stage: str
    checks: Sequence[Check]
    fix_log: pd.DataFrame
    outputs: Sequence[Path]
    headline: Mapping[str, Any] = field(default_factory=dict)
    rows_raw: Mapping[str, int] = field(default_factory=dict)
    rows_clean: Mapping[str, int] = field(default_factory=dict)


def stages_dir(paths: Paths) -> Path:
    return paths.quality_dir / "stages"


def _record_paths(paths: Paths, stage: str) -> tuple[Path, Path]:
    return stages_dir(paths) / f"{stage}.json", stages_dir(paths) / f"{stage}_fix_log.parquet"


def empty_fix_log() -> pd.DataFrame:
    """A fix-log part with the contract columns and no rows."""
    return pd.DataFrame({column: pd.Series(dtype="str") for column in FIX_LOG_COLUMNS}).astype({"step": "int64"})


def write_stage_record(paths: Paths, record: StageRecord) -> None:
    """Store a stage record (JSON + fix-log parquet) for the aggregator."""
    if record.stage not in STAGE_ORDER:
        raise ValueError(f"unknown stage {record.stage!r}")
    json_path, log_path = _record_paths(paths, record.stage)
    payload = {
        "record_version": RECORD_VERSION,
        "stage": record.stage,
        "outputs": sorted(path.relative_to(paths.outputs_dir).as_posix() for path in record.outputs),
        "rows_raw": {name: int(n) for name, n in record.rows_raw.items()},
        "rows_clean": {name: int(n) for name, n in record.rows_clean.items()},
        "headline": dict(record.headline),
        "checks": [{"stage": record.stage, **check.to_dict()} for check in record.checks],
    }
    write_json(payload, json_path)
    write_parquet(assemble_fix_log([record.fix_log]) if len(record.fix_log) else empty_fix_log(), log_path)


def load_stage_records(paths: Paths) -> list[tuple[dict[str, Any], pd.DataFrame]]:
    """Every stored record in stage order, with its fix-log part."""
    out = []
    for stage in STAGE_ORDER:
        json_path, log_path = _record_paths(paths, stage)
        if json_path.exists():
            out.append((json.loads(json_path.read_text(encoding="utf-8")), pd.read_parquet(log_path)))
    return out


def _listed_outputs(paths: Paths, stages: Sequence[str]) -> set[str]:
    out: set[str] = set()
    for stage in stages:
        json_path, _ = _record_paths(paths, stage)
        if json_path.exists():
            out.update(json.loads(json_path.read_text(encoding="utf-8"))["outputs"])
    return out


def invalidate_downstream(paths: Paths, stage: str) -> list[Path]:
    """Delete the records and listed outputs of every stage after ``stage``; return the deleted paths.

    A file that ``stage`` or an earlier stage also lists (``train_clean.parquet``, which later stages extend with
    columns) is kept: the stage that rewrites it drops the columns of later stages.
    """
    position = STAGE_ORDER.index(stage)
    protected = _listed_outputs(paths, STAGE_ORDER[: position + 1])
    deleted: list[Path] = []
    for later in STAGE_ORDER[position + 1 :]:
        json_path, log_path = _record_paths(paths, later)
        if not json_path.exists():
            continue
        payload = json.loads(json_path.read_text(encoding="utf-8"))
        for relative in payload["outputs"]:
            target = paths.outputs_dir / relative
            if relative not in protected and target.exists():
                target.unlink()
                deleted.append(target)
        for path in (json_path, log_path):
            if path.exists():
                path.unlink()
                deleted.append(path)
    return deleted


def publish(paths: Paths) -> dict[str, Any]:
    """Merge every stored record into ``fix_log.parquet``, ``dq_report.json`` and ``manifest.json``; return the report."""
    records = load_stage_records(paths)
    if not records or records[0][0]["stage"] != "clean":
        raise RuntimeError("the clean stage has not been run: no quality record for 'clean'")
    payloads = [payload for payload, _ in records]
    fix_log = assemble_fix_log([log for _, log in records])
    rows_raw: dict[str, int] = {}
    rows_clean: dict[str, int] = {}
    for payload in payloads:
        rows_raw.update(payload["rows_raw"])
        rows_clean.update(payload["rows_clean"])
    checks = [check for payload in payloads for check in payload["checks"]]
    headline = dict(payloads[0]["headline"])
    headline["stages_run"] = [payload["stage"] for payload in payloads]
    headline["stages"] = {payload["stage"]: payload["headline"] for payload in payloads[1:]}
    quality = paths.quality_dir
    written = [write_parquet(fix_log, quality / "fix_log.parquet")]
    report = build_report(checks, fix_log, rows_raw, rows_clean, headline)
    written.append(write_json(report, quality / "dq_report.json"))
    outputs = [paths.outputs_dir / relative for relative in sorted({rel for payload in payloads for rel in payload["outputs"]})]
    records_written = [path for payload in payloads for path in _record_paths(paths, payload["stage"])]
    raw_paths = {paths.raw(name): rows_raw[name] for name in RAW_FILES}
    manifest = build_manifest(raw_paths, [*outputs, *records_written, *written], paths.raw_dir, paths.outputs_dir)
    write_json(manifest, quality / "manifest.json")
    return report


def run_stage(paths: Paths, stage: str, body: Callable[[Paths], StageRecord]) -> StageRecord:
    """Run one stage: invalidate later stages, run ``body``, store its record, publish, and assert raw immutability."""
    raw_paths = [paths.raw(name) for name in RAW_FILES]
    hashes_before = hash_files(raw_paths)
    invalidate_downstream(paths, stage)
    record = body(paths)
    if record.stage != stage:
        raise ValueError(f"stage {stage!r} returned a record for {record.stage!r}")
    write_stage_record(paths, record)
    publish(paths)
    if hash_files(raw_paths) != hashes_before:
        raise AssertionError("a raw input file changed during the run")
    return record
