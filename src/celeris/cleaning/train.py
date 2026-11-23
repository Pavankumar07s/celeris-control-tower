"""Steps 1-6 for ``train.csv``: keys, de-duplication, Record_ID decode, grid, prices and numeric states.

The output ``train_clean`` has one row per grid cell (245,548): the keys, the record (null on the 982 missing rows),
canonical labels, cleaned units / prices / revenue, the numeric state and the rules that changed the record. Column
contract: ``docs/architecture.md`` (``outputs/clean/train_clean.parquet``).
"""

from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

from celeris.cleaning import dedup as dedup_step
from celeris.cleaning import grid as grid_step
from celeris.cleaning import keys as keys_step
from celeris.cleaning import numeric as numeric_step
from celeris.cleaning import prices as prices_step
from celeris.cleaning import record_id as record_id_step
from celeris.cleaning.keys import Vocabularies
from celeris.cleaning.master import BusinessUnitCorrection
from celeris.quality.checks import Check, invariant_check
from celeris.quality.fixlog import assemble_fix_log

FILE = "train.csv"
TRAIN_CLEAN_COLUMNS: tuple[str, ...] = (
    "date",
    "sku_id",
    "region",
    "month_idx",
    "year",
    "month",
    "series_no",
    "record_id",
    "product_family",
    "business_unit",
    "sku_description",
    "customer",
    "sales_channel",
    "row_status",
    "units_raw",
    "units_sold",
    "numeric_state",
    "fix_rule",
    "list_price_usd",
    "unit_price_usd",
    "revenue_usd",
)
_RECORD_COLUMNS = ("rec_num", "record_id", "customer", "sales_channel", "units_txt")
_NUMBER_COLUMNS = ("numeric_code", "numeric_state", "units_sold", "units_parsed", "revenue_usd")


@dataclass(frozen=True)
class TrainCleaning:
    """Results of steps 1-6.

    ``cells`` is ``train_clean`` plus two internal columns used by the oracle (``numeric_code``, ``units_parsed``);
    ``totals`` holds naive and cleaned unit / revenue totals for the report.
    """

    cells: pd.DataFrame
    blocks: pd.DataFrame
    price_table: pd.DataFrame
    decisions: pd.DataFrame
    fix_log: pd.DataFrame
    checks: list[Check]
    totals: dict[str, float]

    @property
    def train_clean(self) -> pd.DataFrame:
        return self.cells.loc[:, list(TRAIN_CLEAN_COLUMNS)]


