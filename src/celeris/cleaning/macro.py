"""Step 11: ``macro_indicators.csv`` (dossier 2.4; MI, MI.v).

114 rows for 113 months (2019-01..2028-05). Four injected error types plus a duplicated month, each with an exact
detector and fix; 56 cells change and one row is dropped:

- M1 duplicated month (2022-06): keep the row whose values join their neighbours most smoothly (smallest summed
  absolute second difference); it is also the later file line (line 44), and the demand likelihood favours it.
- M2 / M3 precision fingerprint: every correct cell is written with one decimal. A cell written with ``d`` > 1 decimals
  was divided by ``10^(d-1)``: Auto_Production_YoY_Pct for 2019 is a fraction (3 decimals, x100, M2) and PMI 2023-05
  has a decimal shift (``4.79`` -> 47.9, x10, M3). Each repaired cell must leave no first-difference outlier.
- M4 re-basing: Raw_Material_Cost_Index breaks at its largest first-difference outlier (2022-01: 149.3 -> 123.6), and
  the documented base (2024-01 = 100.0) lies after the break, so the earlier segment is on an old base: divide it by
  K = 1.25 (``config.MACRO_REBASE_K``; MI.v narrows K to 1.21..1.26, run sensitivity at 1.22 / 1.26).
- M5 single blanks: mean of the previous and next month (never adjacent, none in the forecast window).

Not errors: the 2020 pandemic swings, AUTO +36.9 in 2021-05 (base effect), FUEL 142.8 in 2022-06, runs of equal
AUTO values. These are economic events and stay.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from celeris.cleaning.dates import CANONICAL_FORMAT, parse_month_column
from celeris.config import (
    FORECAST_FIRST_MONTH,
    MACRO_BASE_MONTH,
    MACRO_BASE_VALUE,
    MACRO_CONTINUITY_MAX_ROBUST_Z,
    MACRO_DECIMALS,
    MACRO_INDICATORS,
    MACRO_REBASE_K,
    MACRO_REBASED_INDICATOR,
)
from celeris.quality.checks import Check, examples_from, invariant_check, issue_check
from celeris.quality.fixlog import fix_entries

FILE = "macro_indicators.csv"
HEADER_LINES = 1


@dataclass(frozen=True)
class MacroCleaning:
    """Cleaned table (one row per month), the change log (fix-log rows) and the dropped duplicate line."""

    table: pd.DataFrame
    changes: pd.DataFrame
    dropped_line: int


def decimals(text: pd.Series) -> pd.Series:
    """Number of decimals written in each cell (-1 for blanks)."""
    return text.map(lambda s: len(s.split(".", 1)[1]) if "." in s else (-1 if s == "" else 0)).astype("int64")


def robust_z(values: pd.Series) -> pd.Series:
    """Robust z-score (median / 1.4826 MAD) of a series."""
    deviation = values - values.median()
    mad = 1.4826 * deviation.abs().median()
    return deviation / mad


def clean_macro(raw: pd.DataFrame) -> MacroCleaning:
    """Apply M1-M5 in order and return the cleaned table with its change log."""
    raw = raw.assign(line=np.arange(len(raw)) + HEADER_LINES + 1)
    parsed = parse_month_column(raw["Date"])
    if (parsed["date_format"] != CANONICAL_FORMAT).any():
        raise AssertionError("non-canonical macro date")
    if not ((raw["Year"].astype("int64") == parsed["year"]) & (raw["Month"].astype("int64") == parsed["month"])).all():
        raise AssertionError("macro Year/Month disagree with Date")
    deduped, dropped_line, m1_changes = _resolve_duplicate_month(raw)
    values = deduped[list(MACRO_INDICATORS)].apply(lambda s: pd.to_numeric(s.where(s != ""), errors="raise"))
    values.index = deduped["Date"].to_numpy()
    changes = [m1_changes]
    for indicator in MACRO_INDICATORS:
        text = pd.Series(deduped[indicator].to_numpy(), index=values.index)
        values[indicator], log = _fix_precision(values[indicator], text, indicator)
        changes.append(log)
    values[MACRO_REBASED_INDICATOR], log = _rebase(values[MACRO_REBASED_INDICATOR])
    changes.append(log)
    for indicator in MACRO_INDICATORS:
        values[indicator], log = _fill_blanks(values[indicator], indicator)
        changes.append(log)
    table = pd.DataFrame(
        {
            "date": values.index.astype("str"),
            "year": deduped["Year"].astype("int64").to_numpy(),
            "month": deduped["Month"].astype("int64").to_numpy(),
        }
    )
    for indicator in MACRO_INDICATORS:
        table[indicator.lower()] = values[indicator].round(2).to_numpy()
    table["is_forecast_window"] = table["date"] >= FORECAST_FIRST_MONTH
    change_log = pd.concat(changes, ignore_index=True)
    return MacroCleaning(table=table, changes=_to_fix_log(change_log), dropped_line=dropped_line)


def _resolve_duplicate_month(raw: pd.DataFrame) -> tuple[pd.DataFrame, int, pd.DataFrame]:
    """M1: keep the smoother row of the duplicated month; assert it is the later line."""
    duplicated = raw[raw["Date"].duplicated(keep=False)]
    if duplicated["Date"].nunique() != 1 or len(duplicated) != 2:
        raise AssertionError("expected exactly one duplicated month in macro_indicators.csv")
    month = duplicated["Date"].iloc[0]
    others = raw[raw["Date"] != month].reset_index(drop=True)
    position = int((others["Date"] < month).sum())
    differing = [c for c in MACRO_INDICATORS if duplicated[c].nunique() > 1]
    roughness = {}
    for line, row in duplicated.set_index("line").iterrows():
        rough = 0.0
        for column in differing:
            before = float(others.loc[position - 1, column])
            after = float(others.loc[position, column])
            rough += abs(before - 2 * float(row[column]) + after)
        roughness[line] = rough
    kept_line = min(roughness, key=roughness.__getitem__)
    dropped_line = max(roughness, key=roughness.__getitem__)
    if kept_line != duplicated["line"].max():
        raise AssertionError("the smoother duplicate is not the later line; the M1 evidence no longer agrees")
    kept = duplicated.set_index("line").loc[kept_line]
    dropped = duplicated.set_index("line").loc[dropped_line]
    log = pd.DataFrame(
        {
            "date": month,
            "column": differing + ["<row>"],
            "rule": "M1",
            "method": ["exact"] * len(differing) + ["dropped"],
            "raw_value": [dropped[c] for c in differing] + [f"line {dropped_line}"],
            "before": [dropped[c] for c in differing] + ["present"],
            "after": [kept[c] for c in differing] + ["dropped"],
            "evidence": [
                f'{{"kept_line":{kept_line},"dropped_line":{dropped_line},"second_difference":{{"kept":{roughness[kept_line]:.2f},"dropped":{roughness[dropped_line]:.2f}}}}}'
            ]
            * (len(differing) + 1),
        }
    )
    deduped = raw[raw["line"] != dropped_line].reset_index(drop=True)
    return deduped, int(dropped_line), log


def _fix_precision(values: pd.Series, text: pd.Series, indicator: str) -> tuple[pd.Series, pd.DataFrame]:
    """M2 / M3: rescale cells written with more decimals than the column's one decimal."""
    extra = decimals(text) - MACRO_DECIMALS
    shifted = extra > 0
    factor = (10.0 ** extra.where(shifted, 0)).astype("float64")
    fixed = (values * factor).round(MACRO_DECIMALS)
    for date in values.index[shifted]:
        z = robust_z(fixed.diff().dropna())
        if abs(z.get(date, 0.0)) > MACRO_CONTINUITY_MAX_ROBUST_Z:
            raise AssertionError(f"{indicator} {date}: the rescaled value is still a first-difference outlier")
    rule = np.where(factor[shifted] == 100, "M2", "M3")
    log = pd.DataFrame(
        {
            "date": values.index[shifted],
            "column": indicator,
            "rule": rule,
            "method": "exact",
            "raw_value": text[shifted].to_numpy(),
            "before": values[shifted].to_numpy(),
            "after": fixed[shifted].to_numpy(),
            "evidence": [f'{{"decimals":{d},"factor":{f:g}}}' for d, f in zip(extra[shifted] + MACRO_DECIMALS, factor[shifted], strict=True)],
        }
    )
    return fixed, log


