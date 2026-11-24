// The one timeline used wherever history and forecast appear: Jan 2019 .. May 2028 on one axis.
// Layers, bottom to top (docs/design_system.md, "The shared timeline"):
//   1 forecast-window wash  2 lost-sales gap (shipped vs demand)  3 P10-P90 band, fanning out of the last
//   actual  4 P10 / P90 edge hairlines  5 shipped hairline (only where lower)  6 unconstrained demand (ink)
//   7 rebuilt-row rings  8 forecast (orange), whose first point IS the last actual  9 last-actual rule
//   10 HTML annotation overlay (charts/Annotations.tsx)  11 end label (last forecast value and its range).
// Range presets replace the zoom slider; one selected series switches to columns with P10-P90 whiskers.
import type { EChartsCoreOption } from "echarts/core";
import type { Filters, Lens, Measure, Model } from "../data/model";
import { fmtInt, fmtMoney, fmtNum, monthLong, monthName, monthSpan, yearSpan } from "../data/format";
import type { ExceptionFile } from "../data/types";
import type { Annotation, AnnotationFrame } from "./Annotations";
import { FONT, fz, fpx, axisTick, baseOption, esc, niceMax, tooltipStyle, ttHead, ttNote, ttRow, ttEnd, type Theme } from "./theme";

export interface TimelineAnomaly {
  month: number;
  value: number;
  cls: "data_error" | "real_event";
  text: string;
}

export interface TimelineLine {
  name: string;
  data: (number | null)[]; // length nMonths
  color: string;
  dashed?: boolean; // dashed 4/3 = "another forecast" (benchmark, backtest baseline)
  width?: number;
}

export type RangePreset = "all" | "recent" | "window";

export interface TimelineSpec {
  m: Model;
  theme: Theme;
  measure: Measure;
  lens: Lens;
  filters: Filters;
  /** History sums by month (length >= asOf + 1).  In the latent lens pass latent demand as both arrays.
   *  imputed = rebuilt cells (missing rows + unknown units; drives the rings and the rebuilt annotation),
   *  missing = of which rows missing from the extract (tooltip detail), cells = cells in the selection,
   *  unknownDemand = demand on cells whose shipments are unknown (kept out of the lost-sales gap). */
  hist?: { shipped: ArrayLike<number>; demand: ArrayLike<number>; imputed: ArrayLike<number>; cells: ArrayLike<number>; missing?: ArrayLike<number>; unknown?: ArrayLike<number>; unknownDemand?: ArrayLike<number> };
  /** Forecast by window month (length nWin). */
  fc?: { value: ArrayLike<number>; p10?: ArrayLike<number>; p50?: ArrayLike<number>; p90?: ArrayLike<number> };
  anomalies?: TimelineAnomaly[];
  lines?: TimelineLine[];
  /** Range preset or an explicit [first, last] month index.  Default "all". */
  range?: RangePreset | [number, number];
  /** Legacy alias of an explicit range. */
  zoom?: [number, number];
  /** Event rug under the x axis (every event, ticks by type, tooltip per event).  Default off. */
  showEvents?: boolean;
  /** Legacy, ignored: there is no zoom slider any more. */
  slider?: boolean;
  /** Columns instead of lines (one selected series): history as ink columns, forecast as orange columns. */
  columns?: boolean;
  /** Narrow layout (< 640px): tighter grid. */
  narrow?: boolean;
  /** Chart height in px (used to decide whether the P50 departs visibly from the forecast). */
  height?: number;
}

export interface TimelineModel {
  option: EChartsCoreOption;
  /** First visible month index (absolute). */
  start: number;
  labels: string[];
  yMax: number;
  frame: AnnotationFrame;
  /** Full-length series (absolute month index). */
  demand: (number | null)[];
  shipped: (number | null)[];
  fc: (number | null)[];
  p10: (number | null)[];
  p50: (number | null)[];
  p90: (number | null)[];
  /** True when the dotted P50 line is drawn (it departs from the submitted forecast by > 1px). */
  p50Drawn: boolean;
  /** Largest relative gap between P50 and the submitted forecast over the window (for the footnote). */
  p50MaxRel: number;
  hasBand: boolean;
  latent: boolean;
}

/** First month index of a range preset. */
export function rangeStart(m: Model, preset: RangePreset): number {
  if (preset === "recent") {
    const y = Number(m.months[m.asOf].slice(0, 4)) - 2;
    return Math.max(0, m.months.indexOf(`${y}-01`));
  }
  if (preset === "window") return Math.max(0, m.asOf - 11);
  return 0;
}

/** Which history marks the timeline draws in its visible range, with the same rules as buildTimeline, so a
 *  key lists only the marks a reader can find on the chart (pass it to timelineKey as `present`). */
