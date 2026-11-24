# Lens: lifecycle-master — sku_master.csv, product lifecycle, master vs transactions, the EV shift

**Headline.** The master is almost clean (601 unique SKUs, consistent formats, statuses 100% consistent with dates) and has exactly two reference errors: `PMP-004` carries the wrong Business_Unit and `BSS-018` has a Launch_Date four months later than its first sales. Lifecycle in this generator is fully deterministic in structure: every one of the 3,083 train series starts exactly at `max(Launch_Date, 2019-01)` (2022-01 for Middle East & Africa) and ends exactly at `EOL_Date` or 2026-10; `Record_ID` is a running counter over (series, month), so the 982 deleted rows, the 30 year-2062 date typos and the 737 blank regions can all be reconstructed exactly. New series ramp up as `1 − exp(−(k+1)/τ)` with τ ≈ 4.5 months (τ ≈ 6.25 for the 2022 MEA region entry); the last 6 months before EOL run at about 60% of normal with no last-time-buy spike; successors are generated as independent SKUs (different regions, customers, channels and ordering cycles) that launch 2–3 months before the predecessor's EOL. The EV shift is an exact-looking log-linear, zero-lag response to `EV_Adoption_Index`: EV SKUs +3.85% per index point, ICE SKUs −1.1% per point, Universal 0.0%. For the forecast window this means: 156 test rows fall after EOL (forecast 0), 16 "Active" series are lost accounts with 10–19 months of explicit zeros (304 test rows, forecast 0), 10 cold-start series (117 rows) need a ramp from a cross-sectional prior, 18 series of 4 very young SKUs need a ramp-aware level (naive means under-forecast them by more than half), and all 66 active EV SKUs get a hump of +14% to +18% over their last-12-month level in 2026-11..2027-04 that fades to +1.5% by 2027-12.

Conventions: `k` = months since series start (0 = first month); `m` = months to EOL (0 = EOL month); `t` = months since 2019-01. "Level" `L` is units per month at the 2023–2026 average macro/seasonal conditions of the region and at EV index 90. Units used below are a rough clean (latest version per Record_ID, ×10/×100 errors reconciled against revenue, sign errors made positive, one-offs winsorised at 5× the series median).

---

## Findings

### 1. `Record_ID` is a running counter over (series, month) — it reconstructs the true grid
**Evidence.** Sorted by the numeric part of `Record_ID`, rows walk through one SKU×Region series at a time in strict month order (e.g. `CEL-0000001..0000094` = BSS-001 North America 2019-01..2026-10, `CEL-0000095..` = BSS-001 Europe). The offset `rec_num − month_index` is constant inside a series. Segmenting on that offset gives exactly 3,083 segments, each a unique SKU×Region, with zero SKU or region label contradictions inside a segment. IDs run 1..245,548 and 244,566 are present: 982 are absent. Rebuilding the expected grid from the lifecycle rule in finding 2 yields exactly 982 missing series-months (956 inside series, 16 final rows, 10 first rows). They are spread evenly (92–151 per year; 3–8 per region in 2023-03..05), so deletions are random at about 0.4%, not event-driven.
Side products: 30 rows have year 2062 in `Date` (all are 2026 by the counter, `Year`/`Month` columns agree); 737 blank regions are recoverable from the segment.
**Classification.** generator_structure. **Confidence.** high.
**Rule.** Derive `series_id` and the true month from `Record_ID`; fix `2062-xx → 2026-xx`; fill blank Region/Family from the segment/master; build the panel on the full grid `series_start..series_end` and mark the 982 absent series-months as *missing rows* (impute, never zero). List in `missing_rows_reconstructed.csv`.