def _rebase(values: pd.Series) -> tuple[pd.Series, pd.DataFrame]:
    """M4: divide the segment before the largest level break by K when the documented base lies after it."""
    z = robust_z(values.diff().dropna())
    break_month = z.abs().idxmax()
    if values.get(MACRO_BASE_MONTH) != MACRO_BASE_VALUE or not MACRO_BASE_MONTH >= break_month:
        raise AssertionError("the documented base month does not follow the level break")
    old_base = values.index < break_month
    fixed = values.where(~old_base, (values / MACRO_REBASE_K).round(2))
    log = pd.DataFrame(
        {
            "date": values.index[old_base],
            "column": MACRO_REBASED_INDICATOR,
            "rule": "M4",
            "method": "exact",
            "raw_value": values[old_base].map("{:.1f}".format).to_numpy(),
            "before": values[old_base].to_numpy(),
            "after": fixed[old_base].to_numpy(),
            "evidence": f'{{"break":"{break_month}","robust_z":{z[break_month]:.1f},"K":{MACRO_REBASE_K},"base":"{MACRO_BASE_MONTH}=100"}}',
        }
    )
    return fixed, log


def _fill_blanks(values: pd.Series, indicator: str) -> tuple[pd.Series, pd.DataFrame]:
    """M5: a single blank month takes the mean of its neighbours."""
    blank = values.isna()
    neighbours = (values.shift(1) + values.shift(-1)) / 2
    if (blank & neighbours.isna()).any():
        raise AssertionError(f"{indicator}: a blank has no two observed neighbours")
    if (blank & (values.index >= FORECAST_FIRST_MONTH)).any():
        raise AssertionError(f"{indicator}: blank inside the forecast window")
    fixed = values.where(~blank, neighbours.round(2))
    log = pd.DataFrame(
        {
            "date": values.index[blank],
            "column": indicator,
            "rule": "M5",
            "method": "derived",
            "raw_value": "",
            "before": None,
            "after": fixed[blank].to_numpy(),
            "evidence": [
                f'{{"previous":{values.shift(1)[d]},"next":{values.shift(-1)[d]}}}' for d in values.index[blank]
            ],
        }
    )
    return fixed, log


