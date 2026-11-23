"""``events_calendar.csv``: tidy event table (dossier 2.6).

The calendar is formally clean (68 events; every scope value canonical), so cleaning only makes it tidy:

- ``YYYY-MM`` dates have month precision and cover the whole month; ``YYYY-MM-DD`` dates are exact days. A blank
  End_Date is open-ended (EV-052) and is treated as active through the end of the forecast window.
- ``Customer | Region`` scopes are split into customer and region; every scope value is validated against the
  vocabularies (regions, channels, customers, families) and an unknown value raises.
- ``announced_pct`` is the percentage stated in price-change and announcement descriptions.

Whether an event affects demand (5 decoys do not; EV-019 and EV-033 act on supply and data) is decided by the anomaly
stage, not here.
"""

from __future__ import annotations

import calendar

import pandas as pd

from celeris.cleaning.keys import Vocabularies
from celeris.config import FORECAST_FIRST_MONTH, FORECAST_LAST_MONTH
from celeris.quality.checks import Check, examples_from, invariant_check

FILE = "events_calendar.csv"
SCOPE_TYPES = ("Global", "Region", "Product_Family", "Channel", "Customer")
CUSTOMER_SEPARATOR = " | "
_MONTH = r"^\d{4}-\d{2}$"
_DAY = r"^\d{4}-\d{2}-\d{2}$"


def _month_end(month: str) -> str:
    year, number = int(month[:4]), int(month[5:7])
    return f"{month}-{calendar.monthrange(year, number)[1]:02d}"


def _precision(text: pd.Series) -> pd.Series:
    precision = pd.Series("invalid", index=text.index, dtype="str")
    precision[text.str.fullmatch(_MONTH)] = "month"
    precision[text.str.fullmatch(_DAY)] = "day"
    precision[text == ""] = "open"
    return precision


def clean_events(raw: pd.DataFrame, vocab: Vocabularies, families: set[str]) -> pd.DataFrame:
    """Tidy event table, one row per event, ordered by Event_ID."""
    if raw["Event_ID"].duplicated().any():
        raise AssertionError("duplicate Event_ID")
    start_precision = _precision(raw["Start_Date"])
    end_precision = _precision(raw["End_Date"])
    if (start_precision.isin(["invalid", "open"])).any() or (end_precision == "invalid").any():
        raise AssertionError("malformed event date")
    if not raw["Scope_Type"].isin(SCOPE_TYPES).all():
        raise AssertionError("unknown Scope_Type")
    out = pd.DataFrame(
        {
            "event_id": raw["Event_ID"],
            "event_type": raw["Event_Type"],
            "scope_type": raw["Scope_Type"],
            "scope_value": raw["Scope_Value"],
            "description": raw["Description"],
            "start_precision": start_precision,
            "end_precision": end_precision,
        }
    )
    out["start_day"] = raw["Start_Date"].where(start_precision == "day", raw["Start_Date"] + "-01").astype("str")
    end_month_end = raw["End_Date"].map(lambda m: _month_end(m) if len(m) == 7 else m)
    out["end_day"] = end_month_end.where(end_precision != "open").astype("str")
    out["open_ended"] = end_precision == "open"
    out["start_month"] = out["start_day"].str[:7]
    out["end_month"] = out["end_day"].str[:7].where(~out["open_ended"], FORECAST_LAST_MONTH).astype("str")
    days = pd.to_datetime(out["end_day"]) - pd.to_datetime(out["start_day"])
    out["n_days"] = (days.dt.days + 1).astype("Int64")
    if (out["n_days"] < 1).any():
        raise AssertionError("event ends before it starts")
    scope = _split_scope(raw, vocab, families)
    out = pd.concat([out, scope], axis=1)
    out["in_forecast_window"] = (out["start_month"] <= FORECAST_LAST_MONTH) & (out["end_month"] >= FORECAST_FIRST_MONTH)
    out["after_forecast_window"] = out["start_month"] > FORECAST_LAST_MONTH
    pct = raw["Description"].str.extract(r"(\d+(?:\.\d+)?)%", expand=False)
    out["announced_pct"] = pd.to_numeric(pct.where(raw["Event_Type"].isin(["Price Change", "Announcement"])))
    columns = ["event_id", "event_type", "scope_type", "scope_value", "scope_region", "scope_customer", "scope_family",
               "scope_channel", "start_day", "end_day", "start_month", "end_month", "start_precision", "end_precision",
               "open_ended", "n_days", "in_forecast_window", "after_forecast_window", "announced_pct", "description"]
    return out.loc[:, columns].sort_values("event_id", kind="stable").reset_index(drop=True)


