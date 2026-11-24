// The filter bar: one sticky row of five cascading filter chips in hierarchy order (Family, SKU, Region,
// Channel, Customer).  Each chip opens a combobox popover listing only the values present under the
// other filters, with series counts; the SKU list is ranked by volume with mono codes and bars.  The
// right end shows "N series in view" and Reset.  Filters write the URL hash, so every state is a link.
import { useCallback, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useApp } from "../app/context";
import { NO_FILTERS, selectSeries, type Filters, type Model } from "../data/model";
import { fmtNum } from "../data/format";
import { ChevronDown } from "./icons";
import { useDismiss } from "./overlays";

type Dim = keyof Filters;

/** Series count per value of `dim`, under every other active filter. */
function counts(m: Model, f: Filters, dim: Dim, size: number, weight?: Float64Array): { n: Int32Array; vol: Float64Array } {
  const n = new Int32Array(size);
  const vol = new Float64Array(size);
  const g: Filters = { ...f, [dim]: null };
  if (dim === "family") g.sku = null;
  for (let s = 0; s < m.nSeries; s++) {
    if (g.family !== null && m.sFamily[s] !== g.family) continue;
    if (g.sku !== null && m.sSku[s] !== g.sku) continue;
    if (g.region !== null && m.sRegion[s] !== g.region) continue;
    if (g.channel !== null && m.sChannel[s] !== g.channel) continue;
    if (g.customer !== null && m.sCustomer[s] !== g.customer) continue;
    const v = dim === "family" ? m.sFamily[s] : dim === "sku" ? m.sSku[s] : dim === "region" ? m.sRegion[s] : dim === "channel" ? m.sChannel[s] : m.sCustomer[s];
    n[v]++;
    if (weight) vol[v] += weight[s];
  }
  return { n, vol };
}

/** Unconstrained demand of each series over the last 12 actual months (ranks the SKU list). */
function seriesVolume(m: Model): Float64Array {
  const out = new Float64Array(m.nSeries);
  for (let g = 0; g < m.nSeg; g++) {
    const s = m.gSeries[g];
    for (let k = 0; k < m.gLen[g]; k++) {
      const t = m.gStart[g] + k;
      if (t > m.asOf - 12 && t <= m.asOf) out[s] += m.d[m.gOff[g] + k];
    }
  }
  return out;
}

interface ComboProps {
  label: string;
  options: string[];
  sub?: (i: number) => string;
  n: Int32Array;
  vol?: Float64Array;
  value: number | null;
  onChange: (v: number | null) => void;
  searchable?: boolean;
  mono?: boolean;
  note?: string;
  /** Rank by volume instead of the natural order. */
  ranked?: boolean;
  allLabel?: string;
}

