// Stock-outs & lost sales copy: facts over the stock-out cells of the selection and the deterministic
// templates for the headline, standfirst and module titles.
import { fmtInt, fmtMoney, fmtNum, fmtPct, monthLong, yearSpan } from "../data/format";
import type { Measure, Model } from "../data/model";
import type { StockoutFile } from "../data/types";
import { cap, type Template } from "./headlines";

export interface Share {
  label: string;
  idx: number;
  v: number;
  u: number;
  usd: number;
}
export interface StockoutFacts {
  name: string;
  measure: Measure;
  familyFixed: boolean;
  lostU: number;
  lostUsd: number;
  lost: number; // in the measure
  bo: number; // back-ordered units
  demand: number; // unconstrained demand of the selection's history, in the measure
  byYear: Share[];
  byFamily: Share[];
  byRegion: Share[];
  byReason: Share[];
  /** Two consecutive years holding the most lost sales. */
  peakSpan: { a: string; b: string; share: number } | null;
  /** Mean lost per full year after the peak span (in the measure), and the first and last such years. */
  after: { from: string; to: string; avg: number } | null;
  first: string;
  last: string;
}

export function stockoutFacts(m: Model, so: StockoutFile, keep: number[], measure: Measure, familyFixed: boolean, name: string, demand: number): StockoutFacts {
  const c = so.cells;
  const usd = measure === "usd";
  const add = (map: Map<string, Share>, label: string, idx: number, i: number) => {
    const cur = map.get(label) ?? { label, idx, v: 0, u: 0, usd: 0 };
    cur.u += c.lost[i];
    cur.usd += c.lost_usd[i];
    cur.v = usd ? cur.usd : cur.u;
    map.set(label, cur);
  };
  const Y = new Map<string, Share>();
  const F = new Map<string, Share>();
  const R = new Map<string, Share>();
  const W = new Map<string, Share>();
  let lostU = 0;
  let lostUsd = 0;
  let bo = 0;
  for (const i of keep) {
    bo += c.backorder_out[i] ?? 0;
    if (c.lost[i] <= 0) continue;
    const s = c.series[i];
    lostU += c.lost[i];
    lostUsd += c.lost_usd[i];
    add(Y, m.months[c.month[i]].slice(0, 4), Number(m.months[c.month[i]].slice(0, 4)), i);
    add(F, m.dims.families.name[m.sFamily[s]], m.sFamily[s], i);
    add(R, m.dims.regions[m.sRegion[s]], m.sRegion[s], i);
    add(W, c.reason[i] || "Unknown", 0, i);
  }
  const y0 = Number(m.months[0].slice(0, 4));
  const y1 = Number(m.months[m.asOf].slice(0, 4));
  for (let y = y0; y <= y1; y++) if (!Y.has(String(y))) Y.set(String(y), { label: String(y), idx: y, v: 0, u: 0, usd: 0 });
  const byYear = [...Y.values()].sort((a, b) => a.idx - b.idx);
  const lost = usd ? lostUsd : lostU;
  let peakSpan: StockoutFacts["peakSpan"] = null;
  // the shortest span that tells the story: one year when it holds 60 % or more, else the best two years
  for (const r of byYear) if (lost > 0 && r.v / lost >= 0.6 && (!peakSpan || r.v / lost > peakSpan.share)) peakSpan = { a: r.label, b: r.label, share: r.v / lost };
  if (!peakSpan) for (let k = 0; k + 1 < byYear.length; k++) {
    const v = byYear[k].v + byYear[k + 1].v;
    if (lost > 0 && (!peakSpan || v / lost > peakSpan.share)) peakSpan = { a: byYear[k].label, b: byYear[k + 1].label, share: v / lost };
  }
  let after: StockoutFacts["after"] = null;
  if (peakSpan) {
    // full calendar years after the span (the last year counts only when it is complete)
    const lastFull = m.months[m.asOf].endsWith("-12") ? y1 : y1 - 1;
    const later = byYear.filter((r) => r.idx > Number(peakSpan!.b) && r.idx <= lastFull);
    if (later.length) after = { from: later[0].label, to: later[later.length - 1].label, avg: later.reduce((a, r) => a + r.v, 0) / later.length };
  }
  const desc = (map: Map<string, Share>) => [...map.values()].sort((a, b) => b.v - a.v);
  return {
    name,
    measure,
    familyFixed,
    lostU,
    lostUsd,
    lost,
    bo,
    demand,
    byYear,
    byFamily: desc(F),
    byRegion: desc(R),
    byReason: desc(W),
    peakSpan,
    after,
    first: m.months[0],
    last: m.months[m.asOf],
  };
}

const amount = (f: StockoutFacts, v: number) => (f.measure === "usd" ? fmtMoney(v, 1) : `${fmtInt(v)}\u00a0units`);
const span = (f: StockoutFacts) => (f.peakSpan ? yearSpan(`${f.peakSpan.a}-01`, `${f.peakSpan.b}-01`) : "");
const reasonWord = (r: string) => r.replace(/\s*\(.*\)$/, "").toLowerCase();

/** "; 2023–2025 averaged 3,908 units a year" (the years named), "; 2025 lost 3,991 units", or "; nothing was
 *  lost in 2023–2025" when the average rounds to zero. */
