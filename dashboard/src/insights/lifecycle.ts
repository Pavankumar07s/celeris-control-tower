// Lifecycle facts: the SKUs whose life changes around the forecast window (end of life announced, planned
// launches, discontinued, recent launches), the predecessor -> successor handovers, and the business-rule-5
// checks (no forecast after EOL, none before launch), all computed from dims.json, history.json and
// forecast.json for the current filters (region, channel and customer apply to every SKU).
import { forecastAgg, historyAgg, sum } from "../data/aggregate";
import { selectRuns, selectSegments, type Filters, type Model } from "../data/model";
import { fmtNum, fmtPct, monthLong, monthName, monthSpan, yearSpan } from "../data/format";
import { countWord, joinList, plural, type SelectionWords, type Template } from "./headlines";

export const monthIndex = (label: string | null): number | null => {
  if (!label) return null;
  const [y, mo] = label.split("-").map(Number);
  return (y - 2019) * 12 + mo - 1;
};

export type LifeKind = "eol" | "planned" | "discontinued" | "recent";
export interface LifeSku {
  k: number;
  id: string;
  kind: LifeKind;
  launch: number | null; // month index (may be < 0 for pre-2019 launches)
  eol: number | null;
  powertrain: string;
  replaces: number | null; // predecessor SKU index
  successor: number | null;
}

export function lifecycleSkus(m: Model, f: Filters): LifeSku[] {
  const S = m.dims.skus;
  const out: LifeSku[] = [];
  for (let k = 0; k < S.id.length; k++) {
    if (f.family !== null && S.family[k] !== f.family) continue;
    if (f.sku !== null && k !== f.sku) continue;
    const launch = monthIndex(S.launch[k]);
    const st = S.status[k];
    const kind: LifeKind | null = st === "EOL Announced" ? "eol" : st === "Planned Launch" ? "planned" : st === "Discontinued" ? "discontinued" : launch !== null && launch >= m.asOf - 17 ? "recent" : null;
    if (!kind) continue;
    const rep = S.replaces[k] ? S.id.indexOf(S.replaces[k] as string) : -1;
    const suc = S.id.findIndex((_, j) => S.replaces[j] === S.id[k]);
    out.push({ k, id: S.id[k], kind, launch, eol: monthIndex(S.eol[k]), powertrain: S.powertrain[k] ?? "Universal", replaces: rep >= 0 ? rep : null, successor: suc >= 0 ? suc : null });
  }
  return out;
}

/** Demand history (unconstrained, units) and forecast of one SKU under the page's region / channel / customer filters. */
export function skuSeries(m: Model, f: Filters, sku: number) {
  const g: Filters = { ...f, family: m.skuFamily[sku], sku };
  const runs = selectRuns(m, g);
  const h = historyAgg(m, selectSegments(m, g), "units");
  const fc = forecastAgg(m, runs, "units");
  return { h: h.demand, fc: fc.fc, runs: runs.length };
}

export interface Handover {
  pred: number | null;
  succ: number | null;
  predId: string | null;
  succId: string | null;
  eol: number | null;
  launch: number | null;
  predHist: Float64Array | null;
  predFc: Float64Array | null;
  succFc: Float64Array | null;
  predLast12: number; // average units a month over the last 12 actual months
  succEnd: number; // average units a month over the last 3 window months
  ratio: number; // succEnd / predLast12
  afterEol: number; // forecast units after the EOL month (rule 5: must be 0)
  eolUnits: number; // forecast units in the EOL month itself (the run-off's last sales; 0 when outside the window)
  beforeLaunch: number; // forecast units before launch (rule 5: must be 0)
  overlap: number | null; // months both SKUs are forecast (launch .. EOL)
  ramps: boolean;
  predRuns: number; // forecast series of the predecessor under the filters
  succRuns: number; // forecast series of the successor under the filters (0: not sold where the filter looks)
  predWindow: number; // predecessor units forecast inside the window (its run-off)
}

