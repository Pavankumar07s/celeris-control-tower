"""Step 1: keys, dates and labels of every raw ``train.csv`` row (dossier 2.1 K3-K12, 7.1 step 1).

Rules, each asserted on the full file:

- ``rec_num = int(Record_ID[4:])``; every Record_ID is ``CEL-NNNNNNN``.
- Date: seven text formats (K3); a year outside 2019..2026 is the ``2062`` digit transposition (K4). The repaired month
  must equal ``month(Load_Timestamp) - 1`` on every row: the load timestamp is the truly independent witness (DD F4,
  DD.v), and it agrees on 248,248 / 248,248 rows.
- The raw ``Year`` / ``Month`` columns are dropped and recomputed from Date (business rule 1). ``Month`` is the load
  month on 246 rows (K5); ``Year`` is never wrong.
- SKU_ID, Region, Sales_Channel, Customer_Name are canonicalised by ``celeris.cleaning.labels`` (unknown values
  raise). A blank Region stays null here and is decoded from Record_ID in step 3.
- Product_Family, Business_Unit and SKU_Description come from the corrected master by SKU; a non-blank raw value must
  agree with it (it does on every row: label noise never changes an entity).
"""

from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

from celeris.cleaning.dates import CANONICAL_FORMAT, month_index, month_labels, parse_month_column, repair_year_typo
from celeris.cleaning.labels import BLANK, CANONICAL, CustomerResolver, VocabularyResolver, resolve_column, resolve_sku
from celeris.config import CHANNELS, FIRST_YEAR, LAST_TRAIN_MONTH_IDX, REGIONS
from celeris.quality.checks import Check, Dimension, examples_from, issue_check
from celeris.quality.fixlog import fix_entries
from celeris.reference import label_aliases

FILE = "train.csv"
_LAST_TRAIN_YEAR = FIRST_YEAR + LAST_TRAIN_MONTH_IDX // 12


@dataclass(frozen=True)
class Vocabularies:
    """Canonical label sets for the label columns."""

    regions: tuple[str, ...]
    channels: tuple[str, ...]
    customers: tuple[str, ...]


def vocabularies(test: pd.DataFrame) -> Vocabularies:
    """Regions and channels are the documented ones; customers are those of ``test.csv``, whose keys are clean.

    Asserts that ``test.csv`` uses only documented regions and channels (dossier 2.3: no label variant in test).
    """
    unknown_regions = set(test["Region"]) - set(REGIONS)
    unknown_channels = set(test["Sales_Channel"]) - set(CHANNELS)
    if unknown_regions or unknown_channels:
        raise AssertionError(f"test.csv has undocumented labels: {unknown_regions | unknown_channels}")
    return Vocabularies(REGIONS, CHANNELS, tuple(sorted(set(test["Customer_Name"]))))


def build_keys(
    train: pd.DataFrame,
    master: pd.DataFrame,
    business_unit: pd.Series,
    vocab: Vocabularies,
) -> pd.DataFrame:
    """One row per raw train row with parsed, canonical keys and the kind of every label variant.

    ``business_unit`` is the corrected master BU aligned with ``master`` (step 12, S1).
    """
    if not train["Record_ID"].str.fullmatch(r"CEL-\d{7}").all():
        raise AssertionError("Record_ID not of the form CEL-NNNNNNN")
    out = pd.DataFrame(index=pd.RangeIndex(len(train), name="raw_row"))
    out["record_id"] = train["Record_ID"].to_numpy()
    out["rec_num"] = train["Record_ID"].str[4:].astype("int64").to_numpy()
    out["load_ts"] = pd.to_datetime(train["Load_Timestamp"], format="%Y-%m-%d %H:%M:%S").to_numpy()
    _add_dates(out, train)
    _add_labels(out, train, vocab)
    _add_master_attributes(out, train, master, business_unit)
    out["units_txt"] = train["Units_Sold"].to_numpy()
    out["price_txt"] = train["Unit_Price_USD"].to_numpy()
    out["revenue_txt"] = train["Revenue_USD"].to_numpy()
    return out


