# Skeptic review of lens `panel-missing-zeros`

**Verdict.** I tried to break the report by rebuilding the panel from `data/raw/*.csv` with independent code. Most of
it holds up. My mask was built without a candidate list: a per-series, per-calendar-month majority vote over the last
36 months. It agrees with the investigator's `cycle_now` on 3,083 / 3,083 series and with their test zero mask on every
test row where my mask gives an answer (0 disagreements; 8,811 definite zeros against their 8,842). The other 31 rows
fall in calendar months where a deleted row leaves my vote empty, and their B/T inference there is obvious.
The Record_ID grid, the 982 missing cells, the 27 cycle changes (same months), the 16 lost accounts, the
accumulation rule, the 0.5 catch-up after a shutdown and the 0.29 cycle-aware backtest WAPE all reproduce.

**Corrections needed.**
- **F4 phase-out factors** (0.50 / 0.57 / 0.40 / 0.27) are measured against the level 13-30 months before EOL. A
  forecast built on the recent level would count the decline twice. Against the level 7-12 months before EOL the
  factors are about 0.76 / 0.67 / 0.54 / 0.32, and the decline already starts 5-6 months before EOL. It touches 108
  test rows, not 72.
- **The `k_accum_months = 1.5` column** must not be used as a multiplier after a shutdown month (+14.6 % on Europe
  September orders). The rule in the report's text is the correct one.
- **The "+6 % bias" in open question 2** holds for one origin only. At 2024-03 the same method is 6 % too low.

**Tally:** 10 confirmed, 5 partially confirmed, 0 refuted, 0 not checked (the MEA-opening ramp curve inside F3 was not
re-derived).

Method: my scripts are in `research/scratch/panel-missing-zeros-verify/` (working files, not included in the repository). `k01`..`k17` were
written by the interrupted first skeptic; I read and re-ran them. `k18`..`k21` are new. Shared base: `k01_build.py`
builds my own deduplicated 245,548-cell panel and my own unit cleaning (`kpanel.parquet`). `k02` gives the
unconstrained mask. `k04` runs a free single change-point fit and assigns each cell its regime. I did not reuse any
investigator script or artefact as input. I opened their `test_phase_mask.csv`, `series_table.csv` and
`missing_rows.csv` only to compare (`k03`, `k12`).

---

## Verdicts per finding

### F1 Record_ID encodes the complete panel - **confirmed**
- 248,248 raw rows; 244,566 unique IDs (3,682 appear twice, none three times); numbers run from 1 to 245,548, so 982
  are unused.
- `rec - midx` takes exactly one value in each of the 3,083 series; the blocks tile 1..245,548 without gaps or
  overlaps; SKUs come in ascending order.
- **Closed form.** Start = max(2019-01, Launch_Date, 2022-01 for MEA), end = min(2026-10, EOL). It reproduces start
  record, start month and end month for 3,083 / 3,083 series once BSS-018 starts in 2025-02. With the master date
  (2025-06) all 2,988 later blocks shift (`k18`).
- New detail: the order of regions inside a SKU is a random permutation per SKU. 433 distinct orders, every region
  pair inconsistent. The canonical order NA | EU | APAC | IN | LA | MEA appears for 100 SKUs.
- Decoding agrees with the raw SKU on 244,566 / 244,566 rows and with the raw region on 243,829 / 243,829 non-blank
  rows. All 737 blank regions are filled; midx agrees on all rows after 2062 -> 2026 (30 rows). 0 duplicate keys.
- Missing cells: 956 inside a series, 10 first, 16 last. My missing-key set equals `missing_rows.csv` exactly.

### F2 Panel shape and lifecycle - **confirmed**
- 598 SKUs and 3,083 series: 258 / 178 / 159 / 3 SKUs in 6 / 5 / 4 / 3 regions. Series per region are as stated.
- 1,997 series start in 2019-01, 461 at the MEA opening and 625 later. 1,976 run the full 94 months; the shortest is
  PMP-019 at 3 months.