function afterClause(f: StockoutFacts): string {
  const a = f.after;
  if (!a) return "";
  const years = a.from === a.to ? a.from : `${a.from}–${a.to}`;
  const zero = f.measure === "usd" ? a.avg < 50 : a.avg < 0.5;
  if (zero) return `; nothing was lost in ${years}`;
  const v = f.measure === "usd" ? fmtMoney(a.avg, 1) : `${fmtNum(a.avg)} units`;
  return a.from === a.to ? `; ${years} lost ${v}` : `; ${years} averaged ${v} a year`;
}

/** Headline variants tried in order (renderFirst). */
export const STOCKOUT_HEADLINES: Template<StockoutFacts>[] = [
  {
    id: "stockouts.family",
    when: (f) => !f.familyFixed && f.byFamily.length > 1 && f.lost > 0 && f.byFamily[0].v / f.lost >= 0.4,
    text: (f) => `${f.byFamily[0].label} accounts for ${fmtPct(f.byFamily[0].v / f.lost, 0)} of all lost sales`,
    fallback: () => "",
  },
  {
    id: "stockouts.oneYear",
    when: (f) => !!f.peakSpan && f.peakSpan.a === f.peakSpan.b && f.peakSpan.share > 0.999 && f.lost > 0,
    text: (f) => `Every lost sale${f.name ? ` of ${f.name}` : ""} fell in ${(f.peakSpan as { a: string }).a}`,
    fallback: () => "",
  },
  {
    id: "stockouts.period",
    when: (f) => !!f.peakSpan && f.peakSpan.share >= 0.6,
    text: (f) => `${span(f)} holds ${fmtPct((f.peakSpan as { share: number }).share, 0)} of the lost sales${f.name ? ` for ${f.name}` : ""}`,
    fallback: () => "",
  },
  {
    id: "stockouts.reason",
    when: (f) => f.byReason.length > 1 && f.lost > 0 && f.byReason[0].v / f.lost >= 0.5,
    text: (f) => `${cap(reasonWord(f.byReason[0].label))} caused ${fmtPct(f.byReason[0].v / f.lost, 0)} of the lost sales`,
    fallback: (f) => (f.lost > 0 ? `Stock-outs hid ${amount(f, f.lost)} of demand${f.name ? ` for ${f.name}` : ""}` : "No stock-out cost this selection a sale"),
  },
];

export const STOCKOUT_TEMPLATES = {
  standfirst: {
    id: "stockouts.standfirst",
    when: (f) => f.lost > 0,
    text: (f) => {
      const money = f.measure === "usd" ? ` (${fmtInt(f.lostU)} units)` : `, **${fmtMoney(f.lostUsd, 1)}** at the month's invoice price`;
      const share = f.demand > 0 ? `: ${fmtPct(f.lost / f.demand, 2)} of unconstrained demand` : "";
      const bo = f.bo > 0 ? ` Another **${fmtInt(f.bo)} units** were back-ordered and shipped a month late.` : "";
      const when = f.peakSpan && f.peakSpan.share >= 0.5 ? ` ${fmtPct(f.peakSpan.share, 0)} of the loss fell in ${span(f)}${f.byReason[0] && f.byReason[0].v / f.lost >= 0.5 ? `, mostly to ${reasonWord(f.byReason[0].label)}` : ""}${afterClause(f)}.` : "";
      return `**${amount(f, f.lost)}** of demand never shipped between ${monthLong(f.first)} and ${monthLong(f.last)}${money}${share}.${bo}${when}`;
    },
    fallback: (f) => (f.bo > 0 ? `No demand was lost in this selection; ${fmtInt(f.bo)} units were back-ordered and shipped a month late.` : "No stock-out touched this selection: shipments equal unconstrained demand in every month."),
  },
} satisfies Record<string, Template<StockoutFacts>>;

/** Title of a breakdown tab: "Electrical Assemblies lost the most: $91.5M, 83% of the total". */
export function breakdownTitle(f: StockoutFacts, rows: Share[], dim: string): string {
  if (!rows.length || f.lost <= 0) return `Lost sales by ${dim}`;
  const top = rows.reduce((a, r) => (r.v > a.v ? r : a), rows[0]);
  if (rows.filter((r) => r.v > 0).length < 2) return `All lost sales of this selection fall in one ${dim}: ${top.label}`;
  return dim === "reason" ? `${cap(reasonWord(top.label))} caused the most: ${amount(f, top.v)}, ${fmtPct(top.v / f.lost, 0)} of the total` : `${top.label} lost the most: ${amount(f, top.v)}, ${fmtPct(top.v / f.lost, 0)} of the total`;
}


/** Parts rounded so the printed rows add up to the printed total (largest remainder at `step`): units are
 *  printed whole, so a year table of fractional lost units sums to the rounded total shown above it. */
export function roundParts(parts: number[], step = 1): number[] {
  const total = parts.reduce((a, b) => a + b, 0);
  const target = Math.round(total / step);
  const base = parts.map((p) => Math.floor(p / step));
  let left = target - base.reduce((a, b) => a + b, 0);
  const order = parts.map((p, k) => ({ k, r: p / step - base[k] })).sort((a, b) => b.r - a.r);
  for (const o of order) {
    if (left <= 0) break;
    base[o.k]++;
    left--;
  }
  return base.map((b) => b * step);
}
