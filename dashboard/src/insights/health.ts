// Data health copy: facts computed from quality.json (file level) and the history flags of the selection,
// and the deterministic templates that turn them into the headline, standfirst and module titles.
// Pattern: insights/headlines.ts (condition + conclusion + descriptive fallback); no typed number.
import { fmtInt, fmtPct, monthName } from "../data/format";
import type { Model } from "../data/model";
import type { QualityFile } from "../data/types";
import { cap, countWord, plural, type Template } from "./headlines";

export interface HealthFacts {
  raw: number;
  records: number;
  cells: number;
  exactDupes: number;
  superseded: number;
  rebuilt: number;
  checks: number;
  passBefore: number;
  passAfter: number;
  /** Error-severity checks: they must pass after cleaning. */
  blocking: number;
  blockingFailBefore: number;
  blockingFailAfter: number;
  openWarn: number;
  openInfo: number;
  open: number;
  /** Cells corrected (fix-log cells excluding convention fills) and their recovery methods. */
  corrected: number;
  exact: number;
  derived: number;
  approximate: number;
  unknown: number;
  files: number;
}

export function healthFacts(q: QualityFile): HealthFacts {
  const S = q.summary;
  const C = q.checks;
  const w = (s: string) => q.waterfall.find((x) => x.step.startsWith(s))?.value ?? 0;
  const by = S.cells_changed_by_method;
  const corrected = Object.entries(by).reduce((a, [k, v]) => (k === "convention" ? a : a + v), 0);
  const open = C.filter((c) => !c.after.passed);
  return {
    raw: S.train_rows_raw,
    records: S.train_records,
    cells: S.train_grid_cells,
    exactDupes: Math.abs(w("Exact duplicate")),
    superseded: Math.abs(w("Superseded")),
    rebuilt: S.train_missing_rows,
    checks: C.length,
    passBefore: C.filter((c) => c.before.passed).length,
    passAfter: C.filter((c) => c.after.passed).length,
    blocking: C.filter((c) => c.severity === "error").length,
    blockingFailBefore: C.filter((c) => c.severity === "error" && !c.before.passed).length,
    blockingFailAfter: C.filter((c) => c.severity === "error" && !c.after.passed).length,
    openWarn: open.filter((c) => c.severity === "warning").length,
    openInfo: open.filter((c) => c.severity === "info").length,
    open: open.length,
    corrected,
    exact: (by.exact ?? 0) + (by.format ?? 0),
    derived: by.derived ?? 0,
    approximate: by.approximate ?? 0,
    unknown: by.unknown ?? 0,
    files: q.files.length,
  };
}

export const HEALTH_TEMPLATES = {
  /** "Every blocking check now passes; 47 failed on the raw files". */
  headline: {
    id: "health.headline",
    when: (f) => f.blockingFailAfter === 0 && f.blockingFailBefore > 0,
    text: (f) => `Every blocking check now passes; ${fmtInt(f.blockingFailBefore)} failed on the raw files`,
    fallback: (f) => (f.blockingFailAfter > 0 ? `${cap(countWord(f.blockingFailAfter))} blocking ${plural(f.blockingFailAfter, "check")} still ${f.blockingFailAfter === 1 ? "fails" : "fail"} after cleaning` : `${fmtInt(f.passAfter)} of ${fmtInt(f.checks)} checks pass after cleaning`),
  },
  /** "248,248 raw rows became 245,548 grid cells ... The 8 checks still open are documented residuals ..." */
  standfirst: {
    id: "health.standfirst",
    when: (f) => f.raw > 0 && f.cells > 0,
    text: (f) => {
      const open =
        f.open > 0
          ? ` The ${countWord(f.open)} ${plural(f.open, "check")} still open ${f.open === 1 ? "is a documented residual" : "are documented residuals"}${f.blockingFailAfter === 0 ? ", none of them blocking" : ""}: ${[f.openWarn ? `${countWord(f.openWarn)} ${plural(f.openWarn, "warning")}` : "", f.openInfo ? `${countWord(f.openInfo)} ${plural(f.openInfo, "note")}` : ""].filter(Boolean).join(" and ")}.`
          : " Every check passes after cleaning.";
      return `**${fmtInt(f.raw)} raw rows** in train.csv became **${fmtInt(f.cells)} grid cells**, one per month, SKU and region: ${fmtInt(f.exactDupes + f.superseded)} duplicate loads were dropped and ${fmtInt(f.rebuilt)} missing rows rebuilt from the Record_ID grid, never zero-filled.${open}`;
    },
    fallback: (f) => `${fmtInt(f.checks)} data-quality checks ran on ${countWord(f.files)} input files.`,
  },
  /** "90% of corrected cells were restored exactly; 332 could not be recovered". */
  issuesTitle: {
    id: "health.issues",
    when: (f) => f.corrected > 0 && f.exact / f.corrected >= 0.5,
    text: (f) => `${fmtPct(f.exact / f.corrected, 0)} of corrected cells were restored exactly${f.unknown > 0 ? `; ${fmtInt(f.unknown)} could not be recovered` : ""}`,
    fallback: () => "Every rule that changed data, by file",
  },
} satisfies Record<string, Template<HealthFacts>>;

