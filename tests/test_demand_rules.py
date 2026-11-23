"""Rule fixtures for the demand stage (T4, T8 on synthetic series): every unconstrained-demand method code, the
ordering-cycle classifier, change points, lost accounts, accumulation and projection.

Fixtures are built as tiny cleaned grids and stock-out tables and go through ``build_panel``, so they exercise the
same code path as the pipeline.
"""

from __future__ import annotations

from collections.abc import Mapping

import numpy as np
import pandas as pd
import pytest

from celeris.demand.cycles import CODES, PATTERN_INDEX, accumulation_weights, fit_cycles, on_matrix, order_indicator, project_cycle
from celeris.demand.fill import treat_missing
from celeris.demand.panel import N_MONTHS, SERIES_COLUMNS, Panel, build_panel
from celeris.demand.semiconductor import SemiconductorModel, impute_requested
from celeris.demand.unconstrained import M, cycle_pass, method_names, midpoint_shortfall, supply_pass

OFF = 0.0
ELA = "Electrical Assemblies"


def series_frame(n: int, *, family: str = "Brake & Safety Systems", start: int = 0, end: int = N_MONTHS - 1, region: str = "Europe") -> pd.DataFrame:
    frame = pd.DataFrame(
        {
            "series_no": np.arange(n),
            "sku_id": [f"TST-{i:03d}" for i in range(n)],
            "region": region,
            "product_family": family,
            "sales_channel": "Direct OEM",
            "powertrain_application": "Universal",
            "sku_tier": "tail",
            "lifecycle_status": "Active",
            "launch_idx": start,
            "eol_idx": np.nan,
            "start_idx": start,
            "end_idx": end,
        }
    )
    return frame.loc[:, list(SERIES_COLUMNS)]


def panel_from(units: np.ndarray, series: pd.DataFrame, listed: Mapping[tuple[int, int], dict] | None = None,
               missing: set[tuple[int, int]] = frozenset(), erp: set[tuple[int, int]] = frozenset()) -> Panel:
    """A panel from a units matrix (NaN = missing row), listed stock-outs and ERP blanks."""
    rows = []
    for s in range(units.shape[0]):
        for t in range(series["start_idx"].iat[s], series["end_idx"].iat[s] + 1):
            value = units[s, t]
            status = "missing_row" if (s, t) in missing or (np.isnan(value) and (s, t) not in erp) else "observed"
            state = "N12_erp_units_lost" if (s, t) in erp else ("N0_ok" if status == "observed" else None)
            rows.append({"series_no": s, "month_idx": t, "row_status": status, "numeric_state": state,
                         "units_sold": pd.NA if np.isnan(value) else int(value)})
    cells = pd.DataFrame(rows).astype({"units_sold": "Int64"})
    stock = pd.DataFrame(
        [{"series_no": s, "month_idx": t, "requested_units": v["requested"], "carried_in_units": v.get("carried_in", 0),
          "shipped_units": v["shipped"], "backordered_units": v.get("backordered", 0), "fill_rate_pct": v.get("fill", 50.0),
          "reason_class": v.get("reason", "operational")} for (s, t), v in (listed or {}).items()],
        columns=["series_no", "month_idx", "requested_units", "carried_in_units", "shipped_units", "backordered_units", "fill_rate_pct", "reason_class"],
    )
    return build_panel(cells, stock, series)


def pattern_units(code: str, level: float = 80.0) -> np.ndarray:
    return np.where(on_matrix(np.arange(N_MONTHS))[PATTERN_INDEX[code]], level, OFF)


NO_SEMI = SemiconductorModel(pd.Series(dtype="float64"), pd.Series(dtype="float64"))


def test_s1_listed_and_s2_carry_removed() -> None:
    units = pattern_units("M")[None, :].copy()
    units[0, 50], units[0, 51] = 40, 90
    panel = panel_from(units, series_frame(1), {(0, 50): {"requested": 100, "shipped": 40, "backordered": 24}})
    out = supply_pass(panel, NO_SEMI)
    assert method_names(out.method[0, 50:52]).tolist() == ["S1_listed_requested", "S2_carry_removed"]
    assert out.demand[0, 50] == 100 and out.lost_units[0, 50] == 36 and out.backorder_out[0, 50] == 24
    assert out.demand[0, 51] == 66 and out.backorder_in[0, 51] == 24


