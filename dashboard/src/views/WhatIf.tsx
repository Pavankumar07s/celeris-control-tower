// O2 What-if (prediction).  Question: what happens to the plan if the economy turns, and where does it land?
//  lede (computed headline + standfirst | hero: the scenario change with the base forecast's P10-P90 strip)
//  -> scenario builder (presets, indicator, shift, period, events; one orange Apply) | the shared timeline with the
//     base forecast (orange, banded) and the scenario (violet, solid)
//  -> P90 cover, peak month, rows changed  -> impact by family (diverging bar table) | effect by month
// The applied scenario lives in the URL hash (wi, ws, wf, wn, we), so every scenario is a link.
import { useCallback, useEffect, useMemo, useState } from "react";
import type { EChartsCoreOption } from "echarts/core";
import { useApp } from "../app/context";
import { useSelection, useElementWidth } from "../app/hooks";
import { EChart } from "../charts/EChart";
import { TimelineChart } from "../charts/TimelineChart";
import { eventTitle, rangePresets, rangeStart, timelineAnnotations, type RangePreset, type TimelineModel, type TimelineSpec, markPresence } from "../charts/timeline";
import { BAR_MAX, FONT, fz, axisTooltip, barStyle, baseOption, categoryAxis, ttEnd, ttHead, ttRow, valueAxis, type TooltipItem } from "../charts/theme";
import type { Annotation } from "../charts/Annotations";
import { Button, RangePresets, Select } from "../components/controls";
import { Figure, FigureStrip, HeroFigure, Lede } from "../components/Figure";
import { Module, timelineKey } from "../components/Module";
import { Empty, ErrorState, Loading, Notice } from "../components/states";
import { BarTable } from "../components/tables";
import { sum } from "../data/aggregate";
import { fmtInt, fmtMoney, fmtNum, fmtOnScale, fmtPct, fmtPctAbs, fmtSigned, fmtSignedPct, fmtValue, fmtValueUnit, monthLong, monthName } from "../data/format";
import { useResources } from "../data/load";
import { lognormalQuantile, moments, Z10, Z90 } from "../data/quantiles";
import type { ForecastDetail, MacroFile } from "../data/types";
import { render } from "../insights/headlines";
import { IND, indName } from "../insights/indicators";
import { ScenarioStrip } from "./g2/parts";
import { BYMONTH_TEMPLATES, FAM_TEMPLATES, PRESETS, WHATIF_TEMPLATES, presetScenario, runScenario, sameScenario, scenarioFrom, scenarioName, scenarioPatch, scenarioSums, type Scenario } from "../insights/whatif";
import "./g2/g2.css";
import { ladderFacts } from "../insights/briefing";

