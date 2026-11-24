// R5 Forecast & accuracy (prediction).  Question: how good is the forecast, against which benchmarks, where is
// it weakest, can its band be trusted, and why is a number what it is?
//  lede (computed headline + standfirst | hero: backtest WAPE on its benchmark ladder)
//  -> the forecast continuing the history (shared timeline) or, replayed, a forecast made at a past origin
//  -> accuracy by family / region / channel (bar table)  -> bias family x region | WAPE by horizon
//  -> forecast table (month / quarter / year, coherent quantiles) | forecast X-ray
//  -> forecast value added | interval calibration | accuracy by aggregation level  -> colophon.
import { useCallback, useMemo } from "react";
import { useApp } from "../app/context";
import { useSelection, useElementWidth } from "../app/hooks";
import { EChart } from "../charts/EChart";
import { niceMax } from "../charts/theme";
import { TimelineChart } from "../charts/TimelineChart";
import { rangePresets, timelineAnnotations, type RangePreset, type TimelineModel, type TimelineSpec } from "../charts/timeline";
import { RangePresets, Segmented, Tabs, Stamp } from "../components/controls";
import { HeroFigure, Ladder, Lede, Rich } from "../components/Figure";
import { Module, timelineKey } from "../components/Module";
import { Empty, ErrorState, Loading, Notice } from "../components/states";
import { BarTable, DataTable, type Column } from "../components/tables";
import { forecastLatent, sum } from "../data/aggregate";
import { fmt1, fmtInt, fmtPct, fmtPts, fmtValue, fmtValueUnit, monthLong, monthName, monthSpan, fmtSignedPct } from "../data/format";
import { useResource } from "../data/load";
import { historyPrice } from "../data/model";
import { lognormalQuantile, moments, Z10, Z90 } from "../data/quantiles";
import type { BacktestFile, BacktestOrigin, ExceptionFile, ForecastDetail } from "../data/types";
import { exceptionRowsIn } from "../insights/briefing";
import { cap, render, selectionWords } from "../insights/headlines";
import {
  ACCURACY_TEMPLATES,
  BIAS_TEMPLATES,
  CAL_TEMPLATES,
  CHAIN,
  CHALLENGERS,
  HORIZON_BIAS_TEMPLATES,
  FVA_TEMPLATES,
  HORIZON_TEMPLATES,
  INTERMITTENT,
  LEVEL_LABEL,
  LEVEL_TEMPLATES,
  LIVE_TEMPLATES,
  MACHINE_TEMPLATES,
  PERIOD_TEMPLATES,
  SEGMENT_TEMPLATES,
  accuracy,
  biasGrid,
  biasOf,
  calibration,
  horizonData,
  inSel,
  levelWape,
  modelLabel,
  rankedModels,
  segments,
  wapeOf,
  type SegDim,
} from "../insights/accuracy";
import { biasOption, horizonOption, timeMachineOption } from "./g2/forecastCharts";
import { CalBars, Dumbbell, FvaSteps } from "./g2/parts";
import { XRAY_TEMPLATE, XRay, firstForecastMonth, xraySteps } from "./g2/XRay";
import "./g2/g2.css";

type Rollup = "month" | "quarter" | "year";
const DIM_LABEL: Record<SegDim, string> = { family: "Family", region: "Region", channel: "Channel" };

