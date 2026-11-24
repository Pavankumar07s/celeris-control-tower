// R5 Forecast & accuracy (prediction): the forecast continuing the history with its P10–P90 range, a monthly /
// quarterly / annual table, the forecast X-ray, the backtest time machine and filter-aware accuracy (FVA stairstep,
// WAPE by horizon, bias heatmap, interval calibration, accuracy by aggregation level).
import { useMemo, useState } from "react";
import type { EChartsCoreOption } from "echarts/core";
import { useApp } from "../app/context";
import { useSelection } from "../app/hooks";
import { EChart } from "../charts/EChart";
import { FONT, axisStyle, esc, tooltipStyle, ttRow } from "../charts/theme";
import { timelineOption } from "../charts/timeline";
import { Card, DataTable, Empty, ErrorState, Info, Loading, Segmented, TimelineLegend, type Column } from "../components/ui";
import { sum } from "../data/aggregate";
import { compact, fmtInt, fmtMeasure, fmtPct, fmtPts, fmtSignedPct, monthName } from "../data/format";
import { useResource } from "../data/load";
import { historyPrice, seriesMatches, type Filters, type Model } from "../data/model";
import { lognormalQuantile, moments, Z10, Z90 } from "../data/quantiles";
import type { BacktestFile, BacktestOrigin, ForecastDetail } from "../data/types";

const modelName = (s: string) => s.replace(/_/g, " ");

function inSel(m: Model, f: Filters, s: number): boolean {
  return seriesMatches(m, s, f) && (f.customer === null || m.sCustomer[s] === f.customer);
}

interface Acc {
  actual: number;
  abs: Record<string, number>;
  err: Record<string, number>;
  n: number;
}

function accuracy(bt: BacktestFile, keep: (s: number, i: number) => boolean): Acc {
  const sb = bt.series_buckets;
  const out: Acc = { actual: 0, abs: {}, err: {}, n: 0 };
  for (const md of bt.models) {
    out.abs[md] = 0;
    out.err[md] = 0;
  }
  for (let i = 0; i < sb.series.length; i++) {
    if (!keep(sb.series[i], i)) continue;
    out.actual += sb.actual[i];
    out.n += sb.n[i];
    for (const md of bt.models) {
      out.abs[md] += sb.abs[md][i] ?? 0;
      out.err[md] += sb.err[md][i] ?? 0;
    }
  }
  return out;
}

function Stairstep({ bt, acc }: { bt: BacktestFile; acc: Acc }) {
  const { theme: t } = useApp();
  const rows = bt.models.map((md, k) => {
    const w = acc.abs[md] / acc.actual;
    const prev = k > 0 ? acc.abs[bt.models[k - 1]] / acc.actual : null;
    const first = acc.abs[bt.models[0]] / acc.actual;
    return { md, w, bias: acc.err[md] / acc.actual, fvaPrev: prev === null ? null : prev - w, fvaNaive: k === 0 ? null : first - w };
  });
  const maxW = Math.max(...rows.map((r) => r.w), bt.noise_floor ?? 0);
  return (
    <div className="stair">
      <table className="dt">
        <thead>
          <tr>
            <th>Step</th>
            <th style={{ width: "36%" }}>WAPE</th>
            <th className="num">WAPE</th>
            <th className="num">Bias</th>
            <th className="num">FVA vs previous</th>
            <th className="num">FVA vs {modelName(bt.models[0])}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.md}>
              <td>
                <b style={{ fontWeight: r.md === bt.final ? 700 : 500 }}>{modelName(r.md)}</b>
                {r.md === bt.final && <span className="badge info" style={{ marginLeft: 6 }}>final</span>}
              </td>
              <td>
                <div style={{ position: "relative", height: 12, background: "var(--surface-2)", borderRadius: 3 }}>
                  <div style={{ width: `${(r.w / maxW) * 100}%`, height: 12, borderRadius: "0 3px 3px 0", background: r.md === bt.final ? t.forecast : t.axis }} />
                  {bt.noise_floor !== null && <div title="noise floor" style={{ position: "absolute", left: `${(bt.noise_floor / maxW) * 100}%`, top: -3, height: 18, borderLeft: `2px solid ${t.ink2}` }} />}
                </div>
              </td>
              <td className="num">{fmtPct(r.w)}</td>
              <td className="num">{fmtSignedPct(r.bias)}</td>
              <td className="num">{r.fvaPrev === null ? "–" : fmtPts(r.fvaPrev)}</td>
              <td className="num">{r.fvaNaive === null ? "–" : fmtPts(r.fvaNaive)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="muted small">
        Forecast value added (FVA) = WAPE reduction in points; a step with negative FVA adds no value.{" "}
        {bt.noise_floor !== null && <>The dark tick marks the estimated noise floor ({fmtPct(bt.noise_floor)}): no model can beat it on average.</>} {fmtInt(acc.n)} scored cells.
      </div>
    </div>
  );
}