@pytest.mark.parametrize(("on_phase", "expected"), [(False, 0.0), (True, np.nan)])
def test_d3_hidden_second_month(on_phase: bool, expected: float) -> None:
    units = pattern_units("M")[None, :].copy()
    units[0, 50], units[0, 51] = 40, 10
    panel = panel_from(units, series_frame(1), {(0, 50): {"requested": 100, "shipped": 40, "backordered": 24}})
    supply = supply_pass(panel, NO_SEMI)
    assert supply.method[0, 51] == M["D3_hidden_second_month"] and np.isnan(supply.demand[0, 51]) and supply.inferred[0, 51]
    on = np.ones(units.shape, dtype=bool)
    on[0, 51] = on_phase
    out = cycle_pass(panel, supply, on, np.zeros(units.shape, dtype=bool))
    assert (np.isnan(out.demand[0, 51]) and np.isnan(expected)) or out.demand[0, 51] == expected


def test_d2_hidden_stockout_from_carried_in() -> None:
    units = pattern_units("M")[None, :].copy()
    units[0, 30] = 5
    panel = panel_from(units, series_frame(1), {(0, 31): {"requested": 80, "carried_in": 12, "shipped": 60, "backordered": 12}})
    out = supply_pass(panel, NO_SEMI)
    assert out.method[0, 30] == M["D2_hidden_stockout"] and out.inferred[0, 30]
    assert out.demand[0, 30] == 5 + midpoint_shortfall(np.array([12.0]))[0] == 36
    assert out.backorder_out[0, 30] == 12 and out.lost_units[0, 30] == 19


def test_s5_semiconductor_imputation() -> None:
    units = pattern_units("M", 50.0)[None, :].repeat(2, axis=0)
    units[1, 30] = 0
    semi = SemiconductorModel(pd.Series(0.5, index=pd.RangeIndex(26, 45)), pd.Series(dtype="float64"))
    out = supply_pass(panel_from(units, series_frame(2, family=ELA)), semi)
    assert method_names(out.method[0, 26:45]).tolist() == ["S5_semiconductor_imputed"] * 19
    assert out.demand[0, 30] == 101 and out.demand[1, 30] == 0
    assert impute_requested(np.array([50.0]), np.array([0.5]), np.array([10.0]))[0] == 91


def test_d1_phantom_order_moves_back_and_spill_is_removed() -> None:
    units = np.vstack([pattern_units("B0"), pattern_units("A-Aug")])
    units[0, 40], units[0, 41] = 27, 20  # B0: on in even months; 41 is off
    units[1, 43] = 15  # A-Aug: 2022-08 (idx 43) is the shutdown month
    panel = panel_from(units, series_frame(2))
    supply = supply_pass(panel, NO_SEMI)
    on = np.vstack([on_matrix(np.arange(N_MONTHS))[PATTERN_INDEX["B0"]], on_matrix(np.arange(N_MONTHS))[PATTERN_INDEX["A-Aug"]]])
    periodic = np.zeros(units.shape, dtype=bool)
    periodic[0] = True
    out = cycle_pass(panel, supply, on, periodic)
    assert method_names(out.method[0, 40:42]).tolist() == ["D1_hidden_stockout", "D1_phantom_removed"]
    assert out.demand[0, 40] == 27 + midpoint_shortfall(np.array([20.0]))[0] and out.demand[0, 41] == 0 and out.inferred[0, 40]
    assert out.method[1, 43] == M["spill_removed"] and out.demand[1, 43] == 0 and out.inferred[1, 42]


