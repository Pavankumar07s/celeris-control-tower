# Dashboard review, round 2: art direction, data visualisation, usability and accessibility

Independent critic, both lenses combined. I loaded the skills in the owner's order (`ui-ux-pro-max`, then `dashboard-designer`, then `dataviz`) and applied three checklists:

- the 18-point UI/UX Pro Max gate;
- the 16-point dashboard-designer gate with items 17–28;
- the team's own claims, which I verified rather than trusted: `docs/design_gate_results.md`, `docs/design_system.md` §4.1 and the fix logs.

**Build reviewed**

- A private snapshot of `dashboard/dist` at HEAD `dd088a1`, served on port 8281. The bundle is identical to `dashboard/public/data`, from the refreshed run of 25 Nov 01:32: forecast 2,805,199 units, WAPE 26.1 %, 305 cases on 304 series.
- Every state was loaded from a URL hash in headless Chrome, driven through the DevTools protocol at real viewport sizes: keyboard events, focus, the drawer, row expansion, filters, the time machine and what-if.
- Hover tooltips and the CSV builders were not exercised.

**Screenshots** are in `research/scratch/dash-critique-r2/shots/` (JPEG, 11 MB):

| Prefix | What |
|---|---|
| `L1440-*` | Light, full page, all 12 views |
| `D1440-*` | Dark, fold view for 10 views, full page for Forecast and Macro |
| `N375-*`, `N768-*` | The five required views, full page |
| `M1280-*`, `M1024-*` | Fold views |
| `X1920-*`, `X2560-*` (all 12 views), `X3840-*` | Extra-large screens |
| `F-*` | Filtered and single-series states |
| `I-*` | Interactions |

A geometry probe loaded all 12 views at 375, 768, 1024, 1280, 1440, 1920, 2560 and 3840 px.

---

## 1. Verdict

**Overall 8.4 / 10. Not ship-ready yet: 1 critical, 4 major and 18 minor findings. Each is a small fix, mostly a single template or a single line.**

The fix round did what it claimed on almost every round-1 item:

- On the headline numbers, the same fact now shows the same figure across views.
- The extra-large layout is real: the page is centred, the bars share the content edge, and type and charts scale.
- The drawer is a proper modal.
- Register rows expand by keyboard.
- Every chart that was redrawn now shows its claim.

Against the pipeline files, 24 of the 26 figure groups I checked agree exactly (§4).

What stops a ship-ready verdict:

1. **A contradiction on the main demo path.** The inbox's case 1 (PTC-002 · North America, lost account) has a "Demand explorer" button. It opens a page headed "PTC-002 in North America last ordered in May 2025 and has been silent for 17 months". Directly beneath that, the page says "55 of 94 months were zero, all of them scheduled off-months of that cycle: none is lost demand". The cause is one line of code (C1).
2. **Two new consistency defects introduced by round-1 fixes**, plus one that round 1 left half-fixed:
   - Explorer: "Half of the 3,093 series order every month", next to a strip that says "Monthly 2,314". This is new.
   - Anomaly monitor: "Data error: ERP blank, 135 cells in May 2023", where the register has 113. This is new.
   - The ERP cells carry four different counts across views: 330, 331, 332 and the 135 above. Round 1's ERP finding (M13) was only half fixed.
3. **The filter combobox fix broke keyboard selection** for Family, Region and Channel (SKU and Customer work).
4. **The documents and the app quote different benchmark numbers** for the same backtest:
   - README and submission: 38.7 %, 31.2 % and a "noise floor" of 23.6 %;
   - screen: 38.6 %, 31.1 % and an "in-hindsight floor" of 23.5 %.

### Scores per view (1–10)

| View | R1 (AD / US) | R2 | One line |
|---|---|---|---|
| Executive overview | 8.5 / 8.5 | **9.0** | Fold, watch list and timeline are excellent; the annotation's 330 and the figure's 331 disagree; one mix sentence reads against another |
| Data health | 8.0 / 8.0 | **8.5** | An audit that adds up everywhere; still long; minor truncations |
| Demand explorer | 7.5 / 8.5 | **7.0** | Best drill path in the app, but both contradictions sit here: half vs 2,314, and "none is lost demand" on a lost account |
| Anomaly monitor | 7.0 / 7.5 | **8.0** | Shared bar scale, marks on their values, expandable reasons; the annotations count a class but name a type; raw JSON evidence |
| Stock-outs & lost sales | 7.5 / 8.0 | **8.5** | Now leads with the right chart; parts sum to the hero |
| Macro lead / lag | 7.0 / 7.5 | **8.5** | Points for rates; r values named; drivers outlined and others faded |
| Forecast & accuracy | 8.0 / 8.0 | **9.0** | Value-added steps subtract; benchmark is honest; dot-range rows; labels never collide |
| Lifecycle | 7.5 / 8.5 | **8.5** | The end-of-life sentences are now true; ramp ratios computed from unrounded values |
| What-if | 7.5 / 8.5 | **8.5** | Works; reach in one unit; the scenario violet is also a family colour |
| Exception inbox | 7.5 / 7.0 | **9.0** | Counts, wording and reasons now consistent; the strongest "Act" view |
| Procurement plan | 7.5 / 7.5 | **8.5** | "Pooling saves" matches the hero; P90 coverage matches the Forecast view |
| Data download | 8.0 / 8.5 | **8.5** | Provenance done right; 23 of 23 hashes verified in the browser |
| Extra-large screens | 4.0 / – | **8.0** | Centred, scaled, proportioned; the lede leaves a hole between prose and hero at ≥ 2560 px |

---

## 2. Round-1 verification (every critical and major finding)

Legend:

- **Fixed**: the defect is gone, with evidence from this build.
- **Partly**: the original defect is gone but a related one remains.
- **Regressed**: the fix introduced a new defect.

### Art direction and data visualisation review (`dashboard-review-art-dataviz-r1.md`)

