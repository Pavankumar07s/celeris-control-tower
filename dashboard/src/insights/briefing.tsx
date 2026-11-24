// Deterministic planner briefing: templated sentences over facts computed from the bundle for the current filters.
// No language model and no typed numbers: every figure below is an expression over pipeline data.
import type { ReactNode } from "react";
import type { ForecastAgg, HistoryAgg } from "../data/aggregate";
import { sum } from "../data/aggregate";
import { compact, fmtInt, fmtPct, fmtSignedPct, fmtUsd, monthName } from "../data/format";
import { seriesMatches, type Filters, type Measure, type Model } from "../data/model";
import type { ExceptionFile } from "../data/types";

export interface BriefItem {
  icon: string;
  text: ReactNode;
}

interface Ctx {
  m: Model;
  filters: Filters;
  measure: Measure;
  h: HistoryAgg; // units
  fc: ForecastAgg; // units
  runs: number[];
  mixes: { dim: "family" | "region" | "channel"; labels: string[]; last: number[]; next: number[] }[];
  exc: ExceptionFile | null;
  lost: { u: number; usd: number } | null;
  go: (view: string, patch?: Record<string, string | null>) => void;
  setFilters: (f: Filters) => void;
}

/** Exception rows inside the selection (series rows by series attributes; segment rows by family x region). */
export function exceptionRowsIn(m: Model, f: Filters, e: ExceptionFile): number[] {
  const out: number[] = [];
  for (let i = 0; i < e.rule.length; i++) {
    const s = e.series[i];
    if (s >= 0) {
      if (seriesMatches(m, s, f) && (f.customer === null || m.sCustomer[s] === f.customer)) out.push(i);
    } else if ((f.family === null || f.family === e.family[i]) && (f.region === null || f.region === e.region[i]) && f.sku === null && f.channel === null && f.customer === null) {
      out.push(i);
    }
  }
  return out;
}

const Link = ({ onClick, children }: { onClick: () => void; children: ReactNode }) => (
  <button type="button" className="btn link" onClick={onClick}>
    {children}
  </button>
);

