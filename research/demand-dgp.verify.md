# Skeptic review of lens `demand-dgp`

**Bottom line.** The generator structure the investigator wrote down holds up when rebuilt from the RAW files with independent code. The parts that matter most for the forecast are confirmed: multiplicative group factors, backward order accumulation with a 0.5 shutdown carry, a seasonal profile shared by every SKU of a family and fixed across years, order-level negative-binomial noise with region-specific dispersion, the EV-index powertrain factor, and one-offs that occur only in the Direct OEM and Tier-1 channels.

**Two numbers are wrong and would bias the forecast or the event scenarios. Both errors have the same cause:** the region x month factor was allowed to absorb a customer-level event.
- **Helios India step:** the true value is **x1.24**, not x1.19. While Helios India is left inside the India region factor, that factor rises 2.8 % after 2025-09.
- **Nexon Europe strike:** the true values are **x0.145 / x0.138 with no catch-up**, not x0.27 / x0.20 with a partial recovery. This is the only analogue available for the Orion North America event of 2027-07/08.

Two rules need softening:
- **Level window.** The best window is flat between 18 and 36 months. It is 24 months only at the 2025-03 origin; at 2023-03 and 2024-03 the best is 30 to 36 months.
- **Leakage cut-off.** "Below 0.24 cell WAPE = leakage" is not universal. An honest oracle-factor 24-month forecast scores 0.237 on another cell set, whose in-sample floor is 0.224.

I found no outright refutation.

**Method.** Scripts are in `research/scratch/demand-dgp-verify/` (working files, not included in the repository; `k01` … `k16`, `k_lib.py`), with logs in `logs/`.
- **Inputs.** The scripts read only `data/raw/*.csv`. Nothing from `research/scratch/demand-dgp/` is reused; I read two of its scripts only to check how its panel treated stockouts.
- **Own clean (`k01_clean.py`).**
  - Deduplication keeps the latest `Load_Timestamp`.
  - The Record_ID series offset recovers all 737 blank regions and the 30 dates written as 2062.
  - All 15 numeric states are corrected.
  - Demand = `Requested_Units` where the stockout file has a row. In the month after a back-ordered stockout that is not in the file, `Backordered(t-1)` is removed.
  - Result: 244,566 rows, 3,083 series, corrected units 11,723,379 and units == Shipped_Units on 5,767 / 5,804 matched rows. This is identical to the numeric-reconcile and stockouts verifiers.
- **Grid and cycles (`k02`).** The grid has 245,522 cells: 956 missing rows inside series, and the 26 missing first/last cells are not added. A cycle template (M, A1..A12, B0/1, Q0..2, T0..2) is assigned per series-year by minimum mismatch:
  - 20,981 of 21,306 series-years match with 0 mismatches and 260 with 1.
  - Dominant kinds per series: M 1,536, A 776, B 295, Q 246, T 230.
- **Factor model (`k03` / `k07`).** I fitted my own Poisson IPF, `L[s] x F[fam,t] x R[reg,t] x C[ch,t] x P[pt,t]`.
  - Fit set: M series and A series (shutdown month and the month after excluded), mature cells (age >= 24, more than 6 months before EOL), lost-account tails and ELA 2021-03..2022-09 excluded, one-offs masked in two passes. That is 155,476 cells of 2,266 series.
  - In-sample WAPE is 0.238 (investigator 0.239).
  - `k07` refits the same model without Helios India and Nexon Europe.

## Verdict summary

