# Lens `numeric-reconcile` — Units × Price = Revenue reconciliation and numeric errors in train.csv

All counts are on the 244,566 de-duplicated Record_IDs (latest `Load_Timestamp` kept) unless "raw" is stated.
Everything below was computed by the scripts in `research/scratch/numeric-reconcile/` (final build: `14_build_diagnosis.py`).

## Headline

The numeric side of train.csv is a clean generator with a thin, fully enumerable layer of injected errors.
`Revenue = Units × Price` holds **to the cent** (max |diff| 1.2e-10) on 202,244 priced rows; the smallest real discrepancy anywhere is $9.00, so no rounding tolerance is needed.
After building a canonical price table (SKU × year, 2022 split at July for the surcharge) **every one of the 208,214 priced rows has price / canonical ∈ {1, 100, 10, 0.89} exactly** and every row falls into exactly one of 15 states: 2 clean states (202,244 priced + 35,390 zero rows = 97.17 %) and 13 error types covering **6,932 rows (2.83 %)**; a further 3 clean rows only carry a thousands separator (6,935 flagged rows in total).
Errors are **mutually exclusive** (never two on one row).
For each type the wrong field is identified unambiguously: of the 4,788 rows whose Units are wrong or missing, **4,071 (85.0 %) are restored exactly**, 385 (8.0 %) to within ±5 units (India pack-of-10 block) and 332 (6.9 %) must be imputed (Latin America ERP migration, known to be positive).
The units fixes are independently confirmed by `inventory_stockouts.Shipped_Units`: **5,761 of 5,761** comparable rows match exactly, including all 109 rows whose units I changed.
Two traps for naive cleaners: (i) on 737 mismatching rows the **revenue** is wrong and units are right (do not recompute units from revenue), (ii) 438 very large orders (4–29× the series level) reconcile perfectly and are **genuine one-off orders**, not unit errors.

## Findings

### 1. The identity is exact; all rows fall into 15 enumerable states — generator_structure, confidence high

(a) Evidence. Raw text signatures (raw 248,248 rows): Units_Sold is `digits` 244,127, blank 3,362, `-digits` 497, `-` 218, `d,ddd` 44; no decimals, no whitespace, no text. Unit_Price_USD is always `d.d` (never blank or negative). Revenue_USD is `d.d` 247,368, negative 497, blank 383.
State table (de-duplicated; raw-row totals in brackets):

| State | Rows | % | Wrong field | Units status |
|---|---|---|---|---|
| ok (priced, reconciles to the cent) | 202,244 [205,431] | 82.695 | – | as is |
| ok_zero_row (units 0, price 0.0, revenue 0.0) | 35,390 [35,805] | 14.471 | – | as is |
| units_blank_recoverable | 2,545 [2,572] | 1.041 | units | exact |
| price_in_cents | 614 [620] | 0.251 | price | as is |
| currency_eur_block | 498 [502] | 0.204 | price + revenue | as is |
| sign_error_negative | 491 [497] | 0.201 | units + revenue | exact |
| units_blank_zero_row | 450 [455] | 0.184 | units | exact (0) |
| revenue_x10 | 425 [437] | 0.174 | revenue | as is |
| uom_pack10_block | 385 [390] | 0.157 | units + price | approx ±5 |
| units_and_revenue_blank | 332 [335] | 0.136 | units + revenue | impute (>0) |
| revenue_digit_transposition | 312 [316] | 0.128 | revenue | as is |
| price_zeroed (units > 0, price 0) | 295 [299] | 0.121 | price + revenue | as is |
| units_x10 | 293 [295] | 0.120 | units | exact |
| units_dash_placeholder | 217 [218] | 0.089 | units | exact (0) |
| units_x100 | 75 [76] | 0.031 | units | exact |

Co-occurrence matrix of all error flags is diagonal (script 13e); the only overlap is the thousands separator, which is a pure formatting consequence of large numbers (finding 8). Both versions of all 3,682 duplicated Record_IDs carry the same state.
Impact of naive numeric coercion: total units 12,030,253 raw vs 11,723,379 corrected (−2.55 %; units ×100 alone adds 376,101 phantom units, units ×10 adds 145,593, sign errors remove 52,878, blanks hide 142,754); total revenue $8,684.43 M raw vs $8,575.85 M corrected (revenue ×10 alone inflates revenue by $161.9 M).

