# Design gate results: every view against both acceptance gates

**Round 2, 25 Nov 2026 (read this first).** A second independent review of the fixed build
(`research/dashboard-review-r2.md`, 8.4 / 10: 1 critical, 4 major, 18 minor findings) disproved two claims this file
made after round 1:

- **UI/UX item 3 (keyboard) was marked P but failed on every view.** The Family, Region and Channel filter comboboxes
  could not be operated by keyboard: the listbox relied on `autoFocus` on a `div`, which React ignores, so focus never
  left the chip and Enter closed the list without choosing. Round 1 had checked the combobox by reading the code, not by
  pressing keys. Fixed in round 2 (`components/FilterBar.tsx`: focus moves into the popover by a ref) and now
  **measured with real key events** (DevTools protocol `Input.dispatchKeyEvent`) on all five chips: ↓ opens with focus
  on the listbox (Family, Region, Channel) or the search input (SKU, Customer) and `aria-activedescendant` on it; ↓ ↓,
  End, Home and ↓ ↓ ↑ move the highlight; Enter picks (the hash gains `fam=` / `sku=` / `reg=` / `ch=` / `cust=` and
  focus returns to the chip); ↓ then Escape closes back to the chip with the hash unchanged; ↓ then Tab closes and moves
  to the next chip. Identical on all five.
- **Item 20 (facts agree) was marked P on OV, EX and AN but failed there.** The Demand explorer said "none is lost
  demand" for a lost account (C1) and "half of the 3,093 series order every month" beside a strip reading "Monthly
  2,314" (M1); the ERP cells carried 330, 331, 332 and "135 ERP blanks" (M2). All three are fixed (below) and re-checked
  against the bundle.

Round 2 also fixed the 18 minor findings it judged real (all of them, see "Fixed in round 2"), the favicon and browser
theme colour (audit S9), and moved the anomaly classes and the EV / ICE lines off the rose / jade pair (N5 closed). The tables below show the state after round 2.

**Fix round, 25 Nov 2026.** The integration pass of 24 Nov marked almost every item "pass". Two independent reviews of
that build (`research/dashboard-review-art-dataviz-r1.md`, 4 critical / 21 major / 20 minor findings, and
`research/dashboard-review-usability-r1.md`, 8 major / 27 minor) disproved several of those claims: facts that disagreed
on the same screen (item 20), keyboard traps and an unnamed dialog (UI/UX 3 and 5), control borders at 1.89:1 (item 27),
charts that did not draw their claim (UI/UX 18) and no test at all above 1440 px. This file replaces the old one. Every
item was re-run on the fixed build and records what was **measured**, including what still fails. Gates as defined in
[`design_system.md`](design_system.md) §13: the 18-point UI/UX Pro Max gate, the 16-point
dashboard-designer gate (the two design checklists), and gate items 17–28 of `research/dashboard-design-skills.md`
§10.5, plus the team owner's extra-large-screen requirement (1920 / 2560 / 3840 px).

**Evidence.** The production build (`dashboard/dist`) served locally. Screenshots in light and dark at 1440 × 900 and as
full pages; 375 px (rendered in an iframe, because headless Chrome does not lay out windows narrower than 500 px);
1920 × 1080, 2560 × 1440 and 3840 × 2160 at device scale 1; filtered states (Hydraulic Systems; Hydraulic Systems ×
Europe; one series ELA-008 · India; the lineage drawer at 4K). A probe page loaded every view at 375, 768, 1024, 1280,
1440, 1920, 2560 and 3840 px and measured horizontal overflow (document scroll width and any element outside the
viewport that no scroll container clips), the page column's position, the rail width and the body font size. Contrast
values are computed from the tokens (WCAG formula). Round 1 checked the keyboard behaviour of the combobox and the
drawer in the code paths only, which is how the combobox failure above slipped through; round 2 tested the five filter
comboboxes with real key events and the review tested the drawer live. Hover-only behaviour (tooltips) was not exercised
in a live browser. Round-1 fork screenshots: `research/scratch/dash-fix-r1/forkA/`, `forkB/`; fix logs:
`research/scratch/dash-fix-r1/fixlog*.md` and `research/scratch/dash-fix-r2/fixlog.md` (working files, not included in
the repository). The shipped screenshots are in `docs/screenshots/`.