| # | Finding | Verdict |
|---|---|---|
| 1 | Multiplicative factor model, no interactions | **confirmed** |
| 2 | Level = SKU x region x lognormal series factor; cold-start prior | **partially_confirmed** (old-region multipliers and elasticity reproduce; MEA multiplier and channel effects differ; convention-dependent) |
| 3 | No trend; EV index is the only secular driver | **confirmed** (ICE slope -0.0130 in my fit vs -0.0115; both zero lag) |
| 4 | SKU-specific slow deviations; 24-month level window | **partially_confirmed** (SKU-year effects confirmed; the optimum window is 24 to 36 months and depends on the origin) |
| 5 | Seasonality: common x region, Thermal bump, channel year-end shift, fixed, no SKU seasonality, LNY / Ramadan day counts | **confirmed** (Ramadan partial-month rule unresolved; 2024-03 confounded by the Red Sea event) |
| 6 | NB noise on the order; dispersion by region | **partially_confirmed** (shape, order-level noise and region ordering confirmed; k values are about 10 to 15 % lower in my fit; channel and family "flatness" not reproducible with a global level) |
| 7 | One-offs: OEM / Tier-1 only, about 1 in 300, x3 to x10, no payback | **confirmed** |
| 8 | Order = backward sum of latent months; shutdown carry 0.5; phase fixed | **confirmed** (decisively) |
| 9 | Customer shocks: Nexon strike, Helios step x1.19, Orion scenario | **partially_confirmed**, with **corrected numbers** (Helios x1.24; Nexon x0.145 / x0.138, no catch-up) |
| 10 | Event shapes: pandemic, 2022-12 pre-buy, no early buying for small rises | **partially_confirmed** (pre-buy confirmed; pandemic table not_checked) |
| 11 | Hold-out benchmarks and the "0.24 = leakage" rule | **partially_confirmed** (structure reproduces; the leakage threshold is set-specific; baselines such as seasonal-naive were not re-run) |

## Findings in detail

### F1 Multiplicative factor model: confirmed
**Out-of-sample test.** I applied factors fitted on M/A series only to the B, Q and T series under backward accumulation (`k04`):

| kind | cells | WAPE | investigator |
|---|---|---|---|
| B | 9,651 | 0.2215 | 0.220 |
| Q | 5,298 | 0.2158 | 0.213 |
| T | 10,432 | 0.2265 | 0.232 |

**Interaction tests** (`k06`): variance of residual z-scores per group, against a within-group permutation.

| grouping | observed | permuted | reading |
|---|---|---|---|
| family x region x calendar month | 0.681 | 0.80 to 0.92 | no interaction |
| SKU x calendar month | 0.805 | 0.85 to 0.89 | no SKU seasonality |
| series x calendar month | 0.847 | 0.92 to 0.94 | no series seasonality |
| SKU x year | **3.14** | 0.83 to 0.84 | a large SKU-year component; investigator 2.87 |

The residual cross-correlation by pair type was not re-run. The SKU x year result above carries the same conclusion.

### F2 Level decomposition: partially_confirmed
Source: `k10_misc.py`, 2,008 series with at least 36 fit cells.

| quantity | reviewer | investigator |
|---|---|---|
| R2 of SKU + region | 0.690 | 0.646 |
| residual s.d. | 0.404 | 0.406 |
| SKU-level R2 | 0.421 | 0.420 |
| price elasticity (s.e.) | **-0.495** (0.068) | -0.55 (0.059), consistent |
| SKU-level residual s.d. | 0.318 | 0.297 |

Region multipliers (vs the geometric mean of the 5 old regions):

| region | reviewer | investigator |
|---|---|---|
| North America | 1.089 | 1.083 |
| Europe | 1.055 | 1.040 |
| Asia Pacific | 1.009 | 1.025 |
| India | 0.962 | 0.968 |
| Latin America | 0.897 | 0.895 |
| **Middle East & Africa** | **0.453** | 0.500 |

The MEA value depends on how the 2022 opening ramp is split between the series level and the region x month factor in the IPF, so it is a convention, not a finding.

Other effects:
- **Channel (log, vs Aftermarket):** Direct OEM +0.126, Tier-1 +0.081, Export -0.053, against +0.085, +0.055, -0.016. Same sign and order, about 1.5 times larger.
- **Customer:** the 9 non-MEA customers lie within 0.11 of each other (+0.04 to +0.11 vs Apex Tier One). The three MEA-only customers (-0.14 to -0.19) cannot be separated from the region dummy.
- **Cycle:** M vs A +0.032.

Impact is low: the prior matters only for the 3 planned launches.

### F3 No trend; EV index: confirmed (slope detail corrected)
**Yearly index** (`k14_trend.py`): total latent index (geometric mean over families, 5 old regions), 2019 → 2026: 1.022, 0.743, 1.164, 0.995, 0.991, 1.071, 1.017, 1.055. Investigator: 1.015, 0.728, 1.190, 1.021, 0.987, 1.069, 1.011, 1.052. This is a cycle, not a trend.

