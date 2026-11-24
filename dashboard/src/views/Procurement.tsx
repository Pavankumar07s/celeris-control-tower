// O3 Procurement plan (act): gross requirements and safety stock from the forecast's own uncertainty.
//  lede (computed headline + standfirst | hero: safety-stock value of the first cover, with the pooled
//  against summed-monthly ladder)
//  -> the plan sentence ("Cover a [3-month] lead time at a [P90] service level")
//  -> mean plus buffer by month (orange mean, tint buffer, the first cover marked) | safety stock by lead
//     time (pooled against summed monthly quantiles: the methodological signature)
//  -> safety stock by SKU (ledger, drill to a SKU) -> method colophon.
// In-view state lives in the URL hash: sl=<service level> lt=<lead time in months>.
import { useMemo } from "react";
import type { EChartsCoreOption } from "echarts/core";
import { useApp } from "../app/context";
import { useSelection, useMedia } from "../app/hooks";
import { EChart } from "../charts/EChart";
import { axisTooltip, BAR_MAX, baseOption, barStyle, categoryAxis, FONT, gridStd, niceMax, ttEnd, ttHead, ttNote, ttRow, valueAxis } from "../charts/theme";
import { Button, Segmented, Stepper } from "../components/controls";
import { HeroFigure, Ladder, Lede } from "../components/Figure";
import { Module } from "../components/Module";
import { Info } from "../components/overlays";
import { DataTable, InlineBar, type Column } from "../components/tables";
import { fmtInt, fmtMoney, fmtNum, fmtPct, monthLong, monthName, monthSpan } from "../data/format";
import { render } from "../insights/headlines";
import { CURVE_TEMPLATES, LEAD_MAX, LEVELS, MONTHLY_TEMPLATES, PLAN_TEMPLATES, planFacts, procurementPlan, SKU_TEMPLATES, type SkuCover } from "../insights/procurement";
import "./g3/procurement.css";

