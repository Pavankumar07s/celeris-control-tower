// View-level components of Forecast & accuracy and What-if: the forecast-value-added steps, calibration 100 %
// bars, the aggregation dumbbell and the scenario strip.  HTML, not canvas, so text stays crisp and every number
// is in the DOM (accessible).
import { Fragment } from "react";
import { fmtPct, fmtPts, fmtSignedPct } from "../../data/format";
import type { CalRow } from "../../insights/accuracy";
import "./g2.css";

/** Forecast value added: each step's WAPE as a bar against the in-hindsight floor (a vertical ink hairline). */
export function FvaSteps({ steps, floor, ariaLabel }: { steps: { md: string; label: string; w: number; b: number; me?: boolean }[]; floor: number; ariaLabel: string }) {
  const max = Math.max(...steps.map((s) => s.w), Number.isFinite(floor) ? floor : 0) * 1.04 || 1;
  const fx = Number.isFinite(floor) ? (floor / max) * 100 : null;
  return (
    <div className="g2-fva" role="table" aria-label={ariaLabel}>
      <div role="row" style={{ display: "contents" }}>
        <span className="h l" role="columnheader">Step</span>
        <span className="h l" role="columnheader">WAPE</span>
        <span className="h" role="columnheader">Value added</span>
        <span className="h" role="columnheader">Bias</span>
      </div>
      {steps.map((s, i) => (
        <div role="row" key={s.md} style={{ display: "contents" }}>
          <span className={`c l ${s.me ? "me" : ""}`} role="cell">
            {s.label}
          </span>
          <span className="c" role="cell" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="track" style={{ flex: "1 1 auto" }} aria-hidden="true">
              <i className={s.me ? "me" : ""} style={{ width: `${(s.w / max) * 100}%` }} />
              {fx !== null && <span className="floor" style={{ left: `${fx}%` }} />}
            </span>
            <b style={{ fontWeight: s.me ? 600 : 500, color: "var(--ink)", minWidth: 42 }}>{fmtPct(s.w)}</b>
          </span>
          <span className={`c ${s.me ? "me" : ""}`} role="cell">
            {i === 0 ? "–" : fmtPts(steps[i - 1].w - s.w)}
          </span>
          <span className="c" role="cell">
            {fmtSignedPct(s.b)}
          </span>
        </div>
      ))}
      {fx !== null && (
        <span className="floor-lab" aria-hidden="true">
          <span style={{ left: `calc(${fx}% * 0.82)` }}>floor {fmtPct(floor)}</span>
        </span>
      )}
    </div>
  );
}

const CAL_LABEL: Record<string, [string, string]> = {
  series: ["Series", "SKU × region × channel"],
  sku: ["SKU", "all regions summed"],
  family_region: ["Family × region", "42 cells"],
  total: ["Total", "all series summed"],
};

/** 100 % bars: below P10 | inside P10–P90 | above P90, with dashed target ticks at 10 % and 90 %. */
export function CalBars({ rows }: { rows: CalRow[] }) {
  return (
    <div className="g2-cal">
      {rows.map((r) => (
        <div className="row" key={r.level} role="img" aria-label={`${CAL_LABEL[r.level]?.[0] ?? r.level}: ${fmtPct(r.below)} below P10, ${fmtPct(r.inside)} inside, ${fmtPct(r.above)} above P90 (target 10 / 80 / 10)`}>
          <span className="who">
            {CAL_LABEL[r.level]?.[0] ?? r.level}
            <small>{r.n.toLocaleString("en-US")} monthly actuals</small>
          </span>
          <span>
            <span className="bar">
              <i className="out" style={{ width: `${r.below * 100}%` }} />
              <i className="in" style={{ width: `${r.inside * 100}%` }} />
              <i className="out" style={{ width: `${r.above * 100}%` }} />
              <span className="tgt" style={{ left: "10%" }} />
              <span className="tgt" style={{ left: "90%" }} />
            </span>
            <span className="nums" style={{ marginTop: 4 }}>
              <span>
                <b>{fmtPct(r.below)}</b> below
              </span>
              <span>
                <b>{fmtPct(r.inside)}</b> inside
              </span>
              <span>
                <b>{fmtPct(r.above)}</b> above
              </span>
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

/** Dumbbell: benchmark (hollow ink-3) -> our model (orange) per row, on one shared 0..max scale. */
export function Dumbbell({ rows, max, baseLabel }: { rows: { label: string; base: number; ours: number }[]; max: number; baseLabel: string }) {
  const x = (v: number) => `${(v / max) * 100}%`;
  return (
    <div className="g2-dumb">
      {rows.map((r) => {
        const lo = Math.min(r.base, r.ours);
        const hi = Math.max(r.base, r.ours);
        return (
          <Fragment key={r.label}>
            <span className="who">{r.label}</span>
            <span className="lane" role="img" aria-label={`${r.label}: ${baseLabel} ${fmtPct(r.base)}, our model ${fmtPct(r.ours)}`}>
              <span className="ln" style={{ left: x(lo), width: `${((hi - lo) / max) * 100}%` }} />
              <span className="dot b" style={{ left: x(r.base) }} />
              <span className="dot f" style={{ left: x(r.ours) }} />
              <span className="v f" style={{ left: `calc(${x(r.ours)} - 44px)`, width: 36, textAlign: "right" }}>
                {fmtPct(r.ours)}
              </span>
              <span className="v" style={{ left: `calc(${x(r.base)} + 9px)` }}>
                {fmtPct(r.base)}
              </span>
            </span>
          </Fragment>
        );
      })}
      <span className="axis">
        <span>0%</span>
        <span>{fmtPct(max, 0)}</span>
      </span>
    </div>
  );
}

/** Scenario strip: the base forecast's P10–P90 band (orange), the base tick (orange) and the scenario tick
 *  (violet).  Labels sit at the two ends of the track so they never collide. */
export function ScenarioStrip({ p10, p90, base, scen, format }: { p10: number; p90: number; base: number; scen: number; format: (v: number) => string }) {
  const vals = [p10, p90, base, scen].filter(Number.isFinite);
  const a = Math.min(...vals);
  const z = Math.max(...vals);
  const pad = (z - a) * 0.12 || Math.abs(z) * 0.02 || 1;
  const lo = a - pad;
  const hi = z + pad;
  const x = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`;
  const scenLeft = scen < (p10 + p90) / 2;
  return (
    <div className="g2-sstrip" role="img" aria-label={`Base P10–P90 ${format(p10)} to ${format(p90)}; base ${format(base)}; scenario ${format(scen)}`}>
      <div className="track" />
      <div className="band" style={{ left: x(p10), width: `${((p90 - p10) / (hi - lo)) * 100}%` }} />
      <div className="tick base" style={{ left: x(base) }} />
      <div className="tick scen" style={{ left: x(scen) }} />
      <span className={`lab ${scenLeft ? "l" : "r"}`}>
        Scenario <b>{format(scen)}</b>
      </span>
      <span className={`lab ${scenLeft ? "r" : "l"}`}>
        Base P10–P90 <b>{format(p10)}–{format(p90)}</b>
      </span>
    </div>
  );
}
