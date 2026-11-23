# Lens `labels-keys` — label / key standardisation in train.csv and the Record_ID decode

**Headline.** `Record_ID` is not an opaque ERP key: it is the generator's running row counter over a complete (SKU -> region -> month) grid of **245,548 cells = 3,083 series**, and it decodes SKU, Region and Date *exactly* (SKU 248,248/248,248 raw rows, Region 247,503/247,503 non-blank rows, Date 248,218/248,248 — the 30 exceptions are the `2062-MM` typos, where Record_ID is right and `Date` is wrong). With it every blank Region (745 raw rows / 737 IDs) and blank Product_Family (1,252 / 1,228) is recovered with zero residual ambiguity, the **982 missing rows are enumerated exactly** (ID gaps = exactly 0.4% of the grid), and after decoding there is exactly one row per Date-SKU-Region (244,566 unique keys, 0 collisions). All label noise is pure formatting (31 Region variants -> 6, 17 channel -> 4, 2,659 SKU_ID -> 598, 220 customer -> 12; 0 wrong-value labels, 0 over-merges, 0 unmapped). Real key-level events are few and clean: **23 customer switches** (one per series, each a permanent level shift of x0.45 to x2.44, none listed in the events calendar), **0 channel changes**, **16 lost accounts** (series that fall to a permanent zero 10–19 months before the end of train, all of them in test), plus two master-data conflicts (PMP-004 Business_Unit, BSS-018 Launch_Date) and 156 test rows that lie after an announced EOL.

All numbers below were computed by the scripts in `/home/pavan/Desktop/mks/research/scratch/labels-keys/` (raw CSVs read with `dtype=str, keep_default_na=False`). Unit figures use numerically-coerced raw `Units_Sold` (unit/currency errors not fixed), so medians are used wherever a level is quoted.

---

## Findings

### 1. Record_ID is a sequential index over the generator grid — exact decoder

**(a) Evidence**
- All 248,248 Record_IDs match `CEL-9999999`; numeric part ranges 1..245,548; 244,566 distinct values.
- Sorted by number, rows run SKU ascending -> region (per-SKU generator order) -> month ascending. Example: `CEL-0000001..0000094` = BSS-001 / North America 2019-01..2026-10; `CEL-0000095..0000188` = BSS-001 / Europe; `CEL-0000471..0000528` = BSS-001 / Middle East & Africa 2022-01..2026-10 (58 months).
- Each series owns one contiguous ID block; blocks never overlap and tile 1..245,548 with no slack.
- Block length is **from series start to series end, not a fixed 94**: 1,976 blocks of 94, 466 of 58 (MEA from 2022-01), the rest shorter (launches / EOL), min 3 (PMP-019, launched 2026-08, 3 regions; BSS-012, launched 2026-07, has 4).
- Closed form (verified: reproduces `start_rec`, `end_rec`, `start_idx`, `end_idx` for **3,083 of 3,083** series from reference data alone):

```
idx(YYYY-MM)   = (YYYY-2019)*12 + MM-1                       # 2019-01 -> 0, 2026-10 -> 93
series order   = SKU_ID ascending, then the SKU's regions in generator order
                 (= order of first appearance in test.csv; identical for 592/592 SKUs present in both)
start_idx_k    = max(0, idx(Launch_Date), 36 if Region == 'Middle East & Africa')   # BSS-018: 73, see finding 12
end_idx_k      = min(93, idx(EOL_Date))                       # EOL month inclusive
L_k            = end_idx_k - start_idx_k + 1
start_rec_k    = 1 + sum_{j<k} L_j
Record number r in [start_rec_k, start_rec_k+L_k-1]  =>  SKU_k, Region_k, month idx = start_idx_k + (r - start_rec_k)
```
- Accuracy against raw labels (all 248,248 raw rows, duplicates included):

| Field | Agree | Disagree | Note |
|---|---|---|---|
| SKU_ID (after format normalisation) | 248,248 | 0 | |
| Region (non-blank rows) | 247,503 | 0 | 745 blanks filled |
| Date (7 textual formats parsed) | 248,218 | 30 | all 30 are `2062-MM` typos; Record_ID gives 2026-MM, as do `Year` and `Load_Timestamp` |
| Product_Family vs SKU prefix (non-blank) | 246,996 | 0 | 1,252 blanks filled |

- Region order inside a SKU is not fixed (433 distinct order patterns over 598 SKUs; 100 SKUs use NA>EU>APAC>India>LatAm>MEA), i.e. each SKU has its own sampled region list. Regions per SKU: 6 regions 258 SKUs, 5: 178, 4: 159, 3: 3.

