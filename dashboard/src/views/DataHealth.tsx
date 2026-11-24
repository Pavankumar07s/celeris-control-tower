// R2 Data health (training data): is the cleaning complete, exact and auditable?
//  lede (computed headline + standfirst | hero: checks passing, raw -> cleaned dumbbell)
//  -> where the rows went (bridge, train.csv) | where repairs landed in this selection (by family / region)
//  -> every rule that changed data, grouped by file (issues by type and file, rows affected, how fixed)
//  -> issue x month heat strip (errors that strike in blocks, tied to the system events)
//  -> every check before and after cleaning (ledger; an example opens the cell lineage)
//  -> duplicates and restatements | numeric-state census.
import { useMemo } from "react";
import type { EChartsCoreOption } from "echarts/core";
import { useApp } from "../app/context";
import { useSelection, useElementWidth } from "../app/hooks";
import { EChart } from "../charts/EChart";
import { eventTitle } from "../charts/timeline";
import { FONT, fz, baseOption, esc, tooltipStyle, ttEnd, ttHead, ttNote, ttRow, type Theme } from "../charts/theme";
import { LinkButton, Segmented, StatusPill, CheckPill, Select } from "../components/controls";
import { HeroFigure, Lede } from "../components/Figure";
import { CheckCircle, WarnTriangle } from "../components/icons";
import { LineageDrawer, cellOfExample, decodeCell, encodeCell, type CellRef } from "../components/Lineage";
import { Module } from "../components/Module";
import { ErrorState, Loading, Notice } from "../components/states";
import { BarTable, DataTable, type Column } from "../components/tables";
import { fmtInt, fmtPct, fmtSigned, monthName, monthSpan } from "../data/format";
import { useResource } from "../data/load";
import { NO_FILTERS, selectSegments, type Model } from "../data/model";
import type { Check, QualityFile } from "../data/types";
import { readableMonths } from "../insights/briefing";
import { cap, countWord, plural, render, renderFirst } from "../insights/headlines";
import { HEALTH_TEMPLATES, HEAT_TEMPLATES, REPAIR_TEMPLATES, healthFacts, heatFacts, repairFacts, type HealthFacts, type RepairRow } from "../insights/health";
import { Dumbbell } from "./g1/parts";
import "./g1/g1.css";

type IssueRow = QualityFile["issues"]["rows"][number];
type Status = "fixed" | "open" | "clean" | "all";

const METHOD_WORD: Record<string, string> = {
  exact: "restored exactly",
  format: "reformatted",
  derived: "filled from the master or grid",
  dropped: "dropped, latest load kept",
  approximate: "approximate",
  unknown: "units unknown",
};
const DIM_WORD: Record<string, string> = { accuracy: "Accuracy", completeness: "Completeness", conformity: "Conformity", consistency: "Consistency", uniqueness: "Uniqueness", validity: "Validity" };

/** Short readable title of a rule: "Price and revenue in EUR (Europe Direct OEM 2022-Q1)" -> "Price and revenue in EUR". */
function ruleTitle(q: QualityFile, file: string, rule: string): string {
  const r = q.issues.rows.find((x) => x.file === file && x.rule === rule);
  let t = r && r.title !== rule ? r.title : (q.checks.find((c) => c.file === file && c.check_id.includes(`-${rule}-`))?.title ?? rule);
  t = t.replace(/\s*\([^)]*\)\s*$/, "");
  // method notes after a colon ("Blank regions: Record_ID decode vs Record_ID-free witness") read like code: the
  // ledger shows the plain part; the method stays in the "How it was fixed" column and the example cell's lineage
  if (/: .*(Record_ID|witness| vs )/.test(t)) t = t.split(": ")[0];
  return t;
}

/** The example cell of the check that documents a rule (for the lineage drawer). */
function exampleCell(m: Model, c: Check | undefined): CellRef | null {
  return c && c.file === "train.csv" ? cellOfExample(m, c.examples?.[0]) : null;
}

