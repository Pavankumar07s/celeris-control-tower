# Lens `panel-missing-zeros` — panel structure, missing rows vs zeros, ordering cycles

**Headline.** The panel is fully reconstructable and its zeros are almost fully deterministic. `Record_ID` is a running
counter over the generator's *complete* SKU x Region x month grid (3,083 series, 245,548 cells), so the **982 gaps in the
Record_ID sequence are exactly the 982 missing rows** (= round(0.4 % x 245,548), deleted completely at random) with SKU,
region and month known; the same identity repairs all 737 blank regions and all 30 `2062-xx` dates. Zeros are not
"intermittent demand": **98.7 % of the 36,057 zero months (35,585) are the off-months of a calendar-anchored ordering
cycle** drawn from 16 patterns (monthly; monthly with one annual shutdown month; every 2nd month x 2 phases; quarterly x 3
phases; "two months on / one off" x 3 phases). The cycle is deterministic: P(order | on-phase) = 99.87 %, P(zero | off-phase)
= 99.37 %, and every exception is explained (off-phase non-zeros are back-order spill from a stock-out, at most 0.63 of
a normal order; on-phase zeros are launch ramp, the India 2020-04 lockdown or series below about 8 units per order).
The generator's own truth table confirms it: in `inventory_stockouts.csv` **855 of the 858 listed months that fall on an
off-phase month have `Requested_Units = 0`**. Orders **carry all latent demand since the previous order** (quarterly order
= 2.93 months, bi-monthly = 1.94 months of the series' monthly level; calendar and customer events act on the latent
months, not on the order), an annual-shutdown month is followed by a catch-up of **half** the skipped month. Only 27 series
ever changed cycle (2022-01..2023-11, volume-conserving: level ratio 1.00), 23 switched customer (level step, cycle
unchanged) and **16 accounts were lost in 2025 and have been at zero for 10-19 months; all 16 are in test.csv**. From
structure alone **8,842 of the 58,219 test rows (15.19 %) are exactly 0** (8,382 off-phase, 304 lost account, 156 after
EOL); in a rolling-origin test of this mask at five origins at most 0.33 % of the units fell into months predicted to be 0.
A phase-aware naive forecast cuts 19-month backtest WAPE from 0.506 (flat, Croston-like) to 0.290.

**How this report was produced.** A first pass (scripts `build_panel.py`, `seg_viterbi.py`, `s01`..`s43`) produced the
findings; this second pass re-derived every headline number independently (scripts `v01`..`v25`, different algorithm:
closed-form Record_ID blocks, exhaustive single-change-point classifier instead of Viterbi, fully cleaned units from the
numeric-reconcile lens) and then went further. Result of the cross-check: **current cycle identical for 3,083 / 3,083
series, 27 / 27 cycle changes (same from -> to, same month), 16 / 16 lost accounts, test mask identical on 58,219 / 58,219
rows, accumulation factor identical on 49,260 / 49,260 rows.** Numbers below are the second-pass values; where the two
passes differ by a few cells the reason is stated. First-pass statements that changed are listed in "Corrections".
Month index `midx` = 0 for 2019-01 ... 93 for 2026-10. All scripts and artefacts are in
`research/scratch/panel-missing-zeros/` (working files, not included in the repository).

---

## 1. Record_ID encodes the complete panel: exact key recovery and exact missing-row detection

**Evidence**
- 248,248 raw rows -> 244,566 unique Record_IDs, numeric part 1..245,548 -> 982 unused numbers.
- For every series `rec_num - midx` takes a **single value** (3,083 of 3,083 series, 0 violating rows). Series blocks never
  overlap and tile 1..245,548. Order = SKU_ID ascending, then a per-SKU region order, then month.
- Closed form verified for **3,083 / 3,083** series from reference data alone: block start = `max(2019-01, Launch_Date,
  2022-01 if Middle East & Africa)`, block end = `min(2026-10, EOL_Date)`, `start_rec = 1 + sum of earlier block lengths`
  (only exception: BSS-018, finding 2).
- 737 rows with blank `Region` and 30 rows dated `2062-MM` (`Year` column says 2026) are fixed by the offset; SKU, region
  (where not blank) and date agree with the decoded position on 100 % of present rows; 0 duplicate keys afterwards.
- 245,548 cells = 244,566 present + 982 missing. Position of the missing cells: 956 inside a series, 10 the first row, 16
  the last row of a series.

**Classification** generator_structure (+ data_error for blank regions / 2062 dates). **Confidence** high.

**Rule**
1. `rec_num = int(Record_ID[4:])`; per (SKU, region) `offset = rec_num - midx`; assert one value per series.
2. Blank region -> the region whose block contains `rec_num`. Year 2062 -> 2026. Any garbled date: `midx = rec_num - offset`.
3. Pipeline unit tests: blocks tile `1..max(rec_num)`; grid = 245,548 cells; missing = 982; 0 duplicate keys.
4. Emit the 982 missing keys to the data-quality report (`missing_rows.csv`: Record_ID, SKU, region, month, expected
   phase, position in series, stock-out units where listed, treatment).

## 2. Panel shape and lifecycle

**Evidence**
- 598 SKUs in train (master has 601; the other 3 are planned launches). 3,083 series: 258 SKUs sell in 6 regions, 178 in
  5, 159 in 4, 3 in 3. Series per region: India 521, MEA 520, Europe 517, APAC 515, LatAm 511, North America 499.
- Start month = `max(Launch_Date, 2019-01, region opening)` for every series: 1,997 start 2019-01, 461 start with the MEA
  opening 2022-01, 625 are in-window SKU launches (138 SKUs launched 2019-02..2026-10; 137 start exactly in the master
  launch month).
- End month = `min(EOL_Date, 2026-10)`: the 6 discontinued SKUs (ELA-014, HYD-020, PMP-017, PTC-025, PTC-026, THM-009; 25
  series) sell **through** their EOL month and never after (0 rows after EOL; 0 zeros in their last 6 on-phase months,
  124 cells).
- Full 94-month life: 1,976 series; shortest life 3 months (PMP-019, launched 2026-08, 3 regions).
- **Reference conflict:** BSS-018 master `Launch_Date` = 2025-06, but all 4 regions have transactions from 2025-02 (16
  series-months before the master date).

