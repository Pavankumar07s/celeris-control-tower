"""Schema, invariants, oracle checks and fix-log lineage on the outputs of a full ``clean`` run (T1-T3, T6)."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from celeris.cleaning.train import TRAIN_CLEAN_COLUMNS
from celeris.config import CHANNELS, EXPECTED, REGIONS
from celeris.quality.fixlog import FIX_LOG_COLUMNS

EXPECTED_DTYPES = {
    "month_idx": "int64",
    "series_no": "int64",
    "units_sold": "Int64",
    "unit_price_usd": "float64",
    "list_price_usd": "float64",
    "revenue_usd": "float64",
}


def test_train_clean_schema(train_clean: pd.DataFrame) -> None:
    assert tuple(train_clean.columns) == TRAIN_CLEAN_COLUMNS
    for column, dtype in EXPECTED_DTYPES.items():
        assert str(train_clean[column].dtype) == dtype, column
    assert set(train_clean["region"]) == set(REGIONS)
    assert set(train_clean["sales_channel"]) == set(CHANNELS)
    assert train_clean["sku_id"].str.fullmatch(r"[A-Z]{3}-\d{3}").all()
    assert train_clean["date"].between("2019-01", "2026-10").all()
    assert set(train_clean["row_status"]) == {"observed", "missing_row"}


def test_grid_is_records_plus_missing_rows(train_clean: pd.DataFrame) -> None:
    status = train_clean["row_status"].value_counts()
    assert len(train_clean) == EXPECTED["grid.cells"] == status["observed"] + status["missing_row"]
    assert status["observed"] == EXPECTED["train.records"]
    assert status["missing_row"] == EXPECTED["grid.missing"]
    assert not train_clean.duplicated(["date", "sku_id", "region"]).any()
    assert train_clean["record_id"].dropna().is_unique
    assert train_clean.groupby("series_no")["sales_channel"].nunique().max() == 1


def test_missing_rows_stay_missing(train_clean: pd.DataFrame) -> None:
    """Business rule 3: a missing row is never a zero."""
    missing = train_clean[train_clean["row_status"] == "missing_row"]
    assert missing["units_sold"].isna().all() and missing["revenue_usd"].isna().all()
    assert missing["record_id"].isna().all() and missing["numeric_state"].isna().all()


def test_units_are_non_negative_integers_and_revenue_reconciles(train_clean: pd.DataFrame) -> None:
    known = train_clean[train_clean["units_sold"].notna()]
    assert (known["units_sold"] >= 0).all()
    units_c = known["units_sold"].astype("int64").to_numpy() * np.rint(known["unit_price_usd"].to_numpy() * 100).astype("int64")
    assert (units_c == np.rint(known["revenue_usd"].to_numpy() * 100).astype("int64")).all()
    unknown = train_clean[(train_clean["row_status"] == "observed") & train_clean["units_sold"].isna()]
    assert (unknown["numeric_state"] == "N12_erp_units_lost").all()
    assert len(unknown) == EXPECTED["num.N12"]


def test_numeric_state_census(train_clean: pd.DataFrame) -> None:
    counts = train_clean["numeric_state"].str.split("_").str[0].value_counts()
    for code in ("N0", "N0z", *(f"N{i}" for i in range(1, 14))):
        assert counts.get(code, 0) == EXPECTED[f"num.{code}"], code


def test_erp_and_pack_states_sit_in_their_blocks(train_clean: pd.DataFrame) -> None:
    """Row-level rules, block-level evidence: every N12 / N11 / N10 record lies in its documented block."""
    erp = train_clean[train_clean["numeric_state"] == "N12_erp_units_lost"]
    assert set(erp["region"]) == {"Latin America"} and set(erp["sales_channel"]) == {"Aftermarket", "Export"}
    assert set(erp["date"]) == {"2023-03", "2023-04", "2023-05"}
    pack = train_clean[train_clean["numeric_state"] == "N11_pack_of_10"]
    assert set(pack["region"]) == {"India"} and set(pack["sales_channel"]) == {"Aftermarket"}
    assert pack["date"].between("2021-07", "2021-12").all()
    eur = train_clean[train_clean["numeric_state"] == "N10_price_in_eur"]
    assert set(eur["region"]) == {"Europe"} and set(eur["sales_channel"]) == {"Direct OEM"}
    assert eur["date"].between("2022-01", "2022-03").all()
    india_am = train_clean[(train_clean["region"] == "India") & (train_clean["sales_channel"] == "Aftermarket")]
    revenue = india_am.groupby("date")["revenue_usd"].sum()
    assert revenue.loc["2021-07":"2021-12"].between(1.9e6, 2.8e6).all()  # DD.v test: pack revenue not inflated


def test_units_match_shipped_units(clean_run, train_clean: pd.DataFrame) -> None:
    """Oracle (T3), recomputed here independently of the pipeline's own check."""
    stockouts = clean_run.csv("stockouts_clean.csv")
    joined = stockouts.merge(train_clean, on=["date", "sku_id", "region"], how="left")
    observed = joined[joined["row_status"] == "observed"]
    assert len(observed) == EXPECTED["oracle.stockout_rows_with_record"]
    assert (joined["row_status"] == "missing_row").sum() == EXPECTED["oracle.missing_rows_listed"]
    pack = observed["numeric_state"] == "N11_pack_of_10"
    comparable = observed[~pack & observed["units_sold"].notna()]
    assert len(comparable) == EXPECTED["oracle.units_exact"]
    assert (comparable["units_sold"].astype("int64") == comparable["shipped_units"]).all()
    packed = observed[pack]
    assert len(packed) == EXPECTED["oracle.pack_rows"]
    assert ((packed["units_sold"].astype("int64") - packed["shipped_units"]).abs() <= 5).all()
    booked = packed["units_raw"].astype("int64")
    assert (booked == np.maximum(1, np.floor(packed["shipped_units"] / 10 + 0.5))).all()