(d) RULE. Classify each row with `q = price / canonical_price` and `k = units / (revenue / true_price)`; assert that no row falls outside the 15 states (pipeline test). Reconciliation tolerance 0.005.

### 2. Canonical price table; business rule 4 holds exactly; annual increases are SKU-specific — generator_structure, confidence high

(a) Evidence. Mode of the non-zero price per SKU × period (period = calendar year, 2022 split into Jan–Jun and Jul–Dec): 4,894 cells for 598 SKUs (the master lists 601; 3 have no train rows). Within a cell every region shows the identical price: all 206,717 non-error priced rows equal the cell mode to the cent; the minimum mode share of any cell is 0.571 (PMP-017 2022-H1, diluted by the EUR block) so the mode is always safe. No stale prices in January, no regional price lists, no customer discounts.
Annual change of the list price vs events calendar:

| 1 Jan | Announced | Mean over SKUs | SD over SKUs | n SKUs |
|---|---|---|---|---|
| 2020 | 2.0 % | 2.001 % | 0.584 | 463 |
| 2021 | 2.5 % | 2.511 % | 0.594 | 496 |
| 2022 | 5.0 % | 5.019 % | 0.607 | 524 |
| 2023 | 9.0 % | 9.026 % | 0.616 | 529 |
| 2024 | 4.5 % | 4.472 % | 0.590 | 569 |
| 2025 | 3.7 % | 3.710 % | 0.618 | 581 |
| 2026 | 3.7 % | 3.752 % | 0.595 | 588 |

The increase is **not** the same for every SKU: SKU deviation from the announced figure is N(0, 0.60 pp) (n 3,750, mean +0.013, skew 0.01, excess kurtosis −0.10, range −2.31…+1.95, KS-normal p = 0.70), independent across years (|r| ≤ 0.10) and with no family effect (family means within ±0.14 pp of the announced figure).

(d) RULE. Build `canonical_price[sku, period]` from the data by mode (do not derive it from the announced percentages). For the dashboard revenue forecast use `price_2027 = price_2026 × 1.045`, `price_2028 = price_2027 × 1.040` (events EV-059, EV-065), uncertainty ±0.6 pp per SKU. File: `canonical_price.csv`.

### 3. Raw-material surcharge: exactly +6 %, Jul–Dec 2022, global — real_event, confidence high

(a) Evidence. In 2022-07…2022-12 the invoice price is `round(list × 1.06, 2)` for 100 % of priced rows in all 6 regions and 4 channels (14,138 priced rows: 14,091 at 1.06 × list, the other 47 are cents rows at 106 ×, none at the plain list price); 545 of 546 SKUs match to the cent, THM-051 differs by 1 cent (1132.35 vs 1132.34: the generator multiplies an unrounded base). The surcharge follows `Date` (delivery month), starts and stops sharply, and the 2023 list price is computed from the un-surcharged 2022 list price. No demand response to the surcharge is visible (matched-series Jun/May 0.920, Jul/May 0.930 in 2022 vs 0.946/0.938 in 2023 and 0.941/0.967 in 2024).

(d) RULE. Keep two price columns: `list_price` (year) and `invoice_price` (= list × 1.06 in 2022-07…12). Not an error; register as event EV-027. Do not create a demand feature for it.

### 4. Zero-order convention — generator_structure / data_error, confidence high

(a) Evidence. A no-order month is written as units `0`, price `0.0`, revenue `0.0` (35,390 rows). There is **no** row with zero units and a non-zero price, so `price > 0 ⇔ an order exists` (apart from finding 11). Two corrupted variants of a zero row: units `-` (217 rows, always price 0 and revenue 0) and blank units with price 0 (450 rows: 402 with revenue 0.0, 48 with blank revenue). Stockout-file check: Shipped_Units = 0 for 13/13 blank-zero rows and 6/6 dash rows.

