"""Data-health part of the bundle (``quality.json``) and the cell-level lineage shards (``lineage/<family>.json``).

Everything comes from ``outputs/quality``: the machine-readable report (summary, per-file issues, every check), the fix
log (one row per changed cell, aggregated here into issue counts by rule and an issue x month heat-strip) and the
de-duplication decisions. Lineage keeps every fix-log row of a train cell except the convention fills (the price
placeholder on zero rows), keyed by series and month, plus the dropped versions of repeated Record_IDs.
"""

from __future__ import annotations

import json
from typing import Any

import numpy as np
import pandas as pd

from celeris.export.encode import Json, ints, nums, texts
from celeris.export.history import SeriesIndex, month_index


def _check(report: dict[str, Any], check_id: str) -> dict[str, Any]:
    for check in report["checks"]:
        if check["check_id"] == check_id:
            return check
    raise KeyError(f"dq_report.json has no check {check_id}")


def waterfall(report: dict[str, Any]) -> list[dict[str, Json]]:
    """train.csv rows from the raw extract to one cell per Date-SKU-Region."""
    s = report["summary"]
    exact = _check(report, "TRN-K1-EXACT-DUPLICATE")["affected"]
    superseded = _check(report, "TRN-K2-SUPERSEDED-LOAD")["affected"]
    if s["train_rows_raw"] - exact - superseded != s["train_records"]:
        raise AssertionError("row waterfall does not reconcile: raw - duplicates != records")
    if s["train_records"] + s["train_missing_rows"] != s["train_grid_cells"]:
        raise AssertionError("row waterfall does not reconcile: records + missing != grid cells")
    return [
        {"step": "Raw rows in train.csv", "value": s["train_rows_raw"], "kind": "total"},
        {"step": "Exact duplicate loads (K1)", "value": -exact, "kind": "delta"},
        {"step": "Superseded loads, latest kept (K2)", "value": -superseded, "kind": "delta"},
        {"step": "Unique Record_IDs", "value": s["train_records"], "kind": "total"},
        {"step": "Missing rows rebuilt from the Record_ID grid (K13)", "value": s["train_missing_rows"], "kind": "delta"},
        {"step": "Grid cells: one per Date x SKU x Region", "value": s["train_grid_cells"], "kind": "total"},
    ]


def rule_titles(report: dict[str, Any]) -> dict[str, dict[str, str]]:
    """First check per rule id (the record-level variant where both exist) for its title, dimension and severity."""
    out: dict[str, dict[str, str]] = {}
    for check in report["checks"]:
        rule = str(check["rule"])
        if rule not in out or check["unit"] == "records":
            out[rule] = {"title": check["title"], "dimension": check["dimension"], "severity": check["severity"],
                         "file": check["file"], "action": check["action"]}
    return out


def issues_by_rule(fix_log: pd.DataFrame, report: dict[str, Any]) -> dict[str, Json]:
    titles = rule_titles(report)
    fl = fix_log.copy()
    fl["entity"] = fl["record_id"].fillna(fl["date"].fillna("") + "|" + fl["sku_id"].fillna("") + "|" + fl["region"].fillna(""))
    rows = []
    for (file, rule), part in fl.groupby(["file", "rule"], sort=True):
        methods = part["method"].value_counts().sort_index()
        meta = titles.get(str(rule), {})
        rows.append({
            "file": file, "rule": rule, "step": int(part["step"].min()),
            "title": meta.get("title", str(rule)), "dimension": meta.get("dimension"), "action": meta.get("action"),
            "cells": int(len(part)), "rows": int(part["entity"].nunique()),
            "columns": sorted(part["column"].unique().tolist()),
            "methods": {str(k): int(v) for k, v in methods.items()},
            "convention_only": bool((part["method"] == "convention").all()),
        })
    return {"rows": rows}


def heat_strip(fix_log: pd.DataFrame) -> dict[str, Json]:
    """Rows touched per rule x month (train.csv, convention fills excluded)."""
    fl = fix_log[(fix_log["file"] == "train.csv") & (fix_log["method"] != "convention") & fix_log["date"].notna()].copy()
    fl["entity"] = fl["record_id"].fillna(fl["date"] + "|" + fl["sku_id"] + "|" + fl["region"])
    fl["m"] = [month_index(d) for d in fl["date"]]
    counts = fl.drop_duplicates(["rule", "entity"]).groupby(["rule", "m"]).size()
    rules = sorted(counts.index.get_level_values(0).unique(), key=lambda r: (r[0], int("".join(ch for ch in r if ch.isdigit()) or 0), r))
    matrix = np.zeros((len(rules), 94), dtype=int)
    for (rule, m), n in counts.items():
        if 0 <= m < 94:
            matrix[rules.index(rule), m] = int(n)
    return {"rules": rules, "counts": matrix.tolist()}


