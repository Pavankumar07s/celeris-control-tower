# Skeptic review of lens `stockouts-unconstrained` (`research/stockouts-unconstrained.md`)

**Bottom line.** I could not refute any finding. I recomputed everything with new code from `data/raw/*.csv`: my own date tokeniser, Record_ID-block decode of SKU and region, latest-load de-duplication, units classifier and unconstrained-series builder. I did not import any of the investigator's scripts. The supply arithmetic, the back-order carry, the semiconductor coverage and depth-x-severity model, the imputation accuracy, the lost-sales totals and the forecast-origin numbers all match the report, in most cases to the unit. **Two findings need corrections.** F6: the run-length counts are wrong for operational rows. F8: the ERP blank-cell counts do not reproduce, and the zero/positive split of those cells is missing. Neither changes a cleaning rule much. I also closed the report's open question 1. ELA demand during the shortage is **not** inflated by allocation: the level is smooth across both window edges and not related to series severity. So `Requested_Units` can be used as true demand.

**Tally:** 7 confirmed, 2 partially confirmed, 0 refuted. One sub-item was not checked: the D4 likelihood detector, which is register-only and changes no data.

Scripts are in `research/scratch/stockouts-unconstrained-verify/` (working files, not included in the repository):

| Script | What it does |
|---|---|
| `v00_build_panel.py` | Independent clean of train into `panel_v.parquet` |
| `v01_identities.py` | Stockout file format checks and identities |
| `v02_train_vs_shipped.py` | Train units vs `Shipped_Units` |
| `v03_backorder_carry.py` | Back-order carry into the next month |
| `v04_semi.py`, `v05_semi_impute.py` | Semiconductor shortage: coverage, depth, severity, imputation |
| `v06_operational.py` | Operational stockouts and the D1/D2/D3 detectors |
| `v07_events.py`, `v11_redsea_yoy.py` | Red Sea, ERP, COVID |
| `v08_misc.py` | Residual structure and forecast-origin numbers |
| `v09_build_uc.py` | Independent rebuild of the unconstrained series and lost sales |
| `v10_runs_d1.py` | Run lengths and D1 comparison |
| `v12_ela_ratio.py` | Open question 1 |
| `v13_master.py` | Lifecycle checks |
| `v14_s2_hidden.py` | Hidden second months among S2 cells |

`midx` means months since 2019-01.

---

## Verdicts

| # | Finding | Verdict |
|---|---|---|
| 1 | Stockout file formally clean; 825 all-zero rows | **confirmed** |
| 2 | Exact accounting identities (floor fill, 0.4 back-order, semi B = 0, Fill_Rate_Pct is the latent fill) | **confirmed** |
| 3 | Cleaned train `Units_Sold` == `Shipped_Units`; file validates the cleaning | **confirmed** (two wording fixes) |
| 4 | Next month's sales contain `Backordered(t)` exactly | **confirmed** |
| 5 | Every ELA cell 2021-03..2022-09 constrained; 69% listed; depth x severity imputation | **confirmed** |
| 6 | Operational stockouts random, ~79% listed; D1/D2/D3 exact detectors | **partially_confirmed** (run counts wrong; D4 not checked) |
| 7 | Lost / delayed sales tables | **confirmed** |
| 8 | Red Sea, ERP and COVID are outside the stockout file | **partially_confirmed** (ERP counts wrong; Red Sea multipliers refined) |
| 9 | Exact unconstrained-demand algorithm and forecast-origin effect | **confirmed** |

---

## Evidence per finding

### F1. File formally clean — confirmed (`v01`, `v13`)
- The file has 5,830 rows and 11 columns, with 0 blank cells in every column.
- Dates: 100% `YYYY-MM`, 94 months from 2019-01 to 2026-10. SKUs: 100% `AAA-999`, 520 of them. Regions: exactly the 6 canonical labels.
- Reasons: Semiconductor 4,314; Logistics 391; Supplier quality 381; Capacity 377; Tooling 367.
- Duplicates: 0 duplicate rows and 0 duplicate keys.
- Impossible values: 0 negatives, 0 rows with Shipped > R + C, 0 rows with Fill > 100. Fill ranges 15.0..98.0 and Stockout_Days 1..25.
- Lifecycle: 0 SKUs missing from the master, 0 rows before launch, 0 after EOL, 0 MEA rows before 2022-01, 0 rows outside the series' train span.
- Zero requests: `Requested = 0` on 870 rows. 825 of these are all-zero and 45 hold only carried-in units.
- The natural zero share of unlisted, non-shortage train cells is 14.74%, so the 14.9% zero-request share is consistent with stockout flags drawn independently of demand.

