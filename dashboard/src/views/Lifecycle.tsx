// O4 Lifecycle (EOL and launches): a Gantt of the SKUs whose life changes around the forecast window, end-of-life
// run-offs to zero (business rule 5), cold starts drawn against their predecessor's history, and recent launches.
import { useMemo } from "react";
import type { EChartsCoreOption } from "echarts/core";
import { useApp } from "../app/context";
import { EChart } from "../charts/EChart";
import { axisStyle, esc, tooltipStyle, type Theme } from "../charts/theme";
import { timelineOption } from "../charts/timeline";
import { Card, DataTable, Empty, Info, type Column } from "../components/ui";
import { forecastAgg, historyAgg, sum } from "../data/aggregate";
import { compact, fmtInt } from "../data/format";
import { selectRuns, selectSegments, NO_FILTERS, type Filters, type Model } from "../data/model";

const monthIdx = (label: string | null): number | null => {
  if (!label) return null;
  const [y, mo] = label.split("-").map(Number);
  return (y - 2019) * 12 + mo - 1;
};

function lifecycleSkus(m: Model, f: Filters): number[] {
  const S = m.dims.skus;
  const out: number[] = [];
  for (let k = 0; k < S.id.length; k++) {
    if (f.family !== null && S.family[k] !== f.family) continue;
    if (f.sku !== null && k !== f.sku) continue;
    const launch = monthIdx(S.launch[k]);
    const status = S.status[k];
    if (status === "EOL Announced" || status === "Planned Launch" || status === "Discontinued" || (launch !== null && launch >= m.asOf - 17)) out.push(k);
  }
  return out;
}

function ganttOption(m: Model, skus: number[], t: Theme): EChartsCoreOption {
  const S = m.dims.skus;
  const pt = (k: number) => S.powertrain[k] ?? "Universal";
  const color: Record<string, string> = { EV: t.cat[2], ICE: t.cat[1], Universal: t.cat[0] };
  const rows = skus.map((k) => {
    const a = Math.max(0, monthIdx(S.launch[k]) ?? 0);
    const e = S.eol[k] ? (monthIdx(S.eol[k]) as number) : m.nMonths - 1;
    return { k, a, e: Math.min(e, m.nMonths - 1), open: !S.eol[k] };
  });
  rows.sort((x, y) => x.a - y.a || x.e - y.e);
  const ax = axisStyle(t);
  return {
    animation: false,
    grid: { left: 8, right: 24, top: 24, bottom: 8, containLabel: true },
    xAxis: { type: "value", min: 0, max: m.nMonths - 1, interval: 12, ...ax, axisLabel: { ...ax.axisLabel, formatter: (v: number) => m.months[v]?.slice(0, 4) ?? "" } },
    yAxis: { type: "category", data: rows.map((r) => S.id[r.k]), inverse: true, ...ax, axisLabel: { ...ax.axisLabel, fontSize: 10 }, splitLine: { show: false } },
    tooltip: {
      ...tooltipStyle(t),
      formatter: (p: { dataIndex: number }) => {
        const r = rows[p.dataIndex];
        const k = r.k;
        return `<b>${esc(S.id[k])}</b> · ${esc(S.status[k] ?? "")}<br/>${esc(S.description[k] ?? "")}<br/>${esc(pt(k))} · launch ${esc(S.launch[k] ?? "–")}${S.eol[k] ? ` · EOL ${esc(S.eol[k] as string)}` : ""}${S.replaces[k] ? `<br/>replaces ${esc(S.replaces[k] as string)}` : ""}`;
      },
    },
    series: [
      { type: "bar", stack: "g", data: rows.map((r) => r.a), itemStyle: { color: "transparent" }, silent: true, barMaxWidth: 10 },
      {
        type: "bar",
        stack: "g",
        barMaxWidth: 10,
        data: rows.map((r) => ({ value: r.e - r.a + 1, itemStyle: { color: color[pt(r.k)] ?? t.muted, opacity: r.open ? 0.55 : 1, borderRadius: r.open ? [0, 0, 0, 0] : [0, 4, 4, 0] } })),
        markLine: {
          silent: true,
          symbol: "none",
          lineStyle: { color: t.muted },
          label: { color: t.ink2, fontSize: 10, position: "end", formatter: (p: { value: number }) => (p.value === m.asOf ? "last actual" : "window end") },
          data: [{ xAxis: m.asOf }, { xAxis: m.nMonths - 1 }],
        },
      },
    ],
  };
}

