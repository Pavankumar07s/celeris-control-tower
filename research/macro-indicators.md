# Lens: macro-indicators: cleaning and lead/lag structure of `macro_indicators.csv`

## Headline

The file is small and its errors are few and exact. There are 114 rows for 113 months (2019-01..2028-05, complete) because one month (2022-06) appears twice. Beyond that duplicate, the file carries four injected error types, and a fixed rule repairs each one. 56 cells change and one row is dropped (`macro_clean.csv`, `macro_change_log.csv`):

- the Auto-production YoY column is written as a fraction for all of 2019 (x100);
- one PMI value has a decimal shift (4.79 -> 47.9);
- the Raw-material index is re-based before 2022: all 36 cells of 2019-01..2021-12 sit on an old base of about 1.25 x the true value;
- 5 single-month blanks.

Demand responds to the indicators through a generator structure that is SKU-level and multiplicative:

- **One SKU's series share a single response.** Every series of a SKU responds to a primary driver indicator, drawn from a family-specific set of three, at an integer lag of 1 to 4 months. The response is log-linear with about **0.17 log points per standard deviation** of the indicator, and the sign is the economic one in 306 of 306 confidently identified SKUs. The response saturates at a multiplier of about 1.40 to 1.45.
- **Family driver sets and typical lags:**
  - Brake: Auto production at lag 1, Fuel at lag 1, Inventory at lag 2.
  - Chassis: Auto, Raw material, Orders, all at lag 2.
  - Electrical: Orders at lag 2 dominant, PMI at lag 2.
  - Hydraulic: PMI at lag 2, Orders at lag 3.
  - Precision: PMI, Auto and Utilisation, all at lag 2.
  - Powertrain: Auto at lag 3, Orders at lag 2, Utilisation at lag 4.
  - Thermal: Auto at lag 2, PMI at lag 2, Fuel at lag 1.
- **Same lag everywhere except Aftermarket.** The lag and sensitivity are identical in every region and in the Direct-OEM, Tier-1 and Export channels. Aftermarket series respond with only 0.42 x that amplitude, plus their own Fuel-price effect at lag 1 (-0.37 % per index point).
- **EV shift.** It is a separate, zero-lag log-linear term: ICE -1.16 % and EV +3.64 % per EV-index point, with R2 0.984.
- **Stable over time, but muted in 2021-22.** The lag structure is stable from 2019 to 2026. The amplitude is muted in 2021-01..2022-11 (x0.96, the saturation or allocation years) and about 10 % larger in the calm years (x1.08 to x1.12). Scale the fitted paths by 1.10 for the forecast window.
- **Forecast window: smooth paths, no planted shocks.** Every indicator moves smoothly in 2026-11..2028-05, with month-to-month changes 2 to 3 times smaller than in 2025-26. The macro path implies a fading hump relative to the last-12-month level: total demand x1.068 in 2026-11, x1.040 in 2027-04 and x0.999 in 2028-05 (window mean x1.028). The hump comes from PMI and Utilisation, so Precision (mean x1.088) and Hydraulic (x1.047) rise most. EV SKUs get x1.10 on average, peaking at x1.205 in 2027-01. Electrical (x0.982) and Brake (x0.998) are flat to slightly down.
- **Out-of-sample value.** At two forecast origins (2025-03 and 2024-03, 19-month horizon, indicator path known), the SKU macro paths cut cell WAPE:
  - from 0.2585 to 0.2352 at 2025-03 and from 0.2559 to 0.2439 at 2024-03 (12-month level);
  - for family x month WAPE, from 0.084 to 0.018 and from 0.075 to 0.026.

Conventions: `z_i(t) = (X_i(t) - mean_i) / sd_i` with mean and sd over 2019-01..2026-10 of the cleaned series. `s` = sensitivity in log points per 1 sd. "% per unit" = `100 * s / sd`. "Lag L" means demand in month t responds to X(t-L). The demand analysed is the unconstrained demand from `stockouts-unconstrained`, with cleaned units, keys and ordering-cycle states from the sibling lenses (`v2/b01_panel.py`). Excluded from estimation are one-offs, lockdown months, the Nexon strike, the Red-Sea Export months, Helios India, the 2022-12..2023-02 pre-buy, the India pack-10 block, ramp-up, pre-EOL, lost-account tails and 27 cycle-change series. Families: BSS Brake & Safety, CSS Chassis & Structural, ELA Electrical, HYD Hydraulic, PMP Precision Machined, PTC Powertrain, THM Thermal. Indicators: PMI, AUTO (production YoY), INV (inventory days), RAW, ORD (new orders), UTIL, FUEL, EV.

---

## Findings

### 1. File structure and the four error types (plus one duplicate month): exact repairs

**(a) Evidence** (`01_profile.py`, `m01_macro_clean.py`):

- **Clean structure:** 114 rows x 11 columns, CRLF line endings, no BOM, no whitespace. One date format (`YYYY-MM`) on all 114 rows. Year/Month agree with Date on every row. No month is missing: 113 distinct months, 2019-01..2028-05.