| R1 | Finding | Status | Evidence (this build) |
|---|---|---|---|
| C1 | Inbox headline 285 vs 286 | **Fixed** | "305 cases on 304 series need a planner's judgement". The standfirst explains why cases outnumber series. Tabs (191 + 16 + 10 + 18 + 62 + 8 = 305), rail badge, brief and watch list all count 305 (`L1440-exceptions.jpg`, `exceptions.json`: 305 rows, 304 series) |
| C2 | "since May" vs "since Jun 2025" | **Fixed** | "Last order May 2025; silent 17 months" appears in the row, the case "why", the case title, the Overview watch list, the brief, the top five and the Explorer headline. A *different* contradiction sits under that Explorer headline (new C1) |
| C3 | Lifecycle: claimed zero in the EOL month | **Fixed** | "sell their last units in their EOL months … and are zero from the month after". Submission: PTC-005 sells 180 units in May 2027, then 0; PMP-003 120 in Aug 2027; THM-001 185 in Dec 2027 |
| C4 | Anomaly series: "60 more flags" vs 3 episodes vs 21 | **Fixed** | ELA-008 · India: 21 cells (1 error, 20 real events); the type tables show 20 + 1 cells; the register says "21 flags". The 60 file-wide episodes are named as such (`F-s-an-ela008-in.jpg`) |
| M1 | XL: fixed 1,128 px column at the left | **Fixed** | Probe: the page runs x = 281–1886 at 1920, 391–2447 at 2560 and 711–3469 at 3840. The masthead tools and "N series in view" end on the content edge (`X2560-*`, `X3840-*`) |
| M2 | XL: type does not scale | **Fixed** | Body text 14.9 / 16.8 / 20.5 px and h1 40.5 / 45.6 / 55.7 px at 1920 / 2560 / 3840 |
| M3 | XL: fixed chart heights | **Fixed** | The timeline keeps about 3.4 : 1 at 2560 (about 1,916 × 566 px); small charts grow with the viewport |
| M4 | Data health "47 failed" read against 61 | **Fixed** | "Every blocking check now passes; 47 of the 90 failed on the raw files"; `dq_report.json` gives 47 of 90 error-severity checks failing before |
| M5 | Value-added steps do not subtract | **Fixed** | 51.6 → 38.6 → 31.1 → 26.1 printed as +13.0, +7.5 and +5.0; "2.6 points above the in-hindsight floor" = 26.1 − 23.5 |
| M6 | Single-series headline cherry-picks the benchmark | **Fixed** | "ELA-008 in India: our model edges naive, the best benchmark here, by 0.4 points" |
| M7 | Procurement "overstate" on the wrong base | **Fixed** | "Pooling saves more the longer the lead time: 23 % at two months, 32 % at three, 43 % at six" = hero 1 − 62.4 / 91.9 |
| M8 | Macro % changes of rates | **Fixed** | PMI −2.1 pts, auto production +0.2 pts, utilisation −5.0 pts; levels in % |
| M9 | Three r values for one pair | **Fixed** | "r = 0.93 over 2019–26", "0.95 in 2019–22 and 0.90 in 2023–26", "the 12-month changes correlate at r = 0.87"; the verb agrees with its subject |
| M10 | Heatmap shouts lag-12 artefacts | **Fixed** | Non-drivers are faded, drivers carry an outline, and the deck explains lag 12 (`L1440-macro.jpg`). In dark theme the deck still says "ink outline" for a chalk outline (m17) |
| M11 | Anomaly type bars on two scales | **Fixed** | One shared scale: Missing row (982) draws about 1/5 of Listed stock-out (5,005) |
| M12 | Data-error diamonds drawn 10 px high | **Fixed** | Diamonds sit on the line, with a paper halo |
| M13 | ERP cells "rebuilt / fixed / not recovered" | **Partly** | The vocabulary is fixed ("rows rebuilt" vs "units unknown, kept out of fitting"). The numbers are not: 330 (timeline annotation), 331 (figure, Data health), 332 (type table, N12), and "ERP blank, 135 cells in May 2023" where the register has 113. See new M2 |
| M14 | "Repaired" means two numbers | **Fixed** | 7,917 = 6,604 + 982 + 331 on the Overview and on Data health. The Anomaly monitor's "2,227 corrected or rebuilt" still uses a different base without a bridge (m11) |
| M15 | Region bars do not draw "beats seasonal naive" | **Fixed** | Dot-range rows on one 0–60 % scale: floor tick, model dot, seasonal-naive ring |
| M16 | Stock-outs leads with the wrong chart | **Fixed** | Lost and back-ordered monthly bars come first at full width |
| M17 | Explorer hero strip unlabelled | **Regressed** | It is captioned now ("How the 3,093 series in view order (series counts…)"). But it folds "monthly with one shutdown month" into "Monthly 2,314", while the standfirst and the module title still say "Half … order every month" (1,539). See new M1 |
| M18 | Seasonality ticks collide | **Fixed** | 0.4 / 0.6 / … / 1.4; What-if bars on 1K steps |
| M19 | Horizon end labels overlap | **Fixed** | All series, HYD × Europe and ELA-008 · India: labels separate, with leader lines (`F-s-fc-ela008-in.jpg`) |
| M20 | Dark heatmaps: chalk text on bright cells | **Fixed** | Text colour is picked by contrast (`D1440-forecast-full.jpg`, `D1440-macro-full.jpg`) |
| M21 | Exception reasons truncated mid-number | **Fixed in the inbox, partly on the Overview** | Inbox rows show the full short reason on two lines. On the Overview's top-five list, row 5 still reads "Launches Mar 2027, no hist…" at 1440 px, and every row is cut at 375 / 768 px (m2) |

### Usability review (`dashboard-review-usability-r1.md`)