def _add_dates(out: pd.DataFrame, train: pd.DataFrame) -> None:
    parsed = parse_month_column(train["Date"]).set_axis(out.index)
    repaired_year = parsed["year"].map(lambda y: repair_year_typo(int(y), _LAST_TRAIN_YEAR))
    out["date_raw"] = train["Date"].to_numpy()
    out["date_format"] = parsed["date_format"]
    out["year_typo"] = repaired_year != parsed["year"]
    out["year"] = repaired_year.astype("int64")
    out["month"] = parsed["month"]
    out["month_idx"] = month_index(out["year"], out["month"]).astype("int64")
    out["date"] = month_labels(out["month_idx"])
    load_idx = month_index(out["load_ts"].dt.year, out["load_ts"].dt.month)
    if not (load_idx - 1 == out["month_idx"]).all():
        raise AssertionError("Date disagrees with month(Load_Timestamp) - 1 after the 2062 repair")
    if not (train["Year"].astype("int64").to_numpy() == out["year"].to_numpy()).all():
        raise AssertionError("the raw Year column disagrees with the repaired Date")
    out["month_col_raw"] = train["Month"].to_numpy()
    out["month_col_mismatch"] = train["Month"].astype("int64").to_numpy() != out["month"].to_numpy()


def _add_labels(out: pd.DataFrame, train: pd.DataFrame, vocab: Vocabularies) -> None:
    resolvers = {
        "sku": ("SKU_ID", resolve_sku),
        "region": ("Region", VocabularyResolver(vocab.regions, label_aliases("Region"))),
        "channel": ("Sales_Channel", VocabularyResolver(vocab.channels, label_aliases("Sales_Channel"))),
        "customer": ("Customer_Name", CustomerResolver(vocab.customers)),
    }
    names = {"sku": "sku_id", "region": "region_label", "channel": "sales_channel", "customer": "customer"}
    for short, (column, resolver) in resolvers.items():
        resolved = resolve_column(train[column], resolver).set_axis(out.index)
        out[f"{short}_raw"] = train[column].to_numpy()
        out[names[short]] = resolved["canonical"]
        out[f"{short}_kind"] = resolved["kind"]
    if (out["channel_kind"] == BLANK).any():
        raise AssertionError("blank Sales_Channel")


def _add_master_attributes(
    out: pd.DataFrame, train: pd.DataFrame, master: pd.DataFrame, business_unit: pd.Series
) -> None:
    by_sku = master.set_index("SKU_ID")
    unknown = set(out["sku_id"]) - set(by_sku.index)
    if unknown:
        raise AssertionError(f"SKUs not in sku_master: {sorted(unknown)[:5]}")
    bu_by_sku = pd.Series(business_unit.to_numpy(), index=master["SKU_ID"])
    for column, name, reference in (
        ("Product_Family", "product_family", by_sku["Product_Family"]),
        ("SKU_Description", "sku_description", by_sku["SKU_Description"]),
        ("Business_Unit", "business_unit", bu_by_sku),
    ):
        expected = out["sku_id"].map(reference).astype("str")
        raw = pd.Series(train[column].to_numpy(), index=out.index)
        blank = raw == ""
        if not (raw[~blank] == expected[~blank]).all():
            raise AssertionError(f"{column} disagrees with the corrected master on a non-blank row")
        out[f"{name}_raw"] = raw
        out[name] = expected
        out[f"{name}_blank"] = blank


def _variant(kind: pd.Series) -> pd.Series:
    return ~kind.isin([CANONICAL, BLANK])


def _counts(values: pd.Series) -> dict[str, int]:
    return {str(k): int(v) for k, v in values.value_counts().sort_index().items()}


