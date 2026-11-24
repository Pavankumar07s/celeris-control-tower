// Shell: sidebar navigation (Overview · What happened · What will happen · Act), sticky context bar with the
// shared filters and the Units/USD and orders/latent toggles, and the active view (lazy-loaded).
import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ComponentType } from "react";
import { AppContext, GROUPS, VIEWS, type AppState } from "./app/context";
import { DARK, LIGHT, type ThemeName } from "./charts/theme";
import { FilterBar } from "./components/FilterBar";
import { ErrorState, Loading, Segmented } from "./components/ui";
import { fetchJson } from "./data/load";
import { buildModel, filterLabel, selectSeries, type Model } from "./data/model";
import { runSelfCheck, type SelfCheckResult } from "./data/quantiles";
import type { Dims, ForecastFile, HistoryFile, Meta } from "./data/types";
import { filterPatch, filtersFrom, hrefFor, lensFrom, measureFrom, useRoute } from "./state/url";

const VIEW_COMPONENTS: Record<string, ComponentType> = {
  overview: lazy(() => import("./views/Overview")),
  health: lazy(() => import("./views/DataHealth")),
  explorer: lazy(() => import("./views/Explorer")),
  anomalies: lazy(() => import("./views/Anomalies")),
  stockouts: lazy(() => import("./views/Stockouts")),
  macro: lazy(() => import("./views/Macro")),
  forecast: lazy(() => import("./views/Forecast")),
  lifecycle: lazy(() => import("./views/Lifecycle")),
  whatif: lazy(() => import("./views/WhatIf")),
  exceptions: lazy(() => import("./views/Exceptions")),
  procurement: lazy(() => import("./views/Procurement")),
  downloads: lazy(() => import("./views/Downloads")),
};

