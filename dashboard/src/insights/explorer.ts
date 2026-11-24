// Demand explorer copy: facts for the selection (volume, ordering cycles, zero months, lifecycle) and the
// deterministic templates for the headline, standfirst and module titles.  No typed number.
import { MONTHS_LONG, fmtInt, fmtPct, fmtPctAbs, fmtValueUnit, monthLong, monthName, monthOnly } from "../data/format";
import type { Measure, Model } from "../data/model";
import { cap, changePhrase, countWord, fractionWord, joinList, plural, side, type SelectionWords, type Template } from "./headlines";

// ---- ordering cycles in words ----------------------------------------------------------------------------
export const CYCLE_KIND: Record<string, string> = { M: "Monthly", A: "Monthly, one shutdown", B: "Every second month", Q: "Quarterly", T: "Two months in three", unknown: "No history yet" };
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "every month", "every month except an August shutdown", "every second month", "once a quarter" ... */
export function cycleWords(code: string | null | undefined): string {
  if (!code) return "with no ordering history yet";
  if (code === "M") return "every month";
  const k = code[0];
  if (k === "A") {
    const mi = SHORT_MONTHS.indexOf(code.slice(2));
    const name = mi >= 0 ? MONTHS_LONG[mi] : code.slice(2);
    return `every month except ${/^[AEIOU]/.test(name) ? "an" : "a"} ${name} shutdown`;
  }
  if (k === "B") return "every second month";
  if (k === "Q") return "once a quarter";
  if (k === "T") return "two months in every three";
  return `on cycle ${code}`;
}

// ---- zero months -----------------------------------------------------------------------------------------
/** The ONE classification of a zero month, used by the standfirst, the module title, the 12-month strip and the
 *  calendar alike, so their counts always sum to the zero months.  Order matters: the demand stage sets
 *  `structural_zero` AND `lost_tail` on the months after an account is lost (including the months its cycle
 *  would have ordered), so the lost-account test comes first; then the cycle's scheduled off-months; then a
 *  zero in a row that was missing from the extract and rebuilt; anything else is a zero on an order month. */
export type ZeroClass = "lost" | "sched" | "missing" | "unexp";
export function zeroClass(m: Model, fl: number): ZeroClass {
  const b = m.bit;
  if (fl & b.lost_tail) return "lost";
  if (fl & b.structural_zero) return "sched";
  if (fl & b.missing_row) return "missing";
  return "unexp";
}
export interface ZeroStats {
  cells: Int32Array;
  zeros: Int32Array;
  /** The four classes of zeroClass(): lost + sched + missing + unexp = zeros, month by month. */
  lost: Int32Array; // after the account was lost (no order since)
  sched: Int32Array; // off-month of the ordering cycle
  missing: Int32Array; // zero in a row missing from the extract (rebuilt), not on an off-month
  unexp: Int32Array; // zero on an order month
  /** Of the lost months, those the cycle would have ordered (on-phase): the orders that never came. */
  lostOn: Int32Array;
}
export function zeroStats(m: Model, segs: number[]): ZeroStats {
  const n = m.asOf + 1;
  const z: ZeroStats = { cells: new Int32Array(n), zeros: new Int32Array(n), lost: new Int32Array(n), sched: new Int32Array(n), missing: new Int32Array(n), unexp: new Int32Array(n), lostOn: new Int32Array(n) };
  for (const g of segs) {
    for (let k = 0; k < m.gLen[g]; k++) {
      const t = m.gStart[g] + k;
      const i = m.gOff[g] + k;
      z.cells[t]++;
      if (m.d[i] !== 0) continue;
      const fl = m.f[i];
      z.zeros[t]++;
      const c = zeroClass(m, fl);
      z[c][t]++;
      if (c === "lost" && fl & m.bit.on_phase) z.lostOn[t]++;
    }
  }
  return z;
}
const tot = (a: ArrayLike<number>) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i];
  return s;
};

