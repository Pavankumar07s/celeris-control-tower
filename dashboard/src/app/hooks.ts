// Memoised selections and aggregates for the active filters (shared by the views), plus two layout hooks.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { forecastAgg, historyAgg, type ForecastAgg, type HistoryAgg } from "../data/aggregate";
import { selectRuns, selectSegments, selectSeries, singleSeries } from "../data/model";
import { useApp } from "./context";

export interface Selection {
  segs: number[];
  runs: number[];
  series: number[];
  single: number | null;
  h: HistoryAgg;
  fc: ForecastAgg;
}

export function useSelection(): Selection {
  const { m, filters, measure } = useApp();
  const segs = useMemo(() => selectSegments(m, filters), [m, filters]);
  const runs = useMemo(() => selectRuns(m, filters), [m, filters]);
  const series = useMemo(() => selectSeries(m, filters), [m, filters]);
  const single = useMemo(() => singleSeries(m, filters), [m, filters]);
  const h = useMemo(() => historyAgg(m, segs, measure), [m, segs, measure]);
  const fc = useMemo(() => forecastAgg(m, runs, measure), [m, runs, measure]);
  return { segs, runs, series, single, h, fc };
}

/** Width of an element through a callback ref.  It re-attaches whenever the element mounts, so it also measures
 *  an element that appears after an early return (a loading state), and narrow layouts switch on reliably. */
export function useElementWidth<T extends HTMLElement = HTMLElement>(): [(el: T | null) => void, number] {
  const [w, setW] = useState(0);
  const ro = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: T | null) => {
    ro.current?.disconnect();
    ro.current = null;
    if (!el) return;
    setW(el.clientWidth);
    ro.current = new ResizeObserver(() => setW(el.clientWidth));
    ro.current.observe(el);
  }, []);
  return [ref, w];
}

/** True while the media query matches (re-renders on change). */
export function useMedia(query: string): boolean {
  const read = () => (typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(query).matches : false);
  const [on, setOn] = useState(read);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const mq = window.matchMedia(query);
    const f = () => setOn(mq.matches);
    f();
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, [query]);
  return on;
}
