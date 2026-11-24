// R1 Executive overview (both parts): the reference implementation of the editorial design system.
//  lede (computed headline + standfirst | hero: 19-month forecast with its range strip)
//  -> the annotated timeline from history into the forecast (units or revenue, range presets)
//  -> figure strip (revenue with sparkline, WAPE ladder, lost sales, history repaired)
//  -> the brief | where the change comes from (mix by region / family / channel) + top exceptions
//  -> outlook small multiples (moving annual total) -> colophon.
import { useCallback, useMemo, type ReactNode } from "react";
import { useApp } from "../app/context";
import { useMedia, useSelection } from "../app/hooks";
import { TimelineChart } from "../charts/TimelineChart";
import { rangePresets, rangeStart, timelineAnnotations, type RangePreset, type TimelineModel, type TimelineSpec, markPresence } from "../charts/timeline";
import { Button, LinkButton, MoreLink, RangePresets, RuleChip, Tabs } from "../components/controls";
import { Delta, Figure, FigureStrip, HeroFigure, Ladder, Lede, RangeStrip, Rich, Sparkline } from "../components/Figure";
import { Module, timelineKey } from "../components/Module";
import { Empty, Notice } from "../components/states";
import { BarTable } from "../components/tables";
import { breakdown, sharesOf, type BreakdownDim } from "../data/breakdown";
import { NO_FILTERS } from "../data/model";
import { forecastAgg, forecastLatent, historyAgg, sum } from "../data/aggregate";
import { fmt1, fmtInt, fmtMoney, fmtNum, fmtOnScale, fmtPct, fmtSignedPct, fmtValue, monthLong, monthName } from "../data/format";
import { useResource } from "../data/load";
import { lognormalQuantile, moments, Z10, Z90 } from "../data/quantiles";
import type { ExceptionFile, ForecastDetail, StockoutFile } from "../data/types";
import { actFact, briefing, exceptionRowsIn, ladderFacts, lostShare, riskFact } from "../insights/briefing";
import { ptsBetween } from "../insights/accuracy";
import { reasonShort, lastOrderPhrase } from "../insights/inbox";
import { repairFacts } from "../insights/health";
import { countWord, render, selectionWords } from "../insights/headlines";
import { CHANGE_TEMPLATES, OUTLOOK_TEMPLATES, OVERVIEW_TEMPLATES, TOP_TEMPLATES, changeDek, changeFacts, changeTitle, overviewFacts, timelineDek } from "../insights/overview";
import { firstForecastMonth } from "./g2/XRay";
import "./Overview.css";

const DIMS: BreakdownDim[] = ["region", "family", "channel"];
const DIM_LABEL: Record<BreakdownDim, string> = { region: "Region", family: "Family", channel: "Channel" };

