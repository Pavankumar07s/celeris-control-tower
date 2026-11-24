// Macro lead / lag charts: the family x indicator matrix (diverging jade <-> plum, the model's drivers outlined
// in ink, the selected cell in orange: the one active marker), the lag profile by era, the model-free check on
// one axis (both series standardised), demand by powertrain indexed to 2023 = 100, and the per-SKU sensitivity
// dot plot.  Never a dual axis.
import type { EChartsCoreOption } from "echarts/core";
import { FONT, fz, fpx, axisTooltip, baseOption, categoryAxis, esc, niceMax, scaleLegend, tooltipStyle, ttEnd, ttHead, ttNote, ttRow, valueAxis, type Theme, type TooltipItem } from "../../charts/theme";
import { contrastOf, endLabelSeries, rampAt, readableOn, type EndLabel } from "./forecastCharts";
import type { Model } from "../../data/model";
import { monthLong, fmtSignedPct } from "../../data/format";
import { indShort } from "../../insights/indicators";
import { eraLabel, type Cell, type SensRow } from "../../insights/macro";

const r2 = (r: number) => `${r < 0 ? "−" : r > 0 ? "+" : ""}${Math.abs(r).toFixed(2)}`;
const endLab = (t: Theme, text: string, strong = false) => ({ show: true, formatter: text, color: strong ? t.ink : t.ink3, fontFamily: FONT, fontSize: fz(11.5), fontWeight: strong ? 600 : 400, distance: 6 });

