// Forecast & accuracy: backtest facts for the current selection and the templates that turn them into the
// headline, standfirst and module titles (the pattern of insights/headlines.ts).  Every number is an exact
// sum over backtest.json: WAPE = Σ|a − f| / Σa, bias = Σ(f − a) / Σa, over scored series-months, pooled over
// the rolling origins.  Never an average of series WAPEs.
//
// Every model is scored on the same cells: the decision folds that chose the model (the 2021-10 stress fold is
// replayed in the time machine but never pooled) and only cells every model forecast (the export guarantees it).
import type { BacktestFile } from "../data/types";
import { seriesMatches, type Filters, type Model } from "../data/model";
import { fmtInt, fmtPct, fmtPctAbs, fmtSignedPct, monthLong } from "../data/format";
import { joinList, type SelectionWords, type Template } from "./headlines";

// ---- printed precision: every difference on screen is the difference of the printed values -------------------
/** A rate as printed by fmtPct (one decimal of a percent), back as a number of percent: 0.26275 -> 26.3. */
export const shownPct = (x: number): number => Number((x * 100).toFixed(1));
/** Points between two printed rates (a − b), rounded first: 38.6 − 26.3 = 12.3, never 12.348 -> "12.3" by luck. */
export const ptsBetween = (a: number, b: number): number => Math.round((shownPct(a) - shownPct(b)) * 10) / 10;
/** The same difference as a fraction, for fmtPts. */
export const fracBetween = (a: number, b: number): number => ptsBetween(a, b) / 100;
/** "12.3 points" from two rates, rounded first. */
export const ptsText = (a: number, b: number): string => `${Math.abs(ptsBetween(a, b)).toFixed(1)} points`;
/** Largest-remainder rounding of shares that add to 1, to one decimal of a percent: the printed parts add to 100.0. */
export function shares100(parts: number[]): number[] {
  const tenths = parts.map((p) => (Number.isFinite(p) ? p * 1000 : 0));
  const base = tenths.map(Math.floor);
  let left = Math.round(tenths.reduce((a, b) => a + b, 0)) - base.reduce((a, b) => a + b, 0);
  const order = tenths.map((t, i) => [t - Math.floor(t), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (left <= 0) break;
    base[i] += 1;
    left--;
  }
  return base.map((b) => b / 1000);
}

export const CHAIN = ["naive", "seasonal_naive", "cycle_aware"] as const;
export const INTERMITTENT = ["croston", "sba", "tsb", "adida", "imapa", "moving_average"] as const;
/** Challengers that lost the model selection (named beside the value-added chain, scored on the same cells). */
export const CHALLENGERS = ["gbm", "ensemble"] as const;
const LABELS: Record<string, string> = {
  naive: "Naive",
  seasonal_naive: "Seasonal naive",
  cycle_aware: "Cycle-aware naive",
  croston: "Croston",
  sba: "SBA",
  tsb: "TSB",
  adida: "ADIDA",
  imapa: "IMAPA",
  moving_average: "Moving average",
  oracle: "In-hindsight floor",
  gbm: "Global GBM",
  ensemble: "Ensemble",
};
export const modelLabel = (md: string, final: string): string => (md === final ? "Our model" : (LABELS[md] ?? md.replace(/_/g, " ")));

/** Series in the selection (the customer filter keeps the series' test customer). */
export const inSel = (m: Model, f: Filters, s: number): boolean => seriesMatches(m, s, f) && (f.customer === null || m.sCustomer[s] === f.customer);

export interface Acc {
  actual: number;
  n: number;
  abs: Record<string, number>;
  err: Record<string, number>;
}

/** Pooled error sums over the series_buckets rows that pass `keep`. */
export function accuracy(bt: BacktestFile, models: string[], keep: (s: number) => boolean): Acc {
  const sb = bt.series_buckets;
  const out: Acc = { actual: 0, n: 0, abs: {}, err: {} };
  for (const md of models) {
    out.abs[md] = 0;
    out.err[md] = 0;
  }
  for (let i = 0; i < sb.series.length; i++) {
    if (!keep(sb.series[i])) continue;
    out.actual += sb.actual[i];
    out.n += sb.n[i];
    for (const md of models) {
      out.abs[md] += sb.abs[md]?.[i] ?? 0;
      out.err[md] += sb.err[md]?.[i] ?? 0;
    }
  }
  return out;
}
export const wapeOf = (a: Acc, md: string): number => (a.actual > 0 ? a.abs[md] / a.actual : NaN);
export const biasOf = (a: Acc, md: string): number => (a.actual > 0 ? a.err[md] / a.actual : NaN);

/** The models this view ranks: the benchmark chain, our model, the oracle floor and the intermittent methods. */
export function rankedModels(bt: BacktestFile): string[] {
  const want = [...CHAIN, bt.final, "oracle", ...INTERMITTENT, ...CHALLENGERS];
  return want.filter((md, i) => bt.models.includes(md) && want.indexOf(md) === i);
}

// ---- accuracy by segment (family / region / channel) --------------------------------------------------
export type SegDim = "family" | "region" | "channel";
export interface SegRow {
  label: string;
  idx: number;
  actual: number;
  share: number;
  w: number; // our model
  ws: number; // seasonal naive
  b: number; // bias, our model
  floor: number; // in-hindsight oracle
}

export function segments(m: Model, bt: BacktestFile, f: Filters, dim: SegDim): SegRow[] {
  const sb = bt.series_buckets;
  const labels = dim === "family" ? m.dims.families.name : dim === "region" ? m.dims.regions : m.dims.channels;
  const key = (s: number) => (dim === "family" ? m.sFamily[s] : dim === "region" ? m.sRegion[s] : m.sChannel[s]);
  const g: Filters = { ...f, [dim]: null, ...(dim === "family" ? { sku: null } : {}) };
  const A = new Float64Array(labels.length);
  const F = new Float64Array(labels.length);
  const S = new Float64Array(labels.length);
  const E = new Float64Array(labels.length);
  const O = new Float64Array(labels.length);
  const hasOracle = bt.models.includes("oracle");
  for (let i = 0; i < sb.series.length; i++) {
    const s = sb.series[i];
    if (!inSel(m, g, s)) continue;
    const k = key(s);
    A[k] += sb.actual[i];
    F[k] += sb.abs[bt.final][i] ?? 0;
    S[k] += sb.abs.seasonal_naive?.[i] ?? 0;
    E[k] += sb.err[bt.final][i] ?? 0;
    if (hasOracle) O[k] += sb.abs.oracle[i] ?? 0;
  }
  const tot = A.reduce((a, b) => a + b, 0) || 1;
  return labels
    .map((label, idx) => ({ label, idx, actual: A[idx], share: A[idx] / tot, w: F[idx] / A[idx], ws: S[idx] / A[idx], b: E[idx] / A[idx], floor: hasOracle ? O[idx] / A[idx] : NaN }))
    .filter((r) => r.actual > 0)
    .sort((a, b) => b.w - a.w);
}

// ---- WAPE by horizon -------------------------------------------------------------------------------------
export interface HorizonData {
  fine: boolean;
  xs: string[];
  /** WAPE per horizon and model. */
  w: Record<string, (number | null)[]>;
  /** Signed bias per horizon and model, Σ(f − a) / Σa. */
  b: Record<string, (number | null)[]>;
}

export function horizonData(m: Model, bt: BacktestFile, f: Filters, models: string[]): HorizonData {
  const fine = f.sku === null && f.customer === null;
  const w: Record<string, (number | null)[]> = {};
  const b: Record<string, (number | null)[]> = {};
  const n = fine ? 19 : bt.buckets.length;
  const a = new Float64Array(n);
  const abs: Record<string, Float64Array> = {};
  const err: Record<string, Float64Array> = {};
  for (const md of models) {
    abs[md] = new Float64Array(n);
    err[md] = new Float64Array(n);
  }
  if (fine) {
    const F = bt.fine;
    for (let i = 0; i < F.horizon.length; i++) {
      if ((f.family !== null && F.family[i] !== f.family) || (f.region !== null && F.region[i] !== f.region) || (f.channel !== null && F.channel[i] !== f.channel)) continue;
      const h = F.horizon[i] - 1;
      a[h] += F.actual[i];
      for (const md of models) {
        abs[md][h] += F.abs[md]?.[i] ?? 0;
        err[md][h] += F.err[md]?.[i] ?? 0;
      }
    }
  } else {
    const sb = bt.series_buckets;
    for (let i = 0; i < sb.series.length; i++) {
      if (!inSel(m, f, sb.series[i])) continue;
      a[sb.bucket[i]] += sb.actual[i];
      for (const md of models) {
        abs[md][sb.bucket[i]] += sb.abs[md]?.[i] ?? 0;
        err[md][sb.bucket[i]] += sb.err[md]?.[i] ?? 0;
      }
    }
  }
  for (const md of models) {
    w[md] = Array.from(abs[md], (x, i) => (a[i] > 0 ? x / a[i] : null));
    b[md] = Array.from(err[md], (x, i) => (a[i] > 0 ? x / a[i] : null));
  }
  return { fine, xs: fine ? Array.from({ length: n }, (_, i) => String(i + 1)) : bt.buckets.map(([lo, hi]) => `${lo}–${hi}`), w, b };
}

// ---- bias by family x region ---------------------------------------------------------------------------------
export function biasGrid(m: Model, bt: BacktestFile, f: Filters): { fam: number; reg: number; bias: number | null; actual: number }[] {
  const nf = m.dims.families.code.length;
  const nr = m.dims.regions.length;
  const err = new Float64Array(nf * nr);
  const act = new Float64Array(nf * nr);
  const sb = bt.series_buckets;
  const g: Filters = { ...f, family: null, region: null, sku: null };
  for (let i = 0; i < sb.series.length; i++) {
    const s = sb.series[i];
    if (!inSel(m, g, s)) continue;
    const k = m.sFamily[s] * nr + m.sRegion[s];
    err[k] += sb.err[bt.final][i] ?? 0;
    act[k] += sb.actual[i];
  }
  const out: { fam: number; reg: number; bias: number | null; actual: number }[] = [];
  for (let a = 0; a < nf; a++) for (let r = 0; r < nr; r++) out.push({ fam: a, reg: r, bias: act[a * nr + r] > 0 ? err[a * nr + r] / act[a * nr + r] : null, actual: act[a * nr + r] });
  return out;
}

// ---- interval calibration (leave-one-origin-out, pooled over the decision folds) ---------------------------
export interface CalRow {
  level: string;
  n: number;
  below: number;
  above: number;
  inside: number;
}
type Cov = Record<string, Record<string, Record<string, { n: number; below_p10: number; above_p90: number }>>>;
export function calibration(bt: BacktestFile): { rows: CalRow[]; folds: number; honest: boolean } | null {
  const cov = (bt.summary as { coverage?: Record<string, unknown> }).coverage;
  if (!cov) return null;
  const loo = cov.leave_one_origin_out as Cov | undefined;
  const all = cov.calibrated_on_all_decision_folds as Record<string, Record<string, { n: number; below_p10: number; above_p90: number }>> | undefined;
  const levels = ["series", "sku", "family_region", "total"];
  if (loo && Object.keys(loo).length) {
    const rows = levels
      .map((lv) => {
        let n = 0;
        let b = 0;
        let a = 0;
        for (const o of Object.keys(loo)) {
          const c = loo[o]?.monthly?.[lv];
          if (!c) continue;
          n += c.n;
          b += c.n * c.below_p10;
          a += c.n * c.above_p90;
        }
        return { level: lv, n, below: n ? b / n : NaN, above: n ? a / n : NaN, inside: n ? 1 - (b + a) / n : NaN };
      })
      .filter((r) => r.n > 0);
    return { rows, folds: Object.keys(loo).length, honest: true };
  }
  if (all?.monthly) {
    const rows = levels.filter((lv) => all.monthly[lv]).map((lv) => {
      const c = all.monthly[lv];
      return { level: lv, n: c.n, below: c.below_p10, above: c.above_p90, inside: 1 - c.below_p10 - c.above_p90 };
    });
    return { rows, folds: 0, honest: false };
  }
  return null;
}

// ---- accuracy by aggregation level (metrics.csv, pooled over origins) ---------------------------------------
export const LEVEL_LABEL: Record<string, string> = { series: "Series", sku: "SKU", family_region: "Family × region", family: "Family", region: "Region", total: "Total" };
export function levelWape(bt: BacktestFile, models: string[]): { level: string; w: Record<string, number> }[] {
  const M = bt.metrics as Record<string, (string | number | null)[]>;
  const n = (M.model ?? []).length;
  const acc = new Map<string, { a: number; e: number }>();
  for (let i = 0; i < n; i++) {
    if (M.slice_type[i] !== "all" || M.origin[i] === "mean" || (bt.scored_origins && !bt.scored_origins.includes(String(M.origin[i])))) continue;
    const md = String(M.model[i]);
    if (!models.includes(md)) continue;
    const key = `${M.level[i]}|${md}`;
    const cur = acc.get(key) ?? { a: 0, e: 0 };
    cur.a += Number(M.actual_sum[i]);
    cur.e += Number(M.abs_err_sum[i]);
    acc.set(key, cur);
  }
  const order = ["series", "sku", "family_region", "family", "region", "total"];
  const levels = order.filter((lv) => models.every((md) => acc.has(`${lv}|${md}`)));
  return levels.map((level) => ({ level, w: Object.fromEntries(models.map((md) => {
    const v = acc.get(`${level}|${md}`) as { a: number; e: number };
    return [md, v.a > 0 ? v.e / v.a : NaN];
  })) }));
}

// ---- facts and templates ---------------------------------------------------------------------------------------
export interface AccuracyFacts {
  sel: SelectionWords;
  cells: number;
  origins: number;
  final: number;
  snaive: number;
  naive: number;
  floor: number;
  bias: number;
  weakest: (SegRow & { dim: SegDim }) | null;
  segCount: number;
  /** The benchmark chain scored on the selection's cells (finite only), and the strongest (lowest WAPE) of them. */
  bench: { md: string; label: string; w: number }[];
  best: { md: string; label: string; w: number } | null;
}

/** The strongest benchmark of the chain on the selection: the one an honest headline must beat. */
export function bestBenchmark(bench: { md: string; label: string; w: number }[]): { md: string; label: string; w: number } | null {
  const ok = bench.filter((b) => Number.isFinite(b.w));
  // ties on the printed value go to the earlier (simpler) benchmark
  return ok.length ? ok.reduce((a, b) => (shownPct(b.w) < shownPct(a.w) ? b : a)) : null;
}

const pts = (x: number) => `${(Math.abs(x) * 100).toFixed(1)} points`;
const ok = (f: AccuracyFacts) => f.cells > 0 && Number.isFinite(f.final) && f.best !== null;
const lc = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const cap1 = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const countW = (n: number) => ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"][n] ?? String(n);

export const ACCURACY_TEMPLATES = {
  /** Against the BEST benchmark of the selection (never a cherry-picked weak one):
   *  "Our model beats the best benchmark, cycle-aware naive, by 4.8 points" / "ELA-008 in India: our model
   *  edges naive, the best benchmark here, by 0.4 points".  Seasonal naive is named alone only when it is
   *  the strongest.  Points are the difference of the printed WAPEs. */
  headline: {
    id: "forecast.headline",
    when: (f) => ok(f) && ptsBetween((f.best as { w: number }).w, f.final) > 0,
    text: (f) => {
      const b = f.best as { md: string; label: string; w: number };
      const d = ptsBetween(b.w, f.final);
      const verb = d < 1 ? "edges" : "beats";
      const by = `by ${ptsText(b.w, f.final)}`;
      if (b.md === "seasonal_naive") return f.sel.all ? `Our model ${verb} seasonal naive, the best benchmark, ${by}` : `${f.sel.name}: our model ${verb} seasonal naive, the best benchmark here, ${by}`;
      // all series: a two-line headline that still states the margin over the best; the standfirst names it
      const n = f.bench.length;
      const all = n >= 2 && f.bench.every((x) => ptsBetween(x.w, f.final) > 0);
      if (f.sel.all) return all ? `Our model beats all ${countW(n)} benchmarks, the best by ${ptsText(b.w, f.final)}` : `Our model ${verb} the best benchmark, ${lc(b.label)}, ${by}`;
      return `${f.sel.name}: our model ${verb} ${lc(b.label)}, the best benchmark here, ${by}`;
    },
    fallback: (f) => {
      if (!ok(f)) return `${f.sel.all ? "The selection" : f.sel.name} has no backtest history to score`;
      const b = f.best as { md: string; label: string; w: number };
      const d = ptsBetween(b.w, f.final);
      if (d === 0) return `${f.sel.all ? "Our model" : `${f.sel.name}: our model`} ties ${lc(b.label)}, the best benchmark, at ${fmtPct(f.final)}`;
      return `${f.sel.all ? cap1(b.label) : `${f.sel.name}: ${lc(b.label)}`} beats our model by ${ptsText(f.final, b.w)}`;
    },
  },
  /** Pooled scope, the three numbers, bias, the weakest segment against its own floor. */
  standfirst: {
    id: "forecast.standfirst",
    when: ok,
    text: (f) => {
      const best = f.best;
      const against =
        best && best.md !== "seasonal_naive" && Number.isFinite(f.snaive)
          ? `against **${fmtPct(best.w)}** for ${lc(best.label)} and ${fmtPct(f.snaive)} for seasonal naive`
          : Number.isFinite(f.snaive)
            ? `against **${fmtPct(f.snaive)}** for seasonal naive`
            : best
              ? `against **${fmtPct(best.w)}** for ${lc(best.label)}`
              : "";
      const head = `Over ${f.origins} backtest origins and ${f.cells.toLocaleString("en-US")} scored series-months, the forecast misses by **${fmtPct(f.final)}** of volume ${against}, with a bias of **${fmtSignedPct(f.bias)}**.`;
      const w = f.weakest;
      const tail = w
        ? ` ${w.label} is its weakest ${w.dim} at **${fmtPct(w.w)}**${Number.isFinite(w.floor) ? `, ${w.w - w.floor < 0.08 ? "close to" : "against"} the ${fmtPct(w.floor)} that even an in-hindsight forecast would miss there` : ""}.`
        : Number.isFinite(f.floor)
          ? ` Even an in-hindsight forecast would miss by ${fmtPct(f.floor)}.`
          : "";
      return head + tail;
    },
    fallback: (f) => `No backtest origin scores ${f.sel.all ? "this selection" : f.sel.name}: it launched after the last origin, or has no history yet. Clear the SKU or customer filter to see the accuracy of its family.`,
  },
} satisfies Record<string, Template<AccuracyFacts>>;

// ---- module titles -------------------------------------------------------------------------------------------
export interface SegTitleFacts {
  dim: SegDim;
  rows: SegRow[];
}
const plural = (d: SegDim) => (d === "family" ? "families" : `${d}s`);
export const SEGMENT_TEMPLATES = {
  /** "Middle East & Africa is the hardest region, 40.0%; every region beats seasonal naive". */
  title: {
    id: "forecast.segments",
    when: (s) => s.rows.length >= 2,
    text: (s) => {
      const w = s.rows[0];
      const beat = s.rows.filter((r) => shownPct(r.w) < shownPct(r.ws)).length;
      const tail = beat === s.rows.length ? `every ${s.dim} beats seasonal naive` : `${beat} of ${s.rows.length} ${plural(s.dim)} beat seasonal naive`;
      return `${w.label} is the hardest ${s.dim} at ${fmtPct(w.w)}; ${tail}`;
    },
    fallback: (s) => `Backtest accuracy by ${s.dim}`,
  },
} satisfies Record<string, Template<SegTitleFacts>>;

export interface HorizonFacts {
  first: number | null;
  last: number | null;
  firstLabel: string;
  lastLabel: string;
  gapToFloor: number | null;
  /** Our model's WAPE at every horizon (null where nothing was scored) and the label of each horizon. */
  values?: (number | null)[];
  labels?: string[];
}
/** Half a point: an interior peak or dip smaller than this is noise, not a shape worth a headline. */
const SHAPE_TOL = 0.005;
export const HORIZON_TEMPLATES = {
  /** "Error grows from 26.9% one month ahead to 29.3% at 19 months" only when the curve has no interior peak or
   *  dip; otherwise "Error peaks 5 months ahead at 25.6%, against 21.0% at 1 month and 22.4% at 19". */
  title: {
    id: "forecast.horizon",
    when: (h) => h.first !== null && h.last !== null,
    text: (h) => {
      const a = h.first as number;
      const b = h.last as number;
      const pts = (h.values ?? []).map((v, i) => [v, i] as const).filter((x): x is readonly [number, number] => x[0] !== null && Number.isFinite(x[0]));
      if (pts.length >= 3 && h.labels) {
        const hi = pts.reduce((x, y) => (y[0] > x[0] ? y : x));
        const lo = pts.reduce((x, y) => (y[0] < x[0] ? y : x));
        const interior = (p: readonly [number, number]) => p[1] !== pts[0][1] && p[1] !== pts[pts.length - 1][1];
        if (interior(hi) && hi[0] - Math.max(a, b) > SHAPE_TOL) {
          // a rising curve with its high point inside the window reads as growth to a peak, not a spike
          const late = hi[1] >= pts[0][1] + 0.6 * (pts[pts.length - 1][1] - pts[0][1]);
          if (late && b - a > SHAPE_TOL) return `Error grows from ${fmtPct(a)} ${h.firstLabel} ahead to a ${fmtPct(hi[0])} peak at ${h.labels[hi[1]]}`;
          return `Error peaks ${h.labels[hi[1]]} ahead at ${fmtPct(hi[0])}, against ${fmtPct(a)} at ${h.firstLabel} and ${fmtPct(b)} at ${h.lastLabel}`;
        }
        if (interior(lo) && Math.min(a, b) - lo[0] > SHAPE_TOL) return `Error is lowest ${h.labels[lo[1]]} ahead at ${fmtPct(lo[0])}, against ${fmtPct(a)} at ${h.firstLabel} and ${fmtPct(b)} at ${h.lastLabel}`;
      }
      if (shownPct(a) === shownPct(b) || Math.abs(b - a) < SHAPE_TOL) return `Error holds near ${fmtPct((a + b) / 2)} from ${h.firstLabel} to ${h.lastLabel} ahead`;
      return `Error ${b > a ? "grows" : "falls"} from ${fmtPct(a)} ${h.firstLabel} ahead to ${fmtPct(b)} at ${h.lastLabel}`;
    },
    fallback: () => "Backtest error by forecast horizon",
  },
} satisfies Record<string, Template<HorizonFacts>>;

export interface HorizonBiasFacts {
  /** Our model's bias per horizon (null where nothing was scored). */
  bias: (number | null)[];
  xs: string[];
  fine: boolean;
}
const hzLabel = (f: HorizonBiasFacts, i: number) => (f.fine ? `${f.xs[i]} month${f.xs[i] === "1" ? "" : "s"}` : `${f.xs[i]} months`);
export const HORIZON_BIAS_TEMPLATES = {
  /** "Bias is at most 1.6% either way at any horizon; the largest, −1.6%, is 14 months ahead" (the bound is the
   *  printed extreme, never a rounder, looser number). */
  title: {
    id: "forecast.horizonBias",
    when: (f) => f.bias.some((v) => v !== null),
    text: (f) => {
      const idx = f.bias.map((v, i) => [v, i] as const).filter((x): x is readonly [number, number] => x[0] !== null);
      const [worst, wi] = idx.reduce((a, b) => (Math.abs(b[0]) > Math.abs(a[0]) ? b : a));
      const lean = idx.every(([v]) => v > 0) ? "over-forecasts at every horizon" : idx.every(([v]) => v < 0) ? "under-forecasts at every horizon" : null;
      return lean && Math.abs(worst) > 0.02
        ? `Our model ${lean}, most at ${hzLabel(f, wi)}, ${fmtSignedPct(worst)}`
        : `Bias is at most ${fmtPctAbs(worst)} either way at any horizon; the largest, ${fmtSignedPct(worst)}, is ${hzLabel(f, wi)} ahead`;
    },
    fallback: () => "Backtest bias by forecast horizon",
  },
} satisfies Record<string, Template<HorizonBiasFacts>>;

export interface BiasFacts {
  cells: { fam: string; reg: string; bias: number }[];
  /** The family / region the filters select (the heatmap rings them); the title then speaks about them. */
  selFam?: string | null;
  selReg?: string | null;
}
/** Cells that tie with the extreme on the printed value, named as "X in A and in B" / "X in A and Y in B". */
function whoMost(cells: { fam: string; reg: string; bias: number }[]): { words: string; sign: number; value: number; n: number } {
  const worst = cells.reduce((x, y) => (Math.abs(y.bias) > Math.abs(x.bias) ? y : x));
  const shown = (b: number) => fmtSignedPct(b, 1);
  const ties = cells.filter((c) => shown(c.bias) === shown(worst.bias));
  const fams = [...new Set(ties.map((c) => c.fam))];
  const words =
    fams.length === 1
      ? `${fams[0]} in ${joinList(ties.map((c) => c.reg)).replace(/ and /, " and in ")}`
      : joinList(ties.map((c) => `${c.fam} in ${c.reg}`));
  return { words, sign: Math.sign(worst.bias), value: worst.bias, n: ties.length };
}
export const BIAS_TEMPLATES = {
  /** All cells: "Bias is at most 3.3% in any family × region cell; Electrical Assemblies in India and in Middle
   *  East & Africa under-forecast most".  Under a family and region filter the selected cell leads: "Hydraulic
   *  Systems in Europe: bias −0.9%; the largest cell, …, is −3.3%". */
  title: {
    id: "forecast.bias",
    when: (b) => b.cells.length >= 2,
    text: (b) => {
      const most = whoMost(b.cells);
      const dir = `${most.sign > 0 ? "over" : "under"}-forecast${most.n === 1 ? "s" : ""} most`;
      if (b.selFam && b.selReg) {
        const me = b.cells.find((c) => c.fam === b.selFam && c.reg === b.selReg);
        if (me) {
          const shown = (x: number) => fmtSignedPct(x, 1);
          if (shown(Math.abs(me.bias)) === shown(Math.abs(most.value))) {
            const others = b.cells.filter((c) => c !== me && shown(Math.abs(c.bias)) === shown(Math.abs(most.value)));
            const name = (c: { fam: string; reg: string }) => (c.fam === me.fam ? c.reg : `${c.fam} in ${c.reg}`);
            return `${me.fam} in ${me.reg}: bias ${shown(me.bias)}, the largest of any family × region cell${others.length ? `, tied with ${joinList(others.map(name))}` : ""}`;
          }
          return `${me.fam} in ${me.reg}: bias ${shown(me.bias)}; the largest cell, ${most.words}, is ${shown(most.value)}`;
        }
      }
      if (b.selFam || b.selReg) {
        const mine = b.cells.filter((c) => (b.selFam ? c.fam === b.selFam : c.reg === b.selReg));
        if (mine.length >= 2) {
          const lo = mine.reduce((x, y) => (y.bias < x.bias ? y : x));
          const hi = mine.reduce((x, y) => (y.bias > x.bias ? y : x));
          const name = (c: { fam: string; reg: string }) => (b.selFam ? c.reg : c.fam);
          return `${b.selFam ?? b.selReg}: bias runs from ${fmtSignedPct(lo.bias, 1)} (${name(lo)}) to ${fmtSignedPct(hi.bias, 1)} (${name(hi)})`;
        }
      }
      return `Bias is at most ${fmtPctAbs(most.value, 1)} in any family × region cell; ${most.words} ${dir}`;
    },
    fallback: () => "Backtest bias by family and region",
  },
} satisfies Record<string, Template<BiasFacts>>;

export const CAL_TEMPLATES = {
  /** "The P10–P90 band holds 80.0% of monthly actuals per series, on its 80% target" (the printed shares come
   *  from shares100, so below + inside + above = 100.0 on screen). */
  title: {
    id: "forecast.calibration",
    when: (c: CalRow | null) => !!c && Number.isFinite(c.inside),
    text: (c) => {
      const r0 = c as CalRow;
      const [, inside] = shares100([r0.below, r0.inside, r0.above]);
      const r = { ...r0, inside };
      const d = r.inside - 0.8;
      const verdict = Math.abs(d) <= 0.02 ? "on its 80% target" : d < 0 ? `${pts(d)} short of its 80% target` : `${pts(d)} above its 80% target`;
      return `The P10–P90 band holds ${fmtPct(r.inside)} of monthly actuals per series, ${verdict}`;
    },
    fallback: () => "Interval calibration of the P10–P90 band",
  },
} satisfies Record<string, Template<CalRow | null>>;

export const LEVEL_TEMPLATES = {
  /** "Errors cancel as forecasts add up: 28.1% per series, 3.1% for the monthly total". */
  title: {
    id: "forecast.levels",
    when: (l: { first: number; last: number; lastLabel: string }) => Number.isFinite(l.first) && Number.isFinite(l.last) && l.last < l.first,
    text: (l) => `Errors cancel as forecasts add up: ${fmtPct(l.first)} per series, ${fmtPct(l.last)} for the ${l.lastLabel}`,
    fallback: () => "Backtest error by aggregation level",
  },
} satisfies Record<string, Template<{ first: number; last: number; lastLabel: string }>>;

export interface FvaFacts {
  steps: { md: string; label: string; w: number; b: number }[];
  floor: number;
}
export const FVA_TEMPLATES = {
  /** "Every step adds value; our model sits 3.7 points above the in-hindsight floor". */
  title: {
    id: "forecast.fva",
    when: (f) => f.steps.length >= 2 && f.steps.every((s) => Number.isFinite(s.w)),
    text: (f) => {
      const last = f.steps[f.steps.length - 1];
      const every = f.steps.every((s, i) => i === 0 || ptsBetween(f.steps[i - 1].w, s.w) > 0);
      const gains = f.steps.slice(1).map((s, i) => ({ s, g: ptsBetween(f.steps[i].w, s.w) }));
      const big = gains.reduce((a, b) => (b.g > a.g ? b : a));
      const lead = every ? "Every step adds value" : "Not every step adds value";
      return Number.isFinite(f.floor)
        ? `${lead}; our model sits ${ptsText(last.w, f.floor)} above the in-hindsight floor`
        : `${lead}; ${big.s.label.toLowerCase()} adds the most, ${big.g.toFixed(1)} points`;
    },
    fallback: () => "Forecast value added, step by step",
  },
} satisfies Record<string, Template<FvaFacts>>;

// ---- the live timeline and the time machine -------------------------------------------------------------------
export interface LiveFacts {
  chg12: number;
  band: number; // mean relative half-width of the monthly P10-P90 range over the window
  /** Units in the last 12 actual months and the next 12 forecast months. */
  l12?: number;
  n12?: number;
}
export const LIVE_TEMPLATES = {
  /** "The next 12 months run 4.3% above the last 12, inside a P10–P90 range of ±1.3%". */
  title: {
    id: "forecast.live",
    when: (l) => Number.isFinite(l.chg12) && Number.isFinite(l.band),
    text: (l) =>
      `${Math.abs(l.chg12) < 0.005 ? "The next 12 months match the last 12" : `The next 12 months run ${fmtPctAbs(l.chg12)} ${l.chg12 < 0 ? "below" : "above"} the last 12`}, inside a P10–P90 range of ±${(l.band * 100).toFixed(l.band < 0.1 ? 1 : 0)}% a month`,
    // chg12 = −100 % means no order at all in the next 12 months (a lost account, a run-off): say so
    fallback: (l) =>
      l.chg12 === -1
        ? "No orders are forecast in the next 12 months"
        : l.l12 === 0 && (l.n12 ?? 0) > 0
          ? `No history yet: ${fmtInt(l.n12 ?? 0)} units are forecast for the next 12 months`
          : "The forecast continues the history",
  },
} satisfies Record<string, Template<LiveFacts>>;

export interface MachineFacts {
  origin: string;
  baseLabel: string;
  agg: number;
  aggBase: number;
  cell: number;
  cellBase: number;
}
export const MACHINE_TEMPLATES = {
  /** "The forecast made in October 2024 missed monthly totals by 3.1%; seasonal naive by 9.8%". */
  title: {
    id: "forecast.machine",
    when: (t) => Number.isFinite(t.agg) && Number.isFinite(t.aggBase),
    text: (t) => `The forecast made in ${monthLong(t.origin)} missed monthly totals by ${fmtPct(t.agg)}; ${t.baseLabel.toLowerCase()} missed by ${fmtPct(t.aggBase)}`,
    fallback: (t) => `The forecast made in ${monthLong(t.origin)} against what happened`,
  },
} satisfies Record<string, Template<MachineFacts>>;

export interface PeriodFacts {
  rollup: "month" | "quarter" | "year";
  rows: { label: string; sub: number; ly: number; full: boolean }[];
  unit: (v: number) => string;
}
export const PERIOD_TEMPLATES = {
  /** "Q1 2027 is the largest quarter, 442K units, 12.7% above a year earlier". */
  title: {
    id: "forecast.table",
    when: (p) => p.rows.filter((r) => r.full && r.sub > 0).length >= 2,
    text: (p) => {
      const full = p.rows.filter((r) => r.full && r.sub > 0);
      const top = full.reduce((a, b) => (b.sub > a.sub ? b : a));
      const yoy = top.ly > 0 ? top.sub / top.ly - 1 : NaN;
      return `${top.label} is the largest ${p.rollup}, ${p.unit(top.sub)}${Number.isFinite(yoy) ? `, ${fmtPctAbs(yoy)} ${yoy < 0 ? "below" : "above"} a year earlier` : ""}`;
    },
    fallback: (p) => `The forecast by ${p.rollup}, with the quantiles of each total`,
  },
} satisfies Record<string, Template<PeriodFacts>>;
