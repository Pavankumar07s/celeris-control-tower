# Skeptic review of lens `labels-keys`

Reviewed report: `research/labels-keys.md` (14 findings).
Everything below was recomputed from `data/raw/*.csv` (`dtype=str, keep_default_na=False`) with fresh code in
`research/scratch/labels-keys-verify/` (working files, not included in the repository; `vcommon.py`, `v01`..`v18`). I wrote my own canonicalisers, date parser,
Record_ID decoder, de-duplication and a rough units clean; none of the investigator's scripts were imported. Their deliverable artefacts
were only compared with my results at the end (`v16_artefacts.py`).

**Bottom line.** Nothing in this lens is refuted. 11 findings are confirmed as written, 3 are confirmed in substance but carry numbers or
wording that must be corrected before they reach the pipeline or the write-up (9, 11, 13). The key decode, the missing-row list, the
duplicate rule, all label maps, the 23 customer switches and the 16 lost accounts reproduce exactly. The investigator's artefacts agree with
my independent decode on every one of the 248,248 raw rows (SKU, Region, month, customer, channel, latest-version flag).

Units used in sections 9-11 and 13 are my own rough clean (dash and blank-with-zero-price = 0, sign errors flipped, blank units restored
from revenue / price, units x10 / x100 divided, India pack-of-10 block x10, price-in-cents left alone); 380 cells stay unknown.
That clean reproduces the numeric lens's error counts (293 x10, 75 x100, 614 price-in-cents, 385 pack-of-10, 491 negatives) without using its code.

---

## Verdicts

| # | Finding | Verdict |
|---|---|---|
| 1 | Record_ID is a running index over the (SKU, region, month) grid; exact decoder | **confirmed** |
| 2 | 3,083 series, 245,548 cells, 982 missing rows | **confirmed** |
| 3 | Load_Timestamp / Year / Month as second date check | **confirmed** |
| 4 | Duplicates: 2,946 exact copies + 736 re-loads | **confirmed** (and rule 2 now validated against an outside source) |
| 5 | Region 31 variants -> 6, blanks fully recoverable | **confirmed** (two secondary numbers differ, see below) |
| 6 | Sales_Channel 17 -> 4, static per series | **confirmed** |
| 7 | SKU_ID 2,659 -> 598 | **confirmed** |
| 8 | Customer_Name 220 -> 12 | **confirmed** |
| 9 | 23 customer switches, "all permanent level shifts" | **partially_confirmed** (list exact; "all" is overstated) |
| 10 | Customer-scoped events joined on the customer at that time | **confirmed** (magnitudes tightened; Orion analogue is an assumption) |
| 11 | 16 lost accounts | **partially_confirmed** (list exact; the "8-month runs" and one level are raw-data artefacts) |
| 12 | Family / BU / description, PMP-004 and BSS-018 master conflicts | **confirmed** |
| 13 | Test keys vs train, post-EOL rows, launch ramp | **partially_confirmed** (keys exact; the pooled ramp table must not be used) |
| 14 | Corruption process: fixed fractions, independent | **confirmed** |

---

## Evidence per finding

### 1. Record_ID decode — confirmed
- 248,248 rows, all `CEL-9999999`; numeric part 1..245,548; 244,566 distinct.
- In Record_ID order the SKU is non-decreasing and there are exactly 3,083 runs of (SKU, non-blank region); no (SKU, region) pair appears in two runs.
- Closed form rebuilt from `sku_master.csv` + region order alone: 3,083 series, 245,548 cells. Decoding every raw row: SKU 248,248 / 248,248,
  Region 247,503 / 247,503 non-blank, Date 248,218 / 248,248; the 30 exceptions are all `2062-MM` with Year = 2026 and a 2026 load date.
- Region order equals first appearance in test.csv for 592 / 592 shared SKUs; 433 distinct order patterns; regions per SKU 6: 258, 5: 178, 4: 159, 3: 3.
- Counter-example hunt: none. One dependency worth stating plainly: with the master's Launch_Dates **as they are** the closed form gives
  245,532 cells and collapses (240,165 date disagreements), because BSS-018 shifts every later block by 16. The closed form only works with
  BSS-018 launch = 2025-02. The block table derived from train alone (`record_id_blocks.csv`) does not have this dependency; use the table, not the formula.

