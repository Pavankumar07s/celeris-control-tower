// O5 Stock-outs & lost sales (training data): how much demand did supply constraints hide, where, and what
// did it cost?
//  lede (computed headline + standfirst | hero: lost sales, with the shortfall split lost / back-ordered)
//  -> the shared timeline: shipped against unconstrained demand, the loss gap shaded
//  -> lost and back-ordered units by month | lost sales by year, family, region or reason (tabbed bar table)
//  -> shortfall heat map (family, or region inside a family, by month), supply-constraint events bracketed
//  -> how a stock-out plays out (mechanics measured on the listed rows) | the top series by lost sales.
import { useCallback, useMemo } from "react";
import type { EChartsCoreOption } from "echarts/core";
import { useApp } from "../app/context";
import { useSelection, useElementWidth } from "../app/hooks";
import { EChart } from "../charts/EChart";
import { eventTitle, laneEvents, timelineAnnotations, type TimelineModel, type TimelineSpec, markPresence } from "../charts/timeline";
import { BAR_MAX, FONT, fz, baseOption, categoryAxis, niceMax, scaleLegend, tooltipStyle, ttEnd, ttHead, ttNote, ttRow, valueAxis, type Theme } from "../charts/theme";
import { Tabs } from "../components/controls";
import { HeroFigure, Lede } from "../components/Figure";
import { Key, Module, timelineKey } from "../components/Module";
import { Empty, ErrorState, Loading } from "../components/states";
import { BarTable, DataTable, type Column } from "../components/tables";
import { sum } from "../data/aggregate";
import { fmtInt, fmtMoney, fmtPct, monthName, monthSpan } from "../data/format";
import { useResource } from "../data/load";
import type { Filters, Model } from "../data/model";
import type { StockoutFile } from "../data/types";
import { cap, renderFirst, render, selectionWords } from "../insights/headlines";
import { filterPatch } from "../state/url";
import { STOCKOUT_HEADLINES, STOCKOUT_TEMPLATES, breakdownTitle, roundParts, stockoutFacts, type Share, type StockoutFacts } from "../insights/stockouts";
import { SplitBar } from "./g1/parts";
import { TimelineChart } from "../charts/TimelineChart";
import "./g1/g1.css";

type By = "year" | "family" | "region" | "reason";
const BY_WORD: Record<By, string> = { year: "Year", family: "Family", region: "Region", reason: "Reason" };

