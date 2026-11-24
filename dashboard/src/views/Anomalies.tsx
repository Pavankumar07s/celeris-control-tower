// R4 Anomaly monitor (training data): which unusual numbers were mistakes and which were real business, and
// what was done with each?
//  lede (computed headline + standfirst | hero: share of flagged cells that were real business)
//  -> the shared timeline with the flags (rose hollow diamonds = errors fixed, jade triangles = real events),
//     annotated with the largest ones
//  -> flags by type: data errors | real events (bar tables; a row filters the register)
//  -> the register (type, series, period, reason, action, confidence, impact; group by cause; CSV).
import { useCallback, useMemo } from "react";
import { useApp } from "../app/context";
import { useSelection } from "../app/hooks";
import { anomalyAnnotations, markPresence, type TimelineAnomaly, type TimelineModel, type TimelineSpec } from "../charts/timeline";
import { Button, MoreLink, Segmented, Select } from "../components/controls";
import { Download } from "../components/icons";
import { HeroFigure, Lede } from "../components/Figure";
import { LineageDrawer, decodeCell, encodeCell } from "../components/Lineage";
import { Key, Module, timelineKey, KeyMark } from "../components/Module";
import { Empty, ErrorState, Loading } from "../components/states";
import { BarTable, DataTable, download, toCsv, type Column } from "../components/tables";
import { fmtInt, fmtMoney, fmtPct, fmtSigned, monthName, monthSpan } from "../data/format";
import { useResource } from "../data/load";
import { filterPatch } from "../state/url";
import type { AnomalyFile } from "../data/types";
import { readableMonths } from "../insights/briefing";
import { cap, render, selectionWords } from "../insights/headlines";
import { repairFacts } from "../insights/health";
import { ANOMALY_TEMPLATES, anomalyFacts, lab, rowsInSelection, typeLabel, type TypeRow } from "../insights/anomalies";
import { ConfMeter, SplitBar } from "./g1/parts";
import "./g1/g1.css";
import { TimelineChart } from "../charts/TimelineChart";

type Cls = "all" | "data_error" | "real_event";
type Lvl = "all" | "cell" | "episode";
const ERR = "var(--cat-1)";
const REAL = "var(--cat-7)";