def test_latest_restatement_matches_shipped(clean_run) -> None:
    decisions = pd.read_csv(clean_run.quality / "dedup_decisions.csv", dtype={"units_kept": str, "units_dropped": str})
    stockouts = clean_run.csv("stockouts_clean.csv")
    listed = decisions[decisions["kind"] == "superseded_load"].merge(stockouts, on=["date", "sku_id", "region"])
    assert len(listed) == EXPECTED["oracle.restated_listed"]
    assert (listed["units_kept"].astype("int64") == listed["shipped_units"]).all()
    assert not (listed["units_dropped"].astype("int64") == listed["shipped_units"]).any()


def test_dedup_decisions(clean_run) -> None:
    decisions = pd.read_csv(clean_run.quality / "dedup_decisions.csv")
    kinds = decisions["kind"].value_counts()
    assert kinds["exact_duplicate"] == EXPECTED["train.dup_exact"]
    assert kinds["superseded_load"] == EXPECTED["train.dup_superseded"]
    superseded = decisions[decisions["kind"] == "superseded_load"]
    assert superseded["delay_days"].between(5, 24).all()
    assert decisions[["date", "sku_id", "region"]].notna().all().all()


def test_fix_log_schema_and_completeness(fix_log: pd.DataFrame) -> None:
    assert tuple(fix_log.columns) == FIX_LOG_COLUMNS
    assert set(fix_log["method"]) <= {"exact", "approximate", "unknown", "format", "derived", "convention", "dropped"}
    assert not fix_log.duplicated(["file", "record_id", "date", "sku_id", "column", "rule"]).any()
    macro = fix_log[(fix_log["file"] == "macro_indicators.csv") & (fix_log["column"] != "<row>")]
    assert len(macro) == EXPECTED["macro.cells_changed"]


@pytest.mark.parametrize(
    ("column", "raw_column", "clean_column"),
    [
        ("Units_Sold", "Units_Sold", "units_sold"),
        ("Region", "Region", "region"),
        ("SKU_ID", "SKU_ID", "sku_id"),
        ("Sales_Channel", "Sales_Channel", "sales_channel"),
        ("Customer_Name", "Customer_Name", "customer"),
        ("Product_Family", "Product_Family", "product_family"),
        ("SKU_Description", "SKU_Description", "sku_description"),
    ],
)
def test_fix_log_replays_onto_raw(raw_train: pd.DataFrame, train_clean: pd.DataFrame, fix_log: pd.DataFrame, column: str, raw_column: str, clean_column: str) -> None:
    """Raw value + fix log = cleaned value for every record: no change is unlogged and every logged change is applied."""
    latest = raw_train.assign(_ts=raw_train["Load_Timestamp"]).sort_values(["Record_ID", "_ts"], kind="stable")
    latest = latest.drop_duplicates("Record_ID", keep="last").set_index("Record_ID")[raw_column]
    observed = train_clean[train_clean["row_status"] == "observed"].set_index("record_id")[clean_column]
    changes = fix_log[(fix_log["file"] == "train.csv") & (fix_log["column"] == column)].set_index("record_id")["after"]
    replayed = latest.reindex(observed.index).astype("object")
    replayed.loc[changes.index] = changes
    expected = observed.astype("string").astype("object")
    assert (replayed.fillna("<null>") == expected.fillna("<null>")).all()