export default function DataHealth() {
  const { m, theme, filters, params, setParam, setFilters } = useApp();
  const q = useResource<QualityFile>("quality.json");
  const { segs, single } = useSelection();
  const status = (["fixed", "open", "clean", "all"].includes(params.get("st") ?? "") ? params.get("st") : "fixed") as Status;
  const fileSel = params.get("file") ?? "all";
  const cell = decodeCell(m, params.get("cell"));
  const openCell = (c: CellRef) => setParam({ cell: encodeCell(m, c) });

  // file-level facts use the whole history (the checks and rules cover whole files); the repairs table follows the filters
  const allHist = useMemo(() => repairFacts(m, selectSegments(m, NO_FILTERS), "family").total, [m]);
  const facts = useMemo(() => (q.data ? healthFacts(q.data, allHist) : null), [q.data, allHist]);
  const dim = filters.family === null ? "family" : filters.region === null ? "region" : "SKU";
  const repairs = useMemo(() => repairFacts(m, segs, dim), [m, segs, dim]);
  const filtered = filters.family !== null || filters.sku !== null || filters.region !== null || filters.channel !== null || filters.customer !== null;

  if (q.loading)
    return (
      <>
        <Lede headline="Reading the data-quality report…" />
        <Loading what="the data-quality report" height={320} />
      </>
    );
  if (q.error || !q.data || !facts) return <ErrorState message={q.error ?? "quality.json is missing"} />;
  const Q = q.data;
  const f = facts;

  return (
    <>
      <Lede
        headline={render(HEALTH_TEMPLATES.headline, f).text}
        standfirst={render(HEALTH_TEMPLATES.standfirst, f).text}
        figure={
          <HeroFigure
            label="Checks passing after cleaning"
            value={fmtInt(f.passAfter)}
            unit={`of ${fmtInt(f.checks)}`}
            visual={<Dumbbell before={f.passBefore} after={f.passAfter} max={f.checks} beforeLabel="Raw files" afterLabel="Cleaned" format={fmtInt} ariaLabel={`${fmtInt(f.passBefore)} of ${fmtInt(f.checks)} checks pass on the raw files and ${fmtInt(f.passAfter)} after cleaning`} />}
            context={`**${fmtSigned(f.passAfter - f.passBefore)}** against the raw files; ${f.blockingFailAfter === 0 ? `all ${fmtInt(f.blocking)} blocking checks pass` : `${fmtInt(f.blockingFailAfter)} blocking ${plural(f.blockingFailAfter, "check")} still ${f.blockingFailAfter === 1 ? "fails" : "fail"}`}`}
            info={{
              what: `Every data-quality check of the pipeline over the ${countWord(f.files)} input files and the stages that use them, evaluated on the raw files and again on the cleaned output.`,
              how: "A check is blocking when its severity is error: it must pass after cleaning or the pipeline stops. Warnings and notes stay open when the value cannot be recovered or the finding is a real event, and each one is documented.",
              source: "quality.json (checks) ← quality/dq_report.json",
            }}
          />
        }
      />

      {filtered && (
        <Notice tone="info">
          The checks, the rules and the row bridge cover whole files, so they do not change with the filters; the repairs table, the cell lists and the lineage follow your selection.
        </Notice>
      )}

      <div className="cols-5-7">
        <BridgeModule q={Q} f={f} />
        <RepairsModule m={m} single={single} segs={segs} onCell={openCell} repairs={repairs} onPick={(r) => setFilters(dim === "family" ? { ...filters, family: r.idx, sku: null } : dim === "region" ? { ...filters, region: r.idx } : { ...filters, sku: r.idx, family: m.skuFamily[r.idx] })} />
      </div>

      <IssuesModule q={Q} f={f} m={m} onCell={openCell} all={params.get("rules") === "all"} onAll={(v) => setParam({ rules: v ? "all" : null }, true)} />
      <HeatModule q={Q} m={m} theme={theme} />
      <ChecksModule q={Q} m={m} status={status} file={fileSel} setParam={setParam} onCell={openCell} />

      <div className="g1-row-2">
        <DedupModule q={Q} />
        <CensusModule q={Q} />
      </div>

      {cell && <LineageDrawer series={cell.s} month={cell.t} onClose={() => setParam({ cell: null }, true)} />}
    </>
  );
}

// ---- where the rows went: the train.csv bridge -----------------------------------------------------------
function BridgeModule({ q, f }: { q: QualityFile; f: HealthFacts }) {
  const rows = q.waterfall.map((s) => {
    const rule = s.step.match(/\(([A-Z]\d+[a-z]?)\)\s*$/)?.[1] ?? "";
    return { label: s.step.replace(/\s*\([^)]*\)\s*$/, "").replace(/ from the Record_ID grid$/, "").replace(/^Grid cells: one per Date x SKU x Region$/, "Grid cells, month × SKU × region").replace(/ x /g, " × "), rule, value: s.value, total: s.kind === "total" };
  });
  type R = (typeof rows)[number];
  const holds = f.raw - f.exactDupes - f.superseded === f.records && f.records + f.rebuilt === f.cells;
  return (
    <Module
      foot={
        holds ? (
          <span className="g1-stamp">
            <CheckCircle size={12} /> Both identities hold: raw rows − duplicate loads = unique records, and records + rebuilt rows = grid cells.
          </span>
        ) : (
          <span className="g1-stamp warn">
            <WarnTriangle size={12} /> The row counts do not reconcile; re-run the export.
          </span>
        )
      }
      title={f.exactDupes + f.superseded > 0 && f.rebuilt > 0 ? "Duplicate loads out, missing rows back in: one cell per month, SKU and region" : "From raw rows to grid cells"}
      dek="train.csv, Jan 2019 – Oct 2026. Bars show each step's change in rows, on their own scale."
      info={{
        what: "How the raw extract becomes the clean grid: duplicate loads removed (the latest Load_Timestamp wins, business rule 2), then rows missing from the extract rebuilt from the Record_ID grid.",
        how: "Asserted in the export: raw − duplicates = unique records, and records + rebuilt rows = grid cells. Rebuilt rows are flagged as missing, never filled with zero.",
        source: "quality.json (waterfall)",
      }}
    >
      <div className="g1-bridge">
        <BarTable<R>
          ariaLabel="Rows from the raw extract to the grid"
          rows={rows}
          rowKey={(r) => r.label}
          bar={{ value: (r) => (r.total ? 0 : r.value), tone: "history", leader: (r) => r.total }}
          cols={[
            { key: "l", label: "Step", kind: "label", value: (r) => r.label, width: "46%" },
            { key: "r", label: "Rule", kind: "id", value: (r) => r.rule || "", width: "12%", hideNarrow: true },
            { key: "b", label: "Change", kind: "bar" },
            { key: "v", label: "Rows", kind: "num", value: (r) => (r.total ? fmtInt(r.value) : `${r.value > 0 ? "+" : "−"}${fmtInt(Math.abs(r.value))}`), width: "21%" },
          ]}
        />
      </div>
    </Module>
  );
}

