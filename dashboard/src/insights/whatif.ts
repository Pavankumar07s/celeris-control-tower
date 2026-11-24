// What-if engine and copy.  A scenario shifts one macro indicator by a fixed amount over a period of the
// forecast window; each SKU x channel group responds with the model's own sensitivities and lags:
//   latent'(t) = latent(t) x exp(Σ_lags β x Δindicator(t − lag))      (optionally with the window's event factor removed)
// and the change in latent demand flows through each series' ordering cycle (an order carries every latent
// month since the previous order), so off-phase, lost-account and post-EOL months stay zero.
import type { Model } from "../data/model";
import type { ForecastDetail, MacroFile } from "../data/types";
import { fmtPctAbs, fmtSigned, fmtValue, fmtValueUnit, monthLong, monthName, fmtSignedPct } from "../data/format";
import type { Measure } from "../data/model";
import type { Template } from "./headlines";
import { indShort } from "./indicators";

export interface Scenario {
  ind: string; // indicator key
  shift: number;
  start: number; // month index
  months: number; // 0 = to the end of the window
  removeEvents: boolean;
}

export const PRESETS: { label: string; ind: string; shift: number; start: string; months: number }[] = [
  { label: "PMI −3 from Jan 2027", ind: "ism_manufacturing_pmi", shift: -3, start: "2027-01", months: 0 },
  { label: "Auto production −5 pts for 6 months", ind: "auto_production_yoy_pct", shift: -5, start: "2027-01", months: 6 },
  { label: "Vehicle orders −10 from Nov 2026", ind: "new_vehicle_orders_index", shift: -10, start: "2026-11", months: 0 },
  { label: "Utilisation −3 pts from Jan 2027", ind: "industrial_util_rate_pct", shift: -3, start: "2027-01", months: 0 },
];

export const presetScenario = (m: Model, p: (typeof PRESETS)[number]): Scenario => ({ ind: p.ind, shift: p.shift, start: Math.max(m.w0, m.months.indexOf(p.start)), months: p.months, removeEvents: false });

/** The scenario in the URL hash: wi (indicator), ws (shift), wf (first month), wn (months), we (1 = remove events).
 *  No `wi` means the first preset, so the view opens on a meaningful question. */
export function scenarioFrom(m: Model, p: URLSearchParams, indicators: string[]): Scenario {
  const wi = p.get("wi");
  if (!wi || !indicators.includes(wi)) return presetScenario(m, PRESETS[0]);
  const ws = Number(p.get("ws") ?? "0");
  const wf = m.months.indexOf(p.get("wf") ?? "");
  const wn = Number(p.get("wn") ?? "0");
  return { ind: wi, shift: Number.isFinite(ws) ? ws : 0, start: wf >= m.w0 ? wf : m.w0, months: Number.isFinite(wn) && wn > 0 ? Math.round(wn) : 0, removeEvents: p.get("we") === "1" };
}
export function scenarioPatch(m: Model, s: Scenario): Record<string, string | null> {
  return { wi: s.ind, ws: String(s.shift), wf: m.months[s.start], wn: s.months ? String(s.months) : null, we: s.removeEvents ? "1" : null };
}
export const sameScenario = (a: Scenario, b: Scenario) => a.ind === b.ind && a.shift === b.shift && a.start === b.start && a.months === b.months && a.removeEvents === b.removeEvents;

export function scenarioName(m: Model, s: Scenario): string {
  const hit = PRESETS.find((p) => sameScenario(presetScenario(m, p), s));
  if (hit) return hit.label;
  if (s.shift === 0 && !s.removeEvents) return "The base plan";
  const shift = s.shift === 0 ? "" : ` ${s.shift > 0 ? "+" : "−"}${Math.abs(s.shift)}`;
  const span = s.months ? ` for ${s.months} month${s.months === 1 ? "" : "s"}` : "";
  const ev = s.removeEvents ? `${s.shift === 0 ? "Removing window events" : ", without window events"}` : "";
  return s.shift === 0 ? ev : `${indShort(s.ind)}${shift} from ${monthName(m.months[s.start])}${span}${ev}`;
}