export default function Stockouts() {
  const { m, theme, filters, measure, params, setParam, go } = useApp();
  const { segs, single, h } = useSelection();
  const so = useResource<StockoutFile>("stockouts.json");
  const usd = measure === "usd";
  const by = (["year", "family", "region", "reason"].includes(params.get("by") ?? "") ? params.get("by") : "year") as By;

  // stock-out cells of the selection (customer at the time)
  const segOk = useMemo(() => {
    const map = new Map<number, number[]>();
    for (const g of segs) map.set(m.gSeries[g], [...(map.get(m.gSeries[g]) ?? []), g]);
    return (s: number, t: number) => (map.get(s) ?? []).some((g) => t >= m.gStart[g] && t < m.gStart[g] + m.gLen[g]);
  }, [segs, m]);
  const keep = useMemo(() => {
    if (!so.data) return [];
    const c = so.data.cells;
    const out: number[] = [];
    for (let i = 0; i < c.series.length; i++) if (segOk(c.series[i], c.month[i])) out.push(i);
    return out;
  }, [so.data, segOk]);
  const keepListed = useMemo(() => {
    if (!so.data) return [];
    const L = so.data.listed;
    const out: number[] = [];
    for (let i = 0; i < L.series.length; i++) if (segOk(L.series[i], L.month[i])) out.push(i);
    return out;
  }, [so.data, segOk]);

  const sel = useMemo(() => selectionWords(m, filters), [m, filters]);
  const name = single !== null ? `${m.dims.skus.id[m.sSku[single]]} in ${m.dims.regions[m.sRegion[single]]}` : sel.name;
  const facts = useMemo(() => (so.data ? stockoutFacts(m, so.data, keep, measure, filters.family !== null, name, sum(h.demand)) : null), [so.data, m, keep, measure, filters.family, name, h.demand]);

  // the shared timeline: history only, no rebuilt rings (this view is about supply)
  const noRings = useMemo(() => new Int32Array(m.asOf + 1), [m]);
  const spec = useMemo<Omit<TimelineSpec, "narrow" | "height">>(
    () => ({ m, theme, measure, lens: "orders", filters, hist: { shipped: h.shipped, demand: h.demand, imputed: noRings, cells: h.cells, missing: h.missing, unknownDemand: h.unknownDemand }, range: [0, m.asOf], columns: single !== null }),
    [m, theme, measure, filters, h, noRings, single],
  );
  const annotate = useCallback((tm: TimelineModel) => timelineAnnotations({ spec: { ...spec }, model: tm, include: ["disruption", "gap"] }), [spec]);
  const gap = useMemo(() => {
    let best = -1;
    let share = 0;
    for (let t = 0; t <= m.asOf; t++) {
      const d = h.demand[t];
      if (d <= 0) continue;
      const s = (d - h.shipped[t] - h.unknownDemand[t]) / d;
      if (s > share) {
        share = s;
        best = t;
      }
    }
    return { t: best, share };
  }, [h, m]);
  const events = useMemo(() => laneEvents(m, filters), [m, filters]);
  const constraintAt = useCallback(
    (t: number) => {
      const e = events.find((x) => m.dims.events.type[x.i] === "Supply Constraint" && x.start <= t && x.end >= t);
      return e ? eventTitle(m.dims.events.description[e.i]) : null;
    },
    [events, m],
  );

  if (so.loading || !facts)
    return so.error ? (
      <ErrorState message={so.error} />
    ) : (
      <>
        <Lede headline="Reading the stock-out cells…" />
        <Loading what="stock-out data" height={320} />
      </>
    );
  const S = so.data as StockoutFile;
  const f = facts;
  const range = `${monthName(m.months[0])} – ${monthName(m.months[m.asOf])}`;
  const tTitle = gap.t >= 0 && gap.share > 0.005 ? `Shipments ran ${fmtPct(gap.share, 1)} below demand in ${monthName(m.months[gap.t])}, the widest gap${constraintAt(gap.t) ? `, during the ${constraintAt(gap.t)?.replace(/^[A-Z][a-z]/, (c) => c.toLowerCase())}` : ""}` : "Shipments met unconstrained demand in every month";
  const tDek = `${usd ? "Revenue in USD" : "Units"} per month, ${range}. ${single !== null ? "Shipped columns with the loss to stock-outs stacked on top." : "The ink line is unconstrained demand; the hairline shows shipments where they fell short, and the shaded gap is the demand lost."}`;
  const y0 = m.months[0].slice(0, 4);
  const y1 = m.months[m.asOf].slice(0, 4);

  return (
    <>
      <Lede
        headline={renderFirst(STOCKOUT_HEADLINES, f).text}
        standfirst={render(STOCKOUT_TEMPLATES.standfirst, f).text}
        figure={
          <HeroFigure
            label={`Lost sales, ${y0}–${y1}`}
            value={usd ? fmtMoney(f.lost, 1) : fmtInt(f.lost)}
            unit={usd ? undefined : "units"}
            visual={
              f.lostU + f.bo > 0 ? (
                <SplitBar
                  ariaLabel={`Shortfall in units: ${fmtInt(f.lostU)} lost, ${fmtInt(f.bo)} back-ordered`}
                  parts={[
                    { value: f.lostU, color: "var(--loss)", label: "Lost", text: fmtInt(f.lostU) },
                    { value: f.bo, color: "var(--hist-4)", label: "Back-ordered, shipped late", text: fmtInt(f.bo) },
                  ]}
                />
              ) : undefined
            }
            context={f.demand > 0 ? `**${fmtPct(f.lost / f.demand, 2)}** of unconstrained demand${usd ? `; ${fmtInt(f.lostU)} units` : `; **${fmtMoney(f.lostUsd, 1)}** at invoice prices`}` : "No history in this selection."}
            info={{
              what: "Units customers requested but Celeris never shipped: listed stock-outs, imputed unlisted semiconductor months and detected hidden stock-outs. The bar splits the shortfall (in units) into the part lost and the part back-ordered and shipped the following month.",
              how: "Lost units × the invoice price of the month; shares are against the selection's unconstrained demand over the same period.",
              source: "stockouts.json (cells), history.json",
            }}
          />
        }
      />

      <MonthlyModule m={m} theme={theme} so={S} keep={keep} constraintAt={constraintAt} lead />

      <div className="cols-7-5">
        <Module
          title={tTitle}
          dek={tDek}
          info={{
            what: "Context for the bars above: the selection's history, cleaned shipments against unconstrained demand, the basis of the forecast (business rule 7). The gap between them is the demand that stock-outs hid; at this scale it is thin except in the worst months.",
            how: "Demand = Requested_Units on listed stock-outs, imputed on unlisted semiconductor months and hidden stock-outs; the back-order catch-up is removed from the following month. ERP blanks of unknown size are kept out of the gap.",
            source: "history.json, dims.json (events)",
          }}
        >
          <Key items={timelineKey({ fc: false, rebuilt: false, columns: single !== null, present: markPresence(spec) })} />
          {f.demand > 0 ? <TimelineChart spec={spec} annotate={annotate} height={single !== null ? 240 : 250} ariaLabel={`${tTitle}. ${tDek}`} /> : <Empty title="No history for this selection">Clear the customer filter to widen the view.</Empty>}
        </Module>
        <BreakdownModule f={f} by={by} onBy={(v) => setParam({ by: v === "year" ? null : v }, true)} />
      </div>

      <HeatModule m={m} theme={theme} so={S} keep={keep} segs={segs} filters={filters} events={events} />

      <div className="cols-5-7">
        <MechanicsModule so={S} keepListed={keepListed} />
        <TopSeriesModule m={m} so={S} keep={keep} f={f} usd={usd} onOpen={(s) => go("explorer", filterPatch(m, { ...filters, family: m.sFamily[s], sku: m.sSku[s], region: m.sRegion[s] }))} />
      </div>
    </>
  );
}