export default function Overview() {
  const { m, theme, filters, measure, lens, params, setParam, setFilters, go } = useApp();
  const latent = lens === "latent";
  const usd = measure === "usd";
  const { segs, runs, series, single, h, fc } = useSelection();
  const detail = useResource<ForecastDetail>(latent ? "forecast_detail.json" : null);
  const stock = useResource<StockoutFile>("stockouts.json");
  const exc = useResource<ExceptionFile>("exceptions.json");

  // ---- aggregates in both measures (units for the brief and repairs, USD for the revenue figure)
  const hUnits = useMemo(() => (measure === "units" ? h : historyAgg(m, segs, "units")), [m, segs, measure, h]);
  const fcUnits = useMemo(() => (measure === "units" ? fc : forecastAgg(m, runs, "units")), [m, runs, measure, fc]);
  const hUsd = useMemo(() => (usd ? h : historyAgg(m, segs, "usd")), [m, segs, usd, h]);
  const fcUsd = useMemo(() => (usd ? fc : forecastAgg(m, runs, "usd")), [m, runs, usd, fc]);
  const fLatent = useMemo(() => (latent && detail.data ? forecastLatent(m, runs, detail.data, measure) : null), [latent, detail.data, m, runs, measure]);
  const mom = useMemo(() => moments(m, runs, () => true, usd), [m, runs, usd]);
  const p10 = lognormalQuantile(mom.M, mom.V, Z10);
  const p90 = lognormalQuantile(mom.M, mom.V, Z90);

  // ---- the lede
  const sel = useMemo(() => selectionWords(m, filters), [m, filters]);
  const facts = useMemo(
    () => overviewFacts({ m, sel, measure, latent, single: single !== null, demand: h.demand, fc: fc.fc, p10, p90 }),
    [m, sel, measure, latent, single, h.demand, fc.fc, p10, p90],
  );
  const headline = render(OVERVIEW_TEMPLATES.headline, facts).text;
  const standfirst = render(OVERVIEW_TEMPLATES.standfirst, facts).text;
  const fv = (v: number) => fmtValue(v, measure);

  // ---- the timeline
  // phones default to "Since <year>" so the 19 forecast months are not squeezed into a sliver of a 2019–2028 axis
  const phone = useMedia("(max-width: 640px)");
  const defRange: RangePreset = single !== null || phone ? "recent" : "all";
  const tlParam = params.get("tl");
  const range = (["all", "recent", "window"].includes(tlParam ?? "") ? tlParam : defRange) as RangePreset;
  const showEvents = params.get("ev") === "1";
  const rangeText = `${monthName(m.months[rangeStart(m, range)])} – ${monthName(m.months[m.nMonths - 1])}`;
  const spec = useMemo<Omit<TimelineSpec, "narrow" | "height">>(
    () => ({
      m,
      theme,
      measure,
      lens,
      filters,
      hist: { shipped: latent ? h.latent : h.shipped, demand: latent ? h.latent : h.demand, imputed: h.imputed, cells: h.cells, missing: h.missing, unknown: h.unknown, unknownDemand: h.unknownDemand },
      fc: latent ? (fLatent ? { value: fLatent } : undefined) : { value: fc.fc, p10: fc.p10, p50: fc.p50, p90: fc.p90 },
      range,
      columns: single !== null,
      showEvents,
    }),
    [m, theme, measure, lens, filters, h, fc, latent, fLatent, range, single, showEvents],
  );
  const excRows = useMemo(() => (exc.data ? exceptionRowsIn(m, filters, exc.data) : []), [exc.data, m, filters]);
  const annotate = useCallback((tm: TimelineModel) => timelineAnnotations({ spec: { ...spec }, model: tm, exceptions: exc.data, exceptionRows: excRows }), [spec, exc.data, excRows]);
  const timelineTitle = render(OVERVIEW_TEMPLATES.timelineTitle, facts).text;

  // ---- figures.  The first strip figure shows the OTHER measure, so units and revenue are always both on
  // screen: forecast revenue in the units lens, forecast units in the USD lens.
  const alt = usd ? { h: hUnits, fc: fcUnits } : { h: hUsd, fc: fcUsd };
  const alt19 = sum(alt.fc.fc);
  const altLast19 = sum(alt.h.demand, m.asOf - 18, m.asOf + 1);
  const altHist = useMemo(() => Array.from(alt.h.demand), [alt.h]);
  const altFc = useMemo(() => {
    const a: (number | null)[] = new Array(m.nMonths).fill(null);
    a[m.asOf] = alt.h.demand[m.asOf];
    for (let k = 0; k < m.nWin; k++) a[m.w0 + k] = alt.fc.fc[k];
    return a;
  }, [m, alt.h, alt.fc]);
  const fullRange = `${monthName(m.months[0])} – ${monthName(m.months[m.nMonths - 1])}`;
  const pa = m.meta.price_assumption.vs_2026_pct;
  const priceYears = Object.entries(pa).filter(([, v]) => v !== 0);
  const { final, naive, snaive, cycle, floor, origins: nOrigins } = ladderFacts(m);
  const replayOrigin = m.meta.backtest.origins[m.meta.backtest.origins.length - 1] ?? null;
  const xrMonth = useMemo(() => firstForecastMonth(m, runs), [m, runs]);
  // the best (lowest-WAPE) benchmark, as Forecast & accuracy names it; differences from the printed values
  const best = [cycle, snaive, naive].filter((x): x is NonNullable<typeof x> => !!x).reduce<typeof cycle>((a, b) => (!a || Number((b.wape * 100).toFixed(1)) < Number((a.wape * 100).toFixed(1)) ? b : a), undefined);
  const bestLabel = best === cycle ? "cycle-aware naive" : best === snaive ? "seasonal naive" : "naive";
  const lost = useMemo(() => {
    if (!stock.data) return null;
    const c = stock.data.cells;
    const inSel = new Set(segs.map((g) => m.gSeries[g]));
    let u = 0;
    let v = 0;
    for (let i = 0; i < c.series.length; i++) {
      if (!inSel.has(c.series[i])) continue;
      if (filters.customer !== null && !segs.some((g) => m.gSeries[g] === c.series[i] && c.month[i] >= m.gStart[g] && c.month[i] < m.gStart[g] + m.gLen[g])) continue;
      u += c.lost[i];
      v += c.lost_usd[i];
    }
    return { u, usd: v };
  }, [stock.data, segs, m, filters.customer]);
  // one definition of "repaired" with Data health: a partition of the history cells (corrected + rebuilt + units unknown)
  const repaired = useMemo(() => repairFacts(m, segs, "family").total, [m, segs]);

  // ---- breakdowns (mix by region / family / channel, both the brief and the change table)
  const bds = useMemo(() => DIMS.map((dim) => sharesOf(m, breakdown(m, filters, dim, measure))), [m, filters, measure]);
  const bdsUnits = useMemo(() => (measure === "units" ? bds : DIMS.map((dim) => sharesOf(m, breakdown(m, filters, dim, "units")))), [m, filters, measure, bds]);
  const openDims = DIMS.filter((_, i) => bds[i].lastAbs.filter((x, k) => x > 0 || bds[i].nextAbs[k] > 0).length > 1);
  const dimParam = params.get("by") as BreakdownDim | null;
  const dim: BreakdownDim | null = dimParam && openDims.includes(dimParam) ? dimParam : (openDims[0] ?? null);
  const change = useMemo(() => {
    if (!dim) return null;
    const b = bds[DIMS.indexOf(dim)];
    return changeFacts(dim, measure, b.labels, b.lastAbs, b.nextAbs);
  }, [dim, bds, measure]);

  const brief = useMemo(
    () => briefing({ m, filters, measure: "units", h: hUnits, fc: fcUnits, runs, mixes: bdsUnits, exc: exc.data, lost, go, setFilters }),
    [m, filters, hUnits, fcUnits, runs, bdsUnits, exc.data, lost, go, setFilters],
  );

  // ---- top exceptions
  const top = useMemo(() => {
    if (!exc.data) return null;
    const X = exc.data;
    const rows = [...excRows].sort((a, b) => X.revenue_at_risk[b] - X.revenue_at_risk[a]);
    const shown = rows.slice(0, 5);
    const total = rows.reduce((a, i) => a + X.revenue_at_risk[i], 0);
    const topSum = shown.reduce((a, i) => a + X.revenue_at_risk[i], 0);
    return { rows, shown, total, topSum, max: shown.length ? X.revenue_at_risk[shown[0]] : 1 };
  }, [exc.data, excRows]);

  // ---- outlook small multiples: moving annual total, indexed to the last 12 actual months = 100
  const outlook = useMemo(() => {
    const odim = (["family", "region", "channel"] as BreakdownDim[]).find((d) => openDims.includes(d));
    if (!odim) return null;
    const b = breakdown(m, filters, odim, measure);
    const from = Math.max(0, m.months.indexOf(`${Number(m.months[m.asOf].slice(0, 4)) - 3}-01`));
    const items = b.labels
      .map((label, idx) => {
        const full = [...Array.from(b.hist[idx]), ...Array.from(b.fc[idx])];
        const ma = full.map((_, i) => (i < 11 ? null : full.slice(i - 11, i + 1).reduce((x, y) => x + y, 0)));
        const l12 = ma[m.asOf] ?? 0;
        const n12 = ma[m.asOf + 12] ?? 0;
        return { label, idx, l12, n12, chg: l12 > 0 ? n12 / l12 - 1 : NaN, ix: ma.map((v) => (v === null || l12 <= 0 ? null : (v / l12) * 100)) };
      })
      .filter((x) => x.l12 > 0);
    if (items.length < 2) return null;
    const vals = items.flatMap((x) => x.ix.slice(from).filter((v): v is number => v !== null));
    const yMin = Math.floor(Math.min(...vals, 100) / 5) * 5;
    const yMax = Math.ceil(Math.max(...vals, 100) / 5) * 5;
    return { dim: odim, items, from, yMin, yMax };
  }, [m, filters, measure, openDims.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (d: BreakdownDim, idx: number) => setFilters({ ...filters, [d]: idx, ...(d === "family" ? { sku: null } : {}) });

  // ---- the watch list in the lede: the three things an executive should worry about, without scrolling.
  // Each line reads the same variable as its evidence below: the brief's Risk and Act facts (riskFact,
  // actFact: the inbox's cases) and the change table's weakest row.
  const watch = useMemo(() => {
    const items: { tag: string; tone?: "warn" | "crit"; text: ReactNode; link: { label: string; onClick: () => void } }[] = [];
    const X = exc.data;
    const r = X ? riskFact(m, X, excRows) : null;
    if (r)
      items.push({
        tag: "Risk",
        tone: "warn",
        text: (
          <>
            {r.who} {r.what}, {r.span}: <b>{r.units >= 0 ? "−" : "+"}{fmtInt(Math.abs(r.units))} units</b> ({fmtMoney(r.usd, 1)}) across {r.n} series
          </>
        ),
        link: { label: "Window events", onClick: () => go("exceptions", { cause: "window_event" }) },
      });
    const a = X ? actFact(m, X, excRows) : null;
    if (a)
      items.push({
        tag: "Act",
        tone: "crit",
        text: (
          <>
            <b>
              {fmtInt(a.n)} {a.n === 1 ? "case" : "cases"}
            </b>
            , {fmtMoney(a.usd, 1)} of revenue at risk; the largest is {a.ruleWords}, {a.whoNode}
            {a.lost ? <> ({lastOrderPhrase(a.lost).replace(/^Last/, "last")})</> : null}
          </>
        ),
        link: { label: "Inbox", onClick: () => go("exceptions") },
      });
    if (change && dim && change.rows.length > 1) {
      const rows = change.rows.filter((x) => Number.isFinite(x.pct));
      const worst = rows.length ? rows.reduce((p, q) => (q.pct < p.pct ? q : p)) : null;
      if (worst)
        items.push({
          tag: "Demand",
          text:
            worst.pct < 0 ? (
              <>
                {worst.label} falls <b>{fmtSignedPct(worst.pct)}</b> over the next 12 months, the steepest {dim} decline
              </>
            ) : (
              <>
                Every {dim} grows over the next 12 months; {worst.label} grows least, <b>{fmtSignedPct(worst.pct)}</b>
              </>
            ),
          link: { label: "Filter", onClick: () => pick(dim, worst.idx) },
        });
    }
    return items;
  }, [exc.data, excRows, m, change, dim, go]); // eslint-disable-line react-hooks/exhaustive-deps
  const presets = rangePresets(m);
  const p50Note = (tm: TimelineModel) =>
    tm.hasBand ? (
      tm.p50Drawn ? (
        <span>The dotted line is the P50 of the aggregate; it departs from the submitted forecast by up to {fmtPct(tm.p50MaxRel)} here.</span>
      ) : (
        <span>P50 sits within {fmtPct(Math.max(tm.p50MaxRel, 0.001), 1)} of the submitted forecast in every month and is listed in the tooltip.</span>
      )
    ) : latent ? (
      <span>Latent lens: history and forecast both spread each order over the months it covers; the P10–P90 range applies to orders as booked.</span>
    ) : null;

  // a selection no series matches (reachable only through a typed link): say so once, with the way out
  if (!series.length)
    return (
      <>
        <Lede headline="No series matches this selection" standfirst={`The filters ${sel.name ? `(${sel.name}) ` : ""}combine values that never occur together in the history, so there is nothing to forecast or chart.`} />
        <Empty title="Nothing to show for these filters" action={<Button onClick={() => setFilters(NO_FILTERS)}>Reset the filters</Button>}>
          Every filter only offers values that exist under the other filters, so this state comes from a typed or edited link. Reset the filters, or change one of them in the bar above.
        </Empty>
      </>
    );

  return (
    <>
      <Lede
        headline={headline}
        standfirst={standfirst}
        after={
          watch.length ? (
            <ul className="watch" aria-label={`${countWord(watch.length, true)} things to watch`}>
              {watch.map((w) => (
                <li key={w.tag}>
                  <span className="tag">
                    {w.tone && <i className={w.tone} aria-hidden="true" />}
                    {w.tag}
                    {w.tone && <span className="visually-hidden"> ({w.tone === "crit" ? "act now" : "risk"})</span>}
                  </span>
                  <span className="txt">
                    {w.text}{" "}
                    <LinkButton onClick={w.link.onClick} title={`Open the evidence: ${w.link.label}`}>
                      {w.link.label}
                    </LinkButton>
                  </span>
                </li>
              ))}
            </ul>
          ) : undefined
        }
        figure={
          <HeroFigure
            label={`Forecast, next ${m.nWin} months`}
            value={fv(facts.total19)}
            unit={usd ? undefined : "units"}
            visual={facts.total19 > 0 ? <RangeStrip p10={p10} p90={p90} mid={facts.total19} reference={facts.last19 > 0 ? facts.last19 : undefined} refLabel={`Last ${m.nWin} months`} format={fv} /> : undefined}
            context={facts.last19 > 0 && facts.total19 > 0 ? <Delta value={facts.chg19} suffix={`vs the last ${m.nWin} months of demand`} /> : "No demand in the last 19 months to compare with."}
            // one click to the forecast X-ray: why the first forecast month is what it is (season × macro × EV × lifecycle × event × cycle)
            link={xrMonth >= m.w0 && fc.fc[xrMonth - m.w0] > 0 ? { label: `Why ${monthName(m.months[xrMonth])} is ${fv(fc.fc[xrMonth - m.w0])}: the forecast X-ray`, onClick: () => go("forecast", { at: "xray", origin: null }) } : undefined}
            info={{
              what: `Sum of the submitted forecast over ${monthName(m.months[m.w0])} – ${monthName(m.months[m.nMonths - 1])} for the selection, with the P10–P90 range of that ${m.nWin}-month total.`,
              how: "The range comes from the contract's aggregate-quantile formula on the summed means, noise variances and shared level and family × region errors, never from summed row quantiles. The change is against the unconstrained demand of the last 19 actual months.",
              source: "forecast.json",
            }}
          />
        }
      />

      <Module
        id="timeline"
        title={timelineTitle}
        dek={timelineDek(facts, rangeText)}
        tools={
          <>
            <RangePresets value={range} options={presets} onChange={(v) => setParam({ tl: v === defRange ? null : v }, true)} />
            <button type="button" className={`btn sm quiet ${showEvents ? "" : ""}`} aria-pressed={showEvents} onClick={() => setParam({ ev: showEvents ? null : "1" }, true)} title="Show every event as a rug under the axis (hover a tick for details)">
              {showEvents ? "Hide events" : "All events"}
            </button>
          </>
        }
        info={{
          what: `One continuous monthly timeline, ${monthName(m.months[0])} to ${monthName(m.months[m.nMonths - 1])}. Left of the rule is what happened; right of it is what the forecast says. Annotations are computed from the data: the deepest dip inside a disruption, the widest shipped-versus-demand gap, rebuilt-row clusters and the largest event inside the forecast window.`,
          how: "Exact sums over the selected series. The forecast continues unconstrained demand (stock-outs added back); its first point is the last actual. The P10–P90 band uses the contract's aggregate-quantile formula.",
          source: "history.json, forecast.json, dims.json (events), exceptions.json",
        }}
        keyItems={timelineKey({ latent, columns: single !== null, rebuilt: !latent, lost: !latent, present: markPresence(spec) })}
      >
        {latent && detail.loading ? (
          <Notice tone="info">Loading latent demand for the forecast window…</Notice>
        ) : (
          <TimelineChart spec={spec} annotate={annotate} height={single !== null ? 340 : 360} ariaLabel={`${timelineTitle}. ${timelineDek(facts, rangeText)}`} busy={latent && detail.loading} footnote={p50Note} />
        )}
      </Module>

      <FigureStrip>
        <Figure
          label={usd ? `Forecast units, next ${m.nWin} months` : `Forecast revenue, next ${m.nWin} months`}
          value={usd ? fmtNum(alt19) : fmtMoney(alt19)}
          unit={usd ? "units" : undefined}
          visual={<Sparkline history={altHist} forecast={altFc} divider={m.asOf} ariaLabel={`${usd ? "Units" : "Revenue"} per month, ${fullRange}, history in ink and forecast in orange`} />}
          context={
            altLast19 > 0
              ? `**${fmtSignedPct(alt19 / altLast19 - 1)}** vs ${usd ? `${fmtNum(altLast19)} units` : fmtMoney(altLast19)} in the last ${m.nWin} months${!usd && priceYears.length ? `; list prices ${priceYears.map(([y, v]) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}% in ${y}`).join(" and ")}, each against ${m.months[m.asOf].slice(0, 4)}` : ""}. Per month, ${fullRange}`
              : `Per month, ${fullRange}`
          }
          info={{
            what: usd ? "The submitted forecast in units over the window, against the unconstrained demand of the last 19 actual months; the sparkline shows units per month from history into the forecast." : "Submitted units × the forecast's assumed invoice price per row, summed over the window, against the last 19 months of demand at invoice prices; the sparkline shows revenue per month from history into the forecast.",
            how: "Price assumption read from the forecast file; the median change against each SKU's 2026 invoice price is shown.",
            source: "forecast.json (price), history.json",
          }}
        />
        <Figure
          label="Backtest error (WAPE)"
          value={final ? fmtPct(final.wape) : "–"}
          context={final && best ? `**${fmt1(Math.abs(ptsBetween(best.wape, final.wape)))} pts** ${best.wape >= final.wape ? "better" : "worse"} than ${bestLabel}, the best benchmark; lower is better` : undefined}
          visual={
            final ? (
              <Ladder
                rows={[...(snaive ? [{ label: "Seasonal naive", value: snaive.wape }] : []), ...(cycle ? [{ label: "Cycle-aware naive", value: cycle.wape }] : []), { label: "Our model", value: final.wape, me: true }]}
                format={(v) => `${fmt1(v * 100)}%`}
                foot={`${nOrigins} origins${floor !== null ? `, in-hindsight floor ${fmtPct(floor)}` : ""}, all series`}
              />
            ) : undefined
          }
          // one click to the backtest time machine: the forecast made at the latest origin, replayed against what happened
          link={replayOrigin ? { label: `Replay the forecast made in ${monthName(replayOrigin)}`, onClick: () => go("forecast", { origin: replayOrigin }) } : { label: "Forecast & accuracy", onClick: () => go("forecast") }}
          info={{ what: "Rolling-origin backtest at a 19-month horizon over every SKU × region × month, pooled over the scored origins on the cells every model forecast (all series, not the filter). Seasonal naive repeats the same month last year; cycle-aware naive places last year's demand on the months the customer actually orders. The in-hindsight floor is the error a forecast would still make even if it had known each series' true level in hindsight: the noise no model can remove.", how: "WAPE = Σ|actual − forecast| / Σ actual on unconstrained demand. Lower is better. The link replays the forecast made at the latest backtest origin, month by month against the actuals.", source: "meta.json (backtest ladder)" }}
        />
        <Figure
          label={`Lost sales, ${m.months[0].slice(0, 4)}–${m.months[m.asOf].slice(0, 4)}`}
          value={lost ? fmtInt(lost.u) : "…"}
          unit="units"
          context={lost ? `**${fmtMoney(lost.usd, 1)}** never shipped, ${fmtPct(lostShare(lost.u, hUnits), 2)} of unconstrained demand` : "Reading stock-outs…"}
          link={{ label: "Stock-outs & lost sales", onClick: () => go("stockouts") }}
          info={{ what: "Units customers requested but Celeris never shipped: listed stock-outs, imputed unlisted semiconductor months and detected hidden stock-outs.", how: "Lost units × the invoice price of the month.", source: "stockouts.json (cells.lost)" }}
        />
        <Figure
          label="History cells repaired"
          value={fmtInt(repaired.touched)}
          unit="cells"
          context={`**${fmtPct(repaired.share)}** of ${fmtInt(repaired.cells)} cells: ${fmtInt(repaired.fixed)} corrected, ${fmtInt(repaired.rebuilt)} rows rebuilt, ${fmtInt(repaired.unknown)} units unknown`}
          link={{ label: "Data health", onClick: () => go("health") }}
          info={{ what: "History cells the cleaning repaired, each counted once: values corrected (units × 10, cents, EUR, pack of 10, sign …), rows missing from the extract rebuilt from the Record_ID grid, and ERP blanks whose units stay unknown (kept out of fitting). The same definition as the Data health repairs table.", how: "Flags on every history cell of the selection. Missing rows are never treated as zero demand.", source: "history.json (flags)" }}
        />
      </FigureStrip>

      <div className="cols-7-5 ov-lower">
        <Module
          className="brief"
          title="The brief"
          dek={`${countWord(brief.length, true)} facts computed from the bundle for this selection; each links to its evidence.`}
          info={{ what: "Templated sentences over computed facts: forecast change, peak and low month, mix shift, the largest window event, exceptions, ordering-cycle zeros, lost sales and backtest accuracy.", how: "Every number is computed in the browser from the pipeline bundle for the active filters; links apply a filter or open the view with the evidence.", source: "history.json, forecast.json, exceptions.json, stockouts.json, meta.json" }}
        >
          <ol>
            {brief.map((b) => (
              <li key={b.tag}>
                <span className="tag">
                  {b.tone && <i className={b.tone} aria-hidden="true" />}
                  {b.tag}
                  {b.tone && <span className="visually-hidden"> ({b.tone === "crit" ? "act now" : "risk"})</span>}
                </span>
                <p>{b.body}</p>
              </li>
            ))}
          </ol>
        </Module>

        <div className="stack">
          {change && dim ? (
            <Module
              title={changeTitle(change)}
              dek={changeDek(change)}
              info={{ what: "Where the 12-month change comes from: next 12 forecast months against the last 12 months of unconstrained demand, by region, family or channel. Click a row to filter the page.", how: "Exact sums over the selection; share is the entity's share of the next 12 months; the bar is the absolute change, the leader in orange.", source: "history.json, forecast.json" }}
            >
              <Tabs ariaLabel="Break down by" value={dim} options={openDims.map((d) => ({ value: d, label: DIM_LABEL[d] }))} onChange={(v) => setParam({ by: v === openDims[0] ? null : v }, true)} />
              <BarTable
                ariaLabel={`Change by ${dim}`}
                rows={change.rows}
                rowKey={(r) => r.label}
                onRow={(r) => pick(dim, r.idx)}
                bar={{ value: (r) => r.d, tone: "forecast", leader: (r) => r === change.leader }}
                cols={[
                  { key: "l", label: DIM_LABEL[dim], kind: "label", value: (r) => r.label, width: "30%" },
                  { key: "s", label: "Share next 12", kind: "num", value: (r) => fmtPct(r.share), width: "18%", hideNarrow: true },
                  { key: "b", label: "Change", kind: "bar" },
                  { key: "d", label: usd ? "USD" : "Units", kind: "num", value: (r) => fmtOnScale(r.d, Math.max(...change.rows.map((x) => Math.abs(x.d))), measure, true), width: "15%" },
                  { key: "p", label: "%", kind: "num", value: (r) => fmtSignedPct(r.pct), width: "14%" },
                ]}
              />
              {render(CHANGE_TEMPLATES.note, change).text && <p className="bt-note">{render(CHANGE_TEMPLATES.note, change).text}</p>}
            </Module>
          ) : (
            <Module title="The filters fix family, region and channel" dek="There is no mix to compare inside one series. Widen a filter to see where the change comes from." />
          )}

          {top && (
            <Module
              title={render(TOP_TEMPLATES.title, { n: top.rows.length, shown: top.shown.length, topSum: top.topSum, total: top.total }).text}
              dek={top.rows.length ? "Exceptions ranked by forecast-window revenue at risk. Each opens its case in the inbox." : `None of the ${Object.keys((exc.data as ExceptionFile).rules).length} exception rules flags a series in this selection.`}
              info={{ what: "The exception rows inside the selection with the largest revenue at risk.", how: "Each rule defines its own at-risk amount (for a lost account: the pre-loss level × window months × price, the revenue missed if it returns).", source: "exceptions.json" }}
            >
              {top.shown.length > 0 && (
                <ol className="ranklist">
                  {top.shown.map((i, k) => {
                    const X = exc.data as ExceptionFile;
                    const s = X.series[i];
                    return (
                      <li key={i}>
                        <button type="button" className="row" onClick={() => go("exceptions", { case: String(i) })}>
                          <span className="rk">{k + 1}</span>
                          <span className="who">
                            <span className="id">{s >= 0 ? m.dims.skus.id[m.sSku[s]] : m.dims.families.code[X.family[i]]}</span> · {s >= 0 ? m.dims.regions[m.sRegion[s]] : m.dims.regions[X.region[i]]}
                          </span>
                          <span className="amt">
                            {fmtMoney(X.revenue_at_risk[i])}
                            <i style={{ width: `${(X.revenue_at_risk[i] / top.max) * 92}px` }} aria-hidden="true" />
                          </span>
                          <span className="why">
                            <RuleChip>{X.rules[X.rule[i]]?.title ?? X.rule[i]}</RuleChip>
                            {reasonShort(X, i)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              )}
              {top.rows.length > 0 && (
                <p style={{ marginTop: 10 }}>
                  <MoreLink onClick={() => go("exceptions")}>All {fmtInt(top.rows.length)} exceptions in the inbox</MoreLink>
                </p>
              )}
            </Module>
          )}
        </div>
      </div>

      {outlook && (
        <Module
          title={render(OUTLOOK_TEMPLATES.title, { unit: outlook.dim, units: outlook.dim === "family" ? "families" : `${outlook.dim}s`, items: outlook.items.map((x) => ({ label: x.label, chg: x.chg })) }).text}
          dek={`Moving annual total (rolling 12-month sum) of unconstrained demand${usd ? " in USD" : ""}, continued by the forecast, indexed to the year to ${monthLong(m.months[m.asOf])} = 100. The dot is the year to ${monthLong(m.months[Math.min(m.nMonths - 1, m.asOf + 12)])}, the change beside each name. Click one to filter the page.`}
          info={{ what: `One small multiple per ${outlook.dim}, on a shared scale, history in ink and the forecast in orange.`, how: "Rolling 12-month sums remove the ordering-cycle noise, so the trend reads as the planner's own measure.", source: "history.json, forecast.json" }}
        >
          <div className="multiples" style={{ ["--sm-cols" as string]: Math.min(7, outlook.items.length) }}>
            {outlook.items.map((x) => (
              <button type="button" key={x.label} className="multiple" onClick={() => pick(outlook.dim, x.idx)} aria-label={`${x.label}: ${fmtSignedPct(x.chg)} next 12 months; filter the page`}>
                <h4>{x.label}</h4>
                <div className="stat">
                  <b>{fmtSignedPct(x.chg)}</b>
                  <span>
                    {usd ? fmtMoney(x.n12, 1) : fmtNum(x.n12)} next 12
                  </span>
                </div>
                <MiniMat ix={x.ix} from={outlook.from} asOf={m.asOf} dotAt={Math.min(m.nMonths - 1, m.asOf + 12)} yMin={outlook.yMin} yMax={outlook.yMax} />
              </button>
            ))}
            <div className="multiples-axis">
              <span>{monthName(m.months[outlook.from])}</span>
              <span>
                Shared scale {outlook.yMin}–{outlook.yMax}; hairline = 100
              </span>
              <span>{monthName(m.months[m.nMonths - 1])}</span>
            </div>
          </div>
        </Module>
      )}

      <aside className="colophon" aria-label="Method">
        <span>
          <b>Quantiles</b> the lognormal aggregate of the contract formula, never summed row quantiles
        </span>
        <span>
          <b>WAPE</b> Σ|actual − forecast| / Σ actual over scored cells
        </span>
        <span>
          <b>Submission</b> <Rich text={`**${fmtInt(m.meta.submission.total_units)}** units in ${fmtInt(m.meta.submission.rows)} rows${m.meta.submission.matches_forecast ? ", identical to the bundle" : ""}`} />
        </span>
      </aside>
    </>
  );
}

/** One moving-annual-total small multiple (inline SVG; the dot is an HTML element so it stays round). */
function MiniMat({ ix, from, asOf, dotAt, yMin, yMax }: { ix: (number | null)[]; from: number; asOf: number; dotAt: number; yMin: number; yMax: number }) {
  const n = ix.length - from;
  const W = 200;
  const H = 92;
  const x = (i: number) => ((i - from) / (n - 1)) * W;
  const y = (v: number) => H - 2 - ((v - yMin) / (yMax - yMin || 1)) * (H - 4);
  const path = (a: number, b: number) => {
    let d = "";
    for (let i = a; i <= b; i++) {
      const v = ix[i];
      if (v === null) continue;
      d += `${d ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    }
    return d;
  };
  const dv = ix[dotAt];
  return (
    <span className="mini">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        <rect x={x(asOf)} y={0} width={W - x(asOf)} height={H} fill="var(--accent-wash)" />
        <line x1={0} x2={W} y1={y(100)} y2={y(100)} stroke="var(--rule-strong)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <path d={path(from, asOf)} fill="none" stroke="var(--ink)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        <path d={path(asOf, ix.length - 1)} fill="none" stroke="var(--accent)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      {dv !== null && <i className="mini-dot" style={{ left: `${(x(dotAt) / W) * 100}%`, top: `${(y(dv) / H) * 100}%` }} />}
    </span>
  );
}
