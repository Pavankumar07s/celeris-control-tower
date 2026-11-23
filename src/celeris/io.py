"""Raw readers, deterministic writers and file hashing.

Raw files are always read as text with ``keep_default_na=False``: the literal region label ``NA`` (North America) must not
become a missing value (dossier K6: a default reader reports 952 blank regions instead of 745).
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Iterable, Mapping
from pathlib import Path
from typing import Any

import pandas as pd

_CHUNK = 1 << 20


def read_raw_csv(path: Path) -> pd.DataFrame:
    """Read a raw CSV with every column as text and no NA inference."""
    return pd.read_csv(path, dtype=str, keep_default_na=False)


def sha256_file(path: Path) -> str:
    """SHA-256 hex digest of a file, streamed in 1 MiB chunks."""
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(_CHUNK):
            digest.update(chunk)
    return digest.hexdigest()


def hash_files(paths: Iterable[Path]) -> dict[str, str]:
    """Map each file name to its SHA-256, in sorted order."""
    return {path.name: sha256_file(path) for path in sorted(paths)}


def write_parquet(frame: pd.DataFrame, path: Path) -> Path:
    """Write a parquet file with zstd compression, no index and a single row group (byte-stable across runs)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    frame.to_parquet(path, index=False, compression="zstd", row_group_size=max(len(frame), 1))
    return path


def write_csv(frame: pd.DataFrame, path: Path) -> Path:
    """Write a CSV with Unix line endings and no index."""
    path.parent.mkdir(parents=True, exist_ok=True)
    frame.to_csv(path, index=False, lineterminator="\n")
    return path


def write_json(payload: Mapping[str, Any], path: Path) -> Path:
    """Write pretty-printed UTF-8 JSON with a trailing newline (key order is the caller's insertion order)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False, allow_nan=False) + "\n", encoding="utf-8")
    return path