### 2. Grid and missing rows — confirmed
- Missing IDs 982 (= int(0.004 x 245,548)); 974 singles + 4 pairs; per block {0: 2,252, 1: 695, 2: 124, 3: 9, 4: 3}; by year 92/102/106/134/130/151/138/129
  (rate 0.38-0.42 % every year); by region 0.35-0.45 %; by family 124-154.
- 10 cells are a series' first month, 16 are 2026-10 (same 16 series as listed). 26 missing cells are in `inventory_stockouts.csv`.
- Series starts: 1,997 non-MEA at 2019-01, 566 non-MEA later, MEA 520 (461 at 2022-01, 59 later); 25 series end before 2026-10. No series starts later than max(launch, 2019-01, MEA 2022-01).
- LatAm ERP window: 4 of 1,430 cells missing; unknown quantity on 128 / 135 / 129 rows for 2023-03 / 04 / 05 against 3-6 in neighbouring months
  (the report says 128 / 135 / 128; the one-row difference is a `-` placeholder I count as non-numeric).
- Extra support for the fill rule: inventory `Shipped_Units` equals my cleaned train units on 5,767 of 5,803 matched rows; the other 36 are India pack-of-10 rows that differ by at most 5 (rounding). All 5,830 inventory keys fall inside the decoded grid.

### 3. Load_Timestamp, Year, Month — confirmed
- Load month minus delivery month = 1 on 248,248 / 248,248 rows; file is sorted by Load_Timestamp; first loads on day 1-3, hours 01-05.
- Year never disagrees with the decoded date. Month disagrees on 246 rows: 230 are true month + 1, 16 are December written as 1.
- Date formats: `YYYY-MM` 238,281; `YYYY/MM` 1,703; `Mon YYYY` 1,689; `YYYY-MM-DD` 1,672 (day always 01); `Mon-YYYY` 1,659; `MM/YYYY` 1,623; `MM-YYYY` 1,621.

### 4. Duplicates — confirmed
- 3,682 IDs with two versions, none with three: 2,946 byte-identical with the same timestamp, 736 re-loads 5-24 days later in the same month,
  same time of day on 736 / 736, day of month 6-27. No pair has the same timestamp and different content, so rule 2 is never ambiguous.
- Re-loads differ only in Units_Sold and Revenue_USD (732 of 736); 350 up, 382 down; new / old 0.667-1.80; both versions reconcile revenue = units x price.
- **New evidence the report did not have:** 17 re-loaded IDs are stock-out months listed in `inventory_stockouts.csv`. The latest version equals `Shipped_Units`
  on 17 / 17; the older version on 0 / 17. Business rule 2 is therefore true in the data, not only in the brief.

### 5. Region — confirmed, two secondary numbers differ
- 31 raw values (30 non-blank + blank); each non-blank variant maps to exactly one decoded region; my canonicaliser disagrees with the decode on 0 rows.
  Types: canonical 241,304; case 2,244; abbreviation 1,948; whitespace 1,315; punctuation 504; wording 188; blank 745 raw rows = 737 IDs. Literal `NA` = 207 rows (745 + 207 = 952).
- Recovery without Record_ID, my implementation: method B (SKU, customer, channel unique to one region) 671 / 737, 0 wrong; B and C combined 737 / 737, 0 wrong.
- Corrections (small): (i) the true-region breakdown printed in the report (Europe 138, LatAm 137, India 134, APAC 133, NA 113, MEA 90) sums to 745, i.e. it is per **raw row**;
  per unique ID it is Europe 137, India 133, LatAm 133, APAC 131, NA 113, MEA 90 = 737. (ii) Method C alone resolves 529 / 737 if no lifecycle window is applied and 711 / 737 when candidate
  regions are limited to their observed span (report: 717); in the span-limited version the true region is not among the candidates for 1 ID at a series edge.
  The number depends on how "region active in that month" is defined, so quote B-and-C (737 / 737) and Record_ID, not C alone.

### 6. Sales_Channel — confirmed
- 17 raw values -> 4; 3,745 non-canonical rows; 0 blanks; 3,083 / 3,083 series have one channel; test has one channel per series and it equals train for 3,058 / 3,058.
  Export series: MEA 239 of 520, other regions 32-50.