### 2. Series start and end are set exactly by the master lifecycle dates
**Evidence.** Series start minus `max(Launch_Date, 2019-01)` (2022-01 floor for MEA): 0 for 3,069 series, +1 for 10 series (all 10 explained by a deleted first row), −4 for the 4 BSS-018 series (finding 4). Series end minus `min(EOL_Date, 2026-10)`: 0 for 3,067, −1 for 16 (deleted last row). All 25 series of the 6 Discontinued SKUs stop in the EOL month itself, with sales in that month (4% zeros) and no row afterwards. MEA: 461 of 520 series are due to start in 2022-01 (event EV-024 "Celeris opens Middle East & Africa sales region"; 459 of them belong to SKUs launched earlier, i.e. pure region entry); the other 59 belong to SKUs launched after 2022-01.
There are therefore no sales after EOL and no "Discontinued but still selling" SKUs in train. No Active SKU lacks sales at SKU level; the only master SKUs absent from train are the 3 Planned Launch SKUs.
**Classification.** generator_structure. **Confidence.** high.
**Rule.** Lifecycle mask: a series exists only for `series_start ≤ t ≤ series_end`; months outside are structurally absent, not zero and not missing. Add features `months_since_series_start`, `months_to_eol`, `is_mea_entry`.

### 3. Master profile and internal quality
**Evidence.** 601 rows, 601 unique `SKU_ID`, numbering contiguous per family (BSS 84, CSS 87, ELA 87, HYD 89, PMP 87, PTC 87, THM 80). No whitespace, case or format problems; `Launch_Date` and `EOL_Date` are all `YYYY-MM`. `SKU_Description` = Size_Class + " mm " + form factor for all 601 (0 mismatches); 5 size classes (Large 45: 126, Standard 25: 123, Compact 12: 122, Industrial 100: 118, Heavy-Duty 70: 112). Descriptions and families in train and test match the master in every non-blank row.

| Lifecycle_Status | SKUs | Powertrain |
|---|---|---|
| Active | 589 | 66 EV, 84 ICE, 439 Universal |
| Discontinued | 6 | all ICE |
| EOL Announced | 3 | all ICE |
| Planned Launch | 3 | 2 EV, 1 Universal |

Status is consistent with dates for all 601 (Discontinued ⇔ EOL ≤ 2026-10; EOL Announced ⇔ EOL > 2026-10; Planned Launch ⇔ launch > 2026-10).
Powertrain: Universal 440, ICE 93, EV 68; determined by form factor (no form factor has two powertrains). By family (EV / ICE / Universal): BSS 4/0/80, CSS 11/5/71, ELA 22/18/47, HYD 0/1/88, PTC 7/27/53, PMP 11/23/53, THM 13/19/48.
Launch dates: 460 SKUs before 2019 (2009-04..2018-12); 138 inside the history (2019: 3, 2020: 33, 2021: 29, 2022: 23, 2023: 25, 2024: 14, 2025: 7, 2026: 4); 3 planned in 2027. All 68 EV SKUs launched 2019-10 or later; 86 of 93 ICE SKUs launched before 2019.
Regions per SKU: 3 regions for 3 SKUs, 4 for 159, 5 for 178, 6 for 258. Series per region: India 521, MEA 520, Europe 517, Asia Pacific 515, Latin America 511, North America 499.
**Classification.** generator_structure. **Confidence.** high.
**Rule.** Use the master as the authority for family, description, size class and powertrain; fill the 1,228 blank families in train from it.

### 4. Reference conflict: BSS-018 Launch_Date is 4 months late in the master
**Evidence.** Master `Launch_Date` = 2025-06, but all 4 BSS-018 series start in 2025-02: 16 rows (`CEL-0007995..7998`, `CEL-0008016..8019`, `CEL-0008037..8040`, `CEL-0008058..8061`) dated 2025-02..2025-05, each loaded once, in the month after its `Date`. The series shows the standard launch ramp from 2025-02 (ratio to mature level 0.17, 0.37, 0.35, 0.51, 0.65 in the first five months), not from 2025-06. It is the only SKU of 598 whose first sale differs from the master.
Rule 5 forbids sales before a *planned* launch; BSS-018 is Active and the transactions are internally coherent, so the master date is the error.
**Classification.** reference_conflict (master wrong, transactions right). **Confidence.** high.
**Rule.** Keep the 16 rows; set `Launch_Date_clean = 2025-02`; log 16 register entries of type `sales_before_master_launch` with action "master corrected".

