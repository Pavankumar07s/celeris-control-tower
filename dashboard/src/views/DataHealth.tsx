// R2 Data health (training data): issues by type and file, rows affected, before vs after cleaning; the row
// waterfall, the issue x month heat-strip and every data-quality check with its before / after metric.
import { useMemo, useState } from "react";
import type { EChartsCoreOption } from "echarts/core";
import { useApp } from "../app/context";
import { useSelection } from "../app/hooks";
import { EChart } from "../charts/EChart";
import { FONT, axisStyle, esc, tooltipStyle, type Theme } from "../charts/theme";
import { Card, DataTable, ErrorState, Info, Kpi, Loading, Segmented, type Column } from "../components/ui";
import { sum } from "../data/aggregate";
import { compact, fmtInt, fmtSignedPct, fmtUsd } from "../data/format";
import { useResource } from "../data/load";
import type { Check, QualityFile } from "../data/types";

const METHODS = ["exact", "approximate", "derived", "format", "unknown", "dropped", "convention"] as const;
const METHOD_NOTE: Record<string, string> = {
  exact: "restored exactly (arithmetic identity or witness)",
  approximate: "restored within a stated tolerance",
  derived: "filled from another source (master, Record_ID block)",
  format: "reformatted to the canonical label / date",
  unknown: "value not recoverable: flagged, excluded from fitting",
  dropped: "duplicate load removed (latest kept)",
  convention: "placeholder by convention (e.g. price on zero rows)",
};

function methodColor(t: Theme, m: string): string {
  return ({ exact: t.cat[0], approximate: t.cat[2], derived: t.cat[6], format: t.cat[3], unknown: t.cat[1], dropped: t.cat[7], convention: t.axis } as Record<string, string>)[m] ?? t.muted;
}

const WATERFALL_SHORT: Record<string, string> = {
  "Raw rows in train.csv": "Raw\nrows",
  "Exact duplicate loads": "Exact\nduplicates",
  "Superseded loads, latest kept": "Superseded\nloads",
  "Unique Record_IDs": "Unique\nrecords",
  "Missing rows rebuilt from the Record_ID grid": "Missing rows\nrebuilt",
  "Grid cells: one per Date x SKU x Region": "Grid\ncells",
};

function waterfallOption(q: QualityFile, t: Theme): EChartsCoreOption {
  const steps = q.waterfall;
  const base: number[] = [];
  const pos: (number | string)[] = [];
  const neg: (number | string)[] = [];
  const tot: (number | string)[] = [];
  let run = 0;
  for (const s of steps) {
    if (s.kind === "total") {
      base.push(0);
      tot.push(s.value);
      pos.push("-");
      neg.push("-");
      run = s.value;
    } else {
      const next = run + s.value;
      base.push(Math.min(run, next));
      pos.push(s.value > 0 ? s.value : "-");
      neg.push(s.value < 0 ? -s.value : "-");
      tot.push("-");
      run = next;
    }
  }
  const ax = axisStyle(t);
  const lo = Math.min(...steps.filter((s) => s.kind === "total").map((s) => s.value)) * 0.97;
  return {
    animation: false,
    grid: { left: 8, right: 24, top: 24, bottom: 8, containLabel: true },
    xAxis: { type: "category", data: steps.map((s) => WATERFALL_SHORT[s.step.replace(/ \(.*\)$/, "")] ?? s.step), ...ax, axisLabel: { ...ax.axisLabel, interval: 0, lineHeight: 13 }, splitLine: { show: false } },
    yAxis: { type: "value", min: Math.floor(lo / 1000) * 1000, ...ax, axisLabel: { ...ax.axisLabel, formatter: (v: number) => compact(v, 0) } },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, ...tooltipStyle(t), formatter: (it: { dataIndex: number }[]) => `<b>${esc(steps[it[0].dataIndex].step)}</b><br/>${steps[it[0].dataIndex].value > 0 && steps[it[0].dataIndex].kind === "delta" ? "+" : ""}${fmtInt(steps[it[0].dataIndex].value)} rows` },
    series: [
      { type: "bar", stack: "w", data: base, itemStyle: { color: "transparent" }, silent: true },
      { type: "bar", stack: "w", data: tot, barMaxWidth: 36, itemStyle: { color: t.history, borderRadius: [4, 4, 0, 0] }, label: { show: true, position: "top", formatter: (p: { value: number }) => fmtInt(p.value), color: t.ink2, fontSize: 11, fontFamily: FONT } },
      { type: "bar", stack: "w", data: pos, barMaxWidth: 36, itemStyle: { color: t.cat[0], borderRadius: [4, 4, 0, 0] }, label: { show: true, position: "top", formatter: (p: { value: number }) => `+${fmtInt(p.value)}`, color: t.ink2, fontSize: 11 } },
      { type: "bar", stack: "w", data: neg, barMaxWidth: 36, itemStyle: { color: t.cat[7], borderRadius: [4, 4, 0, 0] }, label: { show: true, position: "top", formatter: (p: { value: number }) => `−${fmtInt(p.value)}`, color: t.ink2, fontSize: 11 } },
    ],
  };
}