// ---- repairs in the selection ---------------------------------------------------------------------------------
interface RepairCell {
  t: number;
  what: string;
  u: number;
}
function RepairsModule({ m, single, segs, onCell, repairs, onPick }: { m: Model; single: number | null; segs: number[]; onCell: (c: CellRef) => void; repairs: ReturnType<typeof repairFacts>; onPick: (r: RepairRow) => void }) {
  // one series: list its repaired cells, each opening its lineage
  const cells = useMemo(() => {
    if (single === null) return null;
    const b = m.bit;
    const out: RepairCell[] = [];
    for (const g of segs)
      for (let k = 0; k < m.gLen[g]; k++) {
        const fl = m.f[m.gOff[g] + k];
        // the same partition as the repairs table: rebuilt row, else units unknown, else value corrected
        const what = fl & b.missing_row ? "Row rebuilt (missing from the extract)" : fl & b.units_unknown ? "Units unknown (ERP blank), kept out of fitting" : fl & b.numeric_fix ? "Value corrected" : "";
        if (what) out.push({ t: m.gStart[g] + k, what, u: m.u[m.gOff[g] + k] });
      }
    return out.sort((a, b2) => b2.t - a.t);
  }, [single, segs, m]);
  const shown = repairs.rows.slice(0, 12);
  const dimName = repairs.dim === "family" ? "Family" : repairs.dim === "region" ? "Region" : "SKU";
  const plurals = repairs.dim === "family" ? "families" : repairs.dim === "region" ? "regions" : "SKUs";
  return (
    <Module
      title={renderFirst([REPAIR_TEMPLATES.even, REPAIR_TEMPLATES.top], repairs).text}
      dek={cells ? "Every history cell of the series with a corrected value, a rebuilt row or units that stay unknown, latest first. A row opens its lineage: raw value, rule and cleaned value." : `Repaired history cells of the selection by ${repairs.dim}: each counted once, as a corrected value, a rebuilt row or units that stay unknown${repairs.rows.length > shown.length ? `; the ${shown.length} most repaired of ${fmtInt(repairs.rows.length)} ${plurals}` : ""}. Click a row to filter.`}
      info={{
        what: "Where cleaning touched the history you are looking at: cells whose units, price or revenue were corrected, rows missing from the extract that were rebuilt, and ERP-migration orders whose size is unknown.",
        how: "Counted from the flag word of every history cell of the selection (customer at the time). Each cell counts once: a rebuilt row as rebuilt, an ERP blank as units unknown, any other numeric fix as corrected, so the three columns add up to the repaired cells (the same definition as the Overview figure).",
        source: "history.json (flags)",
      }}
    >
      {cells && single !== null ? (
        <DataTable<RepairCell>
          rows={cells}
          pageSize={8}
          ariaLabel="Repaired cells of the series"
          onRow={(c) => onCell({ s: single, t: c.t })}
          empty="No cell of this series needed a repair."
          cols={[
            { key: "t", label: "Month", value: (c) => m.months[c.t], render: (c) => monthName(m.months[c.t]), width: 110 },
            { key: "w", label: "Repair", value: (c) => c.what },
            { key: "u", label: "Shipped, cleaned", value: (c) => (Number.isNaN(c.u) ? null : c.u), render: (c) => (Number.isNaN(c.u) ? "unknown" : fmtInt(c.u)), num: true, width: 130 },
            { key: "l", label: "Lineage", value: () => "open", render: () => <span className="more-link">Open</span>, width: 90 },
          ]}
        />
      ) : repairs.rows.length ? (
        <BarTable<RepairRow>
          ariaLabel={`Repairs by ${repairs.dim}`}
          rows={shown}
          rowKey={(r) => r.label}
          onRow={repairs.rows.length > 1 ? onPick : undefined}
          bar={{ value: (r) => r.share, tone: "history", leader: (r) => r === repairs.rows[0] }}
          cols={[
            { key: "l", label: dimName, kind: repairs.dim === "SKU" ? "id" : "label", value: (r) => r.label, width: "31%" },
            { key: "c", label: "Cells", kind: "num", value: (r) => fmtInt(r.cells), width: "13%", hideNarrow: true },
            { key: "f", label: "Corrected", kind: "num", value: (r) => fmtInt(r.fixed), width: "13%" },
            { key: "m", label: "Rebuilt", kind: "num", value: (r) => fmtInt(r.rebuilt), width: "11%", hideNarrow: true },
            { key: "u", label: "Units unknown", kind: "num", value: (r) => fmtInt(r.unknown), width: "12%", hideNarrow: true },
            { key: "b", label: "Share repaired", kind: "bar" },
            { key: "p", label: "%", kind: "num", value: (r) => fmtPct(r.share), width: "13%" },
          ]}
        />
      ) : null}
      {repairs.rows.length > 1 && !cells ? (
        <p className="g1-legend-line">
          <span>
            All {fmtInt(repairs.rows.length)} {plurals}: <b>{fmtInt(repairs.total.touched)}</b> of <b>{fmtInt(repairs.total.cells)}</b> cells repaired (<b>{fmtPct(repairs.total.share)}</b>) = {fmtInt(repairs.total.fixed)} corrected + {fmtInt(repairs.total.rebuilt)} rebuilt + {fmtInt(repairs.total.unknown)} units unknown
          </span>
        </p>
      ) : repairs.rows.length || cells ? null : (
        <p className="state">No history cell in this selection. Clear the customer filter to widen the view.</p>
      )}
    </Module>
  );
}

