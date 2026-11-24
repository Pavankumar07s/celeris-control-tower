// R3 Demand explorer (training data): drill family → SKU → region → customer; the series timeline (orders as booked
// or latent monthly demand), seasonality, the zero-month calendar with the ordering cycle, lifecycle and series card.
import { useMemo, useState } from "react";
import type { EChartsCoreOption } from "echarts/core";
import { useApp } from "../app/context";
import { useSelection } from "../app/hooks";
import { EChart } from "../charts/EChart";
import { FONT, axisStyle, esc, tooltipStyle, type Theme } from "../charts/theme";
import { timelineOption } from "../charts/timeline";
import { LineageDrawer } from "../components/Lineage";
import { Card, Empty, Info, Loading, TimelineLegend } from "../components/ui";
import type { HistoryAgg } from "../data/aggregate";
import { compact, fmt1, fmtInt, fmtPct, monthName } from "../data/format";
import { useResource } from "../data/load";
import { historyPrice, seriesMatches, type Filters, type Model } from "../data/model";
import type { ProfilesFile } from "../data/types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface Node {
  key: number;
  label: string;
  sub?: string;
  vol: number;
  apply: Partial<Filters>;
}

function navigator(m: Model, f: Filters, usd: boolean): { level: string; nodes: Node[] } {
  const vol = new Map<string, number>();
  const add = (k: string, v: number) => vol.set(k, (vol.get(k) ?? 0) + v);
  const level = f.sku === null ? (f.family === null ? "family" : "sku") : f.region === null ? "region" : "customer";
  for (let g = 0; g < m.nSeg; g++) {
    const s = m.gSeries[g];
    if (!seriesMatches(m, s, f) || (level !== "customer" && f.customer !== null && m.gCustomer[g] !== f.customer)) continue;
    let v = 0;
    for (let k = 0; k < m.gLen[g]; k++) {
      const t = m.gStart[g] + k;
      if (t > m.asOf - 12) v += m.d[m.gOff[g] + k] * (usd ? historyPrice(m, m.sSku[s], t) : 1);
    }
    const key = level === "family" ? m.sFamily[s] : level === "sku" ? m.sSku[s] : level === "region" ? m.sRegion[s] : m.gCustomer[g];
    add(String(key), v);
  }
  const nodes: Node[] = [...vol.entries()].map(([k, v]) => {
    const i = Number(k);
    if (level === "family") return { key: i, label: m.dims.families.name[i], vol: v, apply: { family: i } };
    if (level === "sku") return { key: i, label: m.dims.skus.id[i], sub: m.dims.skus.description[i] ?? "", vol: v, apply: { sku: i, family: m.skuFamily[i] } };
    if (level === "region") return { key: i, label: m.dims.regions[i], vol: v, apply: { region: i } };
    return { key: i, label: m.dims.customers[i], vol: v, apply: { customer: i } };
  });
  nodes.sort((a, b) => b.vol - a.vol || a.label.localeCompare(b.label));
  return { level, nodes };
}

function seasonalityOption(m: Model, h: HistoryAgg, t: Theme): EChartsCoreOption | null {
  const years: { y: number; idx: number[] }[] = [];
  for (let y = 0; y * 12 + 11 <= m.asOf; y++) {
    const vals = Array.from({ length: 12 }, (_, k) => h.latent[y * 12 + k]);
    const mean = vals.reduce((a, b) => a + b, 0) / 12;
    if (mean > 0 && vals.every((v) => v > 0)) years.push({ y: 2019 + y, idx: vals.map((v) => v / mean) });
  }
  if (!years.length) return null;
  const typical = years.filter((y) => y.y !== 2020);
  const avg = Array.from({ length: 12 }, (_, k) => typical.reduce((a, y) => a + y.idx[k], 0) / Math.max(1, typical.length));
  const ax = axisStyle(t);
  return {
    animation: false,
    grid: { left: 8, right: 44, top: 12, bottom: 8, containLabel: true },
    xAxis: { type: "category", data: MONTHS, ...ax, splitLine: { show: false } },
    yAxis: { type: "value", ...ax, min: (v: { min: number }) => Math.max(0, Math.floor(v.min * 10) / 10), axisLabel: { ...ax.axisLabel, formatter: (v: number) => v.toFixed(1) } },
    tooltip: { trigger: "axis", ...tooltipStyle(t), valueFormatter: (v: number) => (v === null ? "–" : v.toFixed(2)) },
    series: [
      ...years.map((y) => ({ name: String(y.y), type: "line", data: y.idx, showSymbol: false, lineStyle: { width: 1, color: t.axis }, itemStyle: { color: t.axis }, endLabel: { show: y.y === years[years.length - 1].y, formatter: String(y.y), color: t.muted, fontSize: 10 }, z: 1 })),
      { name: "average (excl. 2020)", type: "line", data: avg, showSymbol: true, symbolSize: 6, lineStyle: { width: 2.5, color: t.forecast }, itemStyle: { color: t.forecast }, endLabel: { show: true, formatter: "avg", color: t.ink2, fontSize: 11 }, z: 3 },
      { name: "", type: "line", data: avg.map(() => 1), showSymbol: false, silent: true, lineStyle: { width: 1, color: t.muted, type: [3, 3] } },
    ],
  };
}

