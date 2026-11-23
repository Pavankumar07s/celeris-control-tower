# Lens `test-structure` — test.csv structure, train-to-test continuity and the evaluation target

**Headline.** `test.csv` is a clean, complete generator grid: 58,219 rows = 3,068 series (595 SKUs) x up to 19 months (2026-11..2028-05), one row per (Date, SKU_ID, Region), written in generator order (SKU ascending, then the SKU's own region order, then month). 3,058 series continue from train with customer, channel, description and BU **identical to the last train month for every one of them** — `Customer_Name` is constant inside every test series, so there is **no customer switch at the start of or inside the forecast window**; 10 series are cold starts of the 3 planned launches (rows begin exactly in the `Launch_Date` month: 15 / 12 / 8 rows); the 25 train-only series are the 6 discontinued SKUs. Rows *after* EOL are present for the 3 "EOL Announced" SKUs (156 rows, must be 0), and the 16 lost accounts are present with all 19 rows (304 rows, 0). Altogether **8,842 test rows (15.19%) are structural zeros** (8,382 off-phase rows of the ordering cycle + 304 + 156). Two things are new relative to the other lenses: (i) the region order in the file reveals **two SKU tiers** — a core block of 100 SKUs (the first 8–24 numbers of each family: all six regions in one fixed order, Latin America at about half the level of the other regions, 44% "annual-shutdown" cycles) and a 501-SKU tail (random region subsets, equal regional levels, MEA x0.48, 55% monthly) — and the planned launches belong to the tail; (ii) cycle changes, customer switches and account losses each occur only inside a bounded window of the *training* period (month index 37–58, 42–76, 75–84 of 94), which is why none is visible or expected in the test window. On the metric: the row-level noise floor is about 23% WAPE; a level-only, phase-aware forecast scores 26.3% (bias -0.05%) on the last 19 months against 49.8% for a cycle-blind mean (lost accounts excluded in both); shading the forecast towards the median (-3.5%) buys only 0.13–0.26 row-WAPE points and costs 0.4–0.9 points on family / region aggregates, so the submission should stay close to the mean.

All numbers were computed by the scripts in `/home/pavan/Desktop/mks/research/scratch/test-structure/` (`t01`..`t16`). Raw CSVs were read with `dtype=str, keep_default_na=False`. Keys come from the Record_ID decode of the `dates-dups` / `labels-keys` lenses (re-checked here: SKU 100%, non-blank Region 100%, 30 `2062` date typos), clean and unconstrained units from the `stockouts-unconstrained` lens (re-checked here on the last 24 months: all 71,099 self-reconciling rows are unchanged), one-off flags from `numeric-reconcile`. The ordering cycle was inferred independently here (22 candidate masks, last 36 months) and agrees with the `panel-missing-zeros` lens for **3,083 of 3,083** series.

---

## Findings

### 1. test.csv is clean and complete; its keys are the output contract

**(a) Evidence**
- 58,219 rows, 10 columns, no blank, no leading/trailing or double space in any column; `Date` matches `YYYY-MM` on every row (19 distinct months), `Year`/`Month` agree with `Date` on every row (`Month` is not zero-padded), `SKU_ID` matches `[A-Z]{3}-\d{3}` on every row.
- 7 families, 5 BUs, 4 channels, 6 regions, 12 customers, 595 SKUs, 595 descriptions. 0 duplicate rows, 0 duplicate (Date, SKU_ID, Region) keys.
- 3,068 series; months are contiguous in every series and every series ends 2028-05. Rows per series: 19 for 3,058, 15 for 3, 12 for 4, 8 for 3. Rows per month: 3,058 (2026-11..2027-02), 3,061 (2027-03..05), 3,065 (2027-06..09), 3,068 (2027-10..2028-05).
- Family, BU, description, customer and channel are constant within every series; family, BU and description are constant within every SKU. Test equals `sku_master` on family and description for 595/595 SKUs and on BU for 594 (PMP-004: test and train say `Advanced Manufacturing`, master says `Power & Drive Systems`).
- Regional design: Middle East & Africa has its own three customers (Atlas Mideast Components 180 series, Falcon Gulf Motors 172, Kestrel Mobility 166) and none of the other nine; 237 of the 518 MEA series are `Export` (32–50 in the other regions).

**(b) Classification:** generator_structure. **(c) Confidence:** high.

**(d) Rule.** Treat test keys as the authoritative label vocabulary for train cleaning (6 regions, 4 channels, 12 customers, 7 families). The forecast grid is exactly the test key set; never add or drop a row.

### 2. Short series are the planned launches; rows before launch are omitted

**(a) Evidence.** The 10 series with fewer than 19 rows are the 3 `Planned Launch` SKUs, and their first test month equals `Launch_Date` for 10/10. 0 test rows lie before a `Launch_Date`; no 19-row series has a launch after 2026-11.

| SKU (replaces) | Launch | Rows per series | Region / customer / channel | Predecessor EOL | Powertrain new / old |
|---|---|---|---|---|---|
| PTC-029 (PTC-005) | 2027-03 | 15 | MEA / Atlas Mideast Components / Tier-1 Distributor; Latin America / Apex Tier One / Aftermarket; Asia Pacific / Solaris Automotive / Direct OEM | 2027-05 | EV / ICE |
| PMP-020 (PMP-003) | 2027-06 | 12 | India / Vantara Auto / Tier-1 Distributor; MEA / Kestrel Mobility / Tier-1 Distributor; Latin America / Solaris Automotive / Aftermarket; North America / Nexon Motor Group / Direct OEM | 2027-08 | EV / ICE |
| THM-012 (THM-001) | 2027-10 | 8 | North America / Vantara Auto / Direct OEM; Europe / Solaris Automotive / Direct OEM; Latin America / Nexon Motor Group / Aftermarket | 2027-12 | Universal / ICE |

Each successor launches 2 months before its predecessor's EOL (2–3 months in the 6 historical pairs). The predecessor sells in all 6 regions; the successor sells in 3–4, and in the shared regions customer and channel differ in 10 of 10 cases (e.g. PMP-003 / India is Crestline Manufacturing, Direct OEM; PMP-020 / India is Vantara Auto, Tier-1 Distributor).

**(b) Classification:** generator_structure / real_event (lifecycle). **(c) Confidence:** high.

**(d) Rule.** 117 cold-start rows = level prior x launch ramp from the launch month. Customer and channel of a new series come from test.csv, not from the predecessor. See finding 9 for the level prior (tail tier).

### 3. Rows after EOL are present in test: 156 rows that must be 0

**(a) Evidence.** The 3 `EOL Announced` SKUs keep all 19 rows in all 6 regions (18 series, 342 rows): PTC-005 (EOL 2027-05) 72 rows from 2027-06; PMP-003 (EOL 2027-08) 54 rows from 2027-09; THM-001 (EOL 2027-12) 30 rows from 2028-01. 18 rows fall in the EOL month itself and 186 rows are up to and including EOL. In train the opposite convention holds: all 25 series of the 6 discontinued SKUs have their last row in the EOL month and 0 cells afterwards. So the test grid drops pre-launch rows but keeps post-EOL rows. At the last-12-month level the 156 rows would carry 8,466 units (0.32% of the test volume).

Independent estimate of the phase-out before EOL (23 discontinued series with a baseline, monthly-equivalent demand, adjusted for the regional drift of all other series; level 13–30 months before EOL = 1): months -12..-7 average 0.74; months -5..0: 0.64, 0.62, 0.60, 0.48, 0.41, 0.27 (medians 0.57, 0.63, 0.50, 0.41, 0.39, 0.27; about 20 series per month). Relative to the level 7–12 months before EOL this is about 0.85, 0.84, 0.80, 0.65, 0.54, 0.37. The three announced SKUs show no decline yet at 2026-10 (PTC-005 last 12 vs previous 12 months by region: 0.84, 0.88, 1.20, 1.09, 1.25, 1.18).

**(b) Classification:** real_event (lifecycle) with a train/test row-presence asymmetry (generator_structure). **(c) Confidence:** high for the rows; medium-high that the truth is 0 there (business rule 5 says so; there is no observation after any EOL); medium for the phase-out factors.

**(d) Rule.** Forecast 0 on the 156 rows (`force_zero_reason = after_EOL`, P10 = P50 = P90 = 0). For the last 6 months up to and including EOL multiply the baseline by about 0.85, 0.84, 0.80, 0.65, 0.54, 0.37 (PTC-005: 2026-12..2027-05; PMP-003: 2027-03..08; THM-001: 2027-07..12); reconcile the exact curve with the `lifecycle-master` lens. Validator warning if any post-EOL row is non-zero (`validate_submission.py`).

### 4. Train vs test coverage

**(a) Evidence**
- Train 3,083 series; test 3,068; common 3,058.
- Train-only 25 = all series of the 6 `Discontinued` SKUs (ELA-014, HYD-020, PMP-017, PTC-025, PTC-026, THM-009); last train month = EOL month for 25/25. No train-only series belongs to a SKU that is still in test, so no region of a live SKU was dropped.
- Test-only 10 = the planned launches of finding 2; none is a new region of an existing SKU.
- The 16 lost accounts stay in test with 19 rows and the same customer (304 rows): row presence carries no information about whether a series is alive.
- 16 common series have no 2026-10 row (last row 2026-09): BSS-052 / Latin America, BSS-070 / Europe, CSS-016 / North America, CSS-043 / Europe, CSS-080 / Latin America, ELA-011 / Latin America, ELA-074 / Asia Pacific, HYD-050 / India, HYD-054 / North America, HYD-081 / MEA, HYD-082 / India, PMP-032 / India, PMP-061 / MEA, PTC-051 / North America, THM-032 / Europe, THM-057 / India (0.53% of volume). 18 series have an unknown cell (missing row or blank units) after their last recorded order.

**(b) Classification:** generator_structure; the 16 missing final rows are data_error (missing rows). **(c) Confidence:** high.

**(d) Rule.** Build lag and "last value" features from the full (series x month) grid with explicit NaN, never from "last available row", otherwise 16 series are shifted by one month. Exclude the 25 discontinued series from the forecast set but keep them for training (phase-out curve, cross-sectional level).

### 5. Customer, channel and description continuity: no account change at or inside the forecast window

**(a) Evidence**
- Test customer = last train customer for 3,058/3,058 common series; test customer = first train customer for 3,035 (the other 23 switched during train). Test channel = train channel for 3,058 (no series ever has 2 channels). Test description = train description for 3,058 (no SKU ever has 2 descriptions; the 2019-10 "rebrand" event EV-006 changes nothing in the data).
- `Customer_Name` and `Sales_Channel` each take exactly 1 value inside every one of the 3,068 test series over the 19 months.
- If switches continued at the historical in-window rate (23 in 35 months = 0.66 per month) 12.5 would be expected in 19 test months; the test file shows 0.

**(b) Classification:** generator_structure. **(c) Confidence:** high.

**(d) Rule.** No switch adjustment in the forecast window. Customer and channel are static known-in-advance features. The historical switch analysis (finding 6) is for the anomaly register and for how to use pre-switch history.

### 6. What a customer switch did historically: an immediate, permanent level step; cycle unchanged; not predictable from the customer

**(a) Evidence.** 23 series, exactly one switch each, no gap month, first month of the new customer between 2022-07 and 2025-05 (4 in 2022, 5 in 2023, 8 in 2024, 6 in 2025; India 6, Europe 6, Asia Pacific 4, Latin America 4, North America 3, MEA 0). None is in `events_calendar.csv`. Level = unconstrained demand per month, 12 months after / 12 months before, divided by the same ratio for all non-switch series of the region:

| SKU | Region | Cycle | From -> To | First month new | Mean before | Mean after | Adjusted ratio | Ratio months 13–24 |
|---|---|---|---|---|---|---|---|---|
| CSS-085 | India | A-Jan | Crestline Manufacturing -> Helios Auto Parts | 2022-07 | 26.1 | 23.2 | 0.95 | 0.93 |
| BSS-001 | Asia Pacific | A-Feb | Helios Auto Parts -> Crestline Manufacturing | 2022-09 | 60.7 | 53.2 | 0.87 | 0.71 |
| HYD-055 | Asia Pacific | M | Orion Driveline -> Helios Auto Parts | 2022-09 | 22.9 | 35.9 | 1.55 | 1.94 |
| HYD-013 | North America | A-Jul | Nexon Motor Group -> Crestline Manufacturing | 2022-10 | 42.1 | 22.8 | 0.54 | 0.54 |
| PMP-047 | North America | A-Jul | Vantara Auto -> Solaris Automotive | 2023-01 | 101.2 | 53.0 | 0.54 | 0.56 |
| THM-017 | Europe | A-Aug | Solaris Automotive -> Nexon Motor Group | 2023-01 | 30.9 | 47.9 | 1.60 | 1.76 |
| THM-026 | Latin America | M | Vantara Auto -> Quantum Drive Systems | 2023-05 | 61.8 | 99.5 | 1.61 | 1.75 |
| PMP-032 | Europe | A-Aug | Solaris Automotive -> Quantum Drive Systems | 2023-09 | 53.9 | 66.9 | 1.22 | 1.33 |
| PMP-074 | Latin America | Q0 | Orion Driveline -> Apex Tier One | 2023-12 | 38.0 | 52.3 | 1.29 | 1.31 |
| BSS-024 | Asia Pacific | M | Solaris Automotive -> Meridian Assembly | 2024-04 | 44.0 | 93.2 | 1.96 | 1.83 |
| HYD-001 | Asia Pacific | M | Meridian Assembly -> Orion Driveline | 2024-05 | 13.2 | 23.9 | 1.68 | 1.86 |
| HYD-009 | Europe | A-Aug | Nexon Motor Group -> Apex Tier One | 2024-05 | 43.2 | 35.0 | 0.72 | 0.72 |
| PTC-034 | India | M | Nexon Motor Group -> Meridian Assembly | 2024-05 | 63.8 | 52.4 | 0.76 | 0.68 |
| ELA-063 | India | B1 | Quantum Drive Systems -> Apex Tier One | 2024-06 | 8.3 | 11.3 | 1.27 | 1.07 |
| HYD-059 | India | M | Crestline Manufacturing -> Vantara Auto | 2024-10 | 14.7 | 31.5 | 2.11 | 1.91 |
| ELA-023 | Europe | M | Apex Tier One -> Quantum Drive Systems | 2024-11 | 25.0 | 34.7 | 1.35 | 1.58 |
| CSS-066 | Latin America | B1 | Helios Auto Parts -> Apex Tier One | 2024-12 | 25.4 | 47.2 | 1.87 | n/a |
| BSS-081 | North America | M | Nexon Motor Group -> Apex Tier One | 2025-01 | 51.7 | 29.9 | 0.60 | n/a |
| THM-003 | Latin America | A-Dec | Meridian Assembly -> Solaris Automotive | 2025-01 | 12.7 | 18.7 | 1.53 | n/a |
| THM-020 | India | M | Orion Driveline -> Crestline Manufacturing | 2025-01 | 84.2 | 63.4 | 0.78 | n/a |
| THM-047 | India | B0 | Apex Tier One -> Helios Auto Parts | 2025-01 | 32.7 | 55.8 | 1.77 | n/a |
| PMP-015 | Europe | A-Aug | Crestline Manufacturing -> Apex Tier One | 2025-04 | 83.5 | 58.4 | 0.77 | n/a |
| PTC-050 | Europe | A-Aug | Helios Auto Parts -> Quantum Drive Systems | 2025-05 | 40.0 | 24.7 | 0.68 | n/a |

- Adjusted ratio: 10 steps down (0.54–0.95) and 13 up (1.22–2.11); geometric mean 1.115; standard deviation of the log 0.442 against 0.22 for 10,653 placebo windows of non-switch series; 21 of 23 are beyond +/-18% (36% of placebo windows are).
- Immediate: for the 19 monthly / annual-shutdown switch series, median units relative to the final post-switch level are 1.01, 1.00, 1.01, 1.01 in months 0–3 (pre-switch months -4..-1 relative to the old level: 0.91, 0.94, 1.06, 1.08).
- Permanent: the ratio for months 13–24 correlates 0.97 with the ratio for months 1–12 (16 series), median change 1.01.
- Ordering cycle and phase unchanged in 23 of 23 (0 mask mismatches before and after; zero-month share equal within 0.05 for 22).
- Not predictable from who the customers are: customer effects on log level (after SKU and region demeaning, 12 customers) lie between -0.043 and +0.036 (standard deviation 0.022), and the difference new minus old correlates 0.026 with the observed step.
- All 23 have at least 18 months of post-switch history at the forecast origin (8 switched in the last 24 months, 0.25% of volume).

**(b) Classification:** real_event (account change, structural break). **(c) Confidence:** high.

**(d) Rule.** Anomaly register: 23 `customer_switch` rows with month, from -> to and step ratio (`customer_switch_effects.csv`). Modelling: estimate level only from post-switch months (or rescale pre-switch history by the step); keep the cycle mask and seasonality from the whole history. Do not use customer identity as a level feature. For ranges only: a switch, if one ever occurred, would multiply the level by a factor in 0.5–0.95 or 1.2–2.1.

### 7. Account events are confined to scheduled windows inside the training period

**(a) Evidence** (month index: 2019-01 = 0, 2026-10 = 93; train length 94)

| Event | Series | First..last index (month) | Fraction of 94 | Months with none since | P(that gap at the in-window rate) | Expected in 19 test months at that rate |
|---|---|---|---|---|---|---|
| Ordering-cycle change | 27 (0.88%) | 37..58 (2022-02..2023-11) | 0.39..0.62 | 35 | 2e-19 | 23.3 |
| Customer switch | 23 (0.75%) | 42..76 (2022-07..2025-05) | 0.45..0.81 | 17 | 1e-5 | 12.5 |
| Lost account (first zero month) | 16 (0.52%) | 75..84 (2025-04..2026-01) | 0.80..0.89 | 9 | 6e-7 | 30.4 |

- The three sets do not overlap (0 series in two sets).
- All 16 losses fall 9–18 months before the forecast origin, i.e. inside the last 19 training months. No series ends 2026-10 with 1 or 2 unexplained on-phase zeros, so there is no fresh, half-visible loss.
- The test file confirms the switch window independently (finding 5).

**(b) Classification:** generator_structure. **(c) Confidence:** medium (the windows are inferred from 16–27 events; the exact bounds are unknown).

**(d) Rule.** Do not apply a hazard haircut for new losses, switches or cycle changes in the forecast window; hold cycle, customer and alive/dead status at their 2026-10 state. Backtests: an origin at 2025-03 with a 19-month horizon contains all 16 losses (14,906 units of absolute error = 0.59% of actual volume; WAPE 29.4% with them against 28.8% without, bias +4.9% against +4.3%) — report backtest metrics with and without them and use several origins.

### 8. Customer-scoped calendar events must be joined on the customer at the time; the 2023 strike is the analogue for the 2027 Orion shutdown

**(a) Evidence**
- EV-038, Nexon Motor Group | Europe strike, 2023-10..11: 47 series had Nexon as customer at the time. Demand relative to each series' own previous 12 months: 0.261 and 0.176 (other customers in Europe 1.039 and 0.964), i.e. x0.25 and x0.18 against the control; median 0.16 and 0.14; 0 zero orders in 78 on-phase cells. By cycle: monthly 0.147, annual-shutdown 0.140, two-on-one-off 0.403 (6 orders), bi-monthly 0.262 (2), quarterly 0.573 (2) — orders that cover several months are cut less, as the accumulation rule predicts (a quarterly order covering 1 or 2 strike months at 0.15: 0.72 or 0.43). Afterwards treated / control is 1.04, 1.15, 1.12, 0.98 for 2023-12..2024-03 against 1.00 on average in the four months before: at most a weak catch-up of about 0.3 month of demand.
- Time-varying join matters: HYD-009 / Europe was a Nexon series in 2023 and was hit, but its test customer is Apex Tier One (switch 2024-05); 3 current Nexon | Europe series (CSS-077, ELA-016, ELA-017) did not exist yet.
- EV-052, Helios Auto Parts | India, permanent from 2025-09: 65 series; treated / control averages 0.99 in 2025-05..08 and 1.27 in 2025-09..2026-10 (monthly values 1.18–1.39), a step of about +27% that holds in every cycle type (1.14–1.30) and channel (1.18–1.23). Last 12 vs previous 12 months: 1.193 for Helios India against 0.986 for the rest of India.
- EV-062, Orion Driveline | North America "planned retooling shutdown", 2027-07..08: 62 test series (26 monthly, 18 annual-shutdown with July off, 9 bi-monthly, 5 quarterly, 4 two-on-one-off), none lost, none ever switched; 34 on-phase rows in 2027-07 and 51 in 2027-08; 3,296 units per month at the current level = 6,591 units (0.25% of test volume).

**(b) Classification:** real_event. **(c) Confidence:** high for scope and for the strike / Helios magnitudes; low-medium for the size of the Orion effect (different event wording, one analogue).

**(d) Rule.** Event features from a (series, month) -> customer table. Orion | North America: multiply *latent monthly* demand of 2027-07 and 2027-08 by about 0.15–0.25 (point value 0.2) and then apply the accumulation weights, so that the 2027-08 order of a July-shutdown series and the first later order of bi-monthly / quarterly series are cut as well; no catch-up. Helios | India: estimate the level from 2025-09 onwards only (14 months) — the step is already in the base. List in `orion_na_event_series.csv`.

### 9. Row order is the generator order, and the region order reveals two SKU tiers

**(a) Evidence**
- Each series is one contiguous block of rows with ascending months; SKU blocks are contiguous and in ascending SKU order; the per-SKU region order equals the train Record_ID order for 592/592 SKUs present in both. `sample_submission.csv` (5 rows) follows the first 5 test keys in the same order.
- 432 distinct region-order patterns. Exactly 100 SKUs list all six regions as North America > Europe > Asia Pacific > India > Latin America > Middle East & Africa; a random permutation would give that order with probability 1/720. These 100 are precisely the first SKU numbers of each family with no exception inside or outside the runs: BSS-001..011, CSS-001..009, ELA-001..013, HYD-001..019, PMP-001..016, PTC-001..024, THM-001..008 (**core tier**). The other 501 SKUs (**tail tier**) have 3–6 regions (5 / 160 / 178 / 158 SKUs) in random order with a uniform first region (76–94 per region).
- The SKUs directly after each core block carry the lifecycle stories: BSS-012 (launch 2026-07); CSS-010..014 (EV launches 2020–2025); ELA-014 (discontinued), 015 (replacement), 016, 017 (launches 2024-02, 2026-04); HYD-020 / 021 / 023; PMP-017 / 018 / 019 / 020; PTC-025..029; THM-009..013. All 6 discontinued SKUs, all 9 replacement SKUs and all 3 planned launches are tail; all 3 `EOL Announced` SKUs are core; 6 core and 135 tail SKUs launched after 2019-01.
- The tiers differ in cross-sectional design:

| | Core (100 SKUs, 600 series) | Tail (501 SKUs, 2,483 train series) |
|---|---|---|
| Share of last-12-month volume | 22.6% | 77.4% |
| Median series level, last 24 months: NA / EU / AP / IN / LatAm / MEA | 52.2 / 48.6 / 51.4 / 44.2 / **25.7** / 22.3 | 44.9 / 46.3 / 43.8 / 44.6 / **43.4** / 22.2 |
| Mean series level: NA / EU / AP / IN / LatAm / MEA | 73.3 / 65.6 / 62.3 / 58.0 / 33.1 / 30.0 | 50.3 / 50.5 / 48.8 / 48.6 / 49.3 / 24.6 |
| Latin America / mean of the other four non-MEA regions, within SKU (median; 2019 and 2025) | 0.46 and 0.49 | 0.90 and 0.92 |
| Cycle mix M / A / B / Q / T | 30.2 / 44.3 / 10.8 / 6.2 / 8.5 % | 54.7 / 20.5 / 9.3 / 8.3 / 7.2 % |

- The tiers do not differ in dynamics: the yearly mean per series-month moves in parallel (core / tail = 1.21, 1.16, 1.21, 1.23, 1.21, 1.19, 1.18, 1.21 for 2019..2026); the 12 month-of-year indices of the two tiers correlate 0.95 (Europe), 0.89 (North America), 0.86 (Asia Pacific), 0.83 (India), 0.89 (Latin America); relative noise of monthly series is 0.37 and 0.39; channel mix is the same.
- Inside the tail, position in the region order carries almost no level information (SKU fixed effects removed: position effects between -0.08 and +0.05 log points, largest |t| = 3.2) and region effects are nil (-0.05 to 0.00, all |t| < 1.6) except MEA (-0.73 log points, x0.48); pooled over all SKUs a Latin America effect of -0.16 appears, which is entirely the core tier.
- Tail-tier mature levels (monthly-equivalent, last 12 months): non-MEA median 44.3 (launched before 2019, 1,492 series) and 45.2 (launched after, 480 series); MEA 21.9 and 20.8. By family, non-MEA medians: BSS 62.8, THM 54.0, PMP 47.8, CSS 45.9, PTC 41.2, HYD 34.6, ELA 31.2. Channel (43.8–45.4) and size class (43.0–47.3) make no difference. Post-2019 tail launches by powertrain, non-MEA medians: Universal 47.4 (221), EV 43.9 (227), ICE 41.5 (32). Cycle mix of post-2019 tail launches: M 55.8%, A 17.3%, B 11.1%, Q 9.9%, T 5.8%.

**(b) Classification:** generator_structure (legitimate input: it is the documented row order of the files and the SKU numbering). **(c) Confidence:** high for the tiers and their regional profile; medium for the claim that nothing else differs.

**(d) Rule.** Add `sku_tier` (core / tail, from `sku_tiers.csv`) and use `tier x region` rather than `region` alone in any cross-sectional model, hierarchy prior or cold-start prior. Cold starts are tail SKUs: mature level = family median of the tail (non-MEA; x0.48 for MEA), **no Latin America discount**, and not the predecessor's regional profile (the three predecessors are core SKUs with Latin America at half level); default cycle monthly. Test and train row order are otherwise only a sort order — keep it for the submission.

### 10. Output contract and validator

**(a) Evidence.** `sample_submission.csv`: header `Date,SKU_ID,Region,Units_Sold_Forecast`; values are plain integers (`50`); keys are the test keys in test order. The problem statement requires a non-negative integer, no blanks, one row for every row of test.csv.

**(b) Classification:** other (contract). **(c) Confidence:** high.

**(d) Rule.** Write exactly 58,219 rows in test.csv order, keys copied verbatim from test.csv, forecasts as integers without decimals or separators. Round to nearest, never floor: on the pseudo-test rounding to nearest changes WAPE from 26.274 to 26.269 and bias from -0.046% to -0.061%, flooring moves bias to -0.886%. Run `python validate_submission.py <file>` in CI: hard checks (header, row count, key set, uniqueness, integer text format; exit code 1) and soft warnings (non-zero forecasts after EOL, on lost accounts or on off-phase rows; more than 1% zero forecasts on on-phase rows of live series; total outside +/-15% of the last-19-month volume of about 2.72 million units). `reference_naive_submission.csv` (structure only: cycle mask x accumulation x 24-month level, zeros where required; total 2,704,000 units, 8,842 zero rows) passes and can serve as a sanity benchmark; it is not a candidate submission.

### 11. Structural zeros in the forecast window: 8,842 rows, known in advance

**(a) Evidence.** Ordering cycles of the 3,058 continuing series (share of naive test volume): monthly 1,526 (48.9%), annual-shutdown 769 (25.8%), bi-monthly 295 (9.9%), quarterly 238 (8.2%), two-on-one-off 230 (7.2%). On-phase test rows: M 28,994 of 28,994; A 13,461 of 14,611; B 2,809 of 5,605; Q 1,505 of 4,522; T 2,914 of 4,370. (These counts include the on-phase rows of the 16 lost and 18 EOL series, which are zero for the other reasons below.) First on-phase test month: 2026-11 for 2,634 series, 2026-12 for 334, 2027-01 for 90. Months since the last order at 2026-10 (live series): 0 for 2,648, 1 for 314, 2 for 79, 3 for 1 — every live series is where its cycle says; the only deviations are series whose last cell is unknown.

| Test month | Rows | Off-phase | Lost account | After EOL | Cold-start rows | Expected zero rows |
|---|---|---|---|---|---|---|
| 2026-11 | 3,058 | 423 | 16 | 0 | 0 | 14.36% |
| 2026-12 | 3,058 | 563 | 16 | 0 | 0 | 18.93% |
| 2027-01 | 3,058 | 491 | 16 | 0 | 0 | 16.58% |
| 2027-02 | 3,058 | 433 | 16 | 0 | 0 | 14.68% |
| 2027-03 | 3,061 | 382 | 16 | 0 | 3 | 13.00% |
| 2027-04 | 3,061 | 381 | 16 | 0 | 3 | 12.97% |
| 2027-05 | 3,061 | 377 | 16 | 0 | 3 | 12.84% |
| 2027-06 | 3,065 | 510 | 16 | 6 | 7 | 17.36% |
| 2027-07 | 3,065 | 494 | 16 | 6 | 7 | 16.84% |
| 2027-08 | 3,065 | 528 | 16 | 6 | 7 | 17.94% |
| 2027-09 | 3,065 | 382 | 16 | 12 | 7 | 13.38% |
| 2027-10 | 3,068 | 380 | 16 | 12 | 10 | 13.30% |
| 2027-11 | 3,068 | 422 | 16 | 12 | 10 | 14.67% |
| 2027-12 | 3,068 | 561 | 16 | 12 | 10 | 19.20% |
| 2028-01 | 3,068 | 488 | 16 | 18 | 10 | 17.01% |
| 2028-02 | 3,068 | 431 | 16 | 18 | 10 | 15.16% |
| 2028-03 | 3,068 | 381 | 16 | 18 | 10 | 13.53% |
| 2028-04 | 3,068 | 379 | 16 | 18 | 10 | 13.46% |
| 2028-05 | 3,068 | 376 | 16 | 18 | 10 | 13.36% |

Total 8,382 + 304 + 156 = 8,842 of 58,219 (15.19%). In the last 24 training months the observed zero share ran between 12.26% (2025-03) and 18.75% (2025-12) with the same calendar shape (2025-12 18.75%, 2026-01 16.57%, 2026-06..08 17.28 / 16.62 / 17.72%, 2026-09..10 12.99 / 12.95%) and, once the lost accounts are set aside, tracks the off-phase share within 0.2 points in every month. Off-phase non-zeros in history are back-order spill only, which cannot occur in an unconstrained window.

**(b) Classification:** generator_structure. **(c) Confidence:** high (medium for the 18 just-launched series, whose cycle rests on 3–7 months).

**(d) Rule.** Force exactly 0 on these rows after modelling (`test_mask` in `series_state.csv`, `X` = order expected); never let a smooth model put small positive numbers there. `test_expected_zero_rows_by_month.csv` is the monthly control total.

### 12. Where volume and error sit: cycle-blind forecasts lose half of their error budget on a quarter of the volume

**(a) Evidence.** Pseudo-truth = unconstrained demand of the test series in 2025-04..2026-10: 2,687,911 units on 57,612 known rows, 8,568 zero rows (14.87%); 102 one-off orders add 21,656 units (0.81%). Volume is not concentrated: the top 10% of series hold 24.6% of units, the median series sells 39.9 units a month.

| Class (last 19 months) | Series | % volume | Zero rows | Units per non-zero row |
|---|---|---|---|---|
| Monthly | 1,526 | 48.8 | 0.5% | 45.9 |
| Annual-shutdown | 769 | 25.8 | 8.2% | 52.1 |
| Bi-monthly | 295 | 9.9 | 50.3% | 96.4 |
| Quarterly | 238 | 8.4 | 66.4% | 148.2 |
| Two-on-one-off | 230 | 7.2 | 33.7% | 67.2 |
| Syntetos-Boylan smooth | 2,217 | 72.2 | 2.7% | 47.8 |
| intermittent | 761 | 25.0 | 50.5% | 94.8 |
| erratic | 63 | 2.1 | 2.4% | 49.6 |
| lumpy | 15 | 0.6 | 49.6% | 115.5 |

Backtest, origin 2025-03, horizon 19, 2,828 series with at least 24 months of history, level from the previous 12 months (WAPE % with bias % in brackets; class columns exclude the 16 lost accounts):

| Method | All | All excl. lost | M | A | B | Q | T |
|---|---|---|---|---|---|---|---|
| Flat mean | 50.3 (+5.7) | 49.8 (+5.1) | 28.6 | 36.2 | 101.5 | 133.3 | 77.9 |
| Flat median | 47.3 (-7.7) | 46.8 (-8.2) | 27.9 | 36.6 | 100.7 (-27.9) | 100.0 (-100.0) | 77.9 |
| Seasonal naive | 36.4 (+5.8) | 35.9 (+5.3) | 36.8 | 35.9 | 33.5 | 32.3 | 36.3 |
| Cycle mask x mean order | 29.8 (+5.7) | 29.3 (+5.2) | 28.6 | 29.0 | 27.3 | 26.0 | 41.3 |
| Cycle mask x median order | 29.2 (+1.8) | 28.7 (+1.3) | 27.9 | 28.4 | 27.3 | 26.2 | 39.9 |
| Mask x mean order, one-offs neutralised | 29.4 (+4.9) | 28.8 (+4.3) | 28.0 | 28.6 | 27.3 | 26.0 | 40.7 |
| + accumulation weights (T: 2 then 1 months; A: 1.5 after the shutdown) | | 27.7 (+4.3) | 28.0 | 27.6 | 27.3 | 26.0 | 28.2 |
| same with a 24-month level | | **26.3 (-0.05)** | 26.8 | 26.3 | 25.1 | 24.5 | 26.1 |

- Under the flat mean the B, Q and T series (25.2% of volume) produce 53.2% of the absolute error; under the phase-aware forecast 26.9%.
- A cycle-blind constant cannot work on periodic orders: for a quarterly series ordering X every third month a constant c costs 2c + |X - c| per cycle, minimised at c = 0. Any model trained with an absolute-error or median objective on cycle-blind features therefore drifts to 0 on quarterly series (WAPE 100%, bias -100%), and the mean is even worse on WAPE (133%).
- Example, ELA-058 / Latin America (quarterly, orders in Mar / Jun / Sep / Dec), history 2024-04..2025-03 = 84, 138, 108, 102 in the order months; actual next 19 months = 168, 168, 136, 56, 181, 101 in the order months: flat mean (36 every month) WAPE 131.1%, bias -15.6%; flat median (0) WAPE 100%, bias -100%; seasonal naive 39.8%, -19.3%; mask x mean order (108) 34.6%, -20.0%; mask x median order (105) 35.3%, -22.2%.

**(b) Classification:** generator_structure. **(c) Confidence:** high.

**(d) Rule.** Forecast on the monthly-equivalent latent scale, then apply mask x accumulation weight. Never train a row-level model with an L1 / quantile-0.5 objective on raw units without the phase feature. Show Croston / SBA / TSB as the required intermittent baselines and report what a flat-rate forecast loses against the phase-aware one on T / B / Q series (about 50 / 74 / 107 WAPE points in this backtest).

### 13. WAPE-optimal versus bias-optimal point forecast: the gap is small, so stay near the mean

**(a) Evidence**
- Noise shape (monthly-cycle series, last 24 months, one-offs excluded, 34,155 orders): order / own mean has standard deviation 0.332, median 0.971, skewness +0.75 (log skewness -0.71: between normal and log-normal, gamma-like). Across all series the sum of per-series median orders is 0.963 of the sum of mean orders. Relative noise falls with volume: 0.45 below 10 units a month, 0.39 at 10–20, 0.33 at 20–40, 0.29 at 40–80, 0.27 above 80.
- Noise floor: volume-weighted mean absolute deviation of order / own mean is 24.3%; after removing the common region x month factor (what a perfect seasonal / macro model could explain) 22.8% (22.6% on the last 19 months). No row-level WAPE much below 23% is achievable; a backtest value below about 22% deserves a leakage check.
- Scaling a forecast by c (row WAPE | family x month | region x month | family x region x month | total by month | bias):

| Forecast | c | Row WAPE | Family x month | Region x month | Family x region x month | Total by month | Bias |
|---|---|---|---|---|---|---|---|
| Oracle level (in-window mean per series) | 1.000 | 24.21 | 7.01 | 7.23 | 8.56 | 6.43 | 0.00 |
| | 0.985 | 24.12 | 7.09 | 7.38 | 8.72 | 6.57 | -1.50 |
| | 0.965 | 24.08 | 7.47 | 7.97 | 9.17 | 6.92 | -3.50 |
| | 0.940 | 24.19 | 8.44 | 9.19 | 10.05 | 8.11 | -6.00 |
| Backtest, 24-month level | 1.000 | 26.27 | 7.30 | 7.22 | 8.97 | 6.45 | -0.05 |
| | 0.985 | 26.13 | 7.35 | 7.47 | 9.06 | 6.55 | -1.55 |
| | 0.965 | 26.01 | 7.72 | 8.08 | 9.43 | 6.94 | -3.54 |
| | 0.940 | 26.03 | 8.65 | 9.22 | 10.29 | 8.14 | -6.04 |

  The row-level optimum is at c = 0.965 (the median) but it is worth only 0.13–0.26 points, while every aggregated WAPE gets worse by 0.4–0.9 points and bias goes to -3.5%. A per-series in-window median (the most a median objective could achieve) reaches 24.64 against 25.50 for the mean without accumulation weights, at a bias of -3.7%.
- One-off orders (0.81% of volume in the pseudo-truth; about 0.26% / 0.28% of Direct OEM / Tier-1 Distributor orders according to the `numeric-reconcile` lens) cannot be forecast: a mean-unbiased forecast would add about +0.8%, a WAPE-optimal one ignores them.
- The 6.4–7.3% aggregated WAPE of a constant-level forecast with zero overall bias is the size of the common time variation (seasonality, macro) that the level-only forecast misses.

**(b) Classification:** other (metric). **(c) Confidence:** high for the numbers; medium for the recommendation, because the scoring formula is not published.

**(d) Rule.** Submit the conditional mean of the baseline (one-offs excluded) or shade it by at most 1.5% (c = 0.985: row WAPE -0.09 to -0.14, bias -1.5%, aggregates +0.05 to +0.25). Do not submit per-series medians or an L1-trained output without checking bias. Dashboard: P50 = predictive median, plus the mean for volume totals; show WAPE and bias both at row level and on family x month / region x month aggregates. For P10 / P90 use relative noise that depends on level (0.45 -> 0.27 as above).

### 14. Level window, horizon profile and what a backtest on the last 19 months can and cannot tell

**(a) Evidence**
- Level window (mask x mean on-phase order over the last W months, series with at least 36 months at the origin, WAPE % / bias %): W = 3: 31.4 / +3.0; 6: 30.1 / +5.3; 12: 28.8 / +4.4; 18: 27.7 / +1.1; **24: 27.4 / +0.4**; 36: 28.2 / -1.8. Averaging more orders beats recency: levels are stable. Consistently, the 42 series whose last-12 / previous-12 level ratio is outside 0.667–1.5 are about what noise alone predicts (ratio standard deviation 0.161 over 2,890 mature series, 1% / 99% quantiles 0.68 / 1.47); the only identified real shifts among them are 4 Helios | India series.
- Horizon profile of the level-only forecast (origin 2025-03): WAPE 26.3% at month 1 and 26.9% at month 19, no growth with horizon; bias follows the calendar: -1.0, -1.6, +5.1, +9.8, +12.5, +6.8, +8.7, +9.7, +15.7, +17.0, +19.6, +6.0, +2.9, -1.9, -1.9, -1.5, +1.6, -6.0, -7.0% for 2025-04..2026-10. Monthly volume ranged from 113,431 (2026-02) to 153,983 (2026-10).
- Last 12 vs previous 12 months, mature live series: all 0.988; EV 0.948 (301 series), ICE 1.002 (446), Universal 0.991 (2,143); India 1.013, Asia Pacific 0.989, North America 0.988, Latin America 0.980, Europe 0.979, MEA 0.973; core 0.998, tail 0.986.
- Shipped vs unconstrained in the last 12 months: 0.9975 overall, 437 constrained or carry-over cells (1.20%) in 216 series; in those series shipped / unconstrained = 0.964.
- 65 series have a one-off order in the last 12 months (2.20% of volume); their raw 12-month mean is 1.36 times the baseline level at the median (maximum 2.45).

**(b) Classification:** other (validation design). **(c) Confidence:** medium-high.

**(d) Rule.** Estimate the series level from 18–24 months of unconstrained, one-off-neutralised orders (post-switch months only for the 23 switch series; from 2025-09 for Helios | India; with a ramp model for series younger than 24 months); the improvable part is the common calendar / macro factor (up to 19.6% bias in single months), not recency. Report backtest bias by calendar month as well as by horizon, since at one origin the two are confounded.

### 15. Recent state of every test series (`series_state.csv`, 3,068 rows x 89 columns)

**(a) Evidence.** Columns: keys and master attributes; test rows, first test month, `test_mask` (19 characters, `X` = order expected), `n_test_on`, `first_on_test_month`; history length, first grid month; cycle code, kind, orders per year, mask mismatches in the last 36 months; for the last 12, last 24 and previous 12 months: cells, unknown cells, zero months, mean shipped units, mean unconstrained demand, number of orders, mean and median baseline order, monthly-equivalent level, one-off count, constrained-cell count; last order month, months since last order, trailing zero / unknown counts, missing 2026-10 row; customer-switch month, ratio and previous customer; cycle-change month; Orion and Helios flags; EOL in window and rows after EOL; risk flags, primary `risk_group`, `naive_test_volume`.

| Primary risk group | Series | Test rows | % of series | % of naive test volume |
|---|---|---|---|---|
| stable | 2,901 | 55,119 | 94.56 | 96.61 |
| young, 12–23 months of history | 49 | 931 | 1.60 | 1.31 |
| last-12 / previous-12 level ratio outside 0.667–1.5 | 42 | 798 | 1.37 | 1.18 |
| just launched, under 12 months | 18 | 342 | 0.59 | 0.23 |
| EOL inside the window | 18 | 342 | 0.59 | 0.39 |
| lost account | 16 | 304 | 0.52 | 0 (0.73 at the pre-loss level) |
| cold start | 10 | 117 | 0.33 | 0 (about 0.2 with a prior) |
| customer switch in the last 24 months | 8 | 152 | 0.26 | 0.25 |
| low volume, under 5 units a month | 6 | 114 | 0.20 | 0.02 |

Non-exclusive flags: historical cycle change 27 series (1.16% of volume, all at least 35 months ago); any customer switch 23 (0.76%); one-off in the last 12 months 65 (2.20%); constrained cell in the last 12 months 216 (6.86%); unknown cell in the last 12 months 152 (5.20%; 151 with one, 1 with two) and 287 in the last 24; Orion | North America 62; Helios | India 65 (2.79%); history under 36 months 145 (3.55%); MEA 518 (9.15%); core tier 600 (22.3%). History length: 1,976 series with all 94 months, 466 with 58 (MEA from 2022-01), 549 between 24 and 93, 49 with 12–23, 18 under 12, 10 with none. Monthly-equivalent level, last 12 months: median 39.9, 5% / 95% quantiles 12.8 / 99.4, maximum 308.5; 76 series under 10 and 438 under 20 units a month.

- **Lost accounts (16):** every one has 8–19 consecutive on-phase zero months to 2026-10, the SKU is `Active`, the customer is unchanged in test. Pre-loss monthly-equivalent levels: HYD-081 / North America 77.8 (last order 2025-03), PTC-002 / North America 110.8 (2025-05), THM-015 / North America 46.1 (2025-06), ELA-040 / North America 46.2 (2025-07), CSS-062 / Asia Pacific 44.2 (2025-09), CSS-045 / India 74.1, ELA-084 / India 29.8, HYD-061 / Europe 74.5, PMP-076 / India 43.2, PTC-003 / Europe 119.2, PTC-038 / North America 48.0 (all 2025-10), BSS-034 / North America 72.6, CSS-085 / Europe 59.8 (2025-11), BSS-082 / India 95.1, ELA-055 / Latin America 39.3, PMP-022 / India 51.6 (2025-12). Sum 1,032 units a month = 0.72% of the pre-loss total, 19,613 units over 19 months. By region: North America 6, India 5, Europe 3, Asia Pacific 1, Latin America 1; 9 different customers; all 4 channels.
- **Just launched (18):** BSS-012 (launch 2026-07, 4 regions, 4 months), ELA-017 (2026-04, 6 regions, 7 months), THM-011 (2026-05, 5 regions, 6 months), PMP-019 (2026-08, 3 regions, 3 months). Their observed level is still on the launch ramp and their cycle rests on 3–7 months.
- **Young (49):** BSS-018, BSS-037, CSS-010, CSS-037, CSS-057, ELA-061, HYD-023, HYD-063, HYD-086, HYD-089 (17–23 months); cycle identified with 0 mismatches for 48 of 49.
- **Low volume (6):** ELA-012, HYD-001 and PTC-010 in Latin America and MEA (2.3–4.5 units a month) — core SKUs in their two weak regions; on-phase zeros are possible here (26% at 1–2 units, 5% at 4–6 according to the `panel-missing-zeros` lens).

**(b) Classification:** real_event (lost accounts, launches, EOL) / other (state table). **(c) Confidence:** high.

**(d) Rule.** Route by `risk_group`: stable -> global model on the latent scale; lost -> 0; EOL -> phase-out then 0; cold start and just launched -> tail prior x ramp, shrunk to the observed level; young -> ramp-corrected level; switch -> post-switch level. Put the non-stable groups (167 series, 3.4% of volume) on the planner exception list.

---

## Artefacts (all in `/home/pavan/Desktop/mks/research/scratch/test-structure/`)

| File | Content |
|---|---|
| `series_state.csv` | 3,068 test series x 89 columns: recent state, cycle and test mask, risk flags (finding 15) |
| `customer_switch_effects.csv` | 23 switches with before / after levels, control-adjusted ratio, persistence, cycle check |
| `train_customer_changes_raw.csv` | the 23 switches with last old / first new month |
| `lost_accounts_state.csv` | 16 lost accounts with last order month and pre-loss level |
| `sku_tiers.csv` | 601 SKUs: tier (core / tail), region order, number of regions |
| `test_expected_zero_rows_by_month.csv` | structural zero rows per test month (finding 11) |
| `orion_na_event_series.csv` | the 62 Orion Driveline / North America series with cycle, level and test mask |
| `cycle_inferred.csv` | independent cycle inference for 3,083 series (agrees 3,083 / 3,083 with `panel-missing-zeros`) |
| `metric_backtest_simple.csv`, `pseudo_truth_series_summary.csv` | backtest table and per-series pseudo-truth summary (finding 12) |
| `common_series_attrs.csv` | train vs test attributes of the 3,058 common series |
| `validate_submission.py` | contract validator (hard checks + business-rule warnings) |
| `reference_naive_submission.csv` | structure-only sanity benchmark in submission format (2,704,000 units) |
| `panel_ts.parquet`, `train_keys_attrs.parquet` | working panel (245,548 grid cells) and train keys with attributes |
| `t01_test_profile.py` .. `t16_noise_floor.py` | scripts, one per analysis step, each under a minute |
| `graphify-out/` | code graph of these scripts, produced by `graphify update .` in this directory as the repository instructions require after code changes (236 KB; safe to delete) |

## Open questions, ranked by likely impact on forecast accuracy

1. **Scoring formula.** Row-level WAPE, aggregated WAPE or both, and how bias is weighed: decides the shading (c between 0.965 and 1.0), worth up to 0.26 row-WAPE points one way and 0.9 aggregate points plus 3.5% bias the other.
2. **Common calendar and macro factor in the forecast window.** A level-only forecast was off by -7% to +19.6% in single months of the pseudo-test and 6.4% on monthly totals; this is the largest improvable component and belongs to the seasonality / macro lenses.
3. **Do lost accounts stay lost, and are post-EOL rows really 0 in the truth?** 304 rows worth 19,613 units (0.73%) and 156 rows worth 8,466 units (0.32%). No recovery and no post-EOL sale has ever been observed, but neither has the opposite been ruled out by data.
4. **New account events inside the window.** At in-window historical rates 30 losses, 12.5 switches and 23 cycle changes would occur; the timing evidence says the generator schedules none, with medium confidence. It affects ranges (P10) more than the point forecast.
5. **Size of the Orion Driveline | North America shutdown (2027-07..08).** 6,591 units at stake (0.25%); the only analogue is a strike at x0.15–0.25, and whether the cut propagates into later accumulated orders is supported by 10 orders only.
6. **Just-launched series (18) and cold starts (10).** Mature level, ramp speed and cycle are uncertain: about 0.5% of volume. The tail-tier prior (finding 9: family medians 47.8 / 41.2 / 54.0 for PMP / PTC / THM outside MEA, no Latin America discount) differs from the `lifecycle-master` prior for the cold starts (mature non-MEA levels 44–70 there, with Latin America 15–20% below the other regions) — to be reconciled.
7. **Phase-out curve before EOL.** Three lenses give slightly different factors for the last 4–6 months; 186 rows, about 2,000 units of difference.
8. **Are one-off orders present in the truth?** 0.81% of volume, unpredictable; relevant to bias only.
9. **Does the tier matter beyond region profile and cycle mix** (macro sensitivity, EV trend, one-off rate)? Yearly paths, seasonality and noise are the same in both tiers; other parameters were not tested here.
