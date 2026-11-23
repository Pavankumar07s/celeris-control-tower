"""Step 6: numeric states of Units x Price = Revenue and their fixes (dossier 2.2, 7.1 step 6).

``Revenue = Units x Price`` holds to the cent on every clean priced row and the smallest real discrepancy anywhere is
USD 9.00, so all tests are exact integer-cent comparisons (no tolerance). Every record falls into exactly one of 15
mutually exclusive states (two clean ones and 13 error types; errors never co-occur). Precedence (NR, NR.v):

1. parse: strip a thousands separator (N6b, a format issue only), ``-`` is a dash, ``''`` is blank;
2. price class ``q = price / canonical invoice price`` on the lattice {0, 1, 100, 10, 0.89}; anything else fails the
   build;
3. blank / dash / sign rules first, then the price class, then ``k = units x price / revenue`` for q = 1 rows.

The ERP rule (N12) and the pack rule (N11) are row-level: a row is a pack row because its own price is 10 x canonical,
never because of its region, channel or month (DD.v refutes the cell-level rule: it would inflate the cell's revenue
tenfold and corrupt 7 non-pack rows). A genuine one-off order reconciles to the cent and stays N0 untouched.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from celeris.config import CENTS_FACTOR, EUR_FACTOR, PACK_SIZE
from celeris.quality.checks import Check, examples_from, invariant_check, issue_check
from celeris.quality.fixlog import Method, fix_entries

FILE = "train.csv"


@dataclass(frozen=True)
class StateSpec:
    """One numeric state: its code, column label, wrong fields and fix."""

    code: str
    name: str
    title: str
    wrong_fields: str
    fix: str

    @property
    def label(self) -> str:
        return f"{self.code}_{self.name}"


STATES: dict[str, StateSpec] = {
    spec.code: spec
    for spec in (
        StateSpec("N0", "ok", "Clean priced row", "none", "none"),
        StateSpec("N0z", "zero_row", "Clean zero row (no order)", "none", "keep 0; price 0.0 is a placeholder, filled with the price in force"),
        StateSpec("N1", "units_blank_recovered", "Units blank, revenue present", "units", "units = revenue / price (exact integer)"),
        StateSpec("N2", "units_blank_zero_row", "Units blank on a zero row", "units", "units = 0 (price 0 means no order)"),
        StateSpec("N3", "units_dash", "Units '-' placeholder", "units", "units = 0"),
        StateSpec("N4", "sign_error", "Negative units and revenue", "units, revenue", "abs() of both; never netted"),
        StateSpec("N5", "units_x10", "Units x10", "units", "units = revenue / price"),
        StateSpec("N6", "units_x100", "Units x100", "units", "units = revenue / price"),
        StateSpec("N7", "revenue_x10", "Revenue x10", "revenue", "revenue = units x price; units untouched"),
        StateSpec("N8", "revenue_digit_swap", "Revenue digit transposition", "revenue", "revenue = units x price; units untouched"),
        StateSpec("N9", "price_in_cents", "Price in cents", "price", "price = price / 100"),
        StateSpec("N10", "price_in_eur", "Price and revenue in EUR (Europe Direct OEM 2022-Q1)", "price, revenue", "price = canonical; revenue = units x canonical"),
        StateSpec("N11", "pack_of_10", "Units booked in packs of 10 (India Aftermarket 2021-H2)", "units, price", "units = 10 x units (+-5); price = canonical; revenue unchanged"),
        StateSpec("N12", "erp_units_lost", "Units and revenue blank on an order (LatAm ERP migration)", "units, revenue", "units unknown (null), known positive"),
        StateSpec("N13", "price_zeroed", "Price and revenue zeroed on a real order", "price, revenue", "price = canonical; revenue = units x canonical"),
    )
}
CLEAN_STATES = ("N0", "N0z")


@dataclass(frozen=True)
class ParsedNumbers:
    """Raw numeric text parsed into integers (units, cents) with explicit masks."""

    units: np.ndarray  # int64, 0 where blank or dash
    has_units: np.ndarray  # bool
    dash: np.ndarray
    blank: np.ndarray
    comma: np.ndarray
    price_c: np.ndarray  # int64 cents
    revenue_c: np.ndarray  # int64 cents, 0 where blank
    has_revenue: np.ndarray


def _cents(text: pd.Series) -> tuple[np.ndarray, np.ndarray]:
    present = (text != "").to_numpy()
    values = pd.to_numeric(text.where(text != "", "0"), errors="raise").to_numpy(dtype="float64")
    return np.rint(values * 100).astype("int64"), present


def parse_numbers(units_txt: pd.Series, price_txt: pd.Series, revenue_txt: pd.Series) -> ParsedNumbers:
    """Parse the three raw numeric columns; raise on any text that is not a number, ``-`` or blank."""
    comma = units_txt.str.contains(",", regex=False).to_numpy()
    stripped = units_txt.str.replace(",", "", regex=False)
    dash = (stripped == "-").to_numpy()
    blank = (stripped == "").to_numpy()
    numeric = stripped.where(~(dash | blank), "0")
    if not numeric.str.fullmatch(r"-?\d+").all():
        raise ValueError("Units_Sold holds a value that is not an integer, '-' or blank")
    price_c, has_price = _cents(price_txt)
    if not has_price.all():
        raise ValueError("blank Unit_Price_USD")
    revenue_c, has_revenue = _cents(revenue_txt)
    return ParsedNumbers(
        units=numeric.astype("int64").to_numpy(),
        has_units=~(dash | blank),
        dash=dash,
        blank=blank,
        comma=comma,
        price_c=price_c,
        revenue_c=revenue_c,
        has_revenue=has_revenue,
    )


def price_class(price_c: np.ndarray, canonical_c: np.ndarray) -> np.ndarray:
    """Price lattice class per row: ``zero``, ``q1``, ``q100``, ``q10`` or ``q089``; raise when off the lattice.

    ``canonical_c`` is the canonical invoice price in cents (-1 where the SKU-period has no priced row).
    """
    eur = np.abs(price_c - EUR_FACTOR * canonical_c) <= 0.5 + 1e-9
    classes = np.select(
        [price_c == 0, price_c == canonical_c, price_c == CENTS_FACTOR * canonical_c, price_c == PACK_SIZE * canonical_c, eur],
        ["zero", "q1", "q100", "q10", "q089"],
        "off_lattice",
    )
    if (classes == "off_lattice").any():
        raise AssertionError(f"{int((classes == 'off_lattice').sum())} priced rows off the price lattice {{1, 100, 10, 0.89}}")
    return classes


def is_adjacent_digit_swap(true_c: int, recorded_c: int) -> bool:
    """Whether ``recorded_c`` is ``true_c`` (in cents) with two adjacent digits swapped (a leading zero may drop)."""
    digits = str(true_c)
    for i in range(len(digits) - 1):
        if digits[i] != digits[i + 1] and int(digits[:i] + digits[i + 1] + digits[i] + digits[i + 2 :]) == recorded_c:
            return True
    return False


def classify(parsed: ParsedNumbers, classes: np.ndarray) -> np.ndarray:
    """State code of every row, in the dossier's precedence; raise on a row that fits no state."""
    u, p, r = parsed.units, parsed.price_c, parsed.revenue_c
    positive_price = p > 0
    q1 = classes == "q1"
    ordered = parsed.has_units & (u > 0)
    codes = np.select(
        [
            parsed.dash,
            parsed.blank & ~positive_price,
            parsed.blank & positive_price & parsed.has_revenue,
            parsed.blank & positive_price & ~parsed.has_revenue,
            parsed.has_units & (u < 0),
            classes == "q10",
            classes == "q089",
            classes == "q100",
            (classes == "zero") & ordered,
            q1 & ordered & (u * p == PACK_SIZE * r),
            q1 & ordered & (u * p == CENTS_FACTOR * r),
            q1 & ordered & (PACK_SIZE * u * p == r),
            q1 & ordered & (u * p == r),
            q1 & ordered,
            (classes == "zero") & parsed.has_units & (u == 0),
        ],
        ["N3", "N2", "N1", "N12", "N4", "N11", "N10", "N9", "N13", "N5", "N6", "N7", "N0", "N8", "N0z"],
        "unclassified",
    )
    _assert_state_signatures(parsed, classes, codes)
    return codes


