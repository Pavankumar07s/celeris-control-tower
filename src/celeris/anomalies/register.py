"""The anomaly register: every data error and every real event, at episode and cell level (dossier 3, 2;
methods-cleaning-anomaly 1.3 and 7).

One table, two levels linked by ``episode_id``:

- ``episode`` rows: one per anomaly episode (a fix-log rule, a calendar event, a cycle change, a lost account, ...),
  with scope, period, cause, evidence (compact JSON), action, confidence and impact;
- ``cell`` rows: one per affected series-month where a planner needs a marker on the time series (missing rows,
  unit-changing numeric errors, listed / inferred / suspected stock-outs, back-order catch-up, one-off orders, on-phase
  zeros, sales before the master launch).

``class`` is ``data_error`` (fixed: train / macro / master / stock-out file errors) or ``real_event`` (kept and modelled
or masked: supply, demand, calendar, structural and lifecycle events). Off-phase cycle zeros are structure and are not
registered. Formatting errors are one episode per rule; the fix log holds their cells.

Impact convention (signed): data errors, the correction (units / revenue after minus before; for dropped duplicates
the units a naive sum would have double-counted, negative); supply events, unconstrained demand minus shipments;
one-offs, demand above the expectation; calendar events, actual minus counterfactual from the measured effect; lost
accounts and switches, the annualised change of the monthly level; cycle changes, 0 (volume-conserving). USD at the
invoice price in force.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

import numpy as np
import pandas as pd

from celeris.anomalies.events import (
    PREBUY_CHANNELS,
    PREBUY_MONTHS,
    RED_SEA_REGIONS,
    Effect,
    control_series,
    event_months,
    holiday_days,
    is_lny,
    is_ramadan,
    measure_effect,
    month_idx,
    scope_series,
)
from celeris.anomalies.expectation import OneOffs
from celeris.cleaning.dates import month_label
from celeris.cleaning.numeric import STATES
from celeris.demand.panel import N_MONTHS, Panel
from celeris.demand.semiconductor import leave_one_out_requested
from celeris.demand.state import DemandState
from celeris.demand.unconstrained import METHODS

REGISTER_COLUMNS = (
    "anomaly_id",
    "level",
    "episode_id",
    "type",
    "class",
    "sku_id",
    "region",
    "product_family",
    "sales_channel",
    "customer",
    "scope",
    "date_start",
    "date_end",
    "n_cells",
    "event_id",
    "cause",
    "evidence",
    "detection",
    "action",
    "confidence",
    "impact_units",
    "impact_usd",
    "in_forecast_window",
)
REGION_CODE = {
    "North America": "NA",
    "Europe": "EU",
    "Asia Pacific": "APAC",
    "India": "IN",
    "Latin America": "LATAM",
    "Middle East & Africa": "MEA",
}
DE_TYPES = {
    "K1": ("DE.DUPLICATE", "Exact duplicate load of a Record_ID", "keep one copy"),
    "K2": ("DE.RESTATEMENT", "Superseded re-load (restatement) of a Record_ID", "keep the latest Load_Timestamp; never sum versions"),
    "K3": ("DE.DATE_FORMAT", "Date written in one of six non-standard formats", "normalise to YYYY-MM"),
    "K4": ("DE.DATE_TYPO", "Year typo 2062 for 2026", "swap the last two digits (Record_ID and Load_Timestamp confirm)"),
    "K5": ("DE.MONTH_COLUMN", "Month column holds the load month", "recompute Year / Month from Date (business rule 1)"),
    "K6": ("DE.LABEL_VARIANT", "Region label variant", "map to the canonical label"),
    "K7": ("DE.BLANK_KEY", "Blank Region", "decode from the Record_ID block (two independent witnesses agree)"),
    "K8": ("DE.LABEL_VARIANT", "Sales_Channel label variant", "map to the canonical label"),
    "K9": ("DE.LABEL_VARIANT", "SKU_ID label variant", "map to the canonical SKU"),
    "K10": ("DE.LABEL_VARIANT", "Customer_Name label variant", "map to the canonical customer"),
    "K11": ("DE.BLANK_KEY", "Blank Product_Family", "look up from the SKU prefix"),
    "K12": ("DE.BLANK_KEY", "Blank SKU_Description", "take from the master"),
    "N1": ("DE.UNITS_BLANK", STATES["N1"].title, STATES["N1"].fix),
    "N2": ("DE.UNITS_BLANK", STATES["N2"].title, STATES["N2"].fix),
    "N3": ("DE.UNITS_BLANK", STATES["N3"].title, STATES["N3"].fix),
    "N4": ("DE.SIGN", STATES["N4"].title, STATES["N4"].fix),
    "N5": ("DE.UNITS_SCALE", STATES["N5"].title, STATES["N5"].fix),
    "N6": ("DE.UNITS_SCALE", STATES["N6"].title, STATES["N6"].fix),
    "N6b": ("DE.THOUSANDS_SEPARATOR", "Thousands separator in Units_Sold", "strip the comma before classifying"),
    "N7": ("DE.REVENUE_SCALE", STATES["N7"].title, STATES["N7"].fix),
    "N8": ("DE.REVENUE_TRANSPOSITION", STATES["N8"].title, STATES["N8"].fix),
    "N9": ("DE.PRICE_CENTS", STATES["N9"].title, STATES["N9"].fix),
    "N10": ("DE.CURRENCY_BLOCK", STATES["N10"].title, STATES["N10"].fix),
    "N11": ("DE.UOM_BLOCK", STATES["N11"].title, STATES["N11"].fix),
    "N12": ("DE.SYSTEM_BLANKING", STATES["N12"].title, "units unknown (NaN, masked); 1 restored from Shipped_Units"),
    "N13": ("DE.PRICE_ZEROED", STATES["N13"].title, STATES["N13"].fix),
    "S0": ("DE.STOCKOUT_OVERLAY", "Units only the stock-out file knows (missing, ERP blank, pack-of-10 rows)", "units = Shipped_Units, revenue recomputed"),
    "M1": ("DE.MACRO_DUPLICATE", "Duplicated macro month 2022-06", "keep the later line"),
    "M2": ("DE.MACRO_UNIT", "Auto_Production_YoY_Pct stored as a fraction (2019)", "x100"),
    "M3": ("DE.MACRO_DECIMAL", "PMI decimal shift (2023-05)", "x10"),
    "M4": ("DE.MACRO_REBASE", "Raw_Material_Cost_Index on an old base (2019-2021)", "divide by 1.25"),
    "M5": ("DE.MACRO_BLANK", "Blank macro cell", "mean of the neighbouring months"),
    "S1": ("RC.MASTER_BU", "Master Business_Unit contradicts every transaction (PMP-004)", "correct the master"),
    "S2": ("RC.MASTER_LAUNCH", "Master Launch_Date later than the first sales (BSS-018)", "effective launch = first block month"),
}
UNIT_CELL_RULES = ("N4", "N5", "N6", "N11", "N12")
NO_EFFECT_TYPES = ("Corporate", "Marketing")
MIN_LEVEL_MONTHS = 6


@dataclass(frozen=True)
class RegisterInputs:
    """Everything the register reads."""

    state: DemandState
    one_offs: OneOffs
    windows: dict[str, np.ndarray]
    customers: np.ndarray
    events: pd.DataFrame
    fix_log: pd.DataFrame
    cells: pd.DataFrame  # train_clean through the demand stage
    stockouts: pd.DataFrame
    test_grid: pd.DataFrame
    master: pd.DataFrame
    price: np.ndarray  # (S, T) invoice price in force
    cleaned: np.ndarray  # (S, T) demand for measured effects (one-offs at their expectation)


def _json(payload: dict[str, Any]) -> str:
    def clean(value: Any) -> Any:
        if isinstance(value, dict):
            return {str(k): clean(v) for k, v in value.items()}
        if isinstance(value, (list, tuple)):
            return [clean(v) for v in value]
        if isinstance(value, (np.integer,)):
            return int(value)
        if isinstance(value, (float, np.floating)):
            return None if not np.isfinite(value) else round(float(value), 4)
        return value

    return json.dumps(clean(payload), sort_keys=True, separators=(",", ":"))


def episode(**fields: Any) -> dict[str, Any]:
    row = {column: None for column in REGISTER_COLUMNS}
    row.update(fields)
    row["level"] = "episode"
    row["episode_id"] = row["anomaly_id"]
    return row


def cell_frame(
    inputs: RegisterInputs,
    mask: np.ndarray,
    *,
    type_: str,
    class_: str,
    episode_id: str,
    cause: np.ndarray | str,
    action: str,
    confidence: np.ndarray | str,
    detection: str,
    impact_units: np.ndarray,
    evidence: np.ndarray | str,
    event_id: str | None = None,
) -> pd.DataFrame:
    """Cell rows for every true cell of ``mask``; array arguments are (S, T) or scalars."""
    i, t = np.nonzero(mask)
    series = inputs.state.panel.series

    def pick(value: np.ndarray | str) -> Any:
        return value[i, t] if isinstance(value, np.ndarray) and value.ndim == 2 else value

    units = impact_units[i, t]
    dates = np.array([month_label(m) for m in t], dtype=object)
    regions = series["region"].to_numpy()[i]
    skus = series["sku_id"].to_numpy()[i]
    frame = pd.DataFrame(
        {
            "anomaly_id": [f"{type_}:{sku}:{REGION_CODE[r]}:{d}" for sku, r, d in zip(skus, regions, dates, strict=True)],
            "level": "cell",
            "episode_id": episode_id,
            "type": type_,
            "class": class_,
            "sku_id": skus,
            "region": regions,
            "product_family": series["product_family"].to_numpy()[i],
            "sales_channel": series["sales_channel"].to_numpy()[i],
            "customer": inputs.customers[i, t],
            "scope": "series-month",
            "date_start": dates,
            "date_end": dates,
            "n_cells": 1,
            "event_id": event_id,
            "cause": pick(cause),
            "evidence": pick(evidence),
            "detection": detection,
            "action": action,
            "confidence": pick(confidence),
            "impact_units": np.round(units, 2),
            "impact_usd": np.round(units * inputs.price[i, t], 2),
            "in_forecast_window": False,
        }
    )
    return frame.loc[:, list(REGISTER_COLUMNS)]


def _evidence_cells(**arrays: np.ndarray) -> np.ndarray:
    """(S, T) JSON evidence strings built lazily for the cells that need them."""
    shape = next(iter(arrays.values())).shape
    out = np.empty(shape, dtype=object)
    keys = list(arrays)
    stacked = np.stack([np.asarray(arrays[k], dtype="float64") for k in keys], axis=-1)
    flat = stacked.reshape(-1, len(keys))
    texts = [None] * len(flat)
    mask = np.isfinite(flat).any(axis=1)
    for position in np.flatnonzero(mask):
        texts[position] = _json(dict(zip(keys, flat[position], strict=True)))
    out.reshape(-1)[:] = texts
    return out


# --- data errors ------------------------------------------------------------------------------------------------------


def data_error_rows(inputs: RegisterInputs) -> list[pd.DataFrame]:
    """One episode per fix-log rule (conventions excluded), the missing-row and stock-out documentation episodes, and
    cell rows for unit-changing record errors and missing rows."""
    log = inputs.fix_log[inputs.fix_log["method"] != "convention"]
    keys = ["date", "sku_id", "region"]
    with_channel = log.merge(inputs.cells[keys + ["sales_channel"]], on=keys, how="left", validate="many_to_one")
    episodes = []
    for (file, rule), rows in with_channel.groupby(["file", "rule"], sort=True):
        type_, cause, action = DE_TYPES[rule]
        units_rows = rows[rows["column"] == "Units_Sold"]
        revenue_rows = rows[rows["column"] == "Revenue_USD"]
        dropped = rows[rows["column"] == "<row>"]
        impact_units = _delta(units_rows) - (pd.to_numeric(dropped["raw_value"], errors="coerce").sum() if file == "train.csv" else 0.0)
        impact_usd = _delta(revenue_rows)
        if rule == "N12":
            impact_units, impact_usd = _hidden_erp_orders(inputs)
        located = rows.dropna(subset=keys)
        channels = located["sales_channel"].dropna().unique()
        regions = located["region"].unique()
        scope = file if len(regions) != 1 or len(channels) != 1 else f"{regions[0]} x {channels[0]}"
        episodes.append(
            episode(
                anomaly_id=f"{type_}:{file}:{rule}",
                type=type_,
                **{"class": "data_error"},
                region=regions[0] if len(regions) == 1 else None,
                sales_channel=channels[0] if len(channels) == 1 else None,
                sku_id=rows["sku_id"].iloc[0] if rows["sku_id"].nunique() == 1 else None,
                scope=scope,
                date_start=located["date"].min() if len(located) else None,
                date_end=located["date"].max() if len(located) else None,
                n_cells=int(rows.drop_duplicates(["record_id", "date", "sku_id", "region"]).shape[0]),
                event_id="EV-033" if rule == "N12" else None,
                cause=f"{cause} (rule {rule})",
                evidence=_json({"rule": rule, "file": file, "rows": len(rows), "columns": rows["column"].value_counts().to_dict(),
                                "methods": rows["method"].value_counts().to_dict()}),
                detection="exact arithmetic / key signature (fix log)",
                action=action,
                confidence="high",
                impact_units=round(float(impact_units), 2),
                impact_usd=round(float(impact_usd), 2),
                in_forecast_window=False,
            )
        )
    p, u = inputs.state.panel, inputs.state.unconstrained
    names = np.asarray(METHODS)[u.method]
    missing = p.missing_row
    hidden = np.where(missing, inputs.state.filled.demand_filled, np.nan)
    episodes.append(
        episode(
            anomaly_id="DE.MISSING_ROW:train.csv:K13",
            type="DE.MISSING_ROW",
            **{"class": "data_error"},
            scope="train.csv",
            date_start=month_label(np.nonzero(missing)[1].min()),
            date_end=month_label(np.nonzero(missing)[1].max()),
            n_cells=int(missing.sum()),
            cause="Deleted record: a gap in the Record_ID sequence (0.400 % of the grid, missing completely at random) (rule K13)",
            evidence=_json({"treatment": pd.Series(names[missing]).value_counts().to_dict()}),
            detection="Record_ID grid",
            action="never 0 on an on-phase month: listed -> Shipped / Requested; off-phase -> 0; on-phase -> NaN, filled for display",
            confidence="high",
            impact_units=round(float(np.nansum(hidden)), 2),
            impact_usd=round(float(np.nansum(hidden * inputs.price)), 2),
            in_forecast_window=False,
        )
    )
    so = inputs.stockouts
    demand = so["requested_units"] + so["carried_in_units"]
    documented = so[demand > 0]
    mismatch = int(((100 * documented["shipped_units"] / (documented["requested_units"] + documented["carried_in_units"])).round(1) != documented["fill_rate_pct"]).sum())
    episodes.append(
        episode(
            anomaly_id="RC.DOCUMENTATION:inventory_stockouts.csv:I2",
            type="RC.DOCUMENTATION",
            **{"class": "data_error"},
            scope="inventory_stockouts.csv",
            date_start=so["date"].min(),
            date_end=so["date"].max(),
            n_cells=mismatch,
            cause="Fill_Rate_Pct is the latent allocation fraction, not Shipped / (Requested + Carried_In) as documented (rule I2)",
            evidence=_json({"rows_with_demand": len(documented), "documented_definition_holds": len(documented) - mismatch}),
            detection="exact identity Shipped = floor(f x (R + C))",
            action="keep fill_rate_pct; report realised_fill_pct",
            confidence="high",
            impact_units=0.0,
            impact_usd=0.0,
            in_forecast_window=False,
        )
    )
    frames = [pd.DataFrame(episodes)]
    frames.append(_record_error_cells(inputs, log))
    unknown = np.isin(names, ["missing_onphase_unknown", "missing_after_backorder"])
    cause = np.where(names == "S1_listed_requested", "missing row restored from the stock-out file",
                     np.where(unknown, "missing row in an order month: demand unknown", "missing row in an off-phase / lost month: zero"))
    frames.append(
        cell_frame(
            inputs, missing, type_="DE.MISSING_ROW", class_="data_error", episode_id="DE.MISSING_ROW:train.csv:K13",
            cause=cause, action="see episode", confidence="high", detection="Record_ID grid",
            impact_units=np.where(missing, np.nan_to_num(inputs.state.filled.demand_filled), 0.0),
            evidence=_evidence_cells(demand_filled=np.where(missing, inputs.state.filled.demand_filled, np.nan)),
        )
    )
    return frames


def _hidden_erp_orders(inputs: RegisterInputs) -> tuple[float, float]:
    """Estimated size of the ERP-blank orders (their fill), the units the blanking hid."""
    erp = inputs.state.panel.positive_unknown
    filled = np.where(erp, inputs.state.filled.demand_filled, np.nan)
    return float(np.nansum(filled)), float(np.nansum(filled * inputs.price))


def _delta(rows: pd.DataFrame) -> float:
    after = pd.to_numeric(rows["after"], errors="coerce").fillna(0.0)
    before = pd.to_numeric(rows["before"], errors="coerce").fillna(0.0)
    return float((after - before).sum())


def _record_error_cells(inputs: RegisterInputs, log: pd.DataFrame) -> pd.DataFrame:
    """Cell rows for the record errors that change units (sign, scale, pack, ERP)."""
    p = inputs.state.panel
    index = p.series.set_index(["sku_id", "region"])["series_no"]
    parts = []
    for rule in UNIT_CELL_RULES:
        rows = log[(log["rule"] == rule) & (log["column"] == "Units_Sold")]
        s = index.reindex(pd.MultiIndex.from_frame(rows[["sku_id", "region"]])).to_numpy()
        t = rows["date"].map(month_idx).to_numpy()
        mask = np.zeros(p.life.shape, dtype=bool)
        mask[s, t] = True
        delta = np.zeros(p.life.shape)
        delta[s, t] = pd.to_numeric(rows["after"], errors="coerce").fillna(0).to_numpy() - pd.to_numeric(rows["before"], errors="coerce").fillna(0).to_numpy()
        evidence = np.full(p.life.shape, None, dtype=object)
        evidence[s, t] = ('{"raw":"' + rows["raw_value"].fillna("") + '","after":"' + rows["after"].fillna("") + '"}').to_numpy()
        type_, cause, action = DE_TYPES[rule]
        parts.append(
            cell_frame(
                inputs, mask, type_=type_, class_="data_error", episode_id=f"{type_}:train.csv:{rule}", cause=cause,
                action=action, confidence="high", detection="exact arithmetic signature", impact_units=delta, evidence=evidence,
                event_id="EV-033" if rule == "N12" else None,
            )
        )
    return pd.concat(parts, ignore_index=True)


# --- supply events ----------------------------------------------------------------------------------------------------


def supply_rows(inputs: RegisterInputs) -> list[pd.DataFrame]:
    """Listed, unlisted-semiconductor, inferred and suspected stock-outs and back-order catch-up."""
    state = inputs.state
    p, u = state.panel, state.unconstrained
    names = np.asarray(METHODS)[u.method]
    uplift = np.nan_to_num(u.demand) - np.nan_to_num(p.units)
    uplift = np.where(np.isnan(u.demand) | np.isnan(p.units), 0.0, uplift)
    listed = p.listed & ((u.shortfall > 0) | (u.backorder_in > 0))
    semi_listed = listed & p.semiconductor_row
    oper_listed = listed & ~p.semiconductor_row
    s5 = names == "S5_semiconductor_imputed"
    inferred = u.inferred & ~s5 & ~p.listed
    suspect = u.suspect & ~inferred
    catchup = np.isin(names, ["S2_carry_removed", "D1_phantom_removed", "spill_removed"])
    loo = _semiconductor_loo(state)
    evidence_listed = _evidence_cells(requested=np.where(listed, p.requested, np.nan), shipped=np.where(listed, p.shipped, np.nan),
                                      lost=np.where(listed, u.lost_units, np.nan), backordered=np.where(listed, u.backorder_out, np.nan))
    frames = [
        pd.DataFrame(
            [
                _cell_episode(inputs, semi_listed, "RE.STOCKOUT_LISTED", "RE.STOCKOUT_LISTED:semiconductor", uplift,
                              cause="Listed semiconductor allocation (EV-019): Shipped = floor(fill x requested), nothing back-ordered",
                              action="demand = Requested_Units (S1)", detection="inventory_stockouts.csv", event_id="EV-019",
                              evidence={"lost_units": float(np.nansum(u.lost_units[semi_listed]))}),
                _cell_episode(inputs, oper_listed, "RE.STOCKOUT_LISTED", "RE.STOCKOUT_LISTED:operational", uplift,
                              cause="Listed operational stock-out (logistics, supplier quality, capacity, tooling): 40 % of the shortfall back-ordered",
                              action="demand = Requested_Units (S1); the carry is removed from the next month (S2)",
                              detection="inventory_stockouts.csv",
                              evidence={"lost_units": float(np.nansum(u.lost_units[oper_listed])), "backordered_units": float(np.nansum(u.backorder_out[oper_listed]))}),
                _cell_episode(inputs, s5, "RE.SEMICONDUCTOR_ALLOCATION", "RE.SEMICONDUCTOR_ALLOCATION:EV-019", uplift,
                              cause="Unlisted ELA cell inside the semiconductor window: every ELA cell 2021-03..2022-09 is constrained, ~69 % listed",
                              action="demand = round((u + 0.5) / fill_hat) - carry-in (S5), sample weight 0.7",
                              detection="depth(month) x severity(series) fitted on listed rows", event_id="EV-019",
                              evidence={"depth_peak": float(state.semiconductor.depth.max()),
                                        "depth_peak_month": month_label(state.semiconductor.depth.idxmax()),
                                        "severity_mean": float(state.semiconductor.severity.mean()),
                                        "severity_sd": float(state.semiconductor.severity.std()), **loo}),
                _cell_episode(inputs, inferred, "RE.STOCKOUT_UNLISTED", "RE.STOCKOUT_UNLISTED:exact", uplift,
                              cause="Unlisted operational stock-out revealed exactly (D2 listed carry-in, D1 phantom order, D3 short carry, spill origin)",
                              action="demand = shipped + implied shortfall where it is pinned (D1, D2); flagged", detection="arithmetic signatures D1-D3",
                              evidence={"by_method": pd.Series(names[inferred]).value_counts().to_dict()}),
                _cell_episode(inputs, suspect, "RE.STOCKOUT_UNLISTED", "RE.STOCKOUT_UNLISTED:suspected", np.zeros(p.life.shape),
                              cause="Suspected hidden second stock-out month: month after a back-order below 0.35 x its local level",
                              action="keep value, down-weight (train_weight 0.5)", detection="S2 cell vs local baseline", confidence="low",
                              evidence={"cells": int(suspect.sum()), "threshold_vs_local_level": 0.35}),
                _cell_episode(inputs, catchup, "RE.BACKORDER_CATCHUP", "RE.BACKORDER_CATCHUP:all", uplift,
                              cause="Back-ordered units shipped the month after a stock-out (carry), including phantom orders in off-phase months",
                              action="subtract the carry (S2), phantom / spill -> 0 demand", detection="Carried_In(t) = Backordered(t-1)",
                              evidence={"by_method": pd.Series(names[catchup]).value_counts().to_dict()}),
            ]
        )
    ]
    for mask, episode_id, event_id in ((semi_listed, "RE.STOCKOUT_LISTED:semiconductor", "EV-019"), (oper_listed, "RE.STOCKOUT_LISTED:operational", None)):
        frames.append(cell_frame(inputs, mask, type_="RE.STOCKOUT_LISTED", class_="real_event", episode_id=episode_id,
                                 cause="listed stock-out", action="demand = Requested_Units", confidence="high",
                                 detection="inventory_stockouts.csv", impact_units=uplift, evidence=evidence_listed, event_id=event_id))
    frames.append(cell_frame(inputs, s5, type_="RE.SEMICONDUCTOR_ALLOCATION", class_="real_event", episode_id="RE.SEMICONDUCTOR_ALLOCATION:EV-019",
                             cause="unlisted semiconductor-constrained cell", action="S5 imputation", confidence="high",
                             detection="depth x severity", impact_units=uplift, event_id="EV-019",
                             evidence=_evidence_cells(shipped=np.where(s5, p.units, np.nan), fill_hat=np.where(s5, u.fill_used, np.nan))))
    frames.append(cell_frame(inputs, inferred, type_="RE.STOCKOUT_UNLISTED", class_="real_event", episode_id="RE.STOCKOUT_UNLISTED:exact",
                             cause=np.where(names == "D2_hidden_stockout", "D2: listed carry-in reveals the stock-out",
                                            np.where(names == "D1_hidden_stockout", "D1: phantom order next month reveals the stock-out",
                                                     np.where(names == "D3_hidden_second_month", "D3: shipped less than the carry-in", "origin of off-phase spill"))),
                             action="flag; demand recovered where pinned", confidence=np.where(np.isin(names, ["D1_hidden_stockout", "D2_hidden_stockout", "D3_hidden_second_month"]), "high", "medium"),
                             detection="arithmetic signature", impact_units=uplift,
                             evidence=_evidence_cells(shortfall=np.where(inferred, u.shortfall, np.nan), backordered=np.where(inferred, u.backorder_out, np.nan))))
    frames.append(cell_frame(inputs, suspect, type_="RE.STOCKOUT_UNLISTED", class_="real_event", episode_id="RE.STOCKOUT_UNLISTED:suspected",
                             cause="suspected hidden second stock-out month", action="down-weight", confidence="low",
                             detection="below 0.35 x local level after a back-order", impact_units=np.zeros(p.life.shape),
                             evidence=_evidence_cells(demand=np.where(suspect, u.demand, np.nan))))
    frames.append(cell_frame(inputs, catchup, type_="RE.BACKORDER_CATCHUP", class_="real_event", episode_id="RE.BACKORDER_CATCHUP:all",
                             cause=np.where(names == "S2_carry_removed", "carry from the listed stock-out last month", "off-phase phantom / spill"),
                             action="remove the carry from demand", confidence="high", detection="Carried_In(t) = Backordered(t-1)",
                             impact_units=uplift, evidence=_evidence_cells(carry_removed=np.where(catchup, u.backorder_in, np.nan))))
    return frames


def _cell_episode(inputs: RegisterInputs, mask: np.ndarray, type_: str, anomaly_id: str, impact: np.ndarray, *, cause: str, action: str,
                  detection: str, evidence: dict, event_id: str | None = None, confidence: str = "high") -> dict[str, Any]:
    """Episode summarising a set of cell rows (period, count and summed impact)."""
    i, t = np.nonzero(mask)
    return episode(
        anomaly_id=anomaly_id,
        type=type_,
        **{"class": "real_event"},
        scope=f"{len(np.unique(i))} series",
        date_start=month_label(t.min()) if len(t) else None,
        date_end=month_label(t.max()) if len(t) else None,
        n_cells=int(mask.sum()),
        event_id=event_id,
        cause=cause,
        evidence=_json(evidence),
        detection=detection,
        action=action,
        confidence=confidence,
        impact_units=round(float(np.nansum(impact[mask])), 2),
        impact_usd=round(float(np.nansum((impact * inputs.price)[mask])), 2),
        in_forecast_window=False,
    )


def _semiconductor_loo(state: DemandState) -> dict[str, float]:
    """Leave-one-out accuracy of the S5 imputer on listed semiconductor rows (SU: WAPE 5.3 %, bias -0.2 %)."""
    p = state.panel
    i, t = np.nonzero(p.listed & p.semiconductor_row)
    rows = pd.DataFrame({"series_no": i, "month_idx": t, "fill_rate_pct": p.fill_pct[i, t], "shipped_units": p.shipped[i, t],
                         "carried_in_units": p.carried_in[i, t]})
    estimate = leave_one_out_requested(rows, state.semiconductor).to_numpy()
    actual = p.requested[i, t]
    return {"loo_wape": float(np.abs(estimate - actual).sum() / actual.sum()), "loo_bias": float((estimate - actual).sum() / actual.sum())}


# --- demand events ----------------------------------------------------------------------------------------------------


def one_off_rows(inputs: RegisterInputs) -> list[pd.DataFrame]:
    p = inputs.state.panel
    flags = inputs.one_offs.flags
    expected = inputs.one_offs.expectation.expected
    demand = inputs.state.unconstrained.demand
    excess = np.where(flags, demand - expected, 0.0)
    ratio = np.where(flags, demand / np.where(expected > 0, expected, np.nan), np.nan)
    by_channel = pd.Series(p.series["sales_channel"].to_numpy()[np.nonzero(flags)[0]]).value_counts().to_dict()
    head = _cell_episode(inputs, flags, "RE.ONE_OFF_ORDER", "RE.ONE_OFF_ORDER:all", excess,
                         cause="One-off bulk order: real (reconciles to the cent), not repeated, no payback; Direct OEM / Tier-1",
                         action="keep in history and dashboard; mask from level / seasonality / noise estimation (replace by expected_demand)",
                         detection="order > 3.5 x (3 x for OEM / Tier-1, expected >= 25) the phase-aware unconstrained expectation, two passes",
                         evidence={"by_channel": by_channel, "median_multiplier": float(np.nanmedian(ratio[flags])),
                                   "share_of_demand": float(excess.sum() / np.nansum(demand))})
    cells = cell_frame(inputs, flags, type_="RE.ONE_OFF_ORDER", class_="real_event", episode_id="RE.ONE_OFF_ORDER:all",
                       cause="one-off bulk order", action="mask for level estimation", confidence=np.where(ratio >= 4.0, "high", "medium"),
                       detection="phase-aware expectation", impact_units=excess,
                       evidence=_evidence_cells(demand=np.where(flags, demand, np.nan), expected=np.where(flags, expected, np.nan),
                                                multiplier=ratio))
    return [pd.DataFrame([head]), cells]


def onphase_zero_rows(inputs: RegisterInputs) -> list[pd.DataFrame]:
    """On-phase zeros (structure: launch / MEA ramp, COVID lockdown, low volume): kept, not a cycle change."""
    state = inputs.state
    p, u = state.panel, state.unconstrained
    names = np.asarray(METHODS)[u.method]
    zero = p.life & state.cycles.on_phase & (u.demand == 0) & ~state.lost_tail & ~np.isin(names, ["D1_phantom_removed", "spill_removed", "missing_offphase_zero"])
    ramp = (p.start > 0)[:, None] & (p.age < 12)
    covid = inputs.windows["covid_2020"]
    expected = inputs.one_offs.expectation.expected
    low = np.nan_to_num(expected) < 8
    cause = np.where(ramp, "launch / region-opening ramp", np.where(covid, "COVID 2020 lockdown", np.where(low, "low-volume series (< 8 units per order)", "other")))
    head = _cell_episode(inputs, zero, "ST.ONPHASE_ZERO", "ST.ONPHASE_ZERO:all", np.zeros(p.life.shape),
                         cause="Zero demand in an order month: ramp, lockdown or low volume (structure, not a cycle change)",
                         action="keep; no cycle change", detection="cycle template vs zero",
                         evidence={"by_cause": pd.Series(cause[zero]).value_counts().to_dict()})
    cells = cell_frame(inputs, zero, type_="ST.ONPHASE_ZERO", class_="real_event", episode_id="ST.ONPHASE_ZERO:all", cause=cause,
                       action="keep", confidence="medium", detection="cycle template", impact_units=np.zeros(p.life.shape),
                       evidence=_evidence_cells(expected=np.where(zero, expected, np.nan)))
    return [pd.DataFrame([head]), cells]


def calendar_rows(inputs: RegisterInputs) -> pd.DataFrame:
    """One episode per calendar event with its measured effect (EV-019 and EV-033 sit in the supply / data rows)."""
    state = inputs.state
    rows = []
    for _, event in inputs.events.iterrows():
        if event["event_type"] in ("Supply Constraint",) or (event["event_type"] == "System" and event["scope_type"] == "Region"):
            continue
        rows.append(_calendar_episode(inputs, event))
    holidays = _regional_month_rows(inputs)
    return pd.DataFrame(rows + holidays)


def _calendar_episode(inputs: RegisterInputs, event: pd.Series) -> dict[str, Any]:
    state = inputs.state
    series = state.panel.series
    months = event_months(event, state.as_of)
    kind, type_, action = _event_kind(event)
    scope_text = event["scope_value"]
    evidence: dict[str, Any] = {"event_type": event["event_type"], "description": event["description"]}
    if pd.notna(event["announced_pct"]):
        evidence["announced_pct"] = float(event["announced_pct"])
    effect: Effect | None = None
    if kind == "prebuy":
        first = month_idx(event["start_month"]) + 1
        months = np.arange(first, first + PREBUY_MONTHS)
        members = series["sales_channel"].isin(PREBUY_CHANNELS).to_numpy()
        effect = measure_effect(inputs.cleaned, state, months, lambda m: members, lambda m, s: ~s)
        scope_text = " + ".join(PREBUY_CHANNELS)
    elif kind == "red_sea":
        members = (series["sales_channel"] == event["scope_channel"]).to_numpy()
        refined = members & series["region"].isin(RED_SEA_REGIONS).to_numpy()
        effect = measure_effect(inputs.cleaned, state, months, lambda m: refined, lambda m, s: series["region"].isin(RED_SEA_REGIONS).to_numpy() & ~s)
        evidence["listed_scope_effect"] = measure_effect(inputs.cleaned, state, months, lambda m: members, lambda m, s: ~s).multiplier
        evidence["by_region"] = {
            region: measure_effect(inputs.cleaned, state, months, lambda m, r=region: members & (series["region"] == r).to_numpy(),
                                   lambda m, s, r=region: (series["region"] == r).to_numpy() & ~s).multiplier
            for region in sorted(series["region"].unique())
        }
        scope_text = f"{event['scope_channel']} x {{{', '.join(RED_SEA_REGIONS)}}}"
    elif kind in ("lny", "ramadan"):
        days = {m: d for m, d in holiday_days(event).items() if m <= state.as_of}
        months = np.array(sorted(days), dtype=int)
        evidence["days_by_month"] = {month_label(m): d for m, d in days.items()}
        effect = _measure_listed(inputs, event, months)
    elif kind == "summer":
        evidence["regional_month_index"] = _region_month_index(inputs, event["scope_region"], month_idx(event["start_month"]) % 12)
    elif kind == "opening":
        evidence["region_factor_ramp"] = _opening_ramp(inputs, event["scope_region"], month_idx(event["start_month"]))
    elif len(months):
        effect = _measure_listed(inputs, event, months)
    if effect is not None:
        evidence.update({"measured_multiplier": effect.multiplier, "by_month": effect.by_month, "series_compared": effect.n_series})
    if event["in_forecast_window"]:
        evidence["test_rows_in_scope"] = _window_rows(inputs, event)
    if kind == "no_effect" and effect is not None and np.isfinite(effect.multiplier):
        evidence["verdict"] = "no measurable demand effect" if abs(effect.multiplier - 1) < 0.05 else "effect not attributable (no control)"
    impact = effect.impact_units if effect is not None and np.isfinite(effect.impact_units) else 0.0
    price = _scope_price(inputs, event, months)
    return episode(
        anomaly_id=f"{type_}:{event['event_id']}",
        type=type_,
        **{"class": "real_event"},
        region=event["scope_region"] if isinstance(event["scope_region"], str) else None,
        product_family=event["scope_family"] if isinstance(event["scope_family"], str) else None,
        sales_channel=event["scope_channel"] if isinstance(event["scope_channel"], str) and kind != "prebuy" else None,
        customer=event["scope_customer"] if isinstance(event["scope_customer"], str) else None,
        scope=scope_text,
        date_start=event["start_month"],
        date_end=event["end_month"],
        n_cells=None,
        event_id=event["event_id"],
        cause=event["description"],
        evidence=_json(evidence),
        detection="events calendar; difference in differences vs other years and a control group",
        action=action,
        confidence="high" if kind not in ("orion", "holiday_window") else "medium",
        impact_units=round(float(impact), 2),
        impact_usd=round(float(impact * price), 2),
        in_forecast_window=bool(event["in_forecast_window"]),
    )


def _opening_ramp(inputs: RegisterInputs, region: str, first: int) -> dict[str, float]:
    """Region factor in the first 12 months after an opening relative to its mean two to four years later."""
    factor = inputs.one_offs.expectation.factors["region"][region]
    mature = factor[(factor.index >= first + 24) & (factor.index <= min(first + 47, inputs.state.as_of))].mean()
    return {month_label(m): float(factor[m] / mature) for m in range(first, min(first + 12, inputs.state.as_of + 1))}


def _window_rows(inputs: RegisterInputs, event: pd.Series) -> int:
    """Test rows inside an event's listed scope and months (customer events: the test customer)."""
    grid = inputs.test_grid
    rows = grid["date"].between(event["start_month"], event["end_month"])
    kind = event["scope_type"]
    if kind == "Region":
        rows &= grid["region"] == event["scope_region"]
    elif kind == "Product_Family":
        rows &= grid["product_family"] == event["scope_family"]
    elif kind == "Channel":
        rows &= grid["sales_channel"] == event["scope_channel"]
    elif kind == "Customer":
        rows &= (grid["region"] == event["scope_region"]) & (grid["customer"] == event["scope_customer"])
    return int(rows.sum())


