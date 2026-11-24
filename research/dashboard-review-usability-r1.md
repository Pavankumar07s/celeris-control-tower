# Dashboard review, round 1: usability, planner workflow and accessibility

**Critic:** usability lens (Nielsen heuristics, six task walkthroughs, accessibility, responsiveness from 375 px to 4K,
requirement coverage, figures that must agree). **Build reviewed:** a private snapshot of `dashboard/dist` (bundle built
25 Nov 2026 00:29), served on port 8262. **Skills applied:** `ui-ux-pro-max` first, then `dashboard-designer`; then the
18-point UI/UX Pro Max gate, the 16-point dashboard-designer gate with items 17–28, the 40-item QA list of
`research/dashboard-design-principles.md` §12 and the 30-item list of `research/dashboard-design-skills.md` §6.
**Screenshots:** `research/scratch/dash-critique-usability-r1/` (file names cited below).

**How it was tested.** Not only static pages. A small Chrome DevTools Protocol driver (Node 24, headless Chrome, one
instance at a time) loaded every state from a fresh page load, pressed real keys (Tab, Shift+Tab, arrows, Enter,
Escape), moved the mouse over charts, and measured the live DOM: the computed colour and effective background of every
visible text node (WCAG contrast), the focused element and its outline after each Tab, horizontal overflow, and where
the headline, hero and first chart sit at each viewport. Around 60 URL-hash states were exercised: the five filters
and their drill-down, `m=usd`, `lens=latent`, range presets (`tl`), breakdown tabs (`by`), the time-machine origins
(`origin=2021-10`), the X-ray month (`xr`), what-if presets and custom scenarios (`wi/ws/wf/wn/we`), a single SKU ×
region series, the lineage drawer (`cell=`), inbox cases (`case=`, `cause=`), empty and invalid selections, and the
procurement controls (`sl`, `lt`).

**Stale numbers.** Model figures on screen (2,793,254 units, 26.3 % WAPE) come from the previous model version and are
being refreshed; they are not reported as defects. Only numbers that disagree with another number of the same build,
and wording that contradicts itself, are.

---

## 1. Verdict and scores

**Overall: 7.5 / 10. Not ship-ready (0 critical, 8 major, 27 minor).**

This is a strong planning tool. Every required view and all seven optional views exist and work, the URL really is the
state (each state above reproduced from a fresh load), the drill-down from family to customer is the best part of the
app, and text contrast passes WCAG AA everywhere it applies (measured below). What holds it back is consistency
rather than missing features. A judge who reads closely will find:

- a headline that disagrees with its own tabs (285 series vs 286 cases);
- a case file that contradicts its own row (May vs June 2025);
- a chart title that contradicts its own hero figure (Procurement);
- a hero figure whose bar is in a different unit from its number (Demand explorer).

Keyboard users will hit a combobox whose highlight and focus ring point at different options, and a modal drawer that
focus walks out of. On screens of 1920 px and wider, the content stays in a 1208 px column pinned to the left, and up
to two thirds of the screen is empty.

| View | Score | One-line reason |
|---|---|---|
| Executive overview | 8.5 | Clear in 5 seconds; units ↔ USD and range presets work; the "three things to worry about" sit below the fold inside a seven-item brief |
| Data health | 8.0 | Complete and auditable; long (4,159 px); ignores the filters in most modules without saying so; three different "repair" counts |
| Demand explorer | 8.5 | Excellent drill-down with breadcrumb and series card; the hero's bar counts series under a figure in units |
| Anomaly monitor | 7.5 | Type / reason / action present, but reason and action are cut to two lines and the full text is hover-only; 984 pages |
| Stock-outs & lost sales | 8.0 | Clear story; the year table sums to 106,927, not the 106,925 shown above it |
| Macro lead / lag | 7.5 | Rich; rate indicators show % changes of percentages; three r values for one relationship |
| Forecast & accuracy | 8.0 | Every must-show item plus a working time machine; rounding gaps in the value-added chain; one module title ignores the filter |
| Lifecycle | 8.5 | Clear handovers and rule-5 checks; good empty state under a filter |
| What-if | 8.5 | PMI −3 is the default, presets apply in one click, the state is in the URL; "3,068 series" vs "3,093 series in view" |
| Exception inbox | 7.0 | Strong triage layout; the headline count and the case wording contradict the rest of the view |
| Procurement plan | 7.5 | Good controls-as-a-sentence; the chart title's "overstate by 42 %" contradicts the hero's 46 % |
| Data download | 8.5 | Hashes re-verified in the browser (23 of 23); CSVs follow the filters |

---

## 2. Requirement coverage (problem statement §5)

### 2.1 Required views: "must show" items

| View | Must-show item | Present? | Where (state verified) |
|---|---|---|---|
| Executive overview | Units trend, history into forecast, one timeline | Yes | Main timeline, ink history, orange forecast with P10–P90, "Oct 2026 last actual" rule (`01-overview-1440.jpg`) |
| Executive overview | Revenue trend on the same timeline | Yes (toggle) | `#/overview?m=usd` turns the same timeline, hero and tables into USD ("Revenue grows 10.6 %…", `s-ov-usd.jpg`); the figure strip carries a revenue sparkline Jan 2019 – May 2028. Units and revenue are never on screen at once |
| Executive overview | Mix by family, region and channel | Yes | "Every region grows…" table with Region / Family / Channel tabs (share of next 12 months and change); family small multiples |
| Executive overview | Headline 19-month forecast | Yes | Hero "2.79M units", P10–P90 2.71M–2.88M, against the last 19 months |
| Data health | Issues by type and file | Yes | "90 % of corrected cells…" rule ledger grouped by file with a quality dimension; checks ledger with a file filter |
| Data health | Rows affected | Yes | Rows / Cells columns; the row bridge 248,248 → 245,548 |
| Data health | Before vs after cleaning | Yes | Hero "61 → 108 of 116 checks"; checks ledger "On raw files / After cleaning"; row bridge |
| Demand explorer | Drill family → SKU → region → customer | Yes | Navigator plus breadcrumb, verified `fam=HYD` → `sku=HYD-004` → `reg=Europe` → customer list "Solaris Automotive… pick one" (`s-ex-series.jpg`) |
| Demand explorer | Seasonality | Yes | Seasonal profile by year |
| Demand explorer | Zero months | Yes | Zero-month calendar; "All 31 zero months are scheduled off-months"; a month click opens its lineage ("Scheduled zero: an off-month of the ordering cycle", `s-lineage.jpg`) |
| Demand explorer | Lifecycle | Yes | SKU lifecycle bar (aggregate); series card with lifecycle, customers over time and cycle (single series) |
| Anomaly monitor | Flagged points on the time series | Yes, partly | At aggregate level only months where flags cluster are marked; every flag shows only once one SKU × region is picked (the dek says so) |
| Anomaly monitor | Type, reason and action | Yes, partly | Register columns Type / Reason / Action. Reason and action are clamped to two lines; the full text is only in a hover `title` (finding M7) |
| Forecast & accuracy | Forecast vs history | Yes | Shared timeline (default "Since 2024"); time machine replays five origins (`s-fc-origin.jpg`) |
| Forecast & accuracy | Backtest WAPE and bias by family and region | Yes | Table with Family / Region / Channel tabs (WAPE, seasonal naive, floor, bias); bias heatmap family × region |
| Forecast & accuracy | WAPE and bias by horizon | Yes | "Error grows from 24.6 % 1 month ahead to 26.6 % at 19 months", WAPE / Bias toggle |