### 5. Reference conflict: PMP-004 Business_Unit
**Evidence.** Master says `Power & Drive Systems`; all 524 train rows and 114 test rows for PMP-004 say `Advanced Manufacturing`, as do the other 86 Precision Machined Parts SKUs. The problem statement fixes one BU per family.
**Classification.** reference_conflict (master wrong). **Confidence.** high.
**Rule.** Set master BU to `Advanced Manufacturing`; data-quality report: 1 master row corrected.

### 6. Launch ramp: `1 − exp(−(k+1)/τ)`, τ ≈ 4.5 months
**Evidence.** Multiplicative decomposition (series level × regional index of mature Universal SKUs × ramp(k) × time effect) on non-MEA series. Pooled Universal + EV ramp by month since launch: 0.19, 0.39, 0.52, 0.64, 0.70, 0.80, 0.85, 0.90, 0.89, 0.87, 0.93, 0.91, 0.94, 0.99 (k = 0..13), flat at 1.0 afterwards. Once the EV-index effect is separated, EV launches follow the same curve as Universal ones (0.16, 0.35, 0.50, 0.56, 0.69, 0.75, 0.82, 0.84).
Candidate forms fitted to the pooled curve (RMSE): exponential saturation 0.022, Hill 0.030, logistic 0.035, power 0.043, two-parameter linear 0.050, linear `(k+1)/R` 0.061. Poisson profile likelihood on 566 non-MEA launch series: τ = 4.50 (Universal 4.75, EV 4.00, ICE 5.50 on 32 series); exponential beats the best linear ramp by 1,303 log-likelihood units. Per-SKU τ: median 4.5, 10–90% range 2.75–6.5, and per-SKU τ improves the fit by 12.9 log-likelihood units per SKU, so τ probably varies by SKU.
τ = 4.5 gives 0.20, 0.36, 0.49, 0.59, 0.67, 0.74, 0.79, 0.83, 0.86, 0.89, 0.91, 0.93 for k = 0..11 and 0.98 at k = 17.
Backtest on 497 non-MEA series launched 2020-01..2024-11, forecasting the next 19 months from only the first n months:

| History (months) | Bias, mean of history | Bias, last-3 mean | Bias, ramp-aware | Series-total WAPE, mean | Series-total WAPE, ramp-aware | + shrink to prior |
|---|---|---|---|---|---|---|
| 2 | −73% | −73% | −9% | 0.754 | 0.472 | 0.287 |
| 3 | −67% | −67% | −6% | 0.677 | 0.388 | 0.272 |
| 4 | −62% | −55% | −5% | 0.621 | 0.356 | 0.262 |
| 6 | −53% | −36% | −2% | 0.531 | 0.282 | 0.229 |
| 9 | −43% | −19% | +1% | 0.435 | 0.227 | 0.195 |

**Classification.** generator_structure. **Confidence.** high for shape and average τ; medium for per-SKU τ.
**Rule.** Feature `ramp = 1 − exp(−(k+1)/4.5)`. Do not flag low early months as outliers. For any series with fewer than 18 months of history estimate the mature level as `L = (Σ units + n0·P) / (Σ ramp·ev_factor·macro_index + n0)` with `n0 = 1–2` and `P` the cross-sectional prior of finding 10, then forecast `L × ramp × ev_factor × macro_index`. Fit global models on ramp-normalised history.

### 7. MEA region entry in 2022-01 ramps the same way, more slowly
**Evidence.** The 459 MEA series of SKUs launched before 2022 all start 2022-01 and ramp over about a year (452 of them, excluding EOL SKUs, were used for the fit): ratio to their 2024+ level 0.13, 0.34, 0.39, 0.36 (Ramadan month), 0.53, 0.60, 0.71, 0.85, 0.74, 0.82, 0.95, 0.90, 0.97. Profile-likelihood τ = 6.25 (6.0–6.25). MEA series of SKUs launched after 2022-01 ramp with τ = 4.75 like any launch. Mature MEA series sell about half of other regions (cross-sectional factor exp(−0.646) = 0.52).
**Classification.** real_event (market entry, EV-024) with generator_structure shape. **Confidence.** high.
**Rule.** For MEA series use `k = t − max(launch, 2022-01)` and τ = 6.25 when the SKU pre-dates 2022, else 4.5. Exclude 2022 MEA months from level and seasonality estimation unless ramp-normalised. Register 459 `region_entry_ramp` entries as structure, not anomalies.

