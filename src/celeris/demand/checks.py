"""Data-quality checks of the demand stage (dossier counts asserted through ``config.EXPECTED``)."""

from __future__ import annotations

import numpy as np
import pandas as pd

from celeris.cleaning.dates import month_label
from celeris.demand.cycles import ON_CALENDAR
from celeris.demand.state import DemandState
from celeris.demand.testgrid import accumulation_class
from celeris.demand.unconstrained import METHODS, method_names
from celeris.quality.checks import Check, examples_from, invariant_check, issue_check

TRAIN = "train.csv"
STOCKOUTS = "inventory_stockouts.csv"
TEST = "test.csv"
CERTAIN_POSTERIOR = 0.99  # PZ finding 13: a cycle is certain at posterior >= 0.99
ASSERTED_METHODS = (
    "S1_listed_requested",
    "S5_semiconductor_imputed",
    "S2_carry_removed",
    "D2_hidden_stockout",
    "D1_hidden_stockout",
    "D1_phantom_removed",
    "D3_hidden_second_month",
    "missing_after_backorder",
)


def method_counts(state: DemandState) -> dict[str, int]:
    """Cells per final derivation method (intermediate codes never survive the missing-cell treatment)."""
    names = pd.Series(method_names(state.unconstrained.method[state.panel.life]))
    counts = {name: int(names.eq(name).sum()) for name in METHODS[1:]}
    return {name: n for name, n in counts.items() if n or name in ASSERTED_METHODS}


def unconstrained_checks(state: DemandState) -> list[Check]:
    """Method census, stock-out accounting identities, off-phase zeros and the uplift profile."""
    p, u = state.panel, state.unconstrained
    counts = method_counts(state)
    listed = p.listed
    request = np.nan_to_num(p.requested)
    identity_listed = listed & ((u.demand != request) | (np.abs(u.shortfall - u.backorder_out - u.lost_units) > 1e-9))
    s2 = u.method == METHODS.index("S2_carry_removed")
    identity_s2 = s2 & (np.abs(u.demand + u.backorder_in - p.units) > 1e-9)
    shortfall_ok = np.abs(u.shortfall - u.backorder_out - u.lost_units) > 1e-9
    off = p.life & ~state.cycles.on_phase
    off_positive_before = int((off & (np.nan_to_num(p.units) > 0)).sum())
    off_positive_after = off & (np.nan_to_num(u.demand) > 0) & ~listed
    shipped_known = ~np.isnan(u.demand) & ~np.isnan(p.units)
    ela = (p.series["product_family"] == "Electrical Assemblies").to_numpy()[:, None]
    months = np.arange(p.life.shape[1])[None, :]
    uplift = {
        "units_shipped_where_demand_known": float(np.nansum(np.where(shipped_known, p.units, 0.0))),
        "demand_uc_where_shipped_known": float(np.nansum(np.where(shipped_known, u.demand, 0.0))),
    }
    ela_2021 = shipped_known & ela & (months >= 24) & (months <= 35)
    ela_2022 = shipped_known & ela & (months >= 36) & (months <= 47)
    lost_units = float(np.nansum(np.where(p.life, u.lost_units, 0.0)))
    return [
        invariant_check(
            check_id="DEM-UC-METHODS",
            file=TRAIN,
            rule="7.1/7",
            title="Unconstrained demand: every grid cell has one derivation method",
            description=(
                "Rules S1, S5, S2, D2, D1, D3, spill and the missing-cell treatment in the dossier's order; method counts "
                "per cell in the breakdown (dossier / SU section 9 counts asserted)."
            ),
            dimension="completeness",
            unit="cells",
            checked=int(p.life.sum()),
            violations_before=0,
            violations_after=int((u.method[p.life] == 0).sum()),
            action="demand_uc / demand_uc_method columns",
            breakdown={name: counts[name] for name in ASSERTED_METHODS},
            breakdown_expected_prefix="demand.method",
            severity="info",
        ),
        invariant_check(
            check_id="DEM-UC-IDENTITIES",
            file=STOCKOUTS,
            rule="2.7",
            title="Stock-out accounting on the demand columns",
            description=(
                "Listed cells: demand_uc = Requested_Units and shortfall = backorder_out + lost_units; S2 cells: "
                "demand_uc + backorder_in = shipped units; every cell: shortfall = backorder_out + lost_units."
            ),
            dimension="consistency",
            unit="cells",
            checked=int(listed.sum() + s2.sum()),
            violations_before=0,
            violations_after=int(identity_listed.sum() + identity_s2.sum() + (shortfall_ok & p.life).sum()),
            action="fail the build on any violation",
        ),
        issue_check(
            check_id="DEM-UC-OFFPHASE-SPILL",
            file=TRAIN,
            rule="3/RE.BACKORDER_CATCHUP",
            title="Positive shipments in off-phase months (back-order spill)",
            description=(
                "Off-phase months carry no own demand (Requested = 0 on 855 / 858 listed off-phase rows). Shipments there "
                "are back-order spill; after unconstraining no unlisted off-phase cell has positive demand."
            ),
            dimension="accuracy",
            unit="cells",
            affected=off_positive_before,
            remaining=int(off_positive_after.sum()),
            action="spill -> 0 demand (S2 / D1 / spill rules); month t-1 flagged as a stock-out",
        ),
        invariant_check(
            check_id="DEM-UC-UPLIFT",
            file=TRAIN,
            rule="2.7/7",
            title="Unconstrained demand vs shipments",
            description=(
                f"Uplift over shipped units {100 * (uplift['demand_uc_where_shipped_known'] / uplift['units_shipped_where_demand_known'] - 1):.2f} % "
                f"(dossier +0.91 %); ELA 2021 {100 * _ratio(u.demand, p.units, ela_2021):.1f} % (+44.8 %), ELA 2022 "
                f"{100 * _ratio(u.demand, p.units, ela_2022):.1f} % (+29.2 %); lost units {lost_units:,.0f} (listed + imputed "
                "semiconductor + D1-D3; dossier 106,925)."
            ),
            dimension="accuracy",
            unit="units",
            checked=int(round(uplift["demand_uc_where_shipped_known"])),
            violations_before=0,
            violations_after=0,
            action="report",
            severity="info",
            breakdown={key: int(round(value)) for key, value in uplift.items()} | {"lost_units": int(round(lost_units))},
        ),
        invariant_check(
            check_id="DEM-UC-INFERRED-STOCKOUTS",
            file=STOCKOUTS,
            rule="I4",
            title="Unlisted stock-out months recovered from arithmetic signatures",
            description=(
                "D2 (listed carry-in after an unlisted month), D1 (phantom off-phase order), D3 (shipped less than the "
                "carry-in) and spill origins are inferred exactly; S2 cells below "
                "0.35 x their local level are suspected hidden second months (flag only, down-weighted)."
            ),
            dimension="completeness",
            unit="cells",
            checked=int(u.inferred.sum()),
            violations_before=0,
            violations_after=0,
            action="is_stockout_inferred / stockout_suspect",
            severity="info",
            breakdown={"suspected_second_month": int(u.suspect.sum()), "semiconductor_unlisted": counts["S5_semiconductor_imputed"]},
        ),
    ]