// ---- lost and back-ordered by month ---------------------------------------------------------------------------------
function MonthlyModule({ m, theme: t, so, keep, constraintAt, lead }: { m: Model; theme: Theme; so: StockoutFile; keep: number[]; constraintAt: (t: number) => string | null; lead?: boolean }) {
  const n = m.asOf + 1;
  const { lost, bo, peak } = useMemo(() => {
    const c = so.cells;
    const lost = new Float64Array(n);
    const bo = new Float64Array(n);
    for (const i of keep) {
      lost[c.month[i]] += c.lost[i];
      bo[c.month[i]] += c.backorder_out[i] ?? 0;
    }
    let peak = 0;
    for (let k = 1; k < n; k++) if (lost[k] > lost[peak]) peak = k;
    return { lost, bo, peak };
  }, [so, keep, n]);
  const labels = m.months.slice(0, n);
  const maxV = Math.max(...Array.from(lost, (v, k) => v + bo[k]));
  const option = useMemo<EChartsCoreOption>(
    () => ({
      ...baseOption(t),
      grid: { left: 46, right: 16, top: 26, bottom: 30 },
      xAxis: categoryAxis(t, labels, { axisLabel: { color: t.ink3, fontFamily: FONT, fontSize: fz(11.5), interval: (_: number, v: string) => v.endsWith("-01"), formatter: (v: string) => v.slice(0, 4) } }),
      yAxis: valueAxis(t, { max: niceMax(maxV * 1.12 || 1) }),
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow", shadowStyle: { color: t.hover, opacity: 0.6 } },
        ...tooltipStyle(t),
        formatter: (p: { dataIndex: number }[]) => {
          const k = p[0]?.dataIndex ?? 0;
          const ev = constraintAt(k);
          return `${ttHead(monthName(labels[k]), "actual")}${ttRow(t.loss, "lost, never shipped", fmtInt(lost[k]), "box")}${ttRow(t.hist[3], "back-ordered, shipped next month", fmtInt(bo[k]), "box")}${ev ? ttNote(ev) : ""}${ttEnd()}`;
        },
      },
      series: [
        {
          name: "Lost",
          type: "bar",
          stack: "s",
          data: Array.from(lost, (v, k) => (v <= 0 ? null : k === peak ? { value: v, label: { show: true, position: "top", formatter: `${monthName(labels[k])}: ${fmtInt(v)} lost`, color: t.ink, fontFamily: FONT, fontSize: fz(11.5), fontWeight: 600, distance: 4 } } : v)),
          barMaxWidth: BAR_MAX,
          barCategoryGap: "18%",
          itemStyle: { color: t.lossFill, borderColor: t.loss, borderWidth: 1 },
        },
        { name: "Back-ordered", type: "bar", stack: "s", data: Array.from(bo, (v) => (v > 0 ? v : null)), barMaxWidth: BAR_MAX, itemStyle: { color: t.hist[3], borderRadius: [2, 2, 0, 0] } },
      ],
    }),
    [t, labels, lost, bo, peak, maxV, constraintAt],
  );
  const ev = constraintAt(peak);
  const total = lost.reduce((a, b) => a + b, 0);
  const title = total > 0 ? `Lost units peak in ${monthName(labels[peak])} at ${fmtInt(lost[peak])}${ev ? `, inside the ${ev.replace(/^[A-Z][a-z]/, (c) => c.toLowerCase())}` : ""}` : "No unit was lost in this selection";
  return (
    <Module
      title={title}
      dek={`Units per month, ${monthName(labels[0])} – ${monthName(labels[n - 1])}: the shortfall split into units lost and units back-ordered, which ship the following month on top of its own demand.`}
      info={{ what: "Monthly shortfall of the stock-out cells in the selection: the part never shipped and the part shipped late.", how: "Lost = Requested + Carried_In − Shipped − Backordered on listed rows; imputed on unlisted semiconductor months and hidden stock-outs.", source: "stockouts.json (lost, backorder_out)" }}
    >
      <Key
        items={[
          { kind: "box", color: "var(--loss-fill)", label: "Lost, never shipped" },
          { kind: "box", color: "var(--hist-4)", label: "Back-ordered, shipped next month" },
        ]}
      />
      {total > 0 || maxV > 0 ? <EChart option={option} height={lead ? 320 : 270} ariaLabel={`${title}. Lost and back-ordered units by month.`} /> : <Empty title="No stock-out in this selection">Shipments met demand in every month.</Empty>}
    </Module>
  );
}

