"""Calendar events on the cell grid: scopes, the event windows used for tags and masks, and measured effects
(dossier 2.6, 3, 6.1; EC, EC.v, DG.v).

Scopes come from ``events_clean.csv``; customer-scoped events are joined on the customer at the time (EV-038 Nexon |
Europe covered 46 series in 2023-10; the latest customer would give the wrong set). Four forensic refinements of the
listed scopes are encoded here, each established in the dossier:

- COVID (EV-009..013): masked from the first listed lockdown month through ``COVID_LAST_MONTH`` (global trough in
  2020-07, recovery by 2020-10; dossier 3, 6.1);
- pre-buy before the announced 9 % rise (EV-030, announced 2022-11): Tier-1 + Aftermarket in the
  ``PREBUY_MONTHS`` months after the announcement month (Dec x1.41, Jan x0.69, Feb x0.84; dossier 3, 4.16);
- Red Sea (EV-039, listed for all Export): the data show the effect only on Export x ``RED_SEA_REGIONS`` (dossier 2.6);
- holidays: Lunar New Year (APAC) and Ramadan (MEA) act through the days they cover in each month (dossier 4.6).

The measured effect of an event is a difference in differences on cleaned demand (one-offs replaced by their
expectation): for each event month, scope demand over the mean of the same calendar month in the other years
(2020 excluded), divided by the same ratio of a control (the rest of the region for customer events, other regions,
families or channels otherwise; for global events the neighbouring months of the scope itself). Each series is
compared with its own mature months only, so launches and the MEA opening do not distort the ratio.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

import numpy as np
import pandas as pd

from celeris.cleaning.dates import month_label
from celeris.config import MEA_REGION
from celeris.demand.panel import N_MONTHS
from celeris.demand.state import DemandState

COVID_LAST_MONTH = 20  # 2020-09
PREBUY_CHANNELS = ("Tier-1 Distributor", "Aftermarket")
PREBUY_MONTHS = 3
RED_SEA_REGIONS = ("Europe", MEA_REGION)
COVID_YEAR = (12, 23)  # 2020 is never a comparison year
MIN_SERIES = 10
MIN_COMPARISONS = 2
RAMP_MONTHS = 12
NEIGHBOUR_MONTHS = (-3, -2, 2, 3)


def month_idx(label: str) -> int:
    return (int(label[:4]) - 2019) * 12 + int(label[5:7]) - 1


def customer_matrix(state: DemandState) -> np.ndarray:
    """(S, T) customer in force per cell: run 1 from the series start, each later run from its first record."""
    p = state.panel
    out = np.full(p.life.shape, None, dtype=object)
    for row in state.customer_history.itertuples(index=False):
        start = p.start[row.series_no] if row.run == 1 else row.first_idx
        out[row.series_no, start:] = row.customer
    out[~p.life] = None
    return out


def event_months(event: pd.Series, as_of: int) -> np.ndarray:
    """History months covered by an event (clipped to the training window and ``as_of``)."""
    first, last = month_idx(event["start_month"]), month_idx(event["end_month"])
    return np.arange(max(first, 0), min(last, as_of) + 1)


def scope_series(event: pd.Series, state: DemandState, customers: np.ndarray, month: int) -> np.ndarray:
    """Series inside the listed scope of an event in one month (customer at that month for customer events)."""
    series = state.panel.series
    kind = event["scope_type"]
    if kind == "Global":
        return np.ones(len(series), dtype=bool)
    if kind == "Region":
        return (series["region"] == event["scope_region"]).to_numpy()
    if kind == "Product_Family":
        return (series["product_family"] == event["scope_family"]).to_numpy()
    if kind == "Channel":
        return (series["sales_channel"] == event["scope_channel"]).to_numpy()
    if kind == "Customer":
        return (series["region"] == event["scope_region"]).to_numpy() & (customers[:, month] == event["scope_customer"])
    raise ValueError(f"unknown scope type {kind!r}")


def control_series(event: pd.Series, state: DemandState, scope: np.ndarray) -> np.ndarray | None:
    """Control group of an event: the rest of the region for customer events, the complement otherwise; None if global."""
    series = state.panel.series
    if event["scope_type"] == "Global":
        return None
    if event["scope_type"] == "Customer":
        return (series["region"] == event["scope_region"]).to_numpy() & ~scope
    return ~scope


@dataclass(frozen=True)
class Effect:
    """Measured multiplier of an event and the units it moved (actual minus counterfactual)."""

    multiplier: float
    by_month: dict[str, float]
    impact_units: float
    n_series: int


def cleaned_demand(state: DemandState, expected: np.ndarray, one_off: np.ndarray) -> np.ndarray:
    """``demand_filled`` with one-off orders replaced by their expectation (the base for measured effects)."""
    return np.where(one_off, expected, state.filled.demand_filled)


def _comparison_months(month: int, as_of: int) -> np.ndarray:
    other = np.arange(month % 12, as_of + 1, 12)
    return other[(other != month) & ~((other >= COVID_YEAR[0]) & (other <= COVID_YEAR[1]))]


def _yoy_ratio(demand: np.ndarray, state: DemandState, members: np.ndarray, month: int, others: np.ndarray) -> tuple[float, float, int]:
    """(actual, ratio to the comparison base, series used) for the member series present in ``month``.

    Each series' base is its mean over the comparison months where it is present and past its first
    ``RAMP_MONTHS`` months (at least ``MIN_COMPARISONS`` of them), so a series launched later or the MEA cohort
    (opened 2022-01) compares only with its own mature years.
    """
    life = state.panel.life
    if not len(others):
        return float("nan"), float("nan"), 0
    usable = life[:, others] & (state.panel.age[:, others] >= RAMP_MONTHS)
    count = usable.sum(axis=1)
    present = members & life[:, month] & (count >= MIN_COMPARISONS)
    if present.sum() < MIN_SERIES:
        return float("nan"), float("nan"), int(present.sum())
    base = np.where(usable, np.nan_to_num(demand[:, others]), 0.0).sum(axis=1) / np.maximum(count, 1)
    actual = float(np.nansum(demand[present, month]))
    total = float(base[present].sum())
    return actual, actual / total if total > 0 else float("nan"), int(present.sum())


def measure_effect(
    demand: np.ndarray,
    state: DemandState,
    months: np.ndarray,
    scope_at: Callable[[int], np.ndarray],
    control_at: Callable[[int, np.ndarray], np.ndarray] | None,
) -> Effect:
    """Difference-in-differences multiplier of an event over ``months`` (see module docstring)."""
    actual_total = counterfactual_total = 0.0
    by_month: dict[str, float] = {}
    used = 0
    for month in months:
        others = _comparison_months(int(month), state.as_of)
        scope = scope_at(int(month))
        actual, treated, n = _yoy_ratio(demand, state, scope, int(month), others)
        if control_at is None:
            reference = [
                _yoy_ratio(demand, state, scope, int(month + k), _comparison_months(int(month + k), state.as_of))[1]
                for k in NEIGHBOUR_MONTHS
                if 0 <= month + k <= state.as_of and month + k not in months
            ]
            control = float(np.nanmean(reference)) if np.isfinite(reference).any() else float("nan")
        else:
            control = _yoy_ratio(demand, state, control_at(int(month), scope), int(month), others)[1]
        effect = treated / control if np.isfinite(treated) and np.isfinite(control) and control > 0 else float("nan")
        if np.isfinite(effect) and effect > 0:
            by_month[month_label(int(month))] = round(effect, 3)
            actual_total += actual
            counterfactual_total += actual / effect
            used = max(used, n)
    multiplier = actual_total / counterfactual_total if counterfactual_total > 0 else float("nan")
    return Effect(multiplier, by_month, actual_total - counterfactual_total, used)


def holiday_days(event: pd.Series) -> dict[int, int]:
    """Days of a day-precision holiday in each month index it touches."""
    if event["start_precision"] != "day":
        return {}
    days = pd.date_range(event["start_day"], event["end_day"], freq="D")
    counts = pd.Series(1, index=days).groupby([days.year, days.month]).sum()
    return {(year - 2019) * 12 + month - 1: int(n) for (year, month), n in counts.items()}


def is_lny(event: pd.Series) -> bool:
    return event["event_type"] == "Holiday" and "Lunar New Year" in event["description"]


def is_ramadan(event: pd.Series) -> bool:
    return event["event_type"] == "Holiday" and "Ramadan" in event["description"]


@dataclass(frozen=True)
class EventWindows:
    """(S, T) boolean windows of the events that drive tags and training masks."""

    windows: dict[str, np.ndarray]


def event_windows(events: pd.DataFrame, state: DemandState, customers: np.ndarray) -> EventWindows:
    """Cell windows of the events named in dossier 6.1 plus holiday and programme tags."""
    p = state.panel
    shape = p.life.shape
    series = p.series
    months = np.arange(N_MONTHS)[None, :]

    def window(first: int, last: int, members: np.ndarray) -> np.ndarray:
        return members[:, None] & (months >= first) & (months <= last) & p.life

    by_id = events.set_index("event_id")
    covid = events[(events["event_type"] == "Disruption") & events["description"].str.contains("COVID")]
    announcement = events[events["event_type"] == "Announcement"]
    out: dict[str, np.ndarray] = {}
    out["covid_2020"] = window(min(month_idx(m) for m in covid["start_month"]), COVID_LAST_MONTH, np.ones(len(series), dtype=bool))
    prebuy = np.zeros(shape, dtype=bool)
    for _, row in announcement.iterrows():
        first = month_idx(row["start_month"]) + 1
        prebuy |= window(first, first + PREBUY_MONTHS - 1, series["sales_channel"].isin(PREBUY_CHANNELS).to_numpy())
    out["prebuy_price_rise"] = prebuy
    out["strike"] = np.zeros(shape, dtype=bool)
    out["customer_programme_step"] = np.zeros(shape, dtype=bool)
    for _, row in events[events["event_type"] == "Customer Event"].iterrows():
        first, last = month_idx(row["start_month"]), month_idx(row["end_month"])
        cells = window(first, last, (series["region"] == row["scope_region"]).to_numpy()) & (customers == row["scope_customer"])
        key = "customer_programme_step" if row["open_ended"] else "strike"
        out[key] |= cells
    logistics = events[events["event_type"] == "Logistics"]
    out["red_sea_export"] = np.zeros(shape, dtype=bool)
    for _, row in logistics.iterrows():
        members = (series["sales_channel"] == row["scope_channel"]).to_numpy() & series["region"].isin(RED_SEA_REGIONS).to_numpy()
        out["red_sea_export"] |= window(month_idx(row["start_month"]), month_idx(row["end_month"]), members)
    supply = by_id[by_id["event_type"] == "Supply Constraint"]
    out["semiconductor_window"] = np.zeros(shape, dtype=bool)
    for _, row in supply.iterrows():
        out["semiconductor_window"] |= window(month_idx(row["start_month"]), month_idx(row["end_month"]), (series["product_family"] == row["scope_family"]).to_numpy())
    system = events[(events["event_type"] == "System") & (events["scope_type"] == "Region")]
    out["erp_migration"] = np.zeros(shape, dtype=bool)
    for _, row in system.iterrows():
        out["erp_migration"] |= window(month_idx(row["start_month"]), month_idx(row["end_month"]), (series["region"] == row["scope_region"]).to_numpy())
    out["lunar_new_year"] = np.zeros(shape, dtype=bool)
    out["ramadan"] = np.zeros(shape, dtype=bool)
    out["summer_shutdown"] = np.zeros(shape, dtype=bool)
    for _, row in events[events["event_type"] == "Holiday"].iterrows():
        region = (series["region"] == row["scope_region"]).to_numpy()
        if is_lny(row) or is_ramadan(row):
            key = "lunar_new_year" if is_lny(row) else "ramadan"
            for month in holiday_days(row):
                if month < N_MONTHS:
                    out[key] |= window(month, month, region)
        else:
            out["summer_shutdown"] |= window(month_idx(row["start_month"]), month_idx(row["end_month"]), region)
    return EventWindows(out)