export function markPresence(spec: Pick<TimelineSpec, "m" | "hist" | "range" | "zoom" | "lens" | "columns">): { shipped: boolean; lost: boolean; rebuilt: boolean } {
  const { m, hist: h } = spec;
  const out = { shipped: false, lost: false, rebuilt: false };
  if (!h) return out;
  const range = spec.zoom ?? spec.range ?? "all";
  const start = Array.isArray(range) ? Math.max(0, range[0]) : rangeStart(m, range);
  const end = Math.min(m.asOf, Array.isArray(range) ? range[1] : m.asOf);
  const latent = spec.lens === "latent";
  // a gap counts as drawn when a reader can see it: at least 1 % of the largest month in range (about 3px of plot)
  let top = 0;
  for (let i = start; i <= end; i++) top = Math.max(top, h.demand[i]);
  const seen = Math.max(0.5, 0.01 * top);
  for (let i = start; i <= end; i++) {
    const d = h.demand[i];
    const u = latent ? d : h.shipped[i] + (h.unknownDemand?.[i] ?? 0);
    if (!latent && d > 0 && (d - u) / d > 0.004 && d - u >= seen) out.shipped = true;
    if (!latent && d - u >= seen) out.lost = true;
    if (h.imputed && h.imputed[i] > (spec.columns ? 0 : Math.max(5, 0.015 * h.cells[i]))) out.rebuilt = true;
  }
  return out;
}

/** Labels of the three presets, computed from the calendar ("2019–2028", "Since 2024", "Forecast window"). */
export function rangePresets(m: Model): { value: RangePreset; label: string; title: string }[] {
  const y0 = m.months[0].slice(0, 4);
  const y1 = m.months[m.nMonths - 1].slice(0, 4);
  const recent = m.months[rangeStart(m, "recent")].slice(0, 4);
  return [
    { value: "all", label: `${y0}–${y1}`, title: `${monthName(m.months[0])} – ${monthName(m.months[m.nMonths - 1])}` },
    { value: "recent", label: `Since ${recent}`, title: `${monthName(m.months[rangeStart(m, "recent")])} onward` },
    { value: "window", label: "Forecast window", title: `${monthName(m.months[rangeStart(m, "window")])} onward: the last 12 actuals and the 19 forecast months` },
  ];
}

const EVENT_RUG_TYPES = ["Disruption", "Supply Constraint", "System", "Customer Event", "Logistics", "Price Change", "Holiday", "Corporate", "Marketing", "Announcement", "Market Entry"];

/** Events relevant to the filter; holidays only when a region is chosen. */
export function laneEvents(m: Model, f: Filters): { i: number; start: number; end: number }[] {
  const e = m.dims.events;
  const reg = f.region === null ? null : m.dims.regions[f.region];
  const fam = f.family === null ? null : m.dims.families.name[f.family];
  const ch = f.channel === null ? null : m.dims.channels[f.channel];
  const cust = f.customer === null ? null : m.dims.customers[f.customer];
  const out: { i: number; start: number; end: number }[] = [];
  for (let i = 0; i < e.id.length; i++) {
    if (e.start[i] > m.nMonths - 1) continue;
    if (e.type[i] === "Holiday" && reg === null) continue;
    if (e.region[i] && reg !== null && e.region[i] !== reg) continue;
    if (e.family[i] && fam !== null && e.family[i] !== fam) continue;
    if (e.channel[i] && ch !== null && e.channel[i] !== ch) continue;
    if (e.customer[i] && cust !== null && e.customer[i] !== cust) continue;
    out.push({ i, start: e.start[i], end: Math.min(e.end[i], m.nMonths - 1) });
  }
  return out.sort((a, b) => a.start - b.start || a.end - b.end);
}

const nulls = (n: number): (number | null)[] => new Array(n).fill(null);