/** Mix a colour towards the paper: k = 1 keeps the colour, 0.35 keeps 35 % of it (the faded non-driver cells). */
function toward(t: Theme, c: string, k: number): string {
  const hex = (x: string) => {
    const h = x.trim().match(/^#([0-9a-f]{6})$/i);
    return h ? [0, 2, 4].map((i) => parseInt(h[1].slice(i, i + 2), 16)) : null;
  };
  const a = hex(c);
  const p = hex(t.paper);
  if (!a || !p) return c;
  return `#${a.map((v, i) => Math.round(p[i] + (v - p[i]) * k).toString(16).padStart(2, "0")).join("")}`;
}

/** The family x indicator matrix.  The model's drivers (full-history fit) carry the full diverging colour and a 2px outline (ink, chalk in dark);
 *  every other cell (shown at its strongest lag, often a seasonal echo at the edge of the search window) is faded
 *  to 35 % towards the paper with muted text, so the eye lands on the drivers, not on the artefacts.  The colour
 *  scale legend stays (a visualMap bound to an empty series), and each cell's colour is the legend's colour. */
export function matrixOption(t: Theme, m: Model, inds: string[], cells: Cell[], sel: { f: number; k: number }, narrow: boolean): EChartsCoreOption {
  const color = (r: number) => rampAt(t.diverging, (r + 1) / 2);
  const data = cells.map((c) => {
    const isSel = c.f === sel.f && c.k === sel.k;
    const fill = c.driver ? color(c.r) : toward(t, color(c.r), 0.35);
    return {
      value: [c.k, c.f, c.r, c.lag, c.driver ? 1 : 0, c.stable ? 1 : 0],
      itemStyle: { color: fill, borderColor: isSel ? t.accent : c.driver ? t.ink : t.paper, borderWidth: isSel ? 3 : 2 },
      // drivers: ink or paper by contrast; faded cells: muted ink-3 where it still reaches 4.5:1, else the readable one
      label: { color: !c.driver && contrastOf(t.ink3, fill) >= 4.5 ? t.ink3 : readableOn(t, fill), fontWeight: c.driver ? 600 : 400 },
    };
  });
  return {
    ...baseOption(t),
    grid: { left: narrow ? 46 : 176, right: 8, top: 4, bottom: 62 },
    xAxis: { ...categoryAxis(t, inds.map((k) => indShort(k).replace(" ", "\n"))), position: "top", axisLine: { show: false }, axisLabel: { color: t.ink2, fontFamily: FONT, fontSize: fz(11.5), interval: 0, lineHeight: 14, margin: 8 } },
    yAxis: { ...categoryAxis(t, narrow ? m.dims.families.code : m.dims.families.name), inverse: true, axisLine: { show: false }, axisLabel: { color: t.ink2, fontFamily: FONT, fontSize: fz(12), margin: 10 } },
    // the legend only: bound to the empty series 1, so it never repaints the cells (each cell sets its own colour)
    visualMap: { ...scaleLegend(t, { min: -1, max: 1, colors: t.diverging, format: (v) => r2(v), low: "moves against demand", high: "moves with demand" }), seriesIndex: 1, bottom: 0, itemHeight: narrow ? 120 : 200 },
    tooltip: {
      ...tooltipStyle(t),
      trigger: "item",
      formatter: (p: { value: number[] }) => {
        const c = cells.find((x) => x.k === p.value[0] && x.f === p.value[1]);
        if (!c) return "";
        const head = ttHead(`${m.dims.families.name[c.f]} × ${indShort(inds[c.k])}`, c.driver ? "model driver" : "not a driver");
        const rows = ttRow(color(c.r), `r at lag ${c.lag}, 2019–26`, r2(c.r), "box") + (c.e1 !== null ? ttRow(t.ink3, "2019–22", r2(c.e1)) : "") + (c.e2 !== null ? ttRow(t.ink4, "2023–26", r2(c.e2)) : "");
        const note = ttNote(c.driver ? (c.stable ? "Stable: same sign and |r| ≥ 0.5 in both eras" : "Not stable across the two eras") : "Shown at its strongest lag");
        return head + rows + note + ttEnd();
      },
    },
    series: [
      {
        type: "heatmap",
        data,
        label: {
          show: true,
          fontFamily: FONT,
          fontSize: fz(narrow ? 10.5 : 11.5),
          lineHeight: 14,
          formatter: (p: { value: number[] }) => (narrow ? r2(p.value[2]) : `${r2(p.value[2])}\nlag ${p.value[3]}`),
        },
        emphasis: { itemStyle: { borderColor: t.accent, borderWidth: 3 } },
      },
      { type: "heatmap", data: [], silent: true },
    ],
  } as EChartsCoreOption;
}

/** Correlation by lag 0-12 for one family x indicator, all years in ink and the two eras in lighter greys;
 *  the chosen lag as a dotted rule. */
export function lagOption(t: Theme, corr: (number | null)[][], eras: string[], lag: number): EChartsCoreOption {
  const xs = Array.from({ length: corr[0]?.length ?? 13 }, (_, i) => String(i));
  const style = [
    { c: t.ink, w: 2 },
    { c: t.ink3, w: 1.5 },
    { c: t.ink4, w: 1.5 },
  ];
  // each line labelled at its end (the eras were two greys told apart only by shade)
  const ends: EndLabel[] = corr
    .map((row, e): EndLabel | null => {
      let i = row.length - 1;
      while (i >= 0 && (row[i] === null || !Number.isFinite(row[i] as number))) i--;
      return i >= 0 ? { x: i, y: row[i] as number, text: eraLabel(eras[e] ?? ""), color: style[e]?.c ?? t.ink3, strong: e === 0 } : null;
    })
    .filter((x): x is EndLabel => x !== null);
  return {
    ...baseOption(t),
    grid: { left: fpx(40), right: fpx(62), top: 22, bottom: 34 },
    xAxis: categoryAxis(t, xs, { boundaryGap: false, name: "months the indicator leads", nameLocation: "middle", nameGap: 24, nameTextStyle: { color: t.ink3, fontSize: fz(11.5), fontFamily: FONT } }),
    yAxis: { ...valueAxis(t, { min: -1, max: 1 }), axisLabel: { color: t.ink3, fontFamily: FONT, fontSize: fz(11.5), formatter: (v: number) => (v === 0 ? "0" : r2(v)) } },
    tooltip: axisTooltip(t, (items: TooltipItem[]) => `${ttHead(`Lag ${items[0]?.axisValue} month${items[0]?.axisValue === "1" ? "" : "s"}`, "correlation")}${items.filter((it) => it.seriesIndex < corr.length).map((it) => ttRow(style[it.seriesIndex]?.c ?? t.ink3, eraLabel(eras[it.seriesIndex] ?? ""), it.value === null || it.value === undefined ? "–" : r2(it.value as number))).join("")}${ttEnd()}`),
    series: [...corr.map((row, e) => ({
      name: eraLabel(eras[e] ?? ""),
      type: "line",
      data: row,
      symbol: "none",
      lineStyle: { width: style[e]?.w ?? 1.5, color: style[e]?.c ?? t.ink3 },
      itemStyle: { color: style[e]?.c ?? t.ink3 },
      z: 5 - e,
      markLine:
        e === 0
          ? {
              silent: true,
              symbol: ["none", "none"],
              data: [
                { yAxis: 0, lineStyle: { color: t.ruleStrong, type: "solid", width: 1 }, label: { show: false } },
                { xAxis: String(lag), lineStyle: { color: t.ink, type: [2, 3], width: 1 }, label: { show: true, position: "end", formatter: `lag ${lag}`, color: t.ink, fontFamily: FONT, fontSize: fz(11.5), fontWeight: 600 } },
              ],
            }
          : undefined,
    })), endLabelSeries(t, ends)],
  } as EChartsCoreOption;
}

/** Model-free check: the family's 12-month demand growth and the indicator's 12-month change `lag` months
 *  earlier, both standardised (z-scores), so one axis serves.  Returns the option and the r of what is drawn. */
export function checkOption(t: Theme, m: Model, famLatent: Float64Array, ind: (number | null)[], lag: number, famLabel: string, indKey: string): { option: EChartsCoreOption; r: number } {
  const growth: (number | null)[] = [];
  const shifted: (number | null)[] = [];
  for (let i = 0; i <= m.asOf; i++) {
    growth.push(i >= 12 && famLatent[i] > 0 && famLatent[i - 12] > 0 ? Math.log(famLatent[i] / famLatent[i - 12]) : null);
    const a = ind[i - lag];
    const b = ind[i - lag - 12];
    shifted.push(i - lag - 12 >= 0 && a !== null && b !== null && a !== undefined && b !== undefined ? a - b : null);
  }
  const z = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x !== null);
    const mu = v.reduce((a, b) => a + b, 0) / Math.max(1, v.length);
    const sd = Math.sqrt(v.reduce((a, b) => a + (b - mu) ** 2, 0) / Math.max(1, v.length)) || 1;
    return xs.map((x) => (x === null ? null : (x - mu) / sd));
  };
  const zg = z(growth);
  const zs = z(shifted);
  let sxy = 0;
  let n = 0;
  for (let i = 0; i < zg.length; i++) if (zg[i] !== null && zs[i] !== null) {
    sxy += (zg[i] as number) * (zs[i] as number);
    n++;
  }
  // z-scores are over each series' own months; recentre on the shared months for an exact r
  const pairs = zg.map((g, i) => [g, zs[i]]).filter((p): p is [number, number] => p[0] !== null && p[1] !== null);
  const mx = pairs.reduce((a, p) => a + p[0], 0) / Math.max(1, pairs.length);
  const my = pairs.reduce((a, p) => a + p[1], 0) / Math.max(1, pairs.length);
  let cxy = 0;
  let cxx = 0;
  let cyy = 0;
  for (const [x, y] of pairs) {
    cxy += (x - mx) * (y - my);
    cxx += (x - mx) ** 2;
    cyy += (y - my) ** 2;
  }
  const r = n > 2 && cxx > 0 && cyy > 0 ? cxy / Math.sqrt(cxx * cyy) : NaN;
  const labels = m.months.slice(0, m.asOf + 1);
  const all = [...zg, ...zs].filter((v): v is number => v !== null);
  const lim = Math.ceil(Math.max(2, ...all.map(Math.abs)));
  const option = {
    ...baseOption(t),
    grid: { left: 44, right: 16, top: 16, bottom: 30 },
    xAxis: categoryAxis(t, labels, { boundaryGap: false, axisLabel: { color: t.ink3, fontFamily: FONT, fontSize: fz(11.5), margin: 9, interval: (i: number) => labels[i].endsWith("-01") && Number(labels[i].slice(0, 4)) % 2 === 0, formatter: (v: string) => v.slice(0, 4) } }),
    yAxis: { ...valueAxis(t, { min: -lim, max: lim }), axisLabel: { color: t.ink3, fontFamily: FONT, fontSize: fz(11.5), formatter: (v: number) => (v === 0 ? "0" : `${v > 0 ? "+" : "−"}${Math.abs(v)} sd`) } },
    tooltip: axisTooltip(t, (items: TooltipItem[]) => {
      const i = items[0]?.dataIndex ?? 0;
      const f = (v: number | null) => (v === null ? "–" : `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)} sd`);
      return `${ttHead(monthLong(labels[i]), "actual")}${ttRow(t.ink, `${famLabel}, 12-month growth`, f(zg[i]))}${ttRow(t.cat[6], `${indShort(indKey)}, 12-month change${lag ? `, ${lag} months earlier` : ""}`, f(zs[i]))}${ttEnd()}`;
    }),
    series: [
      { name: "zero", type: "line", data: [], markLine: { silent: true, symbol: ["none", "none"], label: { show: false }, lineStyle: { color: t.ruleStrong, width: 1, type: "solid" }, data: [{ yAxis: 0 }] } },
      { name: famLabel, type: "line", data: zg, symbol: "none", lineStyle: { width: 2, color: t.ink }, z: 5 },
      { name: indShort(indKey), type: "line", data: zs, symbol: "none", lineStyle: { width: 1.5, color: t.cat[6] }, z: 4 },
    ],
  } as EChartsCoreOption;
  return { option, r };
}