def test_fix_rule_column_lists_record_fixes(train_clean: pd.DataFrame, fix_log: pd.DataFrame) -> None:
    errors = fix_log[(fix_log["file"] == "train.csv") & (fix_log["method"] != "convention")]
    touched = set(errors["record_id"])
    flagged = set(train_clean.loc[train_clean["fix_rule"].notna(), "record_id"])
    assert touched == flagged


def test_price_table(clean_run) -> None:
    prices = clean_run.csv("price_table.csv")
    assert len(prices) == EXPECTED["price.cells"] and prices["sku_id"].nunique() == EXPECTED["price.skus"]
    assert not prices.duplicated(["sku_id", "period"]).any()
    surcharge = prices[prices["surcharge"]]
    ratio = surcharge["invoice_price_usd"] / surcharge["list_price_usd"]
    assert ratio.between(1.0599, 1.0601).all()
    assert (prices.loc[~prices["surcharge"], "invoice_price_usd"] == prices.loc[~prices["surcharge"], "list_price_usd"]).all()


def test_macro_clean(clean_run) -> None:
    macro = clean_run.csv("macro_clean.csv")
    assert len(macro) == EXPECTED["macro.clean_rows"] and macro["date"].is_unique
    assert macro.notna().all().all()
    by_date = macro.set_index("date")
    assert by_date.loc["2023-05", "ism_manufacturing_pmi"] == 47.9
    assert by_date.loc["2022-06", "ism_manufacturing_pmi"] == 52.7
    assert by_date.loc["2019-01", "auto_production_yoy_pct"] == -1.5
    assert by_date.loc["2024-01", "raw_material_cost_index"] == 100.0
    assert by_date.loc["2021-12", "raw_material_cost_index"] == pytest.approx(149.3 / 1.25)
    assert macro["is_forecast_window"].sum() == 19


def test_master_clean(clean_run) -> None:
    master = clean_run.csv("sku_master_clean.csv").set_index("sku_id")
    assert len(master) == EXPECTED["master.rows"]
    assert master.loc["PMP-004", "business_unit"] == "Advanced Manufacturing"
    assert master.loc["BSS-018", "launch_date"] == "2025-06" and master.loc["BSS-018", "launch_date_effective"] == "2025-02"
    assert master["bu_corrected"].sum() == 1 and master["launch_corrected"].sum() == 1
    assert (master["sku_tier"] == "core").sum() == EXPECTED["grid.core_skus"]
    assert master.groupby("product_family")["business_unit"].nunique().max() == 1


def test_events_and_stockouts_clean(clean_run) -> None:
    events = clean_run.csv("events_clean.csv")
    assert len(events) == EXPECTED["events.rows"]
    assert events["in_forecast_window"].sum() == EXPECTED["events.in_forecast_window"]
    helios = events.set_index("event_id").loc["EV-052"]
    assert helios["open_ended"] and helios["scope_customer"] == "Helios Auto Parts" and helios["scope_region"] == "India"
    assert events.loc[events["event_type"] == "Price Change", "announced_pct"].notna().all()
    stockouts = clean_run.csv("stockouts_clean.csv")
    assert len(stockouts) == EXPECTED["stockouts.rows"]
    identity = stockouts["requested_units"] + stockouts["carried_in_units"] - stockouts["shipped_units"] - stockouts["backordered_units"]
    assert (identity == stockouts["lost_units"]).all()


def test_dq_report_structure(clean_run) -> None:
    report = clean_run.report()
    assert {"report_version", "summary", "files", "checks"} <= set(report)
    assert {f["file"] for f in report["files"]} == {
        "train.csv", "test.csv", "sku_master.csv", "macro_indicators.csv", "events_calendar.csv",
        "inventory_stockouts.csv", "sample_submission.csv",
    }
    required = {"check_id", "file", "rule", "title", "description", "severity", "unit", "affected", "expected", "before", "after", "examples", "action"}
    for check in report["checks"]:
        assert required <= set(check), check["check_id"]
        assert len(check["examples"]) <= 5
        if check["expected"] is not None:
            assert check["affected"] == check["expected"], check["check_id"]
        if check["severity"] == "error":
            assert check["after"]["passed"], check["check_id"]
    assert report["summary"]["checks_failing_after"]["error"] == 0
    assert report["summary"]["train_units_naive"] == EXPECTED["num.units_naive_total"]
    assert round(report["summary"]["train_revenue_clean_usd"] / 1e6, 2) == 8575.85
    assert round(report["summary"]["train_revenue_naive_usd"] / 1e6, 2) == 8684.43
