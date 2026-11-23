"""The ``anomalies`` stage (dossier 7.1 step 10): one-off orders, event tags, training masks, the anomaly register
and the series profile.

It rebuilds the demand state as of 2026-10 with the same pure function the demand stage used (and asserts that it
matches the demand columns of ``train_clean.parquet``), then writes:

- ``clean/train_clean.parquet`` with the anomaly columns (``celeris.tables.ANOMALY_COLUMNS``): ``expected_demand``
  (phase-aware unconstrained expectation of the order; 0 off-phase and in lost-account tails), ``is_one_off``, ``event_tags``, ``train_mask``, ``level_mask``,
  ``train_weight``;
- ``anomalies/anomaly_register.csv`` (episode and cell level, ``celeris.anomalies.register``);
- ``anomalies/series_profile.csv`` (one row per series, ``celeris.anomalies.profile``).
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from celeris.anomalies.events import cleaned_demand, customer_matrix, event_windows
from celeris.anomalies.expectation import ONE_OFF_CHANNELS, OneOffs, detect_one_offs
from celeris.anomalies.masks import TRAIN_MASK_ORDER, Masks, build_masks, tag_strings
from celeris.anomalies.profile import build_profile
from celeris.anomalies.register import RegisterInputs, build_register
from celeris.config import Paths
from celeris.demand.stage import load_history, read_clean_csv
from celeris.demand.state import DemandState, demand_state
from celeris.io import write_csv
from celeris.quality.checks import Check, examples_from, invariant_check
from celeris.quality.stagelog import StageRecord, empty_fix_log, run_stage
from celeris.tables import columns_through, read_train_clean, write_train_clean

STAGE = "anomalies"
TRAIN = "train.csv"
REQUIRED_TYPES = (
    "DE.DUPLICATE", "DE.RESTATEMENT", "DE.DATE_FORMAT", "DE.DATE_TYPO", "DE.LABEL_VARIANT", "DE.BLANK_KEY", "DE.MISSING_ROW",
    "DE.UNITS_BLANK", "DE.UNITS_SCALE", "DE.SIGN", "DE.PRICE_CENTS", "DE.PRICE_ZEROED", "DE.REVENUE_SCALE",
    "DE.REVENUE_TRANSPOSITION", "DE.UOM_BLOCK", "DE.CURRENCY_BLOCK", "DE.SYSTEM_BLANKING", "DE.MACRO_REBASE",
    "RE.ONE_OFF_ORDER", "RE.STOCKOUT_LISTED", "RE.STOCKOUT_UNLISTED", "RE.SEMICONDUCTOR_ALLOCATION", "RE.BACKORDER_CATCHUP",
    "RE.HOLIDAY", "RE.PREBUY_PRICE_RISE", "RE.DISRUPTION", "RE.STRIKE", "RE.LOGISTICS", "RE.PROGRAM_STEP",
    "RE.REGION_OPENING", "RE.SURCHARGE", "RE.PRICE_CHANGE", "RE.NO_EFFECT", "RE.CUSTOMER_SHUTDOWN",
    "ST.CYCLE_CHANGE", "ST.CUSTOMER_SWITCH", "ST.LOST_ACCOUNT", "ST.LAUNCH_RAMP", "ST.EOL_DECLINE", "ST.COLD_START",
    "ST.ONPHASE_ZERO", "RC.MASTER_BU", "RC.MASTER_LAUNCH", "RC.SALES_BEFORE_MASTER_LAUNCH", "RC.DOCUMENTATION",
)


def run_anomalies(paths: Paths) -> StageRecord:
    """Run the anomalies stage and publish the quality files."""
    return run_stage(paths, STAGE, anomalies_stage)


def price_matrix(cells: pd.DataFrame, state: DemandState) -> np.ndarray:
    """(S, T) invoice price in force per cell (NaN outside the grid)."""
    out = np.full(state.panel.life.shape, np.nan)
    out[cells["series_no"].to_numpy(), cells["month_idx"].to_numpy()] = cells["unit_price_usd"].to_numpy(dtype="float64")
    return out


def anomaly_columns(cells: pd.DataFrame, state: DemandState, one_offs: OneOffs, masks: Masks) -> pd.DataFrame:
    """The grid with the anomaly columns appended (expected demand is 0 on structural zeros: off-phase, lost tail)."""
    i, t = cells["series_no"].to_numpy(), cells["month_idx"].to_numpy()
    structural = ~state.cycles.on_phase | state.lost_tail
    expected = np.where(structural, 0.0, one_offs.expectation.expected)
    out = cells.copy()
    out["expected_demand"] = np.round(expected[i, t], 3)
    out["is_one_off"] = one_offs.flags[i, t]
    out["event_tags"] = pd.Series(tag_strings(masks.tags, i, t), index=cells.index, dtype="str")
    out["train_mask"] = pd.Series(masks.train_mask[i, t], index=cells.index, dtype="str")
    out["level_mask"] = pd.Series(masks.level_mask[i, t], index=cells.index, dtype="str")
    out["train_weight"] = masks.train_weight[i, t]
    return out.loc[:, list(columns_through(STAGE))]


def anomalies_stage(paths: Paths) -> StageRecord:
    """Body of the ``anomalies`` stage (see module docstring)."""
    history, master, _ = load_history(paths)
    state = demand_state(history)
    cells = read_train_clean(paths, "demand")
    recomputed = state.unconstrained.demand[cells["series_no"].to_numpy(), cells["month_idx"].to_numpy()]
    if not np.array_equal(np.nan_to_num(recomputed, nan=-1.0), np.nan_to_num(cells["demand_uc"].to_numpy(dtype="float64"), nan=-1.0)):
        raise AssertionError("train_clean.parquet demand columns are stale: re-run the demand stage")
    one_offs = detect_one_offs(state)
    customers = customer_matrix(state)
    events = read_clean_csv(paths, "events_clean.csv")
    windows = event_windows(events, state, customers).windows
    masks = build_masks(state, windows, one_offs.flags)
    price = price_matrix(cells, state)
    fix_log = pd.read_parquet(paths.quality_dir / "fix_log.parquet")
    inputs = RegisterInputs(
        state=state,
        one_offs=one_offs,
        windows=windows,
        customers=customers,
        events=events,
        fix_log=fix_log,
        cells=cells,
        stockouts=read_clean_csv(paths, "stockouts_clean.csv"),
        test_grid=pd.read_parquet(paths.clean_dir / "test_grid.parquet"),
        master=master,
        price=price,
        cleaned=cleaned_demand(state, one_offs.expectation.expected, one_offs.flags),
    )
    register = build_register(inputs)
    series_key = state.panel.series.set_index(["sku_id", "region"])["series_no"]
    fixes = fix_log[fix_log["file"] == TRAIN].dropna(subset=["sku_id", "region"])
    fixes_per_series = series_key.reindex(pd.MultiIndex.from_frame(fixes[["sku_id", "region"]])).value_counts()
    register_cells = register[register["level"] == "cell"]
    anomaly_cells = series_key.reindex(pd.MultiIndex.from_frame(register_cells[["sku_id", "region"]])).value_counts()
    profile = build_profile(state, master, one_offs.expectation.expected, one_offs.flags, fixes_per_series, anomaly_cells)
    out_cells = anomaly_columns(cells, state, one_offs, masks)
    written = [
        write_train_clean(paths, out_cells, STAGE),
        write_csv(register, paths.anomalies_dir / "anomaly_register.csv"),
        write_csv(profile, paths.anomalies_dir / "series_profile.csv"),
    ]
    checks = anomaly_checks(state, one_offs, masks, register, profile)
    return StageRecord(stage=STAGE, checks=checks, fix_log=empty_fix_log(), outputs=written, headline=_headline(one_offs, masks, register, profile, state))


def anomaly_checks(state: DemandState, one_offs: OneOffs, masks: Masks, register: pd.DataFrame, profile: pd.DataFrame) -> list[Check]:
    """One-off census, register coverage of the problem statement's anomaly items, masks and the profile."""
    p = state.panel
    channels = p.series["sales_channel"].to_numpy()[np.nonzero(one_offs.flags)[0]]
    by_channel = pd.Series(channels).value_counts()
    present = set(register["type"])
    missing = [code for code in REQUIRED_TYPES if code not in present]
    masked = pd.Series(masks.train_mask[p.life]).value_counts()
    episodes = register[register["level"] == "episode"]
    return [
        invariant_check(
            check_id="ANM-ONE-OFFS",
            file=TRAIN,
            rule="RE.ONE_OFF_ORDER",
            title="One-off bulk orders on the phase-aware unconstrained expectation",
            description=(
                f"{int(one_offs.flags.sum())} one-offs after two passes (first pass {int(one_offs.first_pass.sum())}); dossier range 438-541. "
                f"Outside Direct OEM / Tier-1: {int((~np.isin(channels, ONE_OFF_CHANNELS)).sum())}. Expectation smearing factor "
                f"{one_offs.expectation.smear:.4f}."
            ),
            dimension="accuracy",
            unit="cells",
            checked=int(one_offs.flags.sum()),
            violations_before=0,
            violations_after=0,
            action="is_one_off; masked from level estimation (train_mask one_off), replaced by expected_demand",
            severity="info",
            breakdown={str(k): int(v) for k, v in by_channel.items()},
        ),
        invariant_check(
            check_id="ANM-REGISTER-COVERAGE",
            file=TRAIN,
            rule="workstream 2",
            title="Anomaly register covers every Core / Advanced / Expert anomaly item",
            description=(
                f"{len(episodes):,} episodes and {int((register['level'] == 'cell').sum()):,} cells; required types missing: {missing or 'none'}."
            ),
            dimension="completeness",
            unit="types",
            checked=len(REQUIRED_TYPES),
            violations_before=0,
            violations_after=len(missing),
            action="anomaly_register.csv",
            breakdown={f"{cls}.{level}": int(n) for (cls, level), n in register.groupby(["class", "level"]).size().items()},
        ),
        invariant_check(
            check_id="ANM-TRAIN-MASK",
            file=TRAIN,
            rule="6.1",
            title="Cells excluded from model fitting, by reason",
            description=(
                f"train_mask on {int(masked.sum()):,} cells; level_mask adds the semiconductor window, EOL phase-out and pre-switch "
                f"months; weight 0.7 on imputed semiconductor cells, 0.5 on suspected hidden stock-outs."
            ),
            dimension="validity",
            unit="cells",
            checked=int(masked.sum()),
            violations_before=0,
            violations_after=0,
            action="train_mask / level_mask / train_weight columns",
            severity="info",
            breakdown={reason: int(masked.get(reason, 0)) for reason in TRAIN_MASK_ORDER},
            examples=examples_from(episodes.head(5), ["anomaly_id", "type", "class"]),
        ),
        invariant_check(
            check_id="ANM-SERIES-PROFILE",
            file=TRAIN,
            rule="workstream 3 Core",
            title="Series profile with the Syntetos-Boylan intermittency class",
            description="One row per series; SBC class on unconstrained demand (full life) in the breakdown.",
            dimension="completeness",
            unit="series",
            checked=len(profile),
            violations_before=0,
            violations_after=int(profile["sbc_class"].isna().sum()),
            action="series_profile.csv",
            expected_key="grid.series",
            breakdown={str(k): int(v) for k, v in profile["sbc_class"].value_counts().sort_index().items()},
        ),
    ]


def _headline(one_offs: OneOffs, masks: Masks, register: pd.DataFrame, profile: pd.DataFrame, state: DemandState) -> dict:
    p = state.panel
    return {
        "one_offs": int(one_offs.flags.sum()),
        "register_rows": int(len(register)),
        "register_by_class_level": {f"{c}.{lv}": int(n) for (c, lv), n in register.groupby(["class", "level"]).size().items()},
        "register_by_type": {str(k): int(v) for k, v in register.groupby("type").size().items()},
        "train_mask_cells": int((~pd.isna(masks.train_mask[p.life])).sum()),
        "sbc_classes": {str(k): int(v) for k, v in profile["sbc_class"].value_counts().sort_index().items()},
    }
