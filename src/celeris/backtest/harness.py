"""Rolling-origin backtest: expanding window, 19-month horizon, everything data-dependent refit per origin (dossier
6.7, 6.8, 9.1).

Origins (MF): A 2025-03 (final check), B 2024-10, C 2023-10, D 2022-10 (October-aligned like the real task) and E
2021-10 as an optional stress fold (it contains the chip shortage and precedes the MEA opening; reported, but not
used for decisions or averages). At each origin the demand state, one-offs, masks, cycles, lost accounts, levels,
seasonality, holiday depths, EV betas, macro paths and the cross-sectional prior are rebuilt from data up to the
origin (``celeris.models.context``); the macro indicators of the target months are the actual values (they are given
for the real forecast window). Forecasts are scored against the final unconstrained demand.

Per fold the harness computes: the baselines, the intermittent-demand methods, the cycle-aware naive, the structural
model and its experiment variants (dossier 9.1 questions), the global GBM (trained on structural forecasts made at
inner origins every 3 months from 2021-10 whose targets lie before the fold's origin), the equal-weight ensemble and an
in-hindsight oracle (the structural factors with each series' level fitted on the horizon itself: the noise floor of
this scoring set, used as the leakage check: an honest forecast must score above it).

The structural fits of the inner origins and the experiment variants that change the factor backfit run in worker
processes when ``workers > 1`` (``celeris.backtest.parallel``); every output is the same for any number of workers.
"""

from __future__ import annotations

import time
from collections.abc import Callable
from dataclasses import dataclass, field, replace

import numpy as np
import pandas as pd

from celeris.backtest.metrics import aggregate_wape, bias, score, wape
from celeris.backtest.parallel import drivers_rows, inner_task, make_pool, origin_base, variant_mean, variant_task
from celeris.cleaning.dates import month_label
from celeris.config import REGIONS
from celeris.anomalies.expectation import ONE_OFF_CHANNELS
from celeris.features.macro import driver_set_weights
from celeris.models.baselines import BASELINES
from celeris.models.context import ModelInputs
from celeris.models.gbm import GbmModel, importance, inner_origins, predict_gbm, train_gbm
from celeris.models.intermittent import intermittent_forecasts
from celeris.models.quantiles import noise_moments
from celeris.models.structural import StructuralConfig, predict, refit_levels, shares_factors

OUTER_ORIGINS = (74, 69, 57, 45)  # 2025-03, 2024-10, 2023-10, 2022-10
STRESS_ORIGIN = 33  # 2021-10
LADDER = (
    "naive",
    "seasonal_naive",
    "moving_average",
    "croston",
    "sba",
    "tsb",
    "adida",
    "imapa",
    "cycle_aware",
    "structural",
    "gbm",
    "ensemble",
)
ENSEMBLE_MIN_FOLDS = 3


def _variant(base: StructuralConfig, **changes: object) -> StructuralConfig:
    return replace(base, **changes)


def experiment_grid(base: StructuralConfig) -> dict[str, dict[str, StructuralConfig]]:
    """Structural variants answering the dossier 9.1 questions, plus component ablations (forecast value added)."""
    macro = base.macro
    return {
        "macro_form": {
            "capped_era1.0": base,
            "capped_era0.9": _variant(base, macro=replace(macro, era_factor=0.9)),
            "loglinear_era1.0": _variant(base, macro=replace(macro, soft_cap=False)),
            "loglinear_era0.9": _variant(base, macro=replace(macro, soft_cap=False, era_factor=0.9)),
            "capped_era1.0_gamma1.1": _variant(base, macro_gamma=1.1),
        },
        "macro_shrinkage": {
            "prior_sd0.06": base,
            "prior_sd0.03": _variant(base, macro=replace(macro, prior_sd=0.03)),
            "prior_sd0.12": _variant(base, macro=replace(macro, prior_sd=0.12)),
            "single_driver": _variant(base, macro=replace(macro, max_drivers=1)),
        },
        "level_window": {"W24": base, **{f"W{w}": _variant(base, level_window=w) for w in (18, 36, 48)}},
        "holiday_form": {
            "linear": base,
            "sqrt": _variant(base, holiday_form="sqrt"),
            "none": _variant(base, use_holidays=False),
        },
        "ev_beta_window": {
            "full_sample": base,
            "from_2023": _variant(base, ev_from_month=48),
            "off": _variant(base, use_ev=False),
        },
        "aftermarket_damping": {
            "estimated": base,
            "fixed0.37": _variant(base, macro=replace(macro, fixed_damping=0.37)),
            "fixed0.42": _variant(base, macro=replace(macro, fixed_damping=0.42)),
        },
        "eol_phaseout": {"graded": base, "none": _variant(base, use_phaseout=False)},
        "one_off_uplift": {"oem_t1_asof_share": base, "none": _variant(base, one_off_uplift=False)},
        "young_prior_n0": {"n0_2": base, "n0_0.5": _variant(base, young_n0=0.5), "n0_5": _variant(base, young_n0=5.0)},
        "components": {
            "full": base,
            "minus_season": _variant(base, use_season=False),
            "minus_holidays": _variant(base, use_holidays=False),
            "minus_macro": _variant(base, use_macro=False),
            "minus_ev": _variant(base, use_ev=False),
            "minus_eol_phaseout": _variant(base, use_phaseout=False),
            "minus_events": _variant(base, use_events=False),
            "minus_one_off_uplift": _variant(base, one_off_uplift=False),
        },
    }


