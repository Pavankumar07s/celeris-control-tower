"""The ``demand`` stage (dossier 7.1 steps 7-9, 5): overlay, unconstrained demand, cycles, accounts, fills, test grid.

Reads the part-A outputs, applies the Shipped_Units overlay, builds ``demand_state`` as of 2026-10 and writes:

- ``clean/train_clean.parquet``: the part-A columns (units and revenue overlaid on 69 listed cells) plus the demand
  columns (``celeris.tables.DEMAND_COLUMNS``);
- ``clean/test_grid.parquet``: one row per test.csv row (``celeris.demand.testgrid``);
- ``clean/series_state.csv``: one row per series with its state at the origin (cycle, change, lost account, customer,
  switch, semiconductor severity);
- ``clean/account_events.csv``: the 27 cycle changes, 23 customer switches and 16 lost accounts;
- ``clean/customer_history.csv``: customer runs per series (customer at time);
- ``clean/semiconductor_depth.csv`` and ``clean/regional_index.csv``: the estimated depth curve and the regional
  calendar index behind the S5 imputation and the fill.

Checks and fix-log rows (rule ``S0``) go to the quality aggregator.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from celeris.cleaning.dates import month_label
from celeris.config import Paths
from celeris.demand.accounts import customer_at_time
from celeris.demand.checks import cycle_checks, method_counts, missing_checks, test_grid_checks, unconstrained_checks
from celeris.demand.cycles import PATTERNS
from celeris.demand.overlay import Overlay, overlay_checks, overlay_shipped
from celeris.demand.panel import series_table
from celeris.demand.state import DemandState, History, demand_state
from celeris.demand.testgrid import build_test_grid
from celeris.demand.unconstrained import method_names
from celeris.io import read_raw_csv, write_csv, write_parquet
from celeris.quality.stagelog import StageRecord, run_stage
from celeris.tables import TRAIN_CLEAN_COLUMNS, columns_through, read_train_clean, write_train_clean

STAGE = "demand"


def run_demand(paths: Paths) -> StageRecord:
    """Run the demand stage and publish the quality files."""
    return run_stage(paths, STAGE, demand_stage)


def read_clean_csv(paths: Paths, name: str) -> pd.DataFrame:
    """A part-A CSV output with blanks as missing values (labels such as ``North America`` are never NA-parsed)."""
    return pd.read_csv(paths.clean_dir / name, keep_default_na=False, na_values=[""])


def load_history(paths: Paths) -> tuple[History, pd.DataFrame, Overlay]:
    """Overlaid grid, stock-outs with ``series_no``, series table, cleaned master and the overlay result."""
    cells = read_train_clean(paths, "clean").loc[:, list(TRAIN_CLEAN_COLUMNS)]
    stockouts = read_clean_csv(paths, "stockouts_clean.csv")
    blocks = read_clean_csv(paths, "series_blocks.csv")
    master = read_clean_csv(paths, "sku_master_clean.csv")
    overlay = overlay_shipped(cells, stockouts)
    stockouts = stockouts.merge(blocks[["sku_id", "region", "series_no"]], on=["sku_id", "region"], how="left", validate="many_to_one")
    if stockouts["series_no"].isna().any():
        raise AssertionError("a stock-out row lies outside the Record_ID grid")
    series = series_table(blocks, master, overlay.cells)
    return History(overlay.cells, stockouts, series), master, overlay


def demand_columns(cells: pd.DataFrame, state: DemandState) -> pd.DataFrame:
    """The grid with the demand columns appended (``celeris.tables.DEMAND_COLUMNS``)."""
    p, u, fit = state.panel, state.unconstrained, state.cycles
    i, t = cells["series_no"].to_numpy(), cells["month_idx"].to_numpy()
    if not p.life[i, t].all():
        raise AssertionError("a grid cell lies outside its series' life")
    names = method_names(u.method[i, t])
    regime = fit.regime[i, t]
    codes = np.array([pattern.code for pattern in PATTERNS], dtype=object)
    kinds = np.array([pattern.kind for pattern in PATTERNS], dtype=object)
    out = cells.copy()
    out["demand_uc"] = u.demand[i, t]
    out["demand_uc_method"] = pd.Series(names, index=cells.index, dtype="str")
    out["is_stockout_listed"] = p.listed[i, t]
    out["is_stockout_inferred"] = u.inferred[i, t] | (names == "S5_semiconductor_imputed")
    out["stockout_suspect"] = u.suspect[i, t]
    out["backorder_in"] = u.backorder_in[i, t]
    out["backorder_out"] = u.backorder_out[i, t]
    out["lost_units"] = u.lost_units[i, t]
    out["cycle_pattern"] = pd.Series(codes[regime], index=cells.index, dtype="str")
    out["cycle_kind"] = pd.Series(kinds[regime], index=cells.index, dtype="str")
    out["on_phase"] = fit.on_phase[i, t]
    out["accum_span"] = fit.accum_span[i, t].astype("int64")
    out["carry_weight"] = fit.carry_weight[i, t]
    out["is_structural_zero"] = ~fit.on_phase[i, t] | state.lost_tail[i, t]
    out["is_lost_account"] = state.lost_tail[i, t]
    out["demand_filled"] = state.filled.demand_filled[i, t]
    out["is_imputed"] = state.filled.is_imputed[i, t]
    return out.loc[:, list(columns_through(STAGE))]


def series_state_table(state: DemandState) -> pd.DataFrame:
    """One row per series: cycle, change, lost account, customers and semiconductor severity at the origin."""
    p, fit = state.panel, state.cycles
    frame = p.series[["series_no", "sku_id", "region", "product_family", "sales_channel", "powertrain_application", "sku_tier"]].copy()
    frame["start_date"] = p.series["start_idx"].map(month_label)
    frame["end_date"] = [month_label(v) for v in p.end]
    cycles = fit.series
    for column in ("cycle_pattern", "cycle_kind", "cycle_phase", "cycle_pattern_before"):
        frame[column] = cycles[column].to_numpy()
    frame["cycle_posterior"] = cycles["cycle_posterior"].round(4).to_numpy()
    frame["cycle_change_month"] = cycles["cycle_change_idx"].map(lambda v: month_label(v) if v >= 0 else None).to_numpy()
    frame["cycle_change_window_end"] = cycles["cycle_change_window_end_idx"].map(lambda v: month_label(v) if v >= 0 else None).to_numpy()
    frame["months_classified"] = cycles["n_classified"].to_numpy()
    frame["cycle_mismatches"] = cycles["mismatches"].to_numpy()
    frame["last_order_month"] = cycles["last_order_idx"].map(lambda v: month_label(v) if v >= 0 else None).to_numpy()
    frame["trailing_silent_months"] = cycles["trailing_silent"].to_numpy()
    lost = state.lost_accounts.set_index("series_no")
    frame["is_lost_account"] = cycles["is_lost_account"].to_numpy()
    frame["lost_since"] = frame["series_no"].map(lost["lost_since_idx"]).map(lambda v: month_label(v) if pd.notna(v) else None)
    frame["pre_loss_level"] = frame["series_no"].map(lost["pre_loss_level"]).round(2)
    runs = state.customer_history
    first = runs.groupby("series_no")["customer"].first()
    last = runs.groupby("series_no")["customer"].last()
    frame["customer_first"] = frame["series_no"].map(first)
    frame["customer_at_origin"] = frame["series_no"].map(last)
    frame["n_customers"] = frame["series_no"].map(runs.groupby("series_no")["run"].max()).fillna(0).astype("int64")
    switches = state.switches.set_index("series_no")
    frame["switch_month"] = frame["series_no"].map(switches["switch_idx"]).map(lambda v: month_label(v) if pd.notna(v) else None)
    frame["switch_level_ratio"] = frame["series_no"].map(switches["level_ratio_region_adjusted"]).round(3)
    frame["semiconductor_severity"] = frame["series_no"].map(state.semiconductor.severity).round(4)
    return frame


def account_events_table(state: DemandState) -> pd.DataFrame:
    """The 27 cycle changes, 23 customer switches and 16 lost accounts as one event list."""
    keys = state.panel.series[["series_no", "sku_id", "region"]]
    cycles = state.cycles.series
    changes = cycles[cycles["cycle_change_idx"] >= 0]
    rows = [
        pd.DataFrame(
            {
                "event_type": "cycle_change",
                "series_no": changes["series_no"],
                "month": changes["cycle_change_idx"].map(month_label),
                "window_end": changes["cycle_change_window_end_idx"].map(month_label),
                "before": changes["cycle_pattern_before"],
                "after": changes["cycle_pattern"],
            }
        ),
        pd.DataFrame(
            {
                "event_type": "customer_switch",
                "series_no": state.switches["series_no"],
                "month": state.switches["switch_idx"].map(month_label),
                "before": state.switches["customer_before"],
                "after": state.switches["customer_after"],
                "level_before": state.switches["level_before"].round(2),
                "level_after": state.switches["level_after"].round(2),
                "level_ratio": state.switches["level_ratio"].round(3),
                "level_ratio_region_adjusted": state.switches["level_ratio_region_adjusted"].round(3),
            }
        ),
        pd.DataFrame(
            {
                "event_type": "lost_account",
                "series_no": state.lost_accounts["series_no"],
                "month": state.lost_accounts["lost_since_idx"].map(month_label),
                "before": state.lost_accounts["last_order_idx"].map(month_label),
                "level_before": state.lost_accounts["pre_loss_level"].round(2),
                "level_after": 0.0,
                "silent_months": state.lost_accounts["silent_months"],
            }
        ),
    ]
    events = pd.concat(rows, ignore_index=True).merge(keys, on="series_no", how="left")
    order = ["event_type", "series_no", "sku_id", "region", "month", "window_end", "before", "after", "level_before",
             "level_after", "level_ratio", "level_ratio_region_adjusted", "silent_months"]
    events = events.reindex(columns=order)
    events["silent_months"] = events["silent_months"].astype("Int64")
    return events.sort_values(["event_type", "series_no"], kind="stable").reset_index(drop=True)


def _headline(state: DemandState, cells: pd.DataFrame, grid: pd.DataFrame, overlay_filled: dict[str, int]) -> dict:
    p, u = state.panel, state.unconstrained
    known = ~np.isnan(u.demand) & ~np.isnan(p.units)
    shipped = float(np.nansum(np.where(known, p.units, 0.0)))
    demand = float(np.nansum(np.where(known, u.demand, 0.0)))
    return {
        "overlay_cells": int(sum(overlay_filled[k] for k in ("missing_row", "erp_blank", "pack_of_10"))),
        "units_shipped": round(shipped, 1),
        "demand_unconstrained": round(demand, 1),
        "uplift_pct": round(100 * (demand / shipped - 1), 3),
        "lost_units": round(float(cells["lost_units"].sum()), 1),
        "lost_revenue_usd": round(float((cells["lost_units"] * cells["unit_price_usd"]).sum()), 2),
        "demand_uc_methods": method_counts(state),
        "cycle_kinds": {k: int(v) for k, v in state.cycles.series["cycle_kind"].value_counts().sort_index().items()},
        "cycle_changes": int((state.cycles.series["cycle_change_idx"] >= 0).sum()),
        "lost_accounts": int(len(state.lost_accounts)),
        "customer_switches": int(len(state.switches)),
        "cycle_iterations": state.cycle_iterations,
        "test_grid_rows": int(len(grid)),
        "test_grid_structural_zeros": {k: int(v) for k, v in grid["structural_zero_reason"].value_counts().sort_index().items()},
    }


def demand_stage(paths: Paths) -> StageRecord:
    """Body of the ``demand`` stage (see module docstring)."""
    history, master, overlay = load_history(paths)
    state = demand_state(history)
    cells = demand_columns(history.cells, state)
    test = read_raw_csv(paths.raw("test.csv"))
    grid = build_test_grid(test, state, master)
    continuing = grid[~grid["is_cold_start"]].drop_duplicates("series_no")
    origin_customer = customer_at_time(
        state.customer_history, continuing["series_no"].astype("int64").to_numpy(), np.full(len(continuing), state.as_of)
    )
    customer_match = int((continuing["customer"].to_numpy() == origin_customer).sum())

    clean = paths.clean_dir
    depth = state.semiconductor.depth.rename_axis("month_idx").reset_index()
    depth.insert(0, "date", depth["month_idx"].map(month_label))
    index = state.filled.index.reset_index()
    index.insert(0, "date", index["month_idx"].map(month_label))
    written = [
        write_train_clean(paths, cells, STAGE),
        write_parquet(grid, clean / "test_grid.parquet"),
        write_csv(series_state_table(state), clean / "series_state.csv"),
        write_csv(account_events_table(state), clean / "account_events.csv"),
        write_csv(state.customer_history, clean / "customer_history.csv"),
        write_csv(depth.round({"depth": 6}), clean / "semiconductor_depth.csv"),
        write_csv(index.round(6), clean / "regional_index.csv"),
    ]
    keys = state.panel.series[["series_no", "sku_id", "region"]]
    checks = [
        *overlay_checks(overlay),
        *unconstrained_checks(state),
        *cycle_checks(state, keys),
        *missing_checks(state),
        *test_grid_checks(grid, len(test), customer_match, len(continuing)),
    ]
    return StageRecord(
        stage=STAGE,
        checks=checks,
        fix_log=overlay.fix_log,
        outputs=written,
        headline=_headline(state, cells, grid, overlay.filled),
        rows_clean={"test.csv": len(grid)},
    )
