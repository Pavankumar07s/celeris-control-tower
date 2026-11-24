// O6 Exception inbox (act): the few series that need a planner this cycle, ranked by revenue at risk.
//  lede (computed headline + standfirst | hero: revenue at risk with the three-colour review meter)
//  -> cause tabs (All + one per rule: name, $ at risk, cases, a bar scaled to $)
//  -> work area: the ranked ledger (cases or cause groups, Open | All) | the docked case file (a drawer
//     below 1181px) with the series on the shared timeline and the rule's evidence drawn on it
//  -> where the risk sits (family or region x cause heat table) -> how each rule prices its risk.
// Status and notes are kept per viewer in this browser.  In-view state lives in the URL hash:
// cause=<rule> st=all xg=1 (cause groups) grp=<group> case=<row>|off.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../app/context";
import { useSelection, useMedia } from "../app/hooks";
import { LineageDrawer, decodeCell, encodeCell, type CellRef } from "../components/Lineage";
import { Button, RuleChip, Segmented, StatusPill } from "../components/controls";
import { HeroFigure, Lede, Meter } from "../components/Figure";
import { Close, Download } from "../components/icons";
import { Module } from "../components/Module";
import { Empty, ErrorState, SkeletonChart, SkeletonText } from "../components/states";
import { BarTable, download, toCsv, type Column } from "../components/tables";
import { fmtInt, fmtMoney, fmtPct, monthName } from "../data/format";
import { useResource } from "../data/load";
import type { ExceptionFile } from "../data/types";
import { exceptionRowsIn } from "../insights/briefing";
import { render, selectionWords } from "../insights/headlines";
import { CaseFile } from "./g3/CaseFile";
import { halfCount, inboxFacts, reasonFull, reasonRow, tidy, INBOX_TEMPLATES, LIST_TEMPLATES, rankRows, ruleMany, ruleTitle, STATUS_LABEL, STATUS_TONE, WHERE_TEMPLATES, type Status } from "../insights/inbox";
import "./g3/inbox.css";

const STORE = "celeris-exceptions";
type Store = Record<string, { status: Status; note: string }>;

function loadStore(): Store {
  try {
    return JSON.parse(window.localStorage.getItem(STORE) ?? "{}") as Store;
  } catch {
    return {};
  }
}
function saveStore(v: Store) {
  try {
    window.localStorage.setItem(STORE, JSON.stringify(v));
  } catch {
    /* storage unavailable: statuses last for this session only */
  }
}

const PAGE = 12;

export default function Exceptions() {
  const ex = useResource<ExceptionFile>("exceptions.json");
  if (ex.error) return <ErrorState message={ex.error} />;
  if (!ex.data)
    return (
      <>
        <section className="lede" aria-busy="true">
          <div className="lede-text">
            <SkeletonText lines={2} height={36} lastWidth="55%" />
            <SkeletonText lines={2} height={16} lastWidth="70%" />
          </div>
        </section>
        <SkeletonChart height={120} />
        <p className="caption" aria-live="polite">
          Loading the exception inbox…
        </p>
      </>
    );
  return <Inbox E={ex.data} />;
}