// ---- lost sales by year / family / region / reason ---------------------------------------------------------------------
function BreakdownModule({ f, by, onBy }: { f: StockoutFacts; by: By; onBy: (v: By) => void }) {
  const rows: Share[] = by === "year" ? f.byYear : by === "family" ? f.byFamily : by === "region" ? f.byRegion : f.byReason;
  const leader = rows.reduce<Share | null>((a, r) => (!a || r.v > a.v ? r : a), null);
  const usd = f.measure === "usd";
  // printed rows add up to the printed total: whole units (largest remainder), or USD at the hero's one
  // decimal of $M when every row is printed in millions; otherwise a rounding note
  const exact = !usd || rows.every((r) => r.v === 0 || r.v >= 1e6);
  const alloc = exact ? roundParts(rows.map((x) => x.v), usd ? 1e5 : 1) : null;
  const shown = new Map(rows.map((r, k) => [r, alloc ? alloc[k] : r.v]));
  return (
    <Module
      title={breakdownTitle(f, rows, by)}
      dek={`Lost sales ${usd ? "at the month's invoice price" : "in units"}, ${f.first.slice(0, 4)}–${f.last.slice(0, 4)}${by === "year" ? ", in calendar order" : ", largest first"}.`}
      info={{ what: "Lost sales of the selection by year, family, region or the reason given in the stock-out file (or the inference method for unlisted cells).", how: "Sums of the lost units (or lost USD) of every stock-out cell.", source: "stockouts.json (cells)" }}
    >
      <Tabs<By> ariaLabel="Break down lost sales by" value={by} onChange={onBy} options={(["year", "family", "region", "reason"] as By[]).map((b) => ({ value: b, label: BY_WORD[b] }))} />
      {f.lost > 0 ? (
        <BarTable<Share>
          ariaLabel={`Lost sales by ${by}`}
          rows={rows}
          rowKey={(r) => r.label}
          bar={{ value: (r) => r.v, tone: "loss", leader: (r) => r === leader }}
          cols={[
            { key: "l", label: BY_WORD[by], kind: "label", value: (r) => (by === "reason" ? cap(r.label) : r.label), width: by === "reason" ? "44%" : "36%" },
            { key: "b", label: "Lost", kind: "bar" },
            { key: "v", label: usd ? "USD" : "Units", kind: "num", value: (r) => (usd ? fmtMoney(shown.get(r) ?? r.v, 1) : fmtInt(shown.get(r) ?? r.v)), width: "17%" },
            { key: "p", label: "Share", kind: "num", value: (r) => (f.lost > 0 ? fmtPct(r.v / f.lost, 0) : "–"), width: "13%" },
          ]}
        />
      ) : null}
      {f.lost > 0 ? (
        <p className="bt-note">
          {exact ? `Rows are rounded so that they add up to the ${usd ? fmtMoney(f.lost, 1) : `${fmtInt(f.lost)} units`} above; shares are rounded on their own.` : "Rows are rounded separately, so they may not add up to the total exactly."}
        </p>
      ) : (
        <p className="state">No unit of this selection was lost.</p>
      )}
    </Module>
  );
}