**Result: 16 of 16 present.** Two are partial: anomaly reason and action are truncated, and units and revenue are
shown through a toggle rather than together.

### 2.2 Optional views

| Optional view | Exists | Works (states exercised) |
|---|---|---|
| Macro lead / lag heatmap | Yes | Correlation matrix; per-family lag profile by era; reacts to `fam=HYD` ("PMI leads Hydraulic Systems by three months") |
| What-if (e.g. PMI −3) | Yes | Opens on PMI −3; the other presets and a custom `wi/ws/wf/wn` and `we=1` recompute and stay in the URL; the latent lens shows a notice |
| Procurement plan from P90 | Yes | `sl=0.95&lt=6` recomputes ("Pooling 6 months cuts the P95 safety stock by 43 %"); `m=usd` works |
| Lifecycle (EOL and launches) | Yes | Gantt, handover panels, rule-5 checks; filtered empty state is designed |
| Stock-outs and lost sales | Yes | Filters and tabs work ("Stock-outs hid 884 units… for Hydraulic Systems in Europe") |
| Exception list for planners | Yes | Tabs, ledger, case file, status and notes, CSV with status and note |
| Data download | Yes | 23 of 23 SHA-256 checks match in the browser; extracts follow the filters ("1,463 forecast rows… for Hydraulic Systems in Europe") |

**Result: 7 of 7 exist and work.**

---

## 3. Task walkthroughs

1. **An executive wants the 19-month outlook and the three things to worry about.** The outlook takes about 5 seconds:
   headline, hero 2.79M with its P10–P90 strip, and the timeline at 1440 × 900 (`01-overview-1440.jpg`). The worries
   do not. They are spread over a seven-item brief that starts at about y = 1,150 px (Risk: Orion shutdown; Act: 286
   exceptions, $66.8M) and over a "Five series hold $9.4M" list. Nothing on the first screen says "watch these three".
   *Pass with friction* (finding m1).