export function handovers(m: Model, f: Filters, skus: LifeSku[]): Handover[] {
  const S = m.dims.skus;
  const seen = new Set<number>();
  const out: Handover[] = [];
  const pairOf = (pred: number | null, succ: number | null) => {
    const pe = pred !== null ? monthIndex(S.eol[pred]) : null;
    const sl = succ !== null ? monthIndex(S.launch[succ]) : null;
    const P = pred !== null ? skuSeries(m, f, pred) : null;
    const Q = succ !== null ? skuSeries(m, f, succ) : null;
    const predLast12 = P ? sum(P.h, m.asOf - 11, m.asOf + 1) / 12 : NaN;
    const succEnd = Q && Q.runs > 0 ? sum(Q.fc, m.nWin - 3, m.nWin) / 3 : NaN;
    let afterEol = 0;
    if (P && pe !== null) for (let t = Math.max(m.w0, pe + 1); t < m.nMonths; t++) afterEol += P.fc[t - m.w0];
    const eolUnits = P && pe !== null && pe >= m.w0 && pe < m.nMonths ? P.fc[pe - m.w0] : 0;
    let beforeLaunch = 0;
    if (Q && sl !== null) for (let t = m.w0; t < Math.min(sl, m.nMonths); t++) beforeLaunch += Q.fc[t - m.w0];
    let ramps = false;
    if (Q && sl !== null && sl >= m.w0) {
      const a = Q.fc.slice(sl - m.w0, sl - m.w0 + 3);
      const b = Q.fc.slice(m.nWin - 3);
      ramps = sum(b) / 3 > sum(a) / Math.max(1, a.length);
    }
    return {
      pred,
      succ,
      predId: pred !== null ? S.id[pred] : null,
      succId: succ !== null ? S.id[succ] : null,
      eol: pe,
      launch: sl,
      predHist: P ? P.h : null,
      predFc: P ? P.fc : null,
      succFc: Q ? Q.fc : null,
      predLast12,
      succEnd,
      ratio: predLast12 > 0 && Number.isFinite(succEnd) ? succEnd / predLast12 : NaN,
      predRuns: P ? P.runs : 0,
      succRuns: Q ? Q.runs : 0,
      predWindow: P ? sum(P.fc) : 0,
      afterEol,
      eolUnits,
      beforeLaunch,
      overlap: pe !== null && sl !== null && pe >= sl ? pe - sl + 1 : null,
      ramps,
    };
  };
  for (const s of skus) {
    if (s.kind !== "eol" || seen.has(s.k)) continue;
    seen.add(s.k);
    const succ = s.successor;
    if (succ !== null) seen.add(succ);
    out.push(pairOf(s.k, succ));
  }
  for (const s of skus) {
    if (s.kind !== "planned" || seen.has(s.k)) continue;
    seen.add(s.k);
    out.push(pairOf(s.replaces, s.k));
  }
  return out.sort((a, b) => (a.launch ?? a.eol ?? 0) - (b.launch ?? b.eol ?? 0));
}

// ---- facts and templates ---------------------------------------------------------------------------------------
export interface LifeFacts {
  sel: SelectionWords;
  m: Model;
  pairs: Handover[];
  eolIn: Handover[]; // with an EOL inside the window
  launchIn: Handover[]; // with a launch inside the window
  recent: number;
  discontinued: number;
  ruleOk: boolean;
  ratio: number; // combined successor end rate / predecessor last-12 rate (pairs only)
  predRate: number;
  succRate: number;
  predPowertrain: string | null;
}

const full = (h: Handover[]) => h.filter((x) => x.pred !== null && x.succ !== null && x.succRuns > 0);
const years = (f: LifeFacts, xs: number[]) => (xs.length ? yearSpan(f.m.months[Math.min(...xs)], f.m.months[Math.max(...xs)]) : "");

/** Units below half a unit print as 0 (forecasts are whole units). */
const isZero = (v: number) => v < 0.5;
/** How the run-offs end, from the forecast: the last units sold in the EOL month and nothing after it
 *  ("PTC-005 and PMP-003 sell their last units in their EOL months (May 2027 and Aug 2027) and are zero from
 *  the month after"), zero already before the EOL month, or volume left after it. */
