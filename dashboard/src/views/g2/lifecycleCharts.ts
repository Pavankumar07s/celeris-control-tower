// Lifecycle charts: the Gantt of SKUs around the window (grouped: handovers, recent launches, discontinued) and
// one handover panel per predecessor -> successor pair.  Grammar: ink is the past, orange is the future; the
// window is washed; ▲ launch, ■ end of life, ○ planned launch; the predecessor link is a hairline.
import type { EChartsCoreOption } from "echarts/core";
import { FONT, fz, MONO, axisTick, baseOption, categoryAxis, esc, niceMax, tooltipStyle, ttEnd, ttHead, ttNote, ttRow, valueAxis, type Theme, type TooltipItem } from "../../charts/theme";
import type { Model } from "../../data/model";
import { fmtInt, monthLong, monthName } from "../../data/format";
import type { Handover, LifeSku } from "../../insights/lifecycle";

export interface GanttRow {
  group?: string; // a group header row
  sku?: LifeSku;
  status?: string;
}

/** Order the Gantt rows: handover pairs (predecessor above its successor), then recent launches, then discontinued. */
export function ganttRows(m: Model, skus: LifeSku[], pairs: Handover[]): GanttRow[] {
  const byK = new Map(skus.map((s) => [s.k, s]));
  const rows: GanttRow[] = [];
  const M = m.months;
  const status = (s: LifeSku) =>
    s.kind === "eol" ? `EOL ${monthName(M[s.eol as number])}` : s.kind === "planned" ? `launch ${monthName(M[s.launch as number])}` : s.kind === "discontinued" ? `ended ${s.eol !== null && s.eol >= 0 ? monthName(M[s.eol]) : "before 2019"}` : `launched ${monthName(M[s.launch as number])}`;
  const used = new Set<number>();
  const pairRows: GanttRow[] = [];
  for (const p of pairs) {
    for (const k of [p.pred, p.succ]) {
      if (k === null || used.has(k)) continue;
      const s = byK.get(k) ?? skuFromModel(m, k);
      used.add(k);
      pairRows.push({ sku: s, status: status(s) });
    }
  }
  if (pairRows.length) rows.push({ group: "End of life and successors" }, ...pairRows);
  const recent = skus.filter((s) => s.kind === "recent" && !used.has(s.k)).sort((a, b) => (a.launch ?? 0) - (b.launch ?? 0));
  if (recent.length) rows.push({ group: "Launched in the last 18 months" }, ...recent.map((s) => ({ sku: s, status: status(s) })));
  const disc = skus.filter((s) => s.kind === "discontinued" && !used.has(s.k)).sort((a, b) => (a.eol ?? 0) - (b.eol ?? 0));
  if (disc.length) rows.push({ group: "Discontinued before the window" }, ...disc.map((s) => ({ sku: s, status: status(s) })));
  return rows;
}

function skuFromModel(m: Model, k: number): LifeSku {
  const S = m.dims.skus;
  const mi = (l: string | null) => (l ? (Number(l.slice(0, 4)) - 2019) * 12 + Number(l.slice(5, 7)) - 1 : null);
  const st = S.status[k];
  return { k, id: S.id[k], kind: st === "EOL Announced" ? "eol" : st === "Planned Launch" ? "planned" : st === "Discontinued" ? "discontinued" : "recent", launch: mi(S.launch[k]), eol: mi(S.eol[k]), powertrain: S.powertrain[k] ?? "Universal", replaces: null, successor: null };
}

