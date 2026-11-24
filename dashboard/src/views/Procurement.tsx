// O3 Procurement plan from P90 (gross requirements): the mean plus the buffer to a chosen service level per month,
// lead-time cover from the aggregate-quantile formula vs the naive sum of monthly quantiles, and the buffer by SKU.
import { useMemo, useState } from "react";
import type { EChartsCoreOption } from "echarts/core";
import { useApp } from "../app/context";
import { useSelection } from "../app/hooks";
import { EChart } from "../charts/EChart";
import { axisStyle, esc, tooltipStyle, ttRow, type Theme } from "../charts/theme";
import { Card, DataTable, Info, Kpi, Segmented, type Column } from "../components/ui";
import { compact, fmtInt, fmtMeasure, fmtPct, fmtUsd, monthName } from "../data/format";
import type { Model } from "../data/model";
import { lognormalQuantile, moments, monthlyMoments, zOf } from "../data/quantiles";

const LEVELS = [
  { value: "0.8", label: "P80" },
  { value: "0.9", label: "P90" },
  { value: "0.95", label: "P95" },
  { value: "0.975", label: "P97.5" },
];

function monthlyOption(m: Model, mean: number[], q: number[], t: Theme, usd: boolean, label: string): EChartsCoreOption {
  const ax = axisStyle(t);
  const months = Array.from({ length: m.nWin }, (_, k) => m.months[m.w0 + k]);
  return {
    animation: false,
    grid: { left: 8, right: 16, top: 28, bottom: 8, containLabel: true },
    legend: { top: 0, left: 0, itemWidth: 10, itemHeight: 10, textStyle: { color: t.ink2, fontSize: 11 } },
    xAxis: { type: "category", data: months, ...ax, axisLabel: { ...ax.axisLabel, formatter: (v: string) => v.slice(2) }, splitLine: { show: false } },
    yAxis: { type: "value", ...ax, axisLabel: { ...ax.axisLabel, formatter: (v: number) => (usd ? `$${compact(v, 0)}` : compact(v, 0)) } },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      ...tooltipStyle(t),
      formatter: (it: { dataIndex: number }[]) => {
        const k = it[0].dataIndex;
        return `<b>${esc(monthName(months[k]))}</b>${ttRow(t.forecast, "Mean demand", fmtMeasure(mean[k], usd ? "usd" : "units", 2))}${ttRow(t.cat[6], `Buffer to ${label}`, fmtMeasure(q[k] - mean[k], usd ? "usd" : "units", 2))}${ttRow(t.ink2, label, fmtMeasure(q[k], usd ? "usd" : "units", 2))}`;
      },
    },
    series: [
      { name: "Mean demand", type: "bar", stack: "p", barMaxWidth: 24, data: mean, itemStyle: { color: t.forecast } },
      { name: `Buffer to ${label}`, type: "bar", stack: "p", barMaxWidth: 24, data: q.map((x, k) => Math.max(0, x - mean[k])), itemStyle: { color: t.cat[6], borderRadius: [4, 4, 0, 0] } },
    ],
  };
}

