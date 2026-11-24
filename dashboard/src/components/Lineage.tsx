// Cell-level lineage drawer: raw value → rule → cleaned value for one SKU × region × month, from the fix log,
// plus the dropped versions of a repeated Record_ID and the cell's demand flags.
import { useApp } from "../app/context";
import { useResource } from "../data/load";
import { monthName, fmt1 } from "../data/format";
import type { LineageFile } from "../data/types";
import { Drawer, ErrorState, Loading } from "./ui";

const FLAG_TEXT: Record<string, string> = {
  missing_row: "Row missing from the extract (rebuilt from the Record_ID grid — not a zero)",
  imputed: "Demand imputed (fill or inferred zero)",
  stockout_listed: "Listed stock-out: demand = Requested_Units",
  stockout_inferred: "Inferred stock-out (unlisted semiconductor month or hidden operational)",
  one_off: "One-off bulk order (kept in history, masked for level estimation)",
  numeric_fix: "Numeric error corrected (units, price or revenue)",
  structural_zero: "Scheduled zero: off-month of the ordering cycle",
  lost_tail: "Lost-account tail",
  on_phase: "Order month of the ordering cycle",
  half_carry: "Carries half of the previous annual-shutdown month",
  masked: "Excluded from model fitting (event or unknown value)",
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

export function LineageDrawer({ series, month, onClose }: { series: number; month: number; onClose: () => void }) {
  const { m } = useApp();
  const code = m.dims.families.code[m.sFamily[series]];
  const lin = useResource<LineageFile>(`lineage/${code}.json`);
  const seg = m.segOfSeries[series].find((g) => month >= m.gStart[g] && month < m.gStart[g] + m.gLen[g]);
  const i = seg === undefined ? -1 : m.gOff[seg] + month - m.gStart[seg];
  const startRec = m.dims.series.start_rec[series];
  const start = m.sStart[series];
  const recordId = startRec !== null && startRec >= 0 ? `CEL-${String(startRec + month - start).padStart(7, "0")}` : "–";
  const sku = m.dims.skus.id[m.sSku[series]];
  const fixes: number[] = [];
  const dropped: number[] = [];
  if (lin.data) {
    const F = lin.data.fixes;
    for (let k = 0; k < F.series.length; k++) if (F.series[k] === series && F.month[k] === month) fixes.push(k);
    const D = lin.data.dropped;
    for (let k = 0; k < D.series.length; k++) if (D.series[k] === series && D.month[k] === month) dropped.push(k);
  }
  return (
    <Drawer title={`${sku} · ${m.dims.regions[m.sRegion[series]]} · ${monthName(m.months[month])}`} sub={`Record ${recordId} · ${m.dims.skus.description[m.sSku[series]] ?? ""}`} onClose={onClose}>
      {i < 0 ? (
        <div className="callout warn">This month is outside the series' sales window: no record exists.</div>
      ) : (
        <>
          <section>
            <h3>Cleaned cell</h3>
            <dl className="kv" style={{ marginTop: 6 }}>
              <dt>Shipped units (cleaned)</dt>
              <dd>{Number.isNaN(m.u[i]) ? "unknown" : fmt1(m.u[i])}</dd>
              <dt>Unconstrained demand</dt>
              <dd>{fmt1(m.d[i])}</dd>
              <dt>Latent monthly demand</dt>
              <dd>{fmt1(m.latent[i])}</dd>
              <dt>Customer at the time</dt>
              <dd>{seg !== undefined ? m.dims.customers[m.gCustomer[seg]] : "–"}</dd>
            </dl>
            <ul className="small ink2" style={{ margin: "8px 0 0", paddingLeft: 18 }}>
              {cellFlags(m.f[i], m.bit, m.accumMask).map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </section>
          <section>
            <h3>Fix log: raw → rule → cleaned</h3>
            {lin.loading && <Loading what="the fix log" />}
            {lin.error && <ErrorState message={lin.error} />}
            {lin.data && !fixes.length && <p className="small muted">No field of this record was changed: the raw value passed every check (convention fills such as the zero-row price are not listed).</p>}
            {lin.data && fixes.length > 0 && (
              <div className="table-wrap" style={{ marginTop: 6 }}>
                <table className="dt">
                  <thead>
                    <tr>
                      <th>Step</th>
                      <th>Rule</th>
                      <th>Field</th>
                      <th>Method</th>
                      <th>Raw</th>
                      <th>Before</th>
                      <th>After</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fixes.map((k) => {
                      const F = lin.data!.fixes;
                      return (
                        <tr key={k} title={F.evidence[k] ?? ""}>
                          <td className="num">{F.step[k]}</td>
                          <td>
                            <code>{F.rule[k]}</code>
                          </td>
                          <td>{F.column[k]}</td>
                          <td>{F.method[k]}</td>
                          <td>
                            <code>{F.raw[k] === null || F.raw[k] === "" ? "∅" : F.raw[k]}</code>
                          </td>
                          <td>
                            <code>{F.before[k] ?? "∅"}</code>
                          </td>
                          <td>
                            <code>
                              <b>{F.after[k] ?? "∅"}</b>
                            </code>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {lin.data && fixes.some((k) => lin.data!.fixes.evidence[k]) && (
              <details style={{ marginTop: 8 }}>
                <summary className="small">Evidence (JSON)</summary>
                <pre className="small" style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                  {fixes.map((k) => `${lin.data!.fixes.rule[k]}: ${lin.data!.fixes.evidence[k] ?? ""}`).join("\n")}
                </pre>
              </details>
            )}
          </section>
          {dropped.length > 0 && lin.data && (
            <section>
              <h3>Dropped versions of this Record_ID</h3>
              <div className="table-wrap" style={{ marginTop: 6 }}>
                <table className="dt">
                  <thead>
                    <tr>
                      <th>Kind</th>
                      <th>Dropped load</th>
                      <th>Kept load</th>
                      <th className="num">Units dropped → kept</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dropped.map((k) => {
                      const D = lin.data!.dropped;
                      return (
                        <tr key={k}>
                          <td>{D.kind[k].replace(/_/g, " ")}</td>
                          <td>{D.dropped_load[k]}</td>
                          <td>{D.kept_load[k]}</td>
                          <td className="num">
                            {D.units_dropped[k] ?? "∅"} → {D.units_kept[k] ?? "∅"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </Drawer>
  );
}
