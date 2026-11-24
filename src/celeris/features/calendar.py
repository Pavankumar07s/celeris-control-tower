"""Calendar features and moving-holiday day counts over the whole modelling calendar 2019-01 .. 2028-05 (dossier 4.5,
4.6, 5.7, 6.2).

The modelling calendar has ``N_CALENDAR`` = 113 months: the 94 training months and the 19 forecast months. Every
feature here is known in advance (the events calendar lists the holidays of the forecast window), so it is computed
once for all origins.

Moving holidays act through the days they cover in each month, not through a calendar month (dossier 4.6, EC.v): Lunar
New Year in Asia Pacific (10-day windows; 2028 splits 6 days in January, 4 in February) and Ramadan in the Middle
East & Africa (30-day windows moving about 11 days earlier every year: 21 days in 2027-02, 9 in 2027-03, 4 in 2028-01,
26 in 2028-02). The day counts are derived from the day-precision rows of ``events_clean.csv``.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from celeris.anomalies.events import holiday_days, is_lny, is_ramadan
from celeris.cleaning.dates import month_label
from celeris.config import LAST_TRAIN_MONTH_IDX

N_CALENDAR = 113  # 2019-01 .. 2028-05
FORECAST_FIRST_IDX = LAST_TRAIN_MONTH_IDX + 1  # 2026-11
FORECAST_LAST_IDX = N_CALENDAR - 1  # 2028-05
HORIZON = 19
LNY_REGION = "Asia Pacific"
RAMADAN_REGION = "Middle East & Africa"
LNY_WINDOW_DAYS = 10
RAMADAN_WINDOW_DAYS = 30
CALENDAR_COLUMNS = (
    "month_idx",
    "date",
    "year",
    "month",
    "quarter",
    "days_in_month",
    "is_december",
    "is_january",
    "lny_days_apac",
    "ramadan_days_mea",
    "is_forecast_window",
)


def month_index(label: str) -> int:
    """Month index (months since 2019-01) of a ``YYYY-MM`` label."""
    return (int(label[:4]) - 2019) * 12 + int(label[5:7]) - 1


def holiday_day_counts(events: pd.DataFrame) -> pd.DataFrame:
    """Days of Lunar New Year (APAC) and Ramadan (MEA) in every calendar month (index ``month_idx`` 0..112)."""
    out = pd.DataFrame(0, index=pd.Index(np.arange(N_CALENDAR), name="month_idx"), columns=["lny_days_apac", "ramadan_days_mea"])
    for _, event in events[events["event_type"] == "Holiday"].iterrows():
        if is_lny(event):
            column = "lny_days_apac"
        elif is_ramadan(event):
            column = "ramadan_days_mea"
        else:
            continue
        for month, days in holiday_days(event).items():
            if 0 <= month < N_CALENDAR:
                out.loc[month, column] += days
    return out


def calendar_frame(events: pd.DataFrame) -> pd.DataFrame:
    """One row per calendar month 2019-01 .. 2028-05 with the calendar and holiday features."""
    months = np.arange(N_CALENDAR)
    dates = pd.PeriodIndex([month_label(int(m)) for m in months], freq="M")
    frame = pd.DataFrame(
        {
            "month_idx": months,
            "date": [month_label(int(m)) for m in months],
            "year": 2019 + months // 12,
            "month": months % 12 + 1,
            "quarter": (months % 12) // 3 + 1,
            "days_in_month": dates.days_in_month.astype("int64"),
            "is_december": months % 12 == 11,
            "is_january": months % 12 == 0,
        }
    )
    holidays = holiday_day_counts(events)
    frame["lny_days_apac"] = holidays["lny_days_apac"].to_numpy()
    frame["ramadan_days_mea"] = holidays["ramadan_days_mea"].to_numpy()
    frame["is_forecast_window"] = months >= FORECAST_FIRST_IDX
    return frame.loc[:, list(CALENDAR_COLUMNS)]


def holiday_share(days: np.ndarray, window: int, form: str = "linear") -> np.ndarray:
    """Exposure of a month to a moving holiday: ``days / window`` (linear) or its square root (dossier 9.1 #4)."""
    share = np.asarray(days, dtype=float) / window
    if form == "linear":
        return share
    if form == "sqrt":
        return np.sqrt(share)
    raise ValueError(f"unknown holiday form {form!r}")
