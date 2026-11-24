// App-wide context: the model, the theme, and navigation state read from the URL hash.
import { createContext, useContext } from "react";
import type { Filters, Lens, Measure, Model } from "../data/model";
import type { Theme } from "../charts/theme";
import type { SelfCheckResult } from "../data/quantiles";

export interface AppState {
  m: Model;
  theme: Theme;
  view: string;
  params: URLSearchParams;
  filters: Filters;
  measure: Measure;
  lens: Lens;
  selfCheck: SelfCheckResult;
  setFilters: (f: Filters) => void;
  setParam: (patch: Record<string, string | null>, replace?: boolean) => void;
  go: (view: string, patch?: Record<string, string | null>) => void;
}

export const AppContext = createContext<AppState | null>(null);

export function useApp(): AppState {
  const s = useContext(AppContext);
  if (!s) throw new Error("useApp outside the app");
  return s;
}

export interface ViewDef {
  id: string;
  title: string;
  group: "overview" | "past" | "future" | "act";
  blurb: string;
}

export const VIEWS: ViewDef[] = [
  { id: "overview", title: "Executive overview", group: "overview", blurb: "Units and revenue from history into the 19-month forecast, mix shift and the planner briefing." },
  { id: "health", title: "Data health", group: "past", blurb: "Issues by type and file, rows affected, before vs after cleaning." },
  { id: "explorer", title: "Demand explorer", group: "past", blurb: "Drill family → SKU → region → customer; seasonality, zero months, ordering cycle, lifecycle." },
  { id: "anomalies", title: "Anomaly monitor", group: "past", blurb: "Flagged points on the series with type, reason and action; errors vs real events." },
  { id: "stockouts", title: "Stock-outs & lost sales", group: "past", blurb: "Shipped vs unconstrained demand, lost and back-ordered units, fill rate." },
  { id: "macro", title: "Macro lead / lag", group: "past", blurb: "Which indicator leads which family, at what lag, and whether it is stable." },
  { id: "forecast", title: "Forecast & accuracy", group: "future", blurb: "Forecast vs history with P10–P90; backtest WAPE and bias by family, region and horizon." },
  { id: "lifecycle", title: "Lifecycle: launches & EOL", group: "future", blurb: "End-of-life run-offs, planned launches and cold starts inside the window." },
  { id: "whatif", title: "What-if scenarios", group: "future", blurb: "Shift a macro indicator (e.g. PMI −3) and recompute orders through the ordering cycle." },
  { id: "exceptions", title: "Exception inbox", group: "act", blurb: "The few series that need a planner, ranked by revenue at risk." },
  { id: "procurement", title: "Procurement plan", group: "act", blurb: "Gross requirements at a chosen service level (P80 / P90 / P95) and lead time." },
  { id: "downloads", title: "Data download", group: "act", blurb: "Bundle files with checksums and CSV extracts of the current selection." },
];

export const GROUPS: { id: ViewDef["group"]; title: string; sub?: string }[] = [
  { id: "overview", title: "Overview", sub: "both parts" },
  { id: "past", title: "What happened", sub: "training data 2019-01 → 2026-10" },
  { id: "future", title: "What will happen", sub: "prediction 2026-11 → 2028-05" },
  { id: "act", title: "Act", sub: "planner tools" },
];
