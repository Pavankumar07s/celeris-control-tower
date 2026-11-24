// Anomaly monitor copy: facts over the anomaly register for the selection, readable type labels, and the
// deterministic templates for the headline, standfirst and module titles.
import { fmtInt, monthName } from "../data/format";
import type { Filters, Model } from "../data/model";
import type { AnomalyFile } from "../data/types";
import { cap, fractionWord, joinList, plural, type Template } from "./headlines";

export const lab = (d: { dict: string[]; codes: number[] }, i: number): string | null => (d.codes[i] >= 0 ? d.dict[d.codes[i]] : null);

/** Readable names for the register's type codes (the code stays in tooltips and the CSV). */
const TYPE_LABEL: Record<string, string> = {
  "DE.BLANK_KEY": "blank key field",
  "DE.CURRENCY_BLOCK": "prices in EUR",
  "DE.DATE_FORMAT": "date format",
  "DE.DATE_TYPO": "year typo",
  "DE.DUPLICATE": "duplicate load",
  "DE.LABEL_VARIANT": "label variant",
  "DE.MACRO_BLANK": "indicator blank",
  "DE.MACRO_DECIMAL": "indicator decimal shift",
  "DE.MACRO_DUPLICATE": "indicator month twice",
  "DE.MACRO_REBASE": "indicator on an old base",
  "DE.MACRO_UNIT": "indicator unit",
  "DE.MISSING_ROW": "missing row",
  "DE.MONTH_COLUMN": "month column",
  "DE.PRICE_CENTS": "price in cents",
  "DE.PRICE_ZEROED": "price zeroed",
  "DE.RESTATEMENT": "restated load",
  "DE.REVENUE_SCALE": "revenue ×10",
  "DE.REVENUE_TRANSPOSITION": "revenue digit swap",
  "DE.SIGN": "sign error",
  "DE.STOCKOUT_OVERLAY": "stock-out overlay",
  "DE.SYSTEM_BLANKING": "ERP blank",
  "DE.THOUSANDS_SEPARATOR": "thousands separator",
  "DE.UNITS_BLANK": "units blank",
  "DE.UNITS_SCALE": "units ×10 or ×100",
  "DE.UOM_BLOCK": "units in packs of 10",
  "RC.DOCUMENTATION": "documentation conflict",
  "RC.MASTER_BU": "master: business unit",
  "RC.MASTER_LAUNCH": "master: launch date",
  "RC.SALES_BEFORE_MASTER_LAUNCH": "sales before launch",
  "RE.BACKORDER_CATCHUP": "back-order catch-up",
  "RE.CUSTOMER_SHUTDOWN": "customer shutdown",
  "RE.DISRUPTION": "disruption",
  "RE.HOLIDAY": "holiday",
  "RE.LOGISTICS": "logistics event",
  "RE.NO_EFFECT": "event with no effect",
  "RE.ONE_OFF_ORDER": "one-off order",
  "RE.PREBUY_PRICE_RISE": "pre-buy before a price rise",
  "RE.PRICE_CHANGE": "price change",
  "RE.PROGRAM_STEP": "programme step",
  "RE.REGION_OPENING": "region opening",
  "RE.SEMICONDUCTOR_ALLOCATION": "semiconductor allocation",
  "RE.STOCKOUT_LISTED": "listed stock-out",
  "RE.STOCKOUT_UNLISTED": "unlisted stock-out",
  "RE.STRIKE": "strike",
  "RE.SURCHARGE": "surcharge",
  "ST.COLD_START": "cold start",
  "ST.CUSTOMER_SWITCH": "customer switch",
  "ST.CYCLE_CHANGE": "ordering-cycle change",
  "ST.EOL_DECLINE": "end-of-life decline",
  "ST.LAUNCH_RAMP": "launch ramp",
  "ST.LOST_ACCOUNT": "lost account",
  "ST.ONPHASE_ZERO": "zero on an order month",
};
export const typeLabel = (code: string | null): string => (code ? (TYPE_LABEL[code] ?? code.split(".").pop()?.toLowerCase().replace(/_/g, " ") ?? code) : "–");
const PLURAL: Record<string, string> = { "missing row": "missing rows", "sign error": "sign errors", "listed stock-out": "listed stock-outs", "unlisted stock-out": "unlisted stock-outs", "one-off order": "one-off orders", "ERP blank": "ERP blanks", "launch ramp": "launch ramps", holiday: "holidays", "price change": "price changes", "customer switch": "customer switches", "lost account": "lost accounts" };
export const typePlural = (code: string | null): string => {
  const l = typeLabel(code);
  return PLURAL[l] ?? l;
};

