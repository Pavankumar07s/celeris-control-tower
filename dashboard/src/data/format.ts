// Number formatting: units in full below 10,000 and compact above; USD always with a currency sign.
import type { Measure } from "./model";

const full = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const one = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1, minimumFractionDigits: 1 });

export function compact(x: number, digits = 1): string {
  const a = Math.abs(x);
  if (a >= 1e9) return `${(x / 1e9).toFixed(digits)}B`;
  if (a >= 1e6) return `${(x / 1e6).toFixed(digits)}M`;
  if (a >= 1e4) return `${(x / 1e3).toFixed(a >= 1e5 ? 0 : digits)}K`;
  return full.format(x);
}

export const fmtInt = (x: number): string => (Number.isFinite(x) ? full.format(Math.round(x)) : "–");
export const fmt1 = (x: number): string => (Number.isFinite(x) ? one.format(x) : "–");
export const fmtUsd = (x: number, digits = 1): string => (Number.isFinite(x) ? `$${compact(x, digits)}` : "–");
export const fmtPct = (x: number, digits = 1): string => (Number.isFinite(x) ? `${(x * 100).toFixed(digits)}%` : "–");
export const fmtSignedPct = (x: number, digits = 1): string =>
  Number.isFinite(x) ? `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(digits)}%` : "–";
export const fmtPts = (x: number, digits = 1): string => (Number.isFinite(x) ? `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(digits)} pts` : "–");

/** A value in the active measure: units compact, or USD. */
export function fmtMeasure(x: number, measure: Measure, digits = 1): string {
  return measure === "usd" ? fmtUsd(x, digits) : compact(x, digits);
}

export function monthName(label: string): string {
  const [y, m] = label.split("-").map(Number);
  return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]} ${y}`;
}
