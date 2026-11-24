// Macro lead / lag: facts and templates.  Reads macro.json (features/macro_leadlag.csv: correlation of each
// family's macro index with each indicator at lags 0-12, over 2019-2026 and two eras, plus the model's selected
// drivers and their lags) and the per-SKU sensitivities the forecast and the what-if use.
//   stable driver = a driver the model selected whose correlation at its lag keeps its sign in 2019-22 and in
//   2023-26 and stays at |r| >= 0.5 in both eras.
import type { MacroFile } from "../data/types";
import type { Model } from "../data/model";
import { fmtPct, fmtPctAbs, monthName, fmtSignedPct } from "../data/format";
import { countWord, joinList, plural, type Template } from "./headlines";
import { indShort } from "./indicators";

export const STABLE_R = 0.5;

export interface Cell {
  f: number;
  k: number;
  lag: number;
  r: number;
  driver: boolean;
  e1: number | null; // r at the lag, first era
  e2: number | null; // second era
  stable: boolean;
}

function best(corr: (number | null)[]): { lag: number; r: number } {
  let lag = 0;
  let r = 0;
  corr.forEach((v, L) => {
    if (v !== null && Math.abs(v) > Math.abs(r)) {
      r = v;
      lag = L;
    }
  });
  return { lag, r };
}

/** The cell's lag: the model's driver lag when the indicator drives the family, else the strongest |r|. */
export function cell(mf: MacroFile, f: number, k: number): Cell {
  const ll = mf.leadlag;
  const dl = ll.driver_lag[f]?.[k] ?? -1;
  const c = ll.corr[f][k];
  const { lag, r } = dl >= 0 ? { lag: dl, r: c[0][dl] ?? 0 } : best(c[0]);
  const e1 = c[1]?.[lag] ?? null;
  const e2 = c[2]?.[lag] ?? null;
  const stable = dl >= 0 && e1 !== null && e2 !== null && Math.sign(e1) === Math.sign(e2) && Math.sign(e1) === Math.sign(r) && Math.abs(e1) >= STABLE_R && Math.abs(e2) >= STABLE_R;
  return { f, k, lag, r, driver: dl >= 0, e1, e2, stable };
}

export function allCells(m: Model, mf: MacroFile): Cell[] {
  const out: Cell[] = [];
  m.dims.families.name.forEach((_, f) => mf.indicators.forEach((_k, k) => out.push(cell(mf, f, k))));
  return out;
}

export const eraLabel = (e: string): string => (e === "all" ? "2019–26" : e.replace(/^(\d{4})-(\d{2})(\d{2})$/, "$1–$3"));

// ---- facts ---------------------------------------------------------------------------------------------------
export interface MacroFacts {
  fams: string[];
  inds: string[];
  famFilter: number | null;
  cells: Cell[];
  lead: Cell | null; // strongest stable driver (within the family filter)
  stableFams: number[];
  drivenBy: { k: number; n: number }[]; // families each indicator drives, sorted
  eras: string[];
}

export function macroFacts(m: Model, mf: MacroFile, famFilter: number | null): MacroFacts {
  const cells = allCells(m, mf);
  const scope = famFilter === null ? cells : cells.filter((c) => c.f === famFilter);
  const stable = scope.filter((c) => c.stable);
  const lead = stable.length ? stable.reduce((a, b) => (Math.abs(b.r) > Math.abs(a.r) ? b : a)) : null;
  const stableFams = [...new Set(cells.filter((c) => c.stable).map((c) => c.f))].sort((a, b) => a - b);
  const drivenBy = mf.indicators.map((_, k) => ({ k, n: cells.filter((c) => c.k === k && c.driver).length })).sort((a, b) => b.n - a.n);
  return { fams: m.dims.families.name, inds: mf.indicators, famFilter, cells, lead, stableFams, drivenBy, eras: mf.leadlag.eras };
}

const r2 = (r: number) => `${r < 0 ? "−" : ""}${Math.abs(r).toFixed(2)}`;
const lagWords = (L: number) => (L === 0 ? "in the same month" : `by ${countWord(L)} month${L === 1 ? "" : "s"}`);
const moves = (c: Cell) => (c.r < 0 ? "moves against" : "leads");