### 8. End of life: final 6 months at about 60%, no last-time buy, then nothing
**Evidence.** 6 Discontinued SKUs, 25 series. Actual ÷ expected-without-EOL by months to EOL, 3-month buckets: m 0–2 → 0.52; m 3–5 → 0.67; m 6–8 → 0.96; m 9–11 → 0.81; m 12–14 → 0.93; m 15–17 → 0.90; m 18–20 → 1.03. Per SKU, m 0–2 ranges 0.45–0.58 and m 3–5 ranges 0.52–0.88. Parametric fits (log-likelihood gain over no decline): step ×0.60 over the last 6 months 412.7 (same step over 5 months 314.6, over 7 months 208.8); geometric to 0.45 over 6 months 392.0; linear to 0.45 over 6 months 375.7. The decline window is sharply 6 months. The EOL month itself is at 0.51 and no bucket in the last 12 months exceeds 1.0 on a cycle-averaged basis, so there is no last-time-buy spike.
The 3 EOL Announced SKUs show no decline yet through 2026-10 (3-month ratios 0.83–1.13 for PTC-005, 0.83–1.06 for PMP-003, 1.09–1.22 for THM-001), so there is no clear decline yet, consistent with one that only starts 6 months before EOL.
**Classification.** real_event (phase-out) with generator_structure shape. **Confidence.** high that the window is 6 months and the level is 0.5–0.65; medium on flat step versus graded decline.
**Rule.** `eol_factor = 1` for m ≥ 6, `0.60` for m = 0..5, `0` after EOL. Exclude phase-out months from baseline level estimation. Register 25 `eol_phase_out` entries.

### 9. Predecessor → successor: independent series, no demand transfer mechanism
**Evidence.** 9 EOL SKUs (all ICE), each replaced by exactly one successor of the same family and size class; successor powertrain: 5 EV, 3 Universal, 1 ICE. The successor launches 2 months (4 pairs) or 3 months (5 pairs) before the predecessor's EOL month, i.e. 3–4 overlapping months.

| Predecessor (EOL) | Successor (launch) | Pred. regions | Succ. regions | Common | Same customer | Same channel | Level ratio |
|---|---|---|---|---|---|---|---|
| PTC-025 (2021-06) | PTC-027 EV (2021-03) | 4 | 4 | 2 | 0 | 1 | 0.74 |
| PMP-017 (2022-03) | PMP-018 ICE (2022-01) | 3 | 6 | 3 | 0 | 2 | 0.87 |
| THM-009 (2022-12) | THM-010 EV (2022-09) | 5 | 6 | 5 | 2 | 2 | 0.94 |
| ELA-014 (2023-06) | ELA-015 EV (2023-03) | 4 | 5 | 4 | 1 | 2 | 1.69 |
| PTC-026 (2024-03) | PTC-028 Univ. (2023-12) | 3 | 5 | 3 | 1 | 2 | 0.93 |
| HYD-020 (2024-09) | HYD-021 Univ. (2024-06) | 6 | 4 | 4 | 0 | 1 | 1.11 |

