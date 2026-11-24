// Procurement plan: safety stock from the forecast's own uncertainty, per SKU (the regions of the selection
// pooled into one stock), and the templates that write the view's sentences.
//
// For a cover of L months starting at the first forecast month, each SKU needs the P_sl quantile of its
// L-month demand total; the buffer (safety stock) is that quantile minus the mean.  Quantiles are the
// contract's lognormal aggregate (data/quantiles.ts): means and the shared level and family x region errors
// are summed BEFORE the quantile, so a total over months is narrower than the sum of monthly quantiles.
// "Naive" stacks the monthly buffers instead; the difference is what pooling over time saves.
// Every SKU keeps its own stock: buffers are summed across SKUs, never pooled across them.
import type { Model } from "../data/model";
import { fmtInt, fmtMoney, fmtNum, fmtPct, fmtPctAbs, monthLong, monthName } from "../data/format";
import { lognormalQuantile, moments, monthlyMoments, zOf } from "../data/quantiles";
import { countWord, type Template } from "./headlines";

export const LEVELS = [
  { value: "0.8", label: "P80" },
  { value: "0.9", label: "P90" },
  { value: "0.95", label: "P95" },
  { value: "0.975", label: "P97.5" },
] as const;
export const LEAD_MAX = 6;

export interface SkuCover {
  sku: number;
  regions: number;
  meanU: number;
  bufU: number;
  naiveU: number;
  meanD: number;
  bufD: number;
  naiveD: number;
}
interface Pair {
  u: number;
  d: number;
}
export interface Plan {
  skus: SkuCover[];
  /** Totals over SKUs for the chosen lead time. */
  tot: { meanU: number; bufU: number; naiveU: number; meanD: number; bufD: number; naiveD: number };
  /** Per forecast month: Σ over SKUs of the mean and of the one-month buffer, units and USD. */
  monthly: { mean: Pair[]; buf: Pair[] };
  /** Lead time 1..LEAD_MAX: Σ buffers, pooled and naive, units and USD. */
  curve: { L: number; buf: Pair; naive: Pair }[];
}

/** One pass over the selection's runs: every SKU's monthly and lead-time quantiles at level `p`. */
export function procurementPlan(m: Model, runs: number[], p: number, L: number): Plan {
  const z = zOf(p);
  const by = new Map<number, number[]>();
  for (const r of runs) {
    const sku = m.sSku[m.rSeries[r]];
    const list = by.get(sku) ?? [];
    list.push(r);
    by.set(sku, list);
  }
  const n = m.nWin;
  const mean: Pair[] = Array.from({ length: n }, () => ({ u: 0, d: 0 }));
  const buf: Pair[] = Array.from({ length: n }, () => ({ u: 0, d: 0 }));
  const curve = Array.from({ length: LEAD_MAX }, (_, k) => ({ L: k + 1, buf: { u: 0, d: 0 }, naive: { u: 0, d: 0 } }));
  const skus: SkuCover[] = [];
  for (const [sku, rs] of by) {
    const mu = monthlyMoments(m, rs, false);
    const md = monthlyMoments(m, rs, true);
    const bu = mu.map((x) => lognormalQuantile(x.M, x.V, z) - x.M);
    const bd = md.map((x) => lognormalQuantile(x.M, x.V, z) - x.M);
    for (let k = 0; k < n; k++) {
      mean[k].u += mu[k].M;
      mean[k].d += md[k].M;
      buf[k].u += bu[k];
      buf[k].d += bd[k];
    }
    let cur: SkuCover | null = null;
    let nu = 0;
    let nd = 0;
    for (let l = 1; l <= LEAD_MAX; l++) {
      nu += bu[l - 1] ?? 0;
      nd += bd[l - 1] ?? 0;
      const last = m.w0 + l - 1;
      const inCover = (t: number) => t >= m.w0 && t <= last;
      const U = moments(m, rs, inCover, false);
      const D = moments(m, rs, inCover, true);
      const qu = lognormalQuantile(U.M, U.V, z) - U.M;
      const qd = lognormalQuantile(D.M, D.V, z) - D.M;
      curve[l - 1].buf.u += qu;
      curve[l - 1].buf.d += qd;
      curve[l - 1].naive.u += nu;
      curve[l - 1].naive.d += nd;
      if (l === L) cur = { sku, regions: rs.length, meanU: U.M, bufU: qu, naiveU: nu, meanD: D.M, bufD: qd, naiveD: nd };
    }
    if (cur) skus.push(cur);
  }
  skus.sort((a, b) => b.bufD - a.bufD);
  const tot = skus.reduce((a, s) => ({ meanU: a.meanU + s.meanU, bufU: a.bufU + s.bufU, naiveU: a.naiveU + s.naiveU, meanD: a.meanD + s.meanD, bufD: a.bufD + s.bufD, naiveD: a.naiveD + s.naiveD }), { meanU: 0, bufU: 0, naiveU: 0, meanD: 0, bufD: 0, naiveD: 0 });
  return { skus, tot, monthly: { mean, buf }, curve };
}

// ---- sentences ----------------------------------------------------------------------------------------------
export interface PlanFacts {
  L: number;
  label: string;
  nSku: number;
  /** The SKU's code when exactly one SKU is in view. */
  oneSku: string | null;
  from: string;
  to: string;
  tot: Plan["tot"];
  savingD: number;
  savingPct: number;
}