/** Rolling 12-month latent demand by powertrain, indexed to its 2023 average = 100, with the EV adoption index on the same base. */
export function evOption(t: Theme, m: Model, series: { name: string; data: (number | null)[]; color: string; width: number; strong?: boolean }[]): EChartsCoreOption {
  const labels = m.months.slice(0, m.asOf + 1);
  const vals = series.flatMap((s) => s.data).filter((v): v is number => v !== null);
  const max = niceMax(Math.max(120, ...vals) * 1.06);
  return {
    ...baseOption(t),
    grid: { left: 40, right: 72, top: 16, bottom: 30 },
    xAxis: categoryAxis(t, labels, { boundaryGap: false, axisLabel: { color: t.ink3, fontFamily: FONT, fontSize: fz(11.5), margin: 9, interval: (i: number) => labels[i].endsWith("-01"), formatter: (v: string) => v.slice(0, 4) } }),
    yAxis: valueAxis(t, { max }),
    tooltip: axisTooltip(t, (items: TooltipItem[]) => {
      const i = items[0]?.dataIndex ?? 0;
      return `${ttHead(monthLong(labels[i]), "2023 = 100")}${items
        .filter((it) => it.seriesIndex > 0)
        .map((it) => ttRow(series[it.seriesIndex - 1]?.color ?? t.ink3, series[it.seriesIndex - 1]?.name ?? "", it.value === null || it.value === undefined ? "–" : (it.value as number).toFixed(0)))
        .join("")}${ttEnd()}`;
    }),
    series: [
      { name: "base", type: "line", data: [], markLine: { silent: true, symbol: ["none", "none"], label: { show: true, position: "insideStartTop", formatter: "2023 = 100", color: t.ink3, fontFamily: FONT, fontSize: fz(11) }, lineStyle: { color: t.ink3, width: 1, type: "solid" }, data: [{ yAxis: 100 }] } },
      ...series.map((s) => ({ name: s.name, type: "line", data: s.data, symbol: "none", lineStyle: { width: s.width, color: s.color }, itemStyle: { color: s.color }, endLabel: s.strong ? endLab(t, s.name, true) : undefined })),
    ],
  } as EChartsCoreOption;
}