| R1 | Finding | Status | Evidence |
|---|---|---|---|
| M1 | 285 series vs 286 cases | **Fixed** | As C1 above |
| M2 | May vs Jun 2025 | **Fixed** | As C2 above |
| M3 | Procurement title contradicts the hero | **Fixed** | As M7 above |
| M4 | XL: content pinned left | **Fixed** | As M1–M3 above |
| M5 | Combobox highlight and focus disagree | **Regressed** | SKU and Customer (searchable) now follow the pattern exactly: focus stays in the input, `aria-activedescendant` moves, Enter picks (`sku=PMP-009` landed in the URL). **Family, Region and Channel no longer work by keyboard.** ArrowDown opens the list but focus stays on the chip; further arrows do nothing; Enter closes the list without choosing. Measured live: `activeElement` remains `BUTTON "Region filter: All"`, the highlight stays on "All (6)" and the hash is unchanged. See new M4 |
| M6 | Drawer leaks focus; no name | **Fixed** | Opening `cell=HYD-004\|Europe\|2020-04` moves focus into `aside.drawer`. After 14 Tabs and 5 Shift+Tabs focus is still inside. The dialog is named by its h2 through `aria-labelledby`. Escape removes `cell=` from the hash |
| M7 | Reason and action clamped, hover only | **Fixed** | Each register row has a disclosure button. Enter opens a detail row with type, scope, reason, evidence, detection, action, confidence and impact (`I-expand.jpg`). The evidence is printed as raw JSON (m10) |
| M8 | Explorer hero bar in a different unit | **Regressed** | Same as AD M17: captioned, but it now contradicts the text |

**Summary: 25 of the 29 round-1 critical / major findings are fixed, 1 is partly fixed (AD M13) and 3 regressed (AD M17 and US M8, the same defect, plus US M5).** AD M21 is fixed where it mattered most, in the inbox.

---

## 3. New findings, prioritised

### Critical

**C1. Demand explorer, single series: a lost account is described as "all scheduled off-months: none is lost demand".**

- **Where:** `F-explorer-ptc002-na.jpg`, `#/explorer?sku=PTC-002&reg=North%20America`, which is exactly where the inbox's case 1 "Demand explorer" button leads.
- **What:**
  - The headline reads "PTC-002 in North America last ordered in May 2025 and has been silent for 17 months".
  - The standfirst reads "**55 of 94 months** were zero, all of them scheduled off-months of that cycle: none is lost demand or a missing record."
  - The zero-month module is titled "All 55 zero months are scheduled off-months".
  - The 12-month strip under the "0 units" hero shows every month as a scheduled off-month dot.
  - In `outputs/clean/train_clean.parquet`, 17 of those 55 months are `is_lost_account`, and 8 of them fell on order months of the every-second-month cycle.
- **Why it hurts:**
  - It is the top exception in the app and the drill-down the demo script uses.
  - The page contradicts its own headline in the next sentence, and contradicts the inbox's own reason ("silent 17 months; forecast 0").
  - The same miscount makes the aggregate headline "Ordering cycles explain 99.4 %" count 204 lost-account months as ordering cycles. The Overview brief words this correctly as "… or lost-account tails".
- **Fix:** `dashboard/src/insights/explorer.ts` lines 48–49.
  - The pipeline sets `structural_zero` and `lost_tail` together on lost-account months, so test `lost_tail` first:
    `if (fl & b.lost_tail) z.lost[t]++; else if (fl & b.structural_zero) z.sched[t]++; else z.unexp[t]++;`
  - The strip (`views/Explorer.tsx` line 264), the calendar (lines 503 and 512), the standfirst (line 225) and the module title then read correctly ("38 scheduled off-months and 17 after the account was lost").
  - The aggregate headline becomes about 98.8 %, with the existing "and N follow a lost account" clause.

### Major

**M1. Explorer: "Half of the 3,093 series order every month" next to a strip that says "Monthly 2,314" (75 %).**

- **Where:** `L1440-explorer.jpg`; the hero, the standfirst and the bottom-right module title "Half of 3,093 series order every month; 16 accounts were lost".
- **What:** `KIND_FOLD` in `views/Explorer.tsx` (lines 286–291) folds kinds M and A (monthly with one shutdown month) into "Monthly". The text counts M only (1,539), in `insights/explorer.ts` line 237 and `views/Explorer.tsx` line 760.
- **Why:** This is the round-1 hero fix (AD M17 / US M8) regressing into a direct contradiction in the fold area: the eye goes from "Half" to a bar three quarters dark.
- **Fix:** make the text use the strip's variable, for example "Three in four of the 3,093 series order monthly (775 of them skip one shutdown month a year)". Compute `(kinds.M + kinds.A) / nSeries` in both templates. Alternatively split the strip into "Every month 1,539" and "All but one month 775" so the text can keep "half".

**M2. ERP-migration cells carry four different counts, and the Anomaly monitor's annotations name one type but count the whole class.**

- **Where:** `L1440-anomalies.jpg`, `L1440-overview.jpg`, `L1440-explorer.jpg`, Data health.
- **What:**
  - The anomaly chart reads "Data error: ERP blank, **135 cells** in May 2023". The register has **113** ERP-blank cells in May 2023; 135 is all data-error cells that month (113 ERP + 10 missing rows + 7 sign + 5 scale).
  - Likewise "Real event: Listed stock-out, 387 cells in Jan 2022": listed stock-outs are 218 of those 387 real-event cells.
  - The Overview and Explorer timelines say "33 missing rows rebuilt; **330** cells with units unknown".
  - The figure tile directly below says "**331** units unknown"; Data health says 331 (and 332 blank in the files); the anomaly type table says 332.
- **Why:**
  - It is the same set of cells, and the bridge from 332 to 331 is explained only on Data health; 330 is explained nowhere.
  - An annotation that names a type must count that type.
  - This is the remaining half of round-1 M13.
