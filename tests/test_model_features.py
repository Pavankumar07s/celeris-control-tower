"""Feature functions (workstream 3; dossier 4.6-4.11, 5.7): moving-holiday day counts in the window, lifecycle
factors, the macro soft cap and standardisation as of an origin, and trailing statistics that never look ahead."""

from __future__ import annotations

import numpy as np
import pytest

from celeris.demand.stage import read_clean_csv
from celeris.features.calendar import FORECAST_FIRST_IDX, N_CALENDAR, holiday_day_counts, month_index
from celeris.features.catalogue import feature_catalogue
from celeris.features.lifecycle import PHASEOUT_FACTORS, lifecycle_matrix, phaseout, ramp
from celeris.features.macro import macro_data, soft_cap
from celeris.features.panel import _trailing


def test_moving_holiday_day_counts(pipeline_run) -> None:
    events = read_clean_csv(pipeline_run.paths, "events_clean.csv")
    days = holiday_day_counts(events)
    assert len(days) == N_CALENDAR
    window = {month: tuple(days.loc[month_index(month)]) for month in ("2027-01", "2027-02", "2027-03", "2028-01", "2028-02", "2028-03")}
    assert window == {"2027-01": (0, 0), "2027-02": (10, 21), "2027-03": (0, 9), "2028-01": (6, 4), "2028-02": (4, 26), "2028-03": (0, 0)}
    assert days.loc[month_index("2025-01"), "lny_days_apac"] == 3 and days.loc[month_index("2025-03"), "ramadan_days_mea"] == 30
    assert (days["lny_days_apac"].groupby(days.index // 12).sum() == 10).all()  # one 10-day window every year


def test_lifecycle_factors() -> None:
    assert ramp(np.array([-1, 0, 4]), 4.6) == pytest.approx([0.0, 1 - np.exp(-1 / 4.6), 1 - np.exp(-5 / 4.6)])
    assert phaseout(np.array([np.nan, 7, 5, 0, -1])) == pytest.approx([1.0, 1.0, PHASEOUT_FACTORS[5], PHASEOUT_FACTORS[0], 0.0])
    r, p = lifecycle_matrix(np.arange(100, 103), np.array([100, 0, 50]), np.array([100, 0, 36]), np.array([np.nan, 101, np.nan]),
                            np.array([True, False, False]), np.array([False, False, True]))
    assert r[0, 0] == pytest.approx(1 - np.exp(-1 / 4.6)) and (r[1] == 1).all() and r[2, 0] == pytest.approx(1 - np.exp(-65 / 6.0))
    assert p[1].tolist() == [PHASEOUT_FACTORS[1], PHASEOUT_FACTORS[0], 0.0]


def test_macro_standardisation_and_soft_cap(pipeline_run) -> None:
    macro = read_clean_csv(pipeline_run.paths, "macro_clean.csv")
    early, late = macro_data(macro, 45), macro_data(macro, 93)
    assert np.allclose(early.z[:46].mean(axis=0), 0.0, atol=1e-9) and np.allclose(late.z[:94].mean(axis=0), 0.0, atol=1e-9)
    changed = macro.copy()
    changed.iloc[60:, 3:11] = changed.iloc[60:, 3:11] * 3.0
    assert np.allclose(macro_data(changed, 45).z[:46], early.z[:46])  # standardisation uses months <= origin only
    assert np.allclose(early.lagged(2)[2:], early.z[:-2])
    u = np.array([-0.5, 0.25, 0.45])
    assert soft_cap(u) == pytest.approx([-0.5, 0.25, 0.35])


def test_trailing_statistics_do_not_look_ahead() -> None:
    values = np.array([[1.0, 2.0, 3.0, np.nan, 5.0, 6.0]])
    mean = _trailing(values, 3, "mean")
    assert np.isnan(mean[0, 0]) and mean[0, 3] == pytest.approx(2.0) and mean[0, 4] == pytest.approx(2.5)
    later = values.copy()
    later[0, 4:] = 100.0
    assert np.array_equal(_trailing(later, 3, "mean")[0, :5], mean[0, :5], equal_nan=True)


def test_feature_catalogue_is_complete() -> None:
    catalogue = feature_catalogue()
    assert {"name", "group", "definition", "source", "used_by"} <= set(catalogue.columns)
    groups = set(catalogue["group"])
    assert {"calendar", "moving holiday", "lags / rolling", "intermittency", "macro lead-lag", "macro", "EV shift", "lifecycle", "events", "level"} <= groups
    assert catalogue["name"].is_unique and catalogue["definition"].str.len().min() >= 15
    assert FORECAST_FIRST_IDX == 94
