# Lens `demand-dgp` — reverse-engineering the latent demand generator

**Headline.** Demand in this file is produced by a clean multiplicative generator that we can now write down almost completely:
`latent monthly demand = series level x family macro path x calendar profile (common x region, plus a Thermal summer bump) x channel factor x powertrain (EV-index) factor x lifecycle ramp`,
then the series' **ordering cycle sums the latent demand since the previous order**, then **negative-binomial noise with a region-specific dispersion** is applied to the order, and a rare **one-off multiplier (x3 to x10, Direct OEM and Tier-1 only)** is added on top.
A Poisson factor model with exactly these terms, fitted on monthly series only, predicts the bi-monthly, quarterly and "2-on-1-off" series out of sample with a bias of -0.3 % to +1.0 %.
The seasonal profile is identical for every SKU of a family and fixed across years to within sampling noise (year-to-year s.d. 0.019 vs 0.020 expected), apart from two moving holidays.
There is **no deterministic growth trend** (family trend after macro control is within +/-1.1 % per year); all medium-term movement comes from the macro indicators, the EV index (ICE -1.15 % per index point, EV +3.66 %), and SKU-specific sensitivities to those indicators.
Noise is the binding limit: the in-sample noise floor of the hold-out is **WAPE 0.240**; a seasonal-naive forecast scores 0.365, a last-12-month mean 0.503, a cycle-aware seasonal forecast 0.280, the same with a robust 24-month level 0.261, and a perfect macro/event model on top of that 0.249.
At planning aggregates the macro path is what matters (family x month WAPE 0.054 without it, 0.017 to 0.019 with it).

All numbers were computed by the scripts in `research/scratch/demand-dgp/` (logs in `logs/`). The working panel is the full 245,548-cell grid built from the sibling lenses' cleaned units (`numeric-reconcile/row_diagnosis.parquet`), cycle states (`panel-missing-zeros/panel_min_clean.parquet`) and `Requested_Units` where the stock-out file has a row.
Conventions: `midx` 0 = 2019-01 ... 93 = 2026-10; `mu` = expected order; `e = demand / mu`; cycle kinds M (monthly), A (monthly with one annual shutdown month), B (every 2nd month), Q (quarterly), T (two on / one off).

---

## 1. The generator is a multiplicative factor model; no interaction terms are needed

**(a) Evidence**
- Poisson factor model fitted by iterative proportional fitting (`06_ipf.py`): `mu[s,t] = L[s] x F[family,t] x R[region,t] x C[channel,t] x P[powertrain,t]`, estimated on 156,565 clean cells of 2,199 single-cycle, single-customer M and A series. In-sample `sum|d-mu| / sum d` = 0.239.
- Applied unchanged to all 3,003 mature series (144,332 valid cells, including B, Q and T series that were never used to fit the factors), with orders accumulated as in finding 8 (`13_fit_all.py`):

| cycle | cells | bias | WAPE | Pearson dispersion |
|---|---|---|---|---|
| M | 82,055 | +0.6 % | 0.237 | 1.18 |
| A | 41,462 | +0.0 % | 0.232 | 1.15 |
| B | 7,882 | +0.9 % | 0.220 | 1.18 |
| Q | 4,396 | +1.0 % | 0.213 | 1.16 |
| T | 8,537 | -0.3 % | 0.232 | 1.30 |

- Interaction tests on the standardised residuals (`09_hetero.py`, variance of group z-scores against a within-group permutation): family x region x calendar month 0.694 vs 0.970 permuted; family x channel x month 0.650 vs 0.895; region x channel x month 0.881 vs 0.907; customer-region x month 0.855 vs 0.878. None shows excess variance, so the calendar profile is a product of separate family, region and channel terms.
- Residual correlation between series at the same month (1,216,766 pairs): all pairs -0.0005; same family, other SKU -0.0042; same region, other SKU -0.0023; same customer and region, other SKU +0.0032 (s.e. 0.0008); **same SKU in another region +0.077 (s.e. 0.0033)**. The only cross-series dependence left after the group factors is an SKU-level common component (finding 4).

**(b) Classification** generator_structure. **(c) Confidence** high.

**(d) Rule.** Model the *latent monthly-equivalent* demand of every series with one global multiplicative (log-link) model whose inputs are: series level, family macro path, calendar month x region, calendar month x channel, powertrain x EV index, lifecycle age. Do not spend capacity on family x region or customer interactions. Convert to orders only at the end (finding 8).

---

## 2. Level: SKU effect x region effect x an independent series-specific lognormal factor

**(a) Evidence** (`20_level.py`, 2,914 series with at least 36 months; `L` = monthly-equivalent level at unit group factors; quantiles 1 % 9.1, 25 % 28.7, median 42.4, 75 % 62.5, 99 % 174.3 units per month)
- `log L ~ SKU fixed effect + region fixed effect`: R2 = 0.646, residual s.d. 0.406. A pure "SKU x region" product is therefore **not** the generator: each series carries its own factor.
- Variance components (log): between SKU 0.127 (s.d. 0.357), series-specific within SKU 0.164 (s.d. 0.405), region 0.004. The series-specific factor is close to lognormal (skew -0.10, excess kurtosis 0.17; 1 % to 99 % range x0.41 to x2.29).
- Region multipliers (relative to the geometric mean of the five old regions, s.e. 0.026): North America 1.083, Europe 1.040, Asia Pacific 1.025, India 0.968, Latin America 0.895, **Middle East & Africa 0.500**.
- Channel (log, vs Aftermarket): Direct OEM +0.085, Tier-1 +0.055, Export -0.016 (F-test p < 0.0001 but small). Customer: no effect (all 12 customers within +/-0.05). Ordering cycle: no effect (-0.012 to +0.022), i.e. monthly-equivalent volume does not depend on the cycle.
- SKU effect vs master data: family alone R2 0.297; + size class 0.336; + powertrain 0.420; + log list price 0.500 (residual s.d. 0.297). **Cross-sectional price elasticity -0.55 (s.e. 0.059)**; within family x size class it is -0.505 (s.e. 0.060). Family geometric-mean levels: Brake & Safety 61.3, Thermal 61.2, Precision Machined 56.4, Chassis 48.8, Powertrain 45.9, Hydraulic 36.1, Electrical 34.3.
- Persistence: SKU+region residuals of yearly levels correlate 0.85 to 0.94 between any two years (`03_level2.py`).

