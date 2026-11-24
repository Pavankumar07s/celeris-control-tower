"""Target rows of a rolling-origin fold and of the real forecast (dossier 6.7).

A fold at origin ``T`` forecasts every cell of the training grid in months ``T+1 .. min(T+19, 2026-10)``. What is known
at the origin decides the structure of each row: the ordering cycle projected from the as-of state (on-phase flag,
accumulation span, carry weight; ``p_order < 0.5`` is a structural zero), lost accounts as of the origin (zero), and
series that start after the origin are cold starts (one month of latent demand every month). The actual is the
pipeline's final unconstrained demand (``demand_uc``); it is null where unknown (on-phase missing rows, ERP blanks,
D3 cells) and those rows are not scored.

Slices for the metrics come with each row: family, region, channel, horizon, calendar month, the cycle kind and the
Syntetos-Boylan intermittency class as of the origin, and flags from the final state (lost-account tail, one-off,
event-masked cell) for the with / without comparisons.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from celeris.anomalies.profile import sbc
from celeris.cleaning.dates import month_label
from celeris.features.calendar import HORIZON
from celeris.models.context import OriginContext

FINAL_COLUMNS = ("series_no", "month_idx", "demand_uc", "is_lost_account", "is_one_off", "train_mask")


def intermittency_class(ctx: OriginContext) -> np.ndarray:
    """SBC class per series on the as-of unconstrained demand over its life (None without demand)."""
    demand = ctx.demand
    known = ctx.state.panel.life & ~np.isnan(demand)
    return sbc(np.nan_to_num(demand), known)[2]


def backtest_targets(ctx: OriginContext, final: pd.DataFrame, horizon: int = HORIZON) -> pd.DataFrame:
    """Target rows of the fold at ``ctx.as_of`` (see module docstring); ``u`` = ``series_no``."""
    as_of = ctx.as_of
    last = min(as_of + horizon, final["month_idx"].max())
    cells = final[(final["month_idx"] > as_of) & (final["month_idx"] <= last)].copy()
    p = ctx.state.panel
    alive = np.flatnonzero(p.start <= as_of)
    projection = ctx.state.project(np.arange(as_of + 1, last + 1), alive)
    cells = cells.merge(projection, on=["series_no", "month_idx"], how="left", validate="one_to_one")
    frame = ctx.state.cycles.series.set_index("series_no")
    lost = frame["is_lost_account"].reindex(cells["series_no"]).fillna(False).to_numpy(dtype=bool)
    cold = cells["p_order"].isna().to_numpy()
    off = ~cold & (cells["p_order"].to_numpy(dtype=float) < 0.5)
    reason = np.select([lost, off], ["lost_account", "off_phase"], "")
    out = pd.DataFrame(
        {
            "origin": as_of,
            "series_no": cells["series_no"].to_numpy(),
            "u": cells["series_no"].to_numpy(),
            "month_idx": cells["month_idx"].to_numpy(),
            "horizon": cells["month_idx"].to_numpy() - as_of,
        }
    )
    out["date"] = out["month_idx"].map(month_label)
    series = p.series.set_index("series_no")
    for column in ("sku_id", "region", "product_family", "sales_channel", "powertrain_application", "sku_tier"):
        out[column] = series[column].reindex(out["series_no"]).to_numpy()
    kind = frame["cycle_kind"].reindex(out["series_no"]).to_numpy(dtype=object)
    out["cycle_kind"] = np.where(cold, "unknown", np.where(pd.isna(kind), "unknown", kind))
    sbc_class = intermittency_class(ctx)
    out["intermittency"] = pd.Series(sbc_class[out["series_no"].to_numpy()]).fillna("none").to_numpy()
    out["p_order"] = np.where(cold, np.nan, cells["p_order"].to_numpy(dtype=float))
    zero = lost | off
    out["accum_span"] = np.where(zero, 0, np.where(cold, 1, cells["accum_span"].fillna(0).to_numpy())).astype("int64")
    out["carry_weight"] = np.where(zero | cold, np.nan, cells["carry_weight"].to_numpy(dtype=float))
    out["zero"] = zero
    out["zero_reason"] = pd.Series(reason).replace("", None).to_numpy()
    out["is_cold_start"] = cold
    out["actual"] = cells["demand_uc"].to_numpy(dtype=float)
    out["is_scored"] = ~np.isnan(out["actual"].to_numpy())
    out["final_lost_tail"] = cells["is_lost_account"].to_numpy(dtype=bool)
    out["final_one_off"] = cells["is_one_off"].to_numpy(dtype=bool)
    out["final_event_masked"] = cells["train_mask"].notna().to_numpy() & ~out["final_lost_tail"] & ~out["final_one_off"]
    return out


def forecast_targets(test_grid: pd.DataFrame, n_history_series: int) -> pd.DataFrame:
    """Target rows of the real forecast in test.csv order; cold-start series get universe rows after the history.

    The cold-start universe rows follow the order of first appearance in the test grid (``cold_start_series``).
    """
    grid = test_grid.reset_index(drop=True)
    cold = cold_start_series(grid)
    key = dict(zip(zip(cold["sku_id"], cold["region"], strict=True), range(n_history_series, n_history_series + len(cold)), strict=True))
    u = np.where(
        grid["is_cold_start"].to_numpy(),
        [key.get((s, r), -1) for s, r in zip(grid["sku_id"], grid["region"], strict=True)],
        grid["series_no"].fillna(-1).to_numpy(dtype="int64"),
    )
    out = grid.copy()
    out["u"] = u.astype("int64")
    out["zero"] = grid["is_structural_zero"].to_numpy(dtype=bool)
    out["accum_span"] = np.where(out["zero"], 0, grid["accum_span"].to_numpy()).astype("int64")
    out["horizon"] = grid["month_idx"] - (grid["month_idx"].min() - 1)
    return out


def cold_start_series(test_grid: pd.DataFrame) -> pd.DataFrame:
    """One row per cold-start series of the test grid (first appearance order) with the attributes of the universe."""
    rows = test_grid[test_grid["is_cold_start"]].drop_duplicates(["sku_id", "region"])
    launch = rows["launch_date"].map(lambda v: (int(v[:4]) - 2019) * 12 + int(v[5:7]) - 1)
    eol = rows["eol_date"].map(lambda v: (int(v[:4]) - 2019) * 12 + int(v[5:7]) - 1 if isinstance(v, str) else np.nan)
    return pd.DataFrame(
        {
            "sku_id": rows["sku_id"].to_numpy(),
            "region": rows["region"].to_numpy(),
            "product_family": rows["product_family"].to_numpy(),
            "sales_channel": rows["sales_channel"].to_numpy(),
            "powertrain_application": rows["powertrain_application"].to_numpy(),
            # planned launches have no tier in the master (no train series); all three are tail-tier SKUs (dossier 5.4)
            "sku_tier": rows["sku_tier"].fillna("tail").to_numpy(),
            "launch_idx": launch.to_numpy(dtype="int64"),
            "eol_idx": eol.to_numpy(dtype="float64"),
            "customer": rows["customer"].to_numpy(),
        }
    )
