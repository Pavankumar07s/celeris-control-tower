// O1 Macro lead / lag: which indicator leads which family, at what lag, and whether the structure is stable across
// eras; the lag profile and a lag-shifted overlay as visual proof; indicator paths into the forecast window; the EV
// shift by powertrain; and the per-SKU sensitivities the what-if view uses.
import { useMemo, useState } from "react";
import type { EChartsCoreOption } from "echarts/core";
import { useApp } from "../app/context";
import { EChart } from "../charts/EChart";
import { FONT, axisStyle, esc, tooltipStyle, ttRow, type Theme } from "../charts/theme";
import { Card, DataTable, ErrorState, Info, Loading, type Column } from "../components/ui";
import { fmtSignedPct } from "../data/format";
import { useResource } from "../data/load";
import type { Model } from "../data/model";
import type { MacroFile } from "../data/types";

const SHORT: Record<string, string> = {
  ism_manufacturing_pmi: "PMI",
  auto_production_yoy_pct: "Auto prod. YoY",
  vehicle_inventory_days: "Inventory days",
  raw_material_cost_index: "Raw material",
  new_vehicle_orders_index: "Vehicle orders",
  industrial_util_rate_pct: "Utilisation",
  fuel_price_index: "Fuel price",
  ev_adoption_index: "EV adoption",
};

function best(corr: (number | null)[]): { lag: number; r: number } {
  let lag = 0;
  let r = 0;
  corr.forEach((v, k) => {
    if (v !== null && Math.abs(v) > Math.abs(r)) {
      r = v;
      lag = k;
    }
  });
  return { lag, r };
}

/** The cell's lag: the model's driver lag when the indicator drives the family, else the strongest |r|. */
export function cellLag(mf: MacroFile, f: number, k: number): { lag: number; r: number; driver: boolean } {
  const dl = mf.leadlag.driver_lag[f][k];
  if (dl >= 0) return { lag: dl, r: mf.leadlag.corr[f][k][0][dl] ?? 0, driver: true };
  return { ...best(mf.leadlag.corr[f][k][0]), driver: false };
}

function matrixOption(m: Model, mf: MacroFile, t: Theme, sel: [number, number]): EChartsCoreOption {
  const data: Record<string, unknown>[] = [];
  m.dims.families.code.forEach((_, f) =>
    mf.indicators.forEach((_ind, k) => {
      const c = cellLag(mf, f, k);
      const isSel = sel[0] === f && sel[1] === k;
      data.push({ value: [k, f, c.r, c.lag, c.driver ? 1 : 0], itemStyle: { borderColor: isSel ? t.ink : c.driver ? t.ink : t.surface, borderWidth: isSel ? 3 : 2, borderType: c.driver && !isSel ? "dashed" : "solid" } });
    }),
  );
  const ax = axisStyle(t);
  return {
    animation: false,
    grid: { left: 8, right: 8, top: 8, bottom: 46, containLabel: true },
    xAxis: { type: "category", data: mf.indicators.map((i) => SHORT[i] ?? i), ...ax, axisLabel: { ...ax.axisLabel, interval: 0, rotate: 25 }, splitLine: { show: false } },
    yAxis: { type: "category", data: m.dims.families.name, inverse: true, ...ax, splitLine: { show: false } },
    visualMap: { show: false, min: -0.8, max: 0.8, dimension: 2, inRange: { color: t.div } },
    tooltip: { ...tooltipStyle(t), formatter: (p: { value: number[] }) => `<b>${esc(m.dims.families.name[p.value[1]])} × ${esc(SHORT[mf.indicators[p.value[0]]])}</b><br/>${p.value[4] ? `model driver at lag ${p.value[3]}: r = ${p.value[2].toFixed(2)}` : `not a driver; strongest r = ${p.value[2].toFixed(2)} at lag ${p.value[3]}`}` },
    series: [{ type: "heatmap", data, label: { show: true, formatter: (p: { value: number[] }) => `${p.value[2].toFixed(2)}\n${p.value[4] ? "★ " : ""}L${p.value[3]}`, fontSize: 10, lineHeight: 12, color: t.ink, fontFamily: FONT } }],
  };
}