export function ganttOption(t: Theme, m: Model, rows: GanttRow[], narrow: boolean): EChartsCoreOption {
  const S = m.dims.skus;
  const N = m.nMonths - 1;
  const cats = rows.map((r, i) => (r.group ? `g${i}` : `s${i}`));
  const label = (i: number) => {
    const r = rows[i];
    if (r.group) return `{g|${r.group}}`;
    return narrow ? `{id|${r.sku?.id}}` : `{st|${r.status}}  {id|${r.sku?.id}}`;
  };
  const bars = rows.map((r, i) => (r.sku ? [i, Math.max(0, r.sku.launch ?? 0), Math.min(N, r.sku.eol ?? N), r.sku.k] : null)).filter((x): x is number[] => x !== null);
  // predecessor links: from the predecessor row to the successor row at the successor's launch
  const rowOf = new Map<number, number>();
  rows.forEach((r, i) => r.sku && rowOf.set(r.sku.k, i));
  const links: number[][] = [];
  rows.forEach((r, i) => {
    const s = r.sku;
    if (!s || s.kind !== "planned" || s.launch === null) return;
    const rep = S.replaces[s.k] ? S.id.indexOf(S.replaces[s.k] as string) : -1;
    if (rep >= 0 && rowOf.has(rep)) links.push([rowOf.get(rep) as number, i, s.launch]);
  });
  return {
    ...baseOption(t),
    grid: { left: narrow ? 74 : 214, right: 18, top: 30, bottom: 28 },
    xAxis: {
      type: "value",
      min: 0,
      max: N,
      interval: 12,
      axisLine: { show: true, lineStyle: { color: t.ruleStrong } },
      axisTick: { show: false },
      splitLine: { show: true, lineStyle: { color: t.grid, width: 1 } },
      axisLabel: { color: t.ink3, fontFamily: FONT, fontSize: fz(11.5), formatter: (v: number) => (v % (narrow ? 36 : 12) === 0 ? (m.months[v]?.slice(0, 4) ?? "") : "") },
    },
    yAxis: {
      ...categoryAxis(t, cats),
      inverse: true,
      axisLine: { show: false },
      axisLabel: {
        formatter: (_: string, i: number) => label(i),
        rich: {
          id: { fontFamily: MONO, fontWeight: 500, fontSize: fz(12), color: t.ink },
          st: { fontFamily: FONT, fontSize: fz(11.5), color: t.ink3 },
          g: { fontFamily: FONT, fontSize: fz(12), fontWeight: 600, color: t.ink2, padding: [8, 0, 0, 0] },
        },
        margin: 10,
      },
    },
    tooltip: {
      ...tooltipStyle(t),
      trigger: "item",
      formatter: (p: { seriesName: string; data: number[] }) => {
        if (p.seriesName !== "Life") return "";
        const k = p.data[3];
        const r = rows[p.data[0]];
        const rep = S.replaces[k];
        const suc = S.id.find((_, j) => S.replaces[j] === S.id[k]);
        return `${ttHead(`${S.id[k]} · ${S.status[k] ?? ""}`, S.powertrain[k] ?? "")}<p>${esc(S.description[k] ?? "")}</p>${ttNote(`${r.status ?? ""}${S.launch[k] ? `; launched ${monthName(S.launch[k] as string)}` : ""}${rep ? `; replaces ${rep}` : ""}${suc ? `; succeeded by ${suc}` : ""}`)}${ttEnd()}`;
      },
    },
    series: [
      {
        name: "Window",
        type: "custom",
        silent: true,
        z: 0,
        data: [[m.asOf + 0.5]],
        renderItem: (params: { coordSys: { x: number; y: number; width: number; height: number } }, api: { value: (d: number) => number; coord: (v: number[]) => number[] }) => {
          const c = params.coordSys;
          const x = Math.round(api.coord([api.value(0), 0])[0]) + 0.5;
          return {
            type: "group",
            children: [
              { type: "rect", shape: { x, y: c.y, width: c.x + c.width - x, height: c.height }, style: { fill: t.accentWash } },
              { type: "line", shape: { x1: x, y1: c.y - 6, x2: x, y2: c.y + c.height }, style: { stroke: t.ink, lineWidth: 1 } },
              { type: "text", style: { x: x - 6, y: c.y - 18, text: narrow ? monthName(m.months[m.asOf]) : `${monthName(m.months[m.asOf])}, last actual`, fill: t.ink2, font: `11.5px ${FONT}`, align: "right" } },
              ...(narrow ? [] : [{ type: "text", style: { x: x + 6, y: c.y - 18, text: "FORECAST", fill: t.accentText, font: `600 11px ${FONT}`, align: "left" } }]),
            ],
          };
        },
      },
      {
        name: "Links",
        type: "custom",
        silent: true,
        z: 2,
        data: links,
        renderItem: (_p: unknown, api: { value: (d: number) => number; coord: (v: number[]) => number[] }) => {
          const a = api.coord([api.value(2), api.value(0)]);
          const b = api.coord([api.value(2), api.value(1)]);
          return { type: "line", shape: { x1: a[0], y1: a[1] + 4, x2: b[0], y2: b[1] - 6 }, style: { stroke: t.ink3, lineWidth: 1, lineDash: [2, 2] } };
        },
      },
      {
        name: "Life",
        type: "custom",
        z: 3,
        data: bars,
        renderItem: (_p: unknown, api: { value: (d: number) => number; coord: (v: number[]) => number[] }) => {
          const i = api.value(0);
          const s = rows[i].sku as LifeSku;
          const a = api.value(1);
          const b = api.value(2);
          const y = api.coord([0, i])[1];
          const x = (v: number) => api.coord([v, i])[0];
          const kids: unknown[] = [];
          const histEnd = Math.min(b, m.asOf + 0.5);
          if (histEnd > a) kids.push({ type: "rect", shape: { x: x(a), y: y - 4, width: Math.max(1, x(histEnd) - x(a)), height: 8, r: [2, 0, 0, 2] }, style: { fill: t.hist[3] } });
          const winA = Math.max(a, m.asOf + 0.5);
          if (b > winA) kids.push({ type: "rect", shape: { x: x(winA), y: y - 4, width: Math.max(1, x(b) - x(winA)), height: 8, r: s.eol !== null ? [0, 2, 2, 0] : 0 }, style: { fill: t.accentTint } });
          // launch: ▲ (ink, already launched) or ○ (orange ring, planned)
          if (s.launch !== null && s.launch >= 0) {
            const lx = x(s.launch);
            if (s.kind === "planned") kids.push({ type: "circle", shape: { cx: lx, cy: y, r: 4.5 }, style: { fill: t.paper, stroke: t.accent, lineWidth: 2 } });
            else kids.push({ type: "polygon", shape: { points: [[lx, y - 6], [lx - 5, y + 4], [lx + 5, y + 4]] }, style: { fill: t.ink, stroke: t.paper, lineWidth: 1 } });
          }
          // end of life: ■ (ink in the past, orange inside the window)
          if (s.eol !== null && s.eol >= 0) {
            const ex = x(s.eol);
            kids.push({ type: "rect", shape: { x: ex - 4.5, y: y - 4.5, width: 9, height: 9 }, style: { fill: s.eol > m.asOf ? t.accent : t.ink, stroke: t.paper, lineWidth: 1.5 } });
          }
          return { type: "group", children: kids };
        },
      },
    ],
  } as EChartsCoreOption;
}