function Runoff({ m, sku, title }: { m: Model; sku: number; title: string }) {
  const { theme, measure } = useApp();
  const f: Filters = { ...NO_FILTERS, family: m.skuFamily[sku], sku };
  const h = useMemo(() => historyAgg(m, selectSegments(m, f), measure), [m, sku, measure]);
  const fc = useMemo(() => forecastAgg(m, selectRuns(m, f), measure), [m, sku, measure]);
  const option = useMemo(
    () => timelineOption({ m, theme, measure, lens: "orders", filters: f, hist: { shipped: h.shipped, demand: h.demand, imputed: h.imputed, cells: h.cells }, fc: { value: fc.fc, p10: fc.p10, p50: fc.p50, p90: fc.p90 }, zoom: [m.asOf - 23, m.nMonths - 1], showEvents: false, slider: false }),
    [m, theme, measure, h, fc],
  );
  return (
    <div>
      <div className="small" style={{ marginBottom: 4 }}>
        <b>{title}</b>
      </div>
      <EChart option={option} height={190} ariaLabel={`${title} run-off`} />
    </div>
  );
}

function ColdStart({ m, sku }: { m: Model; sku: number }) {
  const { theme, measure } = useApp();
  const S = m.dims.skus;
  const pred = S.replaces[sku] ? S.id.indexOf(S.replaces[sku] as string) : -1;
  const f: Filters = { ...NO_FILTERS, family: m.skuFamily[sku], sku };
  const fc = useMemo(() => forecastAgg(m, selectRuns(m, f), measure), [m, sku, measure]);
  const ph = useMemo(() => (pred >= 0 ? historyAgg(m, selectSegments(m, { ...NO_FILTERS, family: m.skuFamily[pred], sku: pred }), measure) : null), [m, pred, measure]);
  const pf = useMemo(() => (pred >= 0 ? forecastAgg(m, selectRuns(m, { ...NO_FILTERS, family: m.skuFamily[pred], sku: pred }), measure) : null), [m, pred, measure]);
  const option = useMemo(() => {
    const predLine = new Array(m.nMonths).fill(null) as (number | null)[];
    if (ph) for (let i = 0; i <= m.asOf; i++) predLine[i] = ph.demand[i];
    if (pf) for (let k = 0; k < m.nWin; k++) predLine[m.w0 + k] = pf.fc[k];
    return timelineOption({
      m, theme, measure, lens: "orders", filters: f,
      fc: { value: fc.fc, p10: fc.p10, p50: fc.p50, p90: fc.p90 },
      lines: pred >= 0 ? [{ name: `Predecessor ${S.id[pred]} (history + forecast)`, data: predLine, color: theme.history, dashed: true, width: 1.5 }] : [],
      zoom: [m.asOf - 23, m.nMonths - 1],
      showEvents: false,
      slider: false,
    });
  }, [m, theme, measure, fc, ph, pf, pred]);
  const n = selectRuns(m, f).length;
  return (
    <div>
      <div className="small" style={{ marginBottom: 4 }}>
        <b>{S.id[sku]}</b> · {S.powertrain[sku]} · launch {S.launch[sku]} · {n} series · replaces {S.replaces[sku] ?? "–"} · 19-month forecast {compact(sum(fc.fc))} {measure === "usd" ? "USD" : "units"}
      </div>
      <EChart option={option} height={190} ariaLabel={`${S.id[sku]} cold start`} />
    </div>
  );
}

