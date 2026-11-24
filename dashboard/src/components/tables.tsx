// Tables.  Two types: the BAR TABLE for rankings and change (text-first, an inline bar per row, the leader
// in orange for forecast or ink for history, the rest tinted) and the LEDGER (DataTable) for registers and
// inboxes (sortable, paged, CSV twin, mono identifiers, 2-line clamps, inline bars).  Numbers are always
// right-aligned with tabular numerals; rows never grow beyond about 64px.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, Download } from "./icons";

export type BarTone = "forecast" | "history" | "loss";

export interface BarCol<R> {
  key: string;
  label: ReactNode;
  /** label (first column, ink 500), text, num (right, tabular), id (mono), bar (the inline bar). */
  kind?: "label" | "text" | "num" | "id" | "bar";
  value?: (r: R) => number | string | null;
  render?: (r: R) => ReactNode;
  /** Column width for the fixed layout ("34%", 90). */
  width?: string | number;
  title?: (r: R) => string;
  /** Hidden below 480px (keep the label, the bar and one number). */
  hideNarrow?: boolean;
}

export interface BarSpec<R> {
  value: (r: R) => number;
  tone?: BarTone;
  /** The highlighted row(s): orange (forecast) or ink (history); the rest use the tint. */
  leader?: (r: R) => boolean;
  /** Fixed absolute maximum (default: the largest |value| in the rows). */
  max?: number;
}

export interface BarTableProps<R> {
  rows: R[];
  cols: BarCol<R>[];
  bar?: BarSpec<R>;
  onRow?: (r: R) => void;
  selected?: (r: R) => boolean;
  rowKey?: (r: R, i: number) => string | number;
  ariaLabel: string;
  /** Footer row cells, keyed by column key. */
  total?: Record<string, ReactNode>;
}

/** Inline bar track: a zero line when values change sign, bars 10px high with a 2px data-end radius. */
export function BarTrack({ value, min, max, lead, tone = "forecast" }: { value: number; min: number; max: number; lead?: boolean; tone?: BarTone }) {
  const span = max - min || 1;
  const zero = ((0 - min) / span) * 100;
  const left = value < 0 ? zero - (Math.abs(value) / span) * 100 : zero;
  const width = (Math.abs(value) / span) * 100;
  return (
    <div className={`btrack ${tone === "forecast" ? "" : tone}`} aria-hidden="true">
      <div className={`b ${value >= 0 ? "pos" : ""} ${lead ? "lead" : ""}`} style={{ left: `${left}%`, width: `${width}%` }} />
      {min < 0 && max > 0 && <div className="zero" style={{ left: `${zero}%` }} />}
      {min < 0 && max <= 0 && <div className="zero" style={{ left: "100%" }} />}
    </div>
  );
}