def _event_kind(event: pd.Series) -> tuple[str, str, str]:
    """(kind, register type, action) of a calendar event (dossier 2.6, 3, 5.7)."""
    etype, description = event["event_type"], event["description"]
    if etype in NO_EFFECT_TYPES or etype == "System":
        return "no_effect", "RE.NO_EFFECT", "reviewed: no demand effect; document only"
    if etype == "Price Change":
        if "surcharge" in description.lower():
            return "surcharge", "RE.SURCHARGE", "price table only (invoice = list x 1.06); no demand effect"
        return "price", "RE.PRICE_CHANGE", "price table only; ordinary channel year-end pattern as seasonality"
    if etype == "Announcement":
        return "prebuy", "RE.PREBUY_PRICE_RISE", "mask Tier-1 + Aftermarket 2022-12..2023-02 from fitting; no pre-buy in the window"
    if etype == "Holiday":
        if is_lny(event):
            return "lny", "RE.HOLIDAY", "day-count feature (1 - depth x days / 10); never a fixed APAC Jan / Feb index"
        if is_ramadan(event):
            return "ramadan", "RE.HOLIDAY", "day-count feature (1 - depth x days / 30)"
        return "summer", "RE.HOLIDAY", "region x calendar-month seasonality"
    if etype == "Disruption":
        return "covid", "RE.DISRUPTION", "mask 2020-02..2020-09 from level, seasonality, noise and driver estimation"
    if etype == "Market Entry":
        return "opening", "RE.REGION_OPENING", "ramp feature (MEA age); not separately identifiable from MEA x month"
    if etype == "Logistics":
        return "red_sea", "RE.LOGISTICS", "mask Export x Europe / MEA 2024-01..03 from fitting"
    if etype == "Customer Event":
        if event["open_ended"]:
            return "programme", "RE.PROGRAM_STEP", "permanent level step: level from 2025-10 on (customer at time)"
        if event["in_forecast_window"]:
            return "orion", "RE.CUSTOMER_SHUTDOWN", "x0.15 on latent demand in 2027-07/08 (Nexon strike analogue), then accumulate"
        return "strike", "RE.STRIKE", "mask the cells (customer at time); analogue for the Orion 2027 shutdown"
    return "other", "RE.OTHER", "document"