function horizonOption(m: Model, bt: BacktestFile, f: Filters, t: ReturnType<typeof useApp>["theme"]): { option: EChartsCoreOption; fine: boolean } {
  const fine = f.sku === null && f.customer === null;
  const models = bt.models;
  let xs: string[];
  const wape: Record<string, number[]> = {};
  if (fine) {
    const a = new Float64Array(19);
    const abs: Record<string, Float64Array> = {};
    for (const md of models) abs[md] = new Float64Array(19);
    const F = bt.fine;
    for (let i = 0; i < F.horizon.length; i++) {
      if ((f.family !== null && F.family[i] !== f.family) || (f.region !== null && F.region[i] !== f.region) || (f.channel !== null && F.channel[i] !== f.channel)) continue;
      const h = F.horizon[i] - 1;
      a[h] += F.actual[i];
      for (const md of models) abs[md][h] += F.abs[md][i] ?? 0;
    }
    xs = Array.from({ length: 19 }, (_, i) => String(i + 1));
    for (const md of models) wape[md] = Array.from(abs[md], (x, i) => (a[i] ? x / a[i] : NaN));
  } else {
    xs = bt.buckets.map(([lo, hi]) => `${lo}–${hi}`);
    const a = new Float64Array(bt.buckets.length);
    const abs: Record<string, Float64Array> = {};
    for (const md of models) abs[md] = new Float64Array(bt.buckets.length);
    const sb = bt.series_buckets;
    for (let i = 0; i < sb.series.length; i++) {
      if (!inSel(m, f, sb.series[i])) continue;
      a[sb.bucket[i]] += sb.actual[i];
      for (const md of models) abs[md][sb.bucket[i]] += sb.abs[md][i] ?? 0;
    }
    for (const md of models) wape[md] = Array.from(abs[md], (x, i) => (a[i] ? x / a[i] : NaN));
  }
  const colors = [t.axis, t.cat[3], t.cat[2], t.cat[4], t.cat[6], t.cat[1]];
  const ax = axisStyle(t);
  const series: Record<string, unknown>[] = models.map((md, k) => ({
    name: modelName(md),
    type: "line",
    data: wape[md].map((v) => (Number.isFinite(v) ? v : null)),
    showSymbol: !fine,
    symbolSize: 7,
    lineStyle: { width: md === bt.final ? 2.5 : 1.5, color: md === bt.final ? t.forecast : colors[k % colors.length] },
    itemStyle: { color: md === bt.final ? t.forecast : colors[k % colors.length] },
    endLabel: { show: models.length <= 5, formatter: modelName(md), color: t.ink2, fontSize: 11, fontFamily: FONT },
    z: md === bt.final ? 5 : 2,
  }));
  if (bt.noise_floor !== null) {
    series.push({ name: "noise floor", type: "line", data: xs.map(() => bt.noise_floor), showSymbol: false, lineStyle: { color: t.ink2, type: [4, 4], width: 1 }, itemStyle: { color: t.ink2 }, endLabel: { show: true, formatter: "noise floor", color: t.muted, fontSize: 11 } });
  }
  return {
    fine,
    option: {
      animation: false,
      grid: { left: 8, right: 110, top: 16, bottom: 28, containLabel: true },
      xAxis: { type: "category", data: xs, name: fine ? "horizon (months ahead)" : "horizon bucket (months)", nameLocation: "middle", nameGap: 26, nameTextStyle: { color: t.muted, fontSize: 11 }, ...ax, splitLine: { show: false } },
      yAxis: { type: "value", min: 0, ...ax, axisLabel: { ...ax.axisLabel, formatter: (v: number) => `${Math.round(v * 100)}%` } },
      tooltip: {
        trigger: "axis",
        ...tooltipStyle(t),
        formatter: (items: { seriesName: string; value: number | null; color: string; axisValue: string }[]) =>
          `<div style="font-weight:600;margin-bottom:4px">Horizon ${esc(items[0]?.axisValue ?? "")}</div>` + items.map((it) => ttRow(it.color, it.seriesName, it.value === null ? "–" : fmtPct(it.value))).join(""),
      },
      series,
    },
  };
}