| # | Error | Cells | Evidence | Repair |
|---|---|---|---|---|
| R1 | Duplicated month 2022-06 (file lines 43 and 44) | 1 row (2 differing cells) | Line 43: PMI 53.9, ORD 102.9. Line 44: PMI 52.7, ORD 104.3. The other 6 indicators are identical. Summed absolute second difference against both neighbours: 4.9 (line 43) vs 0.3 (line 44). Demand test (`v3/e06`): family-index residuals favour line 44 by a log-likelihood ratio of 3.36 (sum of squared standardised residuals / 2: 8.33 vs 4.96; the midpoint of the neighbours gives 5.27). | Keep line 44 (it is also the later row). |
| R2 | Auto_Production_YoY_Pct stored as a fraction | 12 (2019-01..2019-12) | Pattern `-0.ddd` (3 decimals) on exactly these 12 cells; the other 101 cells have 1 decimal. x100 joins smoothly: 2019-12 -4.9 -> 2020-01 -6.4. | x100 |
| R3 | Decimal-point shift | 1 (PMI 2023-05 = 4.79) | First difference -42.4 (robust z -57). x10 = 47.9 lies between the neighbours 47.2 and 46.1. No other cell in any indicator passes the x10 / x0.1 / x100 test. | 47.9 |
| R4 | Raw_Material_Cost_Index on an old base before 2022 | 36 (2019-01..2021-12) | 2021-12 = 149.3 -> 2022-01 = 123.6: robust z of the first difference -11.5; the next largest in the whole series is 5.5. 2024-01 = 100.0 exactly, matching the documented base "100 = Jan 2024", so the post-2022 segment is the correct one. | Divide by K = 1.25 (finding 2). |
| R5 | Single-month blanks | 5 | INV 2019-07, FUEL 2020-09, UTIL 2021-02, ORD 2023-08, EV 2024-11. Never adjacent, none in the forecast window. | Mean of the previous and next month. |

**Other checks:**
- **No further errors:** no decimal commas, no thousands separators, no stale or flat-lined runs in history. The only runs of 3 equal values are AUTO 2.6 / 1.8 / 2.4 inside the smooth forecast path, which is rounding. No spikes in the forecast window.
- **Real events, not errors:** the remaining two-sided spikes are economic events (2020-03..07 pandemic in every indicator; AUTO +36.9 in 2021-05, a base effect after 2020-04 = -45.4; FUEL 142.8 in 2022-06).

**(b)** data_error (R1 to R5).

**(c)** Confidence: high for R1, R2, R3 and R5. High that R4 exists; medium on its exact factor.

**(d) RULE.**
- Use `research/scratch/macro-indicators/macro_clean.csv` (113 rows, original column names, plus `raw_line`, `is_forecast_window` and `raw_rebased_flag`) and never the raw file.
- Log the 56 changed cells and 1 dropped row (`macro_change_log.csv`, with rule, classification and confidence per cell) in the anomaly register under category `macro_data_error`.
- Never treat the 2020-2022 swings as errors.

### 2. RAW re-basing factor: K = 1.25 (plausible range 1.20 to 1.30)

**(a) Evidence.** The estimates are independent of each other (`v2/a02`, `v2/a03`, `v3/e05`, `v2/a05`):

| Method | K estimate |
|---|---|
| Local polynomial + step in log levels, windows of 4 to 12 months either side | 1.139 to 1.252 (narrowest window, 4 months: 1.227 to 1.241) |
| AR(1) of the monthly log change, expected 2022-01 change: one-sided / two-sided | 1.216 +- 0.049 / 1.235 +- 0.042 |
| Minimum summed absolute second difference across the join | 1.22 (7.5) and 1.25 (7.3); 1.20 gives 11.7, 1.30 gives 15.0 |
| Demand, CSS family index with RAW at lag 2: with trend / no trend / excluding 2021-02..09 / 2019-09..2024-12 | 1.29 [1.22, 1.39] / 1.23 [1.19, 1.27] / 1.26 [1.16, 1.39] / 1.24 [1.19, 1.32] |
| Demand, 17 RAW-driven CSS SKUs (fixed lag / best lag) | 1.298 +- 0.036 / 1.311 +- 0.058 (RAW lag 3 instead of 2 gives 1.23) |
| Last-digit "double rounding" fingerprint | Not informative: 5.4 % of the K grid fits all 36 pre-2022 cells, vs 5.9 % for 36 untouched post-2022 cells |

K = 1.25 lies inside every interval except the SKU-level fixed-lag one, which is 1.26 to 1.33 and depends on the lag.

**(b)** data_error (index re-basing).

**(c)** Medium on the factor. Its impact is small:
- the forecast-window RAW values are post-break and untouched;
- K only changes the estimated sensitivity of the about 21 RAW-driven CSS SKUs (RAW coefficient -0.50 % per unit at K 1.23 to 1.29).

**(d) RULE.** Divide 2019-01..2021-12 RAW by 1.25. Record K as a pipeline parameter and run a sensitivity check at 1.20 and 1.30 for RAW-driven SKUs.

### 3. Indicator histories and their paths in the forecast window: smooth, no planted shocks

**(a) Evidence** (`v2/a04`, cleaned values):

