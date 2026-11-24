// The brief: seven deterministic facts for the current selection, each with a lead-in label, serif prose
// and a link to its evidence.  No language model and no typed numbers: every figure is an expression over
// pipeline data.  Only the two items that carry severity (Risk, Act) get a status dot.
import type { ReactNode } from "react";
import type { ForecastAgg, HistoryAgg } from "../data/aggregate";
import { sum } from "../data/aggregate";
import { fmtInt, fmtMoney, fmtNum, fmtPct, fmtSignedPct, monthLong, monthName, monthSpan } from "../data/format";
import { seriesMatches, type Filters, type Measure, type Model } from "../data/model";
import type { ExceptionFile } from "../data/types";
import { LinkButton, MoreLink } from "../components/controls";

export interface BriefItem {
  /** Lead-in label (rendered UPPERCASE): Volume, Mix, Risk, Act, Zeros, Lost sales, Accuracy. */
  tag: string;
  /** Severity dot (only Risk and Act carry one). */
  tone?: "warn" | "crit";
  body: ReactNode;
  /** @deprecated legacy glyph; kept for views that still read it. */
  icon?: string;
  /** @deprecated alias of body. */
  text?: ReactNode;
}

export interface MixShares {
  dim: "family" | "region" | "channel";
  labels: string[];
  last: number[];
  next: number[];
}

