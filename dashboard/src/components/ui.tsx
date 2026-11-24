// Shared UI pieces: card with "what / how / source" popover, KPI tile, segmented control, states, table, drawer.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export function Info({ what, how, source }: { what: ReactNode; how?: ReactNode; source?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <span className="info" ref={ref}>
      <button type="button" aria-label="About this chart" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        i
      </button>
      {open && (
        <span className="info-pop" role="dialog">
          <p>
            <b>What it shows.</b> {what}
          </p>
          {how && (
            <p>
              <b>How it is computed.</b> {how}
            </p>
          )}
          {source && (
            <p>
              <b>Source.</b> <code>{source}</code>
            </p>
          )}
        </span>
      )}
    </span>
  );
}

export function Card(props: { title: ReactNode; sub?: ReactNode; tools?: ReactNode; info?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section className={`card ${props.className ?? ""}`} id={props.id}>
      <div className="card-head">
        <div className="t">
          <h2>{props.title}</h2>
          {props.sub && <div className="sub">{props.sub}</div>}
        </div>
        <div className="card-tools">
          {props.tools}
          {props.info}
        </div>
      </div>
      {props.children}
    </section>
  );
}

export function Kpi(props: { label: ReactNode; value: ReactNode; unit?: string; foot?: ReactNode; info?: ReactNode }) {
  return (
    <div className="card kpi">
      <div className="label">
        {props.label}
        {props.info}
      </div>
      <div className="value">
        {props.value}
        {props.unit && <small>{props.unit}</small>}
      </div>
      {props.foot && <div className="foot">{props.foot}</div>}
    </div>
  );
}

