// The URL hash is the single store of navigation state: `#/<view>?fam=HYD&reg=Europe&m=usd&...`.
// Any filtered view is therefore a shareable link, and the browser back button works.
import { useCallback, useEffect, useState } from "react";
import type { Filters, Lens, Measure, Model } from "../data/model";

export interface Route {
  view: string;
  params: URLSearchParams;
}

function parse(): Route {
  const raw = window.location.hash.replace(/^#\/?/, "");
  const [path, query = ""] = raw.split("?");
  return { view: path || "overview", params: new URLSearchParams(query) };
}

export function hrefFor(view: string, params: URLSearchParams): string {
  const q = params.toString();
  return `#/${view}${q ? `?${q}` : ""}`;
}

export function useRoute(): [Route, (view: string | null, patch: Record<string, string | null>, replace?: boolean) => void] {
  const [route, setRoute] = useState<Route>(parse);
  useEffect(() => {
    const on = () => setRoute(parse());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  const navigate = useCallback((view: string | null, patch: Record<string, string | null>, replace = false) => {
    const cur = parse();
    const params = new URLSearchParams(cur.params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") params.delete(k);
      else params.set(k, v);
    }
    const href = hrefFor(view ?? cur.view, params);
    if (replace) {
      window.history.replaceState(null, "", href);
      setRoute(parse());
    } else window.location.hash = href.slice(1);
  }, []);
  return [route, navigate];
}

/** Filters from the hash, by readable labels (family code, SKU id, region / channel / customer name). */
export function filtersFrom(m: Model, p: URLSearchParams): Filters {
  const pick = (key: string, list: string[]) => {
    const v = p.get(key);
    if (v === null) return null;
    const i = list.indexOf(v);
    return i >= 0 ? i : null;
  };
  const sku = pick("sku", m.dims.skus.id);
  return {
    family: sku !== null ? m.skuFamily[sku] : pick("fam", m.dims.families.code),
    sku,
    region: pick("reg", m.dims.regions),
    channel: pick("ch", m.dims.channels),
    customer: pick("cust", m.dims.customers),
  };
}

/** Filter values in the hash that match nothing in the bundle (a mistyped or stale link), e.g. ["fam=XXX"]. */
export function unknownFilterValues(m: Model, p: URLSearchParams): string[] {
  const lists: [string, string[]][] = [["fam", m.dims.families.code], ["sku", m.dims.skus.id], ["reg", m.dims.regions], ["ch", m.dims.channels], ["cust", m.dims.customers]];
  return lists.filter(([k, list]) => p.get(k) !== null && !list.includes(p.get(k) as string)).map(([k]) => `${k}=${p.get(k)}`);
}

export function filterPatch(m: Model, f: Filters): Record<string, string | null> {
  return {
    fam: f.family === null ? null : m.dims.families.code[f.family],
    sku: f.sku === null ? null : m.dims.skus.id[f.sku],
    reg: f.region === null ? null : m.dims.regions[f.region],
    ch: f.channel === null ? null : m.dims.channels[f.channel],
    cust: f.customer === null ? null : m.dims.customers[f.customer],
  };
}

export const measureFrom = (p: URLSearchParams): Measure => (p.get("m") === "usd" ? "usd" : "units");
export const lensFrom = (p: URLSearchParams): Lens => (p.get("lens") === "latent" ? "latent" : "orders");
