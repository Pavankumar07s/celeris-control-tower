"""Reproducibility, idempotence, stage invalidation and raw-data immutability (T6, T10).

The default session covers the three core stages. ``second_run`` runs ``python -m celeris clean``, ``demand`` and
``anomalies`` one at a time in fresh processes (the CLI end to end); it must equal the in-process run of the same stages
(``pipeline_run``). Re-running ``demand`` on finished outputs reads an already overlaid grid and must reproduce its
outputs byte for byte while invalidating ``anomalies``; re-running ``clean`` invalidates both.

``test_all_twice_gives_identical_outputs`` (marker ``slow``, deselected by default; ``make test-all``) runs every stage
with ``python -m celeris all`` twice into temporary directories (about 10 minutes and 2.5 GB each) and compares every
output, the dashboard bundle included.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

import celeris.cli
from celeris.cli import STAGE_ORDER, STAGES, Stage, _parser, main
from celeris.config import DEFAULT_BUNDLE_DIR, RAW_FILES, Paths
from celeris.io import hash_files, sha256_file

CORE_STAGES = ("clean", "demand", "anomalies")
CLEAN_OWNED = {
    "clean/events_clean.csv", "clean/macro_clean.csv", "clean/price_table.csv", "clean/series_blocks.csv",
    "clean/sku_master_clean.csv", "clean/stockouts_clean.csv", "clean/train_clean.parquet",
    "quality/dedup_decisions.csv", "quality/macro_change_log.csv", "quality/stages/clean.json",
    "quality/stages/clean_fix_log.parquet",
}
ANOMALY_OWNED = {"anomalies/anomaly_register.csv", "anomalies/series_profile.csv", "quality/stages/anomalies.json",
                 "quality/stages/anomalies_fix_log.parquet"}


def _run_cli(stage: str, out_dir: Path, timeout: int = 600) -> None:
    done = subprocess.run([sys.executable, "-m", "celeris", stage, "--out-dir", str(out_dir)], capture_output=True, text=True,
                          timeout=timeout)
    assert done.returncode == 0, f"celeris {stage} failed:\n{done.stderr[-4000:]}"


def _output_hashes(root: Path) -> dict[str, str]:
    return {path.relative_to(root).as_posix(): sha256_file(path) for path in sorted(root.rglob("*")) if path.is_file()}


def _stages_run(quality: Path) -> list[str]:
    return [name for name in STAGE_ORDER if (quality / "stages" / f"{name}.json").exists()]


@pytest.fixture(scope="module")
def second_run(tmp_path_factory: pytest.TempPathFactory) -> Path:
    out_dir = tmp_path_factory.mktemp("second_run")
    for stage in CORE_STAGES:
        _run_cli(stage, out_dir)
    return out_dir


def test_clean_alone_writes_its_outputs_and_records(clean_run) -> None:
    assert set(_output_hashes(clean_run.paths.outputs_dir)) == CLEAN_OWNED | {
        "quality/dq_report.json", "quality/fix_log.parquet", "quality/manifest.json"}


def test_cli_stages_equal_the_in_process_run(pipeline_run, second_run: Path) -> None:
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
    stages_run = _stages_run(pipeline_run.quality)
    assert stages_run[: len(CORE_STAGES)] == list(CORE_STAGES)
    assert report["summary"]["stages_run"] == stages_run
    assert {check["stage"] for check in report["checks"]} == set(stages_run)
    assert report["summary"]["checks_failing_after"]["error"] == 0
    assert json.loads((pipeline_run.quality / "stages" / "demand.json").read_text())["outputs"]


def test_raw_inputs_are_unchanged(clean_run, pipeline_run) -> None:
    now = hash_files(Paths().raw(name) for name in RAW_FILES)
    assert now == clean_run.raw_hashes_before
    assert {entry["path"]: entry["sha256"] for entry in pipeline_run.manifest()["inputs"]} == now


def test_cli_registers_stages_in_architecture_order() -> None:
    assert list(STAGES) == [name for name in STAGE_ORDER if name in STAGES] == [
        "clean", "demand", "anomalies", "features", "backtest", "forecast", "export"]
    parser = _parser()
    assert parser.parse_args(["demand"]).stage == "demand"
    assert parser.parse_args(["all"]).stage == "all"
    with pytest.raises(SystemExit):
        parser.parse_args(["forecast-everything"])


def test_all_runs_every_stage_in_order_and_keeps_the_bundle_in_the_out_dir(tmp_path: Path, monkeypatch) -> None:
    """``all`` dispatches every registered stage in order; an isolated ``--out-dir`` keeps the export bundle inside it
    unless ``--bundle-dir`` says otherwise. The dashboard bundle is the default only for the default outputs root."""
    calls: list[tuple[str, Paths]] = []
    monkeypatch.setattr(celeris.cli, "STAGES", {name: Stage(name, lambda paths, name=name: calls.append((name, paths)), "")
                                                for name in STAGES})
    assert main(["all", "--out-dir", str(tmp_path)]) == 0
    assert [name for name, _ in calls] == list(STAGE_ORDER)
    assert {paths for _, paths in calls} == {Paths(outputs_dir=tmp_path, bundle_dir=tmp_path / "dashboard_bundle")}
    calls.clear()
    main(["export", "--out-dir", str(tmp_path), "--bundle-dir", str(tmp_path / "elsewhere")])
    assert calls == [("export", Paths(outputs_dir=tmp_path, bundle_dir=tmp_path / "elsewhere"))]
    assert Paths().bundle_dir == DEFAULT_BUNDLE_DIR
    assert Paths(outputs_dir=tmp_path).bundle_dir == tmp_path / "dashboard_bundle"


def test_a_stage_refuses_to_run_without_its_inputs(tmp_path: Path) -> None:
    from celeris.demand.stage import run_demand

    with pytest.raises((FileNotFoundError, RuntimeError)):
        run_demand(Paths(outputs_dir=tmp_path))


@pytest.mark.slow
def test_all_twice_gives_identical_outputs(tmp_path_factory: pytest.TempPathFactory) -> None:
    """``python -m celeris all`` end to end, twice into fresh directories: every output and every dashboard-bundle file
    is byte-identical, the bundle stays inside the out-dir, and the report and manifest cover every recorded stage."""
    runs = [tmp_path_factory.mktemp(f"all_run_{n}") for n in (1, 2)]
    for out_dir in runs:
        _run_cli("all", out_dir, timeout=3600)
    first = _output_hashes(runs[0])
    assert first == _output_hashes(runs[1])
    assert {"clean/test_grid.parquet", "anomalies/anomaly_register.csv", "features/macro_leadlag.csv",
            "backtest/summary.json", "forecast/submission.csv", "dashboard_bundle/meta.json",
            "dashboard_bundle/forecast.json"} <= set(first)
    quality = runs[0] / "quality"
    stages_run = _stages_run(quality)
    assert stages_run == [name for name in STAGE_ORDER if name != "export"]  # export keeps no stage record
    report = json.loads((quality / "dq_report.json").read_text())
    assert report["summary"]["stages_run"] == stages_run
    assert report["summary"]["checks_failing_after"]["error"] == 0
    manifest = json.loads((quality / "manifest.json").read_text())
    assert {entry["path"]: entry["sha256"] for entry in manifest["outputs"]} == {
        path: digest for path, digest in first.items() if path != "quality/manifest.json" and not path.startswith("dashboard_bundle/")}
