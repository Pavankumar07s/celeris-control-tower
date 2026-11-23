"""Month parsing and the month index (dossier 2.1 K3-K5).

``train.csv`` writes the requested delivery month in exactly seven text formats; the four-digit group is always the
year, so no format is ambiguous. Anything else raises. A year outside the data window is the ``2062`` digit
transposition of 2026 (K4), repaired by swapping its last two digits; the caller confirms each repair against the
independent ``Load_Timestamp`` witness.
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from dataclasses import dataclass

import pandas as pd

from celeris.config import FIRST_YEAR

MONTH_ABBREVIATIONS: Mapping[str, int] = {
    name: number
    for number, name in enumerate(
        ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"), start=1
    )
}
CANONICAL_FORMAT = "YYYY-MM"


@dataclass(frozen=True)
class _Format:
    name: str
    pattern: re.Pattern[str]
    month_is_name: bool


_FORMATS: tuple[_Format, ...] = (
    _Format(CANONICAL_FORMAT, re.compile(r"^(?P<year>\d{4})-(?P<month>\d{2})$"), False),
    _Format("YYYY/MM", re.compile(r"^(?P<year>\d{4})/(?P<month>\d{2})$"), False),
    _Format("YYYY-MM-DD", re.compile(r"^(?P<year>\d{4})-(?P<month>\d{2})-\d{2}$"), False),
    _Format("MM/YYYY", re.compile(r"^(?P<month>\d{2})/(?P<year>\d{4})$"), False),
    _Format("MM-YYYY", re.compile(r"^(?P<month>\d{2})-(?P<year>\d{4})$"), False),
    _Format("Mon YYYY", re.compile(r"^(?P<month>[A-Z][a-z]{2}) (?P<year>\d{4})$"), True),
    _Format("Mon-YYYY", re.compile(r"^(?P<month>[A-Z][a-z]{2})-(?P<year>\d{4})$"), True),
)


@dataclass(frozen=True)
class ParsedMonth:
    """A parsed month text: calendar year and month plus the format it was written in."""

    year: int
    month: int
    fmt: str


def parse_month_text(text: str) -> ParsedMonth:
    """Parse one of the seven month formats; raise ``ValueError`` on anything else."""
    for fmt in _FORMATS:
        match = fmt.pattern.match(text)
        if match is None:
            continue
        token = match.group("month")
        month = MONTH_ABBREVIATIONS.get(token) if fmt.month_is_name else int(token)
        if month is None or not 1 <= month <= 12:
            raise ValueError(f"invalid month {token!r} in {text!r}")
        return ParsedMonth(int(match.group("year")), month, fmt.name)
    raise ValueError(f"unknown month format: {text!r}")


def repair_year_typo(year: int, last_year: int) -> int:
    """Swap the last two digits of a year outside ``FIRST_YEAR..last_year`` (2062 -> 2026); raise if still outside."""
    if FIRST_YEAR <= year <= last_year:
        return year
    text = f"{year:04d}"
    repaired = int(text[:2] + text[3] + text[2])
    if not FIRST_YEAR <= repaired <= last_year:
        raise ValueError(f"year {year} is outside {FIRST_YEAR}..{last_year} and is not a digit transposition")
    return repaired


def month_index(year: pd.Series | int, month: pd.Series | int) -> pd.Series | int:
    """Months since 2019-01 (0-based)."""
    return (year - FIRST_YEAR) * 12 + month - 1


def month_label(index: int) -> str:
    """``YYYY-MM`` text of a month index."""
    year, month0 = divmod(int(index), 12)
    return f"{FIRST_YEAR + year:04d}-{month0 + 1:02d}"


def month_labels(indices: pd.Series) -> pd.Series:
    """Vectorised ``month_label`` (maps the unique values)."""
    lookup = {int(i): month_label(int(i)) for i in pd.unique(indices)}
    return indices.map(lookup).astype("str")


def parse_month_column(values: pd.Series) -> pd.DataFrame:
    """Parse a text column of months; returns ``year``, ``month`` and ``date_format`` aligned with ``values``.

    Parsing runs once per distinct text (a few hundred), so the column size does not matter.
    """
    parsed = {text: parse_month_text(text) for text in pd.unique(values)}
    return pd.DataFrame(
        {
            "year": values.map({k: v.year for k, v in parsed.items()}).astype("int64"),
            "month": values.map({k: v.month for k, v in parsed.items()}).astype("int64"),
            "date_format": values.map({k: v.fmt for k, v in parsed.items()}).astype("str"),
        },
        index=values.index,
    )
