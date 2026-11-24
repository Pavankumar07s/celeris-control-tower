"""The ``backtest`` stage: rolling-origin evaluation, model choice and uncertainty calibration (dossier 6.3-6.8).

Writes, under ``outputs/backtest/``:

- ``predictions.parquet``: ``origin, model, date, sku_id, region, horizon, actual, pred, is_scored`` for every model of
  the ladder, the oracle (noise floor) and the final model, plus ``p10, p50, p90`` for the final model;
- ``metrics.csv``: WAPE, bias and sums by origin (and ``mean`` over the four decision folds) x model x level x slice;
- ``experiments.csv``: the structural variants answering the dossier 9.1 questions and the component ablations;
- ``macro_drivers_by_origin.csv``: the family macro drivers and lags selected at every origin (lag stability);
- ``gbm_importance.csv``; ``gbm_training.parquet`` (the inner-origin structural forecasts the GBM learns from) only
  when the GBM is an ensemble member;
- ``uncertainty_calibration.json``: the calibrated variance components (read by the ``forecast`` stage);
- ``summary.json``: the model ladder, noise floor and leakage check, ensemble decision, final model, coverage by
  level (in-sample calibrated and leave-one-origin-out), experiment decisions and per-origin diagnostics.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from scipy import stats

from celeris.backtest.harness import (
    LADDER,
    OUTER_ORIGINS,
    STRESS_ORIGIN,
    BacktestResult,
    ensemble_decision,
    run_backtest_folds,
)
from celeris.backtest.metrics import aggregate_wape, bias, mean_over_origins, metric_table, score, wape
from celeris.backtest.targets import FINAL_COLUMNS
from celeris.cleaning.dates import month_label
from celeris.config import Paths
from celeris.io import write_csv, write_json, write_parquet
from celeris.models.context import load_model_inputs
from celeris.models.quantiles import TOTAL_LEVELS, Uncertainty, calibrate, coverage, lifecycle_segment, row_quantiles, row_variance, with_components
from celeris.models.structural import StructuralConfig
from celeris.quality.checks import Check, invariant_check
from celeris.quality.stagelog import StageRecord, empty_fix_log, run_stage
from celeris.tables import read_train_clean

STAGE = "backtest"
MATERIAL_GAIN = 0.0005  # a variant replaces the default only if it lowers mean WAPE + |bias| by more than this
MODEL_LABELS = {
    "naive": "Naive: last-12-month mean",
    "seasonal_naive": "Seasonal naive",
    "moving_average": "Moving average (6 months)",
    "croston": "Croston",
    "sba": "SBA (Syntetos-Boylan)",
    "tsb": "TSB",
    "adida": "ADIDA",
    "imapa": "IMAPA",
    "cycle_aware": "Cycle-aware naive (24-month level)",
    "structural": "Structural multiplicative model",
    "gbm": "Global LightGBM (residual, direct multi-horizon)",
    "ensemble": "Equal-weight ensemble (structural + GBM)",
    "oracle": "Oracle: in-hindsight level (noise floor, not a forecast)",
    "final": "Final model (submitted)",
}
REPORTED = (*LADDER, "oracle", "final")
PREDICTION_COLUMNS = ("origin", "model", "date", "sku_id", "region", "horizon", "actual", "pred", "is_scored", "p10", "p50", "p90")


def run_backtest(paths: Paths) -> StageRecord:
    """Run the backtest stage and publish the quality files."""
    return run_stage(paths, STAGE, backtest_stage)


def nb_mean_abs_dev(mean: np.ndarray, variance: np.ndarray) -> np.ndarray:
    """``E|Y - mu|`` of a negative binomial with the given mean and variance (Poisson if variance <= mean).

    Uses ``E|Y - mu| = 2 mu (F(m; r, p) - F(m - 1; r + 1, p))`` with ``m = floor(mu)`` (from ``y f(y; r, p) = mu
    f(y - 1; r + 1, p)``).
    """
    mean = np.asarray(mean, dtype=float)
    variance = np.maximum(np.asarray(variance, dtype=float), mean * (1 + 1e-6))
    m = np.floor(mean)
    with np.errstate(all="ignore"):
        r = mean**2 / (variance - mean)
        p = r / (r + mean)
        out = 2 * mean * (stats.nbinom.cdf(m, r, p) - stats.nbinom.cdf(m - 1, r + 1, p))
    return np.where(mean > 0, np.nan_to_num(out), 0.0)


def calibration_rows(result: BacktestResult, origins: tuple[int, ...]) -> pd.DataFrame:
    """Non-zero scored rows of the final model in the given folds, with the columns ``calibrate`` needs."""
    parts = []
    for origin in origins:
        frame = result.folds[origin].frame
        keep = frame["is_scored"] & ~frame["zero"] & (frame["final"] > 0)
        part = frame.loc[keep, ["origin", "sku_id", "region", "product_family", "month_idx", "actual"]].copy()
        part["mean"] = frame.loc[keep, "final"].to_numpy()
        part["segment"] = lifecycle_segment(frame.loc[keep, "structural_level_source"].to_numpy())
        parts.append(part)
    return pd.concat(parts, ignore_index=True)


def leave_one_origin_out(result: BacktestResult, noise: dict) -> dict:
    """Coverage of each fold under components calibrated on the other three (out-of-sample coverage)."""
    out = {}
    for held in OUTER_ORIGINS:
        others = tuple(o for o in OUTER_ORIGINS if o != held)
        unc = calibrate(calibration_rows(result, others), noise["a"], noise["b"])
        test = calibration_rows(result, (held,))
        out[month_label(held)] = {"monthly": coverage(test, unc), "horizon_total": coverage(test, unc, TOTAL_LEVELS)}
    return out


def with_quantiles(frame: pd.DataFrame, unc: Uncertainty) -> pd.DataFrame:
    """Integer row quantiles of the final model (0 on structural zeros)."""
    rows = frame.assign(mean=frame["final"].to_numpy(), segment=lifecycle_segment(frame["structural_level_source"].to_numpy()))
    rows = with_components(rows, unc)
    q = row_quantiles(rows["mean"].to_numpy(), row_variance(rows).to_numpy())
    out = frame.copy()
    zero = frame["zero"].to_numpy(dtype=bool)
    for name in ("p10", "p50", "p90"):
        out[name] = np.where(zero, 0.0, q[name])
    return out


def predictions_long(result: BacktestResult) -> pd.DataFrame:
    """Long table of every reported model's forecasts (quantiles for the final model only)."""
    parts = []
    for origin, fold in sorted(result.folds.items()):
        frame = fold.frame
        base = frame[["date", "sku_id", "region", "horizon", "actual", "is_scored"]]
        for model in REPORTED:
            part = base.copy()
            part.insert(0, "model", model)
            part.insert(0, "origin", month_label(origin))
            part["pred"] = frame[model].to_numpy(dtype="float32")
            for q in ("p10", "p50", "p90"):
                part[q] = frame[q].to_numpy(dtype="float32") if model == "final" else np.float32(np.nan)
            parts.append(part)
    out = pd.concat(parts, ignore_index=True)
    out["actual"] = out["actual"].astype("float32")
    out["horizon"] = out["horizon"].astype("int8")
    for column in ("origin", "model", "date", "sku_id", "region"):
        out[column] = out[column].astype("str")
    return out.loc[:, list(PREDICTION_COLUMNS)]