export default function Procurement() {
  const { m, theme, measure } = useApp();
  const { runs } = useSelection();
  const [level, setLevel] = useState("0.9");
  const [lead, setLead] = useState(3);
  const usd = measure === "usd";
  const p = Number(level);
  const z = zOf(p);
  const label = LEVELS.find((l) => l.value === level)?.label ?? "P90";
  const monthly = useMemo(() => monthlyMoments(m, runs, usd), [m, runs, usd]);
  const mean = monthly.map((x) => x.M);
  const q = monthly.map((x) => lognormalQuantile(x.M, x.V, z));
  const option = useMemo(() => monthlyOption(m, mean, q, theme, usd, label), [m, mean, q, theme, usd, label]);
  const cover = useMemo(() => {
    const rows: { start: number; mean: number; q: number; naive: number }[] = [];
    for (let k = 0; k + lead <= m.nWin; k++) {
      const from = m.w0 + k;
      const to = from + lead - 1;
      const mo = moments(m, runs, (x) => x >= from && x <= to, usd);
      let naive = 0;
      for (let j = k; j < k + lead; j++) naive += q[j];
      rows.push({ start: from, mean: mo.M, q: lognormalQuantile(mo.M, mo.V, z), naive });
    }
    return rows;
  }, [m, runs, usd, lead, z, q]);
  const bySku = useMemo(() => {
    const groups = new Map<number, number[]>();
    for (const r of runs) {
      const sku = m.sSku[m.rSeries[r]];
      const list = groups.get(sku) ?? [];
      list.push(r);
      groups.set(sku, list);
    }
    return [...groups.entries()].map(([sku, rs]) => {
      const units = moments(m, rs, () => true, false);
      const dollars = moments(m, rs, () => true, true);
      const qU = lognormalQuantile(units.M, units.V, z);
      const qD = lognormalQuantile(dollars.M, dollars.V, z);
      return { sku, mean: units.M, q: qU, buffer: qU - units.M, bufferUsd: qD - dollars.M, series: rs.length };
    });
  }, [m, runs, z]);
  type R = (typeof bySku)[number];
  const cols: Column<R>[] = [
    { key: "sku", label: "SKU", value: (r) => m.dims.skus.id[r.sku] },
    { key: "desc", label: "Description", value: (r) => m.dims.skus.description[r.sku] },
    { key: "series", label: "Series", value: (r) => r.series, num: true },
    { key: "mean", label: "19-month mean (units)", value: (r) => Math.round(r.mean), render: (r) => fmtInt(r.mean), num: true },
    { key: "q", label: `${label} of the total`, value: (r) => Math.round(r.q), render: (r) => fmtInt(r.q), num: true },
    { key: "buffer", label: "Buffer units", value: (r) => Math.round(r.buffer), render: (r) => fmtInt(r.buffer), num: true },
    { key: "usd", label: "Buffer USD", value: (r) => Math.round(r.bufferUsd), render: (r) => fmtUsd(r.bufferUsd, 2), num: true },
  ];
  const total = moments(m, runs, () => true, usd);
  const totalQ = lognormalQuantile(total.M, total.V, z);
  const naiveTotal = q.reduce((a, b) => a + b, 0);
  const totalBufferUsd = bySku.reduce((a, r) => a + r.bufferUsd, 0);
  const sorted = [...bySku].sort((a, b) => b.bufferUsd - a.bufferUsd);
  const top20 = sorted.slice(0, 20).reduce((a, r) => a + r.bufferUsd, 0);
  const ax = axisStyle(theme);
  const coverOpt: EChartsCoreOption = {
    animation: false,
    grid: { left: 8, right: 16, top: 28, bottom: 8, containLabel: true },
    legend: { top: 0, left: 0, itemWidth: 14, itemHeight: 2, textStyle: { color: theme.ink2, fontSize: 11 } },
    xAxis: { type: "category", data: cover.map((r) => m.months[r.start].slice(2)), ...ax, splitLine: { show: false } },
    yAxis: { type: "value", ...ax, axisLabel: { ...ax.axisLabel, formatter: (v: number) => (usd ? `$${compact(v, 0)}` : compact(v, 0)) } },
    tooltip: { trigger: "axis", ...tooltipStyle(theme), valueFormatter: (v: number) => fmtMeasure(v, measure, 2) },
    series: [
      { name: `Buffer: ${label} of the ${lead}-month total (correct)`, type: "line", data: cover.map((r) => r.q - r.mean), showSymbol: false, lineStyle: { width: 2.5, color: theme.cat[6] }, itemStyle: { color: theme.cat[6] } },
      { name: `Buffer: sum of ${lead} monthly ${label}s (overstates)`, type: "line", data: cover.map((r) => r.naive - r.mean), showSymbol: false, lineStyle: { width: 2, color: theme.cat[1], type: [5, 3] }, itemStyle: { color: theme.cat[1] } },
    ],
  };
  const avgOver = cover.length ? cover.reduce((a, r) => a + (r.naive - r.q) / Math.max(1e-9, r.q - r.mean), 0) / cover.length : 0;
  return (
    <>
      <div className="callout">
        <b>Gross requirements.</b> No inventory positions are provided, so this is demand cover to buy for, not a net order. The service level is the newsvendor critical ratio c<sub>u</sub> / (c<sub>u</sub> + c<sub>o</sub>): pick the quantile whose stock-out cost justifies its buffer.
      </div>
      <div className="toolbar">
        <span className="small muted">Service level</span>
        <Segmented ariaLabel="Service level" value={level} onChange={setLevel} options={LEVELS} />
        <span className="small muted" style={{ marginLeft: 12 }}>
          Lead time
        </span>
        <select className="plain" value={lead} onChange={(e) => setLead(Number(e.target.value))} aria-label="Lead time in months">
          {[1, 2, 3, 4, 6].map((n) => (
            <option key={n} value={n}>
              {n} month{n > 1 ? "s" : ""}
            </option>
          ))}
        </select>
        <span className="small muted">orders are booked 2–3 months ahead (problem statement)</span>
      </div>
      <div className="kpis" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
        <Kpi label="Mean demand, 19 months" value={fmtMeasure(total.M, measure, 2)} unit={usd ? "" : "units"} />
        <Kpi label={`${label} of the 19-month total`} value={fmtMeasure(totalQ, measure, 2)} unit={usd ? "" : "units"} foot={`buffer ${fmtMeasure(totalQ - total.M, measure, 2)} (${fmtPct(total.M ? totalQ / total.M - 1 : 0)})`} info={<Info what="The quantile of the whole selection's 19-month demand." how="Contract aggregate-quantile formula: means and shared errors summed before the quantile." source="forecast.json" />} />
        <Kpi label={`Naive: sum of monthly ${label}s`} value={fmtMeasure(naiveTotal, measure, 2)} unit={usd ? "" : "units"} foot={`over-buys ${fmtMeasure(naiveTotal - totalQ, measure, 2)} vs the correct quantile`} />
        <Kpi label="Buffer value" value={fmtUsd(totalBufferUsd, 2)} foot={`per-SKU 19-month buffers at forecast prices · top 20 SKUs = ${fmtPct(totalBufferUsd ? top20 / totalBufferUsd : 0)}`} />
      </div>
      <div className="grid g2">
        <Card title={`Monthly requirement to ${label}`} sub="Mean demand plus the buffer to the chosen service level, per month (aggregate quantile of the selection)." info={<Info what="Per forecast month: mean of the selection and the buffer up to the chosen quantile." source="forecast.json" />}>
          <EChart option={option} height={300} ariaLabel="Monthly requirement" />
        </Card>
        <Card title={`Lead-time cover · ${lead} month${lead > 1 ? "s" : ""}`} sub={`Buffer above the mean for an order covering months t..t+${lead - 1}; summing monthly quantiles overstates it by ${fmtPct(avgOver, 0)} on average.`} info={<Info what="The quantile of demand over the lead time, starting each month, vs the naive sum of monthly quantiles." how="Quantiles do not add: the band of a sum is narrower than the sum of bands because independent noise partly cancels." />}>
          <EChart option={coverOpt} height={300} ariaLabel="Lead-time cover" />
        </Card>
      </div>
      <Card title="Buffer by SKU" sub={`19-month ${label} buffer per SKU, all regions of the selection; sorted by buffer value.`} info={<Info what="Where safety-stock money goes: per SKU, the 19-month mean, the chosen quantile of its total and the buffer in units and USD." source="forecast.json" />}>
        <DataTable rows={bySku} cols={cols} pageSize={12} csvName={`procurement_${label}.csv`} initialSort={{ key: "usd", desc: true }} />
      </Card>
    </>
  );
}
