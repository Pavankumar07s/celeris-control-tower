"""Macro part of the bundle (``macro.json``): cleaned indicators 2019-01..2028-05 with their repaired cells, the
family x indicator x lag correlation table by era (``features/macro_leadlag.csv``) and the per-SKU sensitivities
used by the what-if view (``forecast/macro_sensitivity.csv``)."""

from __future__ import annotations

import pandas as pd

from celeris.config import MACRO_INDICATORS
from celeris.export.encode import Json, codes, ints, nums, texts
from celeris.export.history import SeriesIndex, month_index

INDICATOR_COLUMNS = tuple(name.lower() for name in MACRO_INDICATORS)
ERAS = ("all", "2019-2022", "2023-2026")
N_LAGS = 13


def _indicator(name: str) -> str:
    key = str(name).strip().lower()
    if key not in INDICATOR_COLUMNS:
        raise KeyError(f"unknown macro indicator {name!r}")
    return key


def build_macro(macro: pd.DataFrame, change_log: pd.DataFrame, leadlag: pd.DataFrame, sensitivity: pd.DataFrame,
                index: SeriesIndex) -> dict[str, Json]:
    if len(macro) != 113:
        raise ValueError("macro_clean.csv must cover 2019-01..2028-05")
    repaired = change_log[change_log["column"] != "<row>"]
    ll = leadlag.assign(indicator=leadlag["indicator"].map(_indicator))
    eras = [e for e in ERAS if e in set(ll["era"])]
    corr: list[list[list[list[float | None]]]] = []
    driver: list[list[int]] = []
    for family in index.families:
        fam_rows = ll[ll["product_family"] == family]
        per_indicator = []
        per_driver = []
        for indicator in INDICATOR_COLUMNS:
            part = fam_rows[fam_rows["indicator"] == indicator]
            per_era = []
            for era in eras:
                series = part[part["era"] == era].set_index("lag")["corr"].reindex(range(N_LAGS))
                per_era.append(nums(series, 3))
            per_indicator.append(per_era)
            drivers = part[part["is_driver"].astype(bool)]
            # only the full-history fit's drivers: an indicator chosen in one era only is not a driver of the
            # shipped model, so the dashboard must not outline it as one (the era fits stay in ``corr``)
            lags = drivers[drivers["era"] == "all"]["lag"]
            per_driver.append(int(lags.iloc[0]) if len(lags) else -1)
        corr.append(per_indicator)
        driver.append(per_driver)
    sens = sensitivity.assign(indicator=sensitivity["indicator"].map(_indicator))
    return {
        "indicators": list(INDICATOR_COLUMNS),
        "labels": list(MACRO_INDICATORS),
        "values": {column: nums(macro[column], 2) for column in INDICATOR_COLUMNS},
        "repaired": {"month": [month_index(d) for d in repaired["date"]],
                     "indicator": [_indicator(c) for c in repaired["column"]],
                     "rule": texts(repaired["rule"]), "before": texts(repaired["raw_value"]),
                     "after": texts(repaired["after"])},
        "leadlag": {"eras": eras, "lags": N_LAGS, "corr": corr, "driver_lag": driver},
        "sensitivity": {
            "sku": codes(sens["sku_id"], index.skus),
            "channel_group": texts(sens["channel_group"]),
            "indicator": codes(sens["indicator"], INDICATOR_COLUMNS),
            "lag": ints(sens["lag"]),
            "beta": nums(sens["beta"], 6),
        },
    }
