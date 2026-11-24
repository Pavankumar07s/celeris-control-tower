// Cell-level lineage drawer: raw value -> rule -> cleaned value for one SKU x region x month, from the fix
// log, plus the dropped versions of a repeated Record_ID and the cell's demand flags.  Drawer anatomy
// (design system 5.6): kicker -> computed serif headline -> identity line -> three figures -> the cell in
// its series -> what the flags say -> fix log -> dropped versions -> facts.
import { useMemo } from "react";
import { useApp } from "../app/context";
import type { Model } from "../data/model";
import { useResource } from "../data/load";
import { fmt1, fmtInt, monthLong, monthName } from "../data/format";
import type { LineageFile } from "../data/types";
import { countWord, joinList, plural } from "../insights/headlines";
import { Drawer } from "./overlays";
import { ErrorState, SkeletonText } from "./states";

// ---- the drawer's cell in the URL: `cell=HYD-004|Europe|2023-03` (readable, stable across bundle builds), so a
//      reload or a shared link reopens the drawer on the same cell, from any view -----------------------------------
export interface CellRef {
  s: number;
  t: number;
}
/** The series of a SKU id and region name, or -1. */
export function seriesOf(m: Model, sku: string, region: string): number {
  const k = m.dims.skus.id.indexOf(sku);
  const r = m.dims.regions.indexOf(region);
  if (k < 0 || r < 0) return -1;
  for (let s = 0; s < m.nSeries; s++) if (m.sSku[s] === k && m.sRegion[s] === r) return s;
  return -1;
}
export const encodeCell = (m: Model, c: CellRef): string => `${m.dims.skus.id[m.sSku[c.s]]}|${m.dims.regions[m.sRegion[c.s]]}|${m.months[c.t]}`;
export function decodeCell(m: Model, v: string | null): CellRef | null {
  if (!v) return null;
  const [sku, region, month] = v.split("|");
  const s = seriesOf(m, sku ?? "", region ?? "");
  const t = m.months.indexOf(month ?? "");
  return s >= 0 && t >= 0 && t <= m.asOf ? { s, t } : null;
}
/** Resolve a check example (sku_id + region + date, or a Record_ID) to a history cell, if it has one.
 *  Record_IDs are numbered per series from `start_rec`, the same rule the lineage drawer uses. */
export function cellOfExample(m: Model, ex: Record<string, unknown> | undefined): CellRef | null {
  if (!ex) return null;
  const sku = (ex.sku_id ?? ex.SKU_ID) as string | undefined;
  const region = (ex.region ?? ex.Region) as string | undefined;
  const date = (ex.date ?? ex.Date) as string | undefined;
  if (sku && region && date) {
    const s = seriesOf(m, sku, region);
    const t = m.months.indexOf(date);
    if (s >= 0 && t >= 0 && t <= m.asOf) return { s, t };
  }
  const rid = ex.record_id as string | undefined;
  const n = rid ? Number(rid.replace(/^\D+/, "")) : NaN;
  if (Number.isFinite(n)) {
    const sr = m.dims.series.start_rec;
    for (let s = 0; s < m.nSeries; s++) {
      const a = sr[s];
      if (a === null || a < 0 || n < a) continue;
      const t = m.sStart[s] + (n - a);
      if (t <= m.sEnd[s] && t <= m.asOf) return { s, t };
    }
  }
  return null;
}

const FLAG_TEXT: Record<string, string> = {
  missing_row: "Row missing from the extract: rebuilt from the Record_ID grid, not zero-filled",
  imputed: "Demand imputed (a fill or an inferred zero)",
  stockout_listed: "Listed stock-out: demand is the requested units",
  stockout_inferred: "Inferred stock-out (an unlisted semiconductor month or a hidden operational one)",
  one_off: "One-off bulk order: kept in history, masked when the level is estimated",
  numeric_fix: "Numeric error corrected (units, price or revenue)",
  structural_zero: "Scheduled zero: an off-month of the ordering cycle",
  lost_tail: "Lost-account tail",
  on_phase: "An order month of the ordering cycle",
  half_carry: "Carries half of the previous annual-shutdown month",
  masked: "Excluded from model fitting (an event or an unknown value)",
  units_unknown: "Units unknown (ERP migration blank)",
};

