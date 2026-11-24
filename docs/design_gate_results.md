# Design gate results: every view against both acceptance gates

Integration and quality pass on the final build, 24 Nov 2026. Gates as defined in
[`design_system.md`](design_system.md) §13: the 18-point UI/UX Pro Max gate (skill `ui-ux-pro-max`), the 16-point
dashboard-designer gate (skill `dashboard-designer`), and gate items 17–28 of `research/dashboard-design-skills.md`
§10.5.

**Evidence.** Screenshots of the production build (`dashboard/dist`, served locally): all 12 views in light and dark at
1440×900 and as full pages; the five required views at 1280×720, 1024, 768 and 375 px (375 px rendered in a 375 px
iframe, because headless Chrome does not lay out windows narrower than 500 px); one family (Hydraulic Systems), one
region (Europe) and one series (HYD-004 · Europe) on Overview, Explorer, Forecast & accuracy and Anomaly monitor; a
cold-start series (PTC-029 · Asia Pacific) and a lost-account series (PTC-002 · North America); the loading frame. A
probe page measured horizontal overflow on all 12 views at 375, 768 and 1024 px, listed the tab order and focused
elements to show the focus ring. Numbers were cross-checked against `outputs/` (see the end of this file).

**Legend.** P = pass. N = passes with a stated limit (see the note). F = fails (see the note). Views: OV Executive
overview, DH Data health, EX Demand explorer, AN Anomaly monitor, SO Stock-outs & lost sales, MA Macro lead / lag, FA
Forecast & accuracy, LC Lifecycle, WI What-if, EI Exception inbox, PP Procurement plan, DD Data download.

## UI/UX Pro Max gate (18 points)

| # | Item | OV | DH | EX | AN | SO | MA | FA | LC | WI | EI | PP | DD |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Text contrast ≥ 4.5:1, light and dark | P | P | P | P | P | P | P | P | P | P | P | P |
| 2 | Visible focus ring everywhere | P | P | P | P | P | P | P | P | P | P | P | P |
| 3 | Keyboard reachable, tab order = visual order, skip link | P | P | N1 | P | P | N1 | N1 | P | P | P | P | P |
| 4 | aria-label on icon buttons, decorative icons hidden, labelled filters | P | P | P | P | P | P | P | P | P | P | P | P |
| 5 | Semantic elements, polite live regions | P | P | P | P | P | P | P | P | P | P | P | P |
| 6 | Chart text alternative: finding title, description, data as table or download | N2 | P | N2 | P | N2 | P | N2 | N2 | N2 | P | P | P |
| 7 | Pointer cursor, 150–300 ms colour hover, no layout shift | P | P | P | P | P | P | P | P | P | P | P | P |
| 8 | Click / tap for primary actions; 44 px targets on narrow screens | P | N3 | P | N3 | P | P | P | P | P | P | P | P |
| 9 | Loading shows a skeleton, space reserved | P | P | P | P | P | P | P | P | P | P | P | P |
| 10 | Empty states with a next action; errors next to the problem | P | P | P | P | P | P | P | P | P | P | P | P |
| 11 | Active view highlighted; URL reflects view, filters, toggles | P | P | P | P | P | P | P | P | P | P | P | P |
| 12 | 1440 / 1024 / 768 / 375 px, no horizontal page scroll | P | P | P | P | P | P | P | P | P | P | P | P |
| 13 | z-index scale 10 / 20 / 30 / 50 | P | P | P | P | P | P | P | P | P | P | P | P |
| 14 | Line height 1.5–1.75, measure 65–75 ch, 16 px body on phones | P | P | P | P | P | P | P | P | P | P | P | P |
| 15 | Reduced motion respected; transform / opacity only | P | P | P | P | P | P | P | P | P | P | P | P |
| 16 | Lazy views, memoised work, no layout shift on data | P | P | P | P | P | P | P | P | P | P | P | P |
| 17 | One style, SVG icons only, nothing ornate | P | P | P | P | P | P | P | P | P | P | P | P |
| 18 | Chart form fits data; actual vs forecast at a glance; anomalies marked and annotated; sorted labelled bars; numeric heat legends | P | P | P | P | P | P | P | P | P | P | P | P |