def metrics_table(result: BacktestResult) -> pd.DataFrame:
    """``metrics.csv``: per fold (stress fold included) and the mean over the four decision folds."""
    parts = []
    for origin, fold in sorted(result.folds.items()):
        for model in REPORTED:
            frame = fold.frame.assign(pred=fold.frame[model].to_numpy())
            if frame["pred"].isna().all():
                continue
            parts.append(metric_table(frame, month_label(origin), model))
    table = pd.concat(parts, ignore_index=True)
    decision = table[table["origin"].isin([month_label(o) for o in OUTER_ORIGINS])]
    table = pd.concat([table, mean_over_origins(decision)], ignore_index=True)
    for column in ("actual_sum", "pred_sum", "abs_err_sum"):
        table[column] = table[column].round(3)
    for column in ("wape", "bias"):
        table[column] = table[column].round(6)
    return table


def ladder(result: BacktestResult) -> list[dict]:
    """Per model: WAPE, bias and WAPE + |bias| at every origin and averaged over the decision folds."""
    rows = []
    for model in REPORTED:
        by_origin = {}
        for origin, fold in sorted(result.folds.items()):
            f = fold.frame[fold.frame["is_scored"]]
            if f[model].isna().all():
                continue
            frame = f.assign(pred=f[model].to_numpy())
            by_origin[month_label(origin)] = {
                "wape": round(wape(f["actual"], f[model]), 5),
                "bias": round(bias(f["actual"], f[model]), 5),
                "score": round(score(f["actual"], f[model]), 5),
                "sku_month_wape": round(aggregate_wape(frame, ("sku_id",)), 5),
                "family_region_month_wape": round(aggregate_wape(frame, ("product_family", "region")), 5),
                "family_month_wape": round(aggregate_wape(frame, ("product_family",)), 5),
                "total_month_wape": round(aggregate_wape(frame, ()), 5),
            }
        decision = [by_origin[month_label(o)] for o in OUTER_ORIGINS if month_label(o) in by_origin]
        mean = {key: round(float(np.mean([d[key] for d in decision])), 5) for key in decision[0]} if decision else {}
        rows.append(
            {
                "model": model,
                "label": MODEL_LABELS.get(model, model),
                "wape": mean.get("wape"),
                "bias": mean.get("bias"),
                "score": mean.get("score"),
                "mean_over_decision_folds": mean,
                "by_origin": by_origin,
            }
        )
    return rows