export function Segmented<T extends string>(props: { value: T; options: { value: T; label: string; title?: string }[]; onChange: (v: T) => void; ariaLabel: string }) {
  return (
    <div className="seg" role="radiogroup" aria-label={props.ariaLabel}>
      {props.options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === props.value} className={o.value === props.value ? "on" : ""} title={o.title} onClick={() => props.onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const Loading = ({ what }: { what: string }) => (
  <div className="state" aria-live="polite">
    <div className="spinner" />
    Loading {what}…
  </div>
);
export const ErrorState = ({ message }: { message: string }) => (
  <div className="state err" role="alert">
    Could not load data: {message}
  </div>
);
export const Empty = ({ children }: { children: ReactNode }) => <div className="state">{children}</div>;

export interface Column<R> {
  key: string;
  label: string;
  value: (r: R) => number | string | null;
  render?: (r: R) => ReactNode;
  num?: boolean;
  width?: number;
  wrap?: boolean; // long text: allow line breaks
}

export function toCsv<R>(rows: R[], cols: Column<R>[]): string {
  const q = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.map((c) => q(c.label)).join(","), ...rows.map((r) => cols.map((c) => q(c.value(r))).join(","))].join("\n");
}

export function download(name: string, text: string, type = "text/csv") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function DataTable<R>(props: {
  rows: R[];
  cols: Column<R>[];
  pageSize?: number;
  onRow?: (r: R) => void;
  selected?: (r: R) => boolean;
  csvName?: string;
  initialSort?: { key: string; desc: boolean };
  empty?: string;
}) {
  const [sort, setSort] = useState(props.initialSort ?? null);
  const [page, setPage] = useState(0);
  const pageSize = props.pageSize ?? 15;
  const sorted = useMemo(() => {
    if (!sort) return props.rows;
    const col = props.cols.find((c) => c.key === sort.key);
    if (!col) return props.rows;
    const out = [...props.rows];
    out.sort((a, b) => {
      const x = col.value(a);
      const y = col.value(b);
      if (x === y) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
      return sort.desc ? -c : c;
    });
    return out;
  }, [props.rows, props.cols, sort]);
  useEffect(() => setPage(0), [props.rows]);
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const view = sorted.slice(page * pageSize, page * pageSize + pageSize);
  return (
    <div>
      <div className="table-wrap">
        <table className="dt">
          <thead>
            <tr>
              {props.cols.map((c) => (
                <th
                  key={c.key}
                  className={c.num ? "num" : ""}
                  style={c.width ? { width: c.width } : undefined}
                  aria-sort={sort?.key === c.key ? (sort.desc ? "descending" : "ascending") : "none"}
                  onClick={() => setSort((s) => (s?.key === c.key ? { key: c.key, desc: !s.desc } : { key: c.key, desc: !!c.num }))}
                >
                  {c.label}
                  {sort?.key === c.key ? (sort.desc ? " ↓" : " ↑") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.map((r, i) => (
              <tr key={i} className={`${props.onRow ? "clickable" : ""} ${props.selected?.(r) ? "sel" : ""}`} onClick={() => props.onRow?.(r)}>
                {props.cols.map((c) => (
                  <td key={c.key} className={c.num ? "num" : c.wrap ? "wrap" : ""}>
                    {c.render ? c.render(r) : (c.value(r) ?? "–")}
                  </td>
                ))}
              </tr>
            ))}
            {!view.length && (
              <tr>
                <td colSpan={props.cols.length}>
                  <div className="state">{props.empty ?? "Nothing matches the current filters."}</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="dt-foot">
        <span>
          {sorted.length.toLocaleString("en-US")} row{sorted.length === 1 ? "" : "s"}
          {pages > 1 && ` · page ${page + 1} of ${pages}`}
        </span>
        <span className="toolbar">
          {pages > 1 && (
            <>
              <button className="btn" type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                ‹ Prev
              </button>
              <button className="btn" type="button" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>
                Next ›
              </button>
            </>
          )}
          {props.csvName && (
            <button className="btn" type="button" onClick={() => download(props.csvName as string, toCsv(sorted, props.cols))}>
              Download CSV
            </button>
          )}
        </span>
      </div>
    </div>
  );
}

export function Drawer(props: { title: ReactNode; sub?: ReactNode; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => e.key === "Escape" && props.onClose();
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [props]);
  return (
    <>
      <div className="drawer-back" onClick={props.onClose} />
      <aside className="drawer" role="dialog" aria-modal="true">
        <div className="drawer-head">
          <div>
            <h2>{props.title}</h2>
            {props.sub && <div className="muted small">{props.sub}</div>}
          </div>
          <button className="btn" type="button" onClick={props.onClose} aria-label="Close">
            Close ✕
          </button>
        </div>
        <div className="drawer-body">{props.children}</div>
      </aside>
    </>
  );
}

export function TimelineLegend({ latent, band = true, fc = true, extra }: { latent: boolean; band?: boolean; fc?: boolean; extra?: ReactNode }) {
  return (
    <div className="legend" aria-label="Timeline legend">
      <span>
        <i className="lk" style={{ borderColor: "var(--history)" }} />
        {latent ? "Latent monthly demand (history)" : "Shipped, cleaned history"}
      </span>
      {!latent && (
        <span title="Requested demand where stock-outs constrained shipments (and back-order catch-up removed)">
          <i className="lk dash" style={{ borderColor: "var(--demand)" }} />
          Unconstrained demand (where it differs)
        </span>
      )}
      {fc && (
        <span>
          <i className="lk" style={{ borderColor: "var(--accent)" }} />
          {latent ? "Latent demand (forecast)" : "Forecast (submitted)"}
        </span>
      )}
      {fc && band && !latent && (
        <>
          <span>
            <i className="lk band" style={{ background: "var(--accent-wash)" }} />
            P10–P90 range
          </span>
          <span>
            <i className="lk dot" style={{ borderColor: "var(--accent-ink)" }} />
            P50
          </span>
        </>
      )}
      <span>
        <i className="lk rule" style={{ borderColor: "var(--muted)" }} />
        Last actual (Oct 2026)
      </span>
      <span>○ imputed month</span>
      {extra}
    </div>
  );
}