**ICE factor relative to Universal** (`k08_ev.py`), by year: 1.00, 0.94, 0.84, 0.77, 0.65, 0.59, 0.59, 0.575, identical to the report.
- Monthly OLS gives `log P[ICE] = -0.0130 x EV` (s.e. 0.0003, R2 0.962). Zero lag is best: R2 falls from 0.962 at lag 0 to 0.901 at lag 6.
- The yearly means imply about -0.0114, the investigator's value. Both agree that the relation is log-linear with zero lag.

**EV factor:** +0.0358 per index point (s.e. 0.0006, R2 0.985) from 2022-05; investigator +0.0366.

**Not stated clearly in the report.** The EV index path in the window is 91.2 … 94.6 (2027-05) … 90.7 (2028-01) … 91.9. Relative to 2026-10 (93.1), EV SKUs therefore swing from x1.055 at the peak to **x0.918** at the trough, and ICE SKUs by about ±3 %. "The decline has stopped" is true for ICE, but EV SKU forecasts must follow the index month by month, not stay flat.

### F4 SKU-specific deviations and the level window: partially_confirmed
- **SKU-year effects are real:** z-variance 3.14 vs 0.84 permuted.
- **Window test** (`k12_window.py`): oracle group factors, 1,435 full-history M/A series, test 19 months, cell WAPE by window length.

| origin | 12 | 18 | 24 | 30 | 36 | 48 | 60 | 75 | in-sample floor |
|---|---|---|---|---|---|---|---|---|---|
| 2025-03 | 0.2422 | 0.2385 | **0.2373** | 0.2387 | 0.2410 | 0.2444 | 0.2454 | 0.2489 | 0.2242 |
| 2024-03 | 0.2446 | 0.2431 | 0.2433 | 0.2423 | **0.2420** | 0.2425 | 0.2446 | – | 0.2236 |
| 2023-03 | 0.2541 | 0.2562 | 0.2523 | **0.2511** | 0.2520 | 0.2529 | – | – | 0.2273 |

  The investigator's 2025-03 ranking reproduces. The optimum is flat over 18 to 36 months, and earlier origins prefer 30 to 36. Shrinking the 24-month level towards the 75-month level does not help (0.2376 at weight 0.85).
- **Not checked:** the per-SKU driver regressions, the PCA, and the variogram table.

### F5 Seasonality: confirmed
**Absolute region profile** (`k06_season.py`; common profile x region profile, averaged over 2019 and 2021–2026), against the report:

| region / month | reviewer | investigator |
|---|---|---|
| Europe, Aug | 0.644 | 0.647 |
| North America, Jul | 0.835 | 0.838 |
| Latin America, Jan | 0.777 | 0.791 |
| Asia Pacific, Oct | 0.909 | 0.901 |
| India, Oct | 1.109 | 1.143 |
| Asia Pacific, Feb (mine includes the partial-LNY years) | 0.728 | 0.699 |

Strength (max / min): Europe 1.74, Asia Pacific 1.48, Latin America 1.38, North America 1.29, India 1.19.

**Fixed across years.** The year-to-year s.d. of the log relative region index is 0.0184 (investigator 0.019).

**Unlisted regional effects are fixed calendar effects:**
- **India October peak.** It sits in October every year: relative index 1.067 to 1.124 in October against about 1.0 in November. This holds in 2020, 2021, 2023 and 2024, when Diwali fell in November, so it is not Diwali.
- **Asia Pacific October:** 0.856 to 0.918 every year.
- **Latin America January:** 0.825 to 0.904 every year.

**Family deviations from the cross-family mean.**
- **Thermal:** May x1.098, Jun x1.083, Jul x1.101; Nov and Dec x0.92, Jan x0.948.
- **Other families:** within ±0.034, except Powertrain (PTC) at ±0.040 (Jan–Mar 0.965, Aug–Sep 1.04). The PTC pattern is not stable by year (`k10`) and looks like macro, not calendar.

**Channel year-end shift.**

| channel | December | January |
|---|---|---|
| Aftermarket | 1.084 | 0.967 |
| Tier-1 Distributor | 1.052 | 0.947 |
| Direct OEM | 0.934 | 1.055 |
| Export | 0.938 | 1.035 |

This matches the report.

**Lunar New Year** (`k11_lny.py`; Asia Pacific relative to the 4 *other* old regions — using all 5 compresses the effect by 4/5):
- Log effect **-0.0343 per day** (s.e. 0.0018, rmse 0.024); investigator -0.0345.
- 2027-02: x0.69 to 0.71.
- **2028-01: x0.81 to 0.84; 2028-02: x0.87 to 0.88** (log-per-day, log-fraction and linear-fraction models). Confirmed.

