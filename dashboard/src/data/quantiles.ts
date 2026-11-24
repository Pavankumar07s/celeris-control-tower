// Quantiles of any aggregate of forecast rows: exact port of the contract formula (docs/architecture.md),
// reference implementation src/celeris/export/quantiles.py.
//   M = Σ mean
//   V = Σ var_noise + Σ_series (cv_level × Σ series' selected means)² + Σ_groups (cv_group × Σ family×region's selected means)²
//       + (cv_common × M)²   (the market-wide shock every row shares)
//   σ² = ln(1 + V/M²), μ = ln M − σ²/2, Pq = exp(μ + z_q σ)   (0 when M = 0)
// An optional per-row weight (the row's price) gives the same construction in USD.
import type { Filters, Model } from "./model";
import { selectRuns } from "./model";

export const Z10 = -1.2815515655446004;
export const Z90 = 1.2815515655446004;

export function lognormalQuantile(M: number, V: number, z: number): number {
  if (!(M > 0)) return 0;
  const s2 = Math.log1p(V / (M * M));
  return Math.exp(Math.log(M) - s2 / 2 + z * Math.sqrt(s2));
}

/** Inverse standard-normal CDF (Acklam's rational approximation, |error| < 1.2e-9). */
export function zOf(p: number): number {
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425;
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - lo) return -zOf(1 - p);
  const q = p - 0.5;
  const r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

export interface Moments {
  M: number;
  V: number;
}

/** Moments of the sum over `runs` and the months for which `inMonth` is true (weights: row price for USD). */
export function moments(m: Model, runs: number[], inMonth: (month: number) => boolean, usd = false, meanOverride?: Float64Array): Moments {
  const mean = meanOverride ?? m.mean;
  const groupSum = new Float64Array(m.groupCv.length);
  let M = 0;
  let V = 0;
  for (const r of runs) {
    let s = 0;
    const o = m.rOff[r];
    for (let k = 0; k < m.rLen[r]; k++) {
      const month = m.rStart[r] + k;
      if (!inMonth(month)) continue;
      const w = usd ? m.price[o + k] : 1;
      s += w * mean[o + k];
      V += w * w * m.varn[o + k];
    }
    M += s;
    const c = m.rCvl[r] * s;
    V += c * c;
    groupSum[m.rGroup[r]] += s;
  }
  for (let g = 0; g < groupSum.length; g++) {
    const c = m.groupCv[g] * groupSum[g];
    V += c * c;
  }
  V += (m.cvCommon * M) ** 2;
  return { M, V };
}

/** Per-month moments for the 19 forecast months in one pass. */
export function monthlyMoments(m: Model, runs: number[], usd = false, meanOverride?: Float64Array): Moments[] {
  const mean = meanOverride ?? m.mean;
  const nG = m.groupCv.length;
  const n = m.nWin;
  const M = new Float64Array(n);
  const V = new Float64Array(n);
  const G = new Float64Array(nG * n);
  for (const r of runs) {
    const o = m.rOff[r];
    const cv = m.rCvl[r];
    const g = m.rGroup[r];
    for (let k = 0; k < m.rLen[r]; k++) {
      const t = m.rStart[r] + k - m.w0;
      const w = usd ? m.price[o + k] : 1;
      const x = w * mean[o + k];
      M[t] += x;
      V[t] += w * w * m.varn[o + k] + cv * x * (cv * x);
      G[g * n + t] += x;
    }
  }
  for (let g = 0; g < nG; g++) {
    const cv = m.groupCv[g];
    for (let t = 0; t < n; t++) {
      const c = cv * G[g * n + t];
      V[t] += c * c;
    }
  }
  return Array.from({ length: n }, (_, t) => ({ M: M[t], V: V[t] + (m.cvCommon * M[t]) ** 2 }));
}

export interface SelfCheckResult {
  passed: number;
  total: number;
  worst: number;
}

/** Re-run the pipeline's own aggregate quantiles (meta.quantile_selfcheck) through this port. */
export function runSelfCheck(m: Model): SelfCheckResult {
  const d = m.dims;
  let passed = 0;
  let worst = 0;
  for (const c of m.meta.quantile_selfcheck) {
    const f: Filters = {
      family: c.family ? d.families.name.indexOf(c.family) : null,
      sku: c.sku ? d.skus.id.indexOf(c.sku) : null,
      region: c.region ? d.regions.indexOf(c.region) : null,
      channel: c.channel ? d.channels.indexOf(c.channel) : null,
      customer: c.customer ? d.customers.indexOf(c.customer) : null,
    };
    const months = new Set(c.months);
    const { M, V } = moments(m, selectRuns(m, f), (x) => months.has(x));
    const got = [lognormalQuantile(M, V, Z10), lognormalQuantile(M, V, 0), lognormalQuantile(M, V, Z90)];
    const want = [c.p10, c.p50, c.p90];
    const err = Math.max(...got.map((g, i) => Math.abs(g - want[i]) / Math.max(1, Math.abs(want[i]))));
    worst = Math.max(worst, err);
    if (err < 1e-6) passed++;
  }
  return { passed, total: m.meta.quantile_selfcheck.length, worst };
}
