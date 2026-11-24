# Lens `dates-dups` — dates, duplicates, load timestamps and Record_ID structure in `train.csv`

**Headline.** The key columns of `train.csv` are fully recoverable, with zero residual ambiguity. `Record_ID` is not an arbitrary ERP key: its numeric part enumerates the generator's complete (series x month) grid — 3,083 SKU-Region series, 245,548 cells, SKUs ascending, months ascending inside each series from `max(2019-01, Launch_Date, 2022-01 for Middle East & Africa)` to `min(2026-10, EOL_Date)`. So `Record_ID number - month index` is a constant that uniquely identifies the series. Three independent witnesses of the delivery month — the `Date` text (7 formats), `Load_Timestamp` (always the month after delivery) and the Record_ID position — agree on **248,248 / 248,248** raw rows once 30 `2062` year typos are fixed. That gives exact repairs for every date, exact fill of all 745 blank `Region` values, proof that there are 0 key collisions after de-duplication, and an exact list of the **982 missing rows** (0.400% of the grid, missing completely at random) that must be treated as unknown, not zero. Repeated Record_IDs are always pairs: 2,946 byte-identical copies and 736 restatements whose earlier load is the true value distorted by -40%..+50%; the "latest wins" rule is confirmed by `inventory_stockouts.csv` (17/17 later versions equal `Shipped_Units`, 0/17 earlier versions). Error injection is i.i.d. across load batches, with one exception found here: the "ERP migration" event is a deterministic blanking of Units and Revenue for every Latin America Aftermarket/Export row in 2023-03..05.

All numbers below were computed by the scripts in `research/scratch/dates-dups/` (working files, not included in the repository). Month index `midx` = months since 2019-01 (0..93).

---

## Findings

### F1. `Date` has exactly 7 textual formats, all unambiguous, all parse exactly
**Evidence.** Character-class signatures of all 248,248 `Date` values give exactly 7 shapes, no whitespace, no others:

| Format | Raw rows | Example |
|---|---|---|
| `YYYY-MM` (canonical) | 238,281 (95.985%) | `2019-01` |
| `YYYY/MM` | 1,703 | `2019/01` |
| `Mon YYYY` | 1,689 | `Jan 2019` |
| `YYYY-MM-DD` | 1,672 | `2019-01-01` (day part is `01` in all 1,672) |
| `Mon-YYYY` | 1,659 | `Jan-2019` |
| `MM/YYYY` | 1,623 | `01/2019` |
| `MM-YYYY` | 1,621 | `01-2019` |

Non-canonical: 9,967 raw rows (4.015%), 9,821 after de-duplication; about 0.67% per alternative format, flat by year (3.90%..4.23%). Month names are the 12 English title-case abbreviations only. No ambiguity: the 4-digit group is always the year, so `MM-YYYY` cannot be confused with `YYYY-MM`. Parsed month equals the Record_ID-grid month and the Load_Timestamp month for 248,248 / 248,248 rows (after F2).
**Classification:** data_error (format noise). **Confidence:** high.
**RULE.** Parse with 7 anchored regexes (see `build_keys_reference.py`); raise on anything else; output `YYYY-MM`. Log `date_fmt` per row for the data-quality report (9,967 rows "date format standardised").

### F2. 30 rows carry the year typo `2062` (digit transposition of 2026)
**Evidence.** The only out-of-range dates in the file: 30 rows, all `2062-MM` in canonical format, months 2026-01..2026-10 (2,3,4,0,5,3,2,2,4,5 by month), none duplicated. In all 30 the `Year` column says 2026 and `Load_Timestamp` falls on day 1-3 of the following 2026 month, and the Record_ID position gives the same month. Example: `CEL-0207046` (PTC-071, Latin America) `Date=2062-01`, `Year=2026`, `Month=1`, loaded `2026-02-02 02:13:11`. Rate 30 / 30,798 raw 2026 rows = 0.097%.
**Classification:** data_error. **Confidence:** high (3 witnesses agree on 30/30).
**RULE.** If parsed year is outside 2019..2026, swap the last two digits; assert it equals the `Year` column and `month(Load_Timestamp) - 1`. This is the only case where the Year column "rescues" Date; it is never wrong on those rows.

