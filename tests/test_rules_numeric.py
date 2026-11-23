"""Numeric rule fixtures, adversarial look-alikes and generator-style corruption recovery (dossier 2.2; T4, T5)."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from celeris.cleaning.numeric import STATES, clean_numbers, is_adjacent_digit_swap

CANONICAL = 261.73


def _clean(rows: list[tuple[str, str, str]], canonical: float = CANONICAL) -> pd.DataFrame:
    """Run step 6 on (units, price, revenue) text rows that share one canonical price."""
    frame = pd.DataFrame(rows, columns=["units_txt", "price_txt", "revenue_txt"])
    frame["invoice_price_usd"] = canonical
    frame["list_price_usd"] = canonical
    return clean_numbers(frame)


def _money(value: float) -> str:
    return repr(round(value, 2))


@pytest.mark.parametrize(
    ("row", "code", "units", "price", "revenue"),
    [
        (("19", "261.73", "4972.87"), "N0", 19, CANONICAL, 4972.87),
        (("0", "0.0", "0.0"), "N0z", 0, CANONICAL, 0.0),
        (("", "261.73", "4972.87"), "N1", 19, CANONICAL, 4972.87),
        (("", "0.0", "0.0"), "N2", 0, CANONICAL, 0.0),
        (("", "0.0", ""), "N2", 0, CANONICAL, 0.0),
        (("-", "0.0", "0.0"), "N3", 0, CANONICAL, 0.0),
        (("-19", "261.73", "-4972.87"), "N4", 19, CANONICAL, 4972.87),
        (("190", "261.73", "4972.87"), "N5", 19, CANONICAL, 4972.87),
        (("1,900", "261.73", "4972.87"), "N6", 19, CANONICAL, 4972.87),
        (("19", "261.73", "49728.7"), "N7", 19, CANONICAL, 4972.87),
        (("19", "261.73", "4927.87"), "N8", 19, CANONICAL, 4972.87),
        (("19", "26173.0", "4972.87"), "N9", 19, CANONICAL, 4972.87),
        (("19", "232.94", "4425.86"), "N10", 19, CANONICAL, 4972.87),
        (("2", "2617.3", "5234.6"), "N11", 20, CANONICAL, 5234.6),
        (("", "261.73", ""), "N12", None, CANONICAL, None),
        (("19", "0.0", "0.0"), "N13", 19, CANONICAL, 4972.87),
    ],
)
def test_each_state_is_detected_and_fixed(row: tuple[str, str, str], code: str, units: int | None, price: float, revenue: float | None) -> None:
    out = _clean([row])
    assert out["numeric_code"].item() == code
    assert out["numeric_state"].item() == STATES[code].label
    assert (pd.isna(out["units_sold"].item()) and units is None) or out["units_sold"].item() == units
    assert out["unit_price_usd"].item() == price
    assert (pd.isna(out["revenue_usd"].item()) and revenue is None) or out["revenue_usd"].item() == pytest.approx(revenue, abs=1e-9)


def test_reconciling_one_off_order_is_not_fixed() -> None:
    """An x8 order that reconciles to the cent is real demand (dossier 3), not a units error."""
    out = _clean([("152", "261.73", _money(152 * CANONICAL)), ("1,060", "261.73", _money(1060 * CANONICAL))])
    assert out["numeric_code"].tolist() == ["N0", "N0"]
    assert out["units_sold"].tolist() == [152, 1060]


def test_pack_row_keeps_its_revenue() -> None:
    """Row-level pack rule: units x10, price / 10, revenue unchanged (DD.v refutes the cell-level x10 on revenue)."""
    out = _clean([("4", "2617.3", "10469.2")])
    assert out["numeric_code"].item() == "N11"
    assert out["units_sold"].item() == 40
    assert out["revenue_usd"].item() == 10469.2


def test_true_scale_row_beside_pack_rows_is_untouched() -> None:
    """A blank-units row in the pack block is at true scale; only its own price decides (DD.v correction 3)."""
    out = _clean([("4", "2617.3", "10469.2"), ("", "261.73", _money(37 * CANONICAL))])
    assert out["units_sold"].tolist() == [40, 37]


def test_cents_price_does_not_touch_units_and_revenue_x10_does_not_touch_units() -> None:
    out = _clean([("19", "26173.0", "4972.87"), ("19", "261.73", "49728.7")])
    assert out["units_sold"].tolist() == [19, 19]
    assert out["revenue_usd"].tolist() == [4972.87, 4972.87]


@pytest.mark.parametrize(
    "row",
    [
        ("19", "300.0", "5700.0"),  # price off the lattice {1, 100, 10, 0.89}
        ("", "261.73", "1000.0"),  # revenue / price not an integer
        ("0", "261.73", "0.0"),  # zero units with a price
        ("19", "261.73", "4000.0"),  # mismatch that is neither x10, x100 nor a digit swap
        ("19.5", "261.73", "5103.74"),  # non-integer units
        ("19", "261.73", ""),  # revenue blank on an ordinary row
    ],
)
def test_rows_outside_every_state_fail_the_build(row: tuple[str, str, str]) -> None:
    with pytest.raises((AssertionError, ValueError)):
        _clean([row])


def test_digit_swap_signature() -> None:
    assert is_adjacent_digit_swap(3607060, 3600760)
    assert is_adjacent_digit_swap(2094880, 294880)  # swap creates a leading zero, which drops
    assert not is_adjacent_digit_swap(3607060, 3607061)


def _swap_revenue(cents: int, rng: np.random.Generator) -> int | None:
    digits = str(cents)
    positions = [i for i in range(len(digits) - 1) if digits[i] != digits[i + 1]]
    if not positions:
        return None
    i = int(rng.choice(positions))
    return int(digits[:i] + digits[i + 1] + digits[i] + digits[i + 2 :])


def test_corruption_recovery_on_clean_rows(train_clean: pd.DataFrame) -> None:
    """Inject every numeric error type into clean rows the way the generator does; recovery must be exact (T5)."""
    rng = np.random.default_rng(20261123)
    clean = train_clean[train_clean["numeric_state"] == "N0_ok"].sample(600, random_state=1)
    rows, expected = [], []
    for record in clean.itertuples():
        units, price = int(record.units_sold), float(record.unit_price_usd)
        units_c, price_c = units, round(price * 100)
        revenue_c = units_c * price_c
        revenue = _money(revenue_c / 100)
        swapped = _swap_revenue(revenue_c, rng)
        eur = round(price * 0.89, 2)
        pack_units = max(1, int(np.floor(units / 10 + 0.5)))
        cases = [
            ("N5", (f"{10 * units:,}" if rng.random() < 0.5 else str(10 * units), _money(price), revenue), units, revenue_c),
            ("N6", (str(100 * units), _money(price), revenue), units, revenue_c),
            ("N7", (str(units), _money(price), _money(10 * revenue_c / 100)), units, revenue_c),
            ("N9", (str(units), f"{price_c:.1f}", revenue), units, revenue_c),
            ("N10", (str(units), _money(eur), _money(units * round(eur * 100) / 100)), units, revenue_c),
            ("N4", (str(-units), _money(price), _money(-revenue_c / 100)), units, revenue_c),
            ("N1", ("", _money(price), revenue), units, revenue_c),
            ("N13", (str(units), "0.0", "0.0"), units, revenue_c),
            ("N12", ("", _money(price), ""), None, None),
        ]
        if swapped is not None and swapped != revenue_c:
            cases.append(("N8", (str(units), _money(price), _money(swapped / 100)), units, revenue_c))
        if units >= 5:
            cases.append(("N11", (str(pack_units), _money(10 * price), _money(pack_units * 10 * price_c / 100)), pack_units * 10, pack_units * 10 * price_c))
        for code, row, true_units, true_revenue_c in cases:
            rows.append((*row, price))
            expected.append((code, true_units, true_revenue_c, units))
    frame = pd.DataFrame(rows, columns=["units_txt", "price_txt", "revenue_txt", "invoice_price_usd"])
    frame["list_price_usd"] = frame["invoice_price_usd"]
    out = clean_numbers(frame)
    truth = pd.DataFrame(expected, columns=["code", "units", "revenue_c", "original_units"])
    assert (out["numeric_code"].to_numpy() == truth["code"].to_numpy()).all()
    known = truth["units"].notna().to_numpy()
    assert (out["units_sold"].to_numpy()[known].astype("int64") == truth["units"].to_numpy()[known].astype("int64")).all()
    assert out["units_sold"][~known].isna().all()
    revenue_c = (out["revenue_usd"][known] * 100).round().astype("int64").to_numpy()
    assert (revenue_c == truth["revenue_c"].to_numpy()[known].astype("int64")).all()
    assert (out["unit_price_usd"] == frame["invoice_price_usd"]).all()
    pack = truth["code"] == "N11"
    error = out["units_sold"][pack].astype("int64").to_numpy() - truth["original_units"][pack].to_numpy()
    assert np.abs(error).max() <= 5  # the pack-of-10 recovery is approximate, +-5 units


def test_classifier_is_idempotent_on_its_output(train_clean: pd.DataFrame) -> None:
    """Feeding cleaned values back as raw text yields only clean states and no change (T6)."""
    observed = train_clean[train_clean["units_sold"].notna()].sample(20_000, random_state=3)
    ordered = observed["units_sold"].astype("int64") > 0
    frame = pd.DataFrame(
        {
            "units_txt": observed["units_sold"].astype("int64").astype("str"),
            "price_txt": observed["unit_price_usd"].where(ordered, 0.0).map(repr),
            "revenue_txt": observed["revenue_usd"].map(repr),
            "invoice_price_usd": observed["unit_price_usd"],
            "list_price_usd": observed["list_price_usd"],
        }
    )
    out = clean_numbers(frame)
    assert set(out["numeric_code"]) <= {"N0", "N0z"}
    assert (out["units_sold"].to_numpy() == observed["units_sold"].to_numpy()).all()
    assert np.allclose(out["revenue_usd"].astype("float64"), observed["revenue_usd"])
