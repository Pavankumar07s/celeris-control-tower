# Dashboard research: the Celeris demand-planning control tower

Research date 2026-11-23. Scope: section 5 of `docs/problem_statement.md` (5 required views, 7 optional views, shared
filters family / SKU / region / channel / customer, history and forecast on one continuous timeline with
P10/P50/P90, local run with documented setup, reads pipeline outputs, public demo link), judged against the 7 criteria
in `docs/evaluation_criteria.md`. Web sources are cited inline and listed in section 10. Vendor pages are marketing
and are labelled as such. Two small measurements were run on our own data (section 4.3); scripts are in
`research/scratch/dashboard-control-tower/`. Nothing was installed.

---

## 0. Bottom line

1. **Stack: a static single-page app.** Use React + TypeScript + Vite, Apache ECharts 6 (tree-shaken) for charts,
   TanStack Table for the register and exception grids, and the URL hash as the single store for the shared filters.
   The app reads **pipeline-generated JSON** from `dashboard/public/data/` at runtime. Host the same `dist/` folder on
   **GitHub Pages** (primary) and **Cloudflare Pages** (mirror).
   - Why: our whole dataset fits in the browser. The history grid is **0.27 MB gzipped** and the 19 x 3 forecast
     quantiles **0.19 MB** (measured, section 4.3).
   - A static site has **no server, so it never sleeps and has no cold start**. The Python hosts do: Streamlit
     Community Cloud sleeps apps after 12 h without traffic and shows a "wake up" button. Hugging Face now needs a
     paid plan for Gradio / Docker Spaces. Render's free tier spins down after 15 minutes and takes about 30-60 s to
     wake (section 4.4).
   - A judge's first click is the one that counts.
2. **Information architecture copies best-in-class control towers.** The design follows Kinaxis, o9, Blue Yonder,
   RELEX, SAP IBP and Oracle:
   - an overview, then **management by exception**: rank the few series that need a human, and give each one a root
     cause and a recommended action;
   - accuracy shown as **forecast value added over naive baselines**;
   - **probabilistic** quantities (P10/P50/P90) feeding a procurement decision;
   - a **what-if** that recomputes the plan.

   Our version adds **explainability**: every forecast decomposes into the factors of the generator we
   reverse-engineered.
3. **One timeline component everywhere.** It draws:
   - the history as a solid line, with unconstrained demand dashed where stockouts censored shipments;
   - a dated **"now" rule at 2026-10**;
   - the forecast as an accent-colour mean line inside a graded P10-P90 fan, on a hatched or tinted forecast zone
     (the IBCS convention: actual solid, forecast hatched);
   - event and anomaly markers in a separate lane above the line;
   - the 982 reconstructed missing months as hollow "imputed" markers, never as zeros.
4. **Eight standout features** (section 7), ranked by impact over effort:
   1. ordering-cycle lens: H/S;
   2. deterministic planner briefing: H/S;
   3. backtest time machine with FVA stairstep: H/S-M;
   4. forecast X-ray decomposition: H/M;
   5. exception triage inbox: H/M;
   6. live macro and event what-if engine: H/M;
   7. cell-level lineage drawer: M-H/M;
   8. story mode, a guided 3-minute tour: M-H/S.

   Each one is tied to a jury criterion.
5. **Two technical traps to avoid** (sections 5.4 and 8):
   - **Never sum quantiles across series.** Aggregate P10/P90 must come from summed sample paths. We precompute them
     for every non-empty node of the filter lattice: **2,414 nodes x 57 numbers, measured**.
   - **Never type a number.** Every KPI and every narrative sentence is computed from the pipeline JSON. A build-time
     test checks that dashboard totals equal `submission.csv` totals.

---

## 1. What the dashboard must do for each jury criterion

| # | Criterion | What the jury looks at | Dashboard deliverable that scores it |
|---|---|---|---|
| 01 | Problem understanding | Clear understanding, structured approach | Two-part IA (What happened / What will happen / Act) that mirrors the brief. Story mode walks Core -> Advanced -> Expert. A "Method" page with the pipeline DAG and a deliverables checklist. |
| 02 | Data preparation | Cleaning, preprocessing, features | Data health view: issue taxonomy, row waterfall 248,248 -> 244,566 -> 245,548, before / after, issue heat-strip by month. Cell-level lineage drawer from raw rows to the clean value. Stockout unconstraining shown as a gap area. |
| 03 | Model performance and validation | ML approach, performance, validation | Forecast & accuracy view: rolling-origin WAPE and bias by family, region and horizon vs 2-3 baselines (FVA stairstep). Interval coverage vs 80 %. Backtest time machine. Hierarchy-coherence badge. |
| 04 | Quality of insights | Relevant, accurate, practical | Deterministic planner briefing. Exception inbox with root cause and action. Lead/lag heatmap. Lost-sales quantification. Procurement plan from P90. All numbers come from pipeline files. |
| 05 | Dashboard and visualisation | Clarity, usability, effectiveness | One timeline grammar. Shared, cascading filters that persist in the URL. Instant interactions on a static site. Colour-blind-safe palette with shape as a second encoding. "Why this chart" popovers. |
| 06 | Originality and innovation | Unique, creative | Ordering-cycle lens (zeros are cycle off-months, not intermittency). Forecast X-ray built on the reverse-engineered generator. Live macro what-if that reproduces the model's own elasticities. |
| 07 | Solution presentation | Methodology, technical decisions, business impact | Story mode (also the demo video script). KPI tiles in units and USD: lost sales, buffer stock cost, revenue at risk. A decisions log page. |

The evaluation note in the repo says insights, dashboard, originality and presentation together outweigh raw model
score. The dashboard is the surface where criteria 04-07 are seen, so it is a first-class deliverable, not a wrapper.

