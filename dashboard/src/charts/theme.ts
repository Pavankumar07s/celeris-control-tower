// Colour tokens for charts, light and dark (validated reference palette of the dataviz method).
// Colour carries meaning: neutral ink = history, orange = unconstrained demand, blue = forecast, violet = scenario.
export type ThemeName = "light" | "dark";

export interface Theme {
  name: ThemeName;
  surface: string;
  page: string;
  ink: string;
  ink2: string;
  muted: string;
  grid: string;
  axis: string;
  cat: string[]; // categorical slots 1..8, fixed order
  history: string;
  demand: string;
  forecast: string;
  forecastBand: string;
  forecastP50: string;
  scenario: string;
  baseline: string;
  zone: string; // forecast-zone tint
  seq: string[]; // sequential blue, light -> dark (dark: reversed anchor)
  div: string[]; // diverging blue <- gray -> red
  good: string;
  warning: string;
  serious: string;
  critical: string;
  error: string; // data-error anomaly marks
  event: string; // real-event anomaly marks
  tooltipBg: string;
  tooltipBorder: string;
}

const SEQ = ["#cde2fb", "#b7d3f6", "#9ec5f4", "#86b6ef", "#6da7ec", "#5598e7", "#3987e5", "#2a78d6", "#256abf", "#1c5cab", "#184f95", "#104281", "#0d366b"];

export const LIGHT: Theme = {
  name: "light",
  surface: "#fcfcfb",
  page: "#f6f6f3",
  ink: "#0b0b0b",
  ink2: "#52514e",
  muted: "#898781",
  grid: "#e1e0d9",
  axis: "#c3c2b7",
  cat: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"],
  history: "#52514e",
  demand: "#eb6834",
  forecast: "#2a78d6",
  forecastBand: "rgba(42,120,214,0.24)",
  forecastP50: "#184f95",
  scenario: "#6250d6",
  baseline: "#1baf7a",
  zone: "rgba(42,120,214,0.03)",
  seq: SEQ,
  div: ["#184f95", "#5598e7", "#b7d3f6", "#f0efec", "#f5b8b7", "#e34948", "#a32a29"],
  good: "#0ca30c",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b",
  error: "#e34948",
  event: "#6250d6",
  tooltipBg: "#ffffff",
  tooltipBorder: "rgba(11,11,11,0.10)",
};

export const DARK: Theme = {
  name: "dark",
  surface: "#1a1a19",
  page: "#0d0d0d",
  ink: "#f0efec",
  ink2: "#c3c2b7",
  muted: "#898781",
  grid: "#2c2c2a",
  axis: "#383835",
  cat: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#0ca30c", "#9085e9", "#e66767"],
  history: "#c3c2b7",
  demand: "#d95926",
  forecast: "#3987e5",
  forecastBand: "rgba(57,135,229,0.30)",
  forecastP50: "#9ec5f4",
  scenario: "#9085e9",
  baseline: "#199e70",
  zone: "rgba(57,135,229,0.04)",
  seq: [...SEQ].reverse(),
  div: ["#86b6ef", "#3987e5", "#1c5cab", "#383835", "#a32a29", "#e66767", "#f5b8b7"],
  good: "#0ca30c",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b",
  error: "#e66767",
  event: "#9085e9",
  tooltipBg: "#242423",
  tooltipBorder: "rgba(255,255,255,0.10)",
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** Shared chart chrome: recessive axes and grid, tooltip styled as an HTML card. */
export function axisStyle(t: Theme) {
  return {
    axisLine: { lineStyle: { color: t.axis } },
    axisTick: { show: false },
    axisLabel: { color: t.muted, fontFamily: FONT, fontSize: 11 },
    splitLine: { lineStyle: { color: t.grid, width: 1 } },
  };
}

export function tooltipStyle(t: Theme) {
  return {
    backgroundColor: t.tooltipBg,
    borderColor: t.tooltipBorder,
    borderWidth: 1,
    padding: [8, 10],
    textStyle: { color: t.ink, fontFamily: FONT, fontSize: 12 },
    extraCssText: "box-shadow: 0 4px 16px rgba(0,0,0,0.12); border-radius: 8px;",
  };
}

/** Escape a label before it goes into tooltip HTML (labels come from data files). */
export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

/** A tooltip row: short line key in the series colour, value strong, label secondary. */
export function ttRow(color: string, label: string, value: string, dashed = false): string {
  const key = `<span style="display:inline-block;width:14px;height:0;border-top:2px ${dashed ? "dashed" : "solid"} ${color};margin-right:6px;vertical-align:middle"></span>`;
  return `<div style="display:flex;justify-content:space-between;gap:14px;line-height:1.6"><span style="color:inherit;opacity:.72">${key}${esc(label)}</span><b style="font-variant-numeric:tabular-nums">${esc(value)}</b></div>`;
}
