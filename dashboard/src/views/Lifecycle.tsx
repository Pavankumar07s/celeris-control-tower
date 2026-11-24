// O4 Lifecycle: launches and end of life (prediction).  Question: which SKUs appear or disappear inside the
// window, do their forecasts respect business rule 5, and how much of the retiring volume do successors carry?
//  lede (computed headline + standfirst | hero: successor run-rate against the predecessors' last 12 months)
//  -> lifecycle map (Gantt, grouped; rule-5 checks)  -> handovers (one panel per predecessor -> successor)
//  -> recent launches still ramping (bar table)  -> colophon.
import { useMemo } from "react";
import { useApp } from "../app/context";
import { EChart } from "../charts/EChart";
import { HeroFigure, Ladder, Lede } from "../components/Figure";
import { KeyMark, Module, type KeyItem } from "../components/Module";
import { Empty } from "../components/states";
import { BarTable } from "../components/tables";
import { forecastAgg, historyAgg, sum } from "../data/aggregate";
import { fmtInt, fmtNum, fmtPct, monthName, monthSpan } from "../data/format";
import { joinList } from "../insights/headlines";
import { selectRuns, selectSegments, type Filters } from "../data/model";
import { render, selectionWords } from "../insights/headlines";
import { GANTT_TEMPLATES, HANDOVER_TEMPLATES, LIFE_TEMPLATES, RECENT_TEMPLATES, handovers, lifecycleSkus, type Handover, type RecentRow } from "../insights/lifecycle";
import { ganttOption, ganttRows, handoverOption, handoverPeak } from "./g2/lifecycleCharts";
import { Stamp } from "../components/controls";
import { useElementWidth } from "../app/hooks";
import "./g2/g2.css";