// ---- shortfall heat map --------------------------------------------------------------------------------------------------
function HeatModule({ m, theme: t, so, keep, segs, filters, events }: { m: Model; theme: Theme; so: StockoutFile; keep: number[]; segs: number[]; filters: Filters; events: { i: number; start: number; end: number }[] }) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const narrow = width > 0 && width < 640;
  const byRegion = filters.family !== null;
  const rowsN = byRegion ? m.dims.regions.length : m.dims.families.name.length;
  const rowLabels = byRegion ? m.dims.regions : m.dims.families.name;
  // narrow screens: family codes and regions as they are, so the plot keeps most of the width
  const shortLabels = byRegion ? m.dims.regions : narrow ? m.dims.families.code : m.dims.families.name;
  const n = m.asOf + 1;
  const model = useMemo(() => {
    const c = so.cells;
    const short = new Float64Array(rowsN * n);
    const dem = new Float64Array(rowsN * n);
    const key = (s: number) => (byRegion ? m.sRegion[s] : m.sFamily[s]);
    for (const g of segs) {
      const r = key(m.gSeries[g]);
      for (let k = 0; k < m.gLen[g]; k++) dem[r * n + m.gStart[g] + k] += m.d[m.gOff[g] + k];
    }
    for (const i of keep) {
      if (c.shipped[i] === null || c.demand[i] === null || !(c.listed[i] || c.inferred[i])) continue;
      short[key(c.series[i]) * n + c.month[i]] += Math.max(0, (c.demand[i] as number) - (c.shipped[i] as number));
    }
    const data: number[][] = [];
    let max = 0;
    let at = { r: -1, t: -1 };
    const present: number[] = [];
    for (let r = 0; r < rowsN; r++) {
      let any = false;
      for (let mo = 0; mo < n; mo++) if (dem[r * n + mo] > 0) any = true;
      if (any) present.push(r);
    }
    present.forEach((r, row) => {
      for (let mo = 0; mo < n; mo++) {
        const k = r * n + mo;
        if (dem[k] > 0 && short[k] > 0) {
          const v = short[k] / dem[k];
          data.push([mo, row, v, short[k]]);
          if (v > max) {
            max = v;
            at = { r, t: mo };
          }
        }
      }
    });
    return { data, max, at, present };
  }, [so, keep, segs, m, rowsN, n, byRegion]);
  const labels = m.months.slice(0, n);
  const marks = events.filter((e) => m.dims.events.type[e.i] === "Supply Constraint").map((e) => ({ a: e.start, b: Math.min(e.end, n - 1), title: eventTitle(m.dims.events.description[e.i]) }));
  const option = useMemo<EChartsCoreOption>(() => {
    const max = model.max > 0 ? Math.ceil(model.max * 20) / 20 : 0.05;
    return {
      ...baseOption(t),
      grid: { left: 4, right: 14, top: marks.length ? 26 : 8, bottom: 62, containLabel: true },
      xAxis: categoryAxis(t, labels, { axisLabel: { color: t.ink3, fontFamily: FONT, fontSize: fz(11.5), interval: (_: number, v: string) => v.endsWith("-01") && (!narrow || Number(v.slice(0, 4)) % 2 === 1), formatter: (v: string) => v.slice(0, 4) } }),
      yAxis: { type: "category", data: model.present.map((r) => shortLabels[r]), inverse: true, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: t.ink2, fontFamily: FONT, fontSize: fz(11.5), width: narrow ? 96 : 170, overflow: "truncate" }, splitLine: { show: false } },
      visualMap: { ...scaleLegend(t, { min: 0, max, colors: [t.hist[1], t.hist[3], t.hist[5], t.hist[6]], format: (v) => fmtPct(v, 0), high: narrow ? "short" : "of the month's demand short", low: "" }), dimension: 2, itemHeight: narrow ? 120 : 160 },
      tooltip: {
        trigger: "item",
        ...tooltipStyle(t),
        formatter: (p: { value: number[] }) => `${ttHead(monthName(labels[p.value[0]]), rowLabels[model.present[p.value[1]]])}${ttRow(t.hist[4], "of the month's demand short", fmtPct(p.value[2], 1), "box")}${ttRow(t.hist[4], "units short", fmtInt(p.value[3]), "box")}${ttEnd()}`,
      },
      series: [
        { type: "heatmap", data: model.data, itemStyle: { borderColor: t.paper, borderWidth: 1 }, emphasis: { itemStyle: { borderColor: t.ink, borderWidth: 1 } } },
        {
          type: "line",
          data: [],
          silent: true,
          markArea: {
            silent: true,
            itemStyle: { color: "rgba(0,0,0,0)", borderColor: t.ink3, borderWidth: 1 },
            label: { show: true, position: "top", color: t.ink, fontFamily: FONT, fontSize: fz(12), fontWeight: 600, distance: 4 },
            data: marks.map((x) => [{ xAxis: labels[x.a], name: `${x.title}, ${monthSpan(labels[x.a], labels[x.b])}` }, { xAxis: labels[x.b] }]),
          },
        },
      ],
    } as EChartsCoreOption;
  }, [t, model, labels, rowLabels, shortLabels, marks, narrow]);
  const dim = byRegion ? "region" : "family";
  const title = model.at.r >= 0 ? `${rowLabels[model.at.r]} lost up to ${fmtPct(model.max, 0)} of a month's demand, in ${monthName(labels[model.at.t])}` : `No ${dim} was short of stock`;
  return (
    <Module
      title={title}
      dek={`Units not shipped on time in stock-out cells as a share of the ${dim}'s unconstrained demand that month, ${monthName(labels[0])} – ${monthName(labels[n - 1])}. Darker is a deeper shortage; brackets mark supply-constraint events.`}
      info={{ what: `Where and when supply bit: the shortfall of every ${dim}, month by month.`, how: "Σ (unconstrained demand − shipped) over the listed and inferred stock-out cells, divided by the total unconstrained demand of the row in the month.", source: "stockouts.json (cells), history.json, dims.json (events)" }}
    >
      <div ref={ref}>{model.data.length ? <EChart option={option} height={model.present.length * 26 + (marks.length ? 26 : 8) + 76} ariaLabel={`${title}. Shortfall heat map by ${dim} and month.`} /> : <Empty title="No shortfall to map">No stock-out cell in this selection.</Empty>}</div>
    </Module>
  );
}