| Indicator | History (key episodes) | Last-12-month mean (2025-11..26-10) | Window 2026-11..2028-05: start -> turning point -> end | sd of monthly change: 2025-26 / window |
|---|---|---|---|---|
| PMI | 54 (2019-01) -> 48.4 (2019-12); pandemic trough 41.1 (2020-04); boom 63.6 (2021-03); 46.1 (2023-06); 54.2 (2024-09); 48.3 (2025-09); 52.4 (2026-10) | 50.21 | 52.6 -> peak 53.1 (2027-01) -> 50.3 (2028-05) | 0.47 / 0.20 |
| AUTO YoY % | -1.3 to -5.7 (2019); -45.4 (2020-04); +36.9 (2021-05, base effect); chip shortage -22.9 (2021-09); +10.5 (2023-06); +0.3 to +4.4 since 2024 | 2.32 | 1.9 -> 1.6 (2027-05) -> 2.6 (2028-01) -> 2.4 | 0.44 / 0.15 |
| INV days | 68 to 70 (2019); 85.7 (2020-03); chip-shortage low 24.6 (2021-11); 63.8 (2024-05); 49.4 to 62 since | 54.92 | 50.6 (min, 2026-11) -> 57.4 (2027-12) -> 55.8 | 1.38 / 0.74 |
| RAW (re-based) | 73 to 78 (2019-20); 2021 run-up to 119; inflation peak 134.5 (2022-04); 90.8 (2025-05); 110.2 (2026-03); 93.8 (2026-10) | 104.22 | 91.8 (min) -> 98.2 (2027-12) -> 95.9 | 2.16 / 0.87 |
| ORD | 94 to 98 (2019); 60.1 (2020-04); 116.4 (2021-04); 99 to 110 since | 105.18 | 101.1 -> 98.8 (2027-03..04) -> 101.6 | 1.15 / 0.59 |
| UTIL % | 79.5 -> 64.9 (2020-04) -> about 80; 76.0 (2025-09) -> 83.4 (2026-10, all-time high) | 79.61 | **83.8 (above the historical max) -> 78.4** steady decline | 0.65 / 0.26 |
| FUEL | 82 to 89 (2019); 56.6 (2020-04); inflation spike 142.8 (2022-06); 82.8 (2026-04); 95.8 (2026-10) | 90.79 | 96.5 -> 98.7 (2027-02) -> 92.6 (2027-07) -> 96.0 | 3.05 / 1.11 |
| EV index | S-curve 40.0 (2019-01) -> 92.3 (2024-12); plateau 88.7 to 93.1 since | 90.32 | 93.8 -> peak 94.6 (2027-01/02) -> 90.7 (2027-12) -> 91.9 | 0.47 / 0.41 |

In the window, PMI, UTIL and EV are well above their last-12-month means early on, while ORD and RAW are below. There are no blanks, spikes or level breaks in the window.

**(b)** generator_structure. The window path is a supplied, smooth scenario.

**(c)** High.

**(d) RULE.**
- Use the supplied window values as known future covariates; do not forecast or smooth the indicators.
- UTIL (83.8) exceeds its training range, and EV sits on its plateau. Never feed raw indicator levels to tree models. Use the parametric multiplier (finding 10) or changes since the forecast origin.

### 4. Generator structure: each SKU has its own macro multiplier with one primary driver from a family-specific set of three

**(a) Evidence.** Four methods agree.

(i) **Family-index distributed-lag regressions** (`v2/b09`, `v2/b10`, `v3/e03`):
- Method: log family index (IPF family x month factor of event-free unconstrained demand, region x month seasonality removed) on month dummies plus 3 indicators at free lags 0..6.
- Residual sd 0.024 to 0.031, against a sampling floor of about 0.021.
- With all 7 indicators at the family lag, the in-set indicators carry the large t-values:
  - BSS: AUTO 17.0, INV -10.3, FUEL -7.2;
  - CSS: AUTO 11.5, RAW -6.5, ORD 6.0;
  - ELA: ORD 9.5, AUTO 8.4, PMI 6.8;
  - HYD: PMI 14.8, UTIL 7.0, ORD 4.1;
  - PMP: AUTO 9.2, UTIL 9.0, PMI 7.9;
  - PTC: AUTO 11.3, ORD 5.2;
  - THM: AUTO 14.5, PMI 5.9, FUEL -4.7.
- Full-sample coefficients, % demand per indicator unit (lag):

| Family | Driver 1 | Driver 2 | Driver 3 |
|---|---|---|---|
| BSS | AUTO@1 +0.92 | FUEL@1 -0.56 | INV@2 -0.48 |
| CSS | AUTO@2 +0.58 | ORD@2 +0.76 | RAW@2 -0.50 |
| ELA | ORD@2 +1.29 | PMI@2 +0.95 | AUTO@3 +0.30 |
| HYD | PMI@2 +2.07 | UTIL@0 +1.47 | ORD@3 +0.39 |
| PMP | PMI@2 +1.40 | UTIL@2 +1.64 | AUTO@2 +0.46 |
| PTC | AUTO@3 +0.78 | ORD@2 +0.82 | UTIL@4 +1.33 |
| THM | PMI@2 +1.36 | AUTO@2 +0.69 | FUEL@1 -0.32 |

(ii) **Model-free cross-correlation of 12-month changes** (`m06_ccf_yoy.py`, `ccf_yoy.csv`):
- Best AUTO lag is BSS 1, CSS 2, ELA 3, HYD 3, PMP 2, PTC 4, THM 2 (correlation +0.49 to +0.78).
- Best ORD lag is 2 to 3 for ELA, HYD, PMP and PTC (+0.88 to +0.96). Best PMI lag is 1 to 3.
- Partial correlations at those lags: BSS AUTO@1 +0.68; ELA ORD@2 +0.82; HYD PMI@3 +0.74; PTC ORD@3 +0.76 and AUTO@4 +0.72; THM AUTO@2 +0.78.
- In YoY space the 2020-21 swing dominates, so the weaker drivers (INV, FUEL, RAW, UTIL) are not recovered there. The level regressions in (i) are the reliable ones for those.

(iii) **SKU-level single-driver scan, unpenalised** (`v2/c02`, `v2/c08`; summary in `m04_sku_structure.py`):
- 7 indicators x lags 0..6 per SKU over 571 SKUs. 306 SKUs are confident (posterior P(driver) > 0.9, deviance gain > 25, at least 150 cells).
- **100 % of the 306 have the economically expected sign** (+ for PMI, AUTO, ORD, UTIL; - for INV, RAW, FUEL).
- Sensitivity per 1 sd, all 306: mean 0.173, observed sd 0.047, mean se 0.020, so the **true sd is about 0.042** (10th / 50th / 90th percentile 0.119 / 0.166 / 0.235).
- By indicator: AUTO 0.160, PMI 0.165, INV 0.174, FUEL 0.177, UTIL 0.181, ORD 0.193, RAW 0.203. The size is the same for every indicator once expressed per sd.
- So the generator standardises the indicators and draws a sensitivity of about 0.17 +- 0.04 per sd.

