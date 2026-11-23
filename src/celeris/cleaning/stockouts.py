"""``inventory_stockouts.csv``: typed, tidy copy plus the exact identities of the supply block (dossier 2.7).

The file is formally clean (no blank, duplicate, label or date variant; every key inside the train grid), so cleaning
only types the columns and adds three derived fields. Its arithmetic is exact and is asserted on every row:

- ``Lost = Requested + Carried_In - Shipped - Backordered``;
- ``Carried_In(t) = Backordered(t-1)`` whenever month t-1 of the same series is listed (3,108 pairs);
- ``Shipped = floor(f x (Requested + Carried_In))`` and ``Stockout_Days = round(30 x (1 - f))`` for a latent fill ``f``
  inside the 0.1-point rounding interval of ``Fill_Rate_Pct``;
- ``Backordered = floor(0.4 x shortfall)`` for the four operational reasons, 0 for semiconductor allocation.

``Fill_Rate_Pct`` is the latent allocation fraction, not ``Shipped / (Requested + Carried_In)`` as documented (that
holds on 115 / 5,005 rows): the conflict is reported and a realised fill is added. The stock-out overlay on train and
unconstrained demand are built by the demand stage.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from celeris.cleaning.dates import CANONICAL_FORMAT, month_index, parse_month_column
from celeris.cleaning.keys import Vocabularies
from celeris.quality.checks import Check, examples_from, invariant_check

FILE = "inventory_stockouts.csv"
SEMICONDUCTOR = "Semiconductor allocation"
OPERATIONAL_REASONS = ("Capacity constraint", "Logistics delay", "Supplier quality hold", "Tooling breakdown")
BACKORDER_SHARE = 0.4
FILL_HALF_STEP = 0.05  # Fill_Rate_Pct is printed with one decimal
_UNIT_COLUMNS = {
    "Requested_Units": "requested_units",
    "Carried_In_Units": "carried_in_units",
    "Shipped_Units": "shipped_units",
    "Backordered_Units": "backordered_units",
    "Lost_Units": "lost_units",
    "Stockout_Days": "stockout_days",
}
STOCKOUT_COLUMNS = (
    "date",
    "sku_id",
    "region",
    "month_idx",
    "requested_units",
    "carried_in_units",
    "shipped_units",
    "backordered_units",
    "lost_units",
    "fill_rate_pct",
    "realised_fill_pct",
    "stockout_days",
    "reason",
    "reason_class",
    "impact",
)


def clean_stockouts(raw: pd.DataFrame, vocab: Vocabularies, skus: set[str]) -> pd.DataFrame:
    """Typed stock-out table, one row per (date, SKU, region), sorted by key; raises on any malformed value."""
    parsed = parse_month_column(raw["Date"])
    if (parsed["date_format"] != CANONICAL_FORMAT).any():
        raise AssertionError("non-canonical date in inventory_stockouts.csv")
    if not raw["SKU_ID"].isin(skus).all() or not raw["Region"].isin(vocab.regions).all():
        raise AssertionError("unknown SKU or region in inventory_stockouts.csv")
    if not raw["Reason"].isin((SEMICONDUCTOR, *OPERATIONAL_REASONS)).all():
        raise AssertionError("unknown stock-out reason")
    out = pd.DataFrame(
        {
            "date": raw["Date"].astype("str"),
            "sku_id": raw["SKU_ID"].astype("str"),
            "region": raw["Region"].astype("str"),
            "month_idx": month_index(parsed["year"], parsed["month"]).astype("int64"),
        }
    )
    for source, target in _UNIT_COLUMNS.items():
        if not raw[source].str.fullmatch(r"\d+").all():
            raise AssertionError(f"{source} holds a value that is not a non-negative integer")
        out[target] = raw[source].astype("int64")
    out["fill_rate_pct"] = pd.to_numeric(raw["Fill_Rate_Pct"], errors="raise").astype("float64")
    demand = out["requested_units"] + out["carried_in_units"]
    out["realised_fill_pct"] = (100 * out["shipped_units"] / demand.where(demand > 0)).round(1)
    out["reason"] = raw["Reason"].astype("str")
    out["reason_class"] = np.where(out["reason"] == SEMICONDUCTOR, "semiconductor", "operational")
    nothing = (out[["requested_units", "carried_in_units", "shipped_units", "backordered_units", "lost_units"]] == 0).all(axis=1)
    out["impact"] = np.select(
        [nothing, out["requested_units"] == 0], ["none", "carried_in_only"], "shortfall"
    )
    out = out.loc[:, list(STOCKOUT_COLUMNS)]
    if out.duplicated(["date", "sku_id", "region"]).any():
        raise AssertionError("duplicate (date, SKU, region) in inventory_stockouts.csv")
    return out.sort_values(["date", "sku_id", "region"], kind="stable").reset_index(drop=True)


def _fill_bounds(fill_pct: pd.Series) -> tuple[np.ndarray, np.ndarray]:
    return ((fill_pct - FILL_HALF_STEP) / 100).to_numpy(), ((fill_pct + FILL_HALF_STEP) / 100).to_numpy()


def latent_fill_feasible(table: pd.DataFrame) -> np.ndarray:
    """Whether one latent fill inside the printed fill's rounding interval explains Shipped and Stockout_Days."""
    low, high = _fill_bounds(table["fill_rate_pct"])
    demand = (table["requested_units"] + table["carried_in_units"]).to_numpy()
    shipped = table["shipped_units"].to_numpy()
    days = table["stockout_days"].to_numpy()
    eps = 1e-9
    safe = np.maximum(demand, 1)
    ship_low = np.where(demand > 0, shipped / safe, low)
    ship_high = np.where(demand > 0, (shipped + 1) / safe - eps, high)
    days_low = 1 - (days + 0.5) / 30
    days_high = 1 - (days - 0.5) / 30
    lo = np.maximum.reduce([low, ship_low, days_low])
    hi = np.minimum.reduce([high, ship_high, days_high])
    return (lo <= hi + eps) & ((demand > 0) | (shipped == 0))


