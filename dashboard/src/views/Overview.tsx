// R1 Executive overview (both parts): KPI tiles, one continuous timeline from history into the forecast, mix shift
// by family / region / channel (last 12 actual vs next 12 forecast months) and the deterministic planner briefing.
import { useMemo, type ReactNode } from "react";
import { useApp } from "../app/context";
import { EChart } from "../charts/EChart";
import { timelineOption } from "../charts/timeline";
import { Card, Info, Kpi, TimelineLegend } from "../components/ui";
import { forecastAgg, forecastLatent, historyAgg, sum } from "../data/aggregate";
import { compact, fmtInt, fmtMeasure, fmtPct, fmtPts, fmtSignedPct, fmtUsd, monthName } from "../data/format";
import { useResource } from "../data/load";
import { historyPrice, selectRuns, selectSegments, type Filters, type Measure, type Model } from "../data/model";
import { lognormalQuantile, moments, Z10, Z90 } from "../data/quantiles";
import type { ExceptionFile, ForecastDetail, StockoutFile } from "../data/types";
import { briefing } from "../insights/briefing";

type MixDim = "family" | "region" | "channel";

function mixShares(m: Model, f: Filters, dim: MixDim, measure: Measure): { labels: string[]; last: number[]; next: number[] } {
  const labels = dim === "family" ? m.dims.families.name : dim === "region" ? m.dims.regions : m.dims.channels;
  const last = new Array(labels.length).fill(0);
  const next = new Array(labels.length).fill(0);
  const key = (s: number) => (dim === "family" ? m.sFamily[s] : dim === "region" ? m.sRegion[s] : m.sChannel[s]);
  const usd = measure === "usd";
  for (const g of selectSegments(m, f)) {
    const s = m.gSeries[g];
    for (let k = 0; k < m.gLen[g]; k++) {
      const t = m.gStart[g] + k;
      if (t < m.asOf - 11) continue;
      last[key(s)] += m.d[m.gOff[g] + k] * (usd ? historyPrice(m, m.sSku[s], t) : 1);
    }
  }
  for (const r of selectRuns(m, f)) {
    const s = m.rSeries[r];
    for (let k = 0; k < m.rLen[r]; k++) {
      const t = m.rStart[r] + k;
      if (t > m.asOf + 12) continue;
      next[key(s)] += m.fc[m.rOff[r] + k] * (usd ? m.price[m.rOff[r] + k] : 1);
    }
  }
  const tl = last.reduce((a, b) => a + b, 0) || 1;
  const tn = next.reduce((a, b) => a + b, 0) || 1;
  return { labels, last: last.map((x) => x / tl), next: next.map((x) => x / tn) };
}

function MixBar({ shares, colors, labels, onPick, title }: { shares: number[]; colors: string[]; labels: string[]; onPick: (i: number) => void; title: string }) {
  return (
    <div className="segbar" role="list" aria-label={title}>
      {shares.map((s, i) =>
        s > 0 ? (
          <div
            key={i}
            role="listitem"
            title={`${labels[i]}: ${fmtPct(s)}`}
            style={{ width: `${s * 100}%`, background: colors[i % colors.length], color: i === 3 ? "#0b0b0b" : "#fff" }}
            onClick={() => onPick(i)}
          >
            {s >= 0.115 ? fmtPct(s, 0) : ""}
          </div>
        ) : null,
      )}
    </div>
  );
}

