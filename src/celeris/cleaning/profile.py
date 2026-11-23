"""Profiles of the two files that need no cleaning: ``test.csv`` and ``sample_submission.csv`` (dossier 2.3, 2.8).

``test.csv`` has clean keys (no blank, whitespace or label variant; ``YYYY-MM``; no duplicate key) and is the output
contract of the forecast: rows are never added, dropped or reordered. The checks record its shape and the facts the
forecast must honour (156 rows after an announced EOL, 10 cold-start series, the PMP-004 business unit agreeing with
the corrected master, customer and channel equal to the last training month).
"""

from __future__ import annotations

import pandas as pd

from celeris.cleaning.dates import CANONICAL_FORMAT, parse_month_column
from celeris.cleaning.keys import Vocabularies
from celeris.config import FORECAST_FIRST_MONTH, FORECAST_LAST_MONTH
from celeris.quality.checks import Check, examples_from, invariant_check

TEST_FILE = "test.csv"
SAMPLE_FILE = "sample_submission.csv"
SAMPLE_HEADER = ["Date", "SKU_ID", "Region", "Units_Sold_Forecast"]


def test_checks(test: pd.DataFrame, master: pd.DataFrame, master_clean: pd.DataFrame, cells: pd.DataFrame, vocab: Vocabularies) -> list[Check]:
    """Shape, label validity, lifecycle facts and continuity with the cleaned training grid."""
    parsed = parse_month_column(test["Date"])
    keys = ["Date", "SKU_ID", "Region"]
    invalid = int(
        (test == "").to_numpy().sum()
        + (parsed["date_format"] != CANONICAL_FORMAT).sum()
        + ((test["Year"].astype("int64") != parsed["year"]) | (test["Month"].astype("int64") != parsed["month"])).sum()
        + (~test["Date"].between(FORECAST_FIRST_MONTH, FORECAST_LAST_MONTH)).sum()
        + (~test["Region"].isin(vocab.regions)).sum()
        + (~test["Sales_Channel"].isin(vocab.channels)).sum()
        + (~test["SKU_ID"].isin(set(master["SKU_ID"]))).sum()
    )
    lifecycle = master_clean.set_index("sku_id")
    eol = test["SKU_ID"].map(lifecycle["eol_date"])
    post_eol = test[eol.notna() & (test["Date"] > eol.fillna(""))]
    before_launch = int((test["Date"] < test["SKU_ID"].map(lifecycle["launch_date_effective"])).sum())
    series = test.groupby(["SKU_ID", "Region"], sort=False).agg(
        n_customers=("Customer_Name", "nunique"), n_channels=("Sales_Channel", "nunique"),
        first_customer=("Customer_Name", "first"), first_channel=("Sales_Channel", "first"),
    )
    trained = cells[cells["customer"].notna()].groupby(["sku_id", "region"])[["customer", "sales_channel"]].last()
    trained.index.names = ["SKU_ID", "Region"]
    continuing = series.join(trained, how="inner")
    changed = int(((continuing["first_customer"] != continuing["customer"]) | (continuing["first_channel"] != continuing["sales_channel"])).sum())
    cold = series.index.difference(trained.index)
    bu_raw = test["SKU_ID"].map(master.set_index("SKU_ID")["Business_Unit"])
    bu_clean = test["SKU_ID"].map(lifecycle["business_unit"])
    return [
        invariant_check(
            check_id="TST-SHAPE",
            file=TEST_FILE,
            rule="2.3",
            title="Clean keys and valid labels",
            description="No blank cell, YYYY-MM dates inside 2026-11..2028-05, Year/Month consistent, canonical regions / channels, master SKUs, no duplicate key.",
            dimension="validity",
            unit="rows",
            checked=len(test),
            violations_before=invalid + int(test.duplicated(keys).sum()),
            violations_after=invalid + int(test.duplicated(keys).sum()),
            action="use as the forecast contract (keep rows and order)",
            expected_key="test.rows",
        ),
        invariant_check(
            check_id="TST-SERIES",
            file=TEST_FILE,
            rule="2.3",
            title="Series: continuing and cold starts",
            description=(
                f"{len(series):,} series: {len(continuing):,} continue a training series with the customer and channel of its "
                f"last training month ({changed} differ), {len(cold)} are cold starts of the planned launches; one customer and "
                "one channel per series."
            ),
            dimension="consistency",
            unit="series",
            checked=len(series),
            violations_before=changed + int(((series["n_customers"] > 1) | (series["n_channels"] > 1)).sum()),
            violations_after=changed + int(((series["n_customers"] > 1) | (series["n_channels"] > 1)).sum()),
            action="static customer / channel features; cold starts need a prior",
            expected_key="test.series",
            breakdown={"cold_start_series": len(cold)},
            breakdown_expected_prefix="test",
        ),
        invariant_check(
            check_id="TST-POST-EOL",
            file=TEST_FILE,
            rule="2.3",
            title="Rows after an announced EOL",
            description="PTC-005, PMP-003 and THM-001 keep rows after their EOL month; business rule 5 says no sales there. The EOL month itself is positive.",
            dimension="consistency",
            unit="rows",
            checked=len(post_eol),
            violations_before=0,
            violations_after=0,
            action="forecast 0 with P10 = P50 = P90 = 0 (forecast stage)",
            severity="info",
            expected_key="test.post_eol_rows",
            examples=examples_from(post_eol.drop_duplicates("SKU_ID"), ["Date", "SKU_ID", "Region"]),
        ),
        invariant_check(
            check_id="TST-BEFORE-LAUNCH",
            file=TEST_FILE,
            rule="2.3",
            title="No row before a launch",
            description="Cold-start rows start exactly at the launch month.",
            dimension="consistency",
            unit="rows",
            checked=len(test),
            violations_before=before_launch,
            violations_after=before_launch,
            action="none",
        ),
        invariant_check(
            check_id="TST-BU-MASTER",
            file=TEST_FILE,
            rule="S1",
            title="Business unit agrees with the master",
            description="Before: against the raw master (PMP-004 conflicts). After: against the corrected master.",
            dimension="consistency",
            unit="rows",
            checked=len(test),
            violations_before=int((test["Business_Unit"] != bu_raw).sum()),
            violations_after=int((test["Business_Unit"] != bu_clean).sum()),
            action="correct the master (S1)",
        ),
    ]


def sample_checks(sample: pd.DataFrame, test: pd.DataFrame) -> list[Check]:
    """Header, size, integer values and keys equal to the first test rows."""
    head = test.loc[: len(sample) - 1, ["Date", "SKU_ID", "Region"]].reset_index(drop=True)
    keys_differ = int((sample[["Date", "SKU_ID", "Region"]].reset_index(drop=True) != head).any(axis=1).sum())
    not_integer = int((~sample["Units_Sold_Forecast"].str.fullmatch(r"\d+")).sum())
    return [
        invariant_check(
            check_id="SMP-FORMAT",
            file=SAMPLE_FILE,
            rule="2.8",
            title="Submission format",
            description="Header Date,SKU_ID,Region,Units_Sold_Forecast; non-negative integers; keys are the first test rows in test order.",
            dimension="conformity",
            unit="rows",
            checked=len(sample),
            violations_before=keys_differ + not_integer + int(list(sample.columns) != SAMPLE_HEADER),
            violations_after=keys_differ + not_integer + int(list(sample.columns) != SAMPLE_HEADER),
            action="submission = 58,219 rows in test order, rounded to the nearest integer",
            expected_key="sample.rows",
        )
    ]