export default function Anomalies() {
  const { m, theme, filters, measure, lens, params, setParam, go } = useApp();
  const { series, segs, single, h } = useSelection();
  const reg = useResource<AnomalyFile>("anomalies.json");
  const usd = measure === "usd";
  const latent = lens === "latent";
  const cls = (["data_error", "real_event"].includes(params.get("cls") ?? "") ? params.get("cls") : "all") as Cls;
  // one series: cell-level flags by default (file-level episodes would otherwise dominate the register)
  const lvlDefault: Lvl = single !== null ? "cell" : "all";
  const level = (["cell", "episode", "all"].includes(params.get("lvl") ?? "") ? params.get("lvl") : lvlDefault) as Lvl;
  const type = params.get("type") ?? "";
  const grouped = params.get("grp") === "1";
  const cell = decodeCell(m, params.get("cell"));

  const seriesSet = useMemo(() => new Set(series), [series]);
  const inSel = useMemo(() => (reg.data ? rowsInSelection(m, filters, reg.data, seriesSet) : []), [reg.data, m, filters, seriesSet]);
  const sel = useMemo(() => selectionWords(m, filters), [m, filters]);
  const name = single !== null ? `${m.dims.skus.id[m.sSku[single]]} in ${m.dims.regions[m.sRegion[single]]}` : sel.name;
  // units unknown: one variable with the Overview figure and Data health (history flags of the selection)
  const unknownHist = useMemo(() => repairFacts(m, segs, "family").total.unknown, [m, segs]);
  const facts = useMemo(() => (reg.data ? anomalyFacts(m, reg.data, inSel, name, single !== null, unknownHist) : null), [reg.data, m, inSel, name, single, unknownHist]);
  const rows = useMemo(() => {
    if (!reg.data) return [];
    const a = reg.data;
    return inSel.filter((i) => (cls === "all" || lab(a.class, i) === cls) && (level === "all" || lab(a.level, i) === level) && (!type || lab(a.type, i) === type));
  }, [reg.data, inSel, cls, level, type]);

  // ---- marks on the timeline: every flagged cell for one series; clusters (>= 2x the class's usual month) at aggregate
  const demandArr = latent ? h.latent : h.demand;
  const marks = useMemo(() => {
    if (!reg.data) return { marks: [] as TimelineAnomaly[], items: [] as { month: number; value: number; cls: TimelineAnomaly["cls"]; title: string; text: string; impact: number }[] };
    const a = reg.data;
    const byMonth = new Map<string, { n: number; types: Map<string, number>; cause: string; action: string; units: number }>();
    for (const i of inSel) {
      if (a.series[i] < 0 || lab(a.level, i) !== "cell") continue;
      if (type && lab(a.type, i) !== type) continue;
      const c = lab(a.class, i) as string;
      if (cls !== "all" && c !== cls) continue;
      for (let mo = a.start[i]; mo <= Math.min(a.end[i], m.asOf); mo++) {
        if (mo < 0) continue;
        const key = `${c}|${mo}`;
        const cur = byMonth.get(key) ?? { n: 0, types: new Map(), cause: lab(a.cause, i) ?? "", action: lab(a.action, i) ?? "", units: 0 };
        cur.n++;
        cur.units += Math.abs(a.impact_units[i] ?? 0);
        const ty = lab(a.type, i) ?? "?";
        cur.types.set(ty, (cur.types.get(ty) ?? 0) + 1);
        byMonth.set(key, cur);
      }
    }
    const avg = new Map<string, number>();
    for (const [key, v] of byMonth) avg.set(key.split("|")[0], (avg.get(key.split("|")[0]) ?? 0) + v.n / (m.asOf + 1));
    const out: TimelineAnomaly[] = [];
    const items: { month: number; value: number; cls: TimelineAnomaly["cls"]; title: string; text: string; impact: number }[] = [];
    for (const [key, v] of byMonth) {
      const [c, moS] = key.split("|");
      const mo = Number(moS);
      if (single === null && v.n < Math.max(3, 2 * (avg.get(c) ?? 0))) continue;
      const types = [...v.types.entries()].sort((x, y) => y[1] - x[1]);
      const k = c as TimelineAnomaly["cls"];
      const val = demandArr[mo];
      const text = single !== null ? `${typeLabel(types[0][0])}: ${v.cause}` : `${fmtInt(v.n)} cells: ${types.slice(0, 3).map(([t, n]) => `${typeLabel(t)} ${fmtInt(n)}`).join(", ")}`;
      out.push({ month: mo, value: val, cls: k, text });
      const why = v.cause.toLowerCase() === typeLabel(types[0][0]).toLowerCase() ? v.action : v.cause;
      items.push({ month: mo, value: val, cls: k, title: cap(typeLabel(types[0][0])), text: single !== null ? why : `${fmtInt(v.n)} cells in ${monthName(m.months[mo])}`, impact: single !== null ? v.units : v.n });
    }
    return { marks: out, items };
  }, [reg.data, inSel, m, single, demandArr, cls, type]);

  const noRings = useMemo(() => new Int32Array(m.asOf + 1), [m]);
  const spec = useMemo<Omit<TimelineSpec, "narrow" | "height">>(
    () => ({
      m,
      theme,
      measure,
      lens,
      filters,
      hist: { shipped: latent ? h.latent : h.shipped, demand: demandArr, imputed: single !== null ? noRings : h.imputed, cells: h.cells, missing: h.missing, unknownDemand: h.unknownDemand },
      anomalies: marks.marks,
      range: [0, m.asOf],
      columns: single !== null,
    }),
    [m, theme, measure, lens, filters, h, latent, demandArr, marks, single, noRings],
  );
  // label the two largest real events and the largest data error, so both classes carry a text annotation
  const annotate = useCallback(
    (tm: TimelineModel) => {
      const by = (c: TimelineAnomaly["cls"]) => marks.items.filter((x) => x.cls === c).sort((p, q) => q.impact - p.impact);
      const err = by("data_error");
      const real = by("real_event");
      const pick = [...real.slice(0, err.length ? 2 : 3), ...err.slice(0, real.length ? 1 : 3)];
      return anomalyAnnotations(tm, pick, 3);
    },
    [marks],
  );
  const openRow = useCallback(
    (i: number) => {
      const a = reg.data;
      if (!a) return;
      const s = a.series[i];
      if (s < 0) {
        // a file- or market-wide flag: a data error opens Data health (where its rule is), a real event filters the register to its type
        if (lab(a.class, i) === "data_error") go("health", { cell: null, cls: null, lvl: null, type: null, grp: null });
        else setParam({ type: lab(a.type, i) }, true);
        return;
      }
      const t = Math.max(0, Math.min(a.start[i], m.asOf));
      setParam({ ...filterPatch(m, { ...filters, family: m.sFamily[s], sku: m.sSku[s], region: m.sRegion[s] }), cell: encodeCell(m, { s, t }) });
    },
    [reg.data, m, filters, setParam, go],
  );

  if (reg.loading || !facts)
    return reg.error ? (
      <ErrorState message={reg.error} />
    ) : (
      <>
        <Lede headline="Reading the anomaly register…" />
        <Loading what="the anomaly register" height={320} />
      </>
    );
  const a = reg.data as AnomalyFile;
  const realShare = facts.cells ? facts.realCells / facts.cells : 0;
  const tTitle = render(ANOMALY_TEMPLATES.timelineTitle, facts).text;
  const range = `${monthName(m.months[0])} – ${monthName(m.months[m.asOf])}`;
  const tDek =
    single !== null
      ? `${usd ? "Revenue in USD" : "Units"} per month, ${range}, as columns: every flagged month of the series is marked. Click a month for its lineage.`
      : `${usd ? "Revenue in USD" : "Units"} per month, ${range}: months where flagged cells cluster (at least twice the usual monthly count). Pick one SKU and region to see every flag.`;

  return (
    <>
      <Lede
        headline={render(ANOMALY_TEMPLATES.headline, facts).text}
        standfirst={render(ANOMALY_TEMPLATES.standfirst, facts).text}
        figure={
          <HeroFigure
            label="Flagged cells that were real business"
            value={facts.cells ? fmtPct(realShare, 0) : "–"}
            visual={
              facts.cells ? (
                <SplitBar
                  ariaLabel={`${fmtInt(facts.realCells)} real events and ${fmtInt(facts.errCells)} data errors among ${fmtInt(facts.cells)} flagged cells`}
                  parts={[
                    { value: facts.realCells, color: REAL, label: "Real events, kept", text: fmtInt(facts.realCells), mark: "triangle" },
                    { value: facts.errCells, color: ERR, label: "Data errors", text: fmtInt(facts.errCells), mark: "diamond" },
                  ]}
                />
              ) : undefined
            }
            context={facts.cells ? `of **${fmtInt(facts.cells)}** flagged cells; errors were corrected${facts.unknownCells ? ` (or, where units stay unknown, kept out of fitting)` : ""}, real events stay in the history` : "No single cell of this selection was flagged."}
            link={{ label: "Every fix in Data health", onClick: () => go("health", { cell: null, cls: null, lvl: null, type: null, grp: null }) }}
            info={{
              what: "Cell-level flags of the anomaly register inside the selection, split into data errors (wrong or missing values, corrected) and real events (stock-outs, one-off orders, launches, holidays: kept and modelled, or masked from fitting).",
              how: "Each flag carries its detection method, cause, action and confidence. Episode-level flags (a whole date-format problem, a price change) are counted separately.",
              source: "anomalies.json ← anomalies/anomaly_register.csv",
            }}
          />
        }
      />

      <Module
        id="flags"
        title={tTitle}
        dek={tDek}
        info={{
          what: "The selection's history with the anomaly flags, each drawn on its month's value: hollow rose diamonds are data errors (corrected, or kept out of fitting where units are unknown), jade triangles are real events kept in the history. The three largest are labelled with their type and reason.",
          how: "Cell-level register rows matched to the selected series (customer at the time); the register filters below apply to the marks too.",
          source: "anomalies.json, history.json",
        }}
      >
        <Key
          items={[
            ...timelineKey({ latent, fc: false, rebuilt: false, columns: single !== null, present: markPresence(spec) }),
            "sep",
            { kind: "diamond", color: ERR, label: "Data error" },
            { kind: "triangle", color: REAL, label: "Real event, kept" },
          ]}
        />
        {facts.cells || marks.marks.length ? (
          <TimelineChart
            spec={spec}
            annotate={annotate}
            height={single !== null ? 330 : 350}
            ariaLabel={`${tTitle}. ${tDek}`}
            onXClick={single !== null ? (t) => t <= m.asOf && setParam({ cell: encodeCell(m, { s: single, t }) }) : undefined}
          />
        ) : (
          <Empty title="No flagged point in this selection">The register has no cell-level flag for these series. Widen the filters to see flagged points.</Empty>
        )}
        {single !== null && (
          <p style={{ marginTop: 10 }}>
            <MoreLink href={`#/explorer?${new URLSearchParams(Object.entries(filterPatch(m, filters)).filter(([, v]) => v !== null) as [string, string][]).toString()}`}>
              {name}: ordering cycle, zero months and customers in the Demand explorer
            </MoreLink>
          </p>
        )}
      </Module>

      <TypesModule facts={facts} type={type} onType={(code) => setParam({ type: code === type ? null : code }, true)} usd={usd} />

      <RegisterModule a={a} m={m} rows={rows} inSel={inSel} cls={cls} level={level} lvlDefault={lvlDefault} type={type} grouped={grouped} usd={usd} setParam={setParam} onRow={openRow} />

      {cell && <LineageDrawer series={cell.s} month={cell.t} onClose={() => setParam({ cell: null }, true)} />}
    </>
  );
}

