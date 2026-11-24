# Dashboard review, round 1: art direction and data visualisation

Critic lens: art direction and chart editing (first impression, identity, type hierarchy, rhythm, colour grammar,
consistency across the 12 views and both themes, chart form, chrome, labels, number formats, the history-to-forecast
seam, P10–P90 treatment, annotations, tables, the "so what"). Extra brief from the team owner: responsiveness on
extra-large screens (1920 × 1080, 2560 × 1440, 3840 × 2160).

Skills loaded before reviewing, in the owner's order: `ui-ux-pro-max`, then `dashboard-designer`, then `dataviz`.
Checklists applied in order: the UI/UX Pro Max 18-point gate, the dashboard-designer 16-point gate and items 17–28,
the QA checklists (`dashboard-design-skills.md` §4–6, `dashboard-design-principles.md` §12), and the team's own claims in
`docs/design_system.md` and `docs/design_gate_results.md` (verified, not trusted).

**Build reviewed:** a private snapshot of `dashboard/dist` (built 24 Nov 2026 16:16, bundle 25 Nov 00:29) served on port
8261. Numbers come from the previous model version (forecast total 2,793,254, WAPE 26.3 %); stale model numbers are not
reported as defects. Numbers that disagree with each other on the same build are.

**Screenshots** (all in `research/scratch/dash-critique-art-dataviz-r1/`, JPEG, 15 MB in total):

| Kind | Files |
|---|---|
| Light, 1440 px, full page | `overview-fold.jpg`, `overview-full.jpg`, `health-full.jpg`, `explorer-full.jpg`, `anomalies-full.jpg`, `stockouts-full.jpg`, `macro-full.jpg`, `forecast-full.jpg`, `lifecycle-full.jpg`, `whatif-full.jpg`, `exceptions-full.jpg`, `procurement-full.jpg`, `downloads-full.jpg` |
| Dark, 1440 px | `dark-overview.jpg`, `dark-forecast.jpg`, `dark-exceptions.jpg`, `dark-explorer.jpg` |
| Filtered / single series | `f-explorer-fam.jpg` (family ELA), `f-explorer-series.jpg`, `f-forecast-series.jpg`, `f-anomalies-series.jpg` (ELA-008 · India) |
| Narrow | `n375-overview.jpg`, `n375-forecast.jpg`, `n768-exceptions.jpg` |
| Extra-large (device scale 1) | `xl1920-overview.jpg`, `xl1920-forecast.jpg`, `xl1920-exceptions.jpg`, `xl2560-overview.jpg`, `xl2560-forecast.jpg`, `xl2560-explorer.jpg`, `xl3840-overview.jpg`, `xl3840-exceptions.jpg` |

(The `*-light-full.png` and `ov-light-*.png` files in the same folder predate this review, 24 Nov 16:12; they are not
mine and were left alone.)

Hover tooltips were not exercised (headless Chrome cannot hover); everything below is from static renders plus code.

---

## Verdict

**Overall 7.5 / 10. Not ship-ready: 4 critical and 21 major findings.**

First impression in five seconds: this does not look like an AI admin template. Cream paper, black bands, one serif
sentence, one big number, rules instead of cards, an ink history line running into an orange forecast fan. The
signature ("ink is the past, orange is the future") is held on every view and in both themes; the categorical palette
never touches orange or blue; status colour arrives with a word or icon. The chart craft on Overview, Data health and
Forecast & accuracy is at a data-newsroom level.

