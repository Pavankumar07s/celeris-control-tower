// Shell: the rail (table of contents in reading order with the colour key), the masthead (where you are,
// global lenses), the sticky filter bar, and the active view (lazy-loaded).  All navigation state lives in
// the URL hash (src/state/url.ts), so every view with its filters is a shareable link.
import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ComponentType } from "react";
import { AppContext, VIEWS, type AppState } from "./app/context";
import { readTheme, typeScale, type ThemeName } from "./charts/theme";
import { FilterBar } from "./components/FilterBar";
import { Masthead } from "./components/shell/Masthead";
import { Rail } from "./components/shell/Rail";
import { ViewFooter } from "./components/shell/Footer";
import { toast, ToastHost } from "./components/overlays";
import { ErrorState, SkeletonChart, SkeletonText } from "./components/states";
import { fetchJson } from "./data/load";
import { buildModel, type Model } from "./data/model";
import { runSelfCheck, type SelfCheckResult } from "./data/quantiles";
import type { Dims, ForecastFile, HistoryFile, Meta } from "./data/types";
import { filterPatch, filtersFrom, lensFrom, measureFrom, unknownFilterValues, useRoute } from "./state/url";

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

/** `theme=dark|light` in the hash wins (a shared link opens in the sender's theme), then the saved choice, then the system. */
function themeFromHash(): ThemeName | null {
  const q = new URLSearchParams(window.location.hash.split("?")[1] ?? "").get("theme");
  return q === "dark" || q === "light" ? q : null;
}

function initialTheme(): ThemeName {
  let t: ThemeName | null = themeFromHash();
  if (!t)
    try {
      const saved = window.localStorage.getItem("celeris-theme");
      if (saved === "light" || saved === "dark") t = saved;
    } catch {
      /* storage unavailable: fall back to the system setting */
    }
  t ??= window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  // set before the first render so the chart theme reads the right CSS variables
  document.documentElement.dataset.theme = t;
  return t;
}

/** The frame shown while the bundle loads: the real shell proportions, placeholders at real line heights. */
function LoadingFrame() {
  return (
    <div className="shell" aria-busy="true">
      <nav className="rail" aria-label="Views" />
      <div className="main">
        <div className="masthead" />
        <div className="filterbar" />
        <main className="page">
          <div className="lede">
            <div className="lede-text">
              <SkeletonText lines={2} height={36} lastWidth="55%" />
              <SkeletonText lines={2} height={16} lastWidth="70%" />
            </div>
          </div>
          <SkeletonChart height={360} />
          <p className="caption" aria-live="polite">
            Loading the data bundle…
          </p>
        </main>
      </div>
    </div>
  );
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

  const toggleTheme = useCallback(() => {
    setThemeName((t) => {
      const next: ThemeName = t === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      try {
        window.localStorage.setItem("celeris-theme", next);
      } catch {
        /* storage unavailable: theme is per session */
      }
      return next;
    });
    // an explicit choice replaces a theme carried in by a shared link
    if (themeFromHash()) navigate(null, { theme: null }, true);
  }, [navigate]);
  // keep <html data-theme> in step (also after a StrictMode double render)
  useEffect(() => {
    document.documentElement.dataset.theme = themeName;
  }, [themeName]);
  // the chart type scale follows the viewport (1 up to 1600px wide, see typeScale): re-read the theme when it changes
  // (stepped by 0.02 so dragging a window edge does not rebuild every chart on every frame)
  const [fsKey, setFsKey] = useState(() => Math.round(typeScale() * 50) / 50);
  useEffect(() => {
    let raf = 0;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setFsKey(Math.round(typeScale() * 50) / 50));
    };
    window.addEventListener("resize", on);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", on);
    };
  }, []);
  const theme = useMemo(() => readTheme(themeName), [themeName, fsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const setParam = useCallback((patch: Record<string, string | null>, replace = false) => navigate(null, patch, replace), [navigate]);
  const go = useCallback(
    (view: string, patch: Record<string, string | null> = {}) => {
      navigate(view, patch);
      window.scrollTo({ top: 0 });
    },
    [navigate],
  );

  const state: AppState | null = useMemo(() => {
    if (!model) return null;
    const m = model.m;
    return {
      m,
      theme,
      themeName,
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
  }, [model, theme, themeName, route, navigate, setParam, go]);

  // a link with an unknown view or filter value says so instead of silently showing something else
  const badLink = model ? [...(VIEW_COMPONENTS[route.view] ? [] : [`view "${route.view}"`]), ...unknownFilterValues(model.m, route.params)] : [];
  const badKey = badLink.join("|");
  useEffect(() => {
    if (badKey) toast(`That link has an unknown ${badKey.split("|").join(", ")}; it was ignored${VIEW_COMPONENTS[route.view] ? "" : ", showing the overview"}.`);
  }, [badKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!state) return;
    const def = VIEWS.find((v) => v.id === state.view);
    document.title = def && def.id !== "overview" ? `${def.title} · Celeris` : "Celeris Control Tower";
  }, [state]);

  if (error)
    return (
      <main className="page">
        <ErrorState message={error} />
      </main>
    );
  if (!state) return <LoadingFrame />;

  const View = VIEW_COMPONENTS[state.view];
  return (
    <AppContext.Provider value={state}>
      <a className="skip-link" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById("main")?.focus(); }}>
        Skip to content
      </a>
      <div className="shell">
        <Rail />
        <div className="main">
          <Masthead themeName={themeName} onToggleTheme={toggleTheme} />
          <FilterBar />
          <main className="page" id="main" tabIndex={-1}>
            <Suspense fallback={<SkeletonChart height={360} />}>
              <View />
            </Suspense>
          </main>
          <ViewFooter />
        </div>
      </div>
      <ToastHost />
    </AppContext.Provider>
  );
}