export interface ExplorerFacts {
  sel: SelectionWords;
  measure: Measure;
  latent: boolean;
  single: boolean;
  /** "HYD-004 in Europe" for one series, else the selection name or "". */
  name: string;
  last12: number;
  prev12: number;
  chg: number;
  nSeries: number;
  kinds: Record<string, number>;
  cycle: string | null;
  cycleBefore: string | null;
  cycleChange: string | null;
  zeros: number;
  /** zeros = sched + lost + missing + unexp (one classification: zeroClass). */
  sched: number;
  lost: number;
  lostOn: number;
  missing: number;
  unexp: number;
  cells: number;
  /** Series that order monthly: every month (kind M) plus every month but one annual shutdown month (kind A).
   *  One variable for the hero strip's "Monthly" segment, the standfirst and the composition title. */
  monthly: number;
  monthlyShutdown: number;
  /** Month (absolute index) with the most unexplained zeros, its count and a covering disruption event. */
  peakUnexp: number;
  peakUnexpN: number;
  peakEvent: string | null;
  lostAccount: boolean;
  /** The last month with an order (one variable for "last order" everywhere) and the silent months since. */
  lastOrder: string | null;
  silent: number | null;
  customers: { name: string; from: number; to: number }[];
  status: string | null;
  launch: string | null;
  eol: string | null;
  next12: number;
  fcOn: boolean;
  /** The model's month labels (facts keep absolute month indices). */
  months: string[];
}

/** Why a selection has no history cell, in words that match the filters: a planned launch, a customer filter
 *  that never bought these SKUs, or simply nothing in the grid. */
export function noHistoryWords(f: ExplorerFacts): string {
  const who = f.name || "This selection";
  if (f.single && f.status === "Planned Launch" && f.launch)
    return `${who} has no history yet: its launch is planned for ${monthLong(f.launch)}${f.next12 > 0 ? `, and **${fmtInt(f.next12)} units** are forecast for the next 12 months` : ""}.`;
  if (f.sel.fixed.customer) return "No history cell in this selection: the customer did not buy these SKUs here. Clear the customer filter to widen the view.";
  return `${who} has no history cell between ${monthLong("2019-01")} and the last actual month.${f.next12 > 0 ? ` Its forecast starts in the window: **${fmtInt(f.next12)} units** in the next 12 months.` : ""}`;
}

export function explorerFacts(a: {
  m: Model;
  sel: SelectionWords;
  measure: Measure;
  latent: boolean;
  single: number | null;
  series: number[];
  segs: number[];
  demand: ArrayLike<number>;
  fc: ArrayLike<number> | null;
  z: ZeroStats;
  lastOrder: string | null;
  cycleBefore: string | null;
  cycleChange: string | null;
  eventTitleAt: (t: number) => string | null;
}): ExplorerFacts {
  const { m, z } = a;
  let last12 = 0;
  let prev12 = 0;
  for (let t = m.asOf - 11; t <= m.asOf; t++) last12 += a.demand[t];
  for (let t = m.asOf - 23; t <= m.asOf - 12; t++) prev12 += a.demand[t];
  let next12 = 0;
  if (a.fc) for (let k = 0; k < Math.min(12, m.nWin); k++) next12 += a.fc[k];
  const kinds: Record<string, number> = {};
  for (const s of a.series) {
    const k = m.dims.series.cycle_kind[s] ?? "unknown";
    kinds[k] = (kinds[k] ?? 0) + 1;
  }
  let peak = -1;
  for (let t = 0; t <= m.asOf; t++) if (z.unexp[t] > 0 && (peak < 0 || z.unexp[t] > z.unexp[peak])) peak = t;
  const s = a.single;
  const sku = s !== null ? m.sSku[s] : -1;
  return {
    sel: a.sel,
    measure: a.measure,
    latent: a.latent,
    single: s !== null,
    name: s !== null ? `${m.dims.skus.id[sku]} in ${m.dims.regions[m.sRegion[s]]}` : a.sel.name,
    last12,
    prev12,
    chg: prev12 > 0 ? last12 / prev12 - 1 : NaN,
    nSeries: a.series.length,
    kinds,
    cycle: s !== null ? m.dims.series.cycle[s] : null,
    cycleBefore: a.cycleBefore,
    cycleChange: a.cycleChange,
    zeros: tot(z.zeros),
    sched: tot(z.sched),
    lost: tot(z.lost),
    lostOn: tot(z.lostOn),
    missing: tot(z.missing),
    unexp: tot(z.unexp),
    cells: tot(z.cells),
    monthly: (kinds.M ?? 0) + (kinds.A ?? 0),
    monthlyShutdown: kinds.A ?? 0,
    peakUnexp: peak,
    peakUnexpN: peak >= 0 ? z.unexp[peak] : 0,
    peakEvent: peak >= 0 ? a.eventTitleAt(peak) : null,
    lostAccount: s !== null && m.dims.series.lost[s] === 1,
    lastOrder: a.lastOrder,
    silent: a.lastOrder && m.months.indexOf(a.lastOrder) >= 0 ? m.asOf - m.months.indexOf(a.lastOrder) : null,
    customers: s !== null ? m.segOfSeries[s].map((g) => ({ name: m.dims.customers[m.gCustomer[g]], from: m.gStart[g], to: m.gStart[g] + m.gLen[g] - 1 })) : [],
    status: sku >= 0 ? m.dims.skus.status[sku] : null,
    launch: sku >= 0 ? m.dims.skus.launch[sku] : null,
    eol: sku >= 0 ? m.dims.skus.eol[sku] : null,
    next12,
    fcOn: a.fc !== null,
    months: m.months,
  };
}

