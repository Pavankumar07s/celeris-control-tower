// O5 Stock-outs and lost sales: shipped vs unconstrained demand, lost vs back-ordered units by month, shortfall
// heatmap by family x month, lost sales by year / family / region / reason, the back-order mechanics (computed from
// the stock-out file) and the series that lost the most.
import { useMemo, useState } from "react";
import type { EChartsCoreOption } from "echarts/core";
import { useApp } from "../app/context";
import { useSelection } from "../app/hooks";
import { EChart } from "../charts/EChart";
import { axisStyle, esc, tooltipStyle, type Theme } from "../charts/theme";
import { timelineOption } from "../charts/timeline";
import { Card, DataTable, ErrorState, Info, Kpi, Loading, Segmented, TimelineLegend, type Column } from "../components/ui";
import { sum } from "../data/aggregate";
import { compact, fmtInt, fmtPct, fmtSignedPct, fmtUsd } from "../data/format";
import { useResource } from "../data/load";
import { seriesLabel, type Model } from "../data/model";
import type { StockoutFile } from "../data/types";

type By = "year" | "family" | "region" | "reason";

function monthlyOption(m: Model, c: StockoutFile["cells"], keep: number[], t: Theme): EChartsCoreOption {
  const n = m.asOf + 1;
  const lost = new Float64Array(n);
  const bo = new Float64Array(n);
  for (const i of keep) {
    lost[c.month[i]] += c.lost[i];
    bo[c.month[i]] += c.backorder_out[i] ?? 0;
  }
  const ax = axisStyle(t);
  return {
    animation: false,
    grid: { left: 8, right: 16, top: 28, bottom: 8, containLabel: true },
    legend: { top: 0, left: 0, itemWidth: 10, itemHeight: 10, textStyle: { color: t.ink2, fontSize: 11 } },
    xAxis: { type: "category", data: m.months.slice(0, n), ...ax, axisLabel: { ...ax.axisLabel, interval: 11, formatter: (v: string) => v.slice(0, 4) }, splitLine: { show: false } },
    yAxis: { type: "value", ...ax, axisLabel: { ...ax.axisLabel, formatter: (v: number) => compact(v, 0) } },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, ...tooltipStyle(t), valueFormatter: (v: number) => `${fmtInt(v)} units` },
    series: [
      { name: "Lost (never shipped)", type: "bar", stack: "s", data: Array.from(lost), itemStyle: { color: t.cat[7] }, barCategoryGap: "20%" },
      { name: "Back-ordered (shipped next month)", type: "bar", stack: "s", data: Array.from(bo), itemStyle: { color: t.cat[3] } },
    ],
  };
}

/** Share of each family's monthly unconstrained demand not shipped on time (shortfall of stock-out cells / all demand). */
function shortfallOption(m: Model, c: StockoutFile["cells"], keep: number[], segs: number[], t: Theme): EChartsCoreOption {
  const nf = m.dims.families.name.length;
  const n = m.asOf + 1;
  const short = new Float64Array(nf * n);
  const dem = new Float64Array(nf * n);
  for (const g of segs) {
    const f = m.sFamily[m.gSeries[g]];
    for (let k = 0; k < m.gLen[g]; k++) dem[f * n + m.gStart[g] + k] += m.d[m.gOff[g] + k];
  }
  for (const i of keep) {
    if (c.shipped[i] === null || c.demand[i] === null || !(c.listed[i] || c.inferred[i])) continue;
    short[m.sFamily[c.series[i]] * n + c.month[i]] += Math.max(0, (c.demand[i] as number) - (c.shipped[i] as number));
  }
  const data: number[][] = [];
  let max = 0.01;
  for (let f = 0; f < nf; f++) for (let mo = 0; mo < n; mo++) {
    const k = f * n + mo;
    if (dem[k] > 0 && short[k] > 0) {
      data.push([mo, f, short[k] / dem[k], short[k]]);
      max = Math.max(max, short[k] / dem[k]);
    }
  }
  const ax = axisStyle(t);
  return {
    animation: false,
    grid: { left: 8, right: 16, top: 8, bottom: 40, containLabel: true },
    xAxis: { type: "category", data: m.months.slice(0, n), ...ax, axisLabel: { ...ax.axisLabel, interval: 11, formatter: (v: string) => v.slice(0, 4) }, splitLine: { show: false } },
    yAxis: { type: "category", data: m.dims.families.code, inverse: true, ...ax, splitLine: { show: false } },
    visualMap: { min: 0, max, dimension: 2, orient: "horizontal", left: "center", bottom: 0, itemHeight: 140, itemWidth: 10, text: [`${fmtPct(max, 0)} of demand short`, "0"], textStyle: { color: t.muted, fontSize: 10 }, inRange: { color: [t.seq[1], t.seq[5], t.seq[9], t.seq[12]] } },
    tooltip: { ...tooltipStyle(t), formatter: (p: { value: number[] }) => `<b>${esc(m.dims.families.name[p.value[1]])} · ${esc(m.months[p.value[0]])}</b><br/>${fmtInt(p.value[3])} units short = ${fmtPct(p.value[2])} of the family's unconstrained demand` },
    series: [{ type: "heatmap", data, itemStyle: { borderColor: t.surface, borderWidth: 1 } }],
  };
}