def _subset(experiment: str, targets: pd.DataFrame) -> np.ndarray | None:
    """Rows an experiment targets specifically (scored on top of all rows)."""
    if experiment == "holiday_form":
        month = targets["month_idx"].to_numpy() % 12
        return targets["region"].isin(["Asia Pacific", "Middle East & Africa"]).to_numpy() & np.isin(month, [0, 1, 2, 3, 4])
    if experiment == "aftermarket_damping":
        return (targets["sales_channel"] == "Aftermarket").to_numpy()
    if experiment == "ev_beta_window":
        return targets["powertrain_application"].isin(["EV", "ICE"]).to_numpy()
    if experiment == "young_prior_n0":
        return targets["is_young"].to_numpy()
    if experiment == "eol_phaseout":
        return targets["months_to_eol"].between(0, 11).to_numpy()
    if experiment == "one_off_uplift":
        return targets["sales_channel"].isin(ONE_OFF_CHANNELS).to_numpy()
    return None


@dataclass
class FoldResult:
    """One outer fold: target rows with every model's forecast, experiments and diagnostics."""

    origin: int
    frame: pd.DataFrame
    experiments: list[dict] = field(default_factory=list)
    diagnostics: dict = field(default_factory=dict)


@dataclass
class BacktestResult:
    folds: dict[int, FoldResult]
    gbm_importance: pd.DataFrame
    drivers: pd.DataFrame
    noise: dict
    timings: dict[str, float]  # wall-clock seconds per origin: logged only, never written (outputs stay byte-stable)
    gbm_frames: dict[int, pd.DataFrame] = field(default_factory=dict)


def _score_row(origin: int, experiment: str, variant: str, frame: pd.DataFrame, pred: np.ndarray, subset: np.ndarray | None) -> list[dict]:
    rows = []
    scored = frame["is_scored"].to_numpy()
    parts = [("all", scored)] + ([("targeted", scored & subset)] if subset is not None else [])
    for name, mask in parts:
        part = frame[mask].assign(pred=pred[mask])
        a, f = part["actual"].to_numpy(), part["pred"].to_numpy()
        rows.append(
            {
                "origin": month_label(origin),
                "experiment": experiment,
                "variant": variant,
                "rows": name,
                "n_cells": int(mask.sum()),
                "wape": wape(a, f),
                "bias": bias(a, f),
                "score": score(a, f),
                "family_month_wape": aggregate_wape(part, ("product_family",)),
                "total_month_wape": aggregate_wape(part, ()),
            }
        )
    return rows


def oracle_floor(frame: pd.DataFrame, structural: np.ndarray) -> np.ndarray:
    """In-hindsight forecast: each series' structural forecast rescaled by sum actual / sum forecast on its own scored
    horizon rows (true level, estimated factors). Its WAPE is the noise floor of the scoring set."""
    scored = frame["is_scored"].to_numpy() & ~frame["zero"].to_numpy()
    s = frame["series_no"].to_numpy()
    num = pd.Series(np.where(scored, frame["actual"].fillna(0).to_numpy(), 0.0)).groupby(s).sum()
    den = pd.Series(np.where(scored, structural, 0.0)).groupby(s).sum()
    ratio = (num / den.replace(0, np.nan)).fillna(1.0)
    return structural * ratio.reindex(s).to_numpy()


def full_refits(experiments: dict[str, dict[str, StructuralConfig]], config: StructuralConfig) -> list[StructuralConfig]:
    """Distinct experiment configurations that need a full refit (the others share the base fit's factors)."""
    out: list[StructuralConfig] = []
    for variants in experiments.values():
        for cfg in variants.values():
            if cfg != config and not shares_factors(cfg, config) and cfg not in out:
                out.append(cfg)
    return out