// ---- every rule that changed data, grouped by file ---------------------------------------------------------
function methodText(r: IssueRow) {
  const parts = Object.entries(r.methods)
    .filter(([k]) => k !== "convention")
    .sort((a, b) => b[1] - a[1]);
  const unknown = parts.find(([k]) => k === "unknown");
  const words = parts.filter(([k]) => k !== "unknown").map(([k]) => METHOD_WORD[k] ?? k);
  return { words: cap(words.join(" or ")), unknown: unknown ? unknown[1] : 0 };
}

const TOP_RULES = 10;
function IssuesModule({ q, f, m, onCell, all: showAll, onAll }: { q: QualityFile; f: HealthFacts; m: Model; onCell: (c: CellRef) => void; all: boolean; onAll: (v: boolean) => void }) {
  const groups = q.files.map((file) => ({
    file,
    rows: q.issues.rows.filter((r) => r.file === file.file && !r.convention_only).sort((a, b) => b.rows - a.rows),
    corrected: Object.entries(file.cells_changed_by_method).reduce((a, [k, v]) => (k === "convention" ? a : a + v), 0),
  }));
  const all = groups.flatMap((g) => g.rows);
  const max = Math.max(1, ...all.map((r) => r.rows));
  const lead = all.reduce<IssueRow | null>((a, r) => (!a || r.rows > a.rows ? r : a), null);
  const nRules = all.length;
  const fileWord = (g: (typeof groups)[number]) => {
    const F = g.file;
    const rows = F.rows_clean === null ? `${fmtInt(F.rows_raw)} rows, reference only` : F.rows_clean === F.rows_raw ? `${fmtInt(F.rows_raw)} rows` : `${fmtInt(F.rows_raw)} rows in, ${fmtInt(F.rows_clean)} out`;
    const blockAfter = F.checks_failing_after.error ?? 0;
    const checks = `${fmtInt(F.checks)} ${plural(F.checks, "check")}, ${F.checks_failing_before ? `${fmtInt(F.checks_failing_before)} failed on the raw file` : "none failed on the raw file"}${F.checks_failing_before ? `, ${blockAfter ? `${fmtInt(blockAfter)} blocking still failing` : "no blocking failure after"}` : ""}`;
    return { rows, checks };
  };
  const ruleCheck = (file: string, rule: string) => q.checks.find((c) => c.file === file && (c.rule === rule || c.check_id.includes(`-${rule}-`)));
  return (
    <Module
      title={render(HEALTH_TEMPLATES.issuesTitle, f).text}
      dek={`${fmtInt(nRules)} cleaning rules changed data in ${countWord(groups.filter((g) => g.rows.length).length)} of the ${countWord(groups.length)} input files, ranked by rows affected within each file. Click a rule to open an example cell with its raw value, rule and cleaned value.`}
      info={{
        what: "Issues by type and file: every cleaning rule that changed data, with the rows (records, or macro months) it touched, the cells it changed and how each value was recovered.",
        how: "Distinct records per rule from the fix log. Convention fills (the price placeholder on zero rows) are not issues and are left out. 'Restored exactly' covers arithmetic identities and reformatting; 'filled from the master or grid' uses a second source; 'units unknown' values (ERP blanks) stay unknown and are kept out of model fitting.",
        source: "quality.json (issues, files) ← quality/fix_log.parquet",
      }}
    >
      <div className="table-wrap">
        <table className="g1-issues" aria-label="Cleaning rules by file">
          <colgroup>
            <col style={{ width: "7%" }} />
            <col style={{ width: "31%" }} />
            <col className="hide-narrow" style={{ width: "12%" }} />
            <col className="hide-narrow" style={{ width: "15%" }} />
            <col style={{ width: "9%" }} />
            <col className="hide-narrow" style={{ width: "8%" }} />
            <col style={{ width: "18%" }} />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">Rule</th>
              <th scope="col">What was wrong</th>
              <th scope="col" className="hide-narrow">Dimension</th>
              <th scope="col" className="hide-narrow">Rows affected</th>
              <th scope="col" className="n">Rows</th>
              <th scope="col" className="n hide-narrow">Cells</th>
              <th scope="col">How it was fixed</th>
            </tr>
          </thead>
          {groups.map((g) => {
            const w = fileWord(g);
            return (
              <tbody key={g.file.file}>
                <tr className={`grp ${g.rows.length ? "" : "quiet"}`}>
                  <th colSpan={7} scope="rowgroup">
                    <b>{g.file.file}</b>
                    {w.rows}; {w.checks}
                    {g.rows.length ? `; ${fmtInt(g.corrected)} cells corrected${g.file.rows_dropped ? `, ${fmtInt(g.file.rows_dropped)} ${plural(g.file.rows_dropped, "row")} dropped` : ""}` : "; no value needed a fix"}
                  </th>
                </tr>
                {(showAll ? g.rows : g.rows.slice(0, TOP_RULES)).map((r) => {
                  const mt = methodText(r);
                  const c = exampleCell(m, ruleCheck(r.file, r.rule));
                  const title = ruleTitle(q, r.file, r.rule);
                  return (
                    <tr
                      key={r.rule}
                      className={c ? "row" : ""}
                      tabIndex={c ? 0 : undefined}
                      onClick={c ? () => onCell(c) : undefined}
                      onKeyDown={c ? (e) => e.key === "Enter" && onCell(c) : undefined}
                      aria-label={c ? `${r.rule} ${title}: open an example cell` : undefined}
                    >
                      <td>
                        <span className="g1-code">{r.rule}</span>
                      </td>
                      <td className="what" title={r.title}>
                        {title}
                      </td>
                      <td className="hide-narrow">{r.dimension ? DIM_WORD[r.dimension] ?? r.dimension : "–"}</td>
                      <td className="bar hide-narrow">
                        <div className="ib" aria-hidden="true">
                          <i className={r === lead ? "lead" : ""} style={{ width: `${(r.rows / max) * 100}%` }} />
                        </div>
                      </td>
                      <td className="n">{fmtInt(r.rows)}</td>
                      <td className="n hide-narrow">{fmtInt(r.cells)}</td>
                      <td className="how" title={r.action ? readableMonths(r.action) : undefined}>
                        {mt.unknown > 0 ? (
                          <StatusPill tone="warn" icon={<WarnTriangle size={11} />}>
                            Units unknown
                          </StatusPill>
                        ) : (
                          mt.words
                        )}
                      </td>
                    </tr>
                  );
                })}
                {g.rows.length > TOP_RULES && (
                  <tr className="more">
                    <td colSpan={7}>
                      <LinkButton onClick={() => onAll(!showAll)}>{showAll ? `Show the top ${TOP_RULES} rules of ${g.file.file}` : `Show all ${fmtInt(g.rows.length)} rules of ${g.file.file}`}</LinkButton>
                      {!showAll && <span className="muted">; the other {fmtInt(g.rows.length - TOP_RULES)} touched {fmtInt(g.rows.slice(TOP_RULES).reduce((a, r) => a + r.rows, 0))} rows</span>}
                    </td>
                  </tr>
                )}
              </tbody>
            );
          })}
        </table>
      </div>
      <p className="g1-legend-line">
        <span>
          <b>{fmtInt(f.exact)}</b> cells restored exactly or reformatted
        </span>
        <span>
          <b>{fmtInt(f.derived)}</b> filled from the master or the Record_ID grid
        </span>
        <span>
          <b>{fmtInt(f.approximate)}</b> approximate
        </span>
        <span>
          <b>{fmtInt(f.unknown)}</b> blank in the files with units unknown
          {f.hist && f.hist.unknown !== f.unknown ? `; ${fmtInt(f.hist.unknown)} still unknown in the history after ${fmtInt(Math.abs(f.unknown - f.hist.unknown))} ${plural(Math.abs(f.unknown - f.hist.unknown), "was", "were")} restored from shipments, kept out of fitting` : ", kept out of fitting"}
        </span>
      </p>
    </Module>
  );
}