def stockout_checks(table: pd.DataFrame) -> list[Check]:
    """Format, accounting identities, documentation conflict and profile of the stock-out file."""
    lost_ok = table["lost_units"] == (
        table["requested_units"] + table["carried_in_units"] - table["shipped_units"] - table["backordered_units"]
    )
    shortfall = table["requested_units"] + table["carried_in_units"] - table["shipped_units"]
    semiconductor = table["reason_class"] == "semiconductor"
    backorder_ok = np.where(semiconductor, table["backordered_units"] == 0,
                            table["backordered_units"] == np.floor(BACKORDER_SHARE * shortfall + 1e-9))
    previous = table[["sku_id", "region", "month_idx", "backordered_units"]].assign(month_idx=table["month_idx"] + 1)
    pairs = table.merge(previous, on=["sku_id", "region", "month_idx"], suffixes=("", "_previous"))
    carry_ok = pairs["carried_in_units"] == pairs["backordered_units_previous"]
    feasible = latent_fill_feasible(table)
    demand = table["requested_units"] + table["carried_in_units"]
    documented = table[demand > 0]
    documented_match = int(((100 * documented["shipped_units"] / (documented["requested_units"] + documented["carried_in_units"])).round(1)
                            == documented["fill_rate_pct"]).sum())
    totals = {
        "requested": int(table["requested_units"].sum()),
        "carried_in": int(table["carried_in_units"].sum()),
        "shipped": int(table["shipped_units"].sum()),
        "backordered": int(table["backordered_units"].sum()),
        "lost": int(table["lost_units"].sum()),
    }
    impact = table["impact"].value_counts()
    return [
        invariant_check(
            check_id="STK-FORMAT",
            file=FILE,
            rule="I1",
            title="Formally clean file",
            description="No blank, duplicate key, label or date variant; every key is inside the train grid (checked against the decoded grid).",
            dimension="conformity",
            unit="rows",
            checked=len(table),
            violations_before=0,
            violations_after=0,
            action="load as is",
            expected_key="stockouts.rows",
            breakdown=totals,
            breakdown_expected_prefix="stockouts.total",
        ),
        invariant_check(
            check_id="STK-IDENTITY-LOST",
            file=FILE,
            rule="2.7",
            title="Lost = Requested + Carried_In - Shipped - Backordered",
            description="Exact on every row.",
            dimension="consistency",
            unit="rows",
            checked=len(table),
            violations_before=int((~lost_ok).sum()),
            violations_after=int((~lost_ok).sum()),
            action="unit test of the supply block",
        ),
        invariant_check(
            check_id="STK-IDENTITY-CARRY",
            file=FILE,
            rule="2.7",
            title="Carried_In(t) = Backordered(t-1)",
            description="On every pair of consecutive listed months of a series.",
            dimension="consistency",
            unit="pairs",
            checked=len(pairs),
            violations_before=int((~carry_ok).sum()),
            violations_after=int((~carry_ok).sum()),
            action="unit test of the back-order carry",
            expected_key="stockouts.consecutive_pairs",
        ),
        invariant_check(
            check_id="STK-IDENTITY-BACKORDER",
            file=FILE,
            rule="2.7",
            title="Backordered = floor(0.4 x shortfall), 0 for semiconductor rows",
            description=f"Operational rows {int((~semiconductor).sum()):,}, semiconductor rows {int(semiconductor.sum()):,}.",
            dimension="consistency",
            unit="rows",
            checked=len(table),
            violations_before=int((~backorder_ok).sum()),
            violations_after=int((~backorder_ok).sum()),
            action="unit test of the back-order rule",
            breakdown={"semiconductor": int(semiconductor.sum()), "operational": int((~semiconductor).sum())},
            breakdown_expected_prefix="stockouts",
        ),
        invariant_check(
            check_id="STK-IDENTITY-FILL",
            file=FILE,
            rule="2.7",
            title="Shipped = floor(f x (R + C)) and Stockout_Days = round(30 x (1 - f))",
            description="One latent fill f inside the rounding interval of Fill_Rate_Pct explains both values on every row.",
            dimension="consistency",
            unit="rows",
            checked=len(table),
            violations_before=int((~feasible).sum()),
            violations_after=int((~feasible).sum()),
            action="unit test of the allocation rule",
        ),
        invariant_check(
            check_id="STK-I2-FILL-DOCUMENTATION",
            file=FILE,
            rule="I2",
            title="Fill_Rate_Pct is not Shipped / (Requested + Carried_In)",
            description=(
                f"The documented definition holds at one decimal on {documented_match} / {len(documented):,} rows with demand; "
                "Fill_Rate_Pct is the latent allocation fraction. realised_fill_pct is added."
            ),
            dimension="consistency",
            unit="rows",
            checked=documented_match,
            violations_before=len(documented) - documented_match,
            violations_after=len(documented) - documented_match,
            action="keep fill_rate_pct as given; show realised_fill_pct",
            severity="info",
            expected_key="stockouts.fill_documented_match",
            examples=examples_from(documented, ["date", "sku_id", "region", "fill_rate_pct", "realised_fill_pct"]),
        ),
        invariant_check(
            check_id="STK-I3-NO-IMPACT",
            file=FILE,
            rule="I3",
            title="Stock-out rows without a shortfall",
            description="All-zero rows that still carry a fill, days and reason, and rows holding only carried-in units.",
            dimension="validity",
            unit="rows",
            checked=int(impact.get("none", 0)),
            violations_before=0,
            violations_after=0,
            action="keep as flags only (impact = none / carried_in_only)",
            severity="info",
            expected_key="stockouts.no_impact_all_zero",
            breakdown={"carried_in_only": int(impact.get("carried_in_only", 0))},
            breakdown_expected_prefix="stockouts",
        ),
        invariant_check(
            check_id="STK-I5-SEMICONDUCTOR-CARRY",
            file=FILE,
            rule="I5",
            title="Semiconductor rows with carried-in units",
            description="Back-orders from an operational stock-out the month before (2021-02 -> 2021-03).",
            dimension="validity",
            unit="rows",
            checked=int((semiconductor & (table["carried_in_units"] > 0)).sum()),
            violations_before=0,
            violations_after=0,
            action="allow Carried_In > 0 on these rows",
            severity="info",
            expected_key="stockouts.semiconductor_with_carry_in",
        ),
    ]