### 7. SKU_ID — confirmed
- 2,659 raw values -> 598, all in the master and equal to the decoded SKU on every row; 3,741 non-canonical rows, exactly one defect each:
  lowercase 768 (417 variants), no dash 767 (411), leading whitespace 749 (416), dropped zero 738 (414), underscore 719 (403).

### 8. Customer_Name — confirmed
- 220 raw values -> 12 (the 12 names in test.csv); 2,490 non-canonical rows: ` Inc.` 631, double space 629, upper case 609, one letter deleted 566 (155 variants), one space deleted 55 (17 variants).
- No single-deletion string is shared by two canonical names; no deletion hits the first or last character; 0 unmapped rows.
- Atlas Mideast Components / Falcon Gulf Motors / Kestrel Mobility: 180 / 174 / 166 series, MEA only; the other nine have 0 MEA series.

### 9. Customer switches — partially confirmed
- Exact: 23 series with two customers in two clean runs, 3,060 with one; 0 gap months; first month of the new customer 2022-07..2025-05; India 6, Europe 6, APAC 4, LatAm 4, NA 3;
  test has one customer per series for all 19 months and it equals the last train customer for 3,058 / 3,058 (it equals the *first* train customer for only 3,035).
- The level-shift claim holds **as a group**: placebo test against all mature non-switching series at the same dates (12-month mean after / before, cleaned units):
  SD of log ratio 0.437 for the 23 switches against 0.218 for the placebo; 13 / 11 / 5 switches exceed the placebo 90th / 95th / 99th percentile of |deviation|
  (expected by chance 2.3 / 1.2 / 0.2); KS p = 6e-9. The shift persists: correlation 0.96 between the first-year deviation and the deviation measured on the last 12 months of train.
  No direction bias (13 up, 10 down; mean factor x1.11, not distinguishable from 1).
- Overstated: "each a permanent level shift". Individually about 12 of the 23 lie inside the placebo 95 % band; five are within about +-25 % of the control drift and cannot be told from noise
  (BSS-001 APAC x0.88, CSS-085 India x0.91, HYD-009 Europe x0.81, PTC-034 India x0.80, PMP-032 Europe x1.24, cleaned 12-month means).
- Corrected numbers on cleaned units (mean ratio; the report used raw units): ELA-063 India median 5.5 -> 6.5 (not 0.0 -> 6.5); the range is x0.52 (PMP-047 NA) to x2.15 (HYD-059 India) on means, x0.45 to x2.41 on medians.
- The rule (level from the post-switch regime, 18-52 months available) is safe either way: where there is no shift it costs nothing.

### 10. Customer-scoped events — confirmed
- Nexon Motor Group | Europe, 2023-10..11: 46 series carry that customer at the time (50 by latest customer, which would be the wrong set). Monthly sums (43 mature series) 589 and 498 against 2,300-2,900 in the surrounding months;
  difference-in-differences against the rest of Europe **x0.21** on sums; per-series median factor 0.15 / 0.14; non-zero factors 10th-90th percentile 0.08-0.36.
  The zero share does not rise (0.12, 0.07), so it is a scaling, not a skipped order. Same factor in every channel (0.20-0.25). Nexon in the other four regions: x0.94-1.07.
  HYD-009 / Europe (Nexon then, Apex now): 77 -> 5, 4 -> 20, 29, 37. THM-017 / Europe (Nexon since 2023-01): 77 -> 15, 6 -> 50.
- Helios Auto Parts | India from 2025-09: 65 series (64 alive; PMP-022 is a lost account). Year-on-year (2025-09..2026-08 against the previous 12 months) Helios x1.175, other Indian customers x0.94:
  **relative uplift x1.25**; per-series median 1.20 (IQR 1.07-1.33) against 0.94; 93 % of Helios series beat the others' median; by channel 1.18-1.34; Helios in the other regions 0.97-1.01;
  placebo one year earlier 1.03 against 1.04. The monthly index steps exactly at 2025-09 (0.78 in 2025-08, 1.35 in 2025-09).