(iv) **Joint and Bayesian-model-averaging (BMA) fits** (`v3/e01` joint3; `v3/f02_bma.py` final):
- Joint fit of the family's 3 drivers (471 SKUs with at least 150 cells). Number of drivers with |t| > 3: none 75, one 244, two 131, three 21. The top driver carries a median 67 % of the summed |s|.
- Final BMA (571 of 601 SKUs fitted; the 30 SKUs with fewer than 30 usable cells get the family prior). Primary driver counts by family:

| Family | AUTO | FUEL | INV | ORD | PMI | RAW | UTIL |
|---|---|---|---|---|---|---|---|
| BSS (81) | 37 | 18 | 26 | 0 | 0 | 0 | 0 |
| CSS (79) | 39 | 0 | 0 | 19 | 0 | 21 | 0 |
| ELA (84) | 10 | 0 | 0 | 59 | 15 | 0 | 0 |
| HYD (82) | 0 | 0 | 0 | 23 | 46 | 0 | 13 |
| PMP (84) | 24 | 0 | 0 | 0 | 40 | 0 | 20 |
| PTC (85) | 40 | 0 | 0 | 31 | 0 | 0 | 14 |
| THM (76) | 42 | 11 | 0 | 0 | 23 | 0 | 0 |

- Posterior structure:
  - P(single driver) median 0.59; 20.5 % of SKUs above 0.8 and 30.5 % with P(two or three drivers) above 0.8;
  - the final primary driver agrees with the unpenalised scan for 80.9 % of SKUs.
- Examples (posterior above 0.9 for both driver and lag): BSS-027 FUEL@1 s -0.27/sd; PTC-017 ORD@4 +0.20; PTC-076 AUTO@3 +0.28; PMP-024 AUTO@3 +0.29; CSS-047 AUTO@3 +0.23; THM-050 PMI@2 +0.18; BSS-034 AUTO@2 +0.23.

**(b)** generator_structure. The statement's "effects differ by SKU" is the SKU-specific driver, lag and sensitivity.

**(c)** High for the family driver sets, the sign, the size per sd and the SKU-level nature. Medium on "exactly one driver per SKU": about half the SKUs carry a weaker second family driver.

**(d) RULE.**
- Use the per-SKU macro log-multiplier paths `v3/sku_macro_logmult_final.csv` (601 SKUs x 113 months, 2019-01..2028-05) and the per-SKU driver table `v3/sku_macro_drivers_final.csv` (primary and secondary driver, lag posterior, s per sd, % per unit, EV beta).
- Do not fit macro responses per series (too noisy) or per region: pool all series of a SKU.

### 5. Lags: integer, 1 to 4 months, a property of the SKU; the family sets the range

**(a) Evidence.**

- **MAP lag of the final BMA.** All SKUs: lag 0 = 2, 1 = 158, 2 = 247, 3 = 122, 4 = 42; never 5 or 6. Among the 306 confident SKUs, by family:

| Family | lag 0 | lag 1 | lag 2 | lag 3 | lag 4 |
|---|---|---|---|---|---|
| BSS | 4 | 30 | 13 | 1 | 1 |
| CSS | 0 | 14 | 13 | 6 | 10 |
| ELA | 0 | 1 | 23 | 9 | 0 |
| HYD | 0 | 4 | 28 | 12 | 0 |
| PMP | 0 | 13 | 15 | 14 | 0 |
| PTC | 0 | 0 | 18 | 17 | 16 |
| THM | 2 | 18 | 12 | 12 | 0 |

- **By driver** (final BMA): INV almost always lag 1 (21 of 26); FUEL mostly 1 (16 of 29); ORD 2 to 4 (only 3 of 132 at lag 1); PMI 1 to 3; AUTO 1 to 4.
- **Typical ranges** are BSS 1 to 2, ELA and HYD 2 to 3, PMP and THM 1 to 3, PTC 2 to 4, CSS 1 to 4.
- **Single lag, not a distributed lag** (`v3/e07`, 223 confident SKUs, joint regression on z at the MAP lag L0 and +-1, +-2):
  - pooled coefficients per sd: +0.002 (L0-2), +0.024 (L0-1), **+0.121 (L0)**, +0.042 (L0+1), -0.016 (L0+2);
  - so 70 % of the response sits at L0; the +-1 leakage matches lag uncertainty and autocorrelation.
- **Same lag in every region and channel** (`v3/e08`, 775 series of 220 confident SKUs): the summed deviance gain peaks at the SKU's own lag in all 5 old regions and in Direct-OEM, Tier-1 and Export. Pooled s per sd:

| Group | s per sd |
|---|---|
| APAC | 0.161 |
| EU | 0.166 |
| IND | 0.165 |
| LATAM | 0.173 |
| NA | 0.165 |
| OEM | 0.182 |
| T1 | 0.182 |
| EXP | 0.175 |
| **Aftermarket** | **0.078** (best shift -1, weak) |

  - It also holds for every ordering-cycle kind (cycle-state codes from `panel-missing-zeros`: M 0.165, A 0.167, T 0.173).
  - Cross-region calibration of the final path (`v3/g01`): gamma 0.98 to 1.04 per region, no regional difference.

