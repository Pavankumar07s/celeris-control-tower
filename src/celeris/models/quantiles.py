"""P10 / P50 / P90 for rows and for any aggregate (dossier 6.5, 6.6; docs/architecture.md, forecast contract).

Error model of an order forecast ``m`` (variance components of the contract):

- ``var_noise``: order noise, independent across rows: negative binomial with ``a x m + b[region] x m^2`` (noise is
  drawn once per order with a dispersion set by the region, dossier 4.10), times a calibration scale;
- ``cv_level``: relative sd of the series-level error, common to every month of a series (level estimation error and
  drift over 19 months);
- ``cv_group``: relative sd of the error shared by all series of a family x region (factor error: macro path,
  seasonality, events);
- ``cv_common``: relative sd of the error shared by every row (the period-level bias of a fold: the backtest folds are
  -1.2 % .. +1.1 % biased in total, an error no independent component can reproduce at total level).

Quantiles of an aggregate (any selection of rows) use a log-normal with the aggregate mean and variance::

    M = sum mean,   V = sum var_noise + sum_series (cv_level x sum mean_series)^2 + sum_groups (cv_group x sum mean_group)^2
                         + (cv_common x M)^2
    sigma^2 = ln(1 + V / M^2),  mu = ln M - sigma^2 / 2,  P_q = exp(mu + z_q sigma)   (0 when M = 0)

``aggregate_quantiles`` is the reference implementation the dashboard ports. Row quantiles are integers from a negative
binomial with the row's mean and total variance (Poisson if the variance does not exceed the mean), so
``p10 <= p50 <= p90`` always holds; structural zeros are 0 / 0 / 0. ``calibrate`` sets the components by the method of
moments on backtest residuals and then scales them (split-conformal) so that P10-P90 covers about 80 % of row actuals
(noise), on average of series 19-month totals and SKU x month aggregates (level error), of family x region x month
aggregates (group error) and of total x month aggregates (common error).
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field

import numpy as np
import pandas as pd
from scipy import stats

Z = {"p10": -1.2815515655446004, "p50": 0.0, "p90": 1.2815515655446004}
TARGET_COVERAGE = 0.80


def aggregate_quantiles(
    mean: np.ndarray,
    var_noise: np.ndarray,
    cv_level: np.ndarray,
    cv_group: np.ndarray,
    series_key: np.ndarray,
    group_key: np.ndarray,
    cv_common: float = 0.0,
) -> dict[str, float]:
    """P10 / P50 / P90 of the sum of the selected rows (contract formula, see module docstring).

    ``cv_level`` is constant within a series and ``cv_group`` within a family x region; the first value of each key
    is used.
    """
    mean = np.asarray(mean, dtype=float)
    total = float(mean.sum())
    if total <= 0:
        return {q: 0.0 for q in Z}
    frame = pd.DataFrame({"m": mean, "s": np.asarray(series_key), "g": np.asarray(group_key), "cl": np.asarray(cv_level, dtype=float), "cg": np.asarray(cv_group, dtype=float)})
    by_series = frame.groupby("s", sort=False).agg(m=("m", "sum"), cl=("cl", "first"))
    by_group = frame.groupby("g", sort=False).agg(m=("m", "sum"), cg=("cg", "first"))
    variance = float(np.sum(var_noise)) + float(((by_series["cl"] * by_series["m"]) ** 2).sum()) + float(((by_group["cg"] * by_group["m"]) ** 2).sum())
    variance += (cv_common * total) ** 2
    return lognormal_quantiles(np.array([total]), np.array([variance]))[0]


def lognormal_quantiles(total: np.ndarray, variance: np.ndarray) -> list[dict[str, float]]:
    """Log-normal P10 / P50 / P90 matching each (mean, variance) pair; 0 where the mean is 0."""
    total = np.asarray(total, dtype=float)
    with np.errstate(all="ignore"):
        sigma2 = np.log1p(np.where(total > 0, np.asarray(variance, dtype=float) / np.where(total > 0, total, 1.0) ** 2, 0.0))
        mu = np.log(np.where(total > 0, total, 1.0)) - sigma2 / 2
    sigma = np.sqrt(sigma2)
    out = []
    for k in range(len(total)):
        out.append({q: float(np.exp(mu[k] + z * sigma[k])) if total[k] > 0 else 0.0 for q, z in Z.items()})
    return out


def node_quantiles(frame: pd.DataFrame, node_keys: list[str]) -> pd.DataFrame:
    """Vectorised ``aggregate_quantiles`` for every node of ``node_keys`` (one call per group in one pass).

    ``frame`` needs ``mean``, ``var_noise``, ``cv_level``, ``cv_group``, ``series_key``, ``group_key`` and the node keys.
    """
    level_part = frame.groupby([*node_keys, "series_key"], sort=False).agg(m=("mean", "sum"), cl=("cv_level", "first"))
    level_var = ((level_part["cl"] * level_part["m"]) ** 2).groupby(level=list(range(len(node_keys)))).sum()
    group_part = frame.groupby([*node_keys, "group_key"], sort=False).agg(m=("mean", "sum"), cg=("cv_group", "first"))
    group_var = ((group_part["cg"] * group_part["m"]) ** 2).groupby(level=list(range(len(node_keys)))).sum()
    base = frame.groupby(node_keys, sort=False).agg(mean=("mean", "sum"), var_noise=("var_noise", "sum"))
    variance = base["var_noise"] + level_var.reindex(base.index).fillna(0.0) + group_var.reindex(base.index).fillna(0.0)
    if "cv_common" in frame.columns and len(frame):
        variance = variance + (float(frame["cv_common"].iloc[0]) * base["mean"]) ** 2
    total = base["mean"].to_numpy()
    with np.errstate(all="ignore"):
        sigma2 = np.log1p(np.where(total > 0, variance.to_numpy() / np.where(total > 0, total, 1.0) ** 2, 0.0))
        mu = np.log(np.where(total > 0, total, 1.0)) - sigma2 / 2
    out = base[["mean"]].copy()
    for q, z in Z.items():
        out[q] = np.where(total > 0, np.exp(mu + z * np.sqrt(sigma2)), 0.0)
    out["variance"] = variance
    return out


def row_quantiles(mean: np.ndarray, variance: np.ndarray) -> dict[str, np.ndarray]:
    """Integer P10 / P50 / P90 of a negative binomial with the given mean and variance (Poisson if variance <= mean)."""
    mean = np.asarray(mean, dtype=float)
    variance = np.asarray(variance, dtype=float)
    out = {q: np.zeros(len(mean)) for q in Z}
    positive = mean > 0
    over = positive & (variance > mean * (1 + 1e-9))
    poisson = positive & ~over
    with np.errstate(all="ignore"):
        r = np.where(over, mean**2 / np.where(over, variance - mean, 1.0), 1.0)
        p = np.where(over, r / (r + mean), 0.5)
    for q, z in Z.items():
        level = stats.norm.cdf(z)
        values = np.zeros(len(mean))
        values[over] = stats.nbinom.ppf(level, r[over], p[over])
        values[poisson] = stats.poisson.ppf(level, mean[poisson])
        out[q] = np.nan_to_num(values)
    out["p50"] = np.maximum(out["p50"], out["p10"])
    out["p90"] = np.maximum(out["p90"], out["p50"])
    return out


@dataclass
class Uncertainty:
    """Calibrated variance components (written to ``outputs/forecast/uncertainty.json``)."""

    noise_a: float
    noise_b: dict[str, float]  # per region
    noise_scale: float
    cv_level: dict[str, float]  # per lifecycle segment (mature / young / cold_start)
    cv_group: float
    cv_common: float = 0.0
    coverage: dict[str, dict] = field(default_factory=dict)
    method: str = ""

    def var_noise(self, mean: np.ndarray, region: np.ndarray) -> np.ndarray:
        b = np.array([self.noise_b.get(r, np.mean(list(self.noise_b.values()))) for r in region])
        return self.noise_scale * (self.noise_a * mean + b * mean**2)

    def cv_level_of(self, segment: np.ndarray) -> np.ndarray:
        return np.array([self.cv_level.get(s, self.cv_level["mature"]) for s in segment])

    def to_dict(self) -> dict:
        return asdict(self)


def lifecycle_segment(level_source: np.ndarray) -> np.ndarray:
    """mature / young / cold_start segment of a series for ``cv_level`` (from the structural level source)."""
    source = np.asarray(level_source, dtype=object)
    return np.where(source == "cold_start", "cold_start", np.where(np.isin(source, ["young_blend", "prior"]), "young", "mature"))


def noise_moments(demand: np.ndarray, fitted: np.ndarray, region: np.ndarray, regions: tuple[str, ...]) -> tuple[float, dict[str, float]]:
    """``var = a m + b[region] m^2`` by least squares of squared in-sample residuals on (m, m^2 x region)."""
    keep = ~np.isnan(demand) & ~np.isnan(fitted) & (fitted > 0)
    d, m, r = demand[keep], fitted[keep], region[keep]
    e2 = (d - m) ** 2
    columns = [m] + [np.where(r == name, m**2, 0.0) for name in regions]
    x = np.stack(columns, axis=1)
    w = 1.0 / (m + 0.06 * m**2) ** 2  # inverse variance of e^2 under the dossier's NB shape
    coef = np.linalg.lstsq(x * np.sqrt(w)[:, None], e2 * np.sqrt(w), rcond=None)[0]
    a = float(max(coef[0], 1.0))
    return a, {name: float(max(coef[k + 1], 1e-3)) for k, name in enumerate(regions)}


def row_variance(rows: pd.DataFrame) -> pd.Series:
    """Total variance of single rows: noise + (cv_level^2 + cv_group^2 + cv_common^2) x mean^2."""
    common = rows["cv_common"] if "cv_common" in rows.columns else 0.0
    return rows["var_noise"] + (rows["cv_level"] ** 2 + rows["cv_group"] ** 2 + common**2) * rows["mean"] ** 2


def with_components(frame: pd.DataFrame, unc: Uncertainty) -> pd.DataFrame:
    """Add ``var_noise``, ``cv_level``, ``cv_group``, ``series_key``, ``group_key`` to forecast rows.

    ``frame`` needs ``mean``, ``region``, ``sku_id``, ``product_family``, ``segment``.
    """
    out = frame.copy()
    out["var_noise"] = unc.var_noise(out["mean"].to_numpy(), out["region"].to_numpy())
    out["cv_level"] = unc.cv_level_of(out["segment"].to_numpy())
    out["cv_group"] = unc.cv_group
    out["cv_common"] = unc.cv_common
    out["series_key"] = out["sku_id"].astype(str) + "|" + out["region"].astype(str)
    out["group_key"] = out["product_family"].astype(str) + "|" + out["region"].astype(str)
    return out


COVERAGE_LEVELS: dict[str, list[str]] = {
    "series": ["origin", "sku_id", "region", "month_idx"],
    "sku": ["origin", "sku_id", "month_idx"],
    "family_region": ["origin", "product_family", "region", "month_idx"],
    "total": ["origin", "month_idx"],
}
TOTAL_LEVELS: dict[str, list[str]] = {
    "series": ["origin", "sku_id", "region"],
    "sku": ["origin", "sku_id"],
    "family_region": ["origin", "product_family", "region"],
    "total": ["origin"],
}


def coverage(frame: pd.DataFrame, unc: Uncertainty, levels: dict[str, list[str]] = COVERAGE_LEVELS) -> dict[str, dict]:
    """Share of node actuals inside [P10, P90] (and below P10 / above P90) per level; rows: non-zero scored rows.

    The series level of the monthly view uses the integer row quantiles; every other node the aggregate formula.
    """
    rows = with_components(frame, unc)
    out: dict[str, dict] = {}
    for level, keys in levels.items():
        if keys == COVERAGE_LEVELS["series"]:
            variance = row_variance(rows)
            q = row_quantiles(rows["mean"].to_numpy(), variance.to_numpy())
            actual = rows["actual"].to_numpy()
            low, high = q["p10"], q["p90"]
        else:
            nodes = node_quantiles(rows, keys)
            actual = rows.groupby(keys, sort=False)["actual"].sum().reindex(nodes.index).to_numpy()
            low, high = nodes["p10"].to_numpy(), nodes["p90"].to_numpy()
        inside = (actual >= low) & (actual <= high)
        out[level] = {
            "n": int(len(actual)),
            "coverage_p10_p90": round(float(inside.mean()), 4),
            "below_p10": round(float((actual < low).mean()), 4),
            "above_p90": round(float((actual > high).mean()), 4),
        }
    return out


def calibrate(frame: pd.DataFrame, noise_a: float, noise_b: dict[str, float]) -> Uncertainty:
    """Method-of-moments components from backtest residuals, then split-conformal scaling to 80 % coverage.

    ``frame``: non-zero scored backtest rows of the final model with ``origin``, ``mean`` (forecast), ``actual``,
    ``region``, ``sku_id``, ``product_family``, ``segment``.
    """
    unc = Uncertainty(noise_a, dict(noise_b), 1.0, {"mature": 0.0, "young": 0.0, "cold_start": 0.0}, 0.0, method="moments")
    rows = with_components(frame, unc)
    rows["err"] = rows["actual"] - rows["mean"]
    series = rows.groupby(["origin", "series_key"]).agg(e=("err", "sum"), m=("mean", "sum"), v=("var_noise", "sum"), seg=("segment", "first"))
    for segment in ("mature", "young", "cold_start"):
        part = series[series["seg"] == segment]
        if len(part) >= 5 and (part["m"] ** 2).sum() > 0:
            unc.cv_level[segment] = float(np.sqrt(max(((part["e"] ** 2) - part["v"]).sum() / (part["m"] ** 2).sum(), 0.0)))
    unc.cv_level["young"] = max(unc.cv_level["young"], unc.cv_level["mature"])
    unc.cv_level["cold_start"] = max(unc.cv_level["cold_start"], unc.cv_level["young"])
    series["lv"] = (np.array([unc.cv_level[s] for s in series["seg"]]) * series["m"]) ** 2
    groups = rows.groupby(["origin", "group_key"]).agg(e=("err", "sum"), m=("mean", "sum"), v=("var_noise", "sum"))
    level_var = series.reset_index().merge(rows[["origin", "series_key", "group_key"]].drop_duplicates(), on=["origin", "series_key"]).groupby(["origin", "group_key"])["lv"].sum()
    groups["lv"] = level_var.reindex(groups.index).fillna(0.0)
    unc.cv_group = float(np.sqrt(max(((groups["e"] ** 2) - groups["v"] - groups["lv"]).sum() / (groups["m"] ** 2).sum(), 0.0)))
    # split-conformal scaling: noise scale on rows, cv_level on SKU x month, cv_group on family x region x month
    base_level = dict(unc.cv_level)

    def scale_level(factor: float) -> Uncertainty:
        unc.cv_level = {key: value * factor for key, value in base_level.items()}
        return unc

    cache = CoverageCache(frame, noise_a, noise_b)
    for _ in range(3):
        _solve_scale(lambda s: _set(unc, noise_scale=s), cache, "rows", 0.2, 5.0)
        _solve_scale(scale_level, cache, "level_mix", 0.2, 4.0)
        _solve_scale(lambda s: _set(unc, cv_group=s), cache, "family_region", 0.0, 0.5)
        _solve_scale(lambda s: _set(unc, cv_common=s), cache, "total", 0.0, 0.2)
    unc.method = (
        "method of moments on backtest residuals, then split-conformal scaling: noise scale on rows, cv_level on the mean "
        "coverage of series 19-month totals and SKU x month, cv_group on family x region x month, cv_common on total x month"
    )
    unc.coverage = {"monthly": coverage(frame, unc), "horizon_total": coverage(frame, unc, TOTAL_LEVELS)}
    return unc


def _set(unc: Uncertainty, **values: float) -> Uncertainty:
    for key, value in values.items():
        setattr(unc, key, value)
    return unc


SEGMENTS = ("mature", "young", "cold_start")


class CoverageCache:
    """Precomputed node sums of one calibration frame: the coverage of any parameter set in a few vector operations.

    With the means fixed, a node's variance is ``noise_scale x N + sum_seg cv_level[seg]^2 x L[seg] + cv_group^2 x G``
    where ``N`` sums ``a m + b m^2`` over the node's rows, ``L[seg]`` sums the squared series totals of the series of
    segment ``seg`` inside the node and ``G`` the squared family x region totals.
    """

    def __init__(self, frame: pd.DataFrame, noise_a: float, noise_b: dict[str, float]) -> None:
        self.mean = frame["mean"].to_numpy(dtype=float)
        self.actual = frame["actual"].to_numpy(dtype=float)
        b = np.array([noise_b.get(r, np.mean(list(noise_b.values()))) for r in frame["region"]])
        self.noise = noise_a * self.mean + b * self.mean**2
        self.segment = frame["segment"].to_numpy()
        series = pd.factorize(pd.MultiIndex.from_frame(frame[["origin", "sku_id", "region"]]))[0]
        group = pd.factorize(pd.MultiIndex.from_frame(frame[["origin", "product_family", "region"]]))[0]
        self.levels: dict[str, dict[str, np.ndarray]] = {}
        for name, keys in (
            ("rows", COVERAGE_LEVELS["series"]),
            ("series_total", TOTAL_LEVELS["series"]),
            ("sku", COVERAGE_LEVELS["sku"]),
            ("family_region", COVERAGE_LEVELS["family_region"]),
            ("total", COVERAGE_LEVELS["total"]),
        ):
            node = pd.factorize(pd.MultiIndex.from_frame(frame[keys]))[0]
            n = node.max() + 1
            entry = {"actual": np.bincount(node, self.actual, n), "mean": np.bincount(node, self.mean, n), "noise": np.bincount(node, self.noise, n)}
            pair, pair_index = pd.factorize(node * (series.max() + 1) + series)
            pair_sum = np.bincount(pair, self.mean)
            pair_node = np.asarray(pair_index) // (series.max() + 1)
            pair_segment = pd.Series(self.segment).groupby(pair).first().to_numpy()
            for seg in SEGMENTS:
                entry[f"level_{seg}"] = np.bincount(pair_node, np.where(pair_segment == seg, pair_sum**2, 0.0), n)
            gpair, gpair_index = pd.factorize(node * (group.max() + 1) + group)
            entry["group"] = np.bincount(np.asarray(gpair_index) // (group.max() + 1), np.bincount(gpair, self.mean) ** 2, n)
            self.levels[name] = entry

    def coverage(self, unc: Uncertainty, level: str) -> float:
        if level == "level_mix":
            return (self.coverage(unc, "series_total") + self.coverage(unc, "sku")) / 2
        if level == "rows":
            cv2 = np.array([unc.cv_level.get(seg, 0.0) for seg in SEGMENTS])[pd.Categorical(self.segment, categories=SEGMENTS).codes] ** 2
            variance = unc.noise_scale * self.noise + (cv2 + unc.cv_group**2 + unc.cv_common**2) * self.mean**2
            q = row_quantiles(self.mean, variance)
            low, high = q["p10"], q["p90"]
            actual = self.actual
        else:
            e = self.levels[level]
            variance = unc.noise_scale * e["noise"] + unc.cv_group**2 * e["group"] + (unc.cv_common * e["mean"]) ** 2
            for seg in SEGMENTS:
                variance = variance + unc.cv_level.get(seg, 0.0) ** 2 * e[f"level_{seg}"]
            nodes = lognormal_bounds(e["mean"], variance)
            low, high = nodes
            actual = e["actual"]
        return float(((actual >= low) & (actual <= high)).mean())


def lognormal_bounds(total: np.ndarray, variance: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Vectorised log-normal P10 and P90 (0 where the mean is 0)."""
    with np.errstate(all="ignore"):
        sigma2 = np.log1p(np.where(total > 0, variance / np.where(total > 0, total, 1.0) ** 2, 0.0))
        mu = np.log(np.where(total > 0, total, 1.0)) - sigma2 / 2
    sigma = np.sqrt(sigma2)
    return np.where(total > 0, np.exp(mu + Z["p10"] * sigma), 0.0), np.where(total > 0, np.exp(mu + Z["p90"] * sigma), 0.0)


def _solve_scale(apply, cache: CoverageCache, level: str, low: float, high: float) -> float:
    """Bisection on one parameter so that the P10-P90 coverage of ``level`` reaches ``TARGET_COVERAGE``."""
    for _ in range(14):
        mid = (low + high) / 2
        value = cache.coverage(apply(mid), level)
        low, high = (mid, high) if value < TARGET_COVERAGE else (low, mid)
    final = (low + high) / 2
    apply(final)
    return final
