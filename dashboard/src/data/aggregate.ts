// Sums over a selection: history by month (shipped, unconstrained, latent, flag counts) and forecast by month
// (submitted units, mean, quantiles of the aggregate). Everything is an exact sum of bundle cells.
import type { ForecastDetail } from "./types";
import type { Measure, Model } from "./model";
import { historyPrice } from "./model";
import { lognormalQuantile, monthlyMoments, Z10, Z90 } from "./quantiles";

export interface HistoryAgg {
  shipped: Float64Array; // Σ shipped units (unknown cells skipped)
  demand: Float64Array; // Σ unconstrained demand (gap-filled)
  latent: Float64Array; // Σ latent monthly demand
  cells: Int32Array;
  imputed: Int32Array;
  missing: Int32Array;
  /** Cells whose units stay unknown (ERP blanks: units_unknown outside rebuilt rows), one variable with repairFacts. */
  unknown: Int32Array;
  stockout: Int32Array;
  oneOff: Int32Array;
  fixed: Int32Array;
  zeros: Int32Array; // cells with zero demand
  structZeros: Int32Array; // of which scheduled (off-phase or lost-account tail)
  shippedKnown: Int32Array; // cells with known shipments
  unknownDemand: Float64Array; // Σ demand on cells whose shipments are unknown (ERP blanks): not lost sales
}

export function historyAgg(m: Model, segs: number[], measure: Measure): HistoryAgg {
  const n = m.asOf + 1;
  const out: HistoryAgg = {
    shipped: new Float64Array(n),
    demand: new Float64Array(n),
    latent: new Float64Array(n),
    cells: new Int32Array(n),
    imputed: new Int32Array(n),
    missing: new Int32Array(n),
    unknown: new Int32Array(n),
    stockout: new Int32Array(n),
    oneOff: new Int32Array(n),
    fixed: new Int32Array(n),
    zeros: new Int32Array(n),
    structZeros: new Int32Array(n),
    shippedKnown: new Int32Array(n),
    unknownDemand: new Float64Array(n),
  };
  const b = m.bit;
  const so = b.stockout_listed | b.stockout_inferred;
  const sz = b.structural_zero | b.lost_tail;
  const usd = measure === "usd";
  for (const g of segs) {
    const sku = m.sSku[m.gSeries[g]];
    const o = m.gOff[g];
    for (let k = 0; k < m.gLen[g]; k++) {
      const t = m.gStart[g] + k;
      const i = o + k;
      const w = usd ? historyPrice(m, sku, t) : 1;
      const fl = m.f[i];
      const u = m.u[i];
      if (u === u) {
        out.shipped[t] += w * u;
        out.shippedKnown[t]++;
      } else out.unknownDemand[t] += w * m.d[i];
      out.demand[t] += w * m.d[i];
      out.latent[t] += w * m.latent[i];
      out.cells[t]++;
      if (fl & b.imputed) out.imputed[t]++;
      if (fl & b.missing_row) out.missing[t]++;
      else if (fl & b.units_unknown) out.unknown[t]++;
      if (fl & so) out.stockout[t]++;
      if (fl & b.one_off) out.oneOff[t]++;
      if (fl & b.numeric_fix) out.fixed[t]++;
      if (m.d[i] === 0) {
        out.zeros[t]++;
        if (fl & sz) out.structZeros[t]++;
      }
    }
  }
  return out;
}

export interface ForecastAgg {
  fc: Float64Array; // Σ submitted forecast (integers), or USD at the forecast's prices
  mean: Float64Array;
  p10: Float64Array;
  p50: Float64Array;
  p90: Float64Array;
  zeros: Int32Array; // structural-zero rows
  rows: Int32Array;
}

export function forecastAgg(m: Model, runs: number[], measure: Measure): ForecastAgg {
  const n = m.nWin;
  const usd = measure === "usd";
  const out: ForecastAgg = {
    fc: new Float64Array(n),
    mean: new Float64Array(n),
    p10: new Float64Array(n),
    p50: new Float64Array(n),
    p90: new Float64Array(n),
    zeros: new Int32Array(n),
    rows: new Int32Array(n),
  };
  for (const r of runs) {
    const o = m.rOff[r];
    for (let k = 0; k < m.rLen[r]; k++) {
      const t = m.rStart[r] + k - m.w0;
      const w = usd ? m.price[o + k] : 1;
      out.fc[t] += w * m.fc[o + k];
      out.mean[t] += w * m.mean[o + k];
      out.rows[t]++;
      if (m.zero[o + k] > 0) out.zeros[t]++;
    }
  }
  const mom = monthlyMoments(m, runs, usd);
  for (let t = 0; t < n; t++) {
    out.p10[t] = lognormalQuantile(mom[t].M, mom[t].V, Z10);
    out.p50[t] = lognormalQuantile(mom[t].M, mom[t].V, 0);
    out.p90[t] = lognormalQuantile(mom[t].M, mom[t].V, Z90);
  }
  return out;
}

/** Σ latent monthly demand of the forecast (needs forecast_detail.json). */
export function forecastLatent(m: Model, runs: number[], detail: ForecastDetail, measure: Measure): Float64Array {
  const out = new Float64Array(m.nWin);
  const usd = measure === "usd";
  for (const r of runs) {
    const o = m.rOff[r];
    for (let k = 0; k < m.rLen[r]; k++) {
      out[m.rStart[r] + k - m.w0] += (usd ? m.price[o + k] : 1) * detail.latent_mean[o + k];
    }
  }
  return out;
}

export function sum(a: ArrayLike<number>, from = 0, to = a.length): number {
  let s = 0;
  for (let i = from; i < to; i++) s += a[i];
  return s;
}