/** Register rows inside the selection: series rows by series (customer at the time), scoped episodes by
 *  their labels (an episode without a label on a dimension applies to every value of it). */
export function rowsInSelection(m: Model, f: Filters, a: AnomalyFile, seriesSet: Set<number>): number[] {
  const out: number[] = [];
  const fam = f.family === null ? null : m.dims.families.name[f.family];
  const sku = f.sku === null ? null : m.dims.skus.id[f.sku];
  const reg = f.region === null ? null : m.dims.regions[f.region];
  const ch = f.channel === null ? null : m.dims.channels[f.channel];
  const cust = f.customer === null ? null : m.dims.customers[f.customer];
  const match = (v: string | null, want: string | null) => want === null || v === null || v === want;
  for (let i = 0; i < a.n; i++) {
    const s = a.series[i];
    if (s >= 0) {
      if (!seriesSet.has(s)) continue;
      if (cust !== null && lab(a.customer, i) !== null && lab(a.customer, i) !== cust) continue;
      out.push(i);
      continue;
    }
    if (sku !== null && lab(a.sku, i) !== null && lab(a.sku, i) !== sku) continue;
    if (match(lab(a.family, i), fam) && match(lab(a.region, i), reg) && match(lab(a.channel, i), ch) && match(lab(a.customer, i), cust)) out.push(i);
  }
  return out;
}

export interface TypeRow {
  code: string;
  label: string;
  cls: "data_error" | "real_event";
  flags: number;
  /** Cell-level flags (they sum to the class totals). */
  cells: number;
  /** Episode-level flags and the cells they cover. */
  episodes: number;
  covered: number;
  units: number;
  usd: number;
}
export interface AnomalyFacts {
  name: string;
  single: boolean;
  cells: number;
  errCells: number;
  realCells: number;
  /** Data-error cells whose units stay unknown (ERP blanks): kept out of fitting, not corrected. */
  unknownCells: number;
  /** Episode-level flags in the selection: on the selected series themselves, and file- or market-wide
   *  episodes (no series) whose scope covers the selection.  episodes = seriesEpisodes + wideEpisodes. */
  episodes: number;
  seriesEpisodes: number;
  wideEpisodes: number;
  errTypes: TypeRow[];
  realTypes: TypeRow[];
  /** Month (absolute) with the most flagged cells, its count and dominant type. */
  peak: number;
  peakN: number;
  peakType: string | null;
  peakLabel: string;
  /** Single series: the flag with the largest |impact|. */
  biggest: { code: string; month: string; units: number } | null;
}

/** `unknownHist`: cells of the selection whose units stay unknown, from the history flags (the variable the Overview
 *  and Data health use); without it the register's own "units unknown" actions are counted. */