Level ratio = successor months 12–23 after launch ÷ predecessor months 18–7 before EOL, both region-adjusted, in units of their own time; median 0.93. In the 21 common regions the customer is the same in 4 and the channel in 10; the ordering period differs in 6 (4 bimonthly or quarterly predecessors whose successor orders monthly, 2 monthly predecessors whose successor orders every second month), so cycles are not inherited. The predecessor's decline starts 2–3 months before the successor launches and is tied to its own EOL date. Combined volume dips during the changeover.
Predicting the mature level of the 30 successor series: cross-sectional prior (family + region + channel + powertrain) WAPE 0.19, bias −13%; predecessor per-series mean WAPE 0.40; predecessor × 1.4 WAPE 0.29.
**Classification.** generator_structure. **Confidence.** high on independence; low on the level ratio (6 pairs).
**Rule.** Do not transfer history, customer or cycle from predecessor to successor. Use `Replaces_SKU` only for (a) launch timing and (b) a weak level prior blended 50/50 (geometric) with the cross-sectional prior. Show the pair on the lifecycle dashboard as one family-level transition.

### 10. Cross-sectional drivers of series level (the cold-start prior)
**Evidence.** Log level of 3,058 active series on region + family + channel + powertrain: R² 0.337, residual sd 0.496 (log). Effects: MEA ×0.52, Latin America ×0.88, other regions within ±6%; families relative to Brake & Safety: Thermal ×0.89, Precision Machined ×0.83, Chassis ×0.77, Powertrain ×0.68, Hydraulic ×0.56, Electrical ×0.51; Direct OEM ×1.12 and Tier-1 ×1.10 versus Aftermarket; ICE ×0.88 versus EV (at EV index 90). Adding size class, launch era and log price lifts R² to 0.371 (price elasticity −0.23). Leave-SKU-out error for 2022+ launches: rmse 0.42 log, actual/predicted 10–90% range 0.63–1.81.
**Classification.** generator_structure. **Confidence.** medium.
**Rule.** `P = exp(region + family + channel + powertrain effects) × 1.10`; P10/P90 = P50 × 0.58 / × 1.71. Used for cold starts and as the shrinkage target for young series.

### 11. The EV shift: zero-lag, log-linear in `EV_Adoption_Index`
**Evidence.** Mix: EV-SKU share of units 0.0% (2019), 0.3%, 1.4%, 3.0%, 6.0%, 9.2%, 9.9%, 9.8% (2026 to October); ICE share 24.1% → 21.9, 20.1, 18.4, 15.7, 13.9, 13.0, 13.0%. Mature ICE ÷ mature Universal units per series fell from 1.41 (2019-01, index 40.0) to 0.76 (2026-10, index 93.1) and flattened exactly when the index plateaued (2024-12 onward).
Poisson fits of `units = level × regional index × ramp × exp(β·(EV_idx − 90))`:

| Group | β per index point | Elasticity at index 90 |
|---|---|---|
| EV SKUs, all (334 series) | +0.0385 | +3.5 |
| EV by region | 0.0370 (APAC) – 0.0400 (NA, MEA) | |
| EV by family | 0.0340 (PMP), 0.0355 (BSS), 0.0375 (CSS), 0.0380 (PTC), 0.0390 (THM), 0.0445 (ELA) | |
| EV per SKU (66) | median 0.041, IQR 0.036–0.049, 10–90% 0.030–0.063 | |
| ICE SKUs, all (441 series) | −0.0110 | −1.0 |
| ICE by region | −0.0105 to −0.0115 | |
| ICE by family | −0.0080 (ELA), −0.0090 (PTC), −0.0115 (CSS, PMP), −0.0130 (THM) | |
| ICE per SKU (84) | median −0.010, IQR −0.013 to −0.007 | |
| Universal, all (2,265 series) | 0.0000 | 0 |
| Universal per SKU (439) | median +0.001, IQR −0.002 to +0.003 | |

Region does not matter; family matters a little; SKU-level spread is real (standard errors about 0.001 for mature SKUs against a spread of 0.024–0.065 for EV).
Lag: log-likelihood relative to lag 0 for EV SKUs is −144 (lag 1), −247 (lag 2), −587 (lag 3), −1,541 (lag 6), −275 (lead 1); for ICE −12, −56, −139, −530, −44. Lag 0 wins for both. EV SKUs also track the index dip inside the plateau: the 2024-07+ sub-sample alone gives a peak at lag 0 with median β 0.031.
Form: β in three sub-periods (2019–21, 2022–23, 2024–26) is −0.0130, −0.0120, −0.0135 for ICE and 0.0255 (se 0.0036, few young series), 0.0425, 0.0380 for EV. A constant-elasticity power law would make β fall by about 45% across those periods; it does not, so the response is exponential in the index.
Forecast window: the index goes 93.8 (2026-11) → 94.6 (2027-01/02) → 90.7 (2027-12) → 91.9 (2028-05); the last 12 train months average 90.33.