/** One handover: predecessor history (ink), its run-off forecast (orange line to zero, ■ at EOL), the successor's
 *  forecast (orange-tint columns from launch).  Window washed, last-actual rule. */
/** The largest monthly value a handover panel draws (history, run-off or successor): the panels share one
 *  y-scale built from the largest of these, so side-by-side panels compare honestly. */
export function handoverPeak(m: Model, h: Handover): number {
  const start = Math.max(0, m.asOf - 21);
  let v = 1;
  for (let i = start; i < m.nMonths; i++) {
    if (h.predHist && i <= m.asOf) v = Math.max(v, h.predHist[i]);
    if (h.predFc && i > m.asOf && (h.eol === null || i <= h.eol + 1)) v = Math.max(v, h.predFc[i - m.w0]);
    if (h.succFc && i >= m.w0 && (h.launch === null || i >= h.launch)) v = Math.max(v, h.succFc[i - m.w0]);
  }
  return v;
}

export function handoverOption(t: Theme, m: Model, h: Handover, narrow: boolean, sharedPeak?: number): EChartsCoreOption {
  const start = Math.max(0, m.asOf - 21);
  const N = m.nMonths - 1;
  const labels = m.months.slice(start, N + 1);
  const hist: (number | null)[] = [];
  const run: (number | null)[] = [];
  const succ: (number | null)[] = [];
  for (let i = start; i <= N; i++) {
    hist.push(h.predHist && i <= m.asOf ? h.predHist[i] : null);
    let r: number | null = null;
    if (h.predFc && h.predHist) {
      if (i === m.asOf) r = h.predHist[i];
      else if (i > m.asOf && (h.eol === null || i <= h.eol + 1)) r = h.predFc[i - m.w0];
    }
    run.push(r);
    succ.push(h.succFc && i >= m.w0 && (h.launch === null || i >= h.launch) ? h.succFc[i - m.w0] : null);
  }
  const vmax = Math.max(1, sharedPeak ?? 0, ...[...hist, ...run, ...succ].filter((v): v is number => v !== null));
  const yMax = niceMax(vmax * 1.12);
  const div = m.asOf - start;
  const eolAt = h.eol !== null && h.eol >= start ? h.eol - start : -1;
  return {
    ...baseOption(t),
    grid: { left: 40, right: 10, top: 14, bottom: 26 },
    xAxis: categoryAxis(t, labels, {
      boundaryGap: true,
      axisLabel: { color: t.ink3, fontFamily: FONT, fontSize: fz(11), margin: 8, interval: (i: number) => labels[i].endsWith("-01"), formatter: (v: string) => v.slice(0, 4) },
    }),
    yAxis: { ...valueAxis(t, { max: yMax }), axisLabel: { color: t.ink3, fontFamily: FONT, fontSize: fz(11), formatter: (v: number) => axisTick(v) } },
    tooltip: {
      ...tooltipStyle(t),
      trigger: "axis",
      axisPointer: { type: "shadow", shadowStyle: { color: t.hover, opacity: 0.6 } },
      formatter: (items: TooltipItem[]) => {
        const i = start + (items[0]?.dataIndex ?? 0);
        const k = i - start;
        let s = ttHead(monthLong(m.months[i]), i > m.asOf ? "forecast" : "actual");
        if (hist[k] !== null && h.predId) s += ttRow(t.ink, `${h.predId} demand`, fmtInt(hist[k] as number));
        if (i > m.asOf && run[k] !== null && h.predId) s += ttRow(t.accent, `${h.predId} forecast`, fmtInt(run[k] as number));
        if (succ[k] !== null && h.succId) s += ttRow(t.accentTint, `${h.succId} forecast`, fmtInt(succ[k] as number), "box");
        if (h.eol === i) s += ttNote(`${h.predId} end of life`);
        if (h.launch === i) s += ttNote(`${h.succId} launches`);
        return s + ttEnd();
      },
    },
    series: [
      {
        name: "window",
        type: "custom",
        silent: true,
        z: 0,
        data: [[div]],
        renderItem: (params: { coordSys: { x: number; y: number; width: number; height: number } }, api: { value: (d: number) => number; coord: (v: number[]) => number[] }) => {
          const c = params.coordSys;
          const x = Math.round((api.coord([api.value(0), 0])[0] + api.coord([api.value(0) + 1, 0])[0]) / 2) + 0.5;
          return {
            type: "group",
            children: [
              { type: "rect", shape: { x, y: c.y, width: c.x + c.width - x, height: c.height }, style: { fill: t.accentWash } },
              { type: "line", shape: { x1: x, y1: c.y, x2: x, y2: c.y + c.height }, style: { stroke: t.ink, lineWidth: 1 } },
            ],
          };
        },
      },
      {
        name: "succ",
        type: "bar",
        data: succ,
        barMaxWidth: narrow ? 6 : 9,
        itemStyle: { color: t.accentTint, borderRadius: [2, 2, 0, 0] },
        z: 2,
      },
      { name: "hist", type: "line", data: hist, symbol: "none", lineStyle: { width: 1.5, color: t.ink, join: "round" }, z: 4 },
      {
        name: "run",
        type: "line",
        data: run,
        symbol: "none",
        lineStyle: { width: 2, color: t.accent, join: "round" },
        z: 5,
        markPoint:
          eolAt >= 0 && run[eolAt] !== null
            ? { silent: true, symbol: "rect", symbolSize: 8, itemStyle: { color: t.accent, borderColor: t.paper, borderWidth: 1.5 }, label: { show: false }, data: [{ coord: [eolAt, run[eolAt] as number] }] }
            : undefined,
      },
    ],
  } as EChartsCoreOption;
}
