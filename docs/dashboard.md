# Dashboard: the Celeris planning control tower

A static single-page app (React + TypeScript + Vite + Apache ECharts) over a data bundle that the pipeline writes.
There is no backend and no number typed by hand: every figure on screen is computed from
`dashboard/public/data/*.json`, which `python -m celeris export` derives from the pipeline outputs in `outputs/`.

One app, two parts with the same filters (family → SKU, region, channel, customer):

- **What happened** (training data, 2019-01 → 2026-10): data health, demand explorer, anomaly monitor, stock-outs and
  lost sales, macro lead / lag.
- **What will happen** (prediction, 2026-11 → 2028-05): forecast & accuracy, lifecycle, what-if.
- **Act**: exception inbox, procurement plan, data download.
- The **Executive overview** spans both parts.

History and forecast always share **one continuous timeline**, drawn by one rule: **ink is the past, cobalt is the
future**. It shows:

- unconstrained demand as the ink line, with shipments as a hairline only where they were lower and the gap shaded as
  lost sales;
- a "last actual" rule at Oct 2026 and a washed forecast window;
- the submitted forecast in cobalt, starting from the last actual, with its P10–P90 band (the P50 is drawn when it
  departs visibly from the forecast and is always in the tooltip);
- rings on months where rebuilt cells cluster, and annotations computed from the data (the COVID trough, the
  semiconductor gap, the ERP rebuild, the largest event inside the window, the end value with its range);
- range presets instead of a zoom slider; one selected series switches to columns with P10–P90 whiskers.

The visual system (tokens, components, chart conventions, headline templates) is documented in
[`docs/design_system.md`](design_system.md).

## Run it locally

### Without Node (the built app is in the repository)

```bash
python -m http.server 8000 -d dashboard/dist      # then open http://localhost:8000
```

`dashboard/dist` holds the whole site, data included (`dist/data` is a copy of `public/data` made at build time). Any
static file server works. Opening `index.html` straight from disk does **not** work, because browsers block `fetch`
from `file://`.

### Rebuild from the pipeline

```bash
.venv/bin/python -m celeris export     # outputs/ -> dashboard/public/data (about 15 s, deterministic)
cd dashboard
npm ci                                 # about 120 MB of node_modules: react, react-dom, echarts, vite, typescript
npm run build                          # type-check + production build -> dashboard/dist
python -m http.server 8000 -d dist
```

The same steps as Make targets:

- `make export`
- `make dashboard`: export, `npm ci`, then build.
- `make dashboard-dev`: Vite dev server at http://localhost:5173, which serves `public/data` directly. Re-running the
  export and reloading the page picks up new data without a rebuild.

Requirements:

- Node 20 or later (built with Node 24);
- the project's Python virtualenv for the export.

The export needs these pipeline outputs:

- `outputs/clean`, `outputs/anomalies` and `outputs/quality`;
- the modelling outputs `outputs/forecast/*`, `outputs/backtest/*` and `outputs/features/macro_leadlag.csv`.

### Before the modelling outputs exist: provisional mode

`dashboard/dev/make_provisional_forecast.py` is a dev-only script. It writes stand-ins with exactly the contract schemas
(`docs/architecture.md`, "Contracts for the modelling and dashboard builds") to `outputs/_provisional/`:

- a cycle-aware naive forecast;
- three-origin baseline backtests;
- correlations for the lead / lag table;
- one dossier driver per family for the sensitivities.

`celeris export` resolves the files one by one: it takes the real file when it exists and the stand-in otherwise. It
records the choice for each file in `meta.json` (`provisional`, `sources`). The app then shows a compact "Provisional
forecast" status pill in the masthead, whose popover names every provisional input; with the final files it disappears. **When the real files land, re-run `python -m celeris export`
and `npm run build`; nothing else changes.**

## How data flows