export const MACRO_TEMPLATES = {
  /** "New vehicle orders leads Electrical Assemblies by two months (r = 0.93)". */
  headline: {
    id: "macro.headline",
    when: (f) => f.lead !== null,
    text: (f) => {
      const c = f.lead as Cell;
      return c.r < 0 ? `${indShort(f.inds[c.k])} moves against ${f.fams[c.f]} ${c.lag ? `${c.lag} months ahead` : "in the same month"} (r = ${r2(c.r)})` : `${indShort(f.inds[c.k])} leads ${f.fams[c.f]} ${lagWords(c.lag)} (r = ${r2(c.r)})`;
    },
    fallback: (f) => (f.famFilter !== null ? `${f.fams[f.famFilter]} has no stable leading indicator` : "No indicator leads demand steadily across both eras"),
  },
  standfirst: {
    id: "macro.standfirst",
    when: (f) => f.cells.length > 0,
    text: (f) => {
      const n = f.stableFams.length;
      const N = f.fams.length;
      const missing = f.fams.map((_, i) => i).filter((i) => !f.stableFams.includes(i));
      const top = f.drivenBy[0];
      const none = f.drivenBy.filter((d) => d.n === 0).map((d) => indShort(f.inds[d.k]));
      const a = `**${n} of ${N} families** follow a public indicator whose link holds in both ${eraLabel(f.eras[1] ?? "")} and ${eraLabel(f.eras[2] ?? "")} (same sign, |r| of at least ${STABLE_R} in each).`;
      const b = top && top.n ? ` ${indShort(f.inds[top.k])} is the model's most common driver, used for **${countWord(top.n)} ${plural(top.n, "family", "families")}**${none.length ? `; ${joinList(none)} ${none.length === 1 ? "drives" : "drive"} none` : ""}.` : "";
      const c = missing.length ? ` ${joinList(missing.map((i) => f.fams[i]))} ${missing.length === 1 ? "has" : "have"} drivers that weaken after 2022, so ${missing.length === 1 ? "its" : "their"} forecast leans less on the economy.` : " Every family keeps a stable driver.";
      if (f.famFilter !== null) {
        const mine = f.cells.filter((x) => x.f === f.famFilter && x.driver);
        const st = mine.filter((x) => x.stable);
        return `The model uses **${countWord(mine.length)} ${plural(mine.length, "indicator", "indicators")}** for ${f.fams[f.famFilter]}${mine.length ? ` (${joinList(mine.map((x) => `${indShort(f.inds[x.k])} at lag ${x.lag}`))})` : ""}; ${st.length ? `**${countWord(st.length)}** ${plural(st.length, "holds", "hold")} in both eras.` : "none holds in both eras."} ${a}`;
      }
      return a + b + c;
    },
    fallback: () => "The lead / lag table is empty in this bundle.",
  },
} satisfies Record<string, Template<MacroFacts>>;

export const MATRIX_TEMPLATES = {
  /** "Auto production drives 6 of 7 families; EV adoption drives none". */
  title: {
    id: "macro.matrix",
    when: (f: MacroFacts) => (f.drivenBy[0]?.n ?? 0) > 0,
    text: (f) => {
      const top = f.drivenBy[0];
      const none = f.drivenBy.filter((d) => d.n === 0).map((d) => indShort(f.inds[d.k]));
      return `${indShort(f.inds[top.k])} drives ${top.n} of ${f.fams.length} families${none.length ? `; ${joinList(none)} ${none.length === 1 ? "drives" : "drive"} none` : ""}`;
    },
    fallback: () => "Which indicator leads which family",
  },
} satisfies Record<string, Template<MacroFacts>>;

export interface LagFacts {
  fam: string;
  ind: string;
  c: Cell;
}
export const LAG_TEMPLATES = {
  /** "PMI leads Hydraulic Systems by three months in both eras" / "... link at lag 2 fades after 2022". */
  title: {
    id: "macro.lag",
    when: (l) => l.c.e1 !== null && l.c.e2 !== null,
    text: (l) => {
      const c = l.c;
      const e1 = c.e1 as number;
      const e2 = c.e2 as number;
      if (c.stable) return `${indShort(l.ind)} ${moves(c)} ${l.fam} at lag ${c.lag} in both eras (r = ${r2(e1)}, then ${r2(e2)})`;
      if (Math.sign(e1) !== Math.sign(e2)) return `${indShort(l.ind)}'s link to ${l.fam} at lag ${c.lag} flips sign after 2022 (r = ${r2(e1)}, then ${r2(e2)})`;
      return `${indShort(l.ind)}'s link to ${l.fam} at lag ${c.lag} ${Math.abs(e2) < Math.abs(e1) ? "weakens" : "strengthens"} after 2022 (r = ${r2(e1)}, then ${r2(e2)})`;
    },
    fallback: (l) => `Correlation of ${indShort(l.ind)} with ${l.fam} at every lag`,
  },
} satisfies Record<string, Template<LagFacts>>;