(d) RULE. `'-'` → 0. Blank units with price 0 → 0. Fill the price on zero rows from the canonical table (the raw 0.0 is a placeholder, not a price).

### 5. Blank Units with revenue present — data_error, confidence high

(a) Evidence. 2,545 rows (1.04 % of all rows; 1.14–1.43 % of priced rows in every year; all regions) have blank units, price > 0 and revenue present. `revenue / price` is an exact integer for 2,545/2,545, sits at the series level (median log10 ratio to local median 0.000, same spread as clean rows) and equals Shipped_Units for 70/70. Example CEL-0004847 (2019-01 BSS-010 Europe): price 379.44, revenue 30,734.64 → 81 units.

(d) RULE. `units = round(revenue / price_raw)` (use the row's own price). Flag `units_restored_from_revenue`.

### 6. Latin America ERP migration: Aftermarket + Export quantities wiped for 2023-03…05 — data_error caused by a real system event (EV-033), confidence high

(a) Evidence. 380 rows have units **and** revenue blank; all are Latin America, 2023-03 (126), 2023-04 (126), 2023-05 (128), and they are **100 % of the Latin America Aftermarket (246/246) and Export (134/134) rows** of those months and 0 % of Direct OEM (0/586) and Tier-1 Distributor (0/460). 128 series, 125 of them blank in all 3 months. Rows were not deleted (row counts per month are stable 470–479). The price survived: 332 rows have price > 0 (an order existed, quantity lost) and 48 have price 0 (true zero months), so the order/no-order pattern of the cycle is preserved exactly. Only 1 of the 332 is covered by the stockout file.
Imputation backtest (hide the positive months of the 137 Latin America Aftermarket/Export series in Mar–May of 2022/2024/2025, 1,020 rows): mean of positive months within ±12 months WAPE 28.9 % bias −1.1 %; mean ±6 months 29.0 % / −3.4 %; median ±6 months 29.7 % / −7.3 %; same month of adjacent years 38.3 % / +8.0 %. The imputed volume is about 15,985 units = 24 % of Latin America volume in the window.

(d) RULE. 48 rows → units 0 (exact). 332 rows → `units = NaN, known positive`; exclude from the training target (mask), impute for lags/dashboard with the mean of the series' positive months within ±12 months (excluding the window) and mark `imputed`. Anomaly register: one entry "LatAm Aftermarket/Export quantities lost in ERP migration, 2023-03…05".

### 7. Negative units are sign errors, not returns — data_error, confidence high

(a) Evidence. 491 rows have negative units and negative revenue; `revenue = units × price` exactly on all; |units| sits at the series level (median log10 ratio 0.000, 94.5 % within ±0.35 vs 93.6 % for clean rows); uniform over years, months, regions and channels; no matching positive row to reverse. Shipped_Units = |units| for 14/14. Example CEL-0047001 (2019-01 CSS-030 India): −59 / −21,426.44.

(d) RULE. `units = abs(units)`, `revenue = abs(revenue)`. Never net them against other months.

### 8. Units scaled ×10 and ×100; thousands separators — data_error, confidence high

(a) Evidence. 293 rows have `units = 10 × revenue/price` and 75 rows `units = 100 × revenue/price` (exact). Raw units end in 0 for 293/293 and in 00 for 75/75. Recorded units are 10.5× / 100× the series level (median log10 ratio 1.022 / 2.000) while `revenue/price` is on the level (0.022 / 0.000). Shipped_Units = revenue/price for 2/2 and 4/4. No ×12, ×1000 or division cases exist. Examples CEL-0075665 (190 → 19), CEL-0236424 (8200 → 82).
Thousands separator: 44 of the 108 raw values ≥ 1,000 are written `d,ddd`; 41 of them are ×10/×100 errors and 3 are genuine large orders (CEL-0162840 `1,060`, CEL-0187606 `1,213`, CEL-0003787 `2,002`). After correction only 5 rows have ≥ 1,000 units.

(d) RULE. Strip commas (format only). If price class is ok and `units / (revenue/price)` equals 10 or 100 (tolerance 1e-6) → `units = round(revenue / price)`. Never divide by 10 on magnitude alone.

### 9. Revenue ×10 and digit transpositions: revenue is wrong, units are right — data_error, confidence high

(a) Evidence. 425 rows have `revenue = 10 × units × price`; recorded units are on the series level (median log10 ratio 0.019) while revenue/price is 10× above it; Shipped_Units = recorded units for 9/9. Example CEL-0066791: 79 units, 463.57, revenue 366,220.30 (true 36,622.03).
312 rows differ from `units × price` by 9 × d × 10^k: the revenue has two adjacent integer digits swapped (307 same-length swaps + 5 where the swap produced a leading zero, e.g. 20,948.80 → 2,948.80). Median relative error 1.95 %, maximum 379 %. Units are on the series level and equal Shipped_Units for 6/6. Example CEL-0227757: 36,007.60 vs 36,070.60.

(d) RULE. `revenue = round(units × price, 2)`; leave units untouched. A pipeline that sets `units = revenue / price` on every mismatch would corrupt 737 good unit values.

### 10. Price keyed in cents — data_error, confidence high

(a) Evidence. 614 rows have `price = 100 × canonical` (always an integer, e.g. 26173.0 for 261.73), random over time, regions, channels and customers; revenue is `units × price/100` on 614/614 and units equal Shipped_Units for 11/11.

(d) RULE. `price = price / 100`; units and revenue unchanged.

### 11. Price and revenue zeroed on a real order — data_error, confidence high

(a) Evidence. 295 rows have units > 0 but price 0.0 and revenue 0.0. Units are on the series level (median log10 ratio 0.016, 94.9 % within ±0.35) and equal Shipped_Units for 10/10. These are not free samples.

(d) RULE. Keep units; `price = canonical`, `revenue = units × canonical`. Do not turn them into zero-order months.

### 12. India Aftermarket, 2021-07…2021-12: quantities booked in packs of 10 — data_error (unit-of-measure block), confidence high

(a) Evidence. 385 rows = every priced India × Aftermarket row of the six months except 7 that carry another injected error (462 rows in scope: 385 pack, 70 zero rows, 6 blank-units, 1 units ×10). Price is exactly 10 × canonical, units are 1/10 of the series level (median log10 ratio −0.991; ×10 gives +0.009), revenue = units × price is the correct USD amount. 42 rows are in the stockout file and all satisfy `units_raw = max(1, round(Shipped_Units / 10))` (e.g. shipped 17 → 2, 35 → 4, 7 → 1), so the true quantity is rounded away. No other region, channel or period is affected (78 series).

(d) RULE. Detect by `price / canonical = 10` (not by region/date, so the 7 exceptions are handled automatically). `units = units_raw × 10` (on the 42 rows with Shipped_Units: maximum error 5 units, mean absolute error 2.45, mean signed error +0.6), `price = canonical`, revenue unchanged; flag `approximate`. Where the stockout file has the row use `Shipped_Units` (42 rows exact). Anomaly register: one block entry.

### 13. Europe Direct OEM, 2022-01…2022-03: price and revenue in EUR — data_error (currency block), confidence high

(a) Evidence. 498 rows = every priced Europe × Direct OEM row of the three months except 8 with another injected error (588 rows in scope: 498 EUR, 82 zero rows, 6 blank-units, 1 negative, 1 cents). `price = round(canonical × 0.89, 2)` on 498/498, one constant factor for all three months and all customers; revenue = units × EUR price; units are on the series level (median log10 ratio −0.017) and equal Shipped_Units for 48/48. This is the only currency error in the file: there are no INR, JPY, CNY, BRL or GBP factors and no time-varying rate. 196 series; revenue understated by $2.43 M.

(d) RULE. Detect by `price / canonical = 0.89` (tolerance 6e-4). Units unchanged; `price = canonical`; `revenue = round(units × canonical, 2)`.

### 14. Independent validation and duplicate versions — generator_structure, confidence high

(a) Evidence. 5,804 of the 5,830 stockout rows match a train row. Corrected units equal `Shipped_Units` on 5,761/5,761 rows outside the pack block and the one imputation row; this includes every changed value (14 sign, 70 blank, 13 blank-zero, 6 dash, 2 ×10, 4 ×100). The remaining 26 stockout rows have no train row (deleted rows whose units are recoverable from Shipped_Units).
Duplicates: 3,682 Record_IDs have two versions; 2,946 are identical copies with the same timestamp; 736 have a later timestamp (up to 24 days) and 732 of those restate units and revenue (ratio 0.67–1.8), price never changes and both versions reconcile. For the 17 restated IDs present in the stockout file, Shipped_Units equals the **latest** version 17/17 (earliest 0/17), confirming business rule 2.

(d) RULE. Keep the latest Load_Timestamp. Add a pipeline test `units_clean == Shipped_Units` for all stockout-file rows (expected 5,761 passes, pack rows within ±5).

### 15. Genuine one-off orders — real_event, confidence high (classification) / medium (exact generator parameters)

(a) Evidence. 438 rows have corrected units ≥ 4 × the median of the series' 6 nearest positive orders and ≥ 30 units above it (ratio median 5.4, 90th percentile 8.4, max 29; excess 94,897 units = 0.81 % of all units). They reconcile to the cent (431 are plain `ok` rows). They occur almost only in **Direct OEM (226) and Tier-1 Distributor (193)**; rate at series level ≥ 20: Direct OEM 0.258 %, Tier-1 Distributor 0.278 %, Export 0.021 %, Aftermarket 0.013 %. They are spread evenly over years (42–70 a year), months and regions, show no pile-up at 10× (density falls smoothly from 4× to 15×), end in 0 only 8.4 % of the time (base rate 10 %), and the orders before and after are at the usual level with unchanged timing (median ratio 0.99 / 1.00): pure additive spikes with no payback. 36 fall in the last 6 months of history and 68 in the last 12.
Decision criteria, unit error vs one-off:

| Test | Unit error (fix) | Genuine one-off (keep, flag) |
|---|---|---|
| units vs revenue/price | exactly 10× or 100× | equal |
| last digits of units | always 0 / 00 | 0 in about 9 % of cases |
| size vs series level | 10× / 100× | continuous 4–15× |
| revenue/price vs level | on level | far above level |
| channel | any | Direct OEM, Tier-1 Distributor |

Top 15 by excess units (file `oneoff_orders.csv` has all 438):

| Record_ID | Month | SKU | Region | Customer / channel | Units | Neighbour median | Ratio | Revenue $ |
|---|---|---|---|---|---|---|---|---|
| CEL-0003787 | 2026-07 | BSS-008 | North America | Solaris Automotive / T1 | 2,002 | 344 | 5.8 | 497,017 |
| CEL-0231724 | 2021-03 | THM-044 | Latin America | Orion Driveline / T1 | 1,498 | 190 | 7.9 | 667,374 |
| CEL-0162840 | 2019-06 | PMP-053 | Europe | Vantara Auto / OEM | 1,060 | 255 | 4.2 | 889,033 |
| CEL-0094127 | 2022-09 | ELA-062 | North America | Solaris Automotive / T1 | 912 | 118.5 | 7.7 | 895,475 |
| CEL-0196090 | 2020-03 | PTC-044 | Latin America | Orion Driveline / T1 | 824 | 52.5 | 15.7 | 718,940 |
| CEL-0053749 | 2021-04 | CSS-047 | Latin America | Solaris Automotive / OEM | 957 | 208.5 | 4.6 | 525,747 |
| CEL-0168480 | 2020-12 | PMP-066 | India | Vantara Auto / OEM | 783 | 71.5 | 11.0 | 428,927 |
| CEL-0001688 | 2019-10 | BSS-004 | Europe | Crestline Manufacturing / OEM | 863 | 159 | 5.4 | 313,226 |
| CEL-0205092 | 2019-11 | PTC-065 | Europe | Quantum Drive Systems / OEM | 790 | 122 | 6.5 | 486,435 |
| CEL-0152733 | 2026-10 | PMP-028 | North America | Vantara Auto / OEM | 784 | 139.5 | 5.6 | 1,193,993 |
| CEL-0073606 | 2023-06 | ELA-008 | North America | Apex Tier One / T1 | 752 | 110.5 | 6.8 | 406,855 |
| CEL-0073713 | 2024-07 | ELA-008 | Europe | Orion Driveline / OEM | 798 | 168 | 4.75 | 449,992 |
| CEL-0225852 | 2026-09 | THM-032 | Europe | Crestline Manufacturing / OEM | 752 | 141.5 | 5.3 | 626,762 |
| CEL-0229086 | 2021-05 | THM-039 | India | Quantum Drive Systems / OEM | 691 | 83.5 | 8.3 | 200,266 |
| CEL-0231440 | 2021-01 | THM-043 | India | Helios Auto Parts / T1 | 744 | 137.5 | 5.4 | 799,569 |

(d) RULE. Keep the units as real demand in the cleaned history and the dashboard; add `is_oneoff` to the anomaly register (type "one-off order", action "kept, excluded from baseline"). For model training replace the value by the neighbour median (or mask it) so that levels, lags and rolling statistics are not contaminated — especially the 36 one-offs in 2026-05…10 (e.g. CEL-0152733 in the very last month). Forecast the baseline; one-offs are unpredictable and add about 1 % to Direct OEM / Tier-1 volume, which matters only for the mean (P90 / bias), not for a WAPE-optimal point forecast.

### 16. Record_ID encodes series and month (cross-lens) — generator_structure, confidence high

(a) Evidence. `int(Record_ID[4:]) − ((year − 2019) × 12 + month − 1)` is constant within each of the 3,083 SKU × Region series and unique across series (3,053 series have a single value; the other 30 each have one row that is off by exactly 432 months = the 30 rows dated year 2062 instead of 2026). The rough-clean hypothesis of a fixed stride of 94 is wrong (1.4 % agreement): the stride is each series' own length. Consequences: Region recovered for all 737 blank-region rows; the 30 dates in 2062 are corrected to 2026; (series, month) is unique for all 244,566 rows; 956 skipped numbers inside series = deleted rows (809 series, 86–151 per year, no concentration in any month or region). Sales channel is constant per series (0 of 3,083 series have two).

(d) RULE. Derive `series_offset` per (SKU, Region) by mode, then `month_index = record_number − series_offset` as the authoritative month for rows with a bad date and `series = offset` for rows with a blank key. File: `series_offsets.csv`.

### 17. Early buying before the 9 % price rise — only Tier-1 Distributor and Aftermarket — real_event, confidence medium-high

(a) Evidence (matched series, corrected units, ratios to the preceding November):

| Channel | Dec 2022 / Nov | Reference years* | Jan 2023 / Nov | Reference | Feb 2023 / Nov | Reference |
|---|---|---|---|---|---|---|
| Aftermarket | 1.279 | 0.915 (+39.8 %) | 0.745 | 0.917 (−18.8 %) | 0.824 | 0.870 (−5.3 %) |
| Tier-1 Distributor | 1.255 | 0.937 (+34.0 %) | 0.668 | 0.864 (−22.7 %) | 0.790 | 0.908 (−12.9 %) |
| Direct OEM | 0.849 | 0.887 (−4.2 %) | 0.929 | 1.038 (−10.5 %) | 0.896 | 0.905 (−0.9 %) |
| Export | 0.812 | 0.797 (+1.8 %) | 0.945 | 0.906 (+4.3 %) | 0.925 | 0.862 (+7.2 %) |

*mean of the 1 January 2020, 2022, 2024, 2025, 2026 transitions. Over Dec + Jan + Feb the Tier-1 total is unchanged (2.713 vs 2.708 November-volumes): demand was pulled forward, not created. No other year shows a December uplift, including the 5.0 % rise of 2022 (Dec/Nov 0.875 overall); only the 2023 rise was pre-announced (EV-030, 15 Nov 2022).

(d) RULE. Anomaly register: "pre-buy" on 2022-12 and "payback" on 2023-01/02 for Tier-1 Distributor and Aftermarket series. Give the model an event dummy (or neutralise those three months) so December seasonality is not inflated. Do not add a pre-buy for January 2027 (+4.5 %) or January 2028 (+4.0 %): rises of 2–5 % without an announcement event never produced one. File: `prebuy_by_channel.csv`.

## Recoverability summary

| Category | Rows | Treatment |
|---|---|---|
| Units correct as recorded (incl. 2,144 rows where only price/revenue were wrong) | 239,778 | none |
| Units restored exactly | 4,071 | blank→revenue/price 2,545; blank/dash→0 667; sign 491; ×10 293; ×100 75 |
| Units restored approximately (±5) | 385 | pack-of-10 block (42 exact via Shipped_Units) |
| Units to impute (known positive) | 332 | LatAm ERP migration |
| Price corrected | 1,792 | cents 614, EUR 498, pack 385, zeroed 295 |
| Revenue corrected | 2,021 | ×10 425, transposition 312, EUR 498, zeroed 295, sign 491 |

## Cleaning order for the pipeline

1. Parse: strip `,`; `'-'` → 0; `''` → NaN. De-duplicate on Record_ID (latest Load_Timestamp).
2. Series and month from Record_ID offset (finding 16); canonical price by mode per SKU × period (finding 2).
3. `q = price / canonical`: 0 → zero-price; 1 → ok; 100 → cents; 10 → pack; 0.89 → EUR; anything else → fail the build.
4. Apply rules of findings 4–13 in that order of precedence (blank / dash / sign first, then price class, then `k` for ok-priced rows).
5. Assert: units non-negative integers; `revenue == units × price` within 0.005; state counts equal the table in finding 1; `units == Shipped_Units` for stockout rows.
6. Flag one-offs (finding 15) after correction, never before.

## Artefacts (all in `research/scratch/numeric-reconcile/`; working files, not included in the repository)

- `14_build_diagnosis.py` — standalone final build (needs only `data/interim/train_rough.parquet` and the raw stockout file).
- `row_diagnosis.parquet` — all 244,566 Record_IDs: series/month, raw values, canonical list and invoice price, `issue`, `wrong_field`, `units_fix`, `price_fix`, `revenue_fix`, `units_status`, local levels, `oneoff_candidate`.
- `row_diagnosis_issues.csv` — the 6,935 flagged rows only.
- `issue_summary.csv` — counts, date range, series count and example IDs per issue.
- `canonical_price.csv` — 4,894 SKU × period cells (`p_list`, `p_inv`, mode share); `price_increase_by_sku.csv` — annual % change per SKU.
- `oneoff_orders.csv` — 438 one-off orders ranked by excess units.
- `series_offsets.csv` — Record_ID offset per series; `prebuy_by_channel.csv` — Dec/Jan/Feb ratios per channel and year.
- `01_…13_*.py`, `15_…19_*.py` — exploratory and verification scripts (10–13 need the intermediate files regenerated by running 05, 09, 10, 12 in order; these were deleted to save disk).

## Open questions (ranked by likely impact on forecast accuracy)

1. **One-offs near the forecast origin.** 36 one-offs sit in 2026-05…10. Confirm in the backtest that masking them (neighbour median) beats keeping them for lag/level features; expected gain is concentrated in about 400 Direct OEM / Tier-1 series.
2. **Does the scorer's hidden truth contain one-offs in the test window?** Rate is about 0.27 % of Direct OEM / Tier-1 order months at about 6× level (about 1 % of volume). A WAPE-optimal point forecast should ignore them; if the metric rewards low bias, scale Direct OEM / Tier-1 forecasts by about +1 %.
3. **Pre-buy rule.** Evidence says only the pre-announced 9 % rise triggered early buying. If the generator uses a size threshold instead of the announcement, 4.5 % (2027) is still below the 5.0 % rise that showed nothing; so no adjustment is the best estimate.
4. **Imputation of the 332 LatAm rows.** Affects 128 series in 2023 only; best simple imputer has WAPE 29 %. Masking in training is safer than imputing.
5. **Pack rows equal to 1** (39 rows) may hide true quantities of 1–14; on the 17 such rows with Shipped_Units the true value ranges 7–14 with mean 10.9, so using 10 is adequate. Negligible.
6. **The 956 deleted rows and 26 stockout rows without a train row** belong to the missing-rows lens; Shipped_Units restores the 26 exactly.
