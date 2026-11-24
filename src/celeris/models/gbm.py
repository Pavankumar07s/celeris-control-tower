"""Global LightGBM member: a direct multi-horizon correction of the structural forecast (dossier 6.3 #2, MF 3.2-3.4).

Target and objective. For a forecast made at origin ``T'`` the target is the ratio ``actual / structural forecast`` of
an on-phase row divided by the overall ratio of sums of that origin (period bias removed), with sample weight = the
structural forecast and an L2 objective. Inside a leaf the fitted value is then a ratio of sums, so the model targets
the mean (no log target, no L1 / quantile objective, both of which under-forecast by 3-10 %). The prediction is
``structural x predicted ratio``; structural zeros stay exactly 0.

Training data (no leakage). For a fold at origin ``T`` the training rows come from structural forecasts made at inner
origins ``T' < T`` (every ``INNER_STEP`` months from 2021-10) whose target months are ``<= T``; every inner forecast
is itself an as-of fit (``celeris.models.context``). Horizon is a feature (direct multi-horizon).

Features: horizon, calendar month, accumulation span, the structural components (season, holiday, macro and EV
multipliers relative to the level window, lifecycle, event), level statistics at the origin (12 / 36 / all-history
levels and the cross-sectional prior relative to the 24-month level, recent in-sample residual ratios, usable months),
lifecycle position, intermittency statistics and categorical attributes (family, region, channel, powertrain, tier,
cycle kind). Never raw indicator levels (UTIL and EV leave the training range in the window) and never SKU, series or
customer identifiers.
"""

from __future__ import annotations

from dataclasses import dataclass

import lightgbm as lgb
import numpy as np
import pandas as pd

from celeris.anomalies.profile import sbc
from celeris.config import CHANNELS, REGIONS
from celeris.models.context import OriginContext
from celeris.models.structural import StructuralFit, accumulate

INNER_FIRST = 33  # 2021-10
INNER_STEP = 3
SEEDS = (11, 23, 37)
RATIO_CLIP = (0.0, 5.0)
MIN_PRED = 0.5
FAMILIES = (
    "Brake & Safety Systems",
    "Chassis & Structural",
    "Electrical Assemblies",
    "Hydraulic Systems",
    "Powertrain Components",
    "Precision Machined Parts",
    "Thermal Management",
)
CATEGORIES: dict[str, tuple[str, ...]] = {
    "product_family": FAMILIES,
    "region": REGIONS,
    "sales_channel": CHANNELS,
    "powertrain_application": ("EV", "ICE", "Universal"),
    "sku_tier": ("core", "tail"),
    "cycle_kind": ("M", "A", "B", "Q", "T", "unknown"),
    "level_source": ("window", "young_blend", "prior", "cold_start", "lost_account"),
}
NUMERIC = (
    "horizon",
    "calendar_month",
    "accum_span",
    "effective_span",
    "log_structural",
    "n_level_cells",
    "series_age",
    "months_to_eol",
    "f_season",
    "f_holiday",
    "f_macro",
    "f_ev",
    "f_lifecycle",
    "f_event",
    "ratio_level12",
    "ratio_level36",
    "ratio_level_all",
    "ratio_prior",
    "resid3",
    "resid6",
    "resid12",
    "one_offs12",
    "imputed12",
    "adi",
    "cv2",
)
FEATURES = (*NUMERIC, *CATEGORIES)
PARAMS = {
    "objective": "regression",
    "learning_rate": 0.05,
    "num_leaves": 31,
    "min_data_in_leaf": 300,
    "feature_fraction": 0.8,
    "bagging_fraction": 0.8,
    "bagging_freq": 1,
    "lambda_l2": 10.0,
    "num_threads": 4,
    "deterministic": True,
    "force_row_wise": True,
    "verbose": -1,
}
NUM_ROUNDS = 300


def inner_origins(last: int) -> list[int]:
    """Inner origins (every ``INNER_STEP`` months from 2021-10) strictly before ``last``."""
    return [t for t in range(INNER_FIRST, last, INNER_STEP)]


