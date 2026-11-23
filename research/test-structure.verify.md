# Skeptic review of lens `test-structure`

Reviewed report: `/home/pavan/Desktop/mks/research/test-structure.md` (15 findings).
I recomputed every finding from `/home/pavan/Desktop/mks/data/raw/*.csv` (`dtype=str, keep_default_na=False`) with new code in
`/home/pavan/Desktop/mks/research/scratch/test-structure-verify/`. I did not import or read any script or artefact in `research/scratch/test-structure/`.

**My own base data.** `v00_panel.py` builds the panel from scratch:
- dates from Load_Timestamp month minus 1, which agrees with my own Date-text tokeniser on 100% of rows;
- my own label maps;
- decoding by Record_ID block: 3,083 offsets, 0 conflicts;
- latest-load de-duplication;
- my own units clean, using a canonical price per SKU and period;
- unconstrained demand = `Requested_Units` on listed cells, minus the back-order carried into the following month.

It reproduces the counts the other lenses established: 244,566 records, 3,083 series, 245,548 cells, 982 missing rows, x10 293, x100 75, pack-of-10 385, negatives 491, and 332 unknown LatAm cells. One-off orders are **not** neutralised in my data. That is why a few of my metric values sit about 0.5–0.8 points away from the report's.

**Bottom line.** Nothing is refuted. The test-file contract, the cold starts, the post-EOL rows, the coverage, the customer continuity, the 23 switches, the 16 lost accounts, the Nexon and Helios event effects, the 100-SKU core tier and the 8,842 structural zeros all reproduce. Most reproduce exactly. The backtest also reproduces exactly wherever one-offs play no part.

**One correction matters for the forecast: the phase-out rule in F3.**
- The decline starts about 12 months before EOL, not 6.
- The factors therefore have to be applied against the level from before the decline.
- The report's statement "no decline yet" is wrong for PTC-005.

Smaller corrections apply to F9 (the core regional profile is a full vector, not only LatAm; the tail LatAm level is about 0.90, not 1.0) and to F14 (the count of 42 shifted series does not reproduce).

**Tally:** 12 confirmed, 3 partially confirmed, 0 refuted. A few sub-items were not checked; they are listed under each finding.

| # | Finding | Verdict |
|---|---|---|
| 1 | test.csv clean and complete; keys are the contract | **confirmed** |
| 2 | Short series = planned launches, rows start at Launch_Date | **confirmed** |
| 3 | 156 post-EOL rows; phase-out factors | **partially_confirmed** (rows exact; phase-out rule wrong) |
| 4 | Train vs test coverage | **confirmed** |
| 5 | No customer/channel change at or inside the window | **confirmed** |
| 6 | Customer switch = immediate permanent step, cycle unchanged | **confirmed** |
| 7 | Account events confined to windows inside train | **confirmed** (medium; p-values are post-hoc) |
| 8 | Customer events joined on customer at the time | **confirmed** |
| 9 | Row order = generator order; two SKU tiers | **partially_confirmed** (tiers exact; profile description incomplete; "no LatAm discount" overstated) |
| 10 | Output contract, rounding | **confirmed** (validator script not run) |
| 11 | 8,842 structural zeros | **confirmed** |
| 12 | Cycle-blind vs phase-aware backtest | **confirmed** |
| 13 | Stay near the mean | **confirmed** |
| 14 | Level window, horizon profile | **partially_confirmed** (count of 42 shifted series not reproduced) |
| 15 | Series state / risk groups | **confirmed** (spot-checked; 89-column table not rebuilt) |

---

## Evidence per finding

### F1. test.csv clean and complete — confirmed (`v01_test.py`)
**Format**
- 58,219 x 10, with 0 blank cells and 0 leading, trailing or double spaces.
- Date is `YYYY-MM` on every row, 19 months from 2026-11 to 2028-05. Year and Month agree with Date; Month is never zero-padded.
- SKU matches `AAA-999` on every row.