**(b)** generator_structure.

**(c)** High that lags are integer, SKU-level and mostly 1 to 3. Medium per individual SKU: the MAP-lag posterior is above 0.9 for only 33.8 % of SKUs, so averaging over the lag posterior is right.

**(d) RULE.**
- The SKU multiplier at month t uses `X(t - L_sku)`. In the BMA path the lag is averaged over its posterior, which is already done in the artefact.
- Every forecast month uses indicators 1 to 4 months earlier. All of them lie in the supplied path, because the path covers 2026-07..2028-04 for the window.
- For a k-month ordering cycle, average the multiplier over the k latent months the order covers (as in `v2/c07_skud.py`).

### 6. Functional form: log-linear with saturation; muted in 2021-22, stronger in calm years -> scale by 1.10 for the window

**(a) Evidence.**

- **Form** (`v2/c03`, `c12`, `c13`; 187 single-driver SKUs):
  - Binned actual/base ratio vs the linear predictor u: it tracks exp(u) for u in [-1.4, +0.35], e.g. u = +0.296 -> 1.354 vs exp 1.344. Above that it flattens: u = 0.41 -> 1.438 (exp 1.506); u = 0.56 -> 1.547 (exp 1.756); u = 0.75 -> 1.653 (exp 2.107).
  - Profile deviance of a cap, relative to no cap: 1.30 -71; **1.40 -131.1** (1,674 capped cells); 1.45 -129.4; 1.50 -116.5; 2.00 -14.1. A floor at 0.40 adds -12.5 (83 cells).
  - Clipped exponential [0.4, 1.4] beats every linear form: -144.2 vs -91.0 for the best linear clip.
- **Saturation at family level** (`v3/e04`, actual vs path from the 2023-26 coefficients): linear while |path| < 0.25 log points. Beyond that, path +0.40 -> actual +0.27, path +0.58 -> +0.34, path -0.42 -> -0.31 and path -0.70 -> -0.50.
- **Amplitude by era.**
  - Calibration of the final path (`v3/g01`, pooled Poisson with series fixed effects): gamma 1.045 (2019-09..2020-12), **0.961 (2021-01..2022-11)**, **1.123 (2023-03..2024-12)**, **1.075 (2025-01..2026-10)**, 1.011 overall.
  - Pooled single-lag sensitivity (`v3/e07`): 0.186 (2019-11..2020-12), 0.159 (2021-22), 0.190 (2023-26).
  - Slope of the 2023-03..2026-10 family index on the path from full-sample coefficients (`v3/e03`): BSS 1.13, CSS 1.07, ELA 1.14, HYD 1.20, PMP 1.21, PTC 1.26, THM 1.05. Before 2023 the same slopes are 0.95 to 0.99.
- **Lags stay put** (`v2/c10`, `v3/e03`): the deviance gain peaks at the full-sample lag in every window (2019-09..2022-11, 2023-03..2026-10 and four sub-windows). At family level the free-lag optimum equals the full-sample lags in 5 of 7 families before 2023; after 2023 some lags move by 1 (ELA, HYD) with small gains.

**(b)** generator_structure. The muted 2021-22 response is what the cap predicts (AUTO YoY +25 to +37, ORD 116, PMI 63 push the multipliers to the cap), possibly together with supply allocation.

**(c)** High for log-linear with saturation and for stable lags. Medium on the exact cap (1.40 to 1.45) and floor (about 0.4).

**(d) RULE.**
- Forecast with `lm_window = 1.10 x lm_sku(t)`, with the cap kept at 1.45. The x1.10 variant is the best path in both backtests (finding 9).
- Do not extrapolate a linear-in-log response beyond +-0.35 log points.
- Do not estimate macro sensitivities on 2021-01..2022-11 alone.

### 7. The Aftermarket channel has its own macro mechanism: damped OEM cycle plus a Fuel-price effect

**(a) Evidence** (`v3/e09`, `v3/e10`, 23,743 Aftermarket cells in 430 series):

- **Damped cycle.** Aftermarket demand follows the SKU's standard path with c = 0.42 (se 0.013).
- **Fuel effect.** Adding one indicator at lags 0..5 gives the largest gain by far for **FUEL at lag 1: deviance -4,538**, f = -0.0623 per sd (se 0.0025), i.e. -0.37 % per Fuel-index point. RAW, which is collinear with FUEL, gives at most 2,987; INV at most 2,891 (rising with lag); ORD, UTIL, PMI and AUTO at most 974.
- **Robust across groups.** The same fuel effect appears in every family (-0.057 to -0.076 per sd) and every era (-0.052, -0.067, -0.103, -0.068).
- **Control:** the same scan on Direct-OEM cells finds no fuel effect (gain at most 6).
- **Calibration:** after these terms the Aftermarket gamma is 0.970 (se 0.023).
- **Channel indices** (`v3/e09`): the Aftermarket index is best explained by ORD@2 + FUEL@1 (-0.45 % per unit); Direct-OEM and Tier-1 by PMI@2 + AUTO@2.
- **Residual instability:** by era, the Aftermarket gamma is 1.05, 0.91, 1.18 and 0.99.

**(b)** generator_structure (a channel-specific driver).

**(c)** High for the damping and the fuel effect. Medium on stability (era gammas 0.91 to 1.18).

**(d) RULE.** For Aftermarket series use the artefact `v3/sku_macro_logmult_am_final.csv`, which equals `0.42 x lm_sku + (-0.0623) x z_FUEL(t-1)`. Do not apply the full OEM-cycle amplitude to Aftermarket.

### 8. EV adoption: zero-lag log-linear term by powertrain, best estimated at class level

