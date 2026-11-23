"""Independent validation of the train fixes against ``inventory_stockouts.csv`` (dossier 2.2, K2, 7.1 step 14 T3).

``Shipped_Units`` is by definition what ``train.csv`` should show as Units_Sold, and the stock-out file is formally
clean, so every listed cell is an oracle for the cleaning rules:

- cleaned units equal Shipped on every comparable record (5,761 / 5,761): all records except the 42 pack-of-10 rows
  (true quantity rounded away; ``units_raw = max(1, round_half_up(Shipped / 10))`` and the x10 fix is within +-5) and
  the one ERP blank whose size is unknown at this stage;
- the latest load equals Shipped on all 17 restated stock-out months, the superseded load on none (business rule 2);
- 26 listed cells have no record: they are deleted rows (missing_row) whose shipments the demand stage restores.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from celeris.quality.checks import Check, examples_from, invariant_check, issue_check

FILE = "inventory_stockouts.csv"
PACK_TOLERANCE = 5


def oracle_checks(cells: pd.DataFrame, stockouts: pd.DataFrame, decisions: pd.DataFrame) -> list[Check]:
    """Checks comparing the cleaned train grid with the stock-out file.

    ``cells`` is the cleaned grid (keys, ``row_status``, ``numeric_code``, ``units_sold``, ``units_parsed``);
    ``stockouts`` the cleaned stock-out file; ``decisions`` the de-duplication decisions with record keys.
    """
    keys = ["date", "sku_id", "region"]
    joined = stockouts[keys + ["shipped_units"]].merge(
        cells[keys + ["row_status", "record_id", "numeric_code", "units_sold", "units_parsed"]], on=keys, how="left",
        validate="one_to_one",
    )
    if joined["row_status"].isna().any():
        raise AssertionError("a stock-out row lies outside the train grid")
    with_record = joined[joined["row_status"] == "observed"]
    pack = with_record[with_record["numeric_code"] == "N11"]
    unknown = with_record[with_record["units_sold"].isna()]
    comparable = with_record[(with_record["numeric_code"] != "N11") & with_record["units_sold"].notna()]
    mismatched = comparable[comparable["units_sold"].astype("int64") != comparable["shipped_units"]]
    pack_rounding = np.maximum(1, np.floor(pack["shipped_units"] / 10 + 0.5)).astype("int64")
    pack_bad = pack[(pack["units_parsed"].astype("int64") != pack_rounding) | ((pack["units_sold"].astype("int64") - pack["shipped_units"]).abs() > PACK_TOLERANCE)]
    changed = comparable[~comparable["numeric_code"].isin(["N0", "N0z"])]
    by_state = {str(k): int(v) for k, v in changed["numeric_code"].value_counts().sort_index().items()}
    restated = _restatement_witness(decisions, stockouts)
    missing = joined[joined["row_status"] == "missing_row"]
    return [
        invariant_check(
            check_id="ORC-UNITS-SHIPPED",
            file=FILE,
            rule="2.2/N0-N13",
            title="Cleaned train units = Shipped_Units",
            description=(
                f"{len(comparable):,} comparable stock-out rows; the fixes that changed units or price on them, by state: "
                + ", ".join(f"{k} {v}" for k, v in by_state.items())
                + f". Pack rows: x10 within +-{PACK_TOLERANCE} and units_raw = max(1, round(Shipped / 10)) on {len(pack) - len(pack_bad)} / {len(pack)}."
            ),
            dimension="accuracy",
            unit="rows",
            checked=len(with_record),
            violations_before=int(len(mismatched) + len(pack_bad)),
            violations_after=int(len(mismatched) + len(pack_bad)),
            action="fail the build on any mismatch",
            expected_key="oracle.stockout_rows_with_record",
            examples=examples_from(mismatched, ["date", "sku_id", "region", "units_sold", "shipped_units"]),
            breakdown={"units_exact": len(comparable) - len(mismatched), "pack_rows": len(pack), "erp_unknown": len(unknown)},
            breakdown_expected_prefix="oracle",
        ),
        issue_check(
            check_id="ORC-MISSING-ROWS-LISTED",
            file=FILE,
            rule="K13",
            title="Listed stock-out months without a train record",
            description="Deleted train rows whose shipped quantity the stock-out file gives exactly (restored by the demand stage).",
            dimension="completeness",
            unit="rows",
            affected=len(missing),
            remaining=len(missing),
            severity="warning",
            action="Units := Shipped_Units, demand := Requested_Units (demand stage)",
            expected_key="oracle.missing_rows_listed",
            examples=examples_from(missing, ["date", "sku_id", "region", "shipped_units"]),
        ),
        invariant_check(
            check_id="ORC-RESTATEMENT-LATEST",
            file="train.csv",
            rule="K2",
            title="Latest load = Shipped_Units on restated stock-out months",
            description=(
                f"{len(restated)} restated records are listed: the latest version equals Shipped on "
                f"{int(restated['latest_matches'].sum())}, the superseded version on {int(restated['first_matches'].sum())}."
            ),
            dimension="accuracy",
            unit="records",
            checked=len(restated),
            violations_before=int((~restated["latest_matches"]).sum() + restated["first_matches"].sum()),
            violations_after=int((~restated["latest_matches"]).sum() + restated["first_matches"].sum()),
            action="business rule 2 confirmed by an independent source",
            expected_key="oracle.restated_listed",
            examples=examples_from(restated, ["record_id", "units_dropped", "units_kept", "shipped_units"]),
        ),
    ]


def _restatement_witness(decisions: pd.DataFrame, stockouts: pd.DataFrame) -> pd.DataFrame:
    superseded = decisions[decisions["kind"] == "superseded_load"]
    listed = superseded.merge(stockouts[["date", "sku_id", "region", "shipped_units"]], on=["date", "sku_id", "region"])
    return listed.assign(
        latest_matches=listed["units_kept"].astype("int64") == listed["shipped_units"],
        first_matches=listed["units_dropped"].astype("int64") == listed["shipped_units"],
    )