**(b)** generator_structure. **(c)** high for the decomposition, medium for the exact functional form of the SKU effect.

**(d) Rule.** Estimate one level per series (never pool levels across the regions of an SKU). Cold-start prior for a series without history:
`log L = 7.32 + family + size + powertrain - 0.55 log(price_2026) + log(region multiplier) + channel`, with family (vs Brake) Chassis -0.156, Electrical -0.043, Hydraulic -0.161, Powertrain +0.072, Precision +0.061, Thermal +0.226; size (vs Compact 12) Standard 25 +0.170, Large 45 +0.236, Heavy-Duty 70 +0.337, Industrial 100 +0.403; powertrain (vs EV) Universal -0.049, ICE +0.288 (ICE at its 2019 level, i.e. before the EV factor of finding 3).
The prior has a log s.d. of about 0.50 (0.30 SKU + 0.40 series), so P10/P90 for cold starts must be about x0.53 / x1.9 around it. File `series_level_table.csv`.

---

## 3. Trend: none of its own; the EV index is the only secular driver

**(a) Evidence** (`24_trend.py`, `21_events_shape.py`)
- Deseasonalised family factor, yearly mean (all families): 2019 1.015, 2020 0.728, 2021 1.190, 2022 1.021, 2023 0.987, 2024 1.069, 2025 1.011, 2026 1.052. A cycle, not a trend.
- Linear trend of the monthly family factor after controlling for month, covid and pre-buy dummies and three macro terms (greedy choice of indicator and lag): Brake +0.2 % per year, Chassis -1.1 %, Electrical +0.2 %, Hydraulic +0.6 %, Powertrain +0.2 %, Precision -0.1 %, Thermal -0.7 % (s.e. about 0.2 %). Three macro terms cut the residual s.d. of the family factor from 0.076 to 0.112 down to 0.023 to 0.037 (sampling s.d. of a family-month index is about 0.02): macro explains essentially all of the family path.
- Powertrain factor relative to Universal, yearly: ICE 1.00, 0.95, 0.84, 0.77, 0.66, 0.60, 0.59, 0.58; `log P[ICE] = -0.0115 x EV_Adoption_Index` (zero lag, R2 0.985). EV SKUs: `+0.0366` per index point from 2022-05 (R2 0.986). The index is 93.1 in 2026-10 and stays between 90.7 and 94.6 in the forecast window, so the ICE decline has stopped (2025 and 2026 are already flat).
- Region and channel carry no trend: relative indices by region are flat (growth 2019 to 2026 by region -0.008 to -0.043, by channel -0.069 to +0.006).
- Series-level slope does not persist: regression of the next-19-month relative level on the last-12-month and the preceding 24-month relative levels gives coefficients 0.30 and 0.12 (R2 0.10). Recent deviations of a series from its long-run level are mostly noise and partly revert.

**(b)** generator_structure (EV shift = real_event). **(c)** high.

**(d) Rule.** No trend extrapolation at series, SKU, family or region level. Features: `EV_Adoption_Index x powertrain` (zero lag) and the macro indicators. Damp any learned series trend to zero; cap tree-model extrapolation by training on de-factored levels.

---

## 4. SKU-specific sensitivities: slow SKU-level deviations that are large in turbulent years and small since 2023

**(a) Evidence** (`09_hetero.py`, `11_variogram.py`, `16_drift_recent.py`, `17_sku_sens.py`, `12_sku_pca.py`)
- Year effects exist where month-of-year effects do not: variance of group z-scores for SKU x year is 2.87 (permuted 0.90), series x year 1.65 (0.88), customer-region x year 2.05 (0.90).
- Size of the deviation of an SKU (all regions together) from its family path, as the noise-corrected s.d. of the change of its 6-month index:

| lag | 2019 to 2022, SKU | 2023 to 2026, SKU | 2019 to 2022, series | 2023 to 2026, series |
|---|---|---|---|---|
| 6 months | 0.078 | 0.036 | 0.084 | 0.040 |
| 12 months | 0.109 | 0.051 | 0.119 | 0.056 |
| 24 months | 0.138 | 0.049 | 0.148 | 0.064 |
| 36 months | 0.133 | 0.059 | 0.143 | 0.090 |

  Deviations are 2 to 3 times larger when the macro drivers move (2020 to 2022) than in the calm years: this is a response to drivers, not a random walk.