### F2. Accounting identities — confirmed (`v01`)

| Identity | My count |
|---|---|
| `Lost = R + C - Shipped - B` | 5,830 / 5,830 |
| `C(t) = B(t-1)` on consecutive listed pairs | 3,108 / 3,108 |
| Contradictions (C = 0 after a listed B > 0, or C > 0 after a listed B = 0) | 0 |
| `floor(f x D)` feasible with f inside the 0.1-point interval of Fill | 5,005 / 5,005 |
| `round()` feasible | 2,608 (52.1%) |
| `floor` with the printed Fill exactly | 4,946 |
| Documented `Fill = Shipped / D` equal at 1 decimal | 115 / 5,005 (2.3%) |
| Documented fill off by more than 1 point | 2,945 (58.8%); max difference 93.4 |
| `B = floor(0.4 S)`, operational rows | 1,516 / 1,516 (`round(0.4 S)` only 956) |
| `B = 0`, semiconductor rows | 4,314 / 4,314 |
| Stockout_Days with the printed fill | 5,776 / 5,830 (report says 5,771; only the half-rounding convention differs) |
| Stockout_Days feasible with the latent fill | 5,830 / 5,830 |

- Operational fill: deciles 15.0, 21.2, 26.2, 31.8, 37.3, 43.2, 48.6, 53.7, 59.2, 64.6, 70.0; mean 42.83; KS against U(15, 70) gives p = 0.48. Per-reason means are 42.6..43.2.
- Totals are identical to the report: R 235,319; C 3,948; Shipped 140,554; B 16,886; Lost 81,827.
- Not in the report: 3 semiconductor rows carry `C > 0` (60 units), all in 2021-03 after an operational stockout in 2021-02. They are ELA-044 / Asia Pacific (previous month unlisted, so it is also a D2 case), ELA-045 / North America and ELA-058 / Europe. Unit tests must allow carried-in units on semiconductor rows.

### F3. Train == Shipped after cleaning — confirmed (`v00`, `v02`)
- After region recovery, 5,804 stockout keys match a train row. 26 do not (18 semiconductor, 8 operational; 694 shipped units).
- My own clean gives **5,767 / 5,804 equal**. The 37 exceptions are 36 India pack-of-10 rows and THM-033 / Latin America / 2023-04 (blank units and revenue; Shipped 65, Requested 102), exactly as reported.

Per error class, in my own classification:

| Class | Equal to Shipped |
|---|---|
| Units restored from revenue | 70 / 70 |
| Blank or "-" units with price 0 | 19 / 19 |
| Negative units | 14 / 14 |
| Units x100 | 4 / 4 |
| Units x10 | 2 / 2 |
| Price x100 | 11 / 11 |
| EUR price | 47 / 47, plus 1 row my coder called `price_odd` (also equal) |
| Revenue x10 | 9 / 9 |
| Positive units with price and revenue 0 | 10 / 10 |
| Clean rows | 4,720 + 852 zeros, all equal |

- Rule 2 (latest load wins) is validated again: 17 restated records sit on listed cells. The latest version equals Shipped 17 / 17 and the earlier version 0 / 17.
- Report examples reproduce: ELA-008 / NA / 2021-05 shows -107 (Shipped 107); ELA-067 / EU / 2021-06 shows 900 (Shipped 9); ELA-014 / India / 2021-07 shows 2 at price 5,788.90 (Shipped 18).
- **Wording fix 1.** The pack rule `units_raw = round(Shipped/10)` matches 42 / 42, but so does banker's rounding. The `max(1, ...)` part is **untested**: no listed pack row has Shipped < 5. Indirect support: the zero share in India Aftermarket 2021-07..12 is 67 / 462 = 14.5%, against 14.7% natural, so there is no sign that the pack rounding turns small orders into zeros.
- **Wording fix 2.** "India only" must read **India Aftermarket only**. All 385 pack rows (price exactly 10 x list) are Aftermarket. Direct OEM, Tier-1 and Export India rows in the same months have 0 price-x10 rows. The rule must be row-level (price ≈ 10 x list), never applied to the whole India x H2-2021 cell, and revenue must not be multiplied (it is already correct).