function Inbox({ E }: { E: ExceptionFile }) {
  const { m, filters, params, setParam, setFilters } = useApp();
  const { runs, single } = useSelection();
  const wide = useMedia("(min-width: 1181px)");
  const [store, setStore] = useState<Store>(loadStore);
  const [page, setPage] = useState(0);

  // ---- review state (per viewer, this browser)
  const key = useCallback((i: number) => `${E.rule[i]}|${E.series[i]}|${E.family[i]}|${E.region[i]}|${E.start[i]}`, [E]);
  const status = useCallback((i: number): Status => store[key(i)]?.status ?? "new", [store, key]);
  const note = (i: number) => store[key(i)]?.note ?? "";
  const write = (i: number, st: Status, text?: string) => {
    const next = { ...store, [key(i)]: { status: st, note: text ?? store[key(i)]?.note ?? "" } };
    setStore(next);
    saveStore(next);
  };

  // ---- the selection, ranked
  const rows = useMemo(() => rankRows(E, exceptionRowsIn(m, filters, E)), [E, m, filters]);
  const rank = useMemo(() => new Map(rows.map((i, k) => [i, k + 1])), [rows]);
  const fcRevenue = useMemo(() => {
    let v = 0;
    for (const r of runs) for (let k = 0; k < m.rLen[r]; k++) v += m.price[m.rOff[r] + k] * m.fc[m.rOff[r] + k];
    return v;
  }, [m, runs]);
  const sel = useMemo(() => selectionWords(m, filters), [m, filters]);
  const scope = sel.all ? "" : sel.demandSubject.replace(/^Demand/, "");
  const facts = useMemo(() => inboxFacts(E, rows, status, scope, single !== null ? sel.name : null, fcRevenue), [E, rows, status, scope, single, sel.name, fcRevenue]);
  const rules = facts.rules;

  // ---- in-view state from the hash
  const causeParam = params.get("cause");
  const cause = causeParam && rules.some((r) => r.key === causeParam) ? causeParam : "";
  const st: "open" | "all" = params.get("st") === "all" ? "all" : "open";
  const grouped = params.get("xg") === "1";
  const grpParam = params.get("grp");
  const caseParam = params.get("case");
  // the cell-lineage drawer opened from a case: cell=<SKU>|<region>|<yyyy-mm>, the same parameter in every view
  const lineage = decodeCell(m, params.get("cell"));
  const setLineage = (v: CellRef | null) => setParam({ cell: v ? encodeCell(m, v) : null }, true);
  const shown = useMemo(
    () => rows.filter((i) => (!cause || E.rule[i] === cause) && (!grpParam || E.group[i] === grpParam) && (st === "all" || status(i) !== "resolved")),
    [rows, cause, grpParam, st, status, E],
  );
  useEffect(() => setPage(0), [cause, grpParam, st, filters]);
  const explicit = caseParam !== null && caseParam !== "off" && Number.isInteger(Number(caseParam)) && Number(caseParam) >= 0 && Number(caseParam) < E.rule.length ? Number(caseParam) : null;
  // A case stays open while it belongs to the list in view (the status filter may hide it after you resolve
  // it).  A case left outside the filters, the cause tab or the group by a later change gives way to the
  // first case in view; only a case named by the link the page was opened with stays docked outside them.
  const deepLink = useRef(caseParam);
  const rowSet = useMemo(() => new Set(rows), [rows]);
  const inScope = (i: number) => rowSet.has(i) && (!cause || E.rule[i] === cause) && (!grpParam || E.group[i] === grpParam);
  const keep = explicit !== null && (inScope(explicit) || deepLink.current === String(explicit));
  const open: number | null = caseParam === "off" ? null : keep ? explicit : wide ? (shown[0] ?? null) : null;
  const pick = (i: number | null) => setParam({ case: i === null ? "off" : String(i) }, true);

  // ---- the lede
  const headline = render(INBOX_TEMPLATES.headline, facts).text;
  const standfirst = render(INBOX_TEMPLATES.standfirst, facts).text;
  const byStatus = { new: 0, acknowledged: 0, resolved: 0 } as Record<Status, number>;
  const usdBy = { new: 0, acknowledged: 0, resolved: 0 } as Record<Status, number>;
  for (const i of rows) {
    byStatus[status(i)]++;
    usdBy[status(i)] += E.revenue_at_risk[i];
  }

  // ---- the ledger
  const listTotal = shown.reduce((a, i) => a + E.revenue_at_risk[i], 0);
  const listTitle = render(LIST_TEMPLATES.title, { n: shown.length, total: listTotal, half: halfCount(E, shown), scope: cause ? ruleMany(E, cause) : "", group: grpParam, status: st, all: rows.length }).text;
  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  const pg = Math.min(page, pages - 1);
  const view = shown.slice(pg * PAGE, pg * PAGE + PAGE);
  const maxUsd = shown.length ? E.revenue_at_risk[shown[0]] : 1;
  const where = (i: number) => {
    const s = E.series[i];
    return s >= 0 ? { id: m.dims.skus.id[m.sSku[s]], region: m.dims.regions[m.sRegion[s]], desc: m.dims.skus.description[m.sSku[s]] ?? "" } : { id: m.dims.families.code[E.family[i]], region: m.dims.regions[E.region[i]], desc: m.dims.families.name[E.family[i]] };
  };
  const csvCols: Column<number>[] = [
    { key: "rank", label: "Rank", value: (i) => rank.get(i) ?? null },
    { key: "rule", label: "Rule", value: (i) => ruleTitle(E, E.rule[i]) },
    { key: "sku", label: "SKU", value: (i) => where(i).id },
    { key: "region", label: "Region", value: (i) => where(i).region },
    { key: "first", label: "First month", value: (i) => m.months[Math.min(E.start[i], m.nMonths - 1)] },
    { key: "last", label: "Last month", value: (i) => m.months[Math.min(E.end[i], m.nMonths - 1)] },
    { key: "cause", label: "Root cause", value: (i) => reasonFull(E, i) },
    { key: "action", label: "Recommended action", value: (i) => E.action[i] },
    { key: "units", label: "Impact units", value: (i) => E.impact_units[i] },
    { key: "usd", label: "Revenue at risk (USD)", value: (i) => Math.round(E.revenue_at_risk[i]) },
    { key: "status", label: "Status", value: (i) => STATUS_LABEL[status(i)] },
    { key: "note", label: "Note", value: (i) => note(i) },
  ];

  // ---- cause groups
  const groups = useMemo(() => {
    const g = new Map<string, { group: string; rule: string; n: number; usd: number; action: string }>();
    for (const i of rows.filter((x) => (!cause || E.rule[x] === cause) && (st === "all" || status(x) !== "resolved"))) {
      const cur = g.get(E.group[i]) ?? { group: E.group[i], rule: E.rule[i], n: 0, usd: 0, action: E.action[i] };
      cur.n++;
      cur.usd += E.revenue_at_risk[i];
      g.set(E.group[i], cur);
    }
    return [...g.values()].sort((a, b) => b.usd - a.usd);
  }, [rows, cause, st, status, E]);

  // ---- where the risk sits: family x cause (region x cause when one family is chosen; SKU x cause below that)
  const heat = useMemo(() => {
    const dim: "family" | "region" | "SKU" = filters.family === null ? "family" : filters.region === null ? "region" : "SKU";
    const label = (i: number) => {
      const s = E.series[i];
      if (dim === "family") return m.dims.families.name[E.family[i]];
      if (dim === "region") return m.dims.regions[E.region[i]];
      return s >= 0 ? m.dims.skus.id[m.sSku[s]] : m.dims.families.code[E.family[i]];
    };
    const order = (l: string) => (dim === "family" ? m.dims.families.name.indexOf(l) : dim === "region" ? m.dims.regions.indexOf(l) : 0);
    const cells = new Map<string, Map<string, number>>();
    for (const i of rows) {
      const l = label(i);
      const row = cells.get(l) ?? new Map<string, number>();
      row.set(E.rule[i], (row.get(E.rule[i]) ?? 0) + E.revenue_at_risk[i]);
      cells.set(l, row);
    }
    const lines = [...cells.entries()]
      .map(([l, r]) => ({ label: l, cells: r, total: [...r.values()].reduce((a, b) => a + b, 0) }))
      .sort((a, b) => (dim === "SKU" ? b.total - a.total : order(a.label) - order(b.label)))
      .slice(0, 12);
    const cols = rules.map((r) => r.key);
    const max = Math.max(1e-9, ...lines.flatMap((l) => [...l.cells.values()]));
    const top = lines.length ? lines.reduce((a, b) => (b.total > a.total ? b : a)) : null;
    const topRule = top ? [...top.cells.entries()].sort((a, b) => b[1] - a[1])[0] : null;
    const second = top ? lines.filter((l) => l !== top).reduce<typeof top | null>((a, b) => (!a || b.total > a.total ? b : a), null) : null;
    return {
      dim,
      lines,
      cols,
      max,
      facts: {
        dim,
        rowsN: lines.length,
        total: facts.total,
        top: top && topRule ? { label: top.label, usd: top.total, share: facts.total > 0 ? top.total / facts.total : 0, rule: ruleMany(E, topRule[0]), ruleShare: top.total > 0 ? topRule[1] / top.total : 0 } : null,
        second: second ? { label: second.label, usd: second.total, share: facts.total > 0 ? second.total / facts.total : 0 } : null,
      },
    };
  }, [rows, E, m, filters.family, filters.region, rules, facts.total]);

  // six warm-grey steps; --hist-5 is skipped because neither ink nor paper text reaches 4.5:1 on it
  const RAMP = [1, 2, 3, 4, 6, 7];
  const step = (v: number) => Math.min(5, Math.max(0, Math.ceil((v / heat.max) * 6) - 1));
  const resolveNext = (i: number) => {
    write(i, "resolved");
    const after = shown.filter((x) => x !== i && status(x) !== "resolved");
    const pos = shown.indexOf(i);
    const next = shown.slice(pos + 1).find((x) => status(x) !== "resolved") ?? after[0] ?? null;
    pick(next);
  };

  // the tabs print each rule's amount rounded so the six add up to the "All causes" total (largest remainder)
  const ruleTabs = [{ key: "", title: "All causes", n: rows.length, usd: facts.total, usdShown: facts.total, resolved: byStatus.resolved }, ...rules];
  const maxRule = Math.max(1e-9, ...rules.map((r) => r.usd));

  return (
    <>
      <Lede
        headline={headline}
        standfirst={standfirst}
        figure={
          <HeroFigure
            label="Revenue at risk, forecast window"
            value={fmtMoney(facts.total)}
            visual={
              rows.length > 0 ? (
                <Meter
                  ariaLabel={`Review progress: ${fmtInt(byStatus.resolved)} resolved, ${fmtInt(byStatus.acknowledged)} in review, ${fmtInt(byStatus.new)} new, by revenue at risk`}
                  segments={[
                    { value: usdBy.resolved, tone: "good", label: `Resolved ${fmtMoney(usdBy.resolved)}` },
                    { value: usdBy.acknowledged, tone: "warn", label: `In review ${fmtMoney(usdBy.acknowledged)}` },
                    { value: usdBy.new, tone: "rest", label: `New ${fmtMoney(usdBy.new)}` },
                  ]}
                />
              ) : undefined
            }
            context={
              rows.length > 0 ? (
                <span className="g3-review-line">
                  <span>
                    <i className="good" aria-hidden="true" />
                    <b>{fmtInt(byStatus.resolved)}</b> resolved
                  </span>
                  <span>
                    <i className="warn" aria-hidden="true" />
                    <b>{fmtInt(byStatus.acknowledged)}</b> in review
                  </span>
                  <span>
                    <i className="rest" aria-hidden="true" />
                    <b>{fmtInt(byStatus.new)}</b> new
                  </span>
                  {facts.fcRevenue > 0 && <span className="g3-share">{fmtPct(facts.total / facts.fcRevenue)} of the {fmtMoney(facts.fcRevenue)} forecast revenue</span>}
                </span>
              ) : (
                "Nothing at risk in this selection."
              )
            }
            info={{
              what: "Forecast-window revenue that depends on a planner's judgement: the sum of every flagged series' revenue at risk in the selection. The meter splits it by your review status.",
              how: "Each rule prices its own risk (listed at the foot of the view): a lost account at its pre-loss level × the window months × price, an in-window event at the latent demand it removes × price, and so on. Status and notes are kept in this browser only.",
              source: "exceptions.json, forecast.json (price × forecast for the share)",
            }}
          />
        }
      />

      {rows.length > 0 && (
      <nav className="g3-causes" aria-label="Filter the inbox by cause" style={{ ["--n" as string]: ruleTabs.length }}>
        {ruleTabs.map((r) => (
          <button
            key={r.key || "all"}
            type="button"
            className="g3-cause"
            aria-pressed={cause === r.key}
            onClick={() => setParam({ cause: r.key || null, grp: null, case: null }, true)}
            title={r.key ? E.rules[r.key]?.at_risk.replace(/ x /g, " × ") : "Every rule"}
          >
            <span className="nm">{r.title}</span>
            <span className="amt">{fmtMoney(r.usdShown)}</span>
            <span className="n">
              {fmtInt(r.n)} {r.n === 1 ? "case" : "cases"}
              {r.resolved > 0 ? `, ${fmtInt(r.resolved)} resolved` : ""}
            </span>
            <i className="b" style={{ width: `${r.key ? Math.max(2, (r.usd / maxRule) * 100) : 100}%` }} aria-hidden="true" />
          </button>
        ))}
      </nav>
      )}

      <div className={`g3-work ${open !== null && wide ? "" : "solo"}`}>
        <Module
          title={grouped ? `${fmtInt(groups.length)} cause ${groups.length === 1 ? "group" : "groups"} behind ${fmtInt(groups.reduce((a, g) => a + g.n, 0))} cases` : listTitle}
          dek={
            grouped
              ? "One row per cause: an event or a rule whose cases share one action. Click a group to list its cases."
              : `Ranked by forecast-window revenue at risk${st === "open" ? "; resolved cases are hidden" : ""}. Click a case to open its file${wide ? " on the right" : ""}.`
          }
          tools={
            <>
              <Segmented ariaLabel="Show" size="sm" value={grouped ? "groups" : "cases"} onChange={(v) => setParam({ xg: v === "groups" ? "1" : null }, true)} options={[{ value: "cases", label: "Cases" }, { value: "groups", label: "Cause groups" }]} />
              <Segmented ariaLabel="Status filter" size="sm" value={st} onChange={(v) => setParam({ st: v === "all" ? "all" : null }, true)} options={[{ value: "open", label: "Open" }, { value: "all", label: "All" }]} />
            </>
          }
          info={{
            what: "Management by exception: lost accounts, events inside the window, recent customer switches, cold starts, end of life and forecasts that move more than 25% against last year. Each row is one series and one rule.",
            how: "Deterministic rules over the pipeline outputs (src/celeris/export/exceptions.py); the rank is by revenue at risk inside the current filters. The CSV holds the full cause and action text, your status and note.",
            source: "exceptions.json",
          }}
        >
          {grpParam && !grouped && (
            <p className="g3-active-group">
              Cases of <b>{tidy(grpParam)}</b>
              <button type="button" className="g3-clear" onClick={() => setParam({ grp: null }, true)} aria-label="Show every cause group">
                <Close size={11} /> Clear
              </button>
            </p>
          )}
          {grouped ? (
            groups.length ? (
              <BarTable
                ariaLabel="Cause groups ranked by revenue at risk"
                rows={groups}
                rowKey={(g) => g.group}
                onRow={(g) => setParam({ grp: g.group, xg: null, case: null }, true)}
                bar={{ value: (g) => g.usd, tone: "history", leader: (g) => g === groups[0] }}
                cols={[
                  { key: "g", label: "Cause group", kind: "label", value: (g) => tidy(g.group), width: "30%" },
                  { key: "n", label: "Series", kind: "num", value: (g) => fmtInt(g.n), width: "10%" },
                  { key: "b", label: "At risk", kind: "bar" },
                  { key: "u", label: "USD", kind: "num", value: (g) => fmtMoney(g.usd), width: "13%" },
                  { key: "a", label: "One action for the group", kind: "text", value: (g) => g.action, width: "32%", hideNarrow: true },
                ]}
              />
            ) : (
              <Empty title="No cause group in view.">Every case in this selection is resolved, or no rule flags it. Switch to All to see resolved cases.</Empty>
            )
          ) : shown.length ? (
            <>
              <div className="table-wrap">
                <table className="g3-xt" aria-label="Exceptions ranked by revenue at risk">
                  <colgroup>
                    <col className="c-rk" />
                    <col className="c-who" />
                    <col className="c-why" />
                    <col className="c-amt" />
                    <col className="c-st" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th scope="col" className="r">
                        #
                      </th>
                      <th scope="col">Series</th>
                      <th scope="col">Why it is flagged</th>
                      <th scope="col" className="r">
                        At risk
                      </th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.map((i) => {
                      const w = where(i);
                      const sStatus = status(i);
                      return (
                        <tr
                          key={i}
                          className={open === i ? "sel" : undefined}
                          aria-current={open === i ? "true" : undefined}
                          tabIndex={0}
                          onClick={() => pick(i)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              pick(i);
                            }
                          }}
                        >
                          <td className="rk">{rank.get(i)}</td>
                          <td>
                            <span className="who">
                              <span className="id">{w.id}</span> · {w.region}
                            </span>
                            <span className="sub" title={w.desc}>
                              {w.desc}
                            </span>
                            <span className="g3-st-inline">
                              <StatusPill tone={STATUS_TONE[sStatus]}>{STATUS_LABEL[sStatus]}</StatusPill>
                            </span>
                          </td>
                          <td>
                            <RuleChip title={E.rules[E.rule[i]]?.at_risk}>{ruleTitle(E, E.rule[i])}</RuleChip>
                            <span className="why" title={reasonFull(E, i)}>
                              {reasonRow(E, i)}
                            </span>
                          </td>
                          <td className="r">
                            <span className="amt">
                              {fmtMoney(E.revenue_at_risk[i])}
                              <i style={{ width: `${Math.max(4, (E.revenue_at_risk[i] / maxUsd) * 100)}%` }} aria-hidden="true" />
                            </span>
                          </td>
                          <td>
                            <StatusPill tone={STATUS_TONE[sStatus]}>{STATUS_LABEL[sStatus]}</StatusPill>
                            {note(i) && (
                              <span className="g3-has-note" title={note(i)}>
                                Note
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="dt-foot">
                <span>
                  {fmtInt(pg * PAGE + 1)}–{fmtInt(pg * PAGE + view.length)} of {fmtInt(shown.length)} cases
                </span>
                <span className="toolbar">
                  {pages > 1 && (
                    <>
                      <Button size="sm" disabled={pg === 0} onClick={() => setPage(pg - 1)}>
                        Previous
                      </Button>
                      <Button size="sm" disabled={pg >= pages - 1} onClick={() => setPage(pg + 1)}>
                        Next
                      </Button>
                    </>
                  )}
                  <Button size="sm" onClick={() => download(`exceptions${cause ? `_${cause}` : ""}.csv`, toCsv(shown, csvCols))} title="Every case in this list with cause, action, status and note">
                    <Download size={13} /> CSV
                  </Button>
                </span>
              </div>
            </>
          ) : rows.length ? (
            <Empty title={st === "open" ? "Every case in this list is resolved." : "No case matches."} action={st === "open" ? <Button size="sm" onClick={() => setParam({ st: "all" }, true)}>Show resolved cases</Button> : undefined}>
              {st === "open" ? "Your statuses are kept in this browser." : "Choose another cause above."}
            </Empty>
          ) : (
            <Empty title="No exception in this selection." action={<Button size="sm" onClick={() => setFilters({ family: null, sku: null, region: null, channel: null, customer: null })}>Reset the filters</Button>} />
          )}
        </Module>

        {open !== null && wide && (
          <CaseFile
            mode="dock"
            E={E}
            row={open}
            rank={rank.get(open) ?? null}
            n={rows.length}
            status={status(open)}
            note={note(open)}
            onStatus={(v) => write(open, v)}
            onNote={(t) => write(open, status(open), t)}
            onResolveNext={status(open) !== "resolved" ? () => resolveNext(open) : undefined}
            onClose={() => pick(null)}
            onLineage={(s, t) => setLineage({ s, t })}
          />
        )}
      </div>
      {open !== null && !wide && !lineage && (
        <CaseFile
          mode="drawer"
          E={E}
          row={open}
          rank={rank.get(open) ?? null}
          n={rows.length}
          status={status(open)}
          note={note(open)}
          onStatus={(v) => write(open, v)}
          onNote={(t) => write(open, status(open), t)}
          onResolveNext={status(open) !== "resolved" ? () => resolveNext(open) : undefined}
          onClose={() => pick(null)}
          onLineage={(s, t) => setLineage({ s, t })}
        />
      )}
      {lineage && <LineageDrawer series={lineage.s} month={lineage.t} onClose={() => setLineage(null)} />}

      {heat.lines.length > 1 && (
        <Module
          title={render(WHERE_TEMPLATES.title, heat.facts).text}
          dek={`Revenue at risk by ${heat.dim} and cause, forecast window ${monthName(m.months[m.w0])} – ${monthName(m.months[m.nMonths - 1])}. Darker cells hold more; ${heat.dim === "SKU" ? "" : `click a ${heat.dim} to filter the page, `}click a cause to open its tab.`}
          info={{
            what: `Where the revenue at risk sits: one row per ${heat.dim}${heat.dim === "SKU" ? " (the 12 largest)" : ""}, one column per cause, the total on the right.`,
            how: "Exact sums of exceptions.json revenue_at_risk inside the filters; the warm-grey scale runs from the smallest to the largest cell.",
            source: "exceptions.json",
          }}
        >
          <div className="table-wrap">
            <table className="g3-heat" aria-label={`Revenue at risk by ${heat.dim} and cause`}>
              <thead>
                <tr>
                  <th scope="col" className="l">
                    {heat.dim === "SKU" ? "SKU" : heat.dim === "family" ? "Family" : "Region"}
                  </th>
                  {heat.cols.map((c) => (
                    <th key={c} scope="col">
                      <button type="button" className="g3-colbtn" aria-pressed={cause === c} onClick={() => setParam({ cause: cause === c ? null : c, grp: null, case: null }, true)}>
                        {ruleTitle(E, c)}
                      </button>
                    </th>
                  ))}
                  <th scope="col" className="tot">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {heat.lines.map((l) => (
                  <tr key={l.label}>
                    <th scope="row" className="l">
                      {heat.dim === "SKU" ? (
                        <span className="id">{l.label}</span>
                      ) : (
                        <button
                          type="button"
                          className="g3-rowbtn"
                          onClick={() => setFilters({ ...filters, ...(heat.dim === "family" ? { family: m.dims.families.name.indexOf(l.label), sku: null } : { region: m.dims.regions.indexOf(l.label) }) })}
                        >
                          {l.label}
                        </button>
                      )}
                    </th>
                    {heat.cols.map((c) => {
                      const v = l.cells.get(c) ?? 0;
                      const k = step(v);
                      return (
                        <td key={c} className={v > 0 ? (k >= 4 ? "dark" : "lite") : "nil"} style={v > 0 ? { background: `var(--hist-${RAMP[k]})` } : undefined} title={`${l.label}, ${ruleTitle(E, c)}: ${fmtMoney(v)}`}>
                          {v > 0 ? fmtMoney(v, 1) : "–"}
                        </td>
                      );
                    })}
                    <td className="tot">{fmtMoney(l.total, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="g3-scale" aria-hidden="true">
            <span>{fmtMoney(Math.min(...heat.lines.flatMap((l) => [...l.cells.values()])), 1)}</span>
            {RAMP.map((k) => (
              <i key={k} style={{ background: `var(--hist-${k})` }} />
            ))}
            <span>{fmtMoney(heat.max, 1)} at risk in one cell</span>
          </div>
        </Module>
      )}

      <aside className="colophon" aria-label="How each rule prices its risk">
        {Object.entries(E.rules).map(([k, r]) => (
          <span key={k}>
            <b>{tidy(r.title)}</b> {r.at_risk.replace(/ x /g, " × ")}
          </span>
        ))}
        <span>
          <b>Status and notes</b> kept in this browser only
        </span>
      </aside>
    </>
  );
}
