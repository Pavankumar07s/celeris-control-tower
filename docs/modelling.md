# Forecasting methodology

How the 58,219 forecasts for 2026-11 .. 2028-05 are made, how they were validated, and what remains uncertain. Every
number below is read from a pipeline output (`outputs/backtest/summary.json`, `metrics.csv`, `experiments.csv`,
`outputs/forecast/*`, `outputs/quality/stages/features.json`); the evidence behind the design choices is
`research/DATA_DOSSIER.md` (sections cited as "dossier x.y").

Reproduce: `make all` (or `python -m celeris features`, `backtest`, `forecast` after `clean`, `demand`, `anomalies`;
about 15 s, 10 min and 15 s on the reference machine, with peaks of 1.0 GB, 2.7 GB summed over the backtest's process
and its three workers, and 0.8 GB; `--workers 1` runs the backtest in one process in about 23 min and 1.5 GB, with
identical outputs).

**In short.** We submit the structural multiplicative model alone: the reverse-engineered generator (level x
region / channel seasonality x moving holidays x SKU macro path x EV factor x lifecycle x events), estimated from data
at every origin and placed on each customer's ordering cycle. Over four rolling 19-month folds (origins 2022-10,
2023-10, 2024-10, 2025-03) it scores **WAPE 0.2611 and bias +0.2 % (WAPE + |bias| 0.2676)** at series x month, against
0.3124 / -3.2 % for the cycle-aware naive, 0.3870 / -3.8 % for seasonal naive, 0.5162 / -3.2 % for the last-12-month mean
and 0.51-0.52 for every intermittent-demand method. The in-hindsight oracle of the same cells (the noise floor) is
0.2356, so about 2.5 WAPE points separate us from a forecaster who knew each series' future level. Aggregates are
tight: 0.0308 at family x month and 0.0178 at total x month. The global LightGBM and the equal-weight ensemble did not
pass the ensemble rule (better in 0 of 4 folds) and are reported as a negative result. P10-P90 bands were calibrated to
80 % coverage at row, family x region x month and total x month level on the backtests. The submission totals
2,805,199 units (x1.039 the last 19 months of unconstrained demand) and USD 2.52 bn of revenue.

**Optimisation round (section 11).** The first submission (WAPE 0.2633, bias -0.2 %, score 0.2729) stopped its
factor backfit after six iterations, which left the EV beta well short of its fixed point, and picked one of several
near-tied macro driver sets per family. The factor fit now iterates to convergence and averages the near-tied driver
sets; this passed the declared keep rule (better at 3 of 4 decision origins and at 3 of 3 held-back confirmation
origins, mean gain 0.0053 and 0.0081) and is the only change that did; every other candidate (level estimators,
macro and other settings, a launch-prior calibration, rounding, a horizon-aware GBM blend, a looser SKU prior) was
rejected.

## 1. Target

- **What is forecast.** Unconstrained requested demand per SKU x region x month (business rule 7): the `demand_uc`
  column of `train_clean.parquet`, which undoes listed and hidden stock-outs, back-order carry and the semiconductor
  allocation (dossier 7.1 step 7). Shipments are never the target.
- **Latent demand, then orders.** Customers order on calendar-anchored cycles (monthly, monthly with an annual
  shutdown, every 2nd month, quarterly, two-on-one-off); an order carries all latent demand since the previous order,
  a carried annual-shutdown month at weight 0.5 (dossier 4.9). The model forecasts the monthly-equivalent latent
  demand and then places it on the projected cycle: `order(t) = sum weight x latent(month)` over the months the order
  carries (`celeris.demand.cycles.accumulation_weights`). Never a `1.5 x own month` multiplier.
- **Structural zeros (8,842 rows) are exactly 0** with P10 = P50 = P90 = 0: off-phase months (8,382), the 16 lost
  accounts (304 rows) and the months after an announced EOL (156). The EOL month itself sells.
- **Training cells.** On-phase cells with a known target, minus `train_mask` (COVID 2020-02..09, the 2022-12..2023-02
  pre-buy of Tier-1 + Aftermarket, the Nexon strike, the Red Sea months of Export Europe / MEA, one-off orders,
  lost-account tails, unknown targets). Levels additionally drop `level_mask` cells (semiconductor window, EOL
  phase-out, pre-switch months). Imputed semiconductor cells weigh 0.7, suspected hidden stock-outs 0.5.
- **Point forecast = conditional mean**, rounded to the nearest integer (dossier 6.4; flooring would cost -0.84 bias
  points). One-off bulk orders are masked from the level (they cannot be placed at cell level) but their expected
  volume is added back to Direct OEM / Tier-1 means (+1.2 % as of 2026-10), because they are real demand; the backtest chose
  this over the one-off-free mean, and rejected shading the mean down (x0.985) (section 6).

## 2. Features and drivers (workstream 3)

Catalogue: `outputs/features/feature_catalogue.csv` (name, group, definition, source, models using it). Tables:
`train_features.parquet` (every grid cell), `test_features.parquet` (every test row), `calendar_features.csv`
(every month 2019-01 .. 2028-05). All statistics at month t use months < t only, on the full grid with explicit gaps.

- **Calendar (Core).** Region x calendar-month and channel x calendar-month seasonality, plus a Thermal x month
  profile, estimated per origin by ratio of sums (no SKU or series seasonality: dossier 4.5). Year-end flags.
- **Moving holidays (Advanced).** Day counts from the events calendar: Lunar New Year in Asia Pacific and Ramadan in
  the Middle East & Africa for 2019-2028. In the window: LNY 10 days in 2027-02, 6 / 4 days in 2028-01 / 02; Ramadan
  21 / 9 days in 2027-02 / 03 and 4 / 26 days in 2028-01 / 02. Effect `1 - depth x days / window length`, depth
  estimated per origin by Poisson maximum likelihood jointly with the regional seasonality (profile likelihood: the
  region x calendar-month factor is profiled out where the holiday moves between calendar months).