function biasOption(m: Model, bt: BacktestFile, f: Filters, t: ReturnType<typeof useApp>["theme"]): EChartsCoreOption {
  const fams = m.dims.families.code;
  const regs = m.dims.regions;
  const err = new Float64Array(fams.length * regs.length);
  const act = new Float64Array(fams.length * regs.length);
  const sb = bt.series_buckets;
  const g: Filters = { ...f, family: null, region: null };
  for (let i = 0; i < sb.series.length; i++) {
    const s = sb.series[i];
    if (!inSel(m, g, s)) continue;
    const k = m.sFamily[s] * regs.length + m.sRegion[s];
    err[k] += sb.err[bt.final][i] ?? 0;
    act[k] += sb.actual[i];
  }
  const data: (number | null)[][] = [];
  for (let a = 0; a < fams.length; a++) for (let r = 0; r < regs.length; r++) {
    const k = a * regs.length + r;
    data.push([r, a, act[k] ? err[k] / act[k] : null]);
  }
  const ax = axisStyle(t);
  return {
    animation: false,
    grid: { left: 8, right: 16, top: 8, bottom: 52, containLabel: true },
    xAxis: { type: "category", data: regs.map((r) => r.replace("Middle East & Africa", "MEA").replace("Latin America", "LatAm").replace("North America", "N. America").replace("Asia Pacific", "APAC")), ...ax, splitLine: { show: false } },
    yAxis: { type: "category", data: fams, ...ax, splitLine: { show: false } },
    visualMap: { min: -0.15, max: 0.15, calculable: false, orient: "horizontal", left: "center", bottom: 0, itemWidth: 10, itemHeight: 140, text: ["over-forecast +15%", "under −15%"], textStyle: { color: t.muted, fontSize: 10 }, inRange: { color: t.div } },
    tooltip: {
      ...tooltipStyle(t),
      formatter: (p: { value: (number | null)[] }) => `<b>${esc(m.dims.families.name[p.value[1] as number])} · ${esc(regs[p.value[0] as number])}</b><br/>bias ${p.value[2] === null ? "–" : fmtSignedPct(p.value[2] as number)} (${esc(modelName(bt.final))})`,
    },
    series: [
      {
        type: "heatmap",
        data,
        label: { show: true, formatter: (p: { value: (number | null)[] }) => (p.value[2] === null ? "" : `${((p.value[2] as number) * 100).toFixed(0)}%`), fontSize: 10, color: t.ink, fontFamily: FONT },
        itemStyle: { borderColor: t.surface, borderWidth: 2, borderRadius: 3 },
      },
    ],
  };
}

function calibrationOption(m: Model, bt: BacktestFile, f: Filters, t: ReturnType<typeof useApp>["theme"]): EChartsCoreOption | null {
  const nb = bt.buckets.length;
  const nq = new Float64Array(nb);
  const below = new Float64Array(nb);
  const above = new Float64Array(nb);
  const sb = bt.series_buckets;
  for (let i = 0; i < sb.series.length; i++) {
    if (!inSel(m, f, sb.series[i])) continue;
    nq[sb.bucket[i]] += sb.n_q[i];
    below[sb.bucket[i]] += sb.below_p10[i];
    above[sb.bucket[i]] += sb.above_p90[i];
  }
  if (sum(nq) === 0) return null;
  const xs = bt.buckets.map(([lo, hi]) => `h ${lo}–${hi}`);
  const share = (a: Float64Array) => Array.from(a, (x, i) => (nq[i] ? x / nq[i] : 0));
  const b = share(below);
  const a = share(above);
  const inside = b.map((x, i) => 1 - x - a[i]);
  const ax = axisStyle(t);
  return {
    animation: false,
    grid: { left: 8, right: 16, top: 24, bottom: 8, containLabel: true },
    legend: { top: 0, left: 0, itemWidth: 10, itemHeight: 10, textStyle: { color: t.ink2, fontSize: 11 }, data: ["below P10", "inside P10–P90", "above P90"] },
    xAxis: { type: "value", max: 1, ...ax, axisLabel: { ...ax.axisLabel, formatter: (v: number) => `${Math.round(v * 100)}%` } },
    yAxis: { type: "category", data: xs, inverse: true, ...ax, splitLine: { show: false } },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, ...tooltipStyle(t), valueFormatter: (v: number) => fmtPct(v) },
    series: [
      { name: "below P10", type: "bar", stack: "c", data: b, barWidth: 18, itemStyle: { color: t.cat[1] } },
      { name: "inside P10–P90", type: "bar", stack: "c", data: inside, itemStyle: { color: t.forecastBand.replace(/0\.\d+\)$/, "0.55)") }, markLine: { silent: true, symbol: "none", data: [{ xAxis: 0.1 }, { xAxis: 0.9 }], lineStyle: { color: t.ink2, type: [3, 3] }, label: { formatter: (p: { value: number }) => (p.value < 0.5 ? "10%" : "90%"), color: t.muted, fontSize: 10 } } },
      { name: "above P90", type: "bar", stack: "c", data: a, itemStyle: { color: t.cat[6] } },
    ],
  };
}