def _measure_listed(inputs: RegisterInputs, event: pd.Series, months: np.ndarray) -> Effect:
    state = inputs.state
    return measure_effect(
        inputs.cleaned,
        state,
        months,
        lambda m: scope_series(event, state, inputs.customers, min(m, state.as_of)),
        None if event["scope_type"] == "Global" else (lambda m, s: control_series(event, state, s)),
    )


def _scope_price(inputs: RegisterInputs, event: pd.Series, months: np.ndarray) -> float:
    months = months[(months >= 0) & (months < N_MONTHS)] if len(months) else months
    if not len(months):
        return float(np.nanmean(inputs.price[:, -1]))
    values = inputs.price[:, months]
    weights = np.nan_to_num(inputs.cleaned[:, months])
    return float(np.nansum(values * weights) / max(weights.sum(), 1.0))


def _region_month_index(inputs: RegisterInputs, region: str, calendar_month: int) -> float:
    """Mean regional factor of a calendar month over the history relative to the region's mean (IPF region factor)."""
    factor = inputs.one_offs.expectation.factors["region"][region]
    factor = factor[factor.index <= inputs.state.as_of]
    covid = (factor.index >= 12) & (factor.index <= 23)
    clean = factor[~covid & (factor != 1.0)]
    by_month = clean.groupby(clean.index % 12).mean()
    return float(by_month.get(calendar_month, np.nan) / by_month.mean())