**(a) Evidence** (`m05_ev.py` on the IPF powertrain factors `v2/P_pt.csv`; Universal = 1):

| Class | Lag 0 | Lag 1 | Lag 2 | Lag 3 | Lag 4 |
|---|---|---|---|---|---|
| ICE | **-1.155 % per point, R2 0.984** | -1.146, R2 0.983 | -1.133, R2 0.981 | -1.123, R2 0.978 | -1.114, R2 0.974 |
| EV (from 2022-05, n = 54) | **+3.644 % per point, R2 0.984** | +3.492, R2 0.982 | -- | -- | +3.072, R2 0.961 |

- **Yearly factors.** ICE: 1.365, 1.295, 1.146, 1.044, 0.891, 0.811, 0.804, 0.787 (2019..2026), flat since 2024 as the index plateaus. EV: 0.53 until 2021, then 0.87, 1.30, 1.85, 1.95, 1.92.
- **Agreement with the sibling lenses:**
  - `lifecycle-master`: +3.85 / -1.1;
  - `demand-dgp`: +3.66 / -1.15;
  - SKU medians from the final BMA: EV +3.62 (interquartile range 2.53 to 5.52, 56 SKUs) and ICE -1.07 (-1.45 to -0.63, 89 SKUs).
- **Use class-level betas.** SKU-level EV betas are unstable: at the 2024-03 origin, adding the SKU-level EV term raised cell WAPE from 0.2440 to 0.3091.
- **Window effect.** Relative to the last-12-month EV mean (90.32), ICE x0.96 (2026-11) -> x0.951 (2027-01) -> x0.991 (2027-10) -> x0.982 (2028-05), mean x0.974. EV x1.14 -> x1.175 -> x1.03 -> x1.061, mean x1.089.

**(b)** generator_structure.

**(c)** High.

**(d) RULE.** Feature: `ev_term = beta_pt x (EV(t) - EV_ref)` with beta_ICE = -0.0116, beta_EV = +0.0365 and beta_Universal = 0, at zero lag and class level only. Combine multiplicatively with the macro path.

### 9. Out-of-sample value of the macro paths (two origins, 19-month horizon, indicators known)

**(a) Evidence** (`v3/g02_backtest.py`):
- Method: the BMA is refitted on data up to the origin. Level = mean of de-factored demand over the last W months; forecast = level x seasonal x exp(path).
- The seasonal offsets and the family index used by the "family log-linear" row are full-sample (a mild leak, equal across rows).

| Origin, level window | Factor | Cell WAPE | SKU x month | Family x month | Total x month | Bias |
|---|---|---|---|---|---|---|
| 2025-03, W = 12 | none | 0.2585 | 0.1678 | 0.0839 | 0.0673 | +6.2 % |
| | family log-linear (3 drivers, family lags) | 0.2403 | 0.1452 | 0.0244 | 0.0140 | +1.2 % |
| | SKU BMA path + Aftermarket terms | 0.2359 | 0.1391 | 0.0209 | 0.0089 | +0.5 % |
| | **SKU BMA path x1.10 + Aftermarket terms** | **0.2352** | 0.1387 | **0.0180** | 0.0063 | -0.1 % |
| 2025-03, W = 24 | none | 0.2443 | 0.1538 | 0.0588 | 0.0502 | +2.9 % |
| | SKU BMA path x1.10 + Aftermarket terms | **0.2317** | 0.1386 | 0.0186 | 0.0070 | -0.4 % |
| 2024-03, W = 12 | none | 0.2559 | 0.1724 | 0.0754 | 0.0548 | -4.1 % |
| | family log-linear | 0.2495 | 0.1614 | 0.0283 | 0.0100 | -1.0 % |
| | **SKU BMA path x1.10 + Aftermarket terms** | **0.2439** | 0.1528 | **0.0258** | 0.0114 | -1.1 % |
| | SKU BMA + Aftermarket + SKU-level EV term | 0.3091 | 0.2235 | 0.0610 | 0.0241 | +2.2 % |
| 2024-03, W = 24 | none | 0.2565 | 0.1756 | 0.0725 | 0.0547 | -4.1 % |
| | SKU BMA path x1.10 + Aftermarket terms | 0.2459 | 0.1586 | 0.0274 | 0.0091 | -0.8 % |

**What the backtest says:**
- The macro path is worth 1.1 to 2.3 points of cell WAPE.
- It removes two thirds of the family x month error and almost all of the horizon bias. Without it, bias by horizon month goes from +0.02 to +0.15 and back; with it, every month stays within -0.02..+0.03 (`v2/logs/d02_bt74.log`).
- The SKU paths beat a 3-driver family model by 0.35 to 0.67 cell-WAPE points.

**(b)** generator_structure (validation).

**(c)** High for the direction. The sizes come from 2 origins only.

**(d) RULE.** The forecast must carry the SKU macro multiplier. The minimum fallback is the family log-linear model in finding 4(i).

### 10. Implied macro multiplier over the forecast window: a fading hump, PMP and HYD up, ELA and BSS flat

**(a) Evidence** (`m03_window_path.py`, `window_multiplier_paths.csv`):
- Method: volume-weighted mean over (SKU, channel) of `exp(1.10 x lm) x EV factor`, with weights equal to unconstrained demand over 2024-11..2026-10. Shown relative to the group's mean over 2025-11..2026-10, i.e. the factor a last-12-month level forecast must be multiplied by.

