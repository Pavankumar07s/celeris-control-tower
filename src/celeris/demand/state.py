"""The demand state of the history as of an origin month: one pure function for the pipeline and the backtest.

``demand_state(history, as_of)`` rebuilds, from data up to ``as_of`` only (``celeris.demand.panel``):

1. the semiconductor depth x severity model (listed rows up to ``as_of``);
2. the supply pass of the unconstrained-demand rules (S1, S5, S2, D2);
3. the ordering cycles on ``o_t = 1[demand > 0]`` (patterns, changes, lost accounts, posteriors);
4. the cycle pass (D3, D1, spill, suspects), iterated with step 3 until the regimes are stable;
5. the missing-cell treatment, the cycle-aware fill, customer history, switches and the lost-account table.

At ``as_of = 93`` (2026-10) this is the pipeline's output; at an earlier origin it is what a forecaster would have
known then (dossier 6.7: refit cycle, phase, lost-account flags, switch state and fills per fold). Nothing after
``as_of`` is read, which ``tests/test_demand_asof.py`` checks by altering later data.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from celeris.config import LAST_TRAIN_MONTH_IDX
from celeris.demand import accounts
from celeris.demand.cycles import KIND_OF, CycleFit, fit_cycles, order_indicator, project_cycle
from celeris.demand.fill import Filled, fill_demand, lost_tail, treat_missing
from celeris.demand.panel import Panel, build_panel
from celeris.demand.semiconductor import SemiconductorModel, fit_semiconductor
from celeris.demand.unconstrained import Unconstrained, cycle_pass, supply_pass

MAX_CYCLE_ITERATIONS = 4


@dataclass(frozen=True)
class History:
    """Inputs of the demand state: overlaid grid cells, cleaned stock-outs (with ``series_no``) and the series table."""

    cells: pd.DataFrame
    stockouts: pd.DataFrame
    series: pd.DataFrame


@dataclass(frozen=True)
class DemandState:
    """Everything the demand stage derives from the history as of one month."""

    as_of: int
    panel: Panel
    semiconductor: SemiconductorModel
    supply: Unconstrained
    unconstrained: Unconstrained
    cycles: CycleFit
    filled: Filled
    lost_tail: np.ndarray
    customer_history: pd.DataFrame
    switches: pd.DataFrame
    lost_accounts: pd.DataFrame
    cycle_iterations: int

    def project(self, months: np.ndarray, series_no: np.ndarray | None = None) -> pd.DataFrame:
        """``project_cycle`` for this state (future on-phase mask, ``p_order``, accumulation span and weights)."""
        return project_cycle(self.cycles, self.panel, months, series_no)


def demand_state(history: History, as_of: int = LAST_TRAIN_MONTH_IDX) -> DemandState:
    """Build the demand state from data up to ``as_of`` (see module docstring)."""
    panel = build_panel(history.cells, history.stockouts, history.series, as_of)
    semi_rows = history.stockouts[(history.stockouts["month_idx"] <= as_of) & (history.stockouts["reason_class"] == "semiconductor")]
    semi = fit_semiconductor(semi_rows)
    supply = supply_pass(panel, semi)
    fit = fit_cycles(order_indicator(supply.demand, panel.positive_unknown, panel.life), panel)
    iterations = 0
    while True:
        iterations += 1
        periodic = np.isin(KIND_OF[np.clip(fit.regime, 0, None)], ["B", "Q", "T"]) & (fit.regime >= 0)
        resolved = cycle_pass(panel, supply, fit.on_phase, periodic)
        refit = fit_cycles(order_indicator(resolved.demand, panel.positive_unknown, panel.life), panel)
        stable = bool((refit.regime == fit.regime).all())
        fit = refit
        if stable:
            break
        if iterations >= MAX_CYCLE_ITERATIONS:
            raise AssertionError("ordering-cycle regimes did not stabilise")
    final = treat_missing(resolved, fit, panel)
    filled = fill_demand(final, fit, panel)
    history_runs = accounts.customer_history(history.cells, as_of)
    switches = accounts.customer_switches(history_runs, filled.demand_filled, panel)
    lost = accounts.lost_account_table(fit, filled.demand_filled, panel)
    return DemandState(
        as_of=as_of,
        panel=panel,
        semiconductor=semi,
        supply=supply,
        unconstrained=final,
        cycles=fit,
        filled=filled,
        lost_tail=lost_tail(fit, panel),
        customer_history=history_runs,
        switches=switches,
        lost_accounts=lost,
        cycle_iterations=iterations,
    )