def _regional_month_rows(inputs: RegisterInputs) -> list[dict[str, Any]]:
    """Fixed regional calendar months with an index beyond +-8 %, listed (summer shutdowns) or not (dossier 3)."""
    rows = []
    listed = {(row["scope_region"], month_idx(row["start_month"]) % 12) for _, row in inputs.events.iterrows()
              if row["event_type"] == "Holiday" and not is_lny(row) and not is_ramadan(row)}
    moving = {(row["scope_region"], m % 12) for _, row in inputs.events.iterrows() if is_lny(row) or is_ramadan(row) for m in holiday_days(row)}
    names = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
    for region in sorted(inputs.state.panel.series["region"].unique()):
        for month in range(12):
            index = _region_month_index(inputs, region, month)
            if not np.isfinite(index) or abs(index - 1) < 0.08 or (region, month) in moving:
                continue
            is_listed = (region, month) in listed
            rows.append(
                episode(
                    anomaly_id=f"RE.HOLIDAY:{REGION_CODE[region]}:{names[month]}",
                    type="RE.HOLIDAY",
                    **{"class": "real_event"},
                    region=region,
                    scope=f"{region} x {names[month]} (every year)",
                    cause=("listed regional shutdown month" if is_listed else "unlisted regional calendar month") + f" ({names[month]})",
                    evidence=_json({"regional_month_index": index, "listed": is_listed}),
                    detection="region x calendar-month factor of the multiplicative model",
                    action="full region x calendar-month seasonality (no named dummies)",
                    confidence="high",
                    impact_units=0.0,
                    impact_usd=0.0,
                    in_forecast_window=True,
                )
            )
    return rows