**Ramadan** (`k10`; MEA relative index): 2025-03 (30 days) 0.786 against neighbours of about 1.17 to 1.21; 2023-04 (21 days) 0.838; 2026-03 (19 days) 0.872. **But 2024-03 (21 days) is 1.052, hardly any dip.** It coincides with the Red Sea Export disruption, whose March catch-up (x1.61 per the events lens) masks Ramadan. The partial-month rule stays open, as the report says.

### F6 Noise: partially_confirmed
Source: `k05_noise.py`. 153,136 fit cells, leave-one-out series level.

**Region dispersion.** Pooled `Var = 1.43 m + 0.068 m^2`, or `phi = 0.0736` with the linear coefficient fixed at 1.

| region | phi | k, reviewer | k, investigator |
|---|---|---|---|
| North America | 0.0588 | 17.0 | 19.7 |
| Europe | 0.0594 | 16.8 | 18.4 |
| Asia Pacific | 0.0700 | 14.3 | 16.2 |
| India | 0.0843 | 11.9 | 12.8 |
| Latin America | 0.1026 | 9.7 | 10.2 |
| Middle East & Africa | 0.1083 | 9.2 | 8.5 |

The ordering is identical. My values are about 10 to 15 % noisier, because my mean model has no local level drift.

**Shape.** For means of at least 100, the quantiles of d/m match the negative binomial and not the lognormal:

| quantile | 0.5 % | 1 % | 99.5 % |
|---|---|---|---|
| observed | 0.405 | 0.456 | 1.918 |
| negative binomial | 0.402 | 0.450 | 1.889 |
| lognormal | 0.463 | 0.500 | 1.986 |

**Noise is applied to the order.** The phi of B, Q and T orders relative to region-matched M is 0.91, 0.93 and 0.99. Noise drawn per latent month would give 1/2, 1/3 and 2/3.

**Zeros** on scheduled months: 121 observed vs 102.7 expected under NB.

**Not reproduced: "flat by channel and family once region is set".** With region phi, the Pearson statistic is Aftermarket 0.913 vs Tier-1 1.046 and Direct OEM 1.033. By family it is BSS 1.081 and CSS 1.069 vs 0.97 to 1.01 for the rest. The per-series Pearson s.d. is 0.269 against 0.19 to 0.20 simulated.
- This is compatible with mean-model error: BSS and CSS have the largest SKU-specific fuel sensitivities (F4), and residual one-offs in the 2 to 3 x range sit in OEM / Tier-1.
- So it is not proof of channel-specific noise either. Treat the k values as ±15 %.

**Intervals** (`k15_intervals.py`). The investigator's NB(region k) P10/P90 around the oracle 24-month forecast at origin 2025-03 put **8.9 % below P10 and 9.8 % above P90** (my k: 8.0 % and 9.0 %). Confirmed for cell-level intervals when the factors are right.

### F7 One-offs: confirmed
Source: `k09_oneoff.py`. 181,373 on-phase cells, M/A from the fit plus B/Q/T backward fit; rule: more than 3 x expected and at least 25 units above it.

**Channel concentration** (455 one-offs, 2.51 per 1,000):

| channel | one-offs | per 1,000 | NB noise alone would give |
|---|---|---|---|
| Direct OEM | 233 | 3.34 | about 1.7 |
| Tier-1 Distributor | 220 | 3.81 | about 0.8 |
| Aftermarket | 0 | 0 | about 0.7 |
| Export | 2 | 0.08 | about 1.4 |

**Size and mass.**
- Multiplier quantiles: 5 % 3.30, 25 % 4.01, median 4.96, 75 % 6.21, 95 % 8.79, max 19.2.
- Excess units are 0.93 % of all demand and **1.24 %** of OEM + Tier-1 demand (investigator 0.92 % and 1.23 %).

**No payback.** Neighbouring months at lags -3 to +3 average 0.99 to 1.03 of expectation.

**Overlap with the numeric lens.** Of its 438 flags, 338 are in my list. Of those that fall in my scope but are not flagged (49), the median ratio is 1.85, mostly T / M series. My list adds 117 new ones. This matches the investigator's 387 / 51 / 154 pattern.