// ---- issue x month heat strip ---------------------------------------------------------------------------------
const HEAT_PIECES = [
  { min: 1, max: 5, label: "1–5" },
  { min: 6, max: 20, label: "6–20" },
  { min: 21, max: 60, label: "21–60" },
  { min: 61, label: "61 or more" },
];

function heatOption(q: QualityFile, m: Model, t: Theme, narrow: boolean): EChartsCoreOption {
  const rules = q.heat.rules;
  const n = q.heat.counts[0]?.length ?? 0;
  const months = m.months.slice(0, n);
  const labels = rules.map((r) => (narrow ? r : `${r}  ${ruleTitle(q, "train.csv", r)}`));
  const data: number[][] = [];
  q.heat.counts.forEach((row, i) => row.forEach((v, mo) => v > 0 && data.push([mo, i, v])));
  // system events (ERP migration ...) that overlap a block of errors: bracket them on the strip
  const hf = heatFacts(q, m);
  const E = m.dims.events;
  const marks: { a: number; b: number; title: string }[] = [];
  for (let i = 0; i < E.id.length; i++) {
    if (E.type[i] !== "System") continue;
    const a = E.start[i];
    const b = Math.min(E.end[i], n - 1);
    if (hf.blocks.some((x) => x.first <= b && x.last >= a)) marks.push({ a, b, title: eventTitle(E.description[i]) });
  }
  const colors = [t.hist[1], t.hist[3], t.hist[4], t.hist[6]];
  return {
    ...baseOption(t),
    grid: { left: 4, right: 12, top: 26, bottom: 58, containLabel: true },
    xAxis: {
      type: "category",
      data: months,
      axisLine: { show: true, lineStyle: { color: t.ruleStrong } },
      axisTick: { show: false },
      axisLabel: { interval: (_: number, v: string) => v.endsWith("-01") && (!narrow || Number(v.slice(0, 4)) % 2 === 1), formatter: (v: string) => v.slice(0, 4), color: t.ink3, fontFamily: FONT, fontSize: fz(11.5), margin: 8 },
      splitLine: { show: false },
    },
    yAxis: {
      type: "category",
      data: labels,
      inverse: true,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: t.ink2, fontFamily: FONT, fontSize: fz(11.5), interval: 0, width: narrow ? 40 : 230, overflow: "truncate" },
      splitLine: { show: false },
    },
    visualMap: {
      type: "piecewise",
      pieces: HEAT_PIECES.map((p, i) => ({ ...p, color: colors[i] })),
      orient: "horizontal",
      left: 0,
      bottom: 0,
      itemWidth: 14,
      itemHeight: 10,
      itemGap: narrow ? 8 : 14,
      // phones: the dek already says what the cells count, so the legend keeps only its numeric pieces
      text: narrow ? undefined : ["", "Rows touched in the month"],
      textGap: 10,
      showLabel: true,
      textStyle: { color: t.ink3, fontFamily: FONT, fontSize: fz(11.5) },
      selectedMode: false,
      dimension: 2,
    },
    tooltip: {
      trigger: "item",
      ...tooltipStyle(t),
      formatter: (p: { value: number[] }) => `${ttHead(monthName(months[p.value[0]]), rules[p.value[1]])}${ttRow(t.hist[4], esc(ruleTitle(q, "train.csv", rules[p.value[1]])), fmtInt(p.value[2]), "box")}${ttNote("rows touched this month")}${ttEnd()}`,
    },
    series: [
      { type: "heatmap", data, itemStyle: { borderColor: t.paper, borderWidth: 1 }, emphasis: { itemStyle: { borderColor: t.ink, borderWidth: 1 } }, progressive: 0 },
      {
        type: "line",
        data: [],
        silent: true,
        markArea: {
          silent: true,
          itemStyle: { color: "rgba(0,0,0,0)", borderColor: t.ink3, borderWidth: 1 },
          label: { show: true, position: "top", color: t.ink, fontFamily: FONT, fontSize: fz(12), fontWeight: 600, distance: 4 },
          data: marks.map((x) => [{ xAxis: months[x.a], name: `${x.title}, ${monthSpan(months[x.a], months[x.b])}` }, { xAxis: months[x.b] }]),
        },
      },
    ],
  } as EChartsCoreOption;
}

