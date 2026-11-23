# Celeris demand forecasting: DATA DOSSIER

Authoritative merge of the 10 forensic investigations, their 10 skeptic reviews and the 3 methods reports in
`/home/pavan/Desktop/mks/research/`. Written 2026-11-23 for the engineering team, who should be able to build from it without
re-investigating. Where a skeptic refuted or corrected a finding, the corrected version is used and the correction is
named. Where reports disagreed, I either ran my own check (scripts in `research/scratch/dossier/`) or list the conflict in
section 9. Nothing here comes from outside those reports and those checks.

Notation: `midx` = months since 2019-01 (2019-01 = 0, 2026-10 = 93). "IDs" = unique Record_IDs after de-duplication
(244,566). "Raw rows" = rows of `train.csv` (248,248). Cycle kinds: **M** monthly, **A** monthly with one annual shutdown
month, **B** every second month (phases B0/B1), **Q** quarterly (Q0/Q1/Q2), **T** two on, one off (T0/T1/T2).
Status tags in section 4: **VERIFIED** (investigator and skeptic reproduce it independently), **PLAUSIBLE** (supported, but the
size or form is uncertain or rests on one source), **UNKNOWN** (no data can decide it).

Lens abbreviations used for attribution: LK labels-keys, DD dates-dups, NR numeric-reconcile, PZ panel-missing-zeros,
SU stockouts-unconstrained, LM lifecycle-master, MI macro-indicators, EC events-calendar, DG demand-dgp, TS test-structure;
`.v` = that lens's skeptic review; MF methods-forecasting, MC methods-cleaning-anomaly, DB dashboard-control-tower.

---

## 1. Executive summary: the 15 most consequential facts

1. **Record_ID is the generator's row counter, and it decodes every key exactly.** It enumerates a complete grid of
   3,083 SKU x Region series x months = **245,548 cells**, in SKU order, then a per-SKU region order, then month. It
   reproduces SKU on 248,248 / 248,248 raw rows, Region on 247,503 / 247,503 non-blank rows and the month on 248,218 / 248,248
   rows. The 30 exceptions are `2062-MM` typos, where Record_ID is right. The 982 unused numbers are exactly the **982 deleted
   rows** (0.400 % of the grid, missing completely at random). After keeping the latest load, the 244,566 records hold
   **0 key collisions**. (LK, DD, PZ, LM; all four skeptics confirm.)
2. **Every injected data error leaves an exact arithmetic signature.**
   - Train numerics fall into 15 mutually exclusive states. 6,932 IDs (2.83 %) carry an error, and no row carries two.
   - Of the 4,788 IDs with wrong or missing units: 4,071 are restored exactly, 385 to within +-5 units (India pack-of-10)
     and 332 are unknown but positive (LatAm ERP migration).
   - The fixes are validated against `inventory_stockouts.Shipped_Units` on **5,761 / 5,761** comparable rows.
   - Naive numeric coercion overstates units by 2.6 % (12,030,253 against 11,723,379) and revenue by USD 108.6 M
     (8,684.43 M against 8,575.85 M). (NR; NR.v reproduces every count.)
3. **Zeros are scheduled, not random.**
   - **98.69 % of the 36,057 zero months** (35,585) are off-months of a calendar-anchored ordering cycle drawn from 16
     patterns. Current cycles: M 1,539, A 775, B 297, Q 242, T 230.
   - P(order | on-phase) = 99.87 % and P(zero | off-phase) = 99.37 %. The generator's own truth table agrees: 855 of 858
     stock-out rows on off-phase months have `Requested_Units = 0`.
   - **8,842 of the 58,219 test rows (15.19 %) are structural zeros**: 8,382 off-phase, 304 lost-account and 156 post-EOL.
   (PZ, TS; PZ.v and TS.v reproduce all 8,842.)
4. **An order carries all latent demand since the previous order.**
   - A B order is 1.94 months of the series' monthly level, a Q order 2.93 months. The month after an annual shutdown carries
     **0.5 x** the shutdown month's latent demand (c = 0.4906 to 0.51 across lenses).
   - Noise is drawn once per order: negative binomial, dispersion set by region only.
   - So forecast latent monthly demand and then place it on the cycle. That alone cuts 19-month backtest WAPE from 0.506
     (flat) to 0.290 (cycle-aware). (PZ, DG, DG.v.)
5. **The latent generator is multiplicative.**
   - latent = series level x family macro path x region x calendar month x channel x calendar month (plus a Thermal summer
     bump) x EV-index powertrain factor x lifecycle ramp x event multipliers.
   - There is **no trend term**. SKU and series seasonality do not exist.
   - One-off orders: Direct OEM and Tier-1 Distributor only, about 1 in 300 order months, x3 to x10, no payback.
   - The cell-level noise floor is a WAPE of about 0.22 to 0.24. (DG, DG.v.)
6. **Macro effects are SKU-level and lagged.**
   - Each SKU responds mainly to one indicator from a family-specific set of three, at an integer lag of mostly 1 to 4
     months, with about 0.17 to 0.19 log points per standard deviation. The sign is the economic one in 306 / 306
     (MI) and 309 / 311 (MI.v) confident SKUs.
   - The response is log-linear with soft upward saturation. Aftermarket is damped (0.37 to 0.42) and adds a Fuel effect
     at lag 1.
   - The supplied 2026-11..2028-05 paths are smooth. They imply a **fading hump**: total x1.04 to x1.08 in 2026-11, about x1.00
     by 2028-05, window mean x1.011 to x1.036. PMP and HYD rise most; ELA and BSS are flat.
   - The macro path is worth 0.8 to 2.3 cell-WAPE points and two thirds of the family x month error. (MI, MI.v, DG.)
7. **The EV shift is a zero-lag, log-linear, class-level term.**
   - EV SKUs +3.6 to +3.8 % per EV-index point, ICE SKUs -1.16 to -1.19 %, Universal 0. Per-SKU betas are noise (split-half
     r 0.06 / 0.12; LM.v).
   - In the window the index goes 93.8 (2026-11), 94.6 (2027-01/02), 90.7 (2027-12), 91.9 (2028-05). Checked on the raw
     file; DG.v's month labels for this path were wrong.
   - EV SKUs run about x1.14 to x1.18 above their last-12-month level early in the window, then fade. (LM, MI, DG.)
8. **Train records shipments, and the forecast must be unconstrained demand.**
   - `inventory_stockouts.csv` follows exact rules: `Shipped = floor(fill x (Requested + Carried_In))`,
     `Backordered = floor(0.4 x shortfall)` (0 for semiconductor rows), and the next month ships its own demand + Backordered.
   - The semiconductor shortage constrains **every** ELA cell from 2021-03 to 2022-09, but only 69.1 % of those cells are
     listed. The 1,925 unlisted cells are imputed at 5.3 % WAPE.
   - Unconstrained demand is +0.91 % over shipments overall, but **+44.8 % for ELA in 2021** and +29.2 % in 2022.
   - Lost sales come to about 112k units / USD 114M. (SU, SU.v.)
9. **Account events are few, exact and confined to windows inside train.**
   - **16 lost accounts**: Active SKUs whose series fell to explicit zeros 10 to 19 months before the origin. They have
     304 test rows; forecast 0.
   - **23 customer switches** (2022-07..2025-05): permanent level steps of x0.5 to x2.2, about half individually
     significant. Test carries the post-switch customer, and there is no switch inside the window.
   - **27 cycle changes** (2022-01..2023-11): volume-conserving.
   - None of these appears in the events calendar. (LK, PZ, TS, all verified.)
10. **Lifecycle needs explicit handling.**
    - **156 test rows lie after an announced EOL** (PTC-005 72, PMP-003 54, THM-001 30) and must be 0. The EOL month itself
      is positive.
    - Demand declines over the last ~6 months before EOL.
    - **10 cold-start series (117 rows)** belong to 3 planned launches (PTC-029 EV, PMP-020 EV, THM-012 Universal). Successors
      do not inherit regions, customers, channels or cycles.
    - Launch ramp: `1 - exp(-(k+1)/tau)` with tau about 4.5 to 4.75, valid only once the EV trend is controlled.
    - 18 just-launched series need ramp-aware levels. A mean of history under-forecasts them by more than half.
11. **Events inside the forecast window move several months by double digits.**
    - Helios Auto Parts | India: permanent step **x1.24** from 2025-09 (65 series, 1,235 rows).
    - Orion Driveline | North America: retooling shutdown 2027-07..08 (62 series, 124 rows). The only analogue is the
      Nexon strike at **x0.145 with no catch-up**.
    - Ramadan moves into February: 21 days in 2027-02, 9 in 2027-03, 4 in 2028-01, 26 in 2028-02.
    - Lunar New Year (LNY) splits in 2028: 6 days in January, 4 in February.
    - A fixed seasonal index is therefore off by x0.76 to x1.25 in MEA and x0.87 to x1.16 in APAC.
    - The price rises (+4.5 % in 2027, +4.0 % in 2028) were not announced in advance, so expect only the ordinary channel
      year-end pattern and no pre-buy. (EC, EC.v, DG.)
12. **Seasonality is region x calendar month plus channel x calendar month.**
    - Region x month: Europe Aug x0.63 to 0.65, North America Jul x0.83 to 0.86, and stable dips that are not in the
      calendar (APAC Oct, LatAm Jan, India Jun / Oct and others).
    - Channel x month: Tier-1 + Aftermarket Dec x1.065 / Jan x0.955; Direct OEM + Export Dec x0.945 / Jan x1.05.
    - The profile is identical for every SKU of a family and fixed across years. Thermal adds a summer bump.
    - LNY and Ramadan follow day counts, not calendar months. (DG, EC, EC.v.)
13. **Submit the conditional mean, coherent bottom-up.**
    - The median is about 3 to 3.5 % lower. It gains only 0.1 to 0.26 points of row WAPE and costs about 3 % bias plus 0.4 to
      0.9 points on aggregates.
    - Bottom-up sums of means are coherent by construction.
    - P10/P90 come from negative-binomial (NB) sample paths summed up the hierarchy, never from summed quantiles.
      (TS, TS.v, MF.)
14. **Prices are exact and contain no hidden demand signal.**
    - One list price per SKU and year, identical in every region. January rises are the announced percentage plus a per-SKU
      N(0, 0.60 pp) deviation.
    - The +6 % surcharge in 2022-07..12 is real (EV-027), not an error.
    - Only the **pre-announced 9 % rise** (EV-030) triggered stocking-channel pre-buying: Dec 2022 x1.41, Jan 2023 x0.69,
      Feb 2023 x0.84 relative to the ordinary year-end, about volume-neutral. (NR, EC, DG.)
15. **Benchmarks are measured; most remaining error is noise.**
    - At origin 2025-03 with a 19-month horizon: flat 12-month mean 0.503 to 0.506; seasonal naive 0.365 to 0.370;
      cycle-aware with a 24-month level 0.261 to 0.265; the same with the true macro path 0.249; in-sample floor 0.240.
    - Baseline bias flips sign between origins: +5.7 % at 2025-03, -6.3 % at 2024-03.
    - A candidate model must beat about 0.26 and be judged by its distance to about 0.25, on several origins. (DG, PZ, TS
      and their skeptics.)

---

## 2. Data-error taxonomy

Every error below is a **data error** to be fixed. Real events are in section 3. Confidence is the combined
investigator-plus-skeptic judgement.

### 2.0 The Record_ID structure and how it is used

- **Format.** `CEL-NNNNNNN`. All 248,248 raw rows follow it. The number runs from 1 to 245,548, and 244,566 distinct values
  are present.
- **Order.** Rows are numbered by SKU ascending, then the SKU's own region order, then month ascending. The region order is a
  random permutation per SKU; there are 433 distinct orders. The same order is used in `test.csv` for 592 / 592 shared SKUs.
  Exactly 100 "core" SKUs (BSS-001..011, CSS-001..009, ELA-001..013, HYD-001..019, PMP-001..016, PTC-001..024, THM-001..008)
  list all six regions in the order NA > EU > APAC > India > LatAm > MEA.
- **Block per series.** The block runs from `start = max(2019-01, Launch_Date, 2022-01 if MEA)` to
  `end = min(2026-10, EOL_Date)`, both inclusive, with no slack. Block lengths: 94 months for 1,976 series, 58 for 466,
  minimum 3 (PMP-019).
- **Decode.** `series_key = rec_num - midx` is constant within each of the 3,083 series and unique across them.
  `midx = rec_num - series_key`.
- **Use the block table, not the closed formula.** The formula reproduces the blocks only if BSS-018's launch is set to
  2025-02. With the master date (2025-06), every later block shifts by 16 (LK.v, PZ.v). Ship
  `research/scratch/labels-keys/record_id_blocks.csv` (3,083 rows).
- **What it is used for:**
  - the authoritative SKU, Region and month of every row;
  - filling 737 blank regions;
  - repairing the 30 `2062` dates;
  - locating the 982 missing cells exactly (956 inside a series, 10 first cells, 16 last cells);
  - fixing each series' exact sales window;
  - building the 245,548-cell panel.
- **Independent witnesses**, all of which agree on 248,248 / 248,248 rows after the `2062` fix:
  - `month(Load_Timestamp) - 1` (the truly independent one);
  - the Date text;
  - the Record_ID position.
- **Treat it as corroboration in the write-up.** The labels can also be recovered without Record_ID. For blank regions,
  methods B and C (section 2.1) together resolve 737 / 737 with 0 errors.

### 2.1 `train.csv`: keys, dates, labels, duplicates, missing rows