def test_missing_and_erp_cells_follow_the_cycle() -> None:
    units = np.vstack([pattern_units("M"), pattern_units("B0"), pattern_units("M"), pattern_units("M")])
    units[0, 60] = np.nan  # on-phase missing row
    units[1, 61] = np.nan  # off-phase missing row (B0: 61 odd -> off)
    units[2, 80:] = 0  # lost account, with a missing row in its tail
    units[2, 85] = np.nan
    units[3, 70] = np.nan  # ERP blank, known positive order
    units[0, 49], units[0, 50] = 40, np.nan  # missing month after a listed back-order
    panel = panel_from(units, series_frame(4), {(0, 49): {"requested": 100, "shipped": 40, "backordered": 24}}, erp={(3, 70)})
    supply = supply_pass(panel, NO_SEMI)
    assert supply.method[0, 50] == M["missing_after_backorder"]
    fit = fit_cycles(order_indicator(supply.demand, panel.positive_unknown, panel.life), panel)
    assert fit.series["cycle_pattern"].tolist()[:2] == ["M", "B0"] and fit.series["is_lost_account"].tolist() == [False, False, True, False]
    out = treat_missing(cycle_pass(panel, supply, fit.on_phase, np.zeros(units.shape, dtype=bool)), fit, panel)
    names = method_names(out.method)
    assert names[0, 60] == "missing_onphase_unknown" and np.isnan(out.demand[0, 60])
    assert names[1, 61] == "missing_offphase_zero" and out.demand[1, 61] == 0
    assert names[2, 85] == "missing_lost_tail_zero" and out.demand[2, 85] == 0
    assert names[3, 70] == "erp_unknown_order" and np.isnan(out.demand[3, 70])
    assert names[0, 50] == "missing_after_backorder" and np.isnan(out.demand[0, 50])


def test_suspected_hidden_second_month() -> None:
    units = pattern_units("M")[None, :].copy()
    units[0, 50], units[0, 51] = 40, 29  # own demand 29 - 24 = 5 against a level of 80
    panel = panel_from(units, series_frame(1), {(0, 50): {"requested": 100, "shipped": 40, "backordered": 24}})
    out = cycle_pass(panel, supply_pass(panel, NO_SEMI), np.ones(units.shape, dtype=bool), np.zeros(units.shape, dtype=bool))
    assert out.method[0, 51] == M["S2_carry_removed"] and out.suspect[0, 51] and out.suspect.sum() == 1


@pytest.mark.parametrize("code", CODES)
def test_every_template_is_recovered(code: str) -> None:
    units = pattern_units(code)[None, :].repeat(2, axis=0)
    units[1] = pattern_units("M")
    panel = panel_from(units, series_frame(2))
    fit = fit_cycles(order_indicator(units, panel.positive_unknown, panel.life), panel)
    assert fit.series["cycle_pattern"].iat[0] == code and fit.series["cycle_change_idx"].iat[0] == -1


def _noisy(codes: list[str], rng: np.random.Generator, flip: float, change: dict[int, tuple[str, int]] | None = None) -> np.ndarray:
    units = np.vstack([pattern_units(code) for code in codes])
    for s, (after, month) in (change or {}).items():
        units[s, month:] = pattern_units(after)[month:]
    flips = rng.random(units.shape) < flip
    return np.where(flips, np.where(units > 0, 0.0, 80.0), units)


def test_null_series_give_no_false_changes() -> None:
    rng = np.random.default_rng(1)
    codes = list(rng.choice(np.array(CODES), size=300))
    units = _noisy(codes, rng, flip=0.003)
    panel = panel_from(units, series_frame(len(codes)))
    fit = fit_cycles(order_indicator(units, panel.positive_unknown, panel.life), panel)
    assert (fit.series["cycle_pattern"].to_numpy() == np.array(codes)).mean() >= 0.99
    assert (fit.series["cycle_change_idx"] >= 0).sum() <= 3


