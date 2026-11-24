// Chart theme: every colour is read from the CSS custom properties in src/styles/tokens.css at render
// time, so one token set drives HTML and canvas and the theme toggle re-renders charts in the selected
// palette.  The rule: INK IS THE PAST, COBALT IS THE FUTURE.  See docs/design_system.md, "Chart conventions".
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
  // cobalt: the forecast
  accent: string;
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
   *  Cobalt is reserved for the forecast and is deliberately NOT in this array. */
  cat: string[];
  /** Sequential slate, 7 steps, for history magnitudes ([0] = near zero). */
  slate: string[];
  /** Sequential cobalt, 7 steps, for forecast magnitudes ([0] = near zero). */
  cobalt: string[];
  /** Diverging, 9 steps: [0] strong steel (negative pole) .. [4] neutral .. [8] strong rust (positive pole). */
  diverging: string[];
  shadowPop: string;

  // ---- DEPRECATED aliases for views not yet restyled (do not use in new code) ----
  surface: string; // = paper
  page: string; // = paper
  muted: string; // = ink3
  axis: string; // = ruleStrong
  history: string; // = ink
  demand: string; // = ink
  forecast: string; // = accent
  forecastBand: string; // = accentBand
  forecastP50: string; // = accentEdge
  baseline: string; // = ink3
  zone: string; // = accentWash
  seq: string[]; // 13-step slate (old index range 0..12)
  div: string[]; // 7-step diverging, [0] negative .. [3] neutral .. [6] positive
  error: string; // data-error anomaly = cat[1] rust
  event: string; // real-event anomaly = cat[0] teal
  tooltipBg: string;
  tooltipBorder: string;
  warning: string;
  serious: string;
  critical: string;
}

/** Fallback values (the light theme) used when CSS variables are unavailable (tests, first paint). */
const FALLBACK: Record<string, string> = {
  "--paper": "#FBFBF9", "--rail": "#F3F4F6", "--raised": "#FFFFFF", "--hover": "#ECEEF2",
  "--ink": "#121826", "--ink-2": "#3D4556", "--ink-3": "#5E6678", "--ink-4": "#8A91A0",
  "--rule": "#E4E6EA", "--rule-strong": "#C9CED6", "--grid": "#E9EBEF",
  "--accent": "#2B4BD6", "--accent-text": "#2B4BD6", "--accent-strong": "#1F38A8", "--accent-wash": "#F2F5FE",
  "--accent-band": "rgba(43, 75, 214, 0.20)", "--accent-edge": "rgba(43, 75, 214, 0.50)", "--accent-tint": "#B9C6F2",
  "--loss": "#B4501E", "--loss-fill": "rgba(205, 104, 48, 0.30)", "--good": "#1A7F37", "--good-wash": "#E7F4EB",
  "--warn": "#8A5A00", "--warn-wash": "#FBF1DA", "--warn-mark": "#D99A06", "--crit": "#B42318", "--crit-wash": "#FCEBE9",
  "--scenario": "#B26B00",
  "--cat-1": "#008A7C", "--cat-2": "#C8502A", "--cat-3": "#6D5BD0", "--cat-4": "#4E8A2E", "--cat-5": "#9C4A9A", "--cat-6": "#C27C0E", "--cat-7": "#D0638B", "--cat-other": "#8A91A0",
  "--slate-1": "#F1F3F8", "--slate-2": "#CBCFD8", "--slate-3": "#A5ACB8", "--slate-4": "#828A9A", "--slate-5": "#5F6A7C", "--slate-6": "#3F4B60", "--slate-7": "#212E45",
  "--cobalt-1": "#E8F0FF", "--cobalt-2": "#C0D0F3", "--cobalt-3": "#98AFE4", "--cobalt-4": "#728FD4", "--cobalt-5": "#4E6FC3", "--cobalt-6": "#2C4EB1", "--cobalt-7": "#10289E",
  "--div-1": "#005C8A", "--div-2": "#528AAE", "--div-3": "#97BAD1", "--div-4": "#DCEAF4", "--div-5": "#EEF0F2", "--div-6": "#FBE2D9", "--div-7": "#E1AB97", "--div-8": "#C57556", "--div-9": "#A63D02",
  "--shadow-pop": "0 1px 2px rgba(18,24,38,.06), 0 10px 28px rgba(18,24,38,.12)",
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
  const slate = [1, 2, 3, 4, 5, 6, 7].map((i) => v(`--slate-${i}`));
  const cobalt = [1, 2, 3, 4, 5, 6, 7].map((i) => v(`--cobalt-${i}`));
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
    slate,
    cobalt,
    diverging,
    shadowPop: v("--shadow-pop"),
  };
  return {
    ...t,
    surface: t.paper,
    page: t.paper,
    muted: t.ink3,
    axis: t.ruleStrong,
    history: t.ink,
    demand: t.ink,
    forecast: t.accent,
    forecastBand: t.accentBand,
    forecastP50: t.accentEdge,
    baseline: t.ink3,
    zone: t.accentWash,
    seq: Array.from({ length: 13 }, (_, k) => slate[Math.round((k * 6) / 12)]),
    div: [diverging[0], diverging[1], diverging[2], diverging[4], diverging[6], diverging[7], diverging[8]],
    error: cat[1],
    event: cat[0],
    tooltipBg: t.raised,
    tooltipBorder: t.rule,
    warning: t.warnMark,
    serious: t.loss,
    critical: t.crit,
  };
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

/** Value-axis styling: no axis line, no ticks, solid 1px gridlines, compact ink-3 labels.
 *  (Legacy signature kept: spread it into a value OR category axis.) */
export function axisStyle(t: Theme) {
  return {
    axisLine: { show: false, lineStyle: { color: t.ruleStrong } },
    axisTick: { show: false },
    axisLabel: { color: t.ink3, fontFamily: FONT, fontSize: 11.5 },
    splitLine: { lineStyle: { color: t.grid, width: 1, type: "solid" as const } },
  };
}

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
      formatter: (v: number) => (opts.percent ? `${Math.round(v * 100)}%` : axisTick(v, opts.usd)),
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