export function BarTable<R>({ rows, cols, bar, onRow, selected, rowKey, ariaLabel, total }: BarTableProps<R>) {
  const dom = useMemo(() => {
    if (!bar) return { min: 0, max: 1 };
    const vals = rows.map(bar.value).filter(Number.isFinite);
    const absMax = bar.max ?? Math.max(1e-9, ...vals.map(Math.abs));
    const anyNeg = vals.some((v) => v < 0);
    const anyPos = vals.some((v) => v > 0);
    return anyNeg && anyPos ? { min: -absMax, max: absMax } : anyNeg ? { min: -absMax, max: 0 } : { min: 0, max: absMax };
  }, [rows, bar]);
  return (
    <table className="bt" aria-label={ariaLabel}>
      <colgroup>
        {cols.map((c) => (
          <col key={c.key} className={c.hideNarrow ? "hide-narrow" : undefined} style={c.width !== undefined ? { width: c.width } : undefined} />
        ))}
      </colgroup>
      <thead>
        <tr>
          {cols.map((c, i) => (
            <th key={c.key} scope="col" className={`${c.kind === "bar" ? "c" : i === 0 || c.kind === "text" || c.kind === "id" || c.kind === "label" ? "l" : ""} ${c.hideNarrow ? "hide-narrow" : ""}`}>
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const lead = bar?.leader?.(r) ?? false;
          return (
            <tr
              key={rowKey ? rowKey(r, i) : i}
              className={`${onRow ? "clickable" : ""} ${lead ? "leader" : ""} ${selected?.(r) ? "sel" : ""}`}
              onClick={onRow ? () => onRow(r) : undefined}
              tabIndex={onRow ? 0 : undefined}
              onKeyDown={onRow ? (e) => e.key === "Enter" && onRow(r) : undefined}
            >
              {cols.map((c, k) => {
                if (c.kind === "bar" && bar) {
                  return (
                    <td key={c.key} className="barcell">
                      <BarTrack value={bar.value(r)} min={dom.min} max={dom.max} lead={lead} tone={bar.tone} />
                    </td>
                  );
                }
                const v = c.render ? c.render(r) : (c.value?.(r) ?? "–");
                const cls = k === 0 || c.kind === "label" ? "lbl" : c.kind === "text" ? "l" : c.kind === "id" ? "l id" : "";
                return (
                  <td key={c.key} className={`${cls} ${c.hideNarrow ? "hide-narrow" : ""}`} title={c.title?.(r) ?? (typeof v === "string" ? v : undefined)}>
                    {v}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
      {total && (
        <tfoot>
          <tr>
            {cols.map((c) => (
              <td key={c.key} className={c.kind === "text" || c.kind === "label" ? "l" : ""}>
                {total[c.key] ?? ""}
              </td>
            ))}
          </tr>
        </tfoot>
      )}
    </table>
  );
}

/** Inline bar for a ledger cell: value text then a bar scaled to `max`. */
export function InlineBar({ value, max, label, lead, tone = "forecast", width = 64 }: { value: number; max: number; label: ReactNode; lead?: boolean; tone?: BarTone; width?: number }) {
  return (
    <span className={`ibar ${tone === "forecast" ? "" : tone}`}>
      <span>{label}</span>
      <i className={lead ? "lead" : ""} style={{ width: Math.max(1, (Math.abs(value) / (max || 1)) * width) }} aria-hidden="true" />
    </span>
  );
}

// ---- ledger -------------------------------------------------------------------------------------------
export interface Column<R> {
  key: string;
  label: string;
  value: (r: R) => number | string | null;
  render?: (r: R) => ReactNode;
  /** Right-aligned, tabular numerals. */
  num?: boolean;
  width?: number;
  /** Long text: allow line breaks (legacy).  Prefer `clamp`. */
  wrap?: boolean;
  /** Long text clamped to 2 lines (full text in the title tooltip / drawer). */
  clamp?: boolean;
  /** Identifier in Plex Mono 500. */
  id?: boolean;
  /** Forecast column: headed by a 2px orange rule (the colour grammar inside a table). */
  fc?: boolean;
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

export interface DataTableProps<R> {
  rows: R[];
  cols: Column<R>[];
  pageSize?: number;
  onRow?: (r: R) => void;
  selected?: (r: R) => boolean;
  csvName?: string;
  initialSort?: { key: string; desc: boolean };
  empty?: string;
  ariaLabel?: string;
}

/** The ledger: sortable (▾ on the active column), paged, keyboard rows (Enter opens), CSV twin. */
export function DataTable<R>(props: DataTableProps<R>) {
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
        <table className="ledger dt" aria-label={props.ariaLabel}>
          <thead>
            <tr>
              {props.cols.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={`sortable ${c.num ? "num" : ""} ${c.fc ? "fc-col" : ""}`}
                  style={c.width ? { width: c.width } : undefined}
                  aria-sort={sort?.key === c.key ? (sort.desc ? "descending" : "ascending") : "none"}
                  tabIndex={0}
                  onClick={() => setSort((s) => (s?.key === c.key ? { key: c.key, desc: !s.desc } : { key: c.key, desc: !!c.num }))}
                  onKeyDown={(e) => e.key === "Enter" && setSort((s) => (s?.key === c.key ? { key: c.key, desc: !s.desc } : { key: c.key, desc: !!c.num }))}
                >
                  {c.label}
                  {sort?.key === c.key && <ChevronDown size={9} style={{ marginLeft: 4, transform: sort.desc ? undefined : "rotate(180deg)" }} />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.map((r, i) => (
              <tr
                key={i}
                className={`${props.onRow ? "clickable" : ""} ${props.selected?.(r) ? "sel" : ""}`}
                onClick={() => props.onRow?.(r)}
                tabIndex={props.onRow ? 0 : undefined}
                onKeyDown={props.onRow ? (e) => e.key === "Enter" && props.onRow?.(r) : undefined}
              >
                {props.cols.map((c) => {
                  const raw = c.value(r);
                  return (
                    <td key={c.key} className={c.num ? "num" : c.id ? "id" : c.clamp ? "clamp" : c.wrap ? "wrap" : ""} title={c.clamp && typeof raw === "string" ? raw : undefined}>
                      {c.clamp ? <span className="clamp-2">{c.render ? c.render(r) : (raw ?? "–")}</span> : c.render ? c.render(r) : (raw ?? "–")}
                    </td>
                  );
                })}
              </tr>
            ))}
            {!view.length && (
              <tr>
                <td colSpan={props.cols.length}>
                  <div className="state">{props.empty ?? "Nothing matches the current filters. Widen or reset the filters above."}</div>
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
              <button className="btn sm" type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                Previous
              </button>
              <button className="btn sm" type="button" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>
                Next
              </button>
            </>
          )}
          {props.csvName && (
            <button className="btn sm" type="button" onClick={() => download(props.csvName as string, toCsv(sorted, props.cols))}>
              <Download size={13} /> CSV
            </button>
          )}
        </span>
      </div>
    </div>
  );
}