def _to_fix_log(log: pd.DataFrame) -> pd.DataFrame:
    parts = []
    for (rule, column, method), rows in log.groupby(["rule", "column", "method"], sort=True):
        parts.append(
            fix_entries(
                rows,
                file=FILE,
                step=11,
                rule=str(rule),
                column=str(column),
                method=method,
                raw_value=rows["raw_value"],
                before=rows["before"],
                after=rows["after"],
                evidence=rows["evidence"],
            )
        )
    return pd.concat(parts, ignore_index=True)


def macro_checks(raw: pd.DataFrame, result: MacroCleaning) -> list[Check]:
    """One check per macro error type plus completeness of the cleaned month index."""
    changes = result.changes
    cells = changes[changes["column"] != "<row>"]
    by_rule = cells["rule"].value_counts()
    table = result.table
    months = pd.period_range(table["date"].iloc[0], table["date"].iloc[-1], freq="M").strftime("%Y-%m")
    specs = (
        ("M1", "MAC-M1-DUPLICATE-MONTH", "Duplicated month 2022-06", "uniqueness", "macro.duplicate_month_cells",
         f"File lines 43/44 hold two versions of 2022-06; only PMI and New_Vehicle_Orders_Index differ. Line {result.dropped_line} is dropped.",
         "keep the row that joins its neighbours smoothly (the later line)"),
        ("M2", "MAC-M2-FRACTION", "Auto production YoY stored as a fraction", "accuracy", "macro.fraction_cells",
         "2019 values written as -0.ddd (three decimals) in a one-decimal percent column.", "x100"),
        ("M3", "MAC-M3-DECIMAL-SHIFT", "PMI decimal shift", "accuracy", "macro.decimal_shift_cells",
         "2023-05 written 4.79 (two decimals); robust z of the first difference about -57.", "x10 (47.9)"),
        ("M4", "MAC-M4-REBASE", "Raw-material index on an old base", "consistency", "macro.rebased_cells",
         f"Level break at 2022-01 (149.3 -> 123.6) while {MACRO_BASE_MONTH} = 100.0 (the documented base); 2019-01..2021-12 sit on an old base.",
         f"divide by K = {MACRO_REBASE_K} (plausible 1.21..1.26; sensitivity at 1.22 / 1.26)"),
        ("M5", "MAC-M5-BLANK", "Single-month blank", "completeness", "macro.blank_cells",
         "Five isolated blanks (INV 2019-07, FUEL 2020-09, UTIL 2021-02, ORD 2023-08, EV 2024-11).", "mean of the previous and next month"),
    )
    checks = [
        issue_check(
            check_id=check_id,
            file=FILE,
            rule=rule,
            title=title,
            description=description,
            dimension=dimension,
            unit="cells",
            affected=int(by_rule.get(rule, 0)),
            action=action,
            expected_key=expected,
            examples=examples_from(cells[cells["rule"] == rule], ["date", "column", "raw_value", "after"]),
        )
        for rule, check_id, title, dimension, expected, description, action in specs
    ]
    checks.append(
        invariant_check(
            check_id="MAC-COMPLETE",
            file=FILE,
            rule="2.4",
            title="One complete row per month 2019-01..2028-05",
            description=f"{len(raw)} raw rows -> {len(table)} months, no blank cell; {len(cells)} cells changed.",
            dimension="completeness",
            unit="rows",
            checked=len(table),
            violations_before=int(raw["Date"].duplicated().sum() + (raw[list(MACRO_INDICATORS)] == "").to_numpy().sum()),
            violations_after=int((len(months) != len(table)) + table.isna().to_numpy().sum()),
            action="M1-M5",
            expected_key="macro.clean_rows",
            breakdown={"raw_rows": len(raw), "cells_changed": len(cells)},
            breakdown_expected_prefix="macro",
        )
    )
    return checks