/** Build the timeline: option + the frame the annotation overlay needs. */
export function buildTimeline(s: TimelineSpec): TimelineModel {
  const { m, theme: t, measure } = s;
  const N = m.nMonths;
  const asOf = m.asOf;
  const months = m.months;
  const latent = s.lens === "latent";
  const usd = measure === "usd";
  const columns = !!s.columns;

  const demand = nulls(N);
  const shipped = nulls(N);
  const gapBase = nulls(N);
  const gap = nulls(N);
  const shippedLine = nulls(N);
  const rebuilt = nulls(N);
  const imputed = s.hist?.imputed;
  const missing = s.hist?.missing;
  if (s.hist) {
    for (let i = 0; i <= asOf; i++) {
      const d = s.hist.demand[i];
      // shipments unknown (ERP blanks) are not lost sales: count their demand as shipped for the gap
      const u = latent ? d : s.hist.shipped[i] + (s.hist.unknownDemand?.[i] ?? 0);
      demand[i] = d;
      shipped[i] = u;
      gapBase[i] = u;
      gap[i] = Math.max(0, d - u);
    }
    if (!latent) {
      const lower = (k: number) => k >= 0 && k <= asOf && (demand[k] as number) > 0 && ((demand[k] as number) - (shipped[k] as number)) / (demand[k] as number) > 0.004;
      for (let i = 0; i <= asOf; i++) if (lower(i) || lower(i - 1) || lower(i + 1)) shippedLine[i] = shipped[i];
    }
    if (imputed) {
      // rings where rebuilt cells cluster: every one for a single series, >1.5 % of cells at aggregate
      for (let i = 0; i <= asOf; i++) {
        const thr = columns ? 0 : Math.max(5, 0.015 * s.hist.cells[i]);
        if (imputed[i] > thr) rebuilt[i] = demand[i];
      }
    }
  }

  const fc = nulls(N);
  const p10 = nulls(N);
  const p50 = nulls(N);
  const p90 = nulls(N);
  const bandBase = nulls(N);
  const bandWidth = nulls(N);
  const hasBand = !!(s.fc?.p10 && s.fc?.p90) && !latent;
  if (s.fc) {
    if (s.hist && !columns) {
      const anchor = demand[asOf] as number;
      fc[asOf] = anchor;
      if (hasBand) {
        bandBase[asOf] = anchor;
        bandWidth[asOf] = 0;
        p10[asOf] = anchor;
        p90[asOf] = anchor;
      }
    }
    for (let k = 0; k < m.nWin; k++) {
      const i = m.w0 + k;
      fc[i] = s.fc.value[k];
      if (hasBand && s.fc.p10 && s.fc.p90) {
        p10[i] = s.fc.p10[k];
        p90[i] = s.fc.p90[k];
        bandBase[i] = s.fc.p10[k];
        bandWidth[i] = s.fc.p90[k] - s.fc.p10[k];
      }
      if (s.fc.p50 && !latent) p50[i] = s.fc.p50[k];
    }
  }

  // visible range
  const range = s.zoom ?? s.range ?? "all";
  let start = Array.isArray(range) ? Math.max(0, Math.min(range[0], N - 2)) : rangeStart(m, range);
  let end = Array.isArray(range) ? Math.max(start + 1, Math.min(range[1], N - 1)) : N - 1;
  if (!s.fc && !s.lines?.length && !Array.isArray(range)) end = Math.min(end, asOf + 1);
  if (start >= end) start = Math.max(0, end - 1);
  const cut = <T,>(a: T[]) => a.slice(start, end + 1);
  const labels = months.slice(start, end + 1);
  const n = labels.length;
  const rel = (i: number) => i - start;

  // y scale: honest zero baseline, 4 intervals, headroom for annotations
  let vmax = 0;
  for (let i = start; i <= end; i++) {
    for (const a of [demand, fc, p90]) {
      const v = a[i];
      if (v !== null && v > vmax) vmax = v;
    }
    for (const l of s.lines ?? []) {
      const v = l.data[i];
      if (v !== null && v !== undefined && v > vmax) vmax = v;
    }
  }
  const yMax = niceMax(vmax * (columns ? 1.1 : 1.16));
  const plotH = (s.height ?? 360) - 60;
  let p50MaxRel = 0;
  let p50MaxPx = 0;
  for (let i = m.w0; i < N; i++) {
    const a = p50[i];
    const b = fc[i];
    if (a === null || b === null) continue;
    p50MaxPx = Math.max(p50MaxPx, (Math.abs(a - b) / yMax) * plotH);
    if (b > 0) p50MaxRel = Math.max(p50MaxRel, Math.abs(a - b) / b);
  }
  const p50Drawn = p50MaxPx > 1 && !columns;
  // a history-only chart (no forecast, no extra line) ends at the last actual: no divider, no wash
  const future = !!s.fc || !!s.lines?.length;
  const divider = future && asOf >= start && asOf <= end ? rel(asOf) : -1;

  const series: Record<string, unknown>[] = [];
  const wash = {
    silent: true,
    itemStyle: { color: t.accentWash },
    // columns: category bands, so the wash starts at the first forecast month's band edge
    data: future ? [[{ xAxis: labels[Math.max(0, rel(columns ? m.w0 : asOf))] }, { xAxis: labels[n - 1] }]] : [],
  };
  const rule = {
    silent: true,
    symbol: ["none", "none"],
    label: { show: false },
    lineStyle: { color: t.ink, width: 1, type: "solid" },
    data: divider >= 0 && !columns ? [{ xAxis: divider }] : [],
  };

  if (!columns) {
    if (!latent && s.hist) {
      series.push(
        { name: "gap-base", type: "line", data: cut(gapBase), stack: "gap", symbol: "none", lineStyle: { width: 0 }, silent: true, z: 1 },
        { name: "Lost to stock-outs", type: "line", data: cut(gap), stack: "gap", symbol: "none", lineStyle: { width: 0 }, areaStyle: { color: t.lossFill, opacity: 1 }, silent: true, z: 1 },
      );
    }
    if (hasBand) {
      series.push(
        { name: "band-base", type: "line", data: cut(bandBase), stack: "band", symbol: "none", lineStyle: { width: 0 }, silent: true, z: 1 },
        { name: "P10–P90 range", type: "line", data: cut(bandWidth), stack: "band", symbol: "none", lineStyle: { width: 0 }, areaStyle: { color: t.accentBand, opacity: 1 }, silent: true, z: 1 },
        { name: "P90", type: "line", data: cut(p90), symbol: "none", lineStyle: { width: 1, color: t.accentEdge }, silent: true, z: 2 },
        { name: "P10", type: "line", data: cut(p10), symbol: "none", lineStyle: { width: 1, color: t.accentEdge }, silent: true, z: 2 },
      );
    }
    if (!latent && s.hist) series.push({ name: "Shipped", type: "line", data: cut(shippedLine), symbol: "none", connectNulls: false, lineStyle: { width: 1, color: t.ink4 }, silent: true, z: 3 });
    if (s.hist) {
      series.push({
        name: latent ? "Latent demand" : "Unconstrained demand",
        type: "line",
        data: cut(demand),
        symbol: "none",
        lineStyle: { width: 2, color: t.ink, cap: "round", join: "round" },
        z: 5,
        markArea: s.fc ? undefined : wash,
        markLine: s.fc ? undefined : rule,
      });
      if (rebuilt.some((v) => v !== null)) {
        series.push({
          name: "Rebuilt rows",
          type: "line",
          data: cut(rebuilt),
          symbol: "circle",
          symbolSize: 8,
          showSymbol: true,
          connectNulls: false,
          lineStyle: { width: 0, opacity: 0 },
          itemStyle: { color: t.paper, borderColor: t.ink, borderWidth: 1.5 },
          silent: true,
          z: 6,
        });
      }
    }
    if (s.fc) {
      if (p50Drawn) series.push({ name: "P50", type: "line", data: cut(p50), symbol: "none", lineStyle: { width: 1, color: t.accentEdge, type: [1.5, 2.5] }, silent: true, z: 4 });
      series.push({
        name: latent ? "Latent demand (forecast)" : "Forecast",
        type: "line",
        data: cut(fc),
        symbol: "none",
        lineStyle: { width: 2, color: t.accent, cap: "round", join: "round" },
        z: 5,
        markArea: wash,
        markLine: rule,
      });
    }
  } else {
    // one series: orders read as events -> columns; forecast columns in orange with P10-P90 whiskers
    const histBar = nulls(N);
    const lostBar = nulls(N);
    for (let i = 0; i <= asOf; i++) {
      if (demand[i] === null) continue;
      histBar[i] = latent ? demand[i] : shipped[i];
      lostBar[i] = latent ? null : (gap[i] as number) > 0.5 ? gap[i] : null;
    }
    const fcBar = nulls(N);
    for (let i = m.w0; i < N; i++) fcBar[i] = fc[i];
    series.push(
      { name: latent ? "Latent demand" : "Shipped", type: "bar", stack: "c", data: cut(histBar), barMaxWidth: 24, barCategoryGap: "28%", itemStyle: { color: t.ink, borderRadius: [2, 2, 0, 0] }, z: 3 },
      { name: "Lost to stock-outs", type: "bar", stack: "c", data: cut(lostBar), barMaxWidth: 24, itemStyle: { color: t.lossFill, borderRadius: [2, 2, 0, 0] }, z: 3 },
      { name: "Forecast", type: "bar", stack: "c", data: cut(fcBar), barMaxWidth: 24, itemStyle: { color: t.accent, borderRadius: [2, 2, 0, 0] }, z: 3 },
    );
    if (divider >= 0 && divider < n - 1) {
      // the forecast-window wash and the last-actual rule sit on the band edge between the last actual
      // and the first forecast month (markArea / markLine would snap to band centres)
      series.push({
        name: "Forecast window",
        type: "custom",
        data: [[divider]],
        silent: true,
        z: 0,
        renderItem: (params: { coordSys: { x: number; y: number; width: number; height: number } }, api: { value: (d: number) => number; coord: (v: number[]) => number[] }) => {
          const x = Math.round((api.coord([api.value(0), 0])[0] + api.coord([api.value(0) + 1, 0])[0]) / 2);
          const c = params.coordSys;
          return { type: "rect", shape: { x, y: c.y, width: c.x + c.width - x, height: c.height }, style: { fill: t.accentWash } };
        },
      });
      series.push({
        name: "Last actual",
        type: "custom",
        data: [[divider]],
        silent: true,
        z: 7,
        renderItem: (params: { coordSys: { y: number; height: number } }, api: { value: (d: number) => number; coord: (v: number[]) => number[]; size: (v: number[]) => number[] }) => {
          const x = Math.round((api.coord([api.value(0), 0])[0] + api.coord([api.value(0) + 1, 0])[0]) / 2) + 0.5;
          return { type: "line", shape: { x1: x, y1: params.coordSys.y, x2: x, y2: params.coordSys.y + params.coordSys.height }, style: { stroke: t.ink, lineWidth: 1 } };
        },
      });
    }
    if (hasBand) {
      const wh = [] as (number | null)[][];
      for (let i = Math.max(m.w0, start); i <= end; i++) if (p10[i] !== null && p90[i] !== null && (p90[i] as number) > 0) wh.push([rel(i), p10[i] as number, p90[i] as number]);
      series.push({
        name: "P10–P90 range",
        type: "custom",
        data: wh,
        silent: true,
        z: 4,
        renderItem: (_p: unknown, api: { value: (d: number) => number; coord: (v: number[]) => number[] }) => {
          const x = api.coord([api.value(0), api.value(1)])[0];
          const lo = api.coord([api.value(0), api.value(1)])[1];
          const hi = api.coord([api.value(0), api.value(2)])[1];
          const style = { stroke: t.accentStrong, lineWidth: 1 };
          return {
            type: "group",
            children: [
              { type: "line", shape: { x1: x, y1: lo, x2: x, y2: hi }, style },
              { type: "line", shape: { x1: x - 3, y1: hi, x2: x + 3, y2: hi }, style },
              { type: "line", shape: { x1: x - 3, y1: lo, x2: x + 3, y2: lo }, style },
            ],
          };
        },
      });
    }
  }

  for (const line of s.lines ?? []) {
    series.push({
      name: line.name,
      type: "line",
      data: cut(line.data),
      symbol: "none",
      connectNulls: false,
      lineStyle: { width: line.width ?? (line.dashed ? 1.5 : 2), color: line.color, type: line.dashed ? [4, 3] : "solid" },
      itemStyle: { color: line.color },
      z: 6,
    });
  }

  if (s.anomalies?.length) {
    // Marks sit ON their value (no vertical offset: on a y-axis an offset reads as another value).  Each mark
    // gets a 2px paper ring (a halo drawn under it) so it stays legible where it overlaps the line; when a data
    // error and a real event share a month they step 5px apart horizontally instead of stacking.
    const inRange = s.anomalies.filter((a) => a.month >= start && a.month <= end);
    const both = new Set<number>();
    const seen = new Map<number, Set<string>>();
    for (const a of inRange) {
      const k = seen.get(a.month) ?? new Set<string>();
      k.add(a.cls);
      seen.set(a.month, k);
      if (k.size > 1) both.add(a.month);
    }
    for (const cls of ["data_error", "real_event"] as const) {
      const pts = inRange.filter((a) => a.cls === cls);
      if (!pts.length) continue;
      const dx = (month: number) => (both.has(month) ? (cls === "data_error" ? -5 : 5) : 0);
      series.push({
        name: `${cls}-halo`,
        type: "scatter",
        silent: true,
        data: pts.map((a) => ({ value: [rel(a.month), a.value], symbolOffset: [dx(a.month), 0] })),
        symbol: cls === "data_error" ? "diamond" : "triangle",
        symbolSize: 13,
        itemStyle: { color: t.paper },
        tooltip: { show: false },
        z: 7,
      });
      series.push({
        name: cls === "data_error" ? "Data error" : "Real event, kept",
        type: "scatter",
        data: pts.map((a) => ({ value: [rel(a.month), a.value], text: a.text, symbolOffset: [dx(a.month), 0] })),
        symbol: cls === "data_error" ? "diamond" : "triangle",
        symbolSize: 9,
        // design system 2.4: data error = hollow violet diamond (cat-2); real event kept = filled ink triangle (real
        // events are history: ink is the past).  No red / green pair, so neither class reads as a status.
        itemStyle: cls === "data_error" ? { color: t.paper, borderColor: t.cat[1], borderWidth: 1.75 } : { color: t.ink, borderColor: t.paper, borderWidth: 1.5 },
        z: cls === "data_error" ? 9 : 8,
        tooltip: { trigger: "item", formatter: (p: { data: { text: string } }) => `<div class="tt" style="max-width:300px">${esc(p.data.text)}</div>` },
      });
    }
  }

  const ev = s.showEvents ? laneEvents(m, s.filters).filter((e) => e.end >= start && e.start <= end) : [];
  const rugH = ev.length ? 16 : 0;
  // the right margin holds the end label; columns (one series) and history-only charts carry none, so they get the width back
  const right = columns || !future ? (s.narrow ? 12 : fpx(24)) : s.narrow ? 58 : fpx(92);
  const grid = s.narrow ? { left: 34, right, top: 30, bottom: 30 + rugH } : { left: fpx(46), right, top: fpx(30), bottom: fpx(30) + rugH };
  if (ev.length) {
    series.push({
      name: "Events",
      type: "custom",
      data: ev.map((e) => [rel(Math.max(e.start, start)), rel(Math.min(e.end, end)), e.i]),
      z: 2,
      tooltip: {
        trigger: "item",
        formatter: (p: { data: number[] }) => {
          const i = p.data[2];
          const E = m.dims.events;
          const when = monthSpan(months[E.start[i]], months[Math.min(E.end[i], N - 1)]);
          return `${ttHead(`${E.type[i]} · ${when}`, E.id[i])}<p>${esc(E.description[i])}</p><div class="tt-note">${esc(E.scope_value[i])}</div>${ttEnd()}`;
        },
      },
      renderItem: (params: { coordSys: { y: number; height: number } }, api: { value: (d: number) => number; coord: (v: number[]) => number[]; size: (v: number[]) => number[] }) => {
        const a = api.coord([api.value(0), 0])[0];
        const b = api.coord([api.value(1), 0])[0];
        const type = m.dims.events.type[api.value(2)];
        const row = Math.max(0, EVENT_RUG_TYPES.indexOf(type)) % 2;
        const y = params.coordSys.y + params.coordSys.height + 22 + row * 5;
        return { type: "rect", shape: { x: a - 1, y, width: Math.max(2, b - a + 2), height: 3 }, style: { fill: t.ink3, opacity: 0.8 } };
      },
    });
  }

  const ax = (v: string) => v.endsWith("-01");
  const showYear = n > 30;
  // phones: a label every second or third January (ticks stay yearly), so the years never run together
  const yearStep = s.narrow ? (n > 72 ? 3 : n > 36 ? 2 : 1) : 1;
  const firstJan = labels.find(ax);
  const axLabel = (v: string) => ax(v) && (Number(v.slice(0, 4)) - Number((firstJan ?? v).slice(0, 4))) % yearStep === 0;
  const option: EChartsCoreOption = {
    ...baseOption(t),
    grid,
    xAxis: {
      type: "category",
      data: labels,
      boundaryGap: columns,
      axisLine: { lineStyle: { color: t.ruleStrong } },
      axisTick: showYear ? { interval: (_: number, v: string) => ax(v), length: 5, lineStyle: { color: t.ruleStrong }, alignWithLabel: true } : { show: false },
      axisLabel: showYear
        ? { interval: (_: number, v: string) => axLabel(v), formatter: (v: string) => v.slice(0, 4), color: t.ink3, fontSize: fz(11.5), margin: 9, fontFamily: FONT }
        : { interval: (i: number) => i % 3 === 0, formatter: (v: string) => monthName(v).replace(" 20", " ’"), color: t.ink3, fontSize: fz(11.5), margin: 9, fontFamily: FONT },
      splitLine: { show: false },
      axisPointer: { label: { show: false } },
    },
    yAxis: {
      type: "value",
      min: 0,
      max: yMax,
      interval: yMax / 4,
      axisLabel: { formatter: (v: number) => axisTick(v, usd), color: t.ink3, fontSize: fz(11.5), fontFamily: FONT },
      splitLine: { lineStyle: { color: t.grid, width: 1, type: "solid" } },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: columns ? "shadow" : "line", lineStyle: { color: t.ink3, width: 1, type: "solid" }, shadowStyle: { color: t.hover, opacity: 0.6 } },
      ...tooltipStyle(t),
      formatter: (items: { dataIndex: number; axisValue?: string }[] | { dataIndex: number; axisValue?: string }) => {
        const list = Array.isArray(items) ? items : [items];
        if (!list.length) return "";
        // the category label is robust to overlay series (rug, anomaly marks) whose dataIndex is not a month
        const byLabel = list[0].axisValue !== undefined ? months.indexOf(list[0].axisValue) : -1;
        const i = byLabel >= 0 ? byLabel : start + list[0].dataIndex;
        const fv = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? "–" : usd ? fmtMoney(v, 2) : fmtInt(v));
        let h = ttHead(monthLong(months[i]), i > asOf ? "forecast" : "actual");
        if (i <= asOf && s.hist) {
          h += ttRow(t.ink, latent ? "latent demand" : "unconstrained demand", fv(demand[i]));
          if (!latent) {
            h += ttRow(t.ink4, "shipped", fv(shipped[i]));
            if ((gap[i] as number) > 0.5) h += ttRow(t.lossFill, "lost to stock-outs", fv(gap[i]), "box");
          }
          if (imputed && imputed[i] > 0) {
            // one vocabulary: rows missing from the extract are REBUILT; ERP blanks have units UNKNOWN and are kept out of fitting
            const rows = missing ? missing[i] : imputed[i];
            const unk = Math.max(0, imputed[i] - rows);
            const parts = [rows > 0 ? `${fmtInt(rows)} missing ${rows === 1 ? "row" : "rows"} rebuilt` : "", unk > 0 ? `${fmtInt(unk)} ${unk === 1 ? "cell" : "cells"} with units unknown, kept out of fitting` : ""].filter(Boolean);
            h += ttNote(`${parts.join("; ")}; never zero-filled`);
          }
        }
        if (i > asOf && s.fc) {
          h += ttRow(t.accent, latent ? "latent demand (forecast)" : "forecast (submitted)", fv(fc[i]));
          if (hasBand) {
            h += ttRow(t.accentEdge, "P90", fv(p90[i]));
            if (p50[i] !== null) h += ttRow(t.accentEdge, "P50", fv(p50[i]), "dash");
            h += ttRow(t.accentEdge, "P10", fv(p10[i]));
          }
        }
        for (const line of s.lines ?? []) if (line.data[i] !== null && line.data[i] !== undefined) h += ttRow(line.color, line.name, fv(line.data[i]), !!line.dashed);
        // anomaly marks and (with the rug on) events of this month, as notes: an axis tooltip covers them all
        for (const a of (s.anomalies ?? []).filter((x) => x.month === i).slice(0, 2)) h += ttNote(`${a.cls === "data_error" ? "Data error" : "Real event"}: ${a.text}`);
        const evHere = ev.filter((e) => e.start <= i && e.end >= i);
        for (const e of evHere.slice(0, 3)) h += ttNote(`${m.dims.events.type[e.i]}: ${m.dims.events.description[e.i]}`);
        if (evHere.length > 3) h += ttNote(`and ${evHere.length - 3} more events`);
        return h + ttEnd();
      },
    },
    series,
  } as EChartsCoreOption;

  const avoid: (number | null)[][] = [cut(demand), cut(fc)];
  if (hasBand) avoid.push(cut(p10), cut(p90));
  for (const l of s.lines ?? []) avoid.push(cut(l.data));
  if (columns) avoid.push(cut(demand).map((v) => (v === null ? null : 0)));
  return {
    option,
    start,
    labels,
    yMax,
    frame: { avoid, divider, n, yMin: 0, yMax, dividerBetween: columns },
    demand,
    shipped,
    fc,
    p10,
    p50,
    p90,
    p50Drawn,
    p50MaxRel,
    hasBand,
    latent,
  };
}