### F4. Back-order carry — confirmed exactly (`v03`)
- 1,321 listed rows have B > 0. For 251 the next month is listed, with C(t+1) = B(t) 100%. For 1,054 the next month is unlisted inside the history. 16 are 2026-10 rows.
- 1,048 of the 1,054 have a usable train value:

| Test on `y(t+1) - B(t)` | Count |
|---|---|
| exactly 0 | 141 |
| `y(t+1) = 0` | 1 (HYD-004 / Europe / 2026-03, B = 2) |
| negative | 14 |
| positive | 893 |

- Report control reproduced: 16.1% zeros (n = 155) after listed operational rows with B = 0.
- A stricter null of my own: P(y(t+1) = 0 | y(t) > 0) over 197,460 unlisted consecutive pairs is 14.1%. That predicts **148 zeros if the carry did not exist, against 1 observed**.
- Median y(t+1) / local baseline is 1.185, and 0.921 after removing the carry.
- Examples reproduce: BSS-017 / Latin America (2019-07 listed, shipped 16; 2019-08 shows 22), BSS-044 / Asia Pacific (32 then 48 = B), BSS-057 / Latin America (237 then 55 = B).
- Off-cycle counts depend on how off-cycle is defined. I used a strict definition: all existing t±P, ±2P, ±3P are zero, at least 3 of them, with P = 2 or 3. That gives 29,410 off-cycle cells and 183 positive ones:
  - 108 equal exactly the previous listed month's B;
  - 31 are listed second months shipping part of a carry;
  - 39 have both the previous and the current month unlisted.

  This is the same pattern as the report's 136 / 41 under its looser definition.
- Caveat (see Missed 3): the 1,034 S2 cells are enriched for hidden second-month stockouts.

### F5. Semiconductor shortage — confirmed (`v04`, `v05`, `v08`)

**Coverage.**
- All 4,314 semiconductor rows are ELA in 2021-03..2022-09. No operational row is listed for ELA inside the window.
- Window cells: 6,239 with a train row or a listing.
  - 6,221 have a train row.
  - 4,296 are listed with a train row, and 18 are listed without one.
  - 1,925 are unlisted. 7 grid cells inside the series spans have neither a row nor a listing.
- The listed share is 69.06%.

**Listing is an independent coin flip.**
- By month 65.5..74.5%; by region 67.4..70.2%.
- Zero-demand cells 69.4% vs positive 69.0%.
- Dispersion ratio across 375 series 0.97.
- P(listed | previous listed) 69.3% vs 68.7% otherwise.

**Unlisted cells are constrained.**
- Within 367 series, the mean of unlisted y over the mean of listed Requested is 0.665, and listed Shipped / Requested is 0.665.
- Month by month, unlisted y / listed Requested tracks listed Shipped / Requested: 2021-03 0.977 vs 0.903; 2021-09 0.498 vs 0.481; 2022-01 0.470 vs 0.533; 2022-07 0.798 vs 0.802 (`v04_ela_index_by_month.csv`).
- Outside the window the shipped-based ELA / other index shows no constraint: 1.05 in 2021-02, 0.99 in 2021-03, 1.00 in 2022-09, 1.09 in 2022-10.

