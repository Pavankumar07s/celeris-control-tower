"""Reproducibility, idempotence, stage invalidation and raw-data immutability across ``clean``, ``demand``,
``anomalies`` and ``all`` (T6, T10).

``second_run`` is ``python -m celeris all`` in a fresh process (the CLI end to end); it must equal the in-process run
of the stages one at a time (``pipeline_run``). Re-running ``demand`` on finished outputs reads an already overlaid grid
and must reproduce its outputs byte for byte while invalidating ``anomalies``; re-running ``clean`` invalidates both.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

from celeris.cli import STAGE_ORDER, STAGES, _parser
from celeris.config import RAW_FILES, Paths
from celeris.io import hash_files, sha256_file

CLEAN_OWNED = {
    "clean/events_clean.csv", "clean/macro_clean.csv", "clean/price_table.csv", "clean/series_blocks.csv",
    "clean/sku_master_clean.csv", "clean/stockouts_clean.csv", "clean/train_clean.parquet",
    "quality/dedup_decisions.csv", "quality/macro_change_log.csv", "quality/stages/clean.json",
    "quality/stages/clean_fix_log.parquet",
}
ANOMALY_OWNED = {"anomalies/anomaly_register.csv", "anomalies/series_profile.csv", "quality/stages/anomalies.json",
                 "quality/stages/anomalies_fix_log.parquet"}


def _run_cli(stage: str, out_dir: Path) -> None:
    subprocess.run([sys.executable, "-m", "celeris", stage, "--out-dir", str(out_dir)], check=True, capture_output=True, timeout=600)


def _output_hashes(root: Path) -> dict[str, str]:
    return {path.relative_to(root).as_posix(): sha256_file(path) for path in sorted(root.rglob("*")) if path.is_file()}


@pytest.fixture(scope="module")
def second_run(tmp_path_factory: pytest.TempPathFactory) -> Path:
    out_dir = tmp_path_factory.mktemp("second_run")
    _run_cli("all", out_dir)
    return out_dir


def test_clean_alone_writes_its_outputs_and_records(clean_run) -> None:
    assert set(_output_hashes(clean_run.paths.outputs_dir)) == CLEAN_OWNED | {
        "quality/dq_report.json", "quality/fix_log.parquet", "quality/manifest.json"}


def test_all_equals_the_stages_run_one_at_a_time(pipeline_run, second_run: Path) -> None:
    first = _output_hashes(pipeline_run.paths.outputs_dir)
    assert first == _output_hashes(second_run)
    assert {"clean/test_grid.parquet", "anomalies/anomaly_register.csv", "quality/stages/demand.json"} <= set(first)


def test_reruns_invalidate_later_stages_and_reproduce_outputs(second_run: Path) -> None:
    before = _output_hashes(second_run)
    _run_cli("demand", second_run)
    after_demand = _output_hashes(second_run)
    assert not ANOMALY_OWNED & set(after_demand)
    for path in set(after_demand) - {"quality/dq_report.json", "quality/fix_log.parquet", "quality/manifest.json", "clean/train_clean.parquet"}:
        assert after_demand[path] == before[path], path
    _run_cli("anomalies", second_run)
    assert _output_hashes(second_run) == before
    _run_cli("clean", second_run)
    after_clean = _output_hashes(second_run)
    assert set(after_clean) == CLEAN_OWNED | {"quality/dq_report.json", "quality/fix_log.parquet", "quality/manifest.json"}
    for path in CLEAN_OWNED - {"clean/train_clean.parquet"}:
        assert after_clean[path] == before[path], path


def test_manifest_lists_every_output_with_its_hash(pipeline_run) -> None:
    manifest = pipeline_run.manifest()
    outputs = {entry["path"]: entry["sha256"] for entry in manifest["outputs"]}
    actual = _output_hashes(pipeline_run.paths.outputs_dir)
    actual.pop("quality/manifest.json")
    assert outputs == actual
    assert {entry["path"] for entry in manifest["inputs"]} == set(RAW_FILES)


def test_report_merges_every_stage(pipeline_run) -> None:
    report = pipeline_run.report()
    assert report["summary"]["stages_run"] == ["clean", "demand", "anomalies"]
    stages = {check["stage"] for check in report["checks"]}
    assert stages == {"clean", "demand", "anomalies"}
    assert report["summary"]["checks_failing_after"]["error"] == 0
    assert json.loads((pipeline_run.quality / "stages" / "demand.json").read_text())["outputs"]


def test_raw_inputs_are_unchanged(clean_run, pipeline_run) -> None:
    now = hash_files(Paths().raw(name) for name in RAW_FILES)
    assert now == clean_run.raw_hashes_before
    assert {entry["path"]: entry["sha256"] for entry in pipeline_run.manifest()["inputs"]} == now


def test_cli_registers_stages_in_architecture_order() -> None:
    assert list(STAGES) == [name for name in STAGE_ORDER if name in STAGES] == ["clean", "demand", "anomalies"]
    parser = _parser()
    assert parser.parse_args(["demand"]).stage == "demand"
    assert parser.parse_args(["all"]).stage == "all"
    with pytest.raises(SystemExit):
        parser.parse_args(["forecast-everything"])


def test_a_stage_refuses_to_run_without_its_inputs(tmp_path: Path) -> None:
    from celeris.demand.stage import run_demand

    with pytest.raises((FileNotFoundError, RuntimeError)):
        run_demand(Paths(outputs_dir=tmp_path))