**Labels and keys**
- Distinct values: 7 families, 5 BUs, 4 channels, 6 regions, 12 customers, 595 SKUs, 595 descriptions.
- 0 duplicate rows and 0 duplicate keys.

**Series**
- 3,068 series. Each is contiguous and ends in 2028-05.
- Rows per series: 19 for 3,058 series, 15 for 3, 12 for 4, 8 for 3.
- Rows per month: 3,058 (4 months), 3,061 (3), 3,065 (4), 3,068 (8).

**Consistency with the master**
- Customer, channel, family, BU and description are constant within every series. Family, BU and description are constant within every SKU.
- Family and description match the master for 595 of 595 SKUs, BU for 594. PMP-004 is `Advanced Manufacturing` in test, `Power & Drive Systems` in the master.

**MEA**
- MEA series have their own customers: Atlas 180, Falcon 172, Kestrel 166. These customers appear in no other region.
- Export series: 237 of 518 in MEA, against 32–50 in each other region.

### F2. Short series are the launches — confirmed
- The 10 short series are PTC-029 x3, PMP-020 x4 and THM-012 x3. Their first test month equals `Launch_Date` for 10 of 10.
- 0 test rows fall before a launch, and no 19-row series has a launch after 2026-11.
- Each successor launches exactly 2 months before its predecessor's EOL (2027-03 / 05, 2027-06 / 08, 2027-10 / 12).
- In all 10 shared regions the successor's customer and channel differ from the predecessor's last train values. Example: PMP-020 India is Vantara / Tier-1, while PMP-003 India is Crestline / Direct OEM.

### F3. Post-EOL rows and phase-out — partially_confirmed (`v01_test.py`, `v06_phaseout.py`)
**Rows: exact.**
- PTC-005 72, PMP-003 54, THM-001 30, a total of 156 rows after EOL.
- 18 rows fall in the EOL month and 186 rows are up to and including EOL.
- No other test row lies after a master EOL.
- All 25 discontinued train series end in their EOL month.

**Phase-out: the rule is wrong.** My profile covers the 23 discontinued series that have a baseline. Demand is adjusted for drift by a region x month index built from complete control series. The base is each series' level 13–30 months before EOL. Bootstrap over series, 90% CI:

| Months to EOL | -30..-25 | -24..-19 | -18..-13 | **-12..-7** | -6..-4 | -3..-1 | 0 (EOL month) |
|---|---|---|---|---|---|---|---|
| Ratio to base | 1.11 | 0.97 | 0.92 | **0.79 (0.72–0.87)** | 0.78 (0.67–0.90) | 0.51 (0.45–0.58) | 0.39 (0.26–0.54) |

- Every one of the 6 discontinued SKUs shows the drop at -12..-7 (0.80–0.89 against the level 13–24 months before EOL).
- Excluding ELA-014, whose base falls in the chip shortage, changes nothing (0.79 / 0.80 / 0.53 / 0.42).
- The report's own number for -12..-7 is 0.74, so it saw the early decline. Its rule, however, multiplies only the **last 6 months**, by factors measured against the level 7–12 months before EOL. In a pipeline whose baseline is the 18–24-month level that the report recommends, this goes wrong in two ways:
  - **Months -12..-7 get no factor at all**, although they sit at about 0.8:
    - THM-001: 2026-12..2027-05, 36 rows;
    - PMP-003: 2026-11..2027-01, 18 rows.
  - The last-6-month factors are then applied to a base that has not declined yet. That overstates those rows by about 1/0.79, i.e. +27%, for PMP-003 and THM-001.
- My data shows no extra decline from -12..-7 to -6..-4 (1.04 against the -12..-7 level). The report gives 0.85 / 0.84 / 0.80. Both lie inside my confidence intervals, so a flat ~0.8 from -12 to -4 is what the data supports.