def run_backtest_folds(
    inputs: ModelInputs,
    final: pd.DataFrame,
    config: StructuralConfig,
    outer: tuple[int, ...] = OUTER_ORIGINS,
    stress: int | None = STRESS_ORIGIN,
    with_experiments: bool = True,
    log: Callable[[str], None] = print,
    workers: int = 1,
) -> BacktestResult:
    """Run every fold (see module docstring). ``workers >= 2`` runs the inner-origin fits and the experiment refits in
    that many worker processes (``celeris.backtest.parallel``); the result does not depend on ``workers``."""
    timings: dict[str, float] = {}
    scored_origins = sorted(set(outer) | ({stress} if stress is not None else set()))
    grid = sorted(set(inner_origins(max(outer))) | set(scored_origins))
    gbm_frames: dict[int, pd.DataFrame] = {}
    folds: dict[int, FoldResult] = {}
    drivers: list[dict] = []
    noise_parts: list[tuple[np.ndarray, np.ndarray, np.ndarray]] = []
    experiments = experiment_grid(config) if with_experiments else {}
    refits = full_refits(experiments, config)
    pool = make_pool(workers, inputs, final)
    pending: dict = {}
    try:
        if pool is not None:  # queued in the order the loop below consumes them
            for origin in grid:
                if origin in scored_origins:
                    pending.update({(origin, cfg): pool.submit(variant_task, origin, cfg) for cfg in refits})
                else:
                    pending[origin] = pool.submit(inner_task, origin, config)
        for origin in grid:
            started = time.perf_counter()
            if origin not in scored_origins:
                if pool is not None:
                    gbm_frames[origin], rows = pending.pop(origin).result()
                else:
                    base = origin_base(inputs, final, origin, config)
                    gbm_frames[origin], rows = base.gbm_frame, drivers_rows(origin, base.fit)
                    del base
                drivers.extend(rows)
                timings[month_label(origin)] = round(time.perf_counter() - started, 1)
                log(f"backtest origin {month_label(origin)}: {timings[month_label(origin)]} s")
                continue
            base = origin_base(inputs, final, origin, config)
            ctx, fit, targets, structural = base.ctx, base.fit, base.targets, base.structural
            gbm_frames[origin] = base.gbm_frame
            drivers.extend(drivers_rows(origin, fit))
            frame = targets.copy()
            for name, function in BASELINES.items():
                frame[name] = function(ctx, targets)
            for name, values in intermittent_forecasts(ctx, targets).items():
                frame[name] = values
            frame["structural"] = structural["mean"].to_numpy()
            for column in ("level", "f_season", "f_holiday", "f_macro", "f_ev", "f_lifecycle", "f_event", "latent_mean"):
                frame[f"structural_{column}"] = structural[column].to_numpy()
            frame["structural_level_source"] = fit.level_source[targets["u"].to_numpy()]
            frame["oracle"] = oracle_floor(frame, frame["structural"].to_numpy())
            fold = FoldResult(origin, frame)
            cache: dict[StructuralConfig, np.ndarray] = {config: frame["structural"].to_numpy()}
            for experiment, variants in experiments.items():
                subset = _subset(experiment, frame)
                for variant, cfg in variants.items():
                    if cfg not in cache:
                        if shares_factors(cfg, config):
                            cache[cfg] = predict(refit_levels(fit, ctx, cfg), targets)["mean"].to_numpy()
                        elif pool is not None:
                            cache[cfg] = pending.pop((origin, cfg)).result()
                        else:
                            cache[cfg] = variant_mean(inputs, ctx, targets, cfg)
                    fold.experiments.extend(_score_row(origin, experiment, variant, frame, cache[cfg], subset))
            del cache
            for shade in (1.0, 0.985):
                fold.experiments.extend(_score_row(origin, "point_shading", f"c{shade:g}", frame, frame["structural"].to_numpy() * shade, None))
            p = ctx.state.panel
            regions = p.series["region"].to_numpy()
            recent = np.zeros(p.life.shape, dtype=bool)
            recent[:, max(origin - 35, 0) : origin + 1] = True
            usable = ctx.fit_cells & recent & (ctx.state.cycles.accum_span == 1)
            noise_parts.append((np.where(usable, ctx.demand, np.nan), np.where(usable, fit.fitted_history, np.nan), np.repeat(regions[:, None], p.life.shape[1], axis=1)))
            fold.diagnostics = {
                "factors": {
                    "lny_depth": round(fit.factors.lny_depth, 4),
                    "ramadan_depth": round(fit.factors.ramadan_depth, 4),
                    "ev_beta": {k: round(v, 5) for k, v in fit.factors.ev_beta.items()},
                    "steps": {k: round(v, 4) for k, v in fit.factors.steps.items()},
                    "strike_analog": None if fit.factors.strike_analog is None else round(fit.factors.strike_analog, 4),
                    "aftermarket_damping": None if fit.macro_paths is None else round(fit.macro_paths.damping, 4),
                    "aftermarket_fuel_per_sd": None if fit.macro_paths is None else round(fit.macro_paths.fuel, 4),
                },
                "level_sources": {str(k): int(v) for k, v in pd.Series(fit.level_source[: p.n_series]).value_counts().items()},
                "one_off_excess_share_oem_t1_36m": round(fit.one_off_share, 5),
                "family_drivers": {fam: " + ".join(f"{n}@{lag}" for n, lag in zip(d.indicators, d.lags, strict=True)) for fam, d in fit.macro_paths.drivers.items()} if fit.macro_paths else {},
                "family_driver_sets": driver_set_weights(fit.macro_paths) if fit.macro_paths else {},
                "backfit_iterations": len(fit.trace),
            }
            folds[origin] = fold
            timings[month_label(origin)] = round(time.perf_counter() - started, 1)
            log(f"backtest origin {month_label(origin)}: {timings[month_label(origin)]} s")
            del base, ctx, fit
    finally:
        if pool is not None:
            pool.shutdown(wait=True, cancel_futures=True)
    importances = []
    for origin, fold in folds.items():
        started = time.perf_counter()
        inner = [t for t in inner_origins(origin) if t in gbm_frames]
        train = [gbm_frames[t][gbm_frames[t]["month_idx"] <= origin] for t in inner]
        train = [part for part in train if len(part)]
        if not train:
            fold.frame["gbm"] = np.nan
            continue
        model: GbmModel = train_gbm(pd.concat(train, ignore_index=True))
        fold.frame["gbm"] = predict_gbm(model, gbm_frames[origin])
        fold.diagnostics["gbm_training_rows"] = model.n_rows
        fold.diagnostics["gbm_inner_origins"] = [month_label(t) for t in inner]
        importances.append(importance(model).assign(origin=month_label(origin)))
        timings[f"gbm {month_label(origin)}"] = round(time.perf_counter() - started, 1)
        log(f"backtest gbm {month_label(origin)}: {timings[f'gbm {month_label(origin)}']} s ({model.n_rows} rows)")
    for fold in folds.values():
        gbm = fold.frame["gbm"].to_numpy()
        fold.frame["ensemble"] = np.where(np.isnan(gbm), fold.frame["structural"], (fold.frame["structural"] + np.nan_to_num(gbm)) / 2)
    demand = np.concatenate([part[0].ravel() for part in noise_parts])
    fitted = np.concatenate([part[1].ravel() for part in noise_parts])
    region = np.concatenate([part[2].ravel() for part in noise_parts])
    a, b = noise_moments(demand, fitted, region, REGIONS)
    return BacktestResult(
        folds=folds,
        gbm_importance=pd.concat(importances, ignore_index=True) if importances else pd.DataFrame(),
        drivers=pd.DataFrame(drivers),
        noise={"a": a, "b": b},
        timings=timings,
        gbm_frames=gbm_frames,
    )


