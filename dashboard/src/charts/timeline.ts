// The one timeline used wherever history and forecast appear: 2019-01 .. 2028-05 on one axis.
//  - history (shipped units, cleaned) solid neutral line; unconstrained demand dashed orange where it differs;
//  - a labelled "last actual" rule at 2026-10 and a tinted, hatched forecast zone;
//  - the submitted forecast (blue) starting from the last actual, the P10-P90 band of the aggregate and P50 dotted;
//  - an event lane above the plot, imputed months as hollow markers, optional anomaly marks and extra lines.
import type { EChartsCoreOption } from "echarts/core";
import type { Filters, Lens, Measure, Model } from "../data/model";
import { compact, fmtMeasure, monthName } from "../data/format";
import { FONT, axisStyle, esc, tooltipStyle, ttRow, type Theme } from "./theme";

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
  dashed?: boolean;
  width?: number;
}

export interface TimelineSpec {
  m: Model;
  theme: Theme;
  measure: Measure;
  lens: Lens;
  filters: Filters;
  hist?: { shipped: ArrayLike<number>; demand: ArrayLike<number>; imputed: ArrayLike<number>; cells: ArrayLike<number> };
  fc?: { value: ArrayLike<number>; p10?: ArrayLike<number>; p50?: ArrayLike<number>; p90?: ArrayLike<number> };
  anomalies?: TimelineAnomaly[];
  lines?: TimelineLine[];
  zoom?: [number, number];
  showEvents?: boolean;
  slider?: boolean; // the zoom slider under the plot (default on)
}

const EVENT_COLORS = (t: Theme): Record<string, string> => ({
  Holiday: t.cat[2],
  "Price Change": t.cat[3],
  "Customer Event": t.cat[4],
  Disruption: t.cat[7],
  "Supply Constraint": t.cat[7],
  Logistics: t.cat[1],
  System: t.cat[6],
});

interface LaneEvent {
  i: number;
  start: number;
  end: number;
  row: number;
}

/** Events relevant to the filter; holidays only when a region is chosen (otherwise every region's holidays crowd it). */
export function laneEvents(m: Model, f: Filters): LaneEvent[] {
  const e = m.dims.events;
  const reg = f.region === null ? null : m.dims.regions[f.region];
  const fam = f.family === null ? null : m.dims.families.name[f.family];
  const ch = f.channel === null ? null : m.dims.channels[f.channel];
  const cust = f.customer === null ? null : m.dims.customers[f.customer];
  const picked: LaneEvent[] = [];
  for (let i = 0; i < e.id.length; i++) {
    if (e.start[i] > m.nMonths - 1) continue;
    if (e.type[i] === "Holiday" && reg === null) continue;
    if (e.region[i] && reg !== null && e.region[i] !== reg) continue;
    if (e.family[i] && fam !== null && e.family[i] !== fam) continue;
    if (e.channel[i] && ch !== null && e.channel[i] !== ch) continue;
    if (e.customer[i] && cust !== null && e.customer[i] !== cust) continue;
    picked.push({ i, start: e.start[i], end: Math.min(e.end[i], m.nMonths - 1), row: 0 });
  }
  picked.sort((a, b) => a.start - b.start || a.end - b.end);
  const rowEnd: number[] = [];
  for (const ev of picked) {
    let r = rowEnd.findIndex((end) => end < ev.start);
    if (r < 0) {
      r = rowEnd.length;
      rowEnd.push(-1);
    }
    rowEnd[r] = ev.end;
    ev.row = Math.min(r, 2);
  }
  return picked;
}

function differs(a: number, b: number): boolean {
  return Math.abs(a - b) > Math.max(0.5, 0.01 * Math.max(Math.abs(a), Math.abs(b)));
}

