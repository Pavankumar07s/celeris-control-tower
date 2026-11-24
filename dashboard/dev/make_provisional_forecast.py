"""DEV ONLY: provisional stand-ins for the modelling outputs, so the dashboard can be built before they exist.

Writes files with exactly the schemas of the contract in ``docs/architecture.md`` ("Contracts for the modelling and
dashboard builds") to ``outputs/_provisional/{forecast,backtest,features}/``. It never touches ``outputs/forecast``,
``outputs/backtest`` or ``outputs/features``. ``celeris export`` uses a real file whenever it exists and falls back to
these only for the missing ones, stamping ``provisional: true`` in the bundle metadata, so the UI shows a badge.

The numbers are simple, honest baselines computed from the pipeline outputs, not a model:

* forecast: cycle-aware naive. Latent level = last-12-month unconstrained demand (one-offs at expectation) divided by a
  region x channel x calendar-month index; lifecycle (EOL phase-out, post-EOL, cold-start ramp, lost accounts) and the
  Orion Driveline shutdown (x0.15) applied; orders placed on the projected ordering cycle of ``test_grid.parquet``
  with ``order(t) = sum weight x latent``. Noise: negative binomial by region; ``cv_level`` / ``cv_group`` fixed.
* backtest: the naive, seasonal-naive and cycle-aware baselines on three rolling origins; the "final" model is the
  cycle-aware baseline (no real model exists yet).
* macro lead/lag: correlations of 12-month log growth of family demand with 12-month changes of each indicator.
* macro sensitivity: each SKU gets its family's first dossier driver at 0.18 log points per standard deviation.

Run: ``.venv/bin/python dashboard/dev/make_provisional_forecast.py`` from the project root.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

from celeris.config import PROJECT_ROOT, REGIONS
from celeris.io import write_csv, write_json, write_parquet

OUT = PROJECT_ROOT / "outputs"
PROV = OUT / "_provisional"
N_HIST = 94  # 2019-01 .. 2026-10
N_ALL = 113  # .. 2028-05
Z90 = 1.2815515655446004
NB_SIZE = {"North America": 18.0, "Europe": 17.0, "Asia Pacific": 15.0, "India": 12.0, "Latin America": 10.0,
           "Middle East & Africa": 9.0}
CV_LEVEL = 0.12
CV_GROUP = 0.04
EOL_PHASEOUT = {5: 0.90, 4: 0.81, 3: 0.71, 2: 0.61, 1: 0.52, 0: 0.42}  # dossier 5.3 (LM.v linear fit)
RAMP_TAU = 4.6  # dossier 5.4
PRICE_RISE = {2026: 1.0, 2027: 1.045, 2028: 1.045 * 1.04}  # EV-059 / EV-065
FAMILY_DRIVER = {  # dossier 4.7: first driver of each family set, at its lag
    "Brake & Safety Systems": ("auto_production_yoy_pct", 1),
    "Chassis & Structural": ("auto_production_yoy_pct", 2),
    "Electrical Assemblies": ("new_vehicle_orders_index", 2),
    "Hydraulic Systems": ("ism_manufacturing_pmi", 2),
    "Precision Machined Parts": ("ism_manufacturing_pmi", 2),
    "Powertrain Components": ("auto_production_yoy_pct", 3),
    "Thermal Management": ("auto_production_yoy_pct", 2),
}
INDICATORS = ("ism_manufacturing_pmi", "auto_production_yoy_pct", "vehicle_inventory_days", "raw_material_cost_index",
              "new_vehicle_orders_index", "industrial_util_rate_pct", "fuel_price_index", "ev_adoption_index")
SIGN = {"vehicle_inventory_days": -1.0, "raw_material_cost_index": 1.0}  # economic sign; others +1
ORIGINS = (62, 68, 74)  # 2024-03, 2024-09, 2025-03: every horizon 1..19 has an actual
MODELS = ("naive", "seasonal_naive", "cycle_aware", "final")


def month_label(idx: int) -> str:
    return f"{2019 + idx // 12}-{idx % 12 + 1:02d}"


def load() -> tuple[pd.DataFrame, pd.DataFrame]:
    cells = pd.read_parquet(OUT / "clean" / "train_clean.parquet", columns=[
        "series_no", "month_idx", "month", "region", "sales_channel", "product_family", "sku_id", "demand_filled",
        "demand_uc", "expected_demand", "is_one_off", "train_mask", "unit_price_usd", "accum_span", "carry_weight",
        "on_phase", "year"])
    grid = pd.read_parquet(OUT / "clean" / "test_grid.parquet")
    return cells, grid


def dense(cells: pd.DataFrame, column: str, n_series: int) -> np.ndarray:
    out = np.full((n_series, N_HIST), np.nan)
    out[cells["series_no"].to_numpy(), cells["month_idx"].to_numpy()] = cells[column].to_numpy(dtype=float)
    return out


def seasonal_index(cells: pd.DataFrame) -> dict[tuple[str, str], np.ndarray]:
    """Region x channel x calendar-month index (mean 1), from 2023-2026 demand."""
    recent = cells[cells["month_idx"] >= 48]
    out: dict[tuple[str, str], np.ndarray] = {}
    for (region, channel), part in recent.groupby(["region", "sales_channel"]):
        by_month = part.groupby("month")["demand_filled"].sum().reindex(range(1, 13)).to_numpy()
        out[(region, channel)] = by_month / by_month.mean()
    return out


def latent_level(cells: pd.DataFrame, n_series: int, season: dict[tuple[str, str], np.ndarray], origin: int,
                 meta: pd.DataFrame) -> np.ndarray:
    """Deseasonalised monthly level from the 12 months up to ``origin`` (one-offs at expectation)."""
    demand = np.where(cells["is_one_off"], cells["expected_demand"], cells["demand_filled"])
    frame = cells.assign(d=demand)
    window = frame[(frame["month_idx"] > origin - 12) & (frame["month_idx"] <= origin)]
    total = window.groupby("series_no")["d"].sum().reindex(range(n_series)).to_numpy()
    months = window.groupby("series_no")["month_idx"].count().reindex(range(n_series)).to_numpy()
    idx = np.stack([season[(r, c)] for r, c in zip(meta["region"], meta["sales_channel"], strict=True)])
    cal = (np.arange(origin - 11, origin + 1) % 12)
    weight = idx[:, cal].sum(axis=1)
    level = np.where(months > 0, total / np.where(months > 0, weight * months / 12.0, 1.0), 0.0)
    return np.nan_to_num(level)


def lognormal_quantiles(mean: np.ndarray, var: np.ndarray, z: float) -> np.ndarray:
    with np.errstate(divide="ignore", invalid="ignore"):
        sigma2 = np.log1p(var / np.square(mean))
        mu = np.log(mean) - sigma2 / 2
        q = np.exp(mu + z * np.sqrt(sigma2))
    return np.where(mean > 0, q, 0.0)


def make_forecast(cells: pd.DataFrame, grid: pd.DataFrame) -> pd.DataFrame:
    meta = cells.drop_duplicates("series_no").set_index("series_no").sort_index()
    n_series = len(meta)
    season = seasonal_index(cells)
    level = latent_level(cells, n_series, season, N_HIST - 1, meta)
    g = grid.copy()
    sno = g["series_no"].astype("Int64")
    known = sno.notna().to_numpy()
    s_idx = sno.fillna(0).astype(int).to_numpy()
    cal = g["month"].to_numpy() - 1
    f_season = np.array([season[(r, c)][m] for r, c, m in zip(g["region"], g["sales_channel"], cal, strict=True)])
    # cold starts: tail-tier family median level of the same region, ramped from launch
    tail_median = (pd.DataFrame({"lvl": level, "fam": meta["product_family"].to_numpy(),
                                 "reg": meta["region"].to_numpy()})
                   .groupby(["fam", "reg"])["lvl"].median())
    base = np.where(known, level[s_idx], [tail_median.get((f, r), 30.0) for f, r in
                                          zip(g["product_family"], g["region"], strict=True)])
    lifecycle = np.ones(len(g))
    ramp = 1 - np.exp(-(g["months_since_launch"].to_numpy() + 1) / RAMP_TAU)
    lifecycle = np.where(g["is_cold_start"].to_numpy(), ramp, lifecycle)
    mte = g["months_to_eol"].astype("Float64").fillna(-99).astype(int).to_numpy()
    lifecycle = np.where(np.isin(mte, list(EOL_PHASEOUT)), [EOL_PHASEOUT.get(m, 1.0) for m in mte], lifecycle)
    lifecycle = np.where(g["is_post_eol"].to_numpy() | g["is_lost_account"].to_numpy(), 0.0, lifecycle)
    orion = ((g["customer"] == "Orion Driveline") & (g["region"] == "North America")
             & g["date"].isin(["2027-07", "2027-08"])).to_numpy()
    f_event = np.where(orion, 0.15, 1.0)
    ones = np.ones(len(g))
    latent = base * f_season * lifecycle * f_event
    g["latent_mean"] = latent
    # orders: own month + carried months (latent of carried train months = level x season)
    latent_by_key = dict(zip(zip(g["sku_id"], g["region"], g["month_idx"], strict=True), latent, strict=True))
    span = g["accum_span"].to_numpy()
    carry = g["carry_weight"].fillna(1.0).to_numpy()
    mean = np.zeros(len(g))
    for i in np.flatnonzero(span > 0):
        total = 0.0
        for j in range(int(span[i])):
            month = int(g["month_idx"].iat[i]) - j
            weight = 1.0 if j == 0 else carry[i]
            if month >= N_HIST:
                total += weight * latent_by_key[(g["sku_id"].iat[i], g["region"].iat[i], month)]
            else:
                total += weight * base[i] * season[(g["region"].iat[i], g["sales_channel"].iat[i])][month % 12]
        mean[i] = total
    mean = np.where(g["is_structural_zero"].to_numpy(), 0.0, mean)
    hist = dense(cells, "demand_filled", n_series)
    target = g["month_idx"].to_numpy()
    back12 = np.where(target - 12 < N_HIST, target - 12, target - 24)
    seasonal_naive = np.where(known, hist[s_idx, np.clip(back12, 0, N_HIST - 1)], 0.0)
    k = g["region"].map(NB_SIZE).to_numpy()
    var_noise = mean + np.square(mean) / k
    total_var = var_noise + np.square(CV_LEVEL * mean) + np.square(CV_GROUP * mean)
    p10 = np.floor(lognormal_quantiles(mean, total_var, -Z90))
    p50 = np.round(lognormal_quantiles(mean, total_var, 0.0))
    p90 = np.ceil(lognormal_quantiles(mean, total_var, Z90))
    p50 = np.maximum(p50, p10)
    p90 = np.maximum(p90, p50)
    price_2026 = (cells[cells["year"] == 2026].groupby("sku_id")["unit_price_usd"].last())
    predecessor = g["replaces_sku"].where(g["is_cold_start"], g["sku_id"])
    price = predecessor.map(price_2026).to_numpy() * g["year"].map(PRICE_RISE).to_numpy()
    return pd.DataFrame({
        "date": g["date"], "sku_id": g["sku_id"], "region": g["region"],
        "forecast": np.round(mean).astype("int64"),
        "mean": mean,
        "p10": p10.astype("int64"), "p50": p50.astype("int64"), "p90": p90.astype("int64"),
        "latent_mean": latent,
        "level": base, "f_season": f_season, "f_holiday": ones, "f_macro": ones, "f_ev": ones,
        "f_lifecycle": lifecycle, "f_event": f_event,
        "accum_span": g["accum_span"], "carry_weight": g["carry_weight"],
        "structural_zero_reason": g["structural_zero_reason"],
        "pred_cycle_naive": mean, "pred_seasonal_naive": np.nan_to_num(seasonal_naive),
        "var_noise": var_noise,
        "cv_level": np.full(len(g), CV_LEVEL), "cv_group": np.full(len(g), CV_GROUP),
        "price_usd": np.round(price, 2), "revenue_mean": mean * np.round(price, 2),
    })


def make_backtest(cells: pd.DataFrame) -> pd.DataFrame:
    meta = cells.drop_duplicates("series_no").set_index("series_no").sort_index()
    n_series = len(meta)
    season = seasonal_index(cells)
    hist = dense(cells, "demand_filled", n_series)
    actual_uc = dense(cells, "demand_uc", n_series)
    masked = dense(cells.assign(m=cells["train_mask"].notna().astype(float)), "m", n_series)
    span = dense(cells, "accum_span", n_series)
    carry = np.nan_to_num(dense(cells, "carry_weight", n_series), nan=1.0)
    present = ~np.isnan(hist)
    idx = np.stack([season[(r, c)] for r, c in zip(meta["region"], meta["sales_channel"], strict=True)])
    frames = []
    for origin in ORIGINS:
        level = latent_level(cells, n_series, season, origin, meta)
        window = hist[:, origin - 11:origin + 1]
        n_obs = (~np.isnan(window)).sum(axis=1)
        flat = np.where(n_obs > 0, np.nansum(window, axis=1) / np.maximum(n_obs, 1), 0.0)
        for h in range(1, 20):
            t = origin + h
            alive = present[:, t] & present[:, origin]
            back = t - 12 if t - 12 <= origin else t - 24
            preds = {
                "naive": flat,
                "seasonal_naive": np.nan_to_num(hist[:, back]),
            }
            cyc = np.zeros(n_series)
            for j in range(3):
                weight = np.where(j == 0, 1.0, carry[:, t])
                cyc += np.where(span[:, t] > j, weight * level * idx[:, (t - j) % 12], 0.0)
            preds["cycle_aware"] = cyc
            preds["final"] = cyc
            act = actual_uc[:, t]
            scored = alive & ~np.isnan(act) & (masked[:, t] == 0)
            k = meta["region"].map(NB_SIZE).to_numpy()
            var = cyc + np.square(cyc) / k + np.square((CV_LEVEL + CV_GROUP) * cyc)
            for model in MODELS:
                is_final = model == "final"
                frames.append(pd.DataFrame({
                    "origin": month_label(origin), "model": model,
                    "date": month_label(t), "sku_id": meta["sku_id"].to_numpy(), "region": meta["region"].to_numpy(),
                    "horizon": h, "actual": np.where(scored, act, np.nan), "pred": preds[model],
                    "is_scored": scored,
                    "p10": np.floor(lognormal_quantiles(cyc, var, -Z90)) if is_final else np.nan,
                    "p50": np.round(lognormal_quantiles(cyc, var, 0.0)) if is_final else np.nan,
                    "p90": np.ceil(lognormal_quantiles(cyc, var, Z90)) if is_final else np.nan,
                })[alive])
    return pd.concat(frames, ignore_index=True)


def backtest_metrics(pred: pd.DataFrame, cells: pd.DataFrame) -> pd.DataFrame:
    attrs = cells.drop_duplicates(["sku_id", "region"])[["sku_id", "region", "product_family", "sales_channel"]]
    p = pred[pred["is_scored"]].merge(attrs, on=["sku_id", "region"], how="left")
    p["bucket"] = pd.cut(p["horizon"], [0, 3, 6, 12, 19], labels=["1-3", "4-6", "7-12", "13-19"]).astype(str)
    rows = []
    keys_by_level = {"series": ["sku_id", "region", "date"], "family": ["product_family", "date"],
                     "region": ["region", "date"], "total": ["date"]}
    slices = {"all": None, "family": "product_family", "region": "region", "channel": "sales_channel",
              "horizon": "horizon", "horizon_bucket": "bucket"}
    for origin_label, part in [*p.groupby("origin"), ("mean", p)]:
        for model, mpart in part.groupby("model"):
            for level, keys in keys_by_level.items():
                for slice_type, column in slices.items():
                    if column is not None and column not in keys and level != "series":
                        continue
                    group_cols = [*keys, "origin"] + ([column] if column and column not in keys else [])
                    agg = mpart.groupby(group_cols, observed=True).agg(actual=("actual", "sum"), pred=("pred", "sum"),
                                                                       n=("actual", "size")).reset_index()
                    agg["abs"] = (agg["pred"] - agg["actual"]).abs()
                    agg["err"] = agg["pred"] - agg["actual"]
                    groups = [("all", agg)] if column is None else list(agg.groupby(column, observed=True))
                    for value, g in groups:
                        a = g["actual"].sum()
                        rows.append({"origin": origin_label, "model": model, "level": level, "slice_type": slice_type,
                                     "slice_value": str(value), "n_cells": int(g["n"].sum()), "actual_sum": a,
                                     "pred_sum": g["pred"].sum(), "abs_err_sum": g["abs"].sum(),
                                     "wape": g["abs"].sum() / a if a else np.nan,
                                     "bias": g["err"].sum() / a if a else np.nan})
    return pd.DataFrame(rows)


def leadlag(cells: pd.DataFrame) -> pd.DataFrame:
    macro = pd.read_csv(OUT / "clean" / "macro_clean.csv")
    hist_macro = macro.iloc[:N_HIST].reset_index(drop=True)
    fam = cells.groupby(["product_family", "month_idx"])["demand_filled"].sum().unstack(0)
    growth = np.log(fam).diff(12)
    rows = []
    eras = {"all": (12, N_HIST - 1), "2019-2022": (12, 47), "2023-2026": (48, N_HIST - 1)}
    for family in growth.columns:
        for indicator in INDICATORS:
            change = hist_macro[indicator].diff(12)
            best: dict[str, tuple[int, float]] = {}
            for era, (lo, hi) in eras.items():
                for lag in range(13):
                    x = change.shift(lag).iloc[lo:hi + 1]
                    y = growth[family].iloc[lo:hi + 1]
                    ok = x.notna() & y.notna()
                    corr = float(np.corrcoef(x[ok], y[ok])[0, 1]) if ok.sum() > 6 else np.nan
                    rows.append({"product_family": family, "indicator": indicator, "lag": lag, "corr": corr,
                                 "era": era, "is_driver": False})
                    if era == "all" and (indicator not in best or abs(corr) > abs(best[indicator][1])):
                        best[indicator] = (lag, corr)
    out = pd.DataFrame(rows)
    drivers = {(f, ind, lag) for f, (ind, lag) in FAMILY_DRIVER.items()}
    out["is_driver"] = [(f, i, lag) in drivers and e == "all" for f, i, lag, e in
                        zip(out["product_family"], out["indicator"], out["lag"], out["era"], strict=True)]
    return out


def sensitivity(cells: pd.DataFrame) -> pd.DataFrame:
    macro = pd.read_csv(OUT / "clean" / "macro_clean.csv").iloc[:N_HIST]
    skus = cells.drop_duplicates("sku_id")[["sku_id", "product_family"]]
    grid = pd.read_parquet(OUT / "clean" / "test_grid.parquet", columns=["sku_id", "product_family"])
    skus = pd.concat([skus, grid.drop_duplicates("sku_id")]).drop_duplicates("sku_id").sort_values("sku_id")
    rows = []
    for sku, family in zip(skus["sku_id"], skus["product_family"], strict=True):
        indicator, lag = FAMILY_DRIVER[family]
        beta = SIGN.get(indicator, 1.0) * 0.18 / float(macro[indicator].std())
        for group, damp in (("other", 1.0), ("aftermarket", 0.4)):
            rows.append({"sku_id": sku, "channel_group": group, "indicator": indicator, "lag": lag,
                         "beta": round(beta * damp, 6)})
    return pd.DataFrame(rows)


def main() -> None:
    cells, grid = load()
    forecast = make_forecast(cells, grid)
    write_parquet(forecast, PROV / "forecast" / "forecast.parquet")
    sub = forecast[["date", "sku_id", "region", "forecast"]].rename(columns={
        "date": "Date", "sku_id": "SKU_ID", "region": "Region", "forecast": "Units_Sold_Forecast"})
    write_csv(sub, PROV / "forecast" / "submission.csv")
    write_csv(sensitivity(cells), PROV / "forecast" / "macro_sensitivity.csv")
    write_json({"provisional": True, "cv_level": CV_LEVEL, "cv_group": CV_GROUP,
                "coverage": {"note": "provisional: not calibrated"}}, PROV / "forecast" / "uncertainty.json")
    pred = make_backtest(cells)
    write_parquet(pred, PROV / "backtest" / "predictions.parquet")
    metrics = backtest_metrics(pred, cells)
    write_csv(metrics, PROV / "backtest" / "metrics.csv")
    floor_cells = cells[(cells["month_idx"] >= 58) & cells["train_mask"].isna() & cells["demand_uc"].notna()]
    floor = float((floor_cells["expected_demand"] - floor_cells["demand_uc"]).abs().sum() / floor_cells["demand_uc"].sum())
    mean = metrics[(metrics["origin"] == "mean") & (metrics["level"] == "series") & (metrics["slice_type"] == "all")]
    ladder = [{"model": m, "wape": float(mean.loc[mean["model"] == m, "wape"].iat[0]),
               "bias": float(mean.loc[mean["model"] == m, "bias"].iat[0])} for m in MODELS]
    write_json({"provisional": True, "origins": [month_label(o) for o in ORIGINS], "ladder": ladder,
                "noise_floor_wape": round(floor, 4), "chosen_model": "final",
                "why": "provisional placeholder: the final model is the cycle-aware baseline"},
               PROV / "backtest" / "summary.json")
    write_csv(leadlag(cells), PROV / "features" / "macro_leadlag.csv")
    print(json.dumps({"forecast_rows": len(forecast), "forecast_total": int(forecast["forecast"].sum()),
                      "backtest_rows": len(pred), "ladder": ladder, "floor": floor}, indent=1))


if __name__ == "__main__":
    main()