export function planFacts(m: Model, plan: Plan, L: number, label: string): PlanFacts {
  const t = plan.tot;
  return {
    L,
    label,
    nSku: plan.skus.length,
    oneSku: plan.skus.length === 1 ? m.dims.skus.id[plan.skus[0].sku] : null,
    from: m.months[m.w0],
    to: m.months[m.w0 + L - 1],
    tot: t,
    savingD: t.naiveD - t.bufD,
    savingPct: t.naiveD > 0 ? (t.naiveD - t.bufD) / t.naiveD : 0,
  };
}

const months = (L: number) => (L === 1 ? "one-month" : `${L}-month`);
const coverWords = (f: PlanFacts) => (f.L === 1 ? monthLong(f.from) : `${monthLong(f.from)} to ${monthLong(f.to)}`);
const who = (f: PlanFacts) => (f.oneSku ? f.oneSku : `the ${fmtInt(f.nSku)} SKUs in view`);

export const PLAN_TEMPLATES = {
  /** "Pooling 3 months cuts the P90 safety stock by 32%" (against stacking the monthly P90 buffers). */
  headline: {
    id: "procurement.headline",
    when: (f) => f.L >= 2 && f.tot.bufD > 0 && f.savingPct >= 0.005,
    text: (f) => `Pooling ${f.L} months cuts the ${f.label} safety stock by ${fmtPctAbs(f.savingPct, 0)}`,
    fallback: (f) => (f.tot.meanU > 0 ? `A ${months(f.L)} ${f.label} cover needs ${fmtMoney(f.tot.bufD, 1)} of safety stock` : "No forecast demand to cover in this selection"),
  },
  /** "The first order, covering November 2026 to January 2027, needs 41.2K units above a mean of 450K to
   *   reach P90 for the 520 SKUs in view; summing monthly P90s would ask for 59.8K." */
  standfirst: {
    id: "procurement.standfirst",
    when: (f) => f.tot.meanU > 0,
    text: (f) =>
      `The first order, covering ${coverWords(f)}, needs **${fmtNum(f.tot.bufU)} units** above a mean of ${fmtNum(f.tot.meanU)} to reach ${f.label} for ${who(f)}${
        f.L >= 2 ? ` when the ${countWord(f.L)} months are planned as one total; stacking the monthly ${f.label} buffers would ask for ${fmtNum(f.tot.naiveU)} units` : ""
      }. Gross requirements only: no inventory positions are provided.`,
    fallback: () => `No forecast rows fall in this selection: the account is lost, or the SKU has no forecast. Widen the filters to plan a cover.`,
  },
} satisfies Record<string, Template<PlanFacts>>;

export interface MonthlyFacts {
  label: string;
  share: number;
  peak: string | null;
  peakValue: string;
  meanSum: number;
}
export const MONTHLY_TEMPLATES = {
  /** "P90 adds 18.4% on top of mean demand; March 2027 needs the most, 168K units". */
  title: {
    id: "procurement.monthly",
    when: (f) => f.meanSum > 0 && f.peak !== null,
    text: (f) => `${f.label} adds ${fmtPct(f.share)} on top of mean demand; ${monthName(f.peak as string)} needs the most, ${f.peakValue}`,
    fallback: (f) => `Mean demand and the buffer to ${f.label}, month by month`,
  },
} satisfies Record<string, Template<MonthlyFacts>>;

export interface CurveFacts {
  label: string;
  pct: number[]; // saving share at L = 1..LEAD_MAX: 1 - pooled / summed (the headline's "cuts ... by")
  L: number; // the lead time being planned
}
export const CURVE_TEMPLATES = {
  /** "Pooling saves more the longer the lead time: 22% at two months, 31% at three, 42% at six" — the same
   *  saving (share of the summed monthly buffers) the headline cuts by. */
  title: {
    id: "procurement.curve",
    when: (c) => c.pct.length >= 3 && c.pct.slice(1).every((v, i) => v >= c.pct[i] - 1e-9) && c.pct[c.pct.length - 1] > 0.005,
    text: (c) => {
      const n = c.pct.length;
      const k = c.pct.findIndex((v, i) => i > 0 && v >= 0.005);
      const pts: number[] = [];
      if (k > 0 && k < n - 1) pts.push(k);
      if (c.L - 1 > k && c.L - 1 < n - 1) pts.push(c.L - 1);
      pts.push(n - 1);
      const words = pts.map((i, j) => `${fmtPctAbs(c.pct[i], 0)} at ${countWord(i + 1)}${j === 0 ? " months" : ""}`);
      return `Pooling saves more the longer the lead time: ${words.join(", ")}`;
    },
    fallback: (c) => `Safety stock by lead time: the ${c.label} of the total against summed monthly ${c.label}s`,
  },
} satisfies Record<string, Template<CurveFacts>>;

export interface SkuFacts {
  n: number;
  half: number;
  total: number;
  oneSku: string | null;
  oneBufU: number;
}
export const SKU_TEMPLATES = {
  /** "41 of 520 SKUs hold half of the $8.12M safety stock". */
  title: {
    id: "procurement.skus",
    when: (s) => s.n >= 4 && s.half < s.n / 2,
    text: (s) => `${fmtInt(s.half)} of ${fmtInt(s.n)} SKUs hold half of the ${fmtMoney(s.total, 1)} safety stock`,
    fallback: (s) => (s.n === 0 ? "No SKU to plan in this selection" : s.oneSku ? `${s.oneSku} needs ${fmtNum(s.oneBufU)} units of safety stock for this cover` : `${countWord(s.n, true)} SKUs ranked by safety-stock value`),
  },
} satisfies Record<string, Template<SkuFacts>>;
