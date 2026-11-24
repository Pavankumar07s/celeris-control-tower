// R3 Demand explorer (training data): why does this series look the way it does, and are its zeros scheduled,
// missing or lost?
//  lede (computed headline + standfirst | hero: last-12 demand, with the ordering cycle)
//  -> navigator (breadcrumb, search, ranked children: family -> SKU -> region -> customer) | the shared timeline
//     continued into the forecast (columns for one series; click a month for its lineage)
//  -> seasonality | zero-month calendar | series card (lifecycle, customers over time, cycle) or composition.
import { useCallback, useMemo, useState } from "react";
import type { EChartsCoreOption } from "echarts/core";
import { useApp } from "../app/context";
import { useSelection } from "../app/hooks";
import { EChart } from "../charts/EChart";
import { eventTitle, laneEvents, rangePresets, rangeStart, timelineAnnotations, type RangePreset, type TimelineModel, type TimelineSpec, markPresence } from "../charts/timeline";
import { FONT, fz, baseOption, categoryAxis, tooltipStyle, ttEnd, ttHead, ttRow, type Theme } from "../charts/theme";
import { MoreLink, RangePresets, Segmented, StatusPill } from "../components/controls";
import { Delta, HeroFigure, Lede, Rich } from "../components/Figure";
import { Search } from "../components/icons";
import { LineageDrawer, decodeCell, encodeCell, type CellRef } from "../components/Lineage";
import { Key, Module, timelineKey } from "../components/Module";
import { Empty, Loading, Notice } from "../components/states";
import { forecastLatent } from "../data/aggregate";
import { MONTHS_SHORT, fmt1, fmtInt, fmtPct, fmtValue, monthName } from "../data/format";
import { useResource } from "../data/load";
import { historyPrice, seriesMatches, type Filters, type Model } from "../data/model";
import type { ExceptionFile, ForecastDetail, ProfilesFile } from "../data/types";
import { exceptionRowsIn } from "../insights/briefing";
import { cap, countWord, fractionWord, plural, render, renderFirst, selectionWords } from "../insights/headlines";
import { EXPLORER_HEADLINES, EXPLORER_TEMPLATES, SEASON_TEMPLATES, cycleWords, explorerFacts, noHistoryWords, seasonFacts, zeroStats, type ExplorerFacts, type SeasonFacts, type ZeroStats } from "../insights/explorer";
import { SplitBar } from "./g1/parts";
import "./g1/g1.css";
import { TimelineChart } from "../charts/TimelineChart";

type Level = "family" | "sku" | "region" | "customer";
interface Node {
  key: number;
  label: string;
  sub: string;
  vol: number;
  apply: Partial<Filters>;
  code?: boolean;
  current?: boolean;
}

/** The navigator's children of the current selection, ranked by demand of the last 12 actual months. */
function navigator(m: Model, f: Filters, usd: boolean): { level: Level; nodes: Node[]; total: number; siblings: Node[]; sibTotal: number } {
  const level: Level = f.sku === null ? (f.family === null ? "family" : "sku") : f.region === null ? "region" : "customer";
  const vol = new Map<number, number>();
  const skus = new Map<number, Set<number>>();
  const extra = new Map<number, { s: number; from: number; to: number }>();
  for (let g = 0; g < m.nSeg; g++) {
    const s = m.gSeries[g];
    if (!seriesMatches(m, s, f)) continue;
    if (level !== "customer" && f.customer !== null && m.gCustomer[g] !== f.customer) continue;
    let v = 0;
    for (let k = 0; k < m.gLen[g]; k++) {
      const t = m.gStart[g] + k;
      if (t > m.asOf - 12) v += m.d[m.gOff[g] + k] * (usd ? historyPrice(m, m.sSku[s], t) : 1);
    }
    const key = level === "family" ? m.sFamily[s] : level === "sku" ? m.sSku[s] : level === "region" ? m.sRegion[s] : m.gCustomer[g];
    vol.set(key, (vol.get(key) ?? 0) + v);
    if (level === "family") {
      const set = skus.get(key) ?? new Set<number>();
      set.add(m.sSku[s]);
      skus.set(key, set);
    }
    if (level === "region") extra.set(key, { s, from: 0, to: 0 });
    if (level === "customer") {
      const cur = extra.get(key);
      extra.set(key, { s, from: Math.min(cur?.from ?? Infinity, m.gStart[g]), to: Math.max(cur?.to ?? -1, m.gStart[g] + m.gLen[g] - 1) });
    }
  }
  const D = m.dims;
  const nodes: Node[] = [...vol.entries()].map(([i, v]) => {
    if (level === "family") return { key: i, label: D.families.name[i], sub: `${D.families.bu[i]}, ${fmtInt(skus.get(i)?.size ?? 0)} SKUs`, vol: v, apply: { family: i } };
    if (level === "sku") return { key: i, label: D.skus.id[i], sub: D.skus.description[i] ?? "", vol: v, apply: { sku: i, family: m.skuFamily[i] }, code: true };
    if (level === "region") {
      const s = extra.get(i)?.s ?? -1;
      return { key: i, label: D.regions[i], sub: s >= 0 ? `${D.channels[m.sChannel[s]]}, ${D.customers[m.sCustomer[s]]}` : "", vol: v, apply: { region: i } };
    }
    const e = extra.get(i);
    return { key: i, label: D.customers[i], sub: e ? `${monthName(m.months[e.from])} – ${monthName(m.months[e.to])}` : "", vol: v, apply: { customer: i }, current: f.customer === i };
  });
  nodes.sort((a, b) => (level === "customer" ? (a.sub < b.sub ? 1 : -1) : b.vol - a.vol || a.label.localeCompare(b.label)));
  // one series: its SKU in the other regions, so a planner can compare without rolling up
  const siblings: Node[] = [];
  if (level === "customer" && f.sku !== null) {
    const sv = new Map<number, number>();
    for (let g = 0; g < m.nSeg; g++) {
      const s = m.gSeries[g];
      if (m.sSku[s] !== f.sku || (f.channel !== null && m.sChannel[s] !== f.channel)) continue;
      let v = 0;
      for (let k = 0; k < m.gLen[g]; k++) {
        const t = m.gStart[g] + k;
        if (t > m.asOf - 12) v += m.d[m.gOff[g] + k] * (usd ? historyPrice(m, m.sSku[s], t) : 1);
      }
      sv.set(m.sRegion[s], (sv.get(m.sRegion[s]) ?? 0) + v);
    }
    for (const [r, v] of sv) {
      const s = m.sSku.findIndex((k, i) => k === f.sku && m.sRegion[i] === r);
      siblings.push({ key: r, label: D.regions[r], sub: s >= 0 ? `${D.channels[m.sChannel[s]]}, ${D.customers[m.sCustomer[s]]}` : "", vol: v, apply: { region: r, customer: null }, current: f.region === r });
    }
    siblings.sort((a, b) => b.vol - a.vol);
  }
  return { level, nodes, total: nodes.reduce((a, n) => a + n.vol, 0), siblings, sibTotal: siblings.reduce((a, n) => a + n.vol, 0) };
}

