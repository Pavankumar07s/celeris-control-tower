"""``manifest.json``: SHA-256 and row counts of every input and output, plus software versions.

The manifest is the reproducibility record (architecture principle 4): two runs on the same raw files must give the
same output hashes, and the raw hashes must not change during a run.
"""

from __future__ import annotations

import platform
from collections.abc import Iterable, Mapping
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import pyarrow
import pyarrow.parquet as pq

from celeris import __version__
from celeris.io import sha256_file


def count_rows(path: Path) -> int:
    """Data rows of a CSV (header excluded) or parquet file; ``-1`` for other files."""
    if path.suffix == ".parquet":
        return int(pq.ParquetFile(path).metadata.num_rows)
    if path.suffix == ".csv":
        with path.open("rb") as handle:
            return sum(1 for _ in handle) - 1
    return -1


def file_entry(path: Path, root: Path, rows: int | None = None) -> dict[str, Any]:
    entry: dict[str, Any] = {"path": path.relative_to(root).as_posix(), "sha256": sha256_file(path), "bytes": path.stat().st_size}
    counted = count_rows(path) if rows is None else rows
    if counted >= 0:
        entry["rows"] = counted
    return entry


def build_manifest(inputs: Mapping[Path, int], outputs: Iterable[Path], raw_root: Path, out_root: Path) -> dict[str, Any]:
    """Manifest dictionary; ``inputs`` maps each raw file to its parsed row count."""
    return {
        "package": "celeris",
        "package_version": __version__,
        "software": {
            "python": platform.python_version(),
            "pandas": pd.__version__,
            "numpy": np.__version__,
            "pyarrow": pyarrow.__version__,
        },
        "inputs": [file_entry(path, raw_root, rows) for path, rows in sorted(inputs.items())],
        "outputs": [file_entry(path, out_root) for path in sorted(outputs)],
    }