export default function Lifecycle() {
  const { m, theme, filters } = useApp();
  const S = m.dims.skus;
  const skus = useMemo(() => lifecycleSkus(m, filters), [m, filters]);
  const gantt = useMemo(() => ganttOption(m, skus, theme), [m, skus, theme]);
  const eol = skus.filter((k) => S.status[k] === "EOL Announced");
  const planned = skus.filter((k) => S.status[k] === "Planned Launch");
  const recent = useMemo(() => {
    return skus
      .filter((k) => S.status[k] === "Active")
      .map((k) => {
        const f: Filters = { ...NO_FILTERS, family: m.skuFamily[k], sku: k };
        const segs = selectSegments(m, f);
        const h = historyAgg(m, segs, "units");
        const fc = forecastAgg(m, selectRuns(m, f), "units");
        return { k, launch: S.launch[k] ?? "", series: new Set(segs.map((g) => m.gSeries[g])).size, last3: sum(h.demand, m.asOf - 2, m.asOf + 1) / 3, next12: sum(fc.fc, 0, 12) / 12, pt: S.powertrain[k] ?? "" };
      });
  }, [skus, m, S]);
  type R = (typeof recent)[number];
  const cols: Column<R>[] = [
    { key: "sku", label: "SKU", value: (r) => S.id[r.k] },
    { key: "pt", label: "Powertrain", value: (r) => r.pt },
    { key: "launch", label: "Launch", value: (r) => r.launch },
    { key: "series", label: "Series", value: (r) => r.series, num: true },
    { key: "last3", label: "Last 3 m, units / month", value: (r) => Math.round(r.last3), render: (r) => fmtInt(r.last3), num: true },
    { key: "next12", label: "Next 12 m, units / month", value: (r) => Math.round(r.next12), render: (r) => fmtInt(r.next12), num: true },
    { key: "ramp", label: "Next 12 vs last 3", value: (r) => (r.last3 ? r.next12 / r.last3 : null), render: (r) => (r.last3 ? `×${(r.next12 / r.last3).toFixed(2)}` : "–"), num: true },
  ];
  return (
    <>
      <Card
        title="Lifecycle map"
        sub="SKUs launched in the last 18 months, announced for end of life, discontinued or planned for launch. Bars run from launch to EOL (faded = no EOL date); colour = powertrain."
        info={<Info what="Product lifecycle around the forecast window from the cleaned SKU master (effective launch dates; master conflicts corrected)." source="dims.json ← clean/sku_master_clean.csv" />}
      >
        {skus.length ? <EChart option={gantt} height={Math.max(220, skus.length * 14 + 50)} ariaLabel="Lifecycle Gantt" /> : <Empty>No lifecycle changes in this selection.</Empty>}
        <div className="legend">
          <span>
            <i className="sw" style={{ background: theme.cat[2] }} /> EV
          </span>
          <span>
            <i className="sw" style={{ background: theme.cat[1] }} /> ICE
          </span>
          <span>
            <i className="sw" style={{ background: theme.cat[0] }} /> Universal
          </span>
        </div>
      </Card>
      <div className="grid g2">
        <Card title="End of life inside the window" sub="History, then the forecast's run-off: demand declines in the last months and is zero after the EOL month (business rule 5)." info={<Info what="All regions of each SKU with an announced EOL, on the shared timeline." source="history.json, forecast.json" />}>
          {eol.length ? eol.map((k) => <Runoff key={k} m={m} sku={k} title={`${S.id[k]} · EOL ${S.eol[k]} · successor ${S.id.find((_, j) => S.replaces[j] === S.id[k]) ?? "–"}`} />) : <Empty>No EOL-announced SKU in this selection.</Empty>}
        </Card>
        <Card title="Cold starts: planned launches" sub="No history of their own; drawn against the predecessor they replace (dashed). Successors do not inherit regions, customers or channels." info={<Info what="Forecast of each planned launch with its P10–P90 range, next to the predecessor's history and forecast." source="forecast.json, dims.json (replaces)" />}>
          {planned.length ? planned.map((k) => <ColdStart key={k} m={m} sku={k} />) : <Empty>No planned launch in this selection.</Empty>}
        </Card>
      </div>
      <Card title="Recent launches still ramping" sub="Launched in the last 18 months: the forecast should continue the ramp, not the mean of a short history." info={<Info what="Average monthly unconstrained demand of the last 3 months vs the forecast's next 12 months, per SKU (all regions)." source="history.json, forecast.json" />}>
        <DataTable rows={recent} cols={cols} pageSize={10} csvName="recent_launches.csv" initialSort={{ key: "launch", desc: true }} />
      </Card>
    </>
  );
}
