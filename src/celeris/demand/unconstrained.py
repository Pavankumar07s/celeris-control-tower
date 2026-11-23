"""Unconstrained demand from shipped units and the stock-out file (dossier 7.1 step 7, 2.7, 3, 4.12; SU, SU.v).

``train.csv`` records shipments. The supply block of ``inventory_stockouts.csv`` is exact: ``Shipped = floor(f x (R +
C))``, ``Backordered = floor(0.4 x shortfall)`` (0 for semiconductor rows), ``Carried_In(t) = Backordered(t-1)``, and
the month after a back-ordered month ships its own demand plus the back-order whether or not it is listed. Rules in
the dossier's order (method codes in brackets):

- (S1) listed month: demand = Requested_Units [``S1_listed_requested``];
- (S5) unlisted ELA cell in 2021-03..2022-09: ``max(0, round((u + 0.5) / fill_hat) - B(t-1 if listed))``, 0 if u = 0
  [``S5_semiconductor_imputed``], see ``celeris.demand.semiconductor``;
- (S2) unlisted month after a listed back-ordered month with ``u >= B(t-1)``: ``u - B(t-1)`` [``S2_carry_removed``];
- (D3) same with ``u < B(t-1)``: a hidden second stock-out month; 0 if off-phase, unknown otherwise
  [``D3_hidden_second_month``];
- (D2) unlisted month followed by a listed month with ``Carried_In = c > 0``: a hidden stock-out whose shortfall lies in
  ``[ceil(2.5c), ceil(2.5(c+1)) - 1]``; demand = u + midpoint [``D2_hidden_stockout``];
- (D1) phantom order in an off-phase month of a period-2 / period-3 cycle after an unlisted on-phase month whose
  implied fill is in [0.13, 0.72] and implied demand in [0.25, 2.2] x its local baseline: the previous month was a
  stock-out; its demand = u(t-1) + S(u_t) [``D1_hidden_stockout``] and the phantom month is 0
  [``D1_phantom_removed``];
- any other positive demand in an off-phase month is back-order spill: 0, and month t-1 is flagged as an unlisted
  stock-out [``spill_removed``] (off-phase months carry Requested = 0 on 855 / 858 listed rows);
- a missing month after a listed back-order: demand unknown, the carry is not demand [``missing_after_backorder``].

S1, S5, S2 and D2 need no cycle (``supply_pass``); D3, D1 and the spill rule need the ordering cycle
(``cycle_pass``). S2 cells below ``SUSPECT_RATIO`` x their local baseline are suspected hidden second months (SU.v
missed 3: about 80 expected, D3 sees 14) and are flagged for down-weighting, not changed.
"""

from __future__ import annotations

from dataclasses import dataclass, replace

import numpy as np

from celeris.demand.panel import Panel, row_nanmedian, shift
from celeris.demand.semiconductor import SemiconductorModel, impute_requested

BACKORDER_SHARE = 0.4
D1_FILL_RANGE = (0.13, 0.72)
D1_BASELINE_RANGE = (0.25, 2.2)
BASELINE_HALF_WINDOW = 6
SUSPECT_RATIO = 0.35

METHODS: tuple[str, ...] = (
    "outside",
    "shipped",
    "S1_listed_requested",
    "S5_semiconductor_imputed",
    "S2_carry_removed",
    "D2_hidden_stockout",
    "D1_hidden_stockout",
    "D1_phantom_removed",
    "D3_hidden_second_month",
    "spill_removed",
    "missing_after_backorder",
    "missing_row",
    "erp_unknown_order",
    "missing_offphase_zero",
    "missing_lost_tail_zero",
    "missing_onphase_unknown",
)
M = {name: code for code, name in enumerate(METHODS)}