export default function Forecast() {
  const { m, theme, filters, measure, lens, params, setParam, setFilters } = useApp();
  const { runs, single, h, fc } = useSelection();
  const bt = useResource<BacktestFile>("backtest.json");
  const detail = useResource<ForecastDetail>("forecast_detail.json");
  const exc = useResource<ExceptionFile>("exceptions.json");
  const origins = m.meta.backtest.origins;
  const scored = m.meta.backtest.scored_origins ?? origins;
  const foldWords = `${scored.length} backtest origins (${monthName(scored[0])} – ${monthName(scored[scored.length - 1])})`;
  const originParam = params.get("origin");
  const origin = originParam && origins.includes(originParam) ? originParam : null;
  const tm = useResource<BacktestOrigin>(origin ? `backtest_origin_${origin}.json` : null);
  const usd = measure === "usd";
  const latent = lens === "latent";
  const sel = useMemo(() => selectionWords(m, filters), [m, filters]);
  const [wideRef, width] = useElementWidth<HTMLDivElement>();
  const narrow = width > 0 && width < 560;

  // ---- backtest accuracy for the selection (one variable for every place a WAPE appears) ----------------
  const final = m.meta.backtest.final;
  const models = useMemo(() => (bt.data ? rankedModels(bt.data) : []), [bt.data]);
  const acc = useMemo(() => (bt.data ? accuracy(bt.data, models, (s) => inSel(m, filters, s)) : null), [bt.data, models, m, filters]);
  const labels = useMemo(() => Object.fromEntries([...models, final].map((md) => [md, modelLabel(md, final)])), [models, final]);
  const freeDims = (["family", "region", "channel"] as SegDim[]).filter((d) => (d === "family" ? filters.family === null && filters.sku === null : filters[d] === null));
  const segAll = useMemo(() => (bt.data ? Object.fromEntries(freeDims.map((d) => [d, segments(m, bt.data as BacktestFile, filters, d)])) : {}) as Partial<Record<SegDim, ReturnType<typeof segments>>>, [bt.data, m, filters, freeDims.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
  const openDims = freeDims.filter((d) => (segAll[d]?.length ?? 0) >= 2);
  const weakest = useMemo(() => {
    const cands = (["family", "region"] as SegDim[])
      .flatMap((d) => ((segAll[d]?.length ?? 0) >= 2 ? (segAll[d] ?? []).filter((r) => r.share >= 0.03).map((r) => ({ ...r, dim: d })) : []));
    return cands.length ? cands.reduce((a, b) => (b.w > a.w ? b : a)) : null;
  }, [segAll]);
  const facts = useMemo(
    () => ({
      sel,
      cells: acc?.n ?? 0,
      origins: scored.length,
      final: acc ? wapeOf(acc, final) : NaN,
      snaive: acc ? wapeOf(acc, "seasonal_naive") : NaN,
      naive: acc ? wapeOf(acc, "naive") : NaN,
      floor: acc && models.includes("oracle") ? wapeOf(acc, "oracle") : NaN,
      bias: acc ? biasOf(acc, final) : NaN,
      weakest,
      segCount: weakest ? (segAll[weakest.dim]?.length ?? 0) : 0,
    }),
    [sel, acc, scored.length, final, models, weakest, segAll],
  );
  const headline = bt.data ? render(ACCURACY_TEMPLATES.headline, facts).text : "Scoring the forecast against the backtest…";
  const standfirst = bt.data ? render(ACCURACY_TEMPLATES.standfirst, facts).text : undefined;

  // ---- the live timeline ----------------------------------------------------------------------------------
  const fLatent = useMemo(() => (latent && detail.data ? forecastLatent(m, runs, detail.data, measure) : null), [latent, detail.data, m, runs, measure]);
  const range = (["all", "window"].includes(params.get("tl") ?? "") ? params.get("tl") : "recent") as RangePreset;
  const spec = useMemo<Omit<TimelineSpec, "narrow" | "height">>(
    () => ({
      m,
      theme,
      measure,
      lens,
      filters,
      hist: { shipped: latent ? h.latent : h.shipped, demand: latent ? h.latent : h.demand, imputed: h.imputed, cells: h.cells, missing: h.missing, unknownDemand: h.unknownDemand },
      fc: latent ? (fLatent ? { value: fLatent } : undefined) : { value: fc.fc, p10: fc.p10, p50: fc.p50, p90: fc.p90 },
      range,
      columns: single !== null,
    }),
    [m, theme, measure, lens, filters, h, fc, latent, fLatent, range, single],
  );
  const excRows = useMemo(() => (exc.data ? exceptionRowsIn(m, filters, exc.data) : []), [exc.data, m, filters]);
  const annotate = useCallback((tmod: TimelineModel) => timelineAnnotations({ spec: { ...spec }, model: tmod, exceptions: exc.data, exceptionRows: excRows }), [spec, exc.data, excRows]);
  const live = useMemo(() => {
    let l12 = 0;
    let n12 = 0;
    for (let t = m.asOf - 11; t <= m.asOf; t++) l12 += h.demand[t];
    for (let k = 0; k < Math.min(12, m.nWin); k++) n12 += fc.fc[k];
    let bw = 0;
    let nb = 0;
    for (let k = 0; k < m.nWin; k++) if (fc.fc[k] > 0) {
      bw += (fc.p90[k] - fc.p10[k]) / 2 / fc.fc[k];
      nb++;
    }
    return { chg12: l12 > 0 ? n12 / l12 - 1 : NaN, band: nb ? bw / nb : NaN, l12, n12 };
  }, [m, h.demand, fc]);
  const rangeText = `${monthName(m.months[range === "all" ? 0 : range === "window" ? m.asOf - 11 : m.months.indexOf(`${Number(m.months[m.asOf].slice(0, 4)) - 2}-01`)])} – ${monthName(m.months[m.nMonths - 1])}`;

  // ---- the time machine ---------------------------------------------------------------------------------------
  const machine = useMemo(() => {
    if (!tm.data) return null;
    const o = tm.data;
    const H = o.horizons;
    const A = new Float64Array(H);
    const P = new Float64Array(H);
    const B = new Float64Array(H);
    let ca = 0;
    let cp = 0;
    let cb = 0;
    o.series.forEach((s, k) => {
      if (!inSel(m, filters, s)) return;
      for (let j = 0; j < H; j++) {
        const a = o.actual[k * H + j];
        if (a === null) continue;
        const w = usd ? historyPrice(m, m.sSku[s], o.origin_month + 1 + j) || 0 : 1;
        const p = o.pred[k * H + j] ?? 0;
        const b = o.baseline_pred[k * H + j] ?? 0;
        A[j] += w * a;
        P[j] += w * p;
        B[j] += w * b;
        ca += w * a;
        cp += w * Math.abs(p - a);
        cb += w * Math.abs(b - a);
      }
    });
    const totA = sum(A);
    const agg = (x: Float64Array) => (totA > 0 ? sum(Array.from(x, (v, j) => Math.abs(v - A[j]))) / totA : NaN);
    return { o, A, P, B, H, agg: agg(P), aggBase: agg(B), cell: ca > 0 ? cp / ca : NaN, cellBase: ca > 0 ? cb / ca : NaN, baseLabel: modelLabel(o.baseline, final) };
  }, [tm.data, m, filters, usd, final]);
  const machineOpt = useMemo(
    () => (machine ? timeMachineOption(theme, m, { origin: machine.o.origin_month, H: machine.H, hist: h.demand, act: machine.A, pred: machine.P, base: machine.B, usd, finalLabel: "Our model", baseLabel: machine.baseLabel, narrow }) : null),
    [machine, theme, m, h.demand, usd, narrow],
  );

  // ---- the X-ray month: URL `xr` (yyyy-mm), else the first forecast month --------------------------------------
  const xrParam = params.get("xr");
  const xrMonth = xrParam && m.months.indexOf(xrParam) >= m.w0 ? m.months.indexOf(xrParam) : firstForecastMonth(m, runs);
  const setXr = (mm: number) => setParam({ xr: mm === firstForecastMonth(m, runs) ? null : m.months[mm] }, true);
  const xray = useMemo(() => (detail.data && runs.length ? xraySteps(m, runs, detail.data, xrMonth, usd) : null), [detail.data, m, runs, xrMonth, usd]);

  // ---- forecast table (quantiles of each period's total) ---------------------------------------------------------
  const rollup = (["month", "year"].includes(params.get("tb") ?? "") ? params.get("tb") : "quarter") as Rollup;
  const tableRows = useMemo(() => {
    const buckets: { key: string; months: number[] }[] = [];
    for (let k = 0; k < m.nWin; k++) {
      const mm = m.w0 + k;
      const lab = m.months[mm];
      const y = lab.slice(0, 4);
      const key = rollup === "month" ? lab : rollup === "quarter" ? `${y}-Q${Math.floor((Number(lab.slice(5)) - 1) / 3) + 1}` : y;
      const last = buckets[buckets.length - 1];
      if (last && last.key === key) last.months.push(mm);
      else buckets.push({ key, months: [mm] });
    }
    return buckets.map((b) => {
      const set = new Set(b.months);
      const mo = moments(m, runs, (x) => set.has(x), usd);
      const sub = b.months.reduce((a, mm) => a + fc.fc[mm - m.w0], 0);
      const ly = b.months.reduce((a, mm) => a + (mm - 12 <= m.asOf ? h.demand[mm - 12] : fc.fc[mm - 12 - m.w0]), 0);
      const full = rollup === "month" || b.months.length === (rollup === "quarter" ? 3 : 12);
      const span = monthSpan(m.months[b.months[0]], m.months[b.months[b.months.length - 1]]);
      const label = rollup === "month" ? monthName(b.key) : rollup === "quarter" ? `${b.key.slice(5)} ${b.key.slice(0, 4)}${full ? "" : ` (${span})`}` : `${b.key}${full ? "" : ` (${span})`}`;
      return { label, key: b.key, full, sub, p10: lognormalQuantile(mo.M, mo.V, Z10), p50: lognormalQuantile(mo.M, mo.V, 0), p90: lognormalQuantile(mo.M, mo.V, Z90), ly };
    });
  }, [m, runs, rollup, usd, fc, h]);
  type TRow = (typeof tableRows)[number];
  const fv = (v: number) => fmtValue(v, measure, 2);
  const tcols: Column<TRow>[] = [
    { key: "label", label: rollup === "month" ? "Month" : rollup === "quarter" ? "Quarter" : "Year", value: (r) => r.label },
    { key: "sub", label: "Forecast", value: (r) => Math.round(r.sub), render: (r) => <b style={{ color: "var(--ink)", fontWeight: 600 }}>{fv(r.sub)}</b>, num: true, fc: true },
    { key: "p10", label: "P10", value: (r) => Math.round(r.p10), render: (r) => fv(r.p10), num: true, fc: true },
    { key: "p50", label: "P50", value: (r) => Math.round(r.p50), render: (r) => fv(r.p50), num: true, fc: true },
    { key: "p90", label: "P90", value: (r) => Math.round(r.p90), render: (r) => fv(r.p90), num: true, fc: true },
    { key: "ly", label: "vs a year earlier", value: (r) => (r.ly ? r.sub / r.ly - 1 : null), render: (r) => (r.ly ? fmtSignedPct(r.sub / r.ly - 1) : "–"), num: true },
  ];
  const totalSub = sum(fc.fc);

  // ---- accuracy modules -------------------------------------------------------------------------------------------
  const dimParam = params.get("by") as SegDim | null;
  const segDefault: SegDim | null = weakest && openDims.includes(weakest.dim) ? weakest.dim : (openDims[0] ?? null);
  const segDim: SegDim | null = dimParam && openDims.includes(dimParam) ? dimParam : segDefault;
  const segRows = segDim ? (segAll[segDim] ?? []) : [];
  const hz = useMemo(() => (bt.data ? horizonData(m, bt.data, filters, ["naive", "seasonal_naive", "oracle", final].filter((md) => bt.data?.models.includes(md))) : null), [bt.data, m, filters, final]);
  const hzMetric: "wape" | "bias" = params.get("hm") === "bias" ? "bias" : "wape";
  const hzOpt = useMemo(() => (hz ? horizonOption(theme, hz, final, labels, narrow, hzMetric) : null), [hz, theme, final, labels, narrow, hzMetric]);
  const hzBiasTitle = hz ? render(HORIZON_BIAS_TEMPLATES.title, { bias: hz.b[final] ?? [], xs: hz.xs, fine: hz.fine }).text : "";
  const hzFacts = useMemo(() => {
    const w = hz?.w[final] ?? [];
    const firstI = w.findIndex((v) => v !== null);
    let lastI = -1;
    for (let i = w.length - 1; i >= 0; i--) if (w[i] !== null) {
      lastI = i;
      break;
    }
    return {
      first: firstI >= 0 ? w[firstI] : null,
      last: lastI >= 0 ? w[lastI] : null,
      firstLabel: hz?.fine ? `${hz.xs[firstI]} month${hz.xs[firstI] === "1" ? "" : "s"}` : `${hz?.xs[firstI] ?? ""} months`,
      lastLabel: hz?.fine ? `${hz.xs[lastI]} months` : `${hz?.xs[lastI] ?? ""} months`,
      gapToFloor: null,
    };
  }, [hz, final]);
  const grid = useMemo(() => (bt.data ? biasGrid(m, bt.data, filters) : []), [bt.data, m, filters]);
  const biasOpt = useMemo(() => (grid.length ? biasOption(theme, m, grid, { fam: filters.family, reg: filters.region }, narrow) : null), [grid, theme, m, filters.family, filters.region, narrow]);
  const biasCells = grid.filter((c) => c.bias !== null && c.actual > 0).map((c) => ({ fam: m.dims.families.name[c.fam], reg: m.dims.regions[c.reg], bias: c.bias as number }));
  const cal = useMemo(() => (bt.data ? calibration(bt.data) : null), [bt.data]);
  const lvl = useMemo(() => (bt.data ? levelWape(bt.data, ["seasonal_naive", final]) : []), [bt.data, final]);
  const fvaSteps = acc
    ? [...CHAIN.filter((md) => models.includes(md)), final].map((md) => ({ md, label: labels[md] ?? md, w: wapeOf(acc, md), b: biasOf(acc, md), me: md === final }))
    : [];
  const intermittent = acc ? INTERMITTENT.filter((md) => models.includes(md)).map((md) => ({ md, w: wapeOf(acc, md) })) : [];
  const challengers = acc ? CHALLENGERS.filter((md) => models.includes(md) && md !== final).map((md) => ({ md, w: wapeOf(acc, md), b: biasOf(acc, md) })) : [];
  const why = bt.data ? String((bt.data.summary as { why?: unknown }).why ?? "") : "";

  const pickSeg = (d: SegDim, idx: number) => setFilters({ ...filters, [d]: idx, ...(d === "family" ? { sku: null } : {}) });

  // ---- render ---------------------------------------------------------------------------------------------------------
  const machineTitle = machine ? render(MACHINE_TEMPLATES.title, { origin: machine.o.origin, baseLabel: machine.baseLabel, agg: machine.agg, aggBase: machine.aggBase, cell: machine.cell, cellBase: machine.cellBase }).text : "";
  const liveTitle = render(LIVE_TEMPLATES.title, live).text;
  const liveDek = `${usd ? "Revenue in USD" : "Units"} per month, ${rangeText}${latent ? ", latent demand: each order spread over the months it covers" : single !== null ? ", one series as columns; the forecast carries a P10–P90 whisker per month" : ". History shows unconstrained demand; the forecast carries its P10–P90 range"}. Click a forecast month to X-ray it.`;
  const p50Note = (tmod: TimelineModel) =>
    tmod.hasBand ? (
      tmod.p50Drawn ? (
        <span>The dotted line is the P50 of the aggregate; it departs from the submitted forecast by up to {fmtPct(tmod.p50MaxRel)}.</span>
      ) : (
        <span>P50 sits within {fmtPct(Math.max(tmod.p50MaxRel, 0.001), 1)} of the submitted forecast in every month and is listed in the tooltip.</span>
      )
    ) : latent ? (
      <span>Latent lens: the P10–P90 range applies to orders as booked.</span>
    ) : null;

  return (
    <>
      <Lede
        headline={headline}
        standfirst={standfirst}
        figure={
          <HeroFigure
            label="Backtest error (WAPE), our model"
            value={acc && Number.isFinite(facts.final) ? fmtPct(facts.final) : "–"}
            visual={
              acc && Number.isFinite(facts.final) ? (
                <Ladder
                  rows={fvaSteps.map((s) => ({ label: s.me ? "Our model" : s.label, value: s.w, me: s.me }))}
                  format={(v) => fmt1(v * 100)}
                  foot={`${facts.origins} origins, 19-month horizon${Number.isFinite(facts.floor) ? `; in-hindsight floor ${fmtPct(facts.floor)}` : ""}`}
                />
              ) : undefined
            }
            context={acc && Number.isFinite(facts.final) && Number.isFinite(facts.snaive) ? `**${fmtPts(facts.snaive - facts.final).replace("+", "")}** ${facts.final <= facts.snaive ? "better" : "worse"} than seasonal naive; lower is better` : bt.loading ? "Reading the backtest…" : "No scored backtest cells for this selection."}
            info={{
              what: "Weighted absolute percentage error of the submitted model in a rolling-origin backtest with a 19-month horizon, for the series in the selection, against three benchmarks.",
              how: `WAPE = Σ|actual − forecast| / Σ actual over every scored series-month, pooled over the ${foldWords} that chose the model; actual = unconstrained demand. The floor is the error of an in-hindsight forecast of each series' level: no honest forecast goes below it.`,
              source: "backtest.json (series_buckets)",
            }}
          />
        }
      />

      <Module
        id="fc-timeline"
        title={machine ? machineTitle : liveTitle}
        dek={
          machine
            ? `${usd ? "Revenue in USD" : "Units"} per month, ${monthSpan(m.months[Math.max(0, machine.o.origin_month - 24)], m.months[machine.o.origin_month + machine.H])}: the forecast our model made at ${monthName(machine.o.origin)} against the unconstrained demand that followed (scored cells). Per series and month it missed by ${fmtPct(machine.cell)}, against ${fmtPct(machine.cellBase)} for ${machine.baseLabel.toLowerCase()}.`
            : liveDek
        }
        tools={!machine ? <RangePresets value={range} options={rangePresets(m)} onChange={(v) => setParam({ tl: v === "recent" ? null : v }, true)} /> : undefined}
        info={{
          what: machine
            ? `The backtest time machine: what our model and ${machine.baseLabel.toLowerCase()} forecast at the ${monthName(machine.o.origin)} origin for the next ${machine.H} months, against what happened.`
            : "The forecast continuing the history on one timeline, with the P10–P90 range of the aggregate (never a sum of row quantiles).",
          how: machine
            ? "Sums over the selected series of the scored cells only (actual known and not masked). Monthly-total error = Σ|Σa − Σf| / Σa; per-series error = Σ|a − f| / Σa."
            : "Exact sums over the selected series; the forecast's first point is the last actual. Quantiles use the contract's aggregate formula.",
          source: machine ? `backtest_origin_${machine.o.origin}.json, history.json` : "history.json, forecast.json, exceptions.json",
        }}
        keyItems={
          machine
            ? [
                { kind: "line", color: "var(--ink)", label: "Actual demand" },
                "sep",
                { kind: "line", color: "var(--accent)", label: `Our model, made ${monthName(machine.o.origin)}` },
                { kind: "dash", color: "var(--ink-3)", label: machine.baseLabel },
              ]
            : timelineKey({ latent, columns: single !== null, rebuilt: !latent, lost: !latent })
        }
      >
        <div className="g2-ctl" style={{ marginTop: 4, marginBottom: 6 }}>
          <span className="lbl" id="tm-lbl">
            Replay the forecast made at
          </span>
          <Segmented
            ariaLabel="Backtest origin"
            size="sm"
            value={origin ?? "live"}
            onChange={(v) => setParam({ origin: v === "live" ? null : v }, true)}
            options={[
              { value: "live", label: `Live (${monthName(m.months[m.asOf])})`, title: "The submitted forecast from the last actual" },
              ...origins.map((o) => ({ value: o, label: monthName(o), title: scored.includes(o) ? `Replay the backtest forecast made at ${monthName(o)}` : `Replay the ${monthName(o)} stress test (COVID and the chip shortage): replayed here, never pooled into a WAPE` })),
            ]}
          />
        </div>
        <div ref={wideRef}>
          {origin && tm.loading && !machine && <Loading what={`the ${monthName(origin)} backtest`} height={340} />}
          {tm.error && <ErrorState message={tm.error} />}
          {origin && machine && machineOpt && <EChart option={machineOpt} height={340} ariaLabel={`${machineTitle}.`} busy={tm.loading} />}
          {!origin &&
            (latent && detail.loading && !fLatent ? (
              <Loading what="latent demand for the forecast window" height={340} />
            ) : (
              <TimelineChart spec={spec} annotate={annotate} height={single !== null ? 320 : 340} ariaLabel={`${liveTitle}. ${liveDek}`} footnote={p50Note} onXClick={(mm) => mm >= m.w0 && setXr(mm)} />
            ))}
        </div>
      </Module>

      {bt.loading && !bt.data && <Loading what="the backtest" />}
      {bt.error && <ErrorState message={bt.error} />}

      {bt.data && acc && segDim && (
        <Module
          title={segDim && segRows.length ? render(SEGMENT_TEMPLATES.title, { dim: segDim, rows: segRows }).text : "The filters fix family, region and channel"}
          dek={segDim ? `Backtest WAPE and bias of our model by ${segDim}, pooled over ${foldWords}, against seasonal naive and the in-hindsight floor of the same cells. Click a row to filter the page.` : "There is nothing to compare inside one segment. Widen a filter to see accuracy by family, region or channel."}
          info={{
            what: "Where the forecast is weakest: our model's error by segment, the benchmark's error on the same cells, our bias, and the floor that even an in-hindsight level forecast would not beat.",
            how: "WAPE and bias are exact pooled sums over the segment's scored series-months; a segment's floor is the oracle's WAPE on its cells, so a high WAPE close to its floor is noise, not a modelling miss.",
            source: "backtest.json (series_buckets)",
          }}
        >
          {segDim && (
            <>
              <Tabs ariaLabel="Accuracy by" value={segDim} options={openDims.map((d) => ({ value: d, label: DIM_LABEL[d] }))} onChange={(v) => setParam({ by: v === segDefault ? null : v }, true)} />
              <BarTable
                ariaLabel={`Backtest accuracy by ${segDim}`}
                rows={segRows}
                rowKey={(r) => r.label}
                onRow={(r) => pickSeg(segDim, r.idx)}
                bar={{ value: (r) => r.w, tone: "forecast", leader: (r) => r === segRows[0] }}
                cols={
                  narrow
                    ? [
                        { key: "l", label: DIM_LABEL[segDim], kind: "label", value: (r) => r.label, width: "38%" },
                        { key: "b", label: "WAPE", kind: "bar" },
                        { key: "w", label: "", kind: "num", value: (r) => fmtPct(r.w), width: "17%" },
                        { key: "x", label: "Bias", kind: "num", value: (r) => fmtSignedPct(r.b), width: "17%" },
                      ]
                    : [
                        { key: "l", label: DIM_LABEL[segDim], kind: "label", value: (r) => r.label, width: "24%" },
                        { key: "s", label: "Share of volume", kind: "num", value: (r) => fmtPct(r.share), width: "11%" },
                        { key: "b", label: "WAPE, our model", kind: "bar" },
                        { key: "w", label: "WAPE", kind: "num", value: (r) => fmtPct(r.w), width: "9%" },
                        { key: "n", label: "Seasonal naive", kind: "num", value: (r) => fmtPct(r.ws), width: "11%" },
                        { key: "f", label: "Floor", kind: "num", value: (r) => fmtPct(r.floor), width: "8%" },
                        { key: "x", label: "Bias", kind: "num", value: (r) => fmtSignedPct(r.b), width: "9%" },
                      ]
                }
                total={narrow ? { l: "Selection", w: fmtPct(facts.final), x: fmtSignedPct(facts.bias) } : { l: "Selection", s: "100%", w: fmtPct(facts.final), n: fmtPct(facts.snaive), f: fmtPct(facts.floor), x: fmtSignedPct(facts.bias) }}
              />
            </>
          )}
        </Module>
      )}

      {bt.data && acc && (
        <div className="cols-7-5">
          <Module
            title={render(BIAS_TEMPLATES.title, { cells: biasCells }).text}
            dek={`Signed backtest bias of our model, Σ(forecast − actual) / Σ actual, by family and region${filters.channel !== null || filters.customer !== null ? " within the other filters" : ""}; plum over-forecasts, jade under-forecasts. Click a cell to filter.`}
            info={{ what: "Where the model leans high or low: bias for every family × region cell, the other filters applied.", how: "Pooled over every scored series-month of the cell; the scale is symmetric around zero and its ends are printed.", source: "backtest.json (series_buckets)" }}
          >
            {biasOpt && (
              <EChart
                option={biasOpt}
                height={narrow ? 330 : 360}
                ariaLabel={`${render(BIAS_TEMPLATES.title, { cells: biasCells }).text}. Bias by family and region.`}
                onClick={(e) => {
                  const v = e.value as number[];
                  if (!Array.isArray(v)) return;
                  setFilters({ ...filters, family: v[1], region: v[0], sku: null });
                }}
              />
            )}
          </Module>
          <Module
            title={hzMetric === "bias" ? hzBiasTitle : render(HORIZON_TEMPLATES.title, hzFacts).text}
            dek={`${hzMetric === "bias" ? "Signed bias, Σ(forecast − actual) / Σ actual," : "WAPE"} by ${hz?.fine ? "months ahead, 1 to 19" : "horizon bucket (a SKU or customer filter uses the per-series buckets)"}, pooled over the ${scored.length} origins: our model against two benchmarks${hzMetric === "bias" ? "; above zero over-forecasts" : " and the in-hindsight floor"}.`}
            tools={<Segmented ariaLabel="Horizon metric" size="sm" value={hzMetric} onChange={(v) => setParam({ hm: v === "wape" ? null : v }, true)} options={[{ value: "wape", label: "WAPE" }, { value: "bias", label: "Bias" }]} />}
            info={{ what: "How error and bias change with the horizon, per model.", how: "Σ|a − f| / Σa (WAPE) and Σ(f − a) / Σa (bias) at each horizon over the selection.", source: "backtest.json (fine, series_buckets)" }}
          >
            {hzOpt && <EChart option={hzOpt} height={narrow ? 300 : 336} ariaLabel={`${hzMetric === "bias" ? hzBiasTitle : render(HORIZON_TEMPLATES.title, hzFacts).text}.`} />}
          </Module>
        </div>
      )}

      <div className="cols-7-5">
        <Module
          title={render(PERIOD_TEMPLATES.title, { rollup, rows: tableRows, unit: (v: number) => fmtValueUnit(v, measure) }).text}
          dek={`${fmtValueUnit(totalSub, measure)} in all, ${monthName(m.months[m.w0])} – ${monthName(m.months[m.nMonths - 1])}. The submitted forecast and the P10 / P50 / P90 of each period's total, from the contract formula: quantiles stay coherent when months add up to quarters and years.`}
          info={{
            what: "Submitted forecast, quantiles of each period's total and the change against the same months a year earlier (history, or the forecast for 2028 months).",
            how: "Multi-month quantiles sum the means and the shared errors before the lognormal quantile, so a quarter's P90 is less than the sum of its months' P90.",
            source: "forecast.json",
          }}
        >
          <Tabs ariaLabel="Roll up by" value={rollup} options={[{ value: "month", label: "Month" }, { value: "quarter", label: "Quarter" }, { value: "year", label: "Year" }]} onChange={(v) => setParam({ tb: v === "quarter" ? null : v }, true)} />
          <DataTable rows={tableRows} cols={tcols} pageSize={19} csvName={`forecast_by_${rollup}.csv`} ariaLabel={`Forecast by ${rollup}`} />
          <div className="stamps">
            <Stamp ok={m.meta.submission.matches_forecast}>
              Bundle = <code>submission.csv</code>: <b>{fmtInt(m.meta.submission.total_units)}</b> units in <b>{fmtInt(m.meta.submission.rows)}</b> rows
            </Stamp>
            <Stamp ok>Every total is a bottom-up sum of row forecasts</Stamp>
          </div>
        </Module>
        <Module
          title={xray ? render(XRAY_TEMPLATE, { month: m.months[xrMonth], steps: xray.steps, measure }).text : "Forecast X-ray"}
          dek="Why this number: the multiplicative components of latent demand, then the ordering cycle that turns latent months into orders."
          info={{
            what: "For one forecast month and the selection: base level × season × holiday × macro × EV shift × lifecycle × event = latent demand; cycle placement turns it into the order mean (an order carries every latent month since the previous order); rounding gives the submitted integer.",
            how: "For an aggregate, each step is the sum over rows of the running product, so the steps add up exactly to the submitted total. The factor column is each step's effective multiplier on the aggregate.",
            source: "forecast_detail.json (level, f_* components)",
          }}
        >
          {detail.loading && !detail.data && <Loading what="forecast components" height={300} />}
          {detail.error && <ErrorState message={detail.error} />}
          {detail.data && (runs.length ? <XRay m={m} runs={runs} detail={detail.data} month={xrMonth} onMonth={setXr} measure={measure} /> : <Empty title="No forecast rows for this selection">The account is lost or the SKU ends before {monthLong(m.months[m.w0])}. Clear the customer or SKU filter.</Empty>)}
        </Module>
      </div>

      {bt.data && acc && (
        <div className="cols-3">
          <Module
            title={render(FVA_TEMPLATES.title, { steps: fvaSteps, floor: facts.floor }).text}
            dek="Forecast value added: WAPE at each step of the benchmark chain on the same cells, with the in-hindsight floor as the hairline."
            info={{ what: "WAPE and bias of each model on identical scored cells for the selection; value added = the WAPE points a step removes.", how: `Pooled sums over the ${foldWords}; every model is scored on the same cells, so every bar is comparable.`, source: "backtest.json (series_buckets)" }}
          >
            <FvaSteps steps={fvaSteps} floor={facts.floor} ariaLabel="Forecast value added by step" />
            {challengers.length > 0 && (
              <p className="g2-why">
                <Rich text={`Challengers on the same cells: ${challengers.map((x) => `${modelLabel(x.md, final)} **${fmtPct(x.w)}** (bias ${fmtSignedPct(x.b)})`).join(", ")}${challengers.every((x) => x.w >= facts.final) ? "; neither beats our model, so it ships alone." : "."}`} />
              </p>
            )}
            {intermittent.length > 0 && (
              <p className="g2-why">
                <Rich text={`Intermittent-demand methods tested on the same cells: ${intermittent.map((x) => `${modelLabel(x.md, final)} **${fmtPct(x.w)}**`).join(", ")}${intermittent.every((x) => x.w > facts.snaive) ? "; none beats seasonal naive." : "."}`} />
              </p>
            )}
          </Module>
          <Module
            title={cal ? render(CAL_TEMPLATES.title, cal.rows.find((r) => r.level === "series") ?? null).text : "Interval calibration"}
            dek={cal ? `Share of monthly actuals below P10, inside the band and above P90, ${cal.honest ? `each fold scored with quantiles calibrated on the other ${cal.folds - 1}` : "on the calibration folds"}; target 10 / 80 / 10. All series.` : undefined}
            info={{ what: "Whether the P10–P90 band means what it says: about 80 % of actuals should fall inside it.", how: "Leave-one-origin-out: each decision fold is scored with an uncertainty model fitted on the other folds, then the counts are pooled.", source: "backtest.json (summary.coverage)" }}
          >
            {cal ? <CalBars rows={cal.rows} /> : <Empty>The backtest summary carries no coverage counts.</Empty>}
          </Module>
          <Module
            title={lvl.length >= 2 ? render(LEVEL_TEMPLATES.title, { first: lvl[0].w[final], last: lvl[lvl.length - 1].w[final], lastLabel: lvl[lvl.length - 1].level === "total" ? "monthly total" : LEVEL_LABEL[lvl[lvl.length - 1].level].toLowerCase() }).text : "Accuracy by aggregation level"}
            dek={`WAPE when the error is measured on summed forecasts, seasonal naive (ring) to our model (orange). All series, pooled over the ${scored.length} origins.`}
            info={{ what: "WAPE of seasonal naive and our model at each aggregation level, series up to the total.", how: "Σ abs_err_sum / Σ actual_sum over the scored origins at each level of the pipeline's metrics table.", source: "backtest.json (metrics)" }}
          >
            {lvl.length ? <Dumbbell baseLabel="seasonal naive" rows={lvl.map((l) => ({ label: LEVEL_LABEL[l.level] ?? l.level, base: l.w.seasonal_naive, ours: l.w[final] }))} max={niceMax(Math.max(...lvl.map((l) => Math.max(l.w.seasonal_naive, l.w[final]))) * 1.18)} /> : <Empty>No level metrics in the backtest.</Empty>}
          </Module>
        </div>
      )}

      {bt.data && (
        <aside className="colophon" aria-label="Method">
          <span>
            <b>WAPE</b> Σ|actual − forecast| / Σ actual over scored series-months
          </span>
          <span>
            <b>Bias</b> Σ(forecast − actual) / Σ actual
          </span>
          <span>
            <b>Scored origins</b> {scored.map((o) => monthName(o)).join(", ")}
            {origins.some((o) => !scored.includes(o)) && `; ${origins.filter((o) => !scored.includes(o)).map((o) => monthName(o)).join(", ")} is a stress test, replayed in the time machine and never pooled`}
          </span>
          {why && (
            <span>
              <b>Model choice</b> {cap(why)}
            </span>
          )}
        </aside>
      )}
      {!bt.data && !bt.loading && !bt.error && <Notice tone="info">No backtest in the bundle.</Notice>}
    </>
  );
}
