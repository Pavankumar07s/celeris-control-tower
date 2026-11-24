// Chart theme: every colour is read from the CSS custom properties in src/styles/tokens.css at render
// time, so one token set drives HTML and canvas and the theme toggle re-renders charts in the selected
// palette.  The rule: INK IS THE PAST, ORANGE IS THE FUTURE.  On cream the forecast line is the burnt
// orange `accent` (>= 3:1); `orange` (#FF6A13) is for fills and for anything on black.
// See docs/design_system.md, "Chart conventions".
export type ThemeName = "light" | "dark";

export interface Theme {
  name: ThemeName;
  // surfaces
  paper: string;
  rail: string;
  raised: string;
  hover: string;
  // ink: text and history marks
  ink: string;
  ink2: string;
  ink3: string;
  ink4: string; // non-text marks only
  rule: string;
  ruleStrong: string;
  grid: string;
  // orange: the forecast
  orange: string; // #FF6A13: fills, bands, markers; any use on black
  onOrange: string; // text on an orange fill
  accent: string; // forecast line and marks (burnt orange on cream, orange on night)
  accentText: string;
  accentStrong: string;
  accentWash: string;
  accentBand: string;
  accentEdge: string;
  accentTint: string;
  // semantic
  loss: string;
  lossFill: string;
  good: string;
  goodWash: string;
  warn: string;
  warnWash: string;
  warnMark: string;
  crit: string;
  critWash: string;
  scenario: string;
  /** Categorical slots 1-7 (families by index; regions use 0-5, channels 0-3) and [7] = "Other" (ink-4).
   *  Orange is reserved for the forecast and is deliberately NOT in this array (nor is any blue). */
  cat: string[];
  /** Sequential warm grey, 7 steps, for history magnitudes ([0] = near zero). */
  hist: string[];
  /** Sequential orange, 7 steps, for forecast magnitudes ([0] = near zero). */
  fcRamp: string[];
  /** Diverging, 9 steps: [0] strong jade (negative pole, under) .. [4] neutral .. [8] strong plum (positive pole, over). */
  diverging: string[];
  /** Black bands (rail, footer): surface, text, muted text. */
  band: string;
  bandInk: string;
  bandInk2: string;
  shadowPop: string;
}

/** Fallback values (the light theme) used when CSS variables are unavailable (tests, first paint). */
const FALLBACK: Record<string, string> = {
  "--paper": "#EDE6D6", "--raised": "#F7F3EA", "--hover": "#E4DBC8", "--rail": "#0A0A0A",
  "--band": "#0A0A0A", "--band-ink": "#F2EDE3", "--band-ink-2": "#A39D90",
  "--ink": "#141414", "--ink-2": "#3F3A31", "--ink-3": "#5F5849", "--ink-4": "#8A8475",
  "--rule": "#D3C9B4", "--rule-strong": "#B3A892", "--grid": "#DDD4C1",
  "--orange": "#FF6A13", "--on-orange": "#141414", "--accent": "#C24E08", "--accent-text": "#A33F05", "--accent-strong": "#8A3404", "--accent-wash": "#EEE0CC",
  "--accent-band": "rgba(255, 106, 19, 0.24)", "--accent-edge": "rgba(194, 78, 8, 0.55)", "--accent-tint": "#F0C4A2",
  "--loss": "#A8322D", "--loss-fill": "rgba(160, 40, 40, 0.24)", "--good": "#067006", "--good-wash": "#DCE6CC",
  "--warn": "#7A5C00", "--warn-wash": "#EADFB5", "--warn-mark": "#A07A00", "--crit": "#B02E2E", "--crit-wash": "#F0D6CF",
  "--scenario": "#7862BF",
  "--cat-1": "#B74B61", "--cat-2": "#7862BF", "--cat-3": "#8A7300", "--cat-4": "#A84F8E", "--cat-5": "#6B7F09", "--cat-6": "#9358AC", "--cat-7": "#04896A", "--cat-other": "#8A8475",
  "--hist-1": "#E4DCCB", "--hist-2": "#CFC5B1", "--hist-3": "#B3A892", "--hist-4": "#958B76", "--hist-5": "#766D5C", "--hist-6": "#554E42", "--hist-7": "#2E2A24",
  "--fc-1": "#F6DFCB", "--fc-2": "#F3C29C", "--fc-3": "#EEA06A", "--fc-4": "#E47C3A", "--fc-5": "#C95A14", "--fc-6": "#A3420A", "--fc-7": "#7A2F05",
  "--div-1": "#0B5E4E", "--div-2": "#3E8A78", "--div-3": "#8DBDAF", "--div-4": "#D2E2D8", "--div-5": "#E4DCCB", "--div-6": "#EBD3E1", "--div-7": "#C99BBC", "--div-8": "#9E5A89", "--div-9": "#6E2A5E",
  "--shadow-pop": "0 1px 2px rgba(20,20,20,.08), 0 10px 28px rgba(20,20,20,.16)",
};