# --- structural and lifecycle events ------------------------------------------------------------------------------------


def structural_rows(inputs: RegisterInputs) -> pd.DataFrame:
    """Cycle changes, customer switches, lost accounts, launches, EOL, cold starts and master-data conflicts."""
    state = inputs.state
    p = state.panel
    series = p.series
    filled = state.filled.demand_filled
    price_origin = _origin_price(inputs)
    rows = []
    cycles = state.cycles.series
    for row in cycles[cycles["cycle_change_idx"] >= 0].itertuples(index=False):
        s, month = row.series_no, row.cycle_change_idx
        before = _level(filled, p, s, month - 18, month - 1)
        after = _level(filled, p, s, row.cycle_change_window_end_idx, row.cycle_change_window_end_idx + 17)
        rows.append(_series_episode(inputs, s, "ST.CYCLE_CHANGE", month, row.cycle_change_window_end_idx,
                                    cause=f"Ordering cycle changed {row.cycle_pattern_before} -> {row.cycle_pattern}",
                                    evidence={"before": row.cycle_pattern_before, "after": row.cycle_pattern, "mismatches_single": row.mismatches_single,
                                              "mismatches_with_change": row.mismatches, "level_before": before, "level_after": after},
                                    detection="template segmentation (single change point)",
                                    action="use the regime in force at the origin; no level break", impact=0.0, price=0.0))
    for row in state.switches.itertuples(index=False):
        delta = 12 * (row.level_after - row.level_before)
        rows.append(_series_episode(inputs, row.series_no, "ST.CUSTOMER_SWITCH", row.switch_idx, row.switch_idx,
                                    cause=f"Customer switch {row.customer_before} -> {row.customer_after}",
                                    evidence={"level_before": row.level_before, "level_after": row.level_after, "ratio": row.level_ratio,
                                              "ratio_region_adjusted": row.level_ratio_region_adjusted, "gap_months": row.gap_months},
                                    detection="customer label change on cleaned labels", action="level from post-switch months; customer at time for events",
                                    impact=delta, price=price_origin[row.series_no]))
    for row in state.lost_accounts.itertuples(index=False):
        rows.append(_series_episode(inputs, row.series_no, "ST.LOST_ACCOUNT", row.lost_since_idx, state.as_of,
                                    cause="Lost account: no order since the last order month, all other regions of the SKU still sell",
                                    evidence={"last_order": month_label(row.last_order_idx), "silent_months": row.silent_months, "pre_loss_level": row.pre_loss_level,
                                              "forecast_rows_zero": 19},
                                    detection=">= 6 silent months on a live series", action="forecast 0 (P10 = P50 = P90 = 0); tail masked",
                                    impact=-12 * row.pre_loss_level, price=price_origin[row.series_no], window=True))
    rows += _lifecycle_rows(inputs)
    return pd.DataFrame(rows)