function levelTable(bt: BacktestFile) {
  const M = bt.metrics as Record<string, (string | number | null)[]>;
  const n = (M.model ?? []).length;
  const acc = new Map<string, { a: number; e: number }>();
  for (let i = 0; i < n; i++) {
    if (M.slice_type[i] !== "all" || M.origin[i] === "mean") continue;
    const key = `${M.level[i]}|${M.model[i]}`;
    const cur = acc.get(key) ?? { a: 0, e: 0 };
    cur.a += Number(M.actual_sum[i]);
    cur.e += Number(M.abs_err_sum[i]);
    acc.set(key, cur);
  }
  const levels = [...new Set([...acc.keys()].map((k) => k.split("|")[0]))];
  return { levels, get: (level: string, md: string) => {
    const v = acc.get(`${level}|${md}`);
    return v && v.a ? v.e / v.a : NaN;
  } };
}

function XRay({ m, runs, detail, measureUsd }: { m: Model; runs: number[]; detail: ForecastDetail; measureUsd: boolean }) {
  const { theme: t } = useApp();
  const firstMonth = useMemo(() => {
    for (let k = 0; k < m.nWin; k++) for (const r of runs) {
      const kk = m.w0 + k - m.rStart[r];
      if (kk >= 0 && kk < m.rLen[r] && m.fc[m.rOff[r] + kk] > 0) return m.w0 + k;
    }
    return m.w0;
  }, [m, runs]);
  const [month, setMonth] = useState<number | null>(null);
  const t0 = month ?? firstMonth;
  const steps = useMemo(() => {
    const names = ["level", "f_season", "f_holiday", "f_macro", "f_ev", "f_lifecycle", "f_event"] as const;
    const cum = new Float64Array(names.length);
    let latent = 0;
    let mean = 0;
    let fcs = 0;
    const members: Record<string, number> = {};
    for (const md of Object.keys(detail.members)) members[md] = 0;
    for (const r of runs) {
      const k = t0 - m.rStart[r];
      if (k < 0 || k >= m.rLen[r]) continue;
      const i = m.rOff[r] + k;
      const w = measureUsd ? m.price[i] : 1;
      let x = w;
      names.forEach((nm, j) => {
        x *= detail.factors[nm][i];
        cum[j] += x;
      });
      latent += w * detail.latent_mean[i];
      mean += w * m.mean[i];
      fcs += w * m.fc[i];
      for (const md of Object.keys(members)) members[md] += w * (detail.members[md][i] ?? 0);
    }
    const labels = ["Base level", "× season", "× holiday", "× macro", "× EV shift", "× lifecycle", "× event"];
    const out: { label: string; value: number; delta: number; mult: number | null }[] = [];
    labels.forEach((lb, j) => out.push({ label: lb, value: cum[j], delta: j === 0 ? cum[0] : cum[j] - cum[j - 1], mult: j === 0 ? null : cum[j - 1] ? cum[j] / cum[j - 1] : null }));
    out.push({ label: "cycle placement", value: mean, delta: mean - cum[cum.length - 1], mult: cum[cum.length - 1] ? mean / cum[cum.length - 1] : null });
    out.push({ label: "rounding", value: fcs, delta: fcs - mean, mult: null });
    return { out, latent, members, fcs };
  }, [m, runs, detail, t0, measureUsd]);
  const ax = axisStyle(t);
  const cats = [...steps.out.map((s) => s.label), "Forecast"];
  const base: (number | string)[] = [];
  const up: (number | string)[] = [];
  const down: (number | string)[] = [];
  let run = 0;
  steps.out.forEach((s, j) => {
    if (j === 0) {
      base.push(0);
      up.push(s.value);
      down.push("-");
      run = s.value;
      return;
    }
    const next = run + s.delta;
    base.push(Math.min(run, next));
    up.push(s.delta >= 0 ? s.delta : "-");
    down.push(s.delta < 0 ? -s.delta : "-");
    run = next;
  });
  base.push(0);
  up.push(steps.fcs);
  down.push("-");
  const option: EChartsCoreOption = {
    animation: false,
    grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
    xAxis: { type: "category", data: cats, ...ax, axisLabel: { ...ax.axisLabel, interval: 0, rotate: 30 }, splitLine: { show: false } },
    yAxis: { type: "value", ...ax, axisLabel: { ...ax.axisLabel, formatter: (v: number) => compact(v, 0) } },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      ...tooltipStyle(t),
      formatter: (items: { dataIndex: number }[]) => {
        const j = items[0].dataIndex;
        if (j >= steps.out.length) return `<b>Submitted forecast</b><br/>${fmtMeasure(steps.fcs, measureUsd ? "usd" : "units", 2)}`;
        const s = steps.out[j];
        return `<b>${esc(s.label)}</b><br/>${s.mult !== null ? `multiplier ×${s.mult.toFixed(3)}<br/>` : ""}change ${s.delta >= 0 ? "+" : ""}${compact(s.delta, 2)} → ${compact(s.value, 2)}`;
      },
    },
    series: [
      { type: "bar", stack: "w", data: base, itemStyle: { color: "transparent" }, silent: true },
      { type: "bar", stack: "w", data: up, barMaxWidth: 24, itemStyle: { color: t.forecast, borderRadius: [4, 4, 0, 0] } },
      { type: "bar", stack: "w", data: down, barMaxWidth: 24, itemStyle: { color: t.cat[1], borderRadius: [4, 4, 0, 0] } },
    ],
  };
  const windowMonths = Array.from({ length: m.nWin }, (_, k) => m.w0 + k);
  return (
    <div>
      <div className="toolbar" style={{ marginBottom: 8 }}>
        <label className="small muted" htmlFor="xray-month">
          Month
        </label>
        <select id="xray-month" className="plain" value={t0} onChange={(e) => setMonth(Number(e.target.value))}>
          {windowMonths.map((mm) => (
            <option key={mm} value={mm}>
              {monthName(m.months[mm])}
            </option>
          ))}
        </select>
        <span className="small muted">
          latent {compact(steps.latent, 2)} → order mean {compact(steps.out[7].value, 2)} → submitted {compact(steps.fcs, 2)}
        </span>
      </div>
      <EChart option={option} height={280} ariaLabel="Forecast X-ray waterfall" />
      {Object.keys(steps.members).length > 0 && (
        <div className="small muted" style={{ marginTop: 6 }}>
          Ensemble members for this month:{" "}
          {Object.entries(steps.members)
            .map(([k, v]) => `${modelName(k)} ${compact(v, 2)}`)
            .join(" · ")}
        </div>
      )}
    </div>
  );
}

