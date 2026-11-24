"""Dimensions, cleaned history, series profiles and stock-outs for the bundle.

Series index: the 3,083 history series keep their ``series_no``; the forecast-window cold starts (no history) are
appended in test.csv order. History is stored per *segment* = one series under one customer (customer at time, so the
customer filter applies to history correctly across the 23 customer switches), as flat arrays in segment order:
``u`` shipped units (cleaned ``units_sold``; null where unknown) and ``f`` a flag word per cell (bits in
``FLAG_BITS``; the common cell, an ordinary one-month order, is ``5``). Unconstrained demand (``demand_filled``, never
null) equals ``u`` on all but about 9k cells, so only those are stored: ``d_gap`` (gaps between their cell positions)
and ``d_val``.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from celeris.config import CHANNELS, FIRST_YEAR, LAST_TRAIN_MONTH_IDX, REGIONS
from celeris.export.encode import Json, codes, ints, nums, records, texts

N_MONTHS = 113  # 2019-01 .. 2028-05
FLAG_BITS: dict[str, int] = {
    # bits 0-1: accum_span (0..3, latent months the order carries)
    "on_phase": 2,
    "half_carry": 3,
    "structural_zero": 4,
    "missing_row": 5,
    "imputed": 6,
    "stockout_listed": 7,
    "stockout_inferred": 8,
    "one_off": 9,
    "numeric_fix": 10,
    "lost_tail": 11,
    "masked": 12,
    "units_unknown": 13,
}
ACCUM_MASK = 3
PRICE_YEARS = tuple(range(FIRST_YEAR, 2027))


def month_label(idx: int) -> str:
    return f"{FIRST_YEAR + idx // 12}-{idx % 12 + 1:02d}"


def month_index(label: str) -> int:
    year, month = label.split("-")[:2]
    return (int(year) - FIRST_YEAR) * 12 + int(month) - 1


@dataclass(frozen=True)
class Frames:
    """The pipeline outputs the history part of the bundle reads."""

    cells: pd.DataFrame
    grid: pd.DataFrame
    master: pd.DataFrame
    state: pd.DataFrame
    profile: pd.DataFrame
    blocks: pd.DataFrame
    events: pd.DataFrame
    stockouts: pd.DataFrame
    prices: pd.DataFrame
    account_events: pd.DataFrame


@dataclass(frozen=True)
class SeriesIndex:
    """Unified series table (history series, then cold starts) and the vocabularies."""

    table: pd.DataFrame  # one row per series: idx, sku_id, region, channel, customer, family, ...
    families: list[str]
    family_codes: list[str]
    customers: list[str]
    skus: list[str]

    def idx_of(self, sku: pd.Series, region: pd.Series) -> np.ndarray:
        key = dict(zip(zip(self.table["sku_id"], self.table["region"], strict=True), self.table["idx"], strict=True))
        return np.array([key[(s, r)] for s, r in zip(sku, region, strict=True)], dtype=int)


def series_index(frames: Frames) -> SeriesIndex:
    hist = frames.state[["series_no", "sku_id", "region", "product_family", "sales_channel"]].copy()
    hist = hist.merge(frames.blocks[["series_no", "start_idx", "end_idx", "start_rec"]], on="series_no")
    hist = hist.merge(frames.state[["series_no", "customer_at_origin", "cycle_pattern", "cycle_kind", "is_lost_account",
                                    "lost_since", "switch_month"]], on="series_no")
    hist = hist.rename(columns={"customer_at_origin": "customer", "series_no": "idx"}).sort_values("idx")
    test_customer = frames.grid.drop_duplicates(["sku_id", "region"]).set_index(["sku_id", "region"])["customer"]
    in_test = set(test_customer.index)
    hist["in_test"] = [(s, r) in in_test for s, r in zip(hist["sku_id"], hist["region"], strict=True)]
    # test customer = customer at origin for every history series in test (no switch inside the window)
    cust_test = [test_customer.get((s, r), c) for s, r, c in zip(hist["sku_id"], hist["region"], hist["customer"], strict=True)]
    if list(hist["customer"]) != cust_test:
        raise AssertionError("test.csv customer differs from the customer at origin for a history series")
    cold = frames.grid[frames.grid["series_no"].isna()].drop_duplicates(["sku_id", "region"])
    cold_rows = pd.DataFrame({
        "idx": range(len(hist), len(hist) + len(cold)),
        "sku_id": cold["sku_id"].to_numpy(), "region": cold["region"].to_numpy(),
        "product_family": cold["product_family"].to_numpy(), "sales_channel": cold["sales_channel"].to_numpy(),
        "start_idx": -1, "end_idx": -1, "start_rec": -1, "customer": cold["customer"].to_numpy(),
        "cycle_pattern": None, "cycle_kind": "unknown", "is_lost_account": False, "lost_since": None,
        "switch_month": None, "in_test": True,
    })
    table = pd.concat([hist, cold_rows], ignore_index=True)
    families = sorted(frames.master["product_family"].unique())
    family_codes = [frames.master.loc[frames.master["product_family"] == f, "sku_id"].iat[0].split("-")[0] for f in families]
    customers = sorted(set(frames.cells["customer"].dropna()) | set(frames.grid["customer"]))
    skus = sorted(frames.master["sku_id"])
    return SeriesIndex(table=table, families=families, family_codes=family_codes, customers=customers, skus=skus)


def price_table(frames: Frames, skus: list[str]) -> dict[str, Json]:
    """Invoice price per SKU and year (2022 split into H1 / H2 for the surcharge); null where the SKU had no price."""
    p = frames.prices
    yearly = p[p["period"].astype(str).str.fullmatch(r"\d{4}")].pivot(index="sku_id", columns="year", values="invoice_price_usd")
    h1 = p[p["period"] == "2022H1"].set_index("sku_id")["invoice_price_usd"]
    h2 = p[p["period"] == "2022H2"].set_index("sku_id")["invoice_price_usd"]
    rows = []
    for sku in skus:
        per_year = []
        for year in PRICE_YEARS:
            if year == 2022:
                value = h1.get(sku, np.nan)
            else:
                value = yearly.at[sku, year] if sku in yearly.index and year in yearly.columns else np.nan
            per_year.append(value)
        rows.append(per_year + [h2.get(sku, np.nan)])
    flat = np.array(rows, dtype=float)
    return {"years": list(PRICE_YEARS), "h2_2022_column": len(PRICE_YEARS), "width": len(PRICE_YEARS) + 1,
            "values": nums(flat.reshape(-1), 2)}


def cell_flags(cells: pd.DataFrame) -> np.ndarray:
    fix = cells["fix_rule"].fillna("")
    numeric_fix = fix.str.contains(r"(?:^|\|)(?:N\d|S0)", regex=True)
    bits = {
        "missing_row": cells["row_status"].eq("missing_row"),
        "imputed": cells["is_imputed"],
        "stockout_listed": cells["is_stockout_listed"],
        "stockout_inferred": cells["is_stockout_inferred"],
        "one_off": cells["is_one_off"],
        "numeric_fix": numeric_fix,
        "structural_zero": cells["is_structural_zero"],
        "lost_tail": cells["is_lost_account"],
        "on_phase": cells["on_phase"],
        "half_carry": cells["carry_weight"].eq(0.5),
        "masked": cells["train_mask"].notna(),
        "units_unknown": cells["units_sold"].isna(),
    }
    word = np.zeros(len(cells), dtype=np.int64)
    for name, mask in bits.items():
        word |= mask.fillna(False).to_numpy(dtype=bool).astype(np.int64) << FLAG_BITS[name]
    span = cells["accum_span"].to_numpy(dtype=np.int64)
    if span.max() > 3:
        raise AssertionError("accum_span above 3 does not fit the flag word")
    return word | span


def segments(cells: pd.DataFrame) -> pd.DataFrame:
    """Runs of one customer within a series (customer at time), in series then month order."""
    c = cells[["series_no", "month_idx", "customer"]].copy()
    c["customer"] = c.groupby("series_no")["customer"].transform(lambda s: s.ffill().bfill())
    new = (c["series_no"] != c["series_no"].shift()) | (c["customer"] != c["customer"].shift())
    c["segment"] = new.cumsum() - 1
    seg = c.groupby("segment").agg(series=("series_no", "first"), customer=("customer", "first"),
                                   start=("month_idx", "first"), length=("month_idx", "size"), last=("month_idx", "last"))
    if not (seg["last"] - seg["start"] + 1 == seg["length"]).all():
        raise AssertionError("a series has a gap in its month grid")
    return seg.drop(columns="last").reset_index(drop=True)


def build_dims(frames: Frames, index: SeriesIndex, seg: pd.DataFrame) -> dict[str, Json]:
    master = frames.master.set_index("sku_id").loc[index.skus].reset_index()
    t = index.table
    ev = frames.events
    return {
        "months": {"first": month_label(0), "count": N_MONTHS, "as_of": LAST_TRAIN_MONTH_IDX,
                   "window": [LAST_TRAIN_MONTH_IDX + 1, N_MONTHS - 1]},
        "families": {"name": index.families, "code": index.family_codes,
                     "bu": [frames.master.loc[frames.master["product_family"] == f, "business_unit"].iat[0]
                            for f in index.families]},
        "regions": list(REGIONS),
        "channels": list(CHANNELS),
        "customers": index.customers,
        "skus": {
            "id": index.skus,
            "family": codes(master["product_family"], index.families),
            "description": texts(master["sku_description"]),
            "size_class": texts(master["size_class"]),
            "powertrain": texts(master["powertrain_application"]),
            "launch": texts(master["launch_date_effective"]),
            "launch_master": texts(master["launch_date"]),
            "eol": texts(master["eol_date"]),
            "replaces": texts(master["replaces_sku"]),
            "status": texts(master["lifecycle_status"]),
            "tier": texts(master["sku_tier"]),
        },
        "series": {
            "sku": codes(t["sku_id"], index.skus),
            "region": codes(t["region"], REGIONS),
            "channel": codes(t["sales_channel"], CHANNELS),
            "customer": codes(t["customer"], index.customers),
            "start": ints(t["start_idx"]),
            "end": ints(t["end_idx"]),
            "start_rec": ints(t["start_rec"]),
            "in_test": [int(v) for v in t["in_test"]],
            "cycle": texts(t["cycle_pattern"]),
            "cycle_kind": texts(t["cycle_kind"]),
            "lost": [int(bool(v)) for v in t["is_lost_account"]],
            "lost_since": texts(t["lost_since"]),
            "switch_month": texts(t["switch_month"]),
        },
        "segments": {
            "series": ints(seg["series"]),
            "customer": codes(seg["customer"], index.customers),
            "start": ints(seg["start"]),
            "length": ints(seg["length"]),
        },
        "events": {
            "id": texts(ev["event_id"]), "type": texts(ev["event_type"]), "scope_type": texts(ev["scope_type"]),
            "scope_value": texts(ev["scope_value"]), "region": texts(ev["scope_region"]),
            "customer": texts(ev["scope_customer"]), "family": texts(ev["scope_family"]),
            "channel": texts(ev["scope_channel"]),
            "start": [month_index(m) for m in ev["start_month"]], "end": [month_index(m) for m in ev["end_month"]],
            "start_day": texts(ev["start_day"]), "end_day": texts(ev["end_day"]),
            "n_days": nums(ev["n_days"], 0), "in_window": [int(v) for v in ev["in_forecast_window"]],
            "announced_pct": nums(ev["announced_pct"], 2), "description": texts(ev["description"]),
        },
        "prices": price_table(frames, index.skus),
        "flag_bits": FLAG_BITS,
        "accum_mask": ACCUM_MASK,
    }


def build_history(frames: Frames) -> tuple[pd.DataFrame, dict[str, Json]]:
    cells = frames.cells
    seg = segments(cells)
    units = cells["units_sold"].astype("Float64").to_numpy(dtype=float, na_value=np.nan)
    demand = np.round(cells["demand_filled"].to_numpy(dtype=float), 1)
    differs = np.flatnonzero(np.isnan(units) | (units != demand))
    payload = {
        "u": ints(cells["units_sold"]),
        "f": [int(v) for v in cell_flags(cells)],
        "d_gap": [int(v) for v in np.diff(differs, prepend=0)],
        "d_val": nums(demand[differs], 1),
    }
    return seg, payload


def build_profiles(frames: Frames, index: SeriesIndex) -> dict[str, Json]:
    """Series card facts (history series only, ``series_no`` order) and the account-event table."""
    p = frames.profile.sort_values("series_no")
    s = frames.state.sort_values("series_no")
    keep = ["sbc_class", "sbc_adi", "sbc_cv2", "sbc_class_last36", "level_last12", "mean_monthly_demand", "n_orders",
            "mean_order", "zero_share", "n_stockout_listed", "n_stockout_inferred", "n_stockout_suspect", "lost_units",
            "unconstrained_uplift_units", "n_missing_rows", "n_imputed", "n_one_offs", "n_fixes", "n_anomaly_cells",
            "cycle_pattern_before", "cycle_change_month", "cycle_posterior", "customer_first", "n_customers",
            "switch_level_ratio", "pre_loss_level", "months_in_history"]
    out = records(p[keep], {"sbc_adi": 3, "sbc_cv2": 3, "level_last12": 1, "mean_monthly_demand": 1, "mean_order": 1,
                            "zero_share": 3, "lost_units": 1, "unconstrained_uplift_units": 1, "cycle_posterior": 3,
                            "switch_level_ratio": 3, "pre_loss_level": 1})
    out.update(records(s[["last_order_month", "trailing_silent_months", "semiconductor_severity", "cycle_change_window_end"]],
                       {"semiconductor_severity": 3}))
    ae = frames.account_events
    out_events = records(ae[["event_type", "month", "window_end", "before", "after", "level_before", "level_after",
                             "level_ratio", "level_ratio_region_adjusted", "silent_months"]],
                         {"level_before": 1, "level_after": 1, "level_ratio": 3, "level_ratio_region_adjusted": 3})
    out_events["series"] = ints(ae["series_no"])
    return {"series": out, "account_events": out_events}


STOCKOUT_REASON_BY_METHOD = {
    "S5_semiconductor_imputed": "Semiconductor allocation (unlisted, imputed)",
    "D1_hidden_stockout": "Hidden operational stock-out (detected)",
    "D2_hidden_stockout": "Hidden operational stock-out (detected)",
    "D3_hidden_second_month": "Hidden operational stock-out (detected)",
}


def build_stockouts(frames: Frames, index: SeriesIndex) -> dict[str, Json]:
    """Listed stock-out rows and every cell with lost, back-ordered or carried units (cell-level uplift)."""
    so = frames.stockouts
    listed = {
        "series": [int(v) for v in index.idx_of(so["sku_id"], so["region"])],
        "month": ints(so["month_idx"]),
        "requested": ints(so["requested_units"]), "carried_in": ints(so["carried_in_units"]),
        "shipped": ints(so["shipped_units"]), "backordered": ints(so["backordered_units"]),
        "lost": ints(so["lost_units"]), "fill_pct": nums(so["realised_fill_pct"], 1),
        "days": ints(so["stockout_days"]), "reason": texts(so["reason"]), "reason_class": texts(so["reason_class"]),
    }
    c = frames.cells
    touched = c[(c["lost_units"].fillna(0) != 0) | (c["backorder_out"].fillna(0) != 0) | (c["backorder_in"].fillna(0) != 0)
                | c["is_stockout_listed"] | c["is_stockout_inferred"]]
    reason_listed = so.set_index(["sku_id", "region", "month_idx"])["reason"]
    reasons = []
    for sku, region, month, method, is_listed in zip(touched["sku_id"], touched["region"], touched["month_idx"],
                                                     touched["demand_uc_method"], touched["is_stockout_listed"], strict=True):
        if is_listed:
            reasons.append(str(reason_listed.get((sku, region, month))))
        else:
            reasons.append(STOCKOUT_REASON_BY_METHOD.get(method, "Back-order carry-over"))
    price = touched["unit_price_usd"].to_numpy(dtype=float)
    lost = touched["lost_units"].fillna(0).to_numpy(dtype=float)
    cells_out = {
        "series": ints(touched["series_no"]), "month": ints(touched["month_idx"]),
        "lost": nums(lost, 1), "lost_usd": nums(lost * price, 2),
        "backorder_out": nums(touched["backorder_out"], 1), "backorder_in": nums(touched["backorder_in"], 1),
        "method": texts(touched["demand_uc_method"]), "listed": [int(v) for v in touched["is_stockout_listed"]],
        "inferred": [int(v) for v in touched["is_stockout_inferred"]], "reason": reasons,
        "shipped": ints(touched["units_sold"]), "demand": nums(touched["demand_filled"], 1),
    }
    return {"listed": listed, "cells": cells_out}