**Legend.** P = pass. N = passes with a stated limit (see the note). F = fails (see the note). Views: OV Executive
overview, DH Data health, EX Demand explorer, AN Anomaly monitor, SO Stock-outs & lost sales, MA Macro lead / lag, FA
Forecast & accuracy, LC Lifecycle, WI What-if, EI Exception inbox, PP Procurement plan, DD Data download.

**Summary (after round 2).** 0 F on the UI/UX Pro Max gate (item 3 failed on every view before round 2; it now passes,
measured); 0 F on the dashboard-designer gate; 2 F on items 17–28 (item 21, rows end level, on Data health and Data
download: content-driven, unchanged); item 20 failed on OV / EX / AN before round 2 and now passes; the
extra-large-screen rows pass on all 12 views. The N items are listed with their limits below; none hides a wrong
number.

## UI/UX Pro Max gate (18 points)

| # | Item | OV | DH | EX | AN | SO | MA | FA | LC | WI | EI | PP | DD |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Text contrast ≥ 4.5:1, light and dark | P | P | P | P | P | P | P | P | P | P | P | P |
| 2 | Visible focus ring everywhere | P | P | P | P | P | P | P | P | P | P | P | P |
| 3 | Keyboard reachable, tab order = visual order, no traps, skip link | P | P | N1 | P | P | N1 | N1 | P | P | P | P | P |
| 4 | aria-label on icon buttons, decorative icons hidden, labelled filters | P | P | P | P | P | P | P | P | P | P | P | P |
| 5 | Semantic elements, named dialogs, polite live regions | P | P | P | P | P | P | P | P | P | P | P | P |
| 6 | Chart text alternative: finding title, description, data as table or download | N2 | P | N2 | P | N2 | P | N2 | N2 | N2 | P | P | P |
| 7 | Pointer cursor, 150–300 ms colour hover, no layout shift | P | P | P | P | P | P | P | P | P | P | P | P |
| 8 | Click / tap for primary actions; 44 px targets on narrow screens; 24 px minimum at desktop | P | N3 | P | N3 | P | P | P | P | P | P | P | P |
| 9 | Loading shows a skeleton, space reserved | P | P | P | P | P | P | P | P | P | P | P | P |
| 10 | Empty states with a next action; errors next to the problem | P | P | P | P | P | P | P | P | P | P | P | P |
| 11 | Active view highlighted; URL reflects view, filters, toggles | P | P | P | P | P | P | P | P | P | P | P | P |
| 12 | 375 / 768 / 1024 / 1280 / 1440 px and 1920 / 2560 / 3840 px, no horizontal page scroll | P | P | P | P | P | P | P | P | P | P | P | P |
| 13 | z-index scale 10 / 20 / 30 / 50 | P | P | P | P | P | P | P | P | P | P | P | P |
| 14 | Line height 1.5–1.75, measure 65–75 ch, 16 px body on phones | P | P | P | P | P | P | P | P | P | P | P | P |
| 15 | Reduced motion respected; transform / opacity only | P | P | P | P | P | P | P | P | P | P | P | P |
| 16 | Lazy views, memoised work, no layout shift on data | P | P | P | P | P | P | P | P | P | P | P | P |
| 17 | One style, SVG icons only, nothing ornate | P | P | P | P | P | P | P | P | P | P | P | P |
| 18 | Chart form fits data; actual vs forecast at a glance; anomalies marked and annotated; sorted labelled bars; numeric heat legends | P | P | P | P | P | P | P | P | P | P | P | P |