def _ratio(numerator: np.ndarray, denominator: np.ndarray, mask: np.ndarray) -> float:
    return float(np.nansum(np.where(mask, numerator, 0.0)) / np.nansum(np.where(mask, denominator, 0.0)) - 1)


def cycle_checks(state: DemandState, keys: pd.DataFrame) -> list[Check]:
    """Cycle census, determinism, cycle changes, lost accounts and customer switches."""
    fit, p = state.cycles, state.panel
    frame = fit.series.merge(keys, on="series_no")
    with_life = frame[frame["cycle_pattern"].notna()]
    kinds = with_life["cycle_kind"].value_counts()
    demand = state.unconstrained.demand
    known = p.life & ~np.isnan(demand)
    on = fit.on_phase & known & ~state.lost_tail
    off = ~fit.on_phase & known & ~state.lost_tail
    p_order_on = float((demand[on] > 0).mean())
    p_zero_off = float((demand[off] == 0).mean())
    changes = frame[frame["cycle_change_idx"] >= 0]
    directions = (changes["cycle_pattern_before"].str[0] + ">" + changes["cycle_kind"]).value_counts()
    lost = state.lost_accounts.merge(keys, on="series_no")
    switches = state.switches.merge(keys, on="series_no")
    return [
        invariant_check(
            check_id="DEM-CYCLE-PATTERNS",
            file=TRAIN,
            rule="4.9/7.1-8",
            title="Every series has a calendar-anchored ordering cycle",
            description=(
                f"Template segmentation over {len(ON_CALENDAR)} calendar templates; current regime by kind in the breakdown. "
                f"After unconstraining P(order | on-phase) = {100 * p_order_on:.2f} %, P(zero | off-phase) = {100 * p_zero_off:.3f} % "
                f"(dossier on shipments: 99.87 % / 99.37 %). Error rates estimated: P(zero | on) {fit.rates.p_zero_on:.5f}, "
                f"P(order | off) {fit.rates.p_order_off:.5f}, ramp ages 0-3 {[round(r, 4) for r in fit.rates.p_zero_on_ramp]}."
            ),
            dimension="consistency",
            unit="series",
            checked=len(with_life),
            violations_before=0,
            violations_after=int(len(frame) - len(with_life)),
            action="cycle_pattern / on_phase / accum_span / carry_weight columns; series_state.csv",
            expected_key="grid.series",
            breakdown={kind: int(kinds.get(kind, 0)) for kind in ("M", "A", "B", "Q", "T")},
            breakdown_expected_prefix="demand.cycle",
        ),
        issue_check(
            check_id="DEM-CYCLE-CHANGES",
            file=TRAIN,
            rule="ST.CYCLE_CHANGE",
            title="Ordering-cycle changes (real events)",
            description="Single change point per series, at least 4 mismatches removed, 6 months on each side; change month = first month of the tie window.",
            dimension="consistency",
            unit="series",
            affected=len(changes),
            remaining=len(changes),
            severity="info",
            action="regime in force at the origin projected into the window; no level break",
            expected_key="demand.cycle_changes",
            breakdown={str(k): int(v) for k, v in directions.items()},
            breakdown_expected_prefix="demand.cycle_change",
            examples=examples_from(changes.assign(change_month=changes["cycle_change_idx"].map(month_label)), ["sku_id", "region", "cycle_pattern_before", "cycle_pattern", "change_month"]),
        ),
        issue_check(
            check_id="DEM-LOST-ACCOUNTS",
            file=TRAIN,
            rule="ST.LOST_ACCOUNT",
            title="Lost accounts (>= 6 silent months on a live series)",
            description=(
                f"{len(lost)} series silent for {int(lost['silent_months'].min()) if len(lost) else 0}-{int(lost['silent_months'].max()) if len(lost) else 0} "
                f"months at the origin; {int(state.lost_tail.sum())} tail cells; pre-loss level {lost['pre_loss_level'].sum():,.1f} units / month."
            ),
            dimension="completeness",
            unit="series",
            affected=len(lost),
            remaining=len(lost),
            severity="info",
            action="forecast 0; tail masked from training",
            expected_key="demand.lost_accounts",
            breakdown={"tail_cells": int(state.lost_tail.sum())},
            breakdown_expected_prefix="demand.lost",
            examples=examples_from(lost.assign(lost_since=lost["lost_since_idx"].map(month_label)), ["sku_id", "region", "lost_since", "silent_months", "pre_loss_level"]),
        ),
        issue_check(
            check_id="DEM-CUSTOMER-SWITCHES",
            file=TRAIN,
            rule="ST.CUSTOMER_SWITCH",
            title="Customer switches (one per series, no gap)",
            description=(
                f"{len(switches)} switches; region-adjusted level ratio {switches['level_ratio_region_adjusted'].min():.2f}-"
                f"{switches['level_ratio_region_adjusted'].max():.2f}; months with a gap between customers: {int(switches['gap_months'].sum())}."
            ),
            dimension="consistency",
            unit="series",
            affected=len(switches),
            remaining=len(switches),
            severity="info",
            action="customer at time for event joins; level from post-switch months",
            expected_key="demand.customer_switches",
            examples=examples_from(switches.assign(switch_month=switches["switch_idx"].map(month_label)), ["sku_id", "region", "customer_before", "customer_after", "switch_month"]),
        ),
    ]