def ensemble_decision(folds: dict[int, FoldResult], outer: tuple[int, ...] = OUTER_ORIGINS) -> dict:
    """Keep the GBM member only if the equal-weight ensemble beats the structural model on WAPE + |bias| in at least
    ``ENSEMBLE_MIN_FOLDS`` of the outer folds (dossier 6.3 #4)."""
    wins = []
    detail = {}
    for origin in outer:
        rows = folds[origin].frame[folds[origin].frame["is_scored"]]
        if rows["gbm"].isna().all():
            continue
        base = score(rows["actual"], rows["structural"])
        ens = score(rows["actual"], rows["ensemble"])
        detail[month_label(origin)] = {"structural": round(base, 5), "ensemble": round(ens, 5), "ensemble_better": bool(ens < base)}
        wins.append(ens < base)
    keep = sum(wins) >= ENSEMBLE_MIN_FOLDS
    return {
        "members": ["structural", "gbm"] if keep else ["structural"],
        "final_model": "ensemble" if keep else "structural",
        "folds_improved": int(sum(wins)),
        "rule": f"keep a member only if it improves WAPE + |bias| in at least {ENSEMBLE_MIN_FOLDS} of {len(outer)} folds",
        "by_origin": detail,
    }


__all__ = [
    "LADDER",
    "OUTER_ORIGINS",
    "STRESS_ORIGIN",
    "BacktestResult",
    "FoldResult",
    "ensemble_decision",
    "experiment_grid",
    "full_refits",
    "oracle_floor",
    "run_backtest_folds",
]