function initialTheme(): ThemeName {
  try {
    const saved = window.localStorage.getItem("celeris-theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* storage unavailable: fall back to the system setting */
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export default function App() {
  const [model, setModel] = useState<{ m: Model; check: SelfCheckResult } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [themeName, setThemeName] = useState<ThemeName>(initialTheme);
  const [route, navigate] = useRoute();

  useEffect(() => {
    Promise.all([fetchJson<Meta>("meta.json"), fetchJson<Dims>("dims.json"), fetchJson<HistoryFile>("history.json"), fetchJson<ForecastFile>("forecast.json")])
      .then(([meta, dims, hist, fc]) => {
        const m = buildModel(meta, dims, hist, fc);
        setModel({ m, check: runSelfCheck(m) });
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = themeName;
    try {
      window.localStorage.setItem("celeris-theme", themeName);
    } catch {
      /* storage unavailable: theme is per session */
    }
  }, [themeName]);

  const setParam = useCallback((patch: Record<string, string | null>, replace = false) => navigate(null, patch, replace), [navigate]);
  const go = useCallback((view: string, patch: Record<string, string | null> = {}) => navigate(view, patch), [navigate]);

  const state: AppState | null = useMemo(() => {
    if (!model) return null;
    const m = model.m;
    return {
      m,
      theme: themeName === "dark" ? DARK : LIGHT,
      view: VIEW_COMPONENTS[route.view] ? route.view : "overview",
      params: route.params,
      filters: filtersFrom(m, route.params),
      measure: measureFrom(route.params),
      lens: lensFrom(route.params),
      selfCheck: model.check,
      setFilters: (f) => navigate(null, filterPatch(m, f)),
      setParam,
      go,
    };
  }, [model, themeName, route, navigate, setParam, go]);

  if (error)
    return (
      <div className="content">
        <ErrorState message={`${error}. Run \`python -m celeris export\` to write dashboard/public/data, then reload.`} />
      </div>
    );
  if (!state) return <Loading what="the data bundle" />;

  const def = VIEWS.find((v) => v.id === state.view) ?? VIEWS[0];
  const View = VIEW_COMPONENTS[def.id];
  const nSel = selectSeries(state.m, state.filters).length;
  const keep = new URLSearchParams();
  for (const k of ["fam", "sku", "reg", "ch", "cust", "m", "lens"]) {
    const v = state.params.get(k);
    if (v) keep.set(k, v);
  }
  const meta = state.m.meta;
  return (
    <AppContext.Provider value={state}>
      <div className="shell">
        <nav className="side" aria-label="Views">
          <div className="brand">
            <div className="brand-mark" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 32 32">
                <path d="M5 23l7-8 6 5 9-11" stroke="white" strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <b>Celeris Control Tower</b>
              <span>Demand forecasting &amp; planning</span>
            </div>
          </div>
          {GROUPS.map((g) => (
            <div key={g.id} className="nav">
              <div className="nav-group">
                {g.title}
                {g.sub && <small>{g.sub}</small>}
              </div>
              {VIEWS.filter((v) => v.group === g.id).map((v) => (
                <a key={v.id} href={hrefFor(v.id, keep)} className={v.id === def.id ? "active" : ""} aria-current={v.id === def.id ? "page" : undefined}>
                  <span className="dot" />
                  {v.title}
                </a>
              ))}
            </div>
          ))}
          <div className="side-foot">
            <span>
              History {state.m.months[0]} → {state.m.months[state.m.asOf]}
              <br />
              Forecast {state.m.months[state.m.w0]} → {state.m.months[state.m.nMonths - 1]}
            </span>
            <span title={`Worst relative difference ${state.selfCheck.worst.toExponential(1)}`}>
              <span className="status-dot" style={{ background: state.selfCheck.passed === state.selfCheck.total ? "var(--good)" : "var(--critical)" }} /> Quantile engine {state.selfCheck.passed}/{state.selfCheck.total} checks match the pipeline
            </span>
            <span>
              Bundle v{meta.bundle_version} · celeris {meta.package_version}
            </span>
          </div>
        </nav>
        <div className="main">
          <header className="topbar">
            {meta.provisional && (
              <div className="provisional-banner" role="status">
                <b>Provisional forecast.</b> These modelling inputs are dev-only stand-ins (cycle-aware baselines), not the final model: {Object.entries(meta.sources)
                  .filter(([, s]) => s.provisional)
                  .map(([k]) => k.replace(/_/g, " "))
                  .join(", ")}
                . History, cleaning and anomaly data are final. Re-run <code>python -m celeris export</code> when the modelling files land.
              </div>
            )}
            <div className="topbar-row">
              <div className="context">
                <h1>{def.title}</h1>
                <span className="crumb">
                  {filterLabel(state.m, state.filters)} · {nSel.toLocaleString("en-US")} series · {def.blurb}
                </span>
              </div>
              {meta.provisional && <span className="badge warn">Provisional forecast</span>}
              <Segmented ariaLabel="Measure" value={state.measure} onChange={(v) => setParam({ m: v === "usd" ? "usd" : null })} options={[{ value: "units", label: "Units" }, { value: "usd", label: "USD" }]} />
              <Segmented
                ariaLabel="Ordering-cycle lens"
                value={state.lens}
                onChange={(v) => setParam({ lens: v === "latent" ? "latent" : null })}
                options={[
                  { value: "orders", label: "Orders as booked", title: "Orders in the months customers booked them (cycle zeros visible)" },
                  { value: "latent", label: "Latent monthly demand", title: "Each order spread over the months it carries (ordering cycles removed)" },
                ]}
              />
              <button type="button" className="btn" onClick={() => setThemeName((t) => (t === "dark" ? "light" : "dark"))} aria-label="Toggle dark mode">
                {themeName === "dark" ? "☀ Light" : "☾ Dark"}
              </button>
            </div>
            <div className="topbar-row">
              <FilterBar />
            </div>
          </header>
          <main className="content">
            <Suspense fallback={<Loading what="the view" />}>
              <View />
            </Suspense>
          </main>
        </div>
      </div>
    </AppContext.Provider>
  );
}