def _split_scope(raw: pd.DataFrame, vocab: Vocabularies, families: set[str]) -> pd.DataFrame:
    """Scope columns per event; raises on a scope value outside the vocabularies."""
    rows = []
    for scope_type, value in zip(raw["Scope_Type"], raw["Scope_Value"], strict=True):
        region = customer = family = channel = None
        if scope_type == "Global":
            valid = value == "All"
        elif scope_type == "Region":
            region, valid = value, value in vocab.regions
        elif scope_type == "Product_Family":
            family, valid = value, value in families
        elif scope_type == "Channel":
            channel, valid = value, value in vocab.channels
        else:
            customer, _, region = value.partition(CUSTOMER_SEPARATOR)
            valid = customer in vocab.customers and region in vocab.regions
        if not valid:
            raise AssertionError(f"scope value {value!r} is not canonical for {scope_type}")
        rows.append((region, customer, family, channel))
    return pd.DataFrame(rows, columns=["scope_region", "scope_customer", "scope_family", "scope_channel"], index=raw.index)


def event_checks(raw: pd.DataFrame, events: pd.DataFrame) -> list[Check]:
    """Format and scope validity, window coverage and holiday-window lengths."""
    precision = events["start_precision"].value_counts()
    holidays = events[events["description"].isin(["Lunar New Year holiday period", "Ramadan"])]
    expected_days = holidays["description"].map({"Lunar New Year holiday period": 10, "Ramadan": 30})
    return [
        invariant_check(
            check_id="EVT-FORMAT",
            file=FILE,
            rule="2.6",
            title="Event dates parse",
            description=(
                "YYYY-MM = whole month, YYYY-MM-DD = exact day, blank End_Date = open-ended (active through the forecast "
                "window). Scope types: " + ", ".join(f"{k} {v}" for k, v in events["scope_type"].value_counts().items()) + "."
            ),
            dimension="conformity",
            unit="rows",
            checked=len(raw),
            violations_before=0,
            violations_after=0,
            action="tidy start/end day and month",
            expected_key="events.rows",
            breakdown={"start_month_precision": int(precision.get("month", 0)),
                       "start_day_precision": int(precision.get("day", 0)),
                       "open_ended": int(events["open_ended"].sum())},
            breakdown_expected_prefix="events",
        ),
        invariant_check(
            check_id="EVT-SCOPE",
            file=FILE,
            rule="2.6",
            title="Scope values are canonical",
            description="Regions, channels, families and the three 'Customer | Region' pairs all exist in the vocabularies.",
            dimension="validity",
            unit="rows",
            checked=len(events),
            violations_before=0,
            violations_after=0,
            action="split 'Customer | Region'; unknown values raise",
            examples=examples_from(events[events["scope_type"] == "Customer"], ["event_id", "scope_customer", "scope_region"]),
        ),
        invariant_check(
            check_id="EVT-HOLIDAY-LENGTH",
            file=FILE,
            rule="2.6",
            title="Holiday windows have their documented length",
            description="Lunar New Year windows last 10 days and Ramadan windows 30 days, at the real dates.",
            dimension="validity",
            unit="rows",
            checked=len(holidays),
            violations_before=int((holidays["n_days"] != expected_days).sum()),
            violations_after=int((holidays["n_days"] != expected_days).sum()),
            action="day counts per month are derived from these windows by the features stage",
        ),
        invariant_check(
            check_id="EVT-FORECAST-WINDOW",
            file=FILE,
            rule="2.6",
            title="Events touching the forecast window",
            description=f"Events overlapping {FORECAST_FIRST_MONTH}..{FORECAST_LAST_MONTH} (EV-052 open-ended included).",
            dimension="validity",
            unit="rows",
            checked=int(events["in_forecast_window"].sum()),
            violations_before=0,
            violations_after=0,
            action="in_forecast_window flag",
            severity="info",
            expected_key="events.in_forecast_window",
            examples=examples_from(events[events["in_forecast_window"]], ["event_id", "start_month", "end_month", "description"]),
        ),
    ]