function lagOption(mf: MacroFile, f: number, k: number, t: Theme): EChartsCoreOption {
  const colors = [t.forecast, t.cat[1], t.cat[2]];
  const ax = axisStyle(t);
  return {
    animation: false,
    grid: { left: 8, right: 70, top: 16, bottom: 28, containLabel: true },
    xAxis: { type: "category", data: Array.from({ length: mf.leadlag.lags }, (_, i) => String(i)), name: "lag (months the indicator leads demand)", nameLocation: "middle", nameGap: 26, nameTextStyle: { color: t.muted, fontSize: 11 }, ...ax, splitLine: { show: false } },
    yAxis: { type: "value", min: -1, max: 1, ...ax },
    tooltip: { trigger: "axis", ...tooltipStyle(t), valueFormatter: (v: number) => (v === null ? "–" : v.toFixed(2)) },
    series: mf.leadlag.eras.map((era, e) => ({
      name: era === "all" ? "2019–2026" : era,
      type: "line",
      data: mf.leadlag.corr[f][k][e],
      showSymbol: e === 0,
      symbolSize: 6,
      lineStyle: { width: e === 0 ? 2.5 : 1.5, color: colors[e % colors.length], type: e === 0 ? "solid" : [5, 3] },
      itemStyle: { color: colors[e % colors.length] },
      endLabel: { show: true, formatter: era === "all" ? "2019–26" : era, color: t.ink2, fontSize: 10 },
      markLine: e === 0 ? { silent: true, symbol: "none", data: [{ yAxis: 0 }], lineStyle: { color: t.axis }, label: { show: false } } : undefined,
    })),
  };
}

/** 12-month log growth of a family's latent demand vs the 12-month change of an indicator shifted by `lag`; both standardised. */
function overlayOption(m: Model, mf: MacroFile, f: number, k: number, lag: number, t: Theme): EChartsCoreOption {
  const fam = new Float64Array(m.asOf + 1);
  for (let g = 0; g < m.nSeg; g++) {
    if (m.sFamily[m.gSeries[g]] !== f) continue;
    for (let j = 0; j < m.gLen[g]; j++) fam[m.gStart[g] + j] += m.latent[m.gOff[g] + j];
  }
  const ind = mf.values[mf.indicators[k]];
  const growth: (number | null)[] = [];
  const shifted: (number | null)[] = [];
  for (let i = 0; i <= m.asOf; i++) {
    growth.push(i >= 12 && fam[i] > 0 && fam[i - 12] > 0 ? Math.log(fam[i] / fam[i - 12]) : null);
    const a = ind[i - lag];
    const b = ind[i - lag - 12];
    shifted.push(i - lag - 12 >= 0 && a !== null && b !== null && a !== undefined && b !== undefined ? a - b : null);
  }
  const z = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x !== null);
    const mu = v.reduce((a, b) => a + b, 0) / v.length;
    const sd = Math.sqrt(v.reduce((a, b) => a + (b - mu) ** 2, 0) / v.length) || 1;
    return xs.map((x) => (x === null ? null : (x - mu) / sd));
  };
  const ax = axisStyle(t);
  const zg = z(growth);
  const zs = z(shifted);
  return {
    animation: false,
    grid: { left: 8, right: 16, top: 26, bottom: 8, containLabel: true },
    legend: { top: 0, left: 0, itemWidth: 14, itemHeight: 2, textStyle: { color: t.ink2, fontSize: 11 } },
    xAxis: { type: "category", data: m.months.slice(0, m.asOf + 1), ...ax, axisLabel: { ...ax.axisLabel, interval: 11, formatter: (v: string) => v.slice(0, 4) }, splitLine: { show: false } },
    yAxis: { type: "value", ...ax },
    tooltip: { trigger: "axis", ...tooltipStyle(t), formatter: (it: { seriesName: string; value: number | null; color: string; axisValue: string }[]) => `<b>${esc(it[0]?.axisValue ?? "")}</b>` + it.map((x) => ttRow(x.color, x.seriesName, x.value === null ? "–" : x.value.toFixed(2))).join("") },
    series: [
      { name: `${m.dims.families.code[f]} demand, 12-month growth`, type: "line", data: zg, showSymbol: false, lineStyle: { width: 2, color: t.history }, itemStyle: { color: t.history } },
      { name: `${SHORT[mf.indicators[k]]} 12-month change, ${lag} month${lag === 1 ? "" : "s"} earlier`, type: "line", data: zs, showSymbol: false, lineStyle: { width: 2, color: t.forecast }, itemStyle: { color: t.forecast } },
    ],
  };
}

