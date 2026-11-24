// Executive overview copy: the facts computed for the selection and the templates that turn them into the
// headline, standfirst and module titles.  This file is the reference implementation of the headline
// pattern (insights/headlines.ts): facts in, deterministic sentences out, a descriptive fallback each.
import type { Measure, Model } from "../data/model";
import { fmtMoney, fmtNum, fmtPctAbs, fmtPts, fmtSigned, fmtSignedPct, fmtValue, monthLong, monthOnly } from "../data/format";
import { cap, changeNoun, changePhrase, countWord, fractionWord, plural, renderFirst, side, type SelectionWords, type Template } from "./headlines";

export interface OverviewFacts {
  sel: SelectionWords;
  measure: Measure;
  latent: boolean;
  single: boolean;
  /** Forecast total over the 19 window months, and its P10 / P90 (aggregate quantiles). */
  total19: number;
  p10: number;
  p90: number;
  /** Unconstrained demand over the last 19 actual months. */
  last19: number;
  chg19: number;
  next12: number;
  last12: number;
  chg12: number;
  /** Month label of the lowest month in the last 12 actuals and in the next 12 forecast months. */
  troughLast12: string | null;
  troughNext12: string | null;
  firstFc: string;
  lastFc: string;
  nWin: number;
}

export function overviewFacts(a: {
  m: Model;
  sel: SelectionWords;
  measure: Measure;
  latent: boolean;
  single: boolean;
  demand: ArrayLike<number>; // history, measure
  fc: ArrayLike<number>; // window, measure
  p10: number;
  p90: number;
}): OverviewFacts {
  const { m } = a;
  let last19 = 0;
  let last12 = 0;
  let total19 = 0;
  let next12 = 0;
  let tl = -1;
  let tn = -1;
  for (let t = m.asOf - 18; t <= m.asOf; t++) last19 += a.demand[t];
  for (let t = m.asOf - 11; t <= m.asOf; t++) {
    last12 += a.demand[t];
    if (tl < 0 || a.demand[t] < a.demand[tl]) tl = t;
  }
  for (let k = 0; k < m.nWin; k++) total19 += a.fc[k];
  for (let k = 0; k < Math.min(12, m.nWin); k++) {
    next12 += a.fc[k];
    if (tn < 0 || a.fc[k] < a.fc[tn]) tn = k;
  }
  return {
    sel: a.sel,
    measure: a.measure,
    latent: a.latent,
    single: a.single,
    total19,
    p10: a.p10,
    p90: a.p90,
    last19,
    chg19: last19 > 0 ? total19 / last19 - 1 : NaN,
    next12,
    last12,
    chg12: last12 > 0 ? next12 / last12 - 1 : NaN,
    troughLast12: tl >= 0 && last12 > 0 ? m.months[tl] : null,
    troughNext12: tn >= 0 && next12 > 0 ? m.months[m.w0 + tn] : null,
    firstFc: m.months[m.w0],
    lastFc: m.months[m.nMonths - 1],
    nWin: m.nWin,
  };
}

const subject = (f: OverviewFacts) => (f.measure === "usd" ? f.sel.demandSubject.replace(/^Demand/, "Revenue") : f.sel.demandSubject);
const amount = (f: OverviewFacts, v: number) => (f.measure === "usd" ? fmtMoney(v) : `${fmtNum(v)}\u00a0units`);
const has = (f: OverviewFacts) => f.total19 > 0 && f.last19 > 0;

export const OVERVIEW_TEMPLATES = {
  /** "Demand eases 3.2% over the next 19 months" (the selection's name is inserted when filtered). */
  headline: {
    id: "overview.headline",
    when: has,
    text: (f) => `${subject(f)} ${changePhrase(f.chg19)} over the next ${f.nWin} months`,
    fallback: (f) => (f.total19 > 0 ? `${subject(f)}: the next ${f.nWin} months` : `${subject(f)} has no forecast volume in the window`),
  },
  /** "2.79M units are forecast from November 2026 to May 2028, against 2.70M in the last 19 months of
   *   unconstrained demand, and even the P10 stays above that line." */
  standfirst: {
    id: "overview.standfirst",
    when: has,
    text: (f) => {
      const tail =
        f.p90 < f.last19
          ? ", and even the P90 stays below that line"
          : f.p10 > f.last19
            ? ", and even the P10 stays above that line"
            : `; the P10–P90 range of ${fmtValue(f.p10, f.measure)}–${fmtValue(f.p90, f.measure)} spans that line`;
      return `**${amount(f, f.total19)}** ${f.measure === "usd" ? "of revenue is" : "are"} forecast from ${monthLong(f.firstFc)} to ${monthLong(f.lastFc)}, against ${fmtValue(f.last19, f.measure)} in the last ${f.nWin} months of unconstrained demand${tail}.`;
    },
    fallback: (f) =>
      f.total19 > 0
        ? `**${amount(f, f.total19)}** ${f.measure === "usd" ? "of revenue is" : "are"} forecast from ${monthLong(f.firstFc)} to ${monthLong(f.lastFc)}; the selection has no demand in the last ${f.nWin} months to compare with.`
        : `No forecast rows for this selection: the account is lost, or the SKU ends before ${monthLong(f.firstFc)}. Clear the customer or SKU filter to widen the view.`,
  },
  /** "The next 12 months land 2.0% below the last 12, and the December trough repeats". */
  timelineTitle: {
    id: "overview.timeline",
    when: (f) => f.next12 > 0 && f.last12 > 0,
    text: (f) => {
      const repeats = f.troughLast12 && f.troughNext12 && monthOnly(f.troughLast12) === monthOnly(f.troughNext12);
      const head = Math.abs(f.chg12) < 0.005 ? "The next 12 months match the last 12 to within 0.5%" : `The next 12 months land ${fmtPctAbs(f.chg12)} ${side(f.chg12)} the last 12`;
      return `${head}${repeats ? `, and the ${monthOnly(f.troughNext12 as string, true)} trough repeats` : ""}`;
    },
    fallback: (f) => `${f.latent ? "Latent monthly demand" : f.measure === "usd" ? "Revenue" : "Demand"} from history into the forecast`,
  },
} satisfies Record<string, Template<OverviewFacts>>;