| # | Error type | Rows / cells affected | Exact detection rule | Exact fix rule | Confidence | Recoverable |
|---|---|---|---|---|---|---|
| K1 | Exact duplicate load | 2,946 IDs appear twice with all 15 columns identical (adjacent rows) | Same Record_ID and same Load_Timestamp | Keep one | high | exact |
| K2 | Superseded re-load (restatement) | 736 IDs. The second load comes 5..24 days later, same month and time of day. Units and Revenue differ on 732. First/latest ratio lies in [0.603, 0.849] or [1.162, 1.4875] (for latest units >= 80) | Same Record_ID, later Load_Timestamp (load day >= 4) | Keep the latest Load_Timestamp. Tie-break on the last raw row (ties are identical rows). Never sum versions: that adds 42,862 phantom units | high. The latest equals Shipped_Units on 17 / 17 stock-out rows, the earlier one on 0 / 17 | exact |
| K3 | Date format variants | 9,967 raw rows (9,821 IDs), 7 formats: `YYYY/MM` 1,703; `Mon YYYY` 1,689; `YYYY-MM-DD` 1,672 (day is always 01); `Mon-YYYY` 1,659; `MM/YYYY` 1,623; `MM-YYYY` 1,621 | 7 anchored regexes; the 4-digit group is always the year | Normalise to `YYYY-MM`; raise on anything else | high | exact |
| K4 | Year typo `2062` | 30 rows, months 2026-01..10 | Parsed year outside 2019..2026 | Swap the last two digits (2062 -> 2026). Year column, Load_Timestamp and Record_ID all confirm it | high | exact |
| K5 | Month column = load month | 246 rows: 230 are true month + 1, 16 are December written as 1 with Year unchanged | `Month != month(Date)` | Drop raw Year/Month and recompute from Date (business rule 1) | high | exact |
| K6 | Region label variants | 30 non-blank variants map to 6 regions. Raw rows: case 2,244, abbreviation 1,948 (`NA`, `EU`, `APAC`, `LATAM`, `MEA`, `ME&A`, ...), trailing whitespace 1,315, punctuation 504, wording 188 (`Middle East and Africa`). That is 6,117 IDs (2.49 %) | Lookup in `map_region.csv`; unknown variants raise | Map to canonical. **Pitfall:** default `read_csv` turns `NA` into NaN (952 "missing" regions instead of 745) | high | exact |
| K7 | Blank Region | 745 raw rows / 737 IDs. True region per ID: Europe 137, India 133, LatAm 133, APAC 131, NA 113, MEA 90 (LK.v correction of the per-raw-row figures) | Empty string | Decode from the Record_ID block. Assert agreement with methods B and C: (SKU, customer, channel) occurs in a single region, and the only region of that SKU with no row that month. Together they resolve 737 / 737 with 0 errors | high | exact |
| K8 | Sales_Channel variants | 17 variants map to 4. 3,745 raw rows / 3,683 IDs (case 1,800, punctuation 1,011, `T1 Distributor` 403, `OEM Direct` 370, whitespace 161) | `map_sales_channel.csv` | Map. Assert one channel per series (3,083 / 3,083) | high | exact |
| K9 | SKU_ID variants | 2,659 variants map to 598. 3,741 raw rows / 3,683 IDs: lowercase 768, missing dash 767, leading space 749, dropped zero 738, underscore 719 | strip, upper, `_` -> `-`, insert dash, zero-pad to 3 | Map. Assert the SKU is in sku_master and equals the decoded SKU | high | exact |
| K10 | Customer_Name variants | 220 variants map to 12. 2,490 raw rows / 2,455 IDs: ` Inc.` 631, double space 629, UPPER 609, one letter deleted 566 (155 variants), one space deleted 55 | strip, collapse spaces, drop ` Inc.`, case-fold, else the unique single-deletion match | Map. Unmapped values raise. 0 ambiguous | high | exact |
| K11 | Product_Family blank | 1,252 raw rows / 1,228 IDs | Empty | Look up from the SKU prefix (`ref_prefix_family_bu.csv`). BU is then a function of family | high | exact |
| K12 | SKU_Description blank | 996 raw rows / 982 IDs | Empty | Take from sku_master (one description per SKU, identical to the master for 598 / 598) | high | exact |
| K13 | Missing rows (deleted) | 982 cells = 0.400 % of the grid. 956 inside a series, 10 first months, **16 last months (2026-10)**. MCAR: year, month, region, family, channel, customer, level and cycle type all p = 0.20..0.96; on-phase 0.41 % vs off-phase 0.33 % (p = 0.04, immaterial) | Gaps in the Record_ID sequence (`missing_rows_from_record_id_gaps.csv`) | **Never 0** (business rule 3). 26 cells are listed in `inventory_stockouts`: Units = Shipped_Units, demand = Requested_Units. 119 off-phase or lost-run cells: 0, flagged `imputed_zero_off_phase`. 837 on-phase cells: NaN, masked in training. For display and lags use local level x regional calendar index (WAPE 0.257 to 0.259, bias -1.9 to -3.2 %). For B/Q/T series a missing order hides 2 or 3 months of demand | high | 26 exact, 119 exact zero, 837 imputed |

Notes on duplicates and labels:

- Versions of a repeated ID always share labels and price. Labels were corrupted before rows were duplicated.
- Restated rows never carry a blank, dash, negative or comma units string.
- The last month (2026-10) is final, not provisional: restatements for 2026-10 appear at the normal rate (13 observed, 9.4
  expected; DD.v).
- Error injection is independent across columns and over time, with no batch effects. Flag lag-1 autocorrelation is within
  +-0.003. The only clustered errors are the three blocks in 2.2 (N9, N10, N11).

### 2.2 `train.csv`: numeric states (Units x Price = Revenue)

Revenue = Units x Price holds **to the cent** on every clean priced row (max |diff| 1.2e-10). The smallest real discrepancy
anywhere is USD 9.00, so no tolerance is needed.

The canonical price table (`canonical_price.csv`) has 4,894 cells for 598 SKUs. It is the mode of the non-zero price per SKU
and period, where the period is the calendar year, with 2022 split into H1 and H2. On that table every priced row has
`q = price / canonical` in {1, 100, 10, 0.89} exactly (NR, NR.v).

Counts are IDs; raw rows are in brackets.

| # | State | IDs [raw] | Detection (exact) | Wrong field | Fix | Oracle check | Recoverable |
|---|---|---|---|---|---|---|---|
| N0 | ok, priced | 202,244 [205,431] | q = 1, revenue = units x price | none | none | | |
| N0z | ok, zero row | 35,390 [35,805] | units 0, price 0.0, revenue 0.0. `price > 0` <=> an order exists | none | Keep 0. The raw 0.0 price is a placeholder: fill the canonical price for display only | | |
| N1 | units blank, revenue present | 2,545 [2,572] | units blank, price > 0, revenue > 0; revenue / price is an integer (2,545 / 2,545) | units | `units = round(revenue / price)` | Shipped 70 / 70 | exact |
| N2 | units blank, price 0 (zero row) | 450 [455]: 402 with revenue 0.0 + 48 with blank revenue (the 48 are ERP rows) | units blank and price == 0 | units | units = 0 | Shipped 13 / 13 | exact |
| N3 | units `-` placeholder | 217 [218] | units == `-` (always price 0, revenue 0) | units | units = 0 | Shipped 6 / 6 | exact |
| N4 | sign error | 491 [497] | units < 0 and revenue < 0, revenue = units x price | units, revenue | `abs()` both; never net against other months | Shipped 14 / 14 | exact |
| N5 | units x10 | 293 [295] | q = 1 and units = 10 x revenue / price exactly (raw always ends in 0) | units | `units = round(revenue / price)` | 2 / 2 | exact |
| N6 | units x100 | 75 [76] | q = 1 and units = 100 x revenue / price (raw ends in 00) | units | `units = round(revenue / price)` | 4 / 4 | exact |
| N6b | thousands separator | 44 raw values `d,ddd` (25 x100, 16 x10, 3 genuine large orders) | comma in units text | format | Strip the comma before classifying; never divide on magnitude alone | | exact |
| N7 | revenue x10 | 425 [437] | q = 1, revenue = 10 x units x price; units sit at the series level | revenue | `revenue = round(units x price, 2)`. **Do not recompute units from revenue** | units = Shipped 9 / 9 | exact |
| N8 | revenue digit transposition | 312 [316] | revenue - units x price = 9 x d x 10^k (adjacent digits swapped; 5 cases drop a leading zero) | revenue | `revenue = round(units x price, 2)` | 6 / 6 | exact |
| N9 | price in cents | 614 [620] | q = 100 | price | price /= 100; units and revenue unchanged | 11 / 11 | exact |
| N10 | **EUR currency block** | 498 [502]: every priced Europe x Direct OEM row of 2022-01..03 except 8 rows that carry another error | q = 0.89 (`price == round(canonical x 0.89, 2)`) | price, revenue | price = canonical; revenue = units x canonical (revenue was understated by USD 2.43 M) | 48 / 48 | exact |
| N11 | **India pack-of-10 block** | 385 [390]: all India x **Aftermarket** 2021-07..12 rows with q = 10. The cell has 462 rows = 385 pack + 70 zero + 6 blank-units at true scale + 1 units x10 (PTC-057 2021-07: 280 -> 28) | **row-level** q = 10, **never** a region x channel x month rule | units, price | units = Shipped_Units where listed (42 rows); otherwise `10 x units_raw` (+-5 units; on the 42 known rows mean signed error +0.6, MAE 2.45, max 5); price = canonical; **revenue unchanged** (= 10 x units_raw x canonical) | `units_raw = round(Shipped/10)` on 42 / 42 | approx. +-5 |
| N12 | **LatAm ERP migration blanking (EV-033)** | 380 IDs = 100 % of LatAm Aftermarket (246) and Export (134) rows of 2023-03 / 04 / 05 (126 / 126 / 128 per month). 0 % of Direct OEM and Tier-1. 128 series, 125 of them blank in all 3 months | units **and** revenue blank (no such row exists anywhere else) | units, revenue | price 0 -> units 0 (48, exact). THM-033 LatAm 2023-04 -> 65 (Shipped). The other **331 are positive orders of unknown size**: NaN, mask the training target, impute for display. CSS-062 LatAm 2023-03 is off-phase (a T series): treat it as a back-order spill attached to 2023-02, not as a full order | | 48 exact + 1 exact + 331 unknown |
| N13 | price and revenue zeroed on a real order | 295 [299] | units > 0, price 0, revenue 0; all on-phase | price, revenue | Keep units; price = canonical; revenue = units x canonical | 10 / 10 | exact |

Rules that apply to the whole numeric layer:

- **Totals.** 6,932 error IDs + 3 IDs whose only issue is a comma = 6,935 flagged. Errors never co-occur: under
  independence 0.7 to 8.5 co-occurrences would be expected per pair, and 0 are observed. That is why "blank units with
  price 0" is a true zero.
- **Precedence** (NR). Parse (strip commas, `-` -> 0, `''` -> NaN), then dedup, then the canonical price, then
  `q = price / canonical`:
  - q = 0 -> zero-price;
  - q = 1 -> ok;
  - q = 100 -> cents;
  - q = 10 -> pack;
  - q = 0.89 -> EUR;
  - anything else -> **fail the build**.

  Then apply blank / dash / sign rules first, then the price class, then `k = units / (revenue / price)` for q = 1 rows.
- **Assertions.**
  - The state counts equal the table above.
  - Units are non-negative integers.
  - `revenue == units x invoice_price` to the cent on every non-imputed row.
  - Units == Shipped_Units on 5,761 listed rows; pack rows within +-5.
- **Not errors** (do not touch):
  - **438 to 541 genuine one-off orders.** They reconcile to the cent, are 4 to 29x the level and occur in OEM / Tier-1
     only (section 3).
  - The **+6 % surcharge** in 2022-07..12. Invoice price = `round(list x 1.06, 2)` on 545 / 546 SKUs; THM-051 is 1 cent off.
  - The **213 surcharge-period rows of 16 SKUs launched in 2022-H2**, which have no H1 reference price (EC.v correction).
     Only 46 surcharge-period rows are cents errors.
- **Price for revenue forecasts.**
  - `price_2027 = price_2026 x 1.045`, `price_2028 = price_2027 x 1.040` (EV-059, EV-065), +-0.6 pp per SKU.
  - The 3 planned launches have no price (117 test rows). Use the predecessor's 2026 price x the in-sample
    successor/predecessor ratio (median about 1.18 over 6 pairs, range 0.99 to 1.84). Flag it as an assumption (NR.v).

### 2.3 `test.csv`

| Item | Finding | Rule |
|---|---|---|
| Format | 58,219 x 10. No blank, whitespace or label variant. `YYYY-MM`, 19 months. Year/Month consistent; Month not zero-padded. 0 duplicate keys | Use the test keys as the label vocabulary and the output contract. Never add or drop a row. Keep test order |
| Series | 3,068 = 3,058 continuing (19 rows each) + 10 cold starts (PTC-029 x3 with 15 rows, PMP-020 x4 with 12, THM-012 x3 with 8) | Cold-start rows start exactly at Launch_Date; 0 rows before a launch |
| Reference conflict | PMP-004 BU is `Advanced Manufacturing` in test and train, `Power & Drive Systems` in the master | Master corrected (2.5) |
| Post-EOL rows | **156 rows after EOL_Date** (PTC-005 72 from 2027-06; PMP-003 54 from 2027-09; THM-001 30 from 2028-01). Train never has a post-EOL row | Forecast 0 with P10 = P50 = P90 = 0. The **EOL month itself is not zero** (18 test rows; positive in 24 of 25 historical discontinued series) |
| Customer / channel | Constant within every test series. Equal to the **last** train customer for 3,058 / 3,058 series (equal to the first for only 3,035) | Static known features; no switch in the window |
| Lost accounts | All 16 are present with 19 rows (304 rows) | Row presence says nothing about whether a series is alive |
| Missing origin month | 16 continuing series have no 2026-10 train row: BSS-052 LatAm, BSS-070 EU, CSS-016 NA, CSS-043 EU, CSS-080 LatAm, ELA-011 LatAm, ELA-074 APAC, HYD-050 India, HYD-054 NA, HYD-081 MEA, HYD-082 India, PMP-032 India, PMP-061 MEA, PTC-051 NA, THM-032 EU, THM-057 India | Build lags on the full grid with explicit NaN, never from the "last available row" |

### 2.4 `macro_indicators.csv` (114 rows for 113 months; MI, MI.v, DD.v)

