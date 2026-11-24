// App-wide context: the model, the theme, and navigation state read from the URL hash.
import { createContext, useContext } from "react";
import type { Filters, Lens, Measure, Model } from "../data/model";
import type { Theme, ThemeName } from "../charts/theme";
import type { SelfCheckResult } from "../data/quantiles";

export interface AppState {
  m: Model;
  /** Chart theme read from the CSS tokens (re-read on theme change). */
  theme: Theme;
  themeName: ThemeName;
  view: string;
  params: URLSearchParams;
  filters: Filters;
  measure: Measure;
  lens: Lens;
  selfCheck: SelfCheckResult;
  setFilters: (f: Filters) => void;
  /** Patch hash parameters (null removes); replace = no new history entry (use for in-view UI state). */
  setParam: (patch: Record<string, string | null>, replace?: boolean) => void;
  /** Navigate to a view, keeping the hash parameters and applying `patch`. */
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
  /** Masthead name. */
  title: string;
  /** Rail label (defaults to title). */
  short?: string;
  group: "overview" | "past" | "future" | "act";
  /** The question the view answers (shown in the masthead "i"). */
  blurb: string;
}

export const VIEWS: ViewDef[] = [
  { id: "overview", title: "Executive overview", group: "overview", blurb: "Units and revenue from history into the 19-month forecast, the mix by family, region and channel, and the planner brief." },
  { id: "health", title: "Data health", group: "past", blurb: "Issues by type and file, rows affected, and every check before and after cleaning." },
  { id: "explorer", title: "Demand explorer", group: "past", blurb: "Drill family → SKU → region → customer: seasonality, zero months, ordering cycle and lifecycle." },
  { id: "anomalies", title: "Anomaly monitor", group: "past", blurb: "Flagged points on the series with type, reason and action: data errors fixed versus real events kept." },
  { id: "stockouts", title: "Stock-outs & lost sales", group: "past", blurb: "Shipped versus unconstrained demand, lost and back-ordered units, and fill rate." },
  { id: "macro", title: "Macro lead / lag", group: "past", blurb: "Which indicator leads which family, at what lag, and whether the link is stable." },
  { id: "forecast", title: "Forecast & accuracy", group: "future", blurb: "The forecast with P10–P90, and backtest WAPE and bias by family, region and horizon." },
  { id: "lifecycle", title: "Lifecycle: launches & EOL", short: "Lifecycle", group: "future", blurb: "End-of-life run-offs, planned launches and cold starts inside the window." },
  { id: "whatif", title: "What-if scenarios", group: "future", blurb: "Shift a macro indicator (for example PMI −3) and recompute orders through the ordering cycle." },
  { id: "exceptions", title: "Exception inbox", group: "act", blurb: "The few series that need a planner, ranked by revenue at risk." },
  { id: "procurement", title: "Procurement plan", group: "act", blurb: "Gross requirements at a chosen service level (P80 / P90 / P95) and lead time." },
  { id: "downloads", title: "Data download", group: "act", blurb: "Bundle files with checksums, and CSV extracts of the current selection." },
];

/** Rail sections in reading order.  `eyebrow` is the section name shown (sentence case) in the masthead. */
export const GROUPS: { id: ViewDef["group"]; title: string; eyebrow: string; mark: "both" | "past" | "future" | "act" }[] = [
  { id: "overview", title: "Overview", eyebrow: "History and forecast", mark: "both" },
  { id: "past", title: "What happened", eyebrow: "What happened", mark: "past" },
  { id: "future", title: "What will happen", eyebrow: "What will happen", mark: "future" },
  { id: "act", title: "Act", eyebrow: "Act", mark: "act" },
];