/** Scenario order means for every forecast row (same layout as the model's flat forecast arrays). */
export function runScenario(m: Model, runs: number[], d: ForecastDetail, mf: MacroFile, s: Scenario): { mean: Float64Array; changed: number; rows: number; links: number; linked: number; series: number } {
  const out = Float64Array.from(m.mean);
  const S = mf.sensitivity;
  const k = mf.indicators.indexOf(s.ind);
  const bySku = new Map<string, { lag: number; beta: number }[]>();
  let links = 0;
  for (let i = 0; i < S.sku.length; i++) {
    if (S.indicator[i] !== k) continue;
    links++;
    const key = `${S.sku[i]}|${S.channel_group[i]}`;
    const list = bySku.get(key) ?? [];
    list.push({ lag: S.lag[i], beta: S.beta[i] });
    bySku.set(key, list);
  }
  const end = s.months > 0 ? s.start + s.months - 1 : m.nMonths - 1;
  const shock = (month: number) => (month >= s.start && month <= end ? s.shift : 0);
  const aftermarket = m.dims.channels.indexOf("Aftermarket");
  let changed = 0;
  let rows = 0;
  let linked = 0;
  for (const r of runs) {
    const ser = m.rSeries[r];
    const sens = bySku.get(`${m.sSku[ser]}|${m.sChannel[ser] === aftermarket ? "aftermarket" : "other"}`) ?? [];
    if (sens.length) linked++;
    const o = m.rOff[r];
    const n = m.rLen[r];
    rows += n;
    const dLat = new Float64Array(n);
    let any = false;
    for (let j = 0; j < n; j++) {
      const month = m.rStart[r] + j;
      let logm = 0;
      for (const x of sens) logm += x.beta * shock(month - x.lag);
      let mult = Math.exp(logm);
      const fe = d.factors.f_event[o + j];
      if (s.removeEvents && fe > 0 && fe !== 1) mult /= fe;
      dLat[j] = d.latent_mean[o + j] * (mult - 1);
      if (dLat[j] !== 0) any = true;
    }
    if (!any) continue;
    for (let j = 0; j < n; j++) {
      if (m.mean[o + j] <= 0) continue; // structural zeros stay zero
      const span = d.accum[o + j] & 3;
      const w = d.accum[o + j] & 4 ? 0.5 : 1;
      let delta = 0;
      for (let q = 0; q < span && j - q >= 0; q++) delta += (q === 0 ? 1 : w) * dLat[j - q];
      if (delta !== 0) {
        out[o + j] = Math.max(0, m.mean[o + j] + delta);
        changed++;
      }
    }
  }
  return { mean: out, changed, rows, links, linked, series: runs.length };
}

export interface ScenarioSums {
  base: Float64Array; // by window month, in the measure
  scen: Float64Array;
  byFam: { f: number; b: number; s: number; bu: number; su: number }[];
}
export function scenarioSums(m: Model, runs: number[], mean: Float64Array, usd: boolean): ScenarioSums {
  const base = new Float64Array(m.nWin);
  const scen = new Float64Array(m.nWin);
  const fam = new Map<number, { f: number; b: number; s: number; bu: number; su: number }>();
  for (const r of runs) {
    const o = m.rOff[r];
    const f = m.sFamily[m.rSeries[r]];
    const cur = fam.get(f) ?? { f, b: 0, s: 0, bu: 0, su: 0 };
    for (let j = 0; j < m.rLen[r]; j++) {
      const t = m.rStart[r] + j - m.w0;
      const p = m.price[o + j];
      const w = usd ? p : 1;
      base[t] += w * m.mean[o + j];
      scen[t] += w * mean[o + j];
      cur.b += m.mean[o + j];
      cur.s += mean[o + j];
      cur.bu += p * m.mean[o + j];
      cur.su += p * mean[o + j];
    }
    fam.set(f, cur);
  }
  return { base, scen, byFam: [...fam.values()] };
}

