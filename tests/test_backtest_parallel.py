"""The backtest's worker pool (``celeris.backtest.parallel``) must not change any result: a fit run in a worker process
equals the same fit run in the calling process byte for byte, and only the experiment variants that change the factor
backfit are sent to the workers (the others reuse the base fit's factors)."""

from __future__ import annotations

import pandas as pd
import pytest

from celeris.backtest.harness import experiment_grid, full_refits
from celeris.backtest.parallel import WORKERS_ENV, default_workers, make_pool, variant_mean, variant_task
from celeris.backtest.targets import FINAL_COLUMNS, backtest_targets
from celeris.models.context import ModelInputs, load_model_inputs, origin_context
from celeris.models.structural import StructuralConfig, shares_factors
from celeris.tables import read_train_clean

ORIGIN = 69  # 2024-10, backtest origin B


@pytest.fixture(scope="module")
def inputs(pipeline_run) -> ModelInputs:
    return load_model_inputs(pipeline_run.paths)


@pytest.fixture(scope="module")
def final(pipeline_run) -> pd.DataFrame:
    return read_train_clean(pipeline_run.paths, "anomalies").loc[:, list(FINAL_COLUMNS)]


def test_full_refits_are_the_distinct_factor_changing_variants() -> None:
    config = StructuralConfig()
    refits = full_refits(experiment_grid(config), config)
    assert len(refits) == len(set(refits)) == 17
    assert config not in refits
    assert not any(shares_factors(cfg, config) for cfg in refits)
    variants = {cfg for variants in experiment_grid(config).values() for cfg in variants.values()}
    assert {cfg for cfg in variants if not shares_factors(cfg, config)} == set(refits)


def test_worker_count_comes_from_the_environment(monkeypatch) -> None:
    monkeypatch.setenv(WORKERS_ENV, "2")
    assert default_workers() == 2
    monkeypatch.setenv(WORKERS_ENV, "0")
    assert default_workers() == 1
    monkeypatch.delenv(WORKERS_ENV)
    assert 1 <= default_workers() <= 3
    assert make_pool(1, None, None) is None


def test_a_worker_reproduces_the_in_process_fit(inputs: ModelInputs, final: pd.DataFrame) -> None:
    """A full refit (no macro path: the quickest variant) in a ``forkserver`` worker that rebuilds the origin's context
    from the inputs it was given equals the in-process refit on the caller's context, bit for bit."""
    config = StructuralConfig(use_macro=False)
    ctx = origin_context(inputs, ORIGIN)
    local = variant_mean(inputs, ctx, backtest_targets(ctx, final), config)
    pool = make_pool(2, inputs, final)
    try:
        remote = pool.submit(variant_task, ORIGIN, config).result()
    finally:
        pool.shutdown()
    assert remote.dtype == local.dtype and remote.shape == local.shape
    assert remote.tobytes() == local.tobytes()
