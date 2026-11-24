// Forecast X-ray: why one forecast month is what it is, for the current selection.  The waterfall of
// base level x season x holiday x macro x EV shift x lifecycle x event = latent demand, then cycle placement
// and rounding, drawn as a bar table: every step labelled with its multiplier and its signed change in units,
// a diverging bar per step (so a 3 % step stays visible next to a 150K base), the submitted total in the foot.
import { useMemo } from "react";
import { BarTable } from "../../components/tables";
import { fmtSigned, fmtValue, monthLong, monthName } from "../../data/format";
import type { Measure, Model } from "../../data/model";
import type { ForecastDetail } from "../../data/types";
import type { Template } from "../../insights/headlines";
import { Select } from "../../components/controls";

const FACTORS = ["level", "f_season", "f_holiday", "f_macro", "f_ev", "f_lifecycle", "f_event"] as const;
const STEP = ["Base level", "× season", "× holiday", "× macro", "× EV shift", "× lifecycle", "× event", "Cycle placement", "Rounding"];
const NOUN = ["the base level", "seasonality", "holidays", "the macro outlook", "the EV shift", "lifecycle", "window events", "the ordering cycle", "rounding"];

export interface XRayStep {
  label: string;
  noun: string;
  value: number; // running total after the step
  delta: number; // change in the measure (base level: its own value)
  mult: number | null;
}

/** First window month with a forecast for the selection (the default X-ray month). */
export function firstForecastMonth(m: Model, runs: number[]): number {
  for (let k = 0; k < m.nWin; k++)
    for (const r of runs) {
      const kk = m.w0 + k - m.rStart[r];
      if (kk >= 0 && kk < m.rLen[r] && m.fc[m.rOff[r] + kk] > 0) return m.w0 + k;
    }
  return m.w0;
}

export function xraySteps(m: Model, runs: number[], d: ForecastDetail, month: number, usd: boolean): { steps: XRayStep[]; submitted: number; latent: number } {
  const cum = new Float64Array(FACTORS.length);
  let latent = 0;
  let mean = 0;
  let sub = 0;
  for (const r of runs) {
    const k = month - m.rStart[r];
    if (k < 0 || k >= m.rLen[r]) continue;
    const i = m.rOff[r] + k;
    const w = usd ? m.price[i] : 1;
    let x = w;
    FACTORS.forEach((nm, j) => {
      x *= d.factors[nm][i];
      cum[j] += x;
    });
    latent += w * d.latent_mean[i];
    mean += w * m.mean[i];
    sub += w * m.fc[i];
  }
  const steps: XRayStep[] = [];
  const vals = [...Array.from(cum), mean, sub];
  vals.forEach((v, j) => {
    const prev = j === 0 ? 0 : vals[j - 1];
    steps.push({ label: STEP[j], noun: NOUN[j], value: v, delta: j === 0 ? v : v - prev, mult: j === 0 || j === vals.length - 1 || !(prev > 0) ? null : v / prev });
  });
  return { steps, submitted: sub, latent };
}

export const XRAY_TEMPLATE: Template<{ month: string; steps: XRayStep[]; measure: Measure }> = {
  id: "forecast.xray",
  when: (x) => x.steps.length > 2 && x.steps[0].value > 0,
  text: (x) => {
    const moves = x.steps.slice(1, -1);
    const big = moves.reduce((a, b) => (Math.abs(b.delta) > Math.abs(a.delta) ? b : a));
    if (Math.abs(big.delta) < 0.005 * x.steps[0].value) return `In ${monthLong(x.month)} the forecast stays within 0.5% of its base level`;
    return `In ${monthLong(x.month)}, ${big.noun} ${big.delta > 0 ? "lifts" : "cuts"} the forecast most: ${fmtSigned(big.delta, x.measure, 1)}${x.measure === "units" ? " units" : ""}`;
  },
  fallback: (x) => `Why the ${monthLong(x.month)} forecast is what it is`,
};

export function XRay({ m, runs, detail, month, onMonth, measure }: { m: Model; runs: number[]; detail: ForecastDetail; month: number; onMonth: (month: number) => void; measure: Measure }) {
  const usd = measure === "usd";
  const x = useMemo(() => xraySteps(m, runs, detail, month, usd), [m, runs, detail, month, usd]);
  const rows = x.steps;
  const lead = useMemo(() => {
    const moves = rows.slice(1);
    return moves.length ? moves.reduce((a, b) => (Math.abs(b.delta) > Math.abs(a.delta) ? b : a)) : null;
  }, [rows]);
  const fv = (v: number) => fmtValue(v, measure, 2);
  const sg = (v: number) => fmtSigned(Math.abs(v) < 0.5 ? 0 : v, measure, 1);
  return (
    <div>
      <div className="g2-ctl">
        <Select
          id="xray-month"
          inline
          label="Month"
          value={month}
          onChange={onMonth}
          options={Array.from({ length: m.nWin }, (_, k) => ({ value: m.w0 + k, label: monthName(m.months[m.w0 + k]) }))}
        />
        <span className="caption">or click a forecast month on the timeline</span>
      </div>
      <div style={{ marginTop: 8 }}>
        <BarTable
          ariaLabel={`Forecast X-ray for ${monthName(m.months[month])}`}
          rows={rows}
          rowKey={(r) => r.label}
          bar={{ value: (r) => (r.label === STEP[0] ? 0 : r.delta), tone: "forecast", leader: (r) => r === lead }}
          cols={[
            { key: "s", label: "Step", kind: "label", value: (r) => r.label, width: "30%" },
            { key: "x", label: "Factor", kind: "num", value: (r) => (r.mult === null ? "" : `×${r.mult.toFixed(3)}`), width: "17%" },
            { key: "b", label: "Change", kind: "bar" },
            { key: "d", label: usd ? "USD" : "Units", kind: "num", value: (r) => (r.label === STEP[0] ? fv(r.value) : sg(r.delta)), width: "18%" },
          ]}
          total={{ s: "Forecast", d: fv(x.submitted) }}
        />
      </div>
      <p className="bt-note">
        Latent demand {fv(x.steps[6]?.value ?? 0)} becomes an order mean of {fv(x.steps[7]?.value ?? 0)} once each series' ordering cycle places it; rounding to whole units gives the submitted {fv(x.submitted)}.
      </p>
    </div>
  );
}