/** The timeline dek: what is plotted, the unit and the date range shown ("Jan 2019 – May 2028"). */
export function timelineDek(f: OverviewFacts, range: string): string {
  const unit = f.measure === "usd" ? "Revenue in USD" : "Units";
  if (f.latent) return `${unit} per month of latent demand, ${range}: each order spread over the months it covers, in history and forecast alike.`;
  if (f.single) return `${unit} per month for one series, ${range}. Orders read as events, so history shows columns (shipped, plus lost to stock-outs); the forecast carries a P10–P90 whisker per month.`;
  return `${unit} per month, ${range}. History shows unconstrained demand; the forecast carries its P10–P90 range.`;
}

// ---- "Where the change comes from" (bar table) ----------------------------------------------------------
export interface ChangeRow {
  label: string;
  idx: number;
  last: number;
  next: number;
  d: number;
  pct: number;
  share: number;
  shareDelta: number;
}
export interface ChangeFacts {
  dim: "family" | "region" | "channel";
  measure: Measure;
  rows: ChangeRow[];
  total: number;
  leader: ChangeRow | null;
  maxShift: ChangeRow | null;
}

export function changeFacts(dim: ChangeFacts["dim"], measure: Measure, labels: string[], lastAbs: number[], nextAbs: number[]): ChangeFacts {
  const tl = lastAbs.reduce((a, b) => a + b, 0) || 1;
  const tn = nextAbs.reduce((a, b) => a + b, 0) || 1;
  const rows: ChangeRow[] = labels
    .map((label, idx) => ({ label, idx, last: lastAbs[idx], next: nextAbs[idx], d: nextAbs[idx] - lastAbs[idx], pct: lastAbs[idx] > 0 ? nextAbs[idx] / lastAbs[idx] - 1 : NaN, share: nextAbs[idx] / tn, shareDelta: nextAbs[idx] / tn - lastAbs[idx] / tl }))
    .filter((r) => r.last > 0 || r.next > 0)
    .sort((a, b) => a.d - b.d);
  const total = rows.reduce((a, r) => a + r.d, 0);
  const sameSign = rows.filter((r) => Math.sign(r.d) === Math.sign(total));
  const leader = sameSign.length ? sameSign.reduce((a, b) => (Math.abs(b.d) > Math.abs(a.d) ? b : a)) : null;
  const maxShift = rows.length ? rows.reduce((a, b) => (Math.abs(b.shareDelta) > Math.abs(a.shareDelta) ? b : a)) : null;
  if (total > 0) rows.reverse();
  return { dim, measure, rows, total, leader, maxShift };
}

