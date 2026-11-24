"""Exception inbox for planners (``exceptions.json``): the few series that need a human, each with a rule, a root
cause, a recommended action and the revenue at risk, ranked by that revenue.

Every number is computed from pipeline outputs; the sentence templates only phrase them. Revenue at risk is the
forecast-window USD that depends on the flagged judgement (stated per rule in ``RULES``) at the forecast's own
assumed prices.
"""

from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

from celeris.config import LAST_TRAIN_MONTH_IDX, REGIONS
from celeris.export.encode import Json, ints, nums, texts
from celeris.export.history import SeriesIndex, month_index, month_label

RULES: dict[str, dict[str, str]] = {
    "lost_account": {"title": "Lost account", "at_risk": "pre-loss monthly level x window months x price (revenue missed if the account returns)"},
    "window_event": {"title": "Event in the forecast window", "at_risk": "latent demand the event multiplier removes x price"},
    "recent_switch": {"title": "Recent customer switch", "at_risk": "|post - pre switch level| x window months x price"},
    "cold_start": {"title": "Cold start (planned launch)", "at_risk": "whole forecast revenue of the series (prior-based)"},
    "end_of_life": {"title": "End of life in the window", "at_risk": "forecast revenue of the phase-out months (run-off timing)"},
    "yoy_shift": {"title": "Forecast vs last year beyond ±25 %", "at_risk": "|next 12 months - last 12 months| x price"},
    "backtest_bias": {"title": "Backtest bias beyond ±10 %", "at_risk": "|bias| x 19-month forecast revenue of the segment"},
    "history_quality": {"title": "Imputed recent history", "at_risk": "forecast revenue x share of the last 24 months imputed"},
}
YOY_THRESHOLD = 0.25
YOY_MIN_UNITS = 240.0
BIAS_THRESHOLD = 0.10
IMPUTED_MIN_MONTHS = 3
SWITCH_LOOKBACK = 24


@dataclass
class Row:
    rule: str
    series: int
    family: int
    region: int
    start: int
    end: int
    metric: float
    cause: str
    action: str
    units: float
    usd: float
    group: str


def _fmt(x: float) -> str:
    return f"{x:,.0f}"