// ---- flags by type: errors | real events ----------------------------------------------------------------------
function TypesModule({ facts, type, onType, usd }: { facts: ReturnType<typeof anomalyFacts>; type: string; onType: (code: string) => void; usd: boolean }) {
  // one series: only the types that flagged its own cells (episodes, most of them file-wide, are in the register)
  const listOf = (rows: TypeRow[]) => (facts.single ? rows.filter((r) => r.cells > 0) : rows);
  // ONE bar scale for both tables: side-by-side bars invite comparison, so 5,005 and 982 cells must not look equal
  const sharedMax = Math.max(1, ...[...listOf(facts.realTypes), ...listOf(facts.errTypes)].slice(0).map((r) => r.cells));
  const fixedCells = facts.errCells - facts.unknownCells;
  const table = (rows: TypeRow[], kind: "data_error" | "real_event") => {
    const list = listOf(rows);
    const shown = list.slice(0, 8);
    const rest = list.slice(8);
    const restCells = rest.reduce((x, r) => x + r.cells, 0);
    const total = list.reduce((x, r) => x + r.cells, 0);
    const totalEp = list.reduce((x, r) => x + r.episodes, 0);
    return (
      <div>
        <h3 className="g1-h3 g1-type" style={{ marginTop: 4 }}>
          <KeyMark kind={kind === "data_error" ? "diamond" : "triangle"} color={kind === "data_error" ? ERR : REAL} />
          {kind === "data_error"
            ? `Data errors: ${fmtInt(facts.errCells)} ${facts.errCells === 1 ? "cell" : "cells"}${facts.unknownCells ? `, ${fmtInt(fixedCells)} ${facts.errTypes.some((r) => r.code === "DE.MISSING_ROW" && r.cells > 0) ? "corrected or rebuilt" : "corrected"}, ${fmtInt(facts.unknownCells)} units unknown` : ", corrected"}`
            : `Real events, kept: ${fmtInt(facts.realCells)} ${facts.realCells === 1 ? "cell" : "cells"}`}
        </h3>
        {shown.length ? (
          <BarTable<TypeRow>
            ariaLabel={kind === "data_error" ? "Data errors by type" : "Real events by type"}
            rows={shown}
            rowKey={(r) => r.code}
            onRow={(r) => onType(r.code)}
            selected={(r) => r.code === type}
            bar={{ value: (r) => r.cells, tone: "history", leader: (r) => r === shown[0], max: sharedMax }}
            cols={[
              { key: "l", label: "Type", kind: "label", value: (r) => cap(r.label), width: "36%", title: (r) => r.code },
              { key: "b", label: "Flagged cells", kind: "bar" },
              { key: "c", label: "", kind: "num", value: (r) => fmtInt(r.cells), width: "13%" },
              ...(facts.single
                ? []
                : [{ key: "e", label: "Episodes", kind: "num" as const, value: (r: TypeRow) => (r.episodes ? fmtInt(r.episodes) : "–"), width: "13%", hideNarrow: true, title: (r: TypeRow) => (r.episodes ? `${fmtInt(r.episodes)} episode-level flags covering ${fmtInt(r.covered)} cells` : "no episode-level flag") }]),
              { key: "u", label: usd ? "Impact" : "Impact, units", kind: "num", value: (r) => (usd ? fmtMoney(r.usd, 1) : fmtInt(r.units)), width: "17%", hideNarrow: true, title: () => "Absolute demand the flags moved, in either direction" },
            ]}
          />
        ) : (
          <p className="state">None in this selection.</p>
        )}
        {list.length > 1 && (
          <p className="g1-legend-line">
            <span>
              All {fmtInt(list.length)} types: <b>{fmtInt(total)}</b> flagged {total === 1 ? "cell" : "cells"}
              {totalEp && !facts.single ? (
                <>
                  , <b>{fmtInt(totalEp)}</b> {totalEp === 1 ? "episode" : "episodes"}
                </>
              ) : null}
              {rest.length ? `; ${fmtInt(rest.length)} more ${rest.length === 1 ? "type" : "types"} with ${fmtInt(restCells)} cells in the register` : ""}
            </span>
          </p>
        )}
      </div>
    );
  };
  return (
    <Module
      title={render(ANOMALY_TEMPLATES.typesTitle, facts).text}
      dek={`Flags in the selection by type, ranked by flagged cells, on one shared bar scale; episodes are flags on a whole block (a date format, a price change) and are counted apart${facts.single ? " in the register" : ""}. Click a type to filter the register and the marks.`}
      info={{
        what: "Every type of flag in the register: DE = data error, RC = reference conflict (master data against transactions), RE = real event, ST = structural or lifecycle change.",
        how: "Cells per type in the selection; |impact| is the absolute demand the flag moved, in units or at invoice prices.",
        source: "anomalies.json",
      }}
    >
      <div className="g1-row-2" style={{ marginTop: 12 }}>
        {table(facts.realTypes, "real_event")}
        {table(facts.errTypes, "data_error")}
      </div>
    </Module>
  );
}