// ---- the issue x month heat strip -----------------------------------------------------------------------
export interface HeatFacts {
  rules: number;
  /** Rules whose rows all fall inside a window of at most six months (>= 90 % of rows). */
  blocks: { rule: string; first: number; last: number }[];
  first: string;
  last: string;
}
export function heatFacts(q: QualityFile, m: Model): HeatFacts {
  const blocks: HeatFacts["blocks"] = [];
  q.heat.rules.forEach((rule, k) => {
    const row = q.heat.counts[k];
    const tot = row.reduce((a, b) => a + b, 0);
    if (!tot) return;
    let best = 0;
    for (let a = 0; a + 6 <= row.length; a++) best = Math.max(best, row.slice(a, a + 6).reduce((x, y) => x + y, 0));
    if (best / tot >= 0.9) {
      const first = row.findIndex((v) => v > 0);
      let last = row.length - 1;
      while (last > 0 && row[last] === 0) last--;
      blocks.push({ rule, first, last });
    }
  });
  const n = q.heat.counts[0]?.length ?? 0;
  return { rules: q.heat.rules.length, blocks, first: m.months[0], last: m.months[Math.max(0, n - 1)] };
}
export const HEAT_TEMPLATES = {
  /** "Three rules strike in blocks of six months or less; the other 24 recur across 2019–26". */
  title: {
    id: "health.heat",
    when: (h) => h.blocks.length > 0 && h.blocks.length < h.rules,
    text: (h) => `${cap(countWord(h.blocks.length))} ${plural(h.blocks.length, "rule")} ${h.blocks.length === 1 ? "strikes" : "strike"} in a block of six months or less; the other ${fmtInt(h.rules - h.blocks.length)} recur from ${monthName(h.first)} to ${monthName(h.last)}`,
    fallback: (h) => `Rows touched by each of ${fmtInt(h.rules)} rules, month by month`,
  },
} satisfies Record<string, Template<HeatFacts>>;

// ---- repairs in the selection (history flags) --------------------------------------------------------------
export interface RepairRow {
  label: string;
  idx: number;
  cells: number;
  fixed: number;
  rebuilt: number;
  unknown: number;
  touched: number;
  share: number;
}
export interface RepairFacts {
  dim: "family" | "region" | "SKU";
  rows: RepairRow[];
  total: RepairRow;
}
/** Cells with a numeric fix, rebuilt rows and unknown units by family (or by region inside one family,
 *  or by SKU inside one region of one family) for the selected history segments. */
export function repairFacts(m: Model, segs: number[], dim: RepairFacts["dim"]): RepairFacts {
  const b = m.bit;
  const acc = new Map<number, RepairRow>();
  const total: RepairRow = { label: "Selection", idx: -1, cells: 0, fixed: 0, rebuilt: 0, unknown: 0, touched: 0, share: 0 };
  for (const g of segs) {
    const s = m.gSeries[g];
    const key = dim === "family" ? m.sFamily[s] : dim === "region" ? m.sRegion[s] : m.sSku[s];
    let r = acc.get(key);
    if (!r) {
      r = { label: dim === "family" ? m.dims.families.name[key] : dim === "region" ? m.dims.regions[key] : m.dims.skus.id[key], idx: key, cells: 0, fixed: 0, rebuilt: 0, unknown: 0, touched: 0, share: 0 };
      acc.set(key, r);
    }
    for (let k = 0; k < m.gLen[g]; k++) {
      const fl = m.f[m.gOff[g] + k];
      const fx = fl & b.numeric_fix ? 1 : 0;
      const mr = fl & b.missing_row ? 1 : 0;
      const uk = fl & b.units_unknown ? 1 : 0;
      r.cells++;
      r.fixed += fx;
      r.rebuilt += mr;
      r.unknown += uk;
      r.touched += fx || mr || uk ? 1 : 0;
    }
  }
  const rows = [...acc.values()];
  for (const r of rows) {
    r.share = r.cells ? r.touched / r.cells : 0;
    total.cells += r.cells;
    total.fixed += r.fixed;
    total.rebuilt += r.rebuilt;
    total.unknown += r.unknown;
    total.touched += r.touched;
  }
  total.share = total.cells ? total.touched / total.cells : 0;
  rows.sort((a, b2) => b2.share - a.share || b2.cells - a.cells);
  return { dim, rows, total };
}
export const REPAIR_TEMPLATES = {
  /** "Repairs are spread evenly: every family has 3.1–3.4% of its cells repaired". */
  even: {
    id: "health.repairs.even",
    when: (r) => r.rows.length > 2 && r.rows[r.rows.length - 1].share > 0 && r.rows[0].share / r.rows[r.rows.length - 1].share < 1.5,
    text: (r) => `Repairs are spread evenly: every ${r.dim} has ${fmtPct(r.rows[r.rows.length - 1].share)}–${fmtPct(r.rows[0].share)} of its cells repaired`,
    fallback: (r) => `Cells repaired by ${r.dim}`,
  },
  /** "Latin America carries the most repairs: 4.2% of its cells". */
  top: {
    id: "health.repairs.top",
    when: (r) => r.rows.length > 1 && r.rows[0].share > 0,
    text: (r) => `${r.rows[0].label} carries the most repairs: ${fmtPct(r.rows[0].share)} of its cells`,
    fallback: (r) => (r.total.touched > 0 ? `${fmtInt(r.total.touched)} of ${fmtInt(r.total.cells)} cells in this selection were repaired` : "No cell in this selection needed a repair"),
  },
} satisfies Record<string, Template<RepairFacts>>;