type Rollup = "month" | "quarter" | "year";

export default function Forecast() {
  const { m, theme, filters, measure, lens, params, setParam } = useApp();
  const { h, fc, runs } = useSelection();
  const bt = useResource<BacktestFile>("backtest.json");
  const detail = useResource<ForecastDetail>("forecast_detail.json");
  const origin = params.get("origin");
  const tm = useResource<BacktestOrigin>(origin ? `backtest_origin_${origin}.json` : null);
  const [rollup, setRollup] = useState<Rollup>("month");
  const usd = measure === "usd";
  const latent = lens === "latent";

  const tmLines = useMemo(() => {
    if (!tm.data) return null;
    const o = tm.data;
    const H = o.horizons;
    const act = new Array(m.nMonths).fill(null) as (number | null)[];
    const pred = new Array(m.nMonths).fill(null) as (number | null)[];
    const base = new Array(m.nMonths).fill(null) as (number | null)[];
    const A = new Float64Array(H);
    const P = new Float64Array(H);
    const B = new Float64Array(H);
    o.series.forEach((s, k) => {
      if (!inSel(m, filters, s)) return;
      for (let j = 0; j < H; j++) {
        const a = o.actual[k * H + j];
        if (a === null) continue;
        const w = usd ? historyPrice(m, m.sSku[s], o.origin_month + 1 + j) || 0 : 1;
        A[j] += w * a;
        P[j] += w * (o.pred[k * H + j] ?? 0);
        B[j] += w * (o.baseline_pred[k * H + j] ?? 0);
      }
    });
    for (let j = 0; j < H; j++) {
      const mm = o.origin_month + 1 + j;
      act[mm] = A[j];
      pred[mm] = P[j];
      base[mm] = B[j];
    }
    const wape = (x: Float64Array) => sum(Array.from(x, (v, j) => Math.abs(v - A[j]))) / sum(A);
    return { act, pred, base, o, wFinal: wape(P), wBase: wape(B) };
  }, [tm.data, m, filters, usd]);

  const option = useMemo(() => {
    if (tmLines) {
      return timelineOption({
        m, theme, measure, lens: "orders", filters,
        hist: { shipped: h.shipped, demand: h.demand, imputed: h.imputed, cells: h.cells },
        lines: [
          { name: `Actual, scored cells`, data: tmLines.act, color: theme.ink, width: 2.5 },
          { name: `Forecast made at ${tmLines.o.origin} (${modelName(tmLines.o.final)})`, data: tmLines.pred, color: theme.scenario },
          { name: `Baseline at ${tmLines.o.origin} (${modelName(tmLines.o.baseline)})`, data: tmLines.base, color: theme.baseline, dashed: true },
        ],
        zoom: [Math.max(0, tmLines.o.origin_month - 24), Math.min(m.nMonths - 1, tmLines.o.origin_month + 24)],
      });
    }
    return timelineOption({
      m, theme, measure, lens, filters,
      hist: { shipped: latent ? h.latent : h.shipped, demand: latent ? h.latent : h.demand, imputed: h.imputed, cells: h.cells },
      fc: latent ? undefined : { value: fc.fc, p10: fc.p10, p50: fc.p50, p90: fc.p90 },
      zoom: [m.asOf - 35, m.nMonths - 1],
    });
  }, [tmLines, m, theme, measure, lens, filters, h, fc, latent]);

  const tableRows = useMemo(() => {
    const buckets: { label: string; months: number[] }[] = [];
    for (let k = 0; k < m.nWin; k++) {
      const mm = m.w0 + k;
      const lab = m.months[mm];
      const y = lab.slice(0, 4);
      const q = `${y} Q${Math.floor((Number(lab.slice(5)) - 1) / 3) + 1}`;
      const key = rollup === "month" ? lab : rollup === "quarter" ? q : y;
      const last = buckets[buckets.length - 1];
      if (last && last.label === key) last.months.push(mm);
      else buckets.push({ label: key, months: [mm] });
    }
    return buckets.map((b) => {
      const set = new Set(b.months);
      const mo = moments(m, runs, (x) => set.has(x), usd);
      const sub = b.months.reduce((a, mm) => a + fc.fc[mm - m.w0], 0);
      const ly = b.months.reduce((a, mm) => a + (mm - 12 <= m.asOf ? h.demand[mm - 12] : fc.fc[mm - 12 - m.w0]), 0);
      return { label: `${b.label}${b.months.length < (rollup === "quarter" ? 3 : rollup === "year" ? 12 : 1) ? " (part)" : ""}`, n: b.months.length, sub, mean: mo.M, p10: lognormalQuantile(mo.M, mo.V, Z10), p50: lognormalQuantile(mo.M, mo.V, 0), p90: lognormalQuantile(mo.M, mo.V, Z90), ly };
    });
  }, [m, runs, rollup, usd, fc, h]);
  type TRow = (typeof tableRows)[number];
  const cols: Column<TRow>[] = [
    { key: "label", label: rollup === "month" ? "Month" : rollup === "quarter" ? "Quarter" : "Year", value: (r) => r.label },
    { key: "sub", label: "Forecast (submitted)", value: (r) => Math.round(r.sub), render: (r) => fmtMeasure(r.sub, measure, 2), num: true },
    { key: "p10", label: "P10", value: (r) => Math.round(r.p10), render: (r) => fmtMeasure(r.p10, measure, 2), num: true },
    { key: "p50", label: "P50", value: (r) => Math.round(r.p50), render: (r) => fmtMeasure(r.p50, measure, 2), num: true },
    { key: "p90", label: "P90", value: (r) => Math.round(r.p90), render: (r) => fmtMeasure(r.p90, measure, 2), num: true },
    { key: "ly", label: "vs last year", value: (r) => (r.ly ? r.sub / r.ly - 1 : null), render: (r) => (r.ly ? fmtSignedPct(r.sub / r.ly - 1) : "–"), num: true },
  ];

  const acc = useMemo(() => (bt.data ? accuracy(bt.data, (s) => inSel(m, filters, s)) : null), [bt.data, m, filters]);
  const hz = useMemo(() => (bt.data ? horizonOption(m, bt.data, filters, theme) : null), [bt.data, m, filters, theme]);
  const bias = useMemo(() => (bt.data ? biasOption(m, bt.data, filters, theme) : null), [bt.data, m, filters, theme]);
  const calib = useMemo(() => (bt.data ? calibrationOption(m, bt.data, filters, theme) : null), [bt.data, m, filters, theme]);
  const levels = useMemo(() => (bt.data ? levelTable(bt.data) : null), [bt.data]);
  const totalSub = sum(fc.fc);
  const origins = m.meta.backtest.origins;

  return (
    <>
      <Card
        title={tmLines ? `Backtest time machine · forecast made at ${tmLines.o.origin}` : `Forecast vs history · ${usd ? "USD" : "units"} per month`}
        sub={
          tmLines
            ? `What the ${modelName(tmLines.o.final)} model said at ${tmLines.o.origin} for the next ${tmLines.o.horizons} months, against what happened (unconstrained demand on scored cells). WAPE of these monthly totals: ${fmtPct(tmLines.wFinal)} vs ${fmtPct(tmLines.wBase)} for the baseline.`
            : "The forecast continues the unconstrained history; the band is the P10–P90 range of the aggregate, not a sum of row quantiles."
        }
        tools={
          <Segmented
            ariaLabel="Backtest origin"
            value={origin ?? "live"}
            onChange={(v) => setParam({ origin: v === "live" ? null : v })}
            options={[{ value: "live", label: "Live forecast" }, ...origins.map((o) => ({ value: o, label: `as of ${o}`, title: `Replay the backtest forecast made at ${o}` }))]}
          />
        }
        info={<Info what="The live forecast with its P10–P90 range, or (time machine) the forecast the final model and the best baseline produced at a past origin, against the actual unconstrained demand that followed." how="Aggregate bands use the contract formula. Time machine: sums over the selected series of scored cells only (actual known and not masked)." source="forecast.json, backtest_origin_<origin>.json" />}
      >
        {origin && tm.loading && <Loading what={`the ${origin} backtest`} />}
        {tm.error && <ErrorState message={tm.error} />}
        <EChart option={option} height={360} ariaLabel="Forecast timeline" />
        <TimelineLegend
          latent={latent && !tmLines}
          band={!tmLines}
          fc={!tmLines}
          extra={
            tmLines ? (
              <>
                <span>
                  <i className="lk" style={{ borderColor: theme.ink, borderTopWidth: 3 }} />
                  Actual (scored)
                </span>
                <span>
                  <i className="lk" style={{ borderColor: theme.scenario }} />
                  Forecast at origin
                </span>
                <span>
                  <i className="lk dash" style={{ borderColor: theme.baseline }} />
                  Baseline at origin
                </span>
              </>
            ) : undefined
          }
        />
      </Card>

      <div className="grid g2">
        <Card
          title="Forecast table"
          sub="Quantiles of each period's total from the contract formula: they stay coherent across month, quarter and year."
          tools={<Segmented ariaLabel="Roll-up" value={rollup} onChange={setRollup} options={[{ value: "month", label: "Month" }, { value: "quarter", label: "Quarter" }, { value: "year", label: "Year" }]} />}
          info={<Info what="Submitted forecast, P10 / P50 / P90 of each period's total and change vs the same period a year earlier (history, or forecast for 2028 months)." how="Multi-month quantiles sum the means and the shared errors before applying the lognormal quantile, so a quarter's P90 is less than the sum of its months' P90." source="forecast.json" />}
        >
          <DataTable rows={tableRows} cols={cols} pageSize={19} csvName="forecast_table.csv" />
          <div className="chip-row" style={{ marginTop: 10 }}>
            <span className={`badge ${m.meta.submission.matches_forecast ? "ok" : "bad"}`}>
              ✓ Bundle = submission.csv ({fmtInt(m.meta.submission.total_units)} units, {fmtInt(m.meta.submission.rows)} rows)
            </span>
            <span className="badge">Selection total {usd ? fmtMeasure(totalSub, measure, 2) : `${fmtInt(totalSub)} units`}</span>
            <span className="badge">Bottom-up: every total is a sum of row forecasts</span>
          </div>
        </Card>
        <Card
          title="Forecast X-ray"
          sub="Why this number: the multiplicative components of latent demand, then the ordering cycle that turns latent months into an order."
          info={<Info what="Waterfall for one forecast month over the selection: base level × seasonality × holidays × macro × EV shift × lifecycle × events = latent demand; cycle placement turns it into the order mean (an order carries every latent month since the previous order); rounding gives the submitted integer." how="For an aggregate the steps are cumulative sums of each row's running product, so the bars add up exactly to the submitted total." source="forecast_detail.json (level, f_* components)" />}
        >
          {detail.loading && <Loading what="forecast components" />}
          {detail.error && <ErrorState message={detail.error} />}
          {detail.data && (runs.length ? <XRay m={m} runs={runs} detail={detail.data} measureUsd={usd} /> : <Empty>No forecast rows in this selection.</Empty>)}
        </Card>
      </div>

      {bt.loading && <Loading what="backtest results" />}
      {bt.error && <ErrorState message={bt.error} />}
      {bt.data && acc && (
        <>
          <div className="grid g2">
            <Card
              title="Forecast value added · stairstep"
              sub={`Each step against the one before, pooled over ${bt.data.origins.length} rolling origins with a 19-month horizon, for the current selection.`}
              info={<Info what="WAPE and bias of every model in the ladder on the same scored cells (SKU × region × month), for the filtered series." how="WAPE = Σ|actual − forecast| / Σ actual; bias = Σ(forecast − actual) / Σ actual; actual = unconstrained demand; never an average of series WAPEs." source="backtest.json (series_buckets)" />}
            >
              {acc.actual > 0 ? <Stairstep bt={bt.data} acc={acc} /> : <Empty>No scored backtest cells for this selection.</Empty>}
            </Card>
            <Card
              title="WAPE by horizon"
              sub={hz?.fine ? "Months ahead 1–19, each model." : "SKU / customer filters use horizon buckets (per-series detail)."}
              info={<Info what="How error grows with the forecast horizon, per model, against the noise floor." how="Σ|e| / Σa per horizon over the selection." source="backtest.json (fine, series_buckets)" />}
            >
              {hz && <EChart option={hz.option} height={300} ariaLabel="WAPE by horizon" />}
            </Card>
          </div>
          <div className="grid g3">
            <Card
              title="Bias by family × region"
              sub={`${modelName(bt.data.final)} model; red = over-forecast, blue = under. Click a cell to filter.`}
              info={<Info what="Signed bias Σ(forecast − actual) / Σ actual for each family × region (other filters apply)." how="Diverging scale centred at 0, saturating at ±15 %." source="backtest.json" />}
            >
              {bias && <EChart option={bias} height={300} ariaLabel="Bias heatmap" onClick={(e) => { const v = e.value as number[]; setParam({ fam: m.dims.families.code[v[1]], reg: m.dims.regions[v[0]], sku: null }); }} />}
            </Card>
            <Card
              title="Interval calibration"
              sub="Share of actuals below P10, inside the band, above P90 — target 10 / 80 / 10."
              info={<Info what="Coverage of the final model's row-level P10–P90 interval in the backtest, by horizon bucket, for the selection." how="Counts of scored cells with actual < P10 or > P90." source="backtest.json (below_p10, above_p90)" />}
            >
              {calib ? <EChart option={calib} height={300} ariaLabel="Interval calibration" /> : <Empty>No interval forecasts in the backtest.</Empty>}
            </Card>
            <Card
              title="Accuracy by aggregation level"
              sub="All series, pooled over origins: errors cancel as forecasts are summed."
              info={<Info what="WAPE of each model when the error is measured on aggregated forecasts (series, family, region, total)." how="From the pipeline's metrics.csv: Σ abs_err_sum / Σ actual_sum over origins." source="backtest.json (metrics)" />}
            >
              {levels && (
                <table className="dt">
                  <thead>
                    <tr>
                      <th>Level</th>
                      {bt.data.models.map((md) => (
                        <th key={md} className="num">
                          {modelName(md)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {levels.levels.map((lv) => (
                      <tr key={lv}>
                        <td>{lv.replace(/_/g, " × ")}</td>
                        {bt.data!.models.map((md) => (
                          <td key={md} className="num" style={md === bt.data!.final ? { fontWeight: 700 } : undefined}>
                            {fmtPct(levels.get(lv, md))}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>
        </>
      )}
    </>
  );
}
