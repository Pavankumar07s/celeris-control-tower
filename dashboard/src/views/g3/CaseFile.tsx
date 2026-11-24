// The exception case file: docked beside the inbox ledger on wide screens, a drawer below 1181px.
// Anatomy (design system 5.6): kicker -> computed serif headline -> identity line -> three figures -> the
// series on the shared timeline (columns for one series) with the rule's evidence drawn on it -> why it is
// flagged -> recommended action (serif) -> facts -> status, note, actions.
import { useCallback, useMemo } from "react";
import type { EChartsCoreOption } from "echarts/core";
import { useApp } from "../../app/context";
import type { Annotation } from "../../charts/Annotations";
import { TimelineChart } from "../../charts/TimelineChart";
import { eventTitle, timelineAnnotations, type TimelineLine, type TimelineModel, type TimelineSpec } from "../../charts/timeline";
import { Button, Segmented } from "../../components/controls";
import { Close } from "../../components/icons";
import { Key, timelineKey, type KeyItem } from "../../components/Module";
import { Drawer } from "../../components/overlays";
import { forecastAgg, historyAgg } from "../../data/aggregate";
import { fmtInt, fmtMoney, fmtNum, fmtSigned, fmtSignedPct, monthName } from "../../data/format";
import { historyPrice, NO_FILTERS, selectRuns, selectSegments, type Filters } from "../../data/model";
import type { ExceptionFile } from "../../data/types";
import { cycleWords } from "../../insights/explorer";
import { cap } from "../../insights/headlines";
import { caseHeadline, caseSpan, lostFacts, reasonFull, ruleOne, ruleTitle, STATUS_LABEL, type CaseFacts, type Status } from "../../insights/inbox";

// ---- the case chart: the shared timeline plus one evidence layer (the at-risk area) -------------------------
function CaseTimeline({ spec, annotate, height, ariaLabel, risk, fill }: { spec: Omit<TimelineSpec, "narrow" | "height">; annotate: (tm: TimelineModel) => Annotation[]; height: number; ariaLabel: string; risk: (number | null)[] | null; fill: string }) {
  const patch = useCallback(
    (option: EChartsCoreOption, tm: TimelineModel): EChartsCoreOption => {
      if (!risk) return option;
      const data: number[][] = [];
      for (let i = Math.max(tm.start, spec.m.w0); i < tm.start + tm.labels.length; i++) {
        const v = risk[i];
        if (v !== null && v !== undefined && v > 0) data.push([i - tm.start, v]);
      }
      const o = option as { series: Record<string, unknown>[] };
      return {
        ...option,
        series: [
          ...o.series,
          {
            name: "At risk if it returns",
            type: "custom",
            data,
            silent: true,
            z: 1,
            renderItem: (_p: unknown, api: { value: (d: number) => number; coord: (v: number[]) => number[]; size: (v: number[]) => number[] }) => {
              const bw = api.size([1, 0])[0];
              const [x, y1] = api.coord([api.value(0), api.value(1)]);
              const y0 = api.coord([api.value(0), 0])[1];
              return { type: "rect", shape: { x: x - bw / 2, y: y1, width: bw + 0.6, height: y0 - y1 }, style: { fill } };
            },
          },
        ],
      } as EChartsCoreOption;
    },
    [risk, fill, spec.m.w0],
  );
  return <TimelineChart spec={spec} annotate={annotate} height={height} ariaLabel={ariaLabel} patch={patch} />;
}

const UNITS_LABEL: Record<string, string> = {
  lost_account: "Units if it returns",
  window_event: "Units removed",
  recent_switch: "Units of level change",
  cold_start: "Forecast units",
  end_of_life: "Phase-out units",
  yoy_shift: "Change in units",
};