| Group | 2026-11 | 2027-01 | 2027-04 | 2027-07 | 2027-10 | 2028-01 | 2028-05 | Window mean (vs last 24 months) |
|---|---|---|---|---|---|---|---|---|
| BSS | 1.029 | 1.001 | 0.992 | 1.020 | 1.003 | 0.981 | 0.978 | 0.998 (1.000) |
| CSS | 1.052 | 1.050 | 1.032 | 1.024 | 1.031 | 1.021 | 1.023 | 1.031 (1.021) |
| ELA | 1.046 | 1.012 | 0.981 | 0.958 | 0.973 | 0.972 | 0.977 | 0.982 (0.992) |
| HYD | 1.100 | 1.103 | 1.080 | 1.043 | 1.031 | 1.010 | 0.995 | 1.047 (1.033) |
| PMP | 1.133 | 1.158 | 1.140 | 1.094 | 1.061 | 1.037 | 1.019 | 1.088 (1.066) |
| PTC | 1.067 | 1.047 | 1.014 | 0.989 | 0.995 | 0.993 | 0.985 | 1.008 (1.012) |
| THM | 1.054 | 1.045 | 1.039 | 1.036 | 1.027 | 1.020 | 1.009 | 1.031 (1.016) |
| EV SKUs | 1.181 | 1.205 | 1.167 | 1.103 | 1.042 | 1.034 | 1.057 | 1.102 (1.081) |
| ICE SKUs | 1.028 | 1.010 | 0.997 | 0.993 | 1.008 | 1.000 | 0.982 | 1.001 (0.998) |
| Universal | 1.060 | 1.049 | 1.032 | 1.023 | 1.018 | 1.003 | 0.994 | 1.023 (1.017) |
| Aftermarket | 1.019 | 1.008 | 1.001 | 1.011 | 1.002 | 0.992 | 0.986 | 1.001 (1.000) |
| **All** | **1.068** | **1.059** | **1.040** | **1.027** | **1.019** | **1.006** | **0.999** | **1.028 (1.021)** |

**Where the moves come from (finding 3):**
- PMI is +0.3 to +0.6 sd above its last-12-month mean early in the window, which lifts the PMI-driven SKUs of HYD, PMP and THM.
- UTIL starts +1.4 sd above (z = +2.0 vs history), which lifts the UTIL-driven SKUs of PMP, HYD and PTC. These SKUs sit at the cap.
- ORD is 0.4 to 0.7 sd below, which pulls down the ORD-driven SKUs, mostly ELA.
- INV rises to 57.4 and FUEL to 98.7, which pulls BSS down late in the window.
- RAW is 0.4 to 0.7 sd below, a small lift for the RAW-driven CSS SKUs.
- Without the 1.10 calibration and the EV term, the total is x1.056 in 2026-11 with a window mean of x1.023.
- The window range (+-8 %) is small next to history: the sd of the log family multiplier over 2019-2026 is 0.089 to 0.159.

**(b)** generator_structure (forecast implication).

**(c)** Medium-high. Direction and shape are robust; the size depends on gamma (+-0.01 on the mean) and on the cap for the UTIL-driven SKUs.

**(d) RULE.**
- Multiply level-based forecasts by the SKU path ratio `exp(1.10 x (lm(t) - mean_level_window(lm)))` x EV factor. The family rows above are only for checks and for the dashboard.
- Do not freeze the macro level at its last 12 months: the window mean is +2.8 %, with +6.8 % in 2026-11.

### 11. Cross-lens answer: Electrical demand in the chip shortage is not inflated beyond its macro drivers

**(a) Evidence** (`v3/e04`):
- The ELA family index minus the path predicted from the calm-era (2023-26) coefficients averages -0.017 log points over 2021-01..2022-11.
- Over 2021-03..2022-09 the mean is -0.021, with a maximum of +0.065.
- ELA's high 2021-22 level is what its drivers predict: ORD@2 and PMI@2, with ORD at 109 to 116 and PMI near 60.
- Comparison: the mean residual in 2019-09..2020-12 is +0.013 to +0.101 across families (the pandemic recovery is stronger than the calm-era path predicts), and -0.076 to +0.006 in 2021-22.

**(b)** real_event (the shortage), explained by generator_structure.

**(c)** Medium.

**(d) RULE.** No special down-weighting of ELA's 2021-22 unconstrained demand is needed in the driver fit beyond the general 2021-22 muting. This answers open question 1 in `stockouts-unconstrained.md`.

### 12. How to encode the macro effects (pipeline recipe)

1. **Inputs.**
   - `macro_clean.csv` (finding 1);
   - per-SKU artefacts: `v3/sku_macro_logmult_final.csv` (non-Aftermarket) and `v3/sku_macro_logmult_am_final.csv` (Aftermarket); log multipliers 2019-01..2028-05, already capped, lag-posterior-averaged and fixed to the cleaned indicators;
   - `v3/sku_macro_drivers_final.csv` (driver, lag and sensitivity per SKU).
2. **Parametric member** (log link):
   - `log mu(s,r,t) = log level(s,r) + log season(r,moy,family) + 1.10 x lm_sku(t) + ev_term(pt,t) + lifecycle + events`;
   - the level is estimated on de-factored history: `y / exp(season + lm + ev_term)` over the last 24 months, as `demand-dgp` recommends;
   - for k-month ordering cycles, use the multiplier averaged over the covered months.
3. **Tree / global model.**
   - Train on the de-factored target (divide by `exp(1.10 x lm + ev_term)`) and multiply the forecast back.
   - Optional features: `lm(t) - lm(origin)`, and `z` of the SKU's primary driver at its lag as a change since the origin. Never raw indicator levels (UTIL and EV fall outside the training range).
