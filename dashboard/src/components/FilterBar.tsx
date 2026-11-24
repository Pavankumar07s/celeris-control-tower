// The filter bar: one sticky row of five cascading filter chips in hierarchy order (Family, SKU, Region,
// Channel, Customer).  Each chip opens a combobox popover listing only the values present under the
// other filters, with series counts; the SKU list is ranked by volume with mono codes and bars.  The
// right end shows "N series in view" and Reset.  Filters write the URL hash, so every state is a link.
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useApp } from "../app/context";
import { useMedia } from "../app/hooks";
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

/** A filter chip with a listbox popover, following the ARIA combobox pattern: focus stays on one element
 *  (the search input, or the listbox itself when there is no search) and `aria-activedescendant` names the
 *  highlighted option, so the highlight, the focus ring and what Enter picks are always the same option. */
function Combo(props: ComboProps) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const uid = useId();
  const listId = `${uid}-list`;
  const optId = (k: number) => `${uid}-o${k}`;
  const btn = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => {
    setOpen(false);
    setQ("");
  }, []);
  const ref = useDismiss(open, close);
  const list = useMemo(() => {
    const ql = q.trim().toLowerCase();
    let idx = props.options.map((_, i) => i).filter((i) => props.n[i] > 0 || i === props.value);
    if (ql) idx = idx.filter((i) => props.options[i].toLowerCase().includes(ql) || (props.sub?.(i) ?? "").toLowerCase().includes(ql));
    if (props.ranked && props.vol) idx.sort((a, b) => (props.vol as Float64Array)[b] - (props.vol as Float64Array)[a]);
    return idx;
  }, [q, props.options, props.n, props.value, props.sub, props.ranked, props.vol]);
  const shown = list.slice(0, 300);
  const maxVol = props.vol ? Math.max(1, ...shown.map((i) => (props.vol as Float64Array)[i])) : 1;
  const total = props.n.reduce((a, b) => a + b, 0);
  const avail = props.n.reduce((a, b) => a + (b > 0 ? 1 : 0), 0);
  // keep the highlighted option in view
  useEffect(() => {
    if (open) document.getElementById(optId(hi))?.scrollIntoView({ block: "nearest" });
  }, [hi, open]); // eslint-disable-line react-hooks/exhaustive-deps
  const openList = () => {
    const at = props.value === null ? -1 : shown.indexOf(props.value);
    setHi(at < 0 ? 0 : at + 1);
    setOpen(true);
  };
  const choose = (v: number | null) => {
    props.onChange(v);
    close();
    btn.current?.focus();
  };
  const onKey = (e: KeyboardEvent) => {
    const last = shown.length;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHi((h) => Math.min(h + 1, last));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHi((h) => Math.max(h - 1, 0));
    } else if (e.key === "Home" && !props.searchable) {
      e.preventDefault();
      setHi(0);
    } else if (e.key === "End" && !props.searchable) {
      e.preventDefault();
      setHi(last);
    } else if (e.key === "PageDown") {
      e.preventDefault();
      setHi((h) => Math.min(h + 8, last));
    } else if (e.key === "PageUp") {
      e.preventDefault();
      setHi((h) => Math.max(h - 8, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (hi === 0) choose(null);
      else if (shown[hi - 1] !== undefined) choose(shown[hi - 1]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
      btn.current?.focus();
    } else if (e.key === "Tab") {
      close();
    }
  };
  const valueText = props.value !== null ? props.options[props.value] : props.allLabel ?? "All";
  // the element that holds focus while open: the search input, or the listbox
  const active = open ? optId(Math.min(hi, shown.length)) : undefined;
  return (
    <div className="combo" ref={ref}>
      <button
        ref={btn}
        type="button"
        className={`chip ${props.value !== null ? "on" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`${props.label} filter: ${valueText}`}
        onClick={() => (open ? close() : openList())}
        onKeyDown={(e) => {
          if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !open) {
            e.preventDefault();
            openList();
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
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={active}
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
          <div
            className="combo-list"
            role="listbox"
            id={listId}
            aria-label={props.label}
            tabIndex={props.searchable ? -1 : 0}
            autoFocus={!props.searchable}
            aria-activedescendant={props.searchable ? undefined : active}
          >
            <div id={optId(0)} className={`combo-opt ${props.value === null ? "sel" : ""} ${hi === 0 ? "hi" : ""}`} role="option" aria-selected={props.value === null} onClick={() => choose(null)} onMouseMove={() => hi !== 0 && setHi(0)}>
              <span>{props.allLabel ?? `All (${avail.toLocaleString("en-US")})`}</span>
              <span className="n">{total.toLocaleString("en-US")}</span>
            </div>
            {shown.map((i, k) => (
              <div
                key={i}
                id={optId(k + 1)}
                className={`combo-opt ${props.value === i ? "sel" : ""} ${hi === k + 1 ? "hi" : ""} ${props.n[i] === 0 ? "zero" : ""}`}
                role="option"
                aria-selected={props.value === i}
                onClick={() => choose(i)}
                onMouseMove={() => hi !== k + 1 && setHi(k + 1)}
                title={props.vol ? `${fmtNum((props.vol as Float64Array)[i])} units in the last 12 months` : undefined}
              >
                <span className={props.mono ? "code" : ""} style={{ textAlign: "left" }}>
                  {props.options[i]}
                </span>
                <span className="n">{props.n[i].toLocaleString("en-US")}</span>
                {props.sub && <span className="sub">{props.sub(i)}</span>}
                {props.vol && <span className="vol" style={{ width: `${((props.vol as Float64Array)[i] / maxVol) * 100}%` }} />}
              </div>
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
  // phones: the five chips fold behind one "Filters" button, so the headline is not pushed below the first screen
  const phone = useMedia("(max-width: 700px)");
  const [openSmall, setOpenSmall] = useState(false);
  const nActive = [f.family, f.sku, f.region, f.channel, f.customer].filter((x) => x !== null).length;
  const chipsId = useId();
  return (
    <div className={`filterbar ${phone ? "phone" : ""} ${phone && !openSmall ? "folded" : ""}`} role="search" aria-label="Filters">
      {phone && (
        <button type="button" className="chip filters-toggle" aria-expanded={openSmall} aria-controls={chipsId} onClick={() => setOpenSmall((o) => !o)}>
          <span className="k">Filters</span>
          <span className="v">{nActive ? `${nActive} active` : "All"}</span>
          <ChevronDown />
        </button>
      )}
      <div className="chips" id={chipsId}>
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
      </div>
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
