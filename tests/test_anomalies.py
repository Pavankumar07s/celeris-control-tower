"""Outputs of the anomalies stage: one-offs, masks, the anomaly register and the series profile (T2, T4)."""

from __future__ import annotations

import json

import numpy as np
import pandas as pd
import pytest

from celeris.anomalies.expectation import one_off_rule
from celeris.anomalies.masks import TRAIN_MASK_ORDER
from celeris.anomalies.register import REGISTER_COLUMNS
from celeris.anomalies.stage import REQUIRED_TYPES
from celeris.config import EXPECTED

from .conftest import RESEARCH


@pytest.fixture(scope="module")
def episodes(register: pd.DataFrame) -> pd.DataFrame:
    return register[register["level"] == "episode"].set_index("anomaly_id")


@pytest.fixture(scope="module")
def profile(pipeline_run) -> pd.DataFrame:
    return pd.read_csv(pipeline_run.paths.anomalies_dir / "series_profile.csv", keep_default_na=False, na_values=[""])


def test_one_off_rule_fixtures() -> None:
    demand = np.array([[36.0, 96.0, 96.0, 8.0, 99.0]])
    expected = np.array([[10.0, 30.0, 30.0, 2.0, 30.0]])
    oem = one_off_rule(demand, expected, np.array(["Direct OEM"]))
    aftermarket = one_off_rule(demand, expected, np.array(["Aftermarket"]))
    assert oem.tolist() == [[True, True, True, False, True]]  # 3.6x; 3.2x OEM with mu >= 25; 4x but only 6 units above
    assert aftermarket.tolist() == [[True, False, False, False, False]]


def test_one_offs_are_real_stocking_channel_orders(cells: pd.DataFrame, register: pd.DataFrame) -> None:
    one_off = cells[cells["is_one_off"]]
    assert 438 <= len(one_off) <= 541
    assert one_off["sales_channel"].isin(["Direct OEM", "Tier-1 Distributor"]).mean() >= 0.99
    assert (one_off["demand_uc"] > 3 * one_off["expected_demand"]).all() and one_off["on_phase"].all()
    assert (one_off["train_mask"].notna()).all()
    cell_rows = register[(register["type"] == "RE.ONE_OFF_ORDER") & (register["level"] == "cell")]
    assert len(cell_rows) == len(one_off)
    reference = RESEARCH / "demand-dgp" / "oneoff_orders_dgp.csv"
    if reference.exists():
        ref = pd.read_csv(reference)
        mine = set(zip(one_off["sku_id"], one_off["region"], one_off["month_idx"], strict=True))
        overlap = len(mine & set(zip(ref["sku"], ref["region"], ref["midx"], strict=True)))
        assert overlap / len(mine) >= 0.95


def test_expected_demand_is_phase_aware_and_unbiased(cells: pd.DataFrame) -> None:
    assert (cells.loc[cells["is_structural_zero"], "expected_demand"] == 0).all()
    used = cells[cells["on_phase"] & cells["train_mask"].isna() & cells["demand_uc"].notna() & ~cells["is_structural_zero"]]
    assert used["expected_demand"].sum() / used["demand_uc"].sum() == pytest.approx(1.0, abs=0.02)
    assert (used["demand_uc"] - used["expected_demand"]).abs().sum() / used["demand_uc"].sum() < 0.26


def test_training_masks(cells: pd.DataFrame) -> None:
    reasons = set(cells["train_mask"].dropna())
    assert reasons <= set(TRAIN_MASK_ORDER)
    assert ((cells["train_weight"] == 0) == cells["train_mask"].notna()).all()
    s5 = cells[(cells["demand_uc_method"] == "S5_semiconductor_imputed") & cells["train_mask"].isna()]
    assert (s5["train_weight"] == 0.7).all()
    assert cells.loc[cells["date"].between("2020-02", "2020-09"), "train_mask"].notna().all()
    prebuy = cells["sales_channel"].isin(["Tier-1 Distributor", "Aftermarket"]) & cells["date"].between("2022-12", "2023-02")
    assert cells.loc[prebuy, "train_mask"].notna().all()
    red_sea = (cells["sales_channel"] == "Export") & cells["region"].isin(["Europe", "Middle East & Africa"]) & cells["date"].between("2024-01", "2024-03")
    assert cells.loc[red_sea, "train_mask"].notna().all()
    assert (cells.loc[cells["is_lost_account"], "train_mask"] == "lost_account_tail").all()
    unknown = cells["demand_uc"].isna()
    assert cells.loc[unknown, "train_mask"].isin(["missing_onphase", "erp_unknown", "d3_hidden_second_month"]).all()
    ela = (cells["product_family"] == "Electrical Assemblies") & cells["date"].between("2021-03", "2022-09")
    assert cells.loc[ela, "level_mask"].notna().all()
    assert cells.loc[cells["date"].between("2023-10", "2023-11") & (cells["region"] == "Europe") & (cells["customer"] == "Nexon Motor Group"), "train_mask"].notna().all()