**Depth x severity model.**
- My alternating least-squares fit reproduces the depth curve to 3 decimals: .090, .158, .218, .274, .351, .434, .511, .493, .476, .462, .445, .430, .416, .357, .293, .233, .176, .129, .081.
- Severity per series (n 373): mean 1.00, sd 0.215, 5%/95% at 0.669 / 1.327. KS against U(0.65, 1.35) gives p = 0.74.
- **Severity is a real per-series parameter:** split-half reliability r = 0.94 (0.007 when fill is shuffled within month).
- Severity is not shared within a SKU: the within-SKU variance is 0.0452 against a total of 0.0460.
- Residual: sd 0.0379, Gaussian (KS p = 0.66). Correlation with other regions of the same SKU-month is -0.006, with the same region-month -0.018, and lag-1 is -0.09.
- **So the noise is irreducible.** Listed neighbouring cells cannot improve the imputation of an unlisted cell.

**Leave-one-out imputation test on 4,314 rows.**

| Estimator | Bias | WAPE |
|---|---|---|
| Shipped, no correction | -33.75% | 33.81% |
| `u / (1 - depth)` | -3.12% | 11.00% |
| `(u + 0.5) / fill_hat - C` | -0.29% | 5.30% |
| same, rounded | -0.27% | 5.24% |
| Oracle with the printed fill (best possible) | | 0.88% |

**Totals.**
- Imputed unlisted demand adds 23,210 units.
- Window shipped 155,945 against demand 234,232.
- Within-series imputed / listed Requested is 0.988 (bootstrap 95% CI 0.930..1.043).

**Small caveat.** Of 679 listed semiconductor rows with Shipped = 0, 38 had Requested of 1-2 units. So the rule "u = 0 means demand 0" misses about 1.5 units on about 5.6% of zero cells, roughly 20 units in total. This is negligible.

**Open question 1 answered (`v12`, `v05`).**
- Index of unconstrained demand, ELA vs other families, 175 / 1,318 continuing series, normalised to 2019 + 2023:

| Month | Index |
|---|---|
| 2020-06..08 (COVID) | 0.75..0.78 |
| 2021-01 | 1.14 |
| 2021-02 | 1.07 |
| Window | 1.06..1.40 (peak 2021-10) |
| 2022-09 | 1.10 |
| 2022-10 | 1.10 |
| 2022-11 | 1.08 |
| 2023 | about 1.0 |

- The hump starts **before** the shortage and decays smoothly after it. There is no step at either window edge.
- Across series, median Requested / baseline in the window is **not** related to severity (Spearman -0.09, p = 0.09, n = 346).
- An allocation-driven over-ordering mechanism would produce edge steps and a positive correlation with severity. Neither appears. The excess is a smooth ELA-specific cycle (higher beta: deeper COVID dip, stronger 2021 rebound), not a supply artefact.

### F6. Operational stockouts — partially confirmed (`v06`, `v10`)

**Confirmed.**
- Rate 6.33 per 1,000 (1,508 listed on 238,345 non-shortage cells with a train row).
- Flat across every dimension:

| Dimension | Range per 1,000 |
|---|---|
| Year | 5.4..7.2 |
| Family | 5.5..7.1 |
| Region | 6.0..7.1 |
| Calendar month | 5.8..7.1 |
| Channel | 5.8..7.05 |
| Volume quintile | 5.7..7.3 |

- Requested / local median: 1.00 for listed operational rows vs 1.008 for random unlisted months. Zero share 9.9% vs 9.8%. So stockouts do not select high-demand months.
- Listing probability, method 1: 251 listed vs 64 unlisted previous months, giving 0.797 (Wilson 0.749..0.838). That is 249 / 63 on operational rows plus the 2 / 1 split of the three semiconductor rows with C > 0.
- D2: 64 cases (61 operational with a usable previous value, plus ELA-044 / Asia Pacific, whose listed month is a semiconductor row). Implied fill mean 0.398, range 0.139..0.680. I verified the interval `S ∈ [ceil(2.5c), ceil(2.5(c+1)) - 1]` for every case. The BSS-024 / NA example reproduces (C = 12, S 30..32).
- D3: 14 cases.
- D1: my strict-definition candidates (39) contain 27 of the investigator's 29 applied phantom months. The expected number of hidden catch-ups among such candidates is 108 x 0.21 / 0.79 ≈ 29, consistent with the stated precision of about 90%. The BSS-071 / India example reproduces (88, 0, **27, 20**, 61).
- Hidden-month arithmetic: 1,516 x 0.214 / 0.786 = 413.

