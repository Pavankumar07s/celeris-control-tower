"""Shared fixtures: one in-process run of the ``clean`` stage per test session, plus the raw inputs."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pandas as pd
import pytest

from celeris.cleaning.stage import run_clean
from celeris.config import PROJECT_ROOT, RAW_FILES, Paths
from celeris.io import hash_files, read_raw_csv

RESEARCH = PROJECT_ROOT / "research" / "scratch"


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