| Month | Index | EV SKU multiplier vs last-12m level | ICE SKU multiplier |
|---|---|---|---|
| 2026-11 | 93.8 | 1.14 | 0.962 |
| 2027-01 | 94.6 | 1.18 | 0.954 |
| 2027-04 | 94.0 | 1.15 | 0.960 |
| 2027-08 | 92.1 | 1.07 | 0.981 |
| 2027-12 | 90.7 | 1.015 | 0.996 |
| 2028-05 | 91.9 | 1.06 | 0.983 |

EV SKUs are 9.8% of volume, so a model that carries the last-12-month level flat is about 1.4–1.8% of total volume low in the first six forecast months; one that extrapolates the 2026-07..10 upswing is too high from mid-2027.
**Classification.** generator_structure (real market shift). **Confidence.** high on sign, zero lag and class averages; medium on exact per-SKU β and on exponential versus other convex forms beyond index 93.1 (window peak 94.6 is 1.5 points outside the observed range).
**Rule.** Add `ev_idx_t` (contemporaneous, cleaned) interacted with powertrain; in multiplicative models use `exp(β_sku·(EV_t − 90))` with `β_sku` shrunk toward the class mean (EV 0.0385, sd 0.007; ICE −0.011, sd 0.0035; Universal 0). Normalise history by this factor before estimating levels and seasonality for EV and ICE SKUs. Per-SKU values are in `sku_master_clean.csv` (`ev_beta_shrunk`).

### 12. Forecast window: lifecycle calendar and test.csv rows
**Evidence.** test.csv has 58,219 rows, 3,068 series, no duplicate keys, contiguous months, and customer and channel identical to the latest train value for all 3,058 continuing series. The 25 discontinued series are absent. Row counts per series: 19 for 3,058 series; 15 for 3 (PTC-029), 12 for 4 (PMP-020), 8 for 3 (THM-012) — these 10 start exactly at their planned Launch_Date, so there are 0 test rows before launch. But the 3 EOL Announced SKUs keep all 19 months in all 6 regions: 156 rows are dated after EOL_Date.

| SKU | Event | Regions | Treatment in window |
|---|---|---|---|
| PTC-005 (ICE) | EOL 2027-05 | 6 | normal 2026-11; ×0.60 2026-12..2027-05; 0 for 2027-06..2028-05 (72 rows) |
| PMP-003 (ICE) | EOL 2027-08 | 6 | normal to 2027-02; ×0.60 2027-03..08; 0 for 2027-09..2028-05 (54 rows) |
| THM-001 (ICE) | EOL 2027-12 | 6 | normal to 2027-06; ×0.60 2027-07..12; 0 for 2028-01..05 (30 rows) |
| PTC-029 (EV) | launch 2027-03, replaces PTC-005 | APAC, LatAm, MEA | cold start, 45 rows |
| PMP-020 (EV) | launch 2027-06, replaces PMP-003 | India, LatAm, MEA, NA | cold start, 48 rows |
| THM-012 (Universal) | launch 2027-10, replaces THM-001 | Europe, LatAm, NA | cold start, 24 rows |
| PMP-019 (EV) | launched 2026-08 | Europe, MEA, NA | 3 months of history; ramp 0.59 in 2026-11 |
| BSS-012 (Universal) | launched 2026-07 | APAC (first row deleted), Europe, LatAm, NA | 4 months; ramp 0.67 |
| THM-011 (EV) | launched 2026-05 | 5 regions | 6 months; ramp 0.79 |
| ELA-017 (EV) | launched 2026-04 | 6 regions | 7 months; ramp 0.83 |