@dataclass(frozen=True)
class Unconstrained:
    """Cell arrays of the unconstrained-demand build (all ``(series, month)``).

    ``demand`` is NaN where unknown; ``backorder_in`` the units removed because they were carried in (or were spill);
    ``backorder_out`` the units pushed to the next month; ``lost_units`` units never shipped; ``shortfall`` requested
    plus carried-in minus shipped; ``fill_used`` the fill behind an estimate; ``inferred`` an exactly inferred unlisted
    stock-out month; ``suspect`` a statistically suspected hidden second stock-out month.
    """

    demand: np.ndarray
    method: np.ndarray
    backorder_in: np.ndarray
    backorder_out: np.ndarray
    lost_units: np.ndarray
    shortfall: np.ndarray
    fill_used: np.ndarray
    inferred: np.ndarray
    suspect: np.ndarray

    def copy(self) -> Unconstrained:
        return replace(self, **{name: getattr(self, name).copy() for name in self.__dataclass_fields__})


def midpoint_shortfall(backorder: np.ndarray) -> np.ndarray:
    """Midpoint of the shortfall interval implied by a back-order ``c = floor(0.4 S)``: S in [ceil(2.5c), ceil(2.5(c+1)) - 1]."""
    return (np.ceil(2.5 * backorder) + np.ceil(2.5 * (backorder + 1)) - 1) / 2


def supply_pass(panel: Panel, semi: SemiconductorModel) -> Unconstrained:
    """S1, S5, S2, D2 and the D3 / missing-after-back-order candidates (no cycle needed)."""
    u, life, listed = panel.units, panel.life, panel.listed
    shape = u.shape
    zeros = np.zeros(shape)
    demand = u.copy()
    method = np.where(life, M["shipped"], M["outside"]).astype(np.int8)
    method[panel.missing_row & np.isnan(u)] = M["missing_row"]
    method[panel.positive_unknown] = M["erp_unknown_order"]
    backorder_in, backorder_out, lost, shortfall = zeros.copy(), zeros.copy(), zeros.copy(), zeros.copy()
    fill_used = np.full(shape, np.nan)
    inferred = np.zeros(shape, dtype=bool)

    request, carried, shipped, backordered = (np.nan_to_num(a) for a in (panel.requested, panel.carried_in, panel.shipped, panel.backordered))
    demand[listed] = request[listed]
    method[listed] = M["S1_listed_requested"]
    shortfall[listed] = (request + carried - shipped)[listed]
    backorder_out[listed] = backordered[listed]
    lost[listed] = (request + carried - shipped - backordered)[listed]
    backorder_in[listed] = carried[listed]
    fill_used[listed] = panel.fill_pct[listed] / 100

    carry_prev = shift(np.where(listed, backordered, 0.0), 1, 0.0)
    semi_cell = panel.semiconductor_cell
    s5 = semi_cell & ~listed & ~np.isnan(u)
    if s5.any():
        i, t = np.nonzero(s5)
        fill_hat = semi.fill_hat(i, t)
        own = impute_requested(u[i, t], fill_hat, carry_prev[i, t])
        demand[i, t] = own
        method[i, t] = M["S5_semiconductor_imputed"]
        shortfall[i, t] = own + carry_prev[i, t] - u[i, t]
        lost[i, t] = shortfall[i, t]
        backorder_in[i, t] = carry_prev[i, t]
        fill_used[i, t] = fill_hat

    after_backorder = ~listed & ~semi_cell & (carry_prev > 0) & life
    known = ~np.isnan(u)
    s2 = after_backorder & known & (u >= carry_prev)
    demand[s2] = (u - carry_prev)[s2]
    method[s2] = M["S2_carry_removed"]
    backorder_in[s2] = carry_prev[s2]
    d3 = after_backorder & known & (u < carry_prev)
    demand[d3] = np.nan
    method[d3] = M["D3_hidden_second_month"]
    backorder_in[d3] = carry_prev[d3]
    inferred[d3] = True
    method[after_backorder & panel.missing_row & ~known] = M["missing_after_backorder"]

    next_listed = shift(listed, -1, False)
    next_carried = shift(np.where(listed, carried, 0.0), -1, 0.0)
    revealed = ~listed & ~semi_cell & next_listed & (next_carried > 0) & life & (method != M["D3_hidden_second_month"])
    inferred[revealed] = True
    d2 = revealed & known
    s_mid = midpoint_shortfall(next_carried)
    base = np.where(method == M["S2_carry_removed"], demand, u)
    demand[d2] = (base + s_mid)[d2]
    method[d2] = M["D2_hidden_stockout"]
    shortfall[d2] = s_mid[d2]
    backorder_out[d2] = next_carried[d2]
    lost[d2] = (s_mid - next_carried)[d2]
    demand[~life] = np.nan
    return Unconstrained(demand, method, backorder_in, backorder_out, lost, shortfall, fill_used, inferred, np.zeros(shape, dtype=bool))