const amount = (f: ExplorerFacts, v: number) => fmtValueUnit(v, f.measure);

/** Headline variants, tried in order (renderFirst). */
export const EXPLORER_HEADLINES: Template<ExplorerFacts>[] = [
  {
    id: "explorer.launch",
    when: (f) => f.single && f.cells === 0 && f.status === "Planned Launch" && !!f.launch,
    text: (f) => `${f.name} launches in ${monthLong(f.launch as string)}, with no history of its own`,
    fallback: (f) => f.name,
  },
  {
    id: "explorer.lost",
    when: (f) => f.single && f.lostAccount && !!f.lastOrder,
    // one phrasing with the inbox: the last order month, then the silent months after it
    text: (f) => `${f.name} last ordered in ${monthName(f.lastOrder as string)}${f.silent ? ` and has been silent for ${fmtInt(f.silent)} ${plural(f.silent, "month")}` : ""}`,
    fallback: (f) => f.name,
  },
  {
    id: "explorer.cycleChange",
    when: (f) => f.single && !!f.cycleBefore && !!f.cycleChange && !!f.cycle,
    text: (f) => `${f.name} moved to ordering ${cycleWords(f.cycle)} in ${monthName(f.cycleChange as string)}`,
    fallback: (f) => f.name,
  },
  {
    id: "explorer.cycle",
    when: (f) => f.single && !!f.cycle,
    text: (f) => `${f.name} orders ${cycleWords(f.cycle)}`,
    fallback: (f) => f.name,
  },
  {
    id: "explorer.zeros",
    when: (f) => !f.single && f.zeros > 0 && f.sched / f.zeros >= 0.5,
    text: (f) => `Ordering cycles explain ${fmtPct(f.sched / f.zeros)} of zero months since ${(f.months[0] ?? "").slice(0, 4)}`,
    fallback: (f) => (f.single ? `${f.name}: demand month by month` : f.zeros === 0 ? "Every month of this selection carried demand" : `${cap(f.sel.all ? "demand" : f.sel.name)}: demand month by month`),
  },
];