**(b) Classification:** generator_structure. **(c) Confidence:** high.

**(d) Rule.** Use `record_id_blocks.csv` (3,083 rows) + `decode_record_id()` in `build_clean_keys.py` as the authoritative key source: `SKU_ID`, `Region`, `Date` := decoded values; keep raw-label parsing as an independent cross-check and fail the pipeline if they ever disagree outside the documented 30 date typos. For the write-up, present Record_ID decoding as *corroboration* next to the business-logic recovery methods (finding 5) so the cleaning does not depend on a generator artefact alone.

### 2. Series grid: 3,083 series, 245,548 expected cells, 982 missing rows (exactly 0.4%)

**(a) Evidence**
- Series by start: 1,997 non-MEA series start 2019-01; 566 non-MEA start later (SKU launch after 2019-01; 138 SKUs have a Launch_Date > 2019-01); MEA: 520 series, 461 start 2022-01 (market entry, EV-024), 59 later. 25 series end before 2026-10 (the 6 discontinued SKUs; last row = EOL month).
- Missing IDs: 982 = int(0.004 x 245,548 = 982.19). Every other cell has exactly one ID. Spread is uniform: by region 0.35%–0.45% of cells; by year 92/102/106/134/130/151/138/129; by family 124–154; runs of consecutive missing IDs: 974 singles, 4 pairs; per block {0: 2,252, 1: 695, 2: 124, 3: 9, 4: 3} vs Poisson expectation {2,242, 714, 114, 12, 1}.
- Edge cases a row-count approach cannot see: **10 series are missing their first month** (e.g. CEL-0005821 BSS-012 / Asia Pacific 2026-07; CEL-0030891 BSS-077 / North America 2019-01) and **16 series are missing 2026-10**, the last training month (e.g. CEL-0021306 BSS-052 / Latin America, CEL-0125495 HYD-050 / India, CEL-0237043 THM-057 / India).
- 26 of the 982 missing cells are present in `inventory_stockouts.csv`, whose `Shipped_Units` is by definition what train should show (e.g. BSS-058 / Europe 2025-07 shipped 39 of 72 requested; ELA-001 / India 2021-05 shipped 24 of 35).
- The LatAm ERP-migration event (EV-033, 2023-03..05) is **not** row deletion: only 4 of 1,430 LatAm cells in that window are missing. Instead `Units_Sold` and `Revenue_USD` are blank on 128 / 135 / 128 rows (about 27% of LatAm rows, vs 3–6 blank per month before and after) = 391 rows with keys present but no quantity.

**(b) Classification:** data_error (random row deletion; blank quantities in the ERP window). **(c) Confidence:** high.

**(d) Rule.** Build the modelling panel from the block table (245,548 cells), left-join the de-duplicated rows, and leave the 982 absent cells as NaN (never 0 — business rule 3). Fill the 26 inventory-covered cells with `Shipped_Units` (observed) and `Requested_Units` (unconstrained). Register every missing cell in the anomaly register as `missing_row` (list: `missing_rows_from_record_id_gaps.csv`). For lag features on the 16 series without 2026-10, use the last available month or an imputed value — do not let lags silently shift. Treat LatAm 2023-03..05 blank units as missing values to impute, not zeros.

### 3. Load_Timestamp and the Year/Month columns: a second, independent date check

**(a) Evidence**
- `Load_Timestamp` month = delivery month + 1 for **all 248,248 raw rows**. First loads land on day 1–3 between 01:00 and 05:59; the raw file is fully sorted by Load_Timestamp.
- `Year` never disagrees with the decoded date (0 rows), including the 30 `2062` rows (Year = 2026). Example: CEL-0207046, Date `2062-01`, Year 2026, Month 1, loaded 2026-02-02 -> 2026-01.
- `Month` disagrees on 246 rows (0.10%): always Month = true month + 1 (230 rows) or 12 -> 1 (16 rows), i.e. the load month was written instead of the delivery month. Example: CEL-0045443, Date 2019-01, Month 2, loaded 2019-02-01. `Date` is right in all 246 (business rule 1 confirmed).
- Date text formats: `YYYY-MM` 238,281; `YYYY/MM` 1,703; `Mon YYYY` 1,689; `YYYY-MM-DD` 1,672; `Mon-YYYY` 1,659; `MM/YYYY` 1,623; `MM-YYYY` 1,621 (9,967 non-canonical = 4.0%). All parse to the Record_ID month.

**(b) Classification:** data_error. **(c) Confidence:** high.

**(d) Rule.** Date := Record_ID decode; assert equality with the parsed `Date` except where the parsed year is outside 2019–2026, and with `Load_Timestamp` month − 1 for every row. Log 30 `date_year_typo` and 246 `month_column_mismatch` (Date kept) in the DQ report.

