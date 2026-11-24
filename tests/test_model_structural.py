"""Structural model (dossier 4, 6.1-6.4): components multiply to the latent mean, orders accumulate the latent months
of the projected cycle, structural zeros are exactly 0, levels are ratios of sums, the macro drivers carry the economic
sign, forecasts are reproducible and nothing after the origin leaks into them."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from celeris.backtest.targets import FINAL_COLUMNS, backtest_targets
from celeris.demand.cycles import accumulation_weights
from celeris.demand.state import History
from celeris.features.macro import SIGN
from celeris.models.baselines import BASELINES
from celeris.models.context import ModelInputs, load_model_inputs, origin_context
from celeris.models.gbm import feature_frame
from celeris.models.structural import COMPONENTS, StructuralConfig, fit_structural, predict
from celeris.tables import read_train_clean

ORIGIN = 69  # 2024-10, backtest origin B


@pytest.fixture(scope="module")
def inputs(pipeline_run) -> ModelInputs:
    return load_model_inputs(pipeline_run.paths)


@pytest.fixture(scope="module")
def final(pipeline_run) -> pd.DataFrame:
    return read_train_clean(pipeline_run.paths, "anomalies").loc[:, list(FINAL_COLUMNS)]


@pytest.fixture(scope="module")
def fold(inputs: ModelInputs, final: pd.DataFrame):
    ctx = origin_context(inputs, ORIGIN)
    fit = fit_structural(inputs, ctx, StructuralConfig())
    targets = backtest_targets(ctx, final)
    return ctx, fit, targets, predict(fit, targets)


def test_fold_targets_structure(fold, final: pd.DataFrame) -> None:
    """Target rows: horizon 1..19, the actual is the final unconstrained demand, structural zeros carry nothing,
    series that start after the origin are cold starts with one month of latent demand per row."""
    ctx, _, targets, _ = fold
    assert targets["horizon"].min() == 1 and targets["horizon"].max() == 19
    expected = final[(final["month_idx"] > ORIGIN) & (final["month_idx"] <= ORIGIN + 19)]
    assert len(targets) == len(expected)
    merged = targets.merge(expected, on=["series_no", "month_idx"], validate="one_to_one")
    assert np.array_equal(merged["actual"].to_numpy(), merged["demand_uc"].to_numpy(), equal_nan=True)
    assert (targets.loc[targets["zero"], "accum_span"] == 0).all()
    starts = ctx.state.panel.series.set_index("series_no")["start_idx"]
    cold = targets["series_no"].map(starts).to_numpy() > ORIGIN
    assert np.array_equal(cold, targets["is_cold_start"].to_numpy())
    assert (targets.loc[targets["is_cold_start"], "accum_span"] == 1).all()
    assert targets["is_scored"].mean() > 0.98


def test_components_multiply_to_latent_mean(fold) -> None:
    _, _, _, pred = fold
    product = pred[list(COMPONENTS)].prod(axis=1).to_numpy()
    assert np.allclose(product, pred["latent_mean"].to_numpy(), rtol=1e-9, atol=1e-9)
    assert (pred["latent_mean"] >= 0).all() and np.isfinite(pred["latent_mean"]).all()


def test_structural_zeros_are_exactly_zero(fold) -> None:
    _, fit, targets, pred = fold
    zero = targets["zero"].to_numpy()
    assert zero.sum() > 0
    assert (pred.loc[zero, "mean"] == 0).all()
    assert (pred.loc[~zero, "mean"] > 0).mean() > 0.999
    lost = targets["zero_reason"].eq("lost_account").to_numpy()
    assert (pred.loc[lost, "latent_mean"] == 0).all()


def test_orders_accumulate_the_projected_cycle(fold) -> None:
    """``order(t) = sum weight x latent(month)`` with the weights of ``celeris.demand.cycles.accumulation_weights``."""
    ctx, fit, targets, pred = fold
    series = np.flatnonzero(ctx.state.cycles.series["cycle_kind"].isin(["A", "B", "Q", "T"]).to_numpy())[:300]
    projection = ctx.state.project(np.arange(ORIGIN + 1, ORIGIN + 20), series)
    weights = accumulation_weights(projection)
    latent = fit.latent()
    weights["contribution"] = weights["weight"] * latent[weights["series_no"], weights["latent_month_idx"]]
    expected = weights.groupby(["series_no", "target_month_idx"])["contribution"].sum()
    rows = targets[targets["series_no"].isin(series) & ~targets["zero"]]
    got = pred.loc[rows.index, "mean"].to_numpy()
    want = expected.reindex(pd.MultiIndex.from_arrays([rows["series_no"], rows["month_idx"]])).to_numpy()
    assert len(rows) > 1000
    assert np.allclose(got, want, rtol=1e-9)
    carried = weights[(weights["weight"] < 1)]
    assert len(carried) and np.allclose(carried["weight"], 0.5)  # a carried shutdown month weighs 0.5, never x1.5


def test_level_is_a_ratio_of_sums(fold) -> None:
    """Forecast level of a mature monthly series = sum demand / sum factors over its level-window cells."""
    ctx, fit, _, _ = fold
    cells = ctx.level_cells & (ctx.state.cycles.accum_span == 1)
    window = np.zeros(cells.shape, dtype=bool)
    window[:, ORIGIN - fit.config.level_window + 1 : ORIGIN + 1] = True
    monthly = np.flatnonzero((ctx.state.cycles.series["cycle_kind"] == "M").to_numpy() & (fit.level_source[: cells.shape[0]] == "window"))[:50]
    g = fit.g[: cells.shape[0], : cells.shape[1]]
    for s in monthly:
        use = (ctx.level_cells[s] & window[s])
        if not (ctx.state.cycles.accum_span[s, use] == 1).all():
            continue
        w = ctx.weight[s, use]
        assert fit.level[s] == pytest.approx((w * ctx.demand[s, use]).sum() / (w * g[s, use]).sum(), rel=1e-9)


def test_macro_drivers_have_the_economic_sign(fold) -> None:
    _, fit, _, _ = fold
    drivers = fit.macro_paths.drivers
    assert len(drivers) == 7 and all(len(d.indicators) >= 1 for d in drivers.values())
    for d in drivers.values():
        signs = np.array([SIGN[name] for name in d.indicators])
        assert (d.coef * signs >= 0).all()
        assert np.allclose(d.lag_posterior.sum(axis=1), 1.0)
    assert 0.0 <= fit.macro_paths.damping <= 1.0 and fit.macro_paths.fuel <= 0.0


def test_averaged_driver_sets_are_weighted_and_sign_consistent(fold) -> None:
    """Model-averaged family driver sets: weights are positive, sorted and sum to 1, the reported drivers are the best
    set, every set carries the economic sign, and the SKU paths are the weighted sum over the sets."""
    _, fit, _, _ = fold
    paths = fit.macro_paths
    assert set(paths.driver_sets) == set(paths.drivers)
    for family, sets in paths.driver_sets.items():
        weights = np.array([weight for _, weight in sets])
        assert len(sets) <= fit.config.macro.max_sets and (weights > 0).all() and np.isclose(weights.sum(), 1.0)
        assert (np.diff(weights) <= 1e-12).all() and sets[0][0] is paths.drivers[family]
        for d, _ in sets:
            assert len(set(d.indicators)) == len(d.indicators) <= fit.config.macro.max_drivers
            assert (d.coef * np.array([SIGN[name] for name in d.indicators]) >= 0).all()
    lagged = np.stack([fit.macro.lagged(lag) for lag in range(paths.response.shape[2])], axis=2)  # (113, 7, lags)
    assert np.allclose(np.einsum("nil,til->nt", paths.response, lagged), paths.u, atol=1e-9)


def test_backfit_converges(fold) -> None:
    """The factor backfit stops on its convergence criterion, not on the iteration cap."""
    _, fit, _, _ = fold
    assert len(fit.trace) < fit.config.n_iter and fit.trace[-1]["max_dlog_g"] < fit.config.tol


def test_fit_is_reproducible(inputs: ModelInputs, fold) -> None:
    ctx, fit, targets, pred = fold
    again = predict(fit_structural(inputs, ctx, StructuralConfig()), targets)
    pd.testing.assert_frame_equal(pred, again)


def _altered(history: History, origin: int) -> History:
    """Scramble everything after ``origin``: units, customers, missing rows and the stock-out file."""
    rng = np.random.default_rng(11)
    cells = history.cells.copy()
    late = cells["month_idx"] > origin
    cells.loc[late, "units_sold"] = pd.array(rng.integers(0, 900, int(late.sum())), dtype="Int64")
    cells.loc[late, "customer"] = "Helios Auto Parts"
    drop = late & (rng.random(len(cells)) < 0.05)
    cells.loc[drop, ["row_status", "numeric_state"]] = ["missing_row", None]
    cells.loc[drop, "units_sold"] = pd.NA
    stockouts = history.stockouts[history.stockouts["month_idx"] <= origin]
    return History(cells, stockouts, history.series)


def test_no_leakage_after_the_origin(inputs: ModelInputs, final: pd.DataFrame, fold) -> None:
    """Changing every datum after the origin leaves that origin's forecasts unchanged (structural, baselines, GBM
    features). The actuals of the target months are the only post-origin input, and they are only scored."""
    ctx, fit, targets, pred = fold
    altered_inputs = ModelInputs(_altered(inputs.history, ORIGIN), inputs.master, inputs.events, inputs.macro, inputs.test_grid, inputs.prices)
    ctx2 = origin_context(altered_inputs, ORIGIN)
    fit2 = fit_structural(altered_inputs, ctx2, StructuralConfig())
    targets2 = backtest_targets(ctx2, final)
    structure = ["series_no", "month_idx", "accum_span", "zero", "is_cold_start", "cycle_kind", "intermittency"]
    pd.testing.assert_frame_equal(targets[structure], targets2[structure])
    pred2 = predict(fit2, targets2)
    pd.testing.assert_frame_equal(pred, pred2)
    for name, function in BASELINES.items():
        assert np.array_equal(function(ctx, targets), function(ctx2, targets2)), name
    pd.testing.assert_frame_equal(feature_frame(ctx, fit, targets, pred), feature_frame(ctx2, fit2, targets2, pred2))
