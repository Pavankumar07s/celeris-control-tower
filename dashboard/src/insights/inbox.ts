// Exception inbox copy: the facts computed for the selection and the deterministic templates that write
// the headline, the standfirst, the module titles and each case file's headline.  The pattern is
// insights/headlines.ts (facts in, sentences out, a descriptive fallback each); no typed number.
import type { Model } from "../data/model";
import type { ExceptionFile } from "../data/types";
import { fmtInt, fmtMoney, fmtPct, fmtPctAbs, monthLong, monthSpan } from "../data/format";
import { readableMonths } from "./briefing";
import { cap, countWord, fractionWord, plural, type Template } from "./headlines";

/** Review status kept per viewer in this browser ("acknowledged" is shown as "In review"). */
export type Status = "new" | "acknowledged" | "resolved";
export const STATUS_LABEL: Record<Status, string> = { new: "New", acknowledged: "In review", resolved: "Resolved" };
export const STATUS_TONE: Record<Status, "neutral" | "warn" | "good"> = { new: "neutral", acknowledged: "warn", resolved: "good" };

/** Each rule as a noun phrase for prose (the bundle's rule titles are labels, not sentence parts). */
const RULE_WORDS: Record<string, { one: string; many: string }> = {
  lost_account: { one: "lost account", many: "lost accounts" },
  window_event: { one: "event in the forecast window", many: "series hit by an event in the window" },
  recent_switch: { one: "recent customer switch", many: "recent customer switches" },
  cold_start: { one: "cold start", many: "cold starts" },
  end_of_life: { one: "end-of-life run-off", many: "end-of-life run-offs" },
  yoy_shift: { one: "forecast far from last year", many: "forecasts far from last year" },
  backtest_bias: { one: "biased segment", many: "biased segments" },
  history_quality: { one: "imputed recent history", many: "series with imputed recent history" },
};
export const ruleOne = (E: ExceptionFile, r: string): string => RULE_WORDS[r]?.one ?? (E.rules[r]?.title ?? r).toLowerCase();
export const ruleMany = (E: ExceptionFile, r: string): string => RULE_WORDS[r]?.many ?? (E.rules[r]?.title ?? r).toLowerCase();
export const ruleTitle = (E: ExceptionFile, r: string): string => tidy(E.rules[r]?.title ?? r);

/** Rows sorted by revenue at risk, largest first (ties keep bundle order). */
export function rankRows(E: ExceptionFile, rows: number[]): number[] {
  return [...rows].sort((a, b) => E.revenue_at_risk[b] - E.revenue_at_risk[a] || a - b);
}

/** How many of the (sorted) rows hold at least half of their total. */
export function halfCount(E: ExceptionFile, sorted: number[]): number {
  const total = sorted.reduce((a, i) => a + E.revenue_at_risk[i], 0);
  let acc = 0;
  for (let k = 0; k < sorted.length; k++) {
    acc += E.revenue_at_risk[sorted[k]];
    if (acc >= total / 2) return k + 1;
  }
  return sorted.length;
}

export interface RuleAgg {
  key: string;
  title: string;
  one: string;
  many: string;
  n: number;
  usd: number;
  units: number;
  resolved: number;
}

export function ruleAggs(E: ExceptionFile, rows: number[], status: (i: number) => Status): RuleAgg[] {
  const by = new Map<string, RuleAgg>();
  for (const i of rows) {
    const k = E.rule[i];
    const cur = by.get(k) ?? { key: k, title: ruleTitle(E, k), one: ruleOne(E, k), many: ruleMany(E, k), n: 0, usd: 0, units: 0, resolved: 0 };
    cur.n++;
    cur.usd += E.revenue_at_risk[i];
    cur.units += Math.abs(E.impact_units[i]);
    if (status(i) === "resolved") cur.resolved++;
    by.set(k, cur);
  }
  return [...by.values()].sort((a, b) => b.usd - a.usd);
}

// ---- the lede ---------------------------------------------------------------------------------------------
export interface InboxFacts {
  /** " for Hydraulic Systems in Europe", or "" for everything. */
  scope: string;
  /** The series' name when the filters pin exactly one ("PTC-002 in North America"), else null. */
  single: string | null;
  rows: number;
  series: number;
  total: number;
  /** Forecast-window revenue of the selection (USD): the denominator of the at-risk share. */
  fcRevenue: number;
  rules: RuleAgg[];
  nRules: number;
  top: RuleAgg | null;
  /** The rule with the highest revenue at risk per case (at least two cases), when it is not `top`. */
  costliest: RuleAgg | null;
}

