"""Reproducibility, idempotence and raw-data immutability of the ``clean`` stage (T6, T10).

The second and third runs use the command line in a fresh process (``python -m celeris clean``), which also covers the
CLI end to end.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pytest

from celeris.cli import STAGE_ORDER, STAGES, _parser
from celeris.config import RAW_FILES, Paths
from celeris.io import hash_files, sha256_file


def _run_cli(out_dir: Path) -> None:
    subprocess.run([sys.executable, "-m", "celeris", "clean", "--out-dir", str(out_dir)], check=True, capture_output=True, timeout=300)


def _output_hashes(root: Path) -> dict[str, str]:
    return {path.relative_to(root).as_posix(): sha256_file(path) for path in sorted(root.rglob("*")) if path.is_file()}


@pytest.fixture(scope="module")
def second_run(tmp_path_factory: pytest.TempPathFactory) -> Path:
    out_dir = tmp_path_factory.mktemp("second_run")
    _run_cli(out_dir)
    return out_dir


def test_two_runs_give_identical_outputs(clean_run, second_run: Path) -> None:
    first = _output_hashes(clean_run.paths.outputs_dir)
    second = _output_hashes(second_run)
    assert first == second
    assert len(first) == 12


def test_rerun_into_the_same_directory_is_idempotent(second_run: Path) -> None:
    before = _output_hashes(second_run)
    _run_cli(second_run)
    assert _output_hashes(second_run) == before


def test_manifest_lists_every_output_with_its_hash(clean_run) -> None:
    manifest = clean_run.manifest()
    outputs = {entry["path"]: entry["sha256"] for entry in manifest["outputs"]}
    actual = _output_hashes(clean_run.paths.outputs_dir)
    actual.pop("quality/manifest.json")
    assert outputs == actual
    assert {entry["path"] for entry in manifest["inputs"]} == set(RAW_FILES)


def test_raw_inputs_are_unchanged(clean_run) -> None:
    now = hash_files(Paths().raw(name) for name in RAW_FILES)
    assert now == clean_run.raw_hashes_before
    assert {entry["path"]: entry["sha256"] for entry in clean_run.manifest()["inputs"]} == now


def test_cli_registers_stages_in_architecture_order() -> None:
    assert list(STAGES) == [name for name in STAGE_ORDER if name in STAGES]
    parser = _parser()
    assert parser.parse_args(["clean"]).stage == "clean"
    assert parser.parse_args(["all"]).stage == "all"
    with pytest.raises(SystemExit):
        parser.parse_args(["forecast-everything"])