**Classification** generator_structure; BSS-018 = reference_conflict. **Confidence** high.

**Rule** Build the grid from the closed form (file `series_blocks.csv` / `v02_blocks.csv`). Effective launch =
min(master launch, first transaction); for BSS-018 use 2025-02, keep the rows and log "master Launch_Date later than first
sale" (rule 5 only forbids sales before a *planned* launch).

## 3. New region: Middle East & Africa opens 2022-01 and ramps like a new product

**Evidence**
- No MEA row before 2022-01 (EV-024 "Celeris opens Middle East & Africa sales region"). 520 MEA series: 461 start 2022-01,
  59 are later SKU launches. MEA has its own 3 customers (Atlas Mideast Components 180 series, Falcon Gulf Motors 174,
  Kestrel Mobility 166); the other 9 customers never sell there.
- Mature MEA level = **0.46** of the same SKU's mean level in NA / Europe / APAC / India (median ratio, 491 SKUs; LatAm
  0.83, India 0.93, APAC 0.95, Europe 0.99, North America 1.02).
- Ramp of on-phase units relative to the series' own level at age 24-47 months, calendar-controlled, Universal-powertrain
  non-ELA SKUs only (no EV trend, no chip shortage):

| months since start | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 8 | 10 | 12 | 15 | 18 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| MEA opening (220 series), mean | 0.18 | 0.37 | 0.45 | 0.39 | 0.58 | 0.68 | 0.75 | 0.87 | 0.95 | 1.17 | 0.86 | 0.98 |
| new SKU launch (141 series), mean | 0.20 | 0.35 | 0.53 | 0.60 | 0.67 | 0.75 | 0.80 | 0.90 | 0.87 | 1.00 | 1.03 | 0.99 |
| `1 - exp(-(age+1)/4.5)` | 0.20 | 0.36 | 0.49 | 0.59 | 0.67 | 0.74 | 0.79 | 0.86 | 0.91 | 0.94 | 0.97 | 0.99 |

  Fitted time constant: new SKU launch 4.2 (mean curve) / 4.9 (median curve) months; MEA opening 4.8 / 5.7 (its month 3 is
  April 2022 = Ramadan, and there is no mature MEA index for 2022, so it is less clean).
- Zero in the first months is ramp noise at low level: P(zero | on-phase) = 10.7 % at age 0, 3.0 % at age 1, 1.4 % at age
  2, 1.1 % at age 3, below 0.8 % afterwards (1,086 late-starting series). At age 0 it is 50 % for series with a mature
  level up to 10 units/month, 21 % for 10-20, 9 % for 20-40, 3 % for 40-80, 0 % above 80.
- At the forecast origin 157 test series are younger than 36 months, 71 younger than 24, 18 younger than 12 (SKUs BSS-012,
  ELA-017, PMP-019, THM-011).

**Classification** real_event (market entry / launches) with generator_structure (ramp curve). **Confidence** high for
existence and shape; medium for the time constant (it agrees with the lifecycle-master lens, tau about 4.5).

**Rule** Feature `series_age`; `ramp = 1 - exp(-(age+1)/4.5)` (column `ramp_factor_tau4p5` in `test_phase_mask.csv`; the
first-pass column `ramp_factor_suggested` used tau = 6 and is too slow for product launches). Train on de-ramped level
for series younger than 24 months, re-apply the ramp at forecast time. Keep the MEA 2022 ramp and launch ramps out of
trend estimates. A zero in the first 1-3 months of a series is ramp noise, not a cycle signal.

## 4. Train vs test coverage

**Evidence**
- test.csv: 58,219 rows = 3,068 series, one customer and one channel each, contiguous months; the test customer and
  channel equal the **last** train customer / channel for all 3,058 common series.
- 3,058 series are in both and have all 19 months. **25 train-only** series = the 6 discontinued SKUs.
- **10 test-only** series = 3 planned launches without history: PTC-029 (launch 2027-03; APAC, LatAm, MEA; 15 months
  each), PMP-020 (2027-06; India, LatAm, MEA, North America; 12 months), THM-012 (2027-10; Europe, LatAm, North America; 8
  months) = 117 rows.
- The three "EOL Announced" SKUs are in test for all 19 months although they end inside the window: PTC-005 (EOL
  2027-05), PMP-003 (2027-08), THM-001 (2027-12) -> **156 test rows lie after EOL_Date** (72 + 54 + 30).
- Successors launch 2-3 months before the predecessor's EOL (all 9 pairs). Successors do **not** inherit region set,
  customer, channel or cycle: of 21 successor/predecessor pairs in the same region, 6 share the cycle type, 5 the exact
  pattern, 4 the customer, 10 the channel (chance level).
- Predecessor phase-out (6 discontinued SKUs, level vs own level 13-30 months before EOL): 0.95, 0.77, 0.80 at 6-4 months
  before EOL, then **0.50, 0.57, 0.40, 0.27** in the last four months (EOL-3 .. EOL).

**Classification** generator_structure / real_event (lifecycle). **Confidence** high for coverage; medium for phase-out
factors (6 SKUs; the lifecycle-master lens summarises the same data as "about 60 % in the last 6 months").

**Rule** After-EOL test rows -> 0. Last four months up to EOL: multiply the baseline by 0.50 / 0.57 / 0.40 / 0.27. New
launches: predecessor's per-region monthly-equivalent level (x 0.46 for MEA) blended with the family median, ramp of
finding 3, cycle prior of finding 13.

## 5. Missing rows (rule 3): 982, exactly identified, completely at random, 87.6 % hide an order

**Evidence**
- 982 missing cells = 0.3999 % of 245,548; 0.004 x 245,548 = 982.19, so the generator dropped a fixed 0.4 % sample.
- Tests of the missing rate (chi-square p): year 0.96, calendar month 0.30, month (94 levels) 0.93, region 0.40, family
  0.88, channel 0.67, customer 0.27, powertrain 0.96, series-level decile 0.62, series age 0.65, first/last cell of the
  series 0.46, cycle type 0.20, listed stock-out month 0.65, neighbouring cell missing 1.0 (4 adjacent pairs, 3.9
  expected), neighbouring cell double-loaded 0.30 / 0.59. Record numbers of missing rows are uniform on 1..245,548
  (KS p = 0.83), gaps between them exponential (p = 0.17). Per series: 695 / 124 / 9 / 3 series with 1 / 2 / 3 / 4 missing
  vs 702 / 117 / 13.5 / 1.2 expected under a binomial.
