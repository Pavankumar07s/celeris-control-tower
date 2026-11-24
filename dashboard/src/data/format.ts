// Number, percentage and month formatting.  The copy rules (docs/design_system.md, "Number formats"):
//  - in full under 10,000 (6,961); one decimal from 10K to 100K (51.4K); none from 100K up (161K);
//  - millions and billions with two decimals in figures (2.79M, $2.35B), one in prose where context allows;
//  - a true minus sign (U+2212), never a hyphen; thin units ("2.79M units", "$2.35B");
//  - months "Oct 2026" in charts and tables, "October 2026" in serif prose, never ISO in reading text.
import type { Measure } from "./model";

const full = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const one = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
export const MINUS = "−";
const neg = (s: string) => s.replace(/^-/, MINUS);

/** Legacy compact: M/B with `digits` decimals (default 1), K with one decimal under 100K. */
export function compact(x: number, digits = 1): string {
  if (!Number.isFinite(x)) return "–";
  const a = Math.abs(x);
  if (a >= 1e9) return neg(`${(x / 1e9).toFixed(digits)}B`);
  if (a >= 1e6) return neg(`${(x / 1e6).toFixed(digits)}M`);
  if (a >= 1e4) return neg(`${(x / 1e3).toFixed(a >= 1e5 ? 0 : digits)}K`);
  return neg(full.format(Math.round(x)));
}

/** Figure-grade compact number: 6,961 · 51.4K · 161K · 2.79M · 2.35B (M/B decimals overridable). */
export function fmtNum(x: number, mbDigits = 2): string {
  if (!Number.isFinite(x)) return "–";
  const a = Math.abs(x);
  if (a >= 1e9) return neg(`${(x / 1e9).toFixed(mbDigits)}B`);
  if (a >= 1e6) return neg(`${(x / 1e6).toFixed(mbDigits)}M`);
  if (a >= 1e5) return neg(`${Math.round(x / 1e3)}K`);
  if (a >= 1e4) return neg(`${(x / 1e3).toFixed(1)}K`);
  return neg(full.format(Math.round(x)));
}
/** Money in the same compact grammar: $6,961 · $51.4K · $2.35B; negative as −$1.2M. */
export function fmtMoney(x: number, mbDigits = 2): string {
  if (!Number.isFinite(x)) return "–";
  return `${x < 0 ? MINUS : ""}$${fmtNum(Math.abs(x), mbDigits)}`;
}
/** A value in the active measure, figure grade ("2.79M" or "$2.35B"). */
export function fmtValue(x: number, measure: Measure, mbDigits = 2): string {
  return measure === "usd" ? fmtMoney(x, mbDigits) : fmtNum(x, mbDigits);
}
/** Value with its unit for prose: "2.79M units" or "$2.35B". */
export function fmtValueUnit(x: number, measure: Measure, mbDigits = 2): string {
  return measure === "usd" ? fmtMoney(x, mbDigits) : `${fmtNum(x, mbDigits)}\u00a0units`;
}
/** Signed compact: "+1.2K", "−11.0K", "+$3.4M". */
export function fmtSigned(x: number, measure: Measure = "units", mbDigits = 2): string {
  if (!Number.isFinite(x)) return "–";
  const s = measure === "usd" ? `$${fmtNum(Math.abs(x), mbDigits)}` : fmtNum(Math.abs(x), mbDigits);
  return `${x > 0 ? "+" : x < 0 ? MINUS : ""}${s}`;
}

export const fmtInt = (x: number): string => (Number.isFinite(x) ? neg(full.format(Math.round(x))) : "–");
export const fmt1 = (x: number): string => (Number.isFinite(x) ? neg(one.format(x)) : "–");
export const fmtUsd = (x: number, digits = 1): string => (Number.isFinite(x) ? `${x < 0 ? MINUS : ""}$${compact(Math.abs(x), digits)}` : "–");
export const fmtPct = (x: number, digits = 1): string => (Number.isFinite(x) ? neg(`${(x * 100).toFixed(digits)}%`) : "–");
/** Absolute percentage without sign: 0.032 -> "3.2%". */
export const fmtPctAbs = (x: number, digits = 1): string => (Number.isFinite(x) ? `${Math.abs(x * 100).toFixed(digits)}%` : "–");
export const fmtSignedPct = (x: number, digits = 1): string =>
  Number.isFinite(x) ? `${x > 0 ? "+" : x < 0 ? MINUS : ""}${Math.abs(x * 100).toFixed(digits)}%` : "–";
export const fmtPts = (x: number, digits = 1): string => (Number.isFinite(x) ? `${x > 0 ? "+" : x < 0 ? MINUS : ""}${Math.abs(x * 100).toFixed(digits)} pts` : "–");

/** Legacy: a value in the active measure (units compact, or USD). */
export function fmtMeasure(x: number, measure: Measure, digits = 1): string {
  return measure === "usd" ? fmtUsd(x, digits) : compact(x, digits);
}

// ---- months ---------------------------------------------------------------------------------------
export const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const ym = (label: string): [number, number] => {
  const [y, m] = label.split("-").map(Number);
  return [y, m];
};
/** "2026-10" -> "Oct 2026" (charts, tables). */
export function monthName(label: string): string {
  const [y, m] = ym(label);
  return `${MONTHS_SHORT[m - 1]} ${y}`;
}
export const monthShort = monthName;
/** "2026-10" -> "October 2026" (serif prose). */
export function monthLong(label: string): string {
  const [y, m] = ym(label);
  return `${MONTHS_LONG[m - 1]} ${y}`;
}
/** "2026-10" -> "Oct" / "October". */
export const monthOnly = (label: string, long = false): string => (long ? MONTHS_LONG : MONTHS_SHORT)[ym(label)[1] - 1];
/** Span of two month labels: "Mar–May 2023", "Dec 2026 – Feb 2027", or one month. */
export function monthSpan(a: string, b: string): string {
  if (a === b) return monthName(a);
  const [ya, ma] = ym(a);
  const [yb, mb] = ym(b);
  return ya === yb ? `${MONTHS_SHORT[ma - 1]}–${MONTHS_SHORT[mb - 1]} ${yb}` : `${monthName(a)} – ${monthName(b)}`;
}
/** Year span of two month labels: "2021–22", "2023". */
export function yearSpan(a: string, b: string): string {
  const ya = ym(a)[0];
  const yb = ym(b)[0];
  return ya === yb ? `${ya}` : `${ya}–${String(yb).slice(Math.floor(ya / 100) === Math.floor(yb / 100) ? 2 : 0)}`;
}