def _origin_price(inputs: RegisterInputs) -> np.ndarray:
    price = pd.DataFrame(inputs.price).T.ffill().T.to_numpy()
    return price[:, inputs.state.as_of]


def _level(filled: np.ndarray, panel: Panel, s: int, first: int, last: int) -> float:
    first, last = max(first, panel.start[s]), min(last, panel.end[s])
    if last - first + 1 < MIN_LEVEL_MONTHS:
        return float("nan")
    return float(np.nansum(filled[s, first : last + 1]) / (last - first + 1))


def _series_episode(inputs: RegisterInputs, s: int, type_: str, first: int, last: int, *, cause: str, evidence: dict, detection: str,
                    action: str, impact: float, price: float, window: bool = False) -> dict[str, Any]:
    series = inputs.state.panel.series
    sku, region = series["sku_id"].iat[s], series["region"].iat[s]
    return episode(
        anomaly_id=f"{type_}:{sku}:{REGION_CODE[region]}:{month_label(first)}",
        type=type_,
        **{"class": "real_event"},
        sku_id=sku,
        region=region,
        product_family=series["product_family"].iat[s],
        sales_channel=series["sales_channel"].iat[s],
        customer=inputs.customers[s, min(max(first, inputs.state.panel.start[s]), inputs.state.as_of)],
        scope="series",
        date_start=month_label(first),
        date_end=month_label(last),
        n_cells=int(last - first + 1),
        cause=cause,
        evidence=_json(evidence),
        detection=detection,
        action=action,
        confidence="high",
        impact_units=round(float(impact), 2),
        impact_usd=round(float(impact * price), 2),
        in_forecast_window=window,
    )


