// In-memory model built once from the start-up files: typed arrays over series, history segments and forecast runs.
import type { Dims, ForecastFile, HistoryFile, Meta } from "./types";

export interface Filters {
  family: number | null;
  sku: number | null;
  region: number | null;
  channel: number | null;
  customer: number | null;
}

export const NO_FILTERS: Filters = { family: null, sku: null, region: null, channel: null, customer: null };
export type Measure = "units" | "usd";
export type Lens = "orders" | "latent";

export interface Model {
  meta: Meta;
  dims: Dims;
  months: string[];
  nMonths: number;
  asOf: number; // last history month index (2026-10 = 93)
  w0: number; // first forecast month index
  nWin: number; // forecast months (19)
  bit: Record<string, number>; // flag masks
  accumMask: number;
  // series
  nSeries: number;
  sSku: Int32Array;
  sFamily: Int32Array;
  sRegion: Int32Array;
  sChannel: Int32Array;
  sCustomer: Int32Array;
  sStart: Int32Array;
  sEnd: Int32Array;
  skuFamily: Int32Array;
  // history segments (series x customer run) and flat cell arrays
  nSeg: number;
  gSeries: Int32Array;
  gCustomer: Int32Array;
  gStart: Int32Array;
  gLen: Int32Array;
  gOff: Int32Array;
  segOfSeries: number[][];
  u: Float64Array; // shipped units, NaN where unknown
  d: Float64Array; // unconstrained demand (demand_filled)
  latent: Float64Array; // latent monthly demand: each order spread over the months it carries
  f: Int32Array; // flag word
  // forecast runs (one per test series)
  nRun: number;
  rSeries: Int32Array;
  rStart: Int32Array;
  rLen: Int32Array;
  rOff: Int32Array;
  rCvl: Float64Array;
  rGroup: Int32Array;
  groupCv: Float64Array;
  /** Market-wide coefficient of variation (0 for a bundle written before it existed). */
  cvCommon: number;
  groupFamily: Int32Array;
  groupRegion: Int32Array;
  runOfSeries: Int32Array;
  fc: Float64Array;
  mean: Float64Array;
  varn: Float64Array;
  zero: Int8Array;
  price: Float64Array;
  zeroReasons: string[];
}

export function monthLabels(first: string, count: number): string[] {
  const [y0, m0] = first.split("-").map(Number);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const k = (m0 - 1) + i;
    out.push(`${y0 + Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, "0")}`);
  }
  return out;
}

function i32(a: (number | null)[]): Int32Array {
  const out = new Int32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] ?? -1;
  return out;
}

export function buildModel(meta: Meta, dims: Dims, hist: HistoryFile, fcf: ForecastFile): Model {
  const months = monthLabels(dims.months.first, dims.months.count);
  const bit: Record<string, number> = {};
  for (const [k, v] of Object.entries(dims.flag_bits)) bit[k] = 1 << v;
  const skuFamily = i32(dims.skus.family);
  const sSku = i32(dims.series.sku);
  const nSeries = sSku.length;
  const sFamily = new Int32Array(nSeries);
  for (let s = 0; s < nSeries; s++) sFamily[s] = skuFamily[sSku[s]];

  const nSeg = dims.segments.series.length;
  const gLen = i32(dims.segments.length);
  const gOff = new Int32Array(nSeg);
  let off = 0;
  for (let g = 0; g < nSeg; g++) {
    gOff[g] = off;
    off += gLen[g];
  }
  const gSeries = i32(dims.segments.series);
  const segOfSeries: number[][] = Array.from({ length: nSeries }, () => []);
  for (let g = 0; g < nSeg; g++) segOfSeries[gSeries[g]].push(g);

  const nCells = hist.u.length;
  const u = new Float64Array(nCells);
  const d = new Float64Array(nCells);
  for (let i = 0; i < nCells; i++) {
    const v = hist.u[i];
    u[i] = v === null ? NaN : v;
    d[i] = v === null ? NaN : v;
  }
  let pos = 0;
  for (let k = 0; k < hist.d_gap.length; k++) {
    pos += hist.d_gap[k];
    d[pos] = hist.d_val[k];
  }
  const f = Int32Array.from(hist.f);
  const accumMask = dims.accum_mask;
  const halfBit = bit.half_carry;
  const onBit = bit.on_phase;
  // latent monthly demand: an order carrying k months (weights 1 for its own month, carry weight for the others)
  // spreads as L = order / (1 + (k-1) x w) on each carried month; segments of a series are contiguous.
  const latent = new Float64Array(nCells);
  for (let s = 0; s < nSeries; s++) {
    const segs = segOfSeries[s];
    if (!segs.length) continue;
    const a = gOff[segs[0]];
    const b = gOff[segs[segs.length - 1]] + gLen[segs[segs.length - 1]];
    for (let i = a; i < b; i++) {
      const span = f[i] & accumMask;
      if (!(f[i] & onBit) || span === 0) continue;
      const w = f[i] & halfBit ? 0.5 : 1;
      const level = d[i] / (1 + (span - 1) * w);
      for (let j = 0; j < span && i - j >= a; j++) latent[i - j] += level;
    }
  }

  const nRun = fcf.series.length;
  const rLen = i32(fcf.length);
  const rOff = new Int32Array(nRun);
  off = 0;
  for (let r = 0; r < nRun; r++) {
    rOff[r] = off;
    off += rLen[r];
  }
  const rSeries = i32(fcf.series);
  const runOfSeries = new Int32Array(nSeries).fill(-1);
  for (let r = 0; r < nRun; r++) runOfSeries[rSeries[r]] = r;

  return {
    meta,
    dims,
    months,
    nMonths: months.length,
    asOf: dims.months.as_of,
    w0: dims.months.window[0],
    nWin: dims.months.window[1] - dims.months.window[0] + 1,
    bit,
    accumMask,
    nSeries,
    sSku,
    sFamily,
    sRegion: i32(dims.series.region),
    sChannel: i32(dims.series.channel),
    sCustomer: i32(dims.series.customer),
    sStart: i32(dims.series.start),
    sEnd: i32(dims.series.end),
    skuFamily,
    nSeg,
    gSeries,
    gCustomer: i32(dims.segments.customer),
    gStart: i32(dims.segments.start),
    gLen,
    gOff,
    segOfSeries,
    u,
    d,
    latent,
    f,
    nRun,
    rSeries,
    rStart: i32(fcf.start),
    rLen,
    rOff,
    rCvl: Float64Array.from(fcf.cv_level),
    rGroup: i32(fcf.group),
    groupCv: Float64Array.from(fcf.groups.cv_group),
    cvCommon: fcf.cv_common ?? 0,
    groupFamily: i32(fcf.groups.family),
    groupRegion: i32(fcf.groups.region),
    runOfSeries,
    fc: Float64Array.from(fcf.forecast),
    mean: Float64Array.from(fcf.mean),
    varn: Float64Array.from(fcf.var_noise),
    zero: Int8Array.from(fcf.zero_reason),
    price: Float64Array.from(fcf.price),
    zeroReasons: fcf.zero_reasons,
  };
}