**"The three announced SKUs show no decline yet at 2026-10": wrong for PTC-005.** The report compared the last 12 months with the previous 12. For PTC-005 the last 6 months (2026-05..10) are exactly months -12..-7.
- Drift-adjusted, last 6 / previous 12 = **0.82**. Raw, PTC-005 is 303 against 329, while all core series rose from 29.3 to 33.3 (relative ratio 0.81).
- Last 12 / previous 12 = 1.01, which is the report's figure.
- PMP-003 (origin = month -10): last 6 / previous 12 = 1.01. THM-001 (month -14): 1.03, as expected since it is not yet in the decline window.
- Caveat: PTC-005 had a dip of the same size in 2024-11..2025-04 (relative-to-core level 9.2 against about 11.3). The 0.82 is consistent with the decline but does not prove it.

**Impact.** About 108–160 rows and roughly 1,000–1,500 units (about 0.05% of test volume). This is small, but it sits in the lifecycle view that the jury will look at.

### F4. Coverage — confirmed
- Train has 3,083 series and test 3,068; 3,058 are common.
- Train-only: 25 series = all series of the 6 discontinued SKUs (HYD-020 6, THM-009 5, ELA-014 4, PTC-025 4, PMP-017 3, PTC-026 3). None of these SKUs is in test.
- Test-only: the 3 launch SKUs.
- 16 common series have no 2026-10 row. It is the same list as in the report, starting BSS-052/LatAm, BSS-070/Europe ... THM-057/India.

### F5. Customer, channel and description continuity — confirmed
- Test customer = last train customer for 3,058 of 3,058 series, and = first train customer for 3,035.
- 23 series have exactly one change each; none has two or more. 0 series ever change channel.
- Every SKU has exactly one non-blank description in train (599 raw variants = 598 descriptions + blank).
- Customer and channel take exactly 1 value inside every test series.
- Caveat on interpretation: "0 switches in test" is evidence only if test.csv was cut from the same time-varying table as train. That is likely, because train's customer column does vary month by month, but it cannot be proven.

### F6. Customer switches — confirmed (`v05_switch_events.py`)
**List and timing**
- The same 23 series in the same months (2022-07..2025-05).
- By year 4 / 5 / 8 / 6; by region India 6, Europe 6, Asia Pacific 4, LatAm 4, North America 3, MEA 0.
- 0 gap months between old and new customer.

**Step sizes**
- My control-adjusted 12/12 ratios are within ±0.07 of the report's. Examples: HYD-013 0.54, PMP-047 0.54, THM-026 1.68 (report 1.61), HYD-059 2.10, PTC-050 0.68.
- 10 down and 13 up; geometric mean 1.118 (report 1.115); sd of the log 0.444 (0.442).

**Placebo**
- 2,557 random non-switch windows, split months 42..76: sd of the log 0.234 (report 0.22).
- 42.5% of placebo windows lie beyond ±18% (report 36%), against 21 of 23 switches. The step is real.

**Permanence and cycle**
- The ratio for months 13–24 correlates 0.94 with months 1–12 (n = 16; report 0.97).
- Cycle is unchanged in 23 of 23. My mask comparison flags PMP-015/Europe, but the cause is the missing 2026-01 row (cell 84 absent), not a real change.

**Not checked:** the customer fixed-effect regression and the month-0..3 immediacy table.

### F7. Event windows — confirmed, medium (`v02_cycles.py`, `v05_switch_events.py`)
**Cycle changes**
- A free single change point per series finds 28 changes. One is spurious: PMP-039/MEA, gain 6, where the MEA-opening ramp starts with an irregular mask. That leaves **27, at month index 36..58**.
- The first one is PTC-058/LatAm at index 36, the report says 37. A Q -> M change point is only identified to within the off-months of the old cycle, so the difference does not matter.

**Switches and losses**
- Switches at index 42..76. Lost accounts: first on-phase zero at 75..84.
- 0 series belong to two sets. At SKU level 3 SKUs do (PMP-074, BSS-082, CSS-085). About 1.9 such SKUs are expected by chance, so this is nothing.