Launched 2024-11..2025-06 and past the ramp by the window: CSS-054, HYD-023, HYD-086, HYD-089, CSS-037, BSS-037, CSS-057, BSS-018 (true launch 2025-02), HYD-063, CSS-010, ELA-061.
Size of the stakes: the three EOL SKUs sell 312, 312 and 364 units per month; forecasting them flat adds about 8,400 units of error on the 156 post-EOL rows plus about 2,400 on the phase-out months, roughly 0.4% of the 19-month volume (about 2.7M units). For the 4 youngest SKUs the ramp-aware mature levels sum to 724 units per month against 330 for the mean of history.
Rows by rule in `lifecycle_test_rules.csv`: normal 57,302; lost_account_zero 304; young_launch_ramp 232; post_eol_zero 156; cold_start_ramp 117; pre_eol_phaseout 108.
**Classification.** generator_structure for the row layout; real_event for the launches and EOLs. **Confidence.** high that the rows exist as described; medium-high that the hidden target after EOL is 0 (rule 5 says so, and train has no post-EOL rows to check).
**Rule.**
1. *Successors with no history:* `forecast = L × (1 − exp(−(k+1)/4.5)) × exp(β·(EV_t − 90)) × regional macro/seasonal index`, with `L` the geometric mean of the cross-sectional prior and the predecessor's region-adjusted level × region factor. Recommended L: PTC-029 52 / 44 / 27 (APAC / LatAm / MEA); PMP-020 56 / 49 / 30 / 62 (India / LatAm / MEA / NA); THM-012 69 / 55 / 70 (Europe / LatAm / NA). P10/P90 = ×0.58 / ×1.71. Apply the customer's ordering cycle only if the main model has a customer-level cycle prior; otherwise forecast the monthly mean.
2. *Predecessors being phased out:* baseline × 0.60 in the last 6 months including the EOL month, on a baseline estimated without the EV-index trend double-counted.
3. *After EOL:* hard post-processing override to 0 (P10 = P50 = P90 = 0).
4. *Young launches:* finding 6 rule.

### 13. "Active" SKUs with a dead series: 16 lost accounts
**Evidence.** 16 series of 16 different Active SKUs have explicit zero rows (units 0, price 0.00) for the last 10–19 months, after selling 30–111 units per month (sum 1,010 per month): HYD-081 NA (zero from 2025-04), PTC-002 NA (2025-06), THM-015 NA (2025-07), ELA-040 NA (2025-08), CSS-062 APAC (2025-10), CSS-045 India, ELA-084 India, PMP-076 India, HYD-061 Europe, PTC-003 Europe, PTC-038 NA (all 2025-11), CSS-085 Europe (2025-12), BSS-034 NA, BSS-082 India, ELA-055 LatAm, PMP-022 India (all 2026-01). Customer name does not change and no calendar event covers them. In the whole history, pure-zero runs have length 1 (22,925 runs), 2 (6,119), 3 (9), 4 (1), 5 (1) and then nothing until 15 open-ended runs of 10 or more (the 16th series, PTC-038 North America, has two blank-unit rows inside its run): no zero run longer than 5 months has ever recovered. All 16 series are in test with 19 rows each (304 rows). Forecasting them at their old level would add about 19,200 units of error (0.7% of volume).
**Classification.** real_event (lost account). **Confidence.** high that they are real; medium-high that they stay at zero.
**Rule.** Detect `≥ 6 trailing explicit zeros ⇒ lost account`; forecast P50 = 0, P90 = 0 for those series; list them in the exception view. Keep the zeros in history but exclude the dead period from model training for level.

### 14. Cross-lens tip: price is 0.00 exactly when units are 0
**Evidence.** All 35,390 rows with units 0 have `Unit_Price_USD` 0.00; only 295 of 205,141 positive-unit rows have price 0. Of the 3,544 rows with blank or "-" units, 667 have price 0 (so units were 0) and 2,877 have a positive price, of which 2,545 are recoverable exactly as revenue ÷ price. The Latin America ERP migration (EV-033) shows up as blanks, not deleted rows: 392 of 1,426 Latin America rows in 2023-03..05 have blank units and revenue (125 series blank in all three months), yet the price column still tells which of those months were zero-order months.
**Classification.** data_error (missing values) with generator_structure identity. **Confidence.** high.
**Rule.** Blank units: price 0 → 0; price > 0 and revenue present → revenue ÷ price; price > 0 and revenue blank → positive unknown, impute from the series model.