// ---- facts and templates -------------------------------------------------------------------------------------
export interface WhatIfFacts {
  name: string;
  measure: Measure;
  base: number;
  scen: number;
  p10: number;
  p90: number;
  topFam: string | null;
  topFamPct: number;
  firstMonth: string | null; // first month with an effect
  peakMonth: string | null;
  peak: number;
  peakPct: number;
  nonZero: boolean;
}
const chg = (f: WhatIfFacts) => (f.base > 0 ? f.scen / f.base - 1 : NaN);

export const WHATIF_TEMPLATES = {
  /** "PMI −3 from Jan 2027 cuts the plan by 1.2%". */
  headline: {
    id: "whatif.headline",
    when: (f) => f.base > 0 && Math.abs(chg(f)) >= 0.0005,
    text: (f) => `${f.name} ${chg(f) < 0 ? "cuts" : "lifts"} the plan by ${fmtPctAbs(chg(f))}`,
    fallback: (f) => (f.base > 0 ? `${f.name} leaves the plan within 0.05%` : "No forecast rows for this selection"),
  },
  standfirst: {
    id: "whatif.standfirst",
    when: (f) => f.base > 0 && f.nonZero,
    text: (f) => {
      const d = f.scen - f.base;
      const inside = f.scen >= f.p10 && f.scen <= f.p90;
      const band = `${inside ? "inside" : f.scen < f.p10 ? "below" : "above"} the base forecast's P10–P90 range of ${fmtValue(f.p10, f.measure)}–${fmtValue(f.p90, f.measure)}`;
      const fam = f.topFam ? ` **${f.topFam}** feels it most, ${fmtSignedPct(f.topFamPct)}.` : "";
      const timing = f.firstMonth && f.peakMonth ? ` The effect reaches orders in ${monthLong(f.firstMonth)}, after each SKU's own lag, and peaks in ${monthLong(f.peakMonth)} at ${fmtSigned(f.peak, f.measure, 1)}${f.measure === "units" ? " units" : ""}.` : "";
      return `Over the next 19 months the plan moves from **${fmtValueUnit(f.base, f.measure)}** to **${fmtValueUnit(f.scen, f.measure)}** (${fmtSigned(d, f.measure, 1)}), ${band}.${fam}${timing}`;
    },
    fallback: (f) =>
      f.base > 0
        ? `The model's sensitivities give no response to this shift for the selection: the plan stays at **${fmtValueUnit(f.base, f.measure)}**. Pick another indicator or widen the filters.`
        : "No forecast rows for this selection: clear the customer or SKU filter.",
  },
} satisfies Record<string, Template<WhatIfFacts>>;

export interface ByMonthFacts {
  first: string | null;
  full: string | null; // the month the effect first reaches 80 % of its peak
  measure: Measure;
}
export const BYMONTH_TEMPLATES = {
  title: {
    id: "whatif.bymonth",
    when: (b) => !!b.first && !!b.full,
    text: (b) => (b.first === b.full ? `The effect arrives at full size in ${monthName(b.first as string)}` : `The effect starts in ${monthName(b.first as string)} and builds to full size by ${monthName(b.full as string)}`),
    fallback: () => "Scenario minus base, month by month",
  },
} satisfies Record<string, Template<ByMonthFacts>>;

export interface FamFacts {
  rows: { label: string; d: number; pct: number }[];
}
export const FAM_TEMPLATES = {
  title: {
    id: "whatif.family",
    when: (f) => f.rows.filter((r) => r.d !== 0).length >= 2,
    text: (f) => {
      const moved = f.rows.filter((r) => Math.abs(r.pct) >= 0.0005);
      const top = f.rows.reduce((a, b) => (Math.abs(b.pct) > Math.abs(a.pct) ? b : a));
      const n = f.rows.length;
      return `${top.label} moves most, ${fmtSignedPct(top.pct)}; ${moved.length === n ? `every family responds` : `${moved.length} of ${n} families respond`}`;
    },
    fallback: (f) => (f.rows.length === 1 ? `${f.rows[0].label}: ${fmtSignedPct(f.rows[0].pct)} under the scenario` : "Impact by family"),
  },
} satisfies Record<string, Template<FamFacts>>;