const LEVEL_WORD: Record<Level, [string, string]> = { family: ["family", "families"], sku: ["SKU", "SKUs"], region: ["region", "regions"], customer: ["customer", "customers"] };

export default function Explorer() {
  const { m, theme, filters, measure, lens, setFilters, params, setParam } = useApp();
  const { segs, runs, series, single, h, fc } = useSelection();
  const latent = lens === "latent";
  const usd = measure === "usd";
  const withForecast = params.get("fc") !== "0";
  const prof = useResource<ProfilesFile>("profiles.json");
  const exc = useResource<ExceptionFile>("exceptions.json");
  const detail = useResource<ForecastDetail>(latent && withForecast ? "forecast_detail.json" : null);
  const cell = decodeCell(m, params.get("cell"));
  const openCell = useCallback((c: CellRef) => setParam({ cell: encodeCell(m, c) }), [m, setParam]);

  // ---- facts
  const sel = useMemo(() => selectionWords(m, filters), [m, filters]);
  const z = useMemo(() => zeroStats(m, segs), [m, segs]);
  const events = useMemo(() => laneEvents(m, filters), [m, filters]);
  const disruptionAt = useCallback(
    (t: number) => {
      const e = events.find((x) => m.dims.events.type[x.i] === "Disruption" && x.start <= t && x.end >= t);
      return e ? eventTitle(m.dims.events.description[e.i]) : null;
    },
    [events, m],
  );
  const pv = (k: string) => (single !== null && prof.data ? (prof.data.series[k]?.[single] ?? null) : null);
  const fLatent = useMemo(() => (latent && detail.data ? forecastLatent(m, runs, detail.data, measure) : null), [latent, detail.data, m, runs, measure]);
  const demandArr = latent ? h.latent : h.demand;
  const fcArr = withForecast ? (latent ? fLatent : fc.fc) : null;
  const facts = useMemo(
    () =>
      explorerFacts({
        m,
        sel,
        measure,
        latent,
        single,
        series,
        segs,
        demand: demandArr,
        fc: fcArr,
        z,
        // the LAST ORDER month: the profile's, else the month before the series went silent (lost_since is the first silent month)
        lastOrder: (pv("last_order_month") as string | null) ?? (single !== null && m.dims.series.lost_since[single] ? m.months[Math.max(0, m.months.indexOf(m.dims.series.lost_since[single] as string) - 1)] ?? null : null),
        cycleBefore: pv("cycle_pattern_before") as string | null,
        cycleChange: pv("cycle_change_month") as string | null,
        eventTitleAt: disruptionAt,
      }),
    [m, sel, measure, latent, single, series, segs, demandArr, fcArr, z, prof.data, disruptionAt], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const headline = renderFirst(EXPLORER_HEADLINES, facts).text;
  const standfirst = render(EXPLORER_TEMPLATES.standfirst, facts).text;

  // ---- timeline
  const range = (["all", "recent", "window"].includes(params.get("tl") ?? "") ? params.get("tl") : single !== null ? "recent" : "all") as RangePreset;
  const rangeText = `${monthName(m.months[rangeStart(m, range)])} – ${monthName(m.months[withForecast ? m.nMonths - 1 : m.asOf])}`;
  const spec = useMemo<Omit<TimelineSpec, "narrow" | "height">>(
    () => ({
      m,
      theme,
      measure,
      lens,
      filters,
      hist: { shipped: latent ? h.latent : h.shipped, demand: latent ? h.latent : h.demand, imputed: h.imputed, cells: h.cells, missing: h.missing, unknownDemand: h.unknownDemand },
      fc: !withForecast ? undefined : latent ? (fLatent ? { value: fLatent } : undefined) : { value: fc.fc, p10: fc.p10, p50: fc.p50, p90: fc.p90 },
      range,
      columns: single !== null,
    }),
    [m, theme, measure, lens, filters, h, fc, latent, fLatent, withForecast, range, single],
  );
  const excRows = useMemo(() => (exc.data ? exceptionRowsIn(m, filters, exc.data) : []), [exc.data, m, filters]);
  const annotate = useCallback((tm: TimelineModel) => timelineAnnotations({ spec: { ...spec }, model: tm, exceptions: exc.data, exceptionRows: excRows }), [spec, exc.data, excRows]);
  const timelineTitle = render(EXPLORER_TEMPLATES.timelineTitle, facts).text;
  const unit = usd ? "Revenue in USD" : "Units";
  const timelineDek = latent
    ? `${unit} per month of latent demand, ${rangeText}: each order spread over the months it covers.`
    : single !== null
      ? `${unit} per month, ${rangeText}. Shipped in ink with any loss to stock-outs on top; ${withForecast ? "the forecast in orange with P10–P90 whiskers. " : ""}Click a month for its lineage.`
      : `${unit} per month, ${rangeText}. History shows unconstrained demand${withForecast ? "; the forecast carries its P10–P90 range" : ""}.`;

  // ---- navigator
  const nav = useMemo(() => navigator(m, filters, usd), [m, filters, usd]);

  // ---- seasonality
  const season = useMemo(() => seasonFacts(m, h.latent, (y) => {
    for (let k = 0; k < 12; k++) {
      const t = m.months.indexOf(`${y}-${String(k + 1).padStart(2, "0")}`);
      const d = t >= 0 ? disruptionAt(t) : null;
      if (d) return d;
    }
    return null;
  }), [m, h.latent, disruptionAt]);

  return (
    <>
      <Lede
        eyebrow={single === null && !sel.all ? sel.name : undefined}
        headline={headline}
        standfirst={standfirst}
        figure={
          <HeroFigure
            label={`${latent ? "Latent demand" : usd ? "Revenue" : "Demand"}, last 12 months`}
            value={fmtValue(facts.last12, measure)}
            unit={usd ? undefined : "units"}
            visual={single !== null ? <CycleStrip m={m} s={single} z={z} /> : <CycleMix facts={facts} />}
            context={facts.prev12 > 0 ? <Delta value={facts.chg} suffix={`vs the 12 months to ${monthName(m.months[m.asOf - 12])}`} /> : "No demand in the year before to compare with."}
            info={{
              what: `${latent ? "Latent monthly demand" : "Unconstrained demand"} of the selection over ${monthName(m.months[m.asOf - 11])} – ${monthName(m.months[m.asOf])}, against the 12 months before.${single !== null ? " The strip shows the last 12 months of the series: order months in ink, scheduled off-months as dots." : " The bar shows how the series in view order: their customers' ordering cycles."}`,
              how: "Exact sums of the cleaned history (stock-outs added back to demand). Ordering cycles are detected per series by the demand stage.",
              source: "history.json, dims.json (series.cycle)",
            }}
          />
        }
      />

      <div className="cols-4-8">
        <NavigatorModule m={m} filters={filters} nav={nav} usd={usd} setFilters={setFilters} />
        <Module
          title={timelineTitle}
          dek={timelineDek}
          info={{
            what: "The selection's history on the shared timeline, continued into the forecast so the step from the last actual to the first forecast month is visible.",
            how: "Orders as booked = cleaned shipments with stock-outs added back; latent = each order spread over the months it carries (shutdown months carry half). The P10–P90 range uses the contract's aggregate-quantile formula.",
            source: "history.json, forecast.json",
          }}
        >
          <div className="g1-tools">
            <RangePresets value={range} options={rangePresets(m)} onChange={(v) => setParam({ tl: v === (single !== null ? "recent" : "all") ? null : v }, true)} />
            <Segmented size="sm" ariaLabel="Continue into the forecast" value={withForecast ? "fc" : "hist"} onChange={(v) => setParam({ fc: v === "fc" ? null : "0" }, true)} options={[{ value: "fc", label: "With forecast" }, { value: "hist", label: "History only" }]} />
          </div>
          <Key items={timelineKey({ latent, fc: withForecast, columns: single !== null, rebuilt: !latent, lost: !latent, present: markPresence(spec) })} />
          {latent && withForecast && detail.loading ? (
            <Notice tone="info">Loading latent demand for the forecast window…</Notice>
          ) : facts.cells === 0 && !(withForecast && facts.next12 > 0) ? (
            <Empty title="No history for this selection">
              <Rich text={noHistoryWords(facts)} />
            </Empty>
          ) : (
            <TimelineChart spec={spec} annotate={annotate} height={single !== null ? 330 : 350} ariaLabel={`${timelineTitle}. ${timelineDek}`} busy={latent && detail.loading} onXClick={single !== null ? (t) => t <= m.asOf && openCell({ s: single, t }) : undefined} />
          )}
        </Module>
      </div>

      <div className="g1-row-3">
        <SeasonModule m={m} theme={theme} season={season} />
        <ZeroModule m={m} facts={facts} z={z} single={single} segs={segs} onCell={openCell} />
        {single !== null ? <SeriesCard m={m} s={single} prof={prof.data} loading={prof.loading} facts={facts} /> : <Composition m={m} series={series} prof={prof.data} facts={facts} />}
      </div>

      {cell && <LineageDrawer series={cell.s} month={cell.t} onClose={() => setParam({ cell: null }, true)} />}
    </>
  );
}

// ---- hero visuals ---------------------------------------------------------------------------------------------
/** The last 12 months of one series: order months in ink, scheduled off-months as dots, unexplained zeros
 *  crossed: the ordering cycle at a glance. */
function CycleStrip({ m, s, z }: { m: Model; s: number; z: ZeroStats }) {
  const cells = Array.from({ length: 12 }, (_, k) => m.asOf - 11 + k).map((t) => ({ t, state: z.cells[t] === 0 ? "out" : z.sched[t] ? "sched" : z.unexp[t] ? "unexp" : z.lost[t] ? "lost" : z.zeros[t] ? "unexp" : "order" }));
  const code = m.dims.series.cycle[s];
  return (
    <div className="g1-strip" role="img" aria-label={`Last 12 months: ${cells.filter((c) => c.state === "order").length} order months, ${cells.filter((c) => c.state === "sched").length} scheduled off-months`}>
      <div className="cells">
        {cells.map((c) => (
          <span key={c.t} className={c.state}>
            <i />
            <em>{monthName(m.months[c.t]).charAt(0)}</em>
          </span>
        ))}
      </div>
      <span className="cap">
        {code ? <span title={`Cycle code ${code}`}>{cap(cycleWords(code))}</span> : "No ordering cycle yet"}
      </span>
    </div>
  );
}

/** The ordering cycles of the series in view, folded to four classes (monthly with or without one shutdown
 *  month; two months in three; every second month; quarterly), under a caption that names what is counted:
 *  series, not the units of the figure above it. */
const KIND_FOLD: { label: string; kinds: string[]; color: string }[] = [
  { label: "Monthly", kinds: ["M", "A"], color: "var(--hist-7)" },
  { label: "Two months in three", kinds: ["T"], color: "var(--hist-5)" },
  { label: "Every second month", kinds: ["B"], color: "var(--hist-4)" },
  { label: "Quarterly", kinds: ["Q"], color: "var(--hist-3)" },
];
function CycleMix({ facts }: { facts: ExplorerFacts }) {
  const parts = KIND_FOLD.map((g) => ({ value: g.kinds.reduce((a, k) => a + (facts.kinds[k] ?? 0), 0), color: g.color, label: g.label }))
    .filter((p) => p.value > 0)
    .map((p) => ({ ...p, text: fmtInt(p.value) }));
  const none = facts.kinds.unknown ?? 0;
  const counted = parts.reduce((a, p) => a + p.value, 0);
  return (
    <div className="g1-cyclemix">
      <span className="cap">
        How the <b>{fmtInt(facts.nSeries)}</b> series in view order (series counts, by ordering cycle)
      </span>
      <SplitBar parts={parts} ariaLabel={`Ordering cycles of the ${fmtInt(counted)} series with history: ${parts.map((p) => `${p.label} ${p.text}`).join(", ")}`} />
      {none > 0 && <span className="cap">and {fmtInt(none)} with no history yet</span>}
    </div>
  );
}

// ---- navigator ---------------------------------------------------------------------------------------------------
function NavigatorModule({ m, filters, nav, usd, setFilters }: { m: Model; filters: Filters; nav: ReturnType<typeof navigator>; usd: boolean; setFilters: (f: Filters) => void }) {
  const [q, setQ] = useState("");
  const crumbs: { label: string; apply: Filters }[] = [{ label: "All", apply: { ...filters, family: null, sku: null, region: null, customer: null } }];
  if (filters.family !== null) crumbs.push({ label: m.dims.families.name[filters.family], apply: { ...filters, sku: null, region: null, customer: null } });
  if (filters.sku !== null) crumbs.push({ label: m.dims.skus.id[filters.sku], apply: { ...filters, region: null, customer: null } });
  if (filters.region !== null && filters.sku !== null) crumbs.push({ label: m.dims.regions[filters.region], apply: { ...filters, customer: null } });
  if (filters.customer !== null && filters.sku !== null && filters.region !== null) crumbs.push({ label: m.dims.customers[filters.customer], apply: filters });
  const needle = q.trim().toLowerCase();
  const shown = nav.nodes.filter((n) => !needle || n.label.toLowerCase().includes(needle) || n.sub.toLowerCase().includes(needle));
  const max = Math.max(1e-9, ...nav.nodes.map((n) => n.vol));
  const [one, many] = LEVEL_WORD[nav.level];
  const top = nav.nodes[0];
  const title =
    nav.level === "customer"
      ? nav.nodes.length > 1
        ? `${cap(countWord(nav.nodes.length))} customers have bought this series`
        : nav.nodes.length === 1
          ? `${nav.nodes[0].label} is the only customer of this series`
          : "No customer has bought this series yet"
      : top && nav.total > 0 && nav.nodes.length > 1
        ? `${top.label} leads with ${fmtPct(top.vol / nav.total, 1)} of the last 12 months`
        : `${cap(many)} in this selection`;
  return (
    <Module
      title={title}
      dek={nav.level === "customer" ? "Customer at the time: the series' history by customer run. Pick one to see only its months." : `${cap(many)} ranked by ${usd ? "revenue" : "unconstrained demand"} over the last 12 months. Pick one to drill down.`}
      info={{
        what: "Drill-down navigator: family, then SKU, then region (one series), then customer. Every step filters the whole app; the breadcrumb rolls back up.",
        how: `Volume = ${usd ? "revenue at invoice prices" : "unconstrained demand"} over the last 12 actual months; share = of the level shown.`,
        source: "history.json, dims.json",
      }}
    >
      <nav className="g1-crumbs" aria-label="Drill-down path">
        {crumbs.map((c, i) => (
          <span key={i} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
            {i > 0 && (
              <span className="sep" aria-hidden="true">
                /
              </span>
            )}
            {i < crumbs.length - 1 ? (
              <button type="button" onClick={() => setFilters(c.apply)}>
                {c.label}
              </button>
            ) : (
              <span className="here" aria-current="location">
                {c.label}
              </span>
            )}
          </span>
        ))}
      </nav>
      {nav.nodes.length > 10 && (
        <div className="g1-search">
          <Search size={13} />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${fmtInt(nav.nodes.length)} ${many}`} aria-label={`Search the ${many}`} />
        </div>
      )}
      <ul className="g1-nav" aria-label={cap(many)}>
        {shown.slice(0, 150).map((n) => (
          <li key={n.key}>
            <button type="button" aria-current={n.current ? "true" : undefined} onClick={() => setFilters({ ...filters, ...n.apply })} title={n.sub}>
              <span className={`nm ${n.code ? "code" : ""}`}>{n.label}</span>
              <span className="vl">{usd ? fmtValue(n.vol, "usd", 1) : fmtValue(n.vol, "units", 1)}</span>
              <span className="ds">{n.sub}</span>
              <span className="sh">{nav.total > 0 ? fmtPct(n.vol / nav.total, 1) : "–"}</span>
              <span className="vb" style={{ width: `${Math.max(0.5, (n.vol / max) * 100)}%` }} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      <p className="g1-nav-foot">
        {needle ? `${fmtInt(shown.length)} of ${fmtInt(nav.nodes.length)} ${many} match` : `${fmtInt(nav.nodes.length)} ${nav.nodes.length === 1 ? one : many}`}
        {shown.length > 150 ? "; the first 150 are listed, search to narrow" : ""}
      </p>
      {nav.siblings.length > 1 && filters.sku !== null && (
        <>
          <h3 className="g1-h3">{m.dims.skus.id[filters.sku]} in every region</h3>
          <ul className="g1-nav" aria-label={`${m.dims.skus.id[filters.sku]} by region`}>
            {nav.siblings.map((n) => (
              <li key={n.key}>
                <button type="button" aria-current={n.current ? "true" : undefined} onClick={() => setFilters({ ...filters, ...n.apply })} title={n.sub}>
                  <span className="nm">{n.label}</span>
                  <span className="vl">{fmtValue(n.vol, usd ? "usd" : "units", 1)}</span>
                  <span className="ds">{n.sub}</span>
                  <span className="sh">{nav.sibTotal > 0 ? fmtPct(n.vol / nav.sibTotal, 1) : "–"}</span>
                  <span className="vb" style={{ width: `${Math.max(0.5, (n.vol / Math.max(1e-9, ...nav.siblings.map((x) => x.vol))) * 100)}%` }} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Module>
  );
}

// ---- seasonality ---------------------------------------------------------------------------------------------------
function seasonOption(s: SeasonFacts, t: Theme): EChartsCoreOption {
  const all = [...s.years.flatMap((y) => y.idx), ...s.avg];
  // round ticks: snap the axis ends to a step from 0.1 / 0.2 / 0.5 / 1 that gives at most five intervals,
  // so ECharts never prints an unrounded extreme as an extra, colliding tick
  const dataLo = Math.min(...all, 1);
  const dataHi = Math.max(...all, 1);
  const step = [0.1, 0.2, 0.5, 1, 2].find((st) => Math.ceil(dataHi / st) - Math.floor(dataLo / st) <= 5) ?? 2;
  const lo = Math.max(0, Math.floor(dataLo / step - 1e-9) * step);
  const hi = Math.ceil(dataHi / step + 1e-9) * step;
  const latest = s.years[s.years.length - 1];
  // the two end labels (latest year, average) sit apart when their values are close
  const close = latest && Math.abs(latest.idx[11] - s.avg[11]) < (hi - lo) * 0.09;
  const up = latest && latest.idx[11] >= s.avg[11];
  const off = (mine: boolean) => (close ? [0, mine ? -8 : 8] : [0, 0]);
  return {
    ...baseOption(t),
    grid: { left: 34, right: 62, top: 14, bottom: 28 },
    xAxis: categoryAxis(t, MONTHS_SHORT, { axisLabel: { color: t.ink3, fontFamily: FONT, fontSize: fz(11.5), interval: (i: number) => i % 3 === 0, formatter: (v: string) => v } }),
    yAxis: {
      type: "value",
      min: lo,
      max: hi,
      interval: step,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: t.ink3, fontFamily: FONT, fontSize: fz(11.5), formatter: (v: number) => `${v.toFixed(step < 1 ? 1 : 0)}×` },
      splitLine: { lineStyle: { color: t.grid, width: 1, type: "solid" } },
    },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "line", lineStyle: { color: t.ink3, width: 1 } },
      ...tooltipStyle(t),
      formatter: (p: { dataIndex: number }[]) => {
        const i = p[0]?.dataIndex ?? 0;
        const vals = s.years.map((y) => y.idx[i]);
        return `${ttHead(MONTHS_SHORT[i], "index")}${latest ? ttRow(t.ink, String(latest.y), `${latest.idx[i].toFixed(2)}×`) : ""}${ttRow(t.ink3, "average", `${s.avg[i].toFixed(2)}×`)}${ttRow(t.ink4, `range of ${s.years.length} years`, `${Math.min(...vals).toFixed(2)}–${Math.max(...vals).toFixed(2)}×`)}${ttEnd()}`;
      },
    },
    series: [
      { name: "base", type: "line", data: MONTHS_SHORT.map(() => 1), symbol: "none", silent: true, lineStyle: { color: t.ruleStrong, width: 1 }, z: 1 },
      ...s.years.slice(0, -1).map((y) => ({ name: String(y.y), type: "line", data: y.idx, symbol: "none", silent: true, lineStyle: { color: t.ink4, width: 1 }, z: 2 })),
      { name: "Average", type: "line", data: s.avg, symbol: "none", lineStyle: { color: t.ink3, width: 1.5, type: "solid" }, z: 3, endLabel: { show: true, formatter: "Average", color: t.ink2, fontFamily: FONT, fontSize: fz(11.5), distance: 6, offset: off(!up) } },
      ...(latest ? [{ name: String(latest.y), type: "line", data: latest.idx, symbol: "none", lineStyle: { color: t.ink, width: 2, join: "round" }, z: 4, endLabel: { show: true, formatter: String(latest.y), color: t.ink, fontFamily: FONT, fontSize: fz(11.5), fontWeight: 600, distance: 6, offset: off(!!up) } }] : []),
    ],
  } as EChartsCoreOption;
}

function SeasonModule({ m, theme, season }: { m: Model; theme: Theme; season: SeasonFacts }) {
  const option = useMemo(() => (season.years.length ? seasonOption(season, theme) : null), [season, theme]);
  const title = render(SEASON_TEMPLATES.title, season).text;
  const span = season.years.length ? `${season.years[0].y}–${season.years[season.years.length - 1].y}` : "";
  return (
    <Module
      title={title}
      dek={
        season.years.length
          ? `Latent monthly demand, each full year's months over that year's average (1.0× = an average month), ${span}. ${season.latest} in ink; earlier years as hairlines${season.excluded.length ? `; the average leaves out ${season.excluded.join(", ")} (${season.excludedWhy ?? "a disruption"})` : ""}.`
          : `Needs at least one calendar year with demand in every month between ${monthName(m.months[0])} and ${monthName(m.months[m.asOf])}.`
      }
      info={{
        what: "The month-of-year profile of the selection. Latent demand spreads each order over the months it covers, so ordering cycles do not create false peaks.",
        how: "Each year's 12 months divided by that year's mean; years with an empty month are skipped. The average leaves out years that overlap a demand disruption in the events calendar.",
        source: "history.json (latent), dims.json (events)",
      }}
    >
      {option ? <EChart option={option} height={250} ariaLabel={`${title}. Seasonality index by month, ${span}.`} /> : <Empty title="No full year to profile">Pick a broader selection, or a series with at least one complete calendar year of demand.</Empty>}
    </Module>
  );
}

// ---- zero-month calendar ----------------------------------------------------------------------------------------------
function ZeroModule({ m, facts, z, single, segs, onCell }: { m: Model; facts: ExplorerFacts; z: ZeroStats; single: number | null; segs: number[]; onCell: (c: CellRef) => void }) {
  const y0 = Number(m.months[0].slice(0, 4));
  const y1 = Number(m.months[m.asOf].slice(0, 4));
  const years = Array.from({ length: y1 - y0 + 1 }, (_, k) => y0 + k);
  const title = render(EXPLORER_TEMPLATES.zeroTitle, facts).text;
  // one series: the cell values for magnitude shading and tooltips
  const vals = useMemo(() => {
    if (single === null) return null;
    const v = new Map<number, { d: number; fl: number }>();
    for (const g of segs) if (m.gSeries[g] === single) for (let k = 0; k < m.gLen[g]; k++) v.set(m.gStart[g] + k, { d: m.d[m.gOff[g] + k], fl: m.f[m.gOff[g] + k] });
    return v;
  }, [single, segs, m]);
  const vmax = vals ? Math.max(1, ...[...vals.values()].map((x) => x.d)) : 1;
  const ramp = ["var(--hist-1)", "var(--hist-2)", "var(--hist-3)", "var(--hist-4)", "var(--hist-5)"];
  const b = m.bit;
  const cellOf = (t: number) => {
    const label = monthName(m.months[t]);
    if (t > m.asOf || z.cells[t] === 0) return { cls: "out", tip: `${label}: no record for this selection`, glyph: null as string | null, bg: undefined as string | undefined };
    if (single !== null && vals) {
      const v = vals.get(t);
      if (!v) return { cls: "out", tip: `${label}: outside the series' sales window`, glyph: null, bg: undefined };
      const miss = v.fl & b.missing_row ? " miss" : "";
      const extra = `${v.fl & b.missing_row ? "; row rebuilt from the Record_ID grid, not zero-filled" : ""}${v.fl & (b.stockout_listed | b.stockout_inferred) ? "; stock-out month, demand unconstrained" : ""}${v.fl & b.one_off ? "; one-off order" : ""}${(v.fl & m.accumMask) > 1 ? `; the order carries ${v.fl & m.accumMask} months` : ""}`;
      if (v.d === 0) {
        if (z.sched[t]) return { cls: `sched${miss}`, tip: `${label}: zero, a scheduled off-month of the ordering cycle${extra}`, glyph: null, bg: undefined };
        if (z.lost[t]) return { cls: `lost${miss}`, tip: `${label}: zero, after the account was lost${extra}`, glyph: "L", bg: undefined };
        return { cls: `unexp${miss}`, tip: `${label}: zero on an order month (launch ramp, lockdown or a skipped order)${extra}`, glyph: "x", bg: undefined };
      }
      return { cls: `order${miss}`, tip: `${label}: ${fmt1(v.d)} units${extra}`, glyph: null, bg: ramp[Math.min(4, Math.round((v.d / vmax) * 4))] };
    }
    const n = z.unexp[t];
    return n > 0
      ? { cls: "unexp", tip: `${label}: ${fmtInt(z.zeros[t])} zero cells of ${fmtInt(z.cells[t])}; ${fmtInt(n)} on an order month`, glyph: fmtInt(n), bg: undefined }
      : { cls: "sched", tip: `${label}: ${fmtInt(z.zeros[t])} zero cells of ${fmtInt(z.cells[t])}, every one a scheduled off-month${z.lost[t] ? " or a lost-account tail" : ""}`, glyph: null, bg: undefined };
  };
  return (
    <Module
      title={title}
      dek={
        single !== null
          ? `Every month of the series, ${years[0]}–${years[years.length - 1]}: shade is units, a dot is a scheduled off-month, a cross a zero on an order month. Click a month for its lineage.`
          : `Months of ${years[0]}–${years[years.length - 1]}: a dot means every zero cell that month was a scheduled off-month; a number counts zeros that fell on an order month.`
      }
      info={{
        what: "Why the zeros are there. Most zero months are the off-months of a customer's ordering cycle (every second month, quarterly, two months in three, an annual shutdown), not missing demand.",
        how: "Flags from the demand stage: on-phase, structural zero (scheduled), lost-account tail, missing row. A zero on an order month is unexplained by the cycle: a launch ramp, a lockdown or a skipped order.",
        source: "history.json (flags)",
      }}
    >
      <div className="g1-cal" role="group" aria-label="Zero-month calendar">
        <span />
        {MONTHS_SHORT.map((mm) => (
          <span key={mm} className="mh" aria-hidden="true">
            {mm.charAt(0)}
          </span>
        ))}
        {years.map((y) => (
          <Row key={y} y={y} m={m} cellOf={cellOf} single={single} onCell={onCell} />
        ))}
      </div>
      <div className="g1-cal-key">
        {single !== null ? (
          <>
            <span>
              <i className="ramp" />
              <span className="ends">1–{fmtInt(vmax)} units</span>
            </span>
            <span>
              <i className="sched" /> Scheduled off-month
            </span>
            <span>
              <i className="unexp">
                <Cross />
              </i>{" "}
              Zero on an order month
            </span>
            <span>
              <i className="miss" /> Row rebuilt
            </span>
          </>
        ) : (
          <>
            <span>
              <i className="sched" /> Every zero scheduled
            </span>
            <span>
              <i className="unexp" style={{ fontSize: fz(10), fontWeight: 600 }}>
                n
              </i>{" "}
              Zeros on an order month
            </span>
          </>
        )}
      </div>
    </Module>
  );
}

function Cross() {
  return (
    <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true">
      <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function Row({ y, m, cellOf, single, onCell }: { y: number; m: Model; cellOf: (t: number) => { cls: string; tip: string; glyph: string | null; bg?: string }; single: number | null; onCell: (c: CellRef) => void }) {
  return (
    <>
      <span className="yr">{y}</span>
      {MONTHS_SHORT.map((_, k) => {
        const t = m.months.indexOf(`${y}-${String(k + 1).padStart(2, "0")}`);
        if (t < 0) return <span key={k} className="c out" />;
        const c = cellOf(t);
        const body = c.glyph === "x" ? <Cross /> : c.glyph;
        return single !== null && !c.cls.startsWith("out") ? (
          <button key={k} type="button" className={`c ${c.cls}`} style={c.bg ? { background: c.bg } : undefined} title={c.tip} aria-label={c.tip} onClick={() => onCell({ s: single, t })}>
            {body}
          </button>
        ) : (
          <span key={k} className={`c ${c.cls}`} style={c.bg ? { background: c.bg } : undefined} title={c.tip} role="img" aria-label={c.tip}>
            {body}
          </span>
        );
      })}
    </>
  );
}

// ---- series card (one series) and composition (aggregate) ------------------------------------------------------------
const SBC: Record<string, string> = { smooth: "smooth", erratic: "erratic", intermittent: "intermittent", lumpy: "lumpy" };
function SeriesCard({ m, s, prof, loading, facts }: { m: Model; s: number; prof: ProfilesFile | null; loading: boolean; facts: ExplorerFacts }) {
  const sku = m.sSku[s];
  const S = m.dims.skus;
  const p = prof?.series;
  const v = (k: string) => (p ? (p[k]?.[s] ?? null) : null);
  const events = useMemo(() => {
    if (!prof) return [];
    const ae = prof.account_events;
    const out: number[] = [];
    (ae.series as number[]).forEach((x, i) => x === s && out.push(i));
    return out;
  }, [prof, s]);
  const cls = v("sbc_class") as string | null;
  const nCust = facts.customers.length;
  const status = S.status[sku];
  const lifeWords = S.eol[sku] ? `end of life ${monthName(S.eol[sku] as string)}` : status === "Planned Launch" ? `launch planned for ${monthName(S.launch[sku] as string)}` : `${(status ?? "active").toLowerCase()} since ${S.launch[sku] ? monthName(S.launch[sku] as string) : "the start of the history"}`;
  const title = cls ? `${cap(SBC[cls] ?? cls)} demand from ${countWord(nCust)} ${plural(nCust, "customer")}; ${lifeWords}` : `${S.id[sku]} in ${m.dims.regions[m.sRegion[s]]}`;
  const span0 = m.sStart[s] >= 0 ? m.sStart[s] : 0;
  const span1 = m.asOf;
  const x = (t: number) => `${((t - span0) / Math.max(1, span1 - span0 + 1)) * 100}%`;
  const w = (a: number, b: number) => `${((b - a + 1) / Math.max(1, span1 - span0 + 1)) * 100}%`;
  return (
    <Module
      title={title}
      dek="Master data, lifecycle, ordering cycle, customers over time and what cleaning and stock-outs did to this series."
      info={{ what: "Facts about the selected series from the SKU master, the demand state and the series profile.", how: "Demand class by the Syntetos–Boylan rule on inter-demand interval (ADI) and squared coefficient of variation (CV²).", source: "dims.json, profiles.json" }}
    >
      <dl className="g1-card">
        <dt>Product</dt>
        <dd>
          {S.description[sku] ?? "–"}
          <span className="sub">
            {S.size_class[sku] ?? "–"}, {S.powertrain[sku] ?? "–"} powertrain, {m.dims.channels[m.sChannel[s]]}
          </span>
        </dd>
        <dt>Lifecycle</dt>
        <dd>
          <StatusPill tone={status === "Active" ? "neutral" : status === "EOL Announced" || status === "Discontinued" ? "warn" : "neutral"}>{status ?? "–"}</StatusPill>
          <span className="sub">
            Launched {S.launch[sku] ? monthName(S.launch[sku] as string) : "before 2019"}
            {S.eol[sku] ? `; end of life ${monthName(S.eol[sku] as string)}` : "; no end of life planned"}
            {S.replaces[sku] ? `; replaces ${S.replaces[sku]}` : ""}
          </span>
        </dd>
        <dt>Customers</dt>
        <dd>
          <div className="g1-gantt" aria-label="Customers over time">
            {facts.customers.map((c, i) => (
              <div className="run" key={i}>
                <span className="nm">
                  {c.name} <em>{monthName(m.months[c.from])} – {monthName(m.months[c.to])}</em>
                </span>
                <span className="lane">
                  <i className={i === facts.customers.length - 1 ? "now" : ""} style={{ left: x(c.from), width: w(c.from, c.to) }} />
                </span>
              </div>
            ))}
            <div className="axis">
              <span>{monthName(m.months[span0])}</span>
              <span>{monthName(m.months[span1])}</span>
            </div>
          </div>
        </dd>
        <dt>Ordering cycle</dt>
        <dd>
          {cap(cycleWords(m.dims.series.cycle[s]))}
          {v("cycle_pattern_before") ? (
            <span className="sub" title={`Cycle code ${m.dims.series.cycle[s] ?? "–"}, was ${String(v("cycle_pattern_before"))}`}>
              Until {monthName(String(v("cycle_change_month")))}: {cycleWords(String(v("cycle_pattern_before")))}
            </span>
          ) : null}
        </dd>
        {p && (
          <>
            <dt>Demand</dt>
            <dd>
              {fmt1(Number(v("level_last12")))} units a month on average over the last 12
              <span className="sub">
                <span title={`Syntetos–Boylan: ADI ${Number(v("sbc_adi")).toFixed(2)} (average months between orders), CV² ${Number(v("sbc_cv2")).toFixed(2)} (variation of order size)`}>
                  {fmtInt(Number(v("n_orders")))} orders, {fmtInt(Number(v("mean_order")))} units each on average; {Number(v("sbc_adi")) <= 1.05 ? "an order every month" : `an order every ${fmt1(Number(v("sbc_adi")))} months`}
                </span>
              </span>
            </dd>
            <dt>Stock-outs</dt>
            <dd>
              {Number(v("n_stockout_listed")) + Number(v("n_stockout_inferred")) > 0 ? `${fmtInt(Number(v("n_stockout_listed")))} listed, ${fmtInt(Number(v("n_stockout_inferred")))} inferred` : "None"}
              {Number(v("lost_units")) > 0 && <span className="sub">{fmtInt(Number(v("lost_units")))} units lost</span>}
            </dd>
            <dt>Cleaning</dt>
            <dd>
              {fmtInt(Number(v("n_fixes")))} values fixed
              <span className="sub">
                {fmtInt(Number(v("n_missing_rows")))} {plural(Number(v("n_missing_rows")), "row")} rebuilt, {fmtInt(Number(v("n_one_offs")))} one-off {plural(Number(v("n_one_offs")), "order")}
              </span>
            </dd>
          </>
        )}
        {facts.lostAccount && (
          <>
            <dt>Account</dt>
            <dd>
              <StatusPill tone="crit">Lost</StatusPill>
              <span className="sub">
                Last order {facts.lastOrder ? monthName(facts.lastOrder) : "–"}
                {facts.silent ? `; silent ${fmtInt(facts.silent)} ${plural(facts.silent, "month")}` : ""}; the forecast is zero
              </span>
            </dd>
          </>
        )}
        {events.length > 0 && prof && (
          <>
            <dt>Account events</dt>
            <dd>
              {events.map((i) => {
                const ae = prof.account_events;
                const ratio = ae.level_ratio[i];
                return (
                  <span key={i} className="sub" style={{ color: "var(--ink)" }}>
                    {cap(String(ae.event_type[i]).replace(/_/g, " "))}, {monthName(String(ae.month[i]))}: {String(ae.before[i] ?? "")} to {String(ae.after[i] ?? "")}
                    {ratio !== null ? `, level ×${Number(ratio).toFixed(2)}` : ""}
                  </span>
                );
              })}
            </dd>
          </>
        )}
      </dl>
      {loading && <Loading what="the series profile" height={60} />}
    </Module>
  );
}

function Composition({ m, series, prof, facts }: { m: Model; series: number[]; prof: ProfilesFile | null; facts: ExplorerFacts }) {
  const { go } = useApp();
  const status = new Map<string, number>();
  const skus = new Set<number>();
  let lost = 0;
  let switches = 0;
  const cls = new Map<string, number>();
  for (const s of series) {
    skus.add(m.sSku[s]);
    lost += m.dims.series.lost[s];
    if (m.dims.series.switch_month[s]) switches++;
    const c = prof?.series.sbc_class?.[s];
    if (typeof c === "string") cls.set(c, (cls.get(c) ?? 0) + 1);
  }
  for (const k of skus) {
    const st = m.dims.skus.status[k] ?? "–";
    status.set(st, (status.get(st) ?? 0) + 1);
  }
  const monthly = (facts.kinds.M ?? 0) / Math.max(1, facts.nSeries);
  const ending = (status.get("EOL Announced") ?? 0) + (status.get("Discontinued") ?? 0);
  const title = `${cap(fractionWord(monthly))} of ${fmtInt(facts.nSeries)} series order every month; ${lost ? `${countWord(lost)} ${plural(lost, "account")} ${lost === 1 ? "was" : "were"} lost` : "no account was lost"}`;
  const stOrder = ["Active", "EOL Announced", "Discontinued", "Planned Launch"];
  const stColor: Record<string, string> = { Active: "var(--hist-6)", "EOL Announced": "var(--hist-4)", Discontinued: "var(--hist-3)", "Planned Launch": "var(--hist-2)" };
  return (
    <Module
      title={title}
      dek="Lifecycle, demand class and account events of the series in view. Pick one SKU and one region to open its series card."
      info={{ what: "The make-up of the selection: SKU lifecycle status from the master, demand classes, lost accounts and customer switches.", how: "Demand class by the Syntetos–Boylan rule; a lost account is six or more silent months on a live series.", source: "dims.json, profiles.json" }}
    >
      <h3 className="g1-h3">SKU lifecycle, {fmtInt(skus.size)} SKUs</h3>
      <SplitBar
        parts={stOrder.filter((k) => status.get(k)).map((k) => ({ value: status.get(k) as number, color: stColor[k], label: k === "EOL Announced" ? "End of life announced" : cap(k.toLowerCase()), text: fmtInt(status.get(k) as number) }))}
        ariaLabel={`SKU lifecycle status: ${stOrder.filter((k) => status.get(k)).map((k) => `${k} ${status.get(k)}`).join(", ")}`}
      />
      <dl className="g1-facts">
        <dt>Demand class</dt>
        <dd>{cls.size ? [...cls.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${SBC[k] ?? k} ${fmtInt(n)}`).join(", ") : "–"}</dd>
        <dt>Lost accounts</dt>
        <dd>{fmtInt(lost)}</dd>
        <dt>Customer switches</dt>
        <dd>{fmtInt(switches)}</dd>
        <dt>Ending in the window</dt>
        <dd>{ending ? `${fmtInt(ending)} ${plural(ending, "SKU")} discontinued or end of life announced` : "None"}</dd>
      </dl>
      <p style={{ marginTop: 12 }}>
        <MoreLink onClick={() => go("lifecycle")}>Launches and end of life in the forecast window</MoreLink>
      </p>
    </Module>
  );
}