## dashboard-designer gate (16 points)

| # | Item | OV | DH | EX | AN | SO | MA | FA | LC | WI | EI | PP | DD |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 5-second test | P | P | P | P | P | P | P | P | P | P | P | P |
| 2 | Decision and audience obvious from the headline | P | P | P | P | P | P | P | P | P | P | P | P |
| 3 | Overview has 3–5 headline figures; ≤ 8 charts per screen | P | P | P | P | P | P | P | P | P | P | P | P |
| 4 | Hero top and visibly largest | P | P | P | P | P | P | P | P | P | P | P | P |
| 5 | Every headline figure has a comparison and a unit | P | P | P | P | P | P | P | P | P | P | P | P |
| 6 | Every chart title states the insight | P | P | P | P | P | P | P | P | P | P | P | P |
| 7 | ≤ 4–5 colours on screen, ink default, consistent across views | P | P | P | P | P | N4 | P | P | P | P | P | P |
| 8 | Red / green / amber only for status, never the only cue | P | P | P | N5 | P | N5 | P | P | P | P | P | P |
| 9 | Date range on every time chart; history vs forecast at a glance | P | P | P | P | P | P | P | P | P | P | P | P |
| 10 | Filters at the top, default "all" | P | P | P | P | P | P | P | P | P | P | P | P |
| 11 | Sensible precision and units | P | P | P | P | P | P | P | P | P | P | P | P |
| 12 | Source and "data as of" in the footer | P | P | P | P | P | P | P | P | P | P | P | P |
| 13 | White space about 15–20 % | P | P | P | P | P | P | P | P | P | P | P | P |
| 14 | Direct labels, no legend hunting, no pie > 5 | P | P | P | P | P | P | P | P | P | P | P | P |
| 15 | Usable at 768, not broken at 390, top three figures first | P | P | P | P | P | P | P | P | P | P | P | P |
| 16 | Contrast ≥ 4.5:1 and a colour-blind-safe palette, both themes | P | P | P | P | P | P | P | P | P | P | P | P |

## Gate items 17–28 (`dashboard-design-skills.md` §10.5)

| # | Item | OV | DH | EX | AN | SO | MA | FA | LC | WI | EI | PP | DD |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 17 | Fold test at 1440×900 | P | P | P | P | P | P | P | P | P | P | P | P |
| 18 | Question, finding, job: main control visible without scrolling | P | P | P | P | P | P | P | P | P | P | P | P |
| 19 | Deltas say against what | P | P | P | P | P | P | P | P | P | P | P | P |
| 20 | Facts agree (one variable per fact, parts sum, P10 ≤ P50 ≤ P90, no NaN / −0) | P | P | P | P | P | P | P | P | P | P | P | P |
| 21 | Rows end level, no orphan cells, no blank bands | P | F6 | P | P | N6 | P | N6 | P | P | P | P | F6 |
| 22 | One big number | P | P | P | P | P | P | P | P | P | P | P | P |
| 23 | Tables are rules and alignment | N7 | N7 | P | P | N7 | P | P | P | P | P | P | P |
| 24 | Drill-down keeps context (interaction) | N8 | N8 | N8 | N8 | N8 | N8 | N8 | N8 | N8 | N8 | N8 | N8 |
| 25 | Forecast dated and scored; anomaly flags shaped, labelled, listed | P | – | P | P | – | – | P | N9 | P | P | P | – |
| 26 | Chart chrome (3–5 gridlines, no y-axis line, round ticks, 4–8 x labels, no single-series legend) | N10 | P | N10 | N10 | N10 | P | P | P | P | P | P | – |
| 27 | Affordance and non-text contrast; one filled primary per view | P | P | P | P | P | P | P | P | P | P | P | P |
| 28 | Filters and edge cases (counts update, emptied modules keep their frame, cold start, longest names) | P | P | P | P | P | P | P | P | P | P | P | P |

