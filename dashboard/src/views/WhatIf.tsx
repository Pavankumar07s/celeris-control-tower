// O2 What-if: shift a macro indicator (e.g. PMI −3) over a period of the window and recompute the plan with the
// model's own per-SKU sensitivities and lags, then push the change in latent demand through each series' ordering
// cycle (order(t) = Σ weight × latent of the months it carries). Optionally remove the window's customer events.
import { useMemo, useState } from "react";
import { useApp } from "../app/context";
import { useSelection } from "../app/hooks";
import { EChart } from "../charts/EChart";
import { timelineOption } from "../charts/timeline";
import { Card, DataTable, ErrorState, Info, Kpi, Loading, TimelineLegend, type Column } from "../components/ui";
import { sum } from "../data/aggregate";
import { compact, fmtInt, fmtMeasure, fmtSignedPct, fmtUsd, monthName } from "../data/format";
import { useResources } from "../data/load";
import type { Model } from "../data/model";
import { lognormalQuantile, moments, Z90 } from "../data/quantiles";
import type { ForecastDetail, MacroFile } from "../data/types";

interface Scenario {
  indicator: number;
  shift: number;
  start: number; // month index
  months: number; // 0 = to the end of the window
  removeEvents: boolean;
}

const PRESETS: { label: string; ind: string; shift: number; start: string; months: number }[] = [
  { label: "PMI −3 from Jan 2027", ind: "ism_manufacturing_pmi", shift: -3, start: "2027-01", months: 0 },
  { label: "Auto production −5 pts for 6 months", ind: "auto_production_yoy_pct", shift: -5, start: "2027-01", months: 6 },
  { label: "Vehicle orders −10", ind: "new_vehicle_orders_index", shift: -10, start: "2026-11", months: 0 },
  { label: "Utilisation −3 pts", ind: "industrial_util_rate_pct", shift: -3, start: "2027-01", months: 0 },
];

/** Scenario order means for every forecast row (same layout as the model's flat forecast arrays). */
function runScenario(m: Model, runs: number[], d: ForecastDetail, mf: MacroFile, sc: Scenario): { mean: Float64Array; changed: number } {
  const out = Float64Array.from(m.mean);
  const S = mf.sensitivity;
  const bySku = new Map<string, { lag: number; beta: number }[]>();
  for (let i = 0; i < S.sku.length; i++) {
    if (S.indicator[i] !== sc.indicator) continue;
    const key = `${S.sku[i]}|${S.channel_group[i]}`;
    const list = bySku.get(key) ?? [];
    list.push({ lag: S.lag[i], beta: S.beta[i] });
    bySku.set(key, list);
  }
  const end = sc.months > 0 ? sc.start + sc.months - 1 : m.nMonths - 1;
  const shock = (month: number) => (month >= sc.start && month <= end ? sc.shift : 0);
  const aftermarket = m.dims.channels.indexOf("Aftermarket");
  let changed = 0;
  for (const r of runs) {
    const s = m.rSeries[r];
    const sens = bySku.get(`${m.sSku[s]}|${m.sChannel[s] === aftermarket ? "aftermarket" : "other"}`) ?? [];
    const o = m.rOff[r];
    const n = m.rLen[r];
    const dLat = new Float64Array(n);
    let any = false;
    for (let k = 0; k < n; k++) {
      const month = m.rStart[r] + k;
      let logm = 0;
      for (const x of sens) logm += x.beta * shock(month - x.lag);
      let mult = Math.exp(logm);
      const fe = d.factors.f_event[o + k];
      if (sc.removeEvents && fe > 0 && fe !== 1) mult /= fe;
      dLat[k] = d.latent_mean[o + k] * (mult - 1);
      if (dLat[k] !== 0) any = true;
    }
    if (!any) continue;
    for (let k = 0; k < n; k++) {
      if (m.mean[o + k] <= 0) continue; // structural zeros (off-phase, lost account, after EOL) stay zero
      const span = d.accum[o + k] & 3;
      const w = d.accum[o + k] & 4 ? 0.5 : 1;
      let delta = 0;
      for (let j = 0; j < span && k - j >= 0; j++) delta += (j === 0 ? 1 : w) * dLat[k - j];
      if (delta !== 0) {
        out[o + k] = Math.max(0, m.mean[o + k] + delta);
        changed++;
      }
    }
  }
  return { mean: out, changed };
}