def test_register_contract(register: pd.DataFrame) -> None:
    assert tuple(register.columns) == REGISTER_COLUMNS
    assert register["anomaly_id"].is_unique
    assert set(register["level"]) == {"episode", "cell"}
    assert set(register["class"]) == {"data_error", "real_event"}
    assert register["type"].str[:3].isin(["DE.", "RC.", "RE.", "ST."]).all()
    assert (register.loc[register["type"].str[:3].isin(["DE.", "RC."]), "class"] == "data_error").all()
    assert (register.loc[register["type"].str[:3].isin(["RE.", "ST."]), "class"] == "real_event").all()
    episode_ids = set(register.loc[register["level"] == "episode", "anomaly_id"])
    assert set(register.loc[register["level"] == "cell", "episode_id"]) <= episode_ids
    assert set(REQUIRED_TYPES) <= set(register["type"])
    assert register["confidence"].isin(["high", "medium", "low"]).all()
    for text in register["evidence"].dropna().head(2000):
        json.loads(text)


def test_register_counts(register: pd.DataFrame, pipeline_run) -> None:
    counts = register[register["level"] == "episode"]["type"].value_counts()
    assert counts["ST.LOST_ACCOUNT"] == EXPECTED["demand.lost_accounts"]
    assert counts["ST.CUSTOMER_SWITCH"] == EXPECTED["demand.customer_switches"]
    assert counts["ST.CYCLE_CHANGE"] == EXPECTED["demand.cycle_changes"]
    assert counts["RE.NO_EFFECT"] == 5
    cells = register[register["level"] == "cell"]["type"].value_counts()
    assert cells["DE.MISSING_ROW"] == EXPECTED["grid.missing"]
    assert cells["DE.SYSTEM_BLANKING"] == EXPECTED["num.N12"] and cells["DE.UOM_BLOCK"] == EXPECTED["num.N11"]
    assert cells["RE.SEMICONDUCTOR_ALLOCATION"] == EXPECTED["demand.method.S5_semiconductor_imputed"]
    log = pd.read_parquet(pipeline_run.quality / "fix_log.parquet")
    rules = set(log.loc[log["method"] != "convention", "rule"])
    assert rules <= {anomaly_id.split(":")[-1] for anomaly_id in register.loc[register["level"] == "episode", "anomaly_id"]}


def test_measured_event_effects(episodes: pd.DataFrame) -> None:
    def evidence(anomaly_id: str) -> dict:
        return json.loads(episodes.loc[anomaly_id, "evidence"])

    assert evidence("RE.STRIKE:EV-038")["measured_multiplier"] < 0.35
    assert 1.15 <= evidence("RE.PROGRAM_STEP:EV-052")["measured_multiplier"] <= 1.32
    prebuy = evidence("RE.PREBUY_PRICE_RISE:EV-030")["by_month"]
    assert prebuy["2022-12"] > 1.2 and prebuy["2023-01"] < 0.85
    red_sea = evidence("RE.LOGISTICS:EV-039")
    assert red_sea["by_month"]["2024-01"] < 0.75 and red_sea["by_month"]["2024-03"] > 1.2
    assert all(abs(red_sea["by_region"][r] - 1) < 0.1 for r in ("North America", "Asia Pacific", "India", "Latin America"))
    for anomaly_id in episodes.index[episodes["type"] == "RE.NO_EFFECT"]:
        assert abs(evidence(anomaly_id)["measured_multiplier"] - 1) < 0.05, anomaly_id
    assert evidence("RE.HOLIDAY:EU:Aug")["regional_month_index"] < 0.75
    assert evidence("RE.CUSTOMER_SHUTDOWN:EV-062")["test_rows_in_scope"] == 124


def test_series_profile(profile: pd.DataFrame, pipeline_run) -> None:
    assert len(profile) == EXPECTED["grid.series"] and profile["series_no"].is_unique
    assert set(profile["sbc_class"]) == {"smooth", "intermittent", "erratic", "lumpy"}
    cyclic = profile[profile["cycle_kind"].isin(["B", "Q"])]
    assert cyclic["sbc_class"].isin(["intermittent", "lumpy"]).mean() >= 0.95
    assert profile["is_lost_account"].sum() == EXPECTED["demand.lost_accounts"]
    state = pipeline_run.csv("series_state.csv")
    assert (profile["cycle_pattern"].to_numpy() == state["cycle_pattern"].to_numpy()).all()
    assert profile["n_missing_rows"].sum() == EXPECTED["grid.missing"]