function Combo(props: ComboProps) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const close = useCallback(() => {
    setOpen(false);
    setQ("");
  }, []);
  const ref = useDismiss(open, close);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useMemo(() => {
    const ql = q.trim().toLowerCase();
    let idx = props.options.map((_, i) => i).filter((i) => props.n[i] > 0 || i === props.value);
    if (ql) idx = idx.filter((i) => props.options[i].toLowerCase().includes(ql) || (props.sub?.(i) ?? "").toLowerCase().includes(ql));
    if (props.ranked && props.vol) idx.sort((a, b) => (props.vol as Float64Array)[b] - (props.vol as Float64Array)[a]);
    return idx;
  }, [q, props.options, props.n, props.value, props.sub, props.ranked, props.vol]);
  const maxVol = props.vol ? Math.max(1, ...list.slice(0, 200).map((i) => (props.vol as Float64Array)[i])) : 1;
  const total = props.n.reduce((a, b) => a + b, 0);
  const avail = props.n.reduce((a, b) => a + (b > 0 ? 1 : 0), 0);
  const choose = (v: number | null) => {
    props.onChange(v);
    close();
    btn.current?.focus();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHi((h) => Math.min(h + 1, list.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHi((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(hi === 0 ? null : list[hi - 1]);
    }
  };
  const valueText = props.value !== null ? props.options[props.value] : props.allLabel ?? "All";
  return (
    <div className="combo" ref={ref}>
      <button
        ref={btn}
        type="button"
        className={`chip ${props.value !== null ? "on" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${props.label} filter: ${valueText}`}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        title={props.value !== null ? `${props.label}: ${valueText}${props.sub ? ` · ${props.sub(props.value)}` : ""}` : `${props.label}: all ${avail.toLocaleString("en-US")}`}
      >
        <span className="k">{props.label}</span>
        <span className={`v ${props.mono && props.value !== null ? "mono" : ""}`}>{valueText}</span>
        <ChevronDown />
      </button>
      {open && (
        <div className="combo-pop" onKeyDown={onKey}>
          {props.searchable && (
            <input
              autoFocus
              placeholder={`Search ${props.label === "SKU" ? "SKU codes and descriptions" : `${props.label.toLowerCase()}s`}…`}
              value={q}
              aria-label={`Search ${props.label.toLowerCase()}`}
              onChange={(e) => {
                setQ(e.target.value);
                setHi(0);
              }}
            />
          )}
          {props.note && <div className="note">{props.note}</div>}
          <div className="combo-list" role="listbox" aria-label={props.label}>
            <button type="button" className={`combo-opt ${props.value === null ? "sel" : ""} ${hi === 0 ? "hi" : ""}`} role="option" aria-selected={props.value === null} onClick={() => choose(null)} autoFocus={!props.searchable}>
              <span>{props.allLabel ?? `All (${avail.toLocaleString("en-US")})`}</span>
              <span className="n">{total.toLocaleString("en-US")}</span>
            </button>
            {list.slice(0, 300).map((i, k) => (
              <button
                type="button"
                key={i}
                className={`combo-opt ${props.value === i ? "sel" : ""} ${hi === k + 1 ? "hi" : ""} ${props.n[i] === 0 ? "zero" : ""}`}
                role="option"
                aria-selected={props.value === i}
                onClick={() => choose(i)}
                title={props.vol ? `${fmtNum((props.vol as Float64Array)[i])} units in the last 12 months` : undefined}
              >
                <span className={props.mono ? "code" : ""} style={{ textAlign: "left" }}>
                  {props.options[i]}
                </span>
                <span className="n">{props.n[i].toLocaleString("en-US")}</span>
                {props.sub && <span className="sub">{props.sub(i)}</span>}
                {props.vol && <span className="vol" style={{ width: `${((props.vol as Float64Array)[i] / maxVol) * 100}%` }} />}
              </button>
            ))}
            {list.length > 300 && <div className="note">Showing 300 of {list.length}: type to narrow.</div>}
            {!list.length && <div className="note">No {props.label.toLowerCase()} matches “{q}” under the other filters.</div>}
          </div>
        </div>
      )}
    </div>
  );
}

export function FilterBar() {
  const { m, filters: f, setFilters } = useApp();
  const d = m.dims;
  const vol = useMemo(() => seriesVolume(m), [m]);
  const fam = useMemo(() => counts(m, f, "family", d.families.name.length), [m, f, d]);
  const sku = useMemo(() => counts(m, f, "sku", d.skus.id.length, vol), [m, f, d, vol]);
  const reg = useMemo(() => counts(m, f, "region", d.regions.length), [m, f, d]);
  const ch = useMemo(() => counts(m, f, "channel", d.channels.length), [m, f, d]);
  const cust = useMemo(() => counts(m, f, "customer", d.customers.length), [m, f, d]);
  const switches = useMemo(() => d.series.switch_month.filter((x) => x !== null).length, [d]);
  const nSel = useMemo(() => selectSeries(m, f).length, [m, f]);
  const any = f.family !== null || f.sku !== null || f.region !== null || f.channel !== null || f.customer !== null;
  const skuAvail = sku.n.reduce((a, b) => a + (b > 0 ? 1 : 0), 0);
  return (
    <div className="filterbar" role="search" aria-label="Filters">
      <Combo label="Family" options={d.families.name} n={fam.n} value={f.family} onChange={(v) => setFilters({ ...f, family: v, sku: v !== null && f.sku !== null && m.skuFamily[f.sku] !== v ? null : f.sku })} />
      <Combo
        label="SKU"
        allLabel={`All ${skuAvail.toLocaleString("en-US")}`}
        options={d.skus.id}
        sub={(i) => d.skus.description[i] ?? ""}
        n={sku.n}
        vol={sku.vol}
        ranked
        mono
        value={f.sku}
        searchable
        note={f.family !== null ? `Ranked by units in the last 12 months, within ${d.families.name[f.family]}.` : "Ranked by units in the last 12 months."}
        onChange={(v) => setFilters({ ...f, sku: v, family: v !== null ? m.skuFamily[v] : f.family })}
      />
      <Combo label="Region" options={d.regions} n={reg.n} value={f.region} onChange={(v) => setFilters({ ...f, region: v })} />
      <Combo label="Channel" options={d.channels} n={ch.n} value={f.channel} onChange={(v) => setFilters({ ...f, channel: v })} />
      <Combo label="Customer" options={d.customers} n={cust.n} value={f.customer} searchable note={`Customer at the time: history follows the ${switches} customer switches.`} onChange={(v) => setFilters({ ...f, customer: v })} />
      <span className="in-view" aria-live="polite">
        <span>
          <b>{nSel.toLocaleString("en-US")}</b> series in view
        </span>
        {any && (
          <button type="button" className="linkish" onClick={() => setFilters(NO_FILTERS)}>
            Reset
          </button>
        )}
      </span>
    </div>
  );
}