```
outputs/clean, anomalies, quality      ─┐
outputs/forecast, backtest, features   ─┼─>  python -m celeris export  ─>  dashboard/public/data/*.json  ─>  views
(or outputs/_provisional/* stand-ins)  ─┘     (src/celeris/export/)          (columnar, dictionary-encoded)
```

| Bundle file | Built from | Loaded by | Size (gzip) |
|---|---|---|---|
| `meta.json` | sources, hashes, row counts, price assumption, backtest ladder, quantile self-check | start-up | 4 kB |
| `dims.json` | SKU master, series state, Record_ID blocks, customer runs, events, price table | start-up | 60 kB |
| `history.json` | `train_clean.parquet`: shipped units, flag word per cell, unconstrained demand where it differs | start-up | 310 kB |
| `forecast.json` | `forecast.parquet`: submitted forecast, mean, noise variance, `cv_level` / `cv_group`, structural-zero reason, price | start-up | 200 kB |
| `forecast_detail.json` | row P10 / P50 / P90, latent mean, the seven multiplicative components, ensemble members, cycle accumulation | X-ray, what-if, latent lens, downloads | 400 kB |
| `quality.json` | `dq_report.json`, `fix_log.parquet` (issues by rule, rule × month heat-strip), `dedup_decisions.csv` | data health | 26 kB |
| `lineage/<family>.json` | fix-log rows per cell (raw → rule → cleaned) and the dropped versions of repeated Record_IDs | lineage drawer | 7 × 100 kB |
| `anomalies.json` | `anomaly_register.csv` (11.8k episodes and cells) | anomaly monitor | 210 kB |
| `stockouts.json` | `stockouts_clean.csv` and every lost / back-ordered / carried cell of `train_clean` | stock-outs, overview | 114 kB |
| `profiles.json` | `series_profile.csv`, `series_state.csv`, `account_events.csv` | series card | 54 kB |
| `macro.json` | `macro_clean.csv`, macro change log, `macro_leadlag.csv`, `macro_sensitivity.csv` | macro, what-if | 9 kB |
| `backtest.json` | `predictions.parquet` (error sums per series × horizon bucket and per family × region × channel × horizon), `metrics.csv`, `summary.json` | forecast & accuracy | 300 kB |
| `backtest_origin_<origin>.json` | each origin's actuals, final-model forecast and baseline per series × horizon | time machine | 150 kB each |
| `exceptions.json` | eight deterministic rules over the outputs above (`src/celeris/export/exceptions.py`) | exception inbox, briefing | 5 kB |

Start-up loads about 0.57 MB of gzipped data, plus about 0.31 MB of JavaScript (ECharts 227 kB, React and the app shell
81 kB). Each view's code and data load when the view opens. The whole bundle is about 2.8 MB gzipped.

### Correctness rules the app enforces

- **Quantiles of any selection** come from the contract formula:
  - M = Σ mean;
  - V = Σ var_noise + Σ_series (cv_level · Σ mean)² + Σ_family×region (cv_group · Σ mean)²;
  - the result is lognormal.

  `src/celeris/export/quantiles.py` is the Python port. The test checks it against
  `celeris.models.quantiles.aggregate_quantiles`. `dashboard/src/data/quantiles.ts` is the browser port. The bundle
  carries quantiles that the export computed for a few selections on the bundled values. At start-up the app recomputes
  them and shows "Quantile engine 7/7 checks match the pipeline" in the sidebar. Row quantiles are never summed.
- **WAPE** = Σ|actual − forecast| / Σ actual. **Bias** = Σ(forecast − actual) / Σ actual. Both are computed over the
  scored cells of the selection, never as an average of series WAPEs. Actuals are unconstrained demand.
- **Missing rows are not zeros.** Months where rebuilt cells cluster carry hollow rings, and their demand is the
  pipeline's fill. Cells whose shipments are unknown (ERP blanks) are kept out of the lost-sales gap.
- **Forecast totals equal `submission.csv`.** The export refuses to write a bundle that disagrees, and a test checks it.
- **Customer at the time.** History is stored per series × customer run, so the customer filter follows the 23 customer
  switches.

