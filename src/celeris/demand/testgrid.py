"""Forecast-window grid: one row per ``test.csv`` row with the structure known in advance (dossier 5, 2.3; TS
findings 2-5, 11; PZ findings 4, 13-14).

Each row carries its keys and static attributes, the lifecycle position (months since product launch, months to EOL,
post-EOL, phase-out, cold start), the account state at the origin (lost account) and the ordering cycle projected
from the origin (``project_cycle``): MAP pattern, ``p_order`` (probability of an order: the cycle posterior, 0 after
EOL and on lost accounts), on-phase flag and the accumulation span with the weight of the carried months.

Structural zeros (forecast exactly 0): after EOL (156 rows; the EOL month itself sells), lost accounts (16 series,
304 rows) and months with ``p_order < 0.5`` (8,382 off-phase rows, 3 of them in young series whose single-zero
evidence leaves p between 0 and 0.5; dossier 5.1). The three planned launches (10 series, 117 rows) have no cycle: a
prior ``p_order`` from the late-cohort prior, and every month carries one month of latent demand.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from celeris.cleaning.dates import month_label
from celeris.demand.cycles import on_matrix
from celeris.demand.state import DemandState

PHASEOUT_MONTHS = 6  # months 5..0 before EOL (dossier 5.3)
JUST_LAUNCHED_MONTHS = 12
YOUNG_MONTHS = 24
P_ORDER_DECIMALS = 4
TEST_GRID_COLUMNS = (
    "date",
    "sku_id",
    "region",
    "month_idx",
    "year",
    "month",
    "series_no",
    "customer",
    "sales_channel",
    "product_family",
    "business_unit",
    "powertrain_application",
    "sku_tier",
    "lifecycle_status",
    "launch_date",
    "eol_date",
    "replaces_sku",
    "months_since_launch",
    "series_age",
    "months_to_eol",
    "lifecycle_phase",
    "is_cold_start",
    "is_post_eol",
    "is_eol_phaseout",
    "is_lost_account",
    "lost_since",
    "cycle_pattern",
    "cycle_kind",
    "cycle_posterior",
    "p_order",
    "on_phase",
    "accum_span",
    "carry_weight",
    "is_structural_zero",
    "structural_zero_reason",
)


def _month_idx(dates: pd.Series) -> pd.Series:
    return (dates.str[:4].astype("int64") - 2019) * 12 + dates.str[5:7].astype("int64") - 1


def build_test_grid(test: pd.DataFrame, state: DemandState, master_clean: pd.DataFrame) -> pd.DataFrame:
    """The grid in ``test.csv`` order; ``test`` is the raw text frame, ``master_clean`` the cleaned master."""
    panel = state.panel
    series = panel.series
    key = series.set_index(["sku_id", "region"])["series_no"]
    grid = pd.DataFrame(
        {
            "date": test["Date"].astype("str"),
            "sku_id": test["SKU_ID"].astype("str"),
            "region": test["Region"].astype("str"),
            "customer": test["Customer_Name"].astype("str"),
            "sales_channel": test["Sales_Channel"].astype("str"),
        }
    )
    grid["month_idx"] = _month_idx(grid["date"])
    grid["year"] = 2019 + grid["month_idx"] // 12
    grid["month"] = grid["month_idx"] % 12 + 1
    index = pd.MultiIndex.from_arrays([grid["sku_id"], grid["region"]])
    grid["series_no"] = pd.array(key.reindex(index).to_numpy(), dtype="Int64")
    master = master_clean.set_index("sku_id")
    for column in ("product_family", "business_unit", "powertrain_application", "sku_tier", "lifecycle_status", "eol_date", "replaces_sku"):
        grid[column] = grid["sku_id"].map(master[column])
    grid["launch_date"] = grid["sku_id"].map(master["launch_date_effective"])
    launch_idx = _month_idx(grid["launch_date"])
    eol_idx = grid["eol_date"].map(lambda v: (int(v[:4]) - 2019) * 12 + int(v[5:7]) - 1 if isinstance(v, str) else np.nan)
    grid["months_since_launch"] = (grid["month_idx"] - launch_idx).astype("int64")
    start = grid["series_no"].map(series.set_index("series_no")["start_idx"])
    grid["series_age"] = (grid["month_idx"] - start.fillna(launch_idx)).astype("int64")
    grid["months_to_eol"] = pd.array(eol_idx - grid["month_idx"], dtype="Int64")
    grid["is_cold_start"] = grid["series_no"].isna()
    grid["is_post_eol"] = (grid["months_to_eol"] < 0).fillna(False).astype(bool)
    grid["is_eol_phaseout"] = grid["months_to_eol"].between(0, PHASEOUT_MONTHS - 1).fillna(False).astype(bool)

    lost = state.lost_accounts.set_index("series_no")["lost_since_idx"]
    grid["is_lost_account"] = grid["series_no"].isin(lost.index).fillna(False).astype(bool)
    grid["lost_since"] = grid["series_no"].map(lost).map(lambda v: month_label(v) if pd.notna(v) else None)

    grid = _with_cycle(grid, state)
    grid.loc[grid["is_post_eol"] | grid["is_lost_account"], "p_order"] = 0.0
    reason = np.select(
        [grid["is_post_eol"], grid["is_lost_account"], grid["p_order"] < 0.5],
        ["post_eol", "lost_account", "off_phase"],
        "",
    )
    grid["structural_zero_reason"] = pd.Series(reason, index=grid.index).replace("", None)
    grid["is_structural_zero"] = grid["structural_zero_reason"].notna()
    grid["lifecycle_phase"] = np.select(
        [
            grid["is_post_eol"],
            grid["is_lost_account"],
            grid["is_eol_phaseout"],
            grid["is_cold_start"],
            grid["months_since_launch"] < JUST_LAUNCHED_MONTHS,
            grid["months_since_launch"] < YOUNG_MONTHS,
        ],
        ["post_eol", "lost_account", "eol_phaseout", "cold_start", "just_launched", "young"],
        "mature",
    )
    return grid.loc[:, list(TEST_GRID_COLUMNS)]


def _with_cycle(grid: pd.DataFrame, state: DemandState) -> pd.DataFrame:
    """Projected cycle for continuing series; prior order probability for cold starts."""
    known = grid["series_no"].notna()
    months = np.sort(grid["month_idx"].unique())
    projection = state.project(months, np.sort(grid.loc[known, "series_no"].astype("int64").unique()))
    frame = state.cycles.series.set_index("series_no")
    merged = grid[["series_no", "month_idx"]].merge(
        projection.assign(series_no=projection["series_no"].astype("Int64")), on=["series_no", "month_idx"], how="left"
    )
    merged.index = grid.index
    grid["cycle_pattern"] = grid["series_no"].map(frame["cycle_pattern"])
    grid["cycle_kind"] = grid["series_no"].map(frame["cycle_kind"]).fillna("unknown")
    grid["cycle_posterior"] = grid["series_no"].map(frame["cycle_posterior"]).round(P_ORDER_DECIMALS)
    prior = state.cycles.prior.table
    cold = ~known
    on_cold = on_matrix(grid.loc[cold, "month_idx"].to_numpy())  # (K, n)
    prior_rows = prior.reindex(grid.loc[cold, "region"]).to_numpy()  # (n, K)
    p_cold = (prior_rows * on_cold.T).sum(axis=1)
    p_order = merged["p_order"].to_numpy(dtype="float64", copy=True)
    p_order[cold.to_numpy()] = p_cold
    grid["p_order"] = np.round(p_order, P_ORDER_DECIMALS)
    on_phase = merged["on_phase"].astype("boolean").fillna(False).to_numpy(dtype=bool, copy=True)
    on_phase[cold.to_numpy()] = p_cold >= 0.5
    grid["on_phase"] = on_phase
    span = merged["accum_span"].astype("Int64").fillna(0).to_numpy(dtype="int64", copy=True)
    span[cold.to_numpy()] = on_phase[cold.to_numpy()].astype("int64")
    grid["accum_span"] = span
    grid["carry_weight"] = merged["carry_weight"].to_numpy(dtype="float64")
    return grid


def accumulation_class(grid: pd.DataFrame) -> pd.Series:
    """Accumulation class of the rows that are neither structural zeros nor cold starts (dossier 5.1 counts)."""
    rows = grid[~grid["is_structural_zero"] & ~grid["is_cold_start"]]
    return pd.Series(
        np.select(
            [rows["accum_span"] == 1, (rows["accum_span"] == 2) & (rows["carry_weight"] < 1), rows["accum_span"] == 2, rows["accum_span"] == 3],
            ["1_month", "after_shutdown", "2_months", "3_months"],
            "other",
        ),
        index=rows.index,
    )