- **Fix:**
  1. `views/Anomalies.tsx` line 99: title by class with the leading type, for example title "Data errors, May 2023" and text "135 cells, 113 of them ERP blanks". Alternatively count `types[0][1]`: "ERP blank: 113 of 135 flagged cells".
  2. `charts/timeline.ts` line 714 computes `unknown = total − rowsMissing` from the `imputed` bit (363 − 33 = 330). Count the `units_unknown` bit instead, exactly as `repairFacts` does (`units_unknown && !missing_row`, which gives 331 in Mar–May 2023):
     - add an `unknown` array to `ForecastAgg` / `HistAgg` in `data/aggregate.ts` (`if ((fl & b.units_unknown) && !(fl & b.missing_row)) out.unknown[t]++`);
     - read it in the annotation.

**M3. The README and the submission text quote different benchmark numbers, and a different floor name, from the dashboard.**

- **Where:** `README.md` lines 27–28, `docs/submission.md` lines 43–44, `docs/methodology.md` lines 502 and 825, against the Overview's accuracy figure, the brief, the Forecast hero, the value-added table and the What-if footnote.
- **What:**

  | | Documents (`summary.json` ladder, mean of folds) | Screen (`metrics.csv` pooled over cells) |
  |---|---|---|
  | Seasonal naive | 38.7 % | 38.6 % |
  | Cycle-aware naive | 31.2 % | 31.1 % |
  | Floor | 23.6 %, "noise floor" | 23.5 %, "in-hindsight floor" |
  | Gap to the floor | "2.5 WAPE points above it" | "2.6 points above" |

  Both trace to pipeline files, but only `docs/dashboard.md` line 140 explains the difference.
- **Why:**
  - The jury reads the README and the portal text first, then opens the app.
  - One fact must have one value and one name (gate item 20); a forecasting judge will notice the floor moving.
- **Fix (documents only; the app is internally consistent):** quote the pooled values the app shows (38.6 / 31.1 / 23.5, "2.6 points") and use the app's term "in-hindsight floor" (or rename it on screen to "noise floor"; one term either way). If the fold-mean values are kept, add one sentence: "the dashboard pools cells across folds (38.6 / 31.1 / 23.5)".

**M4. Filter bar: Family, Region and Channel cannot be chosen by keyboard (regression of round-1 US M5).**

- **Where:** `components/FilterBar.tsx` lines 182–189; every view.
- **What:**
  - The non-searchable listbox relies on `autoFocus` on a `div`. React honours `autoFocus` only on form controls, so focus never leaves the chip.
  - The `onKeyDown` that moves the highlight sits on `.combo-pop`, which never receives the keys.
  - Measured: after ArrowDown, ArrowDown, ArrowDown and Enter, `activeElement` is still the chip, the highlight is still "All", the list closes and nothing is selected.
- **Why:**
  - The three most-used filters are unreachable by keyboard; the masthead and table rows offer partial workarounds.
  - `design_gate_results.md` marks UI/UX item 3 and the combobox as Pass.