- Per-SKU regressions of the monthly SKU index on one standardised driver at a time (374 Universal SKUs with at least 90 months): the true (sampling-error-corrected) s.d. of the SKU coefficient is 0.037 to 0.060 log points per 1 s.d. of the driver for every indicator (EV index 0.055, fuel 0.060, raw material 0.052, inventory days 0.051, orders 0.054, utilisation 0.054, PMI 0.044, auto production 0.037), and 14 % to 35 % of SKUs are individually significant at |t| > 3 (0.3 % expected). All ten drivers together give a mean R2 of 0.325 against 0.108 expected from noise.
- The sensitivities are family-specific: dispersion of the fuel-price coefficient is 0.097 in Brake & Safety and 0.091 in Chassis but 0.021 to 0.028 in Hydraulic, Precision, Powertrain and Electrical; inventory days 0.082 / 0.065 in Brake / Chassis; PMI 0.065 in Hydraulic and 0.055 in Precision.
- Principal components of the SKU x quarter deviation matrix: the first two explain 37 % (25 % + 12 %); the first is high in 2019 to 2020 and flat-low after 2022, the second peaks 2021 Q4 to 2022 Q1.
- Practical consequence, hold-out origin 2025-03: s.d. of log(next-19-month level / past level) by length of the level window is 0.170 (6 months), 0.145 (12), **0.126 (24)**, 0.129 (36), 0.135 (60), 0.141 (75).

**(b)** generator_structure (the brief says indicator effects "differ by SKU"). **(c)** high that SKU-specific driver sensitivities exist; low on their exact form (this lens did not identify indicator, lag and beta per SKU).

**(d) Rule.** (i) Estimate the series level from the last 24 to 36 months of de-factored, one-off-masked, stock-out-corrected demand, not from 12 months (too noisy) and not from the full history (SKU drift). (ii) Give the global model SKU identity (or SKU-level target encodings of macro response) so that it can learn SKU-specific macro slopes; shrink them heavily towards the family slope. (iii) For uncertainty, add a level error of about 0.05 to 0.06 (log s.d.) at SKU level for a 12 to 24 month horizon in calm macro conditions.

---

## 5. Seasonality: one common calendar profile x region profile, a Thermal summer bump, a channel year-end shift; identical within family and fixed across years

**(a) Evidence** (`08_season.py`, `23_season_artefact.py`, logs 27 and 28)
- Identical within family: variance of SKU x calendar-month z-scores is 0.893 against 0.933 (s.d. 0.012) after permuting months within SKU; for series x calendar month 0.822 against 0.913. No SKU or series has its own seasonal shape.
- Fixed across years: the year-to-year s.d. of the region relative monthly index is 0.019 (median over non-holiday cells) and the expected sampling s.d. is 0.020; for Direct OEM 0.015 vs 0.014, Tier-1 0.016 vs 0.015. Family profiles relative to the cross-family mean: 0.026 vs about 0.022.
- Six families share one profile; relative to it they deviate by at most +/-0.03. Only **Thermal Management** differs: x1.085 in May, June and July, x0.935 to 0.938 in November, December and January.
- Latent profile by region for the six ordinary families (typical year, Lunar New Year fully in February; `seasonal_profile_region_absolute.csv`):

| region | Jan | Feb | Mar | Apr | May | Jun | Jul | Aug | Sep | Oct | Nov | Dec |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Asia Pacific | 0.961 | **0.699** | 1.044 | 1.049 | 1.040 | 1.040 | 1.010 | 0.996 | 1.034 | **0.901** | 1.047 | 1.030 |
| Europe | 0.944 | 0.995 | 1.121 | 1.067 | 1.080 | 1.074 | 1.010 | **0.647** | 1.066 | 1.081 | 1.054 | 0.962 |
| India | 0.978 | 1.009 | 1.088 | 0.996 | 1.025 | 0.970 | 0.951 | 0.981 | 1.076 | **1.143** | 1.086 | 1.012 |
| Latin America | **0.791** | 0.895 | 1.020 | 1.015 | 1.044 | 1.053 | 1.027 | 1.049 | 1.045 | 1.056 | 1.023 | 0.934 |
| North America | 0.980 | 0.970 | 1.064 | 1.051 | 1.060 | 1.015 | **0.838** | 0.980 | 1.053 | 1.051 | 1.023 | 0.931 |
| Middle East & Africa | 1.028 | Ramadan | Ramadan | Ramadan | 1.042 | 1.002 | 0.936 | 0.951 | 1.040 | 1.052 | 1.113 | 1.056 |

  Strength (max / min): Europe 1.73, Asia Pacific 1.50, Latin America 1.33, North America 1.27, India 1.20. The Asia Pacific October dip (0.90), the Latin America January dip (0.79) and the India October peak (1.14) are **not** in the events calendar.
- Channel relative profile: Aftermarket and Tier-1 are x1.07 / x1.06 in December and x0.97 / x0.95 in January; Direct OEM and Export x0.94 / x0.955 in December and x1.06 / x1.045 in January; all other months within +/-0.035 of 1. The Aftermarket relative index is not stable between years (s.d. 0.05 to 0.09 vs 0.02 expected) because Aftermarket has a different macro response (finding 10), not because its calendar shape moves.
- Moving holidays. Lunar New Year, Asia Pacific: log effect -0.0345 per holiday day falling in the month (rmse 0.032 over 15 month-observations); the 10-day window gives x0.708. Years with the window in January confirm it (2023: January x0.73, February x1.00; 2025, 3 + 7 days: x0.92 and x0.81). Ramadan, Middle East & Africa: a full month (2025-03) runs at 0.72 of normal; partial months 2023-04 (21 days) 0.76, 2026-03 (19 days) 0.77, 2023-03 (9 days) 0.82, 2026-02 (11 days) 0.97.
- The opening ramp of Middle East & Africa in 2022 (region factor 0.18, 0.35, 0.41, 0.35, 0.55, 0.66, 0.70, 0.76, 0.77, 0.86, 0.88, 0.99) matches `1 - exp(-(age+1)/6)` (0.15, 0.28, 0.39, 0.49, 0.57, 0.63, 0.69, 0.74, 0.78, 0.81, 0.84, 0.87) once April 2022 is multiplied by the Ramadan factor (0.49 x 0.71 = 0.35).
- Value of seasonality in the hold-out: cell WAPE 0.267 to 0.261 (24-month level, flat vs seasonal), family-month WAPE 0.073 to 0.054.