// ---- the register ------------------------------------------------------------------------------------------------
function RegisterModule({ a, m, rows, inSel, cls, level, lvlDefault, type, grouped, usd, setParam, onRow }: {
  a: AnomalyFile;
  m: ReturnType<typeof useApp>["m"];
  rows: number[];
  inSel: number[];
  cls: Cls;
  level: Lvl;
  lvlDefault: Lvl;
  type: string;
  grouped: boolean;
  usd: boolean;
  setParam: (p: Record<string, string | null>, replace?: boolean) => void;
  onRow: (i: number) => void;
}) {
  const typesAvail = useMemo(() => [...new Set(inSel.map((i) => lab(a.type, i) ?? ""))].filter(Boolean).sort(), [inSel, a]);
  const impact = (i: number) => (usd ? a.impact_usd[i] : a.impact_units[i]);
  const fmtImpact = (v: number | null) => (v === null ? "–" : usd ? fmtSigned(v, "usd", 1) : fmtSigned(v, "units", 1));
  const scope = (i: number) => (a.series[i] >= 0 ? `${lab(a.sku, i)} · ${lab(a.region, i)}` : (lab(a.scope, i) ?? "–"));
  const period = (i: number) => (a.start[i] < 0 ? "–" : a.start[i] === a.end[i] ? monthName(m.months[a.start[i]]) : monthSpan(m.months[a.start[i]], m.months[Math.min(a.end[i], m.nMonths - 1)]));
  const cols: Column<number>[] = [
    {
      key: "type",
      label: "Type",
      value: (i) => lab(a.type, i),
      render: (i) => (
        <span className="g1-type" title={lab(a.type, i) ?? ""}>
          <KeyMark kind={lab(a.class, i) === "data_error" ? "diamond" : "triangle"} color={lab(a.class, i) === "data_error" ? ERR : REAL} />
          {cap(typeLabel(lab(a.type, i)))}
        </span>
      ),
      width: 200,
    },
    {
      key: "series",
      label: "Series or scope",
      value: scope,
      render: (i) =>
        a.series[i] >= 0 ? (
          <>
            <span className="g1-code">{lab(a.sku, i)}</span> · {lab(a.region, i)}
          </>
        ) : (
          scope(i)
        ),
      width: 180,
    },
    { key: "period", label: "Period", value: (i) => (a.start[i] < 0 ? null : m.months[a.start[i]]), render: period, width: 112 },
    { key: "cause", label: "Reason", value: (i) => lab(a.cause, i), render: (i) => readableMonths(lab(a.cause, i) ?? ""), clamp: true },
    { key: "action", label: "Action", value: (i) => lab(a.action, i), render: (i) => readableMonths(lab(a.action, i) ?? ""), clamp: true },
    { key: "conf", label: "Confidence", value: (i) => ({ low: 1, medium: 2, high: 3 })[lab(a.confidence, i) ?? ""] ?? 0, render: (i) => <ConfMeter level={lab(a.confidence, i)} />, width: 118 },
    { key: "imp", label: usd ? "Impact" : "Impact, units", value: (i) => (impact(i) === null ? null : Math.abs(impact(i) as number)), render: (i) => fmtImpact(impact(i)), num: true, width: 104 },
  ];
  // CSV twin carries the codes and both impacts
  const csvCols: Column<number>[] = [
    { key: "id", label: "anomaly_id", value: (i) => a.id[i] },
    { key: "type", label: "type", value: (i) => lab(a.type, i) },
    { key: "class", label: "class", value: (i) => lab(a.class, i) },
    { key: "level", label: "level", value: (i) => lab(a.level, i) },
    { key: "scope", label: "series_or_scope", value: scope },
    { key: "start", label: "start", value: (i) => (a.start[i] >= 0 ? m.months[a.start[i]] : null) },
    { key: "end", label: "end", value: (i) => (a.end[i] >= 0 ? m.months[Math.min(a.end[i], m.nMonths - 1)] : null) },
    { key: "cause", label: "cause", value: (i) => lab(a.cause, i) },
    { key: "detection", label: "detection", value: (i) => lab(a.detection, i) },
    { key: "action", label: "action", value: (i) => lab(a.action, i) },
    { key: "conf", label: "confidence", value: (i) => lab(a.confidence, i) },
    { key: "u", label: "impact_units", value: (i) => a.impact_units[i] },
    { key: "usd", label: "impact_usd", value: (i) => a.impact_usd[i] },
  ];
  const groups = useMemo(() => {
    const g = new Map<string, { type: string; cls: string; cause: string; action: string; n: number; cells: number; units: number; usd: number }>();
    for (const i of rows) {
      const key = `${lab(a.type, i)}|${lab(a.cause, i)}`;
      const cur = g.get(key) ?? { type: lab(a.type, i) ?? "", cls: lab(a.class, i) ?? "", cause: lab(a.cause, i) ?? "", action: lab(a.action, i) ?? "", n: 0, cells: 0, units: 0, usd: 0 };
      cur.n++;
      cur.cells += lab(a.level, i) === "cell" ? 1 : (a.n_cells[i] ?? 0);
      cur.units += a.impact_units[i] ?? 0;
      cur.usd += a.impact_usd[i] ?? 0;
      g.set(key, cur);
    }
    return [...g.values()];
  }, [rows, a]);
  type G = (typeof groups)[number];
  const gcols: Column<G>[] = [
    {
      key: "type",
      label: "Type",
      value: (r) => r.type,
      render: (r) => (
        <span className="g1-type" title={r.type}>
          <KeyMark kind={r.cls === "data_error" ? "diamond" : "triangle"} color={r.cls === "data_error" ? ERR : REAL} />
          {cap(typeLabel(r.type))}
        </span>
      ),
      width: 200,
    },
    { key: "cause", label: "Reason", value: (r) => r.cause, render: (r) => readableMonths(r.cause), clamp: true },
    { key: "action", label: "Action", value: (r) => r.action, render: (r) => readableMonths(r.action), clamp: true },
    { key: "n", label: "Flags", value: (r) => r.n, render: (r) => fmtInt(r.n), num: true, width: 80 },
    { key: "cells", label: "Cells", value: (r) => r.cells, render: (r) => fmtInt(r.cells), num: true, width: 80 },
    { key: "imp", label: usd ? "Impact" : "Impact, units", value: (r) => Math.abs(usd ? r.usd : r.units), render: (r) => fmtImpact(usd ? r.usd : r.units), num: true, width: 110 },
  ];
  const nCauses = groups.length;
  const nSeries = new Set(rows.filter((i) => a.series[i] >= 0).map((i) => a.series[i])).size;
  const title = rows.length
    ? `${fmtInt(rows.length)} ${rows.length === 1 ? "flag" : "flags"} from ${fmtInt(nCauses)} ${nCauses === 1 ? "cause" : "causes"}${nSeries ? ` across ${fmtInt(nSeries)} ${nSeries === 1 ? "series" : "series"}` : ""}, each with its action`
    : "No flag matches these register filters";
  return (
    <Module
      title={title}
      dek={`The anomaly register for the selection${type ? `, type ${typeLabel(type)}` : ""}, largest impact first. A series row opens that series with the lineage of the flagged month; a file-wide error opens Data health.`}
      info={{
        what: "The anomaly register: deterministic id, type, class, scope, period, cause, detection, action, confidence and signed impact. Group by cause folds repeated flags into one row.",
        how: "Impact is the signed demand the flag moved (corrected minus raw for an error; the event's effect for a real event), in units or at invoice prices.",
        source: "anomalies.json ← anomalies/anomaly_register.csv",
      }}
    >
      <div className="g1-tools">
        <Segmented<Cls> ariaLabel="Class" value={cls} onChange={(v) => setParam({ cls: v === "all" ? null : v }, true)} options={[{ value: "all", label: "All" }, { value: "data_error", label: "Data errors" }, { value: "real_event", label: "Real events" }]} />
        <Segmented<Lvl> ariaLabel="Level" value={level} onChange={(v) => setParam({ lvl: v === lvlDefault ? null : v }, true)} options={[{ value: "all", label: "Cells and episodes" }, { value: "cell", label: "Cells" }, { value: "episode", label: "Episodes" }]} />
        <Select label="Type" value={type} onChange={(v) => setParam({ type: v || null }, true)} options={[{ value: "", label: "All types" }, ...typesAvail.map((t) => ({ value: t, label: cap(typeLabel(t)) }))]} />
        <label className="g1-check">
          <input type="checkbox" checked={grouped} onChange={(e) => setParam({ grp: e.target.checked ? "1" : null }, true)} /> Group by cause
        </label>
        <span className="grow" />
        <Button size="sm" onClick={() => download("anomaly_register_selection.csv", toCsv(rows, csvCols))} title="Every register row of this selection and filter, with codes and both impacts">
          <Download size={13} /> Register CSV
        </Button>
      </div>
      <div style={{ marginTop: 8 }}>
        {grouped ? (
          <DataTable
            rows={groups}
            cols={gcols}
            pageSize={12}
            initialSort={{ key: "imp", desc: true }}
            ariaLabel="Anomaly register grouped by cause"
            rowKey={(r) => `${r.type}|${r.cause}`}
            expandLabel="the full reason and action"
            expand={(r) => (
              <dl>
                <dt>Type</dt>
                <dd>{cap(typeLabel(r.type))} ({r.cls === "data_error" ? "data error" : "real event"}), {r.type}</dd>
                <dt>Reason</dt>
                <dd>{readableMonths(r.cause)}</dd>
                <dt>Action</dt>
                <dd>{readableMonths(r.action)}</dd>
                <dt>Flags · cells</dt>
                <dd>
                  {fmtInt(r.n)} · {fmtInt(r.cells)}
                </dd>
              </dl>
            )}
          />
        ) : (
          <DataTable
            rows={rows}
            cols={cols}
            pageSize={12}
            onRow={onRow}
            initialSort={{ key: "imp", desc: true }}
            ariaLabel="Anomaly register"
            empty="No flag matches these filters. Choose All types or another class."
            rowKey={(i) => i}
            expandLabel="the full reason and action"
            expand={(i) => (
              <dl>
                <dt>Type</dt>
                <dd>
                  {cap(typeLabel(lab(a.type, i)))} ({lab(a.class, i) === "data_error" ? "data error" : "real event"}, {lab(a.level, i) === "cell" ? "one cell" : `episode of ${fmtInt(a.n_cells[i] ?? 0)} cells`}), {lab(a.type, i)}
                </dd>
                <dt>Series or scope</dt>
                <dd>
                  {scope(i)} · {period(i)}
                </dd>
                <dt>Reason</dt>
                <dd>{readableMonths(lab(a.cause, i) ?? "–")}</dd>
                {a.evidence[i] && (
                  <>
                    <dt>Evidence</dt>
                    <dd>{readableMonths(a.evidence[i] ?? "")}</dd>
                  </>
                )}
                <dt>How it was found</dt>
                <dd>{readableMonths(lab(a.detection, i) ?? "–")}</dd>
                <dt>Action</dt>
                <dd>{readableMonths(lab(a.action, i) ?? "–")}</dd>
                <dt>Confidence · impact</dt>
                <dd>
                  {cap(lab(a.confidence, i) ?? "–")} · {fmtImpact(impact(i))}
                  {usd ? "" : " units"}
                </dd>
              </dl>
            )}
          />
        )}
      </div>
    </Module>
  );
}