def _assert_state_signatures(parsed: ParsedNumbers, classes: np.ndarray, codes: np.ndarray) -> None:
    """Every state must carry its exact arithmetic signature; otherwise the build fails."""
    u, p, r = parsed.units, parsed.price_c, parsed.revenue_c
    q1 = classes == "q1"
    violations = {
        "unclassified": codes == "unclassified",
        "N3 with a price or revenue": (codes == "N3") & ((p != 0) | (r != 0)),
        "N2 with revenue": (codes == "N2") & (r != 0),
        "N1 not on q=1 or revenue/price not an integer": (codes == "N1") & (~q1 | (r % np.maximum(p, 1) != 0) | (r <= 0)),
        "N12 not on q=1": (codes == "N12") & ~q1,
        "N4 not reconciling": (codes == "N4") & (~q1 | (u * p != r)),
        "N11 not reconciling": (codes == "N11") & ((u <= 0) | (u * p != r)),
        "N10 not reconciling": (codes == "N10") & ((u <= 0) | (u * p != r)),
        "N9 not reconciling": (codes == "N9") & ((u <= 0) | (u * p != CENTS_FACTOR * r)),
        "N13 with revenue": (codes == "N13") & (r != 0),
        "N0z with revenue": (codes == "N0z") & (r != 0),
        "zero units with a price": parsed.has_units & (u == 0) & (p > 0),
    }
    swaps = np.flatnonzero(codes == "N8")
    violations["N8 not a digit swap"] = np.zeros(len(codes), dtype=bool)
    violations["N8 not a digit swap"][swaps] = [not is_adjacent_digit_swap(int(u[i] * p[i]), int(r[i])) for i in swaps]
    failed = {name: int(mask.sum()) for name, mask in violations.items() if mask.any()}
    if failed:
        raise AssertionError(f"numeric rows violate their state signature: {failed}")