**(b)** generator_structure; holidays real_event. **(c)** high.

**(d) Rule.** Seasonal features = calendar month x region, calendar month x channel, a Thermal flag x month; no SKU-level seasonality. Replace the fixed Asia Pacific January/February and the Middle East & Africa February to April indices by day-count features (`lny_days_in_month`, `ramadan_days_in_month`). Forecast window: Lunar New Year 2027 is a typical year (February x0.71); **2028 is not: January x0.81, February x0.87** (6 + 4 days); Ramadan falls in February/March 2027 and January/February 2028. Estimate profiles on 2019 and 2021 onwards, excluding 2020-02 to 2020-09, 2022-12 to 2023-02 and Export 2024-01 to 2024-03. File `seasonal_components.csv`.

---

## 6. Noise: negative binomial on the order, dispersion set by region only

**(a) Evidence** (`15_noise2.py`, `15b_noise_region.py`; 144,028 on-phase mature cells of 2,947 series, mean = factor expectation x leave-one-out local level)
- Variance function, pooled: `Var = 1.37 m + 0.0585 m2`; with the linear coefficient fixed at 1, `Var = m + 0.0646 m2`. A purely multiplicative rounded form (no linear term) misfits badly (weighted rmse of Var/m 0.87 against 0.28). Coefficient of variation falls from 0.45 at a mean of 11 units to 0.26 to 0.27 above 100 units.
- Maximum likelihood per observation: negative binomial -4.0918 (size k = 14.0); Poisson-lognormal -4.0939; Poisson-normal -4.1036; rounded gamma -4.1099; rounded lognormal -4.1291; rounded normal -4.1421. Upper and lower quantiles of `d/m` for means of at least 100 match the negative binomial (0.5 % 0.421 vs 0.417; 1 % 0.468 vs 0.459; 99 % 1.737 vs 1.756; 99.5 % 1.859 vs 1.857), not the lognormal (0.486, 0.519, 1.794, 1.917) or the normal.
- **Dispersion differs by region and by nothing else.** Region-specific fit improves the log-likelihood by 0.0115 per observation (about 1,650 in total):

| region | NB size k | CV of the multiplicative part |
|---|---|---|
| North America | 19.7 | 0.226 |
| Europe | 18.4 | 0.233 |
| Asia Pacific | 16.2 | 0.249 |
| India | 12.8 | 0.280 |
| Latin America | 10.2 | 0.313 |
| Middle East & Africa | 8.5 | 0.342 |

  With region-specific k the Pearson statistic is flat across channel (0.90 to 0.96), family (0.91 to 0.95), cycle (0.93 to 0.95), powertrain (0.93 to 0.95) and mean level; per-series dispersion has s.d. 0.214 against 0.203 expected under homogeneity.
- Zeros on scheduled order months of mature series: 13 observed, 17.8 expected under the negative binomial.
- No serial dependence of the noise: autocorrelation of `e` by order lag is 0.066, 0.055, 0.039, 0.029, 0.018, 0.012, 0.001 and then slightly negative, the signature of the slow level drift of finding 4, not of order smoothing; there is no negative lag-1 term.
- Interval calibration on the hold-out (`25_intervals.py`): NB(region k) quantiles around the point forecast put 8.3 % of actuals below P10 and 9.8 % above P90 for the in-sample fit, 8.7 % / 10.4 % with the oracle macro path, 10.6 % / 9.6 % for the 24-month baseline. On average P10 = 0.64 x and P90 = 1.39 x the mean forecast (North America about 0.67 / 1.35, Middle East & Africa 0.57 / 1.58).

**(b)** generator_structure. **(c)** high for the family and the region ordering; medium for the exact k values (they still contain a little mean-model error, so the true CVs are probably 0.01 to 0.02 lower).

**(d) Rule.** Train with a Poisson/Tweedie or negative-binomial objective, not squared error on raw units. P10/P50/P90 = negative-binomial quantiles with the region k of the table at the forecast mean; no further widening is needed at cell level for 19 months; for sums over months or series add the level error of finding 4 (the 19-month series total has a log error s.d. of 0.128 even with the true macro path). The floor for cell-level WAPE is about 0.21 (Europe) to 0.29 (Middle East & Africa); differences between regions in backtest WAPE are noise, not model weakness. File `noise_by_region.csv`.

---

## 7. One-off orders: Direct OEM and Tier-1 only, about 1 in 300 order months, x3 to x10, no payback