function HeatModule({ q, m, theme }: { q: QualityFile; m: Model; theme: Theme }) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const narrow = width > 0 && width < 640;
  const option = useMemo(() => heatOption(q, m, theme, narrow), [q, m, theme, narrow]);
  const hf = useMemo(() => heatFacts(q, m), [q, m]);
  const title = render(HEAT_TEMPLATES.title, hf).text;
  const n = q.heat.counts[0]?.length ?? 0;
  return (
    <Module
      title={title}
      dek={`Rows of train.csv touched by each rule in each requested-delivery month, ${monthName(m.months[0])} – ${monthName(m.months[Math.max(0, n - 1)])}. Darker is more rows; the bracket marks a system event from the events calendar.`}
      info={{
        what: "When each cleaning rule fired. Errors that strike in blocks (a currency mix-up, a unit-of-measure block, an ERP migration) point to one system cause; errors spread evenly point to keying and loading habits.",
        how: "Distinct records per rule and month from the fix log; convention fills excluded. A rule counts as a block when at least 90% of its rows fall inside six consecutive months.",
        source: "quality.json (heat), dims.json (events)",
      }}
    >
      <div ref={ref}>
        <EChart option={option} height={Math.max(300, q.heat.rules.length * 14 + 96)} ariaLabel={`${title}. Heat strip of rows touched by rule and month.`} />
      </div>
    </Module>
  );
}