type IssueRow = QualityFile["issues"]["rows"][number];

/** Recovery method of a rule: its most frequent non-convention method. */
function dominantMethod(r: IssueRow): string {
  const entries = Object.entries(r.methods).filter(([k]) => k !== "convention");
  return entries.length ? entries.sort((a, b) => b[1] - a[1])[0][0] : "convention";
}

function issuesOption(rows: IssueRow[], t: Theme): EChartsCoreOption {
  const ax = axisStyle(t);
  return {
    animation: false,
    grid: { left: 8, right: 56, top: 8, bottom: 8, containLabel: true },
    xAxis: { type: "log", min: 1, ...ax, axisLabel: { ...ax.axisLabel, formatter: (v: number) => compact(v, 0) } },
    yAxis: { type: "category", data: rows.map((r) => `${r.rule} · ${r.title}`), inverse: true, ...ax, axisLabel: { ...ax.axisLabel, width: 230, overflow: "truncate" }, splitLine: { show: false } },
    tooltip: {
      trigger: "item",
      ...tooltipStyle(t),
      formatter: (it: { dataIndex: number }) => {
        const r = rows[it.dataIndex];
        return `<div style="max-width:300px;white-space:normal"><b>${esc(r.rule)} · ${esc(r.title)}</b><br/>${esc(r.file)} · ${fmtInt(r.rows)} rows · ${fmtInt(r.cells)} cells<br/>${Object.entries(r.methods)
          .map(([k, v]) => `${esc(k)}: ${fmtInt(v)}`)
          .join(" · ")}${r.action ? `<br/><span style="opacity:.75">Action: ${esc(r.action)}</span>` : ""}</div>`;
      },
    },
    series: [
      {
        type: "bar",
        barMaxWidth: 12,
        data: rows.map((r) => ({ value: r.rows, itemStyle: { color: methodColor(t, dominantMethod(r)), borderRadius: [0, 4, 4, 0] } })),
        label: { show: true, position: "right", formatter: (p: { value: number }) => compact(p.value, 1), color: t.ink2, fontSize: 10, fontFamily: FONT },
      },
    ],
  };
}

function heatOption(q: QualityFile, t: Theme, months: string[], focus: string | null): EChartsCoreOption {
  const rules = q.heat.rules;
  const data: number[][] = [];
  q.heat.counts.forEach((row, i) => row.forEach((v, mo) => {
    if (v > 0) data.push([mo, i, v]);
  }));
  const ax = axisStyle(t);
  return {
    animation: false,
    grid: { left: 8, right: 16, top: 8, bottom: 30, containLabel: true },
    xAxis: { type: "category", data: months.slice(0, 94), ...ax, axisLabel: { ...ax.axisLabel, interval: 11, formatter: (v: string) => v.slice(0, 4) }, splitLine: { show: false } },
    yAxis: { type: "category", data: rules, inverse: true, ...ax, axisLabel: { ...ax.axisLabel, fontSize: 10, interval: 0, formatter: (v: string) => (v === focus ? `▶ ${v}` : v) }, splitLine: { show: false } },
    visualMap: { type: "piecewise", show: false, pieces: [{ min: 1, max: 2, color: t.seq[2] }, { min: 3, max: 10, color: t.seq[5] }, { min: 11, max: 50, color: t.seq[8] }, { min: 51, color: t.seq[11] }] },
    tooltip: { ...tooltipStyle(t), formatter: (p: { value: number[] }) => `<b>${esc(rules[p.value[1]])}</b> · ${esc(months[p.value[0]])}<br/>${fmtInt(p.value[2])} rows touched` },
    series: [{ type: "heatmap", data, itemStyle: { borderColor: t.surface, borderWidth: 1 }, emphasis: { itemStyle: { borderColor: t.ink, borderWidth: 1 } } }],
  };
}