Changes behind the re-run: item 3 (round 2: all five filter comboboxes follow the ARIA combobox pattern and were tested
with real key events, see the top of this file; the drawer traps Tab and Shift+Tab); item 5
(the drawer is named by its headline through `aria-labelledby`); item 8 (every "i" has a 24 px hit area at all widths);
item 12 (the probe now covers 1920 / 2560 / 3840: no overflow on any view); item 18 (the anomaly type tables share one
bar scale; data-error marks sit on their value; region accuracy is drawn as dot-range rows against seasonal naive and the
in-hindsight floor; Stock-outs leads with the lost / back-ordered bars; the horizon chart's end labels never overlap).

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
| 8 | Red / green / amber only for status, never the only cue | P | P | P | P | P | P | P | P | P | P | P | P |
| 9 | Date range on every time chart; history vs forecast at a glance | P | P | P | P | P | P | P | P | P | P | P | P |
| 10 | Filters at the top, default "all" | P | P | P | P | P | P | P | P | P | P | P | P |
| 11 | Sensible precision and units | P | P | P | P | P | P | P | P | P | P | P | P |
| 12 | Source and "data as of" in the footer | P | P | P | P | P | P | P | P | P | P | P | P |
| 13 | White space about 15–20 % (also on 1920–3840 px screens) | P | P | P | P | P | P | P | P | P | P | P | P |
| 14 | Direct labels, no legend hunting, no pie > 5 | P | P | P | P | P | P | P | P | P | P | P | P |
| 15 | Usable at 768, not broken at 390, top three figures first | P | P | P | P | P | P | P | P | P | P | P | P |
| 16 | Contrast ≥ 4.5:1 and a colour-blind-safe palette, both themes | P | P | P | P | P | P | P | P | P | P | P | P |

Item 16 was a silent fail before: dark-theme heatmap extremes carried chalk text on the brightest cells; cell text now
takes ink or paper by computed WCAG contrast (`onFill`, `readableOn`). Item 13 failed on large screens (a fixed 1,128 px
column pinned left left 27–70 % of the screen empty); see the extra-large rows below. Item 15: on phones the figure strip
now really is one column (a 1180 px selector out-ranked the 700 px rule and kept it 2 × 2), and the five filter chips
fold behind one "Filters" button.

## Gate items 17–28 (`dashboard-design-skills.md` §10.5)

| # | Item | OV | DH | EX | AN | SO | MA | FA | LC | WI | EI | PP | DD |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 17 | Fold test at 1440×900 (headline, standfirst, hero with its strip, first chart's title and plot; on the Overview also the three-line watch list) | P | P | P | P | P | P | P | P | P | P | P | P |
| 18 | Question, finding, job: main control visible without scrolling | P | P | P | P | P | P | P | P | P | P | P | P |
| 19 | Deltas say against what (rates in points, levels in %) | P | P | P | P | P | P | P | P | P | P | P | P |
| 20 | Facts agree (one variable per fact, parts sum, displayed deltas = differences of displayed values, P10 ≤ P50 ≤ P90, no NaN / −0) | P | P | P | P | P | P | P | P | P | N11 | P | P |
| 21 | Rows end level, no orphan cells, no blank bands | N6 | F6 | P | P | N6 | P | N6 | P | P | P | P | F6 |
| 22 | One big number | P | P | P | P | P | P | P | P | P | P | P | P |
| 23 | Tables are rules and alignment | N7 | N7 | P | P | N7 | P | P | P | P | P | P | P |
| 24 | Drill-down keeps context (interaction) | N8 | N8 | N8 | N8 | N8 | N8 | N8 | N8 | N8 | N8 | N8 | N8 |
| 25 | Forecast dated and scored; anomaly flags shaped, labelled, listed | P | – | P | P | – | – | P | N9 | P | P | P | – |
| 26 | Chart chrome (3–5 gridlines, no y-axis line, round ticks, 4–8 x labels, no single-series legend, keys list only drawn marks) | N10 | P | N10 | N10 | N10 | P | P | P | P | P | P | – |
| 27 | Affordance and non-text contrast (control borders ≥ 3:1); one filled primary per view | P | P | P | P | P | P | P | P | P | P | P | P |
| 28 | Filters and edge cases (counts update, emptied modules keep their frame, cold start, longest names, impossible links) | P | P | P | P | P | P | P | P | P | P | P | P |

"–" = not applicable (the view has no forecast chart, or no chart at all).

Item 20 was the reviewers' main finding and failed on seven views before the fixes: inbox 285 series vs 286 cases;
"since May" vs "since Jun 2025"; the Lifecycle title claiming zero in the EOL month; the single-series anomaly
standfirst (60 episodes vs 3); "47 failed" against 55; three meanings of "repaired"; three words for the ERP cells;
value-added steps that did not subtract; "overstate" printing savings; year rows that did not sum; 3,068 vs 3,093 series.
Each is now one variable per fact (the shared helpers are listed in `design_system.md` §8) and each difference is taken
from the printed numbers. Item 27 failed everywhere (control borders 1.89:1); controls now use `--control-edge`
(3.36:1 on paper, 3.04 on the wash, 3.82:1 on night).

## Extra-large screens (team owner's requirement, 25 Nov 2026)

| Viewport | Item | OV | DH | EX | AN | SO | MA | FA | LC | WI | EI | PP | DD |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1920 × 1080 | Centred, bars on the content edge, no empty half-screen, no overflow | P | P | P | P | P | P | P | P | P | P | P | P |
| 1920 × 1080 | Type and charts in proportion; fold test | P | P | P | P | P | P | P | P | P | P | P | P |
| 2560 × 1440 | Centred, bars on the content edge, no empty half-screen, no overflow | P | P | P | P | P | P | P | P | P | P | P | P |
| 2560 × 1440 | Type and charts in proportion; fold test | P | P | P | P | P | P | P | P | P | P | P | P |
| 3840 × 2160 (scale 1) | Centred, bars on the content edge, no overflow; drawer beside the content | P | P | P | P | P | P | P | P | P | P | P | P |
| 3840 × 2160 (scale 1) | Type comfortable (body 20.5 px, hero 79 px), charts in proportion | P | P | P | P | P | P | P | P | P | P | P | P |

Measured geometry (probe, all 12 views identical): at 1920 the page runs x = 274–1879 (rail 247 px, body 14.9 px); at
2560 x = 384–2440 (rail 278 px, body 16.8 px); at 3840 x = 704–3461 (rail 340 px, body 20.5 px). Before the fix the
page was x = 232–1440 at every width, with 480 / 1,120 / 2,400 px of empty cream on the right and 14 px body text.
Seen in screenshots: Overview at all three sizes (light; `docs/screenshots/final_overview_1920.png`, `_2560`, `_3840`),
Data health at 1920, Exception inbox at 1920 and at 3840 in dark, Demand explorer at 2560, Forecast & accuracy at 2560
(full page), Anomaly monitor with the lineage drawer at 3840 (`research/scratch/dash-fix-r1/xl*.png`, working files, not
included in the repository); the other views by the probe (final build: 0 px of overflow on all 12 views at 375, 768,
1024, 1280, 1440, 1920, 2560 and 3840 px) and the shared layout.

Round 2 (m14): at 2560 px and wider the lede left a 500–900 px hole between the 70-ch standfirst and the hero. From
1920 px the text column now shrinks to its content and the hero sits beside it (see `design_system.md` §4.1); seen in
`docs/screenshots/final_overview_1920.png`, `_2560`, `_3840`. The probe was re-run on the round-2 build: 0 px of
horizontal overflow on all 12 views at all eight widths (one regression found and fixed on the way: the hero's new
X-ray link ran 10 px past the edge at 1024 px until figure links were allowed to wrap).

## Notes

- **N1 (keyboard, EX / MA / FA).** Every action has a keyboard path, but some only through a second control: the
  explorer's month-to-lineage click is on the canvas (the zero-month calendar cells, the Data health example links
  and the anomaly register open the same drawer from buttons); the macro matrix cell is selected by mouse (the indicator
  paths below are buttons that select the column); the bias heatmap's click-to-filter duplicates the filter bar. Charts
  take focus and move the crosshair with ← →.