function pathOption(m: Model, mf: MacroFile, k: number, t: Theme): EChartsCoreOption {
  const key = mf.indicators[k];
  const rep = mf.repaired.indicator.map((ind, i) => (ind === key ? i : -1)).filter((i) => i >= 0);
  const ax = axisStyle(t);
  return {
    animation: false,
    grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
    xAxis: { type: "category", data: m.months, boundaryGap: false, ...ax, axisLabel: { ...ax.axisLabel, interval: 11, formatter: (v: string) => v.slice(0, 4) }, splitLine: { show: false } },
    yAxis: { type: "value", scale: true, ...ax },
    tooltip: { trigger: "axis", ...tooltipStyle(t), valueFormatter: (v: number) => (v === null ? "–" : v.toFixed(1)) },
    series: [
      {
        name: SHORT[key],
        type: "line",
        data: mf.values[key],
        showSymbol: false,
        lineStyle: { width: 2, color: t.history },
        itemStyle: { color: t.history },
        markArea: { silent: true, itemStyle: { color: t.zone }, label: { show: true, position: "insideTop", formatter: "window", color: t.muted, fontSize: 10 }, data: [[{ xAxis: m.months[m.w0] }, { xAxis: m.months[m.nMonths - 1] }]] },
        markLine: { silent: true, symbol: "none", data: [{ xAxis: m.months[m.asOf] }], lineStyle: { color: t.muted }, label: { show: false } },
        markPoint: rep.length ? { symbol: "diamond", symbolSize: 9, itemStyle: { color: t.error }, label: { show: false }, data: rep.map((i) => ({ coord: [m.months[mf.repaired.month[i]], Number(mf.repaired.after[i])], name: `${mf.repaired.rule[i]}: ${mf.repaired.before[i]} → ${mf.repaired.after[i]}` })), tooltip: { formatter: (p: { name: string }) => `repaired cell<br/>${esc(p.name)}` } } : undefined,
      },
    ],
  };
}

function evOption(m: Model, mf: MacroFile, t: Theme): EChartsCoreOption {
  const kinds = ["EV", "ICE", "Universal"];
  const sums = kinds.map(() => new Float64Array(m.asOf + 1));
  for (let g = 0; g < m.nSeg; g++) {
    const s = m.gSeries[g];
    const k = kinds.indexOf(m.dims.skus.powertrain[m.sSku[s]] ?? "");
    if (k < 0) continue;
    for (let j = 0; j < m.gLen[g]; j++) sums[k][m.gStart[g] + j] += m.latent[m.gOff[g] + j];
  }
  const base = (a: ArrayLike<number>, from: number) => {
    let s = 0;
    for (let i = from; i < from + 12; i++) s += a[i];
    return s / 12 || 1;
  };
  const ref = 48; // 2023 as the common base year (index = 100)
  const ev = mf.values.ev_adoption_index;
  const evBase = (ev.slice(ref, ref + 12) as number[]).reduce((a, b) => a + b, 0) / 12;
  const colors = [t.cat[2], t.cat[1], t.history];
  const ax = axisStyle(t);
  const months = m.months.slice(0, m.asOf + 1);
  const roll = (a: Float64Array) => Array.from(a, (_, i) => (i < 11 ? null : (Array.from(a.slice(i - 11, i + 1)).reduce((x, y) => x + y, 0) / 12 / base(a, ref)) * 100));
  return {
    animation: false,
    grid: { left: 8, right: 16, top: 30, bottom: 8, containLabel: true },
    legend: { top: 0, left: 0, itemWidth: 14, itemHeight: 2, textStyle: { color: t.ink2, fontSize: 11 } },
    xAxis: { type: "category", data: months, ...ax, axisLabel: { ...ax.axisLabel, interval: 11, formatter: (v: string) => v.slice(0, 4) }, splitLine: { show: false } },
    yAxis: { type: "log", min: 1, ...ax },
    tooltip: { trigger: "axis", ...tooltipStyle(t), valueFormatter: (v: number) => (v === null ? "–" : v.toFixed(0)) },
    series: [
      ...kinds.map((k, i) => ({ name: `${k} SKUs demand`, type: "line", data: roll(sums[i]), showSymbol: false, lineStyle: { width: 2, color: colors[i] }, itemStyle: { color: colors[i] } })),
      { name: "EV adoption index", type: "line", data: ev.slice(0, m.asOf + 1).map((v) => (v === null ? null : (v / evBase) * 100)), showSymbol: false, lineStyle: { width: 1.5, color: t.forecast, type: [5, 3] }, itemStyle: { color: t.forecast } },
    ],
  };
}

