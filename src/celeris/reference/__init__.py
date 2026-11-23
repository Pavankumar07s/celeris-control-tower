"""Small lookup tables that encode forensic findings (see ``PROVENANCE.md`` in this directory)."""

from __future__ import annotations

from importlib.resources import files

import pandas as pd


def label_aliases(column: str) -> dict[str, tuple[str, str]]:
    """Alias table for one raw column: normalised alias key -> ``(canonical label, kind of variant)``."""
    table = pd.read_csv(files(__package__).joinpath("label_aliases.csv"), dtype=str, keep_default_na=False)
    rows = table[table["column"] == column]
    if rows.empty:
        raise KeyError(f"no aliases for column {column!r}")
    return {row.alias_key: (row.canonical, row.kind) for row in rows.itertuples(index=False)}
