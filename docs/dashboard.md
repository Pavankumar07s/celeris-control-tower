# Dashboard: the Celeris planning control tower

A static single-page app (React 19 + TypeScript + Vite 7 + Apache ECharts 6) over a data bundle that the pipeline
writes. There is no backend and no number typed by hand: every figure on screen is computed from
`dashboard/public/data/*.json`, which `python -m celeris export` derives from the pipeline outputs in `outputs/`.

One app, two parts with the same filters (family → SKU, region, channel, customer):

- **What happened** (training data, 2019-01 → 2026-10): data health, demand explorer, anomaly monitor, stock-outs and
  lost sales, macro lead / lag.
- **What will happen** (prediction, 2026-11 → 2028-05): forecast & accuracy, lifecycle, what-if.
- **Act**: exception inbox, procurement plan, data download.
- The **Executive overview** spans both parts.

History and forecast always share **one continuous timeline**, drawn by one rule: **ink is the past, orange is the
future**. It shows:

- unconstrained demand as the ink line, with shipments as a hairline only where they were lower and the gap shaded as
  lost sales;
- a "last actual" rule at Oct 2026 and a washed forecast window labelled FORECAST;
- the submitted forecast in orange, starting from the last actual, with its P10–P90 band (the P50 is drawn when it
  departs visibly from the forecast and is always in the tooltip);
- rings on months where rebuilt cells cluster, and annotations computed from the data (the COVID trough, the
  semiconductor gap, the ERP rebuild, the largest event inside the window, the end value with its range);
- range presets instead of a zoom slider; one selected series switches to columns with P10–P90 whiskers.

## The design in brief

The look is "editorial precision" in the team owner's black, orange and cream: cream paper for content, black bands for
the navigation rail and the provenance footer, one scarce orange. Every view reads the same way:

1. **A computed serif headline and standfirst** that state the answer for the current filters (deterministic
   templates over facts, with a descriptive fallback; no language model, no typed number).
2. **One hero figure** with its comparison and a small visual (a range strip, a benchmark ladder, a meter).
3. **Modules under a rule**: each title is a computed conclusion, a one-line dek says what is plotted and over which
   dates, an inline key replaces the legend, and an "i" popover says what it shows, how it is computed and which bundle
   file it reads.
4. **Dense detail below the fold**: bar tables and ledgers with right-aligned tabular numbers and a CSV.

Orange means the forecast, the one selected marker, the primary action and the focus ring, nothing else. Status colours
(green, amber, red) always come with an icon or a word. Categories use a validated seven-colour palette with no orange
and no blue. The full specification, the component API and the acceptance gates are in
[`docs/design_system.md`](design_system.md); the gate results per view are in
[`docs/design_gate_results.md`](design_gate_results.md).

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
.venv/bin/python -m celeris export     # outputs/ -> dashboard/public/data (about 20 s, deterministic)
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

- Node 20.19 or later (Vite 7 requires `^20.19.0 || >=22.12.0`; built with Node 24);
- the project's Python virtualenv for the export.

The export needs these pipeline outputs:

- `outputs/clean`, `outputs/anomalies` and `outputs/quality`;
- the modelling outputs `outputs/forecast/*`, `outputs/backtest/*` and `outputs/features/macro_leadlag.csv`.

### Before the modelling outputs exist: provisional mode

`dashboard/dev/make_provisional_forecast.py` is a dev-only script. It writes stand-ins with exactly the contract schemas
(`docs/architecture.md`, "Contracts for the modelling and dashboard builds") to `outputs/_provisional/`. `celeris
export` resolves the files one by one: it takes the real file when it exists and the stand-in otherwise, and records
the choice in `meta.json` (`provisional`, `sources`). The app then shows a "Provisional forecast" pill in the masthead.
The current bundle is built from the **final** files (`provisional: false`), so the pill is absent.

## How data flows

```
outputs/clean, anomalies, quality      ─┐
outputs/forecast, backtest, features   ─┼─>  python -m celeris export  ─>  dashboard/public/data/*.json  ─>  views
(or outputs/_provisional/* stand-ins)  ─┘     (src/celeris/export/)          (columnar, dictionary-encoded)
```