- 138 SKUs launch inside the window and 137 start in their master month.
- The 6 discontinued SKUs have 0 rows after EOL and 0 on-phase zeros in their last 6 months (124 cells).
- BSS-018 has 16 present cells before its master launch. Its first months look like a launch ramp (2025-02: 10 / 14 /
  7 / 16 units across its regions, against a mature level of about 50), and the generator's grid starts there. So
  the master date is the error, as the report says.

### F3 MEA opening and launch ramp - **partially confirmed**
- **MEA level** is 0.464 of the same SKU's mean over NA / EU / APAC / India (474 SKUs; investigator 0.46). LatAm 0.83,
  India 0.92, APAC 0.96, Europe 0.99, NA 1.02.
- **Launch ramp tau about 4.5: confirmed, but only with a powertrain-aware control.** On Universal non-ELA launches
  against the regional index, the ratio by age is 0.19 / 0.36 / 0.52 / 0.62 / 0.65 / 0.81 at ages 0-5 and 0.90 at
  age 12; fitted tau = 4.5. The same sample against a regional x powertrain index gives tau = 4.0. A mature-series
  index built per powertrain (`k15`) gives Universal tau = 4.2 (163 series) and EV tau = 4.55 (151 series).
- **Caution for the pipeline:** without a powertrain or EV control the same data give tau = 9-10 (`k13`, 257
  series), because late launches are mostly EV SKUs on a growth trend. Any ramp estimate must control for the EV trend.
- P(zero | on-phase) at ages 0 / 1 / 2 / 3 / 4: 9.9 / 2.4 / 1.0 / 1.0 / 0.4 % (investigator 10.7 / 3.0 / 1.4 / 1.1 / <0.8).
- Young test series: 18 / 71 / 157 under 12 / 24 / 36 months of age at 2026-10, reproduced.
- **Not checked:** the MEA-opening ramp table and its tau of 4.8 / 5.7. This curve does not reach the forecast window.

### F4 Train vs test coverage, EOL and successors - **partially confirmed (phase-out factors corrected)**
- **Coverage.** 58,219 test rows; 3,058 series in both files plus 10 test-only (117 rows); 25 train-only series (the 6
  discontinued SKUs). 156 rows lie after EOL (PTC-005 72, PMP-003 54, THM-001 30). The test customer and channel equal
  the last train values on 3,058 / 3,058. All 9 successors launch 2-3 months before EOL; 5 of 21 same-region
  successor pairs share the exact pattern.
- **Phase-out, corrected (`k19b`).** 19 monthly-type series of the 6 discontinued SKUs, on-phase cells, controlled by
  a regional index:

| months before EOL (h) | 6 | 5 | 4 | 3 | 2 | 1 | 0 |
|---|---|---|---|---|---|---|---|
| vs level 13-30 months before EOL (the investigator's base) | 0.90 | 0.73 | 0.67 | 0.61 | 0.54 | 0.43 | 0.26 |
| **vs level 7-12 months before EOL** (ratio of sums) | 1.13 | **0.92** | **0.83** | **0.76** | **0.67** | **0.54** | **0.32** |
| median per cell, vs 7-12 base | 1.04 | 0.93 | 0.86 | 0.69 | 0.62 | 0.49 | 0.27 |

  The level 7-12 months before EOL is already 0.75 (median) to 0.80 (ratio of sums) of the 13-30 base, because these
  ICE SKUs decline anyway. At the forecast origin the three EOL-announced SKUs are 7, 10 and 14 months before EOL, so
  a model's level sits close to the recent base. Applying the investigator's 0.50 / 0.57 / 0.40 / 0.27 on top of it
  under-forecasts the last four months by roughly 25-35 %. It also ignores the dip at h = 5 and 4.

  A linear fit gives `factor(h) = min(1, 0.38 + 0.104 h)`, i.e. 0.38 / 0.49 / 0.59 / 0.69 / 0.80 / 0.90 for h = 0..5.
  Leaving out one SKU at a time keeps h = 0 between 0.27 and 0.34 and h = 2 between 0.61 and 0.68. The phase-out
  covers 6 test months for each of the 18 series of PTC-005, PMP-003 and THM-001: **108 rows**, not 72.

### F5 Missing rows - **confirmed**
- 982 / 245,548 = 0.39992 %, and 0.004 x 245,548 = 982.19, so a fixed share.
- Chi-square p-values: year 0.961, calendar month 0.297, month index 0.934, region 0.403, family 0.881, channel 0.674,
  age band 0.742, first / last / interior cell 0.463.
- KS test p = 0.83; 4 adjacent pairs against 3.93 expected.
- On-phase rate 0.409 % vs off-phase 0.336 % (p = 0.043). Immaterial, as the report says.
- LatAm 2023-03..05: 4 missing of 1,430 cells.
- What the missing cells hide: 857 an order month, 121 off-phase, 1 lost-account cell, 3 unknown (young series).
- The order after a missing cell equals the order after a present cell (median 1.00 vs 1.00, MWU p = 0.82).
- Hide-and-impute on 3,997 orders (`k20`):

| imputation | WAPE | bias | investigator |
|---|---|---|---|
| local level x regional index | 0.257 | -3.2 % | 0.259 |
| median of neighbouring orders (within 6 months) | 0.270 | -3.5 % | median of 6 neighbours: 0.306 |
| mean of the two adjacent orders | 0.306 | -0.6 % | 0.346 |

  The ranking reproduces.

### F6 Blank `Units_Sold`; LatAm ERP migration - **confirmed (+1 small correction)**
- 3,544 rows without numeric units: 3,327 blank and 217 "-".
- 2,545 rows can be recovered exactly as revenue / price (max deviation from an integer 6e-14; price equals the
  canonical price on all 2,545).
- 35,390 / 35,390 numeric zeros carry price 0.
- 332 rows have price but blank units and blank revenue: all Latin America, Aftermarket 212 + Export 120, 108 / 111 /
  113 per month. Every present LatAm Aftermarket / Export row of 2023-03..05 (246 + 134 = 380) has blank units.
- 295 rows have positive units with price 0, all on-phase.
- **New evidence for the rule "blank units with price 0 means 0":** injected errors never share a row. Units-blank
  with price-in-cents: 0 observed against 8.5 expected under independence. Units-blank with EUR price: 0 against 6.9.
  Four other pairs: 0 against 0.7-1.4 (`k19`). So a double-blanked order (units blank and price 0) should not exist,
  and the 4 on-phase blank-or-dash price-0 cells are true zeros (India 2020-04 twice, MEA early months twice).
- **Correction:** 1 of the 332 ERP rows is off-phase: CSS-062 Latin America 2023-03, a T series off in Mar/Jun/Sep/Dec,
  after a weak February order (7 units vs about 45). It is a back-order spill, not a full order, so it should not be
  imputed like an on-phase order. The other 331 are on-phase.

### F7 Zeros are a deterministic, calendar-anchored ordering cycle - **confirmed**
- **Signatures.** 16,832 complete series-years show 121 distinct signatures; the top 16 cover 98.283 %. My majority
  masks contain only the 16 patterns (plus `?` variants for young series), and only 115 cells disagree over the last
  36 months. No 4- to 11-month or non-calendar cycle exists.
- **Shutdown months.** Region by month: Europe Aug 142, NA Jul 127, APAC Feb 44 / Dec 31 / Jan 25 / Jun 23, India
  Nov 46 / Jan 34 / Dec 26 / Jun 26, LatAm Dec 81 / Jan 36 / Jun 36, MEA Dec 33 / Jun 33 / Jan 29. The investigator's
  extra series are the young ones.
- APAC A-Feb series: January zero share 0 % in every year, February 95-100 %.
- The shutdown month is zero in 4,471 / 4,504 cells (99.27 %), exactly as reported.
- **Determinism with my own regimes.** P(order | on) = 99.889 % (232 zeros in 208,516 cells) against the reported
  99.871 % (269). P(zero | off) = 99.372 % (225 non-zeros in 35,847) against 99.374 % (224). 3,874 units were shipped
  off-phase, 0.033 %.
- The on-phase zero counts differ only in how launch-ramp zeros are assigned to an early regime.
- On-phase zero rate by local order size (age >= 12, outside 2020):

| local order size | <= 3 units | 3-5 | 5-8 | 8-12 | 12-20 | > 20 |
|---|---|---|---|---|---|---|
| on-phase zero rate | 2.8 % | 1.8 % | 0.23 % | 0.08 % | 1 / 13,974 | 0 / 137,090 |

- **Generator truth.** Off-phase stock-out rows have Requested = 0 in 857 of 873 under my regimes. All 16 exceptions
  are 1-3 units in launch-ramp cells that my free change-point fit put into an early pseudo-regime (ELA-007, ELA-012,
  ELA-026, ELA-037, ELA-067). That is the same artefact the investigator reports for ELA-026. On-phase rows with
  Requested = 0: 12, all at ages 0-3, plus the PMP-022 lost-account row.
- **Extra evidence (missed):** on on-phase B / Q / T rows, `Requested_Units` is 1.07-1.15 x the series' median order,
  the same as M / A (1.12 / 1.15). The generator's "true demand" for an order month is the accumulated order, so the
  test target for B / Q / T on-phase months is the accumulated quantity.

### F8 Exceptions: non-periodic zeros and off-phase shipments - **partially confirmed (definitional differences)**
- **Off-phase non-zeros.** 225, classified as 140 equal to the previous month's back-order, 40 with a same-month row
  (Requested 0, Carried_In > 0), 7 after another stock-out quantity, and 38 with no record. Investigator:
  139 / 40 / 7 / 38.
- Against the local order level (median order within +-6 months) the largest is 0.67 (PMP-051 MEA 2026-02; 9 above
  0.5); the report says 0.63.
- Against the whole-life median, two cells look like 0.94-0.98 of an order (ELA-058 Europe 2021-03, ELA-078 LatAm
  2020-11). Both series later switched from Q to M, so their whole-life median is wrong for 2020-21. Measured against
  the local level, "no one-off order in an off-phase month" holds.
- India 2020-04: median 4.1 % of the 2019 level, 59 zeros among 349 mature series; May 20 % / 2 zeros; June 38 %. It
  is the only region-month with 3 or more mature on-phase zeros.
- Last 12 months: 2 on-phase zeros (HYD-014 MEA at about 6 units per order, PTC-010 LatAm at about 2) and 38 spills.
  CSS-011 MEA (10 units) and ELA-058 LatAm (18 units) spill in 2026-10.
- My on-phase-zero breakdown (232 cells: 141 at age < 12, 69 India 2020-04..06, 12 other 2020) differs from the 269
  only through the ramp assignment.

### F9 Order = all latent demand since the previous order - **confirmed**
- **Regression** on 2,147 stable series (last 36 months, SKU and region fixed effects; `k05`):
  - Monthly-equivalent level relative to M: B 1.021, Q 0.969, T 1.015, A 0.950.
  - Order size relative to M: B 2.04, Q 2.91, T 1.45, A 1.03.
  - The A level of 0.95 equals 11.5 / 12 = 0.958, consistent with half the shutdown month being lost.
  - T series: the order after the gap is 1.99 x the next order (151 series).
- **Accumulate vs "k x current month"** at group level (pattern x region x month, n >= 3):
  - Median absolute log error: B 0.059 vs 0.073, Q 0.081 vs 0.100, T 0.084 vs 0.090.
  - Where the two predictions differ by more than 25 %, accumulate wins B 16/16, Q 24/26, T 15/18, with median
    errors 0.07-0.09 against 0.32-0.41 (investigator 16/16, 23/24, 14/14).
- **Latent-then-accumulate with a pre-buy** (stocking channels, `k09`). Monthly series ran at 1.43 in Dec 2022 and
  0.56 in Jan 2023. The B0 order of Jan 2023 came in at 1.09: accumulate predicts 0.995, "k x current" 0.556. The Q0
  order came in at 1.03: accumulate 0.997, "k x current" 0.556.
- **Shutdown catch-up.** c = 0.499 (ratio of sums over 3,464 orders; median 0.448, mean 0.507); 13 groups range
  0.41-0.55.
  - By year: 0.56, 0.45, 0.50, 0.47, 0.45, 0.56 for 2021-2026, so stable.
  - The flat multiplier correlates with the size of the skipped month: r = 0.94.
  - No pre-buy before the shutdown (1.001) and no effect two months after (1.003).
- **Nexon strike.** Monthly series at 0.142 and 0.130 of baseline in Oct-Nov 2023 (other Europe 1.03 / 0.94), with
  0 zeros in 40 cells.
  - Dec 2023 by series median: 0.82, i.e. no catch-up.
  - Note: the ratio of sums for Dec 2023 is 1.24 x other Europe. It is driven by a single 4.1x order (HYD-068 Europe,
    Dec 2023), a one-off in the middle of the block. A December "catch-up" read off sums would be wrong.
- **Noise per order.** Robust log-s.d. at equal order size: M 0.28-0.30, B 0.27-0.29, Q 0.25-0.30. Independent
  monthly noise would shrink the B and Q values by sqrt(k). So noise is per order, and the report's rule (no sqrt(k)
  shrinkage) is right.