- Orion Driveline | North America: 62 test series, 124 rows in 2027-07..08, none ever had another customer. Confirmed.
- Scan of all 48 customer x region groups x 94 months for unlisted customer events: nothing beyond these two. The only other |z| > 4 cells are region-wide months with tiny volumes
  (India 2020-04 lockdown), NA July cells and one genuine one-off order (Solaris NA 2026-07, the 2,002-unit BSS-008 order).

### 11. Lost accounts — partially confirmed
- Exact: 16 series with a trailing silence of 10-19 months, same series and same start months as the report (2025-04, 06, 07, 08, 10, six in 2025-11, two in 2025-12, three in 2026-01); 204 silent months,
  of which 203 explicit zero rows and 1 missing row (BSS-034 NA); all SKUs Active with no EOL and no successor; every other region of each SKU sold in the last 6 months; 304 test rows; 9 customers.
- Trailing-silence distribution over the 3,058 live series: 0: 2,648; 1: 314; 2: 79; 3: 1; **nothing from 4 to 9**; then the 16. The ten series whose trailing silence exceeds their usual gap are all explained by a missing 2026-10 row. No account has been lost since 2026-01.
- Correction: the report says two intermittent series have an 8-month zero run in mid-history (BSS-057 LatAm, ELA-052 India). Both are artefacts of blank `Units_Sold` cells:
  ELA-052 India has blank units in 2020-08 and 2020-11 with revenue present (32 and 26 units); BSS-057 LatAm sits on the ERP-migration blanks of 2023-03..05 and a blank 2023-08 worth 472 units.
  On cleaned units **no series has an internal silence longer than 5 months** (5 months = 33 series, a quarterly customer skipping one order). The separation between ordinary gaps (at most 5) and lost accounts (at least 10) is therefore wider than reported.
- Correction: pre-loss levels on cleaned units — PMP-022 India 49.4 (report 470.2, raw x100 error), PTC-038 NA 48.0 (39.8), CSS-045 India 71.0 (71.8), PMP-076 India 43.2 (44.6). Total pre-loss level 1,009 units per month = 0.7 % of volume.
- Alternative explanations tested and rejected: (a) supply — 0 stock-out rows with positive `Requested_Units` in any of the 204 dead months; the single inventory row inside a tail (PMP-022 India 2026-07) has Requested = 0 and Shipped = 0;
  (b) ordering cycle — 13 of the 16 were monthly customers (zero share at most 8 %) and the longest gap of any cycle is 5 months; (c) lifecycle — none; (d) decline before the loss — none (last 6 months / previous 12 = 0.74-1.25);
  (e) injected error — every tail row is an ordinary zero row (price 0.0, revenue 0.0), and injected errors are spread over rows at fixed grid fractions, not over 16 contiguous tails.
- How sure is "stays at zero": 204 silent account-months with no return gives a 95 % upper bound of 1.5 % per month on a return hazard, at most 25 % probability that a given account is back at some point in the 19 months.
  P50 = 0 is therefore the right point forecast under absolute error. This is a bound from absence of evidence, not a proof.

### 12. Family / BU / description and master conflicts — confirmed
- Prefix -> family exact for 7 prefixes; blank family 1,252 raw rows / 1,228 IDs (164-186 per prefix); BU alone identifies the family for 530 of them; BU never blank and consistent with the prefix on all rows.
- One description per SKU, identical to the master for 598 / 598; blank on 996 rows / 982 IDs; master description starts with `Size_Class + ' mm '` for 601 / 601.
- PMP-004: master `Power & Drive Systems`; train and test both `Advanced Manufacturing` (the BU of the other 86 PMP SKUs).
- BSS-018: master launch 2025-06; four series start 2025-02 with 16 / 14 / 10 / 7 units (NA / LatAm / APAC / MEA), 39 / 29 / 49 / 40 in 2025-05. It is the only series group starting before its master Launch_Date.

### 13. Test keys — partially confirmed
- Exact: 58,219 rows, no duplicate key, Year / Month consistent with Date; 3,068 series = 3,058 continuing + 10 new (PMP-020 x4, PTC-029 x3, THM-012 x3); 25 train-only series (6 discontinued SKUs);
  156 rows after EOL (PTC-005 72, PMP-003 54, THM-001 30); 0 rows before a Launch_Date; discontinued SKUs end exactly in their EOL month.
