"""Hide-and-recover tests of the demand stage's estimators on the real data (methods-cleaning-anomaly 6.4, T8).

- S5: hide listed semiconductor months from the stock-out file; their imputed demand must recover Requested_Units with
  the dossier's accuracy (SU: WAPE 5.3 %, bias -0.2 %).
- Fill: hide observed on-phase orders as missing rows; the cycle-aware fill must recover them with the dossier's
  accuracy (PZ: WAPE 0.257-0.259, bias -1.9 to -3.2 %) and the cycles must not move.
- Cycles: hide a third of the months of mature series; their pattern must be re-detected.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from celeris.demand.cycles import fit_cycles, order_indicator
from celeris.demand.stage import load_history
from celeris.demand.state import History, demand_state
from celeris.demand.unconstrained import METHODS


@pytest.fixture(scope="module")
def history(pipeline_run) -> History:
    return load_history(pipeline_run.paths)[0]


@pytest.fixture(scope="module")
def full_state(history: History):
    return demand_state(history)


def test_semiconductor_imputer_recovers_hidden_listed_months(history: History) -> None:
    rng = np.random.default_rng(11)
    semi = history.stockouts["reason_class"] == "semiconductor"
    hidden = semi & (rng.random(len(history.stockouts)) < 0.2)
    state = demand_state(History(history.cells, history.stockouts[~hidden], history.series))
    rows = history.stockouts[hidden]
    estimate = state.unconstrained.demand[rows["series_no"].to_numpy(dtype=int), rows["month_idx"].to_numpy(dtype=int)]
    actual = rows["requested_units"].to_numpy(dtype=float)
    wape = np.abs(estimate - actual).sum() / actual.sum()
    bias = (estimate - actual).sum() / actual.sum()
    assert 0.03 <= wape <= 0.07 and abs(bias) <= 0.02, (wape, bias)


def test_fill_recovers_hidden_onphase_orders(history: History, full_state) -> None:
    p, u = full_state.panel, full_state.unconstrained
    names = np.asarray(METHODS)[u.method]
    ela_window = p.semiconductor_cell
    eligible = p.life & full_state.cycles.on_phase & (names == "shipped") & (u.demand > 0) & ~ela_window & (p.age >= 12)
    i, t = np.nonzero(eligible)
    pick = np.random.default_rng(5).choice(len(i), size=2000, replace=False)
    hide = pd.DataFrame({"series_no": i[pick], "month_idx": t[pick], "hidden": True})
    cells = history.cells.merge(hide, on=["series_no", "month_idx"], how="left")
    mask = cells.pop("hidden").fillna(False).astype(bool).to_numpy()
    cells.loc[mask, "units_sold"] = pd.NA
    cells.loc[mask, ["row_status", "numeric_state"]] = ["missing_row", None]
    state = demand_state(History(cells, history.stockouts, history.series))
    truth = u.demand[i[pick], t[pick]]
    filled = state.filled.demand_filled[i[pick], t[pick]]
    wape = np.abs(filled - truth).sum() / truth.sum()
    bias = (filled - truth).sum() / truth.sum()
    assert 0.20 <= wape <= 0.32 and abs(bias) <= 0.06, (wape, bias)
    assert (state.cycles.series["cycle_pattern"] == full_state.cycles.series["cycle_pattern"]).mean() >= 0.998


def test_hidden_months_do_not_change_the_detected_cycle(full_state) -> None:
    p = full_state.panel
    o = order_indicator(full_state.unconstrained.demand, p.positive_unknown, p.life)
    rng = np.random.default_rng(3)
    mature = np.flatnonzero((p.start == 0) & ~full_state.cycles.series["is_lost_account"].to_numpy())
    chosen = rng.choice(mature, size=400, replace=False)
    hidden = o.copy()
    holes = (rng.random(o.shape) < 1 / 3) & np.isin(np.arange(p.n_series), chosen)[:, None] & (o >= 0)
    hidden[holes] = -1
    refit = fit_cycles(hidden, p)
    before = full_state.cycles.series["cycle_pattern"].to_numpy()[chosen]
    after = refit.series["cycle_pattern"].to_numpy()[chosen]
    assert (before == after).mean() >= 0.99