/** Dot plot: one row per indicator, one dot per SKU x channel group (effect of a permanent +1 sd shift), the
 *  median as an ink tick with its value. */
export function sensOption(t: Theme, rows: SensRow[], inds: string[], sku: (k: number) => string): EChartsCoreOption {
  const ks = [...new Set(rows.map((r) => r.k))].sort((a, b) => a - b);
  const med = ks.map((k) => {
    const v = rows.filter((r) => r.k === k).map((r) => r.eff).sort((a, b) => a - b);
    return { k, median: v.length ? v[Math.floor(v.length / 2)] : 0, n: v.length };
  });
  const lim = Math.max(0.05, ...rows.map((r) => Math.abs(r.eff)));
  const span = Math.ceil(lim * 10) / 10;
  // deterministic jitter from the SKU index
  const jit = (r: SensRow) => (((r.sku * 9301 + (r.group === "aftermarket" ? 4973 : 0)) % 233280) / 233280 - 0.5) * 0.56;
  const many = rows.length > 1500;
  return {
    ...baseOption(t),
    grid: { left: 118, right: 58, top: 10, bottom: 30 },
    xAxis: { ...valueAxis(t, { min: -span, max: span, percent: true }), splitNumber: 4, interval: span / 2 },
    yAxis: [
      { type: "value", min: -0.5, max: ks.length - 0.5, inverse: true, show: false },
      { ...categoryAxis(t, ks.map((k) => indShort(inds[k]))), inverse: true, position: "left", axisLine: { show: false }, splitLine: { show: true, interval: 0, lineStyle: { color: t.rule, width: 1 } }, axisLabel: { color: t.ink2, fontFamily: FONT, fontSize: fz(12), margin: 10 } },
    ],
    tooltip: {
      ...tooltipStyle(t),
      trigger: "item",
      formatter: (p: { seriesIndex: number; dataIndex: number; data: { r?: SensRow; med?: { k: number; median: number; n: number } } }) => {
        if (p.data.med) return `${ttHead(indShort(inds[p.data.med.k]), "median")}${ttRow(t.ink, `median of ${p.data.med.n} SKU × channel group links`, fmtSignedPct(p.data.med.median))}${ttEnd()}`;
        const r = p.data.r as SensRow;
        return `${ttHead(`${esc(sku(r.sku))} · ${r.group === "aftermarket" ? "Aftermarket" : "other channels"}`, indShort(inds[r.k]))}${ttRow(t.ink3, "demand per +1 sd, permanent", fmtSignedPct(r.eff))}${ttNote(`β summed over lag${r.lags.length > 1 ? "s" : ""} ${r.lags.join(", ")}: ${r.beta.toFixed(4)} per unit`)}${ttEnd()}`;
      },
    },
    series: [
      {
        name: "zero",
        type: "scatter",
        data: [],
        markLine: { silent: true, symbol: ["none", "none"], label: { show: false }, lineStyle: { color: t.ink3, width: 1, type: "solid" }, data: [{ xAxis: 0 }] },
      },
      {
        name: "links",
        type: "scatter",
        symbolSize: many ? 4 : 6,
        large: many,
        itemStyle: { color: t.ink4, opacity: t.name === "dark" ? (many ? 0.6 : 0.8) : many ? 0.35 : 0.6 },
        data: rows.map((r) => ({ value: [r.eff, ks.indexOf(r.k) + jit(r)], r })),
        emphasis: { itemStyle: { color: t.ink, opacity: 1 } },
      },
      {
        name: "median",
        type: "scatter",
        symbol: "rect",
        symbolSize: [3, 22],
        itemStyle: { color: t.ink },
        z: 5,
        data: med.map((x, i) => ({ value: [x.median, i], med: x })),
      },
      {
        name: "median-label",
        type: "scatter",
        silent: true,
        symbolSize: 0,
        data: med.map((x, i) => ({ value: [span, i], label: { show: true, position: "right", distance: 8, formatter: fmtSignedPct(x.median), color: t.ink, fontFamily: FONT, fontSize: fz(11.5), fontWeight: 600 } })),
      },
    ],
  } as EChartsCoreOption;
}

export function sensMedians(rows: SensRow[]): { k: number; median: number; n: number }[] {
  const ks = [...new Set(rows.map((r) => r.k))].sort((a, b) => a - b);
  return ks.map((k) => {
    const v = rows.filter((r) => r.k === k).map((r) => r.eff).sort((a, b) => a - b);
    return { k, median: v.length ? v[Math.floor(v.length / 2)] : 0, n: v.length };
  });
}
