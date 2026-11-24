"""Everything the models know at one forecast origin (dossier 6.1, 6.7).

``origin_context(inputs, as_of)`` rebuilds, from data up to ``as_of`` only, the demand state (unconstrained demand,
cycles, lost accounts, switches, fills; ``celeris.demand.state``), the one-off orders (``detect_one_offs``) and the
event tags and training masks (``celeris.anomalies.masks``). Reference data known in advance is shared by all origins:
the product master, the Record_ID blocks (planned sales windows), the events calendar, the macro indicators of every
month (given for the forecast window in the real task) and the test grid.

Cells used by the models:

- ``fit_cells``: on-phase cells inside the life with a known unconstrained target, no ``train_mask`` reason and not
  in a lost-account tail; weighted by ``train_weight`` (0.7 imputed semiconductor cells, 0.5 suspected hidden
  stock-outs);
- ``level_cells``: ``fit_cells`` without a ``level_mask`` reason (semiconductor window, EOL phase-out, pre-switch).
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from celeris.anomalies.events import customer_matrix, event_windows
from celeris.anomalies.expectation import OneOffs, detect_one_offs
from celeris.anomalies.masks import Masks, build_masks
from celeris.config import Paths
from celeris.demand.stage import load_history, read_clean_csv
from celeris.demand.state import DemandState, History, demand_state


@dataclass(frozen=True)
class ModelInputs:
    """Data shared by every origin: the history (read once), master, events, macro, test grid and price table."""

    history: History
    master: pd.DataFrame
    events: pd.DataFrame
    macro: pd.DataFrame
    test_grid: pd.DataFrame
    prices: pd.DataFrame


def load_model_inputs(paths: Paths) -> ModelInputs:
    """Read the clean-stage and demand-stage outputs the models need."""
    history, master, _ = load_history(paths)
    return ModelInputs(
        history=history,
        master=master,
        events=read_clean_csv(paths, "events_clean.csv"),
        macro=read_clean_csv(paths, "macro_clean.csv"),
        test_grid=pd.read_parquet(paths.clean_dir / "test_grid.parquet"),
        prices=read_clean_csv(paths, "price_table.csv"),
    )


@dataclass(frozen=True)
class OriginContext:
    """The demand state, one-offs, masks and model cell sets as of one origin month."""

    as_of: int
    state: DemandState
    one_offs: OneOffs
    masks: Masks
    customers: np.ndarray  # (S, 94) customer in force per cell (None outside the life)

    @property
    def demand(self) -> np.ndarray:
        return self.state.unconstrained.demand

    @property
    def fit_cells(self) -> np.ndarray:
        p = self.state.panel
        return (
            p.life
            & self.state.cycles.on_phase
            & ~np.isnan(self.demand)
            & pd.isna(self.masks.train_mask)
            & ~self.state.lost_tail
            & (self.masks.train_weight > 0)
        )

    @property
    def level_cells(self) -> np.ndarray:
        return self.fit_cells & pd.isna(self.masks.level_mask)

    @property
    def weight(self) -> np.ndarray:
        return self.masks.train_weight

    def customer_at_origin(self) -> np.ndarray:
        """Customer of each series in the origin month (last known customer; None if the series has not started)."""
        out = np.full(self.state.panel.n_series, None, dtype=object)
        runs = self.state.customer_history.sort_values(["series_no", "run"]).groupby("series_no").last()
        out[runs.index.to_numpy()] = runs["customer"].to_numpy()
        return out


def origin_context(inputs: ModelInputs, as_of: int) -> OriginContext:
    """Demand state, one-offs and masks from data up to ``as_of`` (see module docstring)."""
    state = demand_state(inputs.history, as_of)
    one_offs = detect_one_offs(state)
    customers = customer_matrix(state)
    windows = event_windows(inputs.events, state, customers).windows
    masks = build_masks(state, windows, one_offs.flags)
    return OriginContext(as_of=as_of, state=state, one_offs=one_offs, masks=masks, customers=customers)