**(a) Evidence** (`14_oneoff.py`, `14b_oneoff_tail.py`; detection against the phase-aware expectation: order above 3 x expected and at least 25 units above it)
- 541 one-offs in 208,226 scheduled order months (0.26 %); 450 above 3.5 x. They carry 109,199 excess units, 0.92 % of all demand and 1.23 % of Direct OEM plus Tier-1 demand.
- **Channel:** Direct OEM 273 of 80,269 (3.40 per 1,000), Tier-1 Distributor 256 of 66,303 (3.86 per 1,000), Aftermarket 5 of 34,597 (0.14), Export 7 of 27,057 (0.26); above 3.5 x only 3 of 450 are Aftermarket or Export. The Aftermarket/Export tail is the pure noise tail: scaled to the OEM/Tier-1 cell count it explains 27 of the 71 cells in 3.0 to 3.5 x and 5 of the 70 in 3.5 to 4.0 x, and nothing above 5 x.
- Otherwise uniform: by year p = 0.64 (2.2 to 3.1 per 1,000 every year), calendar month p = 0.55, region p = 0.63, cycle kind p = 0.27, powertrain p = 0.86, family p = 0.07, customer p = 0.09, level quintile 2.3 to 3.1 per 1,000. Counts per series 2,598 / 433 / 49 / 2 / 1 for 0 / 1 / 2 / 3 / 4 (mean 0.176, variance 0.184: Poisson). Monthly counts have variance/mean 1.19: no clustering in time.
- Size: order / expected has quantiles 5 % 3.15, 25 % 3.82, median 4.88, 75 % 6.15, 95 % 9.29, maximum 20.6; roughly flat density from 3 to 6.5 and a thin tail. Median excess 176 units.
- **No pre-buy dip and no payback:** the four orders before and the six after a one-off average 0.98 to 1.02 of expectation (s.e. 0.013 to 0.018).
- Phase-aware detection changes the list: 387 of the 438 flags of the numeric lens (4 x a raw neighbour median) are confirmed; 51 are not (1.2 to 3.0 x expected, median 2.0: mostly the double-size orders of B/T series); 154 new ones are found (88 M, 36 A, 14 T, 9 Q, 7 B), e.g. CSS-075 North America 2023-02: 262 units against 38 expected; HYD-088 Europe 2022-07: 248 against 45.

**(b)** real_event. **(c)** high.

**(d) Rule.** Anomaly register: flag `order > 3.5 x phase-aware expectation` (or > 3 x with channel Direct OEM / Tier-1 and expectation of at least 25) as "one-off bulk order: real, not repeated, no payback"; never "correct" them. Mask them (replace by the expectation) when estimating level, seasonality and noise. Do not forecast them at cell level; the P50 excludes them. If totals must be unbiased, add +1.2 % to Direct OEM and Tier-1 means (+0.9 % overall), and put the one-off mass into P90+ of aggregates. File `oneoff_orders_dgp.csv` (541 rows with multiplier and excess).

---

## 8. Ordering cycles: the order is the sum of latent demand since the last order; the phase is fixed to the calendar

**(a) Evidence** (`13_fit_all.py`; factors fitted on monthly series only, so this is an out-of-sample test)
- Accumulation against "k x the current month": WAPE B 0.220 vs 0.228, Q 0.213 vs 0.226, T 0.232 vs 0.238; Pearson dispersion B 1.18 vs 1.36, Q 1.16 vs 1.37.
- Decisive cases where the covered months have a very different seasonal index:

| multi-month orders | n | actual / expected, accumulate | actual / expected, k x current |
|---|---|---|---|
| Europe, August covered, order placed later | 353 | 1.000 | 0.867 |
| Europe, order placed in August | 290 | 1.020 | 1.308 |
| Asia Pacific, February covered, order later | 364 | 1.012 | 0.904 |
| Asia Pacific, order placed in February | 215 | 0.991 | 1.084 |

- Annual-shutdown series: the month after the shutdown contains `own demand + c x shutdown-month latent demand` with **c = 0.4955** pooled (n = 3,839; 0.46 to 0.54 across the seven shutdown months); the other months are at 1.0005 of expectation.
- Noise is applied to the order, not to the latent months: the dispersion statistic under one negative-binomial law is the same for 1-, 2- and 3-month orders (M 1.18, B 1.18, Q 1.16). The lower CV of large orders (Q 0.288, M 0.327) is exactly the Poisson term shrinking with the mean.
- Phase: the calendar rule (state code -> months) reproduces the on/off pattern of every unchanged series in the training window (100.000 %); lag-1 correlation between consecutive T orders is +0.09 (no compensation between the two orders of a cycle).
- Value: last-12-month mean WAPE by cycle M 0.292, A 0.367, T 0.782, B 1.021, Q 1.332; cycle-aware 0.286, 0.274, 0.288, 0.278, 0.261. After that the cycle classes are equally hard (noise floor 0.245, 0.243, 0.233, 0.231, 0.220) and their share of the absolute error equals their share of units (M 49.5 % of error and 48.8 % of units; Q 7.4 % and 8.0 %).

**(b)** generator_structure. **(c)** high.

**(d) Rule.** Forecast latent monthly demand for all 19 months and for the months before the first test order, then set `order(t) = sum of latent months since the previous order month` (weight 0.5 for an annual-shutdown month, added to the following month); off-phase months are exactly 0. For B, Q and T series the first test order needs the latent demand of 2026-10 or earlier months that are already past. Intermittent-demand methods are baselines only.

---

## 9. Customer-wide shocks: two in eight years, both in the events calendar; one is permanent and affects 66 test series

