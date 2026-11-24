// R4 Anomaly monitor (training data): flagged points on the series with type, reason and action; data errors
// (fixed) kept apart from real events (modelled or masked), with the full register and a group-by-cause view.
import { useMemo, useState } from "react";
import type { EChartsCoreOption } from "echarts/core";
import { useApp } from "../app/context";
import { useSelection } from "../app/hooks";
import { EChart } from "../charts/EChart";
import { axisStyle, esc, tooltipStyle, type Theme } from "../charts/theme";
import { timelineOption, type TimelineAnomaly } from "../charts/timeline";
import { LineageDrawer } from "../components/Lineage";
import { Card, DataTable, ErrorState, Info, Kpi, Loading, Segmented, TimelineLegend, type Column } from "../components/ui";
import { compact, fmtInt, fmtUsd, monthName } from "../data/format";
import { useResource } from "../data/load";
import type { Filters, Model } from "../data/model";
import type { AnomalyFile } from "../data/types";

const lab = (d: { dict: string[]; codes: number[] }, i: number): string | null => (d.codes[i] >= 0 ? d.dict[d.codes[i]] : null);

function rowsInSelection(m: Model, f: Filters, a: AnomalyFile, seriesSet: Set<number>): number[] {
  const out: number[] = [];
  const fam = f.family === null ? null : m.dims.families.name[f.family];
  const sku = f.sku === null ? null : m.dims.skus.id[f.sku];
  const reg = f.region === null ? null : m.dims.regions[f.region];
  const ch = f.channel === null ? null : m.dims.channels[f.channel];
  const cust = f.customer === null ? null : m.dims.customers[f.customer];
  for (let i = 0; i < a.n; i++) {
    const s = a.series[i];
    if (s >= 0) {
      if (!seriesSet.has(s)) continue;
      if (cust !== null && lab(a.customer, i) !== null && lab(a.customer, i) !== cust) continue;
      out.push(i);
      continue;
    }
    if (sku !== null && lab(a.sku, i) !== sku) continue;
    const match = (v: string | null, want: string | null) => want === null || v === null || v === want;
    if (match(lab(a.family, i), fam) && match(lab(a.region, i), reg) && match(lab(a.channel, i), ch) && match(lab(a.customer, i), cust)) out.push(i);
  }
  return out;
}

function typeOption(a: AnomalyFile, rows: number[], t: Theme): EChartsCoreOption {
  const byType = new Map<string, { err: number; real: number; cells: number; usd: number }>();
  for (const i of rows) {
    const ty = lab(a.type, i) ?? "?";
    const cur = byType.get(ty) ?? { err: 0, real: 0, cells: 0, usd: 0 };
    if (lab(a.class, i) === "data_error") cur.err++;
    else cur.real++;
    cur.cells += a.n_cells[i] ?? 0;
    cur.usd += Math.abs(a.impact_usd[i] ?? 0);
    byType.set(ty, cur);
  }
  const types = [...byType.entries()].sort((x, y) => y[1].err + y[1].real - (x[1].err + x[1].real)).slice(0, 18);
  const ax = axisStyle(t);
  return {
    animation: false,
    grid: { left: 8, right: 48, top: 26, bottom: 8, containLabel: true },
    legend: { top: 0, left: 0, itemWidth: 10, itemHeight: 10, textStyle: { color: t.ink2, fontSize: 11 } },
    xAxis: { type: "log", min: 0.5, ...ax, axisLabel: { ...ax.axisLabel, hideOverlap: true, formatter: (v: number) => (v >= 1 ? compact(v, 0) : "") } },
    yAxis: { type: "category", data: types.map(([k]) => k), inverse: true, ...ax, axisLabel: { ...ax.axisLabel, fontSize: 10.5 }, splitLine: { show: false } },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      ...tooltipStyle(t),
      formatter: (it: { dataIndex: number }[]) => {
        const [k, v] = types[it[0].dataIndex];
        return `<b>${esc(k)}</b><br/>${fmtInt(v.err + v.real)} register rows · ${fmtInt(v.cells)} cells<br/>|impact| ${fmtUsd(v.usd)}`;
      },
    },
    series: [
      { name: "Data error (fixed)", type: "bar", barMaxWidth: 12, data: types.map(([, v]) => v.err || null), itemStyle: { color: t.error, borderRadius: [0, 4, 4, 0] } },
      { name: "Real event (modelled / masked)", type: "bar", barMaxWidth: 12, data: types.map(([, v]) => v.real || null), itemStyle: { color: t.event, borderRadius: [0, 4, 4, 0] } },
    ],
  };
}