### F3. `Year`/`Month` columns: 246 rows have `Month` = true month + 1; Date wins (rule 1)
**Evidence.** `Year`/`Month` disagree with the raw `Date` in 276 rows = 30 (F2, Date wrong, Year right) + 246 (Month column wrong). In all 246, `Month` = Date month + 1 with December wrapping to 1 **without** incrementing `Year` (16 such rows, e.g. `CEL-0106213` HYD-006 Asia Pacific: `Date=2019-12`, `Year=2019`, `Month=1`, loaded `2020-01-03`). `Year` is never wrong. Spread uniformly over years (23..42 per year) and months (16..26). The Date is right in 246/246 (confirmed by Load_Timestamp and Record_ID). No row has both `Date` and `Year`/`Month` wrong (0 rows). Example: `CEL-0045443` (CSS-026 India) `Date=2019-01`, `Month=2`, loaded `2019-02-01`.
**Classification:** data_error (redundant column). **Confidence:** high.
**RULE.** Drop raw `Year`/`Month`; recompute both from the repaired `Date`. Register 246 "Month column conflict (Date authoritative)" rows. Never use `Year`/`Month` to key anything.

### F4. Three independent witnesses of the delivery month agree on every row
**Evidence.** Agreement on all 248,248 raw rows:

| Method | Rows correct | Errors |
|---|---|---|
| `Date` text, raw | 248,218 | 30 (`2062`) |
| `Date` text + F2 fix | 248,248 | 0 |
| `Year`/`Month` columns | 248,002 | 246 (F3) |
| `month(Load_Timestamp) - 1` | 248,248 | 0 |
| Record_ID position (F9) | 248,248 | 0 |

**Classification:** generator_structure. **Confidence:** high.
**RULE.** Pipeline unit test: `date_from_text == date_from_load_ts == date_from_record_id` for every row (hard assert). Fallback order if a future extract breaks one: Record_ID position, then Load_Timestamp, then Date text, then Year/Month.

### F5. `Load_Timestamp` is perfectly regular: 3 nightly batches after month end, plus restatement reloads
**Evidence.** 0 unparseable (one format, `YYYY-MM-DD HH:MM:SS`). The raw file is sorted ascending by `Load_Timestamp` (0 descents), hence also by delivery month. First loads fall on day 1, 2 or 3 of the month after the delivery month (82,219 / 82,461 / 82,832 rows; per-month shares 0.31..0.36 each), time of day uniform in 01:00:00..05:59:59 (hours 1..5: 49,884 / 49,224 / 49,848 / 49,664 / 49,628). The only other loads are 736 rows on days 6..27 of the following month, and they are exactly the second versions of restated Record_IDs (F6). No row is loaded before or during its delivery month (0 negative lags). Timestamps are not unique (12,063 distinct-ID rows share a second with another row), so timestamp is not a key.
**Classification:** generator_structure. **Confidence:** high.
**RULE.** `delivery_month = month(Load_Timestamp) - 1` is an exact date witness. A load on day >= 4 is a restatement marker. No feature value otherwise: do not use load day/hour as a model feature.

### F6. Repeated `Record_ID`: always exactly 2 versions; 2,946 exact copies + 736 restatements
**Evidence.** 248,248 rows, 244,566 unique IDs, 3,682 IDs appear twice, none three times (1.5055% of records; restatements are 19.99% of the duplicates).
- **Exact copies: 2,946** (1.2046% of records). All 15 columns identical including `Load_Timestamp`; the two copies are adjacent rows in the file (row distance 1 in 2,946/2,946). Includes zero-unit rows. Timestamp ties therefore never need a tie-break.
- **Restatements: 736** (0.3009% of records; 0.359% of the 205,141 positive-unit records). Second version loaded an exact whole number of days later, 5..24 days (uniform: 29..47 per day value), at the same time of day. Only `Units_Sold` and `Revenue_USD` differ (732 pairs); every other column, including corrupted labels and date format, is identical. In 4 pairs nothing differs except the timestamp because units are tiny (1, 2, 3, 2: `CEL-0099050`, `CEL-0181538`, `CEL-0183788`, `CEL-0206502`) and the distortion rounds away.
- **Shape of the restatement.** first/later ratio lies in two bands; for records with later units >= 80 (n=157): [0.603, 0.849] and [1.162, 1.4875], nothing in between. Overall range 0.556..1.5; first > later in 52.2%. Both versions reconcile `units x price = revenue` to the cent (732/732). Never applied to zero-unit rows (min units 2 / 3). Sum of |later - first| = 12,667 units on 42,023 later units.
- Example: `CEL-0000068` (BSS-001 North America 2024-08): 131 units loaded `2024-09-01 05:52:30`, restated to 105 at `2024-09-22 05:52:30`.