def _lifecycle_rows(inputs: RegisterInputs) -> list[dict[str, Any]]:
    """Launch ramps (per launching SKU), EOL decline (discontinued and EOL-announced SKUs), cold starts, BSS-018."""
    state = inputs.state
    p = state.panel
    series = p.series
    grid = inputs.test_grid
    rows = []
    launched = series[p.product_launch]
    for sku, group in launched.groupby("sku_id", sort=True):
        first = int(group["start_idx"].min())
        rows.append(
            episode(anomaly_id=f"ST.LAUNCH_RAMP:{sku}", type="ST.LAUNCH_RAMP", **{"class": "real_event"}, sku_id=sku,
                    product_family=group["product_family"].iat[0], scope=f"{len(group)} series", date_start=month_label(first),
                    date_end=month_label(min(first + 11, state.as_of)), n_cells=int(len(group)),
                    cause="Product launch: ramp 1 - exp(-(k+1)/tau), tau about 4.5 months (EV trend controlled)",
                    evidence=_json({"series": len(group), "powertrain": group["powertrain_application"].iat[0]}),
                    detection="months since product launch", action="ramp feature on months since product launch; ramp-aware level",
                    confidence="high", impact_units=0.0, impact_usd=0.0, in_forecast_window=bool(first + 23 > state.as_of))
        )
    eol = series[series["eol_idx"].notna()]
    for sku, group in eol.groupby("sku_id", sort=True):
        eol_idx = int(group["eol_idx"].iat[0])
        s = group["series_no"].to_numpy()
        in_window = eol_idx > state.as_of
        last6 = _sku_level(state, s, eol_idx - 5, eol_idx)
        prior = _sku_level(state, s, eol_idx - 12, eol_idx - 6)
        sku_rows = grid[grid["sku_id"] == sku]
        evidence = {"eol": month_label(eol_idx), "series": len(group)}
        if in_window:
            evidence.update({"post_eol_test_rows": int(sku_rows["is_post_eol"].sum()), "phaseout_test_rows": int(sku_rows["is_eol_phaseout"].sum())})
        else:
            evidence.update({"last_6_vs_previous_6_to_12": last6 / prior if prior else None})
        rows.append(
            episode(anomaly_id=f"ST.EOL_DECLINE:{sku}", type="ST.EOL_DECLINE", **{"class": "real_event"}, sku_id=sku,
                    product_family=group["product_family"].iat[0], scope=f"{len(group)} series",
                    date_start=month_label(eol_idx - 5), date_end=month_label(eol_idx), n_cells=int(len(group) * 6),
                    cause="End of life: graded decline over the last ~6 months, no last-time buy, nothing after EOL",
                    evidence=_json(evidence), detection="months to EOL (master)",
                    action="phase-out factors 0.90 .. 0.42 on the recent level (months 5..0); 0 after EOL; mask for level",
                    confidence="high" if not in_window else "medium", impact_units=0.0, impact_usd=0.0, in_forecast_window=bool(in_window))
        )
    cold = grid[grid["is_cold_start"]]
    for sku, group in cold.groupby("sku_id", sort=True):
        rows.append(
            episode(anomaly_id=f"ST.COLD_START:{sku}", type="ST.COLD_START", **{"class": "real_event"}, sku_id=sku,
                    product_family=group["product_family"].iat[0], scope=f"{group['region'].nunique()} series", date_start=group["date"].min(),
                    date_end=group["date"].max(), n_cells=int(len(group)),
                    cause=f"Planned launch with no history (replaces {group['replaces_sku'].iat[0]})",
                    evidence=_json({"regions": sorted(group["region"].unique()), "powertrain": group["powertrain_application"].iat[0]}),
                    detection="master Planned Launch + test rows", action="cross-sectional prior level x launch ramp; monthly latent mean",
                    confidence="medium", impact_units=0.0, impact_usd=0.0, in_forecast_window=True)
        )
    master_launch = inputs.cells["sku_id"].map(inputs.master.set_index("sku_id")["launch_date"])
    before_launch = inputs.cells[(inputs.cells["row_status"] == "observed") & (inputs.cells["date"] < master_launch)]
    if len(before_launch):
        sku = before_launch["sku_id"].iat[0]
        rows.append(
            episode(anomaly_id=f"RC.SALES_BEFORE_MASTER_LAUNCH:{sku}", type="RC.SALES_BEFORE_MASTER_LAUNCH", **{"class": "data_error"}, sku_id=sku,
                    product_family=before_launch["product_family"].iat[0], scope=f"{before_launch['region'].nunique()} series",
                    date_start=before_launch["date"].min(), date_end=before_launch["date"].max(), n_cells=int(len(before_launch)),
                    cause="Transactions before the master Launch_Date: the master is wrong (Record_ID grid and launch-ramp shape)",
                    evidence=_json({"records": len(before_launch), "units": float(before_launch["units_sold"].sum())}),
                    detection="master vs transactions", action="keep the transactions; effective launch = first block month",
                    confidence="high", impact_units=0.0, impact_usd=0.0, in_forecast_window=False)
        )
    return rows