### F10 Cycle changes - **confirmed**
- 27 changes, identical series, the same change month for 27 / 27: Q -> M 18, M -> B 6, M -> Q 3. Regions LatAm 8,
  India 5, Europe 5, APAC 5, NA 4. Months 2022-01 .. 2023-11.
- My free detector flags 11 more. All are launch or MEA ramp artefacts (ELA-007 x2, ELA-012, ELA-013, ELA-026,
  ELA-037, ELA-067, ELA-069, HYD-001, PMP-039, PTC-010 MEA), and the investigator marks them the same way.
- **Level ratio with a same-SKU control** (24 of the 27 have a control): median about 1.03, range 0.49 (THM-044) to
  1.48 (ELA-053). The report says 1.003, mean 1.013 +- 0.029. There is no systematic step, so "no level adjustment"
  stands, but the individual ratios are noisy.
- No change in an A <-> M direction hides below the detector threshold (`k20` b). In the last 12 months, 34 series
  have an order in a former zero month: all spill-sized, at most 0.54 of a local order. The 3 new zeros are two
  low-volume series and one spill artefact.

### F11 Lost accounts - **confirmed**
- 16 series with the same last-order months.
- Trailing non-order run at 2026-10: 2,648 / 314 / 79 / 1 series with runs of 0 / 1 / 2 / 3, then only 10-19
  (these 16). The single run of 3 is BSS-008 NA: zero, missing, zero in a B0 series, not a loss.