def dedup_summary(dedup: pd.DataFrame) -> dict[str, Json]:
    buckets = pd.cut(dedup["delay_days"], [-0.5, 0.5, 7, 14, 21, 31, 1e9], labels=["0", "1-7", "8-14", "15-21", "22-31", ">31"])
    return {
        "by_kind": {str(k): int(v) for k, v in dedup["kind"].value_counts().sort_index().items()},
        "value_changed": int(dedup["value_changed"].sum()),
        "delay_days": {str(k): int(v) for k, v in buckets.value_counts(sort=False).items()},
        "units_dropped_if_kept": int(pd.to_numeric(dedup.loc[dedup["kind"] == "superseded_load", "units_dropped"], errors="coerce").fillna(0).sum()),
        "units_kept": int(pd.to_numeric(dedup.loc[dedup["kind"] == "superseded_load", "units_kept"], errors="coerce").fillna(0).sum()),
    }


def build_quality(report: dict[str, Any], fix_log: pd.DataFrame, dedup: pd.DataFrame) -> dict[str, Json]:
    return {
        "summary": report["summary"],
        "files": report["files"],
        "checks": report["checks"],
        "waterfall": waterfall(report),
        "issues": issues_by_rule(fix_log, report),
        "heat": heat_strip(fix_log),
        "dedup": dedup_summary(dedup),
    }


def build_lineage(fix_log: pd.DataFrame, dedup: pd.DataFrame, index: SeriesIndex) -> dict[str, dict[str, Json]]:
    """One shard per family code: fix-log rows (no convention fills) and dropped duplicate versions, per train cell."""
    fl = fix_log[(fix_log["file"] == "train.csv") & (fix_log["method"] != "convention") & fix_log["sku_id"].notna()].copy()
    fl["series"] = index.idx_of(fl["sku_id"], fl["region"])
    fl["m"] = [month_index(d) for d in fl["date"]]
    fl["family"] = fl["sku_id"].str.split("-").str[0]
    fl = fl.sort_values(["series", "m", "step", "rule", "column"], kind="stable")
    dd = dedup.copy()
    dd["series"] = index.idx_of(dd["sku_id"], dd["region"])
    dd["m"] = [month_index(d) for d in dd["date"]]
    dd["family"] = dd["sku_id"].str.split("-").str[0]
    dd = dd.sort_values(["series", "m", "dropped_raw_row"], kind="stable")
    shards: dict[str, dict[str, Json]] = {}
    for code in index.family_codes:
        part = fl[fl["family"] == code]
        evidence = [_short_evidence(e) for e in part["evidence"]]
        dpart = dd[dd["family"] == code]
        shards[code] = {
            "fixes": {
                "series": ints(part["series"]), "month": ints(part["m"]), "step": ints(part["step"]),
                "rule": texts(part["rule"]), "column": texts(part["column"]), "method": texts(part["method"]),
                "raw": texts(part["raw_value"]), "before": texts(part["before"]), "after": texts(part["after"]),
                "evidence": evidence,
            },
            "dropped": {
                "series": ints(dpart["series"]), "month": ints(dpart["m"]), "record_id": texts(dpart["record_id"]),
                "kind": texts(dpart["kind"]), "kept_load": texts(dpart["kept_load_timestamp"]),
                "dropped_load": texts(dpart["dropped_load_timestamp"]), "delay_days": nums(dpart["delay_days"], 1),
                "units_kept": texts(dpart["units_kept"]), "units_dropped": texts(dpart["units_dropped"]),
                "value_changed": [int(bool(v)) for v in dpart["value_changed"]],
            },
        }
    return shards


def _short_evidence(raw: object) -> str | None:
    """Evidence JSON without the bulky duplicate-row bookkeeping (kept in ``dropped``)."""
    if raw is None or (isinstance(raw, float) and np.isnan(raw)):
        return None
    try:
        payload = json.loads(str(raw))
    except json.JSONDecodeError:
        return str(raw)
    if isinstance(payload, dict):
        payload = {k: v for k, v in payload.items() if k not in ("dropped_raw_row", "kept_raw_row")}
    return json.dumps(payload, separators=(",", ":"), ensure_ascii=False, sort_keys=True)