### 4. Duplicate Record_IDs: 2,946 exact copies + 736 re-loads

**(a) Evidence**
- 3,682 IDs have two versions (none has three): 2,946 = int(1.2% of grid) byte-identical copies with the same Load_Timestamp, 736 = int(0.3% of grid) re-loads 5–24 days later in the same month (day-of-month 6–27; identical time of day on 736/736).
- Between versions no key or label ever differs (0 IDs with differing Region, SKU_ID, Date, Customer, Channel, Family, BU, Description, Price). Only `Units_Sold` and `Revenue_USD` change, on 732 of the 736 re-loads; new/old units ratio ranges 0.667–1.80 (350 revised up, 382 down). Example: CEL-0000068 131 -> 105 (loaded 2024-09-01, re-loaded 2024-09-22).

**(b) Classification:** data_error (double load) / real revision (re-load). **(c) Confidence:** high.

**(d) Rule.** Keep the row with the latest `Load_Timestamp` per Record_ID (rule 2); ties are identical rows. Report 2,946 `exact_duplicate` and 736 `superseded_version` rows separately.

### 5. Region: 31 raw variants -> 6; blanks 100% recoverable three independent ways

**(a) Evidence**

| Corruption type | Variants | Raw rows | Examples |
|---|---|---|---|
| canonical | 6 | 241,304 | |
| case | 8 | 2,244 | `INDIA`, `india`, `EUROPE`, `asia pacific`, `Latin america`, `NORTH AMERICA` |
| abbreviation | 8 | 1,948 | `APAC`, `EU`, `LATAM`, `LatAm`, `MEA`, `ME&A`, `NA`, `N. America` |
| trailing whitespace | 5 | 1,315 | `'India '`, `'Europe '` |
| punctuation | 2 | 504 | `Asia-Pacific`, `Latin-America` |
| wording | 1 | 188 | `Middle East and Africa` |
| blank | 1 | 745 | |

- No over-merge: each of the 30 non-blank variants maps to exactly one Record_ID-decoded region (e.g. `NA` 207/207 North America, `EU` 310/310 Europe, `ME&A` 180/180 MEA).
- **Pitfall:** a default `pd.read_csv` turns the literal `NA` into NaN — 952 "missing" regions instead of 745.
- Blank Region (745 raw rows = 737 unique IDs; true region: Europe 138, LatAm 137, India 134, APAC 133, NA 113, MEA 90) — recovery, each verified against the others:

| Method | Resolved | Correct |
|---|---|---|
| A. Record_ID block table | 737 / 737 | 737 |
| B. (SKU, customer, channel) occurs in one region only | 671 / 737 (91.0%) | 671 |
| C. the only region of that SKU with no row for that month | 717 / 737 (97.3%) | 717 |
| B and C combined (intersection of candidates) | 737 / 737 | 737 |
| D. previous and next Record_ID share SKU and region | 723 / 737 (14 at block edges) | 723 |

  Residual ambiguity: 0.

**(b) Classification:** data_error. **(c) Confidence:** high.

**(d) Rule.** Read with `keep_default_na=False`; apply `map_region.csv`; fill blanks from the Record_ID decode and assert agreement with method B-and-C. Unknown future variants must raise, not pass through.

### 6. Sales_Channel: 17 raw variants -> 4; channel never changes within a series

**(a) Evidence.** Non-canonical 3,745 rows (1.51%): case 1,800 (`direct oem`, `DIRECT OEM`, `tier-1 distributor`, `aftermarket`, `AfterMarket`, `export`, `EXPORT`), punctuation 1,011 (`Direct-OEM`, `Tier 1 Distributor`, `After-market`), abbreviation 403 (`T1 Distributor`), word order 370 (`OEM Direct`), trailing whitespace 161 (`'Export '`). No blanks. After mapping every one of the 3,083 series has exactly one channel for its whole life, and all 3,745 variant rows equal their series' channel. Test channel = train channel for 3,058/3,058 continuing series. MEA is Export-heavy (239 of 520 MEA series vs 32–50 elsewhere).

**(b) Classification:** data_error (labels) / generator_structure (static channel). **(c) Confidence:** high.

**(d) Rule.** Apply `map_sales_channel.csv`; treat channel as a static series attribute; assert one channel per series.

### 7. SKU_ID: 2,659 raw variants -> 598; five formatting corruptions, no wrong values

**(a) Evidence.** 3,741 non-canonical rows (1.51%), each with exactly one defect:

