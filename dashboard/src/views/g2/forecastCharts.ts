// Chart options for Forecast & accuracy: WAPE by horizon, bias by family x region, and the backtest time
// machine (a forecast made at a past origin against what happened).  Built on the shared helpers in
// charts/theme.ts; colours are theme roles only (ink = past, orange = our forecast, dashed = another forecast).
import type { EChartsCoreOption } from "echarts/core";
import { FONT, fz, fpx, axisTick, axisTooltip, baseOption, categoryAxis, niceMax, scaleLegend, tooltipStyle, ttEnd, ttHead, ttNote, ttRow, valueAxis, type Theme, type TooltipItem } from "../../charts/theme";
import type { Model } from "../../data/model";
import { fmtInt, fmtMoney, fmtPct, monthLong, monthName, fmtSignedPct } from "../../data/format";
import type { HorizonData } from "../../insights/accuracy";

// ---- colour helpers: label text that stays readable on any heatmap cell, in both themes ------------------------
function rgb(c: string): [number, number, number] | null {
  const h = c.trim().match(/^#([0-9a-f]{6})$/i);
  if (h) return [0, 2, 4].map((i) => parseInt(h[1].slice(i, i + 2), 16)) as [number, number, number];
  const m = c.match(/rgba?\(([^)]+)\)/i);
  if (m) {
    const p = m[1].split(",").map((x) => parseFloat(x));
    return [p[0], p[1], p[2]];
  }
  return null;
}
const lum = (c: [number, number, number]) => {
  const ch = (v: number) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(c[0]) + 0.7152 * ch(c[1]) + 0.0722 * ch(c[2]);
};
const contrast = (a: [number, number, number], b: [number, number, number]) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
/** WCAG contrast ratio between two colours (hex or rgb()); 1 when either cannot be parsed. */
export function contrastOf(a: string, b: string): number {
  const x = rgb(a);
  const y = rgb(b);
  return x && y ? contrast(x, y) : 1;
}
/** The theme's ink or paper, whichever reads better on `fill` (computed WCAG contrast, both themes). */
export function readableOn(t: Theme, fill: string): string {
  const f = rgb(fill);
  const ink = rgb(t.ink);
  const paper = rgb(t.paper);
  if (!f || !ink || !paper) return t.ink;
  return contrast(f, ink) >= contrast(f, paper) ? t.ink : t.paper;
}
/** The colour of a continuous ramp at x in [0, 1], interpolated in RGB like the ECharts visualMap legend. */
export function rampAt(stops: string[], x: number): string {
  const v = Math.max(0, Math.min(1, x)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(v));
  const a = rgb(stops[i]);
  const b = rgb(stops[i + 1]);
  if (!a || !b) return stops[Math.round(v)];
  const k = v - i;
  const c = a.map((p, j) => Math.round(p + (b[j] - p) * k));
  return `#${c.map((p) => p.toString(16).padStart(2, "0")).join("")}`;
}

// ---- end labels that never overlap: a custom series that lays them out in pixels at render time ---------------
export interface EndLabel {
  /** x as a category index, y as a data value (the line's last point). */
  x: number;
  y: number;
  text: string;
  color: string;
  strong?: boolean;
}
/** End labels placed right of each line's last point, spread to at least `gap` px apart (scaled with the type)
 *  with a short leader when a label had to move.  Add it as the LAST series; tooltips should skip its index. */
export function endLabelSeries(t: Theme, items: EndLabel[], gap = 15) {
  const size = fz(11.5);
  const minGap = Math.max(gap * (size / 11.5), size + 3);
  return {
    type: "custom" as const,
    name: "__end-labels",
    silent: true,
    z: 20,
    clip: false,
    tooltip: { show: false },
    data: [[0, items[0]?.y ?? 0]],
    renderItem: (params: { coordSys: { x: number; y: number; width: number; height: number } }, api: { coord: (v: [number, number]) => number[] }) => {
      const cs = params.coordSys;
      const pts = items
        .filter((it) => Number.isFinite(it.y))
        .map((it) => {
          const p = api.coord([it.x, it.y]);
          return { ...it, px: p[0], py: p[1], ly: p[1] };
        })
        .sort((a, b) => a.py - b.py);
      // push down, then pull back inside the plot from the bottom, keeping the minimum gap
      for (let i = 1; i < pts.length; i++) if (pts[i].ly - pts[i - 1].ly < minGap) pts[i].ly = pts[i - 1].ly + minGap;
      const bottom = cs.y + cs.height + size / 2;
      if (pts.length && pts[pts.length - 1].ly > bottom) {
        pts[pts.length - 1].ly = bottom;
        for (let i = pts.length - 2; i >= 0; i--) if (pts[i + 1].ly - pts[i].ly < minGap) pts[i].ly = pts[i + 1].ly - minGap;
      }
      const children: unknown[] = [];
      for (const p of pts) {
        const moved = Math.abs(p.ly - p.py) > 2;
        const tx = p.px + (moved ? 14 : 7);
        if (moved) children.push({ type: "line", shape: { x1: p.px + 3, y1: p.py, x2: p.px + 11, y2: p.ly }, style: { stroke: t.ink3, lineWidth: 1 } });
        children.push({ type: "text", x: tx, y: p.ly, style: { text: p.text, fill: p.strong ? t.ink : t.ink3, font: `${p.strong ? 600 : 400} ${size}px ${FONT}`, align: "left", verticalAlign: "middle" } });
      }
      return { type: "group", children };
    },
  };
}

