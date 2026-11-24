"""Backtest part of the bundle.

``backtest.json`` (accuracy view): the model ladder pooled over the decision folds, per-series error sums by horizon bucket
(so WAPE = sum|e| / sum actual and bias = sum e / sum actual are exact for any filter), per family x region x channel
error sums by horizon 1..19, the pipeline's own ``metrics.csv`` (aggregate levels) and ``summary.json``.
``backtest_origin_<YYYY-MM>.json`` (time machine): per series the actuals and the final model's forecast made at that
origin for horizons 1..19, plus the best baseline, so any filter can replay "what we would have said then".
Only scored cells (``is_scored``: actual known and not masked) count, and only on the decision folds that chose the
model (``summary.origins.decision_folds``; the 2021-10 stress fold is replayed in the time machine but never pooled),
and only cells that every model forecasts, so a model with missing predictions is never credited with zero error.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from celeris.config import CHANNELS, REGIONS
from celeris.export.encode import Json, ints, nums, records
from celeris.export.history import SeriesIndex, month_index

BUCKETS = ((1, 3), (4, 6), (7, 12), (13, 19))
HORIZONS = 19
LADDER_HINT = ("naive", "seasonal_naive", "cycle_aware", "cycle_naive", "structural", "gbm", "ensemble", "final")


def model_order(models: list[str], final: str) -> list[str]:
    """Baselines first in ladder order, then any other members alphabetically, the final model last."""
    known = [m for m in LADDER_HINT if m in models and m != final]
    other = sorted(m for m in models if m not in known and m != final)
    return [*known, *other, final]


def final_model(summary: dict[str, Any], models: list[str]) -> str:
    chosen = summary.get("chosen_model")
    if isinstance(chosen, str) and chosen in models:
        return chosen
    if "final" in models:
        return "final"
    raise ValueError("cannot tell the final model: summary.json has no chosen_model and no model is named 'final'")


def find_noise_floor(summary: Any) -> float | None:
    """First numeric value under a key mentioning the noise floor (the contract names it, not its key)."""
    if isinstance(summary, dict):
        for key, value in summary.items():
            if "noise" in str(key).lower() and isinstance(value, (int, float)) and not isinstance(value, bool):
                return float(value)
        for value in summary.values():
            found = find_noise_floor(value)
            if found is not None:
                return found
    elif isinstance(summary, list):
        for value in summary:
            found = find_noise_floor(value)
            if found is not None:
                return found
    return None


def scored_origins(summary: dict[str, Any], origins: list[str]) -> list[str]:
    """The decision folds named in summary.json (all origins when it names none)."""
    folds = summary.get("origins", {}).get("decision_folds") if isinstance(summary.get("origins"), dict) else None
    chosen = sorted(o for o in origins if folds and o in folds)
    return chosen or origins


def common_cells(p: pd.DataFrame, n_models: int) -> pd.DataFrame:
    """Rows of cells (origin x series x date) that every model forecast with a finite value."""
    keys = ["origin", "sku_id", "region", "date"]
    ok = np.isfinite(p["pred"].to_numpy(dtype=float))
    bad = p.loc[~ok, keys].drop_duplicates()
    out = p
    if not bad.empty:
        hit = p[keys].merge(bad.assign(_bad=True), on=keys, how="left")["_bad"].fillna(False).to_numpy(dtype=bool)
        out = p[~hit]
    per_cell = out.groupby(["origin", "model"]).size().unstack()
    if per_cell.shape[1] != n_models or per_cell.nunique(axis=1).max() > 1:
        raise ValueError("models were scored on different cells: pooled WAPEs would not be comparable")
    return out


def _bucket(h: pd.Series) -> np.ndarray:
    out = np.full(len(h), -1)
    for i, (lo, hi) in enumerate(BUCKETS):
        out[(h >= lo).to_numpy() & (h <= hi).to_numpy()] = i
    return out


def build_backtest(pred: pd.DataFrame, metrics: pd.DataFrame, summary: dict[str, Any],
                   index: SeriesIndex) -> tuple[dict[str, Json], dict[str, dict[str, Json]]]:
    models = sorted(pred["model"].unique().tolist())
    final = final_model(summary, models)
    order = model_order(models, final)
    origins = sorted(pred["origin"].unique().tolist())
    scored = scored_origins(summary, origins)
    p = common_cells(pred[pred["is_scored"].astype(bool) & pred["origin"].isin(scored)], len(models)).copy()
    p["series"] = index.idx_of(p["sku_id"], p["region"])
    p["err"] = p["pred"] - p["actual"]
    p["abs"] = p["err"].abs()
    p["bucket"] = _bucket(p["horizon"])
    attrs = index.table.set_index("idx")
    p["family"] = attrs.loc[p["series"], "product_family"].to_numpy()
    p["region_"] = attrs.loc[p["series"], "region"].to_numpy()
    p["channel"] = attrs.loc[p["series"], "sales_channel"].to_numpy()

    ladder = []
    for model in order:
        part = p[p["model"] == model]
        a = float(part["actual"].sum())
        ladder.append({"model": model, "wape": float(part["abs"].sum() / a), "bias": float(part["err"].sum() / a),
                       "cells": int(len(part))})

    # per series x bucket: actual (shared) and error sums per model; interval hits for the final model
    base = p[p["model"] == final].groupby(["series", "bucket"]).agg(actual=("actual", "sum"), n=("actual", "size"))
    out_cols: dict[str, Json] = {"series": ints(base.index.get_level_values(0)), "bucket": ints(base.index.get_level_values(1)),
                                 "actual": nums(base["actual"], 1), "n": ints(base["n"])}
    abs_by: dict[str, Json] = {}
    err_by: dict[str, Json] = {}
    for model in order:
        g = p[p["model"] == model].groupby(["series", "bucket"]).agg(abs=("abs", "sum"), err=("err", "sum")).reindex(base.index)
        abs_by[model] = nums(g["abs"], 1)
        err_by[model] = nums(g["err"], 1)
    fin = p[p["model"] == final]
    has_q = fin["p10"].notna() & fin["p90"].notna()
    q = fin[has_q].assign(below=lambda d: d["actual"] < d["p10"], above=lambda d: d["actual"] > d["p90"])
    qg = q.groupby(["series", "bucket"]).agg(nq=("actual", "size"), below=("below", "sum"), above=("above", "sum")).reindex(base.index)
    out_cols.update({"abs": abs_by, "err": err_by, "n_q": ints(qg["nq"].fillna(0)), "below_p10": ints(qg["below"].fillna(0)),
                     "above_p90": ints(qg["above"].fillna(0))})

    # per family x region x channel x horizon: error sums per model (fine horizon curve without SKU / customer filter)
    cell = p[p["model"] == final].groupby(["family", "region_", "channel", "horizon"]).agg(actual=("actual", "sum"))
    fine: dict[str, Json] = {
        "family": [index.families.index(v) for v in cell.index.get_level_values(0)],
        "region": [REGIONS.index(v) for v in cell.index.get_level_values(1)],
        "channel": [CHANNELS.index(v) for v in cell.index.get_level_values(2)],
        "horizon": ints(cell.index.get_level_values(3)),
        "actual": nums(cell["actual"], 1),
        "abs": {}, "err": {},
    }
    for model in order:
        g = p[p["model"] == model].groupby(["family", "region_", "channel", "horizon"]).agg(abs=("abs", "sum"), err=("err", "sum")).reindex(cell.index)
        fine["abs"][model] = nums(g["abs"], 1)
        fine["err"][model] = nums(g["err"], 1)

    m = metrics[metrics["slice_type"].isin(["all", "family", "region", "channel", "horizon", "horizon_bucket"])
                & metrics["origin"].isin(scored)]
    bundle = {
        "models": order, "final": final, "origins": origins, "scored_origins": scored,
        "buckets": [list(b) for b in BUCKETS],
        "ladder": ladder, "noise_floor": find_noise_floor(summary),
        "series_buckets": out_cols, "fine": fine,
        "metrics": records(m.reset_index(drop=True), {"actual_sum": 1, "pred_sum": 1, "abs_err_sum": 1, "wape": 4, "bias": 4}),
        "summary": summary,
    }
    # time-machine comparison: the classic seasonal-naive benchmark when present, else the best baseline
    baselines = [entry for entry in ladder if entry["model"] != final]
    names = [entry["model"] for entry in baselines]
    if "seasonal_naive" in names:
        best_baseline = "seasonal_naive"
    else:
        best_baseline = min(baselines, key=lambda e: e["wape"])["model"] if baselines else final

    per_origin: dict[str, dict[str, Json]] = {}
    all_rows = pred.copy()
    all_rows["series"] = index.idx_of(all_rows["sku_id"], all_rows["region"])
    for origin in origins:
        part = all_rows[all_rows["origin"] == origin]
        series_ids = sorted(part["series"].unique().tolist())
        pos = {s: i for i, s in enumerate(series_ids)}
        shape = (len(series_ids), HORIZONS)
        actual = np.full(shape, np.nan)
        fin_part = part[part["model"] == final]
        fi = (np.array([pos[s] for s in fin_part["series"]]), fin_part["horizon"].to_numpy() - 1)
        actual[fi] = np.where(fin_part["is_scored"].astype(bool), fin_part["actual"], np.nan)
        pf = np.full(shape, np.nan)
        pf[fi] = fin_part["pred"].to_numpy(dtype=float)
        bl_part = part[part["model"] == best_baseline]
        bi = (np.array([pos[s] for s in bl_part["series"]]), bl_part["horizon"].to_numpy() - 1)
        pb = np.full(shape, np.nan)
        pb[bi] = bl_part["pred"].to_numpy(dtype=float)
        per_origin[origin] = {
            "origin": origin, "origin_month": month_index(origin), "final": final, "baseline": best_baseline,
            "scored": origin in scored,
            "series": series_ids, "horizons": HORIZONS,
            "actual": nums(actual.reshape(-1), 0), "pred": nums(pf.reshape(-1), 0), "baseline_pred": nums(pb.reshape(-1), 0),
        }
    return bundle, per_origin
