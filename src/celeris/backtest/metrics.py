"""Accuracy metrics (docs/architecture.md "Metrics"; dossier 6.7).

- ``WAPE = sum |actual - forecast| / sum actual`` over the selected cells, never an average of per-series WAPEs;
- ``bias = sum (forecast - actual) / sum actual``;
- the selection score is ``WAPE + |bias|``.

At an aggregation level (SKU, family x region, family, region, total) actual and forecast are first summed to
(node, month) and the absolute errors are taken there, so errors that cancel inside a node do not count.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

LEVEL_KEYS: dict[str, tuple[str, ...]] = {
    "series": ("sku_id", "region"),
    "sku": ("sku_id",),
    "family_region": ("product_family", "region"),
    "family": ("product_family",),
    "region": ("region",),
    "total": (),
}
SLICE_COLUMNS: dict[str, str | None] = {
    "all": None,
    "family": "product_family",
    "region": "region",
    "channel": "sales_channel",
    "horizon": "horizon",
    "horizon_bucket": "horizon_bucket",
    "calendar_month": "calendar_month",
    "cycle_kind": "cycle_kind",
    "intermittency": "intermittency",
    "subset": "subset",
}
HORIZON_BUCKETS = ((1, 3, "01-03"), (4, 6, "04-06"), (7, 12, "07-12"), (13, 19, "13-19"))
SUBSETS = ("all_scored", "excl_lost_accounts", "excl_one_offs", "excl_lost_and_one_offs", "excl_event_masked")
METRIC_COLUMNS = ("origin", "model", "level", "slice_type", "slice_value", "n_cells", "actual_sum", "pred_sum", "abs_err_sum", "wape", "bias")


def wape(actual: np.ndarray, forecast: np.ndarray) -> float:
    """``sum |a - f| / sum a`` (NaN if the actuals sum to 0)."""
    actual, forecast = np.asarray(actual, dtype=float), np.asarray(forecast, dtype=float)
    total = actual.sum()
    return float(np.abs(actual - forecast).sum() / total) if total > 0 else float("nan")


def bias(actual: np.ndarray, forecast: np.ndarray) -> float:
    """``sum (f - a) / sum a`` (NaN if the actuals sum to 0)."""
    actual, forecast = np.asarray(actual, dtype=float), np.asarray(forecast, dtype=float)
    total = actual.sum()
    return float((forecast - actual).sum() / total) if total > 0 else float("nan")


def score(actual: np.ndarray, forecast: np.ndarray) -> float:
    """Selection score ``WAPE + |bias|``."""
    return wape(actual, forecast) + abs(bias(actual, forecast))


def aggregate_wape(frame: pd.DataFrame, keys: tuple[str, ...], pred: str = "pred", actual: str = "actual") -> float:
    """WAPE after summing actual and forecast to (keys, month)."""
    grouped = frame.groupby([*keys, "month_idx"], sort=False)[[actual, pred]].sum()
    return wape(grouped[actual].to_numpy(), grouped[pred].to_numpy())


def horizon_bucket(horizon: pd.Series) -> pd.Series:
    out = pd.Series("", index=horizon.index, dtype="object")
    for low, high, label in HORIZON_BUCKETS:
        out[(horizon >= low) & (horizon <= high)] = label
    return out


def with_slices(frame: pd.DataFrame) -> pd.DataFrame:
    """Add ``horizon_bucket`` and ``calendar_month`` (1..12) to scored rows."""
    out = frame.copy()
    out["horizon_bucket"] = horizon_bucket(out["horizon"])
    out["calendar_month"] = out["month_idx"] % 12 + 1
    return out


def subset_masks(frame: pd.DataFrame) -> dict[str, np.ndarray]:
    """Row masks of the with / without comparisons (lost accounts and one-offs from the final state)."""
    lost = frame["final_lost_tail"].to_numpy(dtype=bool)
    one_off = frame["final_one_off"].to_numpy(dtype=bool)
    event = frame["final_event_masked"].to_numpy(dtype=bool)
    ones = np.ones(len(frame), dtype=bool)
    return {
        "all_scored": ones,
        "excl_lost_accounts": ~lost,
        "excl_one_offs": ~one_off,
        "excl_lost_and_one_offs": ~lost & ~one_off,
        "excl_event_masked": ~event,
    }


def metric_table(frame: pd.DataFrame, origin_label: object, model: str) -> pd.DataFrame:
    """Every (level, slice_type, slice_value) row of ``metrics.csv`` for one origin and model (scored rows only)."""
    rows = frame[frame["is_scored"]]
    rows = with_slices(rows)
    out = []
    masks = subset_masks(rows)
    for slice_type, column in SLICE_COLUMNS.items():
        if slice_type == "subset":
            pieces = [(name, rows[mask]) for name, mask in masks.items()]
        elif column is None:
            pieces = [("all", rows)]
        else:
            pieces = [(value, part) for value, part in rows.groupby(column, sort=True)]
        for value, part in pieces:
            for level, keys in LEVEL_KEYS.items():
                if level == "series":
                    a, f = part["actual"].to_numpy(), part["pred"].to_numpy()
                    abs_err = float(np.abs(a - f).sum())
                else:
                    grouped = part.groupby([*keys, "month_idx"], sort=False)[["actual", "pred"]].sum()
                    a, f = grouped["actual"].to_numpy(), grouped["pred"].to_numpy()
                    abs_err = float(np.abs(a - f).sum())
                total, predicted = float(a.sum()), float(f.sum())
                out.append(
                    {
                        "origin": origin_label,
                        "model": model,
                        "level": level,
                        "slice_type": slice_type,
                        "slice_value": str(value),
                        "n_cells": int(len(part)),
                        "actual_sum": total,
                        "pred_sum": predicted,
                        "abs_err_sum": abs_err,
                        "wape": abs_err / total if total > 0 else np.nan,
                        "bias": (predicted - total) / total if total > 0 else np.nan,
                    }
                )
    return pd.DataFrame(out, columns=list(METRIC_COLUMNS))


def mean_over_origins(metrics: pd.DataFrame) -> pd.DataFrame:
    """``origin = 'mean'`` rows: average WAPE and bias of the folds, summed counts and totals."""
    keys = ["model", "level", "slice_type", "slice_value"]
    grouped = metrics.groupby(keys, sort=False)
    out = grouped[["n_cells", "actual_sum", "pred_sum", "abs_err_sum"]].sum()
    out[["wape", "bias"]] = grouped[["wape", "bias"]].mean()
    out = out.reset_index()
    out.insert(0, "origin", "mean")
    return out.loc[:, list(METRIC_COLUMNS)]