def missing_checks(state: DemandState) -> list[Check]:
    """Treatment of the 982 missing rows and the ERP blanks."""
    p, u = state.panel, state.unconstrained
    names = method_names(u.method)
    listed_missing = int((p.missing_row & p.listed).sum())
    zero = int(np.isin(names, ["missing_offphase_zero", "missing_lost_tail_zero"]).sum())
    unknown = int(np.isin(names, ["missing_onphase_unknown", "missing_after_backorder"]).sum())
    erp = p.positive_unknown
    return [
        issue_check(
            check_id="DEM-MISSING-TREATMENT",
            file=TRAIN,
            rule="K13/7.1-9",
            title="Missing rows treated from the ordering cycle",
            description=(
                "Listed: demand = Requested_Units, units = Shipped_Units; off-phase or lost-tail: demand 0 (imputed zero); "
                "on-phase: demand unknown (NaN, masked), demand_filled = local level x accumulated regional index."
            ),
            dimension="completeness",
            unit="cells",
            affected=int(p.missing_row.sum()),
            remaining=unknown,
            severity="warning",
            action="never 0 on an on-phase month (business rule 3)",
            expected_key="grid.missing",
            breakdown={"listed": listed_missing, "zero": zero, "unknown": unknown},
            breakdown_expected_prefix="demand.missing",
        ),
        issue_check(
            check_id="DEM-ERP-BLANKS",
            file=TRAIN,
            rule="N12/EV-033",
            title="ERP-migration blanks: positive orders of unknown size",
            description=(
                "332 records with units and revenue blank and a price: 1 restored from Shipped_Units (THM-033 Latin America "
                "2023-04), CSS-062 Latin America 2023-03 is off-phase back-order spill (demand 0), the rest stay unknown "
                "(the dossier's 331 counts the off-phase spill among them)."
            ),
            dimension="completeness",
            unit="cells",
            affected=int(erp.sum()) + 1,
            remaining=int((erp & np.isnan(u.demand)).sum()),
            severity="warning",
            action="demand_uc NaN, masked in training, demand_filled imputed (never 0)",
            breakdown={
                "restored_from_shipped": 1,
                "offphase_spill": int((erp & (names == "spill_removed")).sum()),
                "unknown": int((erp & np.isnan(u.demand)).sum()),
            },
        ),
    ]