def clean_train(
    train: pd.DataFrame,
    master: pd.DataFrame,
    bu: BusinessUnitCorrection,
    lifecycle: pd.DataFrame,
    vocab: Vocabularies,
) -> TrainCleaning:
    """Run steps 1-6 on the raw text frame of ``train.csv``."""
    keys = keys_step.build_keys(train, master, bu.business_unit, vocab)
    dedup = dedup_step.deduplicate(keys, train)
    kept = keys[dedup.kept]
    blocks = record_id_step.derive_blocks(kept, lifecycle)
    records = record_id_step.apply_decode(kept, blocks)
    witness = record_id_step.witness_blank_regions(records, lifecycle)
    blank = records["region_label"].isna()
    if not (witness[blank] == records.loc[blank, "region"]).all():
        raise AssertionError("blank-region witness (methods B and C) disagrees with the Record_ID decode")

    records = records.assign(price_raw=pd.to_numeric(records["price_txt"], errors="raise"))
    price_table = prices_step.build_price_table(records)
    records = _with_prices(records, price_table)
    numbers = numeric_step.clean_numbers(records)
    raw_codes = numeric_step.clean_numbers(_with_prices(keys, price_table))["numeric_code"]

    cells = grid_step.attach_records(
        grid_step.build_grid(blocks),
        pd.concat([records.loc[:, list(_RECORD_COLUMNS)], numbers.loc[:, list(_NUMBER_COLUMNS)]], axis=1),
        master,
        bu.business_unit,
    )
    cells = _with_prices(cells.assign(year=2019 + cells["month_idx"] // 12, month=cells["month_idx"] % 12 + 1), price_table)
    decisions = dedup.decisions.merge(records[["rec_num", "date", "sku_id", "region"]], on="rec_num", how="left", validate="many_to_one")

    fix_log = assemble_fix_log(
        [
            keys_step.key_fix_log(records),
            dedup_step.dedup_fix_log(decisions),
            record_id_step.region_fix_log(records, blocks, witness),
            numeric_step.numeric_fix_log(records, numbers),
        ]
    )
    cells = _finish_cells(cells, fix_log)
    totals = _totals(numbers)
    checks = [
        *keys_step.key_checks(keys, dedup.kept),
        *dedup_step.dedup_checks(keys, dedup),
        *record_id_step.block_checks(blocks, records),
        *record_id_step.region_checks(records, int((keys["region_kind"] == "blank").sum()), witness),
        *grid_step.grid_checks(cells, blocks),
        *prices_step.price_checks(price_table),
        *numeric_step.numeric_checks(records, numbers, raw_codes),
        _totals_check(numbers, totals),
    ]
    return TrainCleaning(cells, blocks, price_table, decisions, fix_log, checks, totals)


def _with_prices(frame: pd.DataFrame, price_table: pd.DataFrame) -> pd.DataFrame:
    """Attach the canonical list / invoice price of each row's SKU x price period (null where none exists)."""
    period = prices_step.price_period(frame["year"], frame["month"])
    lookup = price_table.set_index(["sku_id", "period"])
    index = pd.MultiIndex.from_arrays([frame["sku_id"], period])
    return frame.assign(
        list_price_usd=lookup["list_price_usd"].reindex(index).to_numpy(),
        invoice_price_usd=lookup["invoice_price_usd"].reindex(index).to_numpy(),
    )


def _finish_cells(cells: pd.DataFrame, fix_log: pd.DataFrame) -> pd.DataFrame:
    """Contract columns: ``units_raw``, ``unit_price_usd`` and ``fix_rule`` (error and format rules, in step order)."""
    fixes = fix_log[(fix_log["file"] == FILE) & (fix_log["method"] != "convention") & fix_log["record_id"].notna()]
    rules = fixes.groupby("record_id", sort=False)["rule"].agg(lambda r: "|".join(dict.fromkeys(r)))
    out = cells.rename(columns={"units_txt": "units_raw"})
    out["unit_price_usd"] = out.pop("invoice_price_usd")
    out["fix_rule"] = out["record_id"].map(rules).astype("str")
    out["revenue_usd"] = out["revenue_usd"].astype("float64")
    out["units_sold"] = out["units_sold"].astype("Int64")
    return out.sort_values(["series_no", "month_idx"], kind="stable").reset_index(drop=True)


def _totals(numbers: pd.DataFrame) -> dict[str, float]:
    naive_revenue = numbers["revenue_raw_c"].sum() / 100
    return {
        "units_naive": float(numbers["units_parsed"].sum()),
        "units_clean": float(numbers["units_sold"].sum()),
        "revenue_naive_usd": round(float(naive_revenue), 2),
        "revenue_clean_usd": round(float(numbers["revenue_usd"].sum()), 2),
    }


def _totals_check(numbers: pd.DataFrame, totals: dict[str, float]) -> Check:
    exact = int(numbers["numeric_code"].isin(["N1", "N2", "N3", "N4", "N5", "N6"]).sum())
    return invariant_check(
        check_id="TRN-NUM-TOTALS",
        file=FILE,
        rule="2.2",
        title="Units and revenue: naive coercion vs cleaned",
        description=(
            f"Naive numeric coercion (commas stripped, blanks and '-' ignored, signs kept): {totals['units_naive']:,.0f} units, "
            f"USD {totals['revenue_naive_usd'] / 1e6:,.2f} M. Cleaned: {totals['units_clean']:,.0f} units "
            f"(pack-of-10 rows at 10 x booked, ERP blanks excluded), USD {totals['revenue_clean_usd'] / 1e6:,.2f} M. "
            f"{exact:,} records have units restored exactly."
        ),
        dimension="accuracy",
        unit="units",
        checked=int(totals["units_clean"]),
        violations_before=0,
        violations_after=0,
        action="report",
        severity="info",
        expected_key="num.units_clean_total",
        breakdown={"units_naive_total": int(totals["units_naive"]), "units_exact_recovered": exact},
        breakdown_expected_prefix="num",
    )