- **Lags, rolling statistics, levels, intermittency (Core).** Lags 1 / 2 / 3 / 12, trailing means and standard
  deviations over 3 / 6 / 12 months, the cycle-aware monthly-equivalent level, zero share, Syntetos-Boylan ADI / CV^2
  / class (reporting and backtest slices only: the zeros are scheduled, dossier 1 #3).
- **Macro lead / lag (Advanced) and its stability (Expert).** See section 2.1.
- **EV shift (Expert).** `exp(beta_class x (EV index - window mean))`, zero lag, class level (EV, ICE; Universal 0);
  per-SKU EV betas are noise (dossier 4.8) and are not used.
- **Lifecycle (Advanced / Expert).** Months since product launch, launch ramp `1 - exp(-(k+1)/4.6)`, MEA opening ramp
  (tau 6 on series age), months to EOL with the graded phase-out 0.90 / 0.81 / 0.71 / 0.61 / 0.52 / 0.42 at m = 5..0,
  lifecycle phase.
- **Events (Advanced).** Customer at time (switches move the level), the Helios India programme step (measured),
  the Orion North America 2027-07/08 retooling shutdown (analogue: the measured Nexon 2023 strike), history masks.

### 2.1 Which indicator leads which family, at what lag, and is it stable?

Method (`celeris.features.macro`): the family macro index is `log(sum demand / sum expectation without the macro
factor)` over the fitting cells of non-Aftermarket series (seasonality, holidays, EV, lifecycle and levels removed).
`macro_leadlag.csv` holds its weighted correlation with every standardised indicator at lags 0..12, by era. Driver
sets of at most three indicators (economic sign imposed: + PMI, AUTO, ORD, UTIL; - INV, RAW, FUEL) are scored at their
best lag combination 0..6 by `RSS + 9 k` (k = number of drivers, the chi-square gain a driver must bring), and the SKU
paths are **averaged over the best sets with posterior weights** `exp(-(S - S_min) / 2)` (at most four sets, weight
>= 1 % of the best). Until the optimisation round one set was picked by forward selection; when two sets were nearly
tied, which one won moved a fold's score by up to 0.008 (section 11). Each driver has a lag posterior from the
deviance profile. Each SKU then gets its own coefficients on the family drivers (empirical-Bayes shrinkage to the
family, prior sd 0.06 per sd) and its own lag posterior (prior centred on the family lag) and a soft saturation (slope
0.5 above +0.25 log points, knee rounded over +-0.05); the dossier's x0.9 amplitude for 2021-01..2022-11 was tested and
dropped (section 6). Aftermarket follows the SKU path damped by `c` plus Fuel at lag 1 (dossier 4.7). The tables below
show each family's best-weighted set; the weights of every averaged set are in `summary.json`
(`diagnostics_by_origin.*.family_driver_sets`) and `structural_factors.json` (`family_macro_driver_sets`).
The indicator values of the target months are known (supplied for the real window), so the backtest uses actuals.

**Findings** (`outputs/backtest/macro_drivers_by_origin.csv`, `outputs/forecast/structural_factors.json`,
`outputs/features/macro_leadlag.csv`, `sku_macro_drivers.csv`). Family drivers chosen from data alone at each origin
(indicator @ lag in months; auto = Auto_Production_YoY, fuel = Fuel_Price, inv = Vehicle_Inventory_Days, ord =
New_Vehicle_Orders, pmi = ISM PMI, raw = Raw_Material_Cost, util = Industrial_Util_Rate). The best-weighted set per
family and origin, with its weight when other sets share the average (weight >= 0.995 not shown):

| Family | 2021-10 (stress) | 2022-10 | 2023-10 | 2024-10 | 2025-03 | 2026-10 (final) |
|---|---|---|---|---|---|---|
| Brake & Safety | inv@2 + raw@4 + auto@1 (0.52) | pmi@0 + auto@1 + raw@0 (0.76) | auto@1 + fuel@0 + inv@2 | auto@1 + fuel@0 + inv@2 | auto@1 + fuel@1 + inv@2 | auto@1 + fuel@1 + inv@2 |
| Chassis & Structural | ord@2 + raw@4 (0.94) | raw@1 + auto@2 + ord@1 | raw@1 + auto@2 + ord@2 | raw@2 + auto@2 + ord@2 | raw@2 + auto@2 + ord@2 | raw@2 + auto@2 + ord@2 |
| Electrical Assemblies | ord@2 + pmi@0 (0.78) | ord@2 + auto@2 + pmi@2 (0.77) | ord@2 + auto@2 + pmi@2 | ord@2 + auto@2 + pmi@2 | ord@2 + auto@2 + pmi@2 | ord@2 + pmi@2 + auto@2 |
| Hydraulic Systems | pmi@1 + auto@5 (0.71) | pmi@3 + inv@6 (0.36) | pmi@3 + ord@6 (0.43) | pmi@2 + util@0 (0.54) | pmi@1 + util@2 + ord@2 (0.51) | pmi@2 + util@1 + ord@2 (0.57) |
| Powertrain Components | ord@4 + auto@2 (0.70) | auto@3 + ord@1 + util@6 (0.55) | auto@3 + ord@1 + util@6 (0.62) | auto@3 + ord@1 + util@4 | auto@3 + ord@1 + util@4 | auto@3 + ord@1 + util@3 |
| Precision Machined Parts | pmi@3 (0.93) | pmi@4 + auto@1 (0.93) | pmi@2 + auto@2 + util@0 (0.63) | pmi@2 + auto@2 + util@0 | pmi@2 + auto@2 + util@1 | pmi@2 + util@2 + auto@2 |
| Thermal Management | inv@0 + raw@6 (0.90) | pmi@0 + raw@2 + auto@2 (0.87) | pmi@0 + auto@2 + fuel@1 (0.79) | pmi@2 + auto@1 + fuel@1 (0.81) | pmi@1 + auto@1 + fuel@1 (0.84) | pmi@2 + auto@1 + fuel@1 (0.99) |

- **Which indicator leads which family.** At the final origin the best-weighted sets equal the forensic family sets
  of dossier 4.7 for all seven families (Brake: auto / fuel / inv; Chassis: auto / ord / raw; Electrical: ord / pmi /
  auto; Hydraulic: pmi / util / ord; Powertrain: auto / ord / util; Precision: pmi / util / auto; Thermal: pmi / auto /
  fuel), found without using the dossier; six families put all their weight on that set and Hydraulic shares it
  (0.57) with pmi + util (0.42). All lags are 1-3 months: auto production leads by 1-3, new orders by 1-2, PMI by
  2, utilisation by 1-3, fuel by 1, inventory and raw materials by 2.
- **Is the lag structure stable?** The leading driver keeps its lag at every decision origin and at 2026-10 for
  Brake (auto@1), Chassis (auto@2), Electrical (ord@2) and Powertrain (auto@3); Precision's PMI is at lag 2 from
  2023-10 on (4 at 2022-10), Hydraulic's PMI moves between lags 1 and 3, and Thermal's PMI between 0 and 2. The minor
  drivers change with the sample, as expected from correlated indicators, and this is where the averaging matters:
  at the older origins three or four sets share the weight in Hydraulic, Powertrain and Thermal. At the 2021-10 stress
  origin (34 months of history, 8 of them COVID-masked) the selection is unreliable.
  `macro_leadlag.csv` repeats the forward selection by era (2019-2022 vs 2023-2026). It is only partly stable: Brake
  auto@1, Powertrain auto@3, Electrical new orders (lag 2 -> 3) and Hydraulic / Precision PMI (lags 4 -> 2,
  3 -> 2) hold in both eras; Chassis and Thermal
  select only utilisation in 2023-2026, because the calm era has too little variation in their 2019-2022 drivers to
  pass the threshold. So the lag of the leading driver is stable where the data can identify it, while the minor
  drivers are not identifiable on half the history; the full-history fit, refit at every origin, is what the model uses.
- **Aftermarket** follows the SKU path damped to 0.386 (dossier 0.37-0.42) plus a Fuel effect of -0.068 per sd at
  lag 1 (dossier -0.063).
- **The EV shift** (zero lag, class level) is +0.0363 per index point for EV SKUs and -0.0117 for ICE SKUs as of
  2026-10 (dossier: +0.036-0.038 / -0.0116; the first submission had +0.028 because its backfit stopped before
  convergence, section 11). In the window the EV index rises to 94.6 (2027-01/02) and eases to 90.7 (2027-12), so EV
  SKUs get a hump and ICE SKUs a shallow dip. Removing the EV term costs 2.2 points of WAPE + |bias| in the backtest;
  estimating the betas on post-2023 data only costs 0.8 point.

## 3. Models (workstream 4)

| Model | Tier | What it is |
|---|---|---|
| `naive` | Core baseline | flat mean of the last 12 months |
| `seasonal_naive` | Core baseline | same calendar month of the latest year |
| `moving_average` | Core baseline | flat mean of the last 6 months |
| `croston`, `sba`, `tsb`, `adida`, `imapa` | Advanced (intermittent) | `statsforecast` per series on the filled unconstrained history; flat per-month rate |
| `cycle_aware` | baseline | cycle mask x accumulation x 24-month monthly-equivalent level, no seasonality |
| `structural` | primary | the multiplicative generator model below, placed on the cycle |
| `gbm` | Advanced (global ML) | LightGBM direct multi-horizon correction of the structural forecast |
| `ensemble` | | equal-weight mean of `structural` and `gbm` |
| `oracle` | diagnostic | structural factors with each series' level fitted on the horizon itself: the noise floor of the scoring set, not a forecast |

### 3.1 Structural multiplicative model (`celeris.models.structural`)

```
latent[s,t] = level[s] x R[region, month] x C[channel, month] x TH[month]^Thermal       f_season
                       x (1 - d_LNY x LNY days/10)^APAC x (1 - d_Ram x Ramadan days/30)^MEA   f_holiday
                       x exp(lm[SKU, channel group, t])                                f_macro
                       x exp(beta[class] x (EV[t] - EV_ref))                           f_ev
                       x ramp[s,t] x phase_out[s,t]                                    f_lifecycle
                       x Helios step x Orion shutdown                                  f_event
order[s,t]  = sum over carried months of weight x latent          (0 on structural zeros)
```

Estimation at every origin, from data up to the origin only, with mean-unbiased estimators:

1. **Backfit** (Poisson likelihood by cyclic exact block updates = ratio of sums) on single-month fitting cells:
   segment levels (series x customer run), R, C, TH (each profile averages 1; the volume-weighted channel factor is 1
   every month), LNY and Ramadan depths, the EV betas, the Helios step (Newton on a step with half exposure in its
   first month), and the SKU macro paths (section 2.1), **iterated until no live cell's log factor moves by more than
   1e-6** (cap 40). The EV betas are updated by Newton steps on the profile likelihood (segment levels profiled out)
   and the holiday depths with the regional factor profiled out: the plain block updates zig-zag along a ridge (the EV
   index rises inside every series' life), and the six fixed iterations used until the optimisation round stopped the
   EV beta short of its fixed point (0.018-0.029 instead of 0.030-0.037 per index point), under-forecasting EV SKUs by 1-20 %
   (section 11).
2. **Forecast level**: ratio of sums of demand over the accumulated factors in the last 24 months of level cells
   (arithmetic; a log mean biases aggregates by -3 to -10 %, dossier 6.2). Switch series use post-switch months.
3. **Young series** (< 24 months) blend in a cross-sectional prior with 2 pseudo-months: `(sum d + 2 P) / (sum g + 2)`
   (dossier 5.5). **Cold starts** take the prior. The prior is a log-linear model of mature levels on family, tier x
   region, channel and powertrain, smeared to the mean (ratio of sums), so it is unbiased for aggregates.
4. **Window events**: the Helios step keeps its measured size; a planned customer shutdown takes the measured
   multiplier of the latest customer strike / shutdown in the history, applied to latent demand with no catch-up.
5. **One-off volume**: Direct OEM / Tier-1 levels are multiplied by `1 + s`, where `s` is the excess of the detected
   one-off orders over their expectation relative to the one-off-free demand of those channels in the last 36 months
   (measured at every origin; part of `level` in `forecast.parquet`).

### 3.2 Global LightGBM (`celeris.models.gbm`)

A direct multi-horizon model of the ratio `actual / structural forecast` (L2 objective, weight = structural forecast,
so leaves are ratios of sums and the model targets the mean; horizon is a feature). Training rows come from structural
forecasts made at inner origins every 3 months from 2021-10, all before the fold's origin and with targets before it,
each an as-of fit. Each inner origin's ratios are divided by that origin's overall ratio (without this the member
inherited a +4 to +6 % bias). 32 features (horizon, calendar month, cycle span, the structural components, level ratios
12 / 36 / all-history vs 24 months, prior / level, recent in-sample residual ratios, lifecycle position, ADI / CV^2,
family, region, channel, powertrain, tier, cycle kind); never raw indicator levels or identifiers. 3 seeds x 300
rounds, 4 threads, deterministic.

### 3.3 Ensemble rule

Equal weights; a member is kept only if the ensemble improves WAPE + |bias| over the structural model in at least 3 of
the 4 decision folds (dossier 6.3 #4). Learned weights are not used.

## 4. Backtest design (`celeris.backtest`)

- **Rolling origin, expanding window, 19-month horizon.** Decision folds 2022-10, 2023-10, 2024-10 (October-aligned
  like the real task) and 2025-03; 2021-10 is a stress fold (chip shortage, before the MEA opening), reported but
  never used for decisions or means.
- **No leakage.** At every origin the demand state (unconstrained demand, cycles, lost accounts, switches, fills),
  one-offs, masks, levels, seasonality, holiday depths, EV betas, macro drivers and paths and the prior are rebuilt
  from data up to the origin. `tests/test_model_structural.py::test_no_leakage_after_the_origin` scrambles every datum
  after an origin (units, customers, missing rows, stock-outs) and asserts that the origin's forecasts, baselines and
  GBM features are unchanged. Reference data known in advance (master, Record_ID blocks, events calendar, indicator
  values) is shared.
- **Scoring.** Against the final unconstrained demand; cells with unknown demand are not scored. WAPE = sum |a - f| /
  sum a, bias = sum (f - a) / sum a, and WAPE + |bias|, by family, region, channel, horizon, horizon bucket, calendar
  month, cycle kind and intermittency class, at series, SKU, family x region, family, region and total level
  (`metrics.csv`), with and without lost accounts and one-offs.
- **Noise floor / leakage check.** The `oracle` refits each series' level on its own horizon (true level, estimated
  factors). An honest forecast must score above it; `summary.json` checks this at every fold. A second floor is the
  expected absolute deviation of the negative-binomial noise at the oracle means.
- **Honesty note on tuning.** The structural model started from the dossier's recommended values. The experiments in
  section 6 were then run on the same four folds that are reported, with a declared rule: a variant replaces the
  default only if it lowers the mean WAPE + |bias| of the folds by more than 0.0005 (smaller differences are within
  fold-to-fold noise). Two choices changed this way (no 2021-22 era factor in the macro estimator; the one-off
  uplift), so the reported numbers of the final configuration are in-sample with respect to these two discrete
  choices; their gains are 0.001-0.002 of WAPE + |bias|. The ensemble rule (>= 3 of 4 folds) comes from the dossier and
  was fixed in advance. The stress fold 2021-10 was never used for any decision. The optimisation round (section 11)
  added three **confirmation origins** (2023-03, 2024-03, 2025-01) that no decision looked at before a candidate had
  passed on the four decision folds; the one adopted change (converged, driver-averaged factor fit) is in-sample on
  the decision folds but out of sample on these three, where it gains 0.008 of WAPE + |bias| on average.

## 5. Backtest results

### 5.1 Model ladder

WAPE / bias at series x month over all scored cells of each fold (`summary.json` -> `ladder`, `metrics.csv`). Mean =
average of the four decision folds; the 2021-10 stress fold is shown but never used.

| Model | 2022-10 WAPE / bias | 2023-10 WAPE / bias | 2024-10 WAPE / bias | 2025-03 WAPE / bias | Mean WAPE | Mean bias | Mean WAPE + abs(bias) | 2021-10 (stress) |
|---|---|---|---|---|---|---|---|---|
| naive | 0.5423 / -7.5 % | 0.5111 / -8.9 % | 0.5017 / -0.6 % | 0.5096 / +4.0 % | 0.5162 | -3.2 % | 0.5688 | 0.6103 / +9.9 % |
| seasonal_naive | 0.4252 / -8.0 % | 0.3885 / -9.1 % | 0.3639 / -2.1 % | 0.3703 / +4.1 % | 0.3870 | -3.8 % | 0.4454 | 0.5055 / +9.6 % |
| moving_average | 0.5346 / -5.5 % | 0.5175 / -7.3 % | 0.5242 / +5.2 % | 0.5204 / +5.4 % | 0.5242 | -0.6 % | 0.5827 | 0.6229 / +13.0 % |
| croston | 0.5439 / -6.5 % | 0.5131 / -10.6 % | 0.5020 / -2.2 % | 0.5006 / -0.7 % | 0.5149 | -5.0 % | 0.5648 | 0.5776 / -0.8 % |
| sba | 0.5403 / -11.2 % | 0.5144 / -15.0 % | 0.4988 / -7.1 % | 0.4968 / -5.6 % | 0.5126 | -9.7 % | 0.6099 | 0.5659 / -5.8 % |
| tsb | 0.5433 / -7.7 % | 0.5128 / -11.2 % | 0.5021 / -2.6 % | 0.5000 / -1.2 % | 0.5145 | -5.7 % | 0.5711 | 0.5754 / -2.4 % |
| adida | 0.5311 / -3.5 % | 0.5099 / -8.0 % | 0.5141 / +3.7 % | 0.5085 / +3.3 % | 0.5159 | -1.1 % | 0.5622 | 0.5958 / +6.5 % |
| imapa | 0.5313 / -3.6 % | 0.5103 / -8.0 % | 0.5146 / +3.7 % | 0.5084 / +3.1 % | 0.5161 | -1.2 % | 0.5621 | 0.5958 / +6.2 % |
| cycle_aware | 0.3696 / +1.3 % | 0.3174 / -10.9 % | 0.2849 / -2.8 % | 0.2778 / -0.6 % | 0.3124 | -3.2 % | 0.3515 | 0.3751 / -7.9 % |
| structural | 0.2832 / -0.8 % | 0.2600 / -0.2 % | 0.2506 / +0.9 % | 0.2507 / +0.8 % | 0.2611 | +0.2 % | 0.2676 | 0.3225 / -0.6 % |
| gbm | 0.2923 / +2.4 % | 0.2717 / +0.9 % | 0.2523 / +0.9 % | 0.2529 / +1.7 % | 0.2673 | +1.5 % | 0.2820 | n/a |
| ensemble | 0.2839 / +0.8 % | 0.2622 / +0.4 % | 0.2505 / +0.9 % | 0.2510 / +1.2 % | 0.2619 | +0.8 % | 0.2702 | 0.3225 / -0.6 % |
| oracle | 0.2500 / -0.3 % | 0.2341 / -0.2 % | 0.2286 / -0.0 % | 0.2300 / -0.0 % | 0.2356 | -0.1 % | 0.2370 | 0.2704 / -0.2 % |
| final | 0.2832 / -0.8 % | 0.2600 / -0.2 % | 0.2506 / +0.9 % | 0.2507 / +0.8 % | 0.2611 | +0.2 % | 0.2676 | 0.3225 / -0.6 % |

**Against the dossier's measured baselines** (dossier 6.8, origin 2025-03, 2,828 series with at least 24 months of
history, i.e. an easier set: no young series, no cold starts): flat 12-month mean 0.503-0.506 (ours 0.5096 on all
cells); seasonal naive 0.365-0.370 (0.3703); cycle-aware with a 12-month level 0.285-0.290 and with a seasonally
adjusted 24-month level 0.261-0.265 (our plain cycle-aware 0.2778); structural with the true family macro path 0.249
(our structural, with SKU paths estimated as of the origin, 0.2507); in-sample floor 0.240 on that set (our oracle
floor 0.2300 on ours). "A candidate must beat about 0.26 and be judged by its distance to about 0.25": we score 0.2507
at 2025-03 and 0.2506 at 2024-10, 2.1-2.2 points above the oracle of the same cells.

### 5.2 Accuracy at every level of the hierarchy

WAPE after summing actual and forecast to node x month (mean of the four folds):

| Model | series | SKU | family x region | family | region | total |
|---|---|---|---|---|---|---|
| naive | 0.5162 | 0.3032 | 0.1473 | 0.1065 | 0.1116 | 0.0857 |
| seasonal_naive | 0.3870 | 0.2501 | 0.1279 | 0.1087 | 0.0918 | 0.0832 |
| moving_average | 0.5242 | 0.3050 | 0.1470 | 0.1073 | 0.1098 | 0.0847 |
| croston | 0.5149 | 0.3045 | 0.1487 | 0.1023 | 0.1175 | 0.0865 |
| sba | 0.5126 | 0.3042 | 0.1645 | 0.1234 | 0.1412 | 0.1125 |
| tsb | 0.5145 | 0.3059 | 0.1509 | 0.1050 | 0.1207 | 0.0896 |
| adida | 0.5159 | 0.2999 | 0.1410 | 0.0990 | 0.1060 | 0.0807 |
| imapa | 0.5161 | 0.3000 | 0.1408 | 0.0987 | 0.1059 | 0.0807 |
| cycle_aware | 0.3124 | 0.2100 | 0.1167 | 0.0917 | 0.0966 | 0.0744 |
| structural | 0.2611 | 0.1469 | 0.0529 | 0.0308 | 0.0276 | 0.0178 |
| gbm | 0.2673 | 0.1549 | 0.0655 | 0.0475 | 0.0423 | 0.0356 |
| ensemble | 0.2619 | 0.1486 | 0.0562 | 0.0361 | 0.0321 | 0.0245 |
| oracle | 0.2356 | 0.1281 | 0.0466 | 0.0265 | 0.0258 | 0.0161 |
| final | 0.2611 | 0.1469 | 0.0529 | 0.0308 | 0.0276 | 0.0178 |

### 5.3 What each component buys (forecast value added)

Ladder steps (mean WAPE + |bias|): last-12-month mean 0.5688 -> seasonal naive 0.4454 -> cycle-aware naive 0.3515
-> structural 0.2676 -> oracle 0.2370. Placing demand on the ordering cycle is the largest single gain (0.09);
modelling latent demand with its drivers is the next (0.08). Ablations of the structural model (`experiments.csv`,
`components`; each row removes one component):

| Removed component | Mean WAPE | Mean bias | Mean WAPE + abs(bias) | Change vs full | Family x month WAPE |
|---|---|---|---|---|---|
| none (full model) | 0.2611 | +0.18 % | 0.2676 |  | 0.0308 |
| SKU macro path | 0.2776 | +1.59 % | 0.3201 | +0.0525 | 0.0718 |
| EV factor | 0.2796 | +0.96 % | 0.2892 | +0.0216 | 0.0452 |
| seasonality (region, channel, Thermal) | 0.2680 | +0.05 % | 0.2745 | +0.0070 | 0.0503 |
| moving holidays | 0.2618 | +0.09 % | 0.2686 | +0.0010 | 0.0315 |
| one-off uplift | 0.2601 | -0.81 % | 0.2683 | +0.0007 | 0.0299 |
| EOL phase-out | 0.2612 | +0.18 % | 0.2677 | +0.0001 (but 0.42 vs 0.74 on the rows within 11 months of EOL) | 0.0309 |
| window events (Helios, Orion) | 0.2611 | +0.18 % | 0.2676 | +0.0000 (no such event inside any fold's horizon with a measurable analogue) | 0.0308 |

The macro path is worth 5.3 points of WAPE + |bias| and more than halves the family x month error; the EV factor 2.2
points; seasonality 0.7; holidays 0.1. These match the dossier's estimates (macro 0.8-2.3 cell-WAPE points and two thirds of
the family x month error).

### 5.4 The final model by family, region, horizon and other slices

| family | cells (4 folds) | WAPE (series x month) | bias | WAPE at family x region x month |
|---|---|---|---|---|
| Brake & Safety Systems | 31,691 | 0.2502 | -0.6 % | 0.0526 |
| Chassis & Structural | 32,763 | 0.2656 | +0.2 % | 0.0484 |
| Electrical Assemblies | 32,177 | 0.2824 | +0.3 % | 0.0520 |
| Hydraulic Systems | 34,250 | 0.2713 | -1.0 % | 0.0606 |
| Powertrain Components | 32,376 | 0.2550 | +1.3 % | 0.0524 |
| Precision Machined Parts | 32,810 | 0.2603 | -0.4 % | 0.0548 |
| Thermal Management | 29,875 | 0.2550 | +1.6 % | 0.0500 |

| region | cells (4 folds) | WAPE (series x month) | bias | WAPE at family x region x month |
|---|---|---|---|---|
| Asia Pacific | 37,772 | 0.2439 | +0.2 % | 0.0527 |
| Europe | 37,881 | 0.2317 | -0.0 % | 0.0485 |
| India | 38,139 | 0.2685 | -0.3 % | 0.0474 |
| Latin America | 37,341 | 0.2926 | -0.1 % | 0.0530 |
| Middle East & Africa | 38,245 | 0.3441 | +1.4 % | 0.0789 |
| North America | 36,564 | 0.2345 | +0.5 % | 0.0502 |

| horizon bucket (months ahead) | cells (4 folds) | WAPE (series x month) | bias | WAPE at family x region x month |
|---|---|---|---|---|
| 01-03 | 35,278 | 0.2571 | -0.6 % | 0.0645 |
| 04-06 | 35,260 | 0.2545 | +0.9 % | 0.0520 |
| 07-12 | 71,245 | 0.2594 | -0.3 % | 0.0521 |
| 13-19 | 84,159 | 0.2673 | +0.7 % | 0.0493 |

Bias by calendar month is in `metrics.csv` (`slice_type = calendar_month`); at one origin horizon and calendar month
are confounded, so both are reported.

| channel | cells (4 folds) | WAPE (series x month) | bias | WAPE at family x region x month |
|---|---|---|---|---|
| Aftermarket | 36,381 | 0.2498 | +0.2 % | 0.0990 |
| Direct OEM | 83,987 | 0.2539 | +0.6 % | 0.0695 |
| Export | 33,626 | 0.2869 | -0.1 % | 0.1179 |
| Tier-1 Distributor | 71,948 | 0.2669 | -0.2 % | 0.0844 |

| cycle kind (as of the origin) | cells (4 folds) | WAPE (series x month) | bias | WAPE at family x region x month |
|---|---|---|---|---|
| A | 54,798 | 0.2470 | +1.0 % | 0.0821 |
| B | 20,886 | 0.2452 | -0.9 % | 0.1436 |
| M | 111,900 | 0.2647 | -0.2 % | 0.0642 |
| Q | 17,330 | 0.2597 | -0.1 % | 0.1798 |
| T | 16,708 | 0.2489 | +0.6 % | 0.1438 |
| unknown | 4,320 | 0.6819 | +15.2 % | 0.5129 |

| SBC intermittency class (as of the origin) | cells (4 folds) | WAPE (series x month) | bias | WAPE at family x region x month |
|---|---|---|---|---|
| erratic | 9,781 | 0.2780 | +0.5 % | 0.1645 |
| intermittent | 52,375 | 0.2527 | -0.2 % | 0.1058 |
| lumpy | 3,614 | 0.2660 | +1.4 % | 0.2219 |
| none | 4,509 | 0.6830 | +14.9 % | 0.5130 |
| smooth | 155,663 | 0.2567 | +0.1 % | 0.0562 |

`unknown` / `none` are series launched after the origin (cold starts of that fold): no history, no cycle.

| with / without lost accounts and one-offs | cells (4 folds) | WAPE (series x month) | bias | WAPE at family x region x month |
|---|---|---|---|---|
| all_scored | 225,942 | 0.2611 | +0.2 % | 0.0529 |
| excl_lost_accounts | 225,612 | 0.2592 | -0.0 % | 0.0525 |
| excl_one_offs | 225,480 | 0.2554 | +1.0 % | 0.0508 |
| excl_lost_and_one_offs | 225,150 | 0.2534 | +0.8 % | 0.0502 |
| excl_event_masked | 220,133 | 0.2583 | +0.1 % | 0.0499 |

One-off orders, which no forecast can place, cost 0.6 WAPE points; lost accounts that appeared inside a fold's horizon
cost 0.2 points on average (0.3-0.5 in the two recent folds).

### 5.5 Cold starts and successors (`Replaces_SKU`)

Series launched after the origin are cold starts of that fold: 4,320 cells over the four folds, WAPE 0.682 and bias
+15.2 % (mean of folds; pooled 0.653 / +9.3 %; first submission 0.674 / +10.9 %, pooled 0.646 / +4.2 %) with the
cross-sectional prior x launch ramp. The over-forecast is systematic (all cold starts are tail-tier SKUs, which run
below the mature-series prior); an as-of calibration of the prior on recent launches was tried and rejected because
its size varies too much by cohort (section 11, E6). Among them, 19 series of the three historical successor SKUs
(ELA-015, HYD-021, PTC-028; 242 cells) let us test the predecessor route (post-hoc on the first submission's
`predictions.parquet`): prior-based 0.407 / +1.8 % (WAPE + |bias| 0.425), predecessor's recent level x ramp 0.414 /
-12.4 % (0.538), geometric 50/50 blend 0.352 / -8.2 % (0.434); with the converged fit the prior-based route scores
0.382 / +7.0 % (0.452) on the same cells (the predecessor routes were not re-run). The prior is kept; the sample is
small and the dossier's larger test agrees (prior 0.19 vs predecessor 0.40 on 30 successor series). `Replaces_SKU`
therefore sets timing (predecessor phase-out meets the successor ramp) and the assumed price, not the level.

### 5.6 The global GBM: a negative result

The LightGBM member scores 0.2673 / +1.5 % on average (0.2820 WAPE + |bias|) and the equal-weight ensemble 0.2619 /
+0.8 % (0.2702). The ensemble beats the structural model in 0 of 4 folds (first submission: 1 of 4), so the rule drops
it; fixed horizon-aware blends (GBM weight only at horizons 1-6) were also tested and stayed within noise (section 11,
E11). A first
version without period normalisation was worse (+4 to +6 % bias); a total-preserving variant that only redistributes
the structural forecast across series was worse at both recent folds. Our reading: the GBM learns corrections from
the structural model's errors at 2021-2024 inner origins, which are dominated by period-specific errors (its top
features are the prior / level ratio, the family and the macro multiplier); those do not transfer to later periods. Feature importance
per fold is in `gbm_importance.csv`.