export default function WhatIf() {
  const { m, theme, filters, measure, lens, params, setParam, go } = useApp();
  const { h, fc, runs, single } = useSelection();
  const res = useResources<[ForecastDetail, MacroFile]>(["forecast_detail.json", "macro.json"]);
  const usd = measure === "usd";
  const [famRef, famW] = useElementWidth();
  const narrow = famW > 0 && famW < 480;
  const mf = res.data?.[1] ?? null;
  const indicators = mf?.indicators ?? Object.keys(IND);
  const applied = useMemo(() => scenarioFrom(m, params, indicators), [m, params, indicators.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
  const [draft, setDraft] = useState<Scenario>(applied);
  useEffect(() => setDraft(applied), [applied]);
  const dirty = !sameScenario(draft, applied);
  const apply = (s: Scenario) => setParam(scenarioPatch(m, s), true);

  // ---- the scenario over the selection --------------------------------------------------------------------
  const result = useMemo(() => (res.data ? runScenario(m, runs, res.data[0], res.data[1], applied) : null), [res.data, m, runs, applied]);
  const sums = useMemo(() => (result ? scenarioSums(m, runs, result.mean, usd) : null), [result, m, runs, usd]);
  const q = useMemo(() => {
    if (!result) return null;
    const b = moments(m, runs, () => true, usd);
    const s = moments(m, runs, () => true, usd, result.mean);
    return { p10: lognormalQuantile(b.M, b.V, Z10), p90: lognormalQuantile(b.M, b.V, Z90), scen90: lognormalQuantile(s.M, s.V, Z90) };
  }, [result, m, runs, usd]);
  const baseT = sums ? sum(sums.base) : 0;
  const scenT = sums ? sum(sums.scen) : 0;
  const diff = useMemo(() => (sums ? Array.from(sums.scen, (v, k) => v - sums.base[k]) : []), [sums]);
  const firstK = diff.findIndex((d) => Math.abs(d) > 0.5);
  const peakK = diff.length ? diff.reduce((a, d, k) => (Math.abs(d) > Math.abs(diff[a]) ? k : a), 0) : -1;
  const famRows = useMemo(
    () =>
      (sums?.byFam ?? [])
        .map((r) => ({ label: m.dims.families.name[r.f], idx: r.f, d: r.s - r.b, pct: r.b > 0 ? r.s / r.b - 1 : 0, du: r.su - r.bu, base: r.b }))
        .sort((a, b) => a.pct - b.pct),
    [sums, m],
  );
  const topFam = famRows.length ? famRows.reduce((a, b) => (Math.abs(b.pct) > Math.abs(a.pct) ? b : a)) : null;
  // one scale per column (the selection total sets it, so the total row reads on the same scale)
  const dMax = Math.max(Math.abs(sum(famRows.map((r) => r.d))), ...famRows.map((r) => Math.abs(r.d)));
  const duMax = Math.max(Math.abs(sum(famRows.map((r) => r.du))), ...famRows.map((r) => Math.abs(r.du)));
  const ladder = ladderFacts(m);
  const name = scenarioName(m, applied);
  const facts = {
    name,
    measure,
    base: baseT,
    scen: scenT,
    p10: q?.p10 ?? NaN,
    p90: q?.p90 ?? NaN,
    topFam: famRows.length > 1 && topFam && Math.abs(topFam.pct) >= 0.0005 ? topFam.label : null,
    topFamPct: topFam?.pct ?? 0,
    firstMonth: firstK >= 0 ? m.months[m.w0 + firstK] : null,
    peakMonth: peakK >= 0 && Math.abs(diff[peakK]) > 0.5 ? m.months[m.w0 + peakK] : null,
    peak: peakK >= 0 ? diff[peakK] : 0,
    peakPct: peakK >= 0 && sums && sums.base[peakK] > 0 ? diff[peakK] / sums.base[peakK] : NaN,
    nonZero: Math.abs(scenT - baseT) > 0.5,
  };
  const headline = res.data ? render(WHATIF_TEMPLATES.headline, facts).text : "Loading the model's sensitivities…";
  const standfirst = res.data ? render(WHATIF_TEMPLATES.standfirst, facts).text : undefined;

  // ---- timeline: base forecast (orange, banded) and the scenario (violet, solid) --------------------------------
  const range = (["all", "recent"].includes(params.get("tl") ?? "") ? params.get("tl") : "window") as RangePreset;
  const scenLine = useMemo(() => {
    const line = new Array(m.nMonths).fill(null) as (number | null)[];
    if (sums) {
      line[m.asOf] = h.demand[m.asOf];
      for (let k = 0; k < m.nWin; k++) line[m.w0 + k] = sums.scen[k];
    }
    return line;
  }, [sums, m, h.demand]);
  const spec = useMemo<Omit<TimelineSpec, "narrow" | "height">>(
    () => ({
      m,
      theme,
      measure,
      lens: "orders",
      filters,
      hist: { shipped: h.shipped, demand: h.demand, imputed: h.imputed, cells: h.cells, missing: h.missing, unknownDemand: h.unknownDemand },
      fc: { value: fc.fc, p10: fc.p10, p50: fc.p50, p90: fc.p90 },
      lines: sums ? [{ name: "Scenario (order mean)", data: scenLine, color: theme.scenario, width: 2 }] : [],
      range,
      columns: single !== null,
    }),
    [m, theme, measure, filters, h, fc, sums, scenLine, range, single],
  );
  const annotate = useCallback(
    (tm: TimelineModel): Annotation[] => {
      const out = timelineAnnotations({ spec: { ...spec }, model: tm, include: ["divider", "end"] });
      // the scenario's end value and its gap to the base, labelled at the end with the base forecast's own
      // end label (one label, so the two never overprint)
      const end = out.find((a) => a.id === "end");
      const last = m.nWin - 1;
      if (end && sums && Math.abs(sums.scen[last] - sums.base[last]) > 0.5)
        end.text = `${end.text ?? ""}\nScenario ${fmtValue(sums.scen[last], measure, 1)}, ${fmtSignedPct(sums.base[last] > 0 ? sums.scen[last] / sums.base[last] - 1 : 0)}`;
      if (peakK >= 0 && Math.abs(diff[peakK]) > 0.5 && sums) {
        const i = m.w0 + peakK;
        if (i >= tm.start && i < tm.start + tm.labels.length)
          out.push({ id: "scen-peak", at: i - tm.start, value: sums.scen[peakK], title: `Scenario, ${monthName(m.months[i])}`, text: `${fmtSigned(diff[peakK], measure, 1)}${usd ? "" : " units"}, ${fmtSignedPct(sums.base[peakK] > 0 ? diff[peakK] / sums.base[peakK] : 0)} vs base`, anchor: diff[peakK] < 0 ? "below" : "above", tone: "future", priority: 1 });
      }
      return out;
    },
    [spec, peakK, diff, sums, m, measure, usd],
  );
  const rangeText = `${monthName(m.months[rangeStart(m, range)])} – ${monthName(m.months[m.nMonths - 1])}`;
  const endGap = sums && sums.base[m.nWin - 1] > 0 ? sums.scen[m.nWin - 1] / sums.base[m.nWin - 1] - 1 : 0;
  const tlTitle =
    facts.nonZero && sums && Math.abs(endGap) >= 0.0005
      ? `By ${monthName(m.months[m.nMonths - 1])} the scenario runs ${fmtPctAbs(endGap)} ${endGap < 0 ? "below" : "above"} the base forecast`
      : "Base forecast and scenario on one timeline";
  // the month the effect first reaches 80 % of its peak (lags and cycles make it build up)
  const fullK = peakK >= 0 ? diff.findIndex((d) => Math.abs(d) >= 0.8 * Math.abs(diff[peakK]) && Math.abs(d) > 0.5) : -1;

  // ---- month-by-month effect ---------------------------------------------------------------------------------------
  const byMonth = useMemo<EChartsCoreOption | null>(() => {
    if (!sums) return null;
    const labs = Array.from({ length: m.nWin }, (_, k) => m.months[m.w0 + k]);
    const lo = Math.min(0, ...diff);
    const hi = Math.max(0, ...diff);
    const both = lo < 0 && hi > 0;
    // round ticks: a 1 / 2 / 2.5 / 5 x 10^k step and three to six intervals in all (0, −1K … −5K), never
    // the 1.25K or 1.5K steps a fixed four-interval split of a "nice" span gives
    const head = 1.12;
    const reach = Math.max(Math.abs(lo), Math.abs(hi), 1) * head;
    let tick = 1;
    for (const k of [1, 2, 2.5, 5, 10]) {
      tick = k * 10 ** Math.floor(Math.log10(reach / 5));
      if (Math.ceil((Math.abs(lo) * head) / tick) + Math.ceil((hi * head) / tick) <= (both ? 6 : 5)) break;
    }
    const yMin = lo < 0 ? -Math.ceil((Math.abs(lo) * head) / tick) * tick : 0;
    const yMax = hi > 0 ? Math.ceil((hi * head) / tick) * tick : yMin === 0 ? tick : 0;
    return {
      ...baseOption(theme),
      grid: { left: 46, right: 16, top: 24, bottom: 30 },
      xAxis: categoryAxis(theme, labs, { axisLabel: { color: theme.ink3, fontFamily: FONT, fontSize: fz(11.5), margin: 9, interval: (i: number) => i % 3 === 0, formatter: (v: string) => monthName(v) } }),
      yAxis: { ...valueAxis(theme, { min: yMin, max: yMax, usd }), interval: tick },
      tooltip: axisTooltip(theme, (items: TooltipItem[]) => {
        const k = items[0]?.dataIndex ?? 0;
        return `${ttHead(monthLong(labs[k]), "forecast")}${ttRow(theme.scenario, "scenario − base", fmtSigned(diff[k], measure, 2), "box")}${ttRow(theme.accent, "base forecast mean", fmtValue(sums.base[k], measure))}${ttRow(theme.scenario, "scenario mean", fmtValue(sums.scen[k], measure))}${ttEnd()}`;
      }),
      series: [
        {
          type: "bar",
          data: diff.map((d, k) => ({ value: d, label: { show: k === peakK && Math.abs(d) > 0.5, position: d < 0 ? "bottom" : "top", distance: 4, color: theme.ink2, fontFamily: FONT, fontSize: fz(11.5), formatter: () => fmtSigned(d, measure, 1) } })),
          barMaxWidth: BAR_MAX,
          itemStyle: { ...barStyle(theme.scenario), borderRadius: both ? 2 : lo < 0 ? [0, 0, 2, 2] : [2, 2, 0, 0] },
        },
      ],
    } as EChartsCoreOption;
  }, [sums, diff, m, theme, measure, usd, peakK]);

  if (res.loading && !res.data) return <Loading what="the model's sensitivities and forecast components" height={360} />;
  if (res.error || !res.data || !mf) return <ErrorState message={res.error ?? "macro.json or forecast_detail.json missing"} />;

  // ---- builder data ----------------------------------------------------------------------------------------------------
  const kd = mf.indicators.indexOf(draft.ind);
  const histVals = (mf.values[draft.ind] ?? []).slice(0, m.asOf + 1).filter((v): v is number => v !== null);
  const mu = histVals.reduce((a, b) => a + b, 0) / Math.max(1, histVals.length);
  const sd = Math.sqrt(histVals.reduce((a, b) => a + (b - mu) ** 2, 0) / Math.max(1, histVals.length));
  const lim = Math.max(1, Math.ceil(sd * 3));
  const step = lim > 10 ? 1 : 0.5;
  // reach in one unit everywhere: forecast series of the selection whose SKU x channel group carries a
  // sensitivity to the indicator (the same test runScenario applies), so the menu and the figure agree
  const linksBy = new Map<number, number>();
  {
    const keysBy = new Map<number, Set<string>>();
    const S = mf.sensitivity;
    for (let i = 0; i < S.sku.length; i++) {
      const set = keysBy.get(S.indicator[i]) ?? new Set<string>();
      set.add(`${S.sku[i]}|${S.channel_group[i]}`);
      keysBy.set(S.indicator[i], set);
    }
    const aftermarket = m.dims.channels.indexOf("Aftermarket");
    for (const [k, set] of keysBy) {
      let n = 0;
      for (const r of runs) {
        const ser = m.rSeries[r];
        if (set.has(`${m.sSku[ser]}|${m.sChannel[ser] === aftermarket ? "aftermarket" : "other"}`)) n++;
      }
      linksBy.set(k, n);
    }
  }
  const winMonths = Array.from({ length: m.nWin }, (_, k) => m.w0 + k);
  const custEvents = m.dims.events.id
    .map((_, i) => i)
    .filter((i) => m.dims.events.type[i] === "Customer Event" && m.dims.events.end[i] >= m.w0)
    .map((i) => m.dims.events.customer[i] ?? eventTitle(m.dims.events.description[i]));
  const fv = (v: number) => fmtValue(v, measure);
  const chgT = baseT > 0 ? scenT / baseT - 1 : NaN;
  const altB = sums ? sums.byFam.reduce((a, r) => a + (usd ? r.b : r.bu), 0) : 0;
  const altD = sums ? sums.byFam.reduce((a, r) => a + (usd ? r.s - r.b : r.su - r.bu), 0) : 0;

  return (
    <>
      <Lede
        headline={headline}
        standfirst={standfirst}
        figure={
          <HeroFigure
            label={`Scenario change, next ${m.nWin} months`}
            value={sums ? fmtSigned(scenT - baseT, measure, 2) : "–"}
            unit={usd ? undefined : "units"}
            visual={q && baseT > 0 ? <ScenarioStrip p10={q.p10} p90={q.p90} base={baseT} scen={scenT} format={fv} /> : undefined}
            context={baseT > 0 ? `**${fmtSignedPct(chgT)}** vs the base plan of ${fmtValueUnit(baseT, measure)} (forecast means)` : "No forecast rows in this selection."}
            info={{
              what: "Scenario minus base, summed over the 19 forecast months for the selection, on the forecast means (before rounding).",
              how: "Latent demand × exp(Σ β × Δindicator(t − lag)) per SKU and channel group, re-accumulated through each series' ordering cycle. The strip shows the base forecast's P10–P90 range for the 19-month total (orange band), the base (orange tick) and the scenario (violet tick).",
              source: "forecast_detail.json (latent_mean, accum, f_event), macro.json (sensitivity)",
            }}
          />
        }
      />

      <div className="cols-4-8">
        <Module
          title="Build a scenario"
          dek="Shift one indicator for a period of the window; each SKU responds after its own lag."
          info={{
            what: "A model-consistent what-if: the shift moves latent demand through the model's own per-SKU sensitivities and lags, then each series' ordering cycle turns it into orders. Off-phase, lost-account and post-EOL months stay zero.",
            how: "β and lag from the model's sensitivity table (one per SKU, channel group, indicator and lag); ordering-cycle spans and carry weights from the forecast file.",
            source: "macro.json (sensitivity), forecast_detail.json",
          }}
        >
          <div className="g2-builder">
            <div>
              <span className="caption" id="wi-presets">
                Presets
              </span>
              <div className="presets-list" role="group" aria-labelledby="wi-presets" style={{ marginTop: 6 }}>
                {PRESETS.map((p) => {
                  const s = presetScenario(m, p);
                  return (
                    <button key={p.label} type="button" className="g2-preset" aria-pressed={sameScenario(s, applied)} onClick={() => apply(s)}>
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <Select
              id="wi-ind"
              label="Indicator"
              value={draft.ind}
              onChange={(v) => setDraft({ ...draft, ind: v, shift: draft.ind === v ? draft.shift : 0 })}
              options={mf.indicators.map((k, i) => ({ value: k, label: `${indName(k)} (${fmtInt(linksBy.get(i) ?? 0)} series)` }))}
            />
            <p className="caption" style={{ marginTop: -6 }}>
              In brackets: how many of the {fmtInt(runs.length)} series with a forecast in view respond to the indicator.
            </p>
            <div className="g2-slider">
              <label className="top" htmlFor="wi-shift">
                <span>Shift, {IND[draft.ind]?.unit ?? "units of the indicator"}</span>
                <b>{draft.shift > 0 ? "+" : draft.shift < 0 ? "−" : ""}{Math.abs(draft.shift)}</b>
              </label>
              <input id="wi-shift" type="range" min={-lim} max={lim} step={step} value={draft.shift} onChange={(e) => setDraft({ ...draft, shift: Number(e.target.value) })} aria-valuetext={`${draft.shift} ${IND[draft.ind]?.unit ?? ""}`} />
              <span className="ends">
                <span>−{lim}</span>
                <span>history sd {sd.toFixed(1)}</span>
                <span>+{lim}</span>
              </span>
            </div>
            <div className="grid2">
              <Select id="wi-from" label="From" value={draft.start} onChange={(v) => setDraft({ ...draft, start: v })} options={winMonths.map((mm) => ({ value: mm, label: monthName(m.months[mm]) }))} />
              <Select id="wi-for" label="For" value={draft.months} onChange={(v) => setDraft({ ...draft, months: v })} options={[{ value: 0, label: "Rest of the window" }, ...[1, 2, 3, 6, 9, 12].map((n) => ({ value: n, label: `${n} month${n > 1 ? "s" : ""}` }))]} />
            </div>
            <label className="g2-check">
              <input type="checkbox" checked={draft.removeEvents} onChange={(e) => setDraft({ ...draft, removeEvents: e.target.checked })} />
              <span>Also remove the forecast's window events{custEvents.length ? ` (${custEvents.join(", ")})` : ""}</span>
            </label>
            <div className="actions">
              <Button variant="primary" disabled={!dirty} onClick={() => apply(draft)}>
                Apply scenario
              </Button>
              <Button onClick={() => apply({ ...draft, shift: 0, removeEvents: false })} disabled={applied.shift === 0 && !applied.removeEvents}>
                Back to base
              </Button>
              <span className="pending" aria-live="polite">
                {dirty ? "Changes not applied yet" : `Showing: ${name}`}
              </span>
            </div>
            {kd >= 0 && !linksBy.get(kd) && <Notice tone="warn">No series in this selection responds to {indName(draft.ind)}: none of its SKUs selected it as a driver, so a shift changes nothing.</Notice>}
          </div>
        </Module>

        <Module
          title={tlTitle}
          dek={`${usd ? "Revenue in USD" : "Units"} per month, ${rangeText}. The submitted forecast with its P10–P90 range, and the scenario's order mean after the shift.`}
          tools={<RangePresets value={range} options={rangePresets(m)} onChange={(v) => setParam({ tl: v === "window" ? null : v }, true)} />}
          info={{ what: "The base forecast and the scenario on the shared timeline.", how: "The scenario line is the sum of the recomputed order means; the base band is the aggregate P10–P90 of the submitted forecast.", source: "computed in the browser from forecast.json, forecast_detail.json, macro.json" }}
          keyItems={timelineKey({ latent: false, rebuilt: true, lost: true, columns: single !== null, present: markPresence(spec), extra: [{ kind: "line", color: "var(--scenario)", label: "Scenario" }] })}
        >
          {lens === "latent" && <Notice tone="info">The what-if works on orders as booked; the latent lens does not apply here.</Notice>}
          <TimelineChart
            spec={spec}
            annotate={annotate}
            height={360}
            ariaLabel={`${tlTitle}. ${name}.`}
            busy={res.loading}
            footnote={() =>
              ladder.final ? (
                <span>
                  The base forecast starts after the last actual, {monthName(m.months[m.asOf])}; it scores {fmtPct(ladder.final.wape)} WAPE over {ladder.origins} backtest origins (floor {ladder.floor !== null ? fmtPct(ladder.floor) : "–"}). The scenario moves its mean, not its error.
                </span>
              ) : null
            }
          />
        </Module>
      </div>

      {sums && q && (
        <FigureStrip columns={3}>
          <Figure
            label="P90 cover, 19-month total"
            value={fv(q.scen90)}
            unit={usd ? undefined : "units"}
            context={`**${fmtSigned(q.scen90 - q.p90, measure, 1)}** against the base P90 of ${fv(q.p90)} (${fmtSignedPct(q.p90 > 0 ? q.scen90 / q.p90 - 1 : 0)})`}
            link={{ label: "Procurement plan", onClick: () => go("procurement") }}
            info={{ what: "The P90 of the 19-month total under the scenario: what a P90 buyer would cover.", how: "Contract aggregate-quantile formula with the scenario's means; noise and level-error variances held at base.", source: "forecast.json, computed" }}
          />
          <Figure
            label={usd ? "Scenario change in units" : "Scenario change in revenue"}
            value={usd ? fmtSigned(altD, "units", 2) : fmtSigned(altD, "usd", 2)}
            unit={usd ? "units" : undefined}
            context={`**${fmtSignedPct(altB > 0 ? altD / altB : 0)}** of the base ${usd ? `${fmtNum(altB)} units` : fmtMoney(altB, 2)}${usd ? "" : ", at the forecast's prices"}`}
            info={{ what: usd ? "The same scenario in units: Σ scenario mean − Σ base mean over the 19 months." : "The same scenario in revenue: each row's change × the forecast's assumed invoice price for that row.", source: "forecast.json (price), computed" }}
          />
          <Figure
            label="Forecast rows changed"
            value={fmtInt(result?.changed ?? 0)}
            context={`of **${fmtInt(result?.rows ?? 0)}** rows in the selection; ${fmtInt(result?.linked ?? 0)} of the ${fmtInt(result?.series ?? 0)} series with a forecast respond to ${indName(applied.ind)}${applied.removeEvents ? " or carry an event" : ""}; scheduled zeros stay zero`}
            info={{ what: "Forecast rows (series × month) whose order mean changes.", how: "Rows with a zero mean (off-phase months, lost accounts, after EOL) are never touched." }}
          />
        </FigureStrip>
      )}

      {sums && (
        <div className="cols-7-5">
          <Module
            title={render(FAM_TEMPLATES.title, { rows: famRows }).text}
            dek={`Change in the 19-month order mean by family, units and revenue at the forecast's prices. Sorted by the relative change.`}
            info={{ what: "Where the scenario lands, family by family.", how: "Σ scenario mean − Σ base mean over the family's forecast rows in the selection; USD at each row's price.", source: "forecast.json, forecast_detail.json, macro.json" }}
          >
            <div ref={famRef}>
            <BarTable
              ariaLabel="Scenario impact by family"
              rows={famRows}
              rowKey={(r) => r.label}
              bar={{ value: (r) => r.pct, tone: "history", leader: (r) => r === topFam }}
              cols={[
                { key: "l", label: "Family", kind: "label", value: (r) => r.label, width: "33%" },
                { key: "b", label: "Change", kind: "bar" },
                { key: "p", label: "%", kind: "num", value: (r) => fmtSignedPct(r.pct), width: "13%" },
                { key: "d", label: "Units", kind: "num", value: (r) => fmtOnScale(r.d, dMax, "units", true), width: "13%" },
                ...(narrow ? [] : [{ key: "u", label: "USD", kind: "num" as const, value: (r: (typeof famRows)[number]) => fmtOnScale(r.du, duMax, "usd", true), width: "13%" }]),
              ]}
              total={{ l: "Selection", p: fmtSignedPct(chgT), d: fmtOnScale(sum(famRows.map((r) => r.d)), dMax, "units", true), ...(narrow ? {} : { u: fmtOnScale(sum(famRows.map((r) => r.du)), duMax, "usd", true) }) }}
            />
            </div>
          </Module>
          <Module
            title={render(BYMONTH_TEMPLATES.title, { first: facts.firstMonth, full: fullK >= 0 ? m.months[m.w0 + fullK] : null, measure }).text}
            dek={`Scenario minus base, ${usd ? "USD" : "units"} per forecast month, ${monthName(m.months[m.w0])} – ${monthName(m.months[m.nMonths - 1])}: lags delay the effect, ordering cycles make it lumpy.`}
            info={{ what: "The month-by-month difference between the scenario and the base order means.", how: "Each SKU's response arrives after its own lag; an order carries every latent month since the previous order.", source: "computed in the browser" }}
          >
            {!facts.nonZero ? (
              <Empty title="No month moves">The selection's SKUs carry no sensitivity to {indName(applied.ind)}. Pick another indicator in the builder, or clear the family filter.</Empty>
            ) : byMonth && <EChart option={byMonth} height={260} ariaLabel={`${render(BYMONTH_TEMPLATES.title, { first: facts.firstMonth, full: fullK >= 0 ? m.months[m.w0 + fullK] : null, measure }).text}.`} />}
          </Module>
        </div>
      )}

      <aside className="colophon" aria-label="Method">
        <span>
          <b>Response</b> latent × exp(Σ β · Δindicator(t − lag)) per SKU and channel group
        </span>
        <span>
          <b>Orders</b> re-accumulated through each series' ordering cycle
        </span>
        <span>
          <b>Base</b> the submitted forecast's means, {usd ? fmtMoney(baseT, 2) : `${fmtNum(baseT)} units`}
        </span>
        <span>
          <b>Scenario</b> {name}
        </span>
      </aside>
    </>
  );
}
