"""Canonical labels for SKU_ID, Region, Sales_Channel and Customer_Name (dossier 2.1 K6-K10).

All label noise in ``train.csv`` is formatting: every variant maps to exactly one canonical value and no row carries
another entity's label (LK, LK.v). The canonicalisers therefore apply deterministic rules and raise on anything they
cannot map, so a new kind of variant stops the pipeline instead of passing through:

- Region / Sales_Channel: compare a normalised key (lower case, letters, digits and ``&`` only) with the canonical
  vocabulary, then with a short alias table (``reference/label_aliases.csv``: ``NA``, ``EU``, ``APAC``, ``ME&A``,
  ``OEM Direct``, ``T1 Distributor``, ...).
- SKU_ID: strip, upper-case, ``_`` -> ``-``, insert the dash, zero-pad the number to three digits.
- Customer_Name: strip, collapse spaces, drop a trailing `` Inc.``, fold case, else the unique canonical name from which
  exactly one character was deleted (155 typo variants; never ambiguous).

Each resolution also returns the kind of variant, which feeds the data-quality report.
"""

from __future__ import annotations

import re
from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass

import pandas as pd

BLANK = "blank"
CANONICAL = "canonical"
_KEY_DROP = re.compile(r"[^a-z0-9&]")
_SKU = re.compile(r"^(?P<prefix>[A-Z]{3})-?(?P<number>\d{1,3})$")
_SKU_CANONICAL = re.compile(r"^[A-Z]{3}-\d{3}$")
_INC_SUFFIX = re.compile(r"\s+Inc\.?$", flags=re.IGNORECASE)
_MULTI_SPACE = re.compile(r"\s{2,}")


@dataclass(frozen=True)
class Resolution:
    """Canonical value of a raw label (``None`` when the raw value is blank) and the kind of variant."""

    canonical: str | None
    kind: str


def normalise_key(text: str) -> str:
    """Lower-case key with everything but letters, digits and ``&`` removed (``'Asia-Pacific '`` -> ``asiapacific``)."""
    return _KEY_DROP.sub("", text.lower())


class VocabularyResolver:
    """Map Region / Sales_Channel variants to a fixed vocabulary via normalised keys and an alias table."""

    def __init__(self, vocabulary: Iterable[str], aliases: Mapping[str, tuple[str, str]]) -> None:
        """``aliases`` maps a normalised key to ``(canonical, kind)``; aliases must point into the vocabulary."""
        self.vocabulary = tuple(vocabulary)
        self._by_key = {normalise_key(value): value for value in self.vocabulary}
        unknown = {canonical for canonical, _ in aliases.values()} - set(self.vocabulary)
        if unknown:
            raise ValueError(f"aliases point outside the vocabulary: {sorted(unknown)}")
        clash = set(aliases) & set(self._by_key)
        if clash:
            raise ValueError(f"aliases shadow canonical keys: {sorted(clash)}")
        self._aliases = dict(aliases)

    def __call__(self, raw: str) -> Resolution:
        if raw.strip() == "":
            return Resolution(None, BLANK)
        if raw in self.vocabulary:
            return Resolution(raw, CANONICAL)
        key = normalise_key(raw)
        if key in self._by_key:
            canonical = self._by_key[key]
            if raw.strip() != raw:
                return Resolution(canonical, "whitespace")
            if raw.casefold() == canonical.casefold():
                return Resolution(canonical, "case")
            return Resolution(canonical, "punctuation")
        if key in self._aliases:
            canonical, kind = self._aliases[key]
            return Resolution(canonical, kind)
        raise ValueError(f"unknown label {raw!r} (vocabulary {self.vocabulary})")


def resolve_sku(raw: str) -> Resolution:
    """Canonical ``AAA-NNN`` SKU and the formatting defect (K9); raise if the text is not a SKU."""
    if _SKU_CANONICAL.match(raw):
        return Resolution(raw, CANONICAL)
    match = _SKU.match(raw.strip().upper().replace("_", "-"))
    if match is None:
        raise ValueError(f"not a SKU id: {raw!r}")
    canonical = f"{match.group('prefix')}-{int(match.group('number')):03d}"
    stripped = raw.strip()
    if stripped != raw:
        kind = "leading_space"
    elif stripped != stripped.upper():
        kind = "lowercase"
    elif "_" in stripped:
        kind = "underscore"
    elif "-" not in stripped:
        kind = "missing_dash"
    else:
        kind = "dropped_zero"
    return Resolution(canonical, kind)


class CustomerResolver:
    """Map Customer_Name variants to the canonical customer names (K10)."""

    def __init__(self, vocabulary: Iterable[str]) -> None:
        self.vocabulary = tuple(sorted(vocabulary))
        self._by_fold = {name.casefold(): name for name in self.vocabulary}

    def __call__(self, raw: str) -> Resolution:
        if raw in self.vocabulary:
            return Resolution(raw, CANONICAL)
        if raw.strip() == "":
            raise ValueError("blank customer name")
        kinds: list[str] = []
        text = raw.strip()
        if text != raw:
            kinds.append("whitespace")
        if _MULTI_SPACE.search(text):
            kinds.append("double_space")
            text = _MULTI_SPACE.sub(" ", text)
        if _INC_SUFFIX.search(text):
            kinds.append("suffix_inc")
            text = _INC_SUFFIX.sub("", text)
        if text in self.vocabulary:
            return Resolution(text, "+".join(kinds))
        if text.casefold() in self._by_fold:
            kinds.append("uppercase" if text.isupper() else "case")
            return Resolution(self._by_fold[text.casefold()], "+".join(kinds))
        hits = [name for name in self.vocabulary if _deleted_char(text, name) is not None]
        if len(hits) != 1:
            raise ValueError(f"customer {raw!r} matches {len(hits)} canonical names by one deletion")
        deleted = _deleted_char(text, hits[0])
        kinds.append("space_deleted" if deleted == " " else "letter_deleted")
        return Resolution(hits[0], "+".join(kinds))


def _deleted_char(short: str, full: str) -> str | None:
    """The character whose deletion turns ``full`` into ``short``, or ``None`` if no single deletion does."""
    if len(short) != len(full) - 1:
        return None
    for position, char in enumerate(full):
        if full[:position] + full[position + 1 :] == short:
            return char
    return None


def resolve_column(values: pd.Series, resolver: Callable[[str], Resolution]) -> pd.DataFrame:
    """Apply a resolver to a text column (once per distinct value); returns ``canonical`` and ``kind`` columns."""
    resolved = {raw: resolver(raw) for raw in pd.unique(values)}
    return pd.DataFrame(
        {
            "canonical": values.map({raw: r.canonical for raw, r in resolved.items()}).astype("str"),
            "kind": values.map({raw: r.kind for raw, r in resolved.items()}).astype("str"),
        },
        index=values.index,
    )