4. **What-if** (dashboard "PMI -3"):
   - recompute `lm` with PMI shifted: `delta log mult = s_PMI x (-3 / 4.64)` at each SKU's PMI lag, then apply the cap;
   - for a PMI-primary SKU with s = 0.17 this is about -10 %, starting 1 to 3 months after the shock;
   - families most exposed: HYD (46 PMI-primary SKUs), PMP (40), THM (23), ELA (15).
5. **Lead/lag heatmap** (optional dashboard view): use `ccf_yoy.csv` (family x indicator x lag 0..12) or the deviance profiles in `v2/logs/b09_lagprofile.log`.
6. **Uncertainty.** Forecast intervals are conditional on the supplied indicator path. The macro-path parameter error is small at cell level: family-average and SKU-level paths differ by 0.003 to 0.005 cell WAPE. It matters at aggregates: family x month error 0.018 to 0.026 even with the path.

---

## Artefacts

All files are in `/home/pavan/Desktop/mks/research/scratch/macro-indicators/`.

**Final, written or re-run in this pass:**
- `m01_macro_clean.py` -> **`macro_clean.csv`** (113 months, cleaned) and **`macro_change_log.csv`** (56 changed cells + 1 dropped row: rule, classification, confidence, raw line).
- `m03_window_path.py` -> **`window_multiplier_paths.csv`**: family / powertrain / channel / total multipliers for 2026-11..2028-05, with gamma 1.0 and 1.1, with and without the EV term, relative to the last 12 and last 24 months.
- `m04_sku_structure.py` -> `sku_structure_summary.csv` (per-SKU merge of the scan and the final BMA); `logs_m04.txt`.
- `m05_ev.py` (EV lag and slope check); `m06_ccf_yoy.py` -> `ccf_yoy.csv` (model-free YoY cross-correlations).

**`v3/`:**
- `f02_bma.py` -> **`sku_macro_drivers_final.csv`**, **`sku_macro_logmult_final.csv`**, **`sku_macro_logmult_am_final.csv`**, `indicator_norm_final.csv`.
  - Regenerated in this pass with the current script; the mean absolute change vs the earlier run is 0.0023 log points. The earlier run is kept in `v3/prev_final/`.
- `*_bt74.csv` and `*_bt62.csv`: backtest-origin fits. `backtest_macro_bt74.csv` and `backtest_macro_bt62.csv` hold the finding 9 tables.
- `g01_gamma.py` -> `gamma_by_group_final.csv`, `logs_g01_final.txt`.
- e-scripts with logs `logs_e03_*`, `logs_e07_*`, `logs_e08_*`, `logs_e09_*`, `logs_e10_*`: stability, single vs distributed lag, lag by region / channel, channel indices, Aftermarket.
- `family_coef_by_period.csv`, `family_actual_vs_postcoef_path.csv`, `joint3_sku.csv`.

**`v2/`:**
- `mlib.py` (IPF and quasi-NB GLM helpers);
- `b01_panel.py` -> `mpanel.parquet` (analysis panel with exclusion flags);
- `b04_G_all.py` -> `G_fam_all.csv` (family x month index), `P_pt.csv` (ICE/EV factors), `S_region_moy.csv`;
- `c07_skud.py` -> `skud.parquet` (SKU modelling cells with seasonal offset and cycle window);
- `sku_driver_v2.csv` (unpenalised single-driver scan), `secondary_scan.csv`, `stability_by_window.csv`;
- logs in `v2/logs/`.

**Superseded first-pass files (top level, kept for traceability):** `panel*.parquet`, `idx_*.csv`, `G_*.csv`, `SA_*.csv`, `scan_family_*.csv`, `lockdown_multipliers.csv`, `hf_ccf_w2.csv`, `sku_index.parquet`.

## Open questions, ranked by likely impact on forecast accuracy

1. **Calm-era amplitude (gamma 1.075 to 1.123 by sub-era, 1.10 used).** Is the generator's true sensitivity the calm-era one, with the 2021-22 muting entirely due to the cap? Or is the form a smooth saturation (tanh-like) that also flattens moderate moves? This changes the window multiplier by about +-1 % on the mean and +-2 % in the first months for HYD and PMP. Test: refit the BMA with a tanh link and compare deviance and the backtests.
2. **Cap value and floor for UTIL-driven SKUs at the window start.** 47 UTIL-primary SKUs, mostly PMP, HYD and PTC, at z = +2.0. Uncapped they would get x1.46; capped, x1.40 to x1.45. That is +-3 % for 2 to 4 months on those SKUs. The training data never had UTIL this high (the history maximum is 83.4, in 2026-10 itself).
3. **One driver or a mixture per SKU.** P(single) median 0.59, and 131 of 471 SKUs have two drivers with |t| > 3. If the generator uses fixed weights over the family's three drivers, a constrained mixture model could sharpen the SKU paths. The SKU-vs-family gap is only 0.005 to 0.006 cell WAPE, so the upside is small.
4. **Aftermarket stability** (era gammas 0.91 to 1.18, damping 0.36 to 0.46 by era). This affects about 17 % of cells (23,743 of 134,558).
5. **SKU-level EV heterogeneity** (EV beta interquartile range 2.5 to 5.5 % per point). Class-level betas are safer, as the backtest shows. EV SKUs also have gamma 1.16 (se 0.056) on the macro path, unexplained.
6. **RAW re-basing factor** (1.20 to 1.30). It only affects the sensitivity of the about 21 RAW-driven CSS SKUs; the window RAW values are unaffected.
7. **Robustness of the backtest.** There are only two origins, and the seasonal offsets come from the full sample. Repeat with origins 2023-09 and 2025-09 and fully out-of-sample seasonal factors before freezing gamma and the cap.