- Neighbouring values carry no signal: the order before a missing on-phase cell is 0.997 of the series level (1.000
  when present, p = 0.15), the order after 1.000 (p = 0.28).
- **Not** linked to System events or load batches: LatAm ERP-migration window 2023-03..05 has 4 missing of 1,430 cells
  (0.28 %, p = 0.67); CRM-upgrade month 2025-02 has 9 of 3,024 (0.30 %, p = 0.47); by-month z-scores have s.d. 0.89.
- What a missing month hides (from the series' cycle): **860 (87.6 %) an order month**, 122 (12.4 %) a zero month (121
  off-phase, 1 inside a lost-account run). Rate on-phase 0.411 % vs off-phase 0.334 % (p = 0.04, immaterial).
- 26 missing cells have a row in inventory_stockouts.csv, which gives the shipped and requested units exactly (24 with
  shipments > 0).
- Hide-and-impute experiment on 4,000 observed on-phase orders (WAPE / bias): zero-fill 1.000 / -100 %; mean of the two
  neighbouring orders 0.346 / +0.6 %; median of 6 neighbouring orders 0.306 / -2.2 %; average of t-12 and t+12 0.383 /
  +2.9 %; **local level x regional calendar index** (median over the 12 neighbouring orders of `order / accumulated
  index`, times the accumulated index of the missing month) **0.259 / -1.9 %**. The floor is the order noise (log s.d.
  about 0.3).

**Classification** data_error (deleted rows). **Confidence** high.

**Rule**
1. Re-create the 982 keys from the Record_ID gaps, flag `row_missing = 1`.
2. Off-phase or lost-run cell without stock-out record (119): `Units_Sold = 0`, flag `imputed_zero_off_phase`.
3. With a stock-out record (26): `Units_Sold = Shipped_Units`, unconstrained demand = `Requested_Units`.
4. On-phase (837): keep `NaN` for model training (target masked, lags NaN); for statistical baselines and the dashboard
   use the calendar-adjusted local level above, flagged `imputed`. **Never fill with 0** (WAPE 1.0, bias -100 %). For a
   quarterly or bi-monthly series a missing order hides 3 or 2 months of demand: mask the whole covered span on the
   monthly-equivalent scale.

## 6. A second kind of "missing": blank Units_Sold. The LatAm ERP migration blanked units and revenue, it did not delete rows

**Evidence**
- 3,544 present rows have no numeric units: 3,327 blank and 217 "-".
- Every numeric zero row has `Unit_Price_USD = 0` and `Revenue_USD = 0` (35,390 / 35,390); price > 0 means an order existed.
  - blank units, price > 0, revenue > 0: 2,545 rows, units = revenue / price exactly (2,542 on-phase).
  - blank units with price = 0 (450) and "-" (217): 661 of the 667 fall on off-phase months, 2 inside lost-account runs,
    4 on-phase in known zero contexts (India 2020-04 twice, MEA first months twice) -> they are zeros. Blanking hits zero
    rows (1.25 %) and order rows (1.22 %) equally; "-" appears only on zero rows (0.60 %).
  - blank units, price > 0, **revenue blank**: 332 rows, **all** Latin America, Aftermarket (212) + Export (120),
    2023-03..2023-05 (108 / 111 / 113).
- EV-033 "ERP migration in Latin America - some transactions were not migrated": **all 380 present LatAm Aftermarket /
  Export rows of 2023-03..05 have blank units** (332 order months with price intact + 48 zero months with price 0); the
  1,046 present LatAm rows of the other two channels in those months show only the background error rate (11 blank units). Only 1 of the 332 is recoverable from the
  stock-out file (THM-033 2023-04, shipped 65); duplicates do not help (3 identical copies).
- 295 rows have positive units but price = 0 and revenue = 0: all 295 are on-phase -> price blanked, units valid.

**Classification** data_error (blanking; system event). **Confidence** high.

**Rule** `Units_Sold` blank or "-": price > 0 and revenue > 0 -> `round(revenue / price)`; price = 0 -> 0; price > 0 and
revenue blank -> unknown **non-zero** order: NaN, mask in training, impute for display as in finding 5, register as
"EV-033 ERP migration, quantity not migrated" (332 rows, 331 to impute). Positive units with price = 0: keep units,
restore the SKU-year price.

## 7. Zeros are a deterministic, calendar-anchored ordering cycle (rule 6)

**Evidence**
- Share of zero months per series: 1,388 series (45 %) have no zero at all, median 6.9 %, upper quartile 30.6 %, 772
  series above 30 %, 239 above 60 %, maximum 69 %.
- 16,832 complete series-years: 121 distinct twelve-month signatures, the **16 patterns cover 98.28 %**; rank 17 is
  `XXX.XXXXXXXX` (India, April 2020 lockdown). A period scan of the last 36 months (3,014 series) reproduces the zero
  pattern exactly with period 1 for 1,483 series, 2 for 219, 3 for 368, 12 for 676 and with no period from 4 to 11 for any
  series (the other 268 carry an exception such as a spill, a ramp zero or a missing month): no 4-, 5- or 6-month and no
  non-calendar cycle exists.
- Fit of the single-change-point classifier (21 candidate patterns): 2,688 series with 0 mismatching months over their
  whole life, 334 with 1, 43 with 2, 18 with 3-7.
- Current cycle of the 3,083 series (lost accounts under the cycle they had):