- Successors: lead of 2-3 months before the predecessor's EOL in 9 / 9 pairs; over the 31 common regions the successor has the same customer in 4 and the same channel in 10 (chance level), so nothing is inherited. Size class is inherited in 9 / 9; powertrain in 1 / 9.
- EOL phase-out (cleaned units, 18-19 series with a reference window): EOL month at 0.28 of the level 19-30 months earlier (report 0.32); last 3 months 0.36-0.40, months -5..-3 about 0.6, months -8..-6 about 0.75-0.8. So the decline is concentrated in the last 6-9 months. PTC-005 (7 months from EOL at the end of train) shows no decline yet.
- **Correction — the launch-ramp table must not be used as a ramp.** I reproduce the pooled medians (0.10, 0.22, 0.33, 0.40, 0.48, 0.57, 0.60, 0.63, 0.70, 0.71, 0.73, 0.80), but the pool mixes two different populations:

  | Months since launch | 0 | 1 | 2 | 3 | 5 | 8 | 11 |
  |---|---|---|---|---|---|---|---|
  | Universal (213 series), median ratio to months 18-29 | 0.15 | 0.32 | 0.45 | 0.56 | 0.70 | 0.86 | 0.95 |
  | EV (281 series) | 0.07 | 0.15 | 0.24 | 0.29 | 0.41 | 0.54 | 0.62 |

  Universal launches are at their plateau after about a year (6-month buckets relative to months 36-47: 0.51, 0.88, 0.97, 1.03, 1.03, 1.05). EV launches keep growing for three years (0.18, 0.37, 0.50, 0.61, 0.77, 0.88),
  which is the EV-adoption trend, not a launch ramp. Applied to THM-012 (Universal) the pooled curve under-forecasts the first year by about 15-25 %; for PMP-020 and PTC-029 (both EV) it confuses ramp with trend.
  Use the lifecycle lens's separated form (ramp x EV factor), not this table.

### 14. Corruption process — confirmed
- Per unique ID: SKU format 3,683 (1.500 %), channel 3,683 (1.500 %), customer 2,455 (1.000 %), date format 9,821 (4.000 %), blank description 982 (0.400 %), blank family 1,228 (0.500 %), blank region 737 (0.300 %), region format 6,117 (2.491 %), `2062` 30, Month column 246.
- Rows with no label defect 220,457 against 220,393 expected under independence (my flag set; report 220,483 / 220,438); at most 4 defects on a row. Versions of a duplicated ID always share labels.

---

## Corrections the pipeline must apply

1. **Launch ramp (finding 13).** Do not use the pooled ramp table of this lens for the 10 cold-start series or for young series. Split by powertrain or take the lifecycle lens's ramp x EV-factor form; THM-012 is Universal, PMP-020 and PTC-029 are EV.
2. **Lost-account detector (finding 11).** Run it on cleaned units. Then the rule is simply "trailing silence of 6 or more months on a live SKU": it returns exactly the 16 series, and no other series has any silence above 5 months. Quote pre-loss levels from cleaned units (PMP-022 India 49.4, not 470.2). Drop the statement about 8-month runs in BSS-057 LatAm and ELA-052 India from the write-up.
3. **Helios | India level (finding 10).** The uplift is x1.25 and starts exactly at 2025-09. Any level estimate for the 64 live Helios-India series (1,216 test rows) that uses months before 2025-09 must scale them by 1.25 or exclude them; a 24-month level would under-forecast these series by roughly 10 %.
4. **Nexon strike months.** Flag 2023-10 and 2023-11 on the 46 series that had Nexon as customer then (factor about 0.2) so they do not enter level or October / November seasonality. Build the flag from the customer at that time (HYD-009 Europe is in, although its customer is now Apex).
5. **Orion | North America 2027-07..08 (124 test rows).** Using the strike factor (about 0.2) is an assumption, not a finding: there is no historical planned customer shutdown. Record it as such, widen P10 / P90 on those rows, and note that 2027-07 also carries the regular North American July dip (Orion series sit at 0.49-0.66 of their Jan-Oct mean every July). After the strike there was no catch-up beyond noise (relative index 1.03, 1.26, 0.97 in the three following months, monthly SD 0.12) and no pre-buy (1.03 the month before), so do not add a rebound.
6. **Customer switches (finding 9).** Keep the 23 as regime breaks, but describe them as "level changes between x0.5 and x2.2, about half individually significant", not as 23 certain shifts. Use cleaned units for the ratios.
7. **Record_ID decoder.** Ship the block table (3,083 rows), not the closed formula: the formula needs the BSS-018 launch override to work at all.
8. **DQ report wording (finding 5).** Blank-region true regions per unique ID: Europe 137, India 133, LatAm 133, APAC 131, NA 113, MEA 90 (737). Quote the B-and-C recovery (737 / 737), not method C alone.
9. **Rule 2 evidence.** Add to the DQ report that the latest version equals inventory `Shipped_Units` on 17 / 17 re-loaded stock-out months.