@dataclass(frozen=True)
class NumericFix:
    """Cleaned values per row (units nullable, prices and revenue in cents)."""

    codes: np.ndarray
    units: pd.Series  # Int64
    price_c: np.ndarray  # canonical invoice price in force (-1 where none exists)
    revenue_c: pd.Series  # Int64, null where units are unknown


def apply_fixes(parsed: ParsedNumbers, codes: np.ndarray, canonical_c: np.ndarray) -> NumericFix:
    """Apply the fix of each state (see ``STATES``); ``canonical_c`` is the canonical invoice price in cents."""
    u, r = parsed.units, parsed.revenue_c
    p_raw = parsed.price_c
    implied = np.where(p_raw > 0, r // np.maximum(p_raw, 1), 0)
    units = np.select(
        [np.isin(codes, ["N1", "N5", "N6"]), np.isin(codes, ["N2", "N3"]), codes == "N4", codes == "N11"],
        [implied, 0, -u, PACK_SIZE * u],
        u,
    )
    unknown = codes == "N12"
    revenue = np.where(codes == "N4", -r, r)
    recompute = np.isin(codes, ["N7", "N8", "N10", "N13"])
    revenue = np.where(recompute, units * canonical_c, revenue)
    revenue = np.where(np.isin(codes, ["N2", "N3"]), 0, revenue)
    return NumericFix(
        codes=codes,
        units=_nullable(units, unknown),
        price_c=canonical_c,
        revenue_c=_nullable(revenue, unknown),
    )


def _nullable(values: np.ndarray, missing: np.ndarray) -> pd.Series:
    out = pd.Series(values, dtype="Int64")
    out[missing] = pd.NA
    return out


def clean_numbers(records: pd.DataFrame) -> pd.DataFrame:
    """Classify and fix the numeric columns of ``records``.

    ``records`` needs ``units_txt``, ``price_txt``, ``revenue_txt``, ``invoice_price_usd`` and ``list_price_usd``
    (canonical prices of the record's SKU x period; null where the period has no priced row). Returns, aligned with
    ``records``: ``numeric_code``, ``numeric_state``, ``units_sold``, ``unit_price_usd``, ``revenue_usd`` and the
    parsed raw values needed by the fix log and the checks.
    """
    parsed = parse_numbers(records["units_txt"], records["price_txt"], records["revenue_txt"])
    canonical_c = _canonical_cents(records["invoice_price_usd"])
    priced = parsed.price_c > 0
    if (priced & (canonical_c < 0)).any():
        raise AssertionError("a priced record has no canonical price")
    classes = price_class(parsed.price_c, canonical_c)
    codes = classify(parsed, classes)
    fix = apply_fixes(parsed, codes, canonical_c)
    out = pd.DataFrame(index=records.index)
    out["numeric_code"] = codes
    out["numeric_state"] = pd.Series(codes, index=records.index).map({c: s.label for c, s in STATES.items()}).astype("str")
    out["units_sold"] = fix.units.set_axis(records.index)
    out["unit_price_usd"] = records["invoice_price_usd"]
    out["list_price_usd"] = records["list_price_usd"]
    out["revenue_usd"] = fix.revenue_c.set_axis(records.index).astype("Float64") / 100
    out["units_parsed"] = _nullable(parsed.units, ~parsed.has_units).set_axis(records.index)
    out["comma"] = parsed.comma
    out["price_raw_c"] = parsed.price_c
    out["revenue_raw_c"] = pd.Series(parsed.revenue_c, index=records.index).where(parsed.has_revenue)
    out["canonical_c"] = canonical_c
    return out


def _canonical_cents(prices: pd.Series) -> np.ndarray:
    return np.rint(prices.fillna(-0.01).to_numpy(dtype="float64") * 100).astype("int64")


def state_counts(codes: pd.Series) -> dict[str, int]:
    """Count per state code in the dossier order (every state present, zero if absent)."""
    counts = codes.value_counts()
    return {code: int(counts.get(code, 0)) for code in STATES}


def revenue_identity_violations(units: pd.Series, price_c: pd.Series, revenue_c: pd.Series) -> int:
    """Rows where units, price and revenue are all known and ``units x price != revenue`` to the cent."""
    known = units.notna() & price_c.notna() & revenue_c.notna()
    lhs = units[known].astype("int64") * price_c[known].astype("int64")
    return int((lhs != revenue_c[known].astype("int64")).sum())


def numeric_checks(records: pd.DataFrame, numbers: pd.DataFrame, raw_codes: pd.Series) -> list[Check]:
    """One check per error state, the state census (records and raw rows), the comma format and the identities."""
    codes = numbers["numeric_code"]
    error_ids = int((~codes.isin(CLEAN_STATES)).sum())
    checks = [
        invariant_check(
            check_id="TRN-NUM-STATES",
            file=FILE,
            rule="2.2",
            title="Every record in exactly one of 15 numeric states",
            description=f"{error_ids:,} records carry an error; no record carries two.",
            dimension="validity",
            unit="records",
            checked=len(codes),
            violations_before=0,
            violations_after=0,
            action="classify with q = price / canonical, then k = units x price / revenue",
            expected_key="train.records",
            breakdown={**state_counts(codes), "error_ids": error_ids},
            breakdown_expected_prefix="num",
        ),
        invariant_check(
            check_id="TRN-NUM-STATES-RAW",
            file=FILE,
            rule="2.2",
            title="Numeric states on raw rows (before de-duplication)",
            description="Both versions of a repeated Record_ID always carry the same state.",
            dimension="validity",
            unit="raw_rows",
            checked=len(raw_codes),
            violations_before=0,
            violations_after=0,
            action="none",
            severity="info",
            expected_key="train.raw_rows",
            breakdown=state_counts(raw_codes),
            breakdown_expected_prefix="num_raw",
        ),
    ]
    view = records.assign(**{c: numbers[c] for c in ("numeric_state", "units_sold", "unit_price_usd", "revenue_usd")})
    for code, spec in STATES.items():
        if code in CLEAN_STATES:
            continue
        rows = view[codes == code]
        unknown = int(rows["units_sold"].isna().sum())
        blank_revenue = {"erp_blank_revenue": int(numbers.loc[codes == code, "revenue_raw_c"].isna().sum())} if code == "N2" else {}
        checks.append(
            issue_check(
                check_id=f"TRN-{code}-{spec.name.upper().replace('_', '-')}",
                file=FILE,
                rule=code,
                title=spec.title,
                description=f"Wrong field(s): {spec.wrong_fields}. Fix: {spec.fix}.",
                dimension="accuracy" if code not in ("N1", "N2", "N3", "N12") else "completeness",
                unit="records",
                affected=len(rows),
                remaining=unknown,
                severity="warning" if unknown else "error",
                action=spec.fix,
                expected_key=f"num.{code}",
                breakdown=blank_revenue,
                breakdown_expected_prefix=f"num.{code}" if blank_revenue else None,
                examples=examples_from(
                    rows, ["record_id", "date", "sku_id", "region", "units_txt", "price_txt", "revenue_txt", "units_sold", "unit_price_usd", "revenue_usd"]
                ),
            )
        )
    comma = view[numbers["comma"]]
    comma_only = int((numbers["comma"] & codes.isin(CLEAN_STATES)).sum())
    checks.append(
        issue_check(
            check_id="TRN-N6B-THOUSANDS-SEPARATOR",
            file=FILE,
            rule="N6b",
            title="Thousands separator in Units_Sold",
            description=(
                f"{len(comma)} records written d,ddd; {comma_only} are genuine large orders whose only issue is the comma, "
                "the rest are x10 / x100 errors. Never divide on magnitude alone."
            ),
            dimension="conformity",
            unit="records",
            affected=len(comma),
            action="strip the comma before classifying",
            expected_key="num.comma_records",
            examples=examples_from(comma, ["record_id", "units_txt", "units_sold", "numeric_state"]),
            breakdown={str(k): int(v) for k, v in codes[numbers["comma"]].value_counts().sort_index().items()},
            breakdown_expected_prefix="num.comma",
        )
    )
    units_known = numbers["units_parsed"]
    before_identity = revenue_identity_violations(
        units_known.where(numbers["price_raw_c"] > 0), pd.Series(numbers["price_raw_c"]), numbers["revenue_raw_c"]
    )
    after_identity = revenue_identity_violations(
        numbers["units_sold"],
        pd.Series(numbers["canonical_c"], index=numbers.index).where(numbers["canonical_c"] >= 0),
        (numbers["revenue_usd"] * 100).round().astype("Int64"),
    )
    checks.append(
        invariant_check(
            check_id="TRN-NUM-REVENUE-IDENTITY",
            file=FILE,
            rule="2.2",
            title="Revenue = units x invoice price to the cent",
            description="Evaluated on every record whose units, price and revenue are known (no tolerance: the identity is exact).",
            dimension="consistency",
            unit="records",
            checked=int(numbers["units_sold"].notna().sum()),
            violations_before=before_identity,
            violations_after=after_identity,
            action="fix the wrong field identified by the state",
        )
    )
    bad_units = int((numbers["units_parsed"].isna() | (numbers["units_parsed"] < 0) | numbers["comma"]).sum())
    after_units = int((numbers["units_sold"] < 0).sum())
    checks.append(
        invariant_check(
            check_id="TRN-NUM-UNITS-VALID",
            file=FILE,
            rule="2.2",
            title="Units are non-negative integers",
            description=(
                "Before: blank, '-', negative or comma-formatted units. After: none negative; null only where the order "
                f"size is unknown ({int(numbers['units_sold'].isna().sum())} ERP records)."
            ),
            dimension="validity",
            unit="records",
            checked=len(numbers),
            violations_before=bad_units,
            violations_after=after_units,
            action="see the state rules",
        )
    )
    return checks


def numeric_fix_log(records: pd.DataFrame, numbers: pd.DataFrame) -> pd.DataFrame:
    """Fix-log rows for every numeric cell changed by step 6 (units, price, revenue)."""
    view = records.assign(**{c: numbers[c] for c in numbers.columns})
    codes = view["numeric_code"]
    price = view["price_raw_c"] / 100
    revenue_raw = view["revenue_raw_c"] / 100
    canonical = view["unit_price_usd"]
    evidence_q = (
        '{"price":' + price.astype("str") + ',"canonical":' + canonical.astype("str")
        + ',"q":' + (view["price_raw_c"] / view["canonical_c"]).round(4).astype("str") + "}"
    )
    evidence_revenue = (
        '{"revenue":' + revenue_raw.astype("str") + ',"price":' + price.astype("str")
        + ',"revenue/price":' + (view["revenue_raw_c"] / view["price_raw_c"]).round(4).astype("str") + "}"
    )
    evidence_k = (
        '{"units":' + view["units_parsed"].astype("str") + ',"revenue/price":'
        + (view["revenue_raw_c"] / view["price_raw_c"]).round(4).astype("str")
        + ',"thousands_separator":' + view["comma"].map({True: "true", False: "false"}) + "}"
    )
    entries: list[tuple[str, str, pd.Series, Method, pd.Series, pd.Series, pd.Series]] = [
        # (rule, column, mask, method, before, after, evidence)
        ("N1", "Units_Sold", codes == "N1", "exact", view["units_txt"], view["units_sold"], evidence_revenue),
        ("N2", "Units_Sold", codes == "N2", "exact", view["units_txt"], view["units_sold"], evidence_q),
        ("N3", "Units_Sold", codes == "N3", "exact", view["units_txt"], view["units_sold"], evidence_q),
        ("N4", "Units_Sold", codes == "N4", "exact", view["units_parsed"], view["units_sold"], evidence_k),
        ("N5", "Units_Sold", codes == "N5", "exact", view["units_parsed"], view["units_sold"], evidence_k),
        ("N6", "Units_Sold", codes == "N6", "exact", view["units_parsed"], view["units_sold"], evidence_k),
        ("N11", "Units_Sold", codes == "N11", "approximate", view["units_parsed"], view["units_sold"], evidence_q),
        ("N12", "Units_Sold", codes == "N12", "unknown", view["units_txt"], view["units_sold"], evidence_q),
        ("N6b", "Units_Sold", view["comma"] & codes.isin(CLEAN_STATES), "format", view["units_txt"], view["units_sold"], evidence_k),
        ("N0z", "Unit_Price_USD", (codes == "N0z") & canonical.notna(), "convention", price, canonical, evidence_q),
        ("N2", "Unit_Price_USD", (codes == "N2") & canonical.notna(), "convention", price, canonical, evidence_q),
        ("N3", "Unit_Price_USD", (codes == "N3") & canonical.notna(), "convention", price, canonical, evidence_q),
        ("N9", "Unit_Price_USD", codes == "N9", "exact", price, canonical, evidence_q),
        ("N10", "Unit_Price_USD", codes == "N10", "exact", price, canonical, evidence_q),
        ("N11", "Unit_Price_USD", codes == "N11", "exact", price, canonical, evidence_q),
        ("N13", "Unit_Price_USD", codes == "N13", "exact", price, canonical, evidence_q),
        ("N2", "Revenue_USD", (codes == "N2") & view["revenue_raw_c"].isna(), "exact", revenue_raw, view["revenue_usd"], evidence_q),
        ("N4", "Revenue_USD", codes == "N4", "exact", revenue_raw, view["revenue_usd"], evidence_k),
        ("N7", "Revenue_USD", codes == "N7", "exact", revenue_raw, view["revenue_usd"], evidence_k),
        ("N8", "Revenue_USD", codes == "N8", "exact", revenue_raw, view["revenue_usd"], evidence_k),
        ("N10", "Revenue_USD", codes == "N10", "exact", revenue_raw, view["revenue_usd"], evidence_q),
        ("N13", "Revenue_USD", codes == "N13", "exact", revenue_raw, view["revenue_usd"], evidence_q),
    ]
    raw_text = {"Units_Sold": "units_txt", "Unit_Price_USD": "price_txt", "Revenue_USD": "revenue_txt"}
    parts = []
    for rule, column, mask, method, before, after, evidence in entries:
        rows = view[mask]
        parts.append(
            fix_entries(
                rows,
                file=FILE,
                step=6,
                rule=rule,
                column=column,
                method=method,
                raw_value=rows[raw_text[column]],
                before=before[mask],
                after=after[mask],
                evidence=evidence[mask],
            )
        )
    return pd.concat(parts, ignore_index=True)

