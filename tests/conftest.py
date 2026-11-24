"""Shared fixtures: one in-process run of the ``clean`` stage per test session, one of ``demand`` + ``anomalies`` on a
copy of its outputs, and the raw inputs."""

from __future__ import annotations

import json
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pandas as pd
import pytest

from celeris.anomalies.stage import run_anomalies
from celeris.cleaning.stage import run_clean
from celeris.config import PROJECT_ROOT, RAW_FILES, Paths
from celeris.demand.stage import run_demand
from celeris.io import hash_files, read_raw_csv

# Reference outputs of the forensic investigations (research/*.md), copied from their working files so that the
# cross-check tests run in a fresh clone; provenance and SHA-256 in tests/fixtures/reference/README.md.
RESEARCH = PROJECT_ROOT / "tests" / "fixtures" / "reference"


@dataclass(frozen=True)
class CleanRun:
    """Outputs of one ``clean`` run, loaded once."""

    paths: Paths
    raw_hashes_before: dict[str, str]

    @property
    def clean(self) -> Path:
        return self.paths.clean_dir

    @property
    def quality(self) -> Path:
        return self.paths.quality_dir

    def csv(self, name: str) -> pd.DataFrame:
        return pd.read_csv(self.clean / name, keep_default_na=False, na_values=[""])

    def report(self) -> dict[str, Any]:
        return json.loads((self.quality / "dq_report.json").read_text())

    def manifest(self) -> dict[str, Any]:
        return json.loads((self.quality / "manifest.json").read_text())


@pytest.fixture(scope="session")
def clean_run(tmp_path_factory: pytest.TempPathFactory) -> CleanRun:
    paths = Paths(outputs_dir=tmp_path_factory.mktemp("outputs"))
    before = hash_files(paths.raw(name) for name in RAW_FILES)
    run_clean(paths)
    return CleanRun(paths=paths, raw_hashes_before=before)


@pytest.fixture(scope="session")
def pipeline_run(clean_run: CleanRun, tmp_path_factory: pytest.TempPathFactory) -> CleanRun:
    """``demand`` and ``anomalies`` run in process on a copy of the clean outputs (part-A tests keep their own copy)."""
    root = tmp_path_factory.mktemp("pipeline") / "outputs"
    shutil.copytree(clean_run.paths.outputs_dir, root)
    paths = Paths(outputs_dir=root)
    run_demand(paths)
    run_anomalies(paths)
    return CleanRun(paths=paths, raw_hashes_before=clean_run.raw_hashes_before)


@pytest.fixture(scope="session")
def cells(pipeline_run: CleanRun) -> pd.DataFrame:
    """``train_clean.parquet`` with the demand and anomaly columns."""
    return pd.read_parquet(pipeline_run.clean / "train_clean.parquet")


@pytest.fixture(scope="session")
def test_grid(pipeline_run: CleanRun) -> pd.DataFrame:
    return pd.read_parquet(pipeline_run.clean / "test_grid.parquet")


@pytest.fixture(scope="session")
def register(pipeline_run: CleanRun) -> pd.DataFrame:
    return pd.read_csv(pipeline_run.paths.anomalies_dir / "anomaly_register.csv", keep_default_na=False, na_values=[""])


@pytest.fixture(scope="session")
def train_clean(clean_run: CleanRun) -> pd.DataFrame:
    return pd.read_parquet(clean_run.clean / "train_clean.parquet")


@pytest.fixture(scope="session")
def fix_log(clean_run: CleanRun) -> pd.DataFrame:
    return pd.read_parquet(clean_run.quality / "fix_log.parquet")


@pytest.fixture(scope="session")
def raw_train() -> pd.DataFrame:
    return read_raw_csv(Paths().raw("train.csv"))


@pytest.fixture(scope="session")
def raw_master() -> pd.DataFrame:
    return read_raw_csv(Paths().raw("sku_master.csv"))
