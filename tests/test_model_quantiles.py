"""Quantiles (dossier 6.5; forecast contract): the aggregate formula, integer row quantiles that are ordered, zero rows,
and a calibration that reaches about 80 % coverage on data simulated from the error model."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from celeris.models.quantiles import Z, aggregate_quantiles, calibrate, coverage, node_quantiles, row_quantiles, with_components


def test_aggregate_quantiles_follow_the_contract_formula() -> None:
    mean = np.array([10.0, 20.0, 30.0, 40.0])
    var_noise = np.array([12.0, 30.0, 50.0, 70.0])
    series = np.array(["a", "a", "b", "c"])
    group = np.array(["g1", "g1", "g1", "g2"])
    out = aggregate_quantiles(mean, var_noise, np.full(4, 0.1), np.full(4, 0.05), series, group)
    m = 100.0
    v = 162.0 + (0.1 * 30) ** 2 + (0.1 * 30) ** 2 + (0.1 * 40) ** 2 + (0.05 * 60) ** 2 + (0.05 * 40) ** 2
    sigma2 = np.log1p(v / m**2)
    mu = np.log(m) - sigma2 / 2
    for q, z in Z.items():
        assert out[q] == pytest.approx(np.exp(mu + z * np.sqrt(sigma2)), rel=1e-12)
    assert out["p10"] < out["p50"] < m < out["p90"]  # log-normal: median below the mean


def test_aggregate_of_nothing_is_zero() -> None:
    out = aggregate_quantiles(np.zeros(3), np.zeros(3), np.zeros(3), np.zeros(3), np.array(["a", "b", "c"]), np.array(["g"] * 3))
    assert out == {"p10": 0.0, "p50": 0.0, "p90": 0.0}


def test_node_quantiles_match_the_reference_implementation() -> None:
    rng = np.random.default_rng(3)
    frame = pd.DataFrame(
        {
            "node": rng.integers(0, 4, 200),
            "mean": rng.gamma(2.0, 20.0, 200),
            "series_key": rng.integers(0, 30, 200).astype(str),
            "group_key": rng.integers(0, 5, 200).astype(str),
        }
    )
    frame["var_noise"] = frame["mean"] * 1.3 + 0.05 * frame["mean"] ** 2
    frame["cv_level"] = frame["series_key"].astype(int).map(lambda k: 0.05 + 0.002 * k)
    frame["cv_group"] = frame["group_key"].astype(int).map(lambda k: 0.03 + 0.01 * k)
    nodes = node_quantiles(frame, ["node"])
    for node, part in frame.groupby("node"):
        ref = aggregate_quantiles(part["mean"], part["var_noise"], part["cv_level"], part["cv_group"], part["series_key"], part["group_key"])
        for q in Z:
            assert nodes.loc[node, q] == pytest.approx(ref[q], rel=1e-10)


def test_row_quantiles_are_ordered_integers() -> None:
    rng = np.random.default_rng(5)
    mean = np.concatenate([[0.0, 0.3, 1.0], rng.gamma(1.5, 40.0, 500)])
    variance = mean * rng.uniform(0.5, 3.0, len(mean)) + 0.07 * mean**2
    q = row_quantiles(mean, variance)
    assert (q["p10"] <= q["p50"]).all() and (q["p50"] <= q["p90"]).all()
    for name in Z:
        assert np.array_equal(q[name], np.floor(q[name])) and (q[name] >= 0).all()
    assert q["p10"][0] == q["p50"][0] == q["p90"][0] == 0


def test_row_quantiles_match_a_negative_binomial() -> None:
    rng = np.random.default_rng(9)
    mean, variance = 60.0, 60.0 + 0.06 * 3600
    r = mean**2 / (variance - mean)
    draws = rng.negative_binomial(r, r / (r + mean), 200_000)
    q = row_quantiles(np.array([mean]), np.array([variance]))
    assert abs(np.mean(draws <= q["p10"][0]) - 0.10) < 0.02
    assert abs(np.mean(draws <= q["p90"][0]) - 0.90) < 0.02


def _simulated_backtest(seed: int = 21) -> pd.DataFrame:
    """Rows drawn from the contract's error model: 60 SKUs x 3 regions, NB noise, a series-level error (sd 0.12) and a
    family x region error (sd 0.04)."""
    rng = np.random.default_rng(seed)
    regions = ("Europe", "India", "Asia Pacific")
    rows = []
    for origin in range(4):
        group_err = {(f, r): rng.normal(0.0, 0.04) for f in range(3) for r in regions}
        for sku in range(60):
            family = sku % 3
            for region in regions:
                level_err = rng.normal(0.0, 0.12)
                base = rng.gamma(2.0, 25.0)
                for month in range(12):
                    mean = base * (1.0 + 0.1 * np.sin(month))
                    truth = mean * np.exp(level_err + group_err[(family, region)])
                    var = truth + 0.06 * truth**2
                    r = truth**2 / (var - truth)
                    actual = rng.negative_binomial(r, r / (r + truth))
                    rows.append((origin, f"S{sku}", region, f"F{family}", month, float(actual), mean))
    frame = pd.DataFrame(rows, columns=["origin", "sku_id", "region", "product_family", "month_idx", "actual", "mean"])
    frame["segment"] = "mature"
    return frame


def test_calibration_reaches_about_80_percent_coverage() -> None:
    frame = _simulated_backtest()
    unc = calibrate(frame, 1.0, {"Europe": 0.06, "India": 0.06, "Asia Pacific": 0.06})
    monthly = unc.coverage["monthly"]
    for level in ("series", "sku", "family_region"):
        assert 0.74 <= monthly[level]["coverage_p10_p90"] <= 0.86, (level, monthly[level])
    assert unc.cv_level["mature"] > 0 and unc.cv_group >= 0
    rows = with_components(frame, unc)
    assert (rows["var_noise"] > 0).all()
    # the error model was right, so the calibrated level error stays near the simulated 0.12
    assert 0.06 <= unc.cv_level["mature"] <= 0.2
    again = coverage(frame, unc)
    assert again == monthly