def series_statistics(ctx: OriginContext, fit: StructuralFit) -> pd.DataFrame:
    """Per history series at the origin: levels over 12 / 24 / 36 months / all history, residual ratios, counts."""
    p, cyc = ctx.state.panel, ctx.state.cycles
    as_of = ctx.as_of
    n = p.n_series
    cells = ctx.level_cells
    i, t = np.nonzero(cells)
    g = fit.g[:n]
    acc = accumulate(g, cyc.accum_span[i, t], cyc.carry_weight[i, t], i, t)
    d, w = ctx.demand[i, t], ctx.weight[i, t]
    out = pd.DataFrame(index=pd.Index(np.arange(n), name="series_no"))

    def level(months: int | None) -> np.ndarray:
        keep = np.ones(len(i), dtype=bool) if months is None else t > as_of - months
        num = np.bincount(i[keep], (w * d)[keep], minlength=n)
        den = np.bincount(i[keep], (w * acc)[keep], minlength=n)
        with np.errstate(all="ignore"):
            return np.where(den > 0, num / den, np.nan)

    base = level(24)
    with np.errstate(all="ignore"):
        out["ratio_level12"] = level(12) / base
        out["ratio_level36"] = level(36) / base
        out["ratio_level_all"] = level(None) / base
        out["ratio_prior"] = fit.prior_level[:n] / base
    fitted = fit.fitted_history
    for months in (3, 6, 12):
        keep = (t > as_of - months) & ~np.isnan(fitted[i, t])
        num = np.bincount(i[keep], d[keep], minlength=n)
        den = np.bincount(i[keep], fitted[i, t][keep], minlength=n)
        with np.errstate(all="ignore"):
            out[f"resid{months}"] = np.where(den > 0, num / den, np.nan)
    recent = np.zeros(p.life.shape, dtype=bool)
    recent[:, max(as_of - 11, 0) : as_of + 1] = True
    out["one_offs12"] = (ctx.one_offs.flags & recent).sum(axis=1)
    life_recent = (p.life & recent).sum(axis=1)
    with np.errstate(all="ignore"):
        out["imputed12"] = np.where(life_recent > 0, (ctx.state.filled.is_imputed & recent).sum(axis=1) / life_recent, np.nan)
    adi, cv2, _ = sbc(np.nan_to_num(ctx.demand), p.life & ~np.isnan(ctx.demand))
    out["adi"] = adi
    out["cv2"] = cv2
    return out


def feature_frame(ctx: OriginContext, fit: StructuralFit, targets: pd.DataFrame, structural: pd.DataFrame) -> pd.DataFrame:
    """GBM features for target rows (``targets`` with ``u``, ``series_no``, ``month_idx``, ``horizon``, ``accum_span``,
    ``carry_weight``, ``cycle_kind``; ``structural`` = ``celeris.models.structural.predict`` output)."""
    u = targets["u"].to_numpy(dtype="int64")
    universe = fit.universe
    stats = series_statistics(ctx, fit)
    out = pd.DataFrame(index=targets.index)
    out["horizon"] = targets["horizon"].to_numpy()
    out["calendar_month"] = targets["month_idx"].to_numpy() % 12 + 1
    span = targets["accum_span"].to_numpy(dtype=float)
    carry = np.nan_to_num(targets["carry_weight"].to_numpy(dtype=float), nan=1.0)
    out["accum_span"] = span
    out["effective_span"] = np.where(span > 0, 1 + (span - 1) * carry, 0.0)
    out["log_structural"] = np.log1p(structural["mean"].to_numpy())
    out["n_level_cells"] = fit.n_level_cells[u]
    out["series_age"] = np.clip(ctx.as_of - universe["start_idx"].to_numpy()[u], -24, 120)
    eol = universe["eol_idx"].to_numpy()[u]
    out["months_to_eol"] = np.where(np.isnan(eol), 99.0, np.clip(eol - targets["month_idx"].to_numpy(), -1, 36))
    for column in ("f_season", "f_holiday", "f_macro", "f_ev", "f_lifecycle", "f_event"):
        out[column] = structural[column].to_numpy()
    history = pd.Series(targets["series_no"]).fillna(-1).to_numpy(dtype="int64")
    ok = (history >= 0) & (history < len(stats))
    for column in stats.columns:
        values = np.full(len(targets), np.nan)
        values[ok] = stats[column].to_numpy()[history[ok]]
        out[column] = values
    attributes = {
        "product_family": universe["product_family"].to_numpy()[u],
        "region": universe["region"].to_numpy()[u],
        "sales_channel": universe["sales_channel"].to_numpy()[u],
        "powertrain_application": universe["powertrain_application"].to_numpy()[u],
        "sku_tier": universe["sku_tier"].astype(str).to_numpy()[u],
        "cycle_kind": targets["cycle_kind"].to_numpy(),
        "level_source": fit.level_source[u],
    }
    for column, values in attributes.items():
        lookup = {v: k for k, v in enumerate(CATEGORIES[column])}
        out[column] = np.array([lookup.get(v, -1) for v in values], dtype="int64")
    return out.loc[:, list(FEATURES)].astype("float32")