**Half-visible losses and backtest cost**
- No series is half-lost: all 3,042 live, non-lost series that run to 2026-10 have 0 trailing on-phase zeros.
- At origin 2025-03 the lost accounts add 14,957 units of absolute error, 0.59% of volume (report 14,906, 0.59%).

**Caveat**
- The arithmetic behind the p-values reproduces.
- They are post-hoc, though: the window bounds are set by the same events.
- Only the switch window is independently corroborated, by test.csv.
- "No hazard haircut" is a reasonable point decision. The report itself keeps the rest to medium confidence and uses it only for ranges.

### F8. Customer events — confirmed (`v05_switch_events.py`)
**Nexon Europe strike (2023-10..11)**
- 45 series treated (report 47; I drop lost and incomplete ones).
- Treated / control: 0.227 and 0.202 in the strike months (report about x0.25 and x0.18).
- Afterwards 0.96, 1.12, 1.13 and 1.01 for 2023-12..2024-03.

**Helios India (from 2025-09)**
- 62 series. Treated / control averages 0.97 in 2025-01..08 and 1.25 in 2025-09..2026-10.
- Step **1.29** (report +27%).

**Orion North America (2027-07..08)**
- 62 test series, none lost, none ever switched.
- Cycles M 26, A 18, B 9, Q 5, T 4; 34 on-phase rows in July and 51 in August.
- Level 3,347 units a month (report 3,296).
- The size of the effect (x0.2) cannot be checked, because no data covers it.

### F9. Row order and two SKU tiers — partially_confirmed (`v01_test.py`, `v04_tiers.py`)
**Order: exact**
- Each series is one contiguous block. SKU blocks are contiguous and ascending, and months ascend within each series.
- Region order in test equals the Record_ID order in train for 592 of 592 SKUs.
- The 5 rows of `sample_submission` are the first 5 test keys.

**Tiers: exact**
- Exactly 100 SKUs list all six regions in the canonical order.
- They are precisely BSS-001..011, CSS-001..009, ELA-001..013, HYD-001..019, PMP-001..016, PTC-001..024 and THM-001..008, with no exception.
- Tail SKUs by number of regions: 3 regions 5, 4 regions 160, 5 regions 178, 6 regions 158. The first region is spread evenly, 78–96 per region.
- Only 9 of 501 tail SKUs list their regions in canonical relative order, so the tail order really is random.

**Lifecycle, volume and cycle mix by tier: exact**
- All 3 EOL-announced SKUs are core. All 6 discontinued SKUs, all 9 replacement SKUs and all 3 planned launches are tail.
- Volume share 22.6% core / 77.4% tail.
- Cycle mix (M / A / B / Q / T): core 30.2 / 44.3 / 10.8 / 6.2 / 8.5%, tail 54.2 / 20.4 / 9.2 / 8.3 / 7.2%.
- LatAm against the other non-MEA regions (2019): core 0.461, tail 0.909.

**Correction 1: the core regional profile is a full vector, not "LatAm at half".** Log-level regression with SKU fixed effects, North America = 0:

| Tier | Europe | Asia Pacific | India | Latin America | MEA |
|---|---|---|---|---|---|
| core | -0.10 (t -1.7) | -0.12 (t -2.1) | **-0.25 (t -4.4)** | -0.78 (t -13.7) | -0.89 (t -15.6) |
| tail | 0.00 | -0.04 | -0.03 | -0.04 (t -1.5) | -0.72 (t -24.7) |

- Relative to North America, core is EU 0.91, AP 0.89, India 0.78, LatAm 0.46 and MEA 0.41.

**Correction 2: "no Latin America discount" in the tail is overstated.**
- The within-SKU median LatAm ratio is 0.90 (0.88 for tail SKUs launched since 2019).
- That is not significant, but it is not 1.0 either. The `lifecycle-master` lens's "15–20% below" and this report's "no discount" bracket the truth (about -10%).
- The 6 core SKUs launched after 2019 (all EV) have a LatAm ratio of 0.81 (n = 6, noisy).