export default function Procurement() {
  const { m, theme: t, measure, params, setParam, filters, setFilters } = useApp();
  const { runs } = useSelection();
  const narrow = useMedia("(max-width: 700px)");
  const usd = measure === "usd";
  const slParam = params.get("sl");
  const level = LEVELS.find((l) => l.value === slParam) ?? LEVELS[1];
  const lt = Number(params.get("lt"));
  const L = Number.isInteger(lt) && lt >= 1 && lt <= LEAD_MAX ? lt : 3;
  const label = level.label;
  // calibration behind every buffer: share of backtest monthly actuals at or below the series P90 (meta.uncertainty)
  const p90Held = useMemo(() => {
    const cov = (m.meta.uncertainty as { coverage?: { monthly?: { series?: { above_p90?: number } } } }).coverage;
    const above = cov?.monthly?.series?.above_p90;
    return typeof above === "number" ? 1 - above : null;
  }, [m]);
  const setLevel = (v: string) => setParam({ sl: v === "0.9" ? null : v }, true);
  const setLead = (v: number) => setParam({ lt: v === 3 ? null : String(v) }, true);

  const plan = useMemo(() => procurementPlan(m, runs, Number(level.value), L), [m, runs, level.value, L]);
  const facts = useMemo(() => planFacts(m, plan, L, label), [m, plan, L, label]);
  const headline = render(PLAN_TEMPLATES.headline, facts).text;
  const standfirst = render(PLAN_TEMPLATES.standfirst, facts).text;
  const tot = plan.tot;
  const fv = (v: number) => (usd ? fmtMoney(v) : fmtNum(v));
  const fvu = (v: number) => (usd ? fmtMoney(v) : `${fmtNum(v)} units`);
  const has = tot.meanU > 0;
  const winSpan = `${monthName(m.months[m.w0])} – ${monthName(m.months[m.nMonths - 1])}`;

  // ---- mean plus buffer by month
  const monthly = useMemo(() => {
    const labels = Array.from({ length: m.nWin }, (_, k) => m.months[m.w0 + k]);
    const meanV = plan.monthly.mean.map((p) => (usd ? p.d : p.u));
    const bufV = plan.monthly.buf.map((p) => (usd ? p.d : p.u));
    const tops = meanV.map((v, k) => v + bufV[k]);
    let peak = 0;
    tops.forEach((v, k) => v > tops[peak] && (peak = k));
    const meanSum = meanV.reduce((a, b) => a + b, 0);
    const bufSum = bufV.reduce((a, b) => a + b, 0);
    return { labels, meanV, bufV, tops, peak, meanSum, share: meanSum > 0 ? bufSum / meanSum : 0 };
  }, [m, plan, usd]);
  const monthlyTitle = render(MONTHLY_TEMPLATES.title, { label, share: monthly.share, peak: monthly.meanSum > 0 ? monthly.labels[monthly.peak] : null, peakValue: fvu(monthly.tops[monthly.peak]), meanSum: monthly.meanSum }).text;
  const H1 = 300;
  const monthlyOpt = useMemo<EChartsCoreOption>(() => {
    const { labels, meanV, bufV, tops, peak } = monthly;
    const yMax = niceMax(Math.max(1, ...tops) * 1.12);
    const grid = gridStd(narrow, { right: 14, top: 34 });
    const plotH = H1 - grid.top - grid.bottom;
    const gap = (2 * yMax) / plotH; // a 2px paper gap between the mean and its buffer
    return {
      ...baseOption(t),
      grid,
      xAxis: categoryAxis(t, labels, { axisLabel: { color: t.ink3, fontFamily: FONT, fontSize: 11.5, margin: 9, interval: narrow ? 5 : 2, formatter: (v: string) => monthName(v).replace(" 20", " ’") } }),
      yAxis: valueAxis(t, { max: yMax, usd }),
      tooltip: axisTooltip(t, (items) => {
        const k = items[0]?.dataIndex ?? 0;
        return ttHead(monthLong(labels[k]), "forecast") + ttRow(t.ink, `${label}, one-month cover`, fvu(tops[k])) + ttRow(t.accent, `buffer to ${label}`, fvu(bufV[k]), "box") + ttRow(t.accentTint, "mean demand", fvu(meanV[k]), "box") + ttEnd();
      }),
      series: [
        {
          name: "First cover",
          type: "custom",
          data: [[0, L - 1]],
          silent: true,
          z: 0,
          renderItem: (params: { coordSys: { x: number; y: number; width: number; height: number } }, api: { value: (d: number) => number; coord: (v: number[]) => number[]; size: (v: number[]) => number[] }) => {
            const bw = api.size([1, 0])[0];
            const x0 = api.coord([api.value(0), 0])[0] - bw / 2;
            const x1 = api.coord([api.value(1), 0])[0] + bw / 2;
            const c = params.coordSys;
            return {
              type: "group",
              children: [
                { type: "rect", shape: { x: x0, y: c.y, width: x1 - x0, height: c.height }, style: { fill: t.hover } },
                { type: "text", style: { x: x0 + 2, y: c.y - 8, text: L === 1 ? "First cover" : `First ${L}-month cover`, fill: t.ink2, font: `600 11.5px ${FONT}`, textVerticalAlign: "bottom" } },
              ],
            };
          },
        },
        // the story is the buffer: it carries the forecast orange, the mean it sits on recedes to the tint
        { name: "Mean demand", type: "bar", stack: "q", data: meanV, barMaxWidth: BAR_MAX, itemStyle: { color: t.accentTint, borderRadius: 0 }, z: 3 },
        { name: "gap", type: "bar", stack: "q", data: meanV.map((v) => (v > 0 ? gap : 0)), barMaxWidth: BAR_MAX, itemStyle: { color: "rgba(0,0,0,0)" }, silent: true, z: 3 },
        {
          name: `Buffer to ${label}`,
          type: "bar",
          stack: "q",
          barMaxWidth: BAR_MAX,
          data: bufV.map((v, k) => ({ value: v, label: { show: k === peak && v > 0, position: "top", distance: 5, color: t.ink2, fontFamily: FONT, fontSize: 11.5, fontWeight: 600, formatter: () => fv(tops[k]) } })),
          itemStyle: barStyle(t.accent),
          z: 3,
        },
      ],
    };
  }, [monthly, t, narrow, usd, label, L]);

  // ---- safety stock by lead time: pooled against summed monthly quantiles
  const curve = useMemo(() => {
    const pooled = plan.curve.map((c) => (usd ? c.buf.d : c.buf.u));
    const naive = plan.curve.map((c) => (usd ? c.naive.d : c.naive.u));
    const pct = plan.curve.map((c) => (c.naive.d > 0 ? (c.naive.d - c.buf.d) / c.naive.d : 0));
    return { pooled, naive, pct };
  }, [plan, usd]);
  const curveTitle = render(CURVE_TEMPLATES.title, { label, pct: curve.pct }).text;
  const curveOpt = useMemo<EChartsCoreOption>(() => {
    const xs = plan.curve.map((c) => (c.L === 1 ? "1 month" : `${c.L} months`));
    const { pooled, naive, pct } = curve;
    const yMax = niceMax(Math.max(1, ...naive, ...pooled) * 1.12);
    const end = { show: true, color: t.ink2, fontFamily: FONT, fontSize: 11.5, distance: 8 };
    return {
      ...baseOption(t),
      grid: { left: narrow ? 40 : 46, right: narrow ? 78 : 96, top: 24, bottom: 30 },
      xAxis: categoryAxis(t, xs, { boundaryGap: false, axisLabel: { color: t.ink3, fontFamily: FONT, fontSize: 11.5, margin: 9, interval: 0, formatter: (v: string) => `${v.split(" ")[0]} mo` } }),
      yAxis: valueAxis(t, { max: yMax, usd }),
      tooltip: axisTooltip(t, (items) => {
        const k = items[0]?.dataIndex ?? 0;
        return (
          ttHead(`Lead time ${xs[k]}`, `from ${monthName(m.months[m.w0])}`) +
          ttRow(t.ink3, `summed monthly ${label}s`, fvu(naive[k]), "dash") +
          ttRow(t.accent, `${label} of the ${k + 1}-month total`, fvu(pooled[k])) +
          (k > 0 ? ttNote(`Pooling saves ${fvu(naive[k] - pooled[k])}, ${fmtPct(pct[k], 0)} of the summed buffer`) : ttNote("One month: both methods agree")) +
          ttEnd()
        );
      }),
      series: [
        { name: "Summed monthly", type: "line", data: naive, symbol: "none", lineStyle: { color: t.ink3, width: 1.5, type: [4, 3] }, endLabel: { ...end, formatter: "Summed" }, z: 2 },
        {
          name: "Pooled",
          type: "line",
          symbol: "circle",
          showSymbol: true,
          data: pooled.map((v, k) => ({
            value: v,
            symbolSize: k + 1 === L ? 12 : 7,
            itemStyle: k + 1 === L ? { color: t.orange, borderColor: t.paper, borderWidth: 2 } : { color: t.accent, borderColor: t.paper, borderWidth: 1.5 },
            label: { show: k + 1 === L && k > 0, position: "bottom", distance: 9, color: t.ink, fontFamily: FONT, fontSize: 11.5, fontWeight: 600, formatter: () => `saves ${fv(naive[k] - pooled[k])}` },
          })),
          lineStyle: { color: t.accent, width: 2 },
          endLabel: { ...end, formatter: "Pooled" },
          z: 3,
        },
      ],
    };
  }, [plan, curve, t, narrow, usd, label, L, m]);

  // ---- by SKU
  const half = useMemo(() => {
    let acc = 0;
    for (let k = 0; k < plan.skus.length; k++) {
      acc += plan.skus[k].bufD;
      if (acc >= tot.bufD / 2) return k + 1;
    }
    return plan.skus.length;
  }, [plan, tot.bufD]);
  const skuTitle = render(SKU_TEMPLATES.title, { n: plan.skus.length, half, total: tot.bufD, oneSku: facts.oneSku, oneBufU: tot.bufU }).text;
  const maxD = plan.skus.length ? plan.skus[0].bufD : 1;
  const cols: Column<SkuCover>[] = [
    { key: "sku", label: "SKU", value: (r) => m.dims.skus.id[r.sku], id: true },
    { key: "desc", label: "Description", value: (r) => m.dims.skus.description[r.sku] ?? "", render: (r) => <span className="g3-ellip">{m.dims.skus.description[r.sku] ?? "–"}</span> },
    { key: "reg", label: "Regions", value: (r) => r.regions, num: true },
    { key: "mean", label: `Mean, ${L} mo`, value: (r) => Math.round(r.meanU), render: (r) => fmtInt(r.meanU), num: true },
    { key: "bufU", label: "Buffer, units", value: (r) => Math.round(r.bufU), render: (r) => fmtInt(r.bufU), num: true },
    { key: "bufD", label: "Buffer value", value: (r) => Math.round(r.bufD), render: (r) => <InlineBar value={r.bufD} max={maxD} label={fmtMoney(r.bufD)} lead={r === plan.skus[0]} width={72} />, num: true, fc: true },
    { key: "pct", label: "Buffer / mean", value: (r) => (r.meanU > 0 ? Math.round((r.bufU / r.meanU) * 1000) / 1000 : null), render: (r) => (r.meanU > 0 ? fmtPct(r.bufU / r.meanU) : "–"), num: true },
  ];

  const levelInfo = (
    <Info
      what="The service level is the share of covers that should not run out: P90 holds enough stock for nine covers in ten."
      how="Pick it as the newsvendor critical ratio cu / (cu + co), the cost of a stock-out against the cost of carrying one unit too many. Orders are booked two to three months ahead, hence the default three-month lead time."
      source="forecast.json (mean, noise variance, level and family × region errors)"
      align="left"
    />
  );

  return (
    <>
      <Lede
        headline={headline}
        standfirst={standfirst}
        figure={
          <HeroFigure
            label={`Safety stock, ${L === 1 ? monthName(m.months[m.w0]) : monthSpan(m.months[m.w0], m.months[m.w0 + L - 1])}`}
            value={fmtMoney(tot.bufD)}
            visual={
              has && L > 1 ? (
                <Ladder
                  rows={[
                    { label: `Summed monthly ${label}s`, value: tot.naiveD },
                    { label: `${label} of the ${L}-month total`, value: tot.bufD, me: true },
                  ]}
                  max={Math.max(tot.naiveD, tot.bufD) * 1.04}
                  format={(v) => fmtMoney(v)}
                />
              ) : undefined
            }
            context={has ? `**${fmtNum(tot.bufU)} units** above a ${fmtNum(tot.meanU)}-unit mean, ${fmtPct(tot.meanU > 0 ? tot.bufU / tot.meanU : 0)} on top; at forecast prices` : "Nothing to cover in this selection."}
            info={{
              what: `The value of the safety stock the first order needs: for each SKU, the ${label} of its demand over ${L === 1 ? "the first forecast month" : `the first ${L} forecast months`} minus the mean, at forecast prices, summed over SKUs. The ladder compares it with stacking the monthly ${label} buffers.`,
              how: "Each SKU pools the regions of the selection into one stock; SKUs are never pooled with each other. Quantiles come from the contract's lognormal aggregate: means and shared errors are summed before the quantile.",
              source: "forecast.json",
            }}
          />
        }
      />

      <section className="g3-plan" aria-label="Plan settings">
        <span className="g3-plan-text">Cover a</span>
        <Stepper value={L} min={1} max={LEAD_MAX} onChange={setLead} label="Lead time" format={(v) => (v === 1 ? "1 month" : `${v} months`)} />
        <span className="g3-plan-text">lead time at a</span>
        <Segmented ariaLabel="Service level" value={level.value} onChange={setLevel} options={LEVELS.map((l) => ({ value: l.value, label: l.label }))} />
        <span className="g3-plan-text">service level.</span>
        {levelInfo}
      </section>

      {has ? (
        <div className="cols-7-5">
          <Module
            title={monthlyTitle}
            dek={`${usd ? "Revenue" : "Units"} per forecast month, ${winSpan}: mean demand and the buffer each SKU needs to reach ${label} in that month alone, summed over SKUs. The washed months are the first ${L === 1 ? "cover" : `${L}-month cover`}.`}
            keyItems={[
              { kind: "box", color: "var(--accent-tint)", label: "Mean demand" },
              { kind: "box", color: "var(--accent)", label: `Buffer to ${label}` },
              { kind: "box", color: "var(--hover)", label: "First cover" },
            ]}
            info={{
              what: `Per forecast month: the mean of the selection and the buffer up to ${label}, one-month cover per SKU, regions pooled.`,
              how: "Buffer = quantile − mean of each SKU's month, from the contract's lognormal aggregate; summed over SKUs because parts cannot stand in for each other.",
              source: "forecast.json",
            }}
            foot={`Gross requirements only: no inventory positions are provided. The forecast starts after the last actual, ${monthName(m.months[m.asOf])}${p90Held !== null ? `; in the backtest ${fmtPct(p90Held)} of monthly series actuals stayed at or below their P90 (target 90%)` : ""}.`}
          >
            <EChart option={monthlyOpt} height={H1} ariaLabel={`${monthlyTitle}. Mean demand in light orange and the buffer to ${label} in orange on top, per month, ${winSpan}.`} />
          </Module>
          <Module
            title={curveTitle}
            dek={`Safety stock for one cover starting ${monthName(m.months[m.w0])}, by lead time, ${usd ? "USD" : "units"}. Solid: the ${label} of the lead-time total; dashed: the monthly ${label} buffers stacked. Click a lead time to plan with it.`}
            keyItems={[
              { kind: "line", color: "var(--accent)", label: `${label} of the total (pooled)` },
              { kind: "dash", color: "var(--ink-3)", label: `Summed monthly ${label}s` },
            ]}
            info={{
              what: "Why quantiles do not add: the band of a total is narrower than the sum of the monthly bands, because independent noise partly cancels. The gap is stock bought for nothing.",
              how: "For L = 1 to 6 months: Σ over SKUs of (P of the L-month total − its mean), against Σ over SKUs and months of (monthly P − monthly mean). The shared level and family × region errors do not cancel, so the saving stays honest.",
              source: "forecast.json",
            }}
          >
            <EChart option={curveOpt} height={H1} onXClick={(i) => setLead(Math.min(LEAD_MAX, Math.max(1, i + 1)))} ariaLabel={`${curveTitle}. Safety stock by lead time from one to ${LEAD_MAX} months, pooled against summed monthly quantiles.`} />
          </Module>
        </div>
      ) : (
        <Module title="Nothing to plan for this selection" dek="The account is lost, or the SKU has no forecast in the window: there is no demand to cover.">
          <Button size="sm" onClick={() => setFilters({ ...filters, sku: null, customer: null })}>
            Clear the SKU and customer filters
          </Button>
        </Module>
      )}

      {has && (
        <Module
          title={skuTitle}
          dek={`Every SKU in view ranked by the value of its safety stock for the first ${L === 1 ? "month" : `${L} months`} at ${label}; regions pooled into one stock per SKU.${plan.skus.length > 1 ? " Click a SKU to plan it alone." : ""}`}
          info={{
            what: "Where the safety-stock money goes: per SKU, the mean demand over the cover, the buffer in units and at forecast prices, and the buffer as a share of the mean (the SKU's relative uncertainty).",
            how: "Per SKU, moments of the cover total over its runs in the selection; quantile from the lognormal aggregate.",
            source: "forecast.json",
          }}
        >
          <DataTable
            rows={plan.skus}
            cols={cols}
            pageSize={10}
            initialSort={{ key: "bufD", desc: true }}
            csvName={`procurement_${label}_${L}m.csv`}
            onRow={(r) => setFilters({ ...filters, family: m.skuFamily[r.sku], sku: r.sku })}
            ariaLabel="Safety stock by SKU"
          />
        </Module>
      )}

      <aside className="colophon" aria-label="Method">
        <span>
          <b>Safety stock</b> quantile of the cover total minus its mean, per SKU
        </span>
        <span>
          <b>Quantiles</b> the contract&rsquo;s lognormal aggregate, never summed row quantiles
        </span>
        <span>
          <b>Pooling</b> over months and regions, never across SKUs
        </span>
        <span>
          <b>Gross requirements</b> no inventory positions are provided
        </span>
      </aside>
    </>
  );
}