| # | Error | Cells | Detection | Fix | Confidence |
|---|---|---|---|---|---|
| M1 | Duplicated month 2022-06 (file lines 43 and 44) | 1 row. Only PMI (53.9 vs 52.7) and Orders (102.9 vs 104.3) differ | 113 distinct dates in 114 rows | **Keep line 44**: it is the later row, smooth with its neighbours, and the demand likelihood ratio favours it | high |
| M2 | Auto_Production_YoY_Pct stored as a fraction | 12 cells (2019-01..12) | Pattern `-0.ddd`, 3 decimals | x100 | high |
| M3 | PMI decimal shift | 1 cell (2023-05: 4.79) | Robust z of the first difference -57 to -63; two decimals | 47.9. It sits above both neighbours, not between them (MI.v wording fix) | high |
| M4 | Raw_Material_Cost_Index on an old base | 36 cells (2019-01..2021-12) | Break 149.3 -> 123.6 at 2022-01; 2024-01 = 100.0 exactly | Divide by **K = 1.25**. MI.v narrowed the plausible range to 1.21..1.26; under re-rounding only 1.25 or 1.274 fit all 36 cells. Run sensitivity at 1.22 / 1.26, not 1.20 / 1.30 | high (exists), medium (K) |
| M5 | Single blanks | 5 cells: INV 2019-07, FUEL 2020-09, UTIL 2021-02, ORD 2023-08, EV 2024-11 | Empty string | Mean of the previous and next month | high |

Total: 56 cells changed and 1 row dropped. Use `research/scratch/macro-indicators/macro_clean.csv` and log
`macro_change_log.csv`.

Not errors: the 2020 pandemic swings, AUTO +36.9 in 2021-05 (base effect), the FUEL spike of 142.8 in 2022-06, RAW 2021-02
+5.5 z (commodity rally), and the runs of 3 equal AUTO values (2.6 in 2026-03..05 is history; 1.8 and 2.4 are in the window).
These are rounding or economic events.

The window has no blanks or spikes. UTIL starts at 83.8, above its historical maximum of 83.4.

### 2.5 `sku_master.csv` (601 rows; LM, LM.v, LK)

| # | Issue | Evidence | Fix | Confidence |
|---|---|---|---|---|
| S1 | PMP-004 Business_Unit wrong | Master says `Power & Drive Systems`. All 534 raw train rows and 114 test rows say `Advanced Manufacturing`, the BU of the other 86 PMP SKUs. One BU per family (problem statement) | Set BU = Advanced Manufacturing; 1 master row corrected | high |
| S2 | BSS-018 Launch_Date 4 months late | Master says 2025-06. All 4 regional series start 2025-02 (16 rows, `CEL-0007995..7998, 8016..8019, 8037..8040, 8058..8061`) with a normal launch ramp and the 2025 price 285.65. The Record_ID grid only tiles with 2025-02 | Effective launch = 2025-02. Keep the 16 rows; register them as `sales_before_master_launch` (master wrong). Rule 5 forbids sales before a *planned* launch only | high |

Otherwise the master is clean:

- Formats and statuses are 100 % consistent with the dates: Active 589, Discontinued 6, EOL Announced 3, Planned Launch 3.
- `SKU_Description = Size_Class + ' mm ' + product name` for 601 / 601. Each form factor maps to one powertrain.
- Powertrain: Universal 440, ICE 93, EV 68. All EV SKUs launched 2019-10 or later. The earliest launch is 2009-01
  (LM.v correction of 2009-04).
- Train has 598 SKUs (601 minus the 3 planned launches).

### 2.6 `events_calendar.csv` (68 rows; EC, EC.v)

Formally clean:

- 48 starts are `YYYY-MM` and 20 are `YYYY-MM-DD`. Month precision means the whole month.
- One open-ended event: EV-052, End_Date blank, active through 2028-05.
- 3 `Customer | Region` scopes. Split them on `" | "`.
- Every Scope_Value is canonical. LNY windows are always 10 days and Ramadan windows 30 days, at the real dates.

Semantic issues to handle:

- **Not every event affects demand.** 5 decoys show no effect: EV-006 rebrand, EV-035 APAC sales director, EV-043 Hannover
  Messe, EV-048 CRM upgrade and EV-058 Pune dealer conference. Register each as "reviewed, no effect".
- **EV-039 Red Sea** is listed with scope Channel = Export. The data show the effect only on Export x {Europe, MEA}.
- **EV-019** (semiconductor) and **EV-033** (ERP) act on supply and on data respectively, not on demand.
- **Customer-scoped events must be joined on the customer at that time**, from a (series, month) -> customer table.
  - Nexon | Europe in 2023-10 covered 46 series. Using the latest customer would give 50, the wrong set.
  - HYD-009 Europe was Nexon in 2023 and is Apex now.

### 2.7 `inventory_stockouts.csv` (5,830 rows; SU, SU.v)

| # | Issue | Evidence | Rule |
|---|---|---|---|
| I1 | Format | None: 0 blanks, 0 duplicates, canonical keys, 94 months, 520 SKUs, all rows inside the decoded grid | Load as is |
| I2 | Documentation conflict: `Fill_Rate_Pct` | The documented `Shipped / (Requested + Carried_In)` holds at 1 decimal on only 115 / 5,005 rows (2.3 %). It is the **latent allocation fraction** | Show a realised fill computed by us. Log the conflict |
| I3 | No-impact rows | 870 rows have Requested = 0: 825 are all-zero rows that still carry Fill / Days / Reason, 45 hold only carried-in units | Keep them as flags only |
| I4 | Incompleteness | (a) Semiconductor: every ELA cell 2021-03..2022-09 is constrained, but only 4,296 of the 6,221 with a train row are listed (69.1 %, an independent coin flip). (b) Operational: about 79 % listed (0.786, CI 0.746..0.822), so about **413 hidden months** (CI 328..516) | Impute (a) exactly as in section 7. For (b), apply the exact detectors D1/D2/D3 (105 months) and register the rest; do not impute |
| I5 | Unit-test caveat | 3 semiconductor rows carry Carried_In > 0 (60 units; 2021-03, after an operational stockout in 2021-02): ELA-044 APAC, ELA-045 NA, ELA-058 EU | Allow C > 0 on those rows |

Exact identities (100 % of rows; use them as unit tests):

- `Lost = R + C - Shipped - B`
- `C(t) = B(t-1)` (3,108 / 3,108 consecutive pairs)
- `Shipped = floor(f x (R + C))`
- `B = floor(0.4 x shortfall)` on operational rows; B = 0 on semiconductor rows
- `Stockout_Days = round(30 x (1 - f))`

File totals: Requested 235,319; Carried_In 3,948; Shipped 140,554; Backordered 16,886; Lost 81,827.

### 2.8 `sample_submission.csv`

- 5 rows. Header `Date,SKU_ID,Region,Units_Sold_Forecast`. Plain integers. These are the first 5 test keys in test order.
- Contract: 58,219 rows, keys copied verbatim from test.csv in test order, non-negative integers, no blanks.
- **Round to nearest, never floor.** Flooring moves bias by -0.84 points (TS, TS.v).
- Validator: `research/scratch/test-structure/validate_submission.py`.

---

## 3. Real events and anomalies (model or exclude, do not "fix")

These are seeds for the anomaly register. Use the episode-level register plus the cell-level view from MC section 7: type
codes `RE.*`, `ST.*`, `RC.*` and shapes AO / LS / TC / SLS / RAMP / BLOCK. Off-phase cycle zeros are **structure, not
anomalies**; do not register the 35,585 of them.