**Corrected.** The report says "4 runs of 3 and one of 7 in about 1,230 runs". On operational rows there are **1,231 runs: 949 of length 1, 279 of length 2, 3 of length 3, and none longer.** The three runs of 3 are CSS-041 / Europe from 2025-06, HYD-066 / Latin America from 2026-08 and PMP-047 / India from 2019-07. The report's count most likely merged the 2021-02 operational rows with the semiconductor months that follow. "22.9% of first months have a listed second month" is correct (0.2291).

**Not checked.** The D4 likelihood-ratio table (AUC, precision). It is register-only and changes no data. Its "no imputation" recommendation is the safe default.

### F7. Lost and delayed sales — confirmed (`v09`)
- With my own price reference (mode across regions per SKU-month):

| Component | Lost units | Lost revenue |
|---|---|---|
| Listed, semiconductor | 55,137 | USD 62.02M |
| Listed, operational | 26,690 | USD 20.09M |
| Imputed semiconductor | 23,210 | USD 26.39M |

- All three match the report exactly.
- Shipped by year matches exactly for 2019-2022 and 2024-2026. For 2023 my clean has 1,511,581 against the report's 1,511,356 (+225 units, a cleaning difference).
- 81,827 + 23,210 + 1,888 = 106,925, as reported.
- The undetected-operational estimate is arithmetically right: 26,690 / 1,516 = 17.6 lost units per listed month, and 308 x 17.6 = 5.4k. It remains low confidence, as stated.

### F8. Events outside the stockout file — partially confirmed (`v07`, `v11`)

**Red Sea: confirmed, multipliers refined.**
- 163 Export EU/MEA series with monthly orders. Median ratio to their own baseline: Dec 0.918, Jan 0.571, Feb 0.704, Mar 1.412, Apr 0.952. Controls: non-export EU/MEA 0.92 / 1.05 / 1.00 in Jan / Feb / Mar.
- With a year-over-year control (same month of 2023 and 2025, 149 series), Export EU/MEA reads 0.589 / 0.674 / 1.608 against Export elsewhere at 1.015 / 0.957 / 1.054. Relative multipliers are **0.58 / 0.70 / 1.53**.
- The Jan-Mar total is **0.95** of normal relative to Export elsewhere, or 0.92 relative to its own baseline.
- Listings in the window: 11 rows on 817 cells, against 5.2 expected (Poisson p = 0.017). But the reasons are random (2 Logistics, 4 Capacity, 4 Supplier quality, 1 Tooling), so the Red Sea is not encoded in the file, as the report says.

**ERP: substance confirmed, counts corrected.**
- Units **and** revenue are blank on 126 / 126 / 128 Latin America cells in 2023-03 / 04 / 05. That is **100% of LatAm Aftermarket (81 / 82 / 83) and Export (45 / 44 / 45) cells**, and 0 Direct OEM or Tier-1 cells.
- All 380 such rows in the file are in this block.
- Counting every blank-unit row, there are 128 / 135 / 129, against 3-6 in the neighbouring months. The report's "145 / 147 / 146 vs 30-41" does not reproduce.
- **Split that the report does not state:** 48 of the 380 have price = 0 and 332 have price > 0.
- Every one of the 35,390 zero-unit rows in train has price 0 and revenue 0. So the 48 are zero orders (set them to 0) and the 332 are positive orders of unknown size. One of the 332 is restored from the stockout file (THM-033, 65), leaving 331, which matches the report's "331 blank ERP cells".

**COVID.** The operational listing rate in 2020-03..06 is 7.1 vs 6.3 per 1,000, so not elevated.

### F9. Unconstrained algorithm — confirmed (`v09`)
- My rebuild gives the same source counts: S1 5,830, S5 1,925, S2 1,034, D2 62, D3 14. D1 was not re-implemented.
- Total uplift is +0.908%; the report says +0.91%.
- Last-6-month uplift is **+0.235%** (+3,281 from S1, -1,210 carry removed by S2); the report says +0.24%.
- 124 listed rows in 2026-05..10: Requested 5,728, Shipped 2,447.
- Report examples reproduce: ELA-008 / India 2026-10 is 167 vs 76, and CSS-006 / Europe is 157 vs 74.
- 2026-10 back-orders: 16 rows, 178 units.
- My cell counts differ from the report's by about 50 cells. This comes from the ERP price-0 cells (see F8) and from my not running D1.

