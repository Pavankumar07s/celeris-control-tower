// The headline engine: deterministic templates that write each view's headline, standfirst and module
// titles from facts computed for the current selection.  No language model, no typed number: a template
// is a condition plus two sentence builders, the conclusion and a descriptive FALLBACK used when the
// condition does not hold.  Strings may carry **bold** markers (rendered by <Rich/>).
// Voice: active, plain, one claim per sentence, no adjective the data cannot support.
import type { Filters, Model } from "../data/model";
import { fmtPctAbs } from "../data/format";

// ---- the template contract --------------------------------------------------------------------------
export interface Template<F> {
  /** Stable id (used in tests and the docs). */
  id: string;
  /** When false (or throws), the fallback is used.  Omit for an unconditional template. */
  when?: (f: F) => boolean;
  /** The conclusion sentence. */
  text: (f: F) => string;
  /** The descriptive sentence used when `when` fails. */
  fallback: (f: F) => string;
}

export interface Rendered {
  id: string;
  text: string;
  /** True when the fallback was used. */
  fallback: boolean;
}

/** Render one template against its facts.  Never throws: a failing builder falls back. */
export function render<F>(t: Template<F>, f: F): Rendered {
  try {
    if (!t.when || t.when(f)) return { id: t.id, text: t.text(f), fallback: false };
  } catch {
    /* fall through to the descriptive title */
  }
  return { id: t.id, text: t.fallback(f), fallback: true };
}

/** Try several templates in order: the first whose condition holds wins; if none holds, the LAST
 *  template's fallback is used.  Use it for conclusion variants ("drives a third of" / "every region grows"). */
export function renderFirst<F>(ts: Template<F>[], f: F): Rendered {
  for (const t of ts) {
    const r = render(t, f);
    if (!r.fallback) return r;
  }
  const last = ts[ts.length - 1];
  return { id: last.id, text: last.fallback(f), fallback: true };
}

/** Render a record of templates against the same facts: { headline: "...", standfirst: "..." }. */
export function renderAll<F, K extends string>(ts: Record<K, Template<F>>, f: F): Record<K, string> {
  const out = {} as Record<K, string>;
  for (const k of Object.keys(ts) as K[]) out[k] = render(ts[k], f).text;
  return out;
}

// ---- vocabulary -----------------------------------------------------------------------------------------
/** Verb for a relative change (thresholds: <1 % holds steady, 1-5 % eases / edges up, 5-15 % falls /
 *  grows, >15 % drops sharply / surges). */
export function changeVerb(chg: number): string {
  const a = Math.abs(chg);
  if (!Number.isFinite(chg) || a < 0.01) return "holds steady";
  if (a < 0.05) return chg < 0 ? "eases" : "edges up";
  if (a < 0.15) return chg < 0 ? "falls" : "grows";
  return chg < 0 ? "drops sharply" : "surges";
}
/** Verb + magnitude: "eases 3.2%", "holds steady" (no number under 1 %, the verb says it). */
export function changePhrase(chg: number, digits = 1): string {
  const v = changeVerb(chg);
  return v === "holds steady" ? v : `${v} ${fmtPctAbs(chg, digits)}`;
}
/** Noun for the direction of a total change: "dip" / "growth". */
export const changeNoun = (chg: number): string => (chg < 0 ? "dip" : "growth");
/** above / below. */
export const side = (chg: number): string => (chg < 0 ? "below" : "above");

/** A share in words: "half", "a third", "a quarter", "two thirds", "three quarters", else "41%". */
export function fractionWord(share: number): string {
  const s = Math.abs(share);
  const near = (x: number, tol = 0.035) => Math.abs(s - x) <= tol;
  if (near(1 / 2)) return "half";
  if (near(1 / 3)) return "a third";
  if (near(1 / 4, 0.025)) return "a quarter";
  if (near(2 / 3)) return "two thirds";
  if (near(3 / 4, 0.025)) return "three quarters";
  if (near(1 / 5, 0.02)) return "a fifth";
  return `${Math.round(s * 100)}%`;
}

/** Number words for small counts in prose ("Five series", "seven families"). */
export function countWord(n: number, capital = false): string {
  const w = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"][n] ?? n.toLocaleString("en-US");
  return capital ? w.charAt(0).toUpperCase() + w.slice(1) : w;
}

/** "a, b and c". */
export function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** Upper-case the first character (templates start with a variable subject). */
export const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** Plural helper: plural(3, "series", "series"), plural(1, "family", "families"). */
export const plural = (n: number, one: string, many: string = `${one}s`): string => (n === 1 ? one : many);

// ---- the selection, in words ------------------------------------------------------------------------------
export interface SelectionWords {
  /** "" when nothing is filtered, else "Hydraulic Systems in Europe" / "HYD-004 in Europe". */
  name: string;
  /** Subject for a headline: "Demand" or "Demand for Hydraulic Systems in Europe". */
  demandSubject: string;
  /** True when no filter is set. */
  all: boolean;
  /** Dimensions fixed by the filters. */
  fixed: { family: boolean; sku: boolean; region: boolean; channel: boolean; customer: boolean };
}

/** Describe the active filters for prose: family or SKU, then "in" region, "through" channel, "at" customer. */
export function selectionWords(m: Model, f: Filters): SelectionWords {
  const d = m.dims;
  // each part carries its preposition; the first part drops it in `name`
  const parts: [string, string][] = [];
  if (f.sku !== null) parts.push(["for", d.skus.id[f.sku]]);
  else if (f.family !== null) parts.push(["for", d.families.name[f.family]]);
  if (f.region !== null) parts.push(["in", d.regions[f.region]]);
  if (f.channel !== null) parts.push(["through", d.channels[f.channel]]);
  if (f.customer !== null) parts.push(["from", d.customers[f.customer]]);
  const name = parts.map(([p, w], i) => (i === 0 ? w : `${p} ${w}`)).join(" ");
  const all = parts.length === 0;
  return {
    name,
    demandSubject: all ? "Demand" : `Demand ${parts.map(([p, w]) => `${p} ${w}`).join(" ")}`,
    all,
    fixed: { family: f.family !== null, sku: f.sku !== null, region: f.region !== null, channel: f.channel !== null, customer: f.customer !== null },
  };
}