def noise_floor(result: BacktestResult) -> dict:
    """Oracle (in-hindsight level) WAPE and the negative-binomial expected-absolute-deviation floor per origin."""
    out = {}
    for origin, fold in sorted(result.folds.items()):
        f = fold.frame[fold.frame["is_scored"]]
        nonzero = ~f["zero"].to_numpy()
        b = np.array([result.noise["b"].get(r, 0.06) for r in f["region"]])
        mu = f["oracle"].to_numpy()
        mad = nb_mean_abs_dev(mu, result.noise["a"] * mu + b * mu**2)
        out[month_label(origin)] = {
            "oracle_wape": round(wape(f["actual"], f["oracle"]), 5),
            "oracle_bias": round(bias(f["actual"], f["oracle"]), 5),
            "nb_floor_wape": round(float(mad[nonzero].sum() / f["actual"].sum()), 5),
            "final_wape": round(wape(f["actual"], f["final"]), 5),
            "final_above_oracle": bool(wape(f["actual"], f["final"]) > wape(f["actual"], f["oracle"])),
        }
    return out


def experiment_summary(experiments: pd.DataFrame) -> dict:
    """Per experiment and variant: mean WAPE, bias and WAPE + |bias| over the decision folds, and the best variant."""
    decision = experiments[(experiments["origin"].isin([month_label(o) for o in OUTER_ORIGINS])) & (experiments["rows"] == "all")]
    out = {}
    for experiment, part in decision.groupby("experiment", sort=True):
        variants = {}
        for variant, rows in part.groupby("variant", sort=False):
            variants[variant] = {
                "mean_wape": round(float(rows["wape"].mean()), 5),
                "mean_bias": round(float(rows["bias"].mean()), 5),
                "mean_score": round(float(rows["score"].mean()), 5),
                "mean_family_month_wape": round(float(rows["family_month_wape"].mean()), 5),
                "folds_better_than_default": None,
            }
        default = part.groupby("variant", sort=False)["score"].apply(list)
        first = list(variants)[0]
        for variant in variants:
            variants[variant]["folds_better_than_default"] = int(sum(a < b for a, b in zip(default[variant], default[first], strict=True)))
        best = min(variants, key=lambda v: variants[v]["mean_score"])
        gain = variants[first]["mean_score"] - variants[best]["mean_score"]
        targeted = experiments[(experiments["experiment"] == experiment) & (experiments["rows"] == "targeted") & experiments["origin"].isin([month_label(o) for o in OUTER_ORIGINS])]
        entry = {
            "default": first,
            "shipped_variant": first,  # the default of every experiment is the configuration that ships
            "best_by_mean_score": best,
            "gain_vs_default": round(gain, 5),
            "rule_indication": first if gain <= MATERIAL_GAIN else best,  # what the 0.0005 rule alone would pick
            "variants": variants,
        }
        if len(targeted):
            entry["targeted_rows"] = {v: round(float(r["score"].mean()), 5) for v, r in targeted.groupby("variant", sort=False)}
        out[experiment] = entry
    return out


def _why(decision: dict) -> str:
    if decision["final_model"] == "structural":
        return (
            f"the equal-weight ensemble with the GBM improved WAPE + |bias| in only {decision['folds_improved']} of "
            f"{len(OUTER_ORIGINS)} folds (rule: at least 3), so the structural model ships alone"
        )
    return f"the ensemble improved WAPE + |bias| in {decision['folds_improved']} of {len(OUTER_ORIGINS)} folds"


