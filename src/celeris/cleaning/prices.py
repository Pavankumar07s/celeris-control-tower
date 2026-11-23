"""Step 5: the canonical price table (dossier 2.2, 7.1 step 5; business rule 4).

Prices are per SKU, identical in every region and channel, and change on 1 January. The only exception is the
temporary +6 % raw-material surcharge on invoices of 2022-07..12 (EV-027), which is real, not an error. So the price
period is the calendar year, with 2022 split into H1 and H2, and the canonical invoice price of a period is the mode of
the non-zero raw prices of the SKU in that period. Injected price errors (cents, EUR, packs) are a minority in every
cell (minimum mode share 0.571), so the mode is always the true price; the numeric step then verifies that every priced
row sits on the lattice {1, 100, 10, 0.89} x canonical.

The list price equals the invoice price outside 2022-H2. In 2022-H2 it is the 2022-H1 price; the 16 SKUs launched in
2022-H2 have no H1 price, so their list price is the H2 price / 1.06 rounded to the cent (EC.v).
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from celeris.config import SURCHARGE_FIRST_MONTH_OF_YEAR, SURCHARGE_RATE, SURCHARGE_YEAR
from celeris.quality.checks import Check, examples_from, invariant_check

FILE = "train.csv"


def price_period(year: pd.Series, month: pd.Series) -> pd.Series:
    """``YYYY`` for ordinary years, ``2022H1`` / ``2022H2`` for the surcharge year."""
    text = year.astype("str")
    surcharge_year = year == SURCHARGE_YEAR
    half = np.where(month >= SURCHARGE_FIRST_MONTH_OF_YEAR, "H2", "H1")
    return text.where(~surcharge_year, text + half).astype("str")


def is_surcharge_period(period: pd.Series) -> pd.Series:
    return period == f"{SURCHARGE_YEAR}H2"


def build_price_table(records: pd.DataFrame) -> pd.DataFrame:
    """Canonical list and invoice price per SKU x period from the records' raw prices.

    ``records`` needs ``sku_id``, ``year``, ``month`` and ``price_raw`` (float). Asserts the mode is unique.
    """
    priced = records.loc[records["price_raw"] > 0, ["sku_id", "year", "month", "price_raw"]]
    priced = priced.assign(period=price_period(priced["year"], priced["month"]))
    counts = priced.groupby(["sku_id", "period", "price_raw"]).size().rename("n").reset_index()
    counts = counts.sort_values(["sku_id", "period", "n", "price_raw"], ascending=[True, True, False, True], kind="stable")
    top = counts.groupby(["sku_id", "period"]).head(2)
    first = top.groupby(["sku_id", "period"]).nth(0).set_index(["sku_id", "period"])
    second = top.groupby(["sku_id", "period"]).nth(1).set_index(["sku_id", "period"])["n"]
    if (second.reindex(first.index).fillna(0) >= first["n"]).any():
        raise AssertionError("tied price mode in a SKU x period cell")
    table = first.rename(columns={"price_raw": "invoice_price_usd", "n": "n_mode"}).reset_index()
    table["n_priced_records"] = table.set_index(["sku_id", "period"]).index.map(
        priced.groupby(["sku_id", "period"]).size()
    )
    table["mode_share"] = (table["n_mode"] / table["n_priced_records"]).round(4)
    table["year"] = table["period"].str[:4].astype("int64")
    table["surcharge"] = is_surcharge_period(table["period"])
    h1 = table[table["period"] == f"{SURCHARGE_YEAR}H1"].set_index("sku_id")["invoice_price_usd"]
    h2_list = table["sku_id"].map(h1).where(table["sku_id"].isin(h1.index), (table["invoice_price_usd"] / SURCHARGE_RATE).round(2))
    table["list_price_usd"] = h2_list.where(table["surcharge"], table["invoice_price_usd"])
    yearly = table.drop_duplicates(["sku_id", "year"]).set_index(["sku_id", "year"])["list_price_usd"]
    previous = pd.MultiIndex.from_arrays([table["sku_id"], table["year"] - 1])
    table["list_change_pct"] = (100 * (table["list_price_usd"].to_numpy() / yearly.reindex(previous).to_numpy() - 1)).round(3)
    columns = ["sku_id", "period", "year", "surcharge", "list_price_usd", "invoice_price_usd", "list_change_pct",
               "n_priced_records", "mode_share"]
    return table.loc[:, columns].sort_values(["sku_id", "period"], kind="stable").reset_index(drop=True)


def price_checks(table: pd.DataFrame) -> list[Check]:
    """Price-table size and the surcharge identity H2 = round(H1 x 1.06, 2)."""
    h2 = table[table["surcharge"]]
    has_h1 = h2.merge(table[table["period"] == f"{SURCHARGE_YEAR}H1"][["sku_id"]], on="sku_id")
    off = has_h1[(has_h1["invoice_price_usd"] - (has_h1["list_price_usd"] * SURCHARGE_RATE).round(2)).abs() > 0.001]
    yearly = table.drop_duplicates(["sku_id", "year"]).groupby("year")["list_change_pct"].mean().dropna().round(3)
    return [
        invariant_check(
            check_id="TRN-PRICE-TABLE",
            file=FILE,
            rule="2.2",
            title="Canonical price table",
            description=(
                f"Mode of the non-zero raw price per SKU x period ({table['sku_id'].nunique()} SKUs, minimum mode share "
                f"{table['mode_share'].min():.3f}). Mean January list change by year: "
                + ", ".join(f"{year} {pct:+.3f} %" for year, pct in yearly.items())
                + "."
            ),
            dimension="consistency",
            unit="cells",
            checked=len(table),
            violations_before=0,
            violations_after=0,
            action="one price per SKU and period in every region (business rule 4)",
            expected_key="price.cells",
            breakdown={"skus": int(table["sku_id"].nunique())},
            breakdown_expected_prefix="price",
        ),
        invariant_check(
            check_id="TRN-PRICE-SURCHARGE",
            file=FILE,
            rule="2.2",
            title="Surcharge 2022-H2 = list x 1.06",
            description=(
                f"Invoice price = round(list x 1.06, 2) on {len(has_h1) - len(off)} / {len(has_h1)} SKUs with both halves; "
                "the exception is 1 cent off (the generator multiplies an unrounded base). A real price event (EV-027), not an error."
            ),
            dimension="consistency",
            unit="skus",
            checked=len(off),
            violations_before=0,
            violations_after=0,
            action="keep the observed invoice price; list price = H1 price",
            severity="info",
            expected_key="price.surcharge_off_by_one_cent",
            examples=examples_from(off, ["sku_id", "list_price_usd", "invoice_price_usd"]),
        ),
    ]