/** Read one CSS custom property from :root (falls back to the light value). */
export function cssVar(name: string): string {
  if (typeof document !== "undefined") {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (v) return v;
  }
  return FALLBACK[name] ?? "";
}

/** Build the chart theme from the live CSS variables.  Call after `data-theme` is set on <html>. */
export function readTheme(name: ThemeName): Theme {
  const v = cssVar;
  const cat = [1, 2, 3, 4, 5, 6, 7].map((i) => v(`--cat-${i}`)).concat(v("--cat-other"));
  const hist = [1, 2, 3, 4, 5, 6, 7].map((i) => v(`--hist-${i}`));
  const fcRamp = [1, 2, 3, 4, 5, 6, 7].map((i) => v(`--fc-${i}`));
  const diverging = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => v(`--div-${i}`));
  const t = {
    name,
    paper: v("--paper"),
    rail: v("--rail"),
    raised: v("--raised"),
    hover: v("--hover"),
    ink: v("--ink"),
    ink2: v("--ink-2"),
    ink3: v("--ink-3"),
    ink4: v("--ink-4"),
    rule: v("--rule"),
    ruleStrong: v("--rule-strong"),
    grid: v("--grid"),
    orange: v("--orange"),
    onOrange: v("--on-orange"),
    accent: v("--accent"),
    accentText: v("--accent-text"),
    accentStrong: v("--accent-strong"),
    accentWash: v("--accent-wash"),
    accentBand: v("--accent-band"),
    accentEdge: v("--accent-edge"),
    accentTint: v("--accent-tint"),
    loss: v("--loss"),
    lossFill: v("--loss-fill"),
    good: v("--good"),
    goodWash: v("--good-wash"),
    warn: v("--warn"),
    warnWash: v("--warn-wash"),
    warnMark: v("--warn-mark"),
    crit: v("--crit"),
    critWash: v("--crit-wash"),
    scenario: v("--scenario"),
    cat,
    hist,
    fcRamp,
    diverging,
    band: v("--band"),
    bandInk: v("--band-ink"),
    bandInk2: v("--band-ink-2"),
    shadowPop: v("--shadow-pop"),
  };
  return t;
}

export const FONT = '"IBM Plex Sans", "Helvetica Neue", Arial, system-ui, sans-serif';
export const MONO = '"IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace';

/** Pick a readable label colour (ink or paper) for text drawn on a filled mark (heatmap cell, bar). */
export function onFill(t: Theme, fill: string): string {
  const rgb = parseColor(fill);
  if (!rgb) return t.ink;
  const lum = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * lum(rgb[0]) + 0.7152 * lum(rgb[1]) + 0.0722 * lum(rgb[2]);
  return L > 0.36 ? "#121826" : "#FBFBF9";
}