const lead = (c: ChangeFacts) => c.leader as ChangeRow;
const leadShare = (c: ChangeFacts) => (c.leader && c.total ? c.leader.d / c.total : NaN);
export const CHANGE_TEMPLATES = {
  /** "North America drives a third of the 12-month dip" (one entity carries 30-100 % of the net change). */
  title: {
    id: "overview.change",
    when: (c) => c.rows.length > 1 && leadShare(c) >= 0.3 && leadShare(c) <= 1,
    text: (c) => `${lead(c).label} drives ${fractionWord(leadShare(c))} of the 12-month ${changeNoun(c.total)}`,
    fallback: (c) => `Change by ${c.dim}: the next 12 months against the last 12`,
  },
  /** "Every region grows; Europe adds the most, +14.3K" (broad-based change, no dominant entity). */
  broad: {
    id: "overview.change.broad",
    when: (c) => c.rows.length > 1 && !!c.leader && c.rows.every((r) => Math.sign(r.d) === Math.sign(c.total) && r.d !== 0),
    text: (c) => `Every ${c.dim} ${c.total > 0 ? "grows" : "eases"}; ${lead(c).label} ${c.total > 0 ? "adds" : "loses"} the most, ${fmtSigned(lead(c).d, c.measure, 1)}`,
    fallback: (c) => `Change by ${c.dim}: the next 12 months against the last 12`,
  },
  /** "Europe moves most, +4.4%, against a net +2.0%" (offsetting changes: the leader exceeds the net). */
  offset: {
    id: "overview.change.offset",
    when: (c) => c.rows.length > 1 && !!c.leader && Math.abs(c.leader.d) > Math.abs(c.total),
    text: (c) => `${lead(c).label} moves most, ${fmtSignedPct(lead(c).pct)}, against a net ${fmtSignedPct(c.total / c.rows.reduce((a, r) => a + r.last, 0))}`,
    fallback: (c) => `Change by ${c.dim}: the next 12 months against the last 12`,
  },
  /** "The mix barely moves: the largest share shift is North America, −0.27 pts." */
  note: {
    id: "overview.change.note",
    when: (c) => !!c.maxShift && c.rows.length > 1,
    text: (c) => {
      const s = c.maxShift as ChangeRow;
      const a = Math.abs(s.shareDelta);
      const lead = a < 0.01 ? "The mix barely moves" : a < 0.03 ? "The mix shifts" : "The mix shifts markedly";
      return `${lead}: the largest share shift is ${s.label}, ${fmtPts(s.shareDelta, 2)}.`;
    },
    fallback: (c) => (c.rows.length <= 1 ? `The filters fix the ${c.dim}: there is no mix to compare.` : ""),
  },
} satisfies Record<string, Template<ChangeFacts>>;

/** The change-table title: conclusion variants tried in order, then the descriptive fallback. */
export const changeTitle = (c: ChangeFacts): string => renderFirst([CHANGE_TEMPLATES.title, CHANGE_TEMPLATES.broad, CHANGE_TEMPLATES.offset], c).text;

export function changeDek(c: ChangeFacts): string {
  return `Change in ${c.measure === "usd" ? "revenue" : "units"}, next 12 forecast months against the last 12 months of unconstrained demand, by ${c.dim}.${c.measure === "usd" ? " Revenue includes the list-price rise." : ""}`;
}

// ---- top exceptions ---------------------------------------------------------------------------------------
export interface TopFacts {
  n: number;
  shown: number;
  topSum: number;
  total: number;
}
export const TOP_TEMPLATES = {
  /** "Five series hold $9.0M of the $43.1M at risk". */
  title: {
    id: "overview.top",
    when: (t) => t.n > t.shown && t.shown >= 2,
    text: (t) => `${countWord(t.shown, true)} series hold ${fmtMoney(t.topSum, 1)} of the ${fmtMoney(t.total, 1)} at risk`,
    fallback: (t) => (t.n === 0 ? "No exception needs a planner in this selection" : `${cap(countWord(t.n))} ${plural(t.n, "series", "series")} ${t.n === 1 ? "holds" : "hold"} ${fmtMoney(t.total, 1)} of revenue at risk`),
  },
} satisfies Record<string, Template<TopFacts>>;

// ---- small multiples ----------------------------------------------------------------------------------------
export interface OutlookFacts {
  unit: string; // "family" | "region" | "channel"
  units: string; // plural
  items: { label: string; chg: number }[];
}
export const OUTLOOK_TEMPLATES = {
  /** "Every family eases; Powertrain Components falls furthest, −2.7%" / "5 of 7 families grow; ... leads". */
  title: {
    id: "overview.outlook",
    when: (o) => o.items.length >= 2,
    text: (o) => {
      const down = o.items.filter((i) => i.chg < 0);
      const up = o.items.filter((i) => i.chg > 0);
      const worst = o.items.reduce((a, b) => (b.chg < a.chg ? b : a));
      const best = o.items.reduce((a, b) => (b.chg > a.chg ? b : a));
      if (down.length === o.items.length) return `Every ${o.unit} ${worst.chg > -0.05 ? "eases" : "falls"}; ${worst.label} falls furthest, ${fmtSignedPct(worst.chg)}`;
      if (up.length === o.items.length) return `Every ${o.unit} grows; ${best.label} leads, ${fmtSignedPct(best.chg)}`;
      return `${up.length} of ${o.items.length} ${o.units} grow; ${best.label} leads, ${fmtSignedPct(best.chg)}, and ${worst.label} trails, ${fmtSignedPct(worst.chg)}`;
    },
    fallback: (o) => `Outlook by ${o.unit}`,
  },
} satisfies Record<string, Template<OutlookFacts>>;