**(a) Evidence** (`18_customer.py`; customer x region x month index with sampling z-scores, 4,332 cells, only 3 with |z| > 4)
- **Nexon Motor Group, Europe, labour strike (EV-038):** 2023-10 at 0.269 of expectation (z = -11.2), 2023-11 at 0.199 (z = -10.4); all four channels alike (0.21 to 0.26); series-month ratios 5 % 0.07, median 0.17, 95 % 0.46. Afterwards 2023-12 0.935, 2024-01 1.115 (z = 1.4), 2024-02 1.163 (z = 2.7): a recovery of about 0.2 months of demand against 1.53 months lost.
- **Helios Auto Parts, India, second assembly line (EV-052, open-ended):** index 0.969 in the 24 months before 2025-09 and 1.155 from 2025-09, a **step of x1.19**; per-SKU ratio median 1.21 (10 % 1.08, 90 % 1.35), identical across channels (1.17 to 1.21); monthly index from 2025-09: 1.08, 1.15, 1.14, 1.15, 1.09, 1.16, 1.15, 1.17, 1.14, 1.25, 1.12, 1.21, 1.22, 1.13. 66 series.
- No other customer-region month and no customer-region-channel month exceeds |z| = 4.5. Residual correlation inside a customer-region is +0.003.
- A planned event in the forecast window, Orion Driveline North America retooling 2027-07 to 2027-08 (EV-062), concerns 62 series; Orion North America shows nothing unusual in history (index 0.92 to 1.10).

**(b)** real_event. **(c)** high for size and timing; low for the transfer to the Orion event.

**(d) Rule.** Helios India: estimate the level on 2025-09 onwards only, or multiply the earlier level by 1.19 (a 24-month window that straddles the step under-forecasts these 66 series by about 8 %); add a step feature. Nexon Europe 2023-10/11: mask in level, seasonal and noise estimation; register as real event. Orion North America 2027-07/08: the only historical analogue of a customer plant stoppage gives x0.27 and x0.20 with weak catch-up; the alternative reading (a shutdown month with zero orders and a 0.5 catch-up as in finding 8) is equally possible, so publish the scenario choice and widen P10/P90 for those 124 cells. File `customer_region_month_index.csv`.

---

## 10. Shape of the large real events on the latent scale

**(a) Evidence** (`21_events_shape.py`; full-history series, monthly-equivalent demand per unit of series level)
- **Pandemic**, 2020 relative to the same month of 2019:

| region | Jan | Feb | Mar | Apr | May | Jun | Jul | Aug | Sep | Oct | Nov | Dec |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Asia Pacific | 0.80 | 0.62 | 0.70 | 0.85 | 0.72 | 0.69 | 0.71 | 0.78 | 0.92 | 0.98 | 1.12 | 1.20 |
| Europe | 0.92 | 0.90 | 0.62 | 0.29 | 0.39 | 0.63 | 0.68 | 0.76 | 0.84 | 0.96 | 1.07 | 1.12 |
| India | 0.87 | 0.87 | 0.85 | 0.15 | 0.22 | 0.42 | 0.64 | 0.79 | 0.86 | 0.98 | 1.06 | 1.12 |
| Latin America | 0.92 | 0.88 | 0.90 | 0.41 | 0.44 | 0.55 | 0.68 | 0.74 | 0.88 | 1.06 | 1.11 | 1.10 |
| North America | 0.92 | 0.91 | 0.91 | 0.36 | 0.35 | 0.53 | 0.64 | 0.74 | 0.89 | 0.98 | 1.10 | 1.12 |
| Total | 0.88 | 0.85 | 0.79 | 0.42 | 0.42 | 0.57 | 0.67 | 0.76 | 0.88 | 0.99 | 1.09 | 1.14 |

  A V shape: back to the 2019 level in October 2020, +9 % to +14 % in November and December, +7 % to +25 % above 2019 from January to August 2021 (peak July 1.25), back to 2019 by October to December 2021 (1.02, 1.01, 0.98). Regional lockdown months follow the calendar (Asia Pacific February to March, Europe March to May, the others April to June) on top of a global macro trough. Aftermarket is more resilient in June to August 2020 (0.74, 0.84, 0.90 against 0.53, 0.62, 0.72 for Direct OEM). Families differ in the recovery (Brake & Safety 1.04 in August and 1.25 in October; Powertrain 0.53 and 0.72).
- **Early buying before the 9 % price rise of January 2023** (announced 15 November 2022), December and January relative to the mean of the surrounding November and February:

| | Aftermarket | Tier-1 Distributor | Direct OEM | Export |
|---|---|---|---|---|
| December 2022 | 1.488 | 1.535 | 0.908 | 0.931 |
| December, six other years | 1.02 to 1.11 | 1.03 to 1.08 | 0.91 to 0.96 | 0.90 to 1.01 |
| January 2023 | 0.771 | 0.729 | 0.886 | 0.963 |
| January, six other years | 0.91 to 0.98 | 0.89 to 0.94 | 0.97 to 1.01 | 0.93 to 1.01 |

  Only the two stocking channels buy early (about +43 % in December), and they pay it back in January and February 2023 (relative channel index for Tier-1: January 0.788, February 0.916, March 1.006). Price rises of 2.0 % to 5.0 % produced no early buying beyond the regular year-end shift: the December ratio does not rise with the size of the increase (2019 1.08, 2020 1.03, 2021 1.05, 2023 1.06, 2024 1.04, 2025 1.05 for Tier-1).
- The 6 % surcharge of 2022-07 to 2022-12 and the chip shortage are not visible on the latent scale (the latter is a supply constraint: the Electrical family factor stays at 1.30 in 2021 and 1.11 in 2022).

**(b)** real_event. **(c)** high.