export function timelineOption(s: TimelineSpec): EChartsCoreOption {
  const { m, theme: t, measure } = s;
  const N = m.nMonths;
  const asOf = m.asOf;
  const months = m.months;
  const latent = s.lens === "latent";
  const shipped: (number | null)[] = new Array(N).fill(null);
  const demand: (number | null)[] = new Array(N).fill(null);
  const imputed: (number | null)[][] = [];
  if (s.hist) {
    for (let i = 0; i <= asOf; i++) {
      shipped[i] = s.hist.shipped[i];
      // hollow markers where imputed cells are material: any for a few series, >= 2 % of cells for aggregates
      if (s.hist.imputed[i] > 0 && s.hist.imputed[i] >= 0.02 * s.hist.cells[i]) imputed.push([i, s.hist.demand[i], s.hist.imputed[i]]);
    }
    if (!latent) {
      for (let i = 0; i <= asOf; i++) {
        if (differs(s.hist.demand[i], s.hist.shipped[i])) {
          for (const j of [i - 1, i, i + 1]) if (j >= 0 && j <= asOf) demand[j] = s.hist.demand[j];
        }
      }
    }
  }
  const fcLine: (number | null)[] = new Array(N).fill(null);
  const p50: (number | null)[] = new Array(N).fill(null);
  const bandBase: (number | null)[] = new Array(N).fill(null);
  const bandWidth: (number | null)[] = new Array(N).fill(null);
  const hasBand = !!(s.fc?.p10 && s.fc?.p90) && !latent;
  if (s.fc) {
    if (s.hist) {
      const anchor = latent ? s.hist.shipped[asOf] : s.hist.demand[asOf];
      fcLine[asOf] = anchor;
      if (hasBand) {
        bandBase[asOf] = anchor;
        bandWidth[asOf] = 0;
      }
    }
    for (let k = 0; k < m.nWin; k++) {
      const i = m.w0 + k;
      fcLine[i] = s.fc.value[k];
      if (hasBand && s.fc.p10 && s.fc.p90) {
        bandBase[i] = s.fc.p10[k];
        bandWidth[i] = s.fc.p90[k] - s.fc.p10[k];
      }
      if (s.fc.p50 && !latent) p50[i] = s.fc.p50[k];
    }
  }

  const ev = s.showEvents === false ? [] : laneEvents(m, s.filters);
  const evColors = EVENT_COLORS(t);
  const laneH = ev.length ? 30 : 0;
  const top = ev.length ? 44 : 14;
  const histName = latent ? "Latent monthly demand (history)" : "Shipped (cleaned history)";
  const fcName = latent ? "Latent monthly demand (forecast)" : "Forecast (submitted)";

  const series: Record<string, unknown>[] = [
    {
      name: histName,
      type: "line",
      xAxisIndex: 0,
      yAxisIndex: 0,
      data: shipped,
      showSymbol: false,
      symbol: "circle",
      symbolSize: 6,
      lineStyle: { width: 2, color: t.history, cap: "round", join: "round" },
      itemStyle: { color: t.history },
      z: 3,
      markLine: {
        silent: true,
        symbol: "none",
        lineStyle: { color: t.muted, width: 1, type: "solid" },
        label: { formatter: `Last actual ${monthName(months[asOf])}`, color: t.ink2, fontFamily: FONT, fontSize: 11, position: "insideEndBottom", rotate: 0, align: "right", offset: [-6, 0] },
        data: [{ xAxis: months[asOf] }],
      },
      markArea: {
        silent: true,
        itemStyle: { color: t.zone, decal: { symbol: "rect", dashArrayX: [1, 0], dashArrayY: [1, 7], rotation: -Math.PI / 4, color: t.name === "light" ? "rgba(42,120,214,0.06)" : "rgba(57,135,229,0.09)" } },
        label: { show: !!s.fc || !!s.lines?.length, position: "insideTop", formatter: "Forecast window", color: t.muted, fontFamily: FONT, fontSize: 11 },
        data: [[{ xAxis: months[m.w0] }, { xAxis: months[N - 1] }]],
      },
    },
  ];
  if (!latent && s.hist) {
    series.push({
      name: "Unconstrained demand",
      type: "line",
      data: demand,
      showSymbol: false,
      connectNulls: false,
      lineStyle: { width: 2, color: t.demand, type: [5, 3] },
      itemStyle: { color: t.demand },
      z: 4,
    });
  }
  if (hasBand) {
    series.push(
      { name: "band-base", type: "line", data: bandBase, stack: "band", lineStyle: { opacity: 0 }, showSymbol: false, silent: true, z: 1 },
      { name: "P10–P90", type: "line", data: bandWidth, stack: "band", lineStyle: { opacity: 0 }, showSymbol: false, areaStyle: { color: t.forecastBand }, silent: true, z: 1 },
    );
  }
  if (s.fc) {
    series.push({
      name: fcName,
      type: "line",
      data: fcLine,
      showSymbol: false,
      symbolSize: 6,
      lineStyle: { width: 2, color: t.forecast },
      itemStyle: { color: t.forecast },
      z: 5,
    });
    if (!latent && s.fc.p50) {
      series.push({ name: "P50", type: "line", data: p50, showSymbol: false, lineStyle: { width: 1.25, color: t.forecastP50, type: [2, 3] }, itemStyle: { color: t.forecastP50 }, z: 4 });
    }
  }
  for (const line of s.lines ?? []) {
    series.push({
      name: line.name,
      type: "line",
      data: line.data,
      showSymbol: false,
      lineStyle: { width: line.width ?? 2, color: line.color, type: line.dashed ? [6, 3] : "solid" },
      itemStyle: { color: line.color },
      z: 6,
    });
  }
  if (imputed.length && s.hist) {
    series.push({
      name: "Imputed months",
      type: "scatter",
      data: imputed.map(([i, v, n]) => ({ value: [months[i as number], v], n })),
      symbol: "emptyCircle",
      symbolSize: 7,
      itemStyle: { color: t.ink2, borderWidth: 1.5 },
      z: 7,
      tooltip: { show: false },
    });
  }
  if (s.anomalies?.length) {
    for (const cls of ["data_error", "real_event"] as const) {
      const pts = s.anomalies.filter((a) => a.cls === cls);
      if (!pts.length) continue;
      series.push({
        name: cls === "data_error" ? "Data error (fixed)" : "Real event",
        type: "scatter",
        data: pts.map((a) => ({ value: [months[a.month], a.value], text: a.text })),
        symbol: cls === "data_error" ? "diamond" : "triangle",
        symbolSize: 10,
        itemStyle: { color: cls === "data_error" ? t.error : t.event, borderColor: t.surface, borderWidth: 1.5 },
        symbolOffset: cls === "data_error" ? [0, -9] : [0, 0],
        z: cls === "data_error" ? 9 : 8,
        tooltip: { trigger: "item", formatter: (p: { data: { text: string } }) => p.data.text },
      });
    }
  }
  if (ev.length) {
    series.push({
      name: "events",
      type: "custom",
      xAxisIndex: 1,
      yAxisIndex: 1,
      data: ev.map((e) => [e.start, e.end, e.row, e.i]),
      encode: { x: [0, 1], y: 2 },
      tooltip: {
        trigger: "item",
        formatter: (p: { data: number[] }) => {
          const i = p.data[3];
          const E = m.dims.events;
          const when = E.start[i] === E.end[i] ? monthName(months[E.start[i]]) : `${monthName(months[E.start[i]])} – ${monthName(months[Math.min(E.end[i], N - 1)])}`;
          return `<div style="max-width:280px;white-space:normal"><b>${esc(E.id[i])} · ${esc(E.type[i])}</b><br/><span style="opacity:.75">${esc(when)} · ${esc(E.scope_value[i])}</span><br/>${esc(E.description[i])}</div>`;
        },
      },
      renderItem: (_params: unknown, api: { value: (i: number) => number; coord: (v: unknown[]) => number[]; size: (v: unknown[]) => number[] }) => {
        const i = api.value(3);
        const a = api.coord([months[api.value(0)], 0]);
        const b = api.coord([months[api.value(1)], 0]);
        const w = api.size([1, 0])[0];
        const row = api.value(2);
        return {
          type: "rect",
          shape: { x: a[0] - w * 0.45, y: 8 + row * 10, width: Math.max(b[0] - a[0] + w * 0.9, 4), height: 7, r: 3 },
          style: { fill: evColors[m.dims.events.type[i]] ?? t.muted, opacity: 0.85 },
        };
      },
      z: 2,
    });
  }

  const zoomStart = s.zoom ? (s.zoom[0] / (N - 1)) * 100 : 0;
  const zoomEnd = s.zoom ? (s.zoom[1] / (N - 1)) * 100 : 100;
  const ax = axisStyle(t);
  return {
    animation: false,
    textStyle: { fontFamily: FONT },
    aria: { enabled: true, decal: { show: false } },
    grid: [
      { left: 8, right: 16, top: 6, height: laneH, containLabel: false, show: false },
      { left: 8, right: 16, top, bottom: s.slider === false ? 8 : 56, containLabel: true },
    ],
    xAxis: [
      { type: "category", data: months, gridIndex: 1, boundaryGap: false, ...ax, axisLabel: { ...ax.axisLabel, formatter: (v: string) => (v.endsWith("-01") ? v.slice(0, 4) : "") , interval: 0, hideOverlap: true }, splitLine: { show: false } },
      { type: "category", data: months, gridIndex: 0, boundaryGap: true, show: false },
    ],
    yAxis: [
      { type: "value", gridIndex: 1, ...ax, min: 0, axisLabel: { ...ax.axisLabel, formatter: (v: number) => (measure === "usd" ? `$${compact(v, 0)}` : compact(v, 0)) } },
      { type: "value", gridIndex: 0, min: 0, max: 30, inverse: true, show: false },
    ],
    dataZoom: [
      {
        type: s.slider === false ? "inside" : "slider",
        zoomOnMouseWheel: false,
        moveOnMouseMove: false,
        xAxisIndex: [0, 1],
        start: zoomStart,
        end: zoomEnd,
        height: 18,
        bottom: 10,
        borderColor: t.grid,
        fillerColor: t.name === "light" ? "rgba(42,120,214,0.10)" : "rgba(57,135,229,0.18)",
        handleStyle: { color: t.surface, borderColor: t.axis },
        moveHandleStyle: { color: t.axis },
        textStyle: { color: t.muted, fontSize: 10 },
        dataBackground: { lineStyle: { color: t.axis }, areaStyle: { color: t.grid } },
        labelFormatter: (_: number, v: string) => v,
      },
    ],
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "line", lineStyle: { color: t.axis } },
      ...tooltipStyle(t),
      formatter: (items: { seriesName: string; dataIndex: number; axisValue: string }[]) => {
        if (!items.length) return "";
        const i = items[0].dataIndex;
        const rows: string[] = [`<div style="font-weight:600;margin-bottom:4px">${monthName(months[i])}${i > asOf ? " · forecast" : ""}</div>`];
        const val = (x: number | null | undefined) => (x === null || x === undefined ? "–" : `${fmtMeasure(x, measure, 1)}${measure === "usd" ? "" : " u"}`);
        if (i <= asOf && s.hist) {
          rows.push(ttRow(t.history, histName, val(shipped[i])));
          if (!latent && differs(s.hist.demand[i], s.hist.shipped[i])) rows.push(ttRow(t.demand, "Unconstrained demand", val(s.hist.demand[i]), true));
          if (s.hist.imputed[i] > 0) rows.push(`<div style="opacity:.72;font-size:11px">○ ${s.hist.imputed[i]} imputed cell${s.hist.imputed[i] > 1 ? "s" : ""} (missing row / unknown quantity)</div>`);
        }
        if (i > asOf && s.fc) {
          rows.push(ttRow(t.forecast, fcName, val(fcLine[i])));
          if (hasBand) rows.push(ttRow(t.forecast, "P10 – P90", `${fmtMeasure(bandBase[i] ?? 0, measure)} – ${fmtMeasure((bandBase[i] ?? 0) + (bandWidth[i] ?? 0), measure)}`));
          if (!latent && s.fc.p50) rows.push(ttRow(t.forecastP50, "P50 (median)", val(p50[i]), true));
        }
        for (const line of s.lines ?? []) if (line.data[i] !== null) rows.push(ttRow(line.color, line.name, val(line.data[i]), line.dashed));
        return rows.join("");
      },
    },
    series,
  } as EChartsCoreOption;
}