export default function Overview() {
  const { m, theme, filters, measure, lens, setFilters, go } = useApp();
  const latent = lens === "latent";
  const detail = useResource<ForecastDetail>(latent ? "forecast_detail.json" : null);
  const stock = useResource<StockoutFile>("stockouts.json");
  const exc = useResource<ExceptionFile>("exceptions.json");

  const segs = useMemo(() => selectSegments(m, filters), [m, filters]);
  const runs = useMemo(() => selectRuns(m, filters), [m, filters]);
  const h = useMemo(() => historyAgg(m, segs, measure), [m, segs, measure]);
  const fc = useMemo(() => forecastAgg(m, runs, measure), [m, runs, measure]);
  const hUnits = useMemo(() => (measure === "units" ? h : historyAgg(m, segs, "units")), [m, segs, measure, h]);
  const fLatent = useMemo(() => (latent && detail.data ? forecastLatent(m, runs, detail.data, measure) : null), [latent, detail.data, m, runs, measure]);

  const option = useMemo(
    () =>
      timelineOption({
        m,
        theme,
        measure,
        lens,
        filters,
        hist: { shipped: latent ? h.latent : h.shipped, demand: latent ? h.latent : h.demand, imputed: h.imputed, cells: h.cells },
        fc: latent ? (fLatent ? { value: fLatent } : undefined) : { value: fc.fc, p10: fc.p10, p50: fc.p50, p90: fc.p90 },
      }),
    [m, theme, measure, lens, filters, h, fc, latent, fLatent],
  );

  // KPI arithmetic: totals over the 19 window months vs the last 19 actual months (unconstrained demand)
  const total19 = sum(fc.fc);
  const last19 = sum(h.demand, m.asOf - 18, m.asOf + 1);
  const mom = useMemo(() => moments(m, runs, () => true, measure === "usd"), [m, runs, measure]);
  const lo = lognormalQuantile(mom.M, mom.V, Z10);
  const hi = lognormalQuantile(mom.M, mom.V, Z90);
  const revenue = useMemo(() => forecastAgg(m, runs, "usd"), [m, runs]);
  const rev19 = sum(revenue.fc);
  const ladder = m.meta.backtest.ladder;
  const final = ladder.find((l) => l.model === m.meta.backtest.final);
  const baselines = ladder.filter((l) => l.model !== m.meta.backtest.final);
  const bestBase = baselines.length ? baselines.reduce((a, b) => (a.wape < b.wape ? a : b)) : null;
  const seasonal = ladder.find((l) => l.model === "seasonal_naive") ?? bestBase;
  const lost = useMemo(() => {
    if (!stock.data) return null;
    const c = stock.data.cells;
    const inSel = new Set(segs.map((g) => m.gSeries[g]));
    let u = 0;
    let usd = 0;
    for (let i = 0; i < c.series.length; i++) {
      if (!inSel.has(c.series[i])) continue;
      if (filters.customer !== null && !segs.some((g) => m.gSeries[g] === c.series[i] && c.month[i] >= m.gStart[g] && c.month[i] < m.gStart[g] + m.gLen[g])) continue;
      u += c.lost[i];
      usd += c.lost_usd[i];
    }
    return { u, usd };
  }, [stock.data, segs, m, filters.customer]);
  const fixed = sum(hUnits.fixed);
  const rebuilt = sum(hUnits.missing);
  const pa = m.meta.price_assumption.vs_2026_pct;

  const mixes = useMemo(() => (["family", "region", "channel"] as MixDim[]).map((dim) => ({ dim, ...mixShares(m, filters, dim, measure) })), [m, filters, measure]);
  const brief = useMemo(
    () => briefing({ m, filters, measure, h: hUnits, fc: measure === "units" ? fc : forecastAgg(m, runs, "units"), runs, mixes, exc: exc.data, lost, go, setFilters }),
    [m, filters, measure, hUnits, fc, runs, mixes, exc.data, lost, go, setFilters],
  );

  const unit = measure === "usd" ? "" : "units";
  return (
    <>
      <div className="kpis">
        <Kpi
          label="Forecast, next 19 months"
          value={fmtMeasure(total19, measure)}
          unit={unit}
          foot={
            <>
              P10–P90 {fmtMeasure(lo, measure, 2)} – {fmtMeasure(hi, measure, 2)} ·{" "}
              <span className={total19 >= last19 ? "delta-up" : "delta-down"}>{fmtSignedPct(total19 / last19 - 1)}</span> vs last 19 months
            </>
          }
          info={<Info what="Sum of the submitted forecast over Nov 2026 – May 2028 for the selection, with the P10–P90 range of that 19-month total." how="Range from the contract formula on the summed means, noise variances and shared level / family×region errors (never summed row quantiles). Change vs the unconstrained demand of the last 19 actual months." source="forecast.json" />}
        />
        <Kpi
          label="Forecast revenue, 19 months"
          value={fmtUsd(rev19)}
          foot={`At forecast prices: ${Object.entries(pa)
            .map(([y, p]) => `${y} ${p >= 0 ? "+" : ""}${p.toFixed(1)}%`)
            .join(", ")} vs 2026 (median)`}
          info={<Info what="Submitted units × the forecast's assumed invoice price per row." how="Price assumption read from the forecast file (median change vs each SKU's 2026 invoice price shown)." source="forecast.json (price_usd)" />}
        />
        <Kpi
          label="Backtest WAPE · final model"
          value={final ? fmtPct(final.wape) : "–"}
          foot={
            final && seasonal ? (
              <>
                vs {fmtPct(seasonal.wape)} seasonal naive · bias {fmtSignedPct(final.bias)}
              </>
            ) : (
              "no backtest"
            )
          }
          info={<Info what="Rolling-origin backtest, 19-month horizon, every SKU × region × month, pooled over all origins (all series)." how="WAPE = Σ|actual − forecast| / Σ actual on unconstrained demand; bias = Σ(forecast − actual) / Σ actual. See Forecast & accuracy for any filter." source="backtest.json / meta.json" />}
        />
        <Kpi
          label="Lost sales in history"
          value={lost ? fmtInt(lost.u) : "…"}
          unit="units"
          foot={lost ? `${fmtUsd(lost.usd)} never shipped (stock-outs)` : "loading stock-outs…"}
          info={<Info what="Units customers requested but Celeris never shipped, 2019-2026, for the selection: listed stock-outs plus imputed unlisted semiconductor months and detected hidden stock-outs." how="Lost units × invoice price of the month." source="stockouts.json (cells.lost)" />}
        />
        <Kpi
          label="History repaired"
          value={fmtInt(fixed)}
          unit="cells"
          foot={`numeric fixes · ${fmtInt(rebuilt)} missing rows rebuilt (not zeros)`}
          info={<Info what="Cells of the selection whose units, price or revenue were corrected (units ×10, cents, EUR, pack-of-10, sign…) and rows deleted from the extract that were rebuilt from the Record_ID grid." how="Flags on every history cell. Missing rows are never treated as zero demand." source="history.json (flags)" />}
        />
      </div>

      <Card
        title={`${latent ? "Latent monthly demand" : "Demand"} from history into the forecast · ${measure === "usd" ? "USD" : "units"} per month`}
        sub={latent ? "Each order spread over the months it carries: ordering-cycle zeros disappear, so history and forecast read as one smooth demand signal." : "Shipped history (cleaned), unconstrained demand where stock-outs censored it, and the submitted forecast with its P10–P90 range."}
        tools={<TimelineLegend latent={latent} />}
        info={<Info what="One continuous monthly timeline, 2019-01 to 2028-05. Left of the rule: what happened; right: what the forecast says. Event lane above the plot (hover for details; holidays appear when a region is selected)." how="Exact sums over the selected series. The P10–P90 band uses the contract's aggregate-quantile formula. Drag the slider to zoom." source="history.json, forecast.json, dims.json (events)" />}
      >
        {latent && detail.loading ? <div className="state">Loading latent demand…</div> : <EChart option={option} height={360} ariaLabel="Timeline of demand and forecast" />}
      </Card>

      <div className="grid g-2-1">
        <Card
          title="Planner briefing"
          sub="Generated from the bundle for the current selection — no hand-typed numbers, no language model."
          info={<Info what="Templated sentences over computed facts: forecast change, peak month, mix shift, window risks, exceptions, ordering-cycle zeros, lost sales and backtest accuracy." how="Every number is computed in the browser from the pipeline bundle for the active filters; links apply filters or open the relevant view." />}
        >
          <ul className="brief">
            {brief.map((b, i) => (
              <li key={i}>
                <span className="ic" aria-hidden="true">
                  {b.icon}
                </span>
                <span>{b.text as ReactNode}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card
          title="Mix shift"
          sub={`Share of ${measure === "usd" ? "revenue" : "units"}: last 12 actual months (top) vs next 12 forecast months (bottom). Click to filter.`}
          info={<Info what="100 % bars by family, region and channel: unconstrained demand Nov 2025 – Oct 2026 vs submitted forecast Nov 2026 – Oct 2027." how="Shares of the selection's total; the largest change is named in percentage points." source="history.json, forecast.json" />}
        >
          {mixes.every(({ dim }) => filters[dim] !== null) && <p className="small muted">Family, region and channel are all fixed by the filters: no mix to compare.</p>}
          {mixes.filter(({ dim }) => filters[dim] === null).map(({ dim, labels, last, next }) => {
            const delta = next.map((x, i) => x - last[i]);
            const k = delta.reduce((a, _, i) => (Math.abs(delta[i]) > Math.abs(delta[a]) ? i : a), 0);
            const colors = theme.cat;
            const pick = (i: number) => setFilters({ ...filters, [dim]: i, ...(dim === "family" ? { sku: null } : {}) });
            return (
              <div key={dim} style={{ marginBottom: 14 }}>
                <div className="toolbar small" style={{ justifyContent: "space-between", marginBottom: 4 }}>
                  <b style={{ textTransform: "capitalize" }}>{dim}</b>
                  <span className="muted">
                    largest shift: {labels[k]} {fmtPts(delta[k])}
                  </span>
                </div>
                <div className="mixrow">
                  <span>Last 12 m</span>
                  <MixBar shares={last} colors={colors} labels={labels} onPick={pick} title={`${dim} share, last 12 months`} />
                </div>
                <div className="mixrow">
                  <span>Next 12 m</span>
                  <MixBar shares={next} colors={colors} labels={labels} onPick={pick} title={`${dim} share, next 12 months`} />
                </div>
                <div className="legend" style={{ marginTop: 2 }}>
                  {labels.map((l, i) =>
                    last[i] > 0 || next[i] > 0 ? (
                      <span key={l}>
                        <i className="sw" style={{ background: colors[i % colors.length] }} />
                        {l} <span className="muted">{fmtPct(next[i], 0)}</span>
                      </span>
                    ) : null,
                  )}
                </div>
              </div>
            );
          })}
        </Card>
      </div>
      <p className="muted tiny">
        Peak forecast month for this selection: {monthName(m.months[m.w0 + fc.fc.indexOf(Math.max(...fc.fc))])} ({compact(Math.max(...fc.fc))} {measure === "usd" ? "USD" : "units"}). Structural-zero rows in the window: {fmtInt(sum(fc.zeros))} of {fmtInt(sum(fc.rows))}.
      </p>
    </>
  );
}
