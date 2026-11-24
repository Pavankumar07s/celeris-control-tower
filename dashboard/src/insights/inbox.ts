// Exception inbox copy: the facts computed for the selection and the deterministic templates that write
// the headline, the standfirst, the module titles and each case file's headline.  The pattern is
// insights/headlines.ts (facts in, sentences out, a descriptive fallback each); no typed number.
import type { Model } from "../data/model";
import type { ExceptionFile } from "../data/types";
import { fmtInt, fmtMoney, fmtNum, fmtPct, fmtPctAbs, fmtSignedPct, monthLong, monthName, monthSpan } from "../data/format";
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
  /** `usd` rounded so that the rules' printed amounts add up to the printed total (largest remainder). */
  usdShown: number;
  units: number;
  resolved: number;
}

export function ruleAggs(E: ExceptionFile, rows: number[], status: (i: number) => Status): RuleAgg[] {
  const by = new Map<string, RuleAgg>();
  for (const i of rows) {
    const k = E.rule[i];
    const cur = by.get(k) ?? { key: k, title: ruleTitle(E, k), one: ruleOne(E, k), many: ruleMany(E, k), n: 0, usd: 0, usdShown: 0, units: 0, resolved: 0 };
    cur.n++;
    cur.usd += E.revenue_at_risk[i];
    cur.units += Math.abs(E.impact_units[i]);
    if (status(i) === "resolved") cur.resolved++;
    by.set(k, cur);
  }
  const out = [...by.values()].sort((a, b) => b.usd - a.usd);
  const shown = roundToTotal(out.map((r) => r.usd));
  out.forEach((r, k) => (r.usdShown = shown ? shown[k] : r.usd));
  return out;
}

/** The step a compact money figure is printed at ($66.78M -> 10,000; $970K -> 1,000; $51.4K -> 100). */
function moneyStep(x: number): number {
  const a = Math.abs(x);
  return a >= 1e9 ? 1e7 : a >= 1e6 ? 1e4 : a >= 1e5 ? 1e3 : a >= 1e4 ? 100 : 1;
}
/** Largest-remainder rounding: parts rounded to the total's printed step so that they sum to the printed
 *  total.  Null when a part is printed at a finer step than the total (rounding it coarser would show). */
export function roundToTotal(parts: number[]): number[] | null {
  const total = parts.reduce((a, b) => a + b, 0);
  const step = moneyStep(total);
  if (!(total > 0) || parts.some((p) => p > 0 && moneyStep(p) !== step)) return null;
  const target = Math.round(total / step);
  const base = parts.map((p) => Math.floor(p / step));
  let left = target - base.reduce((a, b) => a + b, 0);
  const order = parts.map((p, k) => ({ k, r: p / step - base[k] })).sort((a, b) => b.r - a.r);
  for (const o of order) {
    if (left <= 0) break;
    base[o.k]++;
    left--;
  }
  return base.map((b) => b * step);
}

