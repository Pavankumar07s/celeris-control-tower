# Skeptic review of lens `dates-dups` (`research/dates-dups.md`)

**Verdict in one paragraph.** I re-derived every finding from `data/raw/*.csv` with fresh code (no reuse of the investigator's scripts) and could not break the key-cleaning part of the report: dates, duplicates, load timestamps, the Record_ID grid, blank-region repair and the list of 982 missing rows all reproduce exactly. My independently built key table equals the investigator's `train_keys_clean.parquet` on all 244,566 records (same IDs, date, SKU, region and kept raw row), and my missing-cell list equals `missing_rows_from_id_gaps.csv` on 982 of 982 cells. **One finding needs correction: F17 (India Aftermarket 2021-H2).** The units are indeed recorded at one tenth, but the price on those rows is exactly 10 times the SKU price, so revenue is already correct. The report's rule "multiply units (and revenue) by 10" for the whole cell would inflate revenue tenfold (13.6 m USD becomes 136 m) and would corrupt 6 rows of the cell that are not pack rows. Tally: 16 confirmed, 1 partially confirmed, 0 refuted, 0 not checked.

All numbers below were computed by the scripts in `research/scratch/dates-dups-verify/` (working files, not included in the repository; listed at the end). Month index `midx` is months since 2019-01.

---

## Verdict per finding

### F1. Seven Date formats, all unambiguous — **confirmed**
Character-shape census of all 248,248 `Date` values gives exactly seven shapes with the same counts: `YYYY-MM` 238,281; `YYYY/MM` 1,703; `Mon YYYY` 1,689; `YYYY-MM-DD` 1,672 (day part `01` in all 1,672); `Mon-YYYY` 1,659; `MM/YYYY` 1,623; `MM-YYYY` 1,621. No blanks, no whitespace. Non-canonical 9,967 raw rows (4.015%), 9,821 unique IDs; share by year 3.90%..4.23%. I parsed with a tokeniser rather than seven regexes and got the same month on every row. (`v01_dates.py`)

### F2. Thirty `2062` year typos — **confirmed**
The only out-of-range years are 30 rows of `2062-MM`, all canonical format, months 1,2,3,5,6,7,8,9,10 with counts 2,3,4,5,3,2,2,4,5 (none in April, as reported). `Year` says 2026 on 30/30, the load timestamp falls in the following 2026 month on 30/30, none of the IDs is repeated. Rate 30 / 30,798 = 0.097%. No other transposed year exists (no 2091, 2002, 2012, 2032, 2042, 2052), so the typo is specific to 2026 rows. (`v01_dates.py`)

### F3. 246 rows where `Month` is true month + 1 — **confirmed**
`Year`/`Month` disagree with the raw Date on 276 rows = 30 typos + 246 Month-column errors. In the 246: month delta is +1 on 230 and −11 (December written as 1, Year unchanged) on 16; `Year` is never wrong; the Date agrees with the load timestamp on 246/246 and the `Year`/`Month` pair on 0/246. By year 23..42, by month 16..26. No row has both problems. Quoted examples `CEL-0106213` and `CEL-0045443` check out. (`v01_dates.py`, `v17_examples_misc.py`)

### F4. Three witnesses agree on every row — **confirmed**
Date text agrees with `month(Load_Timestamp) − 1` on 248,218 rows raw and 248,248 after the typo fix. `Record_ID number − midx` is a single constant for each of the 3,083 (SKU, Region) series with 0 deviating rows, and each constant maps to exactly one SKU and one region. Caveat on wording only: the Record_ID witness is not fully independent, because the series key is built from the same rows; the load timestamp is the truly independent one. (`v01_dates.py`, `v03_recid_grid.py`)

### F5. Load_Timestamp structure — **confirmed**
One format, 0 unparseable, file sorted ascending (0 descents). Load day 1/2/3 = 82,219 / 82,461 / 82,832 rows; hours 1..5 = 49,884 / 49,224 / 49,848 / 49,664 / 49,628; time of day 01:00:00..05:59:59. Load month minus delivery month equals 1 on all 248,248 rows. The 736 rows loaded on days 6..27 are exactly the second versions of restated IDs. 12,063 rows share a second with another row once exact copies are removed (same number as reported). (`v01_dates.py`, `v04_dups.py`, `v16_diff_artefacts.py`)

### F6. Repeated Record_ID: 2,946 exact copies + 736 restatements — **confirmed**
244,566 unique IDs; 3,682 appear twice, none three times. Column-difference pattern between the two versions: nothing differs on 2,946 pairs (all adjacent rows); `Units_Sold`, `Revenue_USD` and `Load_Timestamp` differ on 732; only `Load_Timestamp` differs on 4 (units 1, 2, 3, 2). Restatement delay is a whole number of days, 5..24, with 29..47 pairs per day value, always inside the same calendar month. Price identical on 736/736; both versions reconcile units × price = revenue on 736/736. First/later ratio for later units ≥ 80 (n = 157): [0.603, 0.849] and [1.162, 1.4875]; overall 0.556..1.5. Sum of |later − first| = 12,667 units. Restated rows never carry a blank, dash, negative or comma units string in either version. (`v04_dups.py`)

### F7. Latest load is the correct one — **confirmed**
17 restated records are in `inventory_stockouts.csv`: later version equals `Shipped_Units` on 17/17, earlier on 0/17, and the earlier equals neither Requested nor Requested + Carried_In on any. Against the median of positive neighbours within ±6 months of the same series, the later version is closer on 474 of 732 (64.8%; binomial p = 1e-15), median absolute log deviation 0.260 vs 0.341. (`v04_dups.py`, `v13_misc.py`)

### F8. No Date-SKU-Region collisions — **confirmed**
After keeping the latest load and filling blank regions: 244,566 records, 244,566 distinct keys, 0 collisions. Without using Record_ID at all (non-blank regions only): 243,829 records, 243,829 keys, 0 collisions. Among the 1,611 series with a complete numeric vector for the last 36 months, no two share the same vector, so there is no series-level duplication either. (`v05_dedup_keys.py`, `v17_examples_misc.py`)

### F9. Record_ID is the generator's series × month grid — **confirmed**
Numbers run 1..245,548. Series keys are strictly increasing with SKU (598 SKUs, each contiguous). With block = `max(2019-01, Launch_Date, 2022-01 for MEA)` to `min(2026-10, EOL_Date)` the blocks tile at 3,078 of 3,082 boundaries; the 4 failures are the BSS-018 series, and with BSS-018 starting 2025-02 the tiling is 3,082 / 3,082 and the cell total is exactly 245,548. Block lengths: 94 months on 1,976 series, 58 on 466 (457 of the 520 MEA series), minimum 3; 1,086 series start after 2019-01 (520 MEA + 566 late launches). 100 SKUs carry all six regions in the canonical order and they are exactly the first 11 / 9 / 13 / 19 / 16 / 24 / 8 SKUs of BSS / CSS / ELA / HYD / PMP / PTC / THM. Region counts per SKU: 6 on 258, 5 on 178, 4 on 159, 3 on 3. `test.csv` lists the 3,058 common series in the same relative order.

One addition on the proposed `core_sku` feature: I found no demand signal in it. Last-24-month mean units per series: median 41.4 (core) vs 41.0 (non-core), Mann-Whitney p = 0.79; zero share 0.159 vs 0.142; channel mix within 3 points. The cohort is a generator bookkeeping block (94 of 100 launched before 2019; all three "EOL Announced" SKUs are in it), not a demand segment. (`v03_recid_grid.py`, `v03b_tiling.py`, `v08_lifecycle_test.py`, `v13_misc.py`)

### F10. Blank regions repaired exactly from Record_ID — **confirmed**
745 raw rows, 737 records. Every one lands on an existing series key. Three independent checks, all 737 / 737: customer equals a neighbouring month's customer in the assigned series; sales channel equals the neighbour's channel (channel is constant in all 3,083 series); and the assigned region is among the regions of that SKU that have no other row that month. The last check is a repair that does not use Record_ID at all and it is unique on 717 of 737, never contradicting the Record_ID answer. Customer-only repair is ambiguous on 217 (unique on 520), as reported. Product family is a pure function of the SKU prefix; one business unit per family. (`v05_dedup_keys.py`)

### F11. 982 missing rows, missing completely at random — **confirmed**
245,548 − 244,566 = 982 (0.3999%). By year 92, 102, 106, 134, 130, 151, 138, 129 (chi-square p = 0.96); by region 0.354%..0.447% (p = 0.40); by family 0.366%..0.428% (p = 0.88); by channel 0.368%..0.415% (p = 0.67); by calendar month p = 0.30; by month index p = 0.93. Series with 0 / 1 / 2 / 3 / 4 missing: 2,252 / 695 / 124 / 9 / 3 vs binomial 2,249 / 702 / 117 / 13.5 / 1.2. Consecutive pairs 4 (expected 3.9). 16 missing in 2026-10 and 65 in 2026-05..09.

Independence from the hidden value, three ways: (a) in strictly alternating series, 39 missing cells sit on the order phase and 41 on the zero phase; (b) zero share among ±1 neighbours 14.1% vs 14.7% overall; (c) for the 26 missing cells listed in the stockout file, `Shipped_Units` has median 22.5 vs 16 for present rows, Mann-Whitney p = 0.20. Missing rate by series level quintile 0.37%..0.44%. The one soft spot: series with more than 60% zeros have a rate of 0.299% (55 cells vs 74 expected, about −2.2 standard errors, one of five bins), which is not enough to reject randomness. All 26 stockout rows without a train row are inside the grid. (`v09_missing.py`, `v17_examples_misc.py`)

### F12. Lifecycle windows; BSS-018 master conflict — **confirmed**
Records before the master `Launch_Date`: BSS-018 only, 16 records (4 regions × 2025-02..05), first-month units 16 / 14 / 10 / 7 rising to 100+, price constant at 285.65 from the first month. No rows after any EOL month (6 discontinued SKUs, 25 series; last row month equals the EOL month on 6/6). Launch-ramp medians for the 551 late-launch non-MEA series with at least 12 months: 4, 8, 12, 13.5, 17.5, 19, 22, 24 (identical to the report). (`v08_lifecycle_test.py`, `v13_misc.py`)

### F13. 156 post-EOL test rows; launches only from launch month — **confirmed**
Test: 58,219 rows, clean dates, 0 duplicate keys, `Year`/`Month` consistent on every row, 3,068 series (3,058 with 19 months; 4 with 12, 3 with 15, 3 with 8). Rows after EOL: PTC-005 72, PMP-003 54, THM-001 30 = 156. Rows before a launch date: 0. Train-only series: 25, all Discontinued. Test customer and channel in the first test month equal the last train values on 3,058 / 3,058.

Boundary to keep straight: the **EOL month itself is not zero**. Test has 18 rows in an EOL month. In train, 24 of the 25 discontinued series have positive units in their EOL month (values 0, 1, 2, …, 78; sum 455 vs a baseline of 974, ratio 0.47). The zero rule applies strictly to `Date > EOL_Date`. (`v08_lifecycle_test.py`, `v15_final_checks.py`)

### F14. Error injection is independent of batch, hour, year, region — **confirmed** (one nuance)
Raw-row rates reproduce to three decimals: date format 4.015%, region variant 2.497%, channel 1.509%, SKU 1.507%, customer 1.003%, family blank 0.504%, region blank 0.300%, negative units 0.200%, Month shift 0.099%, units dash 0.088%, thousands separator 0.018%. Of 64 chi-square tests (13 flags × load day, hour, year, month, region) the only strong signals are blank units by year / region / month, which vanish once the ERP rows are excluded (p = 0.17 / 0.75 / 0.54); the next smallest is units dash by year, p = 0.003, as reported. No change of any rate in 2019-10 or 2025-02; each SKU has exactly one description throughout, so the "rebrand" left no trace.

Nuance: Month-shift and `2062` rows never fall on a repeated Record_ID (0 of 276 rows; about 4.2 expected; probability 0.015 under independence), while date-format, blank-region and SKU-variant rows are duplicated at the normal rate (1.49%, 1.09%, 1.57%). This says something about the generator's step order and has no consequence for cleaning. (`v12_iid.py`, `v04_dups.py`)

### F15. ERP migration is a deterministic blanking — **confirmed**
Blank `Revenue_USD`: 380 records, all Latin America, 2023-03 / 04 / 05 = 126 / 126 / 128, all with blank units. In the window Aftermarket 246 of 246 and Export 134 of 134 are blank; Direct OEM 0 of 586; Tier-1 Distributor 0 of 460. Series patterns: 125 blank in all three months, 347 in none, 6 with fewer than three rows present. Price 0 on 48 blanked rows and > 0 on 332. Price is 0.0 on 35,390 of 35,390 zero-unit records and on 295 of 205,141 positive-unit records.

Extra check the report did not make: the surviving Latin America channels show no sign of partial recording in the window. Median log10(units / local series level) for Direct OEM is 0.003, 0.000, 0.056 and for Tier-1 Distributor −0.008, 0.022, 0.020 in the three months, against 0.00..0.04 for the same channels in other regions; zero share 0.114..0.115 in the three months vs 0.12..0.19 in the adjacent months. (`v06_numeric_profile.py`, `v10_scale_scan.py`, `v15_final_checks.py`)

### F16. Most blank units are exactly recoverable — **confirmed**
After de-duplication: 3,327 blank and 217 dash. All 217 dash rows have revenue 0 and price 0. Blanks: 2,545 with revenue > 0 (revenue / price is an integer to within 6e-14 on all 2,545), 402 with revenue 0 (price 0 on 402 / 402), 380 ERP rows. Safety checks I added: on the 2,537 of these rows with an unambiguous SKU-month price, the price is the canonical one on 2,537 / 2,537, so no second error hides in the divisor; and against the stockout file the recovered value equals `Shipped_Units` on 70 / 70, with the 19 price-zero rows all showing Shipped = 0. (`v06_numeric_profile.py`, `v14_blank_units.py`)

### F17. India × Aftermarket × 2021-07..12 at one tenth — **partially confirmed; the revenue claim and the rule are wrong**
What reproduces:
- Stockout cross-check: 5,804 of 5,830 rows present in train; 5,652 equal, 90 blank or dash, 62 differ = 42 at about 0.1x + 14 sign + 4 ×100 + 2 ×10. All 42 are India, Aftermarket, 2021-07..12, and every one equals `round(Shipped / 10)` (35 → 4, 15 → 2).
- Scope: scanning median log10(units / local level) by month over region, channel, region × channel, region × customer, family, family × region, customer and customer × channel, the India Aftermarket window (−0.92..−0.96 in each of the six months) is the only block that is not a calendar event. India 2020-04 at −1.26 is real: the stockout file's `Requested_Units` there are also at 0.06 of series level, and prices are normal.

What does not hold:
- **Revenue is not understated.** On 385 rows of the cell `Unit_Price_USD` is exactly 10 × the SKU's 2021 price (canonical price = modal 2021 price of the SKU outside the cell; modal share at least 94%). Units × price = revenue on 385 / 385, so revenue is "packs × pack price", which is the right dollar amount. India Aftermarket revenue per month is 2.27 m USD inside the window against 2.22 m in 2021-01..06 and 2022-01..06. On the 42 rows with a known shipped quantity, recorded revenue / (Shipped × canonical price) sums to 1.03. The report's "452 / 462 rows reconcile" is arithmetically right (385 pack rows + 67 zero rows) but the inference drawn from it is wrong.
- **The cell is not homogeneous.** 462 records = 385 pack rows + 70 zero-price rows + 6 blank-units rows at the normal price + 1 row with a different error (PTC-057 2021-07: units 280, price normal, revenue = 28 × price, Shipped 28). The 6 blank-units rows are at true scale: revenue / price gives 37, 116, 148, 36, 23, 56 against series levels 56, 72, 120, 33, 13, 27.

Damage if the rule is applied as written ("multiply units (and revenue) by 10 in the cell"):
- revenue of the cell goes from 13.6 m to 136 m USD, adding about 122 m to a company total of about 445 m for 2021-H2;
- if F16 has already filled the 6 blank rows, they are multiplied again: 3,744 phantom units on 6 rows;
- PTC-057 2021-07 would become 2,800 unless the stockout override catches it (it does, by luck of being in the stockout file).

The ×10 on units itself is sound and nearly unbiased: sum(10 × recorded) / sum(series level in adjacent half-years) = 1.06, and on the 42 known rows mean(10u − Shipped) = 0.6 with mean absolute error 2.45. None of the 385 pack rows belongs to a series whose level is 5 or below, so the floor at 1 pack does not create a low-volume bias. The numeric-reconcile lens reached the same row-level description independently (its section 12); its rule should supersede F17's. (`v07_india_scale.py`, `v10_scale_scan.py`, `v11_india_detail.py`, `v15_final_checks.py`)

---

## Corrections the pipeline must apply

1. **Replace the F17 rule with a row-level rule.** A row is a pack row when `Unit_Price_USD / canonical SKU price` equals 10 (385 rows, all India × Aftermarket × 2021-07..12). On those rows only: units := `Shipped_Units` where the stockout file has the row (42 rows), otherwise 10 × recorded (accurate to ±5); price := price / 10; **revenue unchanged**. Do not key the fix on region × channel × month.
2. **Do not multiply revenue by 10 anywhere in that cell.** Add a pipeline test: cleaned India Aftermarket revenue for each of 2021-07..12 lies between 1.9 m and 2.8 m USD (the range of the adjacent twelve months is 1.69 m..2.77 m).
3. **Inside the cell, treat the 7 non-pack priced rows by their own rules.** The 6 blank-units rows get `round(revenue / price)` and no further scaling; PTC-057 India 2021-07 is a units ×10 error (280 → 28).
4. **Zero forecasts only for `Date > EOL_Date` (156 rows).** The 18 test rows in an EOL month must keep a positive, reduced forecast: in train the EOL month is positive on 24 of 25 discontinued series.
5. **ERP window: one cell is recoverable.** THM-033 Latin America 2023-04 (`CEL-0226433`, Export, blank units, price 750.0) is in the stockout file with `Shipped_Units` = 65. Fill it; 331 positive cells remain to impute.
6. **Drop the `core_sku` feature from the priority list.** It shows no difference in level, zero share or channel mix.
7. **Keep everything else as written.** The date, de-duplication, region-fill, grid and missing-row rules (F1–F12, F15, F16) reproduce exactly and can be implemented from `build_keys_reference.py`, whose output I matched record for record.

## Missed

1. **Price is 10× on the India pack rows.** This is the fact that decides F17 and it was not looked at; the report inferred a revenue error that does not exist.
2. **The last month is final, not provisional.** The extract runs to 2026-11-23 05:08:17. Restatement reloads for delivery month 2026-10 are present at the normal rate (13 observed, 9.4 expected, delays up to 23 days), so October 2026 does not contain a surplus of uncorrected first loads at the forecast origin.
3. **No partial recording in the surviving ERP channels.** Latin America Direct OEM and Tier-1 Distributor are at normal level and normal zero share in 2023-03..05, so "some transactions were not migrated" means the two blanked channels only.
4. **A Record_ID-free region repair exists and agrees.** "The only region of the SKU with no row that month, inside its sales window" is unique on 717 of 737 blank-region records and contains the Record_ID answer on 737 / 737. Useful as an independent unit test.
5. **Month-shift and year-typo errors never land on duplicated IDs** (0 of 276, about 4.2 expected). Harmless, but "i.i.d." is slightly too strong as a description of the generator.
6. **The stockout file validates the blank-units and zero-price rules** more widely than reported: recovered units equal Shipped on 70 / 70; price is 0 on 871 of 871 stockout rows with Shipped = 0; only 10 rows with Shipped > 0 have price 0.
7. **Outside `train.csv`, same theme:** `macro_indicators.csv` has 114 rows for 113 months because 2022-06 appears twice with different values (PMI 53.9 vs 52.7; New_Vehicle_Orders_Index 102.9 vs 104.3; other six columns equal). There is no load timestamp to arbitrate. The second row is the one in line with its neighbours (PMI 53.5 → 52.7 → 52.2; orders 104.8 → 104.3 → 103.8). `events_calendar.csv`, `sku_master.csv`, `inventory_stockouts.csv` and `test.csv` have no duplicate rows or keys.

## Not done
- The pre-EOL decline shape was only glanced at (units / baseline in the last three months before EOL: 0.51, 0.42, 0.47 over 25 series, noisy); it belongs to the lifecycle lens.

## Scripts (all in `research/scratch/dates-dups-verify/`; working files, not included in the repository)
| Script | Covers |
|---|---|
| `vbase.py` | shared loader: date tokeniser, SKU / region / channel standardisation |
| `v01_dates.py` | F1, F2, F3, F4, F5 |
| `v02_labels_ids.py` | label variants, Record_ID format |
| `v03_recid_grid.py`, `v03b_tiling.py` | F9, F12 (tiling, block windows, BSS-018) |
| `v04_dups.py` | F6, F7 (pairs, restatements, stockout check) |
| `v05_dedup_keys.py` | F8, F10, missing-cell list |
| `v06_numeric_profile.py` | F15, F16 |
| `v07_india_scale.py`, `v11_india_detail.py` | F17 |
| `v08_lifecycle_test.py` | F12, F13 |
| `v09_missing.py` | F11 |
| `v10_scale_scan.py` | scope of F17, ERP-window level check |
| `v12_iid.py` | F14 |
| `v13_misc.py` | extract cut-off, ERP rows in stockouts, core cohort, launch ramp, F7(ii), other files |
| `v14_blank_units.py` | F16 safety, macro duplicate |
| `v15_final_checks.py` | damage estimate for the F17 rule, ERP series patterns, EOL month |
| `v16_diff_artefacts.py` | record-for-record diff against the investigator's artefacts |
| `v17_examples_misc.py` | quoted examples, India 2020-04, near-duplicate series |

Derived files written there (largest 9.9 MB, 21 MB in total; all can be rebuilt by running the scripts in numeric order): `v_dates.parquet`, `v_clean.parquet`, `v_num.parquet`, `v_price.parquet`, `v_grid.parquet`, `v_series_blocks.csv`, `v_series_blocks2.csv`, `v_missing_cells.csv`, `v_restatements.csv`.