export default function Lifecycle() {
  const { m, theme, filters, setFilters } = useApp();
  const S = m.dims.skus;
  const sel = useMemo(() => selectionWords(m, filters), [m, filters]);
  const [wref, width] = useElementWidth();
  const narrow = width > 0 && width < 640;

  const skus = useMemo(() => lifecycleSkus(m, filters), [m, filters]);
  const pairs = useMemo(() => handovers(m, filters, skus), [m, filters, skus]);
  // one y-scale for every handover panel (side-by-side small multiples compare on a shared scale)
  const handPeak = useMemo(() => Math.max(1, ...pairs.map((p) => handoverPeak(m, p))), [m, pairs]);
  const rows = useMemo(() => ganttRows(m, skus, pairs), [m, skus, pairs]);
  const gantt = useMemo(() => ganttOption(theme, m, rows, narrow), [theme, m, rows, narrow]);

  // ---- rule 5 over every lifecycle SKU in the selection --------------------------------------------------------
  const rule = useMemo(() => {
    let afterEol = 0;
    let beforeLaunch = 0;
    let discUnits = 0;
    let nEol = 0;
    let nLaunch = 0;
    let nDisc = 0;
    for (const s of skus) {
      const g: Filters = { ...filters, family: m.skuFamily[s.k], sku: s.k };
      const fc = forecastAgg(m, selectRuns(m, g), "units").fc;
      if (s.kind === "eol" && s.eol !== null) {
        nEol++;
        for (let t = Math.max(m.w0, s.eol + 1); t < m.nMonths; t++) afterEol += fc[t - m.w0];
      }
      if (s.kind === "planned" && s.launch !== null) {
        nLaunch++;
        for (let t = m.w0; t < Math.min(s.launch, m.nMonths); t++) beforeLaunch += fc[t - m.w0];
      }
      if (s.kind === "discontinued") {
        nDisc++;
        discUnits += sum(fc);
      }
    }
    return { afterEol, beforeLaunch, discUnits, nEol, nLaunch, nDisc, ok: afterEol === 0 && beforeLaunch === 0 && discUnits === 0 };
  }, [skus, filters, m]);

  // ---- facts for the lede -------------------------------------------------------------------------------------------
  const fullPairs = pairs.filter((p) => p.pred !== null && p.succ !== null && p.succRuns > 0 && Number.isFinite(p.ratio));
  const runoffs = pairs.filter((p) => p.pred !== null && p.eol !== null && p.predRuns > 0);
  const predRate = sum(fullPairs.map((p) => p.predLast12));
  const succRate = sum(fullPairs.map((p) => p.succEnd));
  const predPts = [...new Set(pairs.filter((p) => p.pred !== null).map((p) => S.powertrain[p.pred as number] ?? "Universal"))];
  const facts = {
    sel,
    m,
    pairs,
    eolIn: pairs.filter((p) => p.pred !== null && p.eol !== null && p.eol >= m.w0 && p.eol < m.nMonths),
    launchIn: pairs.filter((p) => p.succ !== null && p.succRuns > 0 && p.launch !== null && p.launch >= m.w0 && p.launch < m.nMonths),
    recent: skus.filter((s) => s.kind === "recent").length,
    discontinued: skus.filter((s) => s.kind === "discontinued").length,
    ruleOk: rule.ok,
    ratio: predRate > 0 ? succRate / predRate : NaN,
    predRate,
    succRate,
    predPowertrain: predPts.length === 1 ? predPts[0] : null,
  };
  const headline = render(LIFE_TEMPLATES.headline, facts).text;
  const standfirst = render(LIFE_TEMPLATES.standfirst, facts).text;

  // ---- recent launches still ramping ----------------------------------------------------------------------------------
  const recent = useMemo<RecentRow[]>(
    () =>
      skus
        .filter((s) => s.kind === "recent")
        .map((s) => {
          const g: Filters = { ...filters, family: m.skuFamily[s.k], sku: s.k };
          const segs = selectSegments(m, g);
          const h = historyAgg(m, segs, "units");
          const fc = forecastAgg(m, selectRuns(m, g), "units");
          const last3 = sum(h.demand, m.asOf - 2, m.asOf + 1) / 3;
          const next12 = sum(fc.fc, 0, 12) / 12;
          return { k: s.k, id: s.id, launch: s.launch as number, series: new Set(segs.map((x) => m.gSeries[x])).size, last3, next12, ramp: last3 > 0 ? next12 / last3 : NaN };
        })
        .sort((a, b) => (b.ramp || 0) - (a.ramp || 0)),
    [skus, filters, m],
  );
  const topRamp = recent.length ? recent[0] : null;
  const has = (k: string) => skus.some((s) => s.kind === k);
  const ganttKey: (KeyItem | "sep")[] = [
    { kind: "box", color: "var(--hist-4)", label: "Life so far" },
    ...(has("recent") || has("eol") || has("discontinued") ? [{ kind: "triangle" as const, color: "var(--ink)", label: "Launch" }] : []),
    ...(has("discontinued") ? [{ kind: "box" as const, color: "var(--ink)", label: "End of life" }] : []),
    "sep" as const,
    { kind: "box", color: "var(--accent-tint)", label: "Life inside the window" },
    ...(has("planned") ? [{ kind: "ring" as const, color: "var(--accent)", label: "Planned launch" }] : []),
    ...(has("eol") ? [{ kind: "box" as const, color: "var(--accent)", label: "End of life inside the window" }] : []),
    ...(pairs.some((p) => p.pred !== null && p.succ !== null) ? [{ kind: "dot" as const, color: "var(--ink-3)", label: "Successor" }] : []),
  ];

  return (
    <>
      <Lede
        headline={headline}
        standfirst={standfirst}
        figure={
          fullPairs.length ? (
            <HeroFigure
              label={`Successors' volume by ${monthName(m.months[m.nMonths - 1])}`}
              value={fmtPct(facts.ratio, 0)}
              unit="of their predecessors"
              visual={<Ladder rows={fullPairs.map((p) => ({ label: `${p.succId} for ${p.predId}`, value: p.ratio, me: true }))} max={Math.max(1, ...fullPairs.map((p) => p.ratio))} format={(v) => fmtPct(v, 0)} foot="100% = the predecessor's average month over the last 12 actuals" />}
              context={`**${fmtNum(succRate)}** units a month in the last three forecast months, against **${fmtNum(predRate)}** a month the predecessors sold over the last 12 actual months`}
              info={{
                what: "How much of the retiring SKUs' volume their successors carry by the end of the window.",
                how: "Successor forecast, average of the last three window months, divided by the predecessor's unconstrained demand, average of the last 12 actual months, under the page's region, channel and customer filters.",
                source: "forecast.json, history.json, dims.json (replaces)",
              }}
            />
          ) : runoffs.length ? (
            <HeroFigure
              label="Run-off left before end of life"
              value={fmtNum(sum(runoffs.map((p) => p.predWindow)))}
              unit="units"
              context={`over ${runoffs.map((p) => `${monthSpan(m.months[m.w0], m.months[p.eol as number])}`).join(", ")}, against **${fmtNum(sum(runoffs.map((p) => p.predLast12)))}** a month over the last 12 actual months; zero from ${joinList(runoffs.map((p) => monthName(m.months[Math.min(m.nMonths - 1, (p.eol as number) + 1)])))}`}
              info={{ what: "Units the retiring SKUs are still forecast to ship before their end of life, under the filters.", how: "Sum of the submitted forecast from the first window month to the EOL month; nothing is forecast after it (business rule 5).", source: "forecast.json, dims.json" }}
            />
          ) : (
            <HeroFigure
              label="Recent launches in view"
              value={fmtInt(facts.recent)}
              unit={facts.recent === 1 ? "SKU" : "SKUs"}
              context={facts.recent ? `launched since ${monthName(m.months[m.asOf - 17])}, the last 18 months; ${facts.discontinued ? `**${fmtInt(facts.discontinued)}** discontinued earlier` : "none discontinued"}` : "No launch in the last 18 months for this selection."}
              info={{ what: "SKUs launched in the last 18 months whose forecast should continue the ramp, not the mean of a short history.", source: "dims.json, forecast.json" }}
            />
          )
        }
      />

      <Module
        title={render(GANTT_TEMPLATES.title, { m, pairs, predPowertrain: facts.predPowertrain }).text}
        dek={`Every SKU whose life changes around the window, ${monthName(m.months[0])} – ${monthName(m.months[m.nMonths - 1])}. Launches before 2019 start at the left edge.`}
        keyItems={ganttKey}
        info={{ what: "Launches, announced ends of life, planned launches and discontinued SKUs from the cleaned SKU master (effective launch dates; master conflicts corrected).", how: "Launches before 2019 start at the left edge; the status text gives the date.", source: "dims.json (skus)" }}
      >
        <div ref={wref}>
          {rows.length ? (
            <EChart option={gantt} height={Math.max(130, rows.length * 22 + 60)} ariaLabel={`${render(GANTT_TEMPLATES.title, { m, pairs, predPowertrain: facts.predPowertrain }).text}. Lifecycle map of ${rows.filter((r) => r.sku).length} SKUs.`} />
          ) : (
            <Empty title="No lifecycle change in this selection">No SKU of {sel.name || "the selection"} launches, ends or was discontinued around the window. Clear the family or SKU filter to see the handovers.</Empty>
          )}
        </div>
        {rows.length > 0 && (
          <div className="stamps" aria-label="Business rule 5 checks">
            {rule.nEol > 0 && (
              <Stamp ok={rule.afterEol === 0}>
                <b>{fmtInt(rule.afterEol)}</b> units forecast after the end of life of {rule.nEol} retiring {rule.nEol === 1 ? "SKU" : "SKUs"}
              </Stamp>
            )}
            {rule.nLaunch > 0 && (
              <Stamp ok={rule.beforeLaunch === 0}>
                <b>{fmtInt(rule.beforeLaunch)}</b> units before the launch of {rule.nLaunch} new {rule.nLaunch === 1 ? "SKU" : "SKUs"}
              </Stamp>
            )}
            {rule.nDisc > 0 && (
              <Stamp ok={rule.discUnits === 0}>
                <b>{fmtInt(rule.discUnits)}</b> units for {rule.nDisc} discontinued {rule.nDisc === 1 ? "SKU" : "SKUs"}
              </Stamp>
            )}
          </div>
        )}
      </Module>

      {pairs.length > 0 && (
        <Module
          title={render(HANDOVER_TEMPLATES.title, pairs).text}
          dek={`Units per month, ${monthName(m.months[Math.max(0, m.asOf - 21)])} – ${monthName(m.months[m.nMonths - 1])}, every region in the filter; the panels share one scale. Click an SKU code to filter the page to it.`}
          keyItems={[
            { kind: "line", color: "var(--ink)", label: "Retiring SKU, demand" },
            "sep",
            { kind: "line", color: "var(--accent)", label: "Retiring SKU, run-off forecast" },
            { kind: "box", color: "var(--accent)", label: "End of life" },
            { kind: "box", color: "var(--accent-tint)", label: "Successor forecast" },
          ]}
          info={{ what: "One panel per handover, all on one shared scale: the retiring SKU sells its last units by its end-of-life month and nothing after it, and the successor sells nothing before launch (business rule 5).", how: "Exact sums over the SKU's series under the region, channel and customer filters. Successors do not inherit their predecessor's regions, customers or channels.", source: "history.json, forecast.json, dims.json (replaces)" }}
        >
          <div className={`g2-handovers n${Math.min(3, pairs.length)}`}>
            {pairs.map((p) => (
              <HandoverPanel key={`${p.predId}-${p.succId}`} p={p} narrow={narrow} peak={handPeak} onPick={(k) => setFilters({ ...filters, family: m.skuFamily[k], sku: k })} />
            ))}
          </div>
        </Module>
      )}

      {recent.length > 0 && (
        <Module
          title={render(RECENT_TEMPLATES.title, recent).text}
          dek="SKUs launched in the last 18 months: the forecast should continue the ramp, not the mean of a short history. Average units a month, last 3 actual months against the next 12 forecast months. Click a row to filter."
          info={{ what: "Each recent launch's recent run-rate against its forecast run-rate.", how: "Unconstrained demand, average of the last three actual months, against the submitted forecast, average of the first 12 window months; under the region, channel and customer filters.", source: "history.json, forecast.json, dims.json" }}
        >
          <BarTable
            ariaLabel="Recent launches still ramping"
            rows={recent}
            rowKey={(r) => r.id}
            onRow={(r) => setFilters({ ...filters, family: m.skuFamily[r.k], sku: r.k })}
            bar={{ value: (r) => (Number.isFinite(r.ramp) ? r.ramp - 1 : 0), tone: "forecast", leader: (r) => r === topRamp }}
            cols={[
              { key: "id", label: "SKU", kind: "id", value: (r) => r.id, width: "13%" },
              { key: "d", label: "Description", kind: "text", value: (r) => S.description[r.k] ?? "–", width: "25%", hideNarrow: true },
              { key: "l", label: "Launched", kind: "num", value: (r) => monthName(m.months[r.launch]), width: "11%" },
              { key: "a", label: "Last 3 months", kind: "num", value: (r) => fmtInt(r.last3), width: "11%" },
              { key: "n", label: "Next 12 months", kind: "num", value: (r) => fmtInt(r.next12), width: "11%" },
              { key: "b", label: "Ramp", kind: "bar" },
              { key: "r", label: "Ratio", kind: "num", value: (r) => (Number.isFinite(r.ramp) ? `×${r.ramp.toFixed(2)}` : "new"), width: "8%" },
            ]}
          />
        </Module>
      )}

      <aside className="colophon" aria-label="Method">
        <span>
          <b>Rule 5</b> no sales after an SKU's end of life, or before a planned launch
        </span>
        <span>
          <b>Demand</b> unconstrained, stock-outs added back
        </span>
        <span>
          <b>Successors</b> forecast from the predecessor's level and the launch ramp; no inherited regions or customers
        </span>
      </aside>
    </>
  );
}

