// O6 Exception list for planners: a triage inbox ranked by revenue at risk, with rule, root cause and recommended
// action; group by cause; status and notes kept per viewer in this browser; a side panel with the series timeline.
import { useMemo, useState, type ReactNode } from "react";
import { useApp } from "../app/context";
import { EChart } from "../charts/EChart";
import { timelineOption } from "../charts/timeline";
import { Card, DataTable, Drawer, ErrorState, Info, Kpi, Loading, Segmented, TimelineLegend, type Column } from "../components/ui";
import { forecastAgg, historyAgg } from "../data/aggregate";
import { fmtInt, fmtUsd } from "../data/format";
import { useResource } from "../data/load";
import { selectRuns, selectSegments, seriesLabel, NO_FILTERS, type Filters } from "../data/model";
import type { ExceptionFile } from "../data/types";
import { exceptionRowsIn } from "../insights/briefing";

type Status = "new" | "acknowledged" | "resolved";
const STORE = "celeris-exceptions";

function loadStore(): Record<string, { status: Status; note: string }> {
  try {
    return JSON.parse(window.localStorage.getItem(STORE) ?? "{}");
  } catch {
    return {};
  }
}

function saveStore(v: Record<string, { status: Status; note: string }>) {
  try {
    window.localStorage.setItem(STORE, JSON.stringify(v));
  } catch {
    /* storage unavailable: statuses last for this session only */
  }
}

function SeriesPanel({ s, onClose, children }: { s: number; onClose: () => void; children: ReactNode }) {
  const { m, theme, measure } = useApp();
  const f: Filters = { ...NO_FILTERS, family: m.sFamily[s], sku: m.sSku[s], region: m.sRegion[s] };
  const h = useMemo(() => historyAgg(m, selectSegments(m, f), measure), [m, s, measure]);
  const fc = useMemo(() => forecastAgg(m, selectRuns(m, f), measure), [m, s, measure]);
  const option = useMemo(
    () => timelineOption({ m, theme, measure, lens: "orders", filters: f, hist: { shipped: h.shipped, demand: h.demand, imputed: h.imputed, cells: h.cells }, fc: { value: fc.fc, p10: fc.p10, p50: fc.p50, p90: fc.p90 }, zoom: [m.asOf - 35, m.nMonths - 1] }),
    [m, theme, measure, h, fc],
  );
  return (
    <Drawer title={seriesLabel(m, s)} sub={`${m.dims.skus.description[m.sSku[s]] ?? ""} · ${m.dims.channels[m.sChannel[s]]} · ${m.dims.customers[m.sCustomer[s]]}`} onClose={onClose}>
      <EChart option={option} height={260} ariaLabel="Series timeline" />
      <TimelineLegend latent={false} />
      {children}
    </Drawer>
  );
}