| Bundle file | Built from | Loaded by | Size (gzip) |
|---|---|---|---|
| `meta.json` | sources, hashes, row counts, price assumption, backtest ladder, quantile self-check | start-up | 5 kB |
| `dims.json` | SKU master, series state, Record_ID blocks, customer runs, events, price table | start-up | 61 kB |
| `history.json` | `train_clean.parquet`: shipped units, flag word per cell, unconstrained demand where it differs | start-up | 317 kB |
| `forecast.json` | `forecast.parquet`: submitted forecast, mean, noise variance, `cv_level` / `cv_group` / `cv_common`, structural-zero reason, price | start-up | 257 kB |
| `forecast_detail.json` | row P10 / P50 / P90, latent mean, the seven multiplicative components, ensemble members, cycle accumulation | X-ray, what-if, latent lens, downloads | 532 kB |
| `quality.json` | `dq_report.json`, `fix_log.parquet` (issues by rule, rule × month heat-strip), `dedup_decisions.csv` | data health | 28 kB |
| `lineage/<family>.json` | fix-log rows per cell (raw → rule → cleaned) and the dropped versions of repeated Record_IDs | lineage drawer | 7 × ~110 kB |
| `anomalies.json` | `anomaly_register.csv` (11,799 flags: 11,463 cells and 336 episodes) | anomaly monitor | 219 kB |
| `stockouts.json` | `stockouts_clean.csv` and every lost / back-ordered / carried cell of `train_clean` | stock-outs, overview | 117 kB |
| `profiles.json` | `series_profile.csv`, `series_state.csv`, `account_events.csv` | series card | 56 kB |
| `macro.json` | `macro_clean.csv`, macro change log, `macro_leadlag.csv`, `macro_sensitivity.csv` | macro, what-if | 66 kB |
| `backtest.json` | `predictions.parquet` (error sums per series × horizon bucket and per family × region × channel × horizon), `metrics.csv`, `summary.json` | forecast & accuracy | 1.08 MB |
| `backtest_origin_<origin>.json` | each origin's actuals, final-model forecast and seasonal-naive forecast per series × horizon | time machine | ~165 kB each |
| `exceptions.json` | eight deterministic rules over the outputs above (`src/celeris/export/exceptions.py`) | exception inbox, brief | 9 kB |

Start-up loads about 0.64 MB of gzipped data plus about 0.32 MB of JavaScript (ECharts 227 kB, React and the app shell
90 kB); each view's code (1–15 kB gzipped) and data load when the view opens. The whole bundle is about 4.3 MB gzipped
(22 MB raw); the app verifies every file's SHA-256 against `meta.json` on the Data download view.

### Correctness rules the app enforces

- **Quantiles of any selection** come from the contract formula:
  - M = Σ mean;
  - V = Σ var_noise + Σ_series (cv_level · Σ mean)² + Σ_family×region (cv_group · Σ mean)² + (cv_common · M)²;
  - the result is lognormal: σ² = ln(1 + V / M²), μ = ln M − σ² / 2, Pq = exp(μ + z_q σ).

  `cv_common` (0.0189) is the market-wide shock calibrated on total × month; it is carried in `forecast.json`.
  `src/celeris/export/quantiles.py` is the Python port and the test checks it against
  `celeris.models.quantiles.aggregate_quantiles` (with and without the common term). `dashboard/src/data/quantiles.ts`
  is the browser port. The bundle carries quantiles the export computed for seven selections on the bundled values; at
  start-up the app recomputes them and shows "Quantile engine: 7 of 7 checks match the pipeline" in the rail. Row
  quantiles are never summed. (19-month total: P10–P90 2.73M–2.88M; first forecast month 153,360–161,934.)
- **WAPE** = Σ|actual − forecast| / Σ actual. **Bias** = Σ(forecast − actual) / Σ actual. Both are computed over the
  scored cells of the selection, never as an average of series WAPEs. Actuals are unconstrained demand.
- **Backtest scoring** pools the **four decision folds** that chose the model (origins Oct 2022, Oct 2023, Oct 2024,
  Mar 2025) on the **cells every model forecast**. The Oct 2021 stress fold (COVID and the chip shortage) is replayed in
  the time machine but never pooled, and a model with missing predictions is never credited with zero error. Pooled
  over the cells, our model (26.1 %) and the global GBM (26.7 %) read as in `summary.json`, which averages the four
  folds; the other figures differ by up to 0.1 point: seasonal naive 38.6 % (38.7 % as the mean of the folds),
  cycle-aware naive 31.1 % (31.2 %), the in-hindsight floor 23.5 % (23.6 %). The Overview, the brief and Forecast &
  accuracy cite the same pooled floor.
