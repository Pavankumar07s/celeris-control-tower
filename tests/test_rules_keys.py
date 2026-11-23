"""Rule fixtures and generator-style corruption recovery for dates, labels and de-duplication (dossier 2.1)."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from celeris.cleaning.dates import month_label, parse_month_text, repair_year_typo
from celeris.cleaning.dedup import EXACT, SUPERSEDED, deduplicate
from celeris.cleaning.labels import CustomerResolver, VocabularyResolver, normalise_key, resolve_column, resolve_sku
from celeris.config import CHANNELS, REGIONS
from celeris.reference import label_aliases

CUSTOMERS = (
    "Apex Tier One", "Atlas Mideast Components", "Crestline Manufacturing", "Falcon Gulf Motors", "Helios Auto Parts",
    "Kestrel Mobility", "Meridian Assembly", "Nexon Motor Group", "Orion Driveline", "Quantum Drive Systems",
    "Solaris Automotive", "Vantara Auto",
)
MONTH_NAMES = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")


def _date_variants(year: int, month: int) -> dict[str, str]:
    """The seven formats the generator writes (K3)."""
    name = MONTH_NAMES[month - 1]
    return {
        "YYYY-MM": f"{year}-{month:02d}",
        "YYYY/MM": f"{year}/{month:02d}",
        "YYYY-MM-DD": f"{year}-{month:02d}-01",
        "MM/YYYY": f"{month:02d}/{year}",
        "MM-YYYY": f"{month:02d}-{year}",
        "Mon YYYY": f"{name} {year}",
        "Mon-YYYY": f"{name}-{year}",
    }


@pytest.mark.parametrize("index", range(0, 94, 7))
def test_every_date_format_recovers_the_month(index: int) -> None:
    year, month = 2019 + index // 12, index % 12 + 1
    for fmt, text in _date_variants(year, month).items():
        parsed = parse_month_text(text)
        assert (parsed.year, parsed.month, parsed.fmt) == (year, month, fmt)
    assert month_label(index) == f"{year}-{month:02d}"


@pytest.mark.parametrize("bad", ["2019-13", "Janv 2019", "2019.01", "19-01", "", " 2019-01", "jan 2019"])
def test_unknown_or_invalid_dates_raise(bad: str) -> None:
    with pytest.raises(ValueError):
        parse_month_text(bad)


def test_year_typo_is_a_digit_swap() -> None:
    assert repair_year_typo(2062, 2026) == 2026
    assert repair_year_typo(2024, 2026) == 2024
    with pytest.raises(ValueError):
        repair_year_typo(2031, 2026)  # not a transposition of a year inside the window


def _region_resolver() -> VocabularyResolver:
    return VocabularyResolver(REGIONS, label_aliases("Region"))


def _channel_resolver() -> VocabularyResolver:
    return VocabularyResolver(CHANNELS, label_aliases("Sales_Channel"))


@pytest.mark.parametrize("canonical", REGIONS)
def test_region_variants_recover(canonical: str) -> None:
    resolver = _region_resolver()
    injected = {
        canonical.upper(): "case",
        canonical.lower(): "case",
        canonical + " ": "whitespace",
        canonical.replace(" ", "-"): "punctuation" if " " in canonical else "canonical",
    }
    for raw, kind in injected.items():
        result = resolver(raw)
        assert result.canonical == canonical
        assert result.kind == kind


def test_region_abbreviations_and_blank() -> None:
    resolver = _region_resolver()
    assert resolver("NA").canonical == "North America"  # the literal NA must never become missing
    assert resolver("ME&A").canonical == "Middle East & Africa"
    assert resolver("Middle East and Africa").kind == "wording"
    assert resolver("").canonical is None
    with pytest.raises(ValueError):
        resolver("Oceania")


def test_channel_variants_recover() -> None:
    resolver = _channel_resolver()
    assert resolver("T1 Distributor").canonical == "Tier-1 Distributor"
    assert resolver("Tier 1 Distributor").kind == "punctuation"
    assert resolver("OEM Direct").canonical == "Direct OEM"
    assert resolver("Export ").kind == "whitespace"
    with pytest.raises(ValueError):
        resolver("Retail")


def test_alias_table_cannot_shadow_or_escape_the_vocabulary() -> None:
    with pytest.raises(ValueError):
        VocabularyResolver(REGIONS, {"oceania": ("Oceania", "abbreviation")})
    with pytest.raises(ValueError):
        VocabularyResolver(REGIONS, {normalise_key("Europe"): ("Europe", "abbreviation")})


@pytest.mark.parametrize("sku", ["BSS-001", "CSS-031", "THM-120", "PTC-007"])
def test_sku_variants_recover(sku: str) -> None:
    prefix, number = sku.split("-")
    variants = {
        sku.lower(): "lowercase",
        prefix + number: "missing_dash",
        " " + sku: "leading_space",
        prefix + "_" + number: "underscore",
    }
    if number.startswith("0"):
        variants[f"{prefix}-{int(number)}"] = "dropped_zero"
    for raw, kind in variants.items():
        assert resolve_sku(raw).canonical == sku
        assert resolve_sku(raw).kind == kind
    with pytest.raises(ValueError):
        resolve_sku("BS-0011")


@pytest.mark.parametrize("name", CUSTOMERS)
def test_customer_variants_recover(name: str) -> None:
    resolver = CustomerResolver(CUSTOMERS)
    assert resolver(name + " Inc.").canonical == name
    assert resolver(name.upper()).kind == "uppercase"
    first_space = name.index(" ")
    assert resolver(name[:first_space] + "  " + name[first_space + 1 :]).kind == "double_space"
    assert resolver(name.replace(" ", "", 1)).kind == "space_deleted"
    for position in range(1, len(name) - 1):  # the generator never deletes the first or last character
        if name[position] != " ":
            typo = name[:position] + name[position + 1 :]
            assert resolver(typo).canonical == name


def test_unknown_customer_raises() -> None:
    resolver = CustomerResolver(CUSTOMERS)
    with pytest.raises(ValueError):
        resolver("Zenith Motors")
    with pytest.raises(ValueError):
        resolver("")


def test_canonicalisers_are_idempotent_on_every_raw_variant(raw_train: pd.DataFrame) -> None:
    """Resolving a canonical output again changes nothing (T6), for every distinct raw label in train.csv."""
    specs = (
        ("Region", _region_resolver()),
        ("Sales_Channel", _channel_resolver()),
        ("SKU_ID", resolve_sku),
        ("Customer_Name", CustomerResolver(CUSTOMERS)),
    )
    for column, resolver in specs:
        values = pd.Series(pd.unique(raw_train[column]))
        once = resolve_column(values, resolver)["canonical"].dropna()
        twice = resolve_column(once, resolver)
        assert (twice["canonical"] == once).all()
        assert (twice["kind"] == "canonical").all()


def _keys_frame(rows: list[tuple[str, str, str, str]]) -> tuple[pd.DataFrame, pd.DataFrame]:
    """(record_id, load timestamp, units, revenue) rows -> minimal step-1 keys frame and raw text frame."""
    raw = pd.DataFrame(rows, columns=["Record_ID", "Load_Timestamp", "Units_Sold", "Revenue_USD"])
    keys = pd.DataFrame(
        {
            "record_id": raw["Record_ID"],
            "rec_num": raw["Record_ID"].str[4:].astype("int64"),
            "load_ts": pd.to_datetime(raw["Load_Timestamp"]),
            "units_txt": raw["Units_Sold"],
            "revenue_txt": raw["Revenue_USD"],
        }
    )
    keys.index.name = "raw_row"
    return keys, raw


def test_dedup_keeps_the_latest_load_and_never_sums() -> None:
    keys, raw = _keys_frame(
        [
            ("CEL-0000001", "2024-09-01 05:52:30", "131", "100.0"),
            ("CEL-0000002", "2024-09-01 01:00:00", "7", "7.0"),
            ("CEL-0000002", "2024-09-01 01:00:00", "7", "7.0"),
            ("CEL-0000001", "2024-09-22 05:52:30", "105", "80.0"),
        ]
    )
    result = deduplicate(keys, raw)
    kept = keys[result.kept]
    assert sorted(kept["units_txt"]) == ["105", "7"]
    kinds = dict(zip(result.decisions["record_id"], result.decisions["kind"], strict=True))
    assert kinds == {"CEL-0000001": SUPERSEDED, "CEL-0000002": EXACT}
    assert result.decisions.loc[result.decisions["kind"] == SUPERSEDED, "delay_days"].item() == 21


def test_dedup_raises_when_same_timestamp_differs() -> None:
    keys, raw = _keys_frame(
        [("CEL-0000001", "2024-09-01 05:52:30", "131", "100.0"), ("CEL-0000001", "2024-09-01 05:52:30", "130", "99.0")]
    )
    with pytest.raises(AssertionError):
        deduplicate(keys, raw)


def test_dedup_is_order_invariant() -> None:
    """Shuffling raw rows does not change which version survives (metamorphic, T6)."""
    rows = [
        ("CEL-0000001", "2024-09-01 05:52:30", "131", "100.0"),
        ("CEL-0000001", "2024-09-22 05:52:30", "105", "80.0"),
        ("CEL-0000003", "2024-09-02 02:00:00", "9", "9.0"),
    ]
    rng = np.random.default_rng(7)
    expected = None
    for _ in range(5):
        shuffled = [rows[i] for i in rng.permutation(len(rows))]
        keys, raw = _keys_frame(shuffled)
        survivors = sorted(keys[deduplicate(keys, raw).kept]["units_txt"])
        expected = expected or survivors
        assert survivors == expected == ["105", "9"]