function runoffSentence(m: Model, ends: Handover[]): string {
  if (!ends.length) return "";
  const M = m.months;
  const inWin = ends.filter((p) => (p.eol as number) >= m.w0 && (p.eol as number) < m.nMonths);
  const last = inWin.filter((p) => !isZero(p.eolUnits) && isZero(p.afterEol));
  const early = inWin.filter((p) => isZero(p.eolUnits) && isZero(p.afterEol));
  const leak = ends.filter((p) => !isZero(p.afterEol));
  const one = (xs: Handover[]) => xs.length === 1;
  const ids = (xs: Handover[]) => joinList(xs.map((p) => p.predId as string));
  const months = (xs: Handover[], d = 0) => joinList(xs.map((p) => monthName(M[Math.min(m.nMonths - 1, (p.eol as number) + d)])));
  const out: string[] = [];
  if (last.length)
    out.push(
      `${ids(last)} ${one(last) ? "sells its" : "sell their"} last units in ${one(last) ? "its EOL month" : "their EOL months"} (${months(last)}) and ${one(last) ? "is" : "are"} zero from the month after.`,
    );
  if (early.length) out.push(`${ids(early)} ${one(early) ? "reaches" : "reach"} zero before ${one(early) ? "its EOL month" : "their EOL months"} (${months(early)}).`);
  if (leak.length) out.push(`${ids(leak)} still ${one(leak) ? "has" : "have"} forecast units after ${one(leak) ? "its EOL month" : "their EOL months"}.`);
  return out.length ? `${out.join(" ")} ` : "";
}

export const LIFE_TEMPLATES = {
  /** "Three SKUs hand over to successors in 2027" / "Two SKUs end and one launches inside the window". */
  headline: {
    id: "lifecycle.headline",
    when: (f) => f.eolIn.length > 0 || f.launchIn.length > 0,
    text: (f) => {
      const pairs = full(f.pairs).filter((p) => p.eol !== null && p.eol >= f.m.w0 && p.launch !== null && p.launch >= f.m.w0);
      if (pairs.length && pairs.length === f.eolIn.length && pairs.length === f.launchIn.length) {
        const ys = years(f, pairs.flatMap((p) => [p.launch as number, p.eol as number]));
        return `${countWord(pairs.length, true)} ${plural(pairs.length, "SKU hands", "SKUs hand")} over to ${plural(pairs.length, "a successor", "successors")} in ${ys}`;
      }
      const a = f.eolIn.length;
      const b = f.launchIn.length;
      if (b === 0) return `${countWord(a, true)} ${plural(a, "SKU ends", "SKUs end")} inside the window; none launches`;
      if (a === 0) return `${countWord(b, true)} ${plural(b, "SKU launches", "SKUs launch")} inside the window; none ends`;
      return `${countWord(a, true)} ${plural(a, "SKU ends", "SKUs end")} and ${countWord(b)} ${plural(b, "launches", "launch")} inside the window`;
    },
    fallback: (f) => (f.sel.all ? "No SKU ends or launches inside the window" : `${f.sel.name}: no SKU ends or launches in the window`),
  },
  standfirst: {
    id: "lifecycle.standfirst",
    when: (f) => f.pairs.length > 0,
    text: (f) => {
      const M = f.m.months;
      const runoff = runoffSentence(f.m, f.pairs.filter((p) => p.pred !== null && p.eol !== null));
      const rule = f.ruleOk ? "Business rule 5 holds: **0 units** are forecast after any end of life or before any launch." : "**Business rule 5 is broken**: some units are forecast after an end of life or before a launch.";
      const ramp =
        Number.isFinite(f.ratio) && full(f.pairs).length
          ? ` By ${monthLong(M[f.m.nMonths - 1])} the successors sell **${fmtNum(f.succRate)} units a month**, ${fmtPct(f.ratio, 0)} of the ${fmtNum(f.predRate)} their predecessors sold a month over the last 12 actual months.`
          : "";
      return `${runoff}${rule}${ramp}`;
    },
    fallback: (f) => {
      const parts: string[] = [];
      if (f.recent) parts.push(`${countWord(f.recent, true)} ${plural(f.recent, "SKU", "SKUs")} launched in the last 18 months and ${plural(f.recent, "is", "are")} still ramping.`);
      if (f.discontinued) parts.push(`${countWord(f.discontinued, true)} discontinued ${plural(f.discontinued, "SKU has", "SKUs have")} no forecast.`);
      parts.push("Clear the family filter to see the handovers inside the window.");
      return parts.join(" ");
    },
  },
} satisfies Record<string, Template<LifeFacts>>;