def backtest_stage(paths: Paths) -> StageRecord:
    """Body of the ``backtest`` stage (see module docstring)."""
    inputs = load_model_inputs(paths)
    final_cells = read_train_clean(paths, "anomalies").loc[:, list(FINAL_COLUMNS)]
    config = StructuralConfig()
    result = run_backtest_folds(inputs, final_cells, config)
    decision = ensemble_decision(result.folds)
    for fold in result.folds.values():
        fold.frame["final"] = fold.frame[decision["final_model"]].to_numpy()
    unc = calibrate(calibration_rows(result, OUTER_ORIGINS), result.noise["a"], result.noise["b"])
    loo = leave_one_origin_out(result, result.noise)
    for fold in result.folds.values():
        fold.frame = with_quantiles(fold.frame, unc)
    stress = calibration_rows(result, (STRESS_ORIGIN,)) if STRESS_ORIGIN in result.folds else None
    experiments = pd.DataFrame([row for fold in result.folds.values() for row in fold.experiments])
    floor = noise_floor(result)
    summary = {
        "origins": {"decision_folds": [month_label(o) for o in OUTER_ORIGINS], "stress_fold": month_label(STRESS_ORIGIN)},
        "scoring": "WAPE = sum|a - f| / sum a, bias = sum(f - a) / sum a, against the final unconstrained demand; cells with unknown demand are not scored",
        "ladder": ladder(result),
        "noise_floor": floor,
        "leakage_check": {
            "rule": "an honest forecast must score above the in-hindsight oracle of the same scoring set; tests/test_model_leakage.py checks that altering data after an origin leaves that origin's forecasts unchanged",
            "passed": bool(all(v["final_above_oracle"] for v in floor.values())),
        },
        "noise_floor_wape": round(float(np.mean([floor[month_label(o)]["oracle_wape"] for o in OUTER_ORIGINS])), 5),
        "chosen_model": decision["final_model"],
        "why": _why(decision),
        "ensemble": decision,
        "final_model": decision["final_model"],
        "shade": float(config.shade),
        "coverage": {
            "calibrated_on_all_decision_folds": unc.coverage,
            "leave_one_origin_out": loo,
            "stress_fold_2021_10": None if stress is None else {"monthly": coverage(stress, unc), "horizon_total": coverage(stress, unc, TOTAL_LEVELS)},
        },
        "experiments": experiment_summary(experiments),
        "diagnostics_by_origin": {month_label(o): f.diagnostics for o, f in sorted(result.folds.items())},
        "noise_moments": {"a": round(result.noise["a"], 4), "b_by_region": {k: round(v, 5) for k, v in result.noise["b"].items()}},
    }
    out = paths.outputs_dir / "backtest"
    calibration = {**unc.to_dict(), "noise_moments_source": "in-sample residuals of the structural fit at the decision folds (last 36 months)"}
    written = [
        write_parquet(predictions_long(result), out / "predictions.parquet"),
        write_csv(metrics_table(result), out / "metrics.csv"),
        write_csv(experiments.round(6), out / "experiments.csv"),
        write_csv(result.drivers, out / "macro_drivers_by_origin.csv"),
        write_csv(result.gbm_importance.round(6), out / "gbm_importance.csv"),
        write_json(calibration, out / "uncertainty_calibration.json"),
        write_json(summary, out / "summary.json"),
    ]
    if "gbm" in decision["members"]:  # the forecast stage retrains the member on every inner-origin forecast
        written.append(write_parquet(pd.concat(result.gbm_frames.values(), ignore_index=True), out / "gbm_training.parquet"))
    checks = backtest_checks(result, summary)
    headline = {
        "final_model": decision["final_model"],
        "ladder_mean": {row["model"]: row["mean_over_decision_folds"].get("score") for row in summary["ladder"]},
        "leakage_check_passed": summary["leakage_check"]["passed"],
    }
    return StageRecord(stage=STAGE, checks=checks, fix_log=empty_fix_log(), outputs=written, headline=headline)


def backtest_checks(result: BacktestResult, summary: dict) -> list[Check]:
    """Leakage check against the oracle, quantile order and fold completeness."""
    disorder = 0
    for fold in result.folds.values():
        f = fold.frame
        disorder += int(((f["p10"] > f["p50"]) | (f["p50"] > f["p90"])).sum())
    floor = summary["noise_floor"]
    return [
        invariant_check(
            check_id="BT-LEAKAGE-ORACLE", file="train.csv", rule="dossier 6.7",
            title="Every fold's final forecast scores above the in-hindsight oracle (noise floor of the scoring set)",
            description="; ".join(f"{k}: final {v['final_wape']:.4f} vs oracle {v['oracle_wape']:.4f}" for k, v in floor.items()),
            dimension="validity", unit="folds", checked=len(floor), violations_before=0,
            violations_after=sum(not v["final_above_oracle"] for v in floor.values()), action="summary.json leakage_check",
        ),
        invariant_check(
            check_id="BT-QUANTILE-ORDER", file="train.csv", rule="dossier 6.5",
            title="Backtest row quantiles are ordered", description=f"{disorder} rows with p10 > p50 or p50 > p90.",
            dimension="validity", unit="rows", checked=int(sum(len(f.frame) for f in result.folds.values())), violations_before=0,
            violations_after=disorder, action="predictions.parquet p10 / p50 / p90",
        ),
        invariant_check(
            check_id="BT-FOLDS", file="train.csv", rule="dossier 6.7",
            title="Rolling-origin folds with a 19-month horizon", description=f"folds: {sorted(month_label(o) for o in result.folds)}",
            dimension="completeness", unit="folds", checked=len(result.folds), violations_before=0,
            violations_after=int(any(f.frame["horizon"].max() != 19 for f in result.folds.values())), action="predictions.parquet",
            expected_key="backtest.folds",
        ),
    ]