export function inboxFacts(E: ExceptionFile, rows: number[], status: (i: number) => Status, scope: string, single: string | null, fcRevenue: number): InboxFacts {
  const rules = ruleAggs(E, rows, status);
  const total = rows.reduce((a, i) => a + E.revenue_at_risk[i], 0);
  const per = rules.filter((r) => r.n >= 2).sort((a, b) => b.usd / b.n - a.usd / a.n);
  return {
    scope,
    single,
    rows: rows.length,
    series: new Set(rows.map((i) => E.series[i])).size,
    total,
    fcRevenue,
    rules,
    nRules: Object.keys(E.rules).length,
    top: rules[0] ?? null,
    costliest: per[0] ?? null,
  };
}

const count = (n: number, capital = false) => (n <= 10 ? countWord(n, capital) : fmtInt(n));

export const INBOX_TEMPLATES = {
  /** "285 series need a planner's judgement this cycle". */
  headline: {
    id: "inbox.headline",
    when: (f) => f.series > 0,
    text: (f) =>
      f.single && f.series === 1
        ? `${f.single} needs a planner’s judgement this cycle`
        : `${count(f.series, true)} ${plural(f.series, "series", "series")}${f.scope} ${f.series === 1 ? "needs" : "need"} a planner’s judgement${f.scope ? "" : " this cycle"}`,
    fallback: (f) => (f.single ? `${f.single} needs no planner’s judgement this cycle` : `No series${f.scope} needs a planner’s judgement`),
  },
  /** "$66.78M of forecast-window revenue depends on them, 4.4% of the $1.52B forecast for the window.
   *   Forecasts far from last year carry the most, $30.21M across 172 series, but the 16 lost accounts are
   *   the costliest cases at $1.02M each." */
  standfirst: {
    id: "inbox.standfirst",
    when: (f) => f.rows > 0 && f.top !== null,
    text: (f) => {
      const share = f.fcRevenue > 0 ? `, ${fmtPct(f.total / f.fcRevenue)} of the ${fmtMoney(f.fcRevenue)} forecast for the window` : "";
      const s1 = `**${fmtMoney(f.total)}** of forecast-window revenue depends on them${share}.`;
      const t = f.top as RuleAgg;
      if (f.rules.length === 1) return `${s1} All of it comes from ${t.n === 1 ? `one ${t.one}` : `${count(t.n)} ${t.many}`}.`;
      const c = f.costliest;
      const lead = `${cap(t.many)} carry the most, ${fmtMoney(t.usd)} across ${fmtInt(t.n)} ${plural(t.n, "series", "series")}`;
      const tail = c && c.key !== t.key ? `, but the ${count(c.n)} ${c.many} are the costliest cases at **${fmtMoney(c.usd / c.n)}** each` : t.n > 1 ? `, **${fmtMoney(t.usd / t.n)}** a case on average` : "";
      return `${s1} ${lead}${tail}.`;
    },
    fallback: (f) =>
      f.rows === 0
        ? `None of the ${count(f.nRules)} exception rules flags a series${f.scope}. Widen or reset the filters to see the rest of the inbox.`
        : `**${fmtMoney(f.total)}** of forecast-window revenue depends on them.`,
  },
} satisfies Record<string, Template<InboxFacts>>;

// ---- the ranked ledger ----------------------------------------------------------------------------------------
export interface ListFacts {
  n: number;
  total: number;
  half: number;
  /** "" for all causes, else the rule's plural noun ("lost accounts"). */
  scope: string;
  group: string | null;
  status: "open" | "all";
  /** Cases in the selection before the status filter. */
  all: number;
}
export const LIST_TEMPLATES = {
  /** "The top 41 of 286 cases hold half of the $66.78M at risk". */
  title: {
    id: "inbox.list",
    when: (l) => l.n >= 4 && l.half < l.n / 2,
    text: (l) => `${l.scope ? `${cap(l.scope)}: the` : "The"} top ${fmtInt(l.half)} of ${fmtInt(l.n)} ${l.status === "open" ? "open " : ""}cases hold half of the ${fmtMoney(l.total)} at risk`,
    fallback: (l) =>
      l.n === 0
        ? l.all === 0
          ? "No case in this selection"
          : l.status === "open"
            ? "Every case here is resolved"
            : "No case matches"
        : `${l.scope ? `${cap(l.scope)}: ` : ""}${count(l.n, !l.scope)} ${l.status === "open" ? "open " : ""}${plural(l.n, "case")} ranked by revenue at risk, ${fmtMoney(l.total)} in all`,
  },
} satisfies Record<string, Template<ListFacts>>;