function parseColor(c: string): [number, number, number] | null {
  const hex = c.trim().match(/^#([0-9a-f]{6})$/i);
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)) as [number, number, number];
  const rgb = c.match(/rgba?\(([^)]+)\)/i);
  if (rgb) {
    const p = rgb[1].split(",").map((x) => parseFloat(x));
    return [p[0], p[1], p[2]];
  }
  return null;
}

/** "Nice" axis maximum: the smallest 1 / 1.2 / 1.6 / 2 / 2.4 / 3 / 4 / 5 / 6 / 8 x 10^k at or above v. */
export function niceMax(v: number): number {
  if (!(v > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  // steps whose quarter is a round number (the axis always shows 4 intervals)
  for (const k of [1, 1.2, 1.6, 2, 2.4, 3, 4, 5, 6, 8, 10]) if (k * p >= v - 1e-9) return k * p;
  return 10 * p;
}

/** Compact axis tick: "0", "150K", "$12M" (never decimals on ticks unless needed). */
export function axisTick(v: number, usd = false): string {
  if (v === 0) return "0";
  const a = Math.abs(v);
  const s = a >= 1e9 ? `${trim(v / 1e9)}B` : a >= 1e6 ? `${trim(v / 1e6)}M` : a >= 1e3 ? `${trim(v / 1e3)}K` : trim(v);
  return `${usd ? "$" : ""}${s}`.replace("-", "−");
}
function trim(x: number): string {
  const r = Math.round(x * 100) / 100;
  return Number.isInteger(r) ? String(r) : r.toFixed(Math.abs(r * 10 - Math.round(r * 10)) < 1e-9 ? 1 : 2);
}

// ---------------------------------------------------------------------------------------------------
// Axis, grid and tooltip conventions shared by every chart type (bars, heatmaps, waterfalls, lines).
// ---------------------------------------------------------------------------------------------------

/** Category axis: 1px rule-strong baseline, no gridlines, ink-3 labels. */
export function categoryAxis(t: Theme, data: (string | number)[], extra: Record<string, unknown> = {}) {
  return {
    type: "category" as const,
    data,
    axisLine: { show: true, lineStyle: { color: t.ruleStrong } },
    axisTick: { show: false },
    axisLabel: { color: t.ink3, fontFamily: FONT, fontSize: 11.5, margin: 9 },
    splitLine: { show: false },
    ...extra,
  };
}

/** Value axis: zero baseline for volumes, 4 intervals to a nice max, compact labels. */
export function valueAxis(t: Theme, opts: { max?: number; min?: number; usd?: boolean; percent?: boolean; name?: string } = {}) {
  return {
    type: "value" as const,
    min: opts.min ?? 0,
    ...(opts.max !== undefined ? { max: opts.max, interval: (opts.max - (opts.min ?? 0)) / 4 } : {}),
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: {
      color: t.ink3,
      fontFamily: FONT,
      fontSize: 11.5,
      formatter: (v: number) => (opts.percent ? `${Math.round(v * 100) < 0 ? "\u2212" : ""}${Math.abs(Math.round(v * 100))}%` : axisTick(v, opts.usd)),
    },
    splitLine: { lineStyle: { color: t.grid, width: 1, type: "solid" as const } },
  };
}

/** Standard grid: room for y labels on the left; 92px on the right where end labels go. */
export function gridStd(narrow = false, extra: Record<string, unknown> = {}) {
  return narrow ? { left: 34, right: 58, top: 30, bottom: 30, ...extra } : { left: 46, right: 92, top: 30, bottom: 30, ...extra };
}

/** Floating tooltip surface (raised, 1px rule border, 8px radius, --shadow-pop).  Use with ttHead/ttRow. */
export function tooltipStyle(t: Theme) {
  return {
    confine: true,
    transitionDuration: 0,
    backgroundColor: t.raised,
    borderColor: t.rule,
    borderWidth: 1,
    padding: [10, 12],
    textStyle: { color: t.ink2, fontFamily: FONT, fontSize: 12 },
    extraCssText: `box-shadow:${t.shadowPop};border-radius:8px;`,
  };
}

/** Axis-trigger tooltip with the 1px ink-3 crosshair that snaps to the category. */
export function axisTooltip(t: Theme, formatter: (items: TooltipItem[]) => string) {
  return {
    trigger: "axis" as const,
    axisPointer: { type: "line" as const, lineStyle: { color: t.ink3, width: 1, type: "solid" as const }, label: { show: false } },
    ...tooltipStyle(t),
    formatter: (p: TooltipItem | TooltipItem[]) => formatter(Array.isArray(p) ? p : [p]),
  };
}

export interface TooltipItem {
  seriesName: string;
  seriesIndex: number;
  dataIndex: number;
  axisValue?: string;
  name: string;
  value: unknown;
  data: unknown;
  color?: string;
}

/** Escape a label before it goes into tooltip HTML (labels come from data files). */
export function esc(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

/** Tooltip header: the month / category in 600, plus a tag on the right ("Actual" in ink-3 or
 *  "Forecast" in accent-text).  Opens the `.tt` wrapper: close it with ttEnd(). */
export function ttHead(title: string, tag?: "actual" | "forecast" | string): string {
  const t = tag === "actual" ? `<em>Actual</em>` : tag === "forecast" ? `<em class="f">Forecast</em>` : tag ? `<em>${esc(tag)}</em>` : "";
  return `<div class="tt"><div class="tt-h"><span>${esc(title)}</span>${t}</div>`;
}
export const ttEnd = (): string => "</div>";

/** A tooltip row: short line key in the series colour, VALUE first (600, tabular), then the label.
 *  `kind`: "line" (default), "dash" (another forecast / benchmark), or "box" (an area such as lost sales). */
export function ttRow(color: string, label: string, value: string, dashed: boolean | "line" | "dash" | "box" = false): string {
  const kind = dashed === true ? "dash" : dashed === false ? "line" : dashed;
  const key = kind === "box" ? `<i class="bx" style="background:${color}"></i>` : `<i class="${kind === "dash" ? "d" : ""}" style="border-color:${color}"></i>`;
  return `<div class="tt-r">${key}<b>${esc(value)}</b><span>${esc(label)}</span></div>`;
}
/** A muted note line inside a tooltip. */
export const ttNote = (text: string): string => `<div class="tt-note">${esc(text)}</div>`;

/** Base option every chart starts from: Plex Sans, no first-paint animation, 300ms updates. */
export function baseOption(t: Theme) {
  return {
    animation: false,
    animationDurationUpdate: 300,
    textStyle: { fontFamily: FONT, color: t.ink3, fontSize: 11.5 },
    aria: { enabled: true, decal: { show: false } },
  };
}

/** Bar mark: at most 24px thick, 2px data-end radius, square baseline (pass horizontal for hbar). */
export function barStyle(color: string, horizontal = false) {
  return { color, borderRadius: horizontal ? [0, 2, 2, 0] : [2, 2, 0, 0] };
}
export const BAR_MAX = 24;

/** A numeric scale legend for heatmaps: horizontal, the end values printed, the poles named in words.
 *  `colors` is a ramp (t.hist / t.fcRamp) or the diverging ramp (t.diverging) for signed values. */
export function scaleLegend(
  t: Theme,
  o: { min: number; max: number; colors: string[]; format: (v: number) => string; low?: string; high?: string; dimension?: number },
) {
  return {
    type: "continuous" as const,
    min: o.min,
    max: o.max,
    dimension: o.dimension ?? 2,
    calculable: false,
    orient: "horizontal" as const,
    left: "center",
    bottom: 0,
    itemWidth: 10,
    itemHeight: 160,
    inRange: { color: o.colors },
    text: [`${o.format(o.max)}${o.high ? ` ${o.high}` : ""}`, `${o.low ? `${o.low} ` : ""}${o.format(o.min)}`],
    textGap: 8,
    textStyle: { color: t.ink3, fontFamily: FONT, fontSize: 11.5 },
  };
}