export function cellFlags(flags: number, bits: Record<string, number>, accumMask: number): string[] {
  const out = Object.entries(bits)
    .filter(([, b]) => flags & b)
    .map(([k]) => FLAG_TEXT[k] ?? k);
  const span = flags & accumMask;
  if (span > 1) out.push(`The order carries ${span} months of latent demand`);
  return out;
}

/** Field names of the raw extract in words, for the headline. */
const FIELD: Record<string, string> = {
  Units_Sold: "units",
  Revenue_USD: "revenue",
  Unit_Price_USD: "price",
  Region: "region",
  Date: "date",
  Month: "month",
  SKU_ID: "SKU code",
  Sales_Channel: "channel",
  Customer_Name: "customer name",
  Product_Family: "family",
  SKU_Description: "description",
};

/** Evidence JSON as "key value, key value" (never rendered as HTML). */
function evidenceText(s: string | null): string {
  if (!s) return "";
  try {
    const o = JSON.parse(s) as Record<string, unknown>;
    return Object.entries(o)
      .map(([k, v]) => `${k.replace(/_/g, " ")} ${typeof v === "number" ? String(v) : String(v ?? "–")}`)
      .join(", ");
  } catch {
    return s;
  }
}

const Val = ({ v }: { v: string | null }) => (v === null ? <span className="nil">unknown</span> : v === "" ? <span className="nil">blank</span> : <code>{v}</code>);