export function anomalyFacts(m: Model, a: AnomalyFile, rows: number[], name: string, single: boolean, unknownHist?: number): AnomalyFacts {
  const byType = new Map<string, TypeRow>();
  const perMonth = new Map<number, Map<string, number>>();
  let errCells = 0;
  let realCells = 0;
  let unknownCells = 0;
  let episodes = 0;
  let seriesEpisodes = 0;
  let biggest: AnomalyFacts["biggest"] = null;
  for (const i of rows) {
    const code = lab(a.type, i) ?? "?";
    const cls = (lab(a.class, i) ?? "real_event") as TypeRow["cls"];
    const isCell = lab(a.level, i) === "cell";
    const r = byType.get(code) ?? { code, label: typeLabel(code), cls, flags: 0, cells: 0, episodes: 0, covered: 0, units: 0, usd: 0 };
    r.flags++;
    if (isCell) r.cells++;
    else {
      r.episodes++;
      r.covered += a.n_cells[i] ?? 0;
    }
    // impact counts only flags tied to a series: a file- or market-wide episode's impact is not the selection's
    if (a.series[i] >= 0) {
      r.units += Math.abs(a.impact_units[i] ?? 0);
      r.usd += Math.abs(a.impact_usd[i] ?? 0);
    }
    byType.set(code, r);
    if (isCell) {
      if (cls === "data_error") {
        errCells++;
        if (/units unknown/i.test(lab(a.action, i) ?? "")) unknownCells++;
      } else realCells++;
      const t = a.start[i];
      if (t >= 0 && t <= m.asOf) {
        const mm = perMonth.get(t) ?? new Map<string, number>();
        mm.set(code, (mm.get(code) ?? 0) + 1);
        perMonth.set(t, mm);
      }
      const u = Math.abs(a.impact_units[i] ?? 0);
      if (single && t >= 0 && (!biggest || u > Math.abs(biggest.units))) biggest = { code, month: m.months[t], units: a.impact_units[i] ?? 0 };
    } else {
      episodes++;
      if (a.series[i] >= 0) seriesEpisodes++;
    }
  }
  let peak = -1;
  let peakN = 0;
  let peakType: string | null = null;
  for (const [t, mm] of perMonth) {
    const n = [...mm.values()].reduce((x, y) => x + y, 0);
    if (n > peakN) {
      peakN = n;
      peak = t;
      peakType = [...mm.entries()].sort((x, y) => y[1] - x[1])[0][0];
    }
  }
  const all = [...byType.values()].sort((x, y) => y.cells - x.cells || y.covered - x.covered || y.flags - x.flags);
  return {
    name,
    single,
    cells: errCells + realCells,
    errCells,
    realCells,
    unknownCells: unknownHist ?? unknownCells,
    episodes,
    seriesEpisodes,
    wideEpisodes: episodes - seriesEpisodes,
    errTypes: all.filter((r) => r.cls === "data_error"),
    realTypes: all.filter((r) => r.cls === "real_event"),
    peak,
    peakN,
    peakType,
    peakLabel: peak >= 0 ? m.months[peak] : "",
    biggest,
  };
}

const verb = (code: string) => (PLURAL[typeLabel(code)] ? "lead" : "leads");
const share = (f: AnomalyFacts) => (f.cells ? f.realCells / f.cells : NaN);
// a type with one flagged cell reads in the singular ("a sign error"), several in the plural
const top3 = (rows: TypeRow[]) => joinList(rows.filter((r) => r.cells > 0).slice(0, 3).map((r) => (r.cells === 1 ? `${/^[aeiou]/i.test(typeLabel(r.code)) ? "an" : "a"} ${typeLabel(r.code)}` : typePlural(r.code))));