export default function Macro() {
  const { m, theme, filters } = useApp();
  const mr = useResource<MacroFile>("macro.json");
  const famDefault = filters.family ?? 0;
  const [pick, setPick] = useState<[number, number] | null>(null);
  const mf = mr.data;
  const sel: [number, number] = pick ?? [famDefault, mf ? Math.max(0, mf.leadlag.driver_lag[famDefault].findIndex((l) => l >= 0)) : 0];
  const matrix = useMemo(() => (mf ? matrixOption(m, mf, theme, sel) : null), [mf, m, theme, sel[0], sel[1]]);
  const lagOpt = useMemo(() => (mf ? lagOption(mf, sel[0], sel[1], theme) : null), [mf, sel[0], sel[1], theme]);
  const bl = mf ? cellLag(mf, sel[0], sel[1]) : { lag: 0, r: 0, driver: false };
  const overlay = useMemo(() => (mf ? overlayOption(m, mf, sel[0], sel[1], bl.lag, theme) : null), [mf, m, sel[0], sel[1], bl.lag, theme]);
  const path = useMemo(() => (mf ? pathOption(m, mf, sel[1], theme) : null), [mf, m, sel[1], theme]);
  const ev = useMemo(() => (mf ? evOption(m, mf, theme) : null), [mf, m, theme]);
  const sens = useMemo(() => {
    if (!mf) return [];
    const S = mf.sensitivity;
    const out: { sku: number; group: string; ind: number; lag: number; beta: number }[] = [];
    for (let i = 0; i < S.sku.length; i++) {
      const sku = S.sku[i];
      if (filters.family !== null && m.skuFamily[sku] !== filters.family) continue;
      if (filters.sku !== null && sku !== filters.sku) continue;
      out.push({ sku, group: S.channel_group[i], ind: S.indicator[i], lag: S.lag[i], beta: S.beta[i] });
    }
    return out;
  }, [mf, m, filters]);
  if (mr.loading) return <Loading what="macro indicators" />;
  if (mr.error || !mf) return <ErrorState message={mr.error ?? "missing"} />;
  type S = (typeof sens)[number];
  const cols: Column<S>[] = [
    { key: "sku", label: "SKU", value: (r) => m.dims.skus.id[r.sku] },
    { key: "group", label: "Channel group", value: (r) => r.group },
    { key: "ind", label: "Indicator", value: (r) => SHORT[mf.indicators[r.ind]] ?? mf.indicators[r.ind] },
    { key: "lag", label: "Lag (months)", value: (r) => r.lag, num: true },
    { key: "beta", label: "β (log demand per unit)", value: (r) => r.beta, render: (r) => r.beta.toFixed(4), num: true },
    { key: "eff", label: "Demand per +1 unit", value: (r) => Math.exp(r.beta) - 1, render: (r) => fmtSignedPct(Math.exp(r.beta) - 1, 2), num: true },
  ];
  const provisional = ["macro_leadlag", "macro_sensitivity"].filter((k) => m.meta.sources[k]?.provisional).map((k) => m.meta.sources[k].path);
  return (
    <>
      {provisional.length > 0 && <div className="callout warn">Provisional stand-in in use: {provisional.join(", ")} (replaced automatically when the modelling stage writes the real file).</div>}
      <div className="grid g-2-1">
        <Card
          title="Which indicator leads which family"
          sub="Colour = correlation of the family's demand index with the indicator L months earlier. ★ and a dashed outline = a driver the model selected, shown at its lag; other cells show their strongest lag. Click a cell."
          info={<Info what="Family × indicator matrix of the lead/lag analysis, 2019–2026, from the features stage." how="Weighted correlation of the family macro index (log of demand over the model's expectation without the macro factor) with the standardised indicator lagged 0–12 months; drivers come from forward selection with the economic sign. Positive = demand rises after the indicator rises." source="macro.json ← features/macro_leadlag.csv" />}
        >
          {matrix && <EChart option={matrix} height={340} ariaLabel="Lead/lag matrix" onClick={(e) => { const v = e.value as number[]; setPick([v[1], v[0]]); }} />}
          <div className="legend">
            <span>
              <i className="sw" style={{ background: theme.div[0] }} /> negative
            </span>
            <span>
              <i className="sw" style={{ background: theme.div[3], border: "1px solid var(--hair)" }} /> none
            </span>
            <span>
              <i className="sw" style={{ background: theme.div[6] }} /> positive
            </span>
          </div>
        </Card>
        <Card title={`Lag profile · ${m.dims.families.code[sel[0]]} × ${SHORT[mf.indicators[sel[1]]]}`} sub={`Is the lag stable across eras? ${bl.driver ? "Model driver" : "Strongest"} at lag ${bl.lag} (r = ${bl.r.toFixed(2)}) over 2019–26; dashed = sub-periods.`} info={<Info what="Correlation at every lag 0–12 for the selected family and indicator, for the full period and the two eras." source="macro.json (leadlag)" />}>
          {lagOpt && <EChart option={lagOpt} height={300} ariaLabel="Lag profile" />}
        </Card>
      </div>
      <div className="grid g2">
        <Card title="Model-free check: the indicator, shifted by its lag" sub={`${m.dims.families.name[sel[0]]} demand, 12-month growth, vs ${SHORT[mf.indicators[sel[1]]]} 12-month change ${bl.lag} months earlier; both standardised so one axis serves.`} info={<Info what="An independent look at the raw data: if the indicator leads, the two lines move together after the shift." how="Latent demand of the whole family (ordering cycles removed), 12-month log growth; the indicator's 12-month change; z-scores, so no dual axis." source="history.json, macro.json" />}>
          {overlay && <EChart option={overlay} height={280} ariaLabel="Lag-shifted overlay" />}
        </Card>
        <Card title={`${mf.labels[sel[1]]} · 2019 → 2028`} sub="Cleaned history and the supplied path for the forecast window; diamonds = repaired cells." info={<Info what="The cleaned indicator, including the forecast-window values the forecast uses as known covariates." source="macro.json ← clean/macro_clean.csv, quality/macro_change_log.csv" />}>
          {path && <EChart option={path} height={280} ariaLabel="Indicator path" />}
        </Card>
      </div>
      <div className="grid g2">
        <Card title="The EV shift" sub="12-month average latent demand of EV, ICE and Universal SKUs vs the EV adoption index, all indexed to 2023 = 100 (log scale)." info={<Info what="Demand by powertrain class against EV adoption: EV SKUs grow with the index while ICE SKUs decline." how="Rolling 12-month mean of latent demand per class, divided by its 2023 mean." source="history.json, dims.json (powertrain), macro.json" />}>
          {ev && <EChart option={ev} height={300} ariaLabel="EV shift" />}
        </Card>
        <Card title="Per-SKU sensitivities" sub="The model's response of latent demand to each indicator, used by the what-if view." info={<Info what="β = change in log latent demand per +1 unit of the cleaned indicator at the given lag, by channel group (Aftermarket separately)." source="macro.json ← forecast/macro_sensitivity.csv" />}>
          <DataTable rows={sens} cols={cols} pageSize={10} csvName="macro_sensitivity_selection.csv" />
        </Card>
      </div>
    </>
  );
}