| cycle | pattern (Jan..Dec) | series | % series | zero share | order = months of demand |
|---|---|---|---|---|---|
| M monthly | `XXXXXXXXXXXX` | 1,539 | 49.9 | 0.6 % | 1 |
| A annual shutdown month | one `.` per year: Dec 171, Aug 143, Jul 127, Jan 124, Jun 120, Nov 46, Feb 44 | 775 | 25.1 | 8.3 % | 1, and 1.5 after the shutdown |
| B every 2nd month | B0 `X.X.X.X.X.X.` 154, B1 `.X.X.X.X.X.X` 143 | 297 | 9.6 | 49.1 % | 2 |
| Q quarterly | Q0 Jan/Apr/Jul/Oct 90, Q1 Feb/May/Aug/Nov 78, Q2 Mar/Jun/Sep/Dec 74 | 242 | 7.8 | 65.9 % | 3 |
| T two on / one off | T0 off Jan/Apr/Jul/Oct 80, T1 off Feb/May/Aug/Nov 76, T2 off Mar/Jun/Sep/Dec 74 | 230 | 7.5 | 33.2 % | 2 then 1 |

  Volume shares (last 12 months) follow the series shares: M 48.8 %, A 25.8 %, B 9.9 %, Q 8.2 %, T 7.2 %.
- Shutdown month is region-specific: Europe **Aug** only (143), North America **Jul** only (127), APAC Feb 44 / Dec 31 /
  Jan 25 / Jun 24, India Nov 46 / Jan 34 / Dec 26 / Jun 27, LatAm Dec 81 / Jan 36 / Jun 36, MEA Dec 33 / Jun 33 / Jan 29.
  It is fixed in the calendar: the APAC February zero stays in February in 2020, 2023 and 2025 when Lunar New Year starts
  in January (zero share of A-Feb series: February 95-100 % every year, January 0 %); India-November does not move with
  Diwali (November 98-100 %, October 0 %). Jul / Aug match the calendar's "summer retooling" / "plant shutdown" events; the
  India-November and all Jan / Jun / Dec shutdowns have no event in events_calendar.csv.
- **Determinism: P(order | on-phase) = 99.871 %** (208,554 observed cells, 269 zeros); **P(zero | off-phase) = 99.374 %**
  (35,809 cells, 224 non-zeros). First pass (Viterbi): 99.880 % / 99.366 %. For series older than 12 months outside 2020:
  22 zeros in 156,944 on-phase cells (0.014 %); by order size: 2.5 % below 5 units, 0.2-0.3 % for 5-12 units, 1 zero in
  151,609 cells above 12 units.
- Decomposition of the 36,057 zero months: **35,585 off-phase (98.69 %)**, 203 lost-account zeros, 269 on-phase zeros.
- Only 3,857 units (0.033 % of all 11.72 million units) were shipped in off-phase months.
- **Independent ground truth:** `Requested_Units` in inventory_stockouts.csv is the generator's true demand. Of 858 listed
  rows that fall on an off-phase month, **855 have `Requested_Units = 0`**; the 3 others are ELA-026 MEA 2022-03/04/06, one
  unit each in the launch ramp (a ramp-zero artefact, the series is monthly). Of 4,972 listed on-phase rows only 15 have
  `Requested_Units = 0`: 12 are launch-ramp months, 1 is an off-month inside a cycle transition (BSS-073 North America
  2023-07), 1 is a lost account (finding 11) and 1 is ELA-012 MEA at age 8.

**Classification** generator_structure. **Confidence** high.

**Rule**
- Per series store `cycle_now` (16 codes) and derive for any month `expected_on` and `k_accum` (`series_table.csv`,
  `test_phase_mask.csv`). Forecast: off-phase month -> exactly 0; on-phase month -> latent monthly demand accumulated as
  in finding 9.
- Intermittent-demand methods (Croston, SBA, TSB, ADIDA) appear only as the required baselines: the zeros are scheduled,
  not random.
- Dashboard "zero months" view: colour by reason (off-phase / lost account / ramp / lockdown / low volume).

## 8. The exceptions: non-periodic zeros and off-phase shipments

**Evidence**
- The 269 on-phase zeros: 174 in the first 12 months of a series (launch / MEA ramp; 97 of them are the very first
  on-phase cell), 61 India 2020-04..06 lockdown, 12 other 2020 months, 18 low-volume series (local order size below 8),
  4 other (HYD-001 India 2021-04 and 2021-07 at level 10; PMP-039 MEA 2023-05 at level 8; BSS-073 North America 2023-07,
  which is an off-month inside its M -> B1 transition). Runs: 223 single zeros, 17 pairs, 4 triples (all MEA 2022); **no
  on-phase zero run of an active series reaches the end of train**.
- Disruption block: India 2020-04 ran at a median 4.2 % of the 2019 level and 17.6 % of on-phase series recorded 0
  (59 of 349 older than 12 months); May 21 % of level / 1.1 % zeros; June 39 % / 0.9 %; July 58 % / 0.6 %. It is the only
  region-month with 3 or more on-phase zeros among mature series. 55 of the 269 on-phase zeros have a stock-out row, all
  with 0-3 units requested.
- The 224 off-phase non-zeros are **all back-order spill**: 139 equal the previous month's `Backordered_Units` exactly;
  40 have a same-month stock-out row with `Requested = 0, Carried_In > 0`; 7 follow a listed stock-out with another
  quantity; **38 have no stock-out record at all** but look the same (median 0.24 of a normal order vs 0.22 for the
  listed ones) -> unlisted stock-outs in the previous month. So about 20 % of spill events (45 / 224) have no fully listed
  origin, a direct estimate of how incomplete inventory_stockouts.csv is. The largest off-phase shipment is 0.63 of the
  local order level: **no one-off order was ever placed in an off-phase month**.
- In annual-shutdown series the shutdown month is zero in 4,471 of 4,504 cells (99.27 %, age >= 12); the 33 exceptions
  are spill (1-40 units, at most 0.52 of the local order level; 30 with a stock-out record, 3 without).
- The last 12 months of train contain 2 on-phase zeros (both series below 6 units/order) and 38 spill months in 37
  series: no sign of an undetected recent cycle change. Two spills sit at the forecast origin (CSS-011 MEA 2026-10, no stock-out
  record -> unlisted stock-out in 2026-09; ELA-058 LatAm 2026-10 = back-order of 2026-09).

**Classification** real_event (ramp, lockdown, stock-out spill). **Confidence** high.

**Rule** Anomaly register: on-phase zero -> "launch ramp / COVID lockdown / low volume" (keep, do not treat as a cycle
change); off-phase non-zero -> "back-order shipment; month t-1 was supply-constrained": move the units back to t-1 when
building unconstrained demand and flag t-1 as an unlisted stock-out when the file has no row (38 cases,
`v06_offphase_nonzero.csv`). No supply limits in the forecast window (rule 7) means no spill there: off-phase = 0.