| Type | Variants | Rows | Example |
|---|---|---|---|
| lowercase | 417 | 768 | `thm-007` |
| missing dash | 411 | 767 | `BSS032` |
| leading whitespace | 416 | 749 | `' PTC-017'` |
| dropped leading zero(s) | 414 | 738 | `CSS-31` -> CSS-031, `AAA-9` -> AAA-009 |
| underscore | 403 | 719 | `PMP_023` |

All 2,659 variants normalise (strip, upper, `_` -> `-`, insert dash, zero-pad to 3) to a SKU that exists in sku_master and equals the Record_ID-decoded SKU on every row. No row carries another SKU's ID.

**(b) Classification:** data_error. **(c) Confidence:** high.

**(d) Rule.** `canon_sku()` in `lk_common.py` (mapping in `map_sku_id.csv`); assert result is in sku_master and equals the Record_ID decode.

### 8. Customer_Name: 220 raw variants -> 12; no distinct entity hidden among the odd labels

**(a) Evidence.** 2,490 non-canonical rows (1.00%):

| Type | Variants | Rows | Example |
|---|---|---|---|
| ` Inc.` suffix | 12 | 631 | `Vantara Auto Inc.` |
| double space | 12 | 629 | `Quantum  Drive Systems` |
| UPPERCASE | 12 | 609 | `HELIOS AUTO PARTS` |
| one letter deleted | 155 | 566 | `Orion Drveline`, `Slaris Automotive`, `Apex Tier Oe` |
| one space deleted | 17 | 55 | `HeliosAuto Parts`, `VantaraAuto` |

- Every typo is exactly one character deleted from one canonical name (never the first or last character) and matches exactly one of the 12 names — no fuzzy threshold is needed.
- Context check: all 2,490 variant rows equal the canonical customer of the neighbouring months in the same series; after mapping, 3,060 series have one customer and 23 have exactly two in two clean consecutive runs (finding 9). No blanks.
- The 12 names are 12 real entities: Atlas Mideast Components, Falcon Gulf Motors and Kestrel Mobility sell **only** in MEA (180 / 174 / 166 series) and the other nine never sell there.

**(b) Classification:** data_error. **(c) Confidence:** high.

**(d) Rule.** `canon_customer()` (strip, collapse spaces, drop ` Inc.`, case-fold, else unique single-deletion match); mapping in `map_customer_name.csv`; unmapped values raise.

### 9. Customer switches: 23 series, one switch each, all permanent level shifts

**(a) Evidence.** No gap month between old and new customer in any of them; channel unchanged; switch months span 2022-07..2025-05; regions: India 6, Europe 6, APAC 4, LatAm 4, NA 3, MEA 0. **None is in events_calendar** (its 3 Customer events are a strike, a capacity increase and a retooling shutdown). `test.csv` carries the post-switch customer for all 23 (test customer = last train customer for 3,058/3,058 series). Median units 12 months before -> after (raw units):