export interface CheckFacts {
  fam: string;
  ind: string;
  lag: number;
  r: number;
}
export const CHECK_TEMPLATES = {
  /** "Raw data agree: PMI, shifted three months, tracks Hydraulic Systems' demand growth (r = 0.78)". */
  title: {
    id: "macro.check",
    when: (c) => Number.isFinite(c.r),
    text: (c) => `${Math.abs(c.r) >= 0.5 ? "The raw data agree" : Math.abs(c.r) >= 0.3 ? "The raw data partly agree" : "The raw data barely agree"}: ${indShort(c.ind)}${c.lag ? `, ${c.lag} month${c.lag === 1 ? "" : "s"} earlier,` : ""} tracks ${c.fam}${c.fam.endsWith("s") ? "'" : "'s"} demand growth at r = ${r2(c.r)}`,
    fallback: (c) => `${indShort(c.ind)} shifted by its lag against ${c.fam}'s demand growth`,
  },
} satisfies Record<string, Template<CheckFacts>>;

export interface PathFacts {
  items: { k: number; last: number; end: number; chg: number }[];
  inds: string[];
  endMonth: string;
}
export const PATH_TEMPLATES = {
  /** "Inventory days rise 12.3% by May 2028; 3 of 8 indicators are assumed to fall". */
  title: {
    id: "macro.paths",
    when: (p) => p.items.some((x) => Number.isFinite(x.chg)),
    text: (p) => {
      const ok = p.items.filter((x) => Number.isFinite(x.chg));
      const top = ok.reduce((a, b) => (Math.abs(b.chg) > Math.abs(a.chg) ? b : a));
      const down = ok.filter((x) => x.chg < -0.005).length;
      return `${indShort(p.inds[top.k])} ${top.chg < 0 ? "falls" : "rises"} ${fmtPctAbs(top.chg)} by ${monthName(p.endMonth)}; ${down} of ${ok.length} indicators are assumed to fall`;
    },
    fallback: () => "Indicator paths into the forecast window",
  },
} satisfies Record<string, Template<PathFacts>>;

export interface EvFacts {
  ev: number; // index at the last actual (2023 = 100)
  ice: number;
  uni: number;
  adoption: number;
}
export const EV_TEMPLATES = {
  /** "Since 2023, EV SKUs' demand rose 41% and ICE SKUs' fell 18%, as EV adoption rose 24%". */
  title: {
    id: "macro.ev",
    when: (e) => Number.isFinite(e.ev) && Number.isFinite(e.ice),
    text: (e) => {
      const d = (x: number) => x / 100 - 1;
      const v = (x: number) => (d(x) >= 0 ? "rose" : "fell");
      return `Since 2023, EV SKUs' demand ${v(e.ev)} ${fmtPctAbs(d(e.ev), 0)} and ICE SKUs' ${v(e.ice)} ${fmtPctAbs(d(e.ice), 0)}${Number.isFinite(e.adoption) ? `, as EV adoption ${v(e.adoption)} ${fmtPctAbs(d(e.adoption), 0)}` : ""}`;
    },
    fallback: () => "Demand by powertrain against EV adoption",
  },
} satisfies Record<string, Template<EvFacts>>;

export interface SensRow {
  sku: number;
  group: string;
  k: number;
  beta: number; // Σ β over lags
  lags: number[];
  eff: number; // demand change for +1 sd of the indicator (permanent)
}
/** One row per SKU x channel group x indicator: Σ β over the lags, and the effect of a permanent +1 sd shift. */
export function sensRows(m: Model, mf: MacroFile, fam: number | null, sku: number | null, sd: number[]): SensRow[] {
  const S = mf.sensitivity;
  const map = new Map<string, SensRow>();
  for (let i = 0; i < S.sku.length; i++) {
    const s = S.sku[i];
    if (fam !== null && m.skuFamily[s] !== fam) continue;
    if (sku !== null && s !== sku) continue;
    const key = `${s}|${S.channel_group[i]}|${S.indicator[i]}`;
    const cur = map.get(key) ?? { sku: s, group: S.channel_group[i], k: S.indicator[i], beta: 0, lags: [], eff: 0 };
    cur.beta += S.beta[i];
    cur.lags.push(S.lag[i]);
    map.set(key, cur);
  }
  const out = [...map.values()];
  for (const r of out) r.eff = Math.exp(r.beta * (sd[r.k] || 0)) - 1;
  return out;
}

export const SENS_TEMPLATES = {
  /** "Fuel price moves the median linked SKU most: −6.7% per standard deviation". */
  title: {
    id: "macro.sens",
    when: (s: { rows: { k: number; median: number; n: number }[]; inds: string[] }) => s.rows.length > 0,
    text: (s) => {
      const top = s.rows.reduce((a, b) => (Math.abs(b.median) > Math.abs(a.median) ? b : a));
      return `${indShort(s.inds[top.k])} moves its median linked SKU most: ${fmtSignedPct(top.median)} per standard deviation`;
    },
    fallback: () => "Per-SKU sensitivities to each indicator",
  },
} satisfies Record<string, Template<{ rows: { k: number; median: number; n: number }[]; inds: string[] }>>;

export const pct = fmtPct;