def test_injected_cycle_changes_are_detected() -> None:
    rng = np.random.default_rng(2)
    n = 100
    pairs = [("Q1", "M"), ("M", "B0"), ("M", "Q2"), ("Q0", "M")]
    before = [pairs[i % 4][0] for i in range(n)]
    months = rng.integers(30, 70, size=n)
    units = _noisy(before, rng, flip=0.003, change={i: (pairs[i % 4][1], int(months[i])) for i in range(n)})
    panel = panel_from(units, series_frame(n))
    frame = fit_cycles(order_indicator(units, panel.positive_unknown, panel.life), panel).series
    detected = frame["cycle_change_idx"] >= 0
    assert detected.mean() >= 0.95
    window_ok = (frame["cycle_change_idx"] <= months + 2) & (frame["cycle_change_window_end_idx"] >= months - 3)
    assert (window_ok | ~detected).all()
    assert (frame.loc[detected, "cycle_pattern"].to_numpy() == np.array([pairs[i % 4][1] for i in range(n)])[detected]).all()


def test_lost_account_needs_six_silent_months_on_a_live_series() -> None:
    units = pattern_units("M")[None, :].repeat(3, axis=0)
    units[0, -6:] = 0
    units[1, -5:] = 0
    units[2, 70:] = 0
    series = series_frame(3)
    series.loc[2, "end_idx"] = 75  # EOL before the origin: silent, but not a lost account
    units[2, 76:] = np.nan
    panel = panel_from(units, series)
    lost = fit_cycles(order_indicator(units, panel.positive_unknown, panel.life), panel).series["is_lost_account"].tolist()
    assert lost == [True, False, False]


def test_accumulation_spans_and_carry_weights() -> None:
    units = np.vstack([pattern_units("B0"), pattern_units("Q1"), pattern_units("A-Aug"), pattern_units("Q1")])
    series = series_frame(4)
    series.loc[3, ["start_idx", "launch_idx"]] = 61  # launched 2024-02 (Q1 on-month): first order carries nothing before it
    units[3, :61] = np.nan
    panel = panel_from(units, series)
    fit = fit_cycles(order_indicator(units, panel.positive_unknown, panel.life), panel)
    assert fit.accum_span[0, 50] == 2 and fit.carry_weight[0, 50] == 1.0 and fit.accum_span[0, 51] == 0
    assert fit.accum_span[1, 52] == 3 and fit.accum_span[1, 1] == 3  # 2019-02 order carries 2018-12 and 2019-01
    assert fit.accum_span[2, 44] == 2 and fit.carry_weight[2, 44] == 0.5 and fit.accum_span[2, 45] == 1
    assert fit.accum_span[3, 61] == 1 and fit.accum_span[3, 64] == 3


def test_projection_extends_the_regime_with_explicit_weights() -> None:
    codes = ["Q0", "Q2", "B1", "T0", "A-Aug", "M"]
    units = np.vstack([pattern_units(code) for code in codes])
    panel = panel_from(units, series_frame(len(codes)))
    fit = fit_cycles(order_indicator(units, panel.positive_unknown, panel.life), panel)
    months = np.arange(94, 113)
    proj = project_cycle(fit, panel, months).set_index(["series_no", "month_idx"])
    assert proj.loc[(0, 96), "accum_span"] == 3 and not proj.loc[(0, 94), "on_phase"]  # Q0: first order 2027-01
    assert proj.loc[(1, 95), "accum_span"] == 3  # Q2: 2026-12 carries 2026-10 and 2026-11
    assert proj.loc[(2, 95), "accum_span"] == 2  # B1: 2026-12
    assert proj.loc[(3, 94), "accum_span"] == 2 and proj.loc[(3, 95), "accum_span"] == 1  # T0
    assert proj.loc[(4, 104), "accum_span"] == 2 and proj.loc[(4, 104), "carry_weight"] == 0.5  # A-Aug: 2027-09
    assert (proj.loc[5, "accum_span"] == 1).all() and (proj["p_order"].isin([0.0, 1.0]) | proj["p_order"].between(0, 1)).all()
    weights = accumulation_weights(project_cycle(fit, panel, months, np.array([4])))
    september = weights[weights["target_month_idx"] == 104]
    assert september.set_index("latent_month_idx")["weight"].to_dict() == {104: 1.0, 103: 0.5}
    with pytest.raises(ValueError):
        project_cycle(fit, panel, np.array([93, 94]))