// ---- every check, before and after ---------------------------------------------------------------------------
function ChecksModule({ q, m, status, file, setParam, onCell }: { q: QualityFile; m: Model; status: Status; file: string; setParam: (p: Record<string, string | null>, replace?: boolean) => void; onCell: (c: CellRef) => void }) {
  const C = q.checks;
  const state = (c: Check): Exclude<Status, "all"> => (!c.after.passed ? "open" : !c.before.passed ? "fixed" : "clean");
  const inFile = C.filter((c) => file === "all" || c.file === file);
  const count = (s: Status) => inFile.filter((c) => s === "all" || state(c) === s).length;
  const rows = inFile.filter((c) => status === "all" || state(c) === status);
  // the dimension that failed most on the raw files (the finding of this module)
  const dims = new Map<string, { fail: number; n: number }>();
  for (const c of C) {
    const d = dims.get(c.dimension) ?? { fail: 0, n: 0 };
    d.n++;
    if (!c.before.passed) d.fail++;
    dims.set(c.dimension, d);
  }
  const top = [...dims.entries()].sort((a, b) => b[1].fail - a[1].fail || b[1].n - a[1].n)[0];
  const title =
    top && top[1].fail > 0
      ? `${DIM_WORD[top[0]] ?? cap(top[0])} failed most often on the raw files: ${fmtInt(top[1].fail)} of ${fmtInt(top[1].n)} ${top[0]} checks`
      : "Every check, before and after cleaning";
  const order: Record<string, number> = { open: 0, fixed: 1, clean: 2 };
  const cols: Column<Check>[] = [
    { key: "st", label: "Status", value: (c) => order[state(c)], render: (c) => <CheckPill passed={c.after.passed} severity={c.severity} />, width: 128 },
    {
      key: "t",
      label: "What is tested",
      value: (c) => c.title,
      render: (c) => (
        <span title={c.description}>
          <span className="g1-clip" style={{ color: "var(--ink)" }}>
            {c.title}
          </span>
          <span className="g1-sub">
            <span className="g1-code" style={{ fontSize: fz(11), color: "var(--ink-3)" }}>
              {c.check_id}
            </span>
            {c.severity === "error" ? ", blocking" : c.severity === "warning" ? ", warning" : ", note"}, in {c.unit.replace(/_/g, " ")}
          </span>
        </span>
      ),
      width: 330,
    },
    { key: "f", label: "File", value: (c) => c.file, width: 150 },
    { key: "b", label: "On raw files", value: (c) => c.before.value, render: (c) => fmtInt(c.before.value), num: true, width: 96 },
    { key: "a", label: "After cleaning", value: (c) => c.after.value, render: (c) => fmtInt(c.after.value), num: true, width: 104 },
    {
      key: "x",
      label: "Example",
      value: (c) => {
        const x = exampleCell(m, c);
        return x ? `${m.dims.skus.id[m.sSku[x.s]]} ${m.dims.regions[m.sRegion[x.s]]} ${m.months[x.t]}` : null;
      },
      render: (c) => {
        const x = exampleCell(m, c);
        return x ? (
          <span className="g1-nowrap">
            <LinkButton onClick={() => onCell(x)} title={`Open the cell lineage of ${m.dims.skus.id[m.sSku[x.s]]} in ${m.dims.regions[m.sRegion[x.s]]}: raw value, rule and cleaned value`}>
              {m.dims.skus.id[m.sSku[x.s]]}, {monthName(m.months[x.t])}
            </LinkButton>
          </span>
        ) : (
          <span className="muted">–</span>
        );
      },
      width: 150,
    },
    { key: "ac", label: "Action", value: (c) => (c.action ? readableMonths(cap(c.action)) : null), clamp: true },
  ];
  const files = ["all", ...q.files.map((x) => x.file)];
  return (
    <Module
      title={title}
      dek="Each check's metric on the raw file and on the cleaned output. Blocking checks must pass; warnings and notes that stay open are documented residuals."
      info={{
        what: "The machine-readable data-quality report: check id, file, dimension, severity, the metric before and after cleaning, and the action taken. The example opens one affected cell in the lineage drawer.",
        how: "Checks run in the pipeline stages (clean, demand, anomalies, features, backtest, forecast). Severity error = blocking.",
        source: "quality.json (checks) ← quality/dq_report.json",
      }}
    >
      <div className="g1-tools">
        <Segmented<Status>
          ariaLabel="Check status"
          value={status}
          onChange={(v) => setParam({ st: v === "fixed" ? null : v }, true)}
          options={[
            { value: "fixed", label: `Fixed by cleaning ${count("fixed")}` },
            { value: "open", label: `Still open ${count("open")}` },
            { value: "clean", label: `Passed on raw ${count("clean")}` },
            { value: "all", label: `All ${count("all")}` },
          ]}
        />
        <Select label="File" value={file} onChange={(v) => setParam({ file: v === "all" ? null : v }, true)} options={files.map((x) => ({ value: x, label: x === "all" ? "All files" : x }))} />
      </div>
      <div style={{ marginTop: 8 }}>
        <DataTable rows={rows} cols={cols} pageSize={12} csvName={`dq_checks_${status}_${file.replace(".csv", "")}.csv`} initialSort={{ key: "st", desc: false }} ariaLabel="Data-quality checks" empty="No check matches this status in this file. Choose another status or All files." />
      </div>
    </Module>
  );
}