**Rule safety** (`k16_rule.py`).
- On mature cells, ">3.5 x with no absolute floor" flags 406 OEM / Tier-1 cells and **1** Aftermarket / Export cell, so false positives are negligible.
- "> 3 x and mu >= 25" misses 81 OEM / Tier-1 one-offs whose mu is below 25. The 3.5 x clause catches most of them.

### F8 Backward accumulation: confirmed (decisively)
Source: `k04_cycles.py`. 25,897 B/Q/T order months, using factors from monthly series only.

**WAPE by hypothesis:**

| kind | backward | forward | k x current |
|---|---|---|---|
| B | **0.2215** | 0.2450 | 0.2487 |
| Q | **0.2158** | 0.2438 | 0.2503 |
| T | **0.2265** | 0.6524 | 0.2409 |

**Decisive cases** (actual / expected):

| case | n | backward | forward | k x current |
|---|---|---|---|---|
| Europe, August covered, order placed later | 385 | **1.020** | 0.849 | 0.792 |
| Europe, order placed in August | 424 | **0.993** | 0.913 | 1.245 |
| Asia Pacific, February covered, order later | 456 | **0.988** | 0.887 | 0.781 |
| North America, July covered, order later | 341 | **0.998** | 0.931 | 0.828 |
| India, October covered, order later | 352 | **1.014** | 1.172 | 1.043 |

**Annual-shutdown series:** pooled **c = 0.4906** (n = 4,824; 0.43 to 0.55 by month, for months with more than 290 cases).
- The other on-months are at 1.000 and the second month after the shutdown at 0.9994.
- 6 of 4,831 shutdown months carry an order.

**Phase.** 98.5 % of series-years match a calendar template with 0 mismatches and 1.2 % with 1. My template matcher is cruder than the investigator's state codes, so the 100.000 % claim was not re-derived.

### F9 Customer shocks: partially_confirmed, numbers corrected
Source: `k07_customer.py`. Factors were refitted **without** Helios India and Nexon Europe, so the region x month factor cannot absorb the event.

**Helios India step: x1.240** (24 months before vs 2025-09 onwards).
- Per SKU: 10 % 1.134, median 1.263, 90 % 1.389 (n = 49 M/A series).
- By channel: 1.20 to 1.26.
- It is a step, not a ramp: the first 3 months give 1.235 and later months 1.242.
- Controls: other India customers 1.006; Helios in other regions 0.984 to 0.997.
- The events lens independently has x1.24.
- **Why the investigator's x1.19 is low:** when Helios stays in the fit, the India region factor (relative to the other regions) rises from 0.994 to 1.022 after 2025-09 (+2.8 %) and absorbs part of the step. Test file: **65 Helios India SKUs**.

**Nexon Europe strike: x0.145 (2023-10) and x0.138 (2023-11)**, not 0.269 / 0.199.
- Series ratio quantiles in October: 5 % 0.06, median 0.14, 95 % 0.26.
- Channels: 0.13 to 0.27.
- **No catch-up:** 2023-12 0.978, 2024-01 1.004, 2024-02 1.011 (investigator 0.935, 1.115, 1.163).
- With Nexon included, the Europe region factor dips by 7.8 % in both months, which contaminates every other Europe series in those months.

**Orion North America:** 62 series, history 0.886 to 1.07. There is nothing unusual.

**Scan of customer-region-months:** 5 of 4,404 have |z| > 4. These are the two Nexon months, two Helios post-step months (an artefact of a full-history level), and Vantara India 2021-10 at z = -4.1.

### F10 Event shapes: partially_confirmed
**Pre-buy.** Relative channel factors in December 2022 vs the mean of November and February:
- Tier-1 1.341 and Aftermarket 1.312, against OEM 0.755 and Export 0.753 (these are relative to the channel mean).
- January 2023: Tier-1 0.804, Aftermarket 0.841.
- In other years Tier-1 / OEM in December is about 1.10 to 1.16; in 2022 it is 1.78.
- So only the stocking channels bought early, and they paid it back. Confirmed.

**Smaller price rises.** The December ratios for 2019–2021 and 2023–2025 are flat, so there is no pre-buy for 2 to 5 % rises.

The pandemic table was **not_checked**. Impact is low: those months are masked or carried by dummies.

