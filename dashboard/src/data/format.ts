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
  // a value that prints as zero carries no sign ("0", never "−0")
  return `${/^\$?0$/.test(s) ? "" : x > 0 ? "+" : x < 0 ? MINUS : ""}${s}`;
}

export const fmtInt = (x: number): string => (Number.isFinite(x) ? neg(full.format(Math.round(x))) : "–");
/** A value on its column's scale, so one column never mixes "14.3K" with "9,479": K with one decimal when the
 *  column's largest magnitude is 10,000 or more, M with two decimals from a million, else in full.  `signed`
 *  prints "+" / "−" (no sign on a value that prints as zero); USD adds "$". */
export function fmtOnScale(x: number, colMax: number, measure: Measure = "units", signed = false): string {
  if (!Number.isFinite(x)) return "–";
  const a = Math.abs(colMax);
  const [div, suffix, d] = a >= 1e6 ? [1e6, "M", 2] : a >= 1e4 ? [1e3, "K", 1] : [1, "", 0];
  const body = div === 1 ? full.format(Math.round(Math.abs(x))) : `${(Math.abs(x) / div).toFixed(d)}${suffix}`;
  // a value that prints as zero is "0", without sign or suffix
  if (Number((Math.abs(x) / div).toFixed(d)) === 0) return measure === "usd" ? "$0" : "0";
  const sign = x < 0 ? MINUS : signed ? "+" : "";
  return `${sign}${measure === "usd" ? "$" : ""}${body}`;
}
/** Fixed decimals with a true minus (correlations, coefficients, ratios): fmtFixed(-0.651, 2) -> "−0.65". */
export const fmtFixed = (x: number, digits: number): string => (Number.isFinite(x) ? neg(x.toFixed(digits)).replace(/^−(0\.?0*)$/, "$1") : "–");
export const fmt1 = (x: number): string => (Number.isFinite(x) ? neg(one.format(x)) : "–");
export const fmtPct = (x: number, digits = 1): string => (Number.isFinite(x) ? neg(`${(x * 100).toFixed(digits)}%`) : "–");
/** Absolute percentage without sign: 0.032 -> "3.2%". */
export const fmtPctAbs = (x: number, digits = 1): string => (Number.isFinite(x) ? `${Math.abs(x * 100).toFixed(digits)}%` : "–");
/** Sign of a value as printed at `digits` decimals: a value that rounds to zero carries no sign ("0.0%", never "−0.0%"). */
const signOf = (x: number, digits: number): string => (Math.round(Math.abs(x) * 10 ** digits) === 0 ? "" : x > 0 ? "+" : MINUS);
export const fmtSignedPct = (x: number, digits = 1): string => (Number.isFinite(x) ? `${signOf(x * 100, digits)}${Math.abs(x * 100).toFixed(digits)}%` : "–");
export const fmtPts = (x: number, digits = 1): string => (Number.isFinite(x) ? `${signOf(x * 100, digits)}${Math.abs(x * 100).toFixed(digits)} pts` : "–");
/** File size in decimal units, as file managers show it: "1.21 MB", "71.2 kB", "512 B". */
export function fmtBytes(n: number): string {
  if (!Number.isFinite(n)) return "–";
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)} MB`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)} kB`;
  return `${Math.round(n)} B`;
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