### 5.7 Noise floor and leakage check

| Origin | final WAPE | oracle WAPE (in-hindsight level) | NB expected-absolute-deviation floor | final above oracle |
|---|---|---|---|---|
| 2021-10 | 0.3225 | 0.2704 | 0.2213 | True |
| 2022-10 | 0.2832 | 0.2500 | 0.2221 | True |
| 2023-10 | 0.2600 | 0.2341 | 0.2216 | True |
| 2024-10 | 0.2506 | 0.2286 | 0.2227 | True |
| 2025-03 | 0.2507 | 0.2300 | 0.2227 | True |

The oracle refits each series' level on its own horizon with the model's factors; the NB floor is the expected
absolute deviation of negative-binomial order noise with the in-sample dispersions (a = 1.0, b = 0.045 North America
.. 0.099 MEA, i.e. NB size about 22 .. 10, dossier 19.7 .. 8.5). Every fold scores above both (`leakage_check.passed`);
`tests/test_model_structural.py` additionally proves that scrambling all data after an origin leaves that origin's
forecasts unchanged.

## 6. Decisions on the dossier's open questions (section 9.1)

All numbers are means over the four decision folds of `experiments.csv` / `summary.json` → `experiments`
(WAPE + |bias| at series x month unless stated; "targeted rows" are the rows a question is about), re-run on the
adopted (converged, driver-averaged) fit. Rule: a variant replaces the default only if it lowers the mean WAPE + |bias|
by more than 0.0005. The decisions were taken in the first round on the six-iteration fit; re-run on the adopted fit
they all stand, and the one variant the rule now flags (SKU prior sd 0.12, better at 4 of 4 decision folds) was
tested on the held-back confirmation origins and rejected (section 11, E12).