/** WAPE by horizon: our model in orange with an end label, benchmarks dashed (another forecast), the
 *  in-hindsight floor as a thin ink hairline.  End labels replace the legend (<= 4 lines). */
export function horizonOption(t: Theme, h: HorizonData, final: string, labels: Record<string, string>, narrow: boolean, metric: "wape" | "bias" = "wape"): EChartsCoreOption {
  const isBias = metric === "bias";
  const src = isBias ? h.b : h.w;
  const vals = Object.values(src).flat().filter((v): v is number => v !== null && Number.isFinite(v));
  const max = isBias ? niceMax(Math.max(0.02, ...vals.map(Math.abs)) * 1.15) : niceMax(Math.max(0.1, ...vals) * 1.08);
  // the in-hindsight floor has no meaningful bias (it knows the level), so the bias chart leaves it out
  const order = ["naive", "seasonal_naive", "oracle", final].filter((md) => src[md] && !(isBias && md === "oracle"));
  const style: Record<string, { color: string; width: number; dash: boolean; z: number }> = {
    naive: { color: t.ink4, width: 1.5, dash: true, z: 2 },
    seasonal_naive: { color: t.ink3, width: 1.5, dash: true, z: 3 },
    oracle: { color: t.ink, width: 1, dash: false, z: 2 },
    [final]: { color: t.accent, width: 2, dash: false, z: 5 },
  };
  // end labels: the last scored point of each line, laid out without overlap
  const ends: EndLabel[] = order
    .map((md): EndLabel | null => {
      const d = src[md] ?? [];
      let i = d.length - 1;
      while (i >= 0 && (d[i] === null || !Number.isFinite(d[i] as number))) i--;
      return i >= 0 ? { x: i, y: d[i] as number, text: labels[md] ?? md, color: style[md].color, strong: md === final } : null;
    })
    .filter((e): e is EndLabel => e !== null);
  return {
    ...baseOption(t),
    grid: { left: fpx(40), right: fpx(narrow ? 104 : 118), top: 18, bottom: 34 },
    xAxis: categoryAxis(t, h.xs, { name: h.fine ? "months ahead" : "months ahead (bucket)", nameLocation: "middle", nameGap: 26, nameTextStyle: { color: t.ink3, fontSize: fz(11.5), fontFamily: FONT }, boundaryGap: !h.fine, axisLabel: { color: t.ink3, fontFamily: FONT, fontSize: fz(11.5), margin: 9, interval: h.fine ? (i: number) => i === 0 || i === 5 || i === 11 || i === h.xs.length - 1 : 0 } }),
    yAxis: isBias ? { ...valueAxis(t, { max, min: -max, percent: true }), splitNumber: 4 } : valueAxis(t, { max, percent: true }),
    tooltip: axisTooltip(t, (items: TooltipItem[]) => {
      const head = ttHead(h.fine ? `${items[0]?.axisValue} month${items[0]?.axisValue === "1" ? "" : "s"} ahead` : `${items[0]?.axisValue} months ahead`, isBias ? "bias" : "WAPE");
      const rows = items
        .filter((it) => it.seriesIndex < order.length)
        .sort((a, b) => Number(a.value ?? 0) - Number(b.value ?? 0))
        .map((it) => {
          const md = order[it.seriesIndex];
          const v = it.value as number | null;
          return ttRow(style[md]?.color ?? t.ink3, labels[md] ?? md, v === null || v === undefined ? "–" : isBias ? fmtSignedPct(v) : fmtPct(v), style[md]?.dash ? "dash" : "line");
        })
        .join("");
      return head + rows + ttEnd();
    }),
    series: [...order.map((md, i) => ({
      name: labels[md] ?? md,
      type: "line",
      data: src[md],
      ...(isBias && i === 0 ? { markLine: { silent: true, symbol: "none", label: { show: false }, lineStyle: { color: t.ink3, width: 1, type: "solid" }, data: [{ yAxis: 0 }] } } : {}),
      symbol: h.fine ? "none" : "circle",
      symbolSize: 7,
      showSymbol: !h.fine,
      connectNulls: false,
      lineStyle: { width: style[md].width, color: style[md].color, type: style[md].dash ? [4, 3] : "solid" },
      itemStyle: { color: style[md].color, borderColor: t.paper, borderWidth: 2 },
      z: style[md].z,
    })), endLabelSeries(t, ends)],
  } as EChartsCoreOption;
}