export const ANOMALY_TEMPLATES = {
  /** "78% of flagged cells were real business, not errors". */
  headline: {
    id: "anomalies.headline",
    when: (f) => f.cells > 0,
    text: (f) => {
      const s = share(f);
      return s >= 0.5 ? `${cap(fractionWord(s))} of flagged cells were real business, not errors` : `${cap(fractionWord(1 - s))} of flagged cells were data errors, corrected or kept out of fitting`;
    },
    fallback: (f) => (f.episodes > 0 ? `No single cell was flagged; ${fmtInt(f.episodes)} ${plural(f.episodes, "episode")} cover this selection` : "Nothing in this selection was flagged as unusual"),
  },
  standfirst: {
    id: "anomalies.standfirst",
    when: (f) => f.cells > 0,
    text: (f) => {
      const fixedCells = f.errCells - f.unknownCells;
      // missing rows are rebuilt from the Record_ID grid, not "corrected": name both when both occur
      const fixedWord = f.errTypes.some((r) => r.code === "DE.MISSING_ROW" && r.cells > 0) ? "corrected or rebuilt" : "corrected";
      const errHow =
        f.unknownCells === 0
          ? `${f.errCells === 1 ? "was a data error and was" : "were data errors and were"} corrected`
          : fixedCells === 0
            ? `${f.errCells === 1 ? "was a data error whose units stay unknown" : "were data errors whose units stay unknown"}, kept out of fitting`
            : `were data errors: ${fmtInt(fixedCells)} ${fixedWord}, ${fmtInt(f.unknownCells)} with units unknown and kept out of fitting`;
      const err = f.errCells ? `**${fmtInt(f.errCells)}** ${errHow}${top3(f.errTypes) ? ` (${top3(f.errTypes)})` : ""}` : "none was a data error";
      const real = f.realCells ? `**${fmtInt(f.realCells)}** ${f.realCells === 1 ? "was a real event" : "were real events"}, kept in the history and modelled or masked from fitting${top3(f.realTypes) ? ` (${top3(f.realTypes)})` : ""}` : "none was a real event";
      // episodes are counted apart from cells, and the sentence says which ones (C4: the series' own episodes
      // vs file- or market-wide episodes that cover it); both are listed in the register under "Episodes"
      const ep =
        f.episodes === 0
          ? ""
          : f.single
            ? ` The register also lists ${f.seriesEpisodes ? `${fmtInt(f.seriesEpisodes)} ${plural(f.seriesEpisodes, "episode")} on this series and ` : ""}${fmtInt(f.wideEpisodes)} file- or market-wide ${plural(f.wideEpisodes, "episode")} that cover it, from date formats to price changes (level "Episodes").`
            : ` ${fmtInt(f.episodes)} more ${plural(f.episodes, "flag")} cover whole episodes, from date formats to launches.`;
      return `**${fmtInt(f.cells)} ${f.cells === 1 ? "cell" : "cells"}** of ${f.single ? f.name : f.name ? `the history of ${f.name}` : "the history"} were flagged. ${cap(err)}; ${real}.${ep}`;
    },
    fallback: (f) => (f.episodes ? `${fmtInt(f.episodes)} register ${plural(f.episodes, "episode")} apply to this selection, none of them at the level of single cells.` : "Widen the filters to see flagged points."),
  },
  timelineTitle: {
    id: "anomalies.timeline",
    when: (f) => (f.single ? !!f.biggest && f.biggest.units !== 0 : f.peak >= 0 && f.peakN > 1),
    text: (f) => {
      if (f.single && f.biggest) return `The largest flag is ${f.biggest.code.startsWith("DE") || f.biggest.code.startsWith("RC") ? "an error" : "a real event"} in ${monthName(f.biggest.month)}: ${typeLabel(f.biggest.code)}, ${fmtInt(Math.abs(f.biggest.units))} units`;
      return `Flags peak in ${monthName(f.peakLabel)}: ${fmtInt(f.peakN)} cells, mostly ${typePlural(f.peakType)}`;
    },
    fallback: (f) => (f.cells ? "Flagged points on the history" : "No flagged point on this history"),
  },
  typesTitle: {
    id: "anomalies.types",
    when: (f) => f.errTypes.some((r) => r.cells > 0) && f.realTypes.some((r) => r.cells > 0),
    text: (f) => `${cap(typePlural(f.realTypes[0].code))} ${verb(f.realTypes[0].code)} the real events; ${typePlural(f.errTypes[0].code)} ${verb(f.errTypes[0].code)} the errors`,
    fallback: () => "Flags by type: data errors and real events",
  },
} satisfies Record<string, Template<AnomalyFacts>>;

