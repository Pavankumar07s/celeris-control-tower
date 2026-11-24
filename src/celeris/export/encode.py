"""Compact, deterministic JSON encoding for the dashboard bundle.

Numbers are rounded to a stated number of decimals and written in their shortest form (``3`` rather than ``3.0``);
missing values become ``null``. Labels are dictionary-encoded: a column becomes ``{"dict": [...], "codes": [...]}``
with codes in first-appearance order of the sorted unique values, so two runs give identical bytes.
"""

from __future__ import annotations

import json
import math
from collections.abc import Iterable, Mapping, Sequence
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

Json = Any


def num(value: object, decimals: int) -> int | float | None:
    """One number rounded to ``decimals`` places, as an int when integral; ``None`` for missing values."""
    if value is None or value is pd.NA:
        return None
    x = float(value)  # type: ignore[arg-type]
    if math.isnan(x):
        return None
    r = round(x, decimals)
    return int(r) if r == int(r) else r


def nums(values: Iterable[object], decimals: int) -> list[int | float | None]:
    """A column of numbers rounded to ``decimals`` places (see ``num``)."""
    if isinstance(values, (pd.Series, np.ndarray)):
        arr = pd.Series(values).astype("Float64").to_numpy(dtype=float, na_value=np.nan)
        rounded = np.round(arr, decimals)
        out: list[int | float | None] = []
        for r in rounded.tolist():
            if math.isnan(r):
                out.append(None)
            elif r == int(r):
                out.append(int(r))
            else:
                out.append(r)
        return out
    return [num(v, decimals) for v in values]


def ints(values: Iterable[object]) -> list[int | None]:
    """A column of integers; ``None`` for missing values."""
    arr = pd.Series(list(values) if not isinstance(values, (pd.Series, np.ndarray)) else values)
    return [None if pd.isna(v) else int(v) for v in arr.tolist()]


def texts(values: Iterable[object]) -> list[str | None]:
    """A column of strings; ``None`` for missing values."""
    return [None if (v is None or v is pd.NA or (isinstance(v, float) and math.isnan(v))) else str(v) for v in values]


def dictionary(values: Sequence[object] | pd.Series) -> dict[str, list[Any]]:
    """Dictionary-encode a label column: sorted unique labels and an int code per row (``-1`` for missing)."""
    labels = texts(values)
    vocab = sorted({v for v in labels if v is not None})
    index = {v: i for i, v in enumerate(vocab)}
    return {"dict": vocab, "codes": [-1 if v is None else index[v] for v in labels]}


def codes(values: Sequence[object] | pd.Series, vocab: Sequence[str]) -> list[int]:
    """Codes of ``values`` in a fixed vocabulary (``-1`` for missing); raises on an unknown label."""
    index = {v: i for i, v in enumerate(vocab)}
    out = []
    for v in texts(values):
        if v is None:
            out.append(-1)
        elif v in index:
            out.append(index[v])
        else:
            raise KeyError(f"label {v!r} is not in the vocabulary")
    return out


def records(frame: pd.DataFrame, decimals: Mapping[str, int] | None = None) -> dict[str, list[Any]]:
    """A frame as columns: numeric columns rounded (``decimals``, default 4), bools as 0/1, the rest as text."""
    decimals = decimals or {}
    out: dict[str, list[Any]] = {}
    for column in frame.columns:
        series = frame[column]
        if pd.api.types.is_bool_dtype(series):
            out[column] = [None if pd.isna(v) else int(bool(v)) for v in series.tolist()]
        elif pd.api.types.is_numeric_dtype(series):
            out[column] = nums(series, decimals.get(column, 4))
        else:
            out[column] = texts(series)
    return out


def dumps(payload: Json) -> str:
    """Compact JSON (no whitespace, UTF-8, NaN forbidden)."""
    return json.dumps(payload, separators=(",", ":"), ensure_ascii=False, allow_nan=False)


def write(payload: Json, path: Path) -> Path:
    """Write compact JSON with a trailing newline."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(dumps(payload) + "\n", encoding="utf-8")
    return path