| SKU | Region | Channel | From -> To | First month of new customer | Median before | Median after | Ratio |
|---|---|---|---|---|---|---|---|
| BSS-001 | Asia Pacific | Direct OEM | Helios Auto Parts -> Crestline Manufacturing | 2022-09 | 63.0 | 60.0 | 0.95 |
| BSS-024 | Asia Pacific | Aftermarket | Solaris Automotive -> Meridian Assembly | 2024-04 | 44.5 | 90.0 | 2.02 |
| BSS-081 | North America | Export | Nexon Motor Group -> Apex Tier One | 2025-01 | 51.5 | 28.5 | 0.55 |
| CSS-066 | Latin America | Aftermarket | Helios Auto Parts -> Apex Tier One | 2024-12 | 16.0 | 34.0 | 2.12 |
| CSS-085 | India | Direct OEM | Crestline Manufacturing -> Helios Auto Parts | 2022-07 | 30.0 | 24.5 | 0.82 |
| ELA-023 | Europe | Direct OEM | Apex Tier One -> Quantum Drive Systems | 2024-11 | 26.0 | 31.5 | 1.21 |
| ELA-063 | India | Direct OEM | Quantum Drive Systems -> Apex Tier One | 2024-06 | 0.0 | 6.5 | n/a (mean ratio 1.56; bi-monthly orders) |
| HYD-001 | Asia Pacific | Direct OEM | Meridian Assembly -> Orion Driveline | 2024-05 | 13.0 | 25.0 | 1.92 |
| HYD-009 | Europe | Direct OEM | Nexon Motor Group -> Apex Tier One | 2024-05 | 46.5 | 34.0 | 0.73 |
| HYD-013 | North America | Direct OEM | Nexon Motor Group -> Crestline Manufacturing | 2022-10 | 51.5 | 23.0 | 0.45 |
| HYD-055 | Asia Pacific | Tier-1 Distributor | Orion Driveline -> Helios Auto Parts | 2022-09 | 23.5 | 32.0 | 1.36 |
| HYD-059 | India | Aftermarket | Crestline Manufacturing -> Vantara Auto | 2024-10 | 13.5 | 33.0 | 2.44 |
| PMP-015 | Europe | Export | Crestline Manufacturing -> Apex Tier One | 2025-04 | 87.0 | 58.0 | 0.67 |
| PMP-032 | Europe | Direct OEM | Solaris Automotive -> Quantum Drive Systems | 2023-09 | 43.5 | 67.0 | 1.54 |
| PMP-047 | North America | Tier-1 Distributor | Vantara Auto -> Solaris Automotive | 2023-01 | 101.5 | 63.5 | 0.63 |
| PMP-074 | Latin America | Direct OEM | Orion Driveline -> Apex Tier One | 2023-12 | 0.0 | 0.0 | n/a (mean ratio 1.38; quarterly orders) |
| PTC-034 | India | Direct OEM | Nexon Motor Group -> Meridian Assembly | 2024-05 | 69.5 | 49.5 | 0.71 |
| PTC-050 | Europe | Direct OEM | Helios Auto Parts -> Quantum Drive Systems | 2025-05 | 43.0 | 24.0 | 0.56 |
| THM-003 | Latin America | Export | Meridian Assembly -> Solaris Automotive | 2025-01 | 14.0 | 16.5 | 1.18 |
| THM-017 | Europe | Direct OEM | Solaris Automotive -> Nexon Motor Group | 2023-01 | 35.0 | 52.5 | 1.50 |
| THM-020 | India | Export | Orion Driveline -> Crestline Manufacturing | 2025-01 | 79.5 | 63.5 | 0.80 |
| THM-026 | Latin America | Tier-1 Distributor | Vantara Auto -> Quantum Drive Systems | 2023-05 | 59.0 | 98.5 | 1.67 |
| THM-047 | India | Export | Apex Tier One -> Helios Auto Parts | 2025-01 | 24.0 | 40.5 | 1.69 |

Of the 21 with a defined median ratio, 10 step down (0.45–0.95) and 11 step up (1.18–2.44); the same before/after ratio for all other series at the same dates has median 1.07. The step is immediate (BSS-024: 46, 34, 55 -> 81, 62, 78, 79; HYD-013: 58, 53 -> 24, 22, 23, 23). The share of zero months is unchanged across the switch in 22 of 23 (ordering cycle preserved).

**(b) Classification:** real_event (account change). **(c) Confidence:** high for the list and dates; medium for the individual ratios (raw units, 12-month windows).

**(d) Rule.** Anomaly register: 23 `customer_switch` entries (type = real event, action = model as structural break). Modelling: add `months_since_customer_switch` / regime id; estimate level from the post-switch regime only (18–52 months are available for all 23) and reuse pre-switch data only for seasonality and ordering cycle after rescaling by the step ratio. Detail in `customer_switches.csv`.

### 10. Customer-scoped events must be joined on the customer *at that time*

**(a) Evidence.** Using the time-varying customer: Nexon Motor Group | Europe (strike EV-038, 2023-10..11): 46–47 series, median units 6.5 and 6.0 against 44.5–58.5 in May–Jul and 48.5 in Sep 2023, summed units 634 and 478 against about 2,670 per month (x0.13 on medians, x0.21 on sums), while other customers in Europe stay flat (medians 47, 44, 43, 38 for Sep–Dec). THM-017 / Europe became a Nexon series in 2023-01 and is hit; HYD-009 / Europe was Nexon until 2024-04 and is hit although its current customer is Apex Tier One. Helios Auto Parts | India (EV-052, from 2025-09, permanent): 65 series, mean monthly sum 2,914 (May–Aug 2025) -> 3,912 (Sep 2025–Oct 2026) = x1.34, monthly medians 37.5 -> 48.0 = x1.28, while other Indian customers are x1.00 (sums) / x1.05 (medians). Against a 12-month base (Sep 2024–Aug 2025) Helios is x1.09 (sums, inflated base from raw unit outliers) / x1.18 (medians) versus x0.88 / x0.96 for the others, i.e. an uplift of roughly +20% to +35% relative to the rest of India. CSS-085 and THM-047 switched *to* Helios (2022-07, 2025-01) and are in scope. Forecast window: Orion Driveline | North America retooling shutdown 2027-07..08 (EV-062) covers 62 test series; no switch involves Orion in North America.

**(b) Classification:** real_event. **(c) Confidence:** high for scope and direction; medium for magnitudes (raw units).