Duplicate and restatement rates are flat by load day, year and region (one-row-per-event chi-square p = 0.12..0.76; the only p < 0.05 is restated-by-hour, p = 0.038, not meaningful among 8 tests).
**Classification:** data_error (double loads). **Confidence:** high.
**RULE.** Sort by (`Record_ID`, `Load_Timestamp`, raw row) and keep the last. Never sum versions (would add 42,862 phantom units from superseded loads plus double-count 2,946 copies). Register: 2,946 "exact duplicate load removed", 736 "superseded first load removed" with first and final units (`dedup_decisions.csv`).

### F7. "Latest Load_Timestamp is correct" holds empirically
**Evidence.** (i) 17 restated records are also listed in `inventory_stockouts.csv`: the later version equals `Shipped_Units` in 17/17, the earlier in 0/17 (e.g. `CEL-0077602` ELA-019 India 2021-08: first 33, later 24, Shipped 24; the earlier value does not equal Requested either). (ii) Against the median of positive neighbours within +-6 months in the same series, the later version is closer in 474 / 732 (64.8%; median |log deviation| 0.260 vs 0.341); against the same month one year before/after, 63.7% (n=725). (iii) Revenue reconciles for both versions, so price x units cannot discriminate.
**Classification:** data_error (first load wrong). **Confidence:** high.
**RULE.** Apply business rule 2 with no exceptions. The first-load value is noise, not a demand signal: do not model it; show it in the anomaly register as "restated quantity (first load X, final Y, +N days)".

### F8. No Date-SKU-Region collisions exist: one row per Record_ID is one row per key
**Evidence.** After de-duplication and label standardisation there are 244,566 records and 244,566 distinct (date, SKU, region) keys: 0 keys with more than one Record_ID (also 0 in the rough clean on the 243,829 rows with a non-blank region). No split shipments, no re-keyed duplicates, no misdated rows.
**Classification:** generator_structure. **Confidence:** high.
**RULE.** One clean row per Date-SKU-Region = de-duplicate on `Record_ID` only. No group-by aggregation step; assert key uniqueness. If a collision ever appears it is a bug in label mapping.

### F9. `Record_ID` numbering is the generator's complete series x month grid
**Evidence.** `CEL-NNNNNNN` with NNNNNNN from 1 to 245,548.
- For every one of the 3,083 series, `rec_num - midx` is a single constant (0 deviating rows out of 248,248), and that constant is unique per series and strictly increasing in series order. First series BSS-001 / North America has `rec_num = midx + 1` (IDs 1..94).
- Series order: SKUs in ascending `SKU_ID` (598 SKUs in train); inside a SKU the regions come in a fixed per-SKU order. 100 SKUs have all six regions in the order NA, EU, APAC, India, LatAm, MEA, and they are exactly the first SKUs of each family (BSS-001..011, CSS-001..009, ELA-001..013, HYD-001..019, PMP-001..016, PTC-001..024, THM-001..008): a distinct "core" cohort. The other 498 SKUs have a random subset of regions in random order (over all 598 SKUs: 6 regions 258 SKUs, 5: 178, 4: 159, 3: 3).
- Block of a series = consecutive months from `start = max(2019-01, Launch_Date, 2022-01 if region is Middle East & Africa)` to `end = min(2026-10, EOL_Date)`, both inclusive. With these bounds the blocks tile 1..245,548 exactly at 3,082 / 3,082 boundaries, with one override (BSS-018, F12). Block lengths: 94 months for 1,976 series, 58 for 466 (457 of the 520 MEA series), minimum 3; 1,086 series start after 2019-01 (520 MEA + 566 late launches).
- `test.csv` lists its 3,068 series in exactly the same order (3,058 common series, identical relative order), confirming this is the generator's native order.

**Classification:** generator_structure. **Confidence:** high.
**RULE.** `series_key = rec_num - midx`; map `series_key -> (SKU, Region)` from rows with a non-blank region. Use it (a) to fill blank regions (F10), (b) to validate SKU/region label standardisation (0 mismatches found), (c) to build the full expected grid and locate missing rows (F11), (d) as the exact active window of each series (`record_id_blocks.csv`). Cheap feature to test: `core_sku` flag for the 100 first-of-family SKUs.