// ---- how a stock-out plays out -----------------------------------------------------------------------------------------
function MechanicsModule({ so, keepListed }: { so: StockoutFile; keepListed: number[] }) {
  const L = so.listed;
  const { rows, byClass } = useMemo(() => {
    type Acc = { label: string; cls: string; n: number; short: number; back: number; fill: number; nf: number; days: number };
    const acc = new Map<string, Acc>();
    const cls = new Map<string, Acc>();
    const bump = (map: Map<string, Acc>, key: string, label: string, c: string, i: number) => {
      const cur = map.get(key) ?? { label, cls: c, n: 0, short: 0, back: 0, fill: 0, nf: 0, days: 0 };
      const sh = L.requested[i] + L.carried_in[i] - L.shipped[i];
      if (L.fill_pct[i] !== null) {
        cur.fill += L.fill_pct[i] as number;
        cur.nf++;
      }
      cur.days += L.days[i];
      if (sh > 0) {
        cur.n++;
        cur.short += sh;
        cur.back += L.backordered[i];
      }
      map.set(key, cur);
    };
    for (const i of keepListed) {
      bump(acc, L.reason[i], L.reason[i], L.reason_class[i], i);
      bump(cls, L.reason_class[i], L.reason_class[i], L.reason_class[i], i);
    }
    const fin = (r: Acc) => ({ ...r, share: r.short ? r.back / r.short : NaN, avgFill: r.nf ? r.fill / r.nf / 100 : NaN, avgDays: r.nf ? r.days / r.nf : NaN });
    return { rows: [...acc.values()].map(fin).sort((a, b) => b.n - a.n), byClass: new Map([...cls.entries()].map(([k, v]) => [k, fin(v)])) };
  }, [keepListed, L]);
  type R = (typeof rows)[number];
  const op = byClass.get("operational");
  const se = byClass.get("semiconductor");
  const shares = rows.map((r) => r.share).filter(Number.isFinite);
  const top = rows.filter((r) => Number.isFinite(r.share)).sort((a, b) => b.share - a.share)[0];
  // the one ink bar goes to a reason that leads at the printed precision; a tie at the top marks none
  const pct0 = (v: number) => Math.round(v * 100);
  const soleTop = top && rows.filter((r) => Number.isFinite(r.share) && pct0(r.share) === pct0(top.share)).length === 1 ? top : null;
  const title =
    op && se && Number.isFinite(op.share) && Number.isFinite(se.share)
      ? `Operational stock-outs back-order ${fmtPct(op.share, 0)} of the shortfall; semiconductor allocation ${fmtPct(se.share, 0)}`
      : shares.length > 1 && Math.max(...shares) - Math.min(...shares) < 0.05
        ? `Every listed reason back-orders ${fmtPct(Math.min(...shares), 0)}–${fmtPct(Math.max(...shares), 0)} of the shortfall; the rest is lost`
        : top
          ? `${top.label} back-orders ${fmtPct(top.share, 0)} of its shortfall, the most of any reason`
          : "How a stock-out plays out, by reason";
  return (
    <Module
      title={title}
      dek="Measured on the stock-out file's listed rows in the selection, by the reason it gives: how much of each shortfall was back-ordered rather than lost, the average fill rate and the days out of stock."
      info={{ what: "The rules recovered from inventory_stockouts.csv: shipped = fill × (requested + carried in); part of the shortfall is back-ordered and ships the next month on top of that month's own demand; the rest is lost.", how: "Shortfall = Requested + Carried_In − Shipped on rows where it is positive; back-ordered share = Σ Backordered / Σ shortfall; fill = mean Fill_Rate_Pct; days = mean Stockout_Days.", source: "stockouts.json (listed)" }}
    >
      {rows.length ? (
        <BarTable<R>
          ariaLabel="Back-order mechanics by reason"
          rows={rows}
          rowKey={(r) => r.label}
          bar={{ value: (r) => (Number.isFinite(r.share) ? r.share : 0), tone: "history", leader: (r) => r === soleTop, max: 1 }}
          cols={[
            { key: "l", label: "Reason", kind: "label", value: (r) => r.label, width: "36%" },
            { key: "n", label: "Rows short", kind: "num", value: (r) => fmtInt(r.n), width: "13%", hideNarrow: true },
            { key: "b", label: "Back-ordered", kind: "bar" },
            { key: "s", label: "", kind: "num", value: (r) => fmtPct(r.share, 0), width: "12%" },
            { key: "f", label: "Avg fill", kind: "num", value: (r) => fmtPct(r.avgFill, 0), width: "13%" },
            { key: "d", label: "Days out", kind: "num", value: (r) => (Number.isFinite(r.avgDays) ? r.avgDays.toFixed(1) : "–"), width: "11%", hideNarrow: true },
          ]}
        />
      ) : (
        <p className="state">No row of the stock-out file falls in this selection; its stock-outs were all inferred.</p>
      )}
      <p className="bt-note">The month after a back-ordered month ships its own demand plus the back-order, so shipments overstate demand there; the pipeline removes that carry before estimating demand.</p>
    </Module>
  );
}