def local_baseline(demand: np.ndarray, on_phase: np.ndarray) -> np.ndarray:
    """Median of the positive on-phase demand within +-6 months, excluding the month itself and its two neighbours."""
    source = np.where(on_phase & (demand > 0), demand, np.nan)
    offsets = [k for k in range(-BASELINE_HALF_WINDOW, BASELINE_HALF_WINDOW + 1) if abs(k) > 1]
    stack = np.stack([shift(source, k) for k in offsets], axis=2)
    out = np.full(demand.shape, np.nan)
    has = ~np.isnan(stack).all(axis=2)
    out[has] = row_nanmedian(stack[has])
    return out


def cycle_pass(panel: Panel, supply: Unconstrained, on_phase: np.ndarray, periodic: np.ndarray) -> Unconstrained:
    """D3 resolution, D1 phantom orders, off-phase spill and S2 suspects, given the cycle of every cell.

    ``on_phase`` is the ordering-cycle mask; ``periodic`` marks cells whose regime has period 2 or 3 (B, Q, T).
    """
    out = supply.copy()
    u, life, listed = panel.units, panel.life, panel.listed
    demand, method = out.demand, out.method
    off = life & ~on_phase

    d3 = method == M["D3_hidden_second_month"]
    d3_off = d3 & off
    short = np.where(d3_off, out.backorder_in - np.nan_to_num(u), 0.0)
    demand[d3_off] = 0.0
    out.shortfall[d3_off] = short[d3_off]
    out.backorder_out[d3_off] = np.floor(BACKORDER_SHARE * short[d3_off] + 1e-9)
    out.lost_units[d3_off] = short[d3_off] - out.backorder_out[d3_off]

    semi_cell = panel.semiconductor_cell
    baseline = local_baseline(supply.demand, on_phase)
    u_prev = shift(u, 1)
    s_phantom = midpoint_shortfall(np.nan_to_num(u))
    with np.errstate(all="ignore"):
        implied_fill = u_prev / (u_prev + s_phantom)
        implied_rel = (u_prev + s_phantom) / shift(baseline, 1)
    shipped_here = method == M["shipped"]
    phantom = (
        off & periodic & (np.nan_to_num(u) > 0) & ~listed & ~shift(listed, 1, False)
        & ~semi_cell & ~shift(semi_cell, 1, False) & shift(on_phase & life, 1, False)
        & (implied_fill >= D1_FILL_RANGE[0]) & (implied_fill <= D1_FILL_RANGE[1])
        & (implied_rel >= D1_BASELINE_RANGE[0]) & (implied_rel <= D1_BASELINE_RANGE[1])
        & shipped_here & shift(shipped_here, 1, False)
    )
    i, t = np.nonzero(phantom)
    demand[i, t - 1] = u[i, t - 1] + s_phantom[i, t]
    method[i, t - 1] = M["D1_hidden_stockout"]
    out.shortfall[i, t - 1] = s_phantom[i, t]
    out.backorder_out[i, t - 1] = u[i, t]
    out.lost_units[i, t - 1] = s_phantom[i, t] - u[i, t]
    out.inferred[i, t - 1] = True
    demand[i, t] = 0.0
    method[i, t] = M["D1_phantom_removed"]
    out.backorder_in[i, t] = u[i, t]

    spill = off & ~listed & ((demand > 0) | (method == M["erp_unknown_order"]))
    out.backorder_in[spill] += np.nan_to_num(demand[spill])
    demand[spill] = 0.0
    method[spill] = M["spill_removed"]
    origin = shift(spill, -1, False) & ~listed & life
    out.inferred[origin] = True

    out.suspect[:] = (method == M["S2_carry_removed"]) & on_phase & (demand < SUSPECT_RATIO * baseline)
    return out


def method_names(method: np.ndarray) -> np.ndarray:
    """Method codes as text."""
    return np.array(METHODS, dtype=object)[method]