### F10. All blank `Region` values are repaired exactly from Record_ID
**Evidence.** 745 raw rows (737 records after de-dup, 0.30%) have blank `Region`. Each falls inside exactly one Record_ID block. Independent check: the row's `Customer_Name` equals the customer of the neighbouring months in the assigned series for 737 / 737. A customer-only repair would be unique for only 520 / 737 (70.6%; in 217 cases another region of the same SKU has the same customer). `SKU_ID` is never blank; after standardising its 6 label variants the SKU agrees with the Record_ID block for 248,248 / 248,248 rows. `Product_Family` is blank in 1,252 raw rows and is a pure function of the SKU prefix (7 prefixes, 1 family each; 1 BU per family).
**Classification:** data_error (missing value). **Confidence:** high.
**RULE.** `Region := region(series_key)` when blank. `Product_Family := family(SKU prefix)`, `Business_Unit := BU(family)` always. Register 745 raw rows "Region restored from Record_ID sequence".

### F11. 982 missing rows are pinpointed by Record_ID gaps and are missing completely at random
**Evidence.** 245,548 grid cells - 244,566 present = 982 missing (0.39992%). By year 92, 102, 106, 134, 130, 151, 138, 129; by region 0.354%..0.447%; by family 0.366%..0.428%. Per-series counts match a binomial with p = 0.004 (observed 695 / 124 / 9 / 3 series with 1 / 2 / 3 / 4 missing; expected 702 / 117 / 13.5 / 1.2). Consecutive-month pairs: 4 (expected 3.9). Independent of the hidden value: in 289 strictly alternating (every-second-month) series, 84 missing cells fall 41 on order months and 43 on zero months; zero share of +-1 neighbours 14.1% vs 14.7% overall. Not concentrated in the ERP-migration window (Latin America 2023-03/04/05: 2, 2, 0 missing). 16 of them are in 2026-10 and 65 in the last 5 months before that (2026-05..09), i.e. at the forecast origin. 26 missing cells are listed in `inventory_stockouts.csv`, which gives their `Shipped_Units` (e.g. ID 81940 = ELA-031 Asia Pacific 2021-04, Shipped 46).
**Classification:** data_error (dropped rows; rule 3: a missing row is not a zero). **Confidence:** high.
**RULE.** Reindex every series to its full block; the 982 cells in `missing_rows_from_id_gaps.csv` become NaN with flag `missing_row`. Fill the 26 known ones with `Shipped_Units`; impute the rest with a cycle-aware method (respect the series' ordering phase; never 0 by default); exclude imputed cells from the training loss and from backtest scoring. Months outside the block are "not on sale" (pre-launch / post-EOL / pre-MEA), not missing.

### F12. Exact lifecycle windows; one master-data conflict (BSS-018 launch date)
**Evidence.** Block start equals `max(2019-01, Launch_Date, 2022-01 for MEA)` and block end equals `min(2026-10, EOL_Date)` for every series except the four BSS-018 series (North America, Latin America, Asia Pacific, Middle East & Africa): contiguous IDs start at 2025-02 with a normal launch ramp (10 / 14 / 7 / 16 units in the first month, rising to 100+), while `sku_master.csv` says `Launch_Date = 2025-06`. No rows exist after any EOL month (6 discontinued SKUs, 25 series; the EOL month itself is the last month with a row). Every Middle East & Africa series starts no earlier than 2022-01 (event EV-024). Launch ramp across the 551 late-launch non-MEA series with at least 12 months of history: median units 4, 8, 12, 13.5, 17.5, 19, 22, 24 in months 0..7 after launch.
**Classification:** reference_conflict (BSS-018: transactions right, master wrong) + generator_structure. **Confidence:** high.
**RULE.** Effective launch = first month of the Record_ID block (overrides `sku_master` for BSS-018; register the 4-month conflict). Features: `months_since_launch`, `months_to_eol`, MEA region-age. Do not pad pre-launch months with zeros.

### F13. `test.csv` contains 156 rows after an EOL date, and new-launch rows only from launch month
**Evidence.** The three "EOL Announced" SKUs keep all 19 months in the test file: PTC-005 (EOL 2027-05) 72 rows after EOL, PMP-003 (EOL 2027-08) 54, THM-001 (EOL 2027-12) 30; 6 regions each. In train the generator emits no row after the EOL month. The three planned launches appear only from `Launch_Date`: PTC-029 (2027-03, 15 months x 3 regions), PMP-020 (2027-06, 12 x 4), THM-012 (2027-10, 8 x 3); 0 test rows precede a launch date. The 25 discontinued train series are absent from test.
**Classification:** generator_structure (business rule 5). **Confidence:** high that rule 5 applies; medium on whether the scorer's actuals are exactly 0 there.
**RULE.** Forecast exactly 0 for the 156 post-EOL rows (P10 = P50 = P90 = 0). Forecast new launches from month 0 of the ramp via `Replaces_SKU` analogues.

### F14. Error injection is i.i.d.: unrelated to load batch, hour, year or region
**Evidence.** 13 generic row-level flags tested against load day (1/2/3), hour, year, month and region (65 chi-square tests): 4 have p < 0.05 (3.25 expected by chance); the smallest is units `-` by year, p = 0.003 (0.06%..0.14% per year; Bonferroni-adjusted 0.2), all others >= 0.039. Lag-1 autocorrelation of each flag in file order after de-duplication is within +-0.003 (standard error 0.002): no bursts. (On raw rows it is about 0.01 only because exact copies sit next to each other.) Flags per row: 215,957 / 30,038 / 2,165 / 87 / 1 rows with 0 / 1 / 2 / 3 / 4 flags vs 215,585 / 30,758 / 1,843 / 62 / 1 expected under independence. Raw-row rates: date format 4.015%, region label variant 2.497%, channel label 1.509%, SKU label 1.507%, exact duplicate 1.20% of records, customer label 1.003%, family blank 0.504%, missing row 0.400%, region blank 0.300%, restatement 0.30% of records, negative units 0.200%, Month-column shift 0.099%, units `-` 0.088%, thousands separator in units 0.018%. The two "System"/"Corporate" events with no data-quality signature: CRM upgrade 2025-02 and catalogue rebrand 2019-10 (all rates at baseline). The exceptions are F15 and F17.
**Classification:** generator_structure. **Confidence:** high.
**RULE.** Treat generic errors as independent per-row noise; fix each by its own rule; no batch-level quarantine. Report these rates in the data-health view.

### F15. The "ERP migration" (EV-033) is a deterministic blanking, not missing rows
**Evidence.** All 380 records with blank `Revenue_USD` in the whole file are Latin America, 2023-03..2023-05 (126 / 126 / 128 per month), and every one also has blank `Units_Sold`. Within the window the blanking covers 100% of rows of channels Aftermarket and Export and 0% of Direct OEM and Tier-1 Distributor: 125 series are blank in all three months, 347 in none (no partial patterns apart from 6 series touched by F11). The rows themselves exist (Record_IDs present). `Unit_Price_USD` survives: across the file price is `0.0` on 35,390 / 35,390 zero-unit records and on only 295 of 205,141 positive-unit records, so price tells whether there was an order: 48 blanked rows have price 0 (no order) and 332 have price > 0 (order of unknown size).
**Classification:** data_error caused by a real system event. **Confidence:** high.
**RULE.** In Latin America x {Aftermarket, Export} x 2023-03..05 set units to NaN (flag `erp_not_migrated`), except set 0 where `Unit_Price_USD == 0`. Impute the 332 positive cells; never treat this window as a demand drop or a structural break. Generic feature: `price == 0` is a zero-order indicator usable to disambiguate any blank-units row.

### F16. Side finding: most blank units are exactly recoverable
**Evidence.** After de-dup 3,544 records have non-numeric units: 3,327 blank and 217 `-`. All 217 `-` rows have revenue 0 (dash = zero). Of the blanks, 2,545 have revenue > 0 and price > 0 with `revenue / price` an integer within 0.01 in 2,545 / 2,545; 402 have revenue 0; 380 are the ERP rows (F15).
**Classification:** data_error. **Confidence:** high.
**RULE.** `units := round(revenue / price)` when units blank and revenue > 0; `units := 0` when units is `-` or blank with revenue 0; otherwise F15.

### F17. Side finding: India x Aftermarket x 2021-07..2021-12 is recorded at one tenth
**Evidence.** Cross-checking train against `Shipped_Units` on the 5,804 stockout rows present in train: 5,652 equal, 90 blank in train, 62 differ = 14 sign flips, 4 x100, 2 x10 and 42 rows at about 0.1x, all India, 2021-07..2021-12 (e.g. ELA-034 India 2021-07: train 2, Shipped 17). Generalising: for the 90 India Aftermarket series the median of units / series median is 0.107, 0.107, 0.100, 0.108, 0.105, 0.103 in 2021-07..12 versus 1.08 in 2021-06 and 0.99 in 2022-01; 382 of 386 positive rows in the window are below 0.25. Revenue reconciles with the small units (452 / 462 rows), so revenue is understated too. No other region x channel x month cell shows this (the only other cells below 0.3 are COVID 2020-04/05 and the MEA 2022-01/02 market-entry ramp, which are real events). Not in the events calendar.
**Classification:** data_error (unit-of-measure, e.g. packs of 10). **Confidence:** high that it is an error; medium on the exact inverse (x10 loses the rounded digit).
**RULE.** Multiply units (and revenue) by 10 in India x Aftermarket x 2021-07..2021-12; where `inventory_stockouts` has the row use `Shipped_Units` exactly; mark `unit_scale_fix`. Leave to the units lens to confirm scope and whether exact digits can be recovered from elsewhere.

---

## Recommended order of operations for the pipeline (keys only)
1. Parse `Date` (7 regexes) -> fix `2062` -> assert equals `month(Load_Timestamp) - 1`.
2. `rec_num = int(Record_ID[4:])`, `series_key = rec_num - midx`.
3. Standardise SKU/Region labels; fill blank Region from `series_key`; assert one (SKU, Region) per `series_key`.
4. De-duplicate on `Record_ID` keeping the latest `Load_Timestamp`; write the dedup register.
5. Assert key uniqueness; reindex each series to its block (`record_id_blocks.csv`); flag the 982 missing cells.

Before / after for the data-health view: 248,248 raw rows -> 244,566 records (2,946 copies + 736 superseded loads removed) -> 245,548 grid cells (982 flagged missing).

## Artefacts (all in `research/scratch/dates-dups/`; working files, not included in the repository)
- `build_keys_reference.py` — asserted reference implementation of rules F1-F10 (runs in a few seconds); writes the three files below.
- `train_keys_clean.parquet` — one row per Record_ID (244,566): `Record_ID, rec_num, raw_row, date, midx, sku, region, series_key, date_fmt, year_typo, ym_conflict, region_filled_from_id, n_versions, dup_type, restatement_delay_days, units_first_load, Load_Timestamp`.
- `dedup_decisions.csv` — 3,682 repeated IDs: type, kept/dropped raw rows, timestamps, delay, units and revenue of both versions.
- `date_repairs.csv` — 10,235 raw rows with a date issue (9,959 format only, 238 Month-column conflict, 8 both, 30 year typo).
- `record_id_blocks.csv` — 3,083 series: ID block start/end, first/last month, length, rows present, master launch/EOL.
- `record_id_grid.parquet` — all 245,548 cells (rec_num, series, sku, region, date, present flag).
- `missing_rows_from_id_gaps.csv` — the 982 missing (sku, region, date) cells.
- `blank_region_repair.csv` — 737 blank-region records with the restored region and the customer cross-check.
- `row_error_flags.parquet` — 18 boolean error flags per raw row (used for F14).
- `restatements.parquet`, `dup_pairs.parquet` and scripts `s01`..`s25` — analysis steps in run order.

## Open questions, ranked by likely impact on forecast accuracy
1. **India Aftermarket 2021-H2 at 0.1x (F17).** Is the correction exactly x10, and are there smaller scaled cells (single SKU or customer) below the resolution of the region x channel scan? Affects level and seasonality of 90 series.
2. **Imputation of unknown cells.** 982 missing rows (81 of them in the last 6 months) plus 332 ERP-blanked positive cells: which imputer (cycle-phase aware seasonal median vs model-based) minimises backtest error, and should imputed cells be masked in lag features?
3. **Post-EOL test rows (F13).** 156 rows should be 0 under rule 5; confirm how the last months before EOL behave (ramp-down) for the 18 EOL-announced series, since those months are also scored.
4. **Other train-vs-stockout mismatches.** The 20 sign / x100 / x10 mismatches against `Shipped_Units` suggest the same numeric errors exist at similar rates outside stockout months; the units lens should estimate and fix them series-wide.
5. **Master-data conflicts beyond BSS-018.** Launch date is the only block-level conflict; descriptions, family and powertrain fields were not audited here.
6. **Restatement mechanism.** First-load distortion bands (0.60-0.85, 1.15-1.50) are characterised but irrelevant to forecasting once the latest version is kept; no further work needed.