// ---- duplicates and restatements ------------------------------------------------------------------------------
const DELAY_WORD: Record<string, string> = { "0": "Same day", "1-7": "1–7 days later", "8-14": "8–14 days later", "15-21": "15–21 days later", "22-31": "22–31 days later", ">31": "Over 31 days later" };
function DedupModule({ q }: { q: QualityFile }) {
  const D = q.dedup;
  const exact = D.by_kind.exact_duplicate ?? 0;
  const sup = D.by_kind.superseded_load ?? 0;
  const rows = Object.entries(D.delay_days).map(([k, v]) => ({ label: DELAY_WORD[k] ?? k, v }));
  const max = rows.reduce((a, r) => (r.v > a.v ? r : a), rows[0]);
  const saved = D.units_dropped_if_kept - D.units_kept;
  return (
    <Module
      title={sup > 0 ? `${fmtInt(D.value_changed)} of ${fmtInt(sup)} reloaded rows changed the number; the latest load is kept` : `${fmtInt(exact)} exact duplicate loads removed`}
      dek="Repeated Record_IDs in train.csv by the delay between the first and the last load. Business rule 2: the row with the latest Load_Timestamp is correct."
      info={{
        what: "Every dropped version of a repeated Record_ID: exact duplicates (same values, loaded twice) and superseded loads (a later load restates the row, typically a stock-out month restated to Shipped_Units).",
        how: "From the de-duplication decisions; delays in days between the two Load_Timestamps.",
        source: "quality.json (dedup) ← quality/dedup_decisions.csv",
      }}
    >
      <BarTable
        ariaLabel="Repeated loads by delay"
        rows={rows}
        rowKey={(r) => r.label}
        bar={{ value: (r) => r.v, tone: "history", leader: (r) => r === max }}
        cols={[
          { key: "l", label: "Reloaded", kind: "label", value: (r) => r.label, width: "40%" },
          { key: "b", label: "Rows", kind: "bar" },
          { key: "v", label: "", kind: "num", value: (r) => fmtInt(r.v), width: "18%" },
        ]}
      />
      <dl className="g1-facts">
        <dt>Exact duplicates</dt>
        <dd>{fmtInt(exact)} rows, identical values</dd>
        <dt>Superseded loads</dt>
        <dd>
          {fmtInt(sup)} rows, {fmtInt(D.value_changed)} with a different number
        </dd>
        <dt>Units, older versions</dt>
        <dd>{fmtInt(D.units_dropped_if_kept)}</dd>
        <dt>Units, latest versions kept</dt>
        <dd>
          {fmtInt(D.units_kept)}
          {saved !== 0 && <span className="muted">, {fmtInt(Math.abs(saved))} {saved > 0 ? "fewer" : "more"} than in the older versions</span>}
        </dd>
      </dl>
    </Module>
  );
}

// ---- numeric-state census --------------------------------------------------------------------------------------
function CensusModule({ q }: { q: QualityFile }) {
  const S = q.summary.train_numeric_states;
  const ok = S.N0_ok ?? 0;
  const zero = S.N0z_zero_row ?? 0;
  const rows = Object.entries(S)
    .filter(([k]) => !k.startsWith("N0"))
    .map(([k, v]) => {
      const [code, ...rest] = k.split("_");
      return { code, label: cap(rest.join(" ").replace(/\bx(\d+)/, "×$1").replace(/\berp\b/, "ERP").replace(/\beur\b/, "EUR")), v };
    })
    .sort((a, b) => b.v - a.v);
  const errs = rows.reduce((a, r) => a + r.v, 0);
  const total = ok + zero + errs;
  return (
    <Module
      title={errs > 0 ? `${fmtInt(errs)} records carried a numeric error, in ${fmtInt(rows.length)} distinct states` : "Every record was numerically clean as loaded"}
      dek={`Numeric state of the ${fmtInt(total)} unique train.csv records: ${fmtInt(ok)} were clean as loaded and ${fmtInt(zero)} were zero rows (no order). The rest needed one numeric fix each.`}
      info={{
        what: "Each record's numeric state as classified by the cleaner (units, price and revenue reconciled): blank units recovered from revenue, sign errors, ×10 and ×100 units, price in cents or EUR, packs of 10, ERP blanks …",
        how: "One state per record; the identity units × price = revenue holds to the cent on every priced record after cleaning.",
        source: "quality.json (summary.train_numeric_states)",
      }}
    >
      <BarTable
        ariaLabel="Records by numeric error state"
        rows={rows}
        rowKey={(r) => r.code}
        bar={{ value: (r) => r.v, tone: "history", leader: (r) => r === rows[0] }}
        cols={[
          { key: "c", label: "State", kind: "id", value: (r) => r.code, width: "13%" },
          { key: "l", label: "What was wrong", kind: "text", value: (r) => r.label, width: "42%" },
          { key: "b", label: "Records", kind: "bar" },
          { key: "v", label: "", kind: "num", value: (r) => fmtInt(r.v), width: "15%" },
        ]}
      />
    </Module>
  );
}