def test_grid_checks(grid: pd.DataFrame, test_rows: int, continuing_customer_match: int, continuing_series: int) -> list[Check]:
    """Row contract, structural zeros, accumulation classes and cold starts of the forecast-window grid."""
    reasons = grid["structural_zero_reason"].value_counts()
    classes = accumulation_class(grid).value_counts()
    uncertain = int((grid["structural_zero_reason"].eq("off_phase") & (grid["cycle_posterior"] < CERTAIN_POSTERIOR)).sum())
    cold = grid[grid["is_cold_start"]]
    return [
        invariant_check(
            check_id="TST-GRID-ROWS",
            file=TEST,
            rule="2.3",
            title="Forecast-window grid: one row per test.csv row, test customer = customer at the origin",
            description=(
                f"{len(grid):,} rows in test order; the test customer equals the train customer at the origin for "
                f"{continuing_customer_match:,} / {continuing_series:,} continuing series."
            ),
            dimension="completeness",
            unit="rows",
            checked=len(grid),
            violations_before=0,
            violations_after=int(len(grid) != test_rows) + (continuing_series - continuing_customer_match),
            action="test_grid.parquet",
            expected_key="test.rows",
            breakdown={"cold_start_rows": len(cold)},
            breakdown_expected_prefix="test_grid",
        ),
        invariant_check(
            check_id="TST-STRUCTURAL-ZEROS",
            file=TEST,
            rule="5.1-5.3",
            title="Structural zeros in the forecast window",
            description=(
                "Post-EOL rows, lost accounts and months with p_order < 0.5 are forecast exactly 0 "
                f"({uncertain} off-phase rows rest on a young series' posterior between 0 and 0.5)."
            ),
            dimension="validity",
            unit="rows",
            checked=int(grid["is_structural_zero"].sum()),
            violations_before=0,
            violations_after=0,
            action="force 0 after modelling",
            expected_key="test_grid.structural_zero",
            breakdown={str(k): int(v) for k, v in reasons.items()},
            breakdown_expected_prefix="test_grid.zero",
        ),
        invariant_check(
            check_id="TST-ACCUMULATION",
            file=TEST,
            rule="4.9/5.1",
            title="Accumulation of latent months per on-phase test row",
            description=(
                "Rows that are neither structural zeros nor cold starts: an order carries the latent months since the previous "
                "on-phase month; after an annual shutdown the carried month weighs 0.5 (never a 1.5 multiplier)."
            ),
            dimension="validity",
            unit="rows",
            checked=int(classes.sum()),
            violations_before=0,
            violations_after=int(classes.get("other", 0)),
            action="accum_span / carry_weight columns",
            breakdown={str(k): int(v) for k, v in classes.items() if k != "other"},
            breakdown_expected_prefix="test_grid.accum",
        ),
        invariant_check(
            check_id="TST-UNCERTAIN-ZEROS",
            file=TEST,
            rule="5.1",
            title="Low-confidence young-series zeros (cycle posterior < 0.99, p_order < 0.5)",
            description="Each rests on a single zero observation (PMP-019 Europe A-Aug, ELA-017 India A-Jun, THM-011 Asia Pacific A-Jun).",
            dimension="validity",
            unit="rows",
            checked=uncertain,
            violations_before=0,
            violations_after=0,
            action="forced to 0 (absolute-error optimal)",
            severity="info",
            expected_key="test_grid.uncertain_zero_rows",
        ),
    ]