- **Missing rows are not zeros.** Months where rebuilt cells cluster carry hollow rings, and their demand is the
  pipeline's fill. Cells whose shipments are unknown (ERP blanks) are kept out of the lost-sales gap.
- **Forecast totals equal `submission.csv`** (2,805,199 units in 58,219 rows). The export refuses to write a bundle that
  disagrees, and a test checks it.
- **Customer at the time.** History is stored per series × customer run, so the customer filter follows the 23 customer
  switches.

## View guide

| View | What it shows | The question it answers |
|---|---|---|
| **Executive overview** (both) | Headline "Demand edges up 3.9% over the next 19 months"; hero: the 19-month forecast with its P10–P90 range strip against the last 19 months. Under the standfirst, a three-line **watch list** an executive reads without scrolling: the largest event in the forecast window, the cases and revenue at risk with the largest case, and the weakest region / family / channel of the change table (each reads the same variable as its evidence below and links to it). The annotated timeline 2019–2028 in units or USD. Figure strip: forecast revenue, backtest WAPE on a benchmark ladder, lost sales, cells repaired. **The brief** (seven facts, each linked to its evidence); where the 12-month change comes from by region, family or channel (click to filter); the five exceptions with the most revenue at risk; outlook small multiples (moving annual total). | Where are volume and revenue going, what changes in the mix, and what should I look at first? |
| **Data health** (history) | "Every blocking check now passes; 47 of the 90 failed on the raw files"; hero 108 of 116 checks passing (raw 61 → cleaned 108). Row bridge 248,248 raw rows → 245,548 grid cells; repairs by family (each history cell counted once: corrected + rebuilt + units unknown = repaired, the same definition as the Overview figure); a notice when filters are active (checks and rules cover whole files); every cleaning rule grouped by file with its recovery method; rule × month heat strip with the ERP migration bracketed; every check before and after (pills with icons, example cells open the lineage drawer); duplicates and restatements; numeric-state census. | Is the cleaning complete, exact and auditable? What kind of errors were there, and where? |
| **Demand explorer** (history) | A navigator that drills family → SKU → region → customer, with a breadcrumb. The timeline (orders or latent demand, continued into the forecast by default; columns for one series, click a month for its lineage). Seasonality by year; zero-month calendar (scheduled vs unexplained zeros); series card (lifecycle, customers over time, ordering cycle, demand class). A planned launch with no history still shows its forecast. | Why does this series look the way it does? Are its zeros scheduled, missing or lost? |
| **Anomaly monitor** (history) | "78% of flagged cells were real business, not errors". Flagged points on the timeline: rose hollow diamonds for data errors (corrected, or units unknown and kept out of fitting), jade triangles for real events, each on its value, the largest annotated. Flags by type on one shared bar scale (cells and episodes counted apart); the register with type, scope, period, reason, action, confidence and impact, each row expandable to the full reason, evidence and action (keyboard and touch, not only hover); group by cause; CSV. | Which unusual numbers were mistakes and which were real business, and what was done with each? |
| **Stock-outs & lost sales** (history) | 106,925 units ($109.9M) of demand never shipped; Electrical Assemblies 75 % of it. Lost vs back-ordered by month first, at full width; the shipped vs unconstrained demand timeline as compact context; lost sales by year, family, region and reason; shortfall heatmap family × month; back-order mechanics; the largest lost-sales series (a row opens it in the explorer). | How much demand did supply constraints hide, where, and what did it cost? |
| **Macro lead / lag** (history) | "Five of seven families have a leading indicator that holds in both eras" (one family selected: its own pair, e.g. "Vehicle orders lead Electrical Assemblies by two months"); hero 5 of 7 families with a stable driver (a driver of the model whose correlation at its lag keeps its sign and \|r\| ≥ 0.5 in 2019–22 and in 2023–26; the by-origin test of `methodology.md` 6.2, same indicator and lag at every decision origin, counts four families); every correlation names its statistic and period. Rate indicators change in points, levels in %. Family × indicator correlation matrix (model drivers outlined); lag profile by era; a model-free check on one standardised axis; indicator paths into the window; the EV shift indexed to 2023 = 100; per-SKU sensitivities as a dot plot with a table twin. | Which public indicator should I watch for each family, with how many months of warning, and is that stable? |
| **Forecast & accuracy** (prediction) | "Our model beats all three benchmarks, the best by 5.0 points" (always against the best benchmark of the selection; differences taken from the printed values); hero WAPE 26.1 % on its benchmark ladder. The forecast continuing the history; the **backtest time machine** (replay any origin, the 2021 stress test included). **WAPE and bias by family, region and channel** as dot-range rows on one scale (our model, seasonal naive, the in-hindsight floor); bias heatmap family × region; **WAPE or bias by horizon 1–19** (toggle); month / quarter / year table with coherent P10 / P50 / P90 and a CSV; the **forecast X-ray** waterfall; forecast value added with the challengers (global GBM, ensemble) and the intermittent methods; interval calibration; accuracy by aggregation level. | How good is the forecast, against which benchmarks, where is it weakest, and can the band be trusted? Why is this number what it is? |
| **Lifecycle** (prediction) | "Three SKUs hand over to successors in 2027"; successors reach 49 % of their predecessors' monthly volume by May 2028. Grouped Gantt (life so far, inside the window, launch and end-of-life marks, successor links); one handover panel per predecessor → successor with business-rule-5 checks; recent launches still ramping. | Which SKUs appear or disappear in the window, and do their forecasts respect business rule 5? |
| **What-if** (prediction) | A scenario builder (presets such as PMI −3 from Jan 2027, indicator, shift, period, remove window events, one orange Apply) kept in the URL. Latent demand changes by exp(Σ β · Δindicator(t − lag)) per SKU and channel group, then flows through each series' ordering cycle; structural zeros stay zero. The scenario (violet) against the base forecast and its band; P90 cover, revenue and rows changed; impact by family; effect by month. | What happens to the plan if the economy turns, and where does it land? |
| **Exception inbox** (act) | "305 cases on 304 series need a planner's judgement this cycle" (cases, the unit of the tabs, the rail badge and the brief; the series count only when it differs); hero $70.43M at risk with a review meter. Cause tabs; the ranked ledger (cases or cause groups, open or all, CSV); the case file docked on the right (the series with the rule's evidence, why it is flagged, the recommended action, status and notes kept in the browser, "Resolve, next case"); family × cause heat table. | Which few series need my judgement this cycle, and how much revenue depends on it? |
| **Procurement plan** (act) | "Pooling 3 months cuts the P90 safety stock by 32%"; hero the safety stock for the first cover against summing the monthly P90s. Controls read as a sentence ("Cover a [− 3 months +] lead time at a [P80 \| P90 \| P95 \| P97.5] service level"); mean demand (light orange) with the buffer (orange) on top by month; pooled vs summed buffers by lead time; the SKU ledger. Gross requirements only: no inventory positions are provided. | How much should I cover, at which service level, and where does safety-stock money go? |
| **Data download** (act) | "Every number here traces to pipeline run 0fb21b78"; the app re-hashes all 23 bundle files in the browser (hero 23 of 23 verified). CSV extracts of the current selection; `submission.csv`; the manifest with copyable hashes; the modelling inputs (all final); the 16 upstream pipeline outputs. | Can I take the numbers with me and trace them back to the pipeline run? |

**Screen sizes.** Designed at 1440 px; tested at 1280, 1024, 768 and 375 px with no horizontal scroll. On large
screens (1920 × 1080, 2560 × 1440, 3840 × 2160 at device scale 1) the page is centred and the masthead, filter bar and
footer end on the same edge as the content; the content measure grows in steps (1,520 px at 1920, 1,960 px at 2560,
2,640 px at 3840), type and spacing grow smoothly from 1600 px (×1.2 at 2560, ×1.47 at 3840), the extra width goes to
charts, tables and extra columns rather than longer lines, charts keep their proportions, and drawers open beside the
content. Details: [`design_system.md`](design_system.md) §4.1.

Global controls, all kept in the URL hash, so any view with its filters is a shareable link
(`#/forecast?fam=HYD&reg=Europe&m=usd&lens=latent&theme=dark`):

- **Units / USD** (`m=usd`);
- the **ordering-cycle lens** (`lens=latent`): "orders as booked" vs "latent monthly demand", where each order is
  spread over the months it carries, so cycle zeros disappear;
- **dark theme**: the moon / sun button (remembered in this browser), or `theme=dark|light` in the link to open a shared
  view in a given theme;
- in-view state: range presets (`tl`), tabs (`by`, `tb`, `hm`), the time-machine origin (`origin`), the X-ray month
  (`xr`), the inbox case (`case`), the what-if scenario (`wi`, `ws`, `wf`, `wn`, `we`), and the lineage drawer's cell
  (`cell=HYD-004|Europe|2023-03`, the same parameter on every view), so a reload reopens the same drawer.

### Standout features

- **Ordering-cycle lens.** The latent-demand toggle in the header; the zero-month calendar explains every zero; the
  brief states the share of zero months that are scheduled.
- **Headlines that write themselves.** Every view headline, standfirst and module title is a deterministic template
  over facts computed for the current filters, with a descriptive fallback (`dashboard/src/insights/`). The brief
  (`briefing.tsx`) works the same way, and each item links to a filter or a view.
- **Backtest time machine, forecast-value-added steps and bias by horizon** in Forecast & accuracy.
- **Forecast X-ray.** The waterfall of base level × season × holiday × macro × EV × lifecycle × event = latent demand,
  then cycle placement and rounding, for any selection and month.
- **Exception inbox**, ranked by revenue at risk, with a case file per series.
- **What-if engine** built on the model's own sensitivities, re-accumulated through the ordering cycle.
- **Cell-level lineage drawer**: raw value → rule → cleaned value from the fix log, plus dropped duplicate loads.
- **In-browser provenance**: the quantile self-check in the rail, and the SHA-256 of every bundle file re-computed on
  Data download.

## Deploy the static build

The submitted dashboard is live at <https://pavankumar07s.github.io/celeris-control-tower/>: `dashboard/dist`, as built and committed, served from the repository's
`gh-pages` branch.

`vite.config.ts` uses `base: "./"`, and navigation uses the URL hash, so `dist/` works from any sub-path without
server rewrites:

- **GitHub Pages**: publish `dashboard/dist`, from a `gh-pages` branch or an Actions workflow that runs `npm ci && npm
  run build` after `python -m celeris export`.
- **Cloudflare Pages**: build command `npm ci && npm run build`, output `dist`, root `dashboard`. Every file is far
  below the 25 MiB per-file limit.
- **Any static host**, or `python -m http.server`.

The checksum check on Data download needs a secure context (https or localhost); elsewhere the view says the hashes
are listed but not re-checked.

## Code map

```
src/celeris/export/      stage.py (run_export), sources.py (real vs provisional), history.py, forecast.py, backtest.py,
                         quality.py, anomalies.py, macro.py, exceptions.py, quantiles.py, encode.py
tests/test_export_*.py   bundle schema, totals equal the pipeline files and submission.csv, determinism, decision-fold
                         scoring on common cells, the common shock in the bundle, quantile formula vs the reference
dashboard/src/
  App.tsx                shell: rail, masthead, filter bar, lazy views, theme (storage, system or the theme= link)
  app/                   context (AppState, VIEWS), hooks (useSelection, useElementWidth, useMedia)
  styles/                tokens.css (light / dark), base, shell, components
  assets/fonts/          self-hosted Source Serif 4, IBM Plex Sans and Mono (SIL OFL 1.1; licences in docs/third_party/)
  data/                  bundle types, loader, in-memory model, aggregations, breakdowns, quantile engine, formatting
  charts/                ECharts wrapper, theme read from the CSS tokens, the shared timeline, annotation overlay
  components/            shell (rail, masthead, footer), filter bar, Lede / Figure, Module / Key, controls, tables,
                         overlays (popover, info, drawer, toast), states, icons, the lineage drawer and its URL helpers
  insights/              the headline engine and every view's facts and templates: overview, health, explorer,
                         anomalies, stockouts, macro, accuracy, lifecycle, whatif, inbox, procurement, downloads;
                         the brief
  views/                 one file per view; g1/ (Data health, Explorer, Anomalies, Stock-outs), g2/ (Macro, Forecast,
                         Lifecycle, What-if) and g3/ (Inbox, Procurement, Downloads) hold their view-only parts,
                         chart option builders and stylesheets
dashboard/dev/           make_provisional_forecast.py (dev only)
```