export interface CaseFileProps {
  E: ExceptionFile;
  row: number;
  /** Position of the case in the ranked selection (1-based) and the size of the selection. */
  rank: number | null;
  n: number;
  status: Status;
  note: string;
  onStatus: (s: Status) => void;
  onNote: (text: string) => void;
  /** Resolve this case and open the next open one (absent when there is none). */
  onResolveNext?: () => void;
  onClose: () => void;
  onLineage: (series: number, month: number) => void;
  mode: "dock" | "drawer";
}

export function CaseFile(p: CaseFileProps) {
  const { m, theme, measure, go } = useApp();
  const { E, row } = p;
  const s = E.series[row];
  const usd = measure === "usd";
  const sku = m.sSku[s];
  const skuId = m.dims.skus.id[sku];
  const region = m.dims.regions[m.sRegion[s]];
  const customer = m.dims.customers[m.sCustomer[s]];
  const rule = E.rule[row];
  const f: Filters = useMemo(() => ({ ...NO_FILTERS, family: m.sFamily[s], sku: m.sSku[s], region: m.sRegion[s] }), [m, s]);
  const segs = useMemo(() => selectSegments(m, f), [m, f]);
  const runs = useMemo(() => selectRuns(m, f), [m, f]);
  const h = useMemo(() => historyAgg(m, segs, measure), [m, segs, measure]);
  const fc = useMemo(() => forecastAgg(m, runs, measure), [m, runs, measure]);
  const fcU = useMemo(() => (measure === "units" ? fc.fc : forecastAgg(m, runs, "units").fc), [m, runs, measure, fc]);

  // ---- facts for the headline and the evidence layer
  const facts = useMemo<CaseFacts>(() => {
    // a lost account's last order and silent months: the exported cause first (the same variable the inbox
    // row and the brief read), else the last month of the series with ordered demand
    let lastOrder: string | null = null;
    let silent: number | null = null;
    if (rule === "lost_account") {
      const lf = lostFacts(E.cause[row]);
      if (lf) {
        lastOrder = lf.lastOrder;
        silent = lf.silent;
      } else
        for (let t = m.asOf; t >= 0; t--)
          if (h.demand[t] > 0) {
            lastOrder = m.months[t];
            silent = m.asOf - t;
            break;
          }
    }
    // end of life: the forecast in the EOL month and whether every later month is zero
    const eolLabel = m.dims.skus.eol[sku];
    const te = eolLabel ? m.months.indexOf(eolLabel) : -1;
    let eolUnits: number | null = null;
    let zeroAfterEol = false;
    if (te >= m.w0 && te < m.nMonths) {
      // forecast arrays are indexed from the first forecast month
      eolUnits = fcU[te - m.w0] ?? 0;
      zeroAfterEol = true;
      for (let t = te + 1; t < m.nMonths; t++) if ((fcU[t - m.w0] ?? 0) >= 0.5) zeroAfterEol = false;
    }
    const switchMonth = m.dims.series.switch_month[s];
    let fromCustomer: string | null = null;
    if (switchMonth) {
      const t = m.months.indexOf(switchMonth);
      const before = m.segOfSeries[s].filter((g) => m.gStart[g] < t).sort((a, b) => m.gStart[b] - m.gStart[a])[0];
      if (before !== undefined) fromCustomer = m.dims.customers[m.gCustomer[before]];
    }
    const evId = E.group[row].match(/^(EV-\d+)/)?.[1] ?? E.cause[row].match(/^(EV-\d+)/)?.[1];
    const ei = evId ? m.dims.events.id.indexOf(evId) : -1;
    return {
      rule,
      silent,
      sku: skuId,
      region,
      customer,
      lastOrder,
      launch: m.dims.skus.launch[sku],
      eol: m.dims.skus.eol[sku],
      eolUnits,
      zeroAfterEol,
      replaces: m.dims.skus.replaces[sku],
      metric: E.metric[row],
      switchMonth,
      fromCustomer,
      eventName: ei >= 0 ? eventTitle(m.dims.events.description[ei]) : null,
      units: Math.abs(E.impact_units[row]),
      span: caseSpan(m, E, row),
      ruleTitle: ruleTitle(E, rule),
    };
  }, [m, E, row, rule, s, sku, skuId, region, customer, h, fcU]);
  const headline = caseHeadline(facts);
  // SKU codes never break at their hyphen
  const title = headline.split(/([A-Z]{3}-\d{3})/).map((part, k) => (k % 2 ? <span key={k} className="nb">{part}</span> : part));
  const kicker = p.rank !== null ? `Case ${fmtInt(p.rank)} of ${fmtInt(p.n)}, ${ruleOne(E, rule)}` : `Case outside the filters, ${ruleOne(E, rule)}`;

  // ---- evidence drawn on the series: pre-loss level and the at-risk area (lost account), the last-12
  // average (forecast far from last year); a value per absolute month in the active measure
  const first = Math.max(0, m.asOf - 35);
  const priceAt = useCallback(
    (t: number): number => {
      if (!usd) return 1;
      if (t <= m.asOf) return historyPrice(m, sku, t);
      const r = runs[0];
      if (r === undefined) return NaN;
      const k = t - m.rStart[r];
      return k >= 0 && k < m.rLen[r] ? m.price[m.rOff[r] + k] : NaN;
    },
    [m, sku, runs, usd],
  );
  const evidence = useMemo(() => {
    const lines: TimelineLine[] = [];
    let risk: (number | null)[] | null = null;
    const extra: KeyItem[] = [];
    if (rule === "lost_account" && E.metric[row] > 0) {
      const level = E.metric[row];
      const data: (number | null)[] = new Array(m.nMonths).fill(null);
      for (let t = first; t < m.nMonths; t++) {
        const v = level * priceAt(t);
        data[t] = Number.isFinite(v) ? v : null;
      }
      lines.push({ name: "pre-loss level", data, color: theme.crit, dashed: true });
      risk = data.map((v, t) => (t >= m.w0 ? v : null));
      extra.push({ kind: "dash", color: "var(--crit)", label: "Pre-loss level" }, { kind: "box", color: "var(--loss-fill)", label: "At risk if it returns" });
    }
    if (rule === "yoy_shift") {
      let a = 0;
      for (let t = m.asOf - 11; t <= m.asOf; t++) a += h.demand[t];
      const avg = a / 12;
      const data: (number | null)[] = new Array(m.nMonths).fill(null);
      for (let t = m.asOf - 11; t <= Math.min(m.nMonths - 1, m.asOf + 12); t++) data[t] = avg;
      lines.push({ name: "last-12 monthly average", data, color: theme.ink3, dashed: true });
      extra.push({ kind: "dash", color: "var(--ink-3)", label: "Last 12 months, average" });
    }
    return { lines, risk, extra };
  }, [rule, E, row, m, first, priceAt, theme, h]);

  const spec = useMemo<Omit<TimelineSpec, "narrow" | "height">>(
    () => ({
      m,
      theme,
      measure,
      lens: "orders",
      filters: f,
      hist: { shipped: h.shipped, demand: h.demand, imputed: h.imputed, cells: h.cells, missing: h.missing, unknownDemand: h.unknownDemand },
      fc: { value: fc.fc, p10: fc.p10, p50: fc.p50, p90: fc.p90 },
      range: [first, m.nMonths - 1],
      columns: true,
      lines: evidence.lines,
    }),
    [m, theme, measure, f, h, fc, first, evidence],
  );
  const fv = useCallback((v: number) => (usd ? fmtMoney(v, 1) : `${fmtNum(v, 1)} units`), [usd]);
  const annotate = useCallback(
    (tm: TimelineModel): Annotation[] => {
      const out = timelineAnnotations({ spec: spec as TimelineSpec, model: tm, exceptions: E, exceptionRows: [row], include: rule === "window_event" ? ["divider", "window"] : ["divider"] });
      const vis = (t: number) => t >= tm.start && t < tm.start + tm.labels.length;
      const at = (label: string | null) => (label ? m.months.indexOf(label) : -1);
      if (rule === "lost_account" && facts.lastOrder) {
        const t = at(facts.lastOrder);
        if (vis(t)) out.push({ id: "last-order", at: t - tm.start, value: h.demand[t], title: `Last order ${monthName(facts.lastOrder)}`, text: fv(h.demand[t]), anchor: "above", tone: "past", align: "left", priority: 1 });
      }
      if (rule === "recent_switch" && facts.switchMonth) {
        const t = at(facts.switchMonth);
        if (vis(t) && t <= m.asOf) out.push({ id: "switch", at: t - tm.start, value: h.demand[t], title: `Customer switch, ${monthName(facts.switchMonth)}`, text: facts.fromCustomer ? `${facts.fromCustomer} to ${customer}` : customer, anchor: "above", tone: "past", align: "left", priority: 1 });
      }
      if (rule === "cold_start" && facts.launch) {
        const t = at(facts.launch);
        if (vis(t) && t >= m.w0) out.push({ id: "launch", at: t - tm.start, value: tm.fc[t] ?? 0, title: `Planned launch, ${monthName(facts.launch)}`, text: facts.replaces ? `replaces ${facts.replaces}` : "no predecessor named", anchor: "above", tone: "future", align: "left", priority: 1 });
      }
      if (rule === "end_of_life" && facts.eol) {
        const t = at(facts.eol);
        if (vis(t) && t >= m.w0) out.push({ id: "eol", at: t - tm.start, value: tm.fc[t] ?? 0, title: `End of life, ${monthName(facts.eol)}`, text: "the forecast runs to zero", anchor: "above", tone: "future", align: "left", priority: 1 });
      }
      if (rule === "yoy_shift") {
        const t = Math.min(m.nMonths - 1, m.asOf + 12);
        if (vis(t)) out.push({ id: "yoy", at: t - tm.start, value: tm.fc[t] ?? 0, title: `Next 12 months ${fmtSignedPct(E.metric[row], 0)}`, text: "against the last 12", anchor: "above", tone: "future", align: "right", priority: 1 });
      }
      return out;
    },
    [spec, E, row, rule, facts, m, h, customer, fv],
  );

  let anyLost = false;
  for (let t = first; t <= m.asOf && !anyLost; t++) anyLost = h.demand[t] - (h.shipped[t] + h.unknownDemand[t]) > 0.5;
  const keyItems = timelineKey({ columns: true, lost: anyLost, rebuilt: false, extra: evidence.extra });
  const a0 = m.months[Math.min(E.start[row], m.nMonths - 1)];
  const a1 = m.months[Math.min(E.end[row], m.nMonths - 1)];
  const chartAria = `${headline}. ${usd ? "Revenue" : "Units"} per month for ${skuId} in ${region}, ${monthName(m.months[first])} – ${monthName(m.months[m.nMonths - 1])}: history as ink columns, the forecast as orange columns with P10–P90 whiskers.`;
  const units = E.impact_units[row];
  const cycle = m.dims.series.cycle[s];
  const life = [m.dims.skus.status[sku], m.dims.skus.launch[sku] ? `${m.months.indexOf(m.dims.skus.launch[sku] as string) > m.asOf ? "launches" : "launched"} ${monthName(m.dims.skus.launch[sku] as string)}` : null, m.dims.skus.eol[sku] ? `EOL ${monthName(m.dims.skus.eol[sku] as string)}` : null].filter(Boolean).join(", ");
  const lineageMonth = rule === "lost_account" && facts.lastOrder ? m.months.indexOf(facts.lastOrder) : segs.length ? Math.min(m.asOf, Math.max(...segs.map((g) => m.gStart[g] + m.gLen[g] - 1))) : -1;
  const target = { fam: m.dims.families.code[m.sFamily[s]], sku: skuId, reg: region, ch: null, cust: null, case: null, cause: null, st: null, xg: null, grp: null, cell: null };

  const body = (
    <>
      <div className="trio g3-case-trio" role="group" aria-label="Case figures">
        <div>
          <span>At risk</span>
          <b>{fmtMoney(E.revenue_at_risk[row])}</b>
        </div>
        <div>
          <span>{UNITS_LABEL[rule] ?? "Units"}</span>
          <b>{rule === "yoy_shift" ? fmtSigned(units) : fmtInt(Math.abs(units))}</b>
        </div>
        <div>
          <span>Months</span>
          <b className="span" title={`${a0 === a1 ? 1 : m.months.indexOf(a1) - m.months.indexOf(a0) + 1} months`}>
            {facts.span}
          </b>
        </div>
      </div>
      <div className="g3-case-chart">
        <Key items={keyItems} ariaLabel="Chart key" />
        <CaseTimeline spec={spec} annotate={annotate} height={196} ariaLabel={chartAria} risk={evidence.risk} fill={theme.lossFill} />
      </div>
      <section>
        <h3>Why it is flagged</h3>
        <p className="g3-why">{reasonFull(E, row)}</p>
      </section>
      <section>
        <h3>Recommended action</h3>
        <p className="action">{E.action[row]}</p>
      </section>
      <dl className="facts">
        <dt>Customer</dt>
        <dd>{customer}</dd>
        <dt>Channel</dt>
        <dd>{m.dims.channels[m.sChannel[s]]}</dd>
        <dt>Ordering cycle</dt>
        <dd>
          <span title={cycle ? `Cycle code ${cycle}` : undefined}>{cap(cycleWords(cycle))}</span>
        </dd>
        <dt>Family</dt>
        <dd>{m.dims.families.name[m.sFamily[s]]}</dd>
        {life && (
          <>
            <dt>Lifecycle</dt>
            <dd>{life}</dd>
          </>
        )}
        <dt>At risk means</dt>
        <dd>{(E.rules[rule]?.at_risk ?? "").replace(/ x /g, " × ")}</dd>
      </dl>
      <section className="g3-review">
        <h3 id={`st-${row}`}>Review</h3>
        <Segmented
          ariaLabel="Case status"
          value={p.status}
          onChange={p.onStatus}
          options={(["new", "acknowledged", "resolved"] as Status[]).map((v) => ({ value: v, label: STATUS_LABEL[v] }))}
        />
        <label className="g3-note">
          <span>Note for the next planner, kept in this browser</span>
          <textarea value={p.note} onChange={(e) => p.onNote(e.target.value)} rows={2} placeholder="What you checked, who you asked, what changed" />
        </label>
        <div className="g3-actions">
          {p.onResolveNext && (
            <Button variant="primary" onClick={p.onResolveNext}>
              Resolve, next case
            </Button>
          )}
          <Button onClick={() => go("explorer", target)}>Demand explorer</Button>
          <Button onClick={() => go("forecast", target)}>Forecast &amp; accuracy</Button>
          {lineageMonth >= 0 && (
            <Button variant="quiet" onClick={() => p.onLineage(s, lineageMonth)} title={`Raw value, rule and cleaned value for ${monthName(m.months[lineageMonth])}`}>
              Cell lineage, {monthName(m.months[lineageMonth])}
            </Button>
          )}
        </div>
      </section>
    </>
  );

  const sub = (
    <>
      <span className="id">{skuId}</span> · {m.dims.skus.description[sku] ?? "no description"} · {region}
    </>
  );

  if (p.mode === "drawer")
    return (
      <Drawer eyebrow={kicker} title={title} sub={sub} onClose={p.onClose} width={600}>
        {body}
      </Drawer>
    );
  return (
    <aside className="g3-case" aria-label={`Case file: ${headline}`}>
      <div className="g3-case-head">
        <span className="kicker">{kicker}</span>
        <button type="button" className="icon-btn" onClick={p.onClose} aria-label="Close the case file">
          <Close />
        </button>
      </div>
      <h2 className="g3-case-title" aria-live="polite">
        {title}
      </h2>
      <div className="g3-case-sub">{sub}</div>
      {body}
    </aside>
  );
}