export const EXPLORER_TEMPLATES = {
  standfirst: {
    id: "explorer.standfirst",
    when: (f) => f.cells > 0,
    text: (f) => {
      const vol = f.prev12 > 0 ? ` Demand over the last 12 months: **${amount(f, f.last12)}**, ${Math.abs(f.chg) < 0.01 ? "level with" : `${fmtPctAbs(f.chg)} ${side(f.chg)}`} the year before.` : ` Demand over the last 12 months: **${amount(f, f.last12)}**.`;
      if (f.single) {
        const months = `**${fmtInt(f.zeros)} of ${fmtInt(f.cells)} months**`;
        const zeros =
          f.zeros === 0
            ? `Every one of its ${fmtInt(f.cells)} months carried an order.`
            : f.sched === f.zeros
              ? `${months} were zero, all of them scheduled off-months of that cycle: none is lost demand or a missing record.`
              : `${months} were zero: ${joinList(zeroParts(f))}.`;
        const cust =
          f.customers.length > 1
            ? ` Bought by ${f.customers[f.customers.length - 1].name} since ${monthName(monthKey(f, f.customers[f.customers.length - 1].from))}, after ${joinList(f.customers.slice(0, -1).map((c) => c.name))}.`
            : f.customers.length === 1
              ? ` Bought by ${f.customers[0].name} throughout.`
              : "";
        const life = f.eol ? ` The SKU reaches end of life in ${monthLong(f.eol)}.` : "";
        return `${zeros}${cust}${life}${vol}`;
      }
      const peak = f.peakUnexp >= 0 && f.unexp > 0 ? `${f.unexp === 1 ? ", in" : ", most of them in"} ${monthName(monthKey(f, f.peakUnexp))}${f.peakEvent ? ` (${f.peakEvent})` : ""}` : "";
      // the four classes of zeroClass(), in one sentence that sums to the zero cells
      const rest = [f.unexp ? `${fmtInt(f.unexp)} fell on an order month${peak}` : "none fell on an order month", f.missing ? `${fmtInt(f.missing)} sit in rows missing from the extract and rebuilt` : "", f.lost ? `${fmtInt(f.lost)} follow a lost account` : ""].filter(Boolean);
      return `**${fmtInt(f.zeros)}** of ${fmtInt(f.cells)} history cells are zero. ${fmtInt(f.sched)} fall on the off-months of a customer's ordering cycle; ${rest.join("; ")}. ${monthlySentence(f)}${vol}`;
    },
    fallback: (f) => noHistoryWords(f),
  },
  timelineTitle: {
    id: "explorer.timeline",
    when: (f) => f.fcOn && f.next12 > 0 && f.last12 > 0,
    text: (f) => {
      const c = f.next12 / f.last12 - 1;
      return Math.abs(c) < 0.005 ? "The forecast's next 12 months match the last 12 to within 0.5%" : `The forecast's next 12 months land ${fmtPctAbs(c)} ${side(c)} the last 12`;
    },
    fallback: (f) => (f.prev12 > 0 && f.last12 > 0 ? `Demand ${changePhrase(f.chg)} over the last 12 months against the year before` : `${f.latent ? "Latent monthly demand" : "Demand"} month by month`),
  },
  zeroTitle: {
    id: "explorer.zeros.title",
    when: (f) => f.zeros > 0,
    text: (f) => {
      if (f.single) {
        if (f.sched === f.zeros) return `All ${fmtInt(f.zeros)} zero months are scheduled off-months`;
        if (f.lost === f.zeros) return `All ${fmtInt(f.zeros)} zero months follow the lost account`;
        if (f.lost && f.sched === f.zeros - f.lost) return `${fmtInt(f.lost)} of the ${fmtInt(f.zeros)} zero months follow the lost account; the other ${fmtInt(f.sched)} are scheduled off-months`;
        const others = [f.sched ? `${fmtInt(f.sched)} ${plural(f.sched, "is a scheduled off-month", "are scheduled off-months")}` : "", f.missing ? `${fmtInt(f.missing)} ${plural(f.missing, "sits in a rebuilt row", "sit in rebuilt rows")}` : "", f.unexp ? `${fmtInt(f.unexp)} fell on an order month` : ""].filter(Boolean);
        if (f.lost) return `${fmtInt(f.lost)} of the ${fmtInt(f.zeros)} zero months follow the lost account; ${joinList(others)}`;
        return `${fmtInt(f.sched)} of ${fmtInt(f.zeros)} zero months are scheduled off-months`;
      }
      if (f.peakUnexp >= 0 && f.peakUnexpN > 1) return `Unexplained zeros peak in ${monthName(monthKey(f, f.peakUnexp))} (${fmtInt(f.peakUnexpN)})${f.peakEvent ? `, during the ${lowerFirst(f.peakEvent)}` : ""}`;
      return f.unexp === 0 ? "Every zero month is a scheduled off-month" : `${fmtInt(f.unexp)} zero ${plural(f.unexp, "month")} fell on an order month`;
    },
    fallback: (f) => (f.cells === 0 ? "No history month to classify yet" : f.single ? "No zero month: every month carried an order" : "No zero month in this selection"),
  },
} satisfies Record<string, Template<ExplorerFacts>>;

/** The month label of an absolute index. */
const monthKey = (f: ExplorerFacts, t: number): string => f.months[t] ?? "";

/** One series' zero months in words, one phrase per class of zeroClass() (they sum to f.zeros). */
function zeroParts(f: ExplorerFacts): string[] {
  return [
    f.sched ? `${fmtInt(f.sched)} scheduled off-${plural(f.sched, "month")} of that cycle` : "",
    f.lost ? `${fmtInt(f.lost)} since the last order${f.lastOrder ? ` in ${monthName(f.lastOrder)}` : ""}${f.lostOn ? ` (${fmtInt(f.lostOn)} of them ${plural(f.lostOn, "a month", "months")} the cycle would have ordered)` : ""}` : "",
    f.missing ? `${fmtInt(f.missing)} in ${plural(f.missing, "a row", "rows")} missing from the extract and rebuilt` : "",
    f.unexp ? `${fmtInt(f.unexp)} on an order month` : "",
  ].filter(Boolean);
}

