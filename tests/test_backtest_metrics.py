"""Backtest metrics and fold structure (docs/architecture.md "Metrics"; dossier 6.7): WAPE and bias definitions,
aggregation before the error, metric-table slices, the negative-binomial noise floor, the oracle and the target rows
of a fold."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from celeris.backtest.harness import oracle_floor
from celeris.backtest.metrics import aggregate_wape, bias, metric_table, score, wape
from celeris.backtest.stage import nb_mean_abs_dev


def test_wape_and_bias_definitions() -> None:
    a = np.array([10.0, 0.0, 30.0])
    f = np.array([12.0, 5.0, 24.0])
    assert wape(a, f) == pytest.approx((2 + 5 + 6) / 40)
    assert bias(a, f) == pytest.approx((41 - 40) / 40)
    assert score(a, f) == pytest.approx(13 / 40 + 1 / 40)
    assert np.isnan(wape(np.zeros(2), np.ones(2)))


def test_errors_are_taken_after_aggregation() -> None:
    frame = pd.DataFrame({"sku_id": ["A", "A"], "region": ["x", "y"], "month_idx": [5, 5], "actual": [10.0, 10.0], "pred": [15.0, 5.0]})
    assert wape(frame["actual"], frame["pred"]) == pytest.approx(0.5)
    assert aggregate_wape(frame, ("sku_id",)) == pytest.approx(0.0)  # errors cancel inside the SKU


def _fold(n: int = 400, seed: int = 1) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    frame = pd.DataFrame(
        {
            "sku_id": rng.choice(["A", "B", "C", "D"], n),
            "region": rng.choice(["Europe", "India"], n),
            "product_family": rng.choice(["F1", "F2"], n),
            "sales_channel": rng.choice(["Direct OEM", "Aftermarket"], n),
            "month_idx": rng.integers(70, 89, n),
            "cycle_kind": rng.choice(["M", "B"], n),
            "intermittency": "smooth",
            "actual": rng.gamma(2.0, 20.0, n),
            "is_scored": rng.random(n) > 0.05,
            "final_lost_tail": rng.random(n) < 0.02,
            "final_one_off": rng.random(n) < 0.01,
            "final_event_masked": False,
        }
    )
    frame["horizon"] = frame["month_idx"] - 69
    frame["pred"] = frame["actual"] * rng.uniform(0.7, 1.3, n)
    return frame


def test_metric_table_levels_and_slices() -> None:
    frame = _fold()
    table = metric_table(frame, "2024-10", "m")
    scored = frame[frame["is_scored"]]
    row = table[(table["level"] == "series") & (table["slice_type"] == "all")].iloc[0]
    assert row["wape"] == pytest.approx(wape(scored["actual"], scored["pred"]))
    assert row["bias"] == pytest.approx(bias(scored["actual"], scored["pred"]))
    assert row["n_cells"] == len(scored)
    total = table[(table["level"] == "total") & (table["slice_type"] == "all")].iloc[0]
    assert total["wape"] == pytest.approx(aggregate_wape(scored, ()))
    assert total["wape"] <= row["wape"]
    family = table[(table["level"] == "series") & (table["slice_type"] == "family")]
    assert family["actual_sum"].sum() == pytest.approx(scored["actual"].sum())
    assert set(table["slice_type"]) == {"all", "family", "region", "channel", "horizon", "horizon_bucket", "calendar_month", "cycle_kind", "intermittency", "subset"}
    subset = table[(table["slice_type"] == "subset") & (table["level"] == "series")].set_index("slice_value")
    assert subset.loc["all_scored", "n_cells"] == len(scored)
    assert subset.loc["excl_lost_and_one_offs", "n_cells"] == int((~scored["final_lost_tail"] & ~scored["final_one_off"]).sum())


def test_nb_mean_absolute_deviation_matches_simulation() -> None:
    rng = np.random.default_rng(4)
    for mean, variance in ((3.0, 4.0), (40.0, 40.0 + 0.06 * 1600), (150.0, 150 + 0.05 * 150**2)):
        r = mean**2 / (variance - mean)
        draws = rng.negative_binomial(r, r / (r + mean), 400_000)
        assert nb_mean_abs_dev(np.array([mean]), np.array([variance]))[0] == pytest.approx(np.abs(draws - mean).mean(), rel=0.01)


def test_oracle_rescales_each_series_to_its_horizon_total() -> None:
    frame = pd.DataFrame(
        {
            "series_no": [0, 0, 0, 1, 1],
            "actual": [10.0, 20.0, np.nan, 5.0, 0.0],
            "is_scored": [True, True, False, True, True],
            "zero": [False, False, False, False, True],
        }
    )
    structural = np.array([15.0, 15.0, 15.0, 10.0, 0.0])
    oracle = oracle_floor(frame, structural)
    assert oracle[:2].sum() == pytest.approx(30.0)
    assert oracle[3] == pytest.approx(5.0) and oracle[4] == 0.0