**Impact.** Small. Continuing series use their own level. The cold starts are about 0.2% of volume.

### F10. Output contract — confirmed
- Header `Date,SKU_ID,Region,Units_Sold_Forecast`; values are plain integers (`50`).
- Rounding, checked on my backtest forecast:
  - rounding to nearest changes WAPE by -0.004 points;
  - flooring moves bias by -0.84 points (report -0.84 = -0.886 - (-0.046)).
- Not run: `validate_submission.py` (investigator code).

### F11. 8,842 structural zeros — confirmed (`v02_cycles.py`, `v03_candmask.py`, `v08_misc.py`)
**Count**
- Fitting the best of 21 periodic masks over the last 36 months reproduces **8,382** off-phase rows. With the 304 lost-account rows and 156 post-EOL rows the total is **8,842 (15.19%)**, exactly the report's figure.
- A free per-calendar-month vote with no candidate list agrees on 3,064 of 3,083 series. The 19 disagreements are all young series with empty months.

**History tracks the mask**
- In the last 24 training months the zero share tracks the off-phase share within **0.2 points** in every month, once lost accounts are set aside.
- The report's months reproduce exactly: 2025-03 12.26%, 2025-12 18.75%, 2026-06..08 17.28 / 16.62 / 17.72%, 2026-09..10 12.99 / 12.95%.

**Off-phase spill is back-orders**
- Off-phase cells in the last 24 months: 10,650. Of these, 80 are non-zero in shipped units, but only 14 in unconstrained demand.
- On-phase cells: 62,053, of which 4 are zero in unconstrained demand.

**Caveat on young series.** 3 of the 18 just-launched masks rest on a single zero observation:
- PMP-019/Europe: A-Aug, from a zero in its launch month 2026-08;
- ELA-017/India: A-Jun;
- THM-011/Asia Pacific: A-Jun.

Each forces 1–2 test rows to zero. Young series contribute 39 of the 8,382 off-phase rows in total.

### F12. Backtest — confirmed (`v07_backtest.py`)
Origin 2025-03, horizon 19, 2,828 series. Masks fitted only on data up to the origin. WAPE % (bias %):

| Method | All | Excl. lost | M | A | B | Q | T |
|---|---|---|---|---|---|---|---|
| Flat mean | 50.3 (+5.6) | 49.8 (+5.1) | 28.6 | 36.2 | 101.5 | 133.3 | 77.9 |
| Flat median | 47.3 (-7.7) | 46.8 (-8.2) | 27.9 | 36.6 | 100.7 | 100.0 | 77.9 |
| Seasonal naive | 36.6 (+5.4) | 36.1 (+4.9) | 37.1 | 36.1 | 33.6 | 32.0 | 36.6 |
| Mask x mean order | 29.8 (+5.7) | 29.3 (+5.2) | 28.6 | 29.0 | 27.4 | 26.0 | 41.3 |
| Mask x median order | 29.2 (+1.8) | 28.7 (+1.3) | 27.9 | 28.4 | 27.4 | 26.2 | 39.9 |
| + accumulation, 12-month level | 28.7 | 28.1 (+5.1) | 28.6 | 28.0 | 27.4 | 26.0 | 28.7 |
| + accumulation, 24-month level | 27.0 | **26.5 (+0.8)** | 27.2 | 26.5 | 25.3 | 24.6 | 26.3 |

- The rows unaffected by one-offs match the report to 0.1 points.
- With accumulation, the report has 27.7 (+4.3) and 26.3 (-0.05). The gap is its one-off neutralisation (about 0.8% of volume), which I did not reproduce.

### F13. Mean vs median shading — confirmed
24-month accumulation forecast scaled by c:

| c | Row WAPE | Bias | Family x month | Region x month | Total by month |
|---|---|---|---|---|---|
| 1.000 | 26.54 | +0.77 | 7.36 | 7.21 | 6.46 |
| 0.985 | 26.36 | -0.74 | 7.33 | 7.30 | 6.49 |
| 0.965 | 26.21 | -2.76 | 7.54 | 7.79 | 6.74 |
| 0.940 | 26.17 | -5.28 | 8.33 | 8.82 | 7.71 |

- The row gain from shading stays at about 0.3 points while the aggregates get worse.
- My forecast is +0.8% biased because one-offs are not removed. That is why c = 0.985 is neutral for me, which is consistent with the report's advice to submit the mean of the one-off-free baseline.

**Noise floor (monthly series, last 24 months)**
- 1,500 series: sd of order / own mean 0.371, median 0.965.
- Volume-weighted mean absolute deviation 25.2%, or 23.8% after removing the region x month factor (report 24.3% / 22.8%; my figures include one-offs).

### F14. Level window and horizon — partially_confirmed
**Level window** (accumulation forecast, series with at least 36 months, WAPE %):

| Window W (months) | 3 | 6 | 12 | 18 | **24** | 36 |
|---|---|---|---|---|---|---|
| WAPE % | 30.6 | 29.5 | 28.1 | 26.8 | **26.5** | 27.2 |

The ranking is the same as the report's: 24 months is best.

**Horizon**
- WAPE is flat with horizon (23.9–31.1%).
- Bias follows the calendar with the same shape as the report: low in the first months, peaking at +16% in 2026-01, negative in 2026-09..10.

**Not reproduced: 42 series with last-12 / previous-12 ratio outside 0.667–1.5.**
- On raw unconstrained means I get **80 of 2,897** mature series (sd 0.184; 1% / 99% quantiles 0.66 / 1.57).
- The count depends on one-off neutralisation and on the level definition. The pipeline must recompute it from its own levels and not copy the number.

### F15. Series state — confirmed (spot checks)
**History lengths: exact**
- Test series with no history 10, under 12 months 18, 12–23 months 49.
- All 94 months 1,976; MEA with 58 months 466.

**Lost accounts: exact**
- The same 16 series with the same last-order months: HYD-081/NA 2025-03 ... BSS-082/India, ELA-055/LatAm and PMP-022/India in 2025-12.
- Each has 8–19 trailing on-phase zero months.

**Unknown cells and levels**
- Series with an unknown cell in the last 12 months: 153 (report 152).
- Level-dependent counts differ through the level definition: median 40.5 against 39.9; under 10 units a month 55 against 76; under 20 units 408 against 438.

---

## Corrections the pipeline must apply

1. **EOL phase-out (F3).**
   - Measure the factors against the level *before* the decline, i.e. 13–30 months before EOL.
   - Start the decline 12 months before EOL. Point values: **0.80 for months -12..-4, 0.50 for months -3..-1, 0.40 for the EOL month**, then 0 after EOL (156 rows, as reported).
   - Concretely: THM-001 gets x0.80 from 2026-12 to 2027-08 (54 rows), x0.50 for 2027-09..11 and x0.40 in 2027-12. PMP-003 gets x0.80 from 2026-11 to 2027-04, x0.50 for 2027-05..07 and x0.40 in 2027-08. PTC-005 gets x0.80 from 2026-11 to 2027-01, x0.50 for 2027-02..04 and x0.40 in 2027-05.
   - Do not apply the report's "-12..-7-relative" factors on top of a 24-month base.
   - For PTC-005, take the base from 2024-11..2026-04, because its last 6 months are already in the decline (x0.82).
   - Reconcile with the `lifecycle-master` and `panel-missing-zeros` verifications, which also find a graded decline starting 6–12 months out.