**(d) Rule.** Anomaly register entries with these multipliers. Exclude 2020-02 to 2020-09 from level and seasonal estimation (or give the model region x month lockdown dummies); dummies for 2022-12, 2023-01 and 2023-02 x (Aftermarket, Tier-1). For the forecast window (increases of 4.5 % in January 2027 and 4.0 % in January 2028, no announcement event) apply only the regular channel year-end profile of finding 5, no extra early buying.

---

## 11. Hold-out experiment: fit to 2025-03, score 2025-04 to 2026-10 (19 months)

Scripts `19_holdout.py`, `22_holdout_struct.py`. Target = unconstrained demand. 57,847 test cells of 3,058 series; scored 53,516 cells of 2,828 series with at least 24 training months (233 cells with unknown target and 4,115 cells of young series left out); 2,538,653 units. WAPE = sum|f - y| / sum y, bias = sum(f - y) / sum y.

| method | WAPE | bias | family x month WAPE | total x month WAPE |
|---|---|---|---|---|
| last-12-month mean | 0.503 | +5.6 % | 0.104 | 0.085 |
| last-12-month mean x seasonal profile (family x region) | 0.495 | +6.9 % | 0.093 | 0.074 |
| seasonal naive | 0.365 | +5.8 % | 0.098 | 0.070 |
| cycle-aware, last-12 mean, no seasonality | 0.285 | +4.5 % | 0.092 | 0.072 |
| cycle-aware: last-12 mean x latent seasonal profile, accumulated on the order months | 0.280 | +5.8 % | 0.086 | 0.066 |
| same, one-off-masked seasonally adjusted level, 12 months | 0.276 | +5.7 % | 0.085 | 0.065 |
| same, **24 months** | **0.261** | +1.3 % | 0.054 | 0.043 |
| same, 30 / 48 months | 0.266 / 0.287 | +0.7 % / +0.5 % | 0.054 / 0.065 | 0.041 / 0.041 |
| structural, training-only factors, macro level frozen at its last 12 months, 24-month level | 0.268 | +4.9 % | 0.080 | 0.064 |
| structural with the **true family macro path**, 24-month level | **0.249** | -0.9 % | 0.018 | 0.011 |
| level from training, all true group factors | 0.249 | -0.9 % | 0.017 | 0.010 |
| in-sample fit (noise floor) | 0.240 | -1.7 % | 0.020 | 0.017 |

By group (WAPE; snaive / cycle-aware 12-month / 24-month level / true macro path / floor):

| | snaive | cycle | 24-month | true macro | floor |
|---|---|---|---|---|---|
| Brake & Safety | 0.339 | 0.254 | 0.249 | 0.241 | 0.234 |
| Chassis & Structural | 0.348 | 0.263 | 0.255 | 0.249 | 0.240 |
| Electrical Assemblies | 0.402 | 0.316 | 0.277 | 0.264 | 0.248 |
| Hydraulic Systems | 0.414 | 0.324 | 0.273 | 0.259 | 0.249 |
| Powertrain Components | 0.364 | 0.285 | 0.273 | 0.254 | 0.238 |
| Precision Machined Parts | 0.367 | 0.289 | 0.265 | 0.249 | 0.245 |
| Thermal Management | 0.355 | 0.265 | 0.249 | 0.237 | 0.235 |
| Asia Pacific | 0.344 | 0.263 | 0.246 | 0.233 | 0.227 |
| Europe | 0.330 | 0.255 | 0.234 | 0.221 | 0.213 |
| India | 0.375 | 0.289 | 0.274 | 0.259 | 0.252 |
| Latin America | 0.400 | 0.305 | 0.287 | 0.275 | 0.268 |
| Middle East & Africa | 0.469 | 0.354 | 0.321 | 0.309 | 0.293 |
| North America | 0.330 | 0.258 | 0.240 | 0.230 | 0.219 |
| cycle M | 0.375 | 0.286 | 0.265 | 0.254 | 0.245 |
| cycle A | 0.365 | 0.274 | 0.263 | 0.249 | 0.243 |
| cycle B | 0.347 | 0.278 | 0.256 | 0.245 | 0.231 |
| cycle T | 0.368 | 0.288 | 0.257 | 0.243 | 0.233 |
| cycle Q | 0.325 | 0.261 | 0.239 | 0.229 | 0.220 |
| horizon 1 to 3 | 0.340 | 0.263 | 0.248 | 0.237 | 0.228 |
| horizon 4 to 6 | 0.380 | 0.295 | 0.268 | 0.245 | 0.240 |
| horizon 7 to 9 | 0.393 | 0.296 | 0.266 | 0.246 | 0.240 |
| horizon 10 to 12 | 0.386 | 0.287 | 0.263 | 0.254 | 0.246 |
| horizon 13 to 15 | 0.346 | 0.276 | 0.258 | 0.254 | 0.242 |
| horizon 16 to 19 | 0.355 | 0.272 | 0.264 | 0.255 | 0.244 |

Bias of the 24-month level baseline by horizon: +0.5 % (1 to 3), +7.1 % (4 to 6), +6.9 % (7 to 9), +2.6 % (10 to 12), +0.2 % (13 to 15), -5.4 % (16 to 19); with the true macro path every bucket is within -2.0 % and 0.0 %. By family the same baseline is biased from -2.6 % (Brake) to +6.2 % (Powertrain); a 12-month level is biased +15 % for Hydraulic and +11 % for Electrical.

