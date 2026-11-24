"""Anomaly register for the bundle (``anomalies.json``): every episode and cell of ``anomaly_register.csv``, with
labels dictionary-encoded and the series resolved to the unified series index (``-1`` for file-level episodes)."""

from __future__ import annotations

import pandas as pd

from celeris.export.encode import Json, dictionary, nums, texts
from celeris.export.history import SeriesIndex, month_index


def build_anomalies(register: pd.DataFrame, index: SeriesIndex) -> dict[str, Json]:
    r = register
    key = dict(zip(zip(index.table["sku_id"], index.table["region"], strict=True), index.table["idx"], strict=True))
    series = [int(key.get((s, g), -1)) if isinstance(s, str) and isinstance(g, str) else -1
              for s, g in zip(r["sku_id"], r["region"], strict=True)]
    episode_ids = r.loc[r["level"] == "episode", "anomaly_id"].tolist()
    episode_index = {e: i for i, e in enumerate(episode_ids)}
    return {
        "n": len(r),
        "id": texts(r["anomaly_id"]),
        "level": dictionary(r["level"]),
        "episode": [episode_index.get(e, -1) for e in r["episode_id"]],
        "episode_ids": episode_ids,
        "type": dictionary(r["type"]),
        "class": dictionary(r["class"]),
        "series": series,
        "sku": dictionary(r["sku_id"]),
        "region": dictionary(r["region"]),
        "family": dictionary(r["product_family"]),
        "channel": dictionary(r["sales_channel"]),
        "customer": dictionary(r["customer"]),
        "scope": dictionary(r["scope"]),
        "start": [month_index(d) if isinstance(d, str) else -1 for d in r["date_start"]],
        "end": [month_index(d) if isinstance(d, str) else -1 for d in r["date_end"]],
        "n_cells": nums(r["n_cells"], 0),
        "event_id": dictionary(r["event_id"]),
        "cause": dictionary(r["cause"]),
        "evidence": texts(r["evidence"]),
        "detection": dictionary(r["detection"]),
        "action": dictionary(r["action"]),
        "confidence": dictionary(r["confidence"]),
        "impact_units": nums(r["impact_units"], 1),
        "impact_usd": nums(r["impact_usd"], 0),
        "in_window": [int(bool(v)) for v in r["in_forecast_window"]],
    }