def key_checks(keys: pd.DataFrame, kept: pd.Series) -> list[Check]:
    """Checks for K3-K6 and K8-K12, counted on raw rows and on records (latest version of each Record_ID)."""
    records = keys[kept]
    nonstandard = keys["date_format"] != CANONICAL_FORMAT
    typo = keys[keys["year_typo"]]
    mismatch = keys[keys["month_col_mismatch"]]
    shift = {
        "plus_one": int((mismatch["month_col_raw"].astype("int64") == mismatch["month"] + 1).sum()),
        "december": int((mismatch["month"] == 12).sum()),
    }
    checks = [
        issue_check(
            check_id="TRN-K3-DATE-FORMAT",
            file=FILE,
            rule="K3",
            title="Date written in a non-standard format",
            description="Six alternative formats; the four-digit group is always the year, so none is ambiguous.",
            dimension="conformity",
            unit="raw_rows",
            affected=int(nonstandard.sum()),
            action="normalise to YYYY-MM; any other format raises",
            expected_key="train.date_nonstandard_raw",
            examples=examples_from(keys[nonstandard].drop_duplicates("date_format"), ["record_id", "date_raw", "date"]),
            breakdown=_counts(keys.loc[nonstandard, "date_format"]),
            breakdown_expected_prefix="train.date_fmt",
        ),
        _record_check("TRN-K3-DATE-FORMAT-IDS", "K3", "Records with a non-standard date format",
                      int((records["date_format"] != CANONICAL_FORMAT).sum()), "train.date_nonstandard_ids"),
        issue_check(
            check_id="TRN-K4-YEAR-TYPO",
            file=FILE,
            rule="K4",
            title="Year typo 2062",
            description="Year outside 2019..2026; the Year column, Load_Timestamp and Record_ID all give 2026.",
            dimension="accuracy",
            unit="raw_rows",
            affected=len(typo),
            action="swap the last two digits (2062 -> 2026), confirmed by month(Load_Timestamp) - 1",
            expected_key="train.date_year_typo",
            examples=examples_from(typo, ["record_id", "date_raw", "date"]),
        ),
        issue_check(
            check_id="TRN-K5-MONTH-COLUMN",
            file=FILE,
            rule="K5",
            title="Month column holds the load month",
            description="Month = true month + 1 (December written as 1 with Year unchanged); Date is right on every such row.",
            dimension="consistency",
            unit="raw_rows",
            affected=len(mismatch),
            action="drop the raw Year / Month columns and recompute them from Date (business rule 1)",
            expected_key="train.month_column_mismatch",
            examples=examples_from(mismatch, ["record_id", "date", "month_col_raw"]),
            breakdown=shift,
            breakdown_expected_prefix="train.month_column_mismatch",
        ),
    ]
    label_specs = (
        ("REGION", "K6", "region", "region_label", "Region label variant", "train.region"),
        ("CHANNEL", "K8", "channel", "sales_channel", "Sales_Channel label variant", "train.channel"),
        ("SKU", "K9", "sku", "sku_id", "SKU_ID format variant", "train.sku"),
        ("CUSTOMER", "K10", "customer", "customer", "Customer_Name variant", "train.customer"),
    )
    for tag, rule, short, canonical, title, prefix in label_specs:
        variant = _variant(keys[f"{short}_kind"])
        checks.append(
            issue_check(
                check_id=f"TRN-{rule}-{tag}",
                file=FILE,
                rule=rule,
                title=title,
                description="Formatting variants of a canonical label; no row carries another entity's label.",
                dimension="conformity",
                unit="raw_rows",
                affected=int(variant.sum()),
                action="map to the canonical label; unknown variants raise",
                expected_key=f"{prefix}_variant_raw",
                examples=examples_from(
                    keys[variant].drop_duplicates(f"{short}_kind"), ["record_id", f"{short}_raw", canonical, f"{short}_kind"]
                ),
                breakdown=_counts(keys.loc[variant, f"{short}_kind"]),
                breakdown_expected_prefix=f"{prefix}_kind",
            )
        )
        checks.append(
            _record_check(f"TRN-{rule}-{tag}-IDS", rule, f"{title} (records)",
                          int(_variant(records[f"{short}_kind"]).sum()), f"{prefix}_variant_ids")
        )
    for tag, rule, name, title, prefix in (
        ("FAMILY", "K11", "product_family", "Product_Family blank", "train.family_blank"),
        ("DESCRIPTION", "K12", "sku_description", "SKU_Description blank", "train.description_blank"),
    ):
        blank = keys[f"{name}_blank"]
        checks.append(
            issue_check(
                check_id=f"TRN-{rule}-{tag}-BLANK",
                file=FILE,
                rule=rule,
                title=title,
                description="Blank in the extract; every non-blank value equals the (corrected) master.",
                dimension="completeness",
                unit="raw_rows",
                affected=int(blank.sum()),
                action="fill from the corrected master by SKU",
                expected_key=f"{prefix}_raw",
                examples=examples_from(keys[blank], ["record_id", "sku_id", name]),
            )
        )
        checks.append(
            _record_check(f"TRN-{rule}-{tag}-BLANK-IDS", rule, f"{title} (records)",
                          int(records[f"{name}_blank"].sum()), f"{prefix}_ids", "completeness")
        )
    return checks