function HandoverPanel({ p, narrow, peak, onPick }: { p: Handover; narrow: boolean; peak: number; onPick: (k: number) => void }) {
  const { m, theme } = useApp();
  const opt = useMemo(() => handoverOption(theme, m, p, narrow, peak), [theme, m, p, narrow, peak]);
  return (
    <div className="g2-hand">
      <h3>
        {p.pred !== null && (
          <button type="button" className="linkish" onClick={() => onPick(p.pred as number)} title={`Filter the page to ${p.predId}`}>
            <KeyMark kind="line" color="var(--accent)" /> <span className="id">{p.predId}</span>
          </button>
        )}
        {p.pred !== null && p.succ !== null && <span className="to">to</span>}
        {p.succ !== null && (
          <button type="button" className="linkish" onClick={() => onPick(p.succ as number)} title={`Filter the page to ${p.succId}`}>
            <KeyMark kind="box" color="var(--accent-tint)" /> <span className="id">{p.succId}</span>
          </button>
        )}
      </h3>
      <div className="stat">
        <span>{p.eol !== null ? `EOL ${monthName(m.months[p.eol])}` : p.launch !== null ? `launch ${monthName(m.months[p.launch])}` : ""}{p.eol !== null && p.launch !== null ? `, launch ${monthName(m.months[p.launch])}` : ""}</span>
        {Number.isFinite(p.ratio) && (
          <span>
            <b>{fmtPct(p.ratio, 0)}</b> by {monthName(m.months[m.nMonths - 1])}
          </span>
        )}
      </div>
      <EChart option={opt} height={190} ariaLabel={`${p.predId ?? ""} to ${p.succId ?? ""}: run-off and successor forecast.`} />
      {p.succ !== null && p.succRuns === 0 && (
        <p className="caption">{p.succId} has no forecast under these filters: successors do not inherit their predecessor's regions, customers or channels.</p>
      )}
      <div className="chk">
        {p.pred !== null && p.eol !== null && (
          <Stamp ok={p.afterEol === 0}>
            {fmtInt(p.afterEol)} units after EOL ({monthName(m.months[p.eol])})
          </Stamp>
        )}
        {p.succ !== null && p.succRuns > 0 && p.launch !== null && (
          <Stamp ok={p.beforeLaunch === 0}>
            {fmtInt(p.beforeLaunch)} units before launch ({monthName(m.months[p.launch])})
          </Stamp>
        )}
      </div>
    </div>
  );
}