"–" = not applicable (the view has no forecast chart, or no chart at all).

## Notes

- **N1 (keyboard, EX / MA / FA).** Every action has a keyboard path, but some only through a second control: the
  explorer's month-to-lineage click is on the canvas (the Data health example links and the anomaly register open the
  same drawer from buttons); the macro matrix cell is selected by mouse (the indicator paths below are buttons that
  select the column); the bias heatmap's click-to-filter duplicates the filter bar. Charts take focus and move the
  crosshair with ← →.
- **N2 (table twins).** Every chart has a computed title and an ECharts `aria` description; every ledger and bar table
  has a CSV, and Data download builds the monthly history-and-forecast extract of any selection. The timelines,
  seasonality, horizon and heatmap charts have no on-view table twin.
- **N3 (touch targets, DH / AN).** Controls grow to 44 px below 700 px, but inline "Example" links in the checks
  ledger and type labels in the anomaly tables stay text-sized.
- **N4 (colours, MA).** The correlation matrix (diverging jade ↔ plum) and the EV-shift chart (EV jade, ICE rose,
  universal grey, the index ink) put six hues on one scroll of the page; each chart alone stays within four.
- **N5 (status-like hues, AN / MA).** Jade and rose are categorical slots (anomaly classes; EV vs ICE), not status
  green and red, and they always carry a shape (triangle / diamond) or a direct label, but at a glance they read like
  good / bad.
- **F6 / N6 (rows end level).** Data health: the reloaded-rows module ends about 130 px above the numeric-state census
  beside it; Data download: the bundle manifest ends about 300 px above the modelling-inputs and upstream-outputs
  column. Stock-outs (back-order mechanics vs the series ledger) and Forecast & accuracy (forecast table vs X-ray) end
  within about 100 px. Content-driven; not fixed.
- **N7 (tables).** At 375 px the identity column is truncated in the Overview change table ("Middle East & …") and
  the Data health repairs table; the Stock-outs ledger is titled "The top 10 series hold 9% of lost sales" while it
  pages through all 1,212 series.
- **N8 (drill-down).** Verified by URL: filters, unit, lens, range, the inbox case (`case=`) and the lineage drawer
  (`cell=`, now one parameter on every view) all survive a reload; opening a SKU from Stock-outs or a case keeps the
  measure. Back-button scroll restoration and Escape inside the drawers were not exercised in a live browser (headless
  Chrome cannot click).
- **N9 (LC).** The lifecycle Gantt and handover panels date the forecast (the last-actual rule) but carry no backtest
  score; a cold start has no backtest of its own.
- **N10 (x labels).** The full-range timelines (2019–2028) print one label per January, ten at 1440 px; below 640 px
  they thin to every second or third year.

## Fixed in this pass

