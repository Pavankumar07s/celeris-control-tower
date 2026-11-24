// Monthly sums broken down by one dimension (family, region or channel) for the current selection:
// unconstrained demand by history month and submitted forecast by window month.  Exact sums of bundle cells.
import type { Filters, Measure, Model } from "./model";
import { historyPrice, selectRuns, selectSegments } from "./model";

export type BreakdownDim = "family" | "region" | "channel";

export interface Breakdown {
  dim: BreakdownDim;
  labels: string[];
  /** Unconstrained demand per entity, months 0..asOf. */
  hist: Float64Array[];
  /** Submitted forecast per entity, window months 0..nWin-1. */
  fc: Float64Array[];
}

export function dimLabels(m: Model, dim: BreakdownDim): string[] {
  return dim === "family" ? m.dims.families.name : dim === "region" ? m.dims.regions : m.dims.channels;
}

export function breakdown(m: Model, f: Filters, dim: BreakdownDim, measure: Measure): Breakdown {
  const labels = dimLabels(m, dim);
  const key = (s: number) => (dim === "family" ? m.sFamily[s] : dim === "region" ? m.sRegion[s] : m.sChannel[s]);
  const usd = measure === "usd";
  const hist = labels.map(() => new Float64Array(m.asOf + 1));
  const fc = labels.map(() => new Float64Array(m.nWin));
  for (const g of selectSegments(m, f)) {
    const s = m.gSeries[g];
    const sku = m.sSku[s];
    const h = hist[key(s)];
    const o = m.gOff[g];
    for (let k = 0; k < m.gLen[g]; k++) {
      const t = m.gStart[g] + k;
      h[t] += m.d[o + k] * (usd ? historyPrice(m, sku, t) : 1);
    }
  }
  for (const r of selectRuns(m, f)) {
    const s = m.rSeries[r];
    const a = fc[key(s)];
    const o = m.rOff[r];
    for (let k = 0; k < m.rLen[r]; k++) a[m.rStart[r] + k - m.w0] += m.fc[o + k] * (usd ? m.price[o + k] : 1);
  }
  return { dim, labels, hist, fc };
}

/** Shares of the last 12 actual months vs the next 12 forecast months (the briefing's mix input). */
export function sharesOf(m: Model, b: Breakdown): { dim: BreakdownDim; labels: string[]; last: number[]; next: number[]; lastAbs: number[]; nextAbs: number[] } {
  const lastAbs = b.hist.map((h) => {
    let s = 0;
    for (let t = m.asOf - 11; t <= m.asOf; t++) s += h[t];
    return s;
  });
  const nextAbs = b.fc.map((a) => {
    let s = 0;
    for (let k = 0; k < Math.min(12, a.length); k++) s += a[k];
    return s;
  });
  const tl = lastAbs.reduce((x, y) => x + y, 0) || 1;
  const tn = nextAbs.reduce((x, y) => x + y, 0) || 1;
  return { dim: b.dim, labels: b.labels, last: lastAbs.map((x) => x / tl), next: nextAbs.map((x) => x / tn), lastAbs, nextAbs };
}