## Missed

1. **Business rule 2 was taken on trust.** It can be, and now is, verified from `inventory_stockouts.csv` (17 / 17 latest, 0 / 17 older). Same file confirms the 26-cell fill rule (5,767 / 5,803 exact, rest pack-of-10 rounding).
2. **Both series-level events sit in fixed windows.** Switches only between 2022-07 and 2025-05, losses only between 2025-04 and 2026-01; no loss in the first 75 months, none in the last 9. No series is silent for more than 19 months, so there is no account that died earlier and stayed in the grid.
   The counts (23 and 16 of 3,083 = 0.75 % and 0.52 %) look like fixed per-series probabilities. Consequence: history gives no hazard rate for new losses or switches in 2026-11..2028-05; do not apply a churn haircut. (Inference from counts, not something the data can prove.)
3. **No hidden account changes.** A scan of 1,980 mature non-EV series for level steps without a customer-label change finds the 16 lost accounts at |z| > 6 and nothing else; two marginal cases at |z| = 5 (BSS-020 LatAm 2023-11, CSS-009 LatAm 2023-12) are quarterly / bimonthly series next to the ERP-migration blanks. The scan would not see steps as small as most customer switches (they reach only |z| 1.5-4.8), so "no unlabelled steps larger than about x2.5" is the honest statement.
4. **Shutdown-month behaviour is a series property, not a customer property.** July (NA) and August (Europe) dips differ by customer in the aggregate (NA July: Meridian 0.35-0.51, Nexon 0.69-0.95 of neighbouring months, stable over 8 years), but among monthly customers each series either always skips the month or never does, and customer does not predict which (chi-square p = 0.34 NA, 0.26 Europe). Do not build a customer x month feature; the per-series mask of the panel lens is the right level.
5. **Keys of the other files.** `inventory_stockouts.csv` keys are clean (canonical SKU, region, `YYYY-MM`, no duplicate key, all inside the grid) but 870 of 5,830 rows have `Requested_Units = 0`. `events_calendar.csv` scope values are canonical. `macro_indicators.csv` has 114 rows and 113 distinct months (one duplicated Date) — for the macro lens.
6. **Test has exactly one customer and one channel per series across all 19 months** (checked, not only "test = last train customer"), so no switch is scheduled inside the forecast window.

## Not done

- Region position inside a SKU's region list as a level signal: a regression with SKU and region effects gives inconsistent position effects (5th position -0.19 +- 0.03, 6th 0.00 +- 0.04); no usable rule, not pursued.

## Scripts (run order)

`v01_basic.py` -> `v02_decode.py` -> `v03_dups_missing.py` -> `v04_labels.py` -> `v05_panel.py` (these build the intermediates), then in any order
`v06_switches.py`, `v07_lost.py`, `v08_lost_extra.py`, `v09_events.py`, `v10_test_lifecycle.py`, `v11_extra.py`, `v12_ramp_pos.py`, `v13_hidden_steps.py`, `v14_small.py`, `v15_catchup.py`, `v16_artefacts.py`, `v17_cust_scan.py`, `v18_shutdown_by_customer.py`.
Each runs in under a minute. The three large pickles written by v01-v04 (about 330 MB) were deleted after the review to respect the disk limit; re-running v01-v05 recreates them.
Small outputs kept: `v_blocks.csv`, `v_missing_cells.csv`, `v_customer_switches.csv`, `v_lost_accounts.csv`, `v_series_runs.csv`, `v_hidden_step_candidates.csv`, `U.npy`, `HAS.npy`, `IN.npy`, `C.npy`.