**(d) Rule.** Build event flags from a (series, month) -> customer table, not from the latest customer. Use the Nexon strike as the analogue for the Orion shutdown months and keep the Helios India uplift as a permanent level in the base (already inside the last 14 months of history).

### 11. Lost accounts: 16 series drop to a permanent zero — all are in test

**(a) Evidence.** Longest run of zero/missing months per series: 0–5 months for 3,065 series, 8 for 2 intermittent series (BSS-057 / LatAm, ELA-052 / India, both mid-history with 62–67% zero months), and **10–19 months for 16 series, every one of them running to 2026-10**, starting abruptly from a normal level:

| SKU | Region | Customer | Channel | Zero since | Months | Mean units in prior 12 months |
|---|---|---|---|---|---|---|
| HYD-081 | North America | Quantum Drive Systems | Aftermarket | 2025-04 | 19 | 77.8 |
| PTC-002 | North America | Quantum Drive Systems | Tier-1 Distributor | 2025-06 | 17 | 110.8 |
| THM-015 | North America | Crestline Manufacturing | Aftermarket | 2025-07 | 16 | 46.1 |
| ELA-040 | North America | Crestline Manufacturing | Tier-1 Distributor | 2025-08 | 15 | 46.3 |
| CSS-062 | Asia Pacific | Quantum Drive Systems | Direct OEM | 2025-10 | 13 | 44.2 |
| CSS-045 | India | Vantara Auto | Direct OEM | 2025-11 | 12 | 71.8 |
| ELA-084 | India | Vantara Auto | Tier-1 Distributor | 2025-11 | 12 | 29.8 |
| HYD-061 | Europe | Nexon Motor Group | Direct OEM | 2025-11 | 12 | 74.5 |
| PMP-076 | India | Meridian Assembly | Export | 2025-11 | 12 | 44.6 |
| PTC-003 | Europe | Solaris Automotive | Direct OEM | 2025-11 | 12 | 109.1 |
| PTC-038 | North America | Vantara Auto | Aftermarket | 2025-11 | 12 | 39.8 |
| BSS-034 | North America | Solaris Automotive | Direct OEM | 2025-12 | 11 | 67.5 |
| CSS-085 | Europe | Apex Tier One | Tier-1 Distributor | 2025-12 | 11 | 58.1 |
| BSS-082 | India | Quantum Drive Systems | Export | 2026-01 | 10 | 95.1 |
| ELA-055 | Latin America | Orion Driveline | Direct OEM | 2026-01 | 10 | 38.1 |
| PMP-022 | India | Helios Auto Parts | Aftermarket | 2026-01 | 10 | 470.2 (includes a raw outlier of 5,100 in 2025-04; other months 31–73) |

The tails are explicit `Units_Sold = 0` rows (e.g. PMP-022 / India: 59, 72, 73, 45 for Sep–Dec 2025, then ten 0s), not blanks; only PTC-038 has 2 blank quantities and BSS-034 one missing row inside the tail. All 16 appear in test.csv with 19 rows and the same customer (304 test rows). They are not SKU discontinuations: all 16 SKUs are `Active` in the master with no EOL_Date, and every other region of each SKU (3–5 regions) still has units > 0 in the last 6 months. They are not customer-wide either (9 different customers). Start months: 2025-04, 06, 07, 08, 10, six in 2025-11, two in 2025-12, three in 2026-01.

**(b) Classification:** real_event (lost account). **(c) Confidence:** high that the series are dead at the end of train; medium-high that they stay at zero through 2028-05 (no return ever observed after a run longer than 8 months, but there is no positive evidence either).

**(d) Rule.** Anomaly register: 16 `lost_account` entries with start month. Forecast P50 = 0 for these 304 rows (P90 small, e.g. 0); exclude the dead tail from training of level/seasonality so the zeros do not drag down pooled models; exclude them from hierarchy scaling. List in `long_zero_runs_lost_accounts.csv`.

### 12. Product_Family, Business_Unit, SKU_Description and master-data conflicts