| # | Question | Variants (mean WAPE + abs(bias)) | Decision and evidence |
|---|---|---|---|
| 1 | Macro hump: amplitude, cap, era factor, drivers | soft cap, no era factor 0.2676 (shipped); soft cap + era 0.9 (dossier default) 0.2690; log-linear 0.2683; log-linear + era 0.9 0.2722; soft cap x gamma 1.1 0.2703; single driver per SKU 0.2896; SKU prior sd 0.03 / 0.06 / 0.12: 0.2723 / 0.2676 / 0.2648 | **Soft cap, shrunk 3-driver SKU paths averaged over near-tied family sets, prior sd 0.06, no era factor, gamma 1.0.** Round 1 (from the dossier default soft cap + era 0.9): dropping the era factor gained 0.0010 in 3 of 4 folds, so it was dropped (re-run: 0.0014). The soft cap beats log-linear (0.0007) and the single-driver reading loses 0.02 (confirms MI.v). Gamma 1.1 gained 0.0006 on the first-round fit and loses 0.0027 on the converged one (the amplitude the old fit lacked was the EV and holiday terms'). Prior sd 0.12 scores 0.0028 better on the decision folds through bias moves of both signs (WAPE 0.2613 vs 0.2611), is worse at 2 of 3 confirmation origins and keeps the backfit from converging: rejected (E12). Without the macro path the score rises to 0.3201 (section 5.3). |
| 2 | Mean vs median (scoring formula) | mean 0.2676; mean x 0.985: WAPE -0.13 points but bias -1.32 %, score 0.2731 | **Submit the mean** (unshaded), rounded to the nearest integer. |
| 3 | Level window and estimator | W24 0.2676; W18 0.2706; W36 0.2681; W48 0.2697 | **24 months, arithmetic ratio of sums** (log means are never used). |
| 4 | Holiday form for few-day months | linear 0.26758; sqrt 0.26799; none 0.26855. Targeted rows (APAC / MEA, January to May): 0.2954 / 0.2957 / 0.2958 | **Linear day share** `1 - depth x days / window`. Depths as of 2026-10: LNY 0.281 per full window, Ramadan 0.312. |
| 5 | Are one-offs part of the truth? | uplift 0.2676 vs none 0.2683; targeted Direct OEM / Tier-1 rows 0.2661 vs 0.2695 | **Add the expected one-off volume** (36-month excess share, +1.2 % on Direct OEM / Tier-1 as of 2026-10, 1.3-1.4 % at the backtest origins; a round-1 change: gain 0.0016 when tested against the dossier default, 0.0007 on the adopted fit). Costs about 0.1 point of row WAPE, removes about 1 point of negative bias. |
| 6 | Do lost accounts stay lost; new losses? | not testable; in the folds, lost accounts that appeared inside the horizon cost 0.3-0.5 points of WAPE (2024-10: 0.2506 vs 0.2476 without them; 2025-03: 0.2507 vs 0.2460) | **Keep the 16 at 0, no hazard** for new events (none in the test file). |
| 7 | Orion 2027-07/08 magnitude | not testable | **Measured Nexon 2023 strike multiplier** (0.144 as of 2026-10; 0.146 as of both 2024-10 and 2025-03) on latent demand, no catch-up; row bands with multiplier sd 0.25. |
| 8 | EV beyond the observed index; post-2023 beta | full-sample class betas 0.2676; betas from 2023 only 0.2753; no EV term 0.2892. Targeted EV + ICE rows: 0.2694 / 0.3212 / 0.3693 | **Full-sample class-level betas** (EV +0.0363, ICE -0.0117 per index point as of 2026-10). |
| 9 | Aftermarket damping 0.37 vs 0.42 | estimated (0.40-0.44 at the decision origins) 0.26758; fixed 0.37 0.26744; fixed 0.42 0.26752 | **Estimated per origin** (0.386 as of 2026-10, Fuel at lag 1 -0.068 per sd); the fixed values are within 0.0002 and come from the full sample. |
| 10 | Cold-start level | see section 5.5 | **Cross-sectional prior** (family, tier x region, channel, powertrain; smeared to the mean) x launch ramp. |
| 11 | EOL phase-out shape | graded 0.26758 vs none 0.26769 overall; targeted rows (within 11 months of EOL): 0.4213 vs 0.7378 | **Graded phase-out 0.90 .. 0.42**, strongly confirmed where it applies. |
| 12 | Helios India step start and size | not backtestable (the step starts after every decision origin) | **Measured x1.240 as of 2026-10** with half exposure in 2025-09 (dossier 1.24). |
| 13 | Young series | credibility pseudo-months n0 = 2 / 0.5 / 5: 0.2676 / 0.2685 / 0.2689; targeted young rows 0.3944 / 0.3853 / 0.4247 | **n0 = 2**, cycle posterior from the demand stage. |
| 14 | Hidden stock-outs | no experiment | about 0.05 % of units; not modelled. |
| 15 | RAW re-basing K | no experiment | a cleaning constant (1.25); RAW is a driver of Chassis only at some origins. |

## 7. Uncertainty (dossier 6.5)

Error model of an order forecast `m` (the contract's variance components in `forecast.parquet`):

- `var_noise = noise_scale x (a x m + b[region] x m^2)`: negative-binomial order noise, independent across rows; `a`
  and `b[region]` come from the in-sample residuals of the structural fit (last 36 months of each decision fold);
- `cv_level`: series-level error common to every month of a series (by lifecycle segment: mature / young / cold
  start), first by the method of moments on the backtest's series totals;
- `cv_group`: error shared by a family x region, by the method of moments on family x region totals;
- `cv_common`: error shared by every row (the period-level bias of a fold), an addition to the contract: without it the
  calibrated bands covered only 47 % of total x month actuals, because each fold carries a common bias (-0.8 % to
  +0.9 % in the final configuration) that independent components cannot reproduce.

Then split-conformal scaling on the backtest residuals: the noise scale so that row P10-P90 covers 80 %, `cv_level` so
that the mean coverage of series 19-month totals and SKU x month aggregates is 80 % (the contract has no SKU-shared
component, so this balances series against SKU coverage), `cv_group` for family x region x month and `cv_common` for
total x month. Row quantiles are integers
from a negative binomial with the row's total variance; aggregate quantiles use the log-normal formula of the contract
(`celeris.models.quantiles.aggregate_quantiles`, `outputs/forecast/aggregates.csv`). Orion rows get an extra variance
term for the shutdown multiplier (sd 0.25: P10 0.10 / P90 0.80, dossier 6.5).

**Calibrated components** (`outputs/backtest/uncertainty_calibration.json`, copied to
`outputs/forecast/uncertainty.json`, recalibrated on the adopted fit's backtest): noise `a` = 1.0, `b` = 0.045
(North America) .. 0.099 (MEA), noise scale 0.89; `cv_level` 0.130 for mature series, 0.196 for young series, 0.573
for cold starts; `cv_group` 0.042; `cv_common` 0.019 (first submission: 0.88; 0.136 / 0.214 / 0.599; 0.045; 0.022).

| Calibration / evaluation | rows (series x month) | SKU x month | family x region x month | total x month | series 19-month total | SKU 19-month total | family x region 19-month total |
|---|---|---|---|---|---|---|---|
| calibrated on all 4 folds (in-sample) | 80.0 % | 74.6 % | 80.0 % | 80.3 % | 85.4 % | 78.7 % | 97.0 % |
| leave-one-origin-out: 2025-03 held out | 81.6 % | 78.1 % | 89.5 % | 100.0 % | 89.1 % | 86.8 % | 100.0 % |
| leave-one-origin-out: 2024-10 held out | 81.4 % | 77.7 % | 89.7 % | 89.5 % | 89.4 % | 86.4 % | 100.0 % |
| leave-one-origin-out: 2023-10 held out | 81.0 % | 75.4 % | 78.7 % | 73.7 % | 86.3 % | 80.0 % | 95.2 % |
| leave-one-origin-out: 2022-10 held out | 75.5 % | 66.7 % | 63.7 % | 47.4 % | 75.9 % | 61.6 % | 88.1 % |
| stress fold 2021-10 (never used) | 72.6 % | 60.3 % | 50.3 % | 21.1 % | 74.0 % | 59.9 % | 81.0 % |

- **Calibrated in sample**, the targets are met (rows, family x region x month and total x month at 80 %). SKU x month
  is 75 % and series 19-month totals 85 %: the contract has a series-level and a family x region component but no
  SKU-shared one (the same SKU's regions share its macro path), so `cv_level` balances the two.
- **Out of sample (leave one origin out)** the bands are slightly wide for the two recent folds (rows 81-82 %, family
  x region 90 %) and too narrow for the oldest fold (2022-10: rows 76 %, family x region 64 %, total 47 %), whose
  errors are larger (macro turbulence of 2021-22). The 2021-10 stress fold, never used, is too narrow (rows 73 %, total
  21 %; first submission 69 % / 21 %): bands calibrated on calm folds do not cover a shock period.
- Row P10 / P90 average about 0.64 x / 1.40 x the mean (sums of row quantiles: 1.79 M / 3.92 M units against a mean of
  2.81 M), close to the dossier's 0.64 x / 1.39 x.

## 8. The forecast window: what each special case gets (dossier 5)

| Case | Rows | Treatment in the submission |
|---|---|---|
| Off-phase months | 8,382 | exactly 0 (orders accumulate the off months into the next on-phase month) |
| Lost accounts (16 series) | 304 | exactly 0; `latent_mean` 0 |
| After EOL (PTC-005 from 2027-06, PMP-003 from 2027-09, THM-001 from 2028-01) | 156 | exactly 0; the EOL month itself sells |
| EOL phase-out (months 5..0 before EOL) | 108 | latent x 0.90, 0.81, 0.71, 0.61, 0.52, 0.42 (4,004 units in total) |
| Cold starts PTC-029 (2027-03), PMP-020 (2027-06), THM-012 (2027-10) | 117 (10 series) | cross-sectional prior x launch ramp `1 - exp(-(k+1)/4.6)`; one month of latent demand per month (cycle unknown); tail tier; price = predecessor's 2026 price x median successor / predecessor price ratio (an assumption); `cv_level` 0.57 |
| Just-launched / young series (`lifecycle_phase`) | 119 / 356 | credibility blend of the ramp-corrected level with the prior (2 pseudo-months); cycle posterior from the demand stage |
| Customer-switch series | 23 series | level from post-switch months (segment levels) |
| Helios Auto Parts India | 1,235 | measured step x1.240 (the level is on the pre-step scale) |
| Orion Driveline North America, 2027-07 / 08 | 124 | latent x 0.144 (the measured Nexon 2023 strike), no catch-up; cycle series carry the reduced months into their next order; multiplier sd 0.25 in the bands |
| Lunar New Year / Ramadan | APAC / MEA rows | day counts of the events calendar (2027-02 LNY 10 days and Ramadan 21; 2027-03 Ramadan 9; 2028-01 LNY 6 / Ramadan 4; 2028-02 LNY 4 / Ramadan 26) |
| NA July retooling, EU August shutdown, APAC October, LatAm January | region rows | inside the region x calendar-month seasonality |
| Year-end before the 2027 / 2028 price rises | Tier-1 + Aftermarket, Direct OEM + Export | ordinary channel x calendar-month pattern; no pre-buy (no announcement event) |
| Macro | every row | the supplied indicator paths at each SKU's lag (never raw levels in a tree) |
| One-offs | Direct OEM / Tier-1 rows | expected volume +1.2 % on the mean, not placed in single months |
| Prices | every row | 2026 invoice price x 1.045 in 2027 (EV-059) and x 1.045 x 1.040 in 2028 (EV-065) |

## 9. Final-forecast sanity (`outputs/forecast/*`)

- **Contract.** `submission.csv`: 58,219 rows in `test.csv` order, header `Date,SKU_ID,Region,Units_Sold_Forecast`,
  non-negative integers, the rounded mean (`forecast_checks` in the stage and `tests/test_forecast_contract.py`).
  `forecast.parquet`: the contract columns; the components multiply to `latent_mean` on every row; `p10 <= p50 <=
  p90`; the 8,842 structural zeros are exactly 0 (8,382 off-phase, 304 lost accounts, 156 post-EOL). Bottom-up sums
  per month equal `aggregates.csv` at total, family, region, channel and family x region level.
- **Totals.** 2,805,199 units over 19 months (mean 2,805,160 before rounding), x1.039 the last 19 months of
  unconstrained demand (2,699,398, 2025-04..2026-10). The first 12 months are x1.048 the same months a year earlier;
  the last 7 months fall to x0.951 of the window's first 7, as the macro hump fades (dossier: x1.04-1.08 in 2026-11,
  about x1.00 by 2028-05). The first window month (157,615) continues the elevated end of the history (2026-09 / 10:
  162,134 / 164,609, +13 % / +17 % year on year), which the macro path explains as the start of the hump.

| Month | Forecast | Aggregate P10 | Aggregate P90 | Same month a year earlier (history) |
|---|---|---|---|---|
| 2026-11 | 157,615 | 153,359 | 161,933 | 136,212 |
| 2026-12 | 140,810 | 136,983 | 144,665 | 121,517 |
| 2027-01 | 147,402 | 143,383 | 151,447 | 128,257 |
| 2027-02 | 138,737 | 134,973 | 142,534 | 121,887 |
| 2027-03 | 159,766 | 155,431 | 164,114 | 142,453 |
| 2027-04 | 158,007 | 153,735 | 162,340 | 148,791 |
| 2027-05 | 159,734 | 155,409 | 164,091 | 153,804 |
| 2027-06 | 145,965 | 141,998 | 149,953 | 145,939 |
| 2027-07 | 145,150 | 141,191 | 149,169 | 149,633 |
| 2027-08 | 131,073 | 127,497 | 134,697 | 137,221 |
| 2027-09 | 155,483 | 151,278 | 159,729 | 162,134 |
| 2027-10 | 155,727 | 151,483 | 159,967 | 164,609 |
| 2027-11 | 149,778 | 145,736 | 153,891 | (forecast 157,615) |
| 2027-12 | 133,000 | 129,382 | 136,646 | (forecast 140,810) |
| 2028-01 | 135,422 | 131,730 | 139,151 | (forecast 147,402) |
| 2028-02 | 133,770 | 130,136 | 137,428 | (forecast 138,737) |
| 2028-03 | 153,660 | 149,514 | 157,869 | (forecast 159,766) |
| 2028-04 | 151,103 | 147,006 | 155,243 | (forecast 158,007) |
| 2028-05 | 152,997 | 148,861 | 157,182 | (forecast 159,734) |

| Family | 19-month forecast | Last 19 months | Ratio | Region | 19-month forecast | Last 19 months | Ratio |
|---|---|---|---|---|---|---|---|
| Brake & Safety Systems | 513,714 | 506,421 | 1.014 | Asia Pacific | 509,815 | 495,952 | 1.028 |
| Chassis & Structural | 429,176 | 418,143 | 1.026 | Europe | 539,158 | 510,885 | 1.055 |
| Electrical Assemblies | 272,880 | 265,956 | 1.026 | India | 513,989 | 489,946 | 1.049 |
| Hydraulic Systems | 348,512 | 318,771 | 1.093 | Latin America | 453,948 | 447,091 | 1.015 |
| Powertrain Components | 364,121 | 355,763 | 1.023 | Middle East & Africa | 260,088 | 246,596 | 1.055 |
| Precision Machined Parts | 455,750 | 419,284 | 1.087 | North America | 528,201 | 508,928 | 1.038 |
| Thermal Management | 421,046 | 415,060 | 1.014 |  |  |  |  |

  Precision Machined Parts and Hydraulic Systems lead (PMI and utilisation drivers), Brake, Electrical and Thermal are
  nearly flat (x1.01-1.03), as the dossier's macro analysis predicted (PMP x1.088, HYD x1.047, BSS 0.998, ELA 0.982 window means
  against the last 12 months). India includes the Helios step for the full window.
- **Cold starts**: 4,058 units in 117 rows; mature levels PTC-029 50.1 / 43.5 / 26.1 (APAC / LatAm / MEA), PMP-020
  58.5 / 54.7 / 32.0 / 62.9 (India / LatAm / MEA / NA), THM-012 68.0 / 59.6 / 68.2 (Europe / LatAm / NA), in line with
  the dossier's independent priors (52 / 44 / 27; 56 / 49 / 30 / 62; 69 / 55 / 70).
- **Orion**: the 62 North America series of Orion Driveline order 3,779 units in 2027-06, 714 in 2027-07, 574 in
  2027-08 and 3,425 in 2027-09 (latent demand 427 / 492 in the shutdown months against about 3,600 around them).
- **Revenue**: USD 2,517.2 M (mean x assumed invoice price).

## 10. Limitations and what remains uncertain

- **Orion 2027-07/08 magnitude is not testable.** We apply the measured Nexon 2023 strike multiplier to latent demand
  with no catch-up (same event type and "shut" wording); a shutdown-with-catch-up reading or a milder 0.3-0.4 would
  add a few thousand units in 2027-07..09. The rows carry a wide band (multiplier sd 0.25).
- **The macro hump is the largest systematic risk.** Its size hinges on how weight splits between utilisation (above
  its historical maximum in the window, damped by the soft cap) and new-vehicle orders (below their recent mean), which
  history barely separates (dossier 9.1 #1). Backtests cannot identify the amplitude to better than a few tenths of a
  WAPE point (gamma 1.1 scored 0.0006 better than 1.0 on the first-round fit and 0.0027 worse on the converged one; we
  kept 1.0).
- **One-off orders are not forecast at cell level.** Their expected volume (+1.2 % on Direct OEM / Tier-1 as of 2026-10, 1.3-1.4 % at the backtest origins) is
  spread over every order of those channels, which lowers bias but costs about 0.1 point of row WAPE; a scorer that
  uses row WAPE alone would prefer the one-off-free mean (0.2601 vs 0.2611).
- **No new account events.** Losses, switches and cycle changes inside the window are not forecast (none in the test
  file; dossier 9.1 #6); the 16 lost accounts stay at 0. If losses continued at the historical rate, about 0.7 % of
  volume would disappear.
- **Bias differs by period.** The older folds are -0.8 % / -0.2 % (2022-10 / 2023-10) and the recent ones +0.9 % /
  +0.8 % (2024-10 / 2025-03); the mean is +0.2 % (first submission: -1.0 / -1.2 / +0.5 / +1.1 %). Without the lost
  accounts that appeared inside those horizons the recent folds are +0.6 % / +0.3 %; of that remainder about 0.4 points
  are young and cold-start tail-tier series, which the cross-sectional prior over-forecasts (young +5-6 %, cold
  starts +14-35 % at the recent folds), and the rest is the one-off uplift being a little high for Direct OEM in these
  folds (`docs/optimisation_log.md`, step 2). An as-of correction of the launch prior was tested and rejected (E6).
- **Cycle-kind bias.** A-cycle series (monthly with an annual shutdown) are over-forecast at 6 of 7 backtest origins
  (+0.5 to +1.6 %) and B-cycle series (every second month) under-forecast at 7 of 7 (-0.2 to -2.5 %); the effects
  offset in the total and were not pursued (they point at the carry weights of the demand stage).
- **The GBM did not earn its place.** Its corrections, learned from 2021-2024 inner forecasts, do not transfer to later
  periods (section 5.6). A longer history or a different target might change that; with this data it does not.
- **The factor fit is now converged, and that matters for EV SKUs.** The first submission stopped the backfit after six
  iterations; the EV beta was then 0.018-0.029 per index point instead of its fixed point 0.030-0.037 and EV SKUs were
  under-forecast by 1-20 % in the backtests (we had attributed the low beta to the level and ramp terms absorbing the
  EV trend; it was non-convergence). The converged beta, 0.0363 as of 2026-10, matches the forensic estimate
  (0.036-0.038), as does the LNY depth (0.281 vs 0.28-0.30). The converged fit alone did not pass the keep rule: its
  gain came with the noise of picking one of two near-tied macro driver sets, which averaging the sets removed
  (section 11). Convergence takes 18-36 iterations (cap 40) and makes each fit several times slower; the backtest stage runs its
  fits in worker processes to compensate (section 11, runtime).
- **Cold starts** rest on a cross-sectional prior (log sd about 0.5 around it); `Replaces_SKU` only fixes their timing
  (the predecessor's phase-out meets the successor's ramp) and their price, because successors do not inherit regions,
  customers or channels (dossier 5.4).
- **Hidden stock-outs** (about 310 undetectable months) slightly understate levels; their volume is about 0.05 %.

### 10.1 Where accuracy could still be gained

The final model is 2.5 WAPE points above the oracle of the same cells (0.2611 vs 0.2356) and the oracle is about 1.3
points above the pure negative-binomial noise floor (0.2223). Roughly in order of expected value:

1. **Level estimation noise** (most of the 2.5 points). A 24-month ratio-of-sums level from orders with about 30 %
   noise each still carries a few percent of error per series. A hierarchical level model (SKU effect x region effect
   x series factor, dossier 4.2) that shrinks each series toward its SKU and region could reduce it, especially for
   small, Q / B-cycle and MEA series. The window tests (18-48 months) show the trade-off is flat around 24, and the
   optimisation round found no level estimator that beats it (E1: discounting, NB weights, shrinkage to the prior).
2. **SKU-shared macro error.** SKU x month coverage (75 %) and family x month WAPE (0.0308 vs the oracle's 0.0265)
   show residual errors shared by a SKU's regions: better identification of utilisation vs orders (dossier 9.1 #1) and
   of each SKU's lag would help the hump months most.
3. **Young and cold-start series** (WAPE 0.68 and bias +15 % on fold cold starts) are a small share of volume; a
   launch prior that knows tail-tier launches run below mature series would mostly improve bias, not total WAPE (an
   as-of cohort calibration was too noisy, E6).
4. **Holidays.** With the converged fit the LNY depth (0.281 per full window) matches the dossier's 0.28-0.30; the
   remaining holiday error is small (the hindsight holiday swap changes nothing, `docs/optimisation_log.md` section 1).
5. **What cannot be gained**: one-off orders (0.6 points) and lost accounts or switches inside the window are not
   predictable from the data; the negative-binomial noise floor itself is about 0.22-0.23.

## 11. Optimisation round (after the first submission)

Full notebook: `docs/optimisation_log.md`; scripts and result tables: `research/optimisation_lab/` (`lab2/` for the
third batch). **Protocol, declared before any experiment**: decision origins 2022-10, 2023-10, 2024-10, 2025-03;
**confirmation origins 2023-03, 2024-03, 2025-01**, looked at only for a candidate that had already passed; the
2021-10 stress origin watched, never decisive. **Keep rule**: lower series x month WAPE + |bias| at >= 3 of 4 decision
origins, mean gain > 0.0005, no harm on the confirmation origins (mean not worse, not worse at 2 of 3), aggregates not
worse. Secondary view, declared before the factor-fit decision: the same scores without the rows of accounts lost
inside the horizon (not forecastable; no losses are scheduled in the test window). Every estimator was declared in
the notebook before it was evaluated (one disclosed exception: a predecessor's prototype of E5a had been scored at all
seven origins before it was logged; the package implementation was declared and evaluated afresh).

| # | Hypothesis | Score delta at 2022-10 / 2023-10 / 2024-10 / 2025-03 (mean, wins); confirmation | Decision |
|---|---|---|---|
| E1 | A better level estimator (windows, discounting, NB weights, shrinkage to the prior or the size mean) | best: window 48 for small series -0.0003 (3 wins) | rejected |
| E2 | Macro hyper-parameters (gamma, model sd, prior sd, lag decay, gains, drivers) | WAPE flat 0.2630-0.2635; score moves are fold bias of +-0.3 pp with no consistent sign | rejected |
| E3 | Other settings (season prior, launch tau, young threshold / n0, EV window) | within noise; 10 backfit iterations improved WAPE at 4 of 4 -> E4 | rejected |
| E4 | The six-iteration backfit is not converged | converged fit: -0.0106 / -0.0061 / +0.0057 / +0.0008 (-0.0026, 2 wins); confirmation 1 of 3 | not adopted alone |
| E5a | Picking one of near-tied family driver sets is discontinuous; average the sets with posterior weights | converged + averaged: -0.0075 / -0.0119 / +0.0026 / -0.0044 (-0.0053, 3 wins); confirmation -0.0107 / -0.0095 / -0.0041 (3 of 3); stress -0.066 | **adopted** |
| E6 | The prior over-forecasts tail-tier launches; calibrate it on the recent launch cohort | vs adopted: +0.0015 / +0.0043 / -0.0024 / -0.0021 (+0.0003, 2 wins) | rejected |
| E10 | Cumulative instead of independent rounding of the submitted mean | <= 1e-4 | rejected |
| E11 | Horizon-aware GBM blend (GBM weight only at horizons 1-6) on the adopted member | schedule A -0.0003 (3 wins), B -0.0003 (2 wins); equal weights +0.0026 (0 wins) | rejected |
| E12 | SKU coefficient prior sd 0.12 (flagged by the re-run experiment grid) | vs adopted: -0.0043 / -0.0006 / -0.0022 / -0.0042 (4 wins, WAPE not better); confirmation +0.0018 / +0.0001 / -0.0027 (worse at 2 of 3); backfit no longer converges | rejected |

**What was wrong with the first submission's factor fit (E4, E5a).** The factors were fitted by six fixed
iterations of block updates. The EV beta update held the segment levels fixed; because the EV index rises inside every
series' life, levels and beta trade off along a ridge and each iteration moved the beta only part of the way: it
stopped at 0.018-0.029 per index point against a fixed point of 0.030-0.037 (the forensic estimate is 0.036-0.038),
and EV SKUs were under-forecast by 20 / 12 / 5 / 1 % at the four decision origins. The LNY depth had the same problem
(0.15-0.25 vs 0.24-0.28). Profile-likelihood steps (levels or the regional factor profiled out) and a convergence
criterion fix both. The converged fit alone failed the keep rule: removing the EV under-forecast also removed an
offset to small positive biases elsewhere, and which of two near-tied driver sets a family kept moved a fold by up
to 0.008. Averaging the near-tied sets (weights `exp(-(RSS + 9k - min)/2)`, at most four sets) removed that noise, and
the combination passed on both views:

| origin | first submission WAPE / bias / score | adopted WAPE / bias / score | delta | without in-horizon lost accounts: first / adopted |
|---|---|---|---|---|
| 2022-10 | 0.28821 / -1.02 % / 0.29843 | 0.28320 / -0.77 % / 0.29092 | -0.00751 | 0.29843 / 0.29092 |
| 2023-10 | 0.26141 / -1.20 % / 0.27342 | 0.25995 / -0.16 % / 0.26157 | -0.01185 | 0.27342 / 0.26157 |
| 2024-10 | 0.25165 / +0.52 % / 0.25682 | 0.25060 / +0.89 % / 0.25946 | +0.00264 | 0.25084 / 0.25353 |
| 2025-03 | 0.25175 / +1.10 % / 0.26278 | 0.25071 / +0.77 % / 0.25836 | -0.00442 | 0.25324 / 0.24890 |
| decision mean | 0.26326 / -0.15 % / 0.27286 | 0.26111 / +0.18 % / 0.26758 | -0.00529 | 0.26898 / 0.26373 |
| 2023-03 (confirmation) | 0.27573 / -0.54 % / 0.28116 | 0.26983 / +0.06 % / 0.27046 | -0.01070 | 0.28116 / 0.27046 |
| 2024-03 (confirmation) | 0.25336 / -1.58 % / 0.26916 | 0.25188 / -0.78 % / 0.25963 | -0.00953 | 0.26916 / 0.25963 |
| 2025-01 (confirmation) | 0.25258 / +1.25 % / 0.26508 | 0.25156 / +0.95 % / 0.26102 | -0.00406 | 0.25716 / 0.25318 |
| 2021-10 (stress) | 0.36176 / +3.26 % / 0.39436 | 0.32254 / -0.63 % / 0.32886 | -0.06550 | |

WAPE improves at all seven origins, family x month WAPE from 0.0345 to 0.0308, total x month from 0.0214 to 0.0178,
and EV SKUs from 0.297 / -9.6 % to 0.286 / -0.6 % (mean of the decision folds; ICE 0.259 / +0.4 % -> 0.259 / +0.2 %,
Universal 0.261 / +0.7 % -> 0.260 / +0.2 %). 2024-10 is the one decision fold that gets worse: its +0.9 % bias is
mostly accounts lost inside the horizon (+0.3 pp) and young / cold-start tail-tier series (+0.4 pp, section 10).

**Effect on the submission.** Total 2,793,254 -> 2,805,199 units (+0.43 %); by month -0.4 % (2028-01) to +1.0 %
(2027-04); EV SKUs +1.55 % (up to +3.2 % in 2027-03/04, where the EV index peaks; the window index is nearly flat
relative to the level window, so the larger EV beta moves the window only a little); ICE +0.26 %, Universal +0.30 %;
Hydraulic +1.4 %, other families +0.1 to +0.5 %. 77 of 49,377 positive rows change by more than 10 % (967 units of
the old forecast), 1,591 by more than 5 %; the 8,842 structural zeros are unchanged.

**Rejected, and why.** Level estimators (E1) and macro / other settings (E2, E3) sit at the noise threshold: the
24-month ratio of sums is at the optimum of its family, and the macro error left is coefficient-estimation variance.
The launch-cohort prior (E6) is right in direction but its as-of size is a noisy predictor (over-corrects 2023-10,
under-corrects 2025-03). The GBM blend (E11) gained up to 0.0008 on the first-submission member only because that
member had the EV and driver-choice errors; on the adopted member it is within noise. A looser SKU prior (E12) wins on
the decision folds through bias moves of both signs, loses at 2 of 3 confirmation origins and breaks convergence.
Quarterly-cycle series (largest excess WAPE by cycle kind) were diagnosed, not changed: their excess is level noise of
8 orders per 24 months plus cycle changes inside the horizon, and the Q level windows had already failed in E1.

**Runtime.** A converged fit takes 8-17 s instead of about 1.5 s, so the backtest stage (14 inner-origin fits for the
GBM and five scored origins with about 17 experiment refits each) grew from about 10 to 30.0 minutes (peak RSS
1.3 GB); the forecast and features stages take about 15 s each. Freezing coefficient rows that stopped moving in the
soft-cap Gauss-Newton fit (they would recompute the same step) cut the stage to 25.3 minutes with bit-identical
results (predictions and SKU paths compared in memory at three origins; the 19 output files of `features`,
`backtest` and `forecast` have identical hashes before and after the change). The backtest stage then moved its
independent work into three worker processes (`celeris.backtest.parallel`): the 10 inner-origin fits that are not
also scored origins and the 17 full experiment refits at each scored origin while the main process fits each scored origin's base model, then the four
leave-one-origin-out calibrations and the per-fold metrics. Measured on 25 Nov 2026 on the reference machine: 1,436 s
and 1.5 GB in one process, 600 s and 2.7 GB summed over the four processes, with the 19 output files of `features`,
`backtest` and `forecast` byte-identical; with `--workers 1` the new code takes 1,358 s and gives the same 19 files.