function zeroCalendarOption(m: Model, single: number | null, segs: number[], t: Theme): EChartsCoreOption {
  const years = Array.from({ length: Math.floor(m.asOf / 12) + 1 }, (_, y) => String(2019 + y));
  const b = m.bit;
  const data: { value: (number | null)[]; itemStyle?: Record<string, unknown>; tip: string; label?: Record<string, unknown> }[] = [];
  if (single !== null) {
    const cells = new Map<number, number>();
    for (const g of segs) if (m.gSeries[g] === single) for (let k = 0; k < m.gLen[g]; k++) cells.set(m.gStart[g] + k, m.gOff[g] + k);
    let max = 1;
    cells.forEach((i) => (max = Math.max(max, m.d[i])));
    for (let mo = 0; mo <= m.asOf; mo++) {
      const i = cells.get(mo);
      const y = Math.floor(mo / 12);
      const k = mo % 12;
      if (i === undefined) {
        data.push({ value: [k, y, null], tip: "outside the series' sales window", itemStyle: { color: "transparent" } });
        continue;
      }
      const v = m.d[i];
      const fl = m.f[i];
      let tip = `${fmt1(v)} units`;
      let label = "";
      let color = t.seq[Math.min(t.seq.length - 1, 2 + Math.round((v / max) * (t.seq.length - 3)))];
      if (fl & b.missing_row) {
        tip = `missing row — demand filled at ${fmt1(v)} (imputed)`;
        label = "?";
      } else if (v === 0) {
        color = t.surface;
        if (fl & b.lost_tail) {
          tip = "zero: lost-account tail";
          label = "L";
        } else if (fl & b.structural_zero) {
          tip = "zero: scheduled off-month of the ordering cycle";
          label = "·";
        } else {
          tip = "zero on an order month (launch ramp, lockdown or a skipped order)";
          label = "0";
        }
      }
      if (fl & (b.stockout_listed | b.stockout_inferred)) tip += " · stock-out month (demand unconstrained)";
      if (fl & b.one_off) tip += " · one-off order";
      const span = fl & m.accumMask;
      if (span > 1) tip += ` · order carries ${span} months`;
      data.push({ value: [k, y, v], tip, itemStyle: { color, borderColor: v === 0 ? t.axis : t.surface, borderWidth: v === 0 ? 1 : 2 }, label: { show: !!label, formatter: label, color: t.ink2, fontSize: 11, fontWeight: 700 } });
    }
  } else {
    const zeros = new Float64Array(m.asOf + 1);
    const sched = new Float64Array(m.asOf + 1);
    const cells = new Float64Array(m.asOf + 1);
    for (const g of segs) for (let k = 0; k < m.gLen[g]; k++) {
      const mo = m.gStart[g] + k;
      const i = m.gOff[g] + k;
      cells[mo]++;
      if (m.d[i] === 0) {
        zeros[mo]++;
        if (m.f[i] & (b.structural_zero | b.lost_tail)) sched[mo]++;
      }
    }
    let maxShare = 1e-9;
    for (let mo = 0; mo <= m.asOf; mo++) if (cells[mo]) maxShare = Math.max(maxShare, zeros[mo] / cells[mo]);
    for (let mo = 0; mo <= m.asOf; mo++) {
      const share = cells[mo] ? zeros[mo] / cells[mo] : 0;
      data.push({ value: [mo % 12, Math.floor(mo / 12), share], tip: `${fmtInt(zeros[mo])} zero cells of ${fmtInt(cells[mo])} (${fmtPct(share)}); ${fmtInt(sched[mo])} scheduled by the ordering cycle or a lost account`, itemStyle: { color: t.seq[Math.round((share / maxShare) * (t.seq.length - 1))], borderColor: t.surface, borderWidth: 2 }, label: { show: false } });
    }
  }
  const ax = axisStyle(t);
  return {
    animation: false,
    grid: { left: 8, right: 8, top: 4, bottom: 8, containLabel: true },
    xAxis: { type: "category", data: MONTHS, position: "top", ...ax, splitLine: { show: false } },
    yAxis: { type: "category", data: years, inverse: true, ...ax, splitLine: { show: false } },
    tooltip: { ...tooltipStyle(t), formatter: (p: { data: { value: number[]; tip: string } }) => `<b>${MONTHS[p.data.value[0]]} ${years[p.data.value[1]]}</b><br/>${esc(p.data.tip)}` },
    series: [{ type: "heatmap", data, label: { show: false, fontFamily: FONT } }],
  };
}