- 0 units and price 0 in every lost cell; same customer throughout; 9 customers, 5 regions.
- The last 3 orders before the loss average 0.80-1.48 of the earlier median, so there is no decline beforehand.
- 0.69 % of volume (12,106 units in the last 12 months before the loss).
- Generator truth: PMP-022 India 2026-07 has `Requested_Units = 0`.
- 0 cases in the whole history where 3 or more consecutive scheduled orders were missed and orders then resumed.
- The forecast of 0 is the right call; the only residual risk is a scripted return, which cannot be tested.

### F12 Customer switches - **partially confirmed (minor wording)**
- 23 series with exactly one switch, 0 with two; channel constant in 3,083 / 3,083.
- Switch years 2022 / 23 / 24 / 25: 4 / 5 / 8 / 6.
- 10 losses and 13 gains. No cycle change at any switch, and the test file carries the post-switch customer.
- Without a regional adjustment, 2 ratios are close to 1 (CSS-085 India 0.91, BSS-001 APAC 0.88). "Never about 1"
  holds only after the investigator's drift adjustment.

### F13 Cycle determinants and the prior for new series - **confirmed**
- Having a B / Q / T cycle does not depend on region (p = 0.74), customer (0.86), channel (0.79), family (0.74),
  powertrain (0.36) or launch cohort (0.62).
- **Cohort effect.** A share among monthly-type series: 2019 cohort 37.8 % (571 / 1,511), later launches 26.0 %, MEA
  opening 24.9 % (p < 0.0001). India-November and APAC-February shutdowns: 45 and 41 series in the old cohort, 1 and 3
  in the new.