## 9. Order size scales with the period: an order carries all latent demand since the previous order

**Evidence**
- Stable full-life non-ELA series: monthly-equivalent level (total / months) is the same for every cycle type (median
  M 48.5, A 47.1, B 47.7, Q 51.4, T 46.2 units/month; first-pass regression on 2,741 stable series, last 36 months, SKU and
  region fixed effects: B 1.026, Q 0.974, T 0.982, A 0.940 of M, s.e. 0.02-0.03), while the median order is M 47, A 48,
  B 90.5, Q 148.5, T 62 (same regression: B 2.05, Q 2.94, T 1.39, A 1.02 times a monthly order).
- In months of the series' own monthly level a B order is **1.94**, a Q order **2.93**; in T series the order after the gap
  is 1.94 and the next one 0.97 (per-series ratio 2.03, 136 series).
- Accumulate vs "k x current month", using a regional month index I[region, t] built from 799 stable monthly series
  (2019-2026, so it contains seasonality, COVID and trend): median absolute log error over (pattern, region, month) groups
  B 0.064 vs 0.078, Q 0.088 vs 0.104, T 0.082 vs 0.097. Where the two predictions differ by more than 25 % (COVID months,
  European August) **accumulate wins 16 / 16 (B), 23 / 24 (Q), 14 / 14 (T)** with errors 0.06 / 0.09 / 0.04 against
  0.37 / 0.42 / 0.47. Example Europe Q0, April 2020: observed 1.98 months, accumulate (Feb + Mar + Apr) 1.90, "3 x April" 0.71.
- At a cycle change the first new order covers the months since the last old order (BSS-082 APAC: monthly ... Apr 41 |
  May 0 | **Jun 118** | Jul 0 | Aug 0 | **Sep 240**; BSS-050 North America Q1 -> M: Feb 173 | Mar 0 | **Apr 109** | May 77).
- **Annual shutdown:** order in the month after = own demand + **c x shutdown-month demand, c = 0.51** (median over 3,708
  orders; 13 region x month groups between 0.44 and 0.60, s.d. 0.039). A constant multiplier fits worse: it ranges from
  1.30 (Europe after August, APAC after February) to 1.63 (LatAm after December) and tracks the size of the skipped month
  (correlation 0.89). Median absolute log error: own + 0.5 x skipped 0.050; 1.5 x own 0.085; full accumulation 0.273.
  No pre-buy in the month before the shutdown (1.000) and no effect two months later (0.995).
- **Events act on latent months, then accumulate.** Nexon Motor Group | Europe strike 2023-10..11 (EV-038): Nexon monthly
  series at 0.148 and 0.148 of baseline (30 series; other Europe customers 1.01 and 0.96; 0 zeros in 70 on-phase cells; no
  catch-up in December, 0.90 vs 0.90). For the 9 Nexon B / Q / T series (28 orders) the accumulate rule on the reduced
  latent months has median absolute log error 0.25, "k x current month" 0.33, ignoring the event 0.47 (BSS-062 Q1 November
  order: observed 1.41 months, accumulate 1.45, k x current 0.44).
- Noise is per order, not per latent month: log s.d. of `order / accumulated index` is 0.32 (A, monthly orders), 0.31 (T),
  0.285 (B), 0.278 (Q); independent monthly noise would give 0.23 for B and 0.18 for Q.

**Classification** generator_structure. **Confidence** high (accumulation, 0.5 catch-up, latent-level events); medium on
the noise statement.

**Rule** Work on the **monthly-equivalent** scale: `latent(t)` per series and month for all cycle types; train one global
model on `units / k` with the cycle type irrelevant to the level model. Then
`forecast_units(t) = sum of latent forecasts over the months since the previous on-phase month` (B: 2 months, Q: 3, T: 2
then 1), `latent(t) + 0.5 x latent(shutdown month)` after an annual shutdown, 0 off-phase. Apply seasonality, macro and
event factors (for example EV-062 Orion Driveline | North America 2027-07..08) to the latent months **before**
accumulating. P10 / P50 / P90: apply the order-level relative noise (log s.d. about 0.28-0.32) to the order, no
square-root-of-k shrinkage.

## 10. Cycle changes: rare, old and volume-conserving

**Evidence**
- 27 genuine changes (0.9 % of series): Q -> M 18, M -> B 6, M -> Q 3. None from or to A or T, no phase shift. Regions:
  LatAm 8, India 5, Europe 5, APAC 5, North America 4, MEA 0.
- All between **2022-01 and 2023-11** (17 in 2022, 10 in 2023). No overlap with the 23 customer switches or the 16 lost
  accounts, customer unchanged in all 27, no calendar event coincides. Every series has been in its current cycle for at
  least 35 months at the forecast origin.
- The change takes effect in an arbitrary month, not at the end of an old cycle (BSS-014 Europe Q0 -> M: Apr order, May 0,
  Jun = two months, then monthly). The month is exact for 6 changes and known within a two-month window for 20 (the last
  common order month or the next one); BSS-073 North America has a missing row and a stock-out in its transition (window
  2023-04..2023-11, by inspection 2023-05). Windows are in `series_table.csv` (`cycle_change_window_start` / `_end`).
- **Level does not change:** monthly-equivalent level 18 months after vs before, divided by the same ratio for the same
  SKU's stable series in other regions: median **1.003**, geometric mean 1.013 +/- 0.029 (24 changes with a control;
  Q -> M 0.99, M -> B 1.01, M -> Q 1.08). Without the same-SKU control the ratio looks like 1.10 (Q -> M 1.18) because of
  SKU trends (chip-shortage recovery, EV growth).
- 2 further apparent changes are launch-ramp zeros (ELA-026 MEA, ELA-069 North America; the first pass flagged 7 of this
  kind) and are marked `launch_ramp_zero_artefact`.

**Classification** real_event (ordering-cycle change). **Confidence** high.