function SeriesCard({ m, s }: { m: Model; s: number }) {
  const prof = useResource<ProfilesFile>("profiles.json");
  const sku = m.sSku[s];
  const S = m.dims.skus;
  const p = prof.data?.series;
  const v = (k: string) => (p && s < (p[k]?.length ?? 0) ? p[k][s] : null);
  const segs = m.segOfSeries[s];
  const events = useMemo(() => {
    if (!prof.data) return [];
    const ae = prof.data.account_events;
    const out: number[] = [];
    (ae.series as number[]).forEach((x, i) => x === s && out.push(i));
    return out;
  }, [prof.data, s]);
  return (
    <div>
      <dl className="kv">
        <dt>Product</dt>
        <dd>{S.description[sku]}</dd>
        <dt>Size · powertrain</dt>
        <dd>
          {S.size_class[sku]} · {S.powertrain[sku]}
        </dd>
        <dt>Lifecycle</dt>
        <dd>
          {S.status[sku]} · launched {S.launch[sku]}
          {S.eol[sku] ? ` · EOL ${S.eol[sku]}` : ""}
          {S.replaces[sku] ? ` · replaces ${S.replaces[sku]}` : ""}
        </dd>
        <dt>Channel</dt>
        <dd>{m.dims.channels[m.sChannel[s]]}</dd>
        <dt>Customers</dt>
        <dd>
          {segs.map((g) => `${m.dims.customers[m.gCustomer[g]]} (${m.months[m.gStart[g]]} → ${m.months[m.gStart[g] + m.gLen[g] - 1]})`).join(" · then ")}
        </dd>
        <dt>Ordering cycle</dt>
        <dd>
          {m.dims.series.cycle[s] ?? "–"} ({m.dims.series.cycle_kind[s]})
          {v("cycle_pattern_before") ? ` · was ${v("cycle_pattern_before")} until ${v("cycle_change_month")}` : ""}
          {v("cycle_posterior") !== null ? ` · posterior ${Number(v("cycle_posterior")).toFixed(2)}` : ""}
        </dd>
        {p && (
          <>
            <dt>Demand class</dt>
            <dd>
              {String(v("sbc_class"))} (ADI {Number(v("sbc_adi")).toFixed(2)}, CV² {Number(v("sbc_cv2")).toFixed(2)}) · last 36 m: {String(v("sbc_class_last36"))}
            </dd>
            <dt>Level, last 12 m</dt>
            <dd>{fmt1(Number(v("level_last12")))} units / month (one-offs at expectation)</dd>
            <dt>Orders</dt>
            <dd>
              {fmtInt(Number(v("n_orders")))} orders, mean {fmt1(Number(v("mean_order")))} · zero share {fmtPct(Number(v("zero_share")))}
            </dd>
            <dt>Stock-outs</dt>
            <dd>
              {fmtInt(Number(v("n_stockout_listed")))} listed, {fmtInt(Number(v("n_stockout_inferred")))} inferred · {fmt1(Number(v("lost_units")))} lost units
            </dd>
            <dt>Data issues</dt>
            <dd>
              {fmtInt(Number(v("n_fixes")))} fixes · {fmtInt(Number(v("n_missing_rows")))} missing rows · {fmtInt(Number(v("n_one_offs")))} one-offs
            </dd>
          </>
        )}
        {m.dims.series.lost[s] === 1 && (
          <>
            <dt>Lost account</dt>
            <dd>since {m.dims.series.lost_since[s]} — forecast 0</dd>
          </>
        )}
      </dl>
      {prof.loading && <Loading what="series profile" />}
      {events.length > 0 && prof.data && (
        <div className="callout" style={{ marginTop: 10 }}>
          {events.map((i) => {
            const ae = prof.data!.account_events;
            return (
              <div key={i}>
                <b>{String(ae.event_type[i]).replace(/_/g, " ")}</b> in {String(ae.month[i])}: {String(ae.before[i] ?? "")} → {String(ae.after[i] ?? "")}
                {ae.level_ratio[i] !== null ? ` (level ×${Number(ae.level_ratio[i]).toFixed(2)})` : ""}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Composition({ m, series }: { m: Model; series: number[] }) {
  const kinds = new Map<string, number>();
  const status = new Map<string, number>();
  let lost = 0;
  for (const s of series) {
    const k = m.dims.series.cycle_kind[s] ?? "unknown";
    kinds.set(k, (kinds.get(k) ?? 0) + 1);
    const st = m.dims.skus.status[m.sSku[s]] ?? "–";
    status.set(st, (status.get(st) ?? 0) + 1);
    lost += m.dims.series.lost[s];
  }
  const KIND: Record<string, string> = { M: "monthly", A: "monthly with an annual shutdown", B: "every second month", Q: "quarterly", T: "two on, one off", unknown: "no history (cold start)" };
  return (
    <div>
      <p className="small muted" style={{ marginTop: 0 }}>
        Select one SKU and one region to see a single series' card. The {fmtInt(series.length)} series of this selection order on these cycles:
      </p>
      <dl className="kv">
        {[...kinds.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([k, n]) => (
            <div key={k} style={{ display: "contents" }}>
              <dt>
                {k} · {KIND[k] ?? k}
              </dt>
              <dd>{fmtInt(n)}</dd>
            </div>
          ))}
        <dt>Lost accounts</dt>
        <dd>{fmtInt(lost)}</dd>
        {[...status.entries()].map(([k, n]) => (
          <div key={k} style={{ display: "contents" }}>
            <dt>SKU status: {k}</dt>
            <dd>{fmtInt(n)} series</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default function Explorer() {
  const { m, theme, filters, measure, lens, setFilters, params, setParam } = useApp();
  const { segs, series, single, h, fc } = useSelection();
  const [cell, setCell] = useState<{ s: number; t: number } | null>(null);
  const [q, setQ] = useState("");
  const withForecast = params.get("fc") === "1";
  const latent = lens === "latent";
  const nav = useMemo(() => navigator(m, filters, measure === "usd"), [m, filters, measure]);
  const option = useMemo(
    () =>
      timelineOption({
        m, theme, measure, lens, filters,
        hist: { shipped: latent ? h.latent : h.shipped, demand: latent ? h.latent : h.demand, imputed: h.imputed, cells: h.cells },
        fc: withForecast && !latent ? { value: fc.fc, p10: fc.p10, p50: fc.p50, p90: fc.p90 } : undefined,
        zoom: withForecast ? undefined : [0, m.asOf + 2],
      }),
    [m, theme, measure, lens, filters, h, fc, latent, withForecast],
  );
  const season = useMemo(() => seasonalityOption(m, h, theme), [m, h, theme]);
  const zeroCal = useMemo(() => zeroCalendarOption(m, single, segs, theme), [m, single, segs, theme]);
  const max = Math.max(1, ...nav.nodes.map((n) => n.vol));
  const total = nav.nodes.reduce((a, n) => a + n.vol, 0) || 1;
  const crumbs: { label: string; apply: Filters }[] = [{ label: "All", apply: { ...filters, family: null, sku: null, region: null, customer: null } }];
  if (filters.family !== null) crumbs.push({ label: m.dims.families.name[filters.family], apply: { ...filters, sku: null, region: null, customer: null } });
  if (filters.sku !== null) crumbs.push({ label: m.dims.skus.id[filters.sku], apply: { ...filters, region: null, customer: null } });
  if (filters.region !== null && filters.sku !== null) crumbs.push({ label: m.dims.regions[filters.region], apply: { ...filters, customer: null } });
  if (filters.customer !== null && filters.sku !== null && filters.region !== null) crumbs.push({ label: m.dims.customers[filters.customer], apply: filters });
  const shown = nav.nodes.filter((n) => !q || n.label.toLowerCase().includes(q.toLowerCase()) || (n.sub ?? "").toLowerCase().includes(q.toLowerCase()));
  const levelName = { family: "Families", sku: "SKUs", region: "Regions (series)", customer: "Customers of this series" }[nav.level];

  return (
    <>
      <div className="grid g-1-2">
        <Card
          title={levelName}
          sub={
            <span className="toolbar small" style={{ gap: 4 }}>
              {crumbs.map((c, i) => (
                <span key={i}>
                  {i > 0 && " › "}
                  {i < crumbs.length - 1 ? (
                    <button type="button" className="btn link" onClick={() => setFilters(c.apply)}>
                      {c.label}
                    </button>
                  ) : (
                    <b>{c.label}</b>
                  )}
                </span>
              ))}
            </span>
          }
          info={<Info what="Drill-down navigator: click a row to filter to it; the breadcrumb rolls back up. Bars show unconstrained demand of the last 12 months." source="history.json" />}
        >
          {nav.nodes.length > 12 && <input className="combo-btn" style={{ width: "100%", maxWidth: "none", marginBottom: 8, cursor: "text" }} placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the list" />}
          <div className="tree" role="list">
            {shown.slice(0, 200).map((n) => {
              const sel = nav.level === "customer" && filters.customer === n.key;
              return (
                <div key={n.key} role="listitem" className={`tree-row ${sel ? "sel" : ""}`} onClick={() => setFilters({ ...filters, ...n.apply })} title={n.sub}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {n.label}
                    {n.sub && <span className="muted tiny"> {n.sub}</span>}
                  </span>
                  <div className="bar" style={{ width: `${(n.vol / max) * 100}%` }} />
                  <span className="num small muted" style={{ textAlign: "right" }}>
                    {compact(n.vol)} · {fmtPct(n.vol / total, 0)}
                  </span>
                </div>
              );
            })}
            {!shown.length && <Empty>Nothing matches.</Empty>}
          </div>
        </Card>
        <Card
          title={`${latent ? "Latent monthly demand" : "Orders as booked"} · ${measure === "usd" ? "USD" : "units"}`}
          sub={
            single !== null
              ? "Click any month to open its lineage: raw value, cleaning rule and cleaned value."
              : latent
                ? "Each order spread over the months it carries: the ordering cycle is removed and the underlying demand shows."
                : "Orders land on each customer's ordering cycle (monthly, every 2nd month, quarterly…); switch to the latent lens to remove it."
          }
          tools={
            <label className="small toolbar" style={{ gap: 6 }}>
              <input type="checkbox" checked={withForecast} onChange={(e) => setParam({ fc: e.target.checked ? "1" : null }, true)} /> continue into forecast
            </label>
          }
          info={<Info what="The selection's history on the shared timeline; optionally continued into the forecast." how="Orders as booked = cleaned shipments; latent = order / (1 + carried months × weight) spread over the carried months (shutdown months carry half)." source="history.json" />}
        >
          <EChart option={option} height={330} ariaLabel="Series timeline" xGrid={1} onXClick={(t) => single !== null && t <= m.asOf && setCell({ s: single, t })} />
          <TimelineLegend latent={latent} band={withForecast} />
        </Card>
      </div>
      <div className="grid g3">
        <Card title="Seasonality" sub="Monthly index of latent demand (1 = the year's average); thin lines are years, the coloured line the average excluding 2020." info={<Info what="Month-of-year profile of the selection, on latent demand so ordering cycles do not create fake peaks." how="Each year's 12 months divided by that year's mean; years with an empty month are skipped." source="history.json" />}>
          {season ? <EChart option={season} height={260} ariaLabel="Seasonality" /> : <Empty>Not enough full years for a profile.</Empty>}
        </Card>
        <Card
          title={single !== null ? "Zero-month calendar" : "Zero months by month"}
          sub={single !== null ? "Shade = units. · = scheduled off-cycle month, L = lost-account tail, 0 = zero on an order month, ? = missing row (imputed)." : "Share of cells with zero demand (darker = more, relative to the busiest month); hover for how many are scheduled by ordering cycles. Pick a series for its own calendar."}
          info={<Info what="Years × months. Zeros are explained: most are off-months of a deterministic ordering cycle, not random intermittency." how="Flags from the demand stage (on-phase, structural zero, lost tail, missing row)." source="history.json (flags)" />}
        >
          <EChart option={zeroCal} height={260} ariaLabel="Zero-month calendar" />
        </Card>
        <Card title={single !== null ? "Series card" : "Composition"} sub={single !== null ? "Master data, ordering cycle, customers and demand profile." : "Ordering cycles and lifecycle in the selection."} info={<Info what="Facts about the selected series from the master, the demand state and the series profile." source="dims.json, profiles.json" />}>
          {single !== null ? <SeriesCard m={m} s={single} /> : <Composition m={m} series={series} />}
        </Card>
      </div>
      {cell && <LineageDrawer series={cell.s} month={cell.t} onClose={() => setCell(null)} />}
      <p className="muted tiny">{monthName(m.months[m.asOf])} is the last actual month. Data health has the full rule list; the anomaly monitor flags this series' unusual months.</p>
    </>
  );
}