const CODE_REGION: Record<string, string> = { "North America": "N Am", Europe: "Eur", "Asia Pacific": "APAC", India: "India", "Latin America": "LatAm", "Middle East & Africa": "MEA" };
const SHORT_REGION: Record<string, string> = {
  "North America": "North\nAmerica",
  "Asia Pacific": "Asia\nPacific",
  "Latin America": "Latin\nAmerica",
  "Middle East & Africa": "Middle East\n& Africa",
};

/** Bias heatmap family x region: diverging jade (under) <-> plum (over), 2px paper gaps, the value printed in
 *  every cell, a numeric legend with the poles named in words.  The selected cell carries an ink ring. */
export function biasOption(t: Theme, m: Model, cells: { fam: number; reg: number; bias: number | null; actual: number }[], sel: { fam: number | null; reg: number | null }, narrow: boolean): EChartsCoreOption {
  const fams = m.dims.families.name;
  const regs = m.dims.regions;
  const absMax = Math.max(0.02, ...cells.map((c) => Math.abs(c.bias ?? 0)));
  const lim = Math.ceil(absMax * 100 / 2) * 2 / 100; // round up to an even percentage
  // the cell's colour exactly as the continuous legend paints it, so the label colour is chosen on the real fill
  const color = (b: number) => rampAt(t.diverging, (b + lim) / (2 * lim));
  const data = cells.map((c) => {
    const on = (sel.fam === null || sel.fam === c.fam) && (sel.reg === null || sel.reg === c.reg) && (sel.fam !== null || sel.reg !== null);
    return {
      value: [c.reg, c.fam, c.bias],
      itemStyle: { borderColor: on ? t.ink : t.paper, borderWidth: on ? 2 : 2 },
      label: { color: c.bias === null ? t.ink3 : readableOn(t, color(c.bias)) },
    };
  });
  return {
    ...baseOption(t),
    grid: { left: narrow ? 44 : 168, right: 8, top: 4, bottom: narrow ? 64 : 82 },
    xAxis: { ...categoryAxis(t, regs.map((r) => (narrow ? (CODE_REGION[r] ?? r) : (SHORT_REGION[r] ?? r)))), axisLine: { show: false }, axisLabel: { color: t.ink3, fontFamily: FONT, fontSize: fz(11.5), interval: 0, lineHeight: 14, margin: 8 } },
    yAxis: { ...categoryAxis(t, narrow ? m.dims.families.code : fams), inverse: true, axisLine: { show: false }, axisLabel: { color: t.ink2, fontFamily: FONT, fontSize: fz(12), margin: 10 } },
    visualMap: { ...scaleLegend(t, { min: -lim, max: lim, colors: t.diverging, format: (v) => fmtSignedPct(v, 0), low: narrow ? "under" : "under-forecast", high: narrow ? "over" : "over-forecast" }), bottom: 0, itemHeight: narrow ? 120 : 180 },
    tooltip: {
      ...tooltipStyle(t),
      trigger: "item",
      formatter: (p: { value: (number | null)[] }) => {
        const c = cells.find((x) => x.reg === p.value[0] && x.fam === p.value[1]);
        if (!c) return "";
        return `${ttHead(`${fams[c.fam]} · ${regs[c.reg]}`, "Backtest")}${ttRow(c.bias === null ? t.ink3 : color(c.bias), "bias, our model", c.bias === null ? "–" : fmtSignedPct(c.bias), "box")}${ttNote("Click to filter the page to this family and region")}${ttEnd()}`;
      },
    },
    series: [
      {
        type: "heatmap",
        data,
        label: { show: true, fontFamily: FONT, fontSize: fz(11.5), formatter: (p: { value: (number | null)[] }) => (p.value[2] === null ? "–" : fmtSignedPct(p.value[2] as number, Math.abs(p.value[2] as number) < 0.095 ? 1 : 0)) },
        emphasis: { itemStyle: { borderColor: t.ink, borderWidth: 2 } },
      },
    ],
  } as EChartsCoreOption;
}