- **Fix:** add `const listRef = useRef<HTMLDivElement>(null)` and `useEffect(() => { if (open && !props.searchable) listRef.current?.focus(); }, [open])`, and put `ref={listRef}` on the listbox. Alternatively, while open, handle the keys on the chip button too (call `onKey` from the button's `onKeyDown` and put `aria-activedescendant` on the button). Re-test Family / Region / Channel with real key events.

### Minor

| # | View | What | Fix |
|---|---|---|---|
| m1 | Overview | Brief: "Precision Machined Parts gains 1.01 pts … the largest shift of any region, family or channel". The change table footnote just right of it: "The mix barely moves: the largest share shift is North America, −0.34 pts" (regions only) | `insights/overview.ts` line ~198: "… among regions …" |
| m2 | Overview | Top-five reasons still truncated: row 5 "Launches Mar 2027, no hist…" at 1440; every row at 375 and 768 px | Allow two lines in the top-five list (`Overview.css`) or shorten `reasonShort()` for cold starts ("Launch Mar 2027") |
| m3 | Overview | Revenue tile "list prices +4.5 % in 2027, +8.7 % in 2028" reads as year-on-year; the README says "+4.0 % more in 2028" | "+8.7 % in 2028 against 2026" (`views/Overview.tsx`) |
| m4 | Lifecycle | Ramp ratios use unrounded means: PMP-019 31 → 107 printed ×3.44 (107 / 31 = ×3.45); THM-011 83 → 169 printed ×2.02 (×2.04) | Compute the ratio from the printed averages, or print the averages to one decimal (`views/g2` lifecycle table) |
| m5 | Exception inbox | "Powertrain Components carries a quarter of the risk" while Precision Machined Parts holds $18.8M against $18.9M | Tie check in the heat-table title template: "Powertrain and Precision Machined Parts each carry about a quarter" |
| m6 | Forecast (single series) | Hero bias −1.1 % (the series) next to the heatmap title "Electrical Assemblies in India: bias −1.2 %" (the family × region cell) | Name the scope in the bias title: "the Electrical Assemblies × India cell: −1.2 %" |
| m7 | Forecast | Colophon: "improved WAPE + \|bias\| in only 0 of 4 folds" | "in none of the 4 folds" when the count is 0 |
| m8 | Forecast | "Error grows from 24.5 % … to a 27.7 % peak" on a 0–80 % axis that draws a flat line | Template: "Error stays between 24.5 % and 27.7 % at every horizon"; keep the honest axis |
| m9 | Anomaly monitor | Type tables print impact unsigned ("Units ×10 or ×100: 521,694"); the register prints it signed (−376K, −146K). "Surcharge +70.8K units" sits next to the action "no demand effect" (the pipeline's `impact_units`) | Same sign convention in both; label the column "Units affected" where the action changes no demand, or print "–" |
| m10 | Anomaly monitor | The expanded row prints the evidence as raw JSON (`{"by_channel":{"Direct OEM":264,…}`) | Render it as "key: value" pairs in the detail renderer |
| m11 | Anomaly monitor | "2,558 data errors: 2,227 corrected or rebuilt" against 7,917 repaired cells (6,604 corrected, 982 rebuilt) on the Overview and Data health, with no bridge | One sentence: "the other N repaired cells (units blank, price and revenue fixes) are file-wide episodes" |
| m12 | What-if | `--scenario` `#7862BF` equals `--cat-2` (Chassis & Structural); the delta bars are heavy violet fills, the loudest mass on the page | A scenario token outside the categorical set; a lighter tint for the bars |
| m13 | All | `theme=` in the hash only applies on a full load. Going from `#/overview?theme=light` to `#/overview?theme=dark` in the same tab keeps light, so the URL no longer reflects the state | Re-read `theme` on `hashchange` in `app/context.ts` |
| m14 | XL (≥ 2560) | The 70-ch standfirst ends far from the hero: about 500 px of empty paper at 2560 and about 890 px at 3840 (`X2560-overview.jpg`, `X3840-exceptions-dark.jpg`) | At ≥ 1920 make the lede grid `minmax(0, 70ch) minmax(0, 1fr)`, or step the display size up so the headline holds the column |
| m15 | Explorer | "Ending in the window: 9 SKUs discontinued or end of life announced" includes 6 SKUs discontinued before the window | "3 end in the window; 6 already discontinued" |
| m16 | Data health | Rule labels cut with "..." ("K2 Latest load = Shipped_Units on restate...", "Restored exactly or dropped, l...") | Use "…" and wrap the "How it was fixed" cell |
| m17 | Macro (dark) | The deck says "ink outline" for driver cells, but the outline is chalk in dark theme | "outlined" |
| m18 | Anomaly monitor | "15 more types with 0 cells in the register", while two zero-cell types (Launch ramp, End-of-life decline) are listed above | "15 more types with no flags in the selection" |

---

## 4. Number cross-check (screen against pipeline files)

All read-only, with `.venv/bin/python`.

| # | On screen (views) | Value | Pipeline source | Agrees |
|---|---|---|---|---|
| 1 | Overview hero, Forecast table, Data download | 2.81M; 2,805,199 units, 58,219 rows | `forecast/submission.csv` sum and row count | yes |
| 2 | Overview "against 2.70M", +3.9 % | 2.70M | `clean/train_clean.parquet` `demand_filled` Apr 2025–Oct 2026 = 2,699,398; 2,805,199 / 2,699,398 = 1.0392 | yes |
| 3 | Overview / Explorer / Forecast "next 12 months land 4.8 % above" | +4.8 % | 1,795,469 / 1,712,458 | yes |
| 4 | Overview region table | Europe +16.2K +5.0 %, LatAm +15.9K +5.7 %, AP +15.5K +4.9 %, India +15.2K +4.8 %, MEA +10.5K +6.8 %, NA +9.7K +3.0 % | submission − train (12 + 12 months) | yes |
| 5 | Overview brief peak and low | Mar 2027 160K; Aug 2027 131K | submission monthly 159,766 / 131,073 | yes |
| 6 | Timeline end label | 153K, P10–P90 149K–157K | `forecast/aggregates.csv` total 2028-05: 152,997, 148,861–157,182 | yes |
| 7 | Forecast X-ray, Nov 2026 | 158K | `aggregates.csv` total 2026-11 forecast 157,615 | yes |
| 8 | Overview / Forecast / What-if ladder | 26.1 / 38.6 / 31.1 / 51.6 %, floor 23.5 %, bias +0.2 %, 225,942 cells | `backtest/metrics.csv` series level pooled over the 4 decision folds: 0.2607 / 0.3862 / 0.3113 / 0.5157 / 0.2354 / +0.0020, n 225,942 | yes (the documents differ: M3) |
| 9 | Forecast region rows | MEA 34.2 / 50.4 / 30.9 / +1.3 %; Europe 23.1 / 35.1 / 20.9 / 0.0 % | `metrics.csv` region slice pooled | yes |
| 10 | Forecast horizon title | 24.5 % at 1 month, 27.7 % peak at 16 | `metrics.csv` horizon slice: 0.2453, 0.2768 (h16 is the maximum) | yes |
| 11 | Errors cancel | total 1.8 % vs seasonal naive 8.3 %; SKU 14.6 / 24.9 % | `metrics.csv` level total 0.0175 / 0.0832; sku 0.1465 / 0.2493 | yes |
| 12 | Calibration | series 10.2 / 80.0 / 9.8 % of 193,953 actuals | `backtest/summary.json` coverage (n 193,953; leave-one-origin-out pooled 10.2 / 9.8) | yes |
| 13 | Time machine, origin Mar 2025 | 25.1 % vs 37.0 % seasonal naive | `metrics.csv` origin 2025-03: 0.2507 / 0.3703 | yes |
| 14 | Data health hero and headline | 61 → 108 of 116; 47 of 90 blocking; per file 44 / 1 / 2 / 6 / 0 / 2 / 0; completeness 17 of 26 | `quality/dq_report.json` checks | yes |
| 15 | Data health bridge | 248,248 → 244,566 → 245,548; 982 rebuilt | `dq_report.json` summary | yes |
| 16 | Lost sales (Overview, brief, Stock-outs) | 106,925 units, $109.9M, 0.90 %; 18,077 back-ordered | `dq_report.json` stages.demand: 106,924.5, $109,949,627, demand 11,831,099.5; `train_clean` `backorder_out` 18,077 | yes |
| 17 | Stock-outs | Electrical Assemblies 75 %; Oct 2021 peak 7,331; 2021 50,125 (47 %); ELA-087 · Europe $1.4M for 695 units | `train_clean` lost units by family / month / year; ELA-087 price $2,006 | yes |
| 18 | Anomaly monitor | 11,463 cells: 2,558 errors and 8,905 real events; 11,799 rows; 336 episodes (37 + 299); 2,265 series; 134 causes; peak Jan 2022 404 | `anomalies/anomaly_register.csv` | yes |
| 19 | ERP cells (Overview, Explorer, Anomaly monitor, Data health) | 330 / 331 / 332 / "135 in May 2023" | register: 332 `DE.SYSTEM_BLANKING` cells (108 / 111 / 113 in Mar / Apr / May 2023); history `units_unknown` 331 | **no** (M2) |
| 20 | Inbox, rail, brief, watch list | 305 cases, 304 series, $70.43M; tabs 191 / 16 / 10 / 18 / 62 / 8 | `public/data/exceptions.json` | yes |
| 21 | Lifecycle | PTC-005 last units May 2027 (180), 0 after; successors 488 vs 997 a month = 49 % | submission + `train_clean` | yes |
| 22 | Explorer | 36,361 zero cells, 36,128 scheduled; 1.71M, −0.5 %; Brake & Safety 322K = 18.8 % | `train_clean` `demand_filled`, `is_structural_zero` | yes |
| 23 | Explorer, PTC-002 · NA | "55 zero months, none lost demand" | `train_clean`: 55 zero months, 17 `is_lost_account` | **no** (C1) |
| 24 | Overview, Hydraulic Systems | 349K vs 319K, +9.3 % | submission 348,512; train 318,771 | yes |
| 25 | What-if reach | 1,558 of 3,068 series; EV adoption 0 series | consistent with the Macro view ("EV adoption drives none") | yes (internal) |
| 26 | Procurement footnote | 90.2 % at or below P90 | 100 − 9.8 % above P90 on Forecast | yes (internal) |

**The same fact in several places.** These now agree everywhere:

- 2.81M and P10–P90 2.73M–2.88M (Overview, What-if, documents);
- $2.52B (Overview, Inbox, What-if);
- 26.1 % and 23.5 % (Overview, Forecast, What-if);
- 106,925, $109.9M and 0.90 % (Overview, brief, Stock-outs);
- 7,917 = 6,604 + 982 + 331 (Overview, Data health);
- 305 cases and $70.4M (rail, Overview, Inbox);
- "Last order May 2025; silent 17 months" (five places);
- 5 of 7 stable families (headline, hero, footnote 71 %).

The exceptions are C1, M1, M2 and M3 above.

---

## 5. Problem statement §5 coverage

| View | Must show | Present |
|---|---|---|
| Executive overview | Units and revenue from history into the forecast on one timeline; mix by family, region and channel; headline 19-month forecast | Yes. One timeline, with the USD lens giving "Revenue grows 11.2 %" and the revenue sparkline in the figure strip; region / family / channel table and family small multiples; hero 2.81M with P10–P90 |
| Data health | Issues by type and file; rows affected; before vs after | Yes. Rule ledger grouped by file with a quality dimension; rows and cells columns; checks ledger raw → after; hero 61 → 108; row bridge |
| Demand explorer | Drill family → SKU → region → customer; seasonality; zero months; lifecycle | Yes. Breadcrumb "All / Powertrain Components / PTC-002 / North America" with the customer list; seasonal profile; zero-month calendar; SKU lifecycle and series card (C1 is a wording defect, not a missing item) |
| Anomaly monitor | Flagged points on the series, with type, reason and action | Yes. Clustered months at aggregate level, every flag for one series; register with type / reason / action and expandable full text |
| Forecast & accuracy | Forecast vs history; WAPE and bias by family, region and horizon | Yes. Shared timeline and time machine; family / region / channel tabs and a bias heatmap; horizon chart with a WAPE / Bias toggle |

**All 7 optional views exist and work in the states exercised:**

- Macro: `fam=HYD`;
- What-if: preset and `wi=auto_production_yoy_pct&ws=-5&wf=2027-01&wn=6`;
- Procurement: `sl=0.95&lt=6`;
- Lifecycle: an empty state under `fam=HYD`;
- Stock-outs: `fam=HYD&reg=Europe`;
- Exception list: `fam=HYD` keeps the frame and re-ranks;
- Data download: 23 of 23 hashes.

---

## 6. Responsiveness and the extra-large layout

- **Overflow:** 0 px of horizontal page scroll on all 12 views at 375, 768, 1024, 1280, 1440, 1920, 2560 and 3840 px (probe: document scroll width, plus any element outside the viewport not clipped by a scroll container).
- **375 px:** the five required views are usable. Headline at y ≈ 345, the watch list before the hero, the filter chips folded behind "Filters", annotations numbered on the plot, and year labels thinned (2019 / 2022 / 2025 / 2028, verified in a real 375 viewport, `N375-explorer-chart.jpg`). The anomaly register shows only Type and Series without a sideways scroll, but the disclosure gives the full text.
- **768 / 1024 / 1280 × 720:** clean stacking. At 1280 × 720 the first chart shows only its top 50–70 px above the fold. That is acceptable: the fold gate is defined at 1440 × 900, which passes on all views.
- **Extra-large, judged as a designer:**
  - It now looks deliberate. The column is centred; the bars end on the content edge; prose keeps its limits (headline 24 ch, standfirst 70 ch); type steps up by about 1.07 / 1.2 / 1.47.
  - The timeline keeps about a 3.4 : 1 shape.
  - The Overview's brief, change table and top five sit in three columns from 1920 px; the inbox case file widens.
  - Nothing is oversized, and the 4K dark inbox reads comfortably.
  - The one weakness is the lede band at ≥ 2560 px: a hole of 500–900 px between the standfirst and the hero (m14). Line lengths are sane everywhere, and no table spans an absurd width.

---

## 7. The jury read: what a cold judge gets in three minutes

**What they come away with**

- In ten seconds on the Overview, they understand:
  - the forecast: 2.81M units over 19 months, +3.9 %, P10–P90 2.73M–2.88M;
  - the risk: the Orion shutdown;
  - the action: 305 cases worth $70.4M, led by a lost account;
  - a single timeline where ink is the past and orange is the future, with real events annotated.
- The black rail reads as a table of contents (What happened / What will happen / Act).
- The design looks nothing like a template. This scores well on clarity and on presentation.
- **Quality of insights** is the strongest criterion here:
  - lost sales and unconstrained demand;
  - zero months explained by ordering cycles;
  - the value-added ladder against honest benchmarks and an in-hindsight floor;
  - pooling savings in Procurement;
  - EV against ICE demand.
  Each is a sentence computed from the data, with a number and a "so what".
- **Originality** is visible:
  - the forecast X-ray (season × macro × EV × lifecycle × event × cycle placement);
  - the backtest time machine;
  - browser-side SHA-256 verification of every file;
  - the quantile self-check;
  - Record_ID-grid forensics on Data health.

**What would confuse them**

1. The contradictions above, if they click through. The inbox → case 1 → Demand explorer path lands on C1.
2. README numbers against screen numbers (M3).
3. Jargon a non-planner will not know without the masthead glossary: "Orders as booked | Latent demand", "cycle-aware naive", "in-hindsight floor", "Quantile engine: 7 of 7 checks" in the rail.
4. Volume: twelve views, text-rich modules, and Data health at 4,200 px. A judge with three minutes sees the Overview, one drill-down and one view of the forecast.

**The three changes that would most raise the score now**

1. **Make every number on the demo path agree (C1, M1, M2).** These are one-line template and count fixes in `insights/explorer.ts`, `views/Explorer.tsx`, `views/Anomalies.tsx` and `charts/timeline.ts`. A single contradiction caught by a judge costs more than any polish gains.
2. **Bring the documents in line with the screen (M3).** Use one set of benchmark numbers (pooled 38.6 / 31.1 / 23.5, "2.6 points") and one name for the floor in `README.md`, `docs/submission.md` and `docs/methodology.md`; the jury reads these before the app.
3. **Put the two signature moves one click from the Overview.** The backtest accuracy tile could link straight to `#/forecast?origin=2025-03` ("Replay the forecast made in March 2025: 25.1 % vs 37.0 %"), and the hero to the Nov 2026 X-ray. These are the most original pieces, and the demo script needs them in under 30 seconds.

Fix M4 (keyboard filters) too. A jury will rarely see it, but the gate file claims it passes.

---

## 8. Gate claims checked (`docs/design_gate_results.md`)

The claims below are disproved by this build:

- **UI/UX item 3** (keyboard, no traps) is marked P on 9 views and N on 3. The filter bar's Family / Region / Channel comboboxes cannot be operated by keyboard on any view (M4), so item 3 should be F everywhere until that is fixed.
- **Item 20** (facts agree) is marked P on OV / EX / AN. It fails:
  - on the Explorer (M1, C1);
  - on the Anomaly monitor (M2: "ERP blank 135");
  - on the Overview (M2: 330 vs 331).
- The **extra-large rows** are all P. I agree on centring, overflow and type scale. "No empty half-screen" holds, but the ≥ 2560 lede still leaves a visible hole (m14, minor).

Confirmed true:

- no horizontal scroll at any width (item 12);
- drawer focus trap and name (item 5);
- Escape clears `cell=` (item 24);
- dark heatmap contrast (item 16);
- the shared anomaly bar scale and marks on their values (item 18);
- the measured XL geometry (within ±7 px of the claimed values).

Not exercised: hover tooltips, CSV builders, back-button scroll restoration.

---

## Findings (JSON)

```json
[
  {"view": "Demand explorer (single series, e.g. PTC-002 · North America)", "problem": "Headline says the account last ordered May 2025 and has been silent 17 months; the standfirst says all 55 zero months are scheduled off-months and 'none is lost demand'; the zero-month module title and the 12-month strip say the same. 17 of the 55 months are lost-account months (8 on order months). It is the drill-down from the inbox's case 1, on the demo path. The same miscount makes the aggregate 'Ordering cycles explain 99.4 %' include 204 lost-account months.", "fix": "dashboard/src/insights/explorer.ts lines 48-49: test lost_tail before structural_zero (the pipeline sets both on lost-account months): if (fl & b.lost_tail) z.lost++ else if (fl & b.structural_zero) z.sched++ else z.unexp++. The strip, calendar, standfirst and module title then read '38 scheduled off-months and 17 after the account was lost'.", "severity": "critical"},
  {"view": "Demand explorer", "problem": "Standfirst and module title say 'Half of the 3,093 series order every month' while the captioned hero strip beside them shows 'Monthly 2,314' (75 %): KIND_FOLD folds monthly-with-one-shutdown (A) into Monthly, the text counts M only (1,539). Regression of round-1 AD M17 / US M8.", "fix": "Use one variable: in insights/explorer.ts (line 237) and views/Explorer.tsx (line 760) count kinds.M + kinds.A and say 'Three in four of the 3,093 series order monthly (775 skip one shutdown month a year)', or split the strip into 'Every month 1,539' and 'All but one month 775'.", "severity": "major"},
  {"view": "Anomaly monitor / Overview / Demand explorer", "problem": "ERP-migration cells carry four counts: timeline annotation '330 cells with units unknown' (computed as imputed minus missing rows), figure tile and Data health 331, type table 332, and the anomaly chart 'Data error: ERP blank, 135 cells in May 2023' where the register has 113 (135 is all data-error cells that month). Likewise 'Listed stock-out, 387 cells in Jan 2022' counts all real events (218 listed stock-outs).", "fix": "views/Anomalies.tsx line 99: title the annotation by class and name the leading type with its own count ('Data errors, May 2023: 135 cells, 113 ERP blanks'). charts/timeline.ts line 714: count units unknown from the units_unknown bit (units_unknown and not missing_row, as repairFacts does), adding an unknown array in data/aggregate.ts, giving 331.", "severity": "major"},
  {"view": "Documents vs all accuracy figures", "problem": "README, docs/submission.md and docs/methodology.md quote seasonal naive 38.7 %, cycle-aware naive 31.2 %, 'noise floor' 23.6 %, '2.5 points above it' (summary.json, mean of folds); every view shows 38.6 %, 31.1 %, 'in-hindsight floor' 23.5 %, '2.6 points' (metrics.csv pooled). The jury reads the documents first.", "fix": "Edit README.md lines 27-28, docs/submission.md lines 43-44, docs/methodology.md lines 502 and 825 to the pooled values the app shows and one term for the floor (or add one sentence explaining pooled vs fold-mean). No app change needed.", "severity": "major"},
  {"view": "Filter bar (all views)", "problem": "Family, Region and Channel comboboxes cannot be operated by keyboard: autoFocus on the listbox div is ignored by React, focus stays on the chip, ArrowDown does not move the highlight, Enter closes the list without choosing (measured live). SKU and Customer (searchable) work. Regression of round-1 US M5; the gate file marks it Pass.", "fix": "components/FilterBar.tsx: add listRef on the role=listbox div and useEffect(() => { if (open && !props.searchable) listRef.current?.focus() }, [open]); or route the chip's onKeyDown to onKey while open and put aria-activedescendant on the chip. Re-test with real key events.", "severity": "major"},
  {"view": "Executive overview", "problem": "Brief 'Precision Machined Parts gains 1.01 pts … the largest shift of any region, family or channel' next to the change-table note 'the largest share shift is North America, −0.34 pts' (regions only).", "fix": "insights/overview.ts mix footnote: say 'among regions'.", "severity": "minor"},
  {"view": "Executive overview", "problem": "Top-five exception reasons still truncated: row 5 'Launches Mar 2027, no hist…' at 1440 px, all rows at 375 and 768 px.", "fix": "Allow two lines in the top-five reason (Overview.css) or shorten reasonShort() for cold starts.", "severity": "minor"},
  {"view": "Executive overview", "problem": "Revenue tile 'list prices +4.5 % in 2027, +8.7 % in 2028' reads as year-on-year; the README says '+4.0 % more in 2028'.", "fix": "'+8.7 % in 2028 against 2026' in views/Overview.tsx.", "severity": "minor"},
  {"view": "Lifecycle", "problem": "Ramp ratios use unrounded means: 31 → 107 printed ×3.44 (×3.45 from the printed values), 83 → 169 printed ×2.02 (×2.04).", "fix": "Compute the ratio from the printed averages or print averages to one decimal.", "severity": "minor"},
  {"view": "Exception inbox", "problem": "Heat-table title 'Powertrain Components carries a quarter of the risk' while Precision Machined Parts holds $18.8M against $18.9M.", "fix": "Tie check in the title template: name both families.", "severity": "minor"},
  {"view": "Forecast & accuracy (single series)", "problem": "Hero bias −1.1 % (series) next to the heatmap title 'Electrical Assemblies in India: bias −1.2 %' (family × region cell), unlabelled scope.", "fix": "Say 'the Electrical Assemblies × India cell' in the bias title template.", "severity": "minor"},
  {"view": "Forecast & accuracy", "problem": "Colophon 'improved WAPE + |bias| in only 0 of 4 folds'.", "fix": "'in none of the 4 folds' when the count is zero.", "severity": "minor"},
  {"view": "Forecast & accuracy", "problem": "Title 'Error grows from 24.5 % … to a 27.7 % peak' on a 0–80 % axis that draws a nearly flat line.", "fix": "Template: 'Error stays between 24.5 % and 27.7 % at every horizon' (keep the honest axis).", "severity": "minor"},
  {"view": "Anomaly monitor", "problem": "Impact is unsigned in the type tables and signed in the register; 'Surcharge +70.8K units' sits next to the action 'no demand effect'.", "fix": "One sign convention; label 'Units affected' or print '–' where the action changes no demand.", "severity": "minor"},
  {"view": "Anomaly monitor", "problem": "Expanded register row prints the evidence as raw JSON.", "fix": "Render the evidence object as key: value pairs.", "severity": "minor"},
  {"view": "Anomaly monitor", "problem": "'2,558 data errors: 2,227 corrected or rebuilt' has no bridge to the 7,917 repaired cells (6,604 corrected, 982 rebuilt) on the Overview and Data health.", "fix": "Add one bridge sentence naming the file-wide episodes that hold the other repaired cells.", "severity": "minor"},
  {"view": "What-if scenarios", "problem": "--scenario #7862BF equals --cat-2 (Chassis & Structural); the delta bars are heavy violet fills, the loudest mass on the page.", "fix": "A scenario token outside the categorical set; a lighter tint for the delta bars.", "severity": "minor"},
  {"view": "All views", "problem": "theme= in the hash applies only on a full load; a same-tab hash change to theme=dark stays light, so the URL no longer reflects the state.", "fix": "Re-read theme on hashchange in app/context.ts.", "severity": "minor"},
  {"view": "Extra-large screens (≥ 2560 px)", "problem": "The lede leaves a 500–900 px hole between the 70-ch standfirst and the hero figure.", "fix": "At ≥ 1920 px set the lede grid to minmax(0,70ch) minmax(0,1fr) with the hero beside the prose, or step the display size up.", "severity": "minor"},
  {"view": "Demand explorer", "problem": "'Ending in the window: 9 SKUs discontinued or end of life announced' includes 6 SKUs discontinued before the window.", "fix": "'3 end in the window; 6 already discontinued'.", "severity": "minor"},
  {"view": "Data health", "problem": "Rule labels cut with '...' ('K2 Latest load = Shipped_Units on restate...', 'Restored exactly or dropped, l...').", "fix": "Use the ellipsis character and wrap the 'How it was fixed' cell.", "severity": "minor"},
  {"view": "Macro lead / lag (dark)", "problem": "Deck says 'ink outline' for driver cells; the outline is chalk in dark theme.", "fix": "Say 'outlined'.", "severity": "minor"},
  {"view": "Anomaly monitor", "problem": "'15 more types with 0 cells in the register' while two zero-cell types are listed above it.", "fix": "'15 more types with no flags in the selection'.", "severity": "minor"}
]
```