What keeps it from a 9: (1) on the same screen, sentences and numbers disagree with each other (285 vs 286, "May" vs
"Jun", "zero in its EOL month" vs 178 units, value-added steps that do not subtract, "60 more flags" vs "3
episodes"); a judge who checks one sum will find one; (2) a handful of charts do not draw the claim their title makes
(region accuracy, stock-outs lead chart, anomaly type bars on unshared scales, floating error diamonds); (3) on
extra-large screens the layout is a fixed 1,128 px column pinned to the left, so at 2,560 px nearly half of the screen is
empty cream and at 4K everything is small.

### Scores per view (1–10)

| View | Score | One line |
|---|---|---|
| Executive overview | 8.5 | The reference: fold test passes, the timeline is excellent; only small consistency nits |
| Data health | 8.0 | An audit a judge can verify; headline "47 failed" reads against the hero's 55 |
| Demand explorer | 7.5 | Strong drill path and single-series card; unlabelled hero strip, colliding axis ticks |
| Anomaly monitor | 7.0 | Good marks and register; bars on unshared scales, diamonds drawn off their values, "60 more flags" |
| Stock-outs & lost sales | 7.5 | Right facts, wrong lead chart (the 0.9 % gap is 2 px tall); rounding |
| Macro lead / lag | 7.0 | Rich, but % changes of rates, three r values for one pair, heatmap shouts about lag-12 artefacts |
| Forecast & accuracy | 8.0 | Best validation storytelling in the app; value-added arithmetic, labels collide, series headline cherry-picks |
| Lifecycle | 7.5 | Clear Gantt and handovers; the title says the opposite of the chart about the EOL month |
| What-if scenarios | 7.5 | Works and reads; scenario end label missing, odd ticks |
| Exception inbox | 7.5 | Strong layout (tabs, ranked rows, docked case); headline count and case wording contradict |
| Procurement plan | 7.5 | Good pooling story; the lead-time title uses the wrong base for "overstate" |
| Data download | 8.0 | Provenance done right; nothing to fix beyond polish |
| Extra-large screens (≥ 1920 px) | 4.0 | Fixed 1,128 px measure, left-aligned, fixed type and chart heights |

### Findings by severity

critical 4 · major 21 · minor 20 (45 in total; JSON at the end).

---

## The five things that most make this look like a winner (do not break them)

1. **The computed lede on every view.** A serif headline with a number and a verb, a 3-line standfirst, and one hero
   figure with its comparison and the P10–P90 range strip (Overview "Demand edges up 3.5 % …", hero 2.79M with the
   last-19-months tick). It reads like a planning brief, and it re-computes on every filter (`f-explorer-fam.jpg`,
   `f-explorer-series.jpg`). Keep the templates, the fallbacks and the single hero.
2. **The one continuous timeline.** Ink history, the last-actual rule labelled "Oct 2026 last actual", the washed
   FORECAST zone, the orange line with its band fanning from the last actual, the end label "153K, P10–P90 148K–157K",
   3–4 real events annotated with leader lines (COVID-19, semiconductor shortage, ERP migration, Orion shutdown), and the
   automatic switch to ink columns + orange columns with whiskers for one series. This is the signature; it passes the
   greyscale test.
3. **Forecast & accuracy as an argument, not a table.** Benchmark ladder in the hero, value-added steps, calibration
   bars (below / inside / above against the 10 / 80 / 10 target), the "errors cancel" dumbbells by level, the horizon
   curve, the quarter table with P10 / P50 / P90 and the X-ray that decomposes one forecast month into season × macro ×
   EV × lifecycle × event × cycle placement. Few entries will show validation this honestly.
4. **Data health as a reconciliation.** The rows waterfall with "Both identities hold", per-family repairs that sum to
   the totals (6,961 / 982 / 245,548 all add up), the rule ledger by file with "how it was fixed", the rule × month
   heatmap with the ERP bracket, and the before / after checks ledger. Every sum I tried on this view adds up.
5. **The Exception inbox and the provenance chain.** Cause tabs carrying dollars and counts, ranked two-line rows with
   inline bars, the docked case file (evidence chart, why flagged, recommended action, review state, one orange primary
   button), the family × cause heat table whose rows and columns sum; and the footer + Data download with SHA-256
   matches for all 23 files. Quiet chrome throughout: rules not boxes, no shadows on modules, mono only on codes.

---

## Critical

### C1. Exception inbox headline counts 285 while everything else counts 286
`exceptions-full.jpg`, `dark-exceptions.jpg`, `xl1920-exceptions.jpg`. Headline "285 series need a planner's
judgement this cycle"; directly below, the tab "All causes … 286 cases", the case file "Case 1 of 286", the rail badge
286, the Overview brief "286 exceptions need a planner". The difference is one series with two causes, but nothing on
screen says so: the very first sentence of the Act view looks wrong to a judge. **Fix** `dashboard/src/insights/inbox.ts`
(headline template near line 110–118): count the same variable the tabs count ("286 cases need a planner's judgement
this cycle"), or say both ("286 cases on 285 series …"). One count, one word, on rail / brief / tabs / headline.

### C2. Case file says "since May 2025", its own row says "since Jun 2025"
`exceptions-full.jpg` (docked case). Headline "Quantum Drive Systems has placed no PTC-002 order since May 2025";
the row and the case's own "Why it is flagged" say "No orders since Jun 2025 (17 silent months)"; the chart note says
"Last order May 2025". "Since May" means May had no order, which contradicts "Last order May 2025". **Fix**
`dashboard/src/insights/inbox.ts` line 217: "… has placed no PTC-002 order after May 2025" (or "last ordered PTC-002 in
May 2025"), and make the row reason template read "Last order May 2025; silent for 17 months" so both use the last-order
month.

### C3. Lifecycle title claims the run-off reaches zero in the EOL month; the chart and the bundle say otherwise
`lifecycle-full.jpg`. Title "Every run-off reaches zero in its EOL month"; standfirst "PTC-005, PMP-003 and THM-001 run
off to zero in their EOL months (May 2027, Aug 2027 and Dec 2027)". The bundle forecasts 178 units for PTC-005 in May
2027 (zero from Jun 2027), 119 for PMP-003 in Aug 2027 and 185 for THM-001 in Dec 2027; each chart draws the orange
EOL square well above zero and the line hits zero the month after. The rule checks underneath ("0 units after EOL") are
right; the sentences are wrong. **Fix** `dashboard/src/insights/lifecycle.ts` lines ~179 and ~231: "Every run-off sells
its last units in its EOL month and is zero from the month after (Jun 2027, Sep 2027, Jan 2028)".

### C4. Anomaly monitor, one series: "60 more flags" against "3 episodes" and "21 flags"
`f-anomalies-series.jpg` (ELA-008 · India). Standfirst: "21 cells … were flagged … 60 more flags cover whole episodes";
the type tables below: "All 2 types: 20 flagged cells, 3 episodes" and "Data errors, fixed: 1 cell, 1 episode"; the
register title: "21 flags from 3 causes across 1 series". Three counts of the same thing on one screen. **Fix**
`dashboard/src/insights/anomalies.ts` line 214: compute `f.episodes` from the same register rows the type tables and the
register use for the selection (or, if the 60 are file-wide episodes touching the series, list them in the register and
say "60 file-wide episodes also touch this series").

---

## Major

### M1. Extra-large screens: content stranded in a fixed 1,128 px column on the left
`xl1920-overview.jpg`, `xl2560-overview.jpg`, `xl2560-explorer.jpg`, `xl3840-overview.jpg`, `xl3840-exceptions.jpg`.
`.page` has `max-width: calc(var(--measure) + 2 * var(--gutter))` with `--measure: 1128px` and no `margin-inline: auto`
(`styles/shell.css` line 90, `styles/tokens.css` line 132); there are no `min-width` media queries anywhere. Result: at
1920 px 27 % of the width right of the content is empty; at 2560 px 45 %; at 3840 px 70 %. The masthead and filter bar
span the full width, so "Copy link" and "3,093 series in view" sit 1,100–2,400 px from the content edge they belong to.
On a jury projector or a 27-inch monitor the first impression is "a laptop page lost on a big screen". **Fix:** grow
the measure in steps and keep the bars aligned to it: in `tokens.css` add `@media (min-width: 1600px) { --measure:
1320px }`, `(min-width: 1920px) { --measure: 1520px; --rail-w: 256px; --gutter: 48px }`, `(min-width: 2560px) {
--measure: 1840px; --rail-w: 280px }`; in `shell.css` give `.page`, the masthead inner row and `.filterbar` the same
`max-width` (`calc(var(--measure) + 2 * var(--gutter))`) so the controls end where the content ends; keep prose blocks
(standfirst, brief, deks) at their ch limits so lines do not get long.

### M2. Extra-large screens: type and figures do not scale (4K at device scale 1 is tiny)
`xl3840-overview.jpg`, `xl3840-exceptions.jpg`. All tokens are fixed px (body 14, axis 11.5, title 17, hero 54, display
38). At 3840 × 2160 the hero is 1.4 % of the screen width and axis labels are unreadable from a chair. **Fix** in
`tokens.css`: introduce `--scale` (1 by default; `@media (min-width: 1920px)` 1.08; `(min-width: 2560px)` 1.2;
`(min-width: 3200px)` 1.4) and define the type tokens as `calc(<px> * var(--scale))`, or switch the scale to fluid
`clamp()` (for example `--t-display` size `clamp(38px, 1.1vw + 22px, 60px)`, hero `clamp(54px, 1.6vw + 30px, 86px)`,
body `clamp(14px, 0.25vw + 10px, 18px)`, axis `clamp(11.5px, 0.2vw + 8px, 15px)`). `charts/theme.ts` reads sizes at
render time: feed it the same scale so ECharts axis and label fonts follow.

### M3. Extra-large screens: chart heights are fixed pixels
`views/Overview.tsx` line 222 (`height={single !== null ? 340 : 360}`) and every view passes a constant `height` to
`EChart`. Once M1 widens the measure, every time series becomes a thin strip (2,000 × 360 is 5.5:1; the system's rule is
about 3:1 to 2:1). **Fix** in `charts/EChart.tsx` / `charts/TimelineChart.tsx`: derive height from the measured width
(`clamp(min, width / 2.8, max)`, for example `clamp(320, w / 2.8, 600)` for timelines, `w / 2.2` for small charts) or use
CSS `aspect-ratio` on `.chartbox` with a `min-height`; the width hook already exists for the timeline.

### M4. Data health headline "47 failed on the raw files" reads against the hero's 61 of 116
`health-full.jpg`. Hero: "108 of 116 … Raw files 61 → Cleaned 108", so 55 checks fail on the raw files; the per-file
headers say 44 + 1 + 2 + 6 + 0 + 2 + 0 = 55 failed. The headline's 47 is the blocking checks only
(`dq_report.json`: 47 of 90 error-severity checks fail before), which the sentence does not say. **Fix**
`dashboard/src/insights/health.ts` line 72: "Every blocking check now passes; 47 of the 90 failed on the raw files".

### M5. Forecast "Every step adds value": the steps do not subtract
`forecast-full.jpg` (bottom-left module). Displayed WAPEs 51.6 / 38.6 / 31.1 / 26.3 with "value added" +12.9 / +7.5 /
+4.9, while the displayed differences are 13.0 / 7.5 / 4.8; the title "our model sits 2.6 points above the in-hindsight
floor" while the table shows 26.3 and "floor 23.6" (2.7). The hero's "12.3 pts better than seasonal naive" does subtract.
A jury member checking one row loses trust in the whole view. **Fix** `insights/accuracy.ts` (`pts()` at line 264 and
the template at 412–424) and the step table in `views/Forecast.tsx` / `views/g2/parts.tsx`: round each WAPE to one
decimal first, then subtract the rounded values, so every printed difference equals the difference of the printed numbers.

### M6. Single-series Forecast headline picks the weakest benchmark
`f-forecast-series.jpg` (ELA-008 · India). Headline "our model beats seasonal naive by 8.8 points", but the hero ladder
right beside it shows naive 21.9 vs our model 21.5 (0.4 points) and cycle-aware 22.7: for this series seasonal naive is
the worst benchmark. Cherry-picking is the one thing a forecasting jury punishes. **Fix** `insights/accuracy.ts` line
272: compare with the best (lowest-WAPE) benchmark for the selection and name it ("ELA-008 in India: our model edges
naive by 0.4 points"); keep the seasonal-naive sentence only when seasonal naive is the best benchmark.

### M7. Procurement: "overstate by 22 % / 42 %" uses the wrong base
`procurement-full.jpg`. Title "Summed monthly P90s overstate the buffer more the longer the lead time: 22 % at two
months, 42 % at six months". The plotted values are the pooling saving (1 − pooled / summed): at six months summed ≈
188K and pooled ≈ 110K, so the summed figure overstates by about 71 %, not 42 %; at three months the hero's 31 % cut
corresponds to a 45 % overstatement. **Fix** `insights/procurement.ts` line 182: either "Pooling saves more the longer the
lead time: 22 % at two months, 42 % at six" (keeps the numbers) or compute summed / pooled − 1 for "overstate".

### M8. Macro indicator strip gives % changes of quantities that are already rates
`macro-full.jpg` (indicator small multiples). "ISM manufacturing PMI 52.4 to 50.3, −4.0 %", "Auto production, year on
year 2.2 to 2.4, +9.1 %", "Industrial utilisation rate 83.4 to 78.4, −6.0 %". Gate item 19: rate changes in points. "+9.1 %"
on auto production reads as production growing 9 % when its growth rate moves 0.2 points. **Fix** in the strip builder
(`views/g2/macroCharts.ts` / `views/g2/parts.tsx`) and `insights/indicators.ts`: for PMI, YoY % and utilisation %
print "−2.1 pts", "+0.2 pts", "−5.0 pts"; keep % for the level indices. Also unify the unit captions ("In pts" vs "In
points").

### M9. Macro: three different r values for one pair, unlabelled; headline grammar
`macro-full.jpg`. Headline "Vehicle orders leads Electrical Assemblies by two months (r = 0.93)"; lag-profile title "…
at lag 2 in both eras (r = 0.94, then 0.90)"; overlay title "… tracks … at r = 0.87". Each is a different statistic
(full period at the model lag, per era, 12-month growth), but the reader sees three r for one claim. **Fix**
`insights/macro.ts`: name the statistic each time ("r = 0.93 over 2019–26", "0.94 in 2019–22 and 0.90 in 2023–26",
"growth rates correlate at 0.87"); and "Vehicle orders lead …" (or "The new vehicle orders index leads …").

### M10. Macro heatmap: the loudest cells are lag-12 artefacts, not the model's drivers
`macro-full.jpg` (correlation matrix). Colour encodes |r| at "the model's lag for its drivers and at the strongest lag
elsewhere", so the darkest cells are non-drivers at the edge of the search window (Electrical × Utilisation −0.86 lag 12,
Chassis × PMI −0.77 lag 12, Thermal × Vehicle orders −0.79 lag 12), while the drivers are marked only by a 1 px ink
outline that disappears on mid-tone cells. The eye lands on spurious seasonal correlations. **Fix** in
`views/g2/macroCharts.ts`: draw non-driver cells at about 35 % opacity (or hatched / neutral fill with the value in
`--ink-3`), give driver cells a 2 px ink outline, and add "lag 12 = edge of the search window" to the dek.

### M11. Anomaly type tables: two bar scales side by side
`anomalies-full.jpg` and, starkly, `f-anomalies-series.jpg`: "Listed stock-out 5,005" and "Missing row 982" get the same
bar length; for one series "Sign error 1 cell" has the same bar as "Listed stock-out 16 cells". Side-by-side bars invite
comparison; an unshared scale lies. **Fix** `views/Anomalies.tsx` (or the BarTable call in `views/g1/parts.tsx`): pass
one shared `max` (the larger of the two tables' maxima) to both tables.

### M12. Data-error diamonds are drawn 10 px above their value
`anomalies-full.jpg`, `f-anomalies-series.jpg`. `charts/timeline.ts` line 408: `symbolOffset: cls === "data_error" ?
[0, -10] : [0, 0]`. The diamonds float above the line (2021, 2023) and above the bar (Apr 2025), so on a y-axis chart
they read as a different value, and the triangles and diamonds do not line up for the same month. **Fix:** remove the
offset; draw the hollow diamond on the point with a 2 px `--paper` ring (the dataviz overlap spec), and if a triangle
and a diamond share a month, offset one horizontally by 4 px instead of vertically.

### M13. The ERP migration cells are "rebuilt", "fixed" and "could not be recovered"
Overview timeline annotation "ERP migration: 363 cells rebuilt, not zero-filled, Mar–May 2023" (`overview-full.jpg`);
Anomaly chart "Data error fixed: ERP blank, 135 cells in May 2023" and the type table "ERP blank 332" under "Data
errors, fixed" (`anomalies-full.jpg`); Data health "332 could not be recovered … kept out of fitting"
(`health-full.jpg`, `dq_report.json` `N12_erp_units_lost: 332`). Three verbs for one set of cells. **Fix:** one
vocabulary: ERP blanks are "units unknown, kept out of fitting". `charts/timeline.ts` ~line 663 (annotation: split
"N missing rows rebuilt; 332 ERP blanks kept out of fitting"), `insights/anomalies.ts` (class heading and the ERP blank
row must not say "fixed").

### M14. "Repaired" means two numbers
Overview figure "History repaired 6,961 cells, 2.8 % of 245,548 history cells fixed, plus 982 missing rows rebuilt"
vs Data health "every family has 3.1 %–3.3 % of its cells repaired … All 7 families: 3.2 % repaired" (= (6,961 + 982) /
245,548). Same word, 6,961 / 2.8 % in one place and 7,943 / 3.2 % in the other. **Fix** `views/Overview.tsx` line ~271
and `insights/health.ts`: one definition everywhere, for example the Overview figure "7,943 cells repaired, 3.2 %: 6,961
fixed and 982 rebuilt".

### M15. Region accuracy bars do not draw the title's claim
`forecast-full.jpg`. "Middle East & Africa is the hardest region at 34.4 %; every region beats seasonal naive": the bars
show only our model's WAPE; seasonal naive and the floor are numbers in two columns. The comparison the title makes is
not on the chart. **Fix** `views/Forecast.tsx` / `views/g2/parts.tsx`: replace the bar with the dot-range form the
"Errors cancel" module already uses (floor tick in ink, model dot in orange, seasonal-naive ring, on one shared 0–55 %
scale) so "beats seasonal naive" and "close to the floor" are visible per row.

### M16. Stock-outs leads with a chart that cannot show its subject
`stockouts-full.jpg`. The first chart is the same unconstrained-demand timeline used on Overview, Explorer, Anomalies,
Forecast and What-if (0–200K scale); the lost-sales gap it is about (0.9 % of demand) is a 2-pixel sliver except in
2021–22. The real evidence (monthly lost and back-ordered bars, "Oct 2021: 7,331 lost") sits second. **Fix**
`views/Stockouts.tsx`: lead with the lost / back-ordered bars at full width (or plot the gap as % of demand), then the
year / family table, and drop the full-range timeline or move it to a compact "context" position.

### M17. Explorer hero: an unlabelled strip of a different measure under "1.71M units"
`explorer-full.jpg`, `f-explorer-fam.jpg`. Under the units hero sits a stacked strip of series counts by ordering cycle
(Monthly 1,539, Monthly one shutdown 775, Every second month 297, Quarterly 242, Two months in three 230, No history yet
10), in six warm greys of which the last three are hard to tell apart. A reader takes it as the composition of 1.71M
units. **Fix** `views/Explorer.tsx`: give it a caption ("3,093 series by ordering cycle") or move it beside the zero-month
module where cycles are the subject; fold to four classes with direct labels.

### M18. Explorer seasonality axis: colliding, irregular ticks
`f-explorer-fam.jpg` ("1.6× / 1.5×" and "0.6× / 0.5×" overlap), `explorer-full.jpg` (1.5, 1.2, 0.9, 0.6, then 0.4),
`f-explorer-series.jpg` (2.4, 2.0, 1.5 …). Cause: `views/Explorer.tsx` ~402–405 sets `min: lo, max: hi` to unrounded
values, so ECharts prints the extremes as extra ticks. **Fix:** snap `lo` / `hi` to the tick interval (floor / ceil to
0.25 or 0.5), or set `axisLabel.showMinLabel / showMaxLabel: false`. Same check for the What-if delta bars (ticks at
1.25K steps, `whatif-full.jpg`).

### M19. Forecast horizon chart: end labels on top of each other
`forecast-full.jpg` ("Our model" over "In-hindsight floor"), `f-forecast-series.jpg` ("Naive", "Our model" and
"In-hindsight floor" stacked into one smudge). **Fix** `views/g2/forecastCharts.ts`: enable `labelLayout: { moveOverlap:
'shiftY' }` on the end labels or place them with the same collision routine the timeline annotations use, with a
leader line when shifted.

### M20. Dark theme heatmaps: chalk text on the brightest cells
`dark-forecast.jpg` (bias heatmap: "−3.3 %" on light jade, "+2.9 %" on light plum); the macro matrix uses the same ramp.
The most important cells, the extremes, are the least legible (well under 4.5:1). **Fix** in the heatmap label formatter
(`views/g2/forecastCharts.ts`, `views/g2/macroCharts.ts`): choose ink or chalk per cell by the contrast of the cell
colour (the system already has `--on-orange`-style tokens; compute luminance and pick the higher-contrast text).

### M21. Exception rows truncate the reason mid-number
`exceptions-full.jpg`, `overview-full.jpg` (top-five list), and at 1920 px with 500 px empty to the right
(`xl1920-exceptions.jpg`): "pre-loss level 110.8...", "no history, so the forecast...", "(17 silent mont...". The
"why" is the point of a triage row. **Fix** `views/Exceptions.tsx` / `views/g3/inbox.css` and the reason templates in
`insights/inbox.ts`: put the figure first and shorten ("Silent 17 months, last order May 2025 · pre-loss 111 a month"),
allow two full lines, and use "…" (not "..."); on the Overview list show the short form.

---

## Minor

- **m1. Rounding disagreements** (gate 20). Explorer "Brake & Safety Systems leads with 19 %" vs the row's 18.8 %, and
  "ELA-008 leads with 5 %" vs 5.2 % (`explorer-full.jpg`, `f-explorer-fam.jpg`); Stock-outs year rows sum to 106,927 vs
  106,925; inbox cause tabs sum to $66.76M vs $66.78M; Procurement "89.9 % stayed at or below their P90" vs Forecast
  calibration "10.2 % above" (89.8 %); Overview "0.90 % of unconstrained demand" next to the brief's "+0.91 % above
  shipments". Fix: titles use the row's precision; add "rounded" notes under summed columns; take one variable per fact.
- **m2.** Stock-outs standfirst "since 2023 losses average 3,908 units a year" averages 2023–2025 only (with 2026 to date
  it is 3,861). Say "2023–2025 averaged 3,908 a year" (`insights/stockouts.ts`).
- **m3.** Lifecycle handover multiples use independent y-scales (600 / 500 / 800) without saying so; add "each on its own
  scale" to the dek or share the scale (`views/g2/lifecycleCharts.ts`).
- **m4.** Timeline keys list marks absent from the visible range ("Shipped, where lower", "Lost to stock-outs", "Months
  with rebuilt cells" on Since 2024 / Forecast window), and the Explorer key wraps with an orphan divider. Filter
  `timelineKey` to the marks present in the range.
- **m5.** What-if: the scenario line has no end label (design system §2.4 says the gap is labelled at the end); x labels
  "Nov '26" break the "Nov 2026" rule.
- **m6.** Number formats: "$82.00M" / "$56.20M" (two decimals elsewhere one), "1,536.0 units lost" (Explorer series
  card), "Nov '26 – May '28" (case file), hero WAPE bars without "%".
- **m7.** Terminology and jargon on screen: "noise floor" (Overview) vs "in-hindsight floor" (Forecast) for the same
  23.6 %; "|Impact|, units", "demand = Requested_Units", "ADI 1.00, CV² 0.16", "Every second month B0".
- **m8.** Seasonality "Average" is dashed; in this system dashes mean "another forecast". Use a solid 1.5 px `--ink-3`.
- **m9.** Macro lag profile: the two era lines are both grey hairlines distinguishable only by a slightly different grey;
  label them at their ends.
- **m10.** Jade vs rose read as good vs bad (anomaly hero bar, EV vs ICE chart); acknowledged in gate note N5. Consider
  ink vs `--ink-4` for EV / ICE with direct labels.
- **m11.** Bias heatmap title picks Electrical × Middle East & Africa although Electrical × India ties at −3.3 %; "within
  ±5 %" is loose when the maximum is 3.3 %.
- **m12.** Horizon title template says "Error grows" for a non-monotonic curve (single series peaks at 4–6 months); check
  monotonicity in `insights/accuracy.ts`.
- **m13.** Stock-outs back-order table highlights "Tooling breakdown" in ink though four reasons tie at 39 %; the top-10
  ledger bars grow leftwards from a right baseline.
- **m14.** Dark theme: the rail (`#111`) and the page (`#0A0A0A`) merge, so the black-band structure disappears; give the
  rail a `--band-rule` hairline or a slightly lighter band (`dark-overview.jpg`).
- **m15.** Rows end level: Overview brief ends about 160 px above the right column; Data health and Data download already
  noted F6 in the gate file.
- **m16.** Explorer / Forecast: "Orion Driveline shutdown" wraps into 3–5 lines inside the narrow forecast zone; shorten
  ("Orion shutdown, −5.4K") or place it left of the dip with a leader.
- **m17.** Macro: the headline is about one pair while the hero is "5 of 7 families"; let the headline carry the hero's
  finding.
- **m18.** Extra-large: grids never gain columns (`.cols-*` only collapse); at ≥ 1920 px the Overview brief / region /
  top-five could sit in three columns and the inbox list could widen its reason column.
- **m19.** Extra-large: the rail stays 232 px at 3840 px (6 % of the width, small type); scale it with the type (M2).
- **m20.** What-if: the indicator menu says "3,753 SKU links" while the figure says "1,548 of 3,068 series respond";
  two reach counts in different units with no bridge.

---

## Gate claims checked

`docs/design_gate_results.md` marks every view P on item 20 "Facts agree", item 26 "round ticks", item 21 "rows end level"
(except DH / DD), dashboard-designer item 14 "no legend hunting" and UI/UX item 18 "chart form fits data". On this build:

- Item 20 fails on EI (C1, C2), LC (C3), AN (C4), FA (M5), DH (M4, M14), PP (m1), SO (m1).
- Item 26 fails on EX (M18) and WI (non-round 1.25K ticks).
- UI/UX item 18 is weak on FA (M15), SO (M16) and AN (M11, M12).
- Item 19 "Deltas say against what" fails on MA (M8) and PP (M7).
- Dark-mode contrast (UI/UX 1, designer 16) fails on the heatmap extremes (M20).
- UI/UX item 12 and designer item 15 cover narrow screens only; nothing covers ≥ 1920 px (M1–M3).

---

## Findings (JSON)

```json
[
  {"view": "Exception inbox", "problem": "Headline '285 series need a planner's judgement this cycle' while the cause tab says 286 cases, the case file 'Case 1 of 286', the rail badge 286 and the Overview brief '286 exceptions' (exceptions-full.jpg). One series has two causes but nothing says so.", "fix": "dashboard/src/insights/inbox.ts headline template (~lines 110-118): count the same variable as the tabs ('286 cases need a planner's judgement') or say '286 cases on 285 series'; one count used on rail, brief, tabs and headline.", "severity": "critical"},
  {"view": "Exception inbox / case file", "problem": "Case headline 'Quantum Drive Systems has placed no PTC-002 order since May 2025' contradicts the row and the case's own 'Why it is flagged' ('No orders since Jun 2025 (17 silent months)') and the chart note 'Last order May 2025' (exceptions-full.jpg).", "fix": "dashboard/src/insights/inbox.ts line 217: '... has placed no PTC-002 order after May 2025' (or 'last ordered ... in May 2025'); make the row reason template use the last-order month too ('Last order May 2025; silent for 17 months').", "severity": "critical"},
  {"view": "Lifecycle", "problem": "Title 'Every run-off reaches zero in its EOL month' and standfirst 'run off to zero in their EOL months (May 2027, Aug 2027, Dec 2027)', but the bundle forecasts 178 / 119 / 185 units in those EOL months and zero only from the month after; the charts draw the EOL square above zero (lifecycle-full.jpg).", "fix": "dashboard/src/insights/lifecycle.ts (~lines 179 and 231): 'Every run-off sells its last units in its EOL month and is zero from the month after (Jun 2027, Sep 2027, Jan 2028)'.", "severity": "critical"},
  {"view": "Anomaly monitor (single series)", "problem": "Standfirst says '60 more flags cover whole episodes' while the type tables say '3 episodes' and the register says '21 flags from 3 causes' for ELA-008 India (f-anomalies-series.jpg).", "fix": "dashboard/src/insights/anomalies.ts line 214: compute f.episodes from the same register rows the type tables and register use for the selection, or include those file-wide episodes in the register and name them ('60 file-wide episodes also touch this series').", "severity": "critical"},
  {"view": "All views, extra-large screens", "problem": "Content is a fixed 1,128 px column pinned to the left (.page max-width, no margin auto, no min-width breakpoints): 27% of the width empty at 1920 px, 45% at 2560 px, 70% at 3840 px; masthead and filter bar span the full width so right-hand controls sit far from the content (xl1920-overview.jpg, xl2560-overview.jpg, xl3840-overview.jpg).", "fix": "styles/tokens.css: grow --measure at breakpoints (>=1600px 1320px; >=1920px 1520px with --rail-w 256px and --gutter 48px; >=2560px 1840px with --rail-w 280px); styles/shell.css: give .page, the masthead inner row and .filterbar the same max-width so controls end at the content edge; keep prose blocks at their ch limits.", "severity": "major"},
  {"view": "All views, extra-large screens", "problem": "Type, figures and chart fonts are fixed px, so at 3840x2160 (scale 1) the hero, body and axis text are tiny and the rail is 6% of the width (xl3840-overview.jpg, xl3840-exceptions.jpg).", "fix": "styles/tokens.css: add a --scale variable stepped by min-width breakpoints (1.08 at 1920, 1.2 at 2560, 1.4 at 3200) or fluid clamp() sizes for --t-display, --t-hero, --t-figure, --t-title, --t-body, --t-axis; have charts/theme.ts read the same scale for ECharts fonts.", "severity": "major"},
  {"view": "All views, extra-large screens", "problem": "Chart heights are constants (e.g. Overview TimelineChart height 360), so once the measure grows the time series become thin wide strips far beyond the 2:1-3:1 aspect rule.", "fix": "charts/EChart.tsx and charts/TimelineChart.tsx: derive height from measured width (clamp(320, width/2.8, 600) for timelines, width/2.2 for small charts) or use CSS aspect-ratio with a min-height on .chartbox.", "severity": "major"},
  {"view": "Data health", "problem": "Headline 'Every blocking check now passes; 47 failed on the raw files' sits next to a hero showing 61 of 116 passing on the raw files (55 failing) and per-file headers that sum to 55 failures; 47 is the blocking subset, which the sentence does not say (health-full.jpg).", "fix": "dashboard/src/insights/health.ts line 72: 'Every blocking check now passes; 47 of the 90 failed on the raw files'.", "severity": "major"},
  {"view": "Forecast & accuracy", "problem": "'Every step adds value' table: value-added +12.9 / +4.9 while the printed WAPEs differ by 13.0 / 4.8; title says our model is 2.6 points above the floor while the table shows 26.3 and 23.6 (2.7) (forecast-full.jpg).", "fix": "insights/accuracy.ts (pts() and the template at ~412-424) and the step table in views/Forecast.tsx or views/g2/parts.tsx: round each WAPE to one decimal first and subtract the rounded values.", "severity": "major"},
  {"view": "Forecast & accuracy (single series)", "problem": "Headline 'ELA-008 in India: our model beats seasonal naive by 8.8 points' while the hero ladder shows naive at 21.9 vs our model 21.5 (0.4 points); seasonal naive is the worst benchmark for this series, so the headline cherry-picks (f-forecast-series.jpg).", "fix": "insights/accuracy.ts line 272: compare against the lowest-WAPE benchmark for the selection and name it; keep the seasonal-naive wording only when it is the best benchmark.", "severity": "major"},
  {"view": "Procurement plan", "problem": "Title 'Summed monthly P90s overstate the buffer ... 22% at two months, 42% at six months' prints the pooling saving (1 - pooled/summed); the overstatement at six months is about 71% (procurement-full.jpg).", "fix": "insights/procurement.ts line 182: 'Pooling saves more the longer the lead time: 22% at two months, 42% at six', or compute summed/pooled - 1 for 'overstate'.", "severity": "major"},
  {"view": "Macro lead / lag", "problem": "Indicator strip prints % changes of rates: PMI 52.4 to 50.3 '-4.0%', auto production YoY 2.2 to 2.4 '+9.1%', utilisation 83.4 to 78.4 '-6.0%'; gate 19 requires points for rates, and '+9.1%' reads as production growth (macro-full.jpg).", "fix": "views/g2/macroCharts.ts / views/g2/parts.tsx and insights/indicators.ts: print point changes (-2.1 pts, +0.2 pts, -5.0 pts) for PMI, YoY % and utilisation %; keep % for level indices; unify 'In pts' / 'In points'.", "severity": "major"},
  {"view": "Macro lead / lag", "problem": "Three different r values for vehicle orders -> Electrical Assemblies at lag 2 (0.93 headline, 0.94 / 0.90 per era, 0.87 growth) without naming the statistic; headline grammar 'Vehicle orders leads' (macro-full.jpg).", "fix": "insights/macro.ts: name each statistic ('r = 0.93 over 2019-26', '0.94 in 2019-22 and 0.90 in 2023-26', 'growth rates correlate at 0.87'); 'Vehicle orders lead ...'.", "severity": "major"},
  {"view": "Macro lead / lag", "problem": "Correlation matrix colours non-driver cells at their strongest lag, so the darkest cells are lag-12 artefacts at the edge of the search window (-0.86, -0.79, -0.77) while the model's drivers are marked only by a thin ink outline (macro-full.jpg).", "fix": "views/g2/macroCharts.ts: render non-driver cells at ~35% opacity or neutral fill with --ink-3 text, give driver cells a 2px ink outline, and note 'lag 12 = edge of the search window' in the dek.", "severity": "major"},
  {"view": "Anomaly monitor", "problem": "The two type tables (real events vs data errors) each use their own bar scale: 5,005 and 982 cells get the same bar; for one series 1 sign-error cell equals 16 stock-out cells (anomalies-full.jpg, f-anomalies-series.jpg).", "fix": "views/Anomalies.tsx (or the BarTable call in views/g1/parts.tsx): pass one shared max to both tables.", "severity": "major"},
  {"view": "Anomaly monitor / shared timeline", "problem": "Data-error diamonds are offset 10px above their value (charts/timeline.ts line 408 symbolOffset [0,-10]); they float above the line or bar and read as a different value (anomalies-full.jpg, f-anomalies-series.jpg).", "fix": "charts/timeline.ts: remove the vertical offset, draw the hollow diamond on the point with a 2px --paper ring; if it collides with a triangle offset horizontally by 4px.", "severity": "major"},
  {"view": "Overview / Anomaly monitor / Data health", "problem": "The ERP-migration cells are '363 cells rebuilt, not zero-filled' (Overview annotation), 'Data error fixed: ERP blank' with 332 cells under 'Data errors, fixed' (Anomaly monitor), and '332 could not be recovered, kept out of fitting' (Data health).", "fix": "One vocabulary: ERP blanks are 'units unknown, kept out of fitting'. charts/timeline.ts ~line 663 (split missing rows rebuilt from ERP blanks) and insights/anomalies.ts (ERP blank must not be labelled 'fixed').", "severity": "major"},
  {"view": "Overview / Data health", "problem": "'Repaired' is 6,961 cells / 2.8% on Overview ('History repaired') and 7,943 cells / 3.2% on Data health ('3.2% repaired' = fixed + rebuilt).", "fix": "views/Overview.tsx (~line 271) and insights/health.ts: one definition everywhere, e.g. Overview figure '7,943 cells repaired, 3.2%: 6,961 fixed and 982 rebuilt'.", "severity": "major"},
  {"view": "Forecast & accuracy", "problem": "Region accuracy module: bars show only our model's WAPE, so the title's claims ('every region beats seasonal naive', near the floor) are numbers in columns, not on the chart (forecast-full.jpg).", "fix": "views/Forecast.tsx / views/g2/parts.tsx: use the dot-range form of the 'Errors cancel' module per row (floor tick, orange model dot, seasonal-naive ring, shared 0-55% scale).", "severity": "major"},
  {"view": "Stock-outs & lost sales", "problem": "Lead chart is the same full-range demand timeline shown on five other views; the 0.9% lost gap it is about is a 2px sliver outside 2021-22, while the evidence chart (monthly lost and back-ordered bars) sits second (stockouts-full.jpg).", "fix": "views/Stockouts.tsx: lead with the lost / back-ordered monthly bars at full width (or the gap as % of demand), demote or drop the full-range timeline.", "severity": "major"},
  {"view": "Demand explorer", "problem": "Under the hero '1.71M units' sits an unlabelled stacked strip of series counts by ordering cycle (a different measure) in six warm greys, the last three nearly indistinguishable (explorer-full.jpg, f-explorer-fam.jpg).", "fix": "views/Explorer.tsx: caption it '3,093 series by ordering cycle' or move it to the zero-month module; fold to four classes with direct labels.", "severity": "major"},
  {"view": "Demand explorer", "problem": "Seasonality y-axis prints unrounded min/max as extra ticks: '1.6x/1.5x' and '0.6x/0.5x' overlap (family filter), 1.5/1.2/0.9/0.6/0.4 (all), 2.4/2.0/1.5 (series) (f-explorer-fam.jpg, explorer-full.jpg, f-explorer-series.jpg).", "fix": "views/Explorer.tsx ~lines 402-405: snap lo/hi to the tick interval (floor/ceil to 0.25 or 0.5) or set axisLabel.showMinLabel/showMaxLabel false; apply the same check to the What-if delta bars (1.25K steps).", "severity": "major"},
  {"view": "Forecast & accuracy", "problem": "Horizon chart end labels collide: 'Our model' over 'In-hindsight floor'; for one series 'Naive', 'Our model' and 'In-hindsight floor' stack into one smudge (forecast-full.jpg, f-forecast-series.jpg).", "fix": "views/g2/forecastCharts.ts: labelLayout { moveOverlap: 'shiftY' } on end labels, or reuse the timeline annotation collision routine with leader lines.", "severity": "major"},
  {"view": "Forecast & accuracy / Macro (dark theme)", "problem": "Diverging heatmaps in dark print chalk text on the brightest cells (-3.3% on light jade, +2.9% on light plum), well under 4.5:1, so the extremes are the least legible (dark-forecast.jpg).", "fix": "Heatmap label formatter in views/g2/forecastCharts.ts and views/g2/macroCharts.ts: pick ink or chalk per cell by computed contrast with the cell colour.", "severity": "major"},
  {"view": "Exception inbox / Overview top five", "problem": "Reason text is truncated mid-number ('pre-loss level 110.8...', 'no history, so the forecast...', '(17 silent mont...'), even at 1920px with 500px of empty space (exceptions-full.jpg, overview-full.jpg, xl1920-exceptions.jpg).", "fix": "insights/inbox.ts reason templates: figure first and shorter ('Silent 17 months, last order May 2025; pre-loss 111 a month'); views/g3/inbox.css: allow two full lines; use the ellipsis character.", "severity": "major"},
  {"view": "Explorer / Stock-outs / Exception inbox / Procurement / Overview", "problem": "Rounding disagreements: '19%' title vs 18.8% row and '5%' vs 5.2%; year rows sum to 106,927 vs 106,925; cause tabs sum to $66.76M vs $66.78M; procurement '89.9% at or below P90' vs forecast '10.2% above'; '0.90% of unconstrained' vs '+0.91% above shipments'.", "fix": "Titles use the row precision (insights/explorer.ts); add a 'rounded' note under summed columns; take one variable per fact (insights/procurement.ts vs insights/accuracy.ts).", "severity": "minor"},
  {"view": "Stock-outs & lost sales", "problem": "'Since 2023 losses average 3,908 units a year' averages 2023-2025 only; the table's 2023-2026 rows average 3,861.", "fix": "insights/stockouts.ts: '2023-2025 averaged 3,908 a year'.", "severity": "minor"},
  {"view": "Lifecycle", "problem": "Handover small multiples use independent y-scales (600 / 500 / 800) without saying so (lifecycle-full.jpg).", "fix": "views/g2/lifecycleCharts.ts: share the scale or add 'each on its own scale' to the dek.", "severity": "minor"},
  {"view": "Shared timeline key", "problem": "Keys list marks absent from the visible range (shipped, lost, rebuilt on Since 2024 / Forecast window) and the Explorer key wraps with an orphan divider (forecast-full.jpg, explorer-full.jpg, whatif-full.jpg).", "fix": "components/Module.tsx timelineKey: include only marks present in the range; keep the divider with its group when wrapping.", "severity": "minor"},
  {"view": "What-if scenarios", "problem": "Scenario line has no end label (design system 2.4 requires the gap labelled at the end); x labels 'Nov '26' break the 'Nov 2026' rule (whatif-full.jpg).", "fix": "views/WhatIf.tsx / charts/timeline.ts: end label 'Scenario 149K, -2.3%' under the base label; month labels via the shared month formatter.", "severity": "minor"},
  {"view": "Several", "problem": "Number formats: '$82.00M' / '$56.20M' two decimals, '1,536.0 units lost' (Explorer series card), 'Nov '26 - May '28' (case file), WAPE hero bars without '%'.", "fix": "Route through the shared fmt helpers: one decimal on $M, integers for units, 'Nov 2026', '%' on WAPE values.", "severity": "minor"},
  {"view": "Several", "problem": "Two names for the 23.6% ('noise floor' on Overview, 'in-hindsight floor' on Forecast) and pipeline jargon on screen: '|Impact|, units', 'demand = Requested_Units', 'ADI 1.00, CV2 0.16', 'Every second month B0'.", "fix": "Pick 'in-hindsight floor' everywhere (insights/overview.ts, briefing.tsx); replace jargon with plain words or move it to the (i) popover.", "severity": "minor"},
  {"view": "Demand explorer", "problem": "Seasonality 'Average' line is dashed; dashes are reserved for 'another forecast' in this system.", "fix": "views/Explorer.tsx: solid 1.5px --ink-3 for the average.", "severity": "minor"},
  {"view": "Macro lead / lag", "problem": "Lag profile: the two era lines are both grey hairlines distinguishable only by a slightly different grey (macro-full.jpg).", "fix": "views/g2/macroCharts.ts: direct end labels '2019-22' and '2023-26'.", "severity": "minor"},
  {"view": "Anomaly monitor / Macro", "problem": "Jade vs rose (anomaly hero bar, EV vs ICE lines) read as good vs bad at a glance (gate note N5).", "fix": "Consider ink vs --ink-4 with direct labels for EV / ICE; keep shapes on anomaly classes.", "severity": "minor"},
  {"view": "Forecast & accuracy", "problem": "Bias title picks Electrical x Middle East & Africa although Electrical x India ties at -3.3%; 'within +/-5%' is loose when the maximum is 3.3%.", "fix": "insights/accuracy.ts: mention ties ('Electrical Assemblies in India and Middle East & Africa, -3.3%') and print the actual bound.", "severity": "minor"},
  {"view": "Forecast & accuracy", "problem": "Horizon title says 'Error grows' for a non-monotonic curve (single series peaks at 4-6 months) (f-forecast-series.jpg).", "fix": "insights/accuracy.ts: check monotonicity; otherwise 'Error peaks at 4-6 months at 25.6%'.", "severity": "minor"},
  {"view": "Stock-outs & lost sales", "problem": "Back-order table highlights 'Tooling breakdown' in ink though four reasons tie at 39%; top-10 ledger bars grow leftwards from a right baseline (stockouts-full.jpg).", "fix": "views/Stockouts.tsx: no highlight on ties; left-anchored bars.", "severity": "minor"},
  {"view": "Shell (dark theme)", "problem": "Rail (#111) and page (#0A0A0A) merge, so the black-band structure disappears (dark-overview.jpg).", "fix": "styles/shell.css dark: a --band-rule hairline on the rail edge or a slightly lighter band.", "severity": "minor"},
  {"view": "Overview", "problem": "The brief column ends about 160px above the right column (gate item 21).", "fix": "views/Overview.tsx: move the colophon or the top-five 'View all' into the shorter column, or align module ends.", "severity": "minor"},
  {"view": "Demand explorer / Forecast", "problem": "'Orion Driveline shutdown' annotation wraps into 3-5 lines inside the narrow forecast zone (f-explorer-fam.jpg, explorer-full.jpg).", "fix": "charts/timeline.ts annotation: short form 'Orion shutdown, -5.4K' or place left of the dip with a leader.", "severity": "minor"},
  {"view": "Macro lead / lag", "problem": "Headline is about one pair while the hero is '5 of 7 families'; the two compete.", "fix": "insights/macro.ts: headline carries the hero's finding; the pair becomes the first module title.", "severity": "minor"},
  {"view": "All views, extra-large screens", "problem": "Grids only collapse, never gain columns; at >=1920px the Overview brief / region / top-five and the inbox list could use the width.", "fix": "styles/shell.css: @media (min-width:1920px) three-column variant for the Overview lower band; inbox list column flexible.", "severity": "minor"},
  {"view": "Shell, extra-large screens", "problem": "Rail stays 232px with 14px type at 3840px (6% of the width).", "fix": "Scale --rail-w and rail type with the --scale variable from the type fix.", "severity": "minor"},
  {"view": "What-if scenarios", "problem": "Indicator menu says '3,753 SKU links' while the figure says '1,548 of 3,068 series respond'; two reach counts in different units with no bridge.", "fix": "insights/whatif.ts: one unit (series) in both places, or explain 'links = SKU x channel x lag'.", "severity": "minor"}
]
```