export function briefing(c: Ctx): BriefItem[] {
  const { m, h, fc } = c;
  const out: BriefItem[] = [];
  const total = sum(fc.fc);
  const last19 = sum(h.demand, m.asOf - 18, m.asOf + 1);
  if (total > 0) {
    const peak = fc.fc.indexOf(Math.max(...fc.fc));
    const trough = fc.fc.indexOf(Math.min(...fc.fc));
    out.push({
      icon: "↗",
      text: (
        <>
          Next 19 months: <b>{compact(total)} units</b>, <b>{fmtSignedPct(total / last19 - 1)}</b> vs the last 19 months of unconstrained demand ({compact(last19)}). Peak in <b>{monthName(m.months[m.w0 + peak])}</b> ({compact(fc.fc[peak])}), low in {monthName(m.months[m.w0 + trough])} ({compact(fc.fc[trough])}).
        </>
      ),
    });
  } else {
    out.push({ icon: "0", text: <>The selection has no forecast volume in the window (lost account, end of life or no test rows).</> });
  }

  let best: { dim: string; label: string; delta: number; idx: number; key: "family" | "region" | "channel" } | null = null;
  for (const mix of c.mixes) {
    if (c.filters[mix.dim] !== null) continue;
    mix.next.forEach((x, i) => {
      const d = x - mix.last[i];
      if (!best || Math.abs(d) > Math.abs(best.delta)) best = { dim: mix.dim, label: mix.labels[i], delta: d, idx: i, key: mix.dim };
    });
  }
  if (best !== null) {
    const b = best as { dim: string; label: string; delta: number; idx: number; key: "family" | "region" | "channel" };
    out.push({
      icon: "◐",
      text: (
        <>
          Mix: <Link onClick={() => c.setFilters({ ...c.filters, [b.key]: b.idx, ...(b.key === "family" ? { sku: null } : {}) })}>{b.label}</Link> {b.delta >= 0 ? "gains" : "loses"} <b>{(Math.abs(b.delta) * 100).toFixed(1)} pts</b> of {c.measure === "usd" ? "revenue" : "volume"} share next 12 months vs the last 12 (largest {b.dim} shift).
        </>
      ),
    });
  }

  if (c.exc) {
    const rows = exceptionRowsIn(m, c.filters, c.exc);
    const events = rows.filter((i) => c.exc?.rule[i] === "window_event");
    if (events.length) {
      const units = events.reduce((a, i) => a + (c.exc?.impact_units[i] ?? 0), 0);
      const usd = events.reduce((a, i) => a + (c.exc?.revenue_at_risk[i] ?? 0), 0);
      const group = c.exc.group[events[0]];
      out.push({
        icon: "!",
        text: (
          <>
            Window risk: <b>{group}</b> ({c.exc.start_label[events[0]]}, {events.length} series) {units >= 0 ? "removes" : "adds"} <b>{fmtInt(Math.abs(units))} units</b> ({fmtUsd(usd)}) of latent demand in the forecast.
          </>
        ),
      });
    }
    if (rows.length) {
      const usd = rows.reduce((a, i) => a + (c.exc?.revenue_at_risk[i] ?? 0), 0);
      const top = rows[0];
      out.push({
        icon: "✓",
        text: (
          <>
            <Link onClick={() => c.go("exceptions")}>{rows.length} exceptions need review</Link> ({fmtUsd(usd)} revenue at risk). Largest: {c.exc.rules[c.exc.rule[top]]?.title.toLowerCase()} — {c.exc.cause[top]}
          </>
        ),
      });
    }
  }

  const zeros = sum(h.zeros, m.asOf - 23, m.asOf + 1);
  const structural = sum(h.structZeros, m.asOf - 23, m.asOf + 1);
  if (zeros > 0) {
    out.push({
      icon: "↻",
      text: (
        <>
          <b>{fmtPct(structural / zeros, structural / zeros >= 0.995 ? 2 : 1)}</b> of the {fmtInt(zeros)} zero series-months in the last 24 months are scheduled: ordering-cycle off-months or lost-account tails, not missing demand. <Link onClick={() => c.go("explorer", { lens: "latent" })}>See the latent-demand lens</Link>.
        </>
      ),
    });
  }

  if (c.lost && c.lost.u > 0) {
    const uplift = sum(h.demand) / sum(h.shipped) - 1;
    out.push({
      icon: "▼",
      text: (
        <>
          Stock-outs cost <b>{fmtInt(c.lost.u)} units</b> ({fmtUsd(c.lost.usd)}) never shipped in 2019-2026; unconstrained demand runs <b>{fmtSignedPct(uplift, 2)}</b> above shipments overall. The forecast is unconstrained (rule 7). <Link onClick={() => c.go("stockouts")}>Stock-outs view</Link>.
        </>
      ),
    });
  }

  const bt = m.meta.backtest;
  const final = bt.ladder.find((l) => l.model === bt.final);
  const others = bt.ladder.filter((l) => l.model !== bt.final);
  if (final && others.length) {
    const naive = others[0];
    const bestBase = others.reduce((a, b) => (a.wape < b.wape ? a : b));
    out.push({
      icon: "≈",
      text: (
        <>
          Backtest over {bt.origins.length} origins (19-month horizon, all series): final model WAPE <b>{fmtPct(final.wape)}</b> vs {fmtPct(naive.wape)} for {naive.model.replace(/_/g, " ")} and {fmtPct(bestBase.wape)} for the best baseline ({bestBase.model.replace(/_/g, " ")})
          {bt.noise_floor !== null && <>; estimated noise floor {fmtPct(bt.noise_floor)}</>}. <Link onClick={() => c.go("forecast")}>Accuracy by family, region and horizon</Link>.
        </>
      ),
    });
  }
  return out;
}
