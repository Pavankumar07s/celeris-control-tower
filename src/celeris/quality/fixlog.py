"""Cell-level lineage: one row per changed cell (architecture principle 6).

Columns: ``file``, ``step`` (dossier 7.1 step number), ``rule`` (dossier rule id), ``record_id`` and the keys
(``date``, ``sku_id``, ``region``), ``column``, ``method``, ``raw_value`` (text as read), ``before`` (value entering the
rule), ``after`` (value written), ``evidence`` (compact JSON with the witness values that justify the change).

``method`` says how certain the new value is:

- ``exact``: recovered exactly (an arithmetic identity or an independent witness pins it);
- ``approximate``: bounded error (India pack-of-10 units, +-5);
- ``unknown``: the true value is not recoverable and is left missing (ERP blanks with an order);
- ``format``: the value is unchanged, only its text form (labels, date formats, thousands separators);
- ``derived``: filled from reference data (blank family, description, region);
- ``convention``: a placeholder replaced by the value in force (price 0.0 on rows without an order);
- ``dropped``: a whole row removed by de-duplication (``column`` is ``<row>``).
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any, Literal

import pandas as pd

Method = Literal["exact", "approximate", "unknown", "format", "derived", "convention", "dropped"]

FIX_LOG_COLUMNS: tuple[str, ...] = (
    "file",
    "step",
    "rule",
    "record_id",
    "date",
    "sku_id",
    "region",
    "column",
    "method",
    "raw_value",
    "before",
    "after",
    "evidence",
)
KEY_COLUMNS: tuple[str, ...] = ("record_id", "date", "sku_id", "region")


def fix_entries(
    keys: pd.DataFrame,
    *,
    file: str,
    step: int,
    rule: str,
    column: str,
    method: Method,
    raw_value: Any,
    before: Any,
    after: Any,
    evidence: Any,
) -> pd.DataFrame:
    """Fix-log rows for every row of ``keys``.

    ``keys`` holds whichever of ``record_id``, ``date``, ``sku_id``, ``region`` identify the changed cells (absent
    columns are written as null). The value arguments are scalars or Series aligned with ``keys``.
    """
    out = pd.DataFrame(index=keys.index)
    out["file"] = file
    out["step"] = step
    out["rule"] = rule
    for key in KEY_COLUMNS:
        out[key] = _as_text(keys[key], keys.index) if key in keys.columns else _as_text(None, keys.index)
    out["column"] = column
    out["method"] = method
    out["raw_value"] = _as_text(raw_value, keys.index)
    out["before"] = _as_text(before, keys.index)
    out["after"] = _as_text(after, keys.index)
    out["evidence"] = _as_text(evidence, keys.index)
    return out.reset_index(drop=True)


def assemble_fix_log(parts: Sequence[pd.DataFrame]) -> pd.DataFrame:
    """Concatenate fix-log parts in a stable, documented order (file, step, rule, keys, column)."""
    log = pd.concat([part.loc[:, list(FIX_LOG_COLUMNS)] for part in parts if len(part)], ignore_index=True)
    log["step"] = log["step"].astype("int64")
    order = ["file", "step", "rule", "record_id", "date", "sku_id", "region", "column"]
    return log.sort_values(order, kind="stable", na_position="first").reset_index(drop=True)


def _as_text(value: Any, index: pd.Index) -> pd.Series:
    """Text form of a scalar or Series; missing values stay null."""
    if isinstance(value, pd.Series):
        series = value.reindex(index)
    else:
        series = pd.Series([value] * len(index), index=index, dtype="object")
    return series.astype("string").astype("str")
