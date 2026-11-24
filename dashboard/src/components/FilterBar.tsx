// Persistent cascading filter bar: family → SKU, region, channel, customer. Each list shows only values present
// under the other filters, with the number of series.
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../app/context";
import { NO_FILTERS, type Filters, type Model } from "../data/model";

type Dim = keyof Filters;

function counts(m: Model, f: Filters, dim: Dim, size: number): Int32Array {
  const out = new Int32Array(size);
  const g: Filters = { ...f, [dim]: null };
  if (dim === "family") g.sku = null;
  for (let s = 0; s < m.nSeries; s++) {
    if (g.family !== null && m.sFamily[s] !== g.family) continue;
    if (g.sku !== null && m.sSku[s] !== g.sku) continue;
    if (g.region !== null && m.sRegion[s] !== g.region) continue;
    if (g.channel !== null && m.sChannel[s] !== g.channel) continue;
    if (g.customer !== null && m.sCustomer[s] !== g.customer) continue;
    const v = dim === "family" ? m.sFamily[s] : dim === "sku" ? m.sSku[s] : dim === "region" ? m.sRegion[s] : dim === "channel" ? m.sChannel[s] : m.sCustomer[s];
    out[v]++;
  }
  return out;
}

function Combo(props: { label: string; all: string; options: string[]; sub?: (i: number) => string; n: Int32Array; value: number | null; onChange: (v: number | null) => void; searchable?: boolean }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const list = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const idx = props.options.map((_, i) => i).filter((i) => props.n[i] > 0 || i === props.value);
    return idx.filter((i) => !ql || props.options[i].toLowerCase().includes(ql) || (props.sub?.(i) ?? "").toLowerCase().includes(ql));
  }, [q, props]);
  const choose = (v: number | null) => {
    props.onChange(v);
    setOpen(false);
    setQ("");
  };
  const total = props.n.reduce((a, b) => a + b, 0);
  return (
    <div className="filter" ref={ref}>
      <label>{props.label}</label>
      <button type="button" className={`combo-btn ${props.value !== null ? "set" : ""}`} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)} title={props.value !== null ? props.options[props.value] : props.all}>
        {props.value !== null ? props.options[props.value] : props.all}
      </button>
      {open && (
        <div className="combo-pop">
          {props.searchable && (
            <input
              autoFocus
              placeholder={`Search ${props.label.toLowerCase()}…`}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setHi(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") setHi((h) => Math.min(h + 1, list.length));
                if (e.key === "ArrowUp") setHi((h) => Math.max(h - 1, 0));
                if (e.key === "Enter") choose(hi === 0 ? null : list[hi - 1]);
                if (e.key === "Escape") setOpen(false);
              }}
            />
          )}
          <div className="combo-list" role="listbox">
            <div className={`combo-opt ${props.value === null ? "sel" : ""} ${hi === 0 ? "hi" : ""}`} role="option" aria-selected={props.value === null} onClick={() => choose(null)}>
              <span>{props.all}</span>
              <span className="n">{total.toLocaleString("en-US")}</span>
            </div>
            {list.slice(0, 400).map((i, k) => (
              <div key={i} className={`combo-opt ${props.value === i ? "sel" : ""} ${hi === k + 1 ? "hi" : ""} ${props.n[i] === 0 ? "zero" : ""}`} role="option" aria-selected={props.value === i} onClick={() => choose(i)}>
                <span>
                  {props.options[i]}
                  {props.sub && <span className="muted tiny"> · {props.sub(i)}</span>}
                </span>
                <span className="n">{props.n[i]}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function FilterBar() {
  const { m, filters: f, setFilters } = useApp();
  const d = m.dims;
  const nFam = useMemo(() => counts(m, f, "family", d.families.name.length), [m, f, d]);
  const nSku = useMemo(() => counts(m, f, "sku", d.skus.id.length), [m, f, d]);
  const nReg = useMemo(() => counts(m, f, "region", d.regions.length), [m, f, d]);
  const nCh = useMemo(() => counts(m, f, "channel", d.channels.length), [m, f, d]);
  const nCust = useMemo(() => counts(m, f, "customer", d.customers.length), [m, f, d]);
  const any = f.family !== null || f.sku !== null || f.region !== null || f.channel !== null || f.customer !== null;
  return (
    <div className="filters" role="search" aria-label="Filters">
      <Combo label="Family" all="All families" options={d.families.name} n={nFam} value={f.family} onChange={(v) => setFilters({ ...f, family: v, sku: v !== null && f.sku !== null && m.skuFamily[f.sku] !== v ? null : f.sku })} />
      <Combo label="SKU" all="All SKUs" options={d.skus.id} sub={(i) => d.skus.description[i] ?? ""} n={nSku} value={f.sku} searchable onChange={(v) => setFilters({ ...f, sku: v, family: v !== null ? m.skuFamily[v] : f.family })} />
      <Combo label="Region" all="All regions" options={d.regions} n={nReg} value={f.region} onChange={(v) => setFilters({ ...f, region: v })} />
      <Combo label="Channel" all="All channels" options={d.channels} n={nCh} value={f.channel} onChange={(v) => setFilters({ ...f, channel: v })} />
      <Combo label="Customer" all="All customers" options={d.customers} n={nCust} value={f.customer} searchable onChange={(v) => setFilters({ ...f, customer: v })} />
      {any && (
        <button type="button" className="btn" style={{ alignSelf: "flex-end", height: 32 }} onClick={() => setFilters(NO_FILTERS)}>
          Reset
        </button>
      )}
    </div>
  );
}