def _record_check(
    check_id: str, rule: str, title: str, affected: int, expected_key: str, dimension: Dimension = "conformity"
) -> Check:
    """The same issue counted on unique Record_IDs after de-duplication."""
    return issue_check(
        check_id=check_id,
        file=FILE,
        rule=rule,
        title=title,
        description="Counted on unique Record_IDs after de-duplication (latest load kept).",
        dimension=dimension,
        unit="records",
        affected=affected,
        action="see the raw-row check of the same rule",
        expected_key=expected_key,
    )


def key_fix_log(records: pd.DataFrame) -> pd.DataFrame:
    """Fix-log rows for K3-K6 and K8-K12 on the kept records (blank regions, K7, are logged by step 3).

    ``records`` must already carry the decoded ``region`` of step 3.
    """
    specs = (
        ("K3", "Date", records["date_format"] != CANONICAL_FORMAT, "date_raw", "date", "format",
         '{"format":"' + records["date_format"] + '"}'),
        ("K4", "Date", records["year_typo"], "date_raw", "date", "exact",
         '{"load_timestamp":"' + records["load_ts"].dt.strftime("%Y-%m-%d %H:%M:%S") + '","year_column":'
         + records["year"].astype("str") + "}"),
        ("K5", "Month", records["month_col_mismatch"], "month_col_raw", "month", "exact",
         '{"date":"' + records["date"] + '","rule":"business rule 1: Date is authoritative"}'),
        ("K11", "Product_Family", records["product_family_blank"], "product_family_raw", "product_family", "derived",
         '{"source":"sku_master","sku_id":"' + records["sku_id"] + '"}'),
        ("K12", "SKU_Description", records["sku_description_blank"], "sku_description_raw", "sku_description", "derived",
         '{"source":"sku_master","sku_id":"' + records["sku_id"] + '"}'),
    )
    label_specs = (
        ("K6", "Region", "region", "region"),
        ("K8", "Sales_Channel", "channel", "sales_channel"),
        ("K9", "SKU_ID", "sku", "sku_id"),
        ("K10", "Customer_Name", "customer", "customer"),
    )
    parts = [
        fix_entries(records[mask], file=FILE, step=1, rule=rule, column=column, method=method,
                    raw_value=records.loc[mask, raw], before=records.loc[mask, raw],
                    after=records.loc[mask, after], evidence=evidence[mask])
        for rule, column, mask, raw, after, method, evidence in specs
    ]
    for rule, column, short, after in label_specs:
        mask = _variant(records[f"{short}_kind"])
        parts.append(
            fix_entries(records[mask], file=FILE, step=1, rule=rule, column=column, method="format",
                        raw_value=records.loc[mask, f"{short}_raw"], before=records.loc[mask, f"{short}_raw"],
                        after=records.loc[mask, after],
                        evidence='{"variant":"' + records.loc[mask, f"{short}_kind"] + '"}')
        )
    return pd.concat(parts, ignore_index=True)