def _sku_level(state: DemandState, s: np.ndarray, first: int, last: int) -> float:
    first = max(first, 0)
    values = state.filled.demand_filled[s, first : last + 1]
    return float(np.nansum(values) / max(last - first + 1, 1))


def build_register(inputs: RegisterInputs) -> pd.DataFrame:
    """The full register, sorted by level (episodes first), type and id; ids are unique."""
    frames = [
        *data_error_rows(inputs),
        *supply_rows(inputs),
        *one_off_rows(inputs),
        *onphase_zero_rows(inputs),
        calendar_rows(inputs),
        structural_rows(inputs),
    ]
    register = pd.concat([frame.loc[:, list(REGISTER_COLUMNS)] for frame in frames if len(frame)], ignore_index=True)
    register["level_order"] = (register["level"] == "cell").astype(int)
    register = register.sort_values(["level_order", "class", "type", "anomaly_id"], kind="stable").drop(columns="level_order")
    if register["anomaly_id"].duplicated().any():
        duplicated = register.loc[register["anomaly_id"].duplicated(), "anomaly_id"].head(3).tolist()
        raise AssertionError(f"duplicate anomaly ids: {duplicated}")
    register["n_cells"] = register["n_cells"].astype("Int64")
    return register.reset_index(drop=True)