def build_exceptions(index: SeriesIndex, f: pd.DataFrame, grid: pd.DataFrame, state: pd.DataFrame,
                     account_events: pd.DataFrame, cells: pd.DataFrame, events: pd.DataFrame,
                     series_buckets: pd.DataFrame) -> dict[str, Json]:
    t = index.table.set_index("idx")
    fam_of = {i: index.families.index(v) for i, v in t["product_family"].items()}
    reg_of = {i: REGIONS.index(v) for i, v in t["region"].items()}
    f = f.assign(rev=f["forecast"] * f["price_usd"])
    by_series = f.groupby("series")
    window_rev = by_series["rev"].sum()
    window_start = by_series["month_idx"].min()
    window_end = by_series["month_idx"].max()
    g = grid.assign(series=index.idx_of(grid["sku_id"], grid["region"]))
    rows: list[Row] = []

    def add(rule: str, series: int, metric: float, cause: str, action: str, units: float, usd: float, group: str,
            start: int | None = None, end: int | None = None, family: int | None = None, region: int | None = None) -> None:
        rows.append(Row(rule, series, fam_of[series] if family is None else family, reg_of[series] if region is None else region,
                        int(window_start.get(series, LAST_TRAIN_MONTH_IDX + 1)) if start is None else start,
                        int(window_end.get(series, LAST_TRAIN_MONTH_IDX + 19)) if end is None else end,
                        float(metric), cause, action, float(units), float(usd), group))

    # lost accounts
    for _, s in state[state["is_lost_account"]].iterrows():
        sid = int(s["series_no"])
        part = f[f["series"] == sid]
        level = float(s["pre_loss_level"])
        add("lost_account", sid, level,
            f"No orders since {s['lost_since']} ({int(s['trailing_silent_months'])} silent months); pre-loss level "
            f"{level:,.1f} units/month. Forecast is 0 for all {len(part)} window months.",
            "Confirm with sales that the account is lost; if it returns, restore the pre-loss level.",
            level * len(part), float((level * part["price_usd"]).sum()), "Lost accounts")

    # events starting inside the window, with the multiplier the model applies through f_event (1.00 = none)
    window_events = events[events["in_forecast_window"]
                           & (events["start_month"].map(month_index) > LAST_TRAIN_MONTH_IDX)
                           & events["event_type"].isin(["Customer Event", "Disruption", "Supply Constraint", "Logistics"])]
    for _, ev in window_events.iterrows():
        months = range(month_index(ev["start_month"]), month_index(ev["end_month"]) + 1)
        scope = f["month_idx"].isin(months)
        for column, key in (("customer", "scope_customer"), ("region", "scope_region"), ("product_family", "scope_family"),
                            ("sales_channel", "scope_channel")):
            if isinstance(ev[key], str):
                scope &= f[column] == ev[key]
        hit = f[scope & (f["f_event"] > 0)]
        removed = hit["latent_mean"] / hit["f_event"] - hit["latent_mean"]
        for sid, part in hit.assign(removed=removed, removed_usd=removed * hit["price_usd"]).groupby("series"):
            mult = float(part["f_event"].mean())
            add("window_event", int(sid), mult,
                f"{ev['event_id']} {ev['description']} ({ev['start_month']}..{ev['end_month']}): latent demand x{mult:.2f}, "
                f"{_fmt(abs(part['removed'].sum()))} units {'removed' if part['removed'].sum() > 0 else 'added'}.",
                "Confirm dates and any catch-up with the customer; review the event multiplier.",
                float(part["removed"].sum()), float(abs(part["removed_usd"].sum())), f"{ev['event_id']} {ev['scope_value']}",
                start=min(months), end=max(months))

    # recent customer switches
    recent = account_events[(account_events["event_type"] == "customer_switch")
                            & (account_events["month"].map(month_index) > LAST_TRAIN_MONTH_IDX - SWITCH_LOOKBACK)]
    for _, e in recent.iterrows():
        sid = int(e["series_no"])
        n = len(f[f["series"] == sid])
        price = float(f.loc[f["series"] == sid, "price_usd"].mean()) if n else 0.0
        delta = abs(float(e["level_after"]) - float(e["level_before"]))
        add("recent_switch", sid, float(e["level_ratio"]),
            f"Customer changed from {e['before']} to {e['after']} in {e['month']}; level x{float(e['level_ratio']):.2f} "
            f"({float(e['level_before']):,.1f} -> {float(e['level_after']):,.1f} units/month).",
            "Verify the post-switch run-rate with the new customer before release.",
            delta * n, delta * n * price, "Recent customer switches")

    # cold starts and end of life
    for sid, part in g[g["is_cold_start"]].groupby("series"):
        first = part.iloc[0]
        add("cold_start", int(sid), float(window_rev.get(sid, 0.0)),
            f"Planned launch {first['launch_date']} replacing {first['replaces_sku']}; no history, so the forecast "
            f"({_fmt(f.loc[f['series'] == sid, 'forecast'].sum())} units) rests on a launch prior.",
            "Approve the launch prior, ramp and customer / channel assumptions.",
            float(f.loc[f["series"] == sid, "forecast"].sum()), float(window_rev.get(sid, 0.0)), "Cold starts (planned launches)")
    eol = g[g["eol_date"].notna() & (g["is_eol_phaseout"] | g["is_post_eol"])]
    for sid, part in eol.groupby("series"):
        phase = f[(f["series"] == sid) & f["month_idx"].isin(part.loc[part["is_eol_phaseout"], "month_idx"])]
        post = int(part["is_post_eol"].sum())
        first = part.iloc[0]
        add("end_of_life", int(sid), float(post),
            f"EOL {first['eol_date']}: {len(phase)} phase-out months forecast at {_fmt(phase['forecast'].sum())} units, "
            f"{post} months after EOL forecast at 0.",
            "Confirm the EOL date and last orders with the customer; align the successor ramp.",
            float(phase["forecast"].sum()), float(phase["rev"].sum()), "End of life",
            start=int(part["month_idx"].min()), end=int(part["month_idx"].max()))

    # forecast vs last year, net of the rules above
    flagged = {r.series for r in rows}
    last12 = cells[cells["month_idx"] > LAST_TRAIN_MONTH_IDX - 12].groupby("series_no")["demand_filled"].agg(["sum", "size"])
    next12 = f[f["month_idx"] <= LAST_TRAIN_MONTH_IDX + 12].groupby("series").agg(units=("forecast", "sum"), price=("price_usd", "mean"))
    for sid, row in next12.iterrows():
        if sid in flagged or sid not in last12.index or last12.at[sid, "size"] < 12:
            continue
        hist = float(last12.at[sid, "sum"])
        if hist < YOY_MIN_UNITS:
            continue
        change = float(row["units"]) / hist - 1
        if abs(change) > YOY_THRESHOLD:
            add("yoy_shift", int(sid), change,
                f"Next 12 months {_fmt(row['units'])} units vs {_fmt(hist)} in the last 12 ({change:+.0%}).",
                "Review the drivers (level, macro, events) before releasing the forecast.",
                float(row["units"]) - hist, abs(float(row["units"]) - hist) * float(row["price"]), "Forecast vs last year",
                start=LAST_TRAIN_MONTH_IDX + 1, end=LAST_TRAIN_MONTH_IDX + 12)

    # backtest bias by family x region (final model, all horizons)
    sb = series_buckets.assign(family=series_buckets["series"].map(fam_of), region=series_buckets["series"].map(reg_of))
    seg = sb.groupby(["family", "region"]).agg(actual=("actual", "sum"), err=("err", "sum"), n=("n", "sum"))
    f_seg = f.assign(family=f["series"].map(fam_of), region_i=f["series"].map(reg_of)).groupby(["family", "region_i"])["rev"].sum()
    for (fam, reg), s in seg.iterrows():
        bias = float(s["err"]) / float(s["actual"]) if s["actual"] else 0.0
        if abs(bias) > BIAS_THRESHOLD:
            usd = abs(bias) * float(f_seg.get((fam, reg), 0.0))
            rows.append(Row("backtest_bias", -1, int(fam), int(reg), LAST_TRAIN_MONTH_IDX + 1, LAST_TRAIN_MONTH_IDX + 19, bias,
                            f"{index.families[int(fam)]} x {REGIONS[int(reg)]}: backtest bias {bias:+.1%} over {int(s['n']):,} cells.",
                            "Check the level and seasonality of this segment; consider a segment-level correction.",
                            0.0, usd, "Backtest bias by family x region"))

    # imputed recent history
    recent_cells = cells[cells["month_idx"] > LAST_TRAIN_MONTH_IDX - 24]
    imputed = recent_cells.groupby("series_no")["is_imputed"].sum()
    for sid, k in imputed[imputed >= IMPUTED_MIN_MONTHS].items():
        share = float(k) / 24
        add("history_quality", int(sid), float(k),
            f"{int(k)} of the last 24 months are imputed (missing rows or unknown ERP quantities).",
            "Treat the level with caution; confirm recent orders in the ERP.",
            0.0, share * float(window_rev.get(sid, 0.0)), "Imputed recent history")

    rows.sort(key=lambda r: (-r.usd, r.rule, r.series))
    return {
        "rules": RULES,
        "rule": [r.rule for r in rows], "series": ints([r.series for r in rows]),
        "family": ints([r.family for r in rows]), "region": ints([r.region for r in rows]),
        "start": ints([r.start for r in rows]), "end": ints([r.end for r in rows]),
        "start_label": [month_label(r.start) for r in rows],
        "metric": nums([r.metric for r in rows], 4), "cause": texts([r.cause for r in rows]),
        "action": texts([r.action for r in rows]), "impact_units": nums([r.units for r in rows], 1),
        "revenue_at_risk": nums([r.usd for r in rows], 0), "group": texts([r.group for r in rows]),
    }


def series_bucket_frame(bundle_buckets: dict[str, Json], final: str) -> pd.DataFrame:
    """The final model's per-series error sums from the backtest bundle, as a frame."""
    return pd.DataFrame({"series": bundle_buckets["series"], "actual": bundle_buckets["actual"],
                         "err": bundle_buckets["err"][final], "n": bundle_buckets["n"]}).astype(float).assign(
        series=lambda d: d["series"].astype(int)).fillna(0.0)