- **Late-cohort prior** (shares by kind) is reproduced:

| kind | M | A | B | Q | T |
|---|---|---|---|---|---|
| this check (late cohorts) | about 55 % | 19 % | 10 % | 8.5 % | 7 % |
| report | 55.1 % | 18.9 % | 10.3 % | 8.6 % | 7.2 % |

- **Young series.** The raw values support the posteriors:
  - ELA-017 Europe 3, 0, 45, 0, 59, 0, 74 -> B1.
  - THM-011 NA 18, 0, 54, 0, 67, 0 -> B0.
  - ELA-017 LatAm 3, 0, 36, 15, 0, 24, 16 -> T1.
  - The A-type calls rest on a single zero at age 0-2 and are rightly kept uncertain (PMP-019 Europe 0, 14, 17).
- Three test rows have 0 < p_order < 0.5 and are forced to 0, consistent with the stated absolute-error rule.

### F14 Zero-mask safety and test mask - **partially confirmed**
- **Test mask.** 0 disagreements where my mask gives an answer (8,351 off-phase, 304 lost, 156 after EOL); see the
  verdict above.
- **Accumulation counts.** The `k_accum` column equals my own on 48,888 / 48,888 comparable rows. The first test order
  is correct for every pattern: B 2, Q 3 (it includes Sep / Oct 2026 latent demand from train), T0 / T1 2, T2 1.
- **Rolling origin** (my cruder origin mask, `k04`). Units falling in predicted-off months: 0.31 / 0.25 / 0.36 / 0.19 /
  0.04 % at origins 2021-03 / 2022-03 / 2023-03 / 2024-03 / 2025-03 (report: at most 0.33 %). P(zero | predicted off)
  is 96.4-99.2 %. Conclusion unchanged: forcing zeros costs below 0.4 % of volume.
- **Backtest at origin 2025-03** reproduced: flat 0.506, seasonal naive 0.369, cycle-aware 0.289; bias +6.9 % / +5.7 %.
- **Correction:** the bias is not a stable +6 %. The same cycle-aware method is **-6.3 %** at origin 2024-03 (WAPE
  0.283) and **-3.3 %** at 2023-03 (WAPE 0.295). Open question 2 ("every simple method is 6 % too high") is
  specific to one origin; no downward correction should be built on it.

### F15 Intermittency classes - **confirmed**
- Exact match: smooth 2,190, intermittent 742, erratic 108, lumpy 43; volume shares 72.3 / 24.0 / 2.4 / 1.3 %.
- Median CV^2 = 0.18.
- Zero share per series: 1,388 series with none, median 6.9 %, upper quartile 30.6 %, 772 above 30 %, 239 above 60 %,
  maximum 69.2 %.

---

## Corrections the pipeline must apply

1. **EOL phase-out (F4):** apply the factors relative to the level 7-12 months before EOL (that is, the model's own
   recent level). Either use `factor(h) = min(1, 0.38 + 0.104 h)` for h = 0..5 months before EOL, or use the empirical
   0.92 / 0.83 / 0.76 / 0.67 / 0.54 / 0.32. Do **not** use 0.50 / 0.57 / 0.40 / 0.27 on a recent-level baseline (about
   25-35 % too low). It applies to 6 months x 18 series = 108 test rows of PTC-005 (2026-12..2027-05), PMP-003
   (2027-03..08) and THM-001 (2027-07..12). After EOL the forecast stays 0 (156 rows).
2. **After a shutdown month, use `latent(t) + 0.5 x latent(shutdown month)`, never `1.5 x latent(t)`.** The
   `k_accum_months = 1.5` column of `test_phase_mask.csv` is a count, not a multiplier. On the 2023-26 regional index,
   1.5 x own is wrong by +14.6 % for Europe after August (142 series), +9.2 % APAC after February, +5.6 % NA after
   July, -6.4 % APAC after December and -5.3 % LatAm after December. It affects 1,139 test rows. In the same way,
   B / Q / T orders must sum the latent months they cover; do not compute k x latent(t).