2. **Tier x region priors (F9).** If tiers are used, use the full core profile (NA 1.00, EU 0.91, AP 0.89, India 0.78, LatAm 0.46, MEA 0.41 against NA), not a LatAm dummy. For cold starts (tail), use LatAm at about 0.9–1.0 and MEA at x0.47–0.49.
3. **Young-series masks (F11).** Flag the three single-zero annual-shutdown masks as low confidence: PMP-019/Europe A-Aug, ELA-017/India A-Jun, THM-011/Asia Pacific A-Jun. Force zero there only if the dashboard states it. The volume effect is negligible either way.
4. **Shifted-level list (F14).** Recompute "last-12 / previous-12 outside 0.667–1.5" from the pipeline's one-off-neutralised levels. Do not hard-code 42.
5. **Cycle-change month (F7).** Record it as an interval (from the last order of the old regime to the first off-month of the new one), not one month. This is for the register only and changes no forecast.

## Missed

1. **Core annual-shutdown months are fixed per region.**
   - Core A-series: North America July 60/60, Europe August 49/49, Asia Pacific February 44/44, India November 46/46, LatAm December 52/52. MEA is mixed (Dec / Jan / Jun).
   - Tail A-series: North America July, Europe August; the other four regions draw from Dec / Jan / Jun.
   - These match the calendar holidays (EV-056/063 NA retooling in July, EV-057/064 EU shutdown in August, EV-060/066 Lunar New Year in February).
2. **Monthly-cycle series also dip in the holiday months.**
   - Month-of-year index for M series: Europe August 0.66, North America July 0.85, Asia Pacific February 0.78 (January 0.85), LatAm January 0.74.
   - For A series: Europe August 0, September 1.46; North America July 0, August 1.48. This supports the accumulation weight of 1.5 after a shutdown.
   - So the holiday events in the forecast window are a *seasonal factor on top of* the masks: they are neither fully carried by the masks nor to be applied twice to A series. This belongs with the seasonality / events lenses (`v09_holiday_vs_mask.py`).
3. **PTC-005 is probably already in its phase-out at the forecast origin** (last 6 months x0.82, drift-adjusted). The report says the opposite.
4. **F8 omits two global price increases inside the window:** EV-059 (+4.5%, 2027-01) and EV-065 (+4.0%, 2028-01). The `numeric-reconcile` lens found pre-buying only before the 9% rise. The events lens should confirm that 4–4.5% rises cause no pre-buy in the Dec 2026 and Dec 2027 test rows.
5. **The phase-out evidence is thin.** It rests on 23 series from 6 SKUs, all tail, while the 3 EOL-announced SKUs are core. The tier difference in level and cycle does not by itself imply a different phase-out, but the dashboard should present the factors with their confidence intervals (above).
6. **Minor.** I count 435 distinct region orders once the 3 test-only SKUs are included (the report says 432, other lenses 433). Event series share an SKU across sets 3 times, which is chance level.

## Scripts (all in `/home/pavan/Desktop/mks/research/scratch/test-structure-verify/`)

| Script | Purpose |
|---|---|
| `v00_panel.py` | Independent panel: `vpanel.parquet` (245,548 cells), `vseries.parquet` |
| `v01_test.py` | F1, F2, F3 rows, F4, F5, F9 order, F10 |
| `v02_cycles.py` | Free-vote masks, lost accounts, cycle-change detection, test zeros |
| `v03_candmask.py` | 21-candidate mask fit, 8,382 / 8,842 reproduction, young-series sequences |
| `v04_tiers.py` | Tiers, regional profile, cycle mix, shutdown months |
| `v05_switch_events.py` | Switches, placebo, windows, Nexon, Helios, Orion |
| `v06_phaseout.py` | Discontinued phase-out profile, bootstrap, EOL-announced SKUs |
| `v07_backtest.py` | Backtest table, level window, scaling, rounding, horizon |
| `v08_misc.py` | Zero share vs off-phase share, noise floor, risk-group counts |
| `v09_holiday_vs_mask.py` | Holiday dips in M vs A series |