// ---- where the risk sits (heat table) ---------------------------------------------------------------------------
export interface WhereFacts {
  dim: string;
  top: { label: string; usd: number; share: number; rule: string; ruleShare: number } | null;
  rowsN: number;
  total: number;
}
export const WHERE_TEMPLATES = {
  /** "Powertrain Components carries 41% of the risk, most of it from lost accounts". */
  title: {
    id: "inbox.where",
    when: (w) => w.rowsN >= 2 && !!w.top && w.top.share >= 0.2,
    text: (w) => {
      const t = w.top as NonNullable<WhereFacts["top"]>;
      const from = t.ruleShare > 0.5 ? `, most of it from ${t.rule}` : `, led by ${t.rule}`;
      return `${t.label} carries ${fractionWord(t.share)} of the risk${from}`;
    },
    fallback: (w) => (w.rowsN === 0 ? "No revenue at risk in this selection" : `Revenue at risk by ${w.dim} and cause`),
  },
} satisfies Record<string, Template<WhereFacts>>;

// ---- the case file -------------------------------------------------------------------------------------------
export interface CaseFacts {
  rule: string;
  sku: string;
  region: string;
  customer: string;
  /** Last month with ordered demand (lost account), or null. */
  lastOrder: string | null;
  launch: string | null;
  eol: string | null;
  replaces: string | null;
  metric: number;
  switchMonth: string | null;
  fromCustomer: string | null;
  eventName: string | null;
  units: number;
  span: string;
  ruleTitle: string;
}

const CASE_HEADLINES: Record<string, Template<CaseFacts>> = {
  lost_account: {
    id: "case.lost",
    when: (c) => c.lastOrder !== null,
    text: (c) => `${c.customer} has placed no ${c.sku} order since ${monthLong(c.lastOrder as string)}`,
    fallback: (c) => `${c.customer} has stopped ordering ${c.sku} in ${c.region}`,
  },
  cold_start: {
    id: "case.cold",
    when: (c) => c.launch !== null,
    text: (c) => `${c.sku} launches in ${monthLong(c.launch as string)} with no history of its own`,
    fallback: (c) => `${c.sku} launches with no history of its own`,
  },
  end_of_life: {
    id: "case.eol",
    when: (c) => c.eol !== null,
    text: (c) => `${c.sku} runs off to zero after its ${monthLong(c.eol as string)} end of life`,
    fallback: (c) => `${c.sku} runs off to zero inside the window`,
  },
  yoy_shift: {
    id: "case.yoy",
    when: (c) => Number.isFinite(c.metric) && c.metric !== 0,
    text: (c) => `${c.sku}’s forecast ${c.metric > 0 ? "rises" : "falls"} ${fmtPctAbs(c.metric, 0)} against last year in ${c.region}`,
    fallback: (c) => `${c.sku}’s forecast moves sharply against last year`,
  },
  recent_switch: {
    id: "case.switch",
    when: (c) => c.switchMonth !== null && c.fromCustomer !== null && c.fromCustomer !== c.customer,
    text: (c) => `${c.customer} replaced ${c.fromCustomer} on ${c.sku} in ${monthLong(c.switchMonth as string)}`,
    fallback: (c) => `${c.sku} in ${c.region} changed customer recently`,
  },
  window_event: {
    id: "case.event",
    when: (c) => c.eventName !== null && c.units > 0,
    text: (c) => `${c.eventName} removes ${fmtInt(c.units)} ${c.sku} ${plural(Math.round(c.units), "unit")}, ${c.span}`,
    fallback: (c) => `An event inside the window cuts ${c.sku} in ${c.region}`,
  },
};

export function caseHeadline(c: CaseFacts): string {
  const t = CASE_HEADLINES[c.rule];
  if (!t) return `${c.ruleTitle}: ${c.sku} in ${c.region}`;
  try {
    if (!t.when || t.when(c)) return t.text(c);
  } catch {
    /* fall through */
  }
  return t.fallback(c);
}

/** Pipeline prose made readable: ISO months as "Jun 2025", "->" as "to", "x1.71" as "×1.71",
 *  "Jul 2027..Aug 2027" as a dash range, and a true minus on negative numbers. */
export const tidy = (s: string): string => readableMonths(s);

/** "Nov 2026 – May 2028" for a case's months. */
export const caseSpan = (m: Model, E: ExceptionFile, i: number): string => monthSpan(m.months[Math.min(E.start[i], m.nMonths - 1)], m.months[Math.min(E.end[i], m.nMonths - 1)]);