// ---- the top series by lost sales ----------------------------------------------------------------------------------------
function TopSeriesModule({ m, so, keep, f, usd, onOpen }: { m: Model; so: StockoutFile; keep: number[]; f: StockoutFacts; usd: boolean; onOpen: (s: number) => void }) {
  const c = so.cells;
  const all = useMemo(() => {
    const acc = new Map<number, { s: number; u: number; usd: number; months: number }>();
    for (const i of keep) {
      const cur = acc.get(c.series[i]) ?? { s: c.series[i], u: 0, usd: 0, months: 0 };
      cur.u += c.lost[i];
      cur.usd += c.lost_usd[i];
      if (c.listed[i] || c.inferred[i]) cur.months++;
      acc.set(c.series[i], cur);
    }
    return [...acc.values()].filter((r) => r.u > 0).sort((a, b) => (usd ? b.usd - a.usd : b.u - a.u));
  }, [keep, c, usd]);
  type T = (typeof all)[number];
  const N = Math.min(10, all.length);
  const topSum = all.slice(0, N).reduce((a, r) => a + (usd ? r.usd : r.u), 0);
  const max = all.length ? (usd ? all[0].usd : all[0].u) : 1;
  const cols: Column<T>[] = [
    { key: "s", label: "Series", value: (r) => `${m.dims.skus.id[m.sSku[r.s]]} ${m.dims.regions[m.sRegion[r.s]]}`, render: (r) => (<><span className="g1-code">{m.dims.skus.id[m.sSku[r.s]]}</span> · {m.dims.regions[m.sRegion[r.s]]}</>), width: 210 },
    { key: "f", label: "Family", value: (r) => m.dims.families.name[m.sFamily[r.s]] },
    { key: "m", label: "Stock-out months", value: (r) => r.months, num: true, width: 120 },
    { key: "u", label: "Lost units", value: (r) => Math.round(r.u), render: (r) => (usd ? fmtInt(r.u) : <IBar v={r.u} max={max} text={fmtInt(r.u)} />), num: true, width: 150 },
    { key: "usd", label: "Lost USD", value: (r) => Math.round(r.usd), render: (r) => (usd ? <IBar v={r.usd} max={max} text={fmtMoney(r.usd, 1)} /> : fmtMoney(r.usd, 1)), num: true, width: 130 },
  ];
  return (
    <Module
      title={all.length > N ? `The top ${N} series hold ${fmtPct(f.lost > 0 ? topSum / f.lost : 0, 0)} of lost sales` : all.length ? `${cap(String(all.length))} ${all.length === 1 ? "series" : "series"} lost sales` : "No series lost sales"}
      dek={`Series of the selection ranked by lost ${usd ? "revenue" : "units"}, ${fmtInt(all.length)} with a loss. A row opens the series in the Demand explorer.`}
      info={{ what: "Per series: months constrained by supply, lost units and lost revenue.", how: "Sums over the series' stock-out cells; a series opens with its filters in the Demand explorer.", source: "stockouts.json (cells)" }}
    >
      <DataTable rows={all} cols={cols} pageSize={10} csvName="lost_sales_by_series.csv" initialSort={{ key: usd ? "usd" : "u", desc: true }} onRow={(r) => onOpen(r.s)} ariaLabel="Series by lost sales" empty="No series of this selection lost a sale." />
    </Module>
  );
}

// value, then a fixed 56px track whose bar grows from the track's left edge, so every row's bar starts at
// the same baseline (a bar flush against a right-aligned number grew leftwards from a ragged start)
function IBar({ v, max, text }: { v: number; max: number; text: string }) {
  return (
    <span className="ibar loss">
      <span>{text}</span>
      <span style={{ display: "inline-flex", width: "calc(56 * var(--u, 1px))", flex: "none" }} aria-hidden="true">
        <i style={{ width: `${Math.max(2, (v / (max || 1)) * 100)}%` }} />
      </span>
    </span>
  );
}