export function LineageDrawer({ series, month, onClose }: { series: number; month: number; onClose: () => void }) {
  const { m } = useApp();
  const code = m.dims.families.code[m.sFamily[series]];
  const lin = useResource<LineageFile>(`lineage/${code}.json`);
  const seg = m.segOfSeries[series].find((g) => month >= m.gStart[g] && month < m.gStart[g] + m.gLen[g]);
  const i = seg === undefined ? -1 : m.gOff[seg] + month - m.gStart[seg];
  const startRec = m.dims.series.start_rec[series];
  const start = m.sStart[series];
  const recordId = startRec !== null && startRec >= 0 ? `CEL-${String(startRec + month - start).padStart(7, "0")}` : null;
  const sku = m.dims.skus.id[m.sSku[series]];
  const region = m.dims.regions[m.sRegion[series]];
  const desc = m.dims.skus.description[m.sSku[series]];
  const { fixes, dropped } = useMemo(() => {
    const fx: number[] = [];
    const dr: number[] = [];
    if (lin.data) {
      const F = lin.data.fixes;
      for (let k = 0; k < F.series.length; k++) if (F.series[k] === series && F.month[k] === month) fx.push(k);
      const D = lin.data.dropped;
      for (let k = 0; k < D.series.length; k++) if (D.series[k] === series && D.month[k] === month) dr.push(k);
    }
    return { fixes: fx, dropped: dr };
  }, [lin.data, series, month]);
  const F = lin.data?.fixes;
  const D = lin.data?.dropped;
  const flags = i >= 0 ? cellFlags(m.f[i], m.bit, m.accumMask) : [];
  const missing = i >= 0 && (m.f[i] & m.bit.missing_row) !== 0;

  // ---- the computed headline: what happened to this record
  const fieldFixes = F ? fixes.filter((k) => F.column[k] !== "<row>") : [];
  const fields = F ? [...new Set(fieldFixes.map((k) => FIELD[F.column[k]] ?? F.column[k].replace(/_/g, " ").toLowerCase()))] : [];
  const nDropped = F ? fixes.filter((k) => F.column[k] === "<row>").length + dropped.length : 0;
  const when = monthLong(m.months[month]);
  let headline: string;
  if (i < 0) headline = `No ${sku} record exists in ${region} for ${when}`;
  else if (missing) headline = `The ${when} row was missing from the extract and was rebuilt, not zero-filled`;
  else if (!lin.data) headline = `${sku} in ${region}, ${when}`;
  else if (fields.length) headline = `${countWord(fields.length, true)} ${plural(fields.length, "field")} of this record ${fields.length === 1 ? "was" : "were"} repaired: ${joinList(fields)}`;
  else if (nDropped) headline = `${countWord(Math.max(1, dropped.length), true)} other ${plural(Math.max(1, dropped.length), "version")} of this record ${dropped.length > 1 ? "were" : "was"} dropped`;
  else headline = "This record passed every check unchanged";

  // ---- the cell in its series: unconstrained demand +-12 months, this month in ink
  const ctx = useMemo(() => {
    const vals: { t: number; v: number | null; unknown: boolean }[] = [];
    for (let t = Math.max(0, month - 12); t <= Math.min(m.asOf, month + 12); t++) {
      const g = m.segOfSeries[series].find((x) => t >= m.gStart[x] && t < m.gStart[x] + m.gLen[x]);
      if (g === undefined) {
        vals.push({ t, v: null, unknown: false });
        continue;
      }
      const c = m.gOff[g] + t - m.gStart[g];
      vals.push({ t, v: Number.isFinite(m.d[c]) ? m.d[c] : null, unknown: Number.isNaN(m.u[c]) });
    }
    const max = Math.max(1e-9, ...vals.map((x) => x.v ?? 0));
    return { vals, max };
  }, [m, series, month]);
  const W = 100 / Math.max(1, ctx.vals.length);

  return (
    <Drawer eyebrow={recordId ? `Cell lineage, record ${recordId}` : "Cell lineage"} title={headline} sub={<><span className="id">{sku}</span> · {region} · {monthName(m.months[month])}{desc ? ` · ${desc}` : ""}</>} onClose={onClose} width={620}>
      {i < 0 ? (
        <p className="lin-p">This month is outside the series&rsquo; sales window, so the extract holds no record for it. Pick a month between {monthName(m.months[Math.max(0, m.sStart[series])])} and {monthName(m.months[Math.min(m.asOf, m.sEnd[series])])}.</p>
      ) : (
        <>
          <div className="trio" role="group" aria-label="Cleaned cell">
            <div>
              <span>Shipped, cleaned</span>
              <b>{Number.isNaN(m.u[i]) ? "unknown" : fmtInt(m.u[i])}</b>
            </div>
            <div>
              <span>Unconstrained demand</span>
              {/* shipped units are whole; demand is whole unless an estimated stock-out loss is added back */}
              <b>{Math.abs(m.d[i] - Math.round(m.d[i])) < 0.05 ? fmtInt(m.d[i]) : fmt1(m.d[i])}</b>
            </div>
            <div>
              <span>Latent demand, a month</span>
              <b>{fmt1(m.latent[i])}</b>
            </div>
          </div>

          <figure className="lin-ctx" aria-label={`Unconstrained demand of ${sku} in ${region}, ${monthName(m.months[ctx.vals[0].t])} – ${monthName(m.months[ctx.vals[ctx.vals.length - 1].t])}; ${monthName(m.months[month])} highlighted`}>
            <svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
              <line x1="0" x2="100" y1="39.5" y2="39.5" stroke="var(--rule-strong)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
              {ctx.vals.map((x, k) =>
                x.v !== null && x.v > 0 ? (
                  <rect key={x.t} x={k * W + W * 0.18} width={W * 0.64} y={39 - (x.v / ctx.max) * 36} height={(x.v / ctx.max) * 36} fill={x.t === month ? "var(--ink)" : "var(--hist-3)"} />
                ) : x.t === month ? (
                  <rect key={x.t} x={k * W + W * 0.18} width={W * 0.64} y={37} height={2} fill="var(--ink)" />
                ) : null,
              )}
            </svg>
            <figcaption>
              <span>{monthName(m.months[ctx.vals[0].t])}</span>
              <span>
                Unconstrained demand, units; <b>{monthName(m.months[month])}</b> highlighted
              </span>
              <span>{monthName(m.months[ctx.vals[ctx.vals.length - 1].t])}</span>
            </figcaption>
          </figure>

          <section>
            <h3>What the flags say</h3>
            {flags.length ? (
              <ul className="lin-flags">
                {flags.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            ) : (
              <p className="lin-p">No cleaning or demand flag on this cell.</p>
            )}
          </section>

          <section>
            <h3>Fix log: raw value, rule, cleaned value</h3>
            {lin.loading && <SkeletonText lines={3} height={14} lastWidth="70%" />}
            {lin.error && <ErrorState message={lin.error} />}
            {F && !fieldFixes.length && <p className="lin-p">No field of this record was changed: the raw values passed every check (convention fills such as the zero-row price are not listed).</p>}
            {F && fieldFixes.length > 0 && (
              <div className="table-wrap">
                <table className="ledger lin-t" aria-label="Fixes applied to this record">
                  <thead>
                    <tr>
                      <th scope="col" className="num">
                        Step
                      </th>
                      <th scope="col">Rule</th>
                      <th scope="col">Field</th>
                      <th scope="col">Raw</th>
                      <th scope="col">Cleaned</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fieldFixes.map((k) => (
                      <tr key={k}>
                        <td className="num">{F.step[k]}</td>
                        <td>
                          <span className="id">{F.rule[k]}</span> <span className="lin-method">{F.method[k]}</span>
                        </td>
                        <td>{F.column[k].replace(/_/g, " ")}</td>
                        <td>
                          <Val v={F.raw[k]} />
                        </td>
                        <td className="lin-after">
                          <Val v={F.after[k]} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {F && fieldFixes.some((k) => F.evidence[k]) && (
              <ul className="lin-evidence" aria-label="Evidence for each fix">
                {fieldFixes
                  .filter((k) => F.evidence[k])
                  .map((k) => (
                    <li key={k}>
                      <span className="id">{F.rule[k]}</span> {evidenceText(F.evidence[k])}
                    </li>
                  ))}
              </ul>
            )}
          </section>

          {D && dropped.length > 0 && (
            <section>
              <h3>Dropped versions of this Record_ID</h3>
              <div className="table-wrap">
                <table className="ledger lin-t" aria-label="Dropped versions">
                  <thead>
                    <tr>
                      <th scope="col">Kind</th>
                      <th scope="col">Dropped load</th>
                      <th scope="col">Kept load</th>
                      <th scope="col" className="num">
                        Units dropped
                      </th>
                      <th scope="col" className="num">
                        Units kept
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {dropped.map((k) => (
                      <tr key={k}>
                        <td>{D.kind[k].replace(/_/g, " ")}</td>
                        <td className="num">{D.dropped_load[k]}</td>
                        <td className="num">{D.kept_load[k]}</td>
                        <td className="num">{D.units_dropped[k] ?? "–"}</td>
                        <td className="num">{D.units_kept[k] ?? "–"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <dl className="facts">
            {recordId && (
              <>
                <dt>Record_ID</dt>
                <dd>
                  <span className="id">{recordId}</span>
                </dd>
              </>
            )}
            <dt>Customer at the time</dt>
            <dd>{seg !== undefined ? m.dims.customers[m.gCustomer[seg]] : "–"}</dd>
            <dt>Channel</dt>
            <dd>{m.dims.channels[m.sChannel[series]]}</dd>
            <dt>Series months</dt>
            <dd>
              {monthName(m.months[Math.max(0, m.sStart[series])])} – {monthName(m.months[Math.min(m.asOf, m.sEnd[series])])}, {fmtInt(Math.min(m.asOf, m.sEnd[series]) - Math.max(0, m.sStart[series]) + 1)} months
            </dd>
            <dt>Source</dt>
            <dd>
              <code>lineage/{code}.json</code>, history.json
            </dd>
          </dl>
        </>
      )}
    </Drawer>
  );
}