**Rule** Anomaly register entry "ordering-cycle change" with month window and from -> to (`cycle_changes_detail.csv`,
`v24_cycle_change_levels.csv`). Use the regime in force at 2026-10 for the test mask. Keep the pre-change history on the
monthly-equivalent scale as it is: **no level adjustment and no break feature are needed**. Dashboard: show cycle and
change month in the demand explorer.

## 11. Lost accounts: 16 series stop abruptly in 2025 and are all in the test set

**Evidence**

| series | cycle before | last order | cells to 2026-10 | units in the 12 months up to the last order |
|---|---|---|---|---|
| HYD-081 North America | M | 2025-03 | 19 | 934 |
| PTC-002 North America | B0 | 2025-05 | 17 | 1,329 |
| THM-015 North America | M | 2025-06 | 16 | 553 |
| ELA-040 North America | M | 2025-07 | 15 | 555 |
| CSS-062 Asia Pacific | M | 2025-09 | 13 | 530 |
| CSS-045 India, ELA-084 India, HYD-061 Europe, PMP-076 India, PTC-003 Europe, PTC-038 North America | A-Jun, M, M, M, A-Aug, T1 | 2025-10 | 12 | 852, 358, 894, 518, 1,309, 576 |
| BSS-034 North America, CSS-085 Europe | A-Jul, M | 2025-11 | 11 | 810, 697 |
| BSS-082 India, ELA-055 Latin America, PMP-022 India | M, M, A-Jun | 2025-12 | 10 | 1,141, 457, 593 |

- 204 cells (203 observed zeros + 1 missing row). No decline beforehand (1,009 units/month in total in the last 12
  months before the loss, 997 in the 12 before). Rows keep being loaded with 0 units, price 0, customer name unchanged; no calendar event; 9
  different customers, 5 regions, all 7 families.
- **Generator truth:** PMP-022 India has a stock-out row for 2026-07 with `Requested_Units = 0` - the customer requested
  nothing, it is not a supply problem.
- No zero spell of this kind ever ended in the history, and trailing zero runs at 2026-10 are either 0-2 months (cycle
  off-months: 2,662 / 302 / 78 series) or 10-19 months (these 16): nothing in between, so no partially hidden recent loss.
- Together 0.69 % of total volume (1,009 of 145,505 units/month in 2024-03..2025-02); 304 test rows.

**Classification** real_event (lost account). **Confidence** high that they are lost; medium that none returns within
19 months.

**Rule** Detect: at least 6 consecutive zero months at the end of a series that was ordering before (normal cycle gaps
never exceed 2 months; each of the 16 cases has missed at least 5 scheduled orders). Forecast 0 for all 19 months (P10 = P50 = 0, small P90 if ranges are required). Truncate
the series at its last order for training; never train on these zeros as demand. Register as "lost account" with the last
order month; top of the planner exception list.

## 12. Customer switches: 23 series, one switch each, level step, cycle unchanged

**Evidence**
- 3,060 series have one customer for their whole life; 23 have exactly one switch (2022-07..2025-05: 4 / 5 / 8 / 6 per
  year), none has more. The channel never changes (3,083 / 3,083).
- Level after / before (first-pass estimate, adjusted for regional drift): 10 losses (0.49-0.83) and 13 gains
  (1.20-2.11), never about 1; the step is immediate and persists.
- Cycle and phase are unchanged at a switch (23 / 23; the change-point classifier finds no change in any of them).
- test.csv carries the post-switch customer for all 23.

**Classification** real_event (account change / structural break). **Confidence** high.

**Rule** Structural-break flag at the switch month; estimate level from post-switch data only (or a `customer_run_id`
feature); register "customer switch A -> B, level x r" (`customer_switches.csv`).

## 13. What determines the cycle - and the right prior for series without enough history

**Evidence**
- Having a B / Q / T cycle is independent of region (p = 0.75), customer (0.85), channel (0.82), family (0.78), powertrain
  (0.28) and launch cohort (0.48); phases are uniform (B 154 / 143, Q 90 / 78 / 74, T 80 / 76 / 74). Two series of the same SKU
  share the cycle type in 35.2 % of pairs (33.3 % by chance). It is a property of the individual SKU x Region series.
- **The annual shutdown depends on the launch cohort.** Among monthly-type series (M or A), the A share is **37.8 %** for
  series that existed in 2019-01 (571 / 1,511) but **25.4 %** for series that started later (204 / 803: non-MEA launches
  26.4 %, MEA 24.4 %). The surplus in the old cohort sits in each region's main holiday month:

| region | cohort | Dec | Jan | Jun | holiday month | all A (% of monthly-type) |
|---|---|---|---|---|---|---|
| Asia Pacific | 2019-01 start | 8.4 | 6.5 | 5.5 | Feb 13.2 | 33.5 |
| Asia Pacific | later launch | 6.4 | 6.4 | 9.0 | Feb 3.8 | 25.6 |
| India | 2019-01 start | 7.1 | 8.4 | 7.1 | Nov 15.2 | 37.7 |
| India | later launch | 5.6 | 10.0 | 6.7 | Nov 1.1 | 23.3 |
| Latin America | 2019-01 start | 24.7 | 9.3 | 8.3 | (Dec) | 42.3 |
| Latin America | later launch | 8.2 | 9.4 | 12.9 | (Dec) | 30.6 |
| Middle East & Africa | all (2022+) | 8.5 | 7.4 | 8.5 | none | 24.4 |
| Europe | 2019-01 start / later | - | - | - | Aug 39.6 / 31.2 | 39.6 / 31.2 |
| North America | 2019-01 start / later | - | - | - | Jul 35.9 / 21.2 | 35.9 / 21.2 |

  Reading: every monthly-type series has about a 24-25 % chance of a customer shutdown month (Europe -> Aug, North America
  -> Jul, elsewhere Dec / Jan / Jun with equal weight); about 15 % of the monthly-type series that were already running
  in 2019 additionally stop in the regional holiday month (APAC Feb, India Nov, LatAm Dec, Europe Aug, North America Jul).
  New series almost never do (India-November 45 old vs 1 new, APAC-February 41 vs 3).
