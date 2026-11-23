"""Step 3: the Record_ID block table, the decode, and the Record_ID-free witness for blank regions (dossier 2.0, K7).

Record_ID is the generator's row counter over a complete SKU x region x month grid. Within each series
``rec_num - month_idx`` is constant, so every series owns one contiguous block of IDs with the month advancing by one
per ID. The block table is derived from the raw rows, not from the closed formula (which needs the BSS-018 launch
override to work at all, LK.v / PZ.v):

1. ``offset = rec_num - month_idx`` per labelled record; assert it is constant within each SKU-region and unique.
2. Order series by offset (SKU ascending, then each SKU's own region order).
3. Series window from the lifecycle: start = max(2019-01, effective launch, 2022-01 for MEA), end = min(2026-10, EOL).
   The effective launch is the first observed month when that precedes the master launch (BSS-018, S2).
4. Block = ``[offset + start, offset + end]``. Assert that the blocks tile 1..N contiguously: this proves that every
   ID gap between the observed rows is a missing cell of a known series and month, including the 10 missing first
   cells and the 16 missing last cells that a row-based reading cannot place.

The decode then gives the authoritative SKU, region and month of every record; the pipeline asserts agreement with
the labels on every row (blank regions excepted) and fills the 737 blank regions from it. Methods B and C of the
labels-keys lens recover the same 737 regions without Record_ID and serve as an independent witness.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from celeris.cleaning.dates import month_index, month_labels, parse_month_text
from celeris.config import LAST_TRAIN_MONTH_IDX, MEA_OPENING_MONTH, MEA_REGION, REGIONS
from celeris.quality.checks import Check, examples_from, expect, invariant_check, issue_check
from celeris.quality.fixlog import fix_entries

FILE = "train.csv"
_MEA_OPENING = parse_month_text(MEA_OPENING_MONTH)
MEA_OPENING_IDX = int(month_index(_MEA_OPENING.year, _MEA_OPENING.month))


def observed_series(records: pd.DataFrame) -> pd.DataFrame:
    """Per labelled SKU-region: the constant ``offset = rec_num - month_idx`` and the first / last observed month."""
    labelled = records[records["region_label"].notna()]
    grouped = labelled.assign(offset=labelled["rec_num"] - labelled["month_idx"]).groupby(
        ["sku_id", "region_label"], sort=False
    )
    series = grouped.agg(
        offset=("offset", "min"),
        offset_max=("offset", "max"),
        first_idx=("month_idx", "min"),
        last_idx=("month_idx", "max"),
    ).reset_index()
    if (series["offset"] != series["offset_max"]).any():
        raise AssertionError("rec_num - month_idx is not constant within a series")
    if series["offset"].duplicated().any():
        raise AssertionError("two series share a Record_ID offset")
    series = series.drop(columns="offset_max").rename(columns={"region_label": "region"})
    return series.sort_values("offset", kind="stable").reset_index(drop=True)


def series_windows(series: pd.DataFrame, lifecycle: pd.DataFrame) -> pd.DataFrame:
    """Lifecycle window ``[start_idx, end_idx]`` of each series (Record_ID-free: master dates + observed months).

    ``series`` needs ``sku_id``, ``region`` and ``first_idx``; ``lifecycle`` is ``master.lifecycle_months``.
    """
    launch = series["sku_id"].map(lifecycle["launch_idx"])
    first_sale = series.groupby("sku_id")["first_idx"].transform("min")
    effective_launch = np.minimum(launch, first_sale)  # sales before the master launch prove the master wrong (S2)
    floor = np.where(series["region"] == MEA_REGION, MEA_OPENING_IDX, 0)
    eol = series["sku_id"].map(lifecycle["eol_idx"]).fillna(LAST_TRAIN_MONTH_IDX)
    return pd.DataFrame(
        {
            "start_idx": np.maximum(np.maximum(effective_launch, floor), 0).astype("int64"),
            "end_idx": np.minimum(eol, LAST_TRAIN_MONTH_IDX).astype("int64"),
        },
        index=series.index,
    )


def derive_blocks(records: pd.DataFrame, lifecycle: pd.DataFrame) -> pd.DataFrame:
    """The Record_ID block table (one row per series, in Record_ID order); asserts the blocks tile 1..N."""
    series = observed_series(records)
    if not series["sku_id"].is_monotonic_increasing:
        raise AssertionError("series are not ordered by SKU in Record_ID order")
    window = series_windows(series, lifecycle)
    if ((series["first_idx"] < window["start_idx"]) | (series["last_idx"] > window["end_idx"])).any():
        raise AssertionError("a record lies outside its series' lifecycle window")
    blocks = pd.DataFrame(
        {
            "series_no": np.arange(len(series), dtype="int64"),
            "sku_id": series["sku_id"].astype("str"),
            "region": series["region"].astype("str"),
            "start_rec": series["offset"] + window["start_idx"],
            "end_rec": series["offset"] + window["end_idx"],
            "start_idx": window["start_idx"],
            "end_idx": window["end_idx"],
        }
    )
    blocks["length"] = blocks["end_rec"] - blocks["start_rec"] + 1
    contiguous = blocks["start_rec"].iloc[1:].to_numpy() == blocks["end_rec"].iloc[:-1].to_numpy() + 1
    if blocks["start_rec"].iloc[0] != 1 or not contiguous.all():
        raise AssertionError("Record_ID blocks do not tile 1..N: lifecycle windows and ID gaps disagree")
    blocks["start_date"] = month_labels(blocks["start_idx"])
    blocks["end_date"] = month_labels(blocks["end_idx"])
    return blocks


def decode(rec_num: pd.Series, blocks: pd.DataFrame) -> pd.DataFrame:
    """Decode Record_ID numbers into ``series_no``, ``sku_id``, ``region`` and ``month_idx``."""
    starts = blocks["start_rec"].to_numpy()
    position = np.searchsorted(starts, rec_num.to_numpy(), side="right") - 1
    if (position < 0).any() or (rec_num.to_numpy() > blocks["end_rec"].to_numpy()[position]).any():
        raise AssertionError("Record_ID outside the block table")
    return pd.DataFrame(
        {
            "series_no": blocks["series_no"].to_numpy()[position],
            "sku_id": blocks["sku_id"].to_numpy()[position],
            "region": blocks["region"].to_numpy()[position],
            "month_idx": blocks["start_idx"].to_numpy()[position] + rec_num.to_numpy() - starts[position],
        },
        index=rec_num.index,
    )


def apply_decode(records: pd.DataFrame, blocks: pd.DataFrame) -> pd.DataFrame:
    """Attach ``series_no`` and the decoded ``region``; assert agreement with every label (blank regions excepted)."""
    decoded = decode(records["rec_num"], blocks)
    if not (decoded["sku_id"].to_numpy() == records["sku_id"].to_numpy()).all():
        raise AssertionError("decoded SKU disagrees with the SKU label")
    labelled = records["region_label"].notna().to_numpy()
    if not (decoded["region"].to_numpy()[labelled] == records["region_label"].to_numpy()[labelled]).all():
        raise AssertionError("decoded region disagrees with a non-blank region label")
    if not (decoded["month_idx"].to_numpy() == records["month_idx"].to_numpy()).all():
        raise AssertionError("decoded month disagrees with the repaired Date")
    out = records.assign(series_no=decoded["series_no"], region=decoded["region"].astype("str"))
    if out.duplicated(["date", "sku_id", "region"]).any():
        raise AssertionError("two records share a (Date, SKU, Region) key")
    return out


def witness_blank_regions(records: pd.DataFrame, lifecycle: pd.DataFrame) -> pd.Series:
    """Region of each blank-region record recovered without Record_ID (methods B and C of LK, LK.v, DD.v).

    B: the regions in which the record's (SKU, customer, channel) occurs. C: the regions of the SKU that are inside
    their lifecycle window that month and have no labelled record then. The witness is the single region in B and C,
    or null when the intersection is not a single region.
    """
    labelled = records[records["region_label"].notna()]
    blank = records[records["region_label"].isna()]
    by_combo = labelled.groupby(["sku_id", "customer", "sales_channel"])["region_label"].agg(frozenset)
    series = observed_series(records)
    window = series_windows(series, lifecycle)
    series = pd.concat([series, window], axis=1)
    regions_by_sku = series.groupby("sku_id")[["region", "start_idx", "end_idx"]].apply(
        lambda g: list(g.itertuples(index=False, name=None))
    )
    present = set(zip(labelled["sku_id"], labelled["region_label"], labelled["month_idx"], strict=True))
    witness = {}
    for row in blank.itertuples():
        b_candidates = by_combo.get((row.sku_id, row.customer, row.sales_channel), frozenset())
        c_candidates = {
            region
            for region, start, end in regions_by_sku[row.sku_id]
            if start <= row.month_idx <= end and (row.sku_id, region, row.month_idx) not in present
        }
        both = b_candidates & c_candidates
        witness[row.Index] = next(iter(both)) if len(both) == 1 else None
    return pd.Series(witness, dtype="object").reindex(blank.index)


def region_checks(records: pd.DataFrame, raw_blank_rows: int, witness: pd.Series) -> list[Check]:
    """K7 (blank region) with the Record_ID-free witness, and the key-uniqueness check after decoding."""
    expect("train.region_blank_raw", raw_blank_rows)
    blank = records[records["region_label"].isna()]
    agrees = witness.reindex(blank.index) == blank["region"]
    by_region = {str(k): int(v) for k, v in blank["region"].value_counts().sort_index().items()}
    return [
        issue_check(
            check_id="TRN-K7-REGION-BLANK",
            file=FILE,
            rule="K7",
            title="Region blank",
            description=(
                f"{raw_blank_rows:,} raw rows / {len(blank):,} records. The Record_ID block gives the region; methods B and C "
                f"(customer-channel combination and the only region without a row that month) independently give the same "
                f"region for {int(agrees.sum()):,} / {len(blank):,} records."
            ),
            dimension="completeness",
            unit="records",
            affected=len(blank),
            action="Region := region of the Record_ID block (asserted equal to the B-and-C witness)",
            expected_key="train.region_blank_ids",
            examples=examples_from(blank, ["record_id", "sku_id", "date", "region"]),
            breakdown=by_region,
            breakdown_expected_prefix="train.region_blank_true",
        ),
        invariant_check(
            check_id="TRN-K7-WITNESS",
            file=FILE,
            rule="K7",
            title="Blank regions: Record_ID decode vs Record_ID-free witness",
            description="Methods B and C of the labels-keys lens, which do not use Record_ID, must give the decoded region.",
            dimension="accuracy",
            unit="records",
            checked=len(blank),
            violations_before=int((~agrees).sum()),
            violations_after=int((~agrees).sum()),
            action="fail the build on any disagreement",
            expected_key="train.region_blank_ids",
        ),
        invariant_check(
            check_id="TRN-UNQ-KEY",
            file=FILE,
            rule="2.0",
            title="One record per (Date, SKU, Region)",
            description="After de-duplication and decoding no two records share a key (0 collisions).",
            dimension="uniqueness",
            unit="records",
            checked=len(records),
            violations_before=int(records.duplicated(["date", "sku_id", "region"]).sum()),
            violations_after=0,
            action="none needed: de-duplication on Record_ID is sufficient",
            expected_key="train.records",
        ),
    ]


def region_fix_log(records: pd.DataFrame, blocks: pd.DataFrame, witness: pd.Series) -> pd.DataFrame:
    """K7 fix-log rows: blank region filled from the Record_ID block."""
    rows = records[records["region_label"].isna()]
    block = blocks.set_index("series_no").loc[rows["series_no"]]
    evidence = (
        '{"series_no":' + rows["series_no"].astype("str") + ',"block":"CEL-'
        + block["start_rec"].map("{:07d}".format).to_numpy() + "..CEL-" + block["end_rec"].map("{:07d}".format).to_numpy()
        + '","witness_b_and_c":"' + witness.reindex(rows.index).astype("str") + '"}'
    )
    return fix_entries(
        rows,
        file=FILE,
        step=3,
        rule="K7",
        column="Region",
        method="derived",
        raw_value=rows["region_raw"],
        before=rows["region_raw"],
        after=rows["region"],
        evidence=evidence,
    )


def block_checks(blocks: pd.DataFrame, records: pd.DataFrame) -> list[Check]:
    """Structure of the block table (dossier 2.0): series count, block lengths, core SKUs, region orders."""
    orders = blocks.groupby("sku_id", sort=False)["region"].agg("|".join)
    lengths = blocks["length"].value_counts()
    return [
        invariant_check(
            check_id="TRN-GRID-BLOCKS",
            file=FILE,
            rule="2.0",
            title="Record_ID blocks tile the grid",
            description=(
                f"{len(blocks):,} SKU-region series own contiguous ID blocks CEL-0000001..CEL-{blocks['end_rec'].max():07d} "
                f"with the month advancing by one per ID; {records['rec_num'].nunique():,} IDs are used."
            ),
            dimension="consistency",
            unit="series",
            checked=len(blocks),
            violations_before=0,
            violations_after=0,
            action="decode SKU, region and month of every record from its block",
            expected_key="grid.series",
            breakdown={"len_94": int(lengths.get(94, 0)), "len_58": int(lengths.get(58, 0))},
            breakdown_expected_prefix="grid.block",
        ),
        invariant_check(
            check_id="TRN-GRID-REGION-ORDER",
            file=FILE,
            rule="2.0",
            title="Per-SKU region orders",
            description=f"{orders.nunique()} distinct region orders; the core SKUs list all six regions in the canonical order.",
            dimension="validity",
            unit="skus",
            checked=int(orders.nunique()),
            violations_before=0,
            violations_after=0,
            action="none",
            severity="info",
            expected_key="grid.region_orders",
            breakdown={"core_skus": int((orders == "|".join(REGIONS)).sum())},
            breakdown_expected_prefix="grid",
        ),
    ]