Shared layer: anomaly marks drawn in their roles by `buildTimeline`; history-only timelines without a stray divider and
with the end-label margin reclaimed; `TimelineChart` `patch` prop (the case file's evidence layer) and a callback-ref
width hook; window-event label in the active measure; `BarTable` footer cells honour `hideNarrow`; `FigureStrip`
columns as classes (responsive again); figure units wrap instead of overflowing (Lifecycle scrolled 5 px at 1024);
segmented controls and presets wrap on phones (Data health pushed the page to 424 px at 375; the time-machine origins
were cut off); phone timelines thin their year labels; the stacked shell no longer stretches the top bar; `Meter` crit
tone; one `Select`, `Stepper`, `Stamp`, `CheckPill`, icon set and `useMedia` hook instead of three per-group copies;
signed-zero guards; `fmtOnScale` (one scale per table column), `fmtFixed` (true minus), `fmtBytes`; `readableMonths`
normalises pipeline prose; SKU codes never break in headlines; a `theme=` link parameter; `styles/legacy.css`,
`components/ui.tsx`, the deprecated theme and token aliases and 14 dead exports deleted; facts and templates moved
from `views/g1–g3` into `insights/`.

Views: inbox tab counts read "cases" (the headline counts series: 286 cases, 285 series); Lifecycle and What-if had
lost their stylesheet in the refactor and now import it; Data health and the anomaly register print readable actions
("2062 → 2026" was "2062 -> 2026", "Units ×100"); Stock-outs, Overview and What-if tables use one number scale per
column; Macro's indicator paths print "52.4 to 50.3" and correlations with a true minus; the aggregation dumbbell
label no longer overflows; the horizon chart's end labels fit on phones; the Data health heat legend fits at 375;
procurement emphasises the buffer, not the mean; the explorer handles a planned launch with no history (headline,
standfirst and the forecast, instead of blaming a customer filter and claiming "every month carried an order"); a
series with no forecast says so in the Forecast title; What-if and Procurement now state the forecast origin and its
backtest score / P90 calibration; the masthead "i" is announced as "About this view".

Data and model numbers (export): aggregate quantiles carry `cv_common` (19-month P10–P90 2.71M–2.88M, was
2.76M–2.82M); backtest figures pool the four decision folds on cells every model forecast (our model 26.3 %, LightGBM
27.3 %, seasonal naive 38.6 %, floor 23.6 %; was 28.1 % / 22.3 % / 40.8 % / 24.4 %); Forecast & accuracy adds bias by
horizon and names the challengers.

## Numbers cross-checked against `outputs/`

| Shown in the app | Value on screen | Reference in `outputs/` | Agrees |
|---|---|---|---|
| Submission total (Data download, Forecast stamp) | 2,793,254 units, 58,219 rows | `forecast/submission.csv` sum and row count | yes |
| Our model's WAPE (Overview, Forecast hero) | 26.3 % over 4 origins | `backtest/summary.json` final model, mean over decision folds 0.26326 | yes |
| Time machine, origin Oct 2024, per series | 25.2 % | `summary.json` by_origin 2024-10 wape 0.25165 | yes |
| Seasonal naive WAPE | 38.6 % | `summary.json` 0.38698 (pooled 0.3862) | yes |
| Checks passing raw → cleaned (Data health hero) | 61 → 108 of 116 | `quality/dq_report.json` checks: passed before 61, after 108 | yes |
| Blocking checks failing on the raw files / passing after | 47 / all 90 | `dq_report.json` severity = error: 47 failed before, 90 pass after | yes |
| Raw rows → grid cells | 248,248 → 245,548 | `dq_report.json` summary train_rows_raw, train_grid_cells | yes |
| Lost sales (Overview, Stock-outs hero) | 106,925 units, $109.9M | `dq_report.json` stages.demand lost_units 106,924.5, lost_revenue_usd 109,949,627 | yes |
| Flagged cells: data errors / real events | 2,558 / 8,905 (11,463) | `anomalies/anomaly_register.csv` level = cell, by class | yes |
| Register rows and episodes | 11,799 flags, 336 episodes | `anomaly_register.csv` rows; level = episode (37 + 299) | yes |
| Hydraulic Systems, 19-month forecast (Overview, family filter) | 344K units | submission × test grid, family sum 343,648 | yes |
| Hydraulic Systems × Europe, 19-month forecast | 65.6K units | submission × test grid, 65,551 | yes |
| HYD-004 · Europe, 19-month forecast | 550 units | submission, 550 | yes |
| Q2 2027 (Forecast table) | 460K units | submission Apr–Jun 2027, 459,837 | yes |
| 19-month P10–P90 (Overview hero) | 2.71M–2.88M | pipeline self-check through the contract formula with `cv_common` (2,708,814–2,878,892) | yes |