export default function DataHealth() {
  const { m, theme } = useApp();
  const q = useResource<QualityFile>("quality.json");
  const { h } = useSelection();
  const [file, setFile] = useState("train.csv");
  const [focus, setFocus] = useState<string | null>(null);
  const issues = useMemo(() => (q.data ? q.data.issues.rows.filter((r) => !r.convention_only).sort((a, b) => b.rows - a.rows) : []), [q.data]);
  const waterfall = useMemo(() => (q.data ? waterfallOption(q.data, theme) : null), [q.data, theme]);
  const issueOpt = useMemo(() => issuesOption(issues, theme), [issues, theme]);
  const heat = useMemo(() => (q.data ? heatOption(q.data, theme, m.months, focus) : null), [q.data, theme, m.months, focus]);
  const checks = useMemo(() => (q.data ? q.data.checks.filter((c) => file === "all" || c.file === file) : []), [q.data, file]);

  if (q.loading) return <Loading what="the data-quality report" />;
  if (q.error || !q.data) return <ErrorState message={q.error ?? "missing"} />;
  const Q = q.data;
  const S = Q.summary;
  const files = Q.files;
  const cols: Column<Check>[] = [
    { key: "id", label: "Check", value: (c) => c.check_id, render: (c) => <code className="small">{c.check_id}</code> },
    { key: "title", label: "What is tested", value: (c) => c.title, render: (c) => <span title={c.description}>{c.title}</span>, wrap: true },
    { key: "dim", label: "Dimension", value: (c) => c.dimension },
    { key: "sev", label: "Severity", value: (c) => c.severity },
    { key: "aff", label: "Affected", value: (c) => c.affected, render: (c) => `${fmtInt(c.affected)} ${c.unit.replace("_", " ")}`, num: true },
    { key: "before", label: "Before", value: (c) => c.before.value, render: (c) => <span className={c.before.passed ? "" : "badge bad"}>{fmtInt(c.before.value)}</span>, num: true },
    { key: "after", label: "After", value: (c) => c.after.value, render: (c) => <span className={`badge ${c.after.passed ? "ok" : c.severity === "error" ? "bad" : "warn"}`}>{c.after.passed ? "✓" : "!"} {fmtInt(c.after.value)}</span>, num: true },
    { key: "action", label: "Action", value: (c) => c.action, wrap: true },
  ];
  const fileNames = files.map((f) => f.file);
  const selFixed = sum(h.fixed);
  const selMissing = sum(h.missing);
  const selImputed = sum(h.imputed);
  const selCells = sum(h.cells);
  return (
    <>
      <div className="kpis">
        <Kpi label="Checks run" value={fmtInt(S.checks)} foot={`${S.checks_failing_before} failing on the raw files`} info={<Info what="Every data-quality check of the pipeline across the 7 input files and the 3 stages run." source="quality/dq_report.json" />} />
        <Kpi label="Failing after cleaning" value={`${S.checks_failing_after.error ?? 0} errors`} foot={`${S.checks_failing_after.warning ?? 0} documented warnings · ${S.checks_failing_after.info ?? 0} info`} info={<Info what="Severity error must pass after cleaning; a warning is a documented residual (e.g. ERP quantities that cannot be recovered)." source="dq_report.json summary" />} />
        <Kpi label="Cells changed" value={compact(S.cells_changed, 1)} foot={`exact ${compact(S.cells_changed_by_method.exact ?? 0)} · format ${compact(S.cells_changed_by_method.format ?? 0)} · unknown ${fmtInt(S.cells_changed_by_method.unknown ?? 0)}`} info={<Info what="One fix-log row per changed cell, with its rule, method, raw value, before and after." source="quality/fix_log.parquet" />} />
        <Kpi label="Units, naive vs clean" value={fmtSignedPct(S.train_units_clean / S.train_units_naive - 1)} foot={`${compact(S.train_units_naive, 2)} → ${compact(S.train_units_clean, 2)} units`} info={<Info what="Total units if the raw numbers were just coerced (×10, ×100, sign and pack errors left in) vs after cleaning." source="dq_report.json summary" />} />
        <Kpi label="Revenue, naive vs clean" value={fmtSignedPct(S.train_revenue_clean_usd / S.train_revenue_naive_usd - 1)} foot={`${fmtUsd(S.train_revenue_naive_usd, 2)} → ${fmtUsd(S.train_revenue_clean_usd, 2)}`} info={<Info what="Revenue identity units × price = revenue holds to the cent on every priced record after cleaning." source="dq_report.json summary" />} />
      </div>

      <div className="callout">
        In the current selection: <b>{fmtInt(selFixed)}</b> history cells carry a numeric fix, <b>{fmtInt(selMissing)}</b> missing rows were rebuilt from the Record_ID grid and <b>{fmtInt(selImputed)}</b> cells are imputed, out of {fmtInt(selCells)} cells. File-level panels below cover the whole extract.
      </div>

      <div className="grid g2">
        <Card title="Row waterfall · train.csv" sub="Raw extract to one clean cell per Date × SKU × Region." info={<Info what="Duplicate loads removed (latest Load_Timestamp kept), then the rows deleted from the extract rebuilt from the Record_ID grid — as missing, never as zero." how="Asserted in the export: raw − duplicates = records and records + missing = grid cells." source="quality.json (waterfall)" />}>
          {waterfall && <EChart option={waterfall} height={300} ariaLabel="Row waterfall" />}
        </Card>
        <Card title="Files" sub="Rows in and out, checks failing before → after (errors / warnings)." info={<Info what="Per input file: raw and clean row counts, checks, cells changed and rows dropped." source="dq_report.json (files)" />}>
          <div className="grid g3" style={{ gap: 10 }}>
            {files.map((f) => (
              <div key={f.file} className="card" style={{ padding: 12, boxShadow: "none" }}>
                <div className="toolbar" style={{ justifyContent: "space-between" }}>
                  <b className="small">{f.file}</b>
                  <span className={`badge ${(f.checks_failing_after.error ?? 0) === 0 ? "ok" : "bad"}`}>{(f.checks_failing_after.error ?? 0) === 0 ? "✓ clean" : "errors"}</span>
                </div>
                <dl className="kv" style={{ marginTop: 6 }}>
                  <dt>rows</dt>
                  <dd>{f.rows_clean === null ? `${fmtInt(f.rows_raw)} (reference only)` : `${fmtInt(f.rows_raw)} → ${fmtInt(f.rows_clean)}`}</dd>
                  <dt>checks</dt>
                  <dd>
                    {f.checks} · {f.checks_failing_before} failing → {f.checks_failing_after.error ?? 0} / {f.checks_failing_after.warning ?? 0}
                  </dd>
                  <dt>cells changed</dt>
                  <dd>{fmtInt(f.cells_changed)}</dd>
                  <dt>rows dropped</dt>
                  <dd>{fmtInt(f.rows_dropped)}</dd>
                </dl>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid g2">
        <Card
          title="Issues by rule · rows affected"
          sub="Rows affected per rule (log scale), coloured by how it was recovered. Convention fills (price placeholder on zero rows) are not issues and are left out."
          info={<Info what="Every cleaning rule that changed data: rows (records or macro months) affected, split by recovery method." how="Distinct records per rule from the fix log." source="quality.json (issues) ← fix_log.parquet" />}
        >
          <EChart option={issueOpt} height={Math.max(280, issues.length * 18 + 40)} ariaLabel="Issues by rule" onClick={(e) => setFocus(issues[e.dataIndex]?.rule ?? null)} />
          <div className="legend" style={{ marginTop: 4 }}>
            {METHODS.filter((mt) => mt !== "convention").map((mt) => (
              <span key={mt} title={METHOD_NOTE[mt]}>
                <i className="sw" style={{ background: methodColor(theme, mt) }} />
                {mt}: <span className="muted">{METHOD_NOTE[mt]}</span>
              </span>
            ))}
          </div>
        </Card>
        <Card
          title="Issue × month heat-strip · train.csv"
          sub={focus ? `Rule ${focus} highlighted (click a bar on the left to change).` : "Errors cluster in time (ERP migration blanks, pack-of-10 blocks, EUR quarter). Click a rule on the left to highlight it."}
          info={<Info what="Rows touched by each rule in each requested-delivery month, 2019-01 to 2026-10." how="Distinct records per rule and month from the fix log; convention fills excluded." source="quality.json (heat)" />}
        >
          {heat && <EChart option={heat} height={Math.max(300, Q.heat.rules.length * 17 + 50)} ariaLabel="Issue by month heat-strip" />}
          <div className="legend">
            <span>rows touched:</span>
            {[
              ["1–2", 2],
              ["3–10", 5],
              ["11–50", 8],
              ["> 50", 11],
            ].map(([l, k]) => (
              <span key={l as string}>
                <i className="sw" style={{ background: theme.seq[k as number] }} />
                {l}
              </span>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid g-2-1">
        <Card
          title="Every check, before vs after cleaning"
          sub="Metric on the raw file vs the cleaned output; severity error must pass."
          tools={<Segmented ariaLabel="File" value={file} onChange={setFile} options={[...fileNames.map((f) => ({ value: f, label: f.replace(".csv", "").replace("inventory_", "") })), { value: "all", label: "all" }]} />}
          info={<Info what="The machine-readable data-quality report: check id, rule, dimension, severity, rows affected, before / after metric and the action taken." source="quality/dq_report.json (checks)" />}
        >
          <DataTable rows={checks} cols={cols} pageSize={12} csvName={`dq_checks_${file}.csv`} />
        </Card>
        <Card title="Duplicates and restatements" sub="Repeated Record_IDs: the latest Load_Timestamp wins (business rule 2)." info={<Info what="Every dropped version of a repeated Record_ID, by kind, with the delay between the two loads." source="quality/dedup_decisions.csv" />}>
          <dl className="kv">
            {Object.entries(Q.dedup.by_kind).map(([k, v]) => (
              <div key={k} style={{ display: "contents" }}>
                <dt>{k.replace(/_/g, " ")}</dt>
                <dd>{fmtInt(v)} rows</dd>
              </div>
            ))}
            <dt>value changed on reload</dt>
            <dd>{fmtInt(Q.dedup.value_changed)} rows</dd>
            <dt>superseded units</dt>
            <dd>
              {fmtInt(Q.dedup.units_dropped_if_kept)} dropped → {fmtInt(Q.dedup.units_kept)} kept
            </dd>
          </dl>
          <h3 style={{ margin: "14px 0 6px" }}>Delay between loads (days)</h3>
          <div className="stair">
            {Object.entries(Q.dedup.delay_days).map(([k, v]) => {
              const max = Math.max(...Object.values(Q.dedup.delay_days));
              return (
                <div key={k} className="mixrow" style={{ gridTemplateColumns: "60px 1fr 60px" }}>
                  <span>{k}</span>
                  <div style={{ height: 10, width: `${(v / max) * 100}%`, background: theme.cat[0], borderRadius: "0 3px 3px 0" }} />
                  <span className="num muted">{fmtInt(v)}</span>
                </div>
              );
            })}
          </div>
          <h3 style={{ margin: "14px 0 6px" }}>Numeric states of the {fmtInt(S.train_records)} records</h3>
          <div className="stair small">
            {Object.entries(S.train_numeric_states)
              .sort((a, b) => b[1] - a[1])
              .map(([k, v]) => (
                <div key={k} className="toolbar" style={{ justifyContent: "space-between" }}>
                  <code>{k}</code>
                  <span className="num">{fmtInt(v)}</span>
                </div>
              ))}
          </div>
        </Card>
      </div>
    </>
  );
}
