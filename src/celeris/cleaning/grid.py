"""Step 4: the full series x month grid with explicit missing rows (dossier 2.1 K13, 7.1 step 4).

The grid is every cell of every Record_ID block: 245,548 cells = 244,566 records + 982 missing rows (0.400 %, missing
completely at random). A missing row is never a zero (business rule 3): its units stay null and the cell is flagged
``missing_row``. Months outside a block are "not on sale" (before launch, after EOL, MEA before 2022-01) and are not
part of the grid.

Static attributes of a missing cell come from its series: family, business unit and description from the master, the
channel from the series (it never changes, 3,083 / 3,083). The customer can change once in 23 series, so a missing
cell takes the customer of its neighbouring records only when both neighbours agree (or the only neighbour at a series
edge); otherwise it stays null.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from celeris.cleaning.dates import month_labels
from celeris.quality.checks import Check, examples_from, invariant_check, issue_check

FILE = "train.csv"
OBSERVED = "observed"
MISSING = "missing_row"


def build_grid(blocks: pd.DataFrame) -> pd.DataFrame:
    """One row per cell of every block, in Record_ID order: ``series_no``, keys, ``month_idx`` and ``rec_num``."""
    lengths = blocks["length"].to_numpy()
    series_position = np.repeat(np.arange(len(blocks)), lengths)
    step = np.arange(lengths.sum()) - np.repeat(np.cumsum(lengths) - lengths, lengths)
    grid = pd.DataFrame(
        {
            "series_no": blocks["series_no"].to_numpy()[series_position],
            "sku_id": blocks["sku_id"].to_numpy()[series_position],
            "region": blocks["region"].to_numpy()[series_position],
            "month_idx": blocks["start_idx"].to_numpy()[series_position] + step,
            "rec_num": blocks["start_rec"].to_numpy()[series_position] + step,
        }
    )
    grid["date"] = month_labels(grid["month_idx"])
    return grid


def attach_records(grid: pd.DataFrame, records: pd.DataFrame, master: pd.DataFrame, business_unit: pd.Series) -> pd.DataFrame:
    """Left-join the records onto the grid and fill the static attributes of missing cells.

    ``records`` carries the cleaned record columns keyed by ``rec_num``; ``business_unit`` is the corrected master BU
    aligned with ``master``.
    """
    merged = grid.merge(records, on="rec_num", how="left", suffixes=("", "_record"), validate="one_to_one")
    merged["row_status"] = np.where(merged["record_id"].isna(), MISSING, OBSERVED)
    by_sku = master.set_index("SKU_ID")
    bu = pd.Series(business_unit.to_numpy(), index=master["SKU_ID"])
    merged["product_family"] = merged["sku_id"].map(by_sku["Product_Family"]).astype("str")
    merged["business_unit"] = merged["sku_id"].map(bu).astype("str")
    merged["sku_description"] = merged["sku_id"].map(by_sku["SKU_Description"]).astype("str")
    channel = merged.groupby("series_no")["sales_channel"].agg(lambda s: s.dropna().unique())
    if (channel.map(len) != 1).any():
        raise AssertionError("a series has more than one sales channel")
    merged["sales_channel"] = merged["series_no"].map(channel.map(lambda values: values[0])).astype("str")
    merged["customer"] = _fill_customer(merged)
    return merged


def _fill_customer(cells: pd.DataFrame) -> pd.Series:
    """Customer of each cell; a missing cell takes its neighbours' customer when they agree."""
    by_series = cells.groupby("series_no")["customer"]
    previous = by_series.ffill()
    following = by_series.bfill()
    neighbour = previous.where(previous.notna(), following)
    agree = previous.isna() | following.isna() | (previous == following)
    return cells["customer"].where(cells["customer"].notna(), neighbour.where(agree)).astype("str")


def grid_checks(cells: pd.DataFrame, blocks: pd.DataFrame) -> list[Check]:
    """K13 missing rows (with their position in the series) and the grid size."""
    missing = cells[cells["row_status"] == MISSING]
    start = missing["series_no"].map(blocks.set_index("series_no")["start_idx"])
    end = missing["series_no"].map(blocks.set_index("series_no")["end_idx"])
    position = {
        "first": int((missing["month_idx"] == start).sum()),
        "last": int((missing["month_idx"] == end).sum()),
        "inner": int(((missing["month_idx"] != start) & (missing["month_idx"] != end)).sum()),
    }
    unresolved_customer = int(missing["customer"].isna().sum())
    return [
        invariant_check(
            check_id="TRN-GRID-CELLS",
            file=FILE,
            rule="2.0",
            title="Grid size",
            description="Every cell of every Record_ID block: records + missing rows.",
            dimension="completeness",
            unit="cells",
            checked=len(cells),
            violations_before=0,
            violations_after=0,
            action="build the panel on the full grid",
            expected_key="grid.cells",
        ),
        issue_check(
            check_id="TRN-K13-MISSING-ROW",
            file=FILE,
            rule="K13",
            title="Missing row (deleted record)",
            description=(
                "Gaps in the Record_ID sequence: cells whose record was deleted (0.400 % of the grid, missing completely "
                "at random). They stay null (business rule 3: a missing row is not a zero) and are flagged; "
                f"customer inferred from agreeing neighbours for {len(missing) - unresolved_customer} of {len(missing)}."
            ),
            dimension="completeness",
            unit="cells",
            affected=len(missing),
            action="row_status = missing_row, units null; treatment (stock-out file, cycle phase, imputation) in the demand stage",
            expected_key="grid.missing",
            examples=examples_from(missing, ["sku_id", "region", "date"]),
            breakdown=position,
            breakdown_expected_prefix="grid.missing",
        ),
    ]