- Prior for a new series (1,059 identifiable late-cohort series): M 55.1 %, A 18.9 %, B 10.3 %, Q 8.6 %, T 7.2 %
  (2019-01 cohort: 47.1 / 28.6 / 9.2 / 7.6 / 7.6). Resulting probability of an order in a given month for a brand-new
  series: 0.87 in ordinary months, 0.80-0.82 in Dec / Jan / Jun outside Europe and North America, 0.68 in August (Europe)
  and July (North America).
- Posterior for the 18 series younger than 12 months (prior x likelihood of the observed months, with ramp-zero
  probabilities from finding 3): the most likely pattern is the same as in the first pass for all 18; 8 are certain
  (p >= 0.99), the others are M with p = 0.74-0.82 or an A pattern with p = 0.69-0.87 (PMP-019 Europe `.XX` from 2026-08:
  A-Aug 0.69, M 0.22, T1 0.09; ELA-017 India A-Jun 0.87; THM-011 APAC A-Jun 0.73).

**Classification** generator_structure. **Confidence** high for the independence results and the cohort effect (chi-square
p < 0.001); medium for the two-mechanism reading.

**Rule** Young and cold-start series: use `v20_cycle_prior_new_series.csv` (late-cohort prior, not the all-series
frequencies, which overstate shutdowns and put 12-13 % on APAC-February / India-November). `test_phase_mask.csv` now has
`p_order` = probability of an order in that month: 1 or 0 for the 3,040 identified series, posterior for the 18 young
series, prior for the 10 planned launches (170 rows in 20 series have 0 < p_order < 1). Point forecast for these rows:
`p_order x accumulated latent` for an expected-value metric, or 0 when `p_order < 0.5` for an absolute-error metric.

## 14. How safe is the zero mask? Rolling-origin test and the test-window mask

**Evidence**
- Cycle classified from data up to the origin only, regime at the origin projected 19 months ahead, compared with what
  was observed (series with at least 24 months of history):