---

## Artefacts
All in `research/scratch/lifecycle-master/` (working files, not included in the repository).

| File | Content |
|---|---|
| `sku_master_clean.csv` | Master with `Business_Unit_clean`, `Launch_Date_clean`, conflict notes, first/last transaction month, regions, `ev_beta_raw`, `ev_beta_shrunk`, months since launch at 2026-10 |
| `lifecycle_test_rules.csv` | One row per test row: `k`, `ramp_factor`, `months_to_eol`, `eol_factor`, `ev_idx`, `ev_beta`, `ev_factor_vs_EV90`, `ev_factor_vs_last12m`, `lost_account`, `cold_start`, `lifecycle_rule` |
| `cold_start_forecast_prior.csv` | 117 cold-start rows with prior level, ramp, EV factor, base P10/P50/P90 (before the macro/seasonal index) |
| `young_launch_levels.csv` | Ramp-aware and shrunk mature levels for the 18 series of the 4 youngest SKUs |
| `lifecycle_anomaly_register.csv` | 1,204 entries: 16 sales_before_master_launch, 1 master BU conflict, 16 lost_account, 25 eol_phase_out, 687 launch_ramp, 459 region_entry_ramp |
| `lifecycle_calendar_window.csv` | 21 SKUs with a launch since 2024-11 or an EOL in the window |
| `segments_master.csv`, `train_seg.parquet` | Series segmentation from Record_ID with true month per row |
| `missing_rows_reconstructed.csv` | The 982 deleted series-months |
| `ev_beta_by_sku.csv`, `ev_beta_by_group.csv`, `ev_lag_scan.csv`, `ev_factor_forecast_window.csv`, `ipf_time_effects.csv` | EV-shift estimates |
| `ipf_ramp.csv`, `ramp_tau_by_sku.csv`, `ramp_backtest.csv`, `ramp_shrink_backtest.csv` | Launch-ramp estimates and backtests |
| `eol_decline_curve.csv`, `successor_pairs.csv`, `series_levels.csv`, `zero_runs_ge5.csv` | EOL, successor, level and lost-account evidence |
| `01_…41_*.py` | Scripts, numbered in the order run; `40_artefacts.py` rebuilds the main CSVs |

## Open questions, ranked by likely impact on forecast accuracy
1. **Do the 16 lost accounts stay at zero in the hidden target?** About 0.7% of volume. History says yes (no long zero run ever recovered), but every loss started in 2025-04..2026-01, so there is no example of what happens 20+ months after a loss.
2. **EV response above index 93.1.** The window peaks at 94.6. Exponential and power forms differ by 2–3 points on the EV-SKU multiplier at the peak (+18% versus about +15–16%); EV SKUs are 9.8% of volume.
3. **Is the hidden target exactly 0 on the 156 post-EOL rows?** Rule 5 says yes; train never contains a post-EOL row, so it cannot be verified. About 0.3% of volume.
4. **Flat step or graded decline in the last 6 months before EOL** (0.60 flat versus about 0.67 then 0.52). Affects 108 rows.
5. **Per-SKU ramp τ.** Evidence of spread (2.75–6.5) but no way to estimate τ for a SKU with 3–7 months of history; matters for 18 series.
6. **Cold-start level.** Six historical pairs give a successor/predecessor ratio of 0.74–1.69; the prior's P10–P90 band is ×0.58–×1.71. Only 117 rows, about 4,100 units.
7. **Ordering cycle of cold-start series** (monthly 83%, bimonthly 9.5%, quarterly 7.7% across active series) is unknowable in advance; forecasting the monthly mean is the WAPE-safe choice.
