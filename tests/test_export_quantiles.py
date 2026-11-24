"""The export's aggregate-quantile function follows the contract formula and agrees with the modelling stage's
reference implementation (``celeris.models.quantiles.aggregate_quantiles``) when it is available."""

from __future__ import annotations

import math

import numpy as np
import pandas as pd
import pytest

from celeris.export.quantiles import Z_P10, Z_P90, aggregate_quantiles


def _rows(seed: int = 7, n_series: int = 12, months: int = 5) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    series = np.repeat(np.arange(n_series), months)
    mean = rng.gamma(2.0, 30.0, size=n_series * months)
    return pd.DataFrame({
        "series": series,
        "group": series % 3,
        "mean": mean,
        "var_noise": mean + mean**2 / 12.0,
        "cv_level": np.repeat(rng.uniform(0.05, 0.3, n_series), months),
        "cv_group": np.repeat(np.array([0.02, 0.05, 0.08])[np.arange(n_series) % 3], months),
    })


def test_formula_by_hand() -> None:
    rows = _rows()
    m = rows["mean"].sum()
    v = rows["var_noise"].sum()
    v += sum((g["cv_level"].iat[0] * g["mean"].sum()) ** 2 for _, g in rows.groupby("series"))
    v += sum((g["cv_group"].iat[0] * g["mean"].sum()) ** 2 for _, g in rows.groupby("group"))
    s2 = math.log1p(v / m**2)
    mu = math.log(m) - s2 / 2
    want = [math.exp(mu + z * math.sqrt(s2)) for z in (Z_P10, 0.0, Z_P90)]
    assert aggregate_quantiles(rows) == pytest.approx(want, rel=1e-12)


def test_zero_mean_gives_zero() -> None:
    rows = _rows().assign(mean=0.0, var_noise=0.0)
    assert aggregate_quantiles(rows) == [0.0, 0.0, 0.0]


def test_sum_of_quantiles_overstates_the_quantile_of_the_sum() -> None:
    rows = _rows()
    whole = aggregate_quantiles(rows)[2]
    per_series = sum(aggregate_quantiles(g)[2] for _, g in rows.groupby("series"))
    assert whole < per_series


def test_matches_reference_implementation() -> None:
    reference = pytest.importorskip("celeris.models.quantiles")
    rows = _rows(seed=3)
    got = aggregate_quantiles(rows)
    want = reference.aggregate_quantiles(rows["mean"].to_numpy(), rows["var_noise"].to_numpy(), rows["cv_level"].to_numpy(),
                                         rows["cv_group"].to_numpy(), rows["series"].to_numpy(), rows["group"].to_numpy())
    assert got == pytest.approx([want["p10"], want["p50"], want["p90"]], rel=1e-9)