interface Ctx {
  m: Model;
  filters: Filters;
  measure: Measure;
  h: HistoryAgg; // units
  fc: ForecastAgg; // units
  runs: number[];
  mixes: MixShares[];
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

/** Replace ISO months in pipeline prose with reading months: "since 2025-06" -> "since Jun 2025". */
export function readableMonths(s: string, long = false): string {
  return s.replace(/\b(\d{4})-(\d{2})\b/g, (_, y: string, mo: string) => (long ? monthLong(`${y}-${mo}`) : monthName(`${y}-${mo}`)));
}

/** Largest share shift (next 12 vs last 12) across the dimensions the filters leave open. */
export function largestShift(filters: Filters, mixes: MixShares[]): { dim: MixShares["dim"]; label: string; idx: number; delta: number } | null {
  let best: { dim: MixShares["dim"]; label: string; idx: number; delta: number } | null = null;
  for (const mix of mixes) {
    if (filters[mix.dim] !== null) continue;
    // a dimension with a single active entity has no mix to shift
    if (mix.labels.filter((_, i) => mix.last[i] > 0 || mix.next[i] > 0).length < 2) continue;
    mix.next.forEach((x, i) => {
      const d = x - mix.last[i];
      if (!best || Math.abs(d) > Math.abs(best.delta)) best = { dim: mix.dim, label: mix.labels[i], idx: i, delta: d };
    });
  }
  return best;
}

export function briefing(c: Ctx): BriefItem[] {
  const { m, h, fc } = c;
  const out: BriefItem[] = [];
  const total = sum(fc.fc);
  const last19 = sum(h.demand, m.asOf - 18, m.asOf + 1);

  // VOLUME
  if (total > 0) {
    const peak = fc.fc.indexOf(Math.max(...fc.fc));
    const trough = fc.fc.lastIndexOf(Math.min(...fc.fc));
    out.push({
      tag: "Volume",
      body: (
        <>
          Next 19 months: <b>{fmtNum(total)} units</b>, <b>{fmtSignedPct(total / last19 - 1)}</b> against the last 19 months of unconstrained demand ({fmtNum(last19)}). Peak in <b>{monthLong(m.months[m.w0 + peak])}</b> ({fmtNum(fc.fc[peak])}); low in {monthLong(m.months[m.w0 + trough])} ({fmtNum(fc.fc[trough])}).
        </>
      ),
    });
  } else {
    out.push({ tag: "Volume", body: <>The selection has no forecast volume in the window: the account is lost, the SKU ends before {monthLong(m.months[m.w0])}, or it has no test rows.</> });
  }

  // MIX
  const b = largestShift(c.filters, c.mixes);
  const openMix = c.mixes.filter((x) => c.filters[x.dim] === null && x.labels.filter((_, i) => x.last[i] > 0 || x.next[i] > 0).length >= 2);
  if (b && Math.abs(b.delta) >= 0.00005) {
    out.push({
      tag: "Mix",
      body: (
        <>
          <LinkButton onClick={() => c.setFilters({ ...c.filters, [b.dim]: b.idx, ...(b.dim === "family" ? { sku: null } : {}) })} title={`Filter the page to ${b.label}`}>
            {b.label}
          </LinkButton>{" "}
          {b.delta >= 0 ? "gains" : "loses"} <b>{Math.abs(b.delta * 100).toFixed(2)} pts</b> of {c.measure === "usd" ? "revenue" : "volume"} share over the next 12 months, the largest shift of any {openMix.map((x) => x.dim).join(", ").replace(/, ([^,]*)$/, " or $1")}.
        </>
      ),
    });
  }

  if (c.exc) {
    const X = c.exc;
    const rows = exceptionRowsIn(m, c.filters, X);
    // RISK: the largest event inside the forecast window
    const events = rows.filter((i) => X.rule[i] === "window_event");
    if (events.length) {
      const byGroup = new Map<string, number[]>();
      for (const i of events) byGroup.set(X.group[i], [...(byGroup.get(X.group[i]) ?? []), i]);
      const [group, list] = [...byGroup.entries()].sort((p, q) => Math.abs(q[1].reduce((a, i) => a + X.impact_units[i], 0)) - Math.abs(p[1].reduce((a, i) => a + X.impact_units[i], 0)))[0];
      const units = list.reduce((a, i) => a + X.impact_units[i], 0);
      const usd = list.reduce((a, i) => a + X.revenue_at_risk[i], 0);
      const [who, where] = group.replace(/^EV-\d+\s*/, "").split("|").map((s) => s.trim());
      const id = group.match(/^(EV-\d+)/)?.[1];
      const ei = id ? m.dims.events.id.indexOf(id) : -1;
      const desc = ei >= 0 ? m.dims.events.description[ei].toLowerCase() : "event";
      const what = /retooling shutdown/.test(desc) ? "retooling shutdown" : /shutdown/.test(desc) ? "shutdown" : /strike/.test(desc) ? "strike" : "event";
      const s0 = Math.min(...list.map((i) => X.start[i]));
      const s1 = Math.max(...list.map((i) => X.end[i]));
      out.push({
        tag: "Risk",
        tone: "warn",
        body: (
          <>
            The <b>{who}</b> {what} ({where ? `${where}, ` : ""}
            {monthSpan(m.months[s0], m.months[Math.min(s1, m.nMonths - 1)])}) {units >= 0 ? "removes" : "adds"} <b>{fmtInt(Math.abs(units))} units</b> ({fmtMoney(usd, 1)}) of demand across {list.length} series.
          </>
        ),
      });
    }
    // ACT
    if (rows.length) {
      const usd = rows.reduce((a, i) => a + X.revenue_at_risk[i], 0);
      const top = rows.reduce((a, i) => (X.revenue_at_risk[i] > X.revenue_at_risk[a] ? i : a), rows[0]);
      const s = X.series[top];
      const who = s >= 0 ? (
        <>
          <span className="id">{m.dims.skus.id[m.sSku[s]]}</span> in {m.dims.regions[m.sRegion[s]]}
        </>
      ) : (
        <>
          {m.dims.families.name[X.family[top]]} in {m.dims.regions[X.region[top]]}
        </>
      );
      const since = X.cause[top].match(/since (\d{4}-\d{2})/)?.[1];
      const rule = X.rules[X.rule[top]]?.title ?? X.rule[top];
      out.push({
        tag: "Act",
        tone: "crit",
        body: (
          <>
            <b>
              {fmtInt(rows.length)} exception{rows.length === 1 ? "" : "s"}
            </b>{" "}
            need a planner, with <b>{fmtMoney(usd, 1)}</b> of revenue at risk. The largest is {X.rule[top] === "lost_account" ? "a lost account" : `${/^[aeiou]/i.test(rule) ? "an" : "a"} ${rule.toLowerCase()}`}: {who}
            {X.rule[top] === "lost_account" && since ? <>, silent since {monthLong(since)}</> : null}. <MoreLink onClick={() => c.go("exceptions")}>Open the inbox</MoreLink>
          </>
        ),
      });
    }
  }

  // ZEROS
  const zeros = sum(h.zeros, m.asOf - 23, m.asOf + 1);
  const structural = sum(h.structZeros, m.asOf - 23, m.asOf + 1);
  if (zeros > 0) {
    out.push({
      tag: "Zeros",
      body: (
        <>
          <b>{fmtPct(structural / zeros, structural / zeros >= 0.995 ? 2 : 1)}</b> of the {fmtInt(zeros)} zero series-months in the last 24 months are scheduled ordering-cycle off-months or lost-account tails, not missing demand. <MoreLink onClick={() => c.go("explorer", { lens: "latent" })}>Latent-demand lens</MoreLink>
        </>
      ),
    });
  }

  // LOST SALES
  if (c.lost && c.lost.u > 0) {
    // cells with unknown shipments (ERP blanks) carry demand but no shipments: keep them out of the uplift
    const uplift = sum(h.demand) / (sum(h.shipped) + sum(h.unknownDemand)) - 1;
    const y0 = m.months[0].slice(0, 4);
    const y1 = m.months[m.asOf].slice(0, 4);
    out.push({
      tag: "Lost sales",
      body: (
        <>
          Stock-outs cost <b>{fmtInt(c.lost.u)} units</b> ({fmtMoney(c.lost.usd, 1)}) that never shipped in {y0}–{y1}. Unconstrained demand runs <b>{fmtSignedPct(uplift, 2)}</b> above shipments, and the forecast is unconstrained. <MoreLink onClick={() => c.go("stockouts")}>Stock-outs</MoreLink>
        </>
      ),
    });
  }

  // ACCURACY
  const bt = m.meta.backtest;
  const final = bt.ladder.find((l) => l.model === bt.final) ?? bt.ladder.find((l) => l.model === "final");
  const naive = bt.ladder.find((l) => l.model === "naive");
  const snaive = bt.ladder.find((l) => l.model === "seasonal_naive");
  if (final && (naive || snaive)) {
    out.push({
      tag: "Accuracy",
      body: (
        <>
          Across {bt.origins.length} backtest origins at a 19-month horizon, WAPE is <b>{fmtPct(final.wape)}</b>
          {snaive && <>, against {fmtPct(snaive.wape)} for seasonal naive</>}
          {naive && <> and {fmtPct(naive.wape)} for naive</>}
          {bt.noise_floor !== null && <>; the noise floor is about {fmtPct(bt.noise_floor)}</>}. <MoreLink onClick={() => c.go("forecast")}>Accuracy by segment</MoreLink>
        </>
      ),
    });
  }
  return out.map((x) => ({ ...x, text: x.body }));
}