**(a) Evidence**
- Product_Family: 7 clean values + blank on 1,252 raw rows (1,228 IDs; spread evenly across the 7 prefixes, 164–186 each). No misspelt or wrong family on any row. SKU prefix -> family is exact (BSS, CSS, ELA, HYD, PMP, PTC, THM) so recovery is 100%. Business_Unit alone would identify the family for only 530 of the 1,252 rows (two BUs own two families each).
- Business_Unit: 5 clean values, never blank, family -> BU consistent on 248,248/248,248 rows: Brake & Safety Systems -> Safety & Compliance; Chassis & Structural and Precision Machined Parts -> Advanced Manufacturing; Electrical Assemblies -> Electronics & Controls; Hydraulic Systems and Thermal Management -> Fluid Control Group; Powertrain Components -> Power & Drive Systems.
- SKU_Description: exactly one non-blank description per SKU (598/598), identical to sku_master for all 598; blank on 996 raw rows (982 IDs); no case or whitespace noise. Master description = `Size_Class + ' mm ' + product name` for 601/601 SKUs (147 distinct product names).
- **Master conflict 1 — PMP-004 Business_Unit:** sku_master says `Power & Drive Systems`; every train row and every test row of PMP-004 says `Advanced Manufacturing`, the BU of all other 86 PMP SKUs.
- **Master conflict 2 — BSS-018 Launch_Date:** sku_master says 2025-06; all four regional series start 2025-02 with a normal launch ramp (2025-02: 10 / 14 / 7 / 16 units; 2025-05: 49 / 29 / 40 / 39; price 285.65 from the first month). It is the only one of 138 post-2019 launches whose first transaction month differs from the master.
- SKU sets: master 601 = train 598 + 3 planned launches (PMP-020, PTC-029, THM-012; test only). Train-only: the 6 discontinued SKUs ELA-014, HYD-020, PMP-017, PTC-025, PTC-026, THM-009 (25 series). No train or test SKU is missing from the master.

**(b) Classification:** data_error (blanks) / reference_conflict (PMP-004, BSS-018). **(c) Confidence:** high; medium on which side is wrong for BSS-018 (ramp shape says the master is wrong).

**(d) Rule.** Family and BU := lookup from SKU prefix (`ref_prefix_family_bu.csv`); description := sku_master by SKU. Override master PMP-004 BU to Advanced Manufacturing and use 2025-02 as BSS-018's effective launch for lifecycle features; log both in the anomaly register as `master_vs_transactions` with the evidence, and keep the 16 early BSS-018 cells (4 regions x 2025-02..2025-05; do not delete them as "sales before launch").

### 13. Test keys versus train: what the forecast grid actually is