/** Invoice price of a SKU in a history month (2022 H2 carries the surcharge); NaN when the SKU had no price. */
export function historyPrice(m: Model, sku: number, month: number): number {
  const p = m.dims.prices;
  const year = 2019 + Math.floor(month / 12);
  const col = year === 2022 && month % 12 >= 6 ? p.h2_2022_column : year - p.years[0];
  const v = p.values[sku * p.width + col];
  return v === null ? NaN : v;
}

export function seriesMatches(m: Model, s: number, f: Filters): boolean {
  return (
    (f.family === null || m.sFamily[s] === f.family) &&
    (f.sku === null || m.sSku[s] === f.sku) &&
    (f.region === null || m.sRegion[s] === f.region) &&
    (f.channel === null || m.sChannel[s] === f.channel)
  );
}

/** History segments in the selection (customer at time). */
export function selectSegments(m: Model, f: Filters): number[] {
  const out: number[] = [];
  for (let g = 0; g < m.nSeg; g++) {
    const s = m.gSeries[g];
    if (seriesMatches(m, s, f) && (f.customer === null || m.gCustomer[g] === f.customer)) out.push(g);
  }
  return out;
}

/** Forecast runs in the selection (customer of the test row). */
export function selectRuns(m: Model, f: Filters): number[] {
  const out: number[] = [];
  for (let r = 0; r < m.nRun; r++) {
    const s = m.rSeries[r];
    if (seriesMatches(m, s, f) && (f.customer === null || m.sCustomer[s] === f.customer)) out.push(r);
  }
  return out;
}

/** Series in the selection: matching attributes and, with a customer filter, any history or test customer. */
export function selectSeries(m: Model, f: Filters): number[] {
  const out: number[] = [];
  for (let s = 0; s < m.nSeries; s++) {
    if (!seriesMatches(m, s, f)) continue;
    if (f.customer !== null && m.sCustomer[s] !== f.customer && !m.segOfSeries[s].some((g) => m.gCustomer[g] === f.customer)) continue;
    out.push(s);
  }
  return out;
}

export function filterLabel(m: Model, f: Filters): string {
  const parts: string[] = [];
  if (f.sku !== null) parts.push(m.dims.skus.id[f.sku]);
  else if (f.family !== null) parts.push(m.dims.families.name[f.family]);
  if (f.region !== null) parts.push(m.dims.regions[f.region]);
  if (f.channel !== null) parts.push(m.dims.channels[f.channel]);
  if (f.customer !== null) parts.push(m.dims.customers[f.customer]);
  return parts.length ? parts.join(" · ") : "All families, regions, channels and customers";
}

/** The single series selected by the filters, if exactly one matches. */
export function singleSeries(m: Model, f: Filters): number | null {
  if (f.sku === null || f.region === null) return null;
  const sel = selectSeries(m, f);
  return sel.length === 1 ? sel[0] : null;
}