Data-hackathon judging rubrics support this. One published rubric (Hacklytics) weighted "Design and Visualization" at
20/70 and asked whether the team "justif[ies] their decisions from the visualizations made". It also gave points for
completeness (deployed or ready to deploy) and for a working demo. The winning entry was an interactive Plotly
dashboard, and a deployed model "made the difference between offline experimentation and a live demo"
([Eugene Yan](https://eugeneyan.com/writing/how-to-win-data-hackathon)). Judging write-ups say the same: judges cannot
explore a project fully in a few minutes, so the demo must steer them, and a 3-minute demo with a clear shape beats a
feature list ([Bird](https://bird.com/blog/present-project-hackathon-judges),
[dev.to judging notes](https://dev.to/kurbaitaev/what-judges-actually-score-notes-from-a-year-of-hackathon-judging-3p4l)).

---

## 2. What best-in-class demand-planning control towers do

### 2.1 Common patterns across vendors

| Pattern | Evidence (vendor claims labelled) | What we copy |
|---|---|---|
| **Management by exception** | Blue Yonder (marketing): ML forecasts "the 95% of parts that are behaving normally, alerting the planner only to the 5% of 'Exceptions' that require human judgment" ([Blue Yonder](https://info.blueyonder.com/supply-chain-planning/what-is-blue-yonder-consensus-demand-planning-for-aftermarket-and-industrial-distributors)). RELEX: a dashboard "surfaces anomalies and exceptions so planners can prioritize tasks", with configurable rules ([RELEX RFP FAQ](https://www.relexsolutions.com/relex-demand-planning-and-sensing-rfp/)). Kinaxis: exception-based alerts on demand-forecast, order and capacity gaps, user-definable, sent to dashboards or email ([SoftwareOne listing](https://platform.softwareone.com/product/kinaxis-supply-planning/PCP-4053-1193), [SoftwareConnect](https://softwareconnect.com/reviews/kinaxis-maestro/)). SAP IBP: ML alerts that learn exception thresholds from the data ([SAP](https://www.sap.com/uk/products/scm/integrated-business-planning-machine-learning-alerts.html)). | An **Exception list** view ranked by revenue at risk. Most series need nothing. Planners see the few that do. |
| **Exception = KPI breach + root cause + recommended resolution** | Blue Yonder (blog) frames insight-driven planning as one object combining "the exception", "the root cause" and "a recommended resolution", plus guided playbooks. It also groups related exceptions so planners can "resolve thousands of issues with a single strategic action" ([Blue Yonder 2026](https://blueyonder.com/blog/2026/insight-driven-planning-turning-chaos-into-clarity)). | Every exception row carries a cause (from our anomaly / event / lifecycle knowledge) and an action, and can be grouped by cause, e.g. "Orion x North America shutdown: 62 series". |
| **Standard exception catalogue** | Oracle's 11 predefined demand-planning exceptions include MAPE above 0.4 and deviations above 20 % between actuals, consensus, budget, sales and year-on-year ([Oracle docs](https://docs.oracle.com/en/cloud/saas/supply-chain-and-manufacturing/25d/faupc/predefined-demand-planning-exceptions.html)). Oracle's exception dashboard shows hit counts and opens a review workspace in context ([Oracle](https://docs.oracle.com/cd/E75759_01/pdf/cloud/190/html/user_guide/output/apx_forecast_exp.htm)). | Our rules: forecast vs last-year deviation, backtest bias / tracking signal, and the domain rules listed in section 6, O6. Hit counts per rule, click-through to the series. |
| **Forecast value added (FVA) over naive** | FVA measures the change in accuracy attributable to each process step. The benchmark is a naive (random-walk or seasonal-naive) forecast. The standard display is a "stairstep" table of step, accuracy and FVA vs naive / vs statistical. A step with negative FVA is waste ([SAS FVA Q&A](https://blogs.sas.com/content/forecasting/2013/07/01/forecast-value-added-qa-part-4), [Foresight](https://forecasters.org/wp-content/uploads/FVA_A-Reality-Check_Foresight29.pdf), [Implement Consulting](https://implementconsultinggroup.com/article/increase-your-forecast-accuracy-with-forecast-value-add)). Lokad criticises FVA for showing *that* a forecast is bad but not *why*, and argues for dollar-based, probabilistic evaluation ([Lokad](https://lokad.com/forecast-value-added)). | A stairstep on the accuracy view: naive -> seasonal naive -> cycle-aware naive -> our model, by family / region / horizon. Answer Lokad's critique with the X-ray (why) and with errors also shown in USD. |
| **Bias and tracking signal** | Tracking signal = cumulative error / MAD, alert band about ±4 (±4 to ±6). MPE bands ±5 % / ±10 %. Recommended displays: a heatmap of bias by family x channel with traffic-light thresholds, control charts, and a Pareto of cumulative error by SKU ([Umbrex](https://umbrex.com/resources/company-analysis/supply-chain-logistics/demand-forecast-bias/)). SAP IBP exposes positive / negative bias adjustment and notes that positive bias inflates safety stock ([SAP Learning](https://learning.sap.com/courses/mastering-sap-ibp-for-inventory-planning-and-optimization-jp/forecast-error-1)). | Bias heatmap family x region (diverging scale, centred at 0, ±5 / ±10 % bands). Tracking signal as an exception rule. |
| **Probabilistic forecasts drive the decision** | ToolsGroup (marketing): forecasts give "multiple potential outcomes along with their probability" and are tuned to service levels, not accuracy alone ([ToolsGroup](https://www.toolsgroup.com/probabilistic-forecasting-supply-chain/)). Lokad: rank decisions by expected financial return over a distribution ([Lokad](https://lokad.com/forecast-value-added)). The newsvendor result: the optimal order is the critical-ratio quantile c_u / (c_u + c_o) of demand ([Wikipedia](https://en.wikipedia.org/wiki/Newsvendor_model), [Nixtla](https://www.nixtla.io/blog/stop-forecasting-the-mean)). | A **Procurement from P90** view with a service-level selector (P80 / P90 / P95 = critical ratio). Multi-month cover comes from summed sample paths. |
| **Scenario / what-if** | o9 (marketing): scenario analysis weighs options "against cost, service, and inventory metrics using the same constraints as o9's broader plan", backed by a knowledge graph ([o9](https://o9solutions.com/solutions/supply-chain-control-tower/), [Business Wire 2026](https://secure.businesswire.com/news/home/20260904541586/en/o9-Solutions-Named-a-Leader-in-2026-Nucleus-Research-Control-Tower-Technology-Value-Matrix)). Kinaxis: concurrent planning with "rapid scenario analysis", explainability and human-in-the-loop decisions ([Logistics Viewpoints 2026](https://logisticsviewpoints.com/2026/10/01/kinaxis-concurrent-planning-continuous-response/)). | A **what-if engine that uses the model's own equations** (the same per-SKU macro elasticities and lags), so a scenario is consistent with the base plan rather than a cosmetic slider. |
| **Explainable forecasts** | RELEX (marketing): "Because RELEX isn't a 'black box' solution, the forecast is explainable. Users can easily visualize demand-influencing factors using regressor coefficients" ([RELEX RFP FAQ](https://www.relexsolutions.com/relex-demand-planning-and-sensing-rfp/)). | **Forecast X-ray**: a multiplicative waterfall per series / node (level x macro x calendar x channel x EV x lifecycle x cycle accumulation). |
| **S&OP / consensus reporting** | Anaplan: data cleansing, then consensus, then executive reporting, with analytics for forecast accuracy, exception alerts and variance ([Anaplan brief](https://www.anaplan.com/content/dam/anaplan/site/en/resources/solution-brief/Anaplan_demand_planning_solution_brief.pdf)). Oracle demand review: MAPE tiles per stakeholder forecast ([Oracle](https://docs.oracle.com/en/cloud/saas/supply-chain-and-manufacturing/24c/fasop/demand-reviews.html)). | The Executive overview is the S&OP page: 19-month volume and revenue, mix shift, risks and opportunities. We have no human forecasts, so "stakeholders" are the baselines in the FVA stairstep. |

### 2.2 Resulting information architecture

The vendors converge on overview, then exceptions, then drill to root cause, then decide (scenario / plan), with
accuracy reported as FVA. Mapped onto the brief's two parts:

```
Header: Celeris Control Tower · data as of 2026-10 · forecast 2026-11..2028-05 · pipeline run <id> <git sha>
Global filter bar (sticky, cascading, URL-synced): Family · SKU · Region · Channel · Customer   [Units | USD]  [Unconstrained | Shipped]
Nav
  Overview ............................ R1 Executive overview (both parts)
  WHAT HAPPENED (training data)
    Data health ....................... R2
    Demand explorer ................... R3
    Anomaly monitor ................... R4
    Stockouts & lost sales ............ O5
    Macro lead/lag .................... O1
    Lifecycle ......................... O4 (history + window)
  WHAT WILL HAPPEN (prediction)
    Forecast & accuracy ............... R5
    What-if ........................... O2
  ACT
    Exceptions ........................ O6
    Procurement (P90) ................. O3
    Downloads ......................... O7
  Method / Story mode ................. methodology, decisions log, guided tour
```

---

## 3. Visualisation best practice that applies here

### 3.1 Forecast fan charts and "forecast clearly marked"

- **Fan charts communicate uncertainty well.** The Bank of England has published its forecasts as fan charts since
  1996. Shaded bands of equal probability mass widen with the horizon
  ([BoE 1998](https://www.bankofengland.co.uk/quarterly-bulletin/1998/q1/the-inflation-report-projections-understanding-the-fan-chart),
  [Wikipedia](https://en.wikipedia.org/wiki/Fan_chart_(time_series))). A 2026 BoE working paper finds that fan charts
  "perform best overall; combining high perceived usability with superior uncertainty communication" against dot plots
  and point forecasts
  ([BoE WP 2026](https://www.bankofengland.co.uk/-/media/boe/files/working-paper/2026/anchors-aweigh-the-effect-of-communicating-forecast-uncertainty.pdf)).
- **Graded bands with care.** Graded bands "enhance the sense of uncertainty" but add clutter
  ([Wilke, Fundamentals of Data Visualization](https://clauswilke.com/dataviz/visualizing-uncertainty.html)). We have
  only P10 / P50 / P90, so draw one 80 % band (P10-P90). Optionally add an inner P25-P75 band only if the pipeline
  emits it.
- **Hypothetical outcome plots (HOPs).** Animating equally likely sample paths avoids "deterministic construal error",
  but only with fast transitions and representative draws
  ([Wilke](https://clauswilke.com/dataviz/visualizing-uncertainty.html)). Padilla's group found that showing a few
  sampled forecasts (cluster-based sampling) gives good judgement with little surprise
  ([arXiv 2411.02576](https://arxiv.org/html/2411.02576v2)). Offer it as an optional "show 20 possible futures" toggle
  on the forecast view. It costs little if the pipeline exports 20 paths for the aggregate nodes.
- **Scenarios next to fans.** The UK OBR now presents scenarios alongside fan charts because fans alone understated
  uncertainty in 2022 ([OBR](https://obr.uk/box/presenting-uncertainty-in-our-forecasts/)). This supports pairing the
  forecast view with the what-if view.
- **Mark the forecast semantically.** IBCS (International Business Communication Standards) rule UN 3.2: actuals
  solid, plan outlined, **forecast hatched**, with scenario codes AC / PL / FC
  ([SAP IBCS guide](https://www.sap.com/design-system/sac-dashboard-design-best-practices/ibcs),
  [IBCS UN 3.2](https://www.ibcs.com/wp-content/uploads/2018/01/UN-3.2_More-scenarios_2018-01-23_rh.pdf)). Apply
  it as follows:
  - solid line for history;
  - accent-coloured line for the forecast;
  - a light hatched background (ECharts `markArea` with a decal pattern) for 2026-11..2028-05;
  - a labelled vertical rule at the last actual (2026-10).
- **Say which point you plot.** Methods research recommends submitting the **conditional mean**, not the median
  (`methods-forecasting.md` section 1). Label the main line "Forecast (submitted, mean)". Draw P50 as a thin dotted
  line inside the band, so judges do not mistake the median for the submitted number.

### 3.2 Annotated anomalies and events on time series

- Annotation makes charts more accessible
  ([Storytelling with Data](https://www.storytellingwithdata.com/blog/swdchallenge-annotate-it)). A survey of
  annotation practice is in [arXiv 2410.05579](https://arxiv.org/html/2410.05579v1).
- Vertical event labels collide when events are close together. Keep events spaced or filter to the notable ones
  ([Holistics](https://docs.holistics.io/docs/charts/custom-charts/library/annotated-time-series)). Anchor
  annotations so they survive narrow screens
  ([Datawrapper](https://www.datawrapper.de/academy/how-to-create-text-annotations)).
- Design rule for us:
  - events go in a **separate lane above the plot**: numbered pills, colour by event type, hover for the
    description, click to filter to the event scope;
  - anomalies are **marks on the line itself**, with **shape** by type (x data error fixed, ▼ stockout, ◆ one-off
    order, | level shift / lost account, ↻ cycle change, ⇄ customer switch) and colour by class (error vs real event);
  - at most about 8 categories visible at once, filtered by the global filters.

### 3.3 Lead/lag heatmaps

- Use a **diverging colour scale centred at 0 with symmetric limits**, because the correlation sign matters
  ([Minitab](https://support.minitab.com/en-us/minitab/help-and-how-to/graphs/correlogram/create-the-graph/gradient-type),
  [arXiv 2601.20805](https://arxiv.org/pdf/2601.20805)).
- **Label the lag-sign convention** and mark lag 0. Note that a white midpoint can wash out small values.
- For us the rows are the 7 families (or the SKUs of one family) and the columns are lag 0..12 for one selected
  indicator. Alternatively, a compact family x indicator matrix where each cell shows the best lag as a number and
  the elasticity as colour.

### 3.4 Drill-downs

- Use **linked views**: one global filter state. Every chart is a view of it, and clicking a mark sets a filter.
- Keep a breadcrumb (Family > SKU > Region > Customer) with one-click roll-up.
- The URL hash holds the state (`#/explorer?fam=ELA&sku=ELA-014&reg=Europe`), so a judge can bookmark or share any
  view and story mode can deep-link.
- Cascading options: each dropdown shows only the values present under the other filters, with counts. This avoids
  empty charts.

### 3.5 Data-quality before/after views

- Practitioner designs count the rows each cleaning rule removes, validate before and after transformation, and chart
  "rows after cleaning" to make data loss visible
  ([data-quality observability write-up](https://michaelbarley.github.io/projects/data-quality-observability)). UiPath's
  supply-chain data-quality dashboard uses stacked failed / warning / passed counts over time with a fixed 0-100 %
  pass-rate axis
  ([UiPath](https://docs.uipath.com/de/industry-department-solutions/automation-cloud/latest/supply-chain-retail-api-guide/data-quality-dashboard)).
- For us:
  - a **row waterfall** (raw -> de-duplicated -> grid-completed);
  - an **issue bar chart** by type, coloured by recovery class;
  - an **issue x month heat-strip**, which shows that errors cluster in time and links them to System events;
  - a **lineage drawer** for any cell.

### 3.6 Colour and accessibility

- Okabe-Ito is a good first choice for categories, with at most about 8 colours. Add patterns or labels as a second
  encoding ([The Node](https://thenode.biologists.com/data-visualization-with-flying-colors/research/)). A
  black-and-white print test is a good proxy for colour-blind readability
  ([Datawrapper](https://www.datawrapper.de/blog/colorblindness-part2)).
- Assign the 7 families fixed colours, used everywhere. Use neutral grey for history, one accent for the forecast and
  a diverging palette only for signed quantities (bias, correlation, deltas).

---

## 4. Technology choices

### 4.1 Requirements that drive the choice

- About 245,548 history cells (3,083 series x up to 94 months), 58,219 forecast rows x 3 quantiles, plus a backtest
  table, the anomaly register and the data-quality report.
- Must feel instant and polished, and must have **no cold start on a judge's first click**.
- Local run with documented setup that **reads pipeline outputs**.
- Free public hosting.
- The team is AI-assisted. Build effort matters less than polish and reliability.

### 4.2 Framework comparison

| Option | Local run | Interactivity / polish | Free hosting and first-click behaviour | Verdict |
|---|---|---|---|---|
| **Streamlit** | `pip install` + `streamlit run`. Simplest. | Reruns the script top to bottom on each interaction and needs `st.cache_data`. Weak for drag-heavy interactions, by the Streamlit maintainer's own account ([HoloViz discourse](https://discourse.holoviz.org/t/data-app-framework-comparison-from-quansight/3588)). The generic look is recognisable to judges. | Community Cloud: "All apps without traffic for 12 hours go to sleep". The visitor sees "This app has gone to sleep due to inactivity" and must click "Yes, get this app back up!". Memory cap 2.7 GB ([Streamlit docs](https://docs.streamlit.io/deploy/streamlit-community-cloud/manage-your-app)). Plain GET pings do not keep it awake ([dev.to](https://dev.to/yasumorishima/http-200-but-your-streamlit-app-is-still-sleeping-why-get-requests-dont-work-and-how-playwright-3g67)). An October 2026 thread reports apps stuck at start-up after waking ([forum](https://discuss.streamlit.io/t/all-apps-on-my-account-stuck-at-startup-after-waking-from-sleep/122744)). A forum reply states that "Community Cloud does not have a paid version", so no upgrade keeps an app awake ([forum](https://discuss.streamlit.io/t/i-have-deployed-my-app-in-streamlit-but-its-going-to-sleep-mode-more-often-what-to-do-to-avoid-this-appisinsleep-pricing/82617)). | Reject for the public demo. Judging happens days after submission, so the sleep page is near-certain. |
| **Dash / Plotly** | `pip` + `python app.py`. | Callbacks are more controllable than Streamlit's reruns. Good Plotly charts. In one benchmark Dash was the "clear winner" for slider updates ([Skov Madsen benchmark](https://www.github.com/MarcSkovMadsen/data-app-performance)). | Needs a Python server. Render free spins down after 15 min idle, with 30-60 s or more to wake ([Render community](https://community.render.com/t/do-web-services-on-a-free-tier-go-to-sleep-after-some-time-inactive/3303), [cold boot thread](https://community.render.com/t/cold-boot-start-of-the-server-for-first-request/15911)). Hugging Face: "Gradio and Docker Spaces run on compute and require a paid plan to create"; only static Spaces are free ([HF docs](https://huggingface.co/docs/hub/en/spaces-overview)). | Reasonable locally. The hosting story is bad. |
| **Panel (HoloViz)** | `pip` + `panel serve`. | Strong widgets, WebSocket updates ([Panel vs Streamlit](https://panel.holoviz.org/explanation/comparisons/compare_streamlit.html)). | Same server problem. The Pyodide (in-browser) export loads slowly: "import pandas takes 0.5 s on Linux -> several seconds in the browser" ([Pyodide talk](https://rth.github.io/talks/2023-pyodide-EuroPython.pdf)). | Reject. |
| **stlite (Streamlit on Pyodide, static)** | Static files. | Streamlit look. Some components cannot be installed. | Static, so no sleep, but start-up "will take a minute to load" (anecdotal) ([Alan Jones](https://alanjones2.github.io/articles/stlite/stlite.html), [stlite](https://github.com/whitphx/stlite)). | Reject. A one-minute spinner is as bad as a sleep page. |
| **Evidence.dev** | `npm` build. SQL + Markdown pages. | BI-report look. DuckDB-WASM in the browser for filters. Limited custom interaction (fan chart with hatch, linked brushing, custom drawers). | Static, so any host works. The project has split into "Evidence Core" (open source) and "Evidence Studio" (hosted), with a migrate command ([Evidence blog](https://evidence.dev/blog/evidence-core)). | Reject. Churn risk and too constrained for custom views. |
| **Observable Framework** | `npm`. Polyglot data loaders (Python allowed) run at build time and write static snapshots ([data loaders](https://observablehq.com/framework/data-loaders)). | Excellent charts (Plot / D3). Markdown pages. Reactive JS cells. | Static, so any host works. Observable deprecated Observable Cloud hosting in April 2025, so self-host on Pages ([release note](https://observablehq.com/release-notes/2025-04-15-deprecating-observable-cloud.)). The framework stays open source ([What is Framework](https://observablehq.com/framework/what-is-framework)). | Strong runner-up. Python data loaders satisfy "reads pipeline outputs" neatly. App-like UI (global sticky filter bar, tables with state, drawers) takes more work than in React. |
| **React + Vite SPA + ECharts** (recommended) | `npm ci && npm run build`, or serve a prebuilt `dist/` with `python -m http.server`, so judges need no Node. | Full control. ECharts 6 has a refreshed default theme, dynamic theme switching and custom series ([ECharts 6](https://echarts.apache.org/handbook/en/basics/release-note/v6-feature)). It has built-in `markArea` / `markLine` / `dataZoom` / `visualMap` / decal patterns, and tree-shaking keeps the bundle small ([ECharts import](https://echarts.apache.org/handbook/en/basics/import)). | Static on GitHub Pages: 1 GB site, 100 GB / month soft bandwidth, no sleep ([GitHub docs](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)). Cloudflare Pages free: 20,000 files, 25 MiB per file, 500 builds / month; only Pages *Functions* count against quota ([Cloudflare limits](https://developers.cloudflare.com/pages/platform/limits/)). | **Recommended.** |
| Next.js static export | `output: 'export'`. One HTML file per route ([Next.js docs](https://nextjs.org/docs/app/guides/static-exports)). | Same as React. | Static. No server features (no rewrites, headers, server actions, ISR). | Works, but adds nothing over Vite for a pure client-side app. Vercel Hobby is "non-commercial, personal use only" ([Vercel](https://vercel.com/docs/limits/fair-use-guidelines)). That is fine for a hackathon, but GitHub / Cloudflare Pages avoid the question. |

### 4.3 Payload measurements on our data (why no server and no DuckDB-WASM)

Script: `research/scratch/dashboard-control-tower/payload_size.py`. It uses the rough-clean parquet as a stand-in for
the final clean table.

| Payload | Raw | gzip |
|---|---|---|
| History grid as compact JSON (`{series: [start_month, [units...]]}`, 3,083 series, 245,502 cells) | 0.80 MB | **0.27 MB** |
| Forecast, 3,068 series x 19 months x (mean, P10, P90) | 0.62 MB | **0.19 MB** |
| History as long-format Parquet (snappy / zstd) | 0.35 / 0.30 MB | n/a |

Conclusions:

- **Total initial data is under about 1 MB gzipped** even with unconstrained and shipped series, prices and series
  metadata. Hosts serve JSON with gzip or brotli.
- Filtering and summing 245k cells in plain JS takes milliseconds, so no server and no SQL engine are needed.
  DuckDB-WASM's core binary alone is about 36 MB raw / about 12 MB gzipped (third-party package listing,
  [pkgstats](https://www.pkgstats.com/pkg:@dotdo/duckdb)). Wrappers drop extensions to stay under Cloudflare's 25 MiB
  per-file cap ([@ducklings/browser](https://cdn.jsdelivr.net/npm/@ducklings/browser@1.5.3/README.md)).
- If the pipeline must hand over Parquet rather than JSON, the dependency-free `hyparquet` reader can parse it in the
  browser ([hyparquet](https://github.com/hyparam/hyparquet)). JSON emitted by the pipeline is simpler and
  diff-friendly.
- **Charting bundle.** Plotly.js partial bundles are 364.8 kB gzipped (basic) to 507 kB (cartesian)
  ([plotly 3.5 dist](https://app.unpkg.com/plotly.js@3.5.0/files/dist/README.md),
  [plotly 4.3 dist](https://unpkg.com/plotly.js@4.3.0/dist/README.md)). ECharts can be tree-shaken to the charts
  used. Either fits a budget of about 600 kB gzipped total JS. ECharts wins on the built-in features we need (decal
  hatching for the forecast zone, `markArea`, `dataZoom` linked across charts, `visualMap` heatmaps, canvas
  rendering).
- **Lazy-load per view.** The overview loads about 0.6 MB. Accuracy (backtest cells), lineage (raw versions) and
  quantile lattice shards load when their view opens.
- **Downloads.** A full cleaned-train CSV would exceed Cloudflare's 25 MiB per-file cap. Ship `.csv.gz` or Parquet
  for large artefacts. GitHub Pages allows up to the 1 GB site total.

### 4.4 Hosting comparison: what a judge sees on the first click

| Host | Cost | Sleeps? | First click | Limits that matter |
|---|---|---|---|---|
| **GitHub Pages** | Free | No (static CDN) | Instant | 1 GB site, 100 GB / month soft bandwidth, 10 builds / hour soft (not for Actions builds). "Not intended for ... online business" ([docs](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)). |
| **Cloudflare Pages** | Free | No | Instant | 20k files, 25 MiB per file, 500 builds / month. Static requests not metered ([limits](https://developers.cloudflare.com/pages/platform/limits/)). |
| Vercel Hobby | Free | No for static | Instant | Non-commercial only. Third parties cite 100 GB / month ([Vercel fair use](https://vercel.com/docs/limits/fair-use-guidelines), [Hobby](https://vercel.com/docs/plans/hobby)). |
| Hugging Face static Space | Free | No for static | Instant | Gradio / Docker Spaces now need a paid plan. cpu-basic Spaces sleep after inactivity ([HF docs](https://huggingface.co/docs/hub/en/spaces-overview)). |
| Streamlit Community Cloud | Free | Yes, 12 h | Sleep page plus wake button, then boot | 2.7 GB memory ([docs](https://docs.streamlit.io/deploy/streamlit-community-cloud/manage-your-app)). |
| Render free web service | Free | Yes, 15 min | 30-60 s or more | Restart at any time ([Render community](https://community.render.com/t/cold-boot-start-of-the-server-for-first-request/15911)). |

Decision:

- **GitHub Pages** is primary. It shares the repository the submission form asks for, and a GitHub Actions workflow
  builds it.
- **Cloudflare Pages** is a mirror: same `dist/`, deployed from the same commit. Give both links in the README, so the
  demo survives one host's outage.
- Use **hash routing**, so deep links work on GitHub Pages without server rewrites. Set the Vite `base` to the repo
  path.

---

## 5. Recommended stack, in detail

### 5.1 Components

| Layer | Choice | Reason |
|---|---|---|
| Build / dev | Vite + React 18 or 19 + TypeScript | Fast build, static `dist/`, typed data contracts. |
| Charts | Apache ECharts 6, tree-shaken (`echarts/core` + line, bar, heatmap, scatter, custom; grid, tooltip, dataZoom, markArea / markLine, visualMap, legend; canvas renderer) | Fan bands (stacked areas), decal hatching, linked zoom, heatmaps, waterfall (stacked bar), all built in. |
| Tables | TanStack Table (headless) + virtualised rows | Anomaly register (thousands of rows) and exception inbox: sort, filter, group, CSV export. |
| State | URL hash as the single source of filter state, plus a tiny store (Zustand or React context) mirrored to it | Shareable deep links, story-mode navigation, back button works. |
| Styling | Tailwind CSS (or CSS variables) with a fixed token set: Okabe-Ito categories, grey history, one accent, diverging palette for signed values; light / dark | Consistent polish across 13 pages. |
| Data | `dashboard/public/data/*.json` (and `.json.gz` / `.parquet` for downloads) written by the pipeline step `make dashboard-data`; `manifest.json` with run id, git sha, timestamps, row counts and checksums | "Reads from pipeline outputs, not numbers typed in by hand". Re-running the pipeline updates the app with no JS rebuild. |
| Heavy compute | Web Worker for the what-if engine and HOP sampling | Keeps the UI at 60 fps. |
| Tests | Vitest unit tests on data selectors (sum, WAPE, coherence). A Node script checks that dashboard totals equal `submission.csv`. Optional Playwright smoke test for "every route renders" | Criteria 02 / 03 credibility. |

### 5.2 Local run (README text)

```
# full rebuild: pipeline -> dashboard data -> app
make pipeline            # cleans data, trains, forecasts, writes outputs/
make dashboard-data      # exports outputs/ -> dashboard/public/data/*.json (+ manifest.json)
cd dashboard && npm ci && npm run build && npm run preview     # http://localhost:4173

# no Node? the built app is committed / attached to the release:
python -m http.server -d dashboard/dist 8000                    # http://localhost:8000
```

The second path keeps "documented setup" to one command for judges who will not install Node. Disk note: React +
Vite + ECharts + TanStack `node_modules` is typically a few hundred MB. Check free disk first; the machine has about
8 GB free.

### 5.3 Data contract: files the pipeline must emit

| File | Content | Approx. gzip | Loaded by |
|---|---|---|---|
| `manifest.json` | run id, git sha, created_at, as-of months, file list with rows and sha256 | <1 kB | all |
| `dims.json` | series index: id, sku, family, bu, region, channel, customer (current and history), powertrain, size class, launch, EOL, replaces, lifecycle status, cycle type / phase, intermittency class | ~60 kB | all |
| `history.json` | per series: start month, shipped units[], unconstrained units[], flags bitmask per month (missing-imputed, stockout-listed, stockout-imputed, one-off, error-fixed) | ~0.4 MB | overview, explorer, anomalies, stockouts |
| `prices.json` | SKU x year canonical price, surcharge months, window price assumption (+4.5 % 2027, +4.0 % 2028 per EV-059 / EV-065) | ~30 kB | revenue toggle |
| `forecast.json` | per series x 19: mean (submitted integer), P10, P50, P90 | ~0.25 MB | overview, forecast, procurement |
| `quantiles_lattice.json` | coherent P10 / P50 / P90 per month for every non-empty node of {family, region, channel, customer} x {value, ALL}. **2,414 nodes x 57 numbers = 137,598 numbers** (`lattice.py`) | ~0.4 MB | forecast view with aggregate filters |
| `quantiles_sku/<family>.json` | SKU-anchored nodes (SKU x region / channel / customer combinations), 7 shards | ~0.3 MB each | forecast view when a SKU is selected |
| `cum_p90.json` | per node: P50 / P90 of 3-month lead-time cover and of the full 19-month total, from summed sample paths | ~0.2 MB | procurement |
| `paths_hop.json` | 20 sample paths for lattice nodes (optional) | ~1 MB | HOP toggle |
| `factors.json` | per series x month (history and window): level, macro multiplier, calendar, channel, EV, lifecycle, cycle accumulation factor, event multipliers | ~1 MB | X-ray (lazy) |
| `macro.json` | cleaned indicators 2019-01..2028-05 (with change-log flags); per family x indicator x lag 0..12 correlations and elasticities, split by period; per-SKU driver, lag, sensitivity, saturation | ~80 kB | lead/lag, what-if |
| `backtest.json` | per series x horizon 1..19: actual, then for each model (seasonal naive, cycle-aware naive, ML, final): sums of abs error and signed error over origins; per origin x family x region x horizon aggregates; interval coverage counts | ~1.3 MB | accuracy (lazy) |
| `anomalies.json` | anomaly register (id, series, month, type, class, cause, evidence, action, confidence, impact units / USD, linked event id) | ~0.3 MB | anomaly monitor, exceptions |
| `dq_report.json` | per file x rule: rows checked, failed, fixed, recovery class; waterfall counts; issue x month matrix; validation checks (e.g. cleaned units = Shipped_Units 5,761 / 5,761) | ~50 kB | data health |
| `lineage/<family>.json` | raw versions per Record_ID for touched rows only (~11k rows) | ~0.2 MB each | lineage drawer (lazy) |
| `exceptions.json` | precomputed exception rows (rule, series, months, metric, cause, action, revenue at risk) | ~0.1 MB | exceptions |
| `events.json` | tidy events, window multipliers | ~10 kB | event lane, what-if |
| `narrative.json` | facts (not prose) for the briefing: ranked statements with values and filter deep links | ~20 kB | overview, story mode |

### 5.4 Two correctness rules the app must enforce

1. **Quantiles do not add.**
   - Only the mean is additive across a hierarchy (`methods-forecasting.md` section 7). For any filter selection, the
     history line and the mean forecast line are exact sums of series computed in the browser.
   - **P10 / P90 come from the precomputed lattice** (summed sample paths), never from summing series quantiles.
   - If a user multi-selects (e.g. two families), there is no lattice node. Fall back to a moment approximation:
     aggregate variance = sum of series variances, which the pipeline exports per series x month, plus the shared
     level-error component. Label it "approximate band".
   - Or sample in the Web Worker from exported per-series NB parameters.
   - Residual cross-series correlation is about 0 here (`methods-forecasting.md` section 7), so the approximation is
     tight. Verify it in a unit test against lattice nodes.
2. **WAPE is additive in its numerator and denominator.** Accuracy for any filter is Σ|e| / Σa over the selected
   series, computed exactly in the browser from `backtest.json`. Never average series WAPEs. Exclude off-phase
   structural-zero rows and censored months from coverage, as `methods-forecasting.md` section 6 warns.

---

## 6. View-by-view design

Conventions for every view:

- The **global filter bar** applies everywhere. Every chart title states the active filter, e.g. "Electrical
  Assemblies · Europe".
- Every chart has an "i" popover with "what it shows / how computed / source file". This answers the rubric question
  of whether the team justified its visualisation decisions.
- **Timeline** means the shared continuous-timeline component from section 0, point 3.

The data facts quoted below come from the research reports and will be replaced by the pipeline's final numbers at
build time. They show what each view will reveal.

### R1. Executive overview (both parts), required

- **Purpose.** An S&OP-level answer in about 10 seconds: where volume and revenue are going, why, and what to watch.
- **Layout.**
  1. **KPI tiles** (5):
     - next-19-month forecast units (mean) with the P10-P90 range, and % vs the last 19 actual months;
     - forecast revenue (USD) with the stated price assumption;
     - backtest WAPE and bias at SKU x region x month vs seasonal naive, e.g. "0.26 vs 0.37";
     - historic lost sales, about 112k units / about USD 114M (stockouts lens);
     - data rows repaired, e.g. "6,935 numeric rows flagged and fixed · 982 missing months rebuilt".
  2. **Main chart**: the timeline 2019-01..2028-05 for the current filter, in units or USD, with fan, event lane and
     "now" rule.
  3. **Mix panel**: three small-multiple horizontal 100 % bars (family, region, channel), each with two bars, *last
     12 actual months* vs *next 12 forecast months*. The shift is labelled in percentage points.
  4. **Planner briefing**: 4-6 deterministic sentences (feature F2), each a link.
- **Interactions.**
  - Click a family, region or channel segment to set the global filter.
  - Brush the timeline to zoom; the brush is shared with other views.
  - The Units / USD toggle switches every number.
- **Insight delivered.** Managers see four things:
  - the macro "fading hump" (total x1.068 in 2026-11 down to x0.999 by 2028-05, Precision and Hydraulic rising
    most, EV SKUs about x1.10; `macro-indicators.md`);
  - the Orion x North America shutdown dip in 2027-07/08;
  - that the forecast continues the history without a jump at the "now" line;
  - how the mix is shifting toward EV and Precision.
- **Criteria.** 04, 05, 07.

### R2. Data health (training data), required

- **Purpose.** Prove the cleaning is complete, exact and auditable. This is criterion 02.
- **Layout.**
  1. **File cards** for train, test, macro, sku_master, events and stockouts: rows in / out, checks run / passed,
     % rows touched, link to the JSON report.
  2. **Row waterfall** for train: 248,248 raw rows -> −3,682 duplicate loads -> 244,566 unique Record_IDs -> +982
     reconstructed missing months -> 245,548 grid cells = one row per Date-SKU-Region.
  3. **Issue bar chart**, horizontal and sorted. Each type with row count, coloured by recovery class (exact /
     approximate / imputed / flag-only):
     - 7 date formats, 9,967 rows;
     - 2062 typos, 30;
     - Month column off by one, 246;
     - blank Region, 737 IDs;
     - blank Family, 1,228;
     - the 13 numeric error types (units blank, price in cents, EUR block, sign error, pack-of-10, revenue x10, and
       so on);
     - restatements;
     - macro cells repaired, 56;
     - master conflicts: PMP-004 BU, BSS-018 launch.
  4. **Issue x month heat-strip**: rows are issue types, columns are 94 months. It shows that errors cluster, for
     example the LatAm ERP-migration blank block (EV-033) and the India pack-of-10 block. System-event pills sit
     above it.
  5. **Before vs after panel**: label cardinality before -> after (e.g. Region variants -> 6, Customer variants ->
     12). Revenue-identity residual before vs after (all priced rows reconcile to the cent after). Units
     distribution before vs after (the x10 / x100 tails disappear).
  6. **Validation badges**: "cleaned Units = Shipped_Units on all comparable listed stockout rows". "Record_ID decode
     reproduces SKU / Region / Date on 248,248 / 247,503 / 248,218 rows". "0 rows after EOL".
- **Interactions.**
  - Click an issue type to filter the heat-strip and open a sample table of affected rows.
  - Click any row to open the **lineage drawer** (F7).
  - The global family and region filters restrict counts, since rows carry keys.
- **Insight delivered.**
  - Only 2.83 % of rows carried injected numeric errors, and 85 % of wrong units are restored exactly.
  - Two traps were avoided: rows where revenue, not units, is wrong, and 438 genuine large orders that are not unit
    errors.
  - Missing rows are not zeros.
- **Criteria.** 02, 01.

### R3. Demand explorer (training data), required

- **Purpose.** Drill family -> SKU -> region -> customer and understand a series' shape: level, seasonality, zeros,
  lifecycle.
- **Layout.**
  1. **Left: hierarchy navigator**, a collapsible tree with volume bars and sparklines (family > SKU > region >
     customer), sorted by volume, with search.
  2. **Centre: timeline** (history only by default; toggle "continue into forecast"). The **Orders as booked /
     Latent monthly demand** toggle comes from F1.
  3. **Below, four panels**:
     - (a) **Seasonality**: month-of-year index for the selection vs its family profile. Lines per year, faint, with
       the mean bold. The family profile is shared by all SKUs and fixed across years (`demand-dgp.md`), apart from
       moving holidays (LNY in APAC, Ramadan in MEA), which are annotated.
     - (b) **Zero-month calendar**: years x 12 months, cells shaded by units. Zeros are outlined, and an
       on/off-phase overlay of the series' ordering cycle is drawn on top.
     - (c) **Lifecycle strip**: launch, EOL, predecessor / successor links (Replaces_SKU), MEA opening ramp,
       customer switches.
     - (d) **Series card**: cycle type and phase (M, A, B, Q, T), cycle changes (from -> to, month), ADI / CV²
       class, channel, customer history, powertrain.
- **Interactions.**
  - Clicking a tree node sets the global filters; the breadcrumb rolls up.
  - Brushing the timeline syncs with the seasonality and zero panels.
  - Hovering a zero cell explains it: "off-phase of quarterly cycle (phase 2)", "lost account since 2025-xx",
    "launch ramp" or "stockout".
- **Insight delivered.**
  - 98.7 % of zero months are off-months of a deterministic ordering cycle (`panel-missing-zeros.md`), so zeros are
    predictable, not random intermittency.
  - Quarterly orders carry about 2.93 months of latent demand.
  - The planner sees why a series looks lumpy, and that the forecast respects the cycle.
- **Criteria.** 02, 04, 06.

### R4. Anomaly monitor (training data), required

- **Purpose.** Show every flagged point with type, reason and action, and separate **errors (fixed)** from **real
  events (modelled or excluded)**. This is a graded skill.
- **Layout.**
  1. **Summary**: a stacked bar of anomaly counts by type, split error / real. A small table of totals (rows, units,
     USD impact).
  2. **Timeline** for the current filter, with anomaly marks on the line (shape = type, colour = class) and the
     event lane above.
  3. **Anomaly register grid** (TanStack) with columns: id, series, month, type, class, cause, evidence, action
     (fixed / replaced by Requested / masked in training / modelled as event / kept as one-off), confidence, impact
     in units and USD, linked event. Faceted filters and CSV export.
- **Types to include** (from the lenses):
  - data errors, by numeric and date type;
  - genuine one-off orders (438);
  - listed stockouts and imputed unlisted ELA stockouts (1,925 cells);
  - back-order catch-up months;
  - "phantom orders" in zero-demand months (141);
  - holidays (LNY, Ramadan, fixed regional dips);
  - early buying before the 2023 price rise (Tier-1 / Aftermarket Dec 2022 x1.41, then Jan x0.69);
  - COVID lockdowns (India 2020-04 x0.05);
  - Nexon x Europe strike (x0.145);
  - Red Sea disruption (Export x {Europe, MEA});
  - Helios x India step (x1.24);
  - 27 ordering-cycle changes, 23 customer switches, 16 lost accounts;
  - master-data conflicts.
- **Interactions.**
  - Clicking a register row zooms the timeline to that series and month and shows before / after values.
  - Clicking a mark selects its register row.
  - "Group by cause" collapses, e.g., all Nexon-strike rows into one line with a total impact.
- **Insight delivered.** Which unusual numbers were mistakes and which were real business, what was done with each,
  and how much demand each event moved.
- **Criteria.** 02, 04.

### R5. Forecast & accuracy (prediction), required

- **Purpose.** Show the forecast continuing the history, with honest uncertainty, and prove it with a rolling-origin
  backtest.
- **Layout.**
  1. **Timeline with fan.** Mean (submitted) line, P50 dotted, P10-P90 band from the lattice, forecast zone hatched,
     event lane showing window events: Orion NA 2027-07/08, Ramadan moving into February in 2027 and 2028, LNY split
     in 2028, Helios India.
     - Toggles: HOPs ("show 20 possible futures"), Units / USD, monthly / quarterly / annual roll-up (temporal
       coherence).
  2. **Monthly table**: month, mean, P10, P50, P90, vs same month last year, event multipliers applied.
  3. **Accuracy panel** (lazy-loaded, filter-aware):
     - (a) **FVA stairstep**: rows are naive, seasonal naive, cycle-aware naive and final model. Columns are WAPE,
       bias, and FVA vs naive / vs seasonal naive. Example magnitudes from the lenses: seasonal naive 0.365,
       cycle-aware 0.280 / 0.261, noise floor about 0.24.
     - (b) **WAPE by horizon 1..19** (lines per model) with the noise floor as a dashed reference.
     - (c) **Bias heatmap family x region**: diverging, centred at 0, ±5 / ±10 % bands, Pareto of cumulative error
       on click.
     - (d) **Interval calibration**: coverage of [P10, P90] by horizon bucket vs the 80 % target. Share below P10
       and above P90 vs 10 % each. Pinball loss.
     - (e) **Origin selector**, which drives the backtest time machine (F3).
  4. **Coherence badge**: "Σ SKU-region = SKU = family = total for all 19 months: difference 0 units. Quantiles
     from summed sample paths." It expands to a check table.
- **Interactions.**
  - All filters apply: WAPE is recomputed exactly as Σ|e| / Σa for the selection.
  - Clicking a heatmap cell filters family x region.
  - Clicking a horizon point shows that origin's forecast vs actual.
- **Insight delivered.** How much better than naive the model is, where it is weakest (by family, region and
  horizon), and whether the P10-P90 band can be trusted.
- **Criteria.** 03, 05.

### O1. Macro lead/lag heatmap, optional

- **Purpose.** Answer which indicator leads which family, at what lag, and whether the structure is stable. These are
  Advanced and Expert items of workstream 3.
- **Layout.**
  1. **Family x indicator matrix** (7 x 8). Cell colour is the elasticity (diverging, centred at 0). The number in
     the cell is the best lag in months. The primary drivers are outlined. Examples: Hydraulic: PMI lag 2;
     Powertrain: Auto lag 3; Brake: Auto / Fuel lag 1.
  2. **Click a cell** to open the lag profile: correlation or elasticity at lags 0..12 for that family x indicator,
     with lag 0 marked and the sign convention labelled. Alongside, an overlay of the lag-shifted indicator on the
     family's de-seasonalised demand, as a visual proof.
  3. **Stability toggle**: 2019-22 vs 2023-26. The lag is stable; the amplitude is muted in 2021-22 (x0.96) and
     larger in calm years.
  4. **Forecast-window strip**: indicator paths 2026-11..2028-05 (smooth, no planted shocks) and the implied family
     multiplier path.
  5. **EV panel**: ICE / EV / Universal demand index vs EV_Adoption_Index (ICE −1.16 %, EV +3.64 % per index point).
- **Interactions.** The family filter syncs. A SKU drill shows the SKU's own driver, lag and sensitivity from
  `factors.json`.
- **Insight delivered.**
  - Planners know which public indicator to watch, and how many months of warning it gives, for each family.
  - The structure is stable and amplitude-scaled.
  - The EV shift is a separate zero-lag term.
- **Criteria.** 04, 06.

### O2. What-if (e.g. PMI −3), optional

- **Purpose.** Recompute the plan under a macro or event scenario, consistent with the model.
- **Layout.**
  1. **Scenario panel**:
     - a slider per indicator in natural units, with presets "PMI −3", "Auto production −5 pp", "EV adoption +10";
     - a shock shape: permanent from month X, or temporary for N months;
     - event toggles: Orion NA shutdown on/off; Helios step on/off; "announce 2028 price rise in Nov 2027", which
       triggers a Tier-1 / Aftermarket pre-buy by analogy with 2022 (x1.41 Dec, x0.69 Jan, x0.84 Feb, volume
       neutral).
  2. **Output**: the timeline with base and scenario fans overlaid, and a delta table by family, region and month
     in units and USD.
  3. **Procurement delta**: change in P90 cover by family.
  4. **Engine check badge**: "matches pipeline scenario run within x %".
- **Engine.**
  - The macro term is a per-SKU log-linear response to one primary driver at an integer lag, with saturation
    (`macro-indicators.md`). The browser can therefore apply `exp(s_sku × Δz(t − lag_sku))`, capped at the
    saturation, to the exported factor decomposition. The calculation is exact for the macro part of the model.
  - The ordering-cycle mask and accumulation are reapplied after the latent change.
  - The pipeline also precomputes 3-5 named scenarios through the full model. The UI shows the difference between
    the browser result and the full model as the engine check.
- **Insight delivered.** "If PMI drops 3 points from 2027-01, Hydraulic demand falls about x% from 2027-03 (lag 2),
  and Precision needs y fewer units of P90 cover." This is the decision support that control towers sell.
- **Criteria.** 06, 04, 07.

### O3. Procurement plan from P90, optional

- **Purpose.** Turn quantiles into a buy plan with a visible service-level vs inventory trade-off.
- **Layout.**
  1. **Service-level selector**: P80 / P90 / P95, explained as the newsvendor critical ratio. A **lead-time
     selector** defaults to 3 months, since the brief says orders are booked 2-3 months ahead.
  2. **Stacked bars by month**: the mean, plus the buffer up to the selected quantile.
  3. **Table by SKU** (or family) x month: mean, P90, buffer units, buffer USD, and **lead-time cover P90 from summed
     sample paths** (`cum_p90.json`), alongside the naive "sum of monthly P90s" to show how much it overstates.
  4. **Pareto** of buffer USD by SKU.
- **Notes.**
  - No inventory positions are provided, so the plan is **gross requirements**, labelled as such.
  - Structural-zero months (off-phase, lost accounts, after EOL) carry no buffer.
- **Insight delivered.** Where safety stock money goes, and the cost of each extra service-level step.
- **Criteria.** 04, 07.

### O4. Lifecycle (EOL and launches), optional

- **Purpose.** Show the forecast window's lifecycle risks and how cold starts are handled.
- **Layout.**
  1. **Gantt** of SKUs with a launch, EOL or EOL-announced status within 2026-05..2028-05. Bars run from launch to
     EOL, arrows link predecessor -> successor (Replaces_SKU), coloured by powertrain.
  2. **Cold-start panel** for the 3 planned launches (10 series, e.g. PTC-029 replacing PTC-005 from 2027-03): the
     donor's history, the transfer assumption and the resulting forecast with its band.
  3. **EOL panel**: series ending inside the window and their run-off forecast to zero after the EOL month.
  4. **Ramp curves**: launch ramp and MEA opening ramp `1 − exp(−(k+1)/5.9)` as small multiples.
- **Insight delivered.** Which SKUs appear or disappear inside the window, and that their forecasts follow business
  rule 5 (no sales after EOL or before launch).
- **Criteria.** 04, 01.

### O5. Stockouts and lost sales, optional

- **Purpose.** Quantify censored demand and its cost.
- **Layout.**
  1. **Timeline**: shipped vs unconstrained demand. The gap area is split into lost and delayed (back-ordered)
     units, with listed and imputed-unlisted months hatched differently.
  2. **Fill-rate heatmap** family x month. ELA shows the 2021-03..2022-09 semiconductor trough down to about 0.48
     fill.
  3. **Bars**: lost units and USD by year, family, region and reason.
  4. **Mechanics card** explaining the back-order catch-up: next month ships own demand + Backordered(t).
- **Insight delivered.**
  - About 112k units / USD 114M of lost sales.
  - The ELA shortage alone is about 70 % of units and 78 % of USD.
  - The forecast is trained on unconstrained demand, per business rule 7.
- **Criteria.** 02, 04, 07.

### O6. Exception list for planners, optional (the "Act" core)

- **Purpose.** A triage inbox, as in the vendor pattern in section 2.
- **Rules** (each with an id, a threshold, a hit count and an explanation):
  1. **Lost account**: 16 series at zero for 10-19 months, all present in test. Forecast = 0. Action: confirm with
     sales.
  2. **Window event**: series exposed to EV-062 Orion NA (62 series) and to Ramadan / LNY shifts. Action: review
     multiplier.
  3. **Recent cycle change or customer switch**. Action: verify the cycle phase used.
  4. **Cold start or EOL inside the window**. Action: approve donor and transfer.
  5. **Forecast vs last year > ±20 %** (Oracle-style), net of known drivers.
  6. **Backtest tracking signal outside ±4**, or family x region |bias| > 10 %.
  7. **Wide uncertainty**: P90/mean above segment norm.
  8. **History quality**: a high share of imputed or repaired months in the last 24.
- **Layout.** An inbox table with columns priority (revenue at risk = |Δ| x price, or band width x price), series,
  rule, root cause, recommended action, impact, status (new / acknowledged / resolved) and note. Group by cause.
  Clicking a row opens a side panel with the timeline and X-ray for that series.
- **Persistence.** Status and notes live in `localStorage`, with Export CSV. This is per viewer; no server is
  needed.
- **Insight delivered.** A short, prioritised to-do list for the planner, with no browsing of 3,068 series.
- **Criteria.** 04, 06, 05.

### O7. Data download, optional

- **Purpose.** Transparency and reuse.
- **Layout.**
  - A table of artefacts with description, rows, size, sha256 and schema link: `submission.csv`, forecast with
    quantiles, cleaned train (`.csv.gz` / `.parquet`), anomaly register, data-quality report JSON, backtest metrics,
    macro clean plus change log, events tidy.
  - "Download this view" on every table and chart, respecting the filters.
  - Manifest provenance: run id and git sha.
- **Criteria.** 02, 07.

### Extra page: Method / Story

- A pipeline DAG (raw -> keys decode -> numeric fixes -> unconstraining -> panel -> features -> models ->
  calibration -> reconciliation -> exports).
- A deliverables checklist mapping each Core, Advanced and Expert item of the brief to where it is shown.
- A **decisions log** (e.g. mean vs median, why cycle-aware, why bottom-up), with the story-mode launcher.
- **Criteria.** 01, 07.

---

## 7. Standout features, rated

Impact means expected effect on the jury score. Effort is for an AI-assisted team: S ≤ 1 day, M 1-2 days, L > 2 days.

| # | Feature | What it is | Why it stands out | Impact | Effort | Criteria |
|---|---|---|---|---|---|---|
| F1 | **Ordering-cycle lens** | A cycle ribbon under every timeline (on / off months, cycle changes). An "Orders as booked / Latent monthly demand" toggle. Forecast off-phase months drawn as structural zeros with a tooltip explaining why. | Most teams will treat zeros as intermittency (Croston). We show they are a deterministic cycle (98.7 % of zeros) and that 15.19 % of test rows are exactly 0 by structure. This is our clearest piece of originality and it is visible. | High | S | 06, 04, 05 |
| F2 | **Deterministic planner briefing** | 4-6 auto-generated sentences per filter, e.g. "Electrical Assemblies: next-19-month demand +x % vs last 19 (macro: New Vehicle Orders, lag 2). Risk: Orion NA shutdown 2027-07/08 removes y units. 3 series need review." Each phrase is a link that applies filters. | Mirrors Tableau Pulse, where "deterministic statistical models detect facts" first and language only phrases them ([Tableau](https://www.tableau.com/blog/tableau-pulse-automated-business-insights), [Tableau AI](https://tableau.com/blog/tableau-pulse-and-tableau-ai)). Ours uses **templates on pipeline facts with no LLM**, so every number is traceable and there is nothing to hallucinate. | High | S-M | 04, 07 |
| F3 | **Backtest time machine + FVA stairstep** | Pick an origin (e.g. 2024-03, 2025-03) and the timeline shows what the model forecast then (fan), the actuals after, and the baselines. The stairstep table updates. | Makes validation tangible. Judges *see* 19-month-ahead forecasts against reality, by family, region and horizon. | High | S-M | 03, 07 |
| F4 | **Forecast X-ray** | For any series or node and month, a multiplicative waterfall: base level -> macro (driver, lag) -> calendar / holiday -> channel -> EV -> lifecycle -> event -> cycle accumulation = forecast. Shown also as stacked factor lines over time. | Answers "why this number?" (the RELEX "not a black box" claim, Lokad's FVA critique). It is possible only because we reverse-engineered the generator. If an ML model is in the ensemble, show its residual adjustment as one extra bar. | High | M | 06, 04, 03 |
| F5 | **Exception triage inbox** | O6, with grouping by cause, revenue-at-risk priority, status and notes, and one-click jump to the X-ray. | The control-tower core (Blue Yonder: exception + root cause + resolution). Shows we understand how planners work. | High | M | 04, 05, 06 |
| F6 | **Live what-if engine** | O2, recomputed in a Web Worker from the model's own per-SKU elasticities and lags, with an engine-check badge against pipeline scenarios. | A real model-consistent scenario rather than a cosmetic slider. Satisfies the brief's "PMI −3" example exactly. | High | M | 06, 04, 07 |
| F7 | **Cell-level lineage drawer** | Click any history point or row to see the raw row versions (Load_Timestamp), the rules applied in order, the before / after values and the cross-checks (e.g. matches Shipped_Units). | Makes cleaning auditable at row level. A rare thing to see in a hackathon, and strong evidence for criterion 02. | Medium-High | M | 02, 01 |
| F8 | **Story mode** | A guided 3-minute tour of 8-10 steps. Each step deep-links to a view with filters and a highlighted element, plus a caption. The same script drives the demo video and the live pitch. | Judges have minutes. Story mode steers them to the core value (see section 1 sources) and reuses the URL state for free. | Medium-High | S | 07, 01, 05 |

Nice-to-have, low effort: HOP toggle on the fan chart, keyboard command palette (jump to SKU), dark mode, print-ready
overview (A4 landscape via CSS print styles), mobile-friendly overview.

Recommended build order:

1. Shell, filters, timeline.
2. R1-R5.
3. F1, F2, F8.
4. O5, O1, O6 (with F5), O4.
5. F3, F4.
6. O2 (with F6), O3, O7, F7.

Steps 1-3 already meet the Core tier, steps 4-5 Advanced, and step 6 adds the Expert-level polish.

---

## 8. Pitfalls and how to avoid them

| Pitfall | Consequence | Avoidance |
|---|---|---|
| Hosting on a sleeping Python host | The judge sees a sleep page or a 30-60 s spinner | Static SPA on GitHub Pages plus a Cloudflare mirror (section 4.4) |
| Summing P10 / P90 across series | Aggregate bands far too wide, an obvious error to an expert judge | Lattice quantiles from summed paths. Moment approximation only for multi-select, labelled (section 5.4) |
| Averaging series WAPEs | Wrong accuracy by family or region | Σ\|e\| / Σa from per-series sums |
| Plotting P50 as "the forecast" when the submission is the mean | Confusion, and bias looks wrong | Label the mean line "submitted". P50 dotted |
| Showing missing rows as zero | Violates business rule 3 | Hollow "imputed" markers, a flags bitmask in `history.json` |
| Showing shipped units in stockout months as demand | Understates demand. Violates rule 7 for the forecast basis | "Unconstrained" default, with the gap area in O5 |
| Hand-typed numbers in text or KPIs | Breaks the "reads pipeline outputs" requirement and criterion 04 accuracy | Templates over `narrative.json`. A CI test compares dashboard totals with `submission.csv` and `dq_report.json` |
| Revenue forecast without a price assumption | Unverifiable revenue | Show "+4.5 % 2027, +4.0 % 2028 (events EV-059 / EV-065) on 2026 list prices" next to every USD forecast |
| Over 8 colours, vertical event labels overlapping | Unreadable charts | Fixed family palette, event lane with numbered pills |
| Deep links breaking on GitHub Pages | 404 on refresh | Hash router and Vite `base` |
| Files over 25 MiB on Cloudflare | Deploy fails | gzip / Parquet for downloads |
| Slow first paint from a big bundle | Feels unpolished | Tree-shaken ECharts. Lazy-load views and data shards. Budget about 600 kB JS and about 1 MB data at first paint |

---

## 9. Artefacts produced

- `research/scratch/dashboard-control-tower/payload_size.py`: measures JSON / Parquet payloads for the history grid and
  forecast quantiles.
- `research/scratch/dashboard-control-tower/lattice.py`: counts the non-empty filter-lattice nodes of test.csv:
  1,082 (family, region, channel, customer) cells and 2,414 nodes with "ALL" levels. That is 137,598 quantile numbers
  for 19 months x 3 quantiles, plus 20,158 SKU-anchored nodes.

---

## 10. Sources

Columns: "F" means the page was fetched and read for this report; "S" means only the search-result snippet was used.

| Topic | Source | Read |
|---|---|---|
| Hackathon judging | https://eugeneyan.com/writing/how-to-win-data-hackathon | F |
| Hackathon judging | https://bird.com/blog/present-project-hackathon-judges | S |
| Hackathon judging | https://dev.to/kurbaitaev/what-judges-actually-score-notes-from-a-year-of-hackathon-judging-3p4l | S |
| Kinaxis | https://logisticsviewpoints.com/2026/10/01/kinaxis-concurrent-planning-continuous-response/ | F |
| Kinaxis | https://platform.softwareone.com/product/kinaxis-supply-planning/PCP-4053-1193 | S |
| Kinaxis | https://softwareconnect.com/reviews/kinaxis-maestro/ | S |
| Blue Yonder | https://blueyonder.com/blog/2026/insight-driven-planning-turning-chaos-into-clarity | F |
| Blue Yonder | https://info.blueyonder.com/supply-chain-planning/what-is-blue-yonder-consensus-demand-planning-for-aftermarket-and-industrial-distributors | S |
| RELEX | https://www.relexsolutions.com/relex-demand-planning-and-sensing-rfp/ | S |
| RELEX | https://www.relexsolutions.com/resources/vendor-selection-support-demand-planning-and-sensing-for-manufacturing/ | S |
| o9 | https://o9solutions.com/solutions/supply-chain-control-tower/ | S |
| o9 | https://secure.businesswire.com/news/home/20260904541586/en/o9-Solutions-Named-a-Leader-in-2026-Nucleus-Research-Control-Tower-Technology-Value-Matrix | S |
| SAP IBP | https://www.sap.com/uk/products/scm/integrated-business-planning-machine-learning-alerts.html | S |
| SAP IBP | https://learning.sap.com/courses/mastering-sap-ibp-for-inventory-planning-and-optimization-jp/forecast-error-1 | S |
| Oracle exceptions | https://docs.oracle.com/en/cloud/saas/supply-chain-and-manufacturing/25d/faupc/predefined-demand-planning-exceptions.html | F |
| Oracle exceptions | https://docs.oracle.com/cd/E75759_01/pdf/cloud/190/html/user_guide/output/apx_forecast_exp.htm | S |
| Oracle demand review | https://docs.oracle.com/en/cloud/saas/supply-chain-and-manufacturing/24c/fasop/demand-reviews.html | S |
| Anaplan | https://www.anaplan.com/content/dam/anaplan/site/en/resources/solution-brief/Anaplan_demand_planning_solution_brief.pdf | S |
| ToolsGroup | https://www.toolsgroup.com/probabilistic-forecasting-supply-chain/ | S |
| Lokad | https://lokad.com/forecast-value-added | F |
| FVA | https://blogs.sas.com/content/forecasting/2013/07/01/forecast-value-added-qa-part-4 | S |
| FVA | https://forecasters.org/wp-content/uploads/FVA_A-Reality-Check_Foresight29.pdf | S |
| FVA | https://implementconsultinggroup.com/article/increase-your-forecast-accuracy-with-forecast-value-add | S |
| Bias / tracking signal | https://umbrex.com/resources/company-analysis/supply-chain-logistics/demand-forecast-bias/ | F |
| Newsvendor | https://en.wikipedia.org/wiki/Newsvendor_model | S |
| Newsvendor | https://www.nixtla.io/blog/stop-forecasting-the-mean | S |
| Fan charts | https://www.bankofengland.co.uk/quarterly-bulletin/1998/q1/the-inflation-report-projections-understanding-the-fan-chart | S |
| Fan charts | https://www.bankofengland.co.uk/-/media/boe/files/working-paper/2026/anchors-aweigh-the-effect-of-communicating-forecast-uncertainty.pdf | S |
| Fan charts | https://obr.uk/box/presenting-uncertainty-in-our-forecasts/ | S |
| Fan charts | https://en.wikipedia.org/wiki/Fan_chart_(time_series) | S |
| Uncertainty visualisation | https://clauswilke.com/dataviz/visualizing-uncertainty.html | F |
| Uncertainty visualisation | https://arxiv.org/html/2411.02576v2 | S |
| IBCS notation | https://www.sap.com/design-system/sac-dashboard-design-best-practices/ibcs | S |
| IBCS notation | https://www.ibcs.com/wp-content/uploads/2018/01/UN-3.2_More-scenarios_2018-01-23_rh.pdf | S |
| Annotation | https://www.storytellingwithdata.com/blog/swdchallenge-annotate-it | S |
| Annotation | https://docs.holistics.io/docs/charts/custom-charts/library/annotated-time-series | S |
| Annotation | https://www.datawrapper.de/academy/how-to-create-text-annotations | S |
| Annotation | https://arxiv.org/html/2410.05579v1 | S |
| Heatmap colour | https://support.minitab.com/en-us/minitab/help-and-how-to/graphs/correlogram/create-the-graph/gradient-type | S |
| Heatmap colour | https://arxiv.org/pdf/2601.20805 | S |
| Colour-blind palette | https://thenode.biologists.com/data-visualization-with-flying-colors/research/ | S |
| Colour-blind palette | https://www.datawrapper.de/blog/colorblindness-part2 | S |
| Data-quality views | https://michaelbarley.github.io/projects/data-quality-observability | S |
| Data-quality views | https://docs.uipath.com/de/industry-department-solutions/automation-cloud/latest/supply-chain-retail-api-guide/data-quality-dashboard | S |
| Narrative insights | https://www.tableau.com/blog/tableau-pulse-automated-business-insights | S |
| Narrative insights | https://tableau.com/blog/tableau-pulse-and-tableau-ai | S |
| Streamlit hosting | https://docs.streamlit.io/deploy/streamlit-community-cloud/manage-your-app | F |
| Streamlit hosting | https://discuss.streamlit.io/t/all-apps-on-my-account-stuck-at-startup-after-waking-from-sleep/122744 | S |
| Streamlit hosting | https://discuss.streamlit.io/t/i-have-deployed-my-app-in-streamlit-but-its-going-to-sleep-mode-more-often-what-to-do-to-avoid-this-appisinsleep-pricing/82617 | F |
| Streamlit hosting | https://dev.to/yasumorishima/http-200-but-your-streamlit-app-is-still-sleeping-why-get-requests-dont-work-and-how-playwright-3g67 | S |
| Hugging Face Spaces | https://huggingface.co/docs/hub/en/spaces-overview | F |
| Render | https://community.render.com/t/do-web-services-on-a-free-tier-go-to-sleep-after-some-time-inactive/3303 | S |
| Render | https://community.render.com/t/cold-boot-start-of-the-server-for-first-request/15911 | S |
| GitHub Pages | https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits | F |
| Cloudflare Pages | https://developers.cloudflare.com/pages/platform/limits/ | F |
| Vercel | https://vercel.com/docs/limits/fair-use-guidelines | S |
| Vercel | https://vercel.com/docs/plans/hobby | S |
| Next.js static export | https://nextjs.org/docs/app/guides/static-exports | F |
| Observable Framework | https://observablehq.com/framework/what-is-framework | S |
| Observable Framework | https://observablehq.com/framework/data-loaders | S |
| Observable Framework | https://observablehq.com/release-notes/2025-04-15-deprecating-observable-cloud. | S |
| Evidence | https://evidence.dev/blog/evidence-core | S |
| Python app benchmarks | https://www.github.com/MarcSkovMadsen/data-app-performance | S |
| Python app benchmarks | https://discourse.holoviz.org/t/data-app-framework-comparison-from-quansight/3588 | S |
| Python app benchmarks | https://panel.holoviz.org/explanation/comparisons/compare_streamlit.html | S |
| stlite / Pyodide | https://github.com/whitphx/stlite | S |
| stlite / Pyodide | https://alanjones2.github.io/articles/stlite/stlite.html | S |
| stlite / Pyodide | https://rth.github.io/talks/2023-pyodide-EuroPython.pdf | S |
| DuckDB-WASM size | https://www.pkgstats.com/pkg:@dotdo/duckdb | S |
| DuckDB-WASM size | https://cdn.jsdelivr.net/npm/@ducklings/browser@1.5.3/README.md | S |
| DuckDB-WASM size | https://duckdb.org/docs/current/clients/wasm/instantiation | S |
| Parquet in browser | https://github.com/hyparam/hyparquet | S |
| Plotly bundle | https://app.unpkg.com/plotly.js@3.5.0/files/dist/README.md | S |
| Plotly bundle | https://unpkg.com/plotly.js@4.3.0/dist/README.md | S |
| ECharts | https://echarts.apache.org/handbook/en/basics/import | F |
| ECharts | https://echarts.apache.org/handbook/en/basics/release-note/v6-feature | S |

Internal sources used for data facts: `research/labels-keys.md`, `dates-dups.md`, `numeric-reconcile.md`,
`panel-missing-zeros.md`, `stockouts-unconstrained.md`, `lifecycle-master.md`, `macro-indicators.md`,
`events-calendar.md`, `demand-dgp.md`, `test-structure.md`, `methods-forecasting.md`. Their numbers are the
investigators' figures, and some are subject to the skeptic reviews in the `*.verify.md` files. The dashboard must
display the final pipeline numbers, not these.
