"""Outputs of the demand stage: overlay, unconstrained demand, cycles, account events, missing cells and the
forecast-window grid, asserted against the dossier's numbers (T1-T3, T9)."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from celeris.config import EXPECTED
from celeris.tables import columns_through
from .conftest import RESEARCH

# dossier 5.2: the 16 lost accounts and their first silent month
LOST_ACCOUNTS = {
    ("HYD-081", "North America"): "2025-04", ("PTC-002", "North America"): "2025-06", ("THM-015", "North America"): "2025-07",
    ("ELA-040", "North America"): "2025-08", ("CSS-062", "Asia Pacific"): "2025-10", ("CSS-045", "India"): "2025-11",
    ("ELA-084", "India"): "2025-11", ("HYD-061", "Europe"): "2025-11", ("PMP-076", "India"): "2025-11",
    ("PTC-003", "Europe"): "2025-11", ("PTC-038", "North America"): "2025-11", ("BSS-034", "North America"): "2025-12",
    ("CSS-085", "Europe"): "2025-12", ("BSS-082", "India"): "2026-01", ("ELA-055", "Latin America"): "2026-01",
    ("PMP-022", "India"): "2026-01",
}
# TS finding 6: the 23 customer switches and the first month of the new customer
SWITCHES = {
    ("CSS-085", "India"): "2022-07", ("BSS-001", "Asia Pacific"): "2022-09", ("HYD-055", "Asia Pacific"): "2022-09",
    ("HYD-013", "North America"): "2022-10", ("PMP-047", "North America"): "2023-01", ("THM-017", "Europe"): "2023-01",
    ("THM-026", "Latin America"): "2023-05", ("PMP-032", "Europe"): "2023-09", ("PMP-074", "Latin America"): "2023-12",
    ("BSS-024", "Asia Pacific"): "2024-04", ("HYD-001", "Asia Pacific"): "2024-05", ("HYD-009", "Europe"): "2024-05",
    ("PTC-034", "India"): "2024-05", ("ELA-063", "India"): "2024-06", ("HYD-059", "India"): "2024-10",
    ("ELA-023", "Europe"): "2024-11", ("CSS-066", "Latin America"): "2024-12", ("BSS-081", "North America"): "2025-01",
    ("THM-003", "Latin America"): "2025-01", ("THM-020", "India"): "2025-01", ("THM-047", "India"): "2025-01",
    ("PMP-015", "Europe"): "2025-04", ("PTC-050", "Europe"): "2025-05",
}
UNKNOWN_METHODS = {"missing_onphase_unknown", "missing_after_backorder", "erp_unknown_order", "D3_hidden_second_month"}


@pytest.fixture(scope="module")
def stockouts(pipeline_run) -> pd.DataFrame:
    return pipeline_run.csv("stockouts_clean.csv")


@pytest.fixture(scope="module")
def events(pipeline_run) -> pd.DataFrame:
    return pipeline_run.csv("account_events.csv")


def test_train_clean_contract(cells: pd.DataFrame) -> None:
    assert tuple(cells.columns) == columns_through("anomalies")
    assert len(cells) == EXPECTED["grid.cells"]
    for column in ("demand_uc", "backorder_in", "lost_units", "demand_filled", "carry_weight", "expected_demand", "train_weight"):
        assert str(cells[column].dtype) == "float64", column
    for column in ("is_stockout_listed", "is_stockout_inferred", "on_phase", "is_structural_zero", "is_lost_account", "is_imputed", "is_one_off"):
        assert str(cells[column].dtype) == "bool", column
    assert cells["demand_filled"].notna().all()


def test_overlay_makes_every_listed_cell_equal_shipped(cells: pd.DataFrame, stockouts: pd.DataFrame) -> None:
    so = stockouts[["date", "sku_id", "region", "requested_units", "shipped_units"]]
    listed = cells.merge(so, on=["date", "sku_id", "region"], validate="one_to_one")
    assert len(listed) == EXPECTED["stockouts.rows"]
    assert (listed["units_sold"].astype("int64") == listed["shipped_units"]).all()
    assert (listed["demand_uc"] == listed["requested_units"]).all()
    missing = cells[cells["row_status"] == "missing_row"]
    assert missing["units_sold"].notna().sum() == EXPECTED["demand.overlay.missing_row"]
    known = cells[cells["units_sold"].notna()]
    units_c = known["units_sold"].astype("int64").to_numpy() * np.rint(known["unit_price_usd"].to_numpy() * 100).astype("int64")
    assert (units_c == np.rint(known["revenue_usd"].to_numpy() * 100).astype("int64")).all()


def test_fix_log_replays_overlay_onto_raw(raw_train: pd.DataFrame, cells: pd.DataFrame, pipeline_run) -> None:
    log = pd.read_parquet(pipeline_run.quality / "fix_log.parquet")
    latest = raw_train.sort_values(["Record_ID", "Load_Timestamp"], kind="stable").drop_duplicates("Record_ID", keep="last")
    observed = cells[cells["row_status"] == "observed"].set_index("record_id")["units_sold"]
    changes = log[(log["file"] == "train.csv") & (log["column"] == "Units_Sold")].sort_values("step", kind="stable")
    changes = changes.dropna(subset=["record_id"]).drop_duplicates("record_id", keep="last").set_index("record_id")["after"]
    replayed = latest.set_index("Record_ID")["Units_Sold"].reindex(observed.index).astype("object")
    replayed.loc[changes.index] = changes
    assert (replayed.fillna("<null>") == observed.astype("string").astype("object").fillna("<null>")).all()
    overlay = log[log["rule"] == "S0"]
    assert set(overlay["column"]) == {"Units_Sold", "Revenue_USD"} and (overlay["step"] == 7).all()


def test_unconstrained_method_counts(cells: pd.DataFrame) -> None:
    counts = cells["demand_uc_method"].value_counts()
    for key, expected in EXPECTED.items():
        if key.startswith("demand.method."):
            assert counts.get(key.removeprefix("demand.method."), 0) == expected, key
    assert counts["spill_removed"] == 10 and counts["erp_unknown_order"] == 330


def test_stockout_accounting_identities(cells: pd.DataFrame, stockouts: pd.DataFrame) -> None:
    so = stockouts[["date", "sku_id", "region", "requested_units", "carried_in_units", "shipped_units"]]
    listed = cells.merge(so, on=["date", "sku_id", "region"])
    shortfall = listed["requested_units"] + listed["carried_in_units"] - listed["shipped_units"]
    assert np.allclose(listed["backorder_out"] + listed["lost_units"], shortfall)
    assert np.allclose(listed["backorder_in"], listed["carried_in_units"])
    s2 = cells[cells["demand_uc_method"] == "S2_carry_removed"]
    assert np.allclose(s2["demand_uc"] + s2["backorder_in"], s2["units_sold"].astype("float64"))
    s5 = cells[cells["demand_uc_method"] == "S5_semiconductor_imputed"]
    assert (s5["product_family"] == "Electrical Assemblies").all() and s5["date"].between("2021-03", "2022-09").all()
    assert ((s5["demand_uc"] >= s5["units_sold"].astype("float64") - s5["backorder_in"]) | (s5["units_sold"] == 0)).all()
    assert (s5.loc[s5["units_sold"] == 0, "demand_uc"] == 0).all()


def test_uplift_matches_the_dossier(cells: pd.DataFrame) -> None:
    both = cells[cells["demand_uc"].notna() & cells["units_sold"].notna()]
    assert both["demand_uc"].sum() / both["units_sold"].astype("float64").sum() - 1 == pytest.approx(0.0091, abs=0.0002)
    ela = both[(both["product_family"] == "Electrical Assemblies") & (both["year"] == 2021)]
    assert ela["demand_uc"].sum() / ela["units_sold"].astype("float64").sum() - 1 == pytest.approx(0.448, abs=0.002)
    assert cells["lost_units"].sum() == pytest.approx(106_925, abs=1)


def test_offphase_zeros_stay_zero_and_unknown_cells_stay_nan(cells: pd.DataFrame) -> None:
    off = cells[~cells["on_phase"] & ~cells["is_stockout_listed"]]
    assert (off["demand_uc"] == 0).all()
    unknown = cells["demand_uc_method"].isin(UNKNOWN_METHODS) & cells["demand_uc"].isna()
    assert cells["demand_uc"].isna().sum() == unknown.sum()
    assert cells.loc[unknown, "is_imputed"].all() and (cells.loc[unknown, "demand_filled"] > 0).mean() > 0.99
    assert (cells.loc[cells["demand_uc"].notna(), "demand_filled"] == cells.loc[cells["demand_uc"].notna(), "demand_uc"]).all()


def test_missing_rows_are_treated_from_the_cycle(cells: pd.DataFrame) -> None:
    missing = cells[cells["row_status"] == "missing_row"]
    methods = missing["demand_uc_method"].value_counts()
    assert methods["S1_listed_requested"] == EXPECTED["demand.missing.listed"]
    assert methods["missing_offphase_zero"] + methods["missing_lost_tail_zero"] == EXPECTED["demand.missing.zero"]
    assert methods["missing_onphase_unknown"] + methods["missing_after_backorder"] == EXPECTED["demand.missing.unknown"]
    zero = missing[missing["demand_uc_method"] == "missing_offphase_zero"]
    assert (~zero["on_phase"]).all() and (zero["demand_uc"] == 0).all()
    assert missing.loc[missing["demand_uc_method"] == "missing_onphase_unknown", "on_phase"].all()


def test_cycle_census_and_accumulation(cells: pd.DataFrame, pipeline_run) -> None:
    state = pipeline_run.csv("series_state.csv")
    kinds = state["cycle_kind"].value_counts()
    for kind in "MABQT":
        assert kinds[kind] == EXPECTED[f"demand.cycle.{kind}"]
    on = cells[cells["on_phase"]]
    assert set(on["accum_span"]) <= {1, 2, 3}
    after_shutdown = on[(on["cycle_kind"] == "A") & (on["accum_span"] == 2)]
    assert (after_shutdown["carry_weight"] == 0.5).all() and len(after_shutdown) > 4000
    assert (cells.loc[~cells["on_phase"], "accum_span"] == 0).all()
    stable = state.loc[state["cycle_change_month"].isna(), "series_no"]
    start = state.set_index("series_no")["start_date"]
    quarterly = on[(on["cycle_kind"] == "Q") & on["series_no"].isin(stable)]
    mature = quarterly["date"] > quarterly["series_no"].map(start).map(lambda d: f"{int(d[:4]) + (int(d[5:]) + 2) // 12}-{(int(d[5:]) + 2) % 12 + 1:02d}")
    assert (quarterly.loc[mature, "accum_span"] == 3).all()


def test_cycle_changes(events: pd.DataFrame) -> None:
    changes = events[events["event_type"] == "cycle_change"]
    assert len(changes) == EXPECTED["demand.cycle_changes"]
    assert changes["month"].between("2022-01", "2023-11").all()
    directions = (changes["before"].str[0] + ">" + changes["after"].str[0]).value_counts()
    for direction, n in directions.items():
        assert n == EXPECTED[f"demand.cycle_change.{direction}"]
    reference = RESEARCH / "panel-missing-zeros" / "cycle_changes_detail.csv"
    if reference.exists():
        ref = pd.read_csv(reference)
        mine = set(zip(changes["sku_id"], changes["region"], changes["month"], strict=True))
        assert mine == set(zip(ref["sku"], ref["region"], ref["viterbi_change"], strict=True))


def test_lost_accounts_and_switches(events: pd.DataFrame, cells: pd.DataFrame) -> None:
    lost = events[events["event_type"] == "lost_account"]
    assert dict(zip(zip(lost["sku_id"], lost["region"], strict=True), lost["month"], strict=True)) == LOST_ACCOUNTS
    assert cells["is_lost_account"].sum() == EXPECTED["demand.lost.tail_cells"]
    assert lost["level_before"].sum() == pytest.approx(1_009, rel=0.03)
    switches = events[events["event_type"] == "customer_switch"]
    assert dict(zip(zip(switches["sku_id"], switches["region"], strict=True), switches["month"], strict=True)) == SWITCHES
    adjusted = switches["level_ratio_region_adjusted"]
    assert (adjusted.between(0.45, 2.3)).all() and ((adjusted < 0.96) | (adjusted > 1.2)).sum() >= 20


def test_customer_history_supports_joins_at_time(pipeline_run) -> None:
    history = pipeline_run.csv("customer_history.csv")
    runs = history.groupby("series_no")["run"].max()
    assert len(runs) == EXPECTED["grid.series"] and (runs == 2).sum() == EXPECTED["demand.customer_switches"] and runs.max() == 2
    blocks = pipeline_run.csv("series_blocks.csv").set_index(["sku_id", "region"])["series_no"]
    hyd009 = history[history["series_no"] == blocks[("HYD-009", "Europe")]].set_index("run")["customer"]
    assert hyd009[1] == "Nexon Motor Group" and hyd009[2] == "Apex Tier One"


def test_test_grid_structure(test_grid: pd.DataFrame) -> None:
    assert len(test_grid) == EXPECTED["test.rows"]
    reasons = test_grid["structural_zero_reason"].value_counts()
    assert test_grid["is_structural_zero"].sum() == EXPECTED["test_grid.structural_zero"]
    for reason, n in reasons.items():
        assert n == EXPECTED[f"test_grid.zero.{reason}"]
    rows = test_grid[~test_grid["is_structural_zero"] & ~test_grid["is_cold_start"]]
    assert (rows["accum_span"] == 1).sum() == EXPECTED["test_grid.accum.1_month"]
    assert ((rows["accum_span"] == 2) & (rows["carry_weight"] == 0.5)).sum() == EXPECTED["test_grid.accum.after_shutdown"]
    assert ((rows["accum_span"] == 2) & (rows["carry_weight"] == 1.0)).sum() == EXPECTED["test_grid.accum.2_months"]
    assert (rows["accum_span"] == 3).sum() == EXPECTED["test_grid.accum.3_months"]
    cold = test_grid[test_grid["is_cold_start"]]
    assert len(cold) == EXPECTED["test_grid.cold_start_rows"] and cold.groupby(["sku_id", "region"]).ngroups == EXPECTED["test.cold_start_series"]
    assert (cold["accum_span"] == 1).all() and cold["p_order"].between(0.5, 1).all()
    post = test_grid[test_grid["is_post_eol"]]
    assert post.groupby("sku_id").size().to_dict() == {"PMP-003": 54, "PTC-005": 72, "THM-001": 30}
    assert (test_grid.loc[test_grid["is_lost_account"] | test_grid["is_post_eol"], "p_order"] == 0).all()
    uncertain = test_grid[(test_grid["structural_zero_reason"] == "off_phase") & (test_grid["cycle_posterior"] < 0.99)]
    assert set(zip(uncertain["sku_id"], uncertain["region"], uncertain["date"], strict=True)) == {
        ("PMP-019", "Europe", "2027-08"), ("ELA-017", "India", "2027-06"), ("THM-011", "Asia Pacific", "2027-06")}
    assert test_grid["is_eol_phaseout"].sum() == 108


def test_test_grid_keeps_test_order(test_grid: pd.DataFrame) -> None:
    from celeris.config import Paths
    from celeris.io import read_raw_csv

    test = read_raw_csv(Paths().raw("test.csv"))
    assert (test_grid["date"].to_numpy() == test["Date"].to_numpy()).all()
    assert (test_grid["sku_id"].to_numpy() == test["SKU_ID"].to_numpy()).all()
    assert (test_grid["customer"].to_numpy() == test["Customer_Name"].to_numpy()).all()


def test_research_crosschecks(pipeline_run, test_grid: pd.DataFrame) -> None:
    table = RESEARCH / "panel-missing-zeros" / "series_table.csv"
    mask = RESEARCH / "panel-missing-zeros" / "test_phase_mask.csv"
    if not (table.exists() and mask.exists()):
        pytest.skip("research artefacts absent")
    state = pipeline_run.csv("series_state.csv")
    ref = pd.read_csv(table, low_memory=False)
    merged = state.merge(ref[ref["in_train"]], left_on=["sku_id", "region"], right_on=["sku", "region"])
    assert len(merged) == EXPECTED["grid.series"] and (merged["cycle_pattern"] == merged["cycle_now"]).all()
    phase = pd.read_csv(mask, low_memory=False)
    joined = test_grid.merge(phase, left_on=["date", "sku_id", "region"], right_on=["Date", "SKU_ID", "Region"])
    assert len(joined) == EXPECTED["test.rows"] and (joined["is_structural_zero"] == joined["force_zero"]).all()
