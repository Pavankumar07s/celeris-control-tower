"""Step 7(0): ``Units_Sold := Shipped_Units`` on listed stock-out cells (dossier 7.1 step 7, 2.2 N11 / N12, K13).

``Shipped_Units`` is by definition what ``train.csv`` should show. Part A already matches it on the 5,761 comparable
records; the overlay fills the three classes part A cannot know exactly:

- 26 missing rows that are listed (``row_status = missing_row``): units and revenue were null;
- 1 ERP blank (THM-033 Latin America 2023-04, N12): units were unknown;
- 42 pack-of-10 rows (N11): units were ``10 x booked`` (+-5).

Revenue is recomputed on those cells as ``units x invoice price`` so the revenue identity keeps holding to the cent.
The "before" values are derived from the immutable part-A columns (row status, numeric state, raw units), so the
overlay and its fix-log rows are identical whether the input grid is fresh from ``clean`` or was overlaid before
(idempotence). Every value change gets a fix-log row with rule ``S0``.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from celeris.config import PACK_SIZE
from celeris.quality.checks import Check, examples_from, invariant_check, issue_check
from celeris.quality.fixlog import fix_entries

FILE = "train.csv"
RULE = "S0"
STEP = 7
KEYS = ["date", "sku_id", "region"]


@dataclass(frozen=True)
class Overlay:
    """The overlaid grid, its fix-log rows and the counts behind the checks."""

    cells: pd.DataFrame
    fix_log: pd.DataFrame
    filled: dict[str, int]
    comparable: int
    comparable_equal: int


def part_a_units(cells: pd.DataFrame) -> pd.Series:
    """Units as part A wrote them: null on missing rows and ERP blanks, ``10 x booked`` on pack rows."""
    units = cells["units_sold"].astype("Float64")
    pack = cells["numeric_state"] == "N11_pack_of_10"
    booked = pd.to_numeric(cells["units_raw"].where(pack), errors="coerce").astype("Float64")
    units = units.where(~pack, booked * PACK_SIZE)
    erp = cells["numeric_state"] == "N12_erp_units_lost"
    missing = cells["row_status"] == "missing_row"
    return units.mask(erp | missing).astype("Int64")


def overlay_shipped(cells: pd.DataFrame, stockouts: pd.DataFrame) -> Overlay:
    """Apply the overlay to the grid; ``stockouts`` is the cleaned stock-out file."""
    shipped = cells[KEYS].merge(stockouts[KEYS + ["shipped_units"]], on=KEYS, how="left", validate="one_to_one")["shipped_units"]
    shipped.index = cells.index
    listed = shipped.notna()
    before_units = part_a_units(cells)
    state = cells["numeric_state"]
    target = listed & ((cells["row_status"] == "missing_row") | state.isin(["N11_pack_of_10", "N12_erp_units_lost"]))
    comparable = listed & ~target
    equal = int((cells.loc[comparable, "units_sold"].astype("int64") == shipped[comparable].astype("int64")).sum())
    if equal != int(comparable.sum()):
        raise AssertionError("cleaned units differ from Shipped_Units on a comparable listed record")

    out = cells.copy()
    units = before_units.astype("Float64")
    units[target] = shipped[target]
    out["units_sold"] = units.astype("Int64")
    price = out["unit_price_usd"]
    before_revenue = _part_a_revenue(cells, before_units)
    revenue = before_revenue.copy()
    revenue[target] = (shipped[target] * price[target]).round(2)
    out["revenue_usd"] = revenue.astype("float64")
    units_changed = target & (before_units.astype("Float64").fillna(-1) != shipped.fillna(-1))
    revenue_changed = target & (before_revenue.fillna(-1).round(2) != revenue.fillna(-1).round(2))
    out["fix_rule"] = _with_rule(_strip_rule(out["fix_rule"]), units_changed | revenue_changed)

    evidence = '{"shipped_units":' + shipped.astype("Int64").astype("str") + ',"numeric_state":"' + state.fillna("missing_row") + '"}'
    parts = [
        fix_entries(
            out[mask],
            file=FILE,
            step=STEP,
            rule=RULE,
            column=column,
            method="exact",
            raw_value=out.loc[mask, "units_raw"] if column == "Units_Sold" else None,
            before=before[mask],
            after=after[mask],
            evidence=evidence[mask],
        )
        for column, mask, before, after in (
            ("Units_Sold", units_changed, before_units, out["units_sold"]),
            ("Revenue_USD", revenue_changed, before_revenue, out["revenue_usd"]),
        )
    ]
    filled = {
        "missing_row": int((target & (cells["row_status"] == "missing_row")).sum()),
        "erp_blank": int((target & (state == "N12_erp_units_lost")).sum()),
        "pack_of_10": int((target & (state == "N11_pack_of_10")).sum()),
        "units_changed": int(units_changed.sum()),
        "revenue_changed": int(revenue_changed.sum()),
    }
    return Overlay(out, pd.concat(parts, ignore_index=True), filled, int(comparable.sum()), equal)


def _part_a_revenue(cells: pd.DataFrame, units: pd.Series) -> pd.Series:
    """Revenue as part A wrote it: null where units are unknown; pack rows keep the booked revenue (10 x booked x price)."""
    revenue = cells["revenue_usd"].astype("float64").copy()
    pack = cells["numeric_state"] == "N11_pack_of_10"
    revenue[pack] = (units[pack].astype("float64") * cells.loc[pack, "unit_price_usd"]).round(2)
    unknown = units.isna()
    revenue[unknown] = np.nan
    return revenue


def _strip_rule(rules: pd.Series) -> pd.Series:
    """Remove a previous ``S0`` tag (re-runs start from the part-A rule list)."""
    stripped = rules.str.replace(r"\|?S0$", "", regex=True)
    return stripped.where(stripped != "", None).astype("str")


def _with_rule(rules: pd.Series, mask: pd.Series) -> pd.Series:
    tagged = rules.where(rules.isna(), rules + "|" + RULE).fillna(RULE)
    return rules.where(~mask, tagged).astype("str")


def overlay_checks(overlay: Overlay) -> list[Check]:
    """The overlay as an issue check (69 cells, 0 left) and the oracle on the comparable listed records."""
    filled = overlay.filled
    total = filled["missing_row"] + filled["erp_blank"] + filled["pack_of_10"]
    changed = overlay.cells[overlay.cells["fix_rule"].fillna("").str.endswith(RULE)]
    return [
        issue_check(
            check_id="DEM-S0-SHIPPED-OVERLAY",
            file=FILE,
            rule="7.1/7(0)",
            title="Listed cells whose units only the stock-out file knows",
            description=(
                f"Units := Shipped_Units on {total} listed cells: {filled['missing_row']} missing rows, {filled['erp_blank']} ERP blank, "
                f"{filled['pack_of_10']} pack-of-10 rows ({filled['units_changed']} unit values and {filled['revenue_changed']} revenues changed; "
                "revenue recomputed as units x invoice price)."
            ),
            dimension="completeness",
            unit="cells",
            affected=total,
            action="units = Shipped_Units, revenue = units x invoice price (fix-log rule S0)",
            expected_key="demand.overlay_cells",
            breakdown={"missing_row": filled["missing_row"], "erp_blank": filled["erp_blank"], "pack_of_10": filled["pack_of_10"]},
            breakdown_expected_prefix="demand.overlay",
            examples=examples_from(changed, ["date", "sku_id", "region", "numeric_state", "units_sold", "revenue_usd"]),
        ),
        invariant_check(
            check_id="DEM-S0-ORACLE",
            file=FILE,
            rule="7.1/7(0)",
            title="Units = Shipped_Units on every listed cell after the overlay",
            description=f"{overlay.comparable:,} comparable records already equal before the overlay; every listed cell equals after it.",
            dimension="accuracy",
            unit="cells",
            checked=overlay.comparable,
            violations_before=overlay.comparable - overlay.comparable_equal,
            violations_after=0,
            action="fail the build on any mismatch",
            expected_key="oracle.units_exact",
        ),
    ]
