"""As-of state of the demand stage (dossier 6.7): a state computed at an earlier origin must not change when data
after that origin are altered, and its account flags must follow the history up to the origin."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from celeris.demand.stage import load_history
from celeris.demand.state import History, demand_state

ORIGIN = 69  # 2024-10, the October-aligned backtest origin B


@pytest.fixture(scope="module")
def history(pipeline_run) -> History:
    return load_history(pipeline_run.paths)[0]


def _altered(history: History, origin: int) -> History:
    """Scramble everything after ``origin``: units, customers, missing rows and the stock-out file."""
    rng = np.random.default_rng(7)
    cells = history.cells.copy()
    late = cells["month_idx"] > origin
    cells.loc[late, "units_sold"] = pd.array(rng.integers(0, 500, int(late.sum())), dtype="Int64")
    cells.loc[late, "customer"] = "Nexon Motor Group"
    drop = late & (rng.random(len(cells)) < 0.05)
    cells.loc[drop, ["row_status", "numeric_state"]] = ["missing_row", None]
    cells.loc[drop, "units_sold"] = pd.NA
    stockouts = history.stockouts[history.stockouts["month_idx"] <= origin]
    extra = history.stockouts[history.stockouts["month_idx"] <= origin].head(50).assign(month_idx=origin + 5)
    extra = extra.drop_duplicates(["series_no", "month_idx"])
    return History(cells, pd.concat([stockouts, extra], ignore_index=True), history.series)


def test_state_at_an_origin_ignores_later_data(history: History) -> None:
    a = demand_state(history, ORIGIN)
    b = demand_state(_altered(history, ORIGIN), ORIGIN)
    for name in ("demand", "backorder_in", "lost_units", "inferred", "suspect"):
        assert np.array_equal(getattr(a.unconstrained, name), getattr(b.unconstrained, name), equal_nan=True), name
    assert np.array_equal(a.unconstrained.method, b.unconstrained.method)
    assert np.array_equal(a.cycles.regime, b.cycles.regime)
    assert np.array_equal(a.cycles.posterior, b.cycles.posterior, equal_nan=True)
    pd.testing.assert_frame_equal(a.cycles.series, b.cycles.series)
    pd.testing.assert_frame_equal(a.lost_accounts, b.lost_accounts)
    pd.testing.assert_frame_equal(a.switches, b.switches)
    pd.testing.assert_frame_equal(a.customer_history, b.customer_history)
    assert np.array_equal(a.filled.demand_filled, b.filled.demand_filled, equal_nan=True)
    pd.testing.assert_series_equal(a.semiconductor.severity, b.semiconductor.severity)
    assert not a.panel.life[:, ORIGIN + 1 :].any()
    projection = a.project(np.arange(ORIGIN + 1, ORIGIN + 20))
    assert len(projection) == a.panel.n_series * 19 and projection["accum_span"].ge(0).all()


def test_account_state_follows_the_history(history: History, pipeline_run) -> None:
    final = pipeline_run.csv("account_events.csv")
    lost_final = final[final["event_type"] == "lost_account"]
    since = {(r.sku_id, r.region): (int(r.month[:4]) - 2019) * 12 + int(r.month[5:]) - 1 for r in lost_final.itertuples()}
    origin = 87  # 2026-04
    state = demand_state(history, origin)
    keys = state.panel.series.set_index("series_no")[["sku_id", "region"]]
    lost_now = {tuple(keys.loc[s]) for s in state.lost_accounts["series_no"]}
    assert lost_now <= set(since)
    assert {key for key, first in since.items() if origin - first + 1 >= 7} <= lost_now
    switches_now = state.switches.merge(keys.reset_index(), on="series_no")
    switches_final = final[final["event_type"] == "customer_switch"]
    assert set(zip(switches_now["sku_id"], switches_now["region"], strict=True)) == set(zip(switches_final["sku_id"], switches_final["region"], strict=True))
    early = demand_state(history, 45)  # 2022-10: before most switches, inside the cycle-change window
    assert len(early.switches) == 4 and early.lost_accounts.empty