/** The backtest time machine: actual demand in ink (history up to the origin, then the scored actuals), the
 *  forecast made at the origin in orange with its own wash, the benchmark at the origin dashed ink-3. */
export function timeMachineOption(
  t: Theme,
  m: Model,
  a: { origin: number; H: number; hist: ArrayLike<number>; act: ArrayLike<number>; pred: ArrayLike<number>; base: ArrayLike<number>; usd: boolean; finalLabel: string; baseLabel: string; narrow: boolean },
): EChartsCoreOption {
  const start = Math.max(0, a.origin - 24);
  const end = Math.min(m.nMonths - 1, a.origin + a.H);
  const labels = m.months.slice(start, end + 1);
  const n = labels.length;
  const actual: (number | null)[] = [];
  const pred: (number | null)[] = [];
  const base: (number | null)[] = [];
  for (let i = start; i <= end; i++) {
    const j = i - a.origin - 1;
    actual.push(i <= a.origin ? a.hist[i] : j < a.H ? a.act[j] : null);
    pred.push(i === a.origin ? a.hist[i] : i > a.origin && j < a.H ? a.pred[j] : null);
    base.push(i === a.origin ? a.hist[i] : i > a.origin && j < a.H ? a.base[j] : null);
  }
  const vmax = Math.max(1, ...[...actual, ...pred, ...base].filter((v): v is number => v !== null));
  const yMax = niceMax(vmax * 1.16);
  const div = a.origin - start;
  const fv = (v: number | null) => (v === null || !Number.isFinite(v) ? "–" : a.usd ? fmtMoney(v, 2) : fmtInt(v));
  return {
    ...baseOption(t),
    grid: a.narrow ? { left: 34, right: 16, top: 48, bottom: 30 } : { left: 46, right: 40, top: 48, bottom: 30 },
    xAxis: categoryAxis(t, labels, {
      boundaryGap: false,
      axisLabel: { color: t.ink3, fontFamily: FONT, fontSize: fz(11.5), margin: 9, interval: (i: number) => i % (a.narrow ? 12 : 6) === 0, formatter: (v: string) => monthName(v) },
    }),
    yAxis: { ...valueAxis(t, { max: yMax, usd: a.usd }), axisLabel: { color: t.ink3, fontFamily: FONT, fontSize: fz(11.5), formatter: (v: number) => axisTick(v, a.usd) } },
    tooltip: axisTooltip(t, (items: TooltipItem[]) => {
      const i = start + (items[0]?.dataIndex ?? 0);
      const h = i - a.origin;
      let s = ttHead(monthLong(m.months[i]), h > 0 ? `${h} month${h === 1 ? "" : "s"} ahead` : "actual");
      s += ttRow(t.ink, h > 0 ? "actual demand, scored cells" : "unconstrained demand", fv(actual[i - start]));
      if (h > 0) {
        s += ttRow(t.accent, `${a.finalLabel}, made ${monthName(m.months[a.origin])}`, fv(pred[i - start]));
        s += ttRow(t.ink3, a.baseLabel, fv(base[i - start]), "dash");
        const p = pred[i - start];
        const v = actual[i - start];
        if (p !== null && v !== null && v > 0) s += ttNote(`Off by ${fmtSignedPct(p / v - 1)} this month`);
      }
      return s + ttEnd();
    }),
    series: [
      {
        name: "Actual demand",
        type: "line",
        data: actual,
        symbol: "none",
        lineStyle: { width: 2, color: t.ink, cap: "round", join: "round" },
        z: 5,
        markArea: { silent: true, itemStyle: { color: t.accentWash }, data: [[{ xAxis: labels[div] }, { xAxis: labels[n - 1] }]] },
        markLine: {
          silent: true,
          symbol: ["none", "none"],
          lineStyle: { color: t.ink, width: 1, type: "solid" },
          label: { show: true, position: "end", formatter: `${monthName(m.months[a.origin])}\nforecast made`, color: t.ink2, fontFamily: FONT, fontSize: fz(11.5), lineHeight: 15 },
          data: [{ xAxis: div }],
        },
      },
      { name: a.baseLabel, type: "line", data: base, symbol: "none", lineStyle: { width: 1.5, color: t.ink3, type: [4, 3] }, z: 4 },
      { name: a.finalLabel, type: "line", data: pred, symbol: "none", lineStyle: { width: 2, color: t.accent, cap: "round", join: "round" }, z: 6 },
    ],
  } as EChartsCoreOption;
}

