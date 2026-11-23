"""Product master: validation and the two corrections the transactions prove (dossier 2.5, step 12).

- S1: PMP-004 carries ``Power & Drive Systems`` in the master, but all 534 train rows, all 114 test rows and the other
  86 PMP SKUs say ``Advanced Manufacturing``, and the problem statement says each family belongs to exactly one BU.
  Rule: the BU of a family is the majority BU of its SKUs in the master; a row that disagrees is corrected.
- S2: BSS-018's master launch (2025-06) is four months late: all four regional series start in 2025-02 with a normal
  launch ramp, and the Record_ID blocks only tile with 2025-02. Rule: the effective launch is the first month of the
  SKU's Record_ID block when that month precedes the master launch (sales before a launch prove the master wrong; the
  reverse would leave unexplained gaps and fail the tiling assertion in ``record_id``).

Everything else in the master is consistent (status vs dates, description = size class + `` mm `` + product name).
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from celeris.cleaning.dates import month_label, parse_month_text
from celeris.cleaning.dates import month_index as to_month_index
from celeris.config import LAST_TRAIN_MONTH_IDX, REGIONS
from celeris.quality.checks import Check, examples_from, invariant_check, issue_check
from celeris.quality.fixlog import fix_entries

FILE = "sku_master.csv"
STATUSES = ("Active", "Discontinued", "EOL Announced", "Planned Launch")
POWERTRAINS = ("EV", "ICE", "Universal")


@dataclass(frozen=True)
class BusinessUnitCorrection:
    """Master BU per SKU after S1 and the rows that were corrected."""

    business_unit: pd.Series
    corrected: pd.DataFrame


def family_by_prefix(master: pd.DataFrame) -> dict[str, str]:
    """SKU prefix -> Product_Family, asserting that each prefix belongs to exactly one family (K11)."""
    pairs = master.assign(prefix=master["SKU_ID"].str[:3])[["prefix", "Product_Family"]].drop_duplicates()
    if pairs["prefix"].duplicated().any():
        raise AssertionError("a SKU prefix maps to more than one product family")
    return dict(zip(pairs["prefix"], pairs["Product_Family"], strict=True))


def correct_business_units(master: pd.DataFrame) -> BusinessUnitCorrection:
    """S1: replace a master BU that disagrees with the majority BU of its family."""
    majority = master.groupby("Product_Family")["Business_Unit"].agg(lambda s: s.value_counts().index[0])
    if majority.value_counts().max() > 2:
        raise AssertionError("unexpected family -> BU structure")
    business_unit = master["Product_Family"].map(majority).astype("str")
    wrong = master["Business_Unit"] != business_unit
    corrected = master.loc[wrong, ["SKU_ID", "Product_Family", "Business_Unit"]].assign(
        business_unit_corrected=business_unit[wrong]
    )
    return BusinessUnitCorrection(business_unit=business_unit, corrected=corrected.reset_index(drop=True))


def lifecycle_months(master: pd.DataFrame) -> pd.DataFrame:
    """Launch and EOL as month indices (EOL null when none is planned), indexed by SKU."""
    launch = master["Launch_Date"].map(_month_idx)
    eol = master["EOL_Date"].map(lambda text: _month_idx(text) if text else np.nan)
    return pd.DataFrame(
        {"launch_idx": launch.astype("int64").to_numpy(), "eol_idx": eol.astype("float64").to_numpy()},
        index=pd.Index(master["SKU_ID"], name="sku_id"),
    )


def _month_idx(text: str) -> int:
    parsed = parse_month_text(text)
    return int(to_month_index(parsed.year, parsed.month))


def status_consistent(master: pd.DataFrame, lifecycle: pd.DataFrame) -> pd.Series:
    """Whether Lifecycle_Status agrees with the dates as seen at the end of training (2026-10), per master row."""
    launch = lifecycle["launch_idx"].to_numpy()
    eol = lifecycle["eol_idx"].to_numpy()
    expected = np.select(
        [launch > LAST_TRAIN_MONTH_IDX, np.isnan(eol), eol <= LAST_TRAIN_MONTH_IDX],
        ["Planned Launch", "Active", "Discontinued"],
        "EOL Announced",
    )
    return pd.Series(master["Lifecycle_Status"].to_numpy() == expected, index=master.index)


def build_master_clean(
    master: pd.DataFrame,
    bu: BusinessUnitCorrection,
    blocks: pd.DataFrame,
    test_skus: set[str],
) -> pd.DataFrame:
    """``sku_master_clean.csv``: corrected master plus lifecycle fields derived from the Record_ID blocks.

    ``launch_date_effective`` is the first block month when it precedes the master launch (S2), else the master launch.
    ``sku_tier`` is ``core`` for the 100 SKUs whose blocks list all six regions in the canonical order (dossier 4.2b),
    ``tail`` for the other SKUs with history and null for the planned launches.
    """
    per_sku = blocks.groupby("sku_id", sort=True).agg(
        first_idx=("start_idx", "min"),
        last_idx=("end_idx", "max"),
        n_train_series=("region", "size"),
        train_regions=("region", "|".join),
    )
    per_sku["sku_tier"] = np.where(per_sku["train_regions"] == "|".join(REGIONS), "core", "tail")
    out = pd.DataFrame(
        {
            "sku_id": master["SKU_ID"],
            "product_family": master["Product_Family"],
            "business_unit": bu.business_unit,
            "sku_description": master["SKU_Description"],
            "size_class": master["Size_Class"],
            "powertrain_application": master["Powertrain_Application"],
            "launch_date": master["Launch_Date"],
            "eol_date": master["EOL_Date"].replace("", None),
            "replaces_sku": master["Replaces_SKU"].replace("", None),
            "lifecycle_status": master["Lifecycle_Status"],
        }
    )
    joined = out.join(per_sku, on="sku_id")
    first_label = joined["first_idx"].map(lambda i: month_label(int(i)) if pd.notna(i) else None)
    launch_corrected = first_label.notna() & (first_label < joined["launch_date"])
    out["launch_date_effective"] = first_label.where(launch_corrected, joined["launch_date"]).astype("str")
    out["first_train_month"] = first_label.astype("str")
    out["last_train_month"] = joined["last_idx"].map(lambda i: month_label(int(i)) if pd.notna(i) else None)
    out["n_train_series"] = joined["n_train_series"].astype("Int64")
    out["train_regions"] = joined["train_regions"]
    out["sku_tier"] = joined["sku_tier"]
    out["in_test"] = out["sku_id"].isin(test_skus)
    out["bu_corrected"] = out["sku_id"].isin(set(bu.corrected["SKU_ID"]))
    out["launch_corrected"] = launch_corrected.to_numpy()
    column_order = [
        "sku_id",
        "product_family",
        "business_unit",
        "sku_description",
        "size_class",
        "powertrain_application",
        "launch_date",
        "launch_date_effective",
        "eol_date",
        "replaces_sku",
        "lifecycle_status",
        "sku_tier",
        "n_train_series",
        "train_regions",
        "first_train_month",
        "last_train_month",
        "in_test",
        "bu_corrected",
        "launch_corrected",
    ]
    return out.loc[:, column_order].sort_values("sku_id", kind="stable").reset_index(drop=True)


def master_fix_log(master_clean: pd.DataFrame, master: pd.DataFrame) -> pd.DataFrame:
    """Fix-log rows for S1 (Business_Unit) and S2 (effective launch)."""
    raw = master.set_index("SKU_ID")
    bu_rows = master_clean[master_clean["bu_corrected"]]
    launch_rows = master_clean[master_clean["launch_corrected"]]
    return pd.concat(
        [
            fix_entries(
                bu_rows,
                file=FILE,
                step=12,
                rule="S1",
                column="Business_Unit",
                method="exact",
                raw_value=bu_rows["sku_id"].map(raw["Business_Unit"]),
                before=bu_rows["sku_id"].map(raw["Business_Unit"]),
                after=bu_rows["business_unit"],
                evidence='{"rule":"one business unit per family; train and test rows agree with the family BU"}',
            ),
            fix_entries(
                launch_rows,
                file=FILE,
                step=12,
                rule="S2",
                column="Launch_Date",
                method="exact",
                raw_value=launch_rows["launch_date"],
                before=launch_rows["launch_date"],
                after=launch_rows["launch_date_effective"],
                evidence=launch_rows["first_train_month"].map(
                    lambda m: f'{{"first_record_id_block_month":"{m}","kept_as":"launch_date_effective"}}'
                ),
            ),
        ],
        ignore_index=True,
    )


def master_checks(
    master: pd.DataFrame,
    master_clean: pd.DataFrame,
    lifecycle: pd.DataFrame,
    rows_before_master_launch: int,
) -> list[Check]:
    """Data-quality checks on ``sku_master.csv`` (S1, S2 and the structural validations of dossier 2.5)."""
    status_ok = status_consistent(master, lifecycle)
    description_ok = [
        desc.startswith(f"{size} mm ")
        for desc, size in zip(master["SKU_Description"], master["Size_Class"], strict=True)
    ]
    replaces = master["Replaces_SKU"].replace("", None).dropna()
    bu_rows = master_clean[master_clean["bu_corrected"]]
    launch_rows = master_clean[master_clean["launch_corrected"]]
    checks = [
        invariant_check(
            check_id="MST-UNQ-001",
            file=FILE,
            rule="2.5",
            title="One row per SKU",
            description="SKU_ID is unique and follows AAA-NNN.",
            dimension="uniqueness",
            unit="rows",
            checked=len(master),
            violations_before=int(master["SKU_ID"].duplicated().sum() + (~master["SKU_ID"].str.match(r"^[A-Z]{3}-\d{3}$")).sum()),
            violations_after=0,
            action="none",
            expected_key="master.rows",
        ),
        issue_check(
            check_id="MST-S1-BU",
            file=FILE,
            rule="S1",
            title="Business unit contradicts the family",
            description="PMP-004 says Power & Drive Systems; its family, all train rows and all test rows say Advanced Manufacturing.",
            dimension="consistency",
            unit="rows",
            affected=len(bu_rows),
            action="Business_Unit := the family's business unit",
            expected_key="master.bu_corrections",
            examples=examples_from(bu_rows, ["sku_id", "business_unit"]),
        ),
        issue_check(
            check_id="MST-S2-LAUNCH",
            file=FILE,
            rule="S2",
            title="Launch date later than the first sales",
            description=(
                f"BSS-018's master launch is 2025-06 but its four series start in 2025-02 ({rows_before_master_launch} "
                "records before the master launch); the Record_ID blocks only tile with 2025-02."
            ),
            dimension="consistency",
            unit="rows",
            affected=len(launch_rows),
            action="launch_date_effective := first Record_ID block month; the 16 early records are kept",
            expected_key="master.launch_corrections",
            examples=examples_from(launch_rows, ["sku_id", "launch_date", "launch_date_effective"]),
        ),
        invariant_check(
            check_id="MST-STATUS-001",
            file=FILE,
            rule="2.5",
            title="Lifecycle status agrees with the dates",
            description="Planned Launch = launch after 2026-10; Active = no EOL; Discontinued = EOL by 2026-10; EOL Announced = later EOL.",
            dimension="consistency",
            unit="rows",
            checked=len(master),
            violations_before=int((~status_ok).sum()),
            violations_after=int((~status_ok).sum()),
            action="none",
        ),
        invariant_check(
            check_id="MST-DESC-001",
            file=FILE,
            rule="2.5",
            title="Description starts with the size class",
            description="SKU_Description = Size_Class + ' mm ' + product name.",
            dimension="consistency",
            unit="rows",
            checked=len(master),
            violations_before=len(master) - int(sum(description_ok)),
            violations_after=len(master) - int(sum(description_ok)),
            action="none",
        ),
        invariant_check(
            check_id="MST-VAL-001",
            file=FILE,
            rule="2.5",
            title="Valid powertrain, status and successor references",
            description="Powertrain in {EV, ICE, Universal}, status in the four documented values, Replaces_SKU refers to a master SKU.",
            dimension="validity",
            unit="rows",
            checked=len(master),
            violations_before=int(
                (~master["Powertrain_Application"].isin(POWERTRAINS)).sum()
                + (~master["Lifecycle_Status"].isin(STATUSES)).sum()
                + (~replaces.isin(set(master["SKU_ID"]))).sum()
            ),
            violations_after=0,
            action="none",
        ),
    ]
    for status in STATUSES:
        count = int((master["Lifecycle_Status"] == status).sum())
        checks.append(
            invariant_check(
                check_id=f"MST-STATUS-{status.upper().replace(' ', '-')}",
                file=FILE,
                rule="2.5",
                title=f"SKUs with status {status}",
                description=f"Profile: number of master rows with Lifecycle_Status = {status}.",
                dimension="validity",
                unit="rows",
                checked=count,
                violations_before=0,
                violations_after=0,
                action="none",
                severity="info",
                expected_key=f"master.status.{status}",
            )
        )
    return checks