/** "Three quarters of the 3,093 series order monthly (775 of them skip one shutdown month a year)": the same count
 *  as the hero strip's "Monthly" segment (kinds M and A), with the definition said in the sentence. */
export function monthlySentence(f: ExplorerFacts, the = true): string {
  const share = f.monthly / Math.max(1, f.nSeries);
  const skip = f.monthlyShutdown ? ` (${fmtInt(f.monthlyShutdown)} of them skip one shutdown month a year)` : "";
  if (f.monthly === 0) return `None of the ${fmtInt(f.nSeries)} ${plural(f.nSeries, "series", "series")} orders monthly.`;
  return `${cap(fractionWord(share))} of ${the ? "the " : ""}${fmtInt(f.nSeries)} ${plural(f.nSeries, "series", "series")} order monthly${skip}.`;
}
/** "Semiconductor shortage" -> "semiconductor shortage"; "COVID-19 lockdowns" stays. */
const lowerFirst = (s: string) => (/^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);

// ---- seasonality ----------------------------------------------------------------------------------------------
export interface SeasonFacts {
  years: { y: number; idx: number[] }[];
  avg: number[];
  latest: number | null;
  excluded: number[];
  excludedWhy: string | null;
}
/** Each full calendar year's months divided by that year's mean (latent demand); the average leaves out
 *  years that overlap a Disruption event in the selection. */
export function seasonFacts(m: Model, latent: ArrayLike<number>, disrupted: (y: number) => string | null): SeasonFacts {
  const years: SeasonFacts["years"] = [];
  const y0 = Number(m.months[0].slice(0, 4));
  for (let k = 0; k * 12 + 11 <= m.asOf; k++) {
    if (!m.months[k * 12].endsWith("-01")) continue;
    const vals = Array.from({ length: 12 }, (_, j) => latent[k * 12 + j]);
    const mean = vals.reduce((a, b) => a + b, 0) / 12;
    if (mean > 0 && vals.every((v) => v > 0)) years.push({ y: y0 + k, idx: vals.map((v) => v / mean) });
  }
  const excluded = years.filter((y) => disrupted(y.y) !== null).map((y) => y.y);
  const base = years.filter((y) => !excluded.includes(y.y));
  const use = base.length ? base : years;
  const avg = Array.from({ length: 12 }, (_, j) => use.reduce((a, y) => a + y.idx[j], 0) / Math.max(1, use.length));
  return { years, avg, latest: years.length ? years[years.length - 1].y : null, excluded: base.length ? excluded : [], excludedWhy: excluded.length && base.length ? disrupted(excluded[0]) : null };
}
export const SEASON_TEMPLATES = {
  /** "December dips to 0.62× an average month; March peaks at 1.14×". */
  title: {
    id: "explorer.season",
    when: (s) => s.years.length >= 2,
    text: (s) => {
      const hi = s.avg.indexOf(Math.max(...s.avg));
      const lo = s.avg.indexOf(Math.min(...s.avg));
      if (s.avg[hi] - s.avg[lo] < 0.1) return `Demand is flat across the year: no month strays more than ${fmtPctAbs(Math.max(s.avg[hi] - 1, 1 - s.avg[lo]), 0)} from the average`;
      const f = (v: number) => `${v.toFixed(2)}×`;
      return 1 - s.avg[lo] > s.avg[hi] - 1 ? `${MONTHS_LONG[lo]} dips to ${f(s.avg[lo])} an average month; ${MONTHS_LONG[hi]} peaks at ${f(s.avg[hi])}` : `${MONTHS_LONG[hi]} peaks at ${f(s.avg[hi])} an average month; ${MONTHS_LONG[lo]} dips to ${f(s.avg[lo])}`;
    },
    fallback: (s) => (s.years.length ? "Month-of-year profile of latent demand" : "Not enough full years for a seasonal profile"),
  },
} satisfies Record<string, Template<SeasonFacts>>;

export { countWord, monthOnly };