@dataclass(frozen=True)
class GbmModel:
    """Boosters of the seeds (equal-weight average of their predicted ratios)."""

    boosters: tuple[lgb.Booster, ...]
    n_rows: int

    def ratio(self, features: pd.DataFrame) -> np.ndarray:
        preds = [booster.predict(features.loc[:, list(FEATURES)], num_threads=PARAMS["num_threads"]) for booster in self.boosters]
        return np.clip(np.mean(preds, axis=0), *RATIO_CLIP)


def training_rows(frame: pd.DataFrame) -> pd.DataFrame:
    """Rows usable for training: scored, not a structural zero, structural forecast >= ``MIN_PRED``."""
    keep = frame["is_scored"].to_numpy(dtype=bool) & ~frame["zero"].to_numpy(dtype=bool) & (frame["structural"].to_numpy() >= MIN_PRED)
    return frame[keep]


def train_gbm(frame: pd.DataFrame) -> GbmModel:
    """Fit the seeds on training rows (``frame``: features + ``origin`` + ``structural`` + ``actual`` + ``is_scored`` +
    ``zero``).

    Each inner origin's ratios are divided by that origin's overall ratio of sums, so the model learns relative
    (cross-sectional, horizon, calendar) corrections and not the period-specific bias of the inner forecasts (without
    it the member inherited a +4 to +6 % bias; ``docs/modelling.md``).
    """
    rows = training_rows(frame)
    ratio = rows["actual"].to_numpy() / rows["structural"].to_numpy()
    totals = rows.groupby("origin")[["actual", "structural"]].sum()
    period = (totals["actual"] / totals["structural"]).reindex(rows["origin"]).to_numpy()
    target = np.clip(ratio / period, *RATIO_CLIP)
    weight = rows["structural"].to_numpy()
    categorical = [FEATURES.index(c) for c in CATEGORIES]
    boosters = []
    for seed in SEEDS:
        data = lgb.Dataset(rows.loc[:, list(FEATURES)], label=target, weight=weight, categorical_feature=categorical, free_raw_data=True)
        params = {**PARAMS, "seed": seed, "bagging_seed": seed, "feature_fraction_seed": seed}
        boosters.append(lgb.train(params, data, num_boost_round=NUM_ROUNDS))
    return GbmModel(tuple(boosters), len(rows))


def predict_gbm(model: GbmModel, frame: pd.DataFrame) -> np.ndarray:
    """``structural x predicted ratio``; 0 on structural zeros."""
    ratio = model.ratio(frame)
    out = frame["structural"].to_numpy() * ratio
    return np.where(frame["zero"].to_numpy(dtype=bool), 0.0, out)


def importance(model: GbmModel) -> pd.DataFrame:
    """Mean gain importance per feature across seeds (for the methodology write-up)."""
    gains = np.mean([b.feature_importance(importance_type="gain") for b in model.boosters], axis=0)
    return pd.DataFrame({"feature": list(FEATURES), "gain": gains / gains.sum()}).sort_values("gain", ascending=False, kind="stable")