export default function Anomalies() {
  const { m, theme, filters, measure, lens, setFilters } = useApp();
  const { series, single, h, segs } = useSelection();
  const reg = useResource<AnomalyFile>("anomalies.json");
  const [cls, setCls] = useState<"all" | "data_error" | "real_event">("all");
  const [level, setLevel] = useState<"cell" | "episode" | "all">("all");
  const [type, setType] = useState<string>("");
  const [grouped, setGrouped] = useState(false);
  const [cell, setCell] = useState<{ s: number; t: number } | null>(null);
  const seriesSet = useMemo(() => new Set(series), [series]);
  const inSel = useMemo(() => (reg.data ? rowsInSelection(m, filters, reg.data, seriesSet) : []), [reg.data, m, filters, seriesSet]);
  const rows = useMemo(() => {
    if (!reg.data) return [];
    const a = reg.data;
    return inSel.filter((i) => (cls === "all" || lab(a.class, i) === cls) && (level === "all" || lab(a.level, i) === level) && (!type || lab(a.type, i) === type));
  }, [reg.data, inSel, cls, level, type]);

  const marks = useMemo((): TimelineAnomaly[] => {
    if (!reg.data) return [];
    const a = reg.data;
    const byMonth = new Map<string, { n: number; types: Map<string, number>; cause: string }>();
    for (const i of rows) {
      if (a.series[i] < 0 || lab(a.level, i) !== "cell") continue;
      const c = lab(a.class, i) as string;
      for (let mo = a.start[i]; mo <= Math.min(a.end[i], m.asOf); mo++) {
        const key = `${c}|${mo}`;
        const cur = byMonth.get(key) ?? { n: 0, types: new Map(), cause: lab(a.cause, i) ?? "" };
        cur.n++;
        const ty = lab(a.type, i) ?? "?";
        cur.types.set(ty, (cur.types.get(ty) ?? 0) + 1);
        byMonth.set(key, cur);
      }
    }
    // aggregates: mark clusters only — months with at least twice the class's average monthly count
    const avg = new Map<string, number>();
    for (const [key, v] of byMonth) {
      const c = key.split("|")[0];
      avg.set(c, (avg.get(c) ?? 0) + v.n / (m.asOf + 1));
    }
    const out: TimelineAnomaly[] = [];
    for (const [key, v] of byMonth) {
      const [c, moS] = key.split("|");
      const mo = Number(moS);
      if (single === null && v.n < Math.max(3, 2 * (avg.get(c) ?? 0))) continue;
      const types = [...v.types.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4);
      const val = lens === "latent" ? h.latent[mo] : h.demand[mo];
      out.push({
        month: mo,
        value: val,
        cls: c as TimelineAnomaly["cls"],
        text: `<b>${monthName(m.months[mo])} · ${c === "data_error" ? "data error (fixed)" : "real event"}</b><br/>${types.map(([k, n]) => `${esc(k)}: ${n}`).join("<br/>")}${single !== null ? `<br/><span style="opacity:.75">${esc(v.cause)}</span>` : ""}`,
      });
    }
    return out;
  }, [reg.data, rows, m, single, h, lens]);

  const option = useMemo(
    () =>
      timelineOption({
        m, theme, measure, lens, filters,
        hist: { shipped: lens === "latent" ? h.latent : h.shipped, demand: lens === "latent" ? h.latent : h.demand, imputed: h.imputed, cells: h.cells },
        anomalies: marks,
        zoom: [0, m.asOf + 2],
      }),
    [m, theme, measure, lens, filters, h, marks],
  );
  const typeOpt = useMemo(() => (reg.data ? typeOption(reg.data, inSel, theme) : null), [reg.data, inSel, theme]);

  if (reg.loading) return <Loading what="the anomaly register" />;
  if (reg.error || !reg.data) return <ErrorState message={reg.error ?? "missing"} />;
  const a = reg.data;
  const totals = (c: string) => {
    let n = 0;
    let cells = 0;
    let units = 0;
    let usd = 0;
    for (const i of inSel) {
      if (lab(a.class, i) !== c) continue;
      n++;
      if (lab(a.level, i) === "cell") cells++;
      units += Math.abs(a.impact_units[i] ?? 0);
      usd += Math.abs(a.impact_usd[i] ?? 0);
    }
    return { n, cells, units, usd };
  };
  const err = totals("data_error");
  const real = totals("real_event");
  const typesAvail = [...new Set(inSel.map((i) => lab(a.type, i) ?? ""))].sort();
  const seriesLabel = (i: number) => (a.series[i] >= 0 ? `${lab(a.sku, i)} · ${lab(a.region, i)}` : (lab(a.scope, i) ?? "–"));
  const period = (i: number) => (a.start[i] < 0 ? "–" : a.start[i] === a.end[i] ? m.months[a.start[i]] : `${m.months[a.start[i]]} → ${m.months[Math.min(a.end[i], m.nMonths - 1)]}`);
  const cols: Column<number>[] = [
    { key: "type", label: "Type", value: (i) => lab(a.type, i), render: (i) => <code className="small">{lab(a.type, i)}</code> },
    { key: "class", label: "Class", value: (i) => lab(a.class, i), render: (i) => <span className="badge" style={{ color: lab(a.class, i) === "data_error" ? theme.error : theme.event }}>{lab(a.class, i) === "data_error" ? "data error" : "real event"}</span> },
    { key: "series", label: "Series / scope", value: seriesLabel },
    { key: "period", label: "Period", value: period },
    { key: "cause", label: "Reason", value: (i) => lab(a.cause, i), render: (i) => <span title={a.evidence[i] ?? ""}>{lab(a.cause, i)}</span>, wrap: true },
    { key: "action", label: "Action", value: (i) => lab(a.action, i), wrap: true },
    { key: "conf", label: "Confidence", value: (i) => lab(a.confidence, i) },
    { key: "units", label: "Impact units", value: (i) => a.impact_units[i], render: (i) => (a.impact_units[i] === null ? "–" : fmtInt(a.impact_units[i] as number)), num: true },
    { key: "usd", label: "Impact USD", value: (i) => a.impact_usd[i], render: (i) => (a.impact_usd[i] === null ? "–" : fmtUsd(a.impact_usd[i] as number)), num: true },
    { key: "event", label: "Event", value: (i) => lab(a.event_id, i) },
  ];
  const groups = (() => {
    const g = new Map<string, { type: string; cls: string; cause: string; action: string; n: number; cells: number; units: number; usd: number }>();
    for (const i of rows) {
      const key = `${lab(a.type, i)}|${lab(a.cause, i)}`;
      const cur = g.get(key) ?? { type: lab(a.type, i) ?? "", cls: lab(a.class, i) ?? "", cause: lab(a.cause, i) ?? "", action: lab(a.action, i) ?? "", n: 0, cells: 0, units: 0, usd: 0 };
      cur.n++;
      cur.cells += a.n_cells[i] ?? 0;
      cur.units += a.impact_units[i] ?? 0;
      cur.usd += a.impact_usd[i] ?? 0;
      g.set(key, cur);
    }
    return [...g.values()];
  })();
  type G = (typeof groups)[number];
  const gcols: Column<G>[] = [
    { key: "type", label: "Type", value: (r) => r.type, render: (r) => <code className="small">{r.type}</code> },
    { key: "cls", label: "Class", value: (r) => r.cls.replace("_", " ") },
    { key: "cause", label: "Reason", value: (r) => r.cause, wrap: true },
    { key: "action", label: "Action", value: (r) => r.action, wrap: true },
    { key: "n", label: "Rows", value: (r) => r.n, num: true },
    { key: "cells", label: "Cells", value: (r) => r.cells, render: (r) => fmtInt(r.cells), num: true },
    { key: "units", label: "Impact units", value: (r) => r.units, render: (r) => fmtInt(r.units), num: true },
    { key: "usd", label: "Impact USD", value: (r) => r.usd, render: (r) => fmtUsd(r.usd), num: true },
  ];
  const open = (i: number) => {
    const s = a.series[i];
    if (s < 0) return;
    setFilters({ ...filters, family: m.sFamily[s], sku: m.sSku[s], region: m.sRegion[s] });
    if (a.start[i] >= 0 && a.start[i] <= m.asOf) setCell({ s, t: a.start[i] });
  };
  return (
    <>
      <div className="kpis" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
        <Kpi label="Data errors (fixed)" value={fmtInt(err.n)} unit="rows" foot={`${fmtInt(err.cells)} cell-level · |impact| ${compact(err.units)} units`} info={<Info what="Register rows of class data_error in the selection: wrong or missing values that were corrected (DE.*) and master or documentation conflicts (RC.*)." source="anomalies/anomaly_register.csv" />} />
        <Kpi label="Real events (kept)" value={fmtInt(real.n)} unit="rows" foot={`${fmtInt(real.cells)} cell-level · |impact| ${compact(real.units)} units`} info={<Info what="Real but unusual demand (RE.*) and structural / lifecycle events (ST.*): kept in the history and modelled or masked from fitting — never deleted." source="anomaly_register.csv" />} />
        <Kpi label="|Impact| of real events" value={fmtUsd(real.usd)} foot="absolute demand moved, at invoice prices" />
        <Kpi label="Cells in the selection" value={fmtInt(segs.reduce((x, g) => x + m.gLen[g], 0))} foot={single !== null ? "single series: every flagged cell is marked" : "aggregate: clusters of flagged cells are marked"} />
      </div>
      <div className="grid g-2-1">
        <Card
          title="Flagged points on the series"
          sub={single !== null ? "Diamonds = data errors fixed, triangles = real events. Click a month for its lineage." : "Months where flagged cells cluster (at least twice the usual monthly count). Pick one SKU and region to see every flagged cell."}
          info={<Info what="The selection's history with anomaly marks: shape and colour by class (data error vs real event); hover for type counts and the reason." how="Cell-level register rows matched to the selected series; register filters below apply." source="anomaly_register.csv" />}
        >
          <EChart option={option} height={340} ariaLabel="Anomalies on the timeline" xGrid={1} onXClick={(t) => single !== null && t <= m.asOf && setCell({ s: single, t })} />
          <TimelineLegend
            latent={lens === "latent"}
            band={false}
            extra={
              <>
                <span>
                  <span style={{ color: theme.error }}>◆</span> data error (fixed)
                </span>
                <span>
                  <span style={{ color: theme.event }}>▲</span> real event
                </span>
              </>
            }
          />
        </Card>
        <Card title="Anomalies by type" sub="Register rows in the selection (log scale), errors vs real events." info={<Info what="Count of register rows per type: DE = data error, RC = reference conflict, RE = real event, ST = structural / lifecycle." source="anomaly_register.csv" />}>
          {typeOpt && <EChart option={typeOpt} height={360} ariaLabel="Anomalies by type" onClick={(e) => setType(String(e.name))} />}
        </Card>
      </div>
      <Card
        title="Anomaly register"
        sub="Every episode and cell with type, reason and action. Click a series row to focus it and open the cell lineage."
        tools={
          <>
            <Segmented ariaLabel="Class" value={cls} onChange={setCls} options={[{ value: "all", label: "All" }, { value: "data_error", label: "Data errors" }, { value: "real_event", label: "Real events" }]} />
            <Segmented ariaLabel="Level" value={level} onChange={setLevel} options={[{ value: "all", label: "Episodes + cells" }, { value: "episode", label: "Episodes" }, { value: "cell", label: "Cells" }]} />
            <select className="plain" value={type} onChange={(e) => setType(e.target.value)} aria-label="Type">
              <option value="">All types</option>
              {typesAvail.map((ty) => (
                <option key={ty} value={ty}>
                  {ty}
                </option>
              ))}
            </select>
            <label className="small toolbar" style={{ gap: 4 }}>
              <input type="checkbox" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} /> group by cause
            </label>
          </>
        }
        info={<Info what="The anomaly register: deterministic ids, class, scope, period, cause, evidence (hover the reason), detection, action, confidence and signed impact." source="anomalies/anomaly_register.csv" />}
      >
        {grouped ? <DataTable rows={groups} cols={gcols} pageSize={15} csvName="anomalies_by_cause.csv" initialSort={{ key: "n", desc: true }} /> : <DataTable rows={rows} cols={cols} pageSize={15} csvName="anomaly_register_selection.csv" onRow={open} initialSort={{ key: "usd", desc: true }} />}
      </Card>
      {cell && <LineageDrawer series={cell.s} month={cell.t} onClose={() => setCell(null)} />}
    </>
  );
}