export interface GanttFacts {
  m: Model;
  pairs: Handover[];
  predPowertrain: string | null;
}
export const GANTT_TEMPLATES = {
  /** "Three ICE SKUs retire in 2027; each successor overlaps its predecessor for 3 months". */
  title: {
    id: "lifecycle.gantt",
    when: (g) => full(g.pairs).length > 0 && full(g.pairs).every((p) => p.eol !== null),
    text: (g) => {
      const ps = full(g.pairs);
      const ov = ps.map((p) => p.overlap).filter((x): x is number => x !== null);
      const ys = years({ m: g.m } as LifeFacts, ps.map((p) => p.eol as number));
      const lead = `${countWord(ps.length, true)} ${g.predPowertrain ? `${g.predPowertrain} ` : ""}${plural(ps.length, "SKU retires", "SKUs retire")} in ${ys}`;
      if (ov.length === ps.length && ov.every((x) => x === ov[0])) return `${lead}; ${ps.length === 1 ? "its successor overlaps it" : "each successor overlaps its predecessor"} for ${ov[0]} month${ov[0] === 1 ? "" : "s"}`;
      if (ov.length) return `${lead}; successors overlap them by ${Math.min(...ov)}–${Math.max(...ov)} months`;
      return lead;
    },
    fallback: () => "Launches, ends of life and discontinued SKUs around the window",
  },
} satisfies Record<string, Template<GanttFacts>>;

export const HANDOVER_TEMPLATES = {
  /** "Every run-off sells its last units in its EOL month and is zero after it, and every successor ramps up from launch". */
  title: {
    id: "lifecycle.handover",
    when: (h: Handover[]) => h.length > 0,
    text: (h) => {
      const ends = h.filter((x) => x.pred !== null && x.eol !== null);
      const starts = h.filter((x) => x.succ !== null && x.launch !== null && x.succRuns > 0);
      const zero = ends.every((x) => isZero(x.afterEol));
      const lastInEol = zero && ends.every((x) => !isZero(x.eolUnits));
      const ramp = starts.every((x) => x.ramps);
      const det = ends.length === 1 ? "The" : "Every";
      const a = ends.length
        ? lastInEol
          ? `${det} run-off sells its last units in its EOL month and is zero after it`
          : zero
            ? `${det} run-off is zero after its EOL month`
            : "A run-off keeps volume after its EOL month"
        : "";
      const b = starts.length ? (ramp ? `${ends.length ? ", and " : ""}${starts.length === 1 ? "the" : "every"} successor ramps up from launch` : `${ends.length ? ", and " : ""}not every successor ramps up`) : "";
      const s = `${a}${b}`;
      return s.charAt(0).toUpperCase() + s.slice(1);
    },
    fallback: () => "End-of-life run-offs and their successors",
  },
} satisfies Record<string, Template<Handover[]>>;

export interface RecentRow {
  k: number;
  id: string;
  launch: number;
  series: number;
  last3: number;
  next12: number;
  ramp: number;
}
export const RECENT_TEMPLATES = {
  /** "4 of 5 recent launches are forecast above their last three months; BSS-012 ramps most, ×1.8". */
  title: {
    id: "lifecycle.recent",
    when: (r: RecentRow[]) => r.filter((x) => Number.isFinite(x.ramp)).length >= 1,
    text: (r) => {
      const ok = r.filter((x) => Number.isFinite(x.ramp));
      const up = ok.filter((x) => x.ramp > 1);
      const top = ok.reduce((a, b) => (b.ramp > a.ramp ? b : a));
      const lead = up.length === ok.length ? `Every recent launch is forecast above its last three months` : `${up.length} of ${ok.length} recent launches are forecast above their last three months`;
      return `${lead}; ${top.id} ramps most, ×${top.ramp.toFixed(2)}`;
    },
    fallback: () => "Recent launches still ramping",
  },
} satisfies Record<string, Template<RecentRow[]>>;

export { monthSpan };