## View guide

| View | What it shows | The question it answers |
|---|---|---|
| **Executive overview** (both) | A computed serif headline and standfirst; the hero figure (19-month forecast with the range strip of its P10–P90 against the last 19 months). The annotated timeline from 2019 to 2028 in units or USD. A figure strip: forecast revenue with its sparkline, backtest WAPE on a benchmark ladder, lost sales, cells repaired. **The brief** (seven facts, each linked to its evidence); where the 12-month change comes from by region, family or channel (a bar table with shares, click to filter); the five exceptions with the most revenue at risk; outlook small multiples (moving annual total). | Where are volume and revenue going, what changes in the mix, and what should I look at first? |
| **Data health** (history) | Checks run and failing before vs after; row waterfall from 248,248 raw rows to 245,548 grid cells; rows affected by every cleaning rule, coloured by recovery method; issue × month heat-strip; every check with its before and after metric; duplicates and restatements; the numeric-state census. | Is the cleaning complete, exact and auditable? What kind of errors were there, and where? |
| **Demand explorer** (history) | A navigator that drills family → SKU → region → customer, with a breadcrumb. The series timeline, as orders as booked or as latent monthly demand, optionally continued into the forecast. Seasonality index by year; zero-month calendar with the reason for every zero; series card (ordering cycle and changes, customers over time, demand class, stock-outs, fixes). Clicking a month of a single series opens the **cell lineage drawer**. | Why does this series look the way it does? Are its zeros scheduled, missing or lost? |
| **Anomaly monitor** (history) | Flagged points on the timeline: diamonds for data errors fixed, triangles for real events. Counts by type; the full register with reason, action, confidence and impact; group by cause; CSV export. A row opens the series and its lineage. | Which unusual numbers were mistakes and which were real business, and what was done with each? |
| **Stock-outs & lost sales** (history) | Shipped vs unconstrained demand; lost vs back-ordered units by month; shortfall heatmap by family × month; lost USD by year, family, region and reason; back-order mechanics measured on the listed rows; the series with the largest lost sales. | How much demand did supply constraints hide, where, and what did it cost? |
| **Macro lead / lag** (history) | Family × indicator matrix (correlation; ★ marks the model's drivers at their lag); lag profile by era; a model-free check of the indicator shifted by its lag; indicator paths into the window, with repaired cells marked; the EV shift by powertrain; per-SKU sensitivities. | Which public indicator should I watch for each family, with how many months of warning, and is that stable? |
| **Forecast & accuracy** (prediction) | The forecast continuing the history with its P10–P90 band. The **backtest time machine**: replay the forecast made at any origin against what happened. A month, quarter or year table with coherent quantiles. The **forecast X-ray** waterfall. Filter-aware accuracy: forecast-value-added stairstep against the noise floor, WAPE by horizon, bias heatmap by family × region (click to filter), interval calibration, and accuracy by aggregation level. | How good is the forecast, against which benchmarks, where is it weakest, and can the band be trusted? Why is this number what it is? |
| **Lifecycle** (prediction) | Gantt of launches, EOL-announced, discontinued and planned SKUs; end-of-life run-offs to zero; cold starts drawn against the predecessor they replace; recent launches still ramping. | Which SKUs appear or disappear in the window, and do their forecasts respect business rule 5? |
| **What-if** (prediction) | Shift an indicator (presets such as PMI −3 from Jan 2027) for a chosen period, and optionally remove window events. Latent demand changes by exp(Σ β · Δindicator(t − lag)) per SKU and channel group. The change then flows through each series' ordering cycle; structural zeros stay zero. Base vs scenario on the timeline, the change in P90 cover, and the impact by family. | What happens to the plan if the economy turns, and where does it land? |
| **Exception inbox** (act) | Lost accounts, window events (Orion Driveline shutdown), recent customer switches, cold starts, end of life, forecast vs last year beyond ±25 %, backtest bias by segment beyond ±10 %, and imputed recent history. Each row has a root cause, an action and its revenue at risk. Group by cause; status and notes are kept in the browser; a side panel shows the series. | Which few series need my judgement this cycle, and how much revenue depends on it? |
| **Procurement plan** (act) | Service level P80, P90, P95 or P97.5 and a lead time. Mean plus buffer per month; lead-time cover from the aggregate quantile vs the naive sum of monthly quantiles; buffer by SKU in units and USD. Gross requirements only: no inventory positions are provided. | How much should I cover, at which service level, and where does safety-stock money go? |
| **Data download** (act) | CSV extracts of the current selection, built in the browser: monthly series, forecast rows with quantiles, history cells with spelled-out flags, and `submission.csv`. Bundle files with SHA-256; which modelling inputs were used (final or provisional); pipeline hashes from the manifest. | Can I take the numbers with me and trace them back to the pipeline run? |

Global controls, all kept in the URL hash, so any view is a shareable link:

- **Units / USD**;
- the **ordering-cycle lens**: "orders as booked" vs "latent monthly demand", where each order is spread over the
  months it carries, so cycle zeros disappear;
- dark mode.

Every chart has an "i" popover that states what it shows, how it is computed and which bundle file it reads.

### Standout features

- **Ordering-cycle lens.** The latent-demand toggle in the header; the zero-month calendar explains every zero; the
  briefing states the share of zero months that are scheduled.
- **Headlines that write themselves.** Every view headline, standfirst and module title is a deterministic template
  over facts computed for the current filters, with a descriptive fallback (`dashboard/src/insights/headlines.ts`,
  `overview.ts`). The brief (`briefing.tsx`) works the same way. There is no language model, and each brief item links
  to a filter or a view.
- **Backtest time machine and forecast-value-added stairstep** in Forecast & accuracy.
- **Forecast X-ray.** The waterfall of base level × season × holiday × macro × EV × lifecycle × event = latent demand,
  then cycle placement and rounding, for any selection and month.
- **Exception inbox**, ranked by revenue at risk.
- **What-if engine** built on the model's own sensitivities, re-accumulated through the ordering cycle.
- **Cell-level lineage drawer**: raw value → rule → cleaned value from the fix log, plus dropped duplicate loads.

## Deploy the static build

`vite.config.ts` uses `base: "./"`, and navigation uses the URL hash, so `dist/` works from any sub-path without
server rewrites:

- **GitHub Pages**: publish `dashboard/dist`, from a `gh-pages` branch or an Actions workflow that runs `npm ci && npm
  run build` after `python -m celeris export`.
- **Cloudflare Pages**: build command `npm ci && npm run build`, output `dist`, root `dashboard`. Every file is far
  below the 25 MiB per-file limit.
- **Any static host**, or `python -m http.server`.

## Code map

```
src/celeris/export/      stage.py (run_export), sources.py (real vs provisional), history.py, forecast.py, backtest.py,
                         quality.py, anomalies.py, macro.py, exceptions.py, quantiles.py, encode.py
tests/test_export_*.py   bundle schema, totals equal the pipeline files and submission.csv, determinism,
                         quantile formula vs the reference implementation
dashboard/src/
  App.tsx                shell: rail, masthead, filter bar, lazy views
  styles/                tokens.css (light / dark), base, shell, components, legacy (transitional re-skin)
  assets/fonts/          self-hosted Source Serif 4, IBM Plex Sans and Mono (OFL)
  data/                  bundle types, loader, in-memory model, aggregations, breakdowns, quantile engine, formatting
  charts/                ECharts wrapper, theme read from the CSS tokens, the shared timeline, annotation overlay
  components/            shell (rail, masthead), filter bar, Lede / Figure, Module / Key, controls, tables,
                         overlays (popover, info, drawer, toast), states, lineage drawer; ui.tsx is the legacy barrel
  insights/              headline engine, overview templates, the brief
  views/                 one file per view (plus an optional <View>.css)
dashboard/dev/           make_provisional_forecast.py (dev only)
```