// ---------------------------------------------------------------------------------------------------
// Annotation generators: computed from the data, never typed.  Each returns null when its condition fails.
// ---------------------------------------------------------------------------------------------------

/** Short title from an event description: "COVID-19 lockdowns and plant closures" -> "COVID-19 lockdowns". */
export function eventTitle(desc: string): string {
  let s = desc.split(" - ")[0].replace(/^Global\s+/i, "").trim();
  if (s.length > 24) s = s.split(/\s+(?:and|in|at|for)\s+/)[0];
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export interface AnnotationContext {
  spec: TimelineSpec;
  model: TimelineModel;
  /** Exceptions for in-window events (window_event rows, already restricted to the selection). */
  exceptions?: ExceptionFile | null;
  exceptionRows?: number[];
  /** Which story annotations to generate (default all). */
  include?: ("disruption" | "gap" | "rebuilt" | "window" | "divider" | "end")[];
}

const fmtV = (v: number, usd: boolean, mb = 1) => (usd ? fmtMoney(v, mb) : fmtNum(v, mb));

/** The default story layer of the shared timeline (at most five story labels plus divider and end labels). */
export function timelineAnnotations(c: AnnotationContext): Annotation[] {
  const { spec: s, model: tm } = c;
  const m = s.m;
  const usd = s.measure === "usd";
  const months = m.months;
  const asOf = m.asOf;
  const inc = new Set(c.include ?? ["disruption", "gap", "rebuilt", "window", "divider", "end"]);
  const out: Annotation[] = [];
  const vis = (i: number) => i >= tm.start && i < tm.start + tm.labels.length;
  const rel = (i: number) => i - tm.start;
  const D = tm.demand;
  const events = laneEvents(m, s.filters);
  const E = m.dims.events;

  // 1. Disruption trough: the lowest demand inside a Disruption event window, if it is a real dip
  if (inc.has("disruption") && s.hist && !s.columns) {
    const groups = new Map<string, { a: number; b: number }>();
    for (const e of events) {
      if (E.type[e.i] !== "Disruption") continue;
      const key = E.description[e.i];
      const g = groups.get(key);
      groups.set(key, g ? { a: Math.min(g.a, e.start), b: Math.max(g.b, e.end) } : { a: e.start, b: e.end });
    }
    for (const [desc, g] of groups) {
      let lo = -1;
      for (let i = Math.max(0, g.a); i <= Math.min(asOf, g.b + 1); i++) if (D[i] !== null && (lo < 0 || (D[i] as number) < (D[lo] as number))) lo = i;
      if (lo < 0 || !vis(lo)) continue;
      let pre = 0;
      let np = 0;
      for (let i = Math.max(0, g.a - 6); i < g.a; i++) if (D[i] !== null) {
        pre += D[i] as number;
        np++;
      }
      if (!np || (D[lo] as number) > 0.85 * (pre / np)) continue;
      out.push({ id: `dis-${lo}`, at: rel(lo), value: D[lo] as number, title: eventTitle(desc), text: `Demand falls to ${fmtV(D[lo] as number, usd)} in ${monthName(months[lo])}`, anchor: "below", tone: "past", align: "left", priority: 3 });
    }
  }

  // 2. Widest shipped-versus-demand gap (lost sales), named after a supply-constraint event when one covers it
  if (inc.has("gap") && s.hist && !tm.latent && !s.columns) {
    let gi = -1;
    let best = 0;
    for (let i = 0; i <= asOf; i++) {
      const d = D[i];
      const u = tm.shipped[i];
      if (d === null || u === null || d <= 0) continue;
      const share = (d - u) / d;
      if (share > best) {
        best = share;
        gi = i;
      }
    }
    if (gi >= 0 && best > 0.01 && vis(gi)) {
      const ev = events.find((e) => E.type[e.i] === "Supply Constraint" && e.start <= gi && e.end >= gi);
      let a = gi;
      let b = gi;
      const lower = (k: number) => {
        const d = D[k];
        const u = tm.shipped[k];
        return d !== null && u !== null && d > 0 && (d - u) / d > 0.004;
      };
      while (a > 0 && lower(a - 1)) a--;
      while (b < asOf && lower(b + 1)) b++;
      const span = ev ? [ev.start, ev.end] : [a, b];
      out.push({
        id: `gap-${gi}`,
        at: rel(gi),
        value: D[gi] as number,
        title: ev ? eventTitle(E.description[ev.i]) : "Stock-outs",
        text: `Shipments held below demand, ${yearSpan(months[span[0]], months[Math.min(span[1], asOf)])}`,
        anchor: "above",
        tone: "past",
        align: "right",
        priority: 2,
      });
    }
  }

  // 3. Rebuilt-cell cluster (rows missing from the extract or units lost, rebuilt instead of zero-filled)
  const miss = s.hist?.imputed;
  if (inc.has("rebuilt") && miss && s.hist && !s.columns) {
    let bi = -1;
    for (let i = 0; i <= asOf; i++) if (miss[i] > Math.max(5, 0.015 * s.hist.cells[i]) && (bi < 0 || miss[i] > miss[bi])) bi = i;
    if (bi >= 0 && vis(bi)) {
      const thr = Math.max(5, 0.015 * s.hist.cells[bi]) / 2;
      let a = bi;
      let b = bi;
      while (a > 0 && miss[a - 1] > thr) a--;
      while (b < asOf && miss[b + 1] > thr) b++;
      let total = 0;
      let rowsMissing = 0;
      let unknownCells = 0;
      for (let i = a; i <= b; i++) {
        total += miss[i];
        rowsMissing += s.hist.missing ? s.hist.missing[i] : miss[i];
        unknownCells += s.hist.unknown ? s.hist.unknown[i] : 0;
      }
      // one vocabulary with Data health and the anomaly monitor: missing rows are rebuilt from the Record_ID
      // grid; ERP blanks have units unknown and are kept out of fitting (neither is ever zero-filled).  The
      // unknown count is the units_unknown flag outside rebuilt rows (HistoryAgg.unknown), the same variable as
      // the Overview figure and Data health, not "imputed minus missing" (one unknown cell is not imputed).
      const unknown = s.hist.unknown ? unknownCells : Math.max(0, total - rowsMissing);
      const ev = events.find((e) => E.type[e.i] === "System" && e.start <= b && e.end >= a);
      const mid = Math.round((a + b) / 2);
      const what = [rowsMissing > 0 ? `${fmtInt(rowsMissing)} missing rows rebuilt` : "", unknown > 0 ? `${fmtInt(unknown)} cells with units unknown, kept out of fitting` : ""].filter(Boolean).join("; ");
      out.push({
        id: `reb-${bi}`,
        at: rel(mid),
        value: D[mid] as number,
        title: ev ? eventTitle(E.description[ev.i]) : unknown > rowsMissing ? "Units unknown" : "History rebuilt",
        text: `${what}, ${monthSpan(months[a], months[b])}`,
        anchor: "above",
        tone: "past",
        align: "left",
        priority: 4,
        leader: true,
      });
    }
  }

  // 4. In-window event from exceptions.json (window_event rows in the selection), anchored on the forecast
  if (inc.has("window") && c.exceptions && c.exceptionRows && s.fc) {
    const X = c.exceptions;
    const groups = new Map<string, { rows: number[]; start: number; end: number; units: number; usd: number }>();
    for (const r of c.exceptionRows) {
      if (X.rule[r] !== "window_event") continue;
      const g = groups.get(X.group[r]) ?? { rows: [], start: X.start[r], end: X.end[r], units: 0, usd: 0 };
      g.rows.push(r);
      g.units += X.impact_units[r];
      g.usd += X.revenue_at_risk[r];
      g.start = Math.min(g.start, X.start[r]);
      g.end = Math.max(g.end, X.end[r]);
      groups.set(X.group[r], g);
    }
    const top = [...groups.entries()].sort((p, q) => Math.abs(q[1].units) - Math.abs(p[1].units))[0];
    if (top) {
      const [label, g] = top;
      const id = label.match(/^(EV-\d+)/)?.[1];
      const ei = id ? E.id.indexOf(id) : -1;
      const desc = ei >= 0 ? E.description[ei] : "";
      const who = label.replace(/^EV-\d+\s*/, "").split("|")[0].trim();
      const noun = /shutdown/i.test(desc) ? "shutdown" : /strike/i.test(desc) ? "strike" : /capacity|line/i.test(desc) ? "expansion" : "event";
      let at = g.start;
      for (let i = g.start; i <= Math.min(g.end, m.nMonths - 1); i++) if ((tm.fc[i] ?? Infinity) < (tm.fc[at] ?? Infinity)) at = i;
      if (vis(at) && tm.fc[at] !== null) {
        // the impact in the active measure: units removed, or the revenue they carry (removed units x price)
        const removed = s.measure === "usd" ? g.usd : g.units;
        // short enough to sit inside the narrow forecast zone: compact amount, and the first word of a long name
        const amount = s.measure === "usd" ? `${fmtMoney(Math.abs(removed), 1)}` : `${fmtNum(Math.abs(removed))} units`;
        const short = who.length > 14 ? who.split(/\s+/)[0] : who;
        out.push({
          id: `win-${label}`,
          at: rel(at),
          value: tm.fc[at] as number,
          title: `${short} ${noun}`,
          text: `${removed >= 0 ? "−" : "+"}${amount}, ${monthSpan(months[g.start], months[Math.min(g.end, m.nMonths - 1)])}`,
          anchor: "below",
          tone: "future",
          align: "left",
          priority: 1,
        });
      }
    }
  }

  // 5. Last actual and the forecast zone
  if (inc.has("divider") && tm.frame.divider >= 0 && (s.fc || s.lines?.length)) {
    out.push({ id: "last-actual", at: tm.frame.divider, value: 0, title: monthName(months[asOf]), text: "last actual", anchor: "zone", tone: "past", align: "right", priority: 0 });
    out.push({ id: "zone", at: tm.frame.divider, value: 0, title: "Forecast", text: `${m.nWin} months`, anchor: "zone", tone: "future", align: "left", priority: 0 });
  }

  // 6. End label: the last forecast value and its P10-P90
  if (inc.has("end") && s.fc && !s.columns) {
    const k = m.nMonths - 1;
    const v = tm.fc[k];
    if (v !== null && vis(k)) {
      const range = tm.hasBand && tm.p10[k] !== null && tm.p90[k] !== null ? `P10–P90\n${fmtV(tm.p10[k] as number, usd)}–${fmtV(tm.p90[k] as number, usd)}` : monthName(months[k]);
      out.push({ id: "end", at: rel(k), value: v, title: fmtV(v, usd), text: range, anchor: "end", tone: "future", priority: 0 });
    }
  }
  return out;
}

/** Annotations for anomaly marks (marker AND text): the `max` largest by |impact| you pass in, each labelled
 *  with its type and a short reason.  Use with <TimelineChart annotate> on the anomaly monitor. */
/** `heading` (optional) replaces the "<class>: <title>" heading, e.g. "Data errors, May 2023" for a month cluster
 *  whose text then names the leading type with its own count. */
export function anomalyAnnotations(model: TimelineModel, items: { month: number; value: number; cls: "data_error" | "real_event"; title: string; text: string; impact: number; heading?: string }[], max = 3): Annotation[] {
  return [...items]
    .filter((a) => a.month >= model.start && a.month < model.start + model.labels.length)
    .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))
    .slice(0, max)
    .map((a, k) => ({
      id: `anom-${a.month}-${k}`,
      at: a.month - model.start,
      value: a.value,
      title: a.heading ?? `${a.cls === "data_error" ? "Data error" : "Real event"}: ${a.title}`,
      text: a.text,
      anchor: "above" as const,
      tone: "past" as const,
      priority: 5 + k,
    }));
}
