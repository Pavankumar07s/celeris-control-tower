"""Event tags, training masks and sample weights per cell (dossier 6.1, 3; train_clean contract).

- ``event_tags``: every tag of the cell, ``|``-joined in a fixed order (null if none): calendar events, supply and data
  states, lifecycle phases, account events and one-offs. Tags describe; they do not decide.
- ``train_mask``: the reason a cell is excluded from model fitting (null if used), first match in this order: unknown
  target (on-phase missing row, ERP blank, D3 hidden second month), lost-account tail, one-off order, COVID 2020-02..09,
  pre-buy (Tier-1 + Aftermarket 2022-12..2023-02), Nexon Europe strike, Red Sea Export Europe / MEA.
- ``level_mask``: the reason a cell is left out of level and seasonality estimation: the ``train_mask`` reason, else
  the semiconductor window (ELA 2021-03..2022-09, a safety measure), EOL phase-out months (0..5 before EOL) or months
  before a customer switch (level from post-switch months only).
- ``train_weight``: 0 where masked, 0.7 for imputed semiconductor cells (S5), 0.5 for suspected hidden second
  stock-out months, 1 otherwise.

Off-phase months are structure, not anomalies: they are neither tagged nor masked (use ``on_phase``).
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from celeris.demand.panel import N_MONTHS
from celeris.demand.state import DemandState
from celeris.demand.unconstrained import METHODS

S5_WEIGHT = 0.7
SUSPECT_WEIGHT = 0.5
LAUNCH_RAMP_MONTHS = 12
EOL_PHASEOUT_MONTHS = 6
TRAIN_MASK_ORDER = (
    "missing_onphase",
    "erp_unknown",
    "d3_hidden_second_month",
    "lost_account_tail",
    "one_off",
    "covid_2020",
    "prebuy_price_rise",
    "strike",
    "red_sea_export",
)
LEVEL_ONLY_ORDER = ("semiconductor_window", "eol_phaseout", "pre_customer_switch")
TAG_ORDER = (
    "covid_2020",
    "prebuy_price_rise",
    "strike",
    "red_sea_export",
    "customer_programme_step",
    "lunar_new_year",
    "ramadan",
    "summer_shutdown",
    "erp_migration",
    "semiconductor_window",
    "stockout_listed",
    "stockout_inferred",
    "stockout_suspect",
    "backorder_catchup",
    "one_off",
    "launch_ramp",
    "region_opening_ramp",
    "eol_phaseout",
    "pre_customer_switch",
    "post_customer_switch",
    "lost_account_tail",
    "missing_onphase",
    "erp_unknown",
    "d3_hidden_second_month",
)


@dataclass(frozen=True)
class Masks:
    """Per-cell tags (boolean arrays by name) and the three mask / weight arrays."""

    tags: dict[str, np.ndarray]
    train_mask: np.ndarray  # object: reason or None
    level_mask: np.ndarray  # object: reason or None
    train_weight: np.ndarray  # float


def cell_tags(state: DemandState, windows: dict[str, np.ndarray], one_off: np.ndarray) -> dict[str, np.ndarray]:
    """Every tag as an (S, T) boolean array (calendar windows plus supply, data, lifecycle and account states)."""
    p, u = state.panel, state.unconstrained
    names = np.asarray(METHODS)[u.method]
    months = np.arange(N_MONTHS)[None, :]
    region_opening, launched = p.mea_opening_cohort, p.product_launch
    eol = p.series["eol_idx"].to_numpy(dtype="float64")
    to_eol = eol[:, None] - months
    switch = pd.Series(state.switches["switch_idx"].to_numpy(), index=state.switches["series_no"].to_numpy())
    switch_idx = switch.reindex(np.arange(p.n_series)).to_numpy(dtype="float64")
    tags = dict(windows)
    tags["stockout_listed"] = p.listed.copy()
    tags["stockout_inferred"] = u.inferred | (names == "S5_semiconductor_imputed")
    tags["stockout_suspect"] = u.suspect.copy()
    tags["backorder_catchup"] = np.isin(names, ["S2_carry_removed", "D1_phantom_removed", "spill_removed"])
    tags["one_off"] = one_off.copy()
    tags["launch_ramp"] = launched[:, None] & (p.age >= 0) & (p.age < LAUNCH_RAMP_MONTHS)
    tags["region_opening_ramp"] = region_opening[:, None] & (p.age >= 0) & (p.age < LAUNCH_RAMP_MONTHS)
    tags["eol_phaseout"] = (to_eol >= 0) & (to_eol < EOL_PHASEOUT_MONTHS)
    tags["pre_customer_switch"] = months < switch_idx[:, None]
    tags["post_customer_switch"] = months >= switch_idx[:, None]
    tags["lost_account_tail"] = state.lost_tail.copy()
    tags["missing_onphase"] = np.isin(names, ["missing_onphase_unknown", "missing_after_backorder"])
    tags["erp_unknown"] = names == "erp_unknown_order"
    tags["d3_hidden_second_month"] = (names == "D3_hidden_second_month") & np.isnan(u.demand)
    return {name: tags[name] & p.life for name in TAG_ORDER}


def first_reason(tags: dict[str, np.ndarray], order: tuple[str, ...], shape: tuple[int, int]) -> np.ndarray:
    """(S, T) object array: the first tag of ``order`` that is set, else None."""
    out = np.full(shape, None, dtype=object)
    for name in reversed(order):
        out[tags[name]] = name
    return out


def build_masks(state: DemandState, windows: dict[str, np.ndarray], one_off: np.ndarray) -> Masks:
    """Tags, ``train_mask``, ``level_mask`` and ``train_weight`` (see module docstring)."""
    tags = cell_tags(state, windows, one_off)
    shape = state.panel.life.shape
    train = first_reason(tags, TRAIN_MASK_ORDER, shape)
    level = first_reason(tags, TRAIN_MASK_ORDER + LEVEL_ONLY_ORDER, shape)
    names = np.asarray(METHODS)[state.unconstrained.method]
    weight = np.ones(shape)
    weight[names == "S5_semiconductor_imputed"] = S5_WEIGHT
    weight[tags["stockout_suspect"]] = SUSPECT_WEIGHT
    weight[~pd.isna(train)] = 0.0
    return Masks(tags=tags, train_mask=train, level_mask=level, train_weight=weight)


def tag_strings(tags: dict[str, np.ndarray], i: np.ndarray, t: np.ndarray) -> np.ndarray:
    """``|``-joined tag names of each cell (None where untagged), in ``TAG_ORDER``."""
    bits = np.zeros(len(i), dtype=np.int64)
    for k, name in enumerate(TAG_ORDER):
        bits |= tags[name][i, t].astype(np.int64) << k
    lookup = {code: "|".join(name for k, name in enumerate(TAG_ORDER) if code >> k & 1) or None for code in np.unique(bits)}
    return np.array([lookup[code] for code in bits], dtype=object)