2. **A planner drills family → SKU → region → customer and asks why a month is zero.** Excellent. The navigator
   re-ranks at each level, the breadcrumb reads "All / Hydraulic Systems / HYD-004 / Europe", and the single-series
   headline answers the question ("HYD-004 in Europe orders two months in every three… 31 of 94 months were zero, all
   scheduled off-months"). A month click opens the lineage drawer with the flag text. *Pass.* Friction: the hero bar
   (M8), and "1 fell on an order month, most of them in Apr 2020" at SKU level (m14).
3. **A planner triages the exception inbox.** The layout is right (cause tabs → ranked ledger → docked case file →
   "Resolve, next case"). Rows are focusable and Enter opens a case. But the first thing read is "285 series" over tabs
   saying "286 cases" (M1), and the case title says "since May 2025" over a reason saying "since Jun 2025" (M2).
   Changing a filter with a case open keeps it docked, with a kicker that reads "Case outside the filters"
   (`x-stale-case.jpg`); that is honest but leaves an irrelevant case open. *Pass with errors.*
4. **An analyst checks backtest accuracy for one family and region.** `#/forecast?fam=HYD&reg=Europe` gives
   "Hydraulic Systems in Europe: our model beats seasonal naive by 15.4 points", hero 24.5 % on its ladder, a channel
   table, and the horizon curve for the selection (`s-fc-hyd-eu.jpg`). Friction: the bias-heatmap title still talks
   about Electrical Assemblies in Middle East & Africa (m9); the calibration and aggregation modules stay "All series"
   (labelled, acceptable); the horizon chart's end labels "Our model" and "In-hindsight floor" overprint each other in
   this state (m10). *Pass.*
5. **A manager runs "PMI −3".** It is the default scenario. Headline "PMI −3 from Jan 2027 cuts the plan by 1.8 %";
   the hero, family table and month bars agree (−15.5K −14.7K −13.3K −6.6K = −50.1K; $16.16M + $12.32M + $12.35M +
   $10.39M = $51.22M). Other presets apply in one click; the scenario is a link. *Pass.* Friction: "1,548 of 3,068
   series respond" while the filter bar says 3,093 (m6).
6. **A judge lands cold and has 30 seconds.** The black rail reads as a table of contents (What happened / What will
   happen / Act) with the colour key "Actuals Jan 2019 – Oct 2026, Forecast Nov 2026 – May 2028". The headline and
   hero are self-explanatory. Friction: the masthead's second toggle "Orders as booked | Latent demand" is
   unexplained without hovering (m19). The rail's "Quantile engine: 7 of 7 checks match the pipeline" is jargon,
   though it signals rigour. On a 2560 px projector or monitor, half the screen is empty (M4). *Pass.*

---

## 4. Nielsen's ten heuristics

| # | Heuristic | Verdict | Evidence |
|---|---|---|---|
| 1 | Visibility of system status | Good | Live "N series in view"; skeleton loading frame; "Showing: PMI −3…" / "Changes not applied yet"; rail exception count follows the filters (48 for HYD) |
| 2 | Match with the real world | Fair | Planner words in headlines; pipeline jargon leaks: "cycle T2", "Every second month B0", "Record_ID decode vs Record_ID-free witness", "in-hindsight floor", "cycle-aware", "latent demand" (m19, m20) |
| 3 | User control and freedom | Good | Reset, Back/Forward over the hash, Escape closes drawers and popovers and clears `cell=`, "Back to base" in what-if |
| 4 | Consistency and standards | **Weak** | 285 series vs 286 cases; May vs Jun 2025; 3,068 vs 3,093 series; 6,961 / 6,932 / 37,760 "repairs"; 0.90 % vs 0.91 %; 99.4 % vs 99.96 % zero months; "Nov '26" vs "Nov 2026" (M1, M2, m4–m8, m17) |
| 5 | Error prevention | Good | Comboboxes only offer values with series under the other filters, so an empty combination cannot be reached through the UI; Apply is disabled until the draft changes |
| 6 | Recognition rather than recall | Good | Chips show their value; breadcrumb; active rail item; the case file names its series |
| 7 | Flexibility and efficiency | Good | Every state is a link; CSV on every ledger; keyboard paths for segmented controls, rows and charts |
| 8 | Aesthetic and minimalist design | Good | One message per view; Data health is long but sectioned |
| 9 | Recognise, diagnose, recover from errors | Fair | An invalid link falls back silently to the overview (m12); the empty overview misdiagnoses its cause and draws a "Demand falls to 0 in Mar 2020" annotation (m11) |
| 10 | Help and documentation | Good | An "i" popover on every module with what / how / source; no glossary page for the half-dozen terms a judge will not know (m19) |

---

## 5. Accessibility (measured)

**Text contrast.** Every visible text node was measured: computed colour, opacity and effective background, walking
up through transparent layers. This covered 12 states (light: overview, inbox, data health, forecast, what-if, single
series, anomalies, downloads, procurement; dark: overview, inbox, forecast). **No enabled text fails WCAG AA.**

Exceptions found:

- disabled "Previous" pager buttons, 3.40:1 (exempt);
- disabled "Apply scenario", ink on the faded orange fill, 2.62:1 (exempt, but it reads as a weak enabled button);
- breadcrumb "/" separators in `--ink-4`, 3.00:1 (decorative).

Canvas text, computed from the tokens:

| Text | Contrast |
|---|---|
| Axis ticks `--ink-3` on paper | 5.67:1 |
| Axis ticks on the forecast wash | 5.43:1 |
| FORECAST label `--accent-text` on the wash | 4.94:1 |
| Dark axis text | 7.34:1 |

**Non-text contrast.** The forecast line `--accent` is 3.85:1 and the focus ring is 3.85:1 on paper and 4.32:1 on
`--raised`. **Control borders `--rule-strong` #B3A892 on paper are 1.89:1.** That applies to the filter chips, the
segmented-control edges and the selects. `docs/design_gate_results.md` marks gate item 27 ("input, select borders and
segmented-control edges reach 3:1") as Pass on every view; the measurement does not support that (m15).

**Keyboard** (real Tab presses, `k-focus-*.jpg`):

- The order is skip link → brand → 12 rail links → masthead → 5 filter chips → content. It follows reading order.
- Every stop shows a 2 px orange ring with offset.
- Segmented controls use a roving tabindex.
- Inbox rows and the overview change-table rows are focusable, and Enter opens them.
- Charts take focus and move the crosshair with ← →.
- The skip link works, but it lands with the headline's first line under the sticky filter bar (`k-skip-tab.jpg`, m16).
- **Filter combobox** (`k-combo.jpg`): ↓ opens the list and focuses "All (7)". Further arrows move a beige highlight
  while the focus ring stays on "All", and Enter then picks the highlighted item, not the focused one. There is no
  `aria-activedescendant`, so a screen reader hears nothing as the highlight moves (M5).
- **Drawers** (`s-lineage.jpg`): `role="dialog" aria-modal="true"`, but focus is not trapped. One Tab after "Close"
  goes to the skip link and then the rail behind the scrim. The dialog has no `aria-labelledby` or `aria-label` (M6).
  Escape closes the drawer and removes `cell=` from the URL; good.

**Targets.** At desktop widths, 7–14 controls per view are under 24 px: the 18 × 18 px "i" buttons and the 22 px inbox
segmented controls. Spacing probably exempts them under WCAG 2.5.8. Under 700 px they grow to 44 px as designed.

---

## 6. Responsiveness (measured)

Horizontal overflow was measured as `scrollWidth` plus every element outside the viewport that is not clipped by a
scroll container. **No horizontal page scroll at any width from 375 to 3840 px**, on all five required views.

| Viewport | Headline / hero / first chart (px from top) | Verdict |
|---|---|---|
| 1280 × 720 (projector) | Overview: headline 139–223, hero to 313, chart 457–817; Forecast: headline 184–254, chart from 572 | Fold passes on all five views; the forecast chart shows only its top 150 px (`r-*-1280.jpg`) |
| 1024 × 768 | Overview chart from 531; Explorer chart from 1,298 (navigator stacks first) | OK (`r-health-1024.jpg`) |
| 768 × 1024 | Hero 380–540, chart from 748 | OK; the inbox case file becomes a drawer (`n-exceptions-768-case.jpg`) |
| 375 × 812 | Headline starts at 394 px; chart at 1,621 px | Usable, no overflow, prose 17.5 px. The top bar, wrapped masthead tools and five filter chips use 360 px before the headline (`r-overview-375-fold.jpg`). The 2019–2028 timeline squeezes 19 forecast months into about 40 px. The numbered annotation list has no matching numbers on the plot (`r-overview-375-chart.jpg`) (m18) |
| **1920 × 1080** | Page column x = 232–1440; **480 px empty on the right** | Below the standard (M4) |
| **2560 × 1440** | Same column; **1,120 px empty** (44 % of the main area); the masthead tools and "3,093 series in view" sit 1,100 px right of the content they control (`r-overview-2560.jpg`) | Below the standard (M4) |
| **3840 × 2160**, scale factor 1 | Same column; **2,400 px empty** (67 %); body text stays 14 px and the standfirst 17.5 px; the lineage drawer opens at x = 3,220, about 1,800 px from the case file it belongs to (`r-drawer-3840.jpg`, `r-forecast-3840.jpg`) | Below the standard (M4) |

At extra-large sizes nothing breaks or overflows, and the docked case file stays 392 px wide inside the column. The
problem is use of space and connection:

- `.page` has `max-width: 1208px` and no `margin-inline: auto`;
- `--measure` is fixed at 1128 px;
- the masthead, filter bar and footer span the full width, so their right-hand ends drift away from the content;
- type is fixed in px;
- chart heights are fixed (the overview timeline is 360 px tall at any width).

---

## 7. Figures that must agree (same build)

| What | Place A | Place B | Verdict |
|---|---|---|---|
| Inbox count | Inbox headline "285 series need a planner's judgement" | Tabs "286 cases", ledger "top 41 of 286", hero "286 new", rail badge 286, overview brief "286 exceptions" | Contradiction (M1). One series carries two rules; nothing on screen says so |
| Last order, PTC-002 | Case title "has placed no PTC-002 order since May 2025"; explorer headline "has placed no order since May 2025" | Row and case reason "No orders since Jun 2025 (17 silent months)"; brief "silent since June 2025"; chart note "Last order May 2025" | Contradiction in wording (M2) |
| Pooling saving | Procurement hero: summed $82.00M vs pooled $56.20M (93.0K vs 63.9K units), so summed P90s are 46 % above pooled at 3 months | Chart title "Summed monthly P90s overstate the buffer… 22 % at two months, 42 % at six months" | Contradiction (M3). The title's percentages are savings as a share of the summed buffer (31 % at 3 months), not overstatement |
| Value-added steps | Naive 51.6 → seasonal naive 38.6 (13.0 by the displayed values) | "+12.9 pts" | Rounding, no note (m3) |
| | Cycle-aware 31.1 → our model 26.3 (4.8) | "+4.9 pts" | Rounding, no note (m3) |
| | 26.3 − floor 23.6 = 2.7 | "our model sits 2.6 points above the in-hindsight floor" | Rounding, no note (m3) |
| Lost sales by year | 3,418 + 2,769 + 50,125 + 35,173 + 2,990 + 3,991 + 4,744 + 3,717 = **106,927** | Hero and standfirst **106,925** | Parts ≠ total, no rounding note (m2) |
| Series count | What-if "1,548 of 3,068 series respond" | Filter bar "3,093 series in view" | Unexplained (3,068 = series with forecast rows) (m6) |
| Repairs | Overview "History repaired 6,961 cells" | Data health "37,760 cells corrected" (train.csv), "6,932 records carried a numeric error", "6,961 fixed" (family table) | Three numbers, no shared definition (m4) |
| Lost-sales share | Overview and stock-outs "0.90 % of unconstrained demand" | Brief "Unconstrained demand runs +0.91 % above shipments" | Both right, different bases; reads as a disagreement (m5) |
| Scheduled zeros | Explorer "Ordering cycles explain 99.4 % of zero months" | Overview brief "99.96 % of the 10,858 zero series-months in the last 24 months" | Different windows and definitions, unlabelled (m5) |
| Explorer hero | "Demand, last 12 months 1.71M units" | Bar beneath: Monthly 1,539 · Every second month 297 … = 3,093 **series** | Unit mismatch inside the hero (M8) |
| Agreeing (spot checks) | Region shares sum to 100.0 %; region changes sum to +73.0K; top 5 at risk $9.36M → "$9.4M"; cause tabs sum to 286 and $66.76M ≈ $66.78M; family × cause heat totals $66.7M; Powertrain 28 %; quarters sum to 2,793K; what-if families sum to −50.1K and −$51.22M; procurement "89.9 % at or below P90" = 9.9 + 80.0 on Forecast | — | OK |

---

## 8. Gate results claimed vs observed

`docs/design_gate_results.md` gives Pass on all twelve views for these items. Observation disagrees:

- **Item 20, "Facts agree".** It fails on the Exception inbox (285 vs 286), Procurement (42 % vs 46 %), Forecast
  (rounding of the value-added steps and the floor gap) and Stock-outs (106,927 vs 106,925).
- **UI/UX gate item 3, "keyboard reachable, no traps".** Reachable, yes. But the combobox highlight and focus disagree,
  and the modal drawer leaks focus. Should be N on every view.
- **UI/UX gate item 5, semantic elements.** Dialogs have no accessible name.
- **Item 27, non-text contrast of control borders.** 1.89:1 measured, not 3:1.
- **Responsiveness.** No gate covers widths above 1440. The owner now requires 1920, 2560 and 3840; the build fails
  that on use of space (M4).

Verified as true:

- UI/UX gate item 1 (contrast);
- UI/UX gate item 12 (no horizontal scroll);
- gate item 24 (URL reproduces state, Escape closes the drawer);
- gate item 28 (the rail count and the series count follow the filters).

---

## 9. Defects, prioritised

Severity: **critical** = broken, wrong or embarrassing; **major** = clearly below a top-product standard; **minor** =
polish. There is no critical finding.

### Major

**M1. Exception inbox: headline "285 series" against "286 cases" everywhere else.**
- Where: Lede (`10-exceptions-1440-full.jpg`, `d-exceptions.jpg`).
- Problem: The first number a planner or judge reads disagrees with the tabs, the ledger title, the hero meter, the
  rail badge and the overview brief, and nothing explains that one series carries two rules.
- Fix: In `dashboard/src/insights/inbox.ts` (`INBOX_TEMPLATES.headline`), lead with cases ("286 cases need a planner's
  judgement this cycle") and add the series count only when it differs ("… on 285 series; one series is flagged twice").
  Alternatively count series everywhere, but the tabs count cases, so cases is the cheaper consistent choice. Make the
  standfirst say "cases" too ("$30.21M across 172 cases").

**M2. Case file and explorer: "has placed no PTC-002 order since May 2025" vs "No orders since Jun 2025 (17 silent
months)".**
- Where: `s-inbox-case.jpg`, `n-exceptions-768-case.jpg`; explorer `#/explorer?sku=PTC-002&reg=North%20America`.
- Problem: The same fact is worded two ways in one panel, and the months differ. A planner cannot tell when the account
  went quiet.
- Fix: Use one phrasing from one variable, the last order month:
  - "Last order May 2025; nothing since (17 months)" in `insights/inbox.ts:217`, `insights/explorer.ts:186`,
    `views/Explorer.tsx:684`;
  - "silent since June 2025" → "last order May 2025" in `insights/briefing.tsx:196`;
  - the same convention in the exported reason text (`src/celeris/export/exceptions.py`, via the export only).

**M3. Procurement: chart title "Summed monthly P90s overstate the buffer more the longer the lead time: 22 % at two
months, 42 % at six months" contradicts the hero.**
- Where: `11-procurement-1440-full.jpg`.
- Problem: Hero: summed $82.00M (93.0K units) vs pooled $56.20M (63.9K), so the overstatement at three months is
  already 46 %, more than the title's six-month figure. The title's percentages are savings (1 − pooled / summed: 22 %,
  31 %, 42 %), labelled as overstatement. A judge who checks one number concludes the maths is wrong.
- Fix: In the procurement title template (`insights/procurement.ts`), either say "Pooling saves more the longer the
  lead time: 22 % at two months, 31 % at three, 42 % at six", or compute summed / pooled − 1 and say "overstate by…".
  Use the same framing as the headline ("cuts … by 31 %").

**M4. Extra-large screens (1920 / 2560 / 3840 px): content pinned in a 1208 px column at the left, with 480 / 1,120 /
2,400 px of empty cream on the right.**
- Where: All views (`r-overview-1920.jpg`, `r-overview-2560.jpg`, `r-forecast-3840.jpg`, `r-drawer-3840.jpg`).
- Problem:
  - The masthead tools and "N series in view" sit up to 1,100 px away from the content they control.
  - The lineage drawer opens about 1,800 px from its case at 4K.
  - Type stays 14 px body and 17.5 px standfirst at 3840 × 2160 at scale factor 1.
  - Charts stay 1128 × 360.
  - It looks unfinished on a jury's large monitor.
- Fix, in `styles/shell.css` and `styles/tokens.css`:
  1. Center the column: `.page { margin-inline: auto; }`, and wrap the masthead, filter bar and footer contents in the
     same max-width container so their ends align with the content.
  2. Step the measure: `@media (min-width:1600px){:root{--measure:1360px}}`, `@media (min-width:1920px){:root{--measure:1560px}}`,
     `@media (min-width:2560px){:root{--measure:1880px}}`.
  3. Fluid type at ≥ 2560 px. Scale the type tokens with `clamp()`, for example
     `--t-body: 400 clamp(14px, .25vw + 8px, 17px)/1.5 …`, and the same for hero, figure, lede and title. Or set
     `html{font-size:112.5%}` and move the tokens to rem.
  4. Use the width in extra grid columns: the overview's brief, change table and top-5 in three columns at ≥ 1920; the
     inbox ledger plus a wider case file (480–560 px); the Forecast lower row in three to four columns. Keep tables
     within 1,100 px.
  5. Chart height proportional to width (`height = clamp(360, width/3.2, 560)` in `TimelineChart`).
  6. Drawer width `min(760px, 40vw)`.

**M5. Filter combobox: the arrow keys move a highlight while focus and its ring stay on "All"; Enter selects the
highlight.**
- Where: `components/FilterBar.tsx` (`k-combo.jpg`).
- Problem: Two competing focus indicators. Keyboard users see the ring on one option while Enter picks another, and a
  screen reader announces nothing as the highlight moves. The design system promises arrow, Enter and Escape behaviour,
  and the gate marks it Pass.
- Fix: Either move real focus with the highlight (`optionRefs[hi].focus()`, remove the `autoFocus` ring from "All"), or
  adopt the ARIA combobox pattern: focus stays in the search input or chip, the listbox has `id`, the chip or input
  gets `aria-controls` and `aria-activedescendant={optionId(hi)}`, options get `id`s, and only the highlighted option
  gets the focus-like style.

**M6. Drawers (lineage, narrow case file): `aria-modal="true"` but focus escapes, and the dialog has no accessible
name.**
- Where: `components/overlays.tsx` `Drawer` (`s-lineage.jpg`).
- Problem: One Tab after "Close" moves focus to the skip link and the rail behind the scrim. A screen reader announces
  an unnamed dialog.
- Fix:
  - Trap Tab and Shift+Tab inside `.drawer`, cycling first ↔ last focusable; or set `inert` on `.shell` while open.
  - Add `aria-labelledby` pointing at the drawer `h2` (give it an id).
  - Keep the existing Escape and focus-restore behaviour.

**M7. Anomaly monitor register: Reason and Action are clamped to two lines, and the full text is only in a hover
`title`.**
- Where: `04-anomalies-1440-full.jpg`, rows such as "mask from level / seasonality /…" and "Listed semiconductor
  allocation (EV-019): Shipped = floor(fill x…".
- Problem: Reason and action are a must-show item of this view. Keyboard and touch users cannot read the rest, and the
  most informative part (the action) is the part cut off.
- Fix: In `views/Anomalies.tsx` and `components/tables.tsx`:
  - Make register rows expandable (Enter or click toggles a full-text row under it), or open a detail popover or drawer
    with type, scope, period, full reason, full action, confidence and impact.
  - Alternatively raise the clamp to four lines and drop the confidence bar column at ≤ 1280 px to give the text room.

**M8. Demand explorer hero: "Demand, last 12 months 1.71M units" sits on a stacked bar of series counts by ordering
cycle (1,539 / 775 / 297 / 242 / 230 / 10).**
- Where: `03-explorer-1440-full.jpg`, `r-explorer-1280.jpg` (204K units over 235 / 115 / 55 / 33 / 35).
- Problem: The most prominent element mixes units and series counts without a label. It reads as a breakdown of the
  1.71M. The explanation is only in the "i" popover.
- Fix: In `views/Explorer.tsx` `CycleMix`, add a visible caption above the bar ("3,093 series by ordering cycle") and
  suffix the legend values ("1,539 series"). Better, move the cycle mix out of the hero into the navigator or the
  series-card module, and give the hero a units visual (last 12 vs prior 12).

### Minor

- **m1. Executive overview: the "three things to worry about" are below the fold** and mixed into a seven-item brief.
  Fix: in `views/Overview.tsx` and `insights/briefing.tsx`, add a three-line "Watch" list to the lede (top risk event,
  revenue at risk with the top case, weakest accuracy segment), or order the brief Risk → Act → Accuracy first with
  "3 to watch" in its title.
- **m2. Stock-outs year table sums to 106,927, not 106,925.** Fix: round from a largest-remainder allocation of the
  total, or add "Rows may not sum to the total because of rounding" under the table (`views/Stockouts.tsx`).
- **m3. Forecast value-added steps disagree with the displayed values by 0.1 pt** (+12.9 vs 13.0, +4.9 vs 4.8; "2.6
  points above the floor" vs 26.3 − 23.6 = 2.7). Fix: compute the step deltas and the floor gap from the rounded
  displayed values (`insights/accuracy.ts`), or footnote the rounding.
- **m4. Three different "repair" counts** (6,961 cells, 6,932 records, 37,760 cells corrected) with no shared
  definition. Fix: name them distinctly everywhere: "6,961 numeric fixes", "37,760 label and format fixes",
  "6,932 records with a numeric error", with one sentence in the Data health standfirst.
- **m5. Near-duplicate percentages on different bases** (0.90 % of demand vs +0.91 % above shipments; 99.4 % vs 99.96 %
  zero months). Fix: use one base in the brief ("0.90 % of unconstrained demand"), and state the window and definition
  in the brief's zero-months fact.
- **m6. What-if "1,548 of 3,068 series"** vs "3,093 series in view". Fix: "… of the 3,068 series with a forecast" in
  `insights/whatif.ts`.
- **m7. Procurement hero is always USD** ($56.20M) under the Units toggle while its standfirst is in units. Fix: follow
  the measure (63.9K units in Units mode) or label it "Safety-stock value".
- **m8. Inbox kicker "Case 6 of 286, cold start"** shown while the "Lost account" tab lists 16 cases. A case outside the
  active tab or filter stays docked. Fix: when `case` is not in `shown`, close the case or show the first shown case;
  keep the "outside the filters" message only for explicit deep links (`views/Exceptions.tsx`, `open` computation).
- **m9. Forecast bias heatmap title ignores the filter**: "Electrical Assemblies in Middle East & Africa
  under-forecasts most" under `fam=HYD&reg=Europe`. Fix: when one cell is selected, title it with the selection ("Hydraulic
  Systems in Europe: bias −0.9 %, inside ±5 %") and keep the extreme as the dek.
- **m10. Horizon chart end labels collide** ("Our model" over "In-hindsight floor") in `s-fc-hyd-eu.jpg`. Fix:
  collision-avoid the end labels (`views/g2/forecastCharts.ts`), with a minimum 14 px vertical gap and leader lines.
- **m11. Empty selection (only reachable by a link)** draws a flat zero timeline with the annotation "COVID-19
  lockdowns — Demand falls to 0 in Mar 2020" and "P10–P90 0–0", and explains it as "the account is lost, or the SKU
  ends", although the combination never existed (`s-empty.jpg`). Fix: when `nSel === 0`, render one `Empty` state
  ("No series matches Hydraulic Systems × Europe × Falcon Gulf Motors") with Reset, and suppress annotations.
- **m12. Invalid link** (`#/nosuchview?fam=XXX&sku=NOPE`) silently shows the unfiltered overview. Fix: a toast "That
  link has an unknown view or filter value; showing the overview" in `App.tsx` / `state/url.ts`.
- **m13. Data health ignores the filters in most modules without saying so.** The headline, checks, rule ledger and
  numeric-state census are unchanged under `fam=HYD&reg=Europe` while "78 series in view" shows. Fix: a one-line notice
  under the lede when filters are active ("Checks and rules cover whole files; the family table and the lineage follow
  your filters").
- **m14. Grammar with n = 1:** "1 fell on an order month, most of them in Apr 2020" (`explorer?fam=HYD&sku=HYD-004`).
  Fix: singular branch in the explorer standfirst template (`insights/explorer.ts`).
- **m15. Control borders 1.89:1** (`--rule-strong` #B3A892 on paper: chips, segmented controls, selects), while gate
  item 27 claims 3:1. Fix: a darker control-border token (for example #8F846F, ≈ 3.0:1), used only on control borders,
  and correct `docs/design_gate_results.md`.
- **m16. The skip link lands with the headline under the sticky filter bar** (`k-skip-tab.jpg`). Fix:
  `html { scroll-padding-top: 64px }`, or `main#main { scroll-margin-top: 60px }` in `styles/shell.css`.
- **m17. Month formats vary:** "Nov '26", "Oct '19", "Mar '27 – May '28" (procurement axis, time machine, case file)
  against "Nov 2026" elsewhere. Fix: one short-month formatter in `data/format.ts`.
- **m18. Phone (375 px):**
  - 360 px of chrome before the headline (top bar, wrapped masthead tools, five chips);
  - the 2019–2028 timeline leaves the forecast about 40 px wide;
  - the numbered annotation list has no numbers on the plot.

  Fix: collapse the five chips into one "Filters (n)" button under 700 px; default `tl` to "recent" under 640 px; draw
  the number on each annotated point.
- **m19. Unexplained jargon for a cold reader:** "Orders as booked | Latent demand", "in-hindsight floor",
  "cycle-aware", "cycle T2", "B0", "Quantile engine". Fix: a visible one-line explanation in the "i" of the masthead,
  plus a short glossary popover linked from the rail footer; replace "B0" and "T2" by words.
- **m20. Data health rule names read like code** ("Blank regions: Record_ID decode vs Record_ID-free witness").
  Fix: plain names in the export's rule titles ("Region blank, recovered from the Record_ID").
- **m21. Macro indicator paths show % changes of rates:** "Auto production, year on year 2.2 to 2.4, +9.1 %";
  "Industrial utilisation rate 83.4 to 78.4, −6.0 %". Gate item 19 requires pts for rates. Fix: "+0.2 pts" and
  "−5.0 pts" for `*_pct` indicators (`views/Macro.tsx` / `insights/macro.ts`).
- **m22. Macro: three r values for one link** (headline 0.93; "0.94, then 0.90"; model-free 0.87). Fix: name each in
  place ("r = 0.93 over 2019–26 at the model's lag").
- **m23. Overview top-5 at risk: the reason is cut** ("No orders since Jun 2025 (17 silent mont…") at 1440 px. Fix: wrap
  to two lines, or shorten the cause to "Lost account · silent 17 months".
- **m24. Info buttons are 18 × 18 px at desktop** (7–14 per view under 24 px). Fix: a 24 px minimum hit area
  (`::after` inset −3 px) at all widths, not only under 700 px.
- **m25. Units printed with decimals** ("Shipped, cleaned 0.0", "6.0 units lost", "Latent monthly demand 32.5") in the
  lineage drawer and series card. Fix: integers for shipped and lost; one decimal only for latent and means, labelled
  "a month".
- **m26. Disabled "Apply scenario" is ink on faded orange** (2.62:1) and looks like a weak enabled primary. Fix: a
  neutral disabled style (`--hover` fill, `--ink-3` text) for `.btn.primary:disabled`.
- **m27. `docs/design_gate_results.md` overstates passes** (items 20 and 27, UI/UX items 3 and 5; nothing above 1440
  px). Fix: update after the fixes above, and add the 1920 / 2560 / 3840 rows the owner now requires.

---

## Findings (JSON)

```json
[
  {"view": "Exception inbox", "problem": "Headline says '285 series need a planner's judgement' while the cause tabs, ledger title, hero meter, rail badge and overview brief all say 286 cases; nothing explains that one series carries two rules.", "fix": "insights/inbox.ts INBOX_TEMPLATES.headline: lead with cases ('286 cases need a planner's judgement this cycle'), add '… on 285 series' only when they differ; say 'cases' in the standfirst too.", "severity": "major"},
  {"view": "Exception inbox / Demand explorer", "problem": "Case title and explorer headline say 'has placed no PTC-002 order since May 2025' while the row reason says 'No orders since Jun 2025 (17 silent months)' and the brief says 'silent since June 2025'.", "fix": "One phrasing from the last-order month everywhere: 'Last order May 2025; nothing since (17 months)' in insights/inbox.ts:217, insights/explorer.ts:186, views/Explorer.tsx:684, insights/briefing.tsx:196 and the exported reason text.", "severity": "major"},
  {"view": "Procurement plan", "problem": "Chart title 'Summed monthly P90s overstate the buffer … 22% at two months, 42% at six months' contradicts the hero (summed $82.00M / 93.0K vs pooled $56.20M / 63.9K = 46% overstatement at three months); the percentages are savings, labelled as overstatement.", "fix": "insights/procurement.ts: 'Pooling saves more the longer the lead time: 22% at two months, 31% at three, 42% at six', or compute summed/pooled − 1 if the word stays 'overstate'.", "severity": "major"},
  {"view": "All views (1920 / 2560 / 3840 px)", "problem": "Content stays in a 1208 px column pinned left: 480 / 1,120 / 2,400 px empty on the right; masthead tools and series count far from the content; lineage drawer opens ~1,800 px from its case at 4K; type and chart sizes fixed.", "fix": "styles/shell.css + tokens.css: .page margin-inline auto and the same max-width container for masthead, filter bar and footer; --measure steps at 1600 / 1920 / 2560 (1360 / 1560 / 1880 px); clamp()-based type tokens at ≥2560; extra grid columns (overview brief + change + top-5 in three columns, wider case file); chart height ∝ width; drawer min(760px, 40vw).", "severity": "major"},
  {"view": "Shell: filter bar", "problem": "Combobox arrow keys move a visual highlight while focus and its ring stay on 'All'; Enter picks the highlight; no aria-activedescendant, so screen readers announce nothing.", "fix": "components/FilterBar.tsx: move real focus with the highlight (or ARIA combobox pattern with aria-controls + aria-activedescendant and option ids); drop the autoFocus ring on 'All'.", "severity": "major"},
  {"view": "Shell: drawers (lineage, narrow case file)", "problem": "role=dialog aria-modal=true but Tab escapes to the skip link and rail behind the scrim; the dialog has no accessible name.", "fix": "components/overlays.tsx Drawer: trap Tab / Shift+Tab inside .drawer (or set inert on .shell while open); add aria-labelledby pointing at the drawer h2.", "severity": "major"},
  {"view": "Anomaly monitor", "problem": "Register Reason and Action (a must-show item) are clamped to two lines; the full text is only in a hover title, unreachable by keyboard and touch; the action is the part cut off.", "fix": "views/Anomalies.tsx + components/tables.tsx: expandable rows or a detail popover or drawer with full reason and action; or a four-line clamp and drop the confidence column at ≤1280 px.", "severity": "major"},
  {"view": "Demand explorer", "problem": "Hero 'Demand, last 12 months 1.71M units' sits on an unlabelled stacked bar of series counts by ordering cycle (1,539 / 775 / 297 …), which reads as a breakdown of the units.", "fix": "views/Explorer.tsx CycleMix: visible caption '3,093 series by ordering cycle' and 'series' on legend values, or move the mix out of the hero and give the hero a units visual.", "severity": "major"},
  {"view": "Executive overview", "problem": "The 'three things to worry about' are below the fold, mixed into a seven-item brief starting near y=1,150 px.", "fix": "views/Overview.tsx + insights/briefing.tsx: a three-line 'Watch' list in the lede (top risk event, revenue at risk with its top case, weakest accuracy segment), or order the brief Risk → Act → Accuracy first.", "severity": "minor"},
  {"view": "Stock-outs & lost sales", "problem": "Lost-by-year rows sum to 106,927 while the hero and standfirst say 106,925; no rounding note.", "fix": "views/Stockouts.tsx: largest-remainder rounding to the total, or a rounding note under the table.", "severity": "minor"},
  {"view": "Forecast & accuracy", "problem": "Value-added steps disagree with displayed values by 0.1 pt (+12.9 vs 51.6 − 38.6 = 13.0; +4.9 vs 31.1 − 26.3 = 4.8); 'sits 2.6 points above the floor' vs 26.3 − 23.6 = 2.7.", "fix": "insights/accuracy.ts: compute step deltas and the floor gap from the rounded displayed values, or footnote the rounding.", "severity": "minor"},
  {"view": "Executive overview / Data health", "problem": "Three repair counts without a shared definition: 'History repaired 6,961 cells', '37,760 cells corrected', '6,932 records carried a numeric error'.", "fix": "Name them distinctly everywhere (numeric fixes / label and format fixes / records with a numeric error) and define them once in the Data health standfirst.", "severity": "minor"},
  {"view": "Executive overview / Demand explorer", "problem": "Near-duplicate percentages on different bases read as disagreements: 0.90% of demand vs +0.91% above shipments; 99.4% vs 99.96% scheduled zero months.", "fix": "One base in the brief (0.90% of unconstrained demand); state the window and definition in the brief's zero-month fact.", "severity": "minor"},
  {"view": "What-if", "problem": "'1,548 of 3,068 series respond' while the filter bar says 3,093 series in view.", "fix": "insights/whatif.ts: '… of the 3,068 series with a forecast'.", "severity": "minor"},
  {"view": "Procurement plan", "problem": "Hero is always USD ($56.20M) under the Units toggle while the standfirst is in units.", "fix": "Follow the measure (63.9K units in Units mode) or label it 'Safety-stock value'.", "severity": "minor"},
  {"view": "Exception inbox", "problem": "A case outside the active tab or filter stays docked ('Case 6 of 286, cold start' on the Lost account tab; 'Case outside the filters' after a filter change).", "fix": "views/Exceptions.tsx open computation: if case is not in shown, open shown[0] (keep the outside-filters message only for explicit deep links).", "severity": "minor"},
  {"view": "Forecast & accuracy", "problem": "Bias heatmap title ignores the filter: talks about Electrical Assemblies in Middle East & Africa under fam=HYD&reg=Europe.", "fix": "When a family × region selection exists, title the selected cell and keep the extreme in the dek.", "severity": "minor"},
  {"view": "Forecast & accuracy", "problem": "Horizon chart end labels 'Our model' and 'In-hindsight floor' overprint each other under fam=HYD&reg=Europe.", "fix": "views/g2/forecastCharts.ts: collision-avoid end labels with a 14 px minimum gap and leader lines.", "severity": "minor"},
  {"view": "Executive overview (empty selection)", "problem": "A zero-series link draws a flat timeline with 'COVID-19 lockdowns — Demand falls to 0 in Mar 2020', 'P10–P90 0–0', and blames a lost account although the combination never existed.", "fix": "When nSel === 0 render one Empty state naming the selection with Reset; suppress annotations and the figure strip.", "severity": "minor"},
  {"view": "Shell", "problem": "An invalid link (#/nosuchview?fam=XXX&sku=NOPE) silently shows the unfiltered overview.", "fix": "App.tsx / state/url.ts: toast 'That link has an unknown view or filter value; showing the overview'.", "severity": "minor"},
  {"view": "Data health", "problem": "Most modules (headline, checks, rule ledger, numeric-state census) ignore the filters without saying so while '78 series in view' is shown.", "fix": "A one-line notice under the lede when filters are active: checks and rules cover whole files; the family table and lineage follow your filters.", "severity": "minor"},
  {"view": "Demand explorer", "problem": "Standfirst grammar with n = 1: '1 fell on an order month, most of them in Apr 2020'.", "fix": "insights/explorer.ts: singular branch ('one fell on an order month, in Apr 2020').", "severity": "minor"},
  {"view": "Shell: controls", "problem": "Control borders (--rule-strong #B3A892 on paper) measure 1.89:1 on chips, segmented controls and selects; design_gate_results claims 3:1 for gate item 27.", "fix": "A darker control-border token (≈ #8F846F, 3:1) for controls only; correct docs/design_gate_results.md.", "severity": "minor"},
  {"view": "Shell", "problem": "The skip link lands with the headline's first line hidden under the sticky filter bar.", "fix": "styles/shell.css: html { scroll-padding-top: 64px } or main#main { scroll-margin-top: 60px }.", "severity": "minor"},
  {"view": "Procurement / Forecast / Exception inbox", "problem": "Month formats vary: \"Nov '26\", \"Oct '19\", \"Mar '27 – May '28\" against 'Nov 2026' elsewhere.", "fix": "One short-month formatter in data/format.ts used by every axis and figure.", "severity": "minor"},
  {"view": "All views (375 px)", "problem": "360 px of chrome before the headline; the 2019–2028 timeline leaves the forecast ~40 px wide; the numbered annotation list has no numbers on the plot.", "fix": "Collapse the chips into a 'Filters (n)' button under 700 px; default tl to 'recent' under 640 px; draw the annotation number on each marked point.", "severity": "minor"},
  {"view": "Shell / all views", "problem": "Unexplained jargon for a cold reader: 'Orders as booked | Latent demand', 'in-hindsight floor', 'cycle-aware', 'cycle T2', 'B0', 'Quantile engine'.", "fix": "A visible one-line explanation in the masthead 'i', a short glossary popover from the rail footer, and words instead of T2 / B0 codes.", "severity": "minor"},
  {"view": "Data health", "problem": "Rule names read like code ('Blank regions: Record_ID decode vs Record_ID-free witness').", "fix": "Plain rule titles in the export ('Region blank, recovered from the Record_ID').", "severity": "minor"},
  {"view": "Macro lead / lag", "problem": "Rate indicators show % changes of percentages ('Auto production, year on year 2.2 to 2.4, +9.1%'; 'Utilisation 83.4 to 78.4, −6.0%'); gate item 19 requires pts.", "fix": "Show '+0.2 pts' and '−5.0 pts' for *_pct indicators in views/Macro.tsx / insights/macro.ts.", "severity": "minor"},
  {"view": "Macro lead / lag", "problem": "Three r values for one relationship (0.93 headline; 0.94 then 0.90 by era; 0.87 model-free) with no in-place qualifier.", "fix": "Qualify each in place ('r = 0.93 over 2019–26 at the model's lag').", "severity": "minor"},
  {"view": "Executive overview", "problem": "Top-5 at-risk list cuts the reason at 1440 px ('No orders since Jun 2025 (17 silent mont…').", "fix": "Wrap to two lines or shorten to 'Lost account · silent 17 months'.", "severity": "minor"},
  {"view": "All views", "problem": "18 × 18 px info buttons and 22 px segmented controls at desktop widths (7–14 targets under 24 px per view).", "fix": "A 24 px minimum hit area at all widths (.info-btn::after inset −3px).", "severity": "minor"},
  {"view": "Lineage drawer / series card", "problem": "Integer units printed with decimals ('Shipped, cleaned 0.0', '6.0 units lost').", "fix": "Integers for shipped and lost units; one decimal only for latent demand and means, labelled 'a month'.", "severity": "minor"},
  {"view": "What-if", "problem": "Disabled 'Apply scenario' is ink on faded orange (2.62:1) and looks like a weak enabled primary button.", "fix": "Neutral disabled style for .btn.primary:disabled (--hover fill, --ink-3 text).", "severity": "minor"},
  {"view": "Docs", "problem": "docs/design_gate_results.md marks Pass for facts-agree (item 20) on Inbox, Procurement, Forecast and Stock-outs, for item 27 and UI/UX items 3 and 5, and has no rows above 1440 px.", "fix": "Update after the fixes and add 1920 / 2560 / 3840 results as the owner now requires.", "severity": "minor"}
]
```