What the experiment shows:
1. **Error does not concentrate in the intermittent series once the cycle is respected**; it concentrates where noise is high (Middle East & Africa, Latin America, low-volume series: WAPE 0.315 for the lowest level quintile, 0.245 for the highest) and where the macro level moved (Hydraulic, Electrical, Powertrain; horizons 4 to 9).
2. The cell-level gap between a good structural forecast and the floor is small (0.261 against 0.240); **the macro path is worth 1.2 to 1.9 points of cell WAPE but two thirds of the family x month error** (0.054 to 0.018).
3. The macro level mean-reverts: freezing it at the last 12 months (bias +4.9 %) is worse than a plain 24-month average (+1.3 %), because 2024 H2 was a local peak.
4. With the factors right, the best level window is 24 months (WAPE 0.255, 0.249, 0.251, 0.255, 0.256 for 12, 24, 36, 60, 75 months; 19-month series total WAPE 0.118, 0.104, 0.109, 0.117, 0.121).
5. Raw long windows are biased for the powertrain shift: a 24-month raw level gives -12.6 % for EV SKUs and +7.5 % for ICE; de-factoring with the EV index removes most of it.
6. Lost accounts (16 series, 303 cells) are 2.2 % of all absolute error of the 24-month baseline and cannot be foreseen from the origin; the 122 one-off cells are 3.4 %.
7. Shading the forecast towards the median barely helps WAPE (true-factor forecast: 0.2488 at x1.00, 0.2479 at x0.98) and costs 2 points of bias: publish the mean.

**(b)** generator_structure (benchmark). **(c)** high. One origin only; the ranking of methods is robust, the third decimal is not.

**(d) Rule.** Backtest table for the dashboard must contain these baselines and the floor. A candidate model has to beat **0.261 WAPE / 0.054 family-month WAPE** at this origin and should be judged by its distance to 0.249 / 0.018; anything below 0.24 at cell level signals leakage. Files `holdout_scores.csv`, `holdout_scores_struct.csv`, `holdout_cells_struct.parquet`.

---

## Artefacts (all in `research/scratch/demand-dgp/`)

| file | content |
|---|---|
| `panel.parquet` | working grid (245,548 cells): cleaned units, unconstrained demand, cycle state, flags |
| `ipf_F_family.csv`, `ipf_R_region.csv`, `ipf_C_channel.csv`, `ipf_P_pt.csv` | fitted monthly factor paths (94 months) |
| `fit_all.parquet` | every cell with latent expectation, accumulation weight, expected order, series level |
| `seasonal_components.csv`, `seasonal_profile_region_absolute.csv`, `season_family_cma.csv` | seasonal profiles with year-to-year s.d. |
| `noise_by_region.csv`, `noise_cells.parquet` | noise law by region; cell-level means used |
| `oneoff_orders_dgp.csv` | 541 one-off orders (multiplier, excess units, numeric-lens flag) |
| `series_level_table.csv` | level, cycle, channel, customer, price per series |
| `sku_driver_coefs.csv`, `sku_quarter_logindex.csv`, `sku_year_index.csv` | SKU-level deviations and per-SKU driver coefficients |
| `customer_region_month_index.csv` | customer x region x month index and z-score |
| `total_index.csv` | total latent demand index by month |
| `holdout_scores*.csv`, `holdout_cells*.parquet` | hold-out results by family, region, cycle, horizon, channel, powertrain |
| `dgp_parameters.csv` | machine-readable summary of the parameters in this report |
| `00_...py` to `26_...py`, `logs/` | scripts in run order and their full output |

## Open questions, ranked by likely impact on forecast accuracy

1. **Exact macro response per family and per SKU** (indicator, lag, coefficient). Worth 0.268 to 0.249 in cell WAPE and 0.080 to 0.018 in family x month WAPE at the hold-out origin. This lens only shows that the response exists at SKU level (coefficient s.d. 0.04 to 0.06 per indicator s.d.) and which indicators carry it in which family; the functional form is for the macro lens.
2. **Orion Driveline North America, 2027-07 and 2027-08** (62 series, 124 cells): strike-like multiplier (0.27 / 0.20) or shutdown-like zero with 0.5 catch-up? No historical planned retooling at customer level exists to decide.
3. **New lost accounts, customer switches and cycle changes inside the forecast window.** History: 16 losses (all in 2025), 23 switches, 27 cycle changes; none can be predicted per series; they cost about 2 % of absolute error in the hold-out.
4. **Ramadan rule for partial months** (0.82 with 9 days in 2023-03 but 0.97 with 11 days in 2026-02) and its interaction with the Red Sea export disruption of 2024-01 to 2024-03; needed for Middle East & Africa in 2027-02/03 and 2028-01/02.
5. **Is the evaluation target drawn with the same noise and one-offs?** If yes, the mean forecast is 1.2 % low for Direct OEM and Tier-1 unless the one-off expectation is added; the median is about 2 % below the mean.
6. **Exact generator values of the regional noise CV** (estimates 0.226 to 0.342 include some mean-model error).
7. **Level of young EV SKUs** (hold-out bias of a raw 24-month level -12.6 %): ramp and EV-index slope interact; for the lifecycle lens.
8. **Unlisted regional seasonal effects** (Asia Pacific October 0.90, Latin America January 0.79, India October 1.14): stable for seven years, so they are modelled, but they have no entry in the events calendar and cannot be explained from it.

Housekeeping: `graphify update .` (requested by the home-level CLAUDE.md after code changes) was not run from this sub-task, because it writes outside the permitted workspace and five other agents share the machine; it should be run once by the orchestrating session.