| Type (register code) | Count / scope | Detection rule | Magnitude | Recommended action |
|---|---|---|---|---|
| One-off bulk order (`RE.ONE_OFF_ORDER`, AO) | 541 (DG, phase-aware), 455 (DG.v), 438 (NR, raw neighbour median; 378 survive NR.v's strict rule, 60 doubtful in `s_oneoff_doubtful.csv`). About 0.26 % of order months: Direct OEM 3.4 per 1,000, Tier-1 3.9 per 1,000, Aftermarket / Export about 0. 36 in 2026-05..10 | Order > 3.5 x the **phase-aware, unconstrained** expectation; or > 3 x with channel OEM / Tier-1 and expectation >= 25. Run it after unconstraining. Never use a raw neighbour median: it fails on back-order catch-up (PMP-040 LatAm 2026-09/10 = 141/154 against a requested level of about 110-125), on cycle series, around COVID and at real level steps | x3.15 (5 %) .. x4.9 (median) .. x9.3 (95 %), max about 20. 0.92 % of all demand, 1.23 % of OEM + Tier-1. No pre-dip, no payback (0.98-1.02). 6 sit in the stock-out file with Requested > Shipped, so they are part of latent demand | Keep in the cleaned history and the dashboard. **Mask for level / seasonality / noise estimation** (replace by the model expectation, not a neighbour median). Do not forecast them at cell level. If totals must be unbiased, add +1.2 % to OEM / Tier-1 means |
| Listed stockout (`RE.STOCKOUT_LISTED`) | 5,830 rows: semiconductor 4,314 (all ELA, 2021-03..2022-09), operational 1,516 (Logistics 391, Supplier quality 381, Capacity 377, Tooling 367). Operational rate 6.33 per 1,000 series-months, flat in every dimension; runs 949 x1, 279 x2, 3 x3 (SU.v correction) | File row | Fill U(15, 70) % (operational) | Demand = Requested_Units |
| Unlisted semiconductor cell (`RE.SEMICONDUCTOR_ALLOCATION`) | 1,925 ELA cells, plus 7 grid cells with neither a row nor a listing | ELA x 2021-03..2022-09 and not listed | Shortfall = depth(month) x severity(series). Depth 0.090 -> 0.511 (2021-09) -> 0.081 (2022-09). Severity per series about U(0.65, 1.35), split-half r 0.94 | Impute `max(0, round((u + 0.5) / fill_hat) - C)`: 5.3 % WAPE, -0.2 % bias, the floor. Sample weight about 0.7 |
| Back-order catch-up (`RE.BACKORDER_CATCHUP`) | 1,034 S2 cells (unlisted month after a back-ordered month), including **141 "phantom orders"** where own demand is 0. Off-phase spill 224 cells: 139 equal the previous Backordered, 40 have a same-month row with R = 0 and C > 0, 7 follow another stockout, 38 have **no record** (unlisted stockouts) | `u(t+1) >= B(t)` -> demand = `u - B(t)` | Exact | Subtract the carry before cycle detection. Spill -> 0 demand. S2 cells below about 0.35 x local level are suspected hidden second-month stockouts (about 80 expected): mask or down-weight |
| Hidden operational stockout (`RE.STOCKOUT_UNLISTED`) | Exact detectors: D2 64 (listed C > 0 after an unlisted month), D1 29 phantom months, D3 14. 105 recovered of about 413 hidden. D4 likelihood: 82 cells at LR >= 50, about 60 % precision | Arithmetic signatures (SU section 6) | About 5.4k units undetectable | Apply D1 / D2 / D3. Register D4 as "suspected, no action". Use a robust loss for the rest |
| Lunar New Year (`RE.HOLIDAY`) | APAC, 10 listed windows | Day counts from `events_month_exposure.csv` | `1 - depth x d/10`, depth **0.28** (EC.v) to 0.305 (EC). DG: -0.0343..-0.0345 log per day | Day-count feature. Never learn a fixed APAC Jan / Feb index |
| Ramadan (`RE.HOLIDAY`) | MEA, observable 2022-2026 only | Day counts | `1 - 0.30 x d/30`, depth 0.24..0.32 (EC.v 0.297). Short partial months uncertain. 2024-03 is masked by the Red Sea catch-up | Day-count feature. Exclude Export MEA 2024-01..03 when fitting |
| Fixed regional months (`RE.HOLIDAY` / generator seasonality) | NA Jul, EU Aug (listed). APAC Oct, LatAm Jan, India Jun, India Oct (unlisted), plus APAC Dec x1.06, LatAm Feb x0.94 / Aug x1.07, India Jan / Nov x1.05, MEA Nov-Jan x1.07-1.10 (EC.v) | Region x month residual, stable over 7 years | NA Jul x0.83-0.86, EU Aug x0.63-0.65, APAC Oct x0.81-0.84, LatAm Jan x0.85, India Jun x0.90-0.93, India Oct x1.08-1.09 | Learn the **full** region x calendar-month seasonality; no named dummies. No Diwali effect |
| COVID lockdowns (`RE.DISRUPTION`) | EV-009..013. India 2020-04 ran at x0.05-0.06, Europe x0.25, NA x0.33, LatAm x0.39; APAC Feb x0.67-0.68. Global trough to 0.63-0.66 in 2020-07, recovery by 2020-10, overshoot +4-16 % in Nov-Dec 2020 and 2021-H1 | Listed region-months plus the 2020 path | | Mask 2020-01/02..2020-09 for level, seasonality, noise and driver estimation, or use lockdown dummies. Never feed 2020 to seasonal-naive averages |
| Pre-buy before the announced 9 % rise (`RE.PREBUY_PRICE_RISE`) | Tier-1 + Aftermarket, all regions, 2022-12..2023-02 (EV-030) | Channel x month residual | Relative to the ordinary year-end: Dec x1.41-1.42, Jan x0.69-0.70, Feb x0.84-0.86. About volume-neutral (-0.02 to -0.03 of a month). NR.v reads an Aftermarket net +8 % of a November | Mask or dummy these 3 months for T1 + AM. No pre-buy in the window |
| Ordinary channel year-end (seasonality) | Every year | Channel x month | T1+AM Dec x1.065 / Jan x0.955; OEM+EXP Dec x0.945 / Jan x1.05 (ratio 1.12 / 0.91). DG.v: AM 1.084 / 0.967, T1 1.052 / 0.947, OEM 0.934 / 1.055, EXP 0.938 / 1.035 | Channel x calendar-month seasonality |
| Nexon x Europe strike (`RE.STRIKE`) | EV-038, 2023-10..11, 46 series with Nexon *at that time* | Customer at time x region x month | **x0.145 / x0.138, no catch-up** (EC, DG.v; PZ x0.148). DG's x0.27 / 0.20 with recovery is refuted (region factor contamination). Scaling, not zeroing (2 of 44 M-series cells are zero) | Mask the cells. Exclude Nexon EU from the Europe factor in those months (otherwise Europe dips 7.8 %). It is the analogue for Orion 2027 |
| Red Sea (`RE.LOGISTICS`) | EV-039; data show Export x {Europe, MEA} only (276 Export series: Europe 48, MEA 228), 2024-01..03 | Export vs non-export, stratified by region | Jan x0.52-0.69, Feb x0.62-0.70, Mar x1.51-1.61, Apr about 1.0. Net Jan-Mar about 0.92-0.95. Pooling EU + MEA without stratifying gives a false 1.325 in March | Mask the 3 months for those series (or divide by 0.62 / 0.62 / 1.61) |
| Helios x India programme step (`RE.PROGRAM_STEP`, LS) | EV-052, from 2025-09, open-ended; 65 series (64 alive; PMP-022 India is a lost account) | Customer x region DiD | **x1.24** (EC 1.239-1.249; DG.v 1.240; LK.v 1.25; TS 1.27, TS.v 1.29; DG's 1.19 refuted). 2025-09 about x1.12-1.14, full from 2025-10. Flat, no trend | Level from 2025-10 on, or rescale pre-step history by 1.24. **One uniform step**: EC's per-series shrink rule is refuted (no excess dispersion) |
| MEA market entry (`RE.REGION_OPENING`, RAMP) | EV-024; 461 series start 2022-01 (459 belong to SKUs launched earlier) | Series start = 2022-01 | Ramp `1 - exp(-(k+1)/tau)`, tau 5.75-6.25 (LM 6.25, LM.v 5.75, EC 5.9, DG about 6, PZ 4.8-5.7). Mature MEA level about 0.45-0.52 of other regions (convention-dependent) | Structure, not an anomaly. Not identifiable separately from MEA x month effects (LM.v), so do not de-ramp and fit MEA x month on the same months |
| Launch ramp (`ST.LAUNCH_RAMP`) | 625 in-window launch series (138 SKUs) | Months since **product launch** (Launch >= 2019-02; BSS-018 from 2025-02) | `1 - exp(-(k+1)/tau)`, tau 4.5-4.75 (only with an EV-trend control; uncontrolled fits give 9-10). P(zero on-phase) 9.9-10.7 % at age 0 | Never apply it to series that start in 2019-01 because the window opens there (includes 187 series of 35 SKUs launched in 2018) |
| EOL phase-out (`ST.EOL_DECLINE`) | 25 series of 6 discontinued SKUs | Months to EOL | Graded decline in the last ~6 months (see 4.11) | Exclude phase-out months from level estimation |
| Customer switch (`ST.CUSTOMER_SWITCH`, LS) | 23 series, one each, 2022-07..2025-05, no gap, India 6, Europe 6, APAC 4, LatAm 4, NA 3 | Customer label changes on a cleaned label | Control-adjusted 12/12 ratio 0.54..2.11 (10 down, 13 up; geo-mean 1.115-1.118; log sd 0.44 vs 0.22-0.23 placebo). About half individually significant. Cycle unchanged 23 / 23 | Level from post-switch months only (18-52 available). Keep pre-switch data for seasonality and cycle |
| Lost account (`ST.LOST_ACCOUNT`, LS to 0) | 16 series (list in 5.2) | >= 6 trailing silent months on a live SKU (cleaned units); exactly these 16. No internal silence in history exceeds 5 months | Pre-loss about 1,009-1,032 units per month (0.69-0.73 % of volume) | Forecast 0 (P10 = P50 = P90 = 0); truncate the series at the last order for training |
| Ordering-cycle change (`ST.CYCLE_CHANGE`) | 27: Q->M 18, M->B 6, M->Q 3; 2022-01..2023-11; LatAm 8, India 5, Europe 5, APAC 5, NA 4 | Template segmentation | Level ratio about 1.00-1.03 with a same-SKU control | Use the regime in force at 2026-10. No level break feature. Record the change month as an interval |
| On-phase zeros (structure) | 269 (PZ) / 232 (PZ.v): 174 launch-ramp, 61 India 2020-04..06, 12 other 2020, 18 low-volume series (order < 8 units), 4 other | | | Keep. Not a cycle change |
| Master conflicts (`RC.MASTER_BU`, `RC.MASTER_LAUNCH`) | PMP-004 BU; BSS-018 launch | | | Master corrected (2.5) |
| Surcharge (`RE.SURCHARGE`) | EV-027 2022-07..12, global | Price ratio 1.06 | No demand effect | Price only |
| Annual price rises | EV-001 ... EV-065 | January list change | Announced % +- N(0, 0.6 pp) per SKU | Price table only |
| Unexplained cells (`unexplained`, review) | 4 isolated cells at z about -4.5 (EC): Falcon Gulf x Direct OEM 2023-06 x0.73; Meridian x LATAM 2024-09 x0.79; Kestrel x PMP 2025-02 x0.71; Falcon Gulf x HYD 2026-05 x0.73 | Residual scan | | Register, no action |

The residual scans found **no other unlisted demand events** beyond the recurring region-months: 29,984 cells (EC), 8,688
(EC.v) and 4,404 customer-region-month cells. The scans cannot see steps smaller than about x2.5 on a single series (LK.v), or
effects below about 10 % on small scopes.

---

## 4. The demand generator as best understood

| # | Component | Best estimate | Status |
|---|---|---|---|
| 4.1 | **Structure** | `latent[s,t] = L[s] x F[family,t] x R[region,t] x C[channel,t] x P[powertrain,t] x ramp x events`. Factors fitted on M / A series predict B / Q / T series out of sample with bias -0.3 % to +1.0 % (WAPE B 0.2215, Q 0.2158, T 0.2265). No family x region, family x channel, customer or SKU x month interactions. Residual cross-series correlation is about 0 except the same SKU in another region (+0.077) | VERIFIED |
| 4.2 | **Level** | `log L = SKU effect + region effect + independent series factor`. Series factor log sd 0.40-0.41, near lognormal. Region multipliers (vs the geometric mean of the 5 old regions): NA 1.083-1.089, EU 1.040-1.055, APAC 1.009-1.025, India 0.962-0.968, LatAm 0.895-0.897, MEA 0.45-0.50. Cross-sectional price elasticity -0.50 to -0.55. Customer and ordering cycle have no level effect. Channel: OEM > T1 > AM > EXP, small. Level median 42.4 units per month (1 % 9.1, 99 % 174.3) | VERIFIED (structure); PLAUSIBLE (exact coefficients, MEA convention) |
| 4.2b | **Two SKU tiers** | The 100 core SKUs (22.6 % of volume) have a full regional level profile against NA: EU 0.91, APAC 0.89, India 0.78, LatAm 0.46, MEA 0.41, and more A cycles (44 %). The 501 tail SKUs have flat regions except MEA x0.48 (LatAm about 0.90) and M 55 %. All 6 discontinued SKUs, 9 replacements and 3 planned launches are tail; all 3 EOL-announced SKUs are core. Dynamics are the same in both tiers | VERIFIED (tiers); PLAUSIBLE (use for priors) |
| 4.3 | **Trend** | None. The yearly index is a cycle: 1.015 / 0.728 / 1.190 / 1.021 / 0.987 / 1.069 / 1.011 / 1.052 for 2019..2026. Family trends after macro control lie within +-1.1 % per year. Series slopes do not persist (next-19-month level regression coefficient 0.30 on the last-12 level) | VERIFIED |
| 4.4 | **SKU-level drift** | SKU x year deviations are real (z-variance 2.87-3.14 vs 0.84 permuted). They are 2-3x larger in turbulent years (2019-22) than in calm years and come from SKU-specific macro sensitivities | VERIFIED |
| 4.5 | **Seasonality** | Common profile x region profile, identical within family, fixed across years (year-to-year sd 0.018-0.019 against 0.020 sampling). Region profile (DG table, six ordinary families): APAC Feb 0.699 (full LNY) / Oct 0.901; EU Aug 0.647 / Dec 0.962; India Oct 1.143 / Jul 0.951; LatAm Jan 0.791 / Feb 0.895; NA Jul 0.838 / Dec 0.931; MEA Jul 0.936, Nov 1.113. Thermal: May-Jul x1.085-1.10, Nov-Jan x0.92-0.95. Channel year-end shift as in section 3. Strength max/min: EU 1.73, APAC 1.50, LatAm 1.33-1.38, NA 1.27-1.29, India 1.19-1.20 | VERIFIED |
| 4.6 | **Moving holidays** | LNY: `1 - 0.28..0.30 x days/10` in APAC; follows the listed dates (2023 January dip, 2025 split 0.92-0.96 / 0.81-0.86); no anticipation or payback. Ramadan: `1 - 0.30 x days/30` in MEA; a full month (2025-03) about 0.72-0.79; no payback. The form for months with few days is not identified | VERIFIED (existence and dates); PLAUSIBLE (depth, partial-month form) |
| 4.7 | **Macro** | Per SKU: a primary driver from the family set at an integer lag (MAP lag 1: 158, 2: 247, 3: 122, 4: 42 SKUs; a few at 0 or 5-6). About 0.17-0.19 log per sd; true across-SKU sd about 0.04-0.05. Family sets: BSS AUTO@1 / FUEL@1 / INV@2(-4); CSS AUTO@2 / ORD@2 / RAW@2; ELA ORD@2(-3) / PMI@2 / AUTO@3; HYD PMI@2(-3) / UTIL@0-2 / ORD@3 (third driver ambiguous); PMP PMI@2 / UTIL@2 / AUTO@2; PTC AUTO@3 / ORD@2 / UTIL@4; THM AUTO@2 / PMI@2 / FUEL@1. Same lag and amplitude in every region and in the OEM / Tier-1 / Export channels. **Aftermarket**: damped c = 0.37 (MI.v) to 0.42 (MI), plus FUEL@1 -0.063 per sd (-0.37 % per index point), absent in 2019-07..2020-12. **Form**: log-linear with soft upward saturation (soft cap: slope 1 below u = 0.25, 0.5 above, the best fit), no floor, amplitude muted in 2021-01..2022-11 (era factor about 0.9). **Single driver must not be imposed**: shrunk 3-driver SKU paths beat it in every backtest cell | VERIFIED (family sets, sign, size, lag stability, channel structure); PLAUSIBLE (exact SKU driver / lag, cap form, Aftermarket damping) |
| 4.7b | **Macro lag stability** | Lags peak at the same value in every window, 2019-09..2022-11 and 2023-03..2026-10. At family level some lags move by 1 after 2023 (ELA, HYD) with small gains. Amplitude by era (gamma of a full-sample log-linear path): 1.045 / **0.961** (2021-22) / 1.123 / 1.075. The x1.10 window scaling is a property of that estimator: re-estimated with cap + era factor, calm-era gamma is 0.99-1.01 | VERIFIED (lags stable); PLAUSIBLE (amplitude) |
| 4.8 | **EV shift** | Zero lag (best at lag 0 for both EV and ICE). Exponential in the index. Class level: EV +0.0358..+0.0385 per point (plateau-only estimate 3.74 +- 0.43 %), ICE -0.0110..-0.0130 per point (use -0.0116 / -0.0117), Universal 0 by construction. ICE / Universal factor: 1.00, 0.94-0.95, 0.84, 0.77, 0.65-0.66, 0.59-0.60, 0.59, 0.575-0.58 by year 2019..2026. EV share of units: 0.0 / 0.3 / 1.4-1.5 / 3.0-3.1 / 6.0 / 9.2 / 9.9 / 9.8 %. A plateau-only ICE slope of -2.0 +- 0.3 %/pt is flagged in 9.8 | VERIFIED (class level, lag, form); per-SKU betas **refuted** |
| 4.9 | **Ordering cycles** | 16 calendar-anchored patterns; the phase does not move with LNY or Diwali. Prevalence: M 49.9 %, A 25.1 %, B 9.6 %, Q 7.8 %, T 7.5 % of series. Independent of region, customer, channel, family and powertrain. Annual-shutdown month: Europe Aug, NA Jul; elsewhere Dec / Jan / Jun, plus holiday months (APAC Feb, India Nov, LatAm Dec) in the 2019 cohort. Order = sum of latent months since the last order; the shutdown month carries 0.4906-0.51 into the next month. **Do not use `k_accum_months = 1.5` as a multiplier**: `1.5 x own` is wrong by +14.6 % for Europe after August. First test order: B 2 months, Q 3 (includes Sep / Oct 2026 latent demand), T0 / T1 2, T2 1. **New launches**: the first B / Q order does not accumulate the months since launch (use one month of ramped demand), and the T phase is anchored with the launch month off (23 / 36) | VERIFIED |
| 4.10 | **Noise** | Negative binomial on the **order**, not per latent month (B / Q / T phi 0.91-0.99 relative to M). Variance about `1.37-1.43 m + 0.059-0.068 m^2`. NB size k by region (DG / DG.v): NA 19.7 / 17.0, EU 18.4 / 16.8, APAC 16.2 / 14.3, India 12.8 / 11.9, LatAm 10.2 / 9.7, MEA 8.5 / 9.2 (+-15 %). No serial correlation in the noise. Order / mean: median 0.965-0.97, skew +0.75 | VERIFIED (shape, order-level, region ordering); PLAUSIBLE (exact k; channel / family flatness not reproduced) |
| 4.11 | **Lifecycle** | Launch: `1 - exp(-(k+1)/tau)`, tau 4.5-4.75 pooled; per-SKU tau is not identifiable (split-half r 0.26); EV launches follow the same curve once the EV term is in the base. EOL: no last-time buy; the decline is concentrated in the last ~6 months. **My check (`d01_eol_phaseout.py`)**: against an ICE-only regional control, M / A series run 0.88 (m 6-8), 0.70 (m 3-5), 0.52 (m 1-2), 0.28 (EOL month) of their level 13-30 months before EOL, with about 0.85-0.9 already at m 9-18. Against an all-powertrain control the same numbers are 0.77 / 0.60 / 0.43 / 0.23. So about half of the "decline from month -12" reported by TS.v is the ICE EV-index trend, which is flat in the window. Relative to a recent level: about 0.9 / 0.8 / 0.7 at m 5..3, 0.6 / 0.5 at m 2..1, 0.3-0.45 in the EOL month | VERIFIED (ramp form, EOL window); PLAUSIBLE (exact EOL factors) |
| 4.12 | **Stockout / back-order mechanics** | As in section 2.7. Operational stockouts: start probability about 0.6 % per series-month, 30 % chance of a second month, fill U(15, 70) redrawn monthly, 40 % back-ordered (operational), 0 % (semiconductor). The semiconductor shortfall is a deterministic depth curve x series severity + noise (sd 0.038). ELA requested demand runs about 1.09-1.10 relative to other families inside the window. That is **not** an allocation artefact (smooth across both window edges, unrelated to severity; SU.v). MI and MI.v show it is consistent with or below ELA's macro drivers | VERIFIED |
| 4.13 | **One-offs** | OEM / Tier-1 only, about 0.26 % of order months, multiplier median about 4.9, Poisson in count per series, uniform over time / region / month, no payback; part of latent demand | VERIFIED |
| 4.14 | **New region (MEA)** | Opens 2022-01 (0 MEA rows before). Own 3 customers (Atlas Mideast Components 180 series, Falcon Gulf Motors 172-174, Kestrel Mobility 166), not shared with any other region. Export-heavy (239 of 520 series). Ramp tau about 5.75-6.25. Mature level about 0.45-0.52 of other regions. No cannibalisation of other regions' Export | VERIFIED (shape, timing); PLAUSIBLE (tau) |
| 4.15 | **Account dynamics** | Switches, losses and cycle changes look like fixed per-series probabilities (0.75 %, 0.52 %, 0.88 %) placed in disjoint windows of train: cycle changes midx 36/37..58, switches 42..76, losses 75..84 | PLAUSIBLE (that the generator schedules none in test); the test file confirms 0 switches |
| 4.16 | **Pre-buy rule** | Pre-buy is triggered by an announcement event (EV-030), not by the size of the rise: 5.0 % in 2022 produced none, and the December dose slope is weak (0.014-0.027 per pp) | PLAUSIBLE |
| 4.17 | **Orion-type planned customer shutdown** | No history. Strike analogue x0.14-0.15 with no catch-up, or a shutdown-like zero with 0.5 catch-up | UNKNOWN |

---

## 5. Forecast-window intelligence, 2026-11..2028-05

Test grid: 58,219 rows. Rows per month: 3,058 (2026-11..2027-02), 3,061 (2027-03..05), 3,065 (2027-06..09), 3,068
(2027-10..2028-05). The naive test volume is about 2.70-2.72 M units.

### 5.1 Structural zeros (8,842 rows) and the cycle mask

- **Off-phase: 8,382 rows.** Expected zero share by month runs 12.84 % (2027-05) to 19.20 % (2027-12). Full table:
  `research/scratch/test-structure/test_expected_zero_rows_by_month.csv`; the mask is in `series_state.csv` (`test_mask`) and
  `panel-missing-zeros/test_phase_mask.csv`.
- **Rule.** Force exactly 0 after modelling. Off-phase non-zeros in history are back-order spill, which cannot occur in an
  unconstrained window.
- **Accumulation factors** on the 49,260 remaining known-pattern rows:
  - 1 month: 42,373 rows;
  - month after an annual shutdown: 1,139 rows (own + 0.5 x shutdown month, **not** 1.5 x own);
  - 2 months: 4,243 rows;
  - 3 months: 1,505 rows.
- **Low-confidence young-series masks** each rest on a single zero observation (TS.v):
  - PMP-019/Europe A-Aug (p = 0.692);
  - ELA-017/India A-Jun (0.865);
  - THM-011/APAC A-Jun (0.725).

  The rule `p_order < 0.5 -> 0` forces 3 rows to zero. That is the absolute-error-optimal choice, and the volume is
  negligible.

### 5.2 Lost accounts: forecast 0 (16 series, 304 rows)

| Series | Zero since | Pre-loss level (cleaned) |
|---|---|---|
| HYD-081 North America | 2025-04 | 77.8 |
| PTC-002 North America | 2025-06 | 110.8 |
| THM-015 North America | 2025-07 | 46.1 |
| ELA-040 North America | 2025-08 | 46.2-46.3 |
| CSS-062 Asia Pacific | 2025-10 | 44.2 |
| CSS-045 India | 2025-11 | 71.0-74.1 |
| ELA-084 India | 2025-11 | 29.8 |
| HYD-061 Europe | 2025-11 | 74.5 |
| PMP-076 India | 2025-11 | 43.2 |
| PTC-003 Europe | 2025-11 | 109.1-119.2 |
| PTC-038 North America | 2025-11 | 48.0 |
| BSS-034 North America | 2025-12 | 67.5-72.6 |
| CSS-085 Europe | 2025-12 | 58.1-59.8 |
| BSS-082 India | 2026-01 | 95.1 |
| ELA-055 Latin America | 2026-01 | 38.1-39.3 |
| PMP-022 India | 2026-01 | 49.4-51.6 (not 470.2: that was a raw x100 error) |

Evidence:

- 204 silent cells: 203 explicit zero rows plus 1 missing row. 9 customers, 5 regions. All SKUs are Active with no EOL, and
  every other region of each SKU still sells.
- PMP-022 India 2026-07 has `Requested_Units = 0` in the stock-out file, so this is demand, not supply.
- No silence longer than 5 months has ever ended. A 95 % upper bound on a return hazard is 1.5 % per month.

### 5.3 End of life: PTC-005, PMP-003, THM-001 (18 series, 342 rows)

- All three are core ICE SKUs in 6 regions. Last-12-month levels (summed over regions): PTC-005 312-316, PMP-003 312-317,
  THM-001 364 units per month.
- **After EOL: 156 rows -> 0.** PTC-005 2027-06..2028-05 (72 rows); PMP-003 2027-09..2028-05 (54); THM-001 2028-01..05 (30).
- **Phase-out before EOL.** Apply it to latent demand before cycle accumulation. Months to EOL m = 5..0:
  - PTC-005: 2026-12..2027-05;
  - PMP-003: 2027-03..08;
  - THM-001: 2027-07..12.

  That is 108 rows. **Recommended factors relative to the model's recent de-factored level: 0.90, 0.81, 0.71, 0.61, 0.52,
  0.42** (LM.v linear fit). PZ.v's 0.92 / 0.83 / 0.76 / 0.67 / 0.54 / 0.32 is an equivalent alternative for the EOL month.
  My ICE-controlled check (4.11) agrees with these shapes.
- Do **not** use PZ's 0.50 / 0.57 / 0.40 / 0.27 (measured against a level 13-30 months back, so it double-counts) or LM's
  flat x0.60. TS.v's "0.80 from month -12" is half EV-trend artefact (section 9).
- PTC-005's last 6 months are 0.82 of the previous 12 on TS.v's drift-adjusted (all-powertrain) basis; its last 12 against
  the previous 12 are 1.01. Estimate its level on about 24 months.
- Successors launch 2 months before each EOL: PTC-029 / PTC-005, PMP-020 / PMP-003, THM-012 / THM-001.

### 5.4 Cold starts: the 3 planned launches (10 series, 117 rows)

All three are tail-tier SKUs. Customer and channel come from test.csv: 0 of 10 shared regions inherit the predecessor's
customer or channel.

| SKU (replaces) | Powertrain | Launch | Series: region / customer / channel |
|---|---|---|---|
| PTC-029 (PTC-005) | EV | 2027-03 (15 rows each) | APAC / Solaris Automotive / Direct OEM; LatAm / Apex Tier One / Aftermarket; MEA / Atlas Mideast Components / Tier-1 Distributor |
| PMP-020 (PMP-003) | EV | 2027-06 (12) | India / Vantara Auto / Tier-1; LatAm / Solaris Automotive / Aftermarket; MEA / Kestrel Mobility / Tier-1; NA / Nexon Motor Group / Direct OEM |
| THM-012 (THM-001) | Universal | 2027-10 (8) | Europe / Solaris Automotive / Direct OEM; LatAm / Nexon Motor Group / Aftermarket; NA / Vantara Auto / Direct OEM |

**Treatment.** `forecast = L x (1 - exp(-(k+1)/4.6)) x EV factor x seasonal / macro / event multipliers`, with k = months
since launch.

- **L (mature level prior).** Three candidate sources:
  - LM's recommended L, which includes the x1.10 mean smearing: PTC-029 52 / 44 / 27 (APAC / LatAm / MEA); PMP-020 56 / 49 /
    30 / 62 (India / LatAm / MEA / NA); THM-012 69 / 55 / 70 (EU / LatAm / NA). LM.v's independent prior is within +-10 %.
  - TS's tail-tier family medians, non-MEA: PMP 47.8, PTC 41.2, THM 54.0; MEA x0.47-0.49; LatAm about 0.90 (TS.v).
  - DG's formula prior.

  The gap between them is mostly mean against median: the prior's log sd is about 0.50. LM.v recommends the median prior
  (x1.0) for the point forecast; x1.10-1.13 for aggregates.
- **Predecessor levels are a poor guide.** PTC-005 LatAm 7.7 sits against a prior of about 41, because the predecessors are
  core SKUs with LatAm at half level. Give them at most a weak geometric blend.
- **Cycle.** Unknown: the late-cohort prior is M 55 %, A 19 %, B 10 %, Q 8.6 %, T 7 %. Forecast the monthly latent mean
  every month. The first order is one month of ramped demand. P(order) for a brand-new series is about 0.87 in ordinary
  months.
- **Intervals.** About x0.53-0.58 / x1.71-1.9.
- **Revenue.** No 2026 price exists. Use the predecessor's 2026 price (PMP-003 1,265.24; PTC-005 2,383.36; THM-001 525.83)
  x about 1.18 (assumption).

### 5.5 Just-launched and young series

- **Just launched, under 12 months: 18 series of 4 SKUs (342 rows).** Ramp values in 2026-11: PMP-019 0.59, BSS-012 0.67,
  THM-011 0.79, ELA-017 0.83. Ramp-aware mature levels sum to 702-724 units per month, against 330 for the mean of history.

  | SKU | Launch | Series and cycle posterior |
  |---|---|---|
  | BSS-012 (Universal) | 2026-07 | NA M 0.997; LatAm M 0.744; Europe M 0.997; APAC M 0.744 (first row deleted) |
  | ELA-017 (EV) | 2026-04 | Europe B1 1.0; MEA B1 1.0; India A-Jun 0.865; APAC M 0.804; NA M 0.998; LatAm T1 0.996 |
  | THM-011 (EV) | 2026-05 | APAC A-Jun 0.725; India M 0.812; Europe M 0.998; NA B0 1.0 (customer **Orion Driveline**, so it is in EV-062 scope); MEA M 0.818 |
  | PMP-019 (EV) | 2026-08 | Europe A-Aug 0.692; MEA M 0.744; NA M 0.744 |

  Treatment: `L = (sum units + n0 P) / (sum ramp x ev_factor x macro index + n0)` with n0 = 1-2 and P the cross-sectional
  prior (LM). Include the region / family / EV base, or the level is biased -10 to -19 % (LM.v).
- **Young, 12-23 months: 49 series.** BSS-018, BSS-037, CSS-010, CSS-037, CSS-057, ELA-061, HYD-023, HYD-063, HYD-086,
  HYD-089. Use a ramp-corrected level; the cycle is identified for 48 / 49.
- **History under 36 months: 145 series** (3.55 % of volume).

### 5.6 Customer state: switches and lost accounts carried, no new events

- The 23 switch series continue with the post-switch customer. Estimate their level on post-switch months.
- 8 series switched in the last 24 months (0.25 % of volume): CSS-066 LatAm, BSS-081 NA, THM-003 LatAm, THM-020 India,
  THM-047 India (2024-12..2025-01), PMP-015 EU (2025-04), PTC-050 EU (2025-05), ELA-023 EU (2024-11). These need explicit
  post-switch levels.
- **No hazard haircut** for new losses, switches or cycle changes. The test file has 0 switches. Losses are confined to
  2025-04..2026-01 and cycle changes to 2022-2023.

### 5.7 Events in the window

| Month(s) | Scope | Event | P50 multiplier (on latent demand) | Interval | Test rows |
|---|---|---|---|---|---|
| All 19 | Helios Auto Parts x India (65 series; 64 alive) | EV-052 step | x1.24 vs the pre-2025-09 level (1.0 if the level is taken from 2025-10 on) | 1.15-1.32 | 1,235 (1,216 alive) |
| 2026-12, 2027-12 | Tier-1 + Aftermarket | ordinary year-end before EV-059 (+4.5 %) / EV-065 (+4.0 %) | x1.065 (OEM + EXP x0.945) | 1.03-1.10 | 1,466 / 1,472 (T1 + AM) |
| 2027-01, 2028-01 | Tier-1 + Aftermarket | January after | x0.955 (OEM + EXP x1.05) | 0.93-0.98 | |
| 2027-02 | APAC | LNY EV-060, 10 days | 0.70-0.72 (correction vs fixed seasonal 0.919-0.926) | 0.67-0.73 | 510 |
| 2027-01 | APAC | no LNY days | 1.00 (correction 1.059-1.060) | | 510 |
| 2028-01 / 02 | APAC | LNY EV-066, 6 / 4 days | 0.82-0.84 / 0.88 (corrections 0.868-0.881 / 1.136-1.164) | **0.79-0.90 / 0.83-0.96** (EC.v widened) | 511 / 511 |
| 2027-02 / 03 / 04 | MEA | Ramadan EV-061, 21 / 9 / 0 days | 0.79 / 0.91 / 1.00 (corrections 0.805-0.812 / 1.120-1.134 / 1.080-1.081) | 0.75-0.83 / **0.85-0.92** | 516 / 517 / 517 |
| 2028-01 / 02 / 03 / 04 | MEA | Ramadan EV-067, 4 / 26 / 0 / 0 days | 0.96 / 0.74 / 1.00 / 1.00 (corrections 0.949-0.960 / 0.754-0.761 / 1.229-1.246 / 1.080-1.081) | **0.90-0.97** / 0.69-0.79 | 518 each |
| 2027-07 | North America | EV-063 summer retooling | 0.83-0.86 (inside region seasonality) | | 497 |
| 2027-07, 2027-08 | **Orion Driveline x North America** (62 series: M 26, A-Jul 18, B 9, Q 5, T 4; OEM 28, AM 13, T1 12, EXP 9) | EV-062 planned retooling shutdown | **x0.15 on latent demand** (Nexon strike analogue x0.138-0.145, no catch-up), then accumulated through each cycle. Order-month multipliers at 0.15: M 0.15 in Jul and Aug; A-Jul Jul 0, Aug 0.15; B0 Jul 0.61, Sep 0.58; Q0 Jul 0.75, Oct 0.72; Q1 Aug 0.45; Q2 Sep 0.45 | P10 0.10, P90 0.80 | 124 (34 on-phase in Jul, 51 in Aug); about 3,296-3,347 units per month at the current level = 0.24-0.25 % of window volume |
| 2027-08 | Europe | EV-064 summer shutdown | x0.625-0.645 (seasonality) | | 513 |
| 2027-10 | APAC / India | unlisted October dip / peak | 0.81-0.84 / 1.08-1.09 (seasonality) | | 511 / 517 |
| 2027-01, 2028-01 | LatAm | unlisted January dip | 0.85 (seasonality) | | 507 / 510 |
| 2028-08 | Europe | EV-068 | outside the window | | |

- No pre-buy multiplier: no announcement event is listed for 2027 or 2028.
- The price rises have no direct demand effect (SKU elasticity -0.19, se 0.36).

### 5.8 Macro paths and their implied multipliers

Cleaned values (MI, confirmed by MI.v):

| Indicator | Last-12-month mean | Window: start -> turning point -> end |
|---|---|---|
| PMI | 50.21 | 52.6 -> peak 53.1 (2027-01) -> 50.3 |
| AUTO YoY % | 2.32 | 1.9 -> 1.6 (2027-05) -> 2.6 (2028-01) -> 2.4 |
| Inventory days | 54.92 | 50.6 (minimum, 2026-11) -> 57.4 (2027-12) -> 55.8 |
| RAW | 104.22 | 91.8 (minimum) -> 98.2 (2027-12) -> 95.9 |
| Orders | 105.18 | 101.1 -> 98.8 (2027-03..04) -> 101.6 |
| UTIL | 79.61 | **83.8 (above the historical maximum)** -> 78.4 |
| FUEL | 90.79 | 96.5 -> 98.7 (2027-02) -> 92.6 (2027-07) -> 96.0 |
| EV index | 90.32 | 93.8 -> 94.6 (2027-01/02) -> 90.7 (2027-12) -> 91.9 |

The month-to-month volatility in the window is 2-3x lower than in 2025-26, and there are no planted shocks.

Implied multipliers against the last-12-month level (MI; MI.v variants in brackets):

- **Total:** 1.068 (2026-11) [1.041-1.080], 1.059 (2027-01), 1.040 (2027-04), 1.027 (2027-07), 1.019 (2027-10),
  1.006 (2028-01), 0.999 (2028-05); window mean 1.028 [1.011-1.036].
- **By family, window mean:** PMP 1.088 [1.044-1.114], HYD 1.047 [1.017-1.053], CSS 1.031, THM 1.031, PTC 1.008, BSS 0.998,
  ELA 0.982 [0.965-0.997].
- **By powertrain:** EV SKUs 1.102 (peak 1.205 in 2027-01), ICE 1.001, Universal 1.023, Aftermarket 1.001.
- **By primary driver** (MI.v variant A, mean): UTIL x1.108, RAW x1.096, PMI x1.066, AUTO x1.003, INV x0.987, FUEL x0.966,
  ORD x0.930.
- **EV factor alone, against the last-12 EV mean** (90.32): EV x1.14 (2026-11) -> x1.17-1.18 (2027-01) -> x1.03 (2027-10)
  -> x1.06 (2028-05); ICE x0.96 -> x0.95 -> x0.99 -> x0.98.

**Treatment.**

- Use the supplied paths as known covariates. Never feed raw indicator levels to trees: UTIL and EV lie outside the training
  range.
- Use `research/scratch/macro-indicators/v3/sku_macro_logmult_final.csv` (non-Aftermarket) and
  `v3/sku_macro_logmult_am_final.csv` (Aftermarket), multiplied by 1.10, **only** with that artefact. With a re-estimated
  capped / era-factor path, use gamma = 1.0.
- Do not freeze the macro level at the last 12 months. That is worth +2.8 % on average and +6.8 % in 2026-11.

### 5.9 Other window notes

- **Origin uplift from unconstraining.** The last 6 months are +0.24 % in aggregate, but large for single series: ELA-008
  India 2026-10 requested 167 against 76 shipped; CSS-006 Europe 157 against 74.
- **Do not add the 178 units back-ordered out of 2026-10** (16 rows) to 2026-11. Rule 7 asks for requested demand.
- **Spills sitting at the origin.** CSS-011 MEA 2026-10 has no stock-out record, so 2026-09 was an unlisted stockout.
  ELA-058 LatAm 2026-10 is the back-order of 2026-09.
- **One-offs at the origin inflate raw recent levels.** 95 on-phase orders in the last 12 months exceed 3x their series
  median. Examples: BSS-008 NA 2026-07 = 2,002 against 233-461 normally, with its next on-phase month 2026-09 missing;
  PMP-028 NA 2026-10 = 784; THM-032 EU 2026-09 = 752; PTC-054 India 2026-08 at 12.6x; CSS-036 NA 2026-08 at 9.3x.
- **PMP-040 LatAm 2026-09/10** (141 / 154) are back-order catch-up, not one-offs. Its demand is about 110-125.

---

## 6. Modelling implications

### 6.1 Target

- **Target = unconstrained requested demand** per series and month (business rule 7). Build it with the SU algorithm
  (section 7, step 7).
- Train and backtest against `demand_uc`, never shipped units.
- Mask, rather than impute, these cells in the training loss:
  - 837 on-phase missing rows;
  - 331 ERP cells;
  - D3 on-cycle cells;
  - one-offs (replace them by the model expectation);
  - COVID 2020-01/02..09;
  - pre-buy 2022-12..2023-02 for T1 + AM;
  - Nexon EU 2023-10/11;
  - Red Sea Export EU/MEA 2024-01..03;
  - lost-account tails;
  - EOL phase-out months (for level only);
  - ELA 2021-03..2022-09 for level and seasonality estimation, as a safety measure.
- Give imputed semiconductor cells a sample weight of about 0.7.
- **Model the latent monthly-equivalent scale, then convert to orders.** `order(t) = sum of latent months since the previous
  on-phase month` (0.5 weight on an annual-shutdown month, added to the following month); off-phase = 0; post-EOL = 0; lost
  accounts = 0.

### 6.2 Features (for the latent model)

- **Calendar.** Region x calendar month, channel x calendar month, a Thermal x month flag. No SKU or series seasonality.
  Holiday day counts `lny_days_apac` and `ramadan_days_mea` from `events-calendar/v03_moving_holiday_features_2019_2028.csv`,
  replacing fixed APAC Jan/Feb and MEA Feb-Apr indices.
- **Level.**
  - 24-36 months of de-factored, one-off-masked, unconstrained demand, as an **arithmetic** mean or smeared. A log-mean
    level biases aggregates by -3 to -10 % (MI.v).
  - The optimum window is flat across 18-36 months (DG.v): 24 at origin 2025-03, 30-36 at 2023-03 / 2024-03.
  - Post-switch months only for the 23 switch series. From 2025-10 (or rescaled by 1.24) for Helios India. Ramp-aware for
    series younger than 24 months.
- **Macro.** The SKU macro log-multiplier at each SKU's lag; for trees, as the change since the origin. Aftermarket uses the
  damped path plus FUEL@1. EV term `beta_pt x (EV_t - EV_ref)` at lag 0 and class level: EV +0.036..0.038, ICE
  -0.0116..-0.0117, Universal 0. Take EV_ref as the mean over the level window.
- **Lifecycle.** Months since **product** launch (not since window start), the ramp factor, months to EOL with the phase-out
  factor, MEA region age.
- **Events.** Helios step, Orion window, customer at time t, pre-buy / COVID / Red Sea / Nexon dummies (history only).
- **Static.** Family, BU, size class, powertrain, region, channel, sku_tier (core/tail) x region, log price, cycle kind and
  phase. The SBC intermittency class is for reporting only (Core requirement). Do **not** use raw SKU_ID, series id or
  customer name as categoricals (MF). Customer identity has no level effect (TS: customer effects within +-0.04).
- **Data-quality features.** Imputed share of the last 12 months; `was_censored`.

### 6.3 Model families (ranked)

1. **Structural multiplicative model (primary).** `latent = L x season(region, channel, family) x exp(gamma x lm_sku(t)) x EV
   factor x ramp x phase-out x events`, then cycle accumulation. This is the generator itself. It powers the what-if and the
   forecast X-ray, and it extrapolates where trees cannot.
2. **Global LightGBM, direct multi-horizon, on a ratio target** `y = units / (L x k)` with L2 or gamma objectives (both target
   the mean); sample weight = L x time decay; 5 seeds; no early stopping on the reported fold. Use it as a residual or
   second ensemble member trained on the **de-factored** target.
3. **Required baselines.** Seasonal naive; moving average; cycle-aware naive (mask x accumulation x 24-month level);
   Croston / SBA / TSB / ADIDA / IMAPA from `statsforecast` (installed); AutoETS / AutoTheta on aggregates.
4. **Equal-weight ensemble** of 2-4 members, a member kept only if it improves WAPE + |bias| in at least 3 folds.
5. **Not recommended**:
   - Tweedie / Poisson on raw rows as the main model (zeros here are deterministic);
   - L1 / quantile-0.5 / log-target objectives without smearing (a 3-10 % under-forecast);
   - recursive forecasting on raw orders;
   - per-SKU EV betas;
   - full MinT;
   - learned ensemble weights.

   Chronos-2 would need two pip installs plus 112-478 MB of weights in the conda env (MF section 10). That conflicts with the
   current no-install / 8 GB disk constraint, so treat it as an optional later experiment only.

### 6.4 Point forecast for WAPE + bias

- **Submit the conditional mean** of the one-off-free latent model, placed on the cycle.
- At most shade by c = 0.985 (TS: row WAPE -0.09 to -0.14, bias -1.5 %, aggregates +0.05 to +0.25).
- c = 0.965 (the median) gains 0.13-0.26 row-WAPE points but costs about 3.5 % bias and 0.4-0.9 points on family x month,
  region x month and total. MF's simulation gives the same: about 0.1 WAPE point for 3 % bias.
- One-offs: the WAPE-optimal forecast ignores them. A mean-unbiased one adds about +0.9 % overall (+1.2 % OEM / Tier-1).
- Round to the nearest integer. For series under about 3 units per order, test cumulative rounding.
- When the cycle phase is uncertain between two months, put the whole order in the more likely month. Splitting is worse
  whenever p > 0.5.

### 6.5 Quantiles (P10 / P50 / P90)

- Simulate NB order noise at the forecast mean with region k (section 4.10). Add a multiplicative level error with log sd
  about 0.05-0.06 at SKU level for a 12-24 month horizon; for 19-month series totals it is 0.128 even with the true macro
  path. Draw 1,000-2,000 paths per series.
- NB(region k) alone gave 8.3-8.9 % below P10 and 9.8 % above P90 when the factors were right (DG, DG.v).
- On average P10 = 0.64x and P90 = 1.39x the mean (NA about 0.67 / 1.35; MEA 0.57 / 1.58).
- Calibrate per horizon bucket and segment with split-conformal multiplicative scaling. Report coverage per fold, excluding
  structural-zero rows.
- Wider bands where structure is uncertain: Orion 0.10-0.80; few-day holiday months (table 5.7); cold starts x0.53-0.58 /
  x1.71-1.9; window macro hump x1.011-1.036 at family level.
- P50 sits about 3 % below the mean. Label the submitted mean "Forecast (submitted, mean)".

### 6.6 Reconciliation

- **Bottom-up sums of the mean forecasts** are coherent across SKU, family, region, channel, customer and total, and they are
  non-negative integers.
- Optional: align to family x region forecasts with diagonal WLS. Keep structural-zero rows fixed. Accept the alignment only
  if bottom-level WAPE + |bias| does not worsen and family x region improves in at least 3 folds.
- Quantiles at every node come from summed sample paths, never summed quantiles. Give the level error a shared component
  within family x region.

### 6.7 Backtest design

- **Rolling origin, expanding window, 19-month horizon.** Origins (MF):
  - A: 2025-03 (final check);
  - B: 2024-10, C: 2023-10, D: 2022-10 (October-aligned like the real task);
  - E: 2021-10 (optional stress; contains the shortage; score against unconstrained demand).
- Refit everything data-dependent per fold: cycle and phase, lost-account flags, levels, seasonal indices, macro paths,
  encodings.
- Use actual macro values for target months (that mirrors the task).
- Report WAPE, bias and WAPE + |bias| by family, region, channel, horizon month, horizon bucket and calendar month, at
  series, SKU, family x region and total level.
- **Report bias by calendar month as well as horizon.** At one origin the two are confounded, and baseline bias flips sign
  between origins.
- Report metrics with and without lost accounts and one-offs (the 2025-03 window contains all 16 losses: 0.59 % of volume,
  29.4 % vs 28.8 % WAPE).
- **Leakage check.** Compute the in-sample floor on your own scoring set. "< 0.24 = leakage" is set-specific: an honest
  oracle run scored 0.2373 on another set whose floor was 0.224.

### 6.8 Baseline accuracy already measured (19-month horizon unless stated)

| Who | Set / origin | Method | WAPE | Bias | Aggregate |
|---|---|---|---|---|---|
| DG | 2025-03; 53,516 cells of 2,828 series with >= 24 months; target unconstrained | last-12-month mean | 0.503 | +5.6 % | fam x month 0.104 |
| DG | same | seasonal naive | 0.365 | +5.8 % | 0.098 |
| DG | same | cycle-aware, last-12 mean, no seasonality | 0.285 | +4.5 % | 0.092 |
| DG | same | cycle-aware x latent seasonal, 12-month level | 0.280 | +5.8 % | 0.086 |
| DG | same | ... one-off-masked seasonally adjusted level, 12 / **24** / 30 / 48 months | 0.276 / **0.261** / 0.266 / 0.287 | +5.7 / **+1.3** / +0.7 / +0.5 % | 0.085 / **0.054** / 0.054 / 0.065 |
| DG | same | structural, macro level frozen at last 12 months, 24-month level | 0.268 | +4.9 % | 0.080 |
| DG | same | structural with the **true family macro path**, 24-month level | **0.249** | -0.9 % | **0.018** |
| DG | same | in-sample fit (noise floor) | 0.240 | -1.7 % | 0.020 |
| PZ / PZ.v | 2025-03, 2,828 series | flat mean of last 12; seasonal naive; cycle mask x accumulation x 12-month level | 0.506; 0.369-0.370; 0.289-0.290 | +5.7 to +6.9 % | |
| PZ.v | 2024-03 / 2023-03 | cycle-aware | 0.283 / 0.295 | **-6.3 % / -3.3 %** | |
| TS / TS.v | 2025-03, 2,828 series, excl. lost accounts | flat mean / flat median / seasonal naive / mask x mean order / + accumulation 12 m / + accumulation **24 m** | 49.8 / 46.8 / 35.9-36.1 / 29.3 / 27.7-28.1 / **26.3-26.5** % | +5.1 / -8.2 / +4.9-5.3 / +5.2 / +4.3-5.1 / **-0.05 to +0.8** % | fam x month 7.30-7.36 % (24 m) |
| TS | noise floor, monthly series | volume-weighted MAD after removing the region x month factor | 22.8 % (TS.v 23.8 %, one-offs included) | | |
| MI / MI.v | 2025-03 and 2024-03, monthly series, 12-month level | none -> SKU macro path (x1.10) + Aftermarket terms | 0.2585 -> 0.2352; 0.2559 -> 0.2439 (MI.v: 0.2629 -> 0.2448, 0.2529 -> 0.2432) | +6.2 -> -0.1 %; -4.1 -> -1.1 % | fam x month 0.084 -> 0.018; 0.075 -> 0.026 |
| MI.v | same | single-driver vs shrunk 3-driver SKU path | 0.2466 vs 0.2432 (2024-03 W12); 0.2491 vs 0.2453 (2025-03 W12) | | gamma 1.0 / 1.1 / 1.2 within 0.0005 |
| DG.v | oracle factors, 1,435 full-history M / A series | level window 12 / 18 / 24 / 30 / 36 / 48 / 60 / 75 at 2025-03 | 0.2422 / 0.2385 / **0.2373** / 0.2387 / 0.2410 / 0.2444 / 0.2454 / 0.2489 (floor 0.2242) | | 2024-03 best 36 (0.2420); 2023-03 best 30 (0.2511) |
| LM / LM.v | 497 non-MEA launch series, next 19 months from the first n | mean of history vs ramp-aware (+ base) vs + shrink to prior, n = 2 / 3 / 6 / 9 | 0.754 / 0.472 / 0.287 (n = 2); 0.531 / 0.282 / 0.229 (n = 6); LM.v 0.747 / 0.434 (n = 2), 0.528 / 0.233 (n = 6) | -73 % mean vs -9 to -7 % ramp (n = 2) | |
| LM | 30 successor series | cross-sectional prior vs predecessor mean vs predecessor x1.4 | 0.19 / 0.40 / 0.29 | prior -13 % | |
| SU / SU.v | 4,308-4,314 listed semiconductor rows, leave-one-out | shipped; u/(1 - depth); (u + 0.5)/fill_hat | 33.8 %; 11.0 %; **5.3 %** (oracle 0.88 %) | -33.8 %; -3.1 %; -0.2 to -0.3 % | |
| NR / NR.v | 1,020 (1,321 with 2021) hidden LatAm AM / EXP positive months | mean of positive months within +-12 | 28.9 % | -1.1 % (-5.6 % incl. 2021) | |
| PZ / PZ.v | 4,000 hidden on-phase orders | zero fill / mean of 2 neighbours / median of neighbours / local level x regional index | 1.000 / 0.346 (0.306) / 0.306 (0.270) / **0.259 (0.257)** | -100 % / +0.6 % / -2.2 % / -1.9 % (-3.2 %) | |
| MF | simulation, NB-like noise | forecast = median vs mean, order of 30 / 60 / 150 units | 0.2574 vs 0.2585 / 0.2365 vs 0.2374 / 0.2227 vs 0.2236 | -3.3 % vs 0.0 % | |

---

## 7. Cleaning-pipeline specification

### 7.1 Ordered steps (one command: `make all`)

0. **Load raw.** Read every raw CSV with `dtype=str, keep_default_na=False`. Record SHA-256 of `data/raw/*` and assert it is
   unchanged at the end. Never write to `data/raw`.
1. **Keys.**
   - `rec_num = int(Record_ID[4:])`.
   - Parse Date (7 regexes); fix `2062 -> 2026`; assert equality with `month(Load_Timestamp) - 1` on every row.
   - Drop raw Year/Month and recompute them.
   - Canonicalise SKU_ID, Region, Sales_Channel and Customer_Name with the mapping CSVs. Unknown values raise.
   - Family, BU and Description come from the SKU prefix and the corrected master.
2. **De-duplicate.** Sort by (Record_ID, Load_Timestamp, raw_row) and keep the last. Write `dedup_decisions` with 2,946
   exact copies and 736 superseded loads, holding first and final units.
3. **Decode and assert.**
   - Join `record_id_blocks.csv`; SKU / Region / month := the decoded values.
   - Assert agreement with the labels except 745 blank regions and 30 typo dates.
   - Assert 244,566 unique (Date, SKU, Region) keys. 0 collisions are allowed.
4. **Grid.** Reindex to 245,548 cells and flag the 982 missing cells (`missing_row`). Months outside a block are "not on
   sale", not missing.
5. **Prices.** Build the canonical price table: mode per SKU x period (2022 split H1 / H2); invoice = list x 1.06 in 2022-H2.
6. **Numeric classification and fixes** (section 2.2 precedence).
   - Compute `q`, then `k`.
   - Assert every row is in one of the 15 states, units are non-negative integers, and `revenue == units x invoice price` to
     the cent.
   - The ERP rule (N12) and the pack rule (N11) are **row-level**.
7. **Stockout overlay and unconstrained demand** (SU algorithm; reference `p40_build_unconstrained.py`).
   - (0) `Units_Sold := Shipped_Units` on listed cells. This fills 26 missing rows, 1 ERP blank and 42 pack rows exactly.
     Test: equals cleaned units on 5,761 rows.
   - (S1) Listed month: demand = Requested_Units (5,830).
   - (S5) Unlisted ELA cell in 2021-03..2022-09 (1,925): `max(0, round((u + 0.5) / fill_hat) - Backordered(t-1 if listed))`,
     0 if u = 0. `fill_hat = clip(1 - depth(month) x severity(series), 0.15, 0.98)`;
     `severity = sum(sf x depth) / sum(depth^2)` over the series' listed months, or 1.0 if fewer than 2 are listed
     (`semi_depth_by_month.csv`, `semi_severity_by_series.csv`).
   - (S2) Unlisted month after a back-ordered month with `u >= B(t-1)` (1,034): demand = `u - B(t-1)`.
   - (D3) Same with `u < B(t-1)` (14): 0 if off-cycle, else missing.
   - (D2) An unlisted month followed by a listed month with `Carried_In = c > 0` (62): demand =
     `u + (ceil(2.5c) + ceil(2.5(c+1)) - 1) / 2`.
   - (D1) Phantom off-cycle order in a period-2 / period-3 cycle with the previous month unlisted (29 + 29): move it back as
     a shortfall, and set the phantom month to 0.
   - Remaining off-phase spill (38 with no record) -> 0 demand, and flag t-1 as an unlisted stockout.
   - The 4 missing cells after a listed back-order (THM-041 MEA 2022-03, CSS-031 AP 2022-06, PTC-078 India 2024-09,
     HYD-012 MEA 2025-05): impute demand only, no carry.
   - S2 cells below about 0.35 x local level: flag as suspected hidden second-month stockouts and down-weight.
8. **Ordering cycle** (template segmentation on `o_t = 1[demand > 0]` over the 16 patterns plus young-series priors, as in
   `series_table.csv`).
   - Detect the 27 cycle changes, recording the window.
   - Lost accounts: >= 6 trailing silent months on a live SKU (exactly 16).
   - Customer-at-time table: 23 switches.
9. **Missing-row and blank treatment** (from the cycle):
   - off-phase or lost-run cells -> 0 (119);
   - listed -> Shipped / Requested (26);
   - on-phase -> NaN with mask (837);
   - ERP 331 -> NaN with mask, positive;
   - CSS-062 LatAm 2023-03 -> spill.

   Display / lag imputation: local level x regional calendar index (`v23_impute_experiment.csv` evidence). Cycle-aware;
   never the series mean in an off-phase month.
10. **Anomaly flags.**
    - One-offs on the unconstrained, phase-aware expectation (>3.5x, or >3x with OEM / T1 and mu >= 25), after a first-pass
      fit; two passes against masking.
    - Event masks and dummies (section 6.1); MEA and launch ramps; EOL phase-outs; holiday day counts.
    - The register (episode + cell level) with impact in units and USD.
11. **Macro.** Write `macro_clean.csv`: drop line 43, x100 AUTO 2019, PMI 2023-05 -> 47.9, RAW pre-2022 / 1.25, 5 blanks ->
    neighbour mean. Log 56 cells + 1 row.
12. **Master.** PMP-004 BU -> Advanced Manufacturing; BSS-018 effective launch 2025-02.
13. **Outputs.** `train_clean` (one row per Date-SKU-Region, 245,548 grid cells with flags), `demand_uc`, `fix_log` (one row
    per changed cell: rule, raw string, before, after, evidence, oracle match), `dq_report.json` (before / after per check
    and per rule, GE / ODCS-shaped; MC section 5), `anomaly_register`, `manifest.json` (hashes).
14. **Tests** (MC section 6.4), as pytest:
    - **T1** schema.
    - **T2** invariants: grid 245,548 = 244,566 + 982; one row per key; revenue identity; off-phase zeros are 0, missing
      stays NaN.
    - **T3** oracle: 5,761 / 5,761; 17 / 17 restatements; stock-out identities at 100 %.
    - **T4** rule fixtures including adversarial look-alikes: a reconciling x8 one-off stays; a pack row keeps its revenue.
    - **T5** generator-mirroring corruption-recovery: inject each error type, expect 100 % exact recovery.
    - **T6** idempotence / metamorphic.
    - **T7** golden sample.
    - **T8** hide-and-recover for detectors and imputers.
    - **T9** output contract: 58,219 rows, P10 <= P50 <= P90, hierarchy adds up.
    - **T10** reproducibility: two runs give identical hashes.

### 7.2 Reusable artefacts to lift (all under `/home/pavan/Desktop/mks/research/scratch/`)

| Purpose | Path |
|---|---|
| Canonicalisers (`canon_region`, `canon_channel`, `canon_sku`, `canon_customer`, `pdate`, prefix -> family / BU) | `labels-keys/lk_common.py` |
| One-command key cleaner with asserts and `decode_record_id()` | `labels-keys/build_clean_keys.py`; alternative reference `dates-dups/build_keys_reference.py` (DD.v matched it record for record) |
| Record_ID block table (**use this, not the closed formula**) | `labels-keys/record_id_blocks.csv` (3,083 rows); grid `dates-dups/record_id_grid.parquet` |
| Label maps | `labels-keys/map_region.csv`, `map_sales_channel.csv`, `map_sku_id.csv`, `map_customer_name.csv`, `map_product_family.csv`, `map_business_unit.csv`, `map_sku_description.csv`, `ref_prefix_family_bu.csv` |
| Key DQ counts | `labels-keys/keys_dq_summary.json`, `labels-keys/label_corruption_summary.csv`; `dates-dups/date_repairs.csv`, `dates-dups/dedup_decisions.csv` |
| Missing cells | `labels-keys/missing_rows_from_record_id_gaps.csv` (982); `panel-missing-zeros/missing_rows.csv` (with phase and treatment) |
| Numeric diagnosis, price table, issues | `numeric-reconcile/14_build_diagnosis.py`, `row_diagnosis.parquet`, `canonical_price.csv`, `issue_summary.csv`, `price_increase_by_sku.csv` |
| One-off lists (cross-check only) | `demand-dgp/oneoff_orders_dgp.csv` (541, phase-aware); `numeric-reconcile/oneoff_orders.csv` (438); `numeric-reconcile-verify/s_oneoff_doubtful.csv` (60 to keep) |
| Unconstrained demand | `stockouts-unconstrained/p40_build_unconstrained.py`, `unconstrained_demand.parquet`, `semi_depth_by_month.csv`, `semi_severity_by_series.csv`, `hidden_stockouts_detected_register.csv`, `d4_suspected_unlisted_stockouts.csv`, `train_cells_recoverable_from_stockout_file.csv`, `train_vs_shipped_validation.csv`, `lost_by_*.csv` |
| Cycles, masks, priors | `panel-missing-zeros/series_table.csv`, `test_phase_mask.csv` (use `p_order`, `ramp_factor_tau4p5`; **not** `k_accum_months` as a multiplier), `cycle_changes_detail.csv`, `v20_cycle_prior_new_series.csv`, `v20_young_series_posterior.csv`, `v06_offphase_nonzero.csv`, `v08_region_month_index_M.csv` |
| Lost accounts and switches | `labels-keys/long_zero_runs_lost_accounts.csv`, `labels-keys/customer_switches.csv`, `test-structure/customer_switch_effects.csv`, `test-structure/lost_accounts_state.csv` |
| Macro | `macro-indicators/macro_clean.csv`, `macro_change_log.csv`, `v3/sku_macro_logmult_final.csv`, `v3/sku_macro_logmult_am_final.csv`, `v3/sku_macro_drivers_final.csv`, `window_multiplier_paths.csv`, `ccf_yoy.csv` (lead/lag heatmap) |
| Events | `events-calendar/events_tidy.csv`, `events_month_exposure.csv`, `events_register_final.csv`, `v03_fw_event_multipliers.csv`, `v03_moving_holiday_features_2019_2028.csv`, `orion_na_2027_series.csv` |
| Lifecycle | `lifecycle-master/sku_master_clean.csv` (corrected BU and launch; **do not use its `ev_beta_*` columns**), `lifecycle_test_rules.csv` (replace its flat 0.60 EOL factor), `cold_start_forecast_prior.csv`, `young_launch_levels.csv`, `lifecycle_anomaly_register.csv` |
| DGP parameters | `demand-dgp/dgp_parameters.csv`, `seasonal_components.csv`, `seasonal_profile_region_absolute.csv`, `noise_by_region.csv`, `series_level_table.csv`, `ipf_*.csv`, `holdout_scores*.csv` |
| Test-window state and contract | `test-structure/series_state.csv` (3,068 x 89, risk groups), `sku_tiers.csv`, `test_expected_zero_rows_by_month.csv`, `orion_na_event_series.csv`, `validate_submission.py`, `reference_naive_submission.csv` (sanity only) |
| Dossier checks | `dossier/d01_eol_phaseout.py` and `d01_eol_phaseout.log` |

Caveat on lineage: several artefacts were built on `data/interim/train_rough.parquet`, which is untrusted. Their key and
numeric outputs were re-derived from raw by the skeptics and match. The production pipeline should rebuild from raw rather
than depend on the rough parquet.

---

## 8. Dashboard recommendations (brief; DB)

### Stack

- A static single-page app: React + TypeScript + Vite, Apache ECharts 6 (tree-shaken), TanStack Table, and the URL hash as
  the single filter store.
- It reads pipeline-generated JSON from `dashboard/public/data/`. Measured payloads: history grid 0.27 MB gzipped, forecast
  quantiles 0.19 MB.
- Host on GitHub Pages, with a Cloudflare Pages mirror. Neither sleeps, so there is no cold start for judges. Streamlit
  Community Cloud sleeps after 12 h and Render after 15 min.
- Local run: `python -m http.server -d dashboard/dist` (no Node needed). Check disk before `npm ci`; `node_modules` is a few
  hundred MB.

### Must-haves

- **One timeline component.** History solid, unconstrained demand dashed where censored, a "now" rule at 2026-10, the mean
  forecast labelled "submitted", P50 dotted, a P10-P90 fan, a hatched forecast zone, an event lane, and missing months as
  hollow "imputed" markers.
- Shared cascading filters: family, SKU, region, channel, customer.

### Correctness rules

- Aggregate quantiles come from summed sample paths: a precomputed lattice of 2,414 nodes x 57 numbers.
- WAPE = sum |e| / sum a over the selection, never an average of series WAPEs.
- Every number comes from pipeline files. A CI test checks that dashboard totals equal `submission.csv`.

### Standout features, ranked by impact over effort

1. **Ordering-cycle lens.** "Orders as booked / latent demand" toggle; off-phase zeros explained. This is the clearest
   originality.
2. **Deterministic planner briefing.** Templated sentences on pipeline facts.
3. **Backtest time machine + forecast-value-added stairstep**: naive -> seasonal naive -> cycle-aware -> model, against the
   noise floor.
4. **Forecast X-ray.** A multiplicative waterfall of the generator factors.
5. **Exception inbox.** Lost accounts, Orion, EOL / cold starts, recent switches, tracking signal; ranked by revenue at risk.
6. **What-if.** Model-consistent per-SKU elasticities and lags, e.g. PMI -3.
7. **Cell-level lineage drawer** from the fix log.
8. **Story mode.**

Optional views to include: lead/lag heatmap (`ccf_yoy.csv`, per-SKU drivers), stockouts & lost sales (about 112k units /
USD 114M, ELA about 70 % of units), procurement from P90 (lead-time cover from summed paths), lifecycle Gantt, data download.

---

## 9. Unresolved questions and conflicts, ranked by expected impact on forecast accuracy

### 9.1 Open questions with a proposed experiment

| Rank | Question | Exposure | Proposed experiment |
|---|---|---|---|
| 1 | **Size of the macro hump** (gamma, saturation form, UTIL vs ORD attribution). Variants give total x1.041-1.080 in 2026-11 and a window mean of x1.011-1.036; PMP x1.044-1.114. UTIL-primary SKUs reach x1.22-1.25 at the window start | +-2 % on all volume early in the window; +-3-4 % on HYD / PMP / PTC | Rolling-origin backtest (origins B, C, D + A) of: (i) the MI artefact x1.10; (ii) a re-estimated shrunk 3-driver path with soft cap + 2021-22 era factor at gamma 1.0; (iii) a calm-era-only fit. Use fold-specific seasonal factors (no full-sample leak). Pick by mean and sd of family x month WAPE and bias. Separately, posterior driver probabilities for the about 36 UTIL- and 115 ORD-primary SKUs |
| 2 | **Scoring formula** (row WAPE vs aggregated vs bias-weighted) and therefore mean vs median | c in [0.965, 1.0]: up to 0.26 row-WAPE points against 0.9 aggregate points and 3.5 % bias | Not testable. Submit the mean (c = 1.0, or 0.985 at most). State the convention in the README |
| 3 | **Level estimator**: window 24 vs 30-36 months, arithmetic vs log, de-factoring with which factors | 0.5-1.5 WAPE points; -3 to -10 % aggregate bias if log-mean | Same rolling-origin harness; grid W in {18, 24, 30, 36} x {arithmetic, smeared}; choose by mean across folds |
| 4 | **Holiday functional form for few-day months**: MEA 2027-03 (9 days), 2028-01 (4 days); APAC 2028-01 (6) / 02 (4). The Ramadan depth 0.24-0.32 has no Ramadan-free March in data; 2024-03 is masked by the Red Sea catch-up | +-4-10 % on 7 MEA months (9.1 % of volume) and 2 APAC months | Leave-one-year-out on 2022-2026 with linear event-share, day-share, sqrt and convex forms, after modelling Export MEA 2024-01..03 explicitly. Use the LOYO-best form for P50 and the spread across forms for P10 / P90 |
| 5 | **Are one-offs part of the hidden truth?** 0.92 % of demand (1.23 % of OEM / Tier-1) | Bias about -0.9 % if ignored | Not testable. The WAPE-optimal choice ignores them; if bias weighs heavily, add +1.2 % to OEM / Tier-1 means |
| 6 | **Do the 16 lost accounts stay lost, and does the generator place no new losses / switches / cycle changes in the window?** At historical in-window rates: about 30 losses, 12.5 switches, 23 cycle changes | 304 rows, about 19,200-19,600 units (0.7 %); ranges more than point | Not testable. Keep 0 and no hazard. Show the scenario band in the dashboard |
| 7 | **Orion x NA 2027-07/08 magnitude.** Strike analogue x0.14-0.15 (EC, DG.v); TS uses 0.2 (range 0.15-0.25); EC.v notes 0.3-0.4 minimises the worst case under a 50/50 prior; DG's alternative is shutdown-zero + 0.5 catch-up | 124 rows, about 0.24-0.25 % of window volume | Not testable from data. Use 0.15 on latent demand (same `Customer Event` type and "shut" wording as EV-038), P10 0.10 / P90 0.80, and publish the scenario toggle |
| 8 | **EV response beyond the observed index** (window peak 94.6 vs history max 93.1) and the ICE plateau slope (-2.0 +- 0.3 %/pt on 2024-12..2026-10 vs -1.16 to -1.19 full sample) | EV SKUs 9.8 % of volume, +-2-3 points at the peak; ICE about 13 % of volume, about 2 % if the plateau slope is right | Backtest the class-level beta fitted on the full sample vs post-2023 at origins B and A for EV / ICE subsets |
| 9 | **Aftermarket damping** 0.42 (MI, 430 series incl. cycle series) vs 0.37 (MI.v, 177 monthly series); era gamma 0.91-1.18 | About 17 % of cells; about 0.4 % of the 2026-11 hump | Refit on cycle-aware latent demand of all Aftermarket series; backtest both values |
| 10 | **Cold-start level** (LM L vs tail-tier medians vs DG formula; mean x1.10-1.13 vs median) | 117 rows, about 0.2 % of volume (about 4,100 units) | Leave-launch-out on the 625 historical launch series using only static attributes at launch; compare the three priors on WAPE and bias of months 0-18 |
| 11 | **EOL phase-out shape** (section 4.11) | 108 phase-out rows + rows at m 12..6 for THM-001 / PMP-003; about 900-1,500 units | Repeat `d01_eol_phaseout.py` with a family x region ICE control and bootstrap CIs. The window EV index is flat, so the ICE control is the relevant one |
| 12 | **Helios India step start and size**: from 2025-09 (DG.v) or 2025-10 (EC; 2025-09 at about x1.12-1.14); size 1.24 (EC, DG.v), 1.25 (LK.v), 1.27-1.29 (TS / TS.v, different control) | 2.8 % of volume, +-2-4 % | Fix the size at 1.24 with the level from 2025-10. Backtest at origin A whether including 2025-09 at 1.12 helps |
| 13 | **Young-series cycles** (3 single-zero A masks) and **per-SKU ramp tau** (not identifiable; split-half r 0.26) | 18 series, about 0.23-0.5 % of volume | Posterior p_order is already the right tool; no extra experiment |
| 14 | **Hidden operational stockouts** (about 310 undetectable months, about 5.4k units) and S2 hidden second months (about 80) | About 0.05 % of units; small downward level bias | Robust loss / down-weighting; hide-and-recover test for D1-D3 |
| 15 | **RAW re-basing K** (1.25; 1.21-1.26) | Sensitivity of about 21-24 RAW-driven CSS SKUs only; window values unaffected | Sensitivity runs at 1.22 / 1.26 |

### 9.2 Conflicts between reports and how they were resolved

| Topic | Reports | Resolution |
|---|---|---|
| India pack-of-10 rule | DD F17: x10 units **and revenue** for the whole region x channel x month cell; NR: row-level, revenue unchanged | **DD.v refutes DD F17** (it would inflate the cell's revenue from 13.6 M to 136 M and corrupt 6 + 1 non-pack rows). Use NR's row-level rule (q = 10). NR.v's "recompute revenue = units_fixed x canonical" yields the same number as keeping the raw revenue |
| One-off masking | NR: replace by the median of 6 neighbours | **NR.v refutes it as written** (fails at back-order catch-up, cycles, COVID, level steps). Use DG's phase-aware unconstrained expectation |
| Helios step | DG x1.19 | **Refuted by DG.v** (region-factor contamination): x1.24. EC's per-series heterogeneity and shrink rule refuted by EC.v |
| Nexon strike | DG x0.27 / x0.20 with partial recovery | **Refuted by DG.v**: x0.145 / x0.138, no catch-up (EC, PZ agree). LK.v's x0.21 and TS's x0.25 / 0.18 are sums or include cycle series, where accumulation dilutes the effect |
| EOL phase-out factors | PZ 0.50 / 0.57 / 0.40 / 0.27 (vs 13-30 m base); LM flat x0.60; LM.v graded 0.90..0.42; PZ.v 0.92..0.32; TS 0.85..0.37; TS.v 0.80 from m -12; LK.v 0.28 in the EOL month | My ICE-controlled check: the decline is concentrated in the last ~6 months; about half of TS.v's early decline is the ICE EV trend. Use LM.v / PZ.v graded factors on a recent level (section 5.3). PLAUSIBLE |
| EV betas | LM per-SKU betas "real" | **Refuted by LM.v** (split-half r 0.06 / 0.12). Class level only. Universal 0 is a normalisation |
| EV window path | DG.v: "91.2 ... 94.6 (2027-05) ... 90.7 (2028-01)" | **My raw check**: 93.8 (2026-11), 94.6 (2027-01 and 02), 90.7 (2027-12), 91.9 (2028-05). MI and LM are right; DG.v's magnitudes (x1.055 peak, x0.918 trough vs 2026-10) are right, its months are not |
| Launch ramp | LK pooled ramp table; PZ tau 6 (first pass); uncontrolled fits tau 9-10 | **LK.v**: do not use the pooled table (it mixes EV growth with ramp). tau 4.5-4.75 with an EV control. **LM.v**: no ramp for series that start in 2019-01 |
| Macro x1.10 | MI: scale the window by 1.10 | **MI.v**: valid only with MI's log-linear artefact. With a capped / era-factor re-estimate use 1.0. The hard cap 1.40-1.45 and the 0.40 floor are not supported (soft cap better; floor worse). The single-driver reading must not be imposed |
| Aftermarket damping | MI 0.42 | MI.v 0.37 +- 0.015 on monthly series; open (9.1 #9) |
| Backtest bias | PZ: "every simple method is 6 % too high" | **PZ.v**: origin-specific (-6.3 % at 2024-03). Do not de-bias |
| `k_accum_months = 1.5` | PZ artefact column | **PZ.v**: a count, not a multiplier. Use own + 0.5 x shutdown month |
| Mid-history 8-month zero runs | LK (BSS-057 LatAm, ELA-052 India) | **LK.v**: artefacts of blank units. No internal silence > 5 months on cleaned units |
| Lost-account level PMP-022 India | LK 470.2 | **LK.v**: 49.4 (a raw x100 error) |
| ERP blank counts | LK 391 (128 / 135 / 128 raw); SU 145-147 per month; LM 392 | 380 IDs with units **and** revenue blank (126 / 126 / 128); 391 IDs with blank units in the window (380 ERP + 11 ordinary recoverable). SU.v, LM.v |
| LNY depth / APAC base | EC 0.305, base 1.035-1.04 | **EC.v**: 0.28 (0.26-0.30), base about 1.0-1.02; estimate it, do not hard-code. DG's per-day form gives x0.708 for 10 days |
| "Four unlisted regional months" | EC | **EC.v**: at least six more stable cells. Use a full region x month seasonality |
| Surcharge exceptions | EC: 259 "cents-type errors" | **EC.v**: 46 cents rows + 213 correct rows of 16 SKUs launched in 2022-H2 |
| MEA ramp tau | LM 6.25; LM.v 5.75; EC 5.9; DG about 6; PZ 4.8-5.7 | 5.75-6.25 for history de-ramping only; no forecast impact |
| Tail-tier LatAm discount | TS: none; LM: 15-20 % below | **TS.v**: about 0.90 |
| Level window | DG: 24 optimal; TS: 24 best | **DG.v**: flat 18-36, origin-dependent. Use 24-36 |
| Leakage threshold | DG: "< 0.24 = leakage" | **DG.v**: set-specific; compute your own floor |
| Noise k | DG 19.7..8.5 | DG.v 10-15 % lower except MEA; use DG's values +-15 % (they calibrate) |
| Aftermarket pre-buy | NR: Tier-1 volume-neutral; EC: nets out overall | **NR.v**: Aftermarket net +8 % of a November in Dec-Feb 2023, no March payback. Masked in training either way |
| Pre-loss lost-account volume | 1,009 (LK.v, PZ), 1,010.5 (LM.v), 1,032 (TS) units per month | Definitions differ (cleaned units, monthly-equivalent level). Use about 1,009-1,032 |
| Blank-region breakdown | LK per raw row | **LK.v**: per ID 137 / 133 / 133 / 131 / 113 / 90 |
| Core SKU feature | DD: test `core_sku` | **DD.v**: no level, zero-share or channel signal. TS shows the core tier changes the **regional profile** (LatAm about 0.46 in core) and cycle mix, so use `tier x region`, not a plain core flag |

### 9.3 Files

- All 23 required reports existed and were read in full: 10 investigator reports, 10 skeptic reviews (none missing) and 3
  research reports.
- New files from this merge:
  - `research/DATA_DOSSIER.md` (this file);
  - `research/scratch/dossier/d01_eol_phaseout.py` and its output log `d01_eol_phaseout.log` (EOL phase-out with an ICE-only
    control).
- The EV-index window check was run inline on `data/raw/macro_indicators.csv`. No raw file was modified.