- **N2 (table twins).** Every chart has a computed title and an ECharts `aria` description; every ledger and bar table
  has a CSV, and Data download builds the monthly history-and-forecast extract of any selection. The timelines,
  seasonality, horizon and heatmap charts have no on-view table twin.
- **N3 (touch targets, DH / AN).** Controls grow to 44 px below 700 px (the register's row toggles too), but inline
  "Example" links in the checks ledger and type labels in the anomaly tables stay text-sized.
- **N4 (colours, MA).** The correlation matrix (diverging jade ↔ plum) and the EV-shift chart put six hues on one scroll
  of the page; each chart alone stays within four.
- **N5 (status-like hues) — closed in round 2.** The anomaly classes and the EV / ICE lines used the jade and rose
  slots, which read like good / bad. Data errors are now violet hollow diamonds and real events ink triangles (real
  events are history); on the Macro view EV stays jade and ICE moves to violet. Neither pair is red / green any more.
- **F6 / N6 (rows end level).** Data health: the row-bridge module ends above the repairs table beside it; Data download:
  the bundle manifest ends about 300 px above the modelling-inputs column. Stock-outs and Forecast & accuracy end within
  about 100 px. Overview at 1440: the brief ends above the change table and top exceptions (at ≥ 1920 px the three sit
  side by side). Content-driven; not fixed in this round.
- **N7 (tables).** At 375 px the identity column is truncated in the Overview change table ("Middle East & …") and the
  Data health repairs table; the Stock-outs ledger pages through every series under a top-10 title.
- **N8 (drill-down).** Verified by URL: filters, unit, lens, range, the inbox case (`case=`) and the lineage drawer
  (`cell=`) survive a reload; Escape closes the drawer and clears `cell=`. Back-button scroll restoration was not
  exercised in a live browser.
- **N9 (LC).** The lifecycle Gantt and handover panels date the forecast but carry no backtest score; a cold start has
  no backtest of its own.
- **N10 (x labels).** The full-range timelines (2019–2028) print one label per January, ten at 1440 px; below 640 px they
  thin to every second or third year (and the Overview defaults to "Since <year>" on phones).
- **N11 (EI, filtered).** The cause-tab amounts add up to the total by largest-remainder rounding; when the filters make
  a tab print in thousands ("$733K") and the total in millions, the tabs can still differ from the total by up to about
  $7K of rounding.

## Fixed in round 2 (25 Nov 2026; log `research/scratch/dash-fix-r2/fixlog.md`, a working file not included in the repository)

- **C1** Demand explorer, lost account: one classification of zero months (`zeroClass()`, lost account first, because
  the pipeline also sets `structural_zero` on those months) feeds the standfirst, the module title, the hero's 12-month
  strip and the calendar. PTC-002 · North America now reads "55 of 94 months were zero: 38 scheduled off-months of that
  cycle and 17 since the last order in May 2025 (8 of them months the cycle would have ordered)"; the aggregate headline
  is 98.8 % (it counted 204 lost-account months as ordering cycles at 99.4 %). Bundle check: 55 = 38 + 17, 8 on-phase.
- **M1** "Monthly" is one variable (every month plus every month but one shutdown month: 1,539 + 775 = 2,314): "Three
  quarters of the 3,093 series order monthly (775 of them skip one shutdown month a year)", with the same definition
  under the strip and in the composition title.
- **M2** ERP cells: the timeline annotation counts the `units_unknown` flag outside rebuilt rows (331, was 330 =
  imputed − missing); anomaly clusters are headed by class and month and count their leading type ("Data errors,
  May 2023: 135 cells, 113 of them ERP blanks"); 332 is named as "records with units blank in train.csv" and 331 as "grid
  cells that keep their units unknown after 1 was restored from the stock-out file's shipped units" on the Anomaly
  monitor and Data health.
- **M4** filter comboboxes by keyboard (see the top of this file).
- **Minor findings m1–m18**: the mix note names its dimension ("among regions"); top-five reasons wrap; list prices
  "each against 2026"; ramp ratios from the printed averages (×3.45, ×2.04); a near tie in the inbox heat title names
  both families; the bias title names its scope ("the Electrical Assemblies × India cell"); "in none of the 4 folds";
  "Error stays between 24.5% and 27.7% at every horizon"; one sign convention for anomaly impact, with a dash where the
  action changes no demand; evidence as readable fields; a bridge from 2,558 register errors to the 7,917 repaired cells;
  a scenario token outside the categorical set (warm ink, dashed) with quiet difference bars; `theme=` applied on every
  hash change; the extra-large lede; "3 SKUs end in the window; 6 more were discontinued before it"; rule labels wrap
  (and a real ellipsis on the heat-strip axis); "outlined" in the macro deck; "15 more types flagged only as whole
  episodes".
- **Also**: the accuracy tile replays the forecast made at the latest backtest origin and the hero opens the forecast
  X-ray (one click each from the Overview); plain one-line definitions of latent demand, cycle-aware naive and the
  in-hindsight floor in the glossary and the "i" popovers; the black / orange / cream favicon and `theme-color`; licence
  links in the footer; the macro matrix outlines only drivers of the full-history fit (`src/celeris/export/macro.py`,
  bundle re-exported: only `macro.json` and `meta.json` changed; the "5 of 7 stable" count is unchanged); readable
  account events in the series card (cycle codes in words, no dangling "2025-05 to").

## Fixed in round 1 (summary; the full log is `research/scratch/dash-fix-r1/fixlog*.md`, working files, not included in the repository)

Shared layer: fluid unit `--u` and a centred page whose bars share the content edge; measure steps at 1600 / 1920 / 2240 /
2560 / 3200 px; chart heights from width and viewport (`chartHeight`); canvas fonts and annotation boxes on the same
scale (`fz`, `fpx`); drawers sized in design px × `--u` and anchored to the page edge; `--control-edge`; the ARIA
combobox; the drawer focus trap and name; expandable ledger rows; key groups whose divider never orphans and keys that
list only drawn marks (`markPresence`); numbers on the plot for listed annotations; anomaly marks on their value with a
paper halo; `onFill` by WCAG contrast; skip-link target below the sticky bar; a toast for links with unknown values; an
empty state for impossible selections; the phone figure strip in one column and the filter chips folded behind a button.

Views: the three-line watch list on the Overview; one definition of "repaired" (Overview, Data health, anomaly monitor);
one vocabulary for the ERP cells (rebuilt rows vs units unknown, kept out of fitting); inbox counts in cases with the
last-order phrasing everywhere; the Lifecycle EOL sentences computed from the EOL-month forecast; Forecast & accuracy
against the best benchmark with differences of printed values, dot-range region rows, non-overlapping end labels and
contrast-picked heatmap text; Macro rates in points and named correlations; Procurement "pooling saves"; Stock-outs led
by the lost / back-ordered bars; What-if round ticks, scenario end label and one reach unit; Explorer cycle mix captioned,
round seasonality ticks, plain words for cycle codes and demand classes.

## Numbers re-checked on the refreshed bundle (25 Nov 2026, after `python -m celeris all`)

The final build reads the refreshed bundle; nothing on screen is typed, so the new model numbers flowed through.

| Shown in the app | Value on screen | Reference in the bundle | Agrees |
|---|---|---|---|
| Overview hero, 19-month forecast | 2.81M units | `meta.json` submission total_units 2,805,199 | yes |
| Forecast hero, backtest WAPE | 26.1 % | `meta.json` ladder, final (structural) 0.2607 | yes |
| "the best by 5.0 points"; cycle-aware naive 31.1 %; in-hindsight floor 23.5 % | 5.0 = 31.1 − 26.1 | ladder cycle_aware 0.3113, oracle 0.2354 | yes |
| Inbox headline, rail badge, brief, watch list | 305 cases on 304 series, $70.43M | `exceptions.json`: 305 rows, 304 distinct series, revenue at risk 70.43M | yes |
| Data health repairs | 7,917 = 6,604 + 982 + 331 | history flags (partition) | yes |

## Numbers cross-checked against `outputs/` (integration pass, bundle of 24 Nov 2026)

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