export default function Stockouts() {
  const { m, theme, filters, measure } = useApp();
  const { series, segs, h } = useSelection();
  const so = useResource<StockoutFile>("stockouts.json");
  const [by, setBy] = useState<By>("year");
  const seriesSet = useMemo(() => new Set(series), [series]);
  const keep = useMemo(() => (so.data ? so.data.cells.series.map((s, i) => (seriesSet.has(s) ? i : -1)).filter((i) => i >= 0) : []), [so.data, seriesSet]);
  const keepListed = useMemo(() => (so.data ? so.data.listed.series.map((s, i) => (seriesSet.has(s) ? i : -1)).filter((i) => i >= 0) : []), [so.data, seriesSet]);
  const option = useMemo(
    () => timelineOption({ m, theme, measure, lens: "orders", filters, hist: { shipped: h.shipped, demand: h.demand, imputed: h.imputed, cells: h.cells }, zoom: [0, m.asOf + 2] }),
    [m, theme, measure, filters, h],
  );
  const monthly = useMemo(() => (so.data ? monthlyOption(m, so.data.cells, keep, theme) : null), [so.data, m, keep, theme]);
  const short = useMemo(() => (so.data ? shortfallOption(m, so.data.cells, keep, segs, theme) : null), [so.data, m, keep, segs, theme]);
  const breakdown = useMemo(() => {
    if (!so.data) return null;
    const c = so.data.cells;
    const acc = new Map<string, { u: number; usd: number }>();
    for (const i of keep) {
      if (c.lost[i] <= 0) continue;
      const s = c.series[i];
      const key = by === "year" ? m.months[c.month[i]].slice(0, 4) : by === "family" ? m.dims.families.name[m.sFamily[s]] : by === "region" ? m.dims.regions[m.sRegion[s]] : c.reason[i];
      const cur = acc.get(key) ?? { u: 0, usd: 0 };
      cur.u += c.lost[i];
      cur.usd += c.lost_usd[i];
      acc.set(key, cur);
    }
    const rows = [...acc.entries()].sort((a, b) => (by === "year" ? a[0].localeCompare(b[0]) : b[1].usd - a[1].usd));
    const ax = axisStyle(theme);
    const option: EChartsCoreOption = {
      animation: false,
      grid: { left: 8, right: 64, top: 8, bottom: 8, containLabel: true },
      xAxis: { type: "value", ...ax, axisLabel: { ...ax.axisLabel, formatter: (v: number) => `$${compact(v, 0)}` } },
      yAxis: { type: "category", data: rows.map(([k]) => k), inverse: true, ...ax, axisLabel: { ...ax.axisLabel, width: 170, overflow: "truncate" }, splitLine: { show: false } },
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, ...tooltipStyle(theme), formatter: (it: { dataIndex: number }[]) => { const [k, v] = rows[it[0].dataIndex]; return `<b>${esc(k)}</b><br/>${fmtInt(v.u)} units lost · ${fmtUsd(v.usd)}`; } },
      series: [{ type: "bar", barMaxWidth: 16, data: rows.map(([, v]) => v.usd), itemStyle: { color: theme.cat[7], borderRadius: [0, 4, 4, 0] }, label: { show: true, position: "right", formatter: (p: { value: number }) => fmtUsd(p.value), color: theme.ink2, fontSize: 10 } }],
    };
    return { option, n: rows.length };
  }, [so.data, keep, by, m, theme]);

  if (so.loading) return <Loading what="stock-out data" />;
  if (so.error || !so.data) return <ErrorState message={so.error ?? "missing"} />;
  const c = so.data.cells;
  const L = so.data.listed;
  const lostU = keep.reduce((a, i) => a + c.lost[i], 0);
  const lostUsd = keep.reduce((a, i) => a + c.lost_usd[i], 0);
  const boU = keep.reduce((a, i) => a + (c.backorder_out[i] ?? 0), 0);
  const soCells = keep.filter((i) => c.listed[i] || c.inferred[i]);
  const inferred = keep.filter((i) => c.inferred[i]).length;
  const uplift = sum(h.demand) / sum(h.shipped) - 1;
  // back-order mechanics, computed from the listed rows of the selection
  const mech = (cls: string) => {
    let short = 0;
    let back = 0;
    let fill = 0;
    let n = 0;
    for (const i of keepListed) {
      if (L.reason_class[i] !== cls) continue;
      const sh = L.requested[i] + L.carried_in[i] - L.shipped[i];
      if (sh <= 0) continue;
      short += sh;
      back += L.backordered[i];
      fill += L.fill_pct[i] ?? 0;
      n++;
    }
    return { share: short ? back / short : NaN, fill: n ? fill / n / 100 : NaN, n };
  };
  const op = mech("operational");
  const semi = mech("semiconductor");
  const top = (() => {
    const acc = new Map<number, { u: number; usd: number; months: number }>();
    for (const i of keep) {
      const cur = acc.get(c.series[i]) ?? { u: 0, usd: 0, months: 0 };
      cur.u += c.lost[i];
      cur.usd += c.lost_usd[i];
      if (c.listed[i] || c.inferred[i]) cur.months++;
      acc.set(c.series[i], cur);
    }
    return [...acc.entries()].filter(([, v]) => v.u > 0).map(([s, v]) => ({ s, ...v }));
  })();
  type T = (typeof top)[number];
  const cols: Column<T>[] = [
    { key: "s", label: "Series", value: (r) => seriesLabel(m, r.s) },
    { key: "fam", label: "Family", value: (r) => m.dims.families.name[m.sFamily[r.s]] },
    { key: "months", label: "Stock-out months", value: (r) => r.months, num: true },
    { key: "u", label: "Lost units", value: (r) => Math.round(r.u), render: (r) => fmtInt(r.u), num: true },
    { key: "usd", label: "Lost USD", value: (r) => Math.round(r.usd), render: (r) => fmtUsd(r.usd), num: true },
  ];
  return (
    <>
      <div className="kpis">
        <Kpi label="Lost sales (units)" value={fmtInt(lostU)} foot="requested but never shipped, 2019–2026" info={<Info what="Lost units from listed stock-outs plus imputed unlisted semiconductor months and detected hidden stock-outs." source="stockouts.json ← train_clean.parquet (lost_units)" />} />
        <Kpi label="Lost sales (USD)" value={fmtUsd(lostUsd)} foot="at the invoice price of the month" />
        <Kpi label="Back-ordered units" value={fmtInt(boU)} foot="shipped one month late (catch-up removed from demand)" />
        <Kpi label="Stock-out cells" value={fmtInt(soCells.length)} foot={`${fmtInt(inferred)} inferred (not in the stock-out file)`} info={<Info what="Cells constrained by supply: listed in inventory_stockouts.csv, or inferred (unlisted semiconductor months, hidden operational stock-outs found by arithmetic signatures)." source="stockouts.json" />} />
        <Kpi label="Unconstrained vs shipped" value={fmtSignedPct(uplift, 2)} foot="demand above shipments over the selection's history" />
      </div>
      <div className="grid g2">
        <Card title="Shipped vs unconstrained demand" sub="The ink line is unconstrained demand: requested demand where stock-outs censored shipments (and back-order catch-up is removed)." info={<Info what="History of the selection: cleaned shipments and unconstrained demand, the basis of the forecast (business rule 7)." source="history.json" />}>
          <EChart option={option} height={300} ariaLabel="Shipped vs unconstrained demand" />
          <TimelineLegend latent={false} band={false} />
        </Card>
        <Card title="Shortfall by month · units" sub="Lost units vs back-ordered units (which ship the following month on top of its own demand)." info={<Info what="Monthly shortfall split into the part never shipped and the part shipped late." source="stockouts.json (lost, backorder_out)" />}>
          {monthly && <EChart option={monthly} height={300} ariaLabel="Lost and back-ordered units by month" />}
        </Card>
      </div>
      <div className="grid g3">
        <Card title="Shortfall heatmap · family × month" sub="Units not shipped on time in stock-out cells, as a share of the family's demand that month." info={<Info what="Σ (unconstrained demand − shipped) over the listed and inferred stock-out cells, divided by the family's total unconstrained demand in the month (darker = deeper shortage)." source="stockouts.json (cells), history.json" />}>
          {short && <EChart option={short} height={280} ariaLabel="Shortfall heatmap" />}
        </Card>
        <Card title="Lost sales" tools={<Segmented ariaLabel="Breakdown" value={by} onChange={setBy} options={[{ value: "year", label: "Year" }, { value: "family", label: "Family" }, { value: "region", label: "Region" }, { value: "reason", label: "Reason" }]} />} info={<Info what="Lost USD by year, family, region or the reason given in the stock-out file (or the inference method)." source="stockouts.json" />}>
          {breakdown && <EChart option={breakdown.option} height={Math.max(240, breakdown.n * 26 + 30)} ariaLabel="Lost sales breakdown" />}
        </Card>
        <Card title="How a stock-out plays out" sub="Mechanics measured on the listed rows of this selection." info={<Info what="Rules recovered from inventory_stockouts.csv: shipped = fill × (requested + carried in); part of the shortfall is back-ordered and ships next month on top of that month's own demand; the rest is lost." source="stockouts.json (listed)" />}>
          <dl className="kv">
            <dt>Operational stock-outs</dt>
            <dd>{fmtInt(op.n)} rows with a shortfall</dd>
            <dt>· share of shortfall back-ordered</dt>
            <dd>{fmtPct(op.share)}</dd>
            <dt>· average fill rate</dt>
            <dd>{fmtPct(op.fill)}</dd>
            <dt>Semiconductor allocation</dt>
            <dd>{fmtInt(semi.n)} rows with a shortfall</dd>
            <dt>· share back-ordered</dt>
            <dd>{fmtPct(semi.share)}</dd>
            <dt>· average fill rate</dt>
            <dd>{fmtPct(semi.fill)}</dd>
          </dl>
          <p className="small ink2">
            The month after a back-ordered month ships its own demand plus the back-order, so shipments overstate demand there; the pipeline removes the carry (S2) before estimating demand. Cells where the file is silent but the arithmetic signature of a stock-out appears are inferred and their demand imputed.
          </p>
        </Card>
      </div>
      <Card title="Series with the largest lost sales" sub="Ranked by lost USD in the selection." info={<Info what="Per series: months constrained by supply, lost units and lost revenue." source="stockouts.json" />}>
        <DataTable rows={top} cols={cols} pageSize={10} csvName="lost_sales_by_series.csv" initialSort={{ key: "usd", desc: true }} />
      </Card>
    </>
  );
}