---

## Corrections the pipeline must apply
1. **Pack-of-10 scope.**
   - Select rows by price ≈ 10 x SKU list price. These are all India **Aftermarket** 2021-07..12, 385 rows.
   - Do not touch other India channels, and do not multiply revenue.
   - Units: use `Shipped_Units` where listed (42 rows). Elsewhere use 10 x raw, with ±5 units of uncertainty.
2. **ERP block, 380 rows** (all LatAm Aftermarket + Export, 2023-03..05):
   - the 48 rows with price 0 become units 0;
   - THM-033 / 2023-04 becomes 65 from the stockout file;
   - the other 331 are **positive** orders of unknown size. Impute them conditional on an order having been placed (on-cycle level), never as 0, and flag them.
3. **Unit tests on the stockout file:** the F2 identities must hold 100%, and the test must allow `C > 0` on the 3 semiconductor rows of 2021-03.
4. **F6 documentation:** operational runs are 949 / 279 / 3, with none longer than 3.
5. **S2 cells:** keep `y - B(t-1)`, but treat S2 cells whose corrected value is below about 0.35 x local baseline as suspected hidden second-month stockouts. Mask them or down-weight them; do not use them as genuine low demand (Missed 3).
6. **Red Sea:** use multipliers of about 0.58 / 0.70 / 1.53 (Jan / Feb / Mar 2024, Export x {Europe, MEA}). The quarter holds about 0.95 of normal units. Masking these 3 months in training is the safe default.
7. **Missing cells after a back-order:** the next month of 4 listed back-order rows is a missing train row. They are THM-041 / MEA 2022-03 (B 6), CSS-031 / AP 2022-06 (B 2), PTC-078 / India 2024-09 (B 9) and HYD-012 / MEA 2025-05 (B 7). If those cells are imputed, impute demand only (no carry); the carry is lost information, not demand.

## Missed (within this lens)
1. **ELA "inflation" is not a supply artefact** (open question 1 closed; evidence in F5). Train on `Requested_Units` / imputed demand for ELA 2021-22 with no extra deflation. If a driver model gives ELA a higher macro beta, that matches the data (deeper COVID dip, stronger rebound).
2. **Severity is a genuine per-series parameter** (split-half r = 0.94), and the remaining fill noise is iid Gaussian, with no correlation within SKU-month, region-month or over time. 5.3% WAPE is therefore the floor for imputing unlisted semiconductor cells; no sibling or cross-sectional model can do better.
3. **S2 cells hide second-month stockouts beyond D3.**
   - Among 971 S2 cells with a usable baseline, 19.2% sit below half of the local baseline, against 14.6% for ordinary months. That is about 45 excess cells, with 22 excess below 0.2 x baseline.
   - The expected number of hidden second months among the 1,054 cells is q(1-p)/(1-qp) x 1,054 ≈ 80 (q ≈ 0.29, p ≈ 0.79). D3 catches only 14.
   - Their S2 demand is underestimated (true ≈ (y + 0.5) / f - B, with f ~ U(0.15, 0.70)).
   - Small in units (about 1-3k), but these cells should not teach the model that demand drops after a stockout.
4. **ERP price-0 convention.** Price 0 means a zero order on all 35,390 zero rows. This turns 48 of the 380 blank ERP cells into exact zeros and tells us the other 332 are positive orders. That is better than imputing all 380 from a level.
5. **Pack rows are Aftermarket only, and the `max(1, ...)` floor is untested** (F3).
6. **Small listing excess in the Red Sea window** (11 rows vs 5.2 expected, p = 0.017), with random reasons. Do not read it as a Red Sea encoding.
7. **Forecast target for 2026-11.** I agree with not adding the 178 units back-ordered from 2026-10 (16 cells). Rule 7 asks for requested demand, and the effect is about 11 units per affected cell either way.