| origin | series | P(order \| predicted on) | P(zero \| predicted off) | units in predicted-off months | share of units |
|---|---|---|---|---|---|
| 2021-03 | 1,997 | 99.91 % | 98.93 % | 2,115 | 0.10 % |
| 2022-03 | 2,029 | 99.81 % | 97.65 % | 5,097 | 0.26 % |
| 2023-03 | 2,172 | 99.87 % | 97.93 % | 7,138 | 0.33 % |
| 2024-03 | 2,735 | 99.93 % | 99.08 % | 2,897 | 0.11 % |
| 2025-03 | 2,828 | 99.59 % | 99.21 % | 802 | 0.03 % |

  The 2022 and 2023 origins contain all 27 cycle changes, the 2025 origin contains the 16 account losses (190 "predicted
  on but zero" cells against 29-62 at the other origins). Even then forcing zeros in predicted-off months costs at most 0.33 % of volume.
- Test window: **8,842 forced zeros = 15.19 % of test rows** (8,382 off-phase, 304 lost account, 156 after EOL; identical
  in both passes). Accumulation factor of the 49,260 remaining rows with a known pattern: 1 month 42,373 rows; 1.5
  (month after an annual shutdown) 1,139; 2 months 4,243; 3 months 1,505.
- Naive 19-month backtest from origin 2025-03 (2,828 series, WAPE): flat mean of last 12 months 0.506 (M 0.295, A 0.370,
  B 1.022, Q 1.331, T 0.784); seasonal naive 0.370; **cycle mask x accumulation x last-12-month level 0.290** (M 0.295,
  A 0.289, B 0.285, Q 0.266, T 0.296); with a regional seasonal index 0.287. All four are biased +5.7 % to +6.6 % (level
  drift after 2025-03, a matter for the trend / macro lenses).

**Classification** generator_structure / modelling evidence. **Confidence** high.

**Rule** Hard-code 0 for the 8,839 test rows with `p_order = 0`; never let a model put volume there. Evaluate every
model with the mask applied (the mask alone is worth about 22 WAPE points over a flat forecast). Unit test: forecast = 0
wherever `force_zero` is true; sum of the forecast over a quarterly series' year = 12 months of latent demand.

## 15. Intermittency classes (ADI / CV^2) - computed as required, but the label is misleading here

**Evidence** Syntetos-Boylan cut-offs (ADI 1.32, CV^2 0.49), fully cleaned units:

| class | series (full life) | % series | % volume | series (last 36 m) | % series | % volume |
|---|---|---|---|---|---|---|
| smooth | 2,190 | 71.0 | 72.3 | 2,197 | 71.6 | 71.5 |
| intermittent | 742 | 24.1 | 24.0 | 764 | 24.9 | 25.2 |
| erratic | 108 | 3.5 | 2.4 | 92 | 3.0 | 2.8 |
| lumpy | 43 | 1.4 | 1.3 | 14 | 0.5 | 0.5 |

- "Intermittent" and "lumpy" are the B / Q / T series (median ADI 2.0 / 3.0 / 1.5; last 36 months: 749 of the 763 B / Q / T
  series are intermittent, 14 lumpy); "erratic" are M / A series with one-off spikes or ramps. Median CV^2 of order sizes:
  0.18 full life, 0.115 last 36 months. 16 series (discontinued before 2023-11) have no data in the last 36 months.

**Classification** generator_structure. **Confidence** high.

**Rule** Report the SBC class as the Core "intermittency class" feature (`sbc_class_*` in `series_table.csv`) but drive
modelling with `cycle_now`. Show Croston / SBA / TSB as the Advanced-tier baselines; a flat (Croston-type) forecast is 74 WAPE
points worse than the phase-aware one on B series and 106 points worse on Q series (finding 14).

---

## Corrections to the first pass

1. Cycle changes span **2022-01**..2023-11 (the first report said 2022-02; its own script printed 2022-01).
2. A cycle change does **not** move the level (1.00 with a same-SKU control). The first pass reported +25 % for Q -> M
   from a region-drift control and suggested a `post_cycle_change` feature; drop it.
3. Ramp time constant: about 4.5 months for product launches (first pass: 6 for both launches and the MEA opening). The
   new column `ramp_factor_tau4p5` replaces `ramp_factor_suggested`.
4. Young-series prior: built from the late-launch cohort (finding 13); most likely patterns unchanged, probabilities moved.
5. Counts that moved by a few cells because of how launch-ramp zeros are assigned: on-phase zeros 269 (first pass 251),
   off-phase non-zeros 224 (227), lost-account cells 204 (212 quoted), spill without any record 38 (40).

## Artefacts (all in `research/scratch/panel-missing-zeros/`; working files, not included in the repository)

| file | content |
|---|---|
| `series_table.csv` | **per-series table**, 3,093 rows (3,083 train + 10 test-only) x 67 columns: sku, region, cycle_now / kind / period / phase / orders_per_year, cycle_earlier, cycle_change_month (+ window start / end), lost_account (+ last order, zero months), first / last month, n_months, n_obs, n_missing (on / off phase), n_zero, zero_share, on-phase zeros, off-phase spills, customer_last, channel, customer switch (month, before, after, level ratio), monthly_equiv_last12, ADI / CV^2 / SBC class (full life, last 36 m, both unit cleanings), master lifecycle fields, age_at_2026_10, launch_cohort, second_pass_pattern / second_pass_agrees, cycle confidence and posteriors, in_train / in_test |
| `test_phase_mask.csv` | one row per test.csv row (58,219 x 23): cycle_pattern, expected_on, **p_order**, k_accum_months, force_zero + reason, months_to_eol, series_age, ramp_factor_suggested (tau 6), **ramp_factor_tau4p5**, pattern_known |
| `missing_rows.csv` | the 982 missing series-months: Record_ID, sku, region, date, cycle state, expected phase (both passes), position in series, lost-run flag, stock-out units where listed, treatment |
| `panel_min_clean.parquet`, `v02_panel.parquet` | full 245,548-cell panel (first pass: minimal unit cleaning and cycle state; second pass: units from the numeric-reconcile lens, issue type, age, life length) |
| `series_blocks.csv`, `v02_blocks.csv` | Record_ID block per series (offset, start / end record, first / last month, master launch / EOL) |
| `cycle_changes_detail.csv`, `v24_cycle_change_levels.csv` | the 27 cycle changes: month, from -> to, level before / after, same-SKU control ratio |
| `lost_accounts.csv`, `customer_switches.csv` | the 16 lost accounts; the 23 customer switches with level ratios |
| `v06_onphase_zero.csv`, `v06_offphase_nonzero.csv` | the 269 on-phase zeros with reason; the 224 off-phase shipments classified A-D against the stock-out file (D = 38 unlisted stock-outs) |
| `v11_mask_backtest.csv` | rolling-origin mask test (5 origins) |
| `v20_cycle_prior_new_series.csv`, `v20_young_series_posterior.csv` | cycle prior for new series by region; posterior and monthly order probability for the 18 young series |
| `v08_region_month_index_M.csv`, `v08_orders_vs_index.parquet` | regional month index from monthly series; every B / Q / T / A order against the accumulate and "k x current" predictions |
| `v13_intermittency_cleanunits.csv`, `intermittency.csv` | ADI, CV^2, class per series |
| `v23_impute_experiment.csv` | the 4,000 hidden orders and six imputations |
| scripts | first pass: `build_panel.py` -> `seg_viterbi.py` -> `fix_uf.py` -> `s22`, `s32`, `s35` -> `build_series_table.py` -> `young_series_prior.py` -> `build_test_mask.py`, analyses `s01`..`s43`. Second pass (run in order, each under 30 s): `v01_verify_panel.py`, `v02_build_indep.py`, `v03_signatures.py`, `v04_classify.py`, `v06_determinism.py`, `v07_missing_tests.py`, `v08_accumulate.py`, `v09_shutdown_catchup.py`, `v10_test_mask_check.py`, `v11_mask_backtest.py`, `v12_runs_events.py`, `v13_intermittency_ramp.py`, `v14_ramp_universal.py`, `v15`..`v17` (cycle determinants, cohorts), `v18`, `v19` (disruption zeros, stock-out file vs phase), `v20_young_prior.py`, `v21_noise.py`, `v22_nexon.py`, `v23_impute_experiment.py`, `v24_change_level.py`, `v25_update_artefacts.py` |

## Open questions, ranked by likely impact on forecast accuracy

1. **Do cycles, shutdown months and lost accounts persist through 2026-11..2028-05?** Everything observed says yes: no
   cycle change after 2023-11, no customer switch after 2025-05, no new account loss after 2025-12, no lost account ever
   returned, and each event type sits in its own window of the history as if scheduled to be found. If the generator
   placed new events in the test window they cannot be forecast. 15.2 % of test rows are 0 under this assumption; the
   worst historical 19-month window lost 0.33 % of units to it; the 16 lost accounts were 0.69 % of volume.
2. **Level trend after 2025-03.** Every simple method in the backtest is 6 % too high; the trend / macro model now
   matters more than any remaining cycle detail.
3. **EV-062, Orion Driveline | North America, 2027-07..08** (62 series, 124 test rows: 26 M, 18 A-Jul, 9 B, 5 Q, 4 T). The
   only analogue (Nexon strike) cut latent demand to 0.15 in both months with no zeros and no catch-up, and B / Q / T
   orders accumulated the reduced months. Whether a "planned retooling shutdown" uses the same factor is unknown; for
   the 18 A-Jul series July is zero anyway and the September catch-up rule interacts with it.
4. **New launches (117 test rows) and young series (18 series, 342 rows).** The cycle is unknown or uncertain; `p_order`
   quantifies it, but the best point forecast depends on the scoring metric (expected value vs median).
5. **Phase-out before EOL (72 test rows) and successor level**: 6 historical SKUs only; factors from this lens and from
   the lifecycle-master lens differ slightly in shape.
6. **Why does the old cohort have more holiday shutdowns?** If the planned launches were generated like the old cohort,
   the prior in finding 13 understates shutdown months for 10 series. Low impact.
7. **Unlisted stock-outs in monthly series**: about 20 % of stock-out events are unlisted; in B / Q / T / A series they are
   visible through off-phase spill (38 found), in monthly series only as a dip followed by a bump. Matters for the
   unconstrained history near the forecast origin (for example CSS-011 MEA 2026-09).
8. A statistical curiosity without forecast impact: 23 of the 38 two-on / one-off series launched after 2019 outside the
   MEA opening start on their off-month (12.7 expected). Not seen for B or Q; possibly chance.