**(a) Evidence**
- 3,068 test series = 3,058 continuing (customer and channel identical to the last train month for all) + 10 new series of the 3 planned launches. The 25 discontinued series are absent.
- 156 test rows fall **after an announced EOL**: PTC-005 (EOL 2027-05) 72 rows 2027-06..2028-05; PMP-003 (EOL 2027-08) 54 rows 2027-09..2028-05; THM-001 (EOL 2027-12) 30 rows 2028-01..2028-05. In train, discontinued SKUs have their last row in the EOL month and nothing afterwards, with a ramp-down before it (median level in the EOL month 0.32 of the level 19–30 months earlier, 23 series).
- Planned launches: PMP-020 (2027-06; India, LatAm, MEA, NA), PTC-029 (2027-03; APAC, LatAm, MEA), THM-012 (2027-10; Europe, LatAm, NA). Region sets, customers and channels are **not** inherited from the predecessor (e.g. PMP-003 / India is Crestline, Direct OEM; PMP-020 / India is Vantara Auto, Tier-1 Distributor). The same holds for the 6 historical replacements (30 successor series). Successors launch 2–3 months before the predecessor's EOL in all 9 pairs.
- Launch ramp from the 527 later-starting series with at least 30 months of history (units relative to the series' own mean in months 18–29), median by month since launch: 0.09, 0.22, 0.32, 0.39, 0.47, 0.57, 0.57, 0.63, 0.68, 0.68, 0.73, 0.79 (months 0–11). MEA market entry (about 457 series) shows the same shape: 0.10, 0.25, 0.35, 0.30, 0.48, 0.52, 0.55, 0.59, 0.78, 0.83, 0.86, 0.91.

**(b) Classification:** generator_structure / real_event (lifecycle). **(c) Confidence:** high for keys; medium for ramp values (raw units).

**(d) Rule.** Force forecast = 0 on the 156 post-EOL rows (business rule 5) and apply a ramp-down before EOL; forecast the 10 new series as (level from comparable SKUs with the same family / size class / channel / region) x launch-ramp curve, not as a copy of the predecessor's series; keep customer and channel as static test-time features.

### 14. The corruption process itself

**(a) Evidence.** Per unique ID the defect counts equal fixed fractions of the 245,548-cell grid: SKU_ID format 3,683 (1.5%), Sales_Channel 3,683 (1.5%), Customer_Name 2,455 (1.0%), Date format 9,821 (4.0%), blank description 982 (0.4%), blank family 1,228 (0.5%), blank Region 737 (0.3%), Region format 6,117 (about 2.5%), missing rows 982 (0.4%), exact duplicates 2,946 (1.2%), re-loads 736 (0.3%). Defects are independent across columns (rows with no label defect: 220,483 observed vs 220,438 expected under independence; at most 4 defects on one row) and flat over time (every yearly rate within about 0.3 points of the overall rate). Labels were corrupted before rows were duplicated (versions always share labels).

**(b) Classification:** generator_structure. **(c) Confidence:** high.

**(d) Rule.** Label noise carries no demand signal: clean it and do not create features from it. Put these counts in the machine-readable DQ report as before/after figures (`keys_dq_summary.json`, `label_corruption_summary.csv`).

---

## Artefacts (all in `/home/pavan/Desktop/mks/research/scratch/labels-keys/`)

| File | Content |
|---|---|
| `lk_common.py` | Deterministic canonicalisers: `canon_region`, `canon_channel`, `canon_sku`, `canon_customer`, `pdate`, prefix -> family / BU |
| `build_clean_keys.py` | One-command key cleaner with hard assertions; contains `decode_record_id()` |
| `record_id_blocks.csv` | Decode table, 3,083 rows: series_no, sku, region, start_rec, end_rec, length, start_idx, end_idx, start_date, end_date, n_ids_present, n_ids_missing, master launch / EOL / status |
| `train_keys_clean.parquet` | One row per raw row (248,248): clean SKU_ID, Region, Date, month_idx, family, BU, description, customer, channel, series_no, `f_*` fix flags, n_versions, is_latest_version |
| `keys_dq_summary.json`, `label_corruption_summary.csv` | Counts of every key fix (raw rows and unique IDs) |
| `map_region.csv`, `map_sales_channel.csv`, `map_product_family.csv`, `map_business_unit.csv`, `map_sku_id.csv`, `map_sku_description.csv`, `map_customer_name.csv` | raw -> canonical with corruption type and row count, one file per column |
| `ref_prefix_family_bu.csv` | SKU prefix -> Product_Family -> Business_Unit |
| `missing_rows_from_record_id_gaps.csv` | The 982 missing (Record_ID, SKU, Region, Date) cells |
| `missing_rows_recoverable_from_inventory.csv` | The 26 missing cells present in inventory_stockouts |
| `blank_region_recovery.csv` | 737 blank-Region IDs with the decoded region and candidate counts of methods B, C, B-and-C |
| `customer_switches.csv` | The 23 switches with before/after statistics |
| `long_zero_runs_lost_accounts.csv` | 18 series with zero runs of 6+ months (16 trailing = lost accounts) |
| `s01_…s23_*.py` | Analysis scripts in run order (`s22_closed_form.py` verifies the closed-form decoder, `s23_verify_claims.py` re-checks the quoted figures); `tmp_*.parquet/csv` are intermediates they share |

## Open questions, ranked by likely impact on forecast accuracy

1. **Do the 16 lost accounts stay at zero for all 19 forecast months?** 304 test rows; a wrong call either way is a 100% error on those rows. Needs a second opinion from the anomaly / intermittency lens (is there any generator pattern of accounts returning?).
2. **Post-EOL test rows (156) and the ramp-down before EOL** for PTC-005, PMP-003, THM-001: confirm the ramp-down shape on cleaned units and whether demand migrates to the successor in regions where both exist.
3. **Level of the 10 new launch series**: predecessors do not share region / customer / channel, so what sets the successor's level — family and size-class averages, or the predecessor's SKU-level volume? The 30 historical successor series are the test bed.
4. **Customer-switch step ratios** (x0.45 to x2.44): is the ratio a property of the new customer, of the pair, or random per switch? Affects only 23 series but they need regime-aware training.
5. **Magnitude of the Orion Driveline | North America shutdown (2027-07..08, 62 series)** — the Nexon strike analogue gives x0.13 (medians) to x0.21 (sums) on raw units; re-estimate on cleaned, de-seasonalised units.
6. **Imputation of quantity-less cells**: 982 missing rows (16 at 2026-10), 391 LatAm ERP-window blanks and the other blank `Units_Sold` values — choose one imputation so lags and rolling features are consistent.
7. **BSS-018**: accept 2025-02 as the true launch (4 series) — low impact, but it must be explained in the anomaly register.
8. Not run here: `graphify update .` (asked for by `/home/pavan/CLAUDE.md` after code changes). No graph exists for this project (`/home/pavan/graphify-out` holds no `graph.json`, `/home/pavan/Desktop/mks/graphify-out` does not exist), building one would write outside this lens's workspace and scan `.venv` while five other agents share the machine. The orchestrating session should run it once from the project root when the pipeline code exists.
