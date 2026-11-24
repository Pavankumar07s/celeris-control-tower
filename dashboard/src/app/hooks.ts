// Memoised selections and aggregates for the active filters (shared by the views).
import { useMemo } from "react";
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