export default function Exceptions() {
  const { m, filters, go } = useApp();
  const ex = useResource<ExceptionFile>("exceptions.json");
  const [rule, setRule] = useState<string>("");
  const [grouped, setGrouped] = useState(false);
  const [store, setStore] = useState(loadStore);
  const [open, setOpen] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<"open" | "all">("open");
  const rows = useMemo(() => (ex.data ? exceptionRowsIn(m, filters, ex.data) : []), [ex.data, m, filters]);
  if (ex.loading) return <Loading what="the exception inbox" />;
  if (ex.error || !ex.data) return <ErrorState message={ex.error ?? "missing"} />;
  const E = ex.data;
  const key = (i: number) => `${E.rule[i]}|${E.series[i]}|${E.family[i]}|${E.region[i]}|${E.start[i]}`;
  const status = (i: number): Status => store[key(i)]?.status ?? "new";
  const setStatus = (i: number, st: Status, note?: string) => {
    const next = { ...store, [key(i)]: { status: st, note: note ?? store[key(i)]?.note ?? "" } };
    setStore(next);
    saveStore(next);
  };
  const byRule = new Map<string, { n: number; usd: number }>();
  for (const i of rows) {
    const cur = byRule.get(E.rule[i]) ?? { n: 0, usd: 0 };
    cur.n++;
    cur.usd += E.revenue_at_risk[i];
    byRule.set(E.rule[i], cur);
  }
  const shown = rows.filter((i) => (!rule || E.rule[i] === rule) && (statusFilter === "all" || status(i) !== "resolved"));
  const totalUsd = rows.reduce((a, i) => a + E.revenue_at_risk[i], 0);
  const resolved = rows.filter((i) => status(i) === "resolved").length;
  const where = (i: number) => (E.series[i] >= 0 ? seriesLabel(m, E.series[i]) : `${m.dims.families.name[E.family[i]]} × ${m.dims.regions[E.region[i]]}`);
  const period = (i: number) => (E.start[i] === E.end[i] ? m.months[E.start[i]] : `${m.months[E.start[i]]} → ${m.months[E.end[i]]}`);
  const rank = new Map(rows.map((i, k) => [i, k + 1]));
  const cols: Column<number>[] = [
    { key: "rank", label: "#", value: (i) => rank.get(i) ?? 0, num: true },
    { key: "rule", label: "Rule", value: (i) => E.rules[E.rule[i]]?.title ?? E.rule[i], wrap: true },
    { key: "where", label: "Series / segment", value: where },
    { key: "period", label: "Months", value: period },
    { key: "cause", label: "Root cause", value: (i) => E.cause[i], wrap: true },
    { key: "action", label: "Recommended action", value: (i) => E.action[i], wrap: true },
    { key: "units", label: "Units", value: (i) => E.impact_units[i], render: (i) => fmtInt(E.impact_units[i]), num: true },
    { key: "usd", label: "Revenue at risk", value: (i) => E.revenue_at_risk[i], render: (i) => <b>{fmtUsd(E.revenue_at_risk[i], 2)}</b>, num: true },
    {
      key: "status",
      label: "Status",
      value: (i) => status(i),
      render: (i) => (
        <select className="plain" value={status(i)} onClick={(e) => e.stopPropagation()} onChange={(e) => setStatus(i, e.target.value as Status)} aria-label="Status">
          <option value="new">new</option>
          <option value="acknowledged">acknowledged</option>
          <option value="resolved">resolved</option>
        </select>
      ),
    },
    { key: "note", label: "Note", value: (i) => store[key(i)]?.note ?? "" },
  ];
  const groups = (() => {
    const g = new Map<string, { group: string; rule: string; n: number; units: number; usd: number; action: string }>();
    for (const i of shown) {
      const cur = g.get(E.group[i]) ?? { group: E.group[i], rule: E.rules[E.rule[i]]?.title ?? E.rule[i], n: 0, units: 0, usd: 0, action: E.action[i] };
      cur.n++;
      cur.units += E.impact_units[i];
      cur.usd += E.revenue_at_risk[i];
      g.set(E.group[i], cur);
    }
    return [...g.values()];
  })();
  type G = (typeof groups)[number];
  const gcols: Column<G>[] = [
    { key: "group", label: "Cause group", value: (r) => r.group },
    { key: "rule", label: "Rule", value: (r) => r.rule },
    { key: "n", label: "Exceptions", value: (r) => r.n, num: true },
    { key: "units", label: "Units", value: (r) => Math.round(r.units), render: (r) => fmtInt(r.units), num: true },
    { key: "usd", label: "Revenue at risk", value: (r) => r.usd, render: (r) => fmtUsd(r.usd, 2), num: true },
    { key: "action", label: "One action for the group", value: (r) => r.action, wrap: true },
  ];
  return (
    <>
      <div className="kpis" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
        <Kpi label="Exceptions in the selection" value={fmtInt(rows.length)} foot={`${fmtInt(m.nRun)} forecast series in total: the rest need no action`} />
        <Kpi label="Revenue at risk" value={fmtUsd(totalUsd, 2)} foot="forecast-window USD that depends on a flagged judgement" info={<Info what="Per rule: lost account = pre-loss level × window months × price; window event = latent demand removed × price; switch = |level change| × months × price; cold start = whole forecast; EOL = phase-out months; forecast vs last year = |change| × price; bias = |bias| × segment revenue; imputed history = revenue × imputed share." source="exceptions.json (computed by celeris export)" />} />
        <Kpi label="Resolved" value={`${fmtInt(resolved)} / ${fmtInt(rows.length)}`} foot="status and notes are stored in this browser" />
        <Kpi label="Rules" value={fmtInt(byRule.size)} foot="deterministic rules over pipeline outputs" />
      </div>
      <Card
        title="Exception inbox"
        sub="Ranked by revenue at risk. Click a row for the series timeline, status and a note."
        tools={
          <>
            <Segmented ariaLabel="Status" value={statusFilter} onChange={setStatusFilter} options={[{ value: "open", label: "Open" }, { value: "all", label: "All" }]} />
            <label className="small toolbar" style={{ gap: 4 }}>
              <input type="checkbox" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} /> group by cause
            </label>
          </>
        }
        info={<Info what="Management by exception: lost accounts, events inside the window (Orion Driveline shutdown), recent customer switches, cold starts, end of life, forecasts far from last year, backtest bias by segment and imputed recent history." how="Rules and thresholds in src/celeris/export/exceptions.py; every number from the pipeline outputs." source="exceptions.json" />}
      >
        <div className="chip-row" style={{ marginBottom: 10 }}>
          <button type="button" className={`badge ${rule === "" ? "info" : ""}`} onClick={() => setRule("")}>
            All rules · {fmtInt(rows.length)}
          </button>
          {[...byRule.entries()]
            .sort((a, b) => b[1].usd - a[1].usd)
            .map(([r, v]) => (
              <button key={r} type="button" className={`badge ${rule === r ? "info" : ""}`} onClick={() => setRule(rule === r ? "" : r)} title={E.rules[r]?.at_risk}>
                {E.rules[r]?.title ?? r} · {v.n} · {fmtUsd(v.usd)}
              </button>
            ))}
        </div>
        {grouped ? <DataTable rows={groups} cols={gcols} pageSize={12} csvName="exceptions_by_cause.csv" initialSort={{ key: "usd", desc: true }} /> : <DataTable rows={shown} cols={cols} pageSize={12} csvName="exceptions.csv" onRow={(i) => setOpen(i)} />}
      </Card>
      {open !== null && E.series[open] >= 0 && (
        <SeriesPanel s={E.series[open]} onClose={() => setOpen(null)}>
          <div className="callout">
            <b>{E.rules[E.rule[open]]?.title}</b> — {E.cause[open]}
            <br />
            <span className="small">Action: {E.action[open]}</span>
            <br />
            <span className="small">
              Revenue at risk {fmtUsd(E.revenue_at_risk[open], 2)} ({E.rules[E.rule[open]]?.at_risk})
            </span>
          </div>
          <div className="toolbar">
            <label className="small">
              Status{" "}
              <select className="plain" value={status(open)} onChange={(e) => setStatus(open, e.target.value as Status)}>
                <option value="new">new</option>
                <option value="acknowledged">acknowledged</option>
                <option value="resolved">resolved</option>
              </select>
            </label>
            <button type="button" className="btn" onClick={() => go("forecast", { fam: m.dims.families.code[m.sFamily[E.series[open]]], sku: m.dims.skus.id[m.sSku[E.series[open]]], reg: m.dims.regions[m.sRegion[E.series[open]]] })}>
              Open forecast & X-ray
            </button>
            <button type="button" className="btn" onClick={() => go("explorer", { fam: m.dims.families.code[m.sFamily[E.series[open]]], sku: m.dims.skus.id[m.sSku[E.series[open]]], reg: m.dims.regions[m.sRegion[E.series[open]]] })}>
              Open in explorer
            </button>
          </div>
          <label className="small">
            Note (kept in this browser)
            <textarea style={{ width: "100%", minHeight: 70, marginTop: 4, border: "1px solid var(--hair)", borderRadius: 7, padding: 8, background: "var(--surface)", color: "var(--ink)" }} value={store[key(open)]?.note ?? ""} onChange={(e) => setStatus(open, status(open), e.target.value)} />
          </label>
        </SeriesPanel>
      )}
    </>
  );
}