// ---- the lede ---------------------------------------------------------------------------------------------
export interface InboxFacts {
  /** " for Hydraulic Systems in Europe", or "" for everything. */
  scope: string;
  /** The series' name when the filters pin exactly one ("PTC-002 in North America"), else null. */
  single: string | null;
  /** Cases (one per series and rule): the count the tabs, the rail badge and the brief use. */
  rows: number;
  /** Distinct series behind the cases (fewer when a series is flagged by more than one rule). */
  series: number;
  /** Series flagged by more than one rule. */
  multi: number;
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
  const perSeries = new Map<number, number>();
  for (const i of rows) perSeries.set(E.series[i], (perSeries.get(E.series[i]) ?? 0) + 1);
  return {
    scope,
    single,
    rows: rows.length,
    series: perSeries.size,
    multi: [...perSeries.values()].filter((n) => n > 1).length,
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
  /** "286 cases on 285 series need a planner's judgement this cycle": the count is the cases (as on the
   *  tabs, the rail badge and the brief); the series count is added only when it differs. */
  headline: {
    id: "inbox.headline",
    when: (f) => f.rows > 0,
    text: (f) => {
      if (f.single && f.series === 1)
        return f.rows === 1 ? `${f.single} needs a planner’s judgement this cycle` : `${f.single} needs a planner’s judgement on ${count(f.rows)} cases this cycle`;
      const on = f.series !== f.rows ? ` on ${count(f.series)} ${plural(f.series, "series", "series")}` : "";
      return `${count(f.rows, true)} ${plural(f.rows, "case")}${on}${f.scope} ${f.rows === 1 ? "needs" : "need"} a planner’s judgement${f.scope ? "" : " this cycle"}`;
    },
    fallback: (f) => (f.single ? `${f.single} needs no planner’s judgement this cycle` : `No case${f.scope} needs a planner’s judgement`),
  },
  /** "$66.78M of forecast-window revenue depends on them, 4.4% of the $1.52B forecast for the window.
   *   Forecasts far from last year carry the most, $30.21M across 172 cases, but the 16 lost accounts are
   *   the costliest cases at $1.02M each.  One series is flagged by two rules." */
  standfirst: {
    id: "inbox.standfirst",
    when: (f) => f.rows > 0 && f.top !== null,
    text: (f) => {
      const share = f.fcRevenue > 0 ? `, ${fmtPct(f.total / f.fcRevenue)} of the ${fmtMoney(f.fcRevenue)} forecast for the window` : "";
      const s1 = `**${fmtMoney(f.total)}** of forecast-window revenue depends on them${share}.`;
      const twice = f.multi > 0 ? ` ${f.multi === 1 ? "One series is" : `${count(f.multi, true)} series are`} flagged by more than one rule, so the cases outnumber the series.` : "";
      const t = f.top as RuleAgg;
      if (f.rules.length === 1) return `${s1} All of it comes from ${t.n === 1 ? `one ${t.one}` : `${count(t.n)} ${t.many}`}.${twice}`;
      const c = f.costliest;
      const lead = `${cap(t.many)} carry the most, ${fmtMoney(t.usdShown)} across ${fmtInt(t.n)} ${plural(t.n, "case")}`;
      const tail = c && c.key !== t.key ? `, but the ${count(c.n)} ${c.many} are the costliest cases at **${fmtMoney(c.usd / c.n)}** each` : t.n > 1 ? `, **${fmtMoney(t.usd / t.n)}** a case on average` : "";
      return `${s1} ${lead}${tail}.${twice}`;
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
  /** Months since the last order (lost account), or null. */
  silent: number | null;
  sku: string;
  region: string;
  customer: string;
  /** Last month with ordered demand (lost account), or null. */
  lastOrder: string | null;
  launch: string | null;
  eol: string | null;
  /** Forecast in the EOL month and whether every month after it is zero (end of life), or null. */
  eolUnits: number | null;
  zeroAfterEol: boolean;
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
    text: (c) =>
      c.silent !== null && c.silent > 0
        ? `${c.customer} last ordered ${c.sku} in ${monthLong(c.lastOrder as string)} and has been silent for ${fmtInt(c.silent)} ${plural(c.silent, "month")}`
        : `${c.customer} last ordered ${c.sku} in ${monthLong(c.lastOrder as string)}`,
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
    text: (c) =>
      c.eolUnits !== null && c.eolUnits >= 0.5 && c.zeroAfterEol
        ? `${c.sku} sells its last units in ${monthLong(c.eol as string)}, its end-of-life month, and nothing after`
        : `${c.sku} runs off to zero after its ${monthLong(c.eol as string)} end of life`,
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

// ---- the reason, in three lengths, from the exported cause text ------------------------------------------
// The bundle's `cause` is pipeline prose ("No orders since 2025-06 (17 silent months); pre-loss level 110.8
// units/month. …").  The inbox rows, the case file, the Overview top five and the brief all re-word it from
// the same parsed fields, so a fact reads the same everywhere; text the parser does not recognise is shown
// as exported (made readable).

const MONTH_RE = "(\\d{4}-\\d{2})";
const prevMonth = (ym: string): string => {
  const [y, mo] = ym.split("-").map(Number);
  return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, "0")}`;
};
const num = (s: string): number => Number(s.replace(/,/g, ""));

export interface LostFacts {
  /** Last month with an order ("2025-05"). */
  lastOrder: string;
  /** Months without an order up to the last actual month. */
  silent: number;
  /** Monthly level before the loss (units), or null. */
  level: number | null;
}
/** A lost account's facts from its exported cause, or null when the text is not a lost-account cause. */
export function lostFacts(cause: string): LostFacts | null {
  let lastOrder: string | null = null;
  let silent: number | null = null;
  const since = cause.match(new RegExp(`No orders since ${MONTH_RE} \\((\\d+) silent months?\\)`, "i"));
  if (since) {
    lastOrder = prevMonth(since[1]);
    silent = Number(since[2]);
  } else {
    const last = cause.match(new RegExp(`Last order ${MONTH_RE}[^\\d]+(\\d+) (?:silent )?months?`, "i"));
    if (last) {
      lastOrder = last[1];
      silent = Number(last[2]);
    }
  }
  if (lastOrder === null || silent === null) return null;
  const lv = cause.match(/pre-loss level ([\d.,]+)/i);
  return { lastOrder, silent, level: lv ? num(lv[1]) : null };
}
/** The one phrasing of a lost account, everywhere: "Last order May 2025; silent 17 months". */
export const lastOrderPhrase = (f: LostFacts): string => `Last order ${monthName(f.lastOrder)}; silent ${fmtInt(f.silent)} ${plural(f.silent, "month")}`;

const units = (v: number): string => `${fmtNum(v)} ${plural(Math.round(v), "unit")}`;
/** A monthly level in units: whole units from 10 up ("111 a month"), one decimal below ("4.5 a month"). */
const perMonth = (v: number): string => `${v >= 10 ? fmtInt(v) : String(Math.round(v * 10) / 10)} a month`;

interface Parsed {
  /** Figure-first row text, two lines at most ("Last order May 2025; silent 17 months · was 111 units a month"). */
  row: string;
  /** Short form for the Overview top five ("Last order May 2025; silent 17 months"). */
  short: string;
  /** Full readable sentence(s) for the case file and the CSV. */
  full: string;
}

function parseCause(rule: string, cause: string): Parsed | null {
  const c = cause.trim();
  if (rule === "lost_account") {
    const f = lostFacts(c);
    if (!f) return null;
    const phrase = lastOrderPhrase(f);
    const zero = c.match(/Forecast is 0 for all (\d+) window months/i);
    const lvl = f.level !== null ? ` · was ${perMonth(f.level)}` : "";
    const lvlFull = f.level !== null ? ` Before the loss it ordered ${perMonth(f.level).replace(" a month", " units a month")}.` : "";
    return {
      row: `${phrase}${lvl}`,
      short: phrase,
      full: `${phrase}.${lvlFull}${zero ? ` The forecast is 0 for all ${zero[1]} window months.` : ""}`,
    };
  }
  if (rule === "cold_start") {
    const x = c.match(new RegExp(`Planned launch ${MONTH_RE}(?: replacing ([A-Z]{3}-\\d{3}))?;.*?forecast \\(([\\d,.]+) units\\)`, "i"));
    if (!x) return null;
    const rep = x[2] ? `, replaces ${x[2]}` : "";
    return {
      row: `${units(num(x[3]))} on a launch prior · launches ${monthName(x[1])}${rep}`,
      short: `Launches ${monthName(x[1])}, no history`,
      full: `Planned launch in ${monthName(x[1])}${x[2] ? `, replacing ${x[2]}` : ""}. With no history of its own, the forecast of ${units(num(x[3]))} rests on a launch prior.`,
    };
  }
  if (rule === "end_of_life") {
    const x = c.match(new RegExp(`EOL ${MONTH_RE}: (\\d+) phase-out months? forecast at ([\\d,.]+) units, (\\d+) months? after EOL forecast at 0`, "i"));
    if (!x) return null;
    return {
      row: `${units(num(x[3]))} in ${x[2]} phase-out months · EOL ${monthName(x[1])}, zero after`,
      short: `EOL ${monthName(x[1])}, zero after`,
      full: `End of life in ${monthName(x[1])}: ${units(num(x[3]))} forecast over ${x[2]} phase-out months up to and including the EOL month, then 0 for the ${x[4]} months after it.`,
    };
  }
  if (rule === "yoy_shift") {
    const x = c.match(/Next 12 months ([\d,.]+) units vs ([\d,.]+) in the last 12 \(([-+−]?[\d.]+)%\)/i);
    if (!x) return null;
    const pct = num(x[3].replace("−", "-")) / 100;
    return {
      row: `${fmtSignedPct(pct, 0)} · ${units(num(x[1]))} in the next 12 months vs ${fmtNum(num(x[2]))} in the last 12`,
      short: `${fmtSignedPct(pct, 0)} against the last 12 months`,
      full: `The next 12 months are forecast at ${units(num(x[1]))} against ${units(num(x[2]))} in the last 12 (${fmtSignedPct(pct, 0)}).`,
    };
  }
  if (rule === "recent_switch") {
    const x = c.match(new RegExp(`Customer changed from (.+?) to (.+?) in ${MONTH_RE}; level x([\\d.]+) \\(([\\d.,]+) -> ([\\d.,]+) units/month\\)`, "i"));
    if (!x) return null;
    return {
      row: `Level ×${x[4]}, ${perMonth(num(x[5])).replace(" a month", "")} → ${perMonth(num(x[6]))} · new customer ${monthName(x[3])}`,
      short: `Level ×${x[4]} after a customer switch`,
      full: `${x[2]} replaced ${x[1]} in ${monthName(x[3])}; the monthly level moved ×${x[4]}, from ${fmtNum(num(x[5]))} to ${fmtNum(num(x[6]))} units a month.`,
    };
  }
  if (rule === "window_event") {
    const x = c.match(new RegExp(`^(EV-\\d+) (.+?) \\(${MONTH_RE}\\.\\.${MONTH_RE}\\): latent demand x([\\d.]+), ([\\d,.]+) units removed`, "i"));
    if (!x) return null;
    const span = x[3] === x[4] ? monthName(x[3]) : monthSpan(x[3], x[4]);
    return {
      row: `${units(num(x[6]))} removed · ${span} · ${x[2]}`,
      short: `${units(num(x[6]))} removed, ${span}`,
      full: `${x[2]} (${x[1]}, ${span}) multiplies latent demand by ${x[5]}, removing ${units(num(x[6]))}.`,
    };
  }
  return null;
}

/** Figure-first reason for an inbox row (two lines at most). */
export const reasonRow = (E: ExceptionFile, i: number): string => parseCause(E.rule[i], E.cause[i])?.row ?? tidy(E.cause[i].split(". ")[0]);
/** Short reason for the Overview top five ("Last order May 2025; silent 17 months"). */
export const reasonShort = (E: ExceptionFile, i: number): string => parseCause(E.rule[i], E.cause[i])?.short ?? tidy(E.cause[i].split(/[;.] /)[0]);
/** The full reason for the case file and the CSV. */
export const reasonFull = (E: ExceptionFile, i: number): string => parseCause(E.rule[i], E.cause[i])?.full ?? tidy(E.cause[i]);