export default function WhatIf() {
  const { m, theme, filters, measure } = useApp();
  const { h, fc, runs } = useSelection();
  const res = useResources<[ForecastDetail, MacroFile]>(["forecast_detail.json", "macro.json"]);
  const [sc, setSc] = useState<Scenario>({ indicator: 0, shift: -3, start: m.w0 + 2, months: 0, removeEvents: false });
  const usd = measure === "usd";
  const result = useMemo(() => (res.data ? runScenario(m, runs, res.data[0], res.data[1], sc) : null), [res.data, m, runs, sc]);
  const sums = useMemo(() => {
    if (!result) return null;
    const base = new Float64Array(m.nWin);
    const scen = new Float64Array(m.nWin);
    const byFam = new Map<number, { b: number; s: number; bu: number; su: number }>();
    for (const r of runs) {
      const o = m.rOff[r];
      const fam = m.sFamily[m.rSeries[r]];
      const cur = byFam.get(fam) ?? { b: 0, s: 0, bu: 0, su: 0 };
      for (let k = 0; k < m.rLen[r]; k++) {
        const t = m.rStart[r] + k - m.w0;
        const p = m.price[o + k];
        const w = usd ? p : 1;
        base[t] += w * m.mean[o + k];
        scen[t] += w * result.mean[o + k];
        cur.b += m.mean[o + k];
        cur.s += result.mean[o + k];
        cur.bu += p * m.mean[o + k];
        cur.su += p * result.mean[o + k];
      }
      byFam.set(fam, cur);
    }
    return { base, scen, byFam };
  }, [result, m, runs, usd]);
  const p90 = useMemo(() => {
    if (!result) return null;
    const b = moments(m, runs, () => true, usd);
    const s = moments(m, runs, () => true, usd, result.mean);
    return { base: lognormalQuantile(b.M, b.V, Z90), scen: lognormalQuantile(s.M, s.V, Z90) };
  }, [result, m, runs, usd]);
  const option = useMemo(() => {
    const line = new Array(m.nMonths).fill(null) as (number | null)[];
    if (sums) {
      line[m.asOf] = h.demand[m.asOf];
      for (let k = 0; k < m.nWin; k++) line[m.w0 + k] = sums.scen[k];
    }
    return timelineOption({
      m, theme, measure, lens: "orders", filters,
      hist: { shipped: h.shipped, demand: h.demand, imputed: h.imputed, cells: h.cells },
      fc: { value: fc.fc, p10: fc.p10, p50: fc.p50, p90: fc.p90 },
      lines: sums ? [{ name: "Scenario (order mean)", data: line, color: theme.scenario, dashed: true }] : [],
      zoom: [m.asOf - 23, m.nMonths - 1],
    });
  }, [m, theme, measure, filters, h, fc, sums]);

  if (res.loading && !res.data) return <Loading what="forecast components and sensitivities" />;
  if (res.error || !res.data) return <ErrorState message={res.error ?? "missing"} />;
  const mf = res.data[1];
  const hist = mf.values[mf.indicators[sc.indicator]].slice(0, m.asOf + 1).filter((v): v is number => v !== null);
  const mu = hist.reduce((a, b) => a + b, 0) / hist.length;
  const sd = Math.sqrt(hist.reduce((a, b) => a + (b - mu) ** 2, 0) / hist.length);
  const range = Math.max(1, Math.ceil(sd * 3));
  const baseT = sums ? sum(sums.base) : 0;
  const scenT = sums ? sum(sums.scen) : 0;
  const famRows = sums ? [...sums.byFam.entries()].map(([f, v]) => ({ f, ...v })) : [];
  type F = (typeof famRows)[number];
  const cols: Column<F>[] = [
    { key: "f", label: "Family", value: (r) => m.dims.families.name[r.f] },
    { key: "b", label: "Base (units)", value: (r) => Math.round(r.b), render: (r) => fmtInt(r.b), num: true },
    { key: "s", label: "Scenario (units)", value: (r) => Math.round(r.s), render: (r) => fmtInt(r.s), num: true },
    { key: "d", label: "Δ units", value: (r) => Math.round(r.s - r.b), render: (r) => `${r.s - r.b >= 0 ? "+" : ""}${fmtInt(r.s - r.b)}`, num: true },
    { key: "p", label: "Δ %", value: (r) => (r.b ? r.s / r.b - 1 : 0), render: (r) => (r.b ? fmtSignedPct(r.s / r.b - 1, 2) : "–"), num: true },
    { key: "u", label: "Δ USD", value: (r) => Math.round(r.su - r.bu), render: (r) => `${r.su - r.bu >= 0 ? "+" : "−"}${fmtUsd(Math.abs(r.su - r.bu))}`, num: true },
  ];
  const windowMonths = Array.from({ length: m.nWin }, (_, k) => m.w0 + k);
  const applyPreset = (p: (typeof PRESETS)[number]) => {
    const [y, mo] = p.start.split("-").map(Number);
    setSc({ ...sc, indicator: mf.indicators.indexOf(p.ind), shift: p.shift, start: (y - 2019) * 12 + mo - 1, months: p.months });
  };
  const provisional = m.meta.sources.macro_sensitivity?.provisional;
  const nSens = mf.sensitivity.indicator.filter((k) => k === sc.indicator).length;
  return (
    <>
      {provisional && <div className="callout warn">Sensitivities are provisional stand-ins (one dossier driver per family) until forecast/macro_sensitivity.csv is written by the modelling stage; the engine is final.</div>}
      <Card
        title="Scenario"
        sub="Shift an indicator by a fixed amount for a period of the forecast window; the effect reaches demand after each SKU's own lag."
        info={<Info what="A model-consistent what-if: latent demand × exp(Σ β × Δindicator(t − lag)) per SKU and channel group, then re-accumulated through each series' ordering cycle; off-phase, lost-account and post-EOL months stay zero." how="β and lag from the model's sensitivity table; ordering-cycle spans and carry weights from the forecast file." source="forecast_detail.json (latent_mean, accum, f_event), macro.json (sensitivity)" />}
      >
        <div className="grid g3" style={{ alignItems: "end" }}>
          <label className="small">
            Indicator
            <select className="plain" style={{ width: "100%" }} value={sc.indicator} onChange={(e) => setSc({ ...sc, indicator: Number(e.target.value) })}>
              {mf.labels.map((l, i) => (
                <option key={l} value={i}>
                  {l.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </label>
          <label className="small">
            Shift: <b>{sc.shift > 0 ? "+" : ""}{sc.shift}</b> (history sd {sd.toFixed(1)})
            <input type="range" min={-range} max={range} step={range > 10 ? 1 : 0.5} value={sc.shift} onChange={(e) => setSc({ ...sc, shift: Number(e.target.value) })} />
          </label>
          <div className="toolbar">
            <label className="small">
              From
              <select className="plain" value={sc.start} onChange={(e) => setSc({ ...sc, start: Number(e.target.value) })}>
                {windowMonths.map((mm) => (
                  <option key={mm} value={mm}>
                    {monthName(m.months[mm])}
                  </option>
                ))}
              </select>
            </label>
            <label className="small">
              For
              <select className="plain" value={sc.months} onChange={(e) => setSc({ ...sc, months: Number(e.target.value) })}>
                <option value={0}>the rest of the window</option>
                {[1, 2, 3, 6, 9, 12].map((n) => (
                  <option key={n} value={n}>
                    {n} month{n > 1 ? "s" : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <div className="toolbar" style={{ marginTop: 12 }}>
          <span className="small muted">Presets:</span>
          {PRESETS.map((p) => (
            <button key={p.label} type="button" className="btn" onClick={() => applyPreset(p)}>
              {p.label}
            </button>
          ))}
          <label className="small toolbar" style={{ gap: 6, marginLeft: "auto" }}>
            <input type="checkbox" checked={sc.removeEvents} onChange={(e) => setSc({ ...sc, removeEvents: e.target.checked })} /> also remove window events (e.g. the Orion Driveline shutdown)
          </label>
          <button type="button" className="btn" onClick={() => setSc({ ...sc, shift: 0, removeEvents: false })}>
            Reset to base
          </button>
        </div>
      </Card>
      {nSens === 0 && <div className="callout warn">The model has no sensitivity to {mf.labels[sc.indicator].replace(/_/g, " ")} in macro_sensitivity.csv (it is not a selected driver of any SKU), so this scenario changes nothing.</div>}
      <div className="kpis" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
        <Kpi label="Base, 19 months (mean)" value={fmtMeasure(baseT, measure, 2)} unit={usd ? "" : "units"} />
        <Kpi label="Scenario, 19 months" value={fmtMeasure(scenT, measure, 2)} unit={usd ? "" : "units"} foot={<span className={scenT >= baseT ? "delta-up" : "delta-down"}>{fmtSignedPct(baseT ? scenT / baseT - 1 : 0, 2)} vs base</span>} />
        <Kpi label="P90 of the 19-month total" value={p90 ? fmtMeasure(p90.scen, measure, 2) : "–"} foot={p90 ? `base ${fmtMeasure(p90.base, measure, 2)} · Δ ${compact(p90.scen - p90.base, 2)}` : ""} info={<Info what="Procurement cover at P90 under the scenario (noise and level-error variances held at base)." how="Contract aggregate-quantile formula with the scenario's means." />} />
        <Kpi label="Forecast rows changed" value={fmtInt(result?.changed ?? 0)} foot={`of ${fmtInt(runs.reduce((a, r) => a + m.rLen[r], 0))} rows in the selection; structural zeros untouched`} />
      </div>
      <Card title={`Base vs scenario · ${usd ? "USD" : "units"} per month`} sub="Blue = submitted base forecast with its P10–P90 range; violet dashed = scenario order mean." info={<Info what="The scenario on the shared timeline." source="computed in the browser from the bundle" />}>
        <EChart option={option} height={340} ariaLabel="Scenario timeline" />
        <TimelineLegend
          latent={false}
          extra={
            <span>
              <i className="lk dash" style={{ borderColor: "var(--scenario)" }} />
              Scenario
            </span>
          }
        />
      </Card>
      <Card title="Impact by family" sub="19-month totals of the order means, base vs scenario." info={<Info what="Where the scenario lands: units and revenue at the forecast's prices." />}>
        <DataTable rows={famRows} cols={cols} pageSize={7} csvName="whatif_by_family.csv" initialSort={{ key: "d", desc: false }} />
      </Card>
    </>
  );
}