### F11 Hold-out: partially_confirmed
- **Reproduced:** the structure, a 24-month level near the optimum, and an in-sample floor about 0.013 to 0.025 below the best honest forecast (`k12`).
- **Not re-run:** the seasonal-naive, last-12-month and cycle-aware baseline numbers.
- **The leakage rule is wrong as a universal cut-off.** On my set of 1,435 full-history M/A series, an honest oracle-factor 24-month forecast scores **0.2373**, and the in-sample floor is 0.224. "Anything below 0.24 signals leakage" holds only on the investigator's exact cell set and target. The pipeline must compute its own in-sample floor on its own scoring set.
- **Target.** The investigator scored unconstrained demand. If the jury scores shipped `Units_Sold`, stockouts (about 0.8 % of cells) lower the actuals slightly.

## Corrections the pipeline must apply
1. **Helios Auto Parts, India: step x1.24 from 2025-09** (not 1.19), applied to the 65 test SKUs. Estimate it, and every region x month factor, with Helios India excluded from the factor fit or with an explicit step term. Otherwise the India factor carries +2.8 % from 2025-09, which over-states the other India series and under-states the step.
2. **Nexon Europe 2023-10 / 11:** multipliers x0.145 / x0.138 with **no catch-up**. Mask these cells and exclude Nexon Europe from the Europe factor in those months (otherwise Europe dips 7.8 %).
3. **Orion North America 2027-07 / 08 scenario.** The strike analogue is about x0.14 for both months with no catch-up, not 0.27 / 0.20. Use it as the primary scenario: it has the same `Customer Event` type as EV-038. Widen P10/P90 for the 124 cells.
4. **Level window:** use 24 to 36 months of de-factored, one-off-masked demand. It is flat in that range; do not hard-code "24 is optimal".
5. **Leakage threshold.** Drop the universal "< 0.24 = leakage" rule. Compute the in-sample floor on the pipeline's own backtest cell set.
6. **EV SKUs:** apply `exp(0.036 x (EV(t) - EV(origin)))` month by month in the window, a trough of x0.92 in 2028-01. ICE: `exp(-0.012 x ΔEV)`, about ±3 %.
7. **Noise:** use region-specific NB k with the investigator's values. They calibrate on my hold-out (8.9 % / 9.8 %). Treat them as ±15 %. Do not claim that dispersion is independent of channel or family.
8. **Panel:** subtract `Backordered(t-1)` from month t when month t is not in the stockout file. That is 1,091 cells and 13,321 units; the investigator's panel did not do it.

## Missed
1. **Customer events contaminate the region x month factors** (Helios India +2.8 % on the India factor after 2025-09; Nexon -7.8 % on the Europe factor in 2023-10/11). This is the root cause of both corrected numbers in F9. Any factor-based level de-factoring inherits it.
2. **Carried-in backorders** were not removed from the following month in the investigator's panel (`00_build_panel.py` uses `Requested_Units` only where a row exists): 1,091 cells, 13,321 units, about 0.11 % of demand. Low impact.
3. **Red Sea Export catch-up masks Ramadan in MEA 2024-03** (relative index 1.052 with 21 Ramadan days). Any Ramadan day-count fit must model Export 2024-01..03 first. This matters for 2027-02/03 (21 + 9 days) and 2028-01/02 (4 + 26 days).
4. **The EV-index path is not monotone in the window.** EV SKU forecasts swing by about 14 % peak to trough (x1.055 in 2027-05 to x0.918 in 2028-01, relative to 2026-10).
5. **The best level window depends on the origin:** 24 months at 2025-03, 30 to 36 at 2023-03 and 2024-03. One origin is not enough to fix the third decimal of WAPE; use a rolling origin.
*Checked and not a miss:* the ELA chip-shortage cells that are absent from the stockout file are real shortfalls. In 2021-03..2022-09, unlisted ELA cells run at 0.663 of the listed cells' demand, the same as the listed shipped / requested ratio of 0.663 (`k13_ela.py`). A panel that used them as demand would bias the ELA factor by -10.9 % on average and by up to -16 % in a single month. The investigator excluded them (`06_ipf.py`, `13_fit_all.py`), so the ELA factor path is clean.

6. **Self-compression when measuring a region's own effect.** A region's own holiday effect, measured relative to a mean that includes that region, is compressed by 4/5. The investigator handled this correctly. Any downstream re-estimate must measure against the *other* regions.