3. **CSS-062 Latin America 2023-03** (ERP-blank row, off-phase): treat it as a back-order spill (small) attached to
   2023-02, not as a full order.
4. **Do not de-bias forecasts by -6 %** on the strength of the 2025-03 backtest; the bias sign flips across origins.
5. **Ramp estimates must control for the EV trend** (powertrain-specific index). An uncontrolled estimate doubles tau
   (4.5 -> 9-10) and would under-forecast the young EV series ELA-017, THM-011 and PMP-019 and the planned launches
   PTC-029 and PMP-020.
6. When reading event effects from group sums (the Nexon December, later EV-062), use medians or exclude one-off
   orders. HYD-068 Europe Dec 2023 (4.1x) alone turns "no catch-up" into "+24 %".

## Missed (within this lens)

1. **The first order of a newly launched B / Q series does not accumulate the months since launch.** Measured in
   months of the mature level (`k17`, 168 late-launch B / Q series):

| first scheduled order at age | B: observed median | Q: observed median | accumulated since launch | current month only |
|---|---|---|---|---|
| 0 | 0.11 | 0.12 | 0.20 | 0.20 |
| 1 | 0.36 | 0.39 | 0.56 | 0.36 |
| 2 | - | 0.62 | 1.05 | 0.49 |

   For the 10 planned-launch series, use one month of ramped demand for the first order.
2. **The T-pattern phase of a new launch is anchored to its launch month.** 23 of 36 late-launch T series are off in
   their launch month (12 expected; binomial p = 0.00025). The report calls this "possibly chance"; it is not. B and Q
   show no such anchoring (33 / 30 and 21 / 19 / 19). This matters for the phase prior of the planned launches.
3. **Generator-truth evidence for accumulation:** see F7 (Requested on B / Q / T order months about 1.1 x the median
   order, like M).
4. **Injected errors are mutually exclusive per row** (0 co-occurrences against 0.7-8.5 expected). This supports
   "blank units with price 0 means zero" and should be stated in the data-quality report.
5. **One-off spikes near the origin feed a last-12-month level.** 95 on-phase orders in the last 12 months exceed 3x
   their series median (88 series). Examples: PTC-054 India 2026-08 is 12.6x, CSS-036 NA 2026-08 9.3x and THM-032
   Europe 2026-09 6.2x (752 units). BSS-008 North America has 2,002 units in 2026-07 against 233-461 normally, and its
   next on-phase month (2026-09) is a missing row. The report's cycle-aware baseline uses the raw last-12-month level;
   these series need the outlier lens's treatment before any level is estimated.
6. **Pack-of-10 rows** (India 2021 H2): 10 x units and revenue / canonical price both give the rounded value. The
   stock-out file disagrees on 36 of 42 such listed rows (for example 20 vs 18 and 10 vs 13), so the true units are
   known only to +-5. Use `Shipped_Units` where listed (42 rows); this is a cross-lens point.
7. The phase-out begins at h = 5 (0.92) and h = 4 (0.83), not only in the last four months (see correction 1).

## Scripts (all in `research/scratch/panel-missing-zeros-verify/`; working files, not included in the repository)

`k01_build.py` (panel, dedup, cleaning) -> `k02_cycles.py` (masks, lost accounts) -> `k03_testmask.py` -> `k04_determinism.py`
(change points, determinism, rolling origin) -> `k05_accumulate.py` -> `k06_stockouts.py` -> `k07_missing_blank.py` ->
`k08_lifecycle_accounts.py` -> `k09_more.py` -> `k10_nexon.py` -> `k11_backtest.py` -> `k12_artefact_check.py` ->
`k13_misc.py`, `k14_ramp.py`, `k15_ramp_ev.py`, `k16_quick.py`, `k17_recent.py` (first skeptic, re-run) ->
`k18_closedform.py`, `k19_newchecks.py`, `k19b_phaseout.py`, `k20_extra.py`, `k20b_zero_candidates.py`, `k21_pack.py`
(this review). `k04` takes about 4 minutes; the others take under 1 minute each.
