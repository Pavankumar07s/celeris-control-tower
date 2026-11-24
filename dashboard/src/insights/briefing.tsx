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
import { lastOrderPhrase, lostFacts } from "./inbox";

/** The backtest ladder as every view cites it: pooled over the scored origins on the cells every model forecast.
 *  The noise floor is the in-hindsight oracle on those same cells (one variable for the Overview, the brief and
 *  Forecast & accuracy), falling back to the summary's figure for a bundle without an oracle row. */
export function ladderFacts(m: Model) {
  const bt = m.meta.backtest;
  const find = (md: string) => bt.ladder.find((l) => l.model === md);
  const oracle = find("oracle");
  return {
    final: find(bt.final) ?? find("final"),
    naive: find("naive"),
    snaive: find("seasonal_naive"),
    cycle: find("cycle_aware"),
    floor: oracle ? oracle.wape : bt.noise_floor,
    origins: (bt.scored_origins ?? bt.origins).length,
  };
}

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
/** Pipeline prose made readable: ISO months as "Oct 2026", "a..b" month ranges as "a – b", "->" as "to",
 *  "x1.71" as "×1.71" and a hyphen-minus before a number as a true minus. */
export function readableMonths(s: string, long = false): string {
  return s
    .replace(/\b(\d{4})-(\d{2})\b/g, (_, y: string, mo: string) => (long ? monthLong(`${y}-${mo}`) : monthName(`${y}-${mo}`)))
    .replace(/\s*->\s*/g, " to ")
    .replace(/\bx(?=\d)/g, "×")
    .replace(/([A-Z][a-z]{2,8} \d{4})\.\.([A-Z][a-z]{2,8} \d{4})/g, "$1 – $2")
    .replace(/(^|[\s(])-(?=\d)/g, "$1\u2212")
    .replace(/(\d) %/g, "$1%");
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

/** The largest event inside the forecast window for the selection (the brief's Risk and the Overview watch list). */
export function riskFact(m: Model, X: ExceptionFile, rows: number[]) {
  const events = rows.filter((i) => X.rule[i] === "window_event");
  if (!events.length) return null;
  const byGroup = new Map<string, number[]>();
  for (const i of events) byGroup.set(X.group[i], [...(byGroup.get(X.group[i]) ?? []), i]);
  const [group, list] = [...byGroup.entries()].sort((p, q) => Math.abs(q[1].reduce((a, i) => a + X.impact_units[i], 0)) - Math.abs(p[1].reduce((a, i) => a + X.impact_units[i], 0)))[0];
  const units = list.reduce((a, i) => a + X.impact_units[i], 0);
  const usd = list.reduce((a, i) => a + X.revenue_at_risk[i], 0);
  const [who, where] = group.replace(/^EV-\d+\s*/, "").split("|").map((x) => x.trim());
  const id = group.match(/^(EV-\d+)/)?.[1];
  const ei = id ? m.dims.events.id.indexOf(id) : -1;
  const desc = ei >= 0 ? m.dims.events.description[ei].toLowerCase() : "event";
  const what = /retooling shutdown/.test(desc) ? "retooling shutdown" : /shutdown/.test(desc) ? "shutdown" : /strike/.test(desc) ? "strike" : "event";
  const s0 = Math.min(...list.map((i) => X.start[i]));
  const s1 = Math.max(...list.map((i) => X.end[i]));
  return { who, where: where ?? "", what, units, usd, n: list.length, span: monthSpan(m.months[s0], m.months[Math.min(s1, m.nMonths - 1)]) };
}

/** The exception cases of the selection: count, revenue at risk and the largest case (the brief's Act, the
 *  Overview watch list; the same rows the rail badge and the inbox tabs count). */
export function actFact(m: Model, X: ExceptionFile, rows: number[]) {
  if (!rows.length) return null;
  const usd = rows.reduce((a, i) => a + X.revenue_at_risk[i], 0);
  const top = rows.reduce((a, i) => (X.revenue_at_risk[i] > X.revenue_at_risk[a] ? i : a), rows[0]);
  const s = X.series[top];
  const whoText = s >= 0 ? `${m.dims.skus.id[m.sSku[s]]} in ${m.dims.regions[m.sRegion[s]]}` : `${m.dims.families.name[X.family[top]]} in ${m.dims.regions[X.region[top]]}`;
  const whoNode: ReactNode =
    s >= 0 ? (
      <>
        <span className="id">{m.dims.skus.id[m.sSku[s]]}</span> in {m.dims.regions[m.sRegion[s]]}
      </>
    ) : (
      whoText
    );
  const rule = X.rules[X.rule[top]]?.title ?? X.rule[top];
  const ruleWords = X.rule[top] === "lost_account" ? "a lost account" : `${/^[aeiou]/i.test(rule) ? "an" : "a"} ${rule.toLowerCase()}`;
  const lost = X.rule[top] === "lost_account" ? lostFacts(X.cause[top]) : null;
  return { n: rows.length, usd, top, topUsd: X.revenue_at_risk[top], whoText, whoNode, ruleWords, lost };
}

/** Lost units as a share of unconstrained demand: one variable for the Overview figure, the brief and the watch list. */
export const lostShare = (lostUnits: number, h: HistoryAgg): number => lostUnits / Math.max(1, sum(h.demand));

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
    // RISK: the largest event inside the forecast window (one variable with the Overview watch list)
    const r = riskFact(m, X, rows);
    if (r) {
      out.push({
        tag: "Risk",
        tone: "warn",
        body: (
          <>
            The <b>{r.who}</b> {r.what} ({r.where ? `${r.where}, ` : ""}
            {r.span}) {r.units >= 0 ? "removes" : "adds"} <b>{fmtInt(Math.abs(r.units))} units</b> ({fmtMoney(r.usd, 1)}) of demand across {r.n} series.
          </>
        ),
      });
    }
    // ACT (one variable with the Overview watch list, the rail badge and the inbox: cases)
    const a = actFact(m, X, rows);
    if (a) {
      out.push({
        tag: "Act",
        tone: "crit",
        body: (
          <>
            <b>
              {fmtInt(a.n)} {a.n === 1 ? "case" : "cases"}
            </b>{" "}
            need a planner, with <b>{fmtMoney(a.usd, 1)}</b> of revenue at risk. The largest is {a.ruleWords}: {a.whoNode}
            {a.lost ? <>, {lastOrderPhrase(a.lost).replace(/^Last/, "last")}</> : null}. <MoreLink onClick={() => c.go("exceptions")}>Open the inbox</MoreLink>
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
          <b>{fmtPct(structural / zeros, structural / zeros >= 0.995 ? 2 : 1)}</b> of the {fmtInt(zeros)} zero series-months of the last 24 months ({monthSpan(m.months[m.asOf - 23], m.months[m.asOf])}) are scheduled ordering-cycle off-months or lost-account tails, not missing demand. <MoreLink onClick={() => c.go("explorer", { lens: "latent" })}>Latent-demand lens</MoreLink>
        </>
      ),
    });
  }

  // LOST SALES
  if (c.lost && c.lost.u > 0) {
    // one base with the Overview figure and Stock-outs: lost units as a share of unconstrained demand
    const share = lostShare(c.lost.u, h);
    const y0 = m.months[0].slice(0, 4);
    const y1 = m.months[m.asOf].slice(0, 4);
    out.push({
      tag: "Lost sales",
      body: (
        <>
          Stock-outs cost <b>{fmtInt(c.lost.u)} units</b> ({fmtMoney(c.lost.usd, 1)}) that never shipped in {y0}–{y1}, <b>{fmtPct(share, 2)}</b> of unconstrained demand; the forecast is unconstrained, so it plans for them. <MoreLink onClick={() => c.go("stockouts")}>Stock-outs</MoreLink>
        </>
      ),
    });
  }

  // ACCURACY
  const { final, naive, snaive, cycle, floor, origins } = ladderFacts(m);
  if (final && (naive || snaive)) {
    out.push({
      tag: "Accuracy",
      body: (
        <>
          Across {origins} backtest origins at a 19-month horizon, WAPE is <b>{fmtPct(final.wape)}</b>
          {cycle && <>, against {fmtPct(cycle.wape)} for cycle-aware naive (the best benchmark)</>}
          {snaive && <>{cycle ? "," : ", against"} {fmtPct(snaive.wape)} for seasonal naive</>}
          {naive && <> and {fmtPct(naive.wape)} for naive</>}
          {floor !== null && <>; the in-hindsight floor is {fmtPct(floor)}</>}. <MoreLink onClick={() => c.go("forecast")}>Accuracy by segment</MoreLink>
        </>
      ),
    });
  }
  return out.map((x) => ({ ...x, text: x.body }));
}
