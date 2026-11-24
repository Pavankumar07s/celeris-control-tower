# Methods research: forecasting toolkit for the 19-month SKU x Region forecast

Research date 2026-11-21. Scope: which models, objectives, validation design, uncertainty method and reconciliation
method to use for `Units_Sold` per SKU x Region x month, 2026-11 to 2028-05. Web sources are cited inline and listed
with their verification status in section 12. Nothing was installed.

**Bottom line.** Do not treat this as a generic intermittent-demand problem. The evidence from competitions and the
facts already established about this data point to the same design: forecast a smooth **latent monthly demand** per
series with a global LightGBM plus a transparent multiplicative model, place it onto the known ordering cycle, submit
the **conditional mean** (not the median), build P10/P50/P90 by simulation with backtest-calibrated spread, and get
hierarchy coherence by summing bottom-level sample paths. Croston-family methods, per-series ARIMA/ETS and foundation
models are benchmarks and aggregate-level helpers, not the core. Equal-weight averaging of two to four diverse members
is the right ensemble; learned weights are not supportable with four or five backtest origins.

Three results in this report are new computations rather than literature and should be checked by the build team:

1. With the order-noise shape found in `research/scratch/demand-dgp/logs/07.log`, forecasting the median instead of
   the mean improves WAPE by about 0.1 point and costs about 3 points of bias (section 5).
2. The same noise puts a floor of roughly 0.22 to 0.26 on SKU x Region x month WAPE for typical order sizes, so the
   phase-aware baseline at 0.29 is already close to the floor; the remaining gains are bias, level and trend.
3. This machine can run Chronos-2 without a heavy install: the conda `base` env already has torch 2.9.1+cu128 with a
   working GTX 1650 Ti; only two small Python packages and 112 to 478 MB of weights are missing (section 10).

---

## 1. Terms and evidence grades

| Term | Meaning here |
|---|---|
| Series | One SKU x Region (3,083 in train, plus cold starts in test). |
| Latent monthly demand | Demand per month before the customer's ordering cycle bunches it into orders (from `research/panel-missing-zeros.md`: a quarterly order is about 2.94x a monthly order). |
| On-phase month | A month in which the series' ordering cycle places an order. Off-phase months are structural zeros. |
| Origin | Last month of training data in a backtest fold. |
| WAPE, bias | WAPE = sum of abs(F - A) / sum of A. Bias = sum of (F - A) / sum of A. Both at row level unless stated. |
| Level L(s,t) | Trailing-12-month unconstrained units of series s divided by 12, using data up to month t only. |

Evidence grades used in the text: **[P]** read in the primary source; **[S]** secondary source or search summary of a
page I could not open; **[C]** my own computation; **[D]** data fact from another lens report in `research/`.

---

## 2. Ranked shortlist

Rank is by expected contribution to the jury criteria "Model Performance & Validation" and "Originality", net of
build risk.

| Rank | Component | Role | Main evidence | Effort | Risk |
|---|---|---|---|---|---|
| 1 | Latent-demand x ordering-cycle decomposition | Backbone. Removes intermittency instead of modelling it. | Temporal aggregation removes intermittence (ADIDA, Kourentzes and Athanasopoulos); phase-aware forecast cut backtest WAPE 0.506 to 0.290 [D] | Medium | Low |
| 2 | Global LightGBM, direct multi-horizon, per-series scaled target | Main learner for seasonality, macro, lifecycle, events | M5 top-50, VN1 top-20, Favorita, Rossmann, VN2 winner | Medium | Low |
| 3 | Transparent multiplicative model (level x season x macro elasticities x lifecycle x events) | Extrapolates where trees cannot; powers what-if; second ensemble member | Rossmann winner's ridge trend adjustment; trees cannot extrapolate; M5 2nd-place trend alignment | Medium | Low |
| 4 | Mean point forecast, nearest-integer rounding, no global shading | Scores well on WAPE and bias together | Kolassa; VN1 metric; simulation in section 5 [C] | Low | Low |
| 5 | Rolling-origin backtest, 19-month horizon, 4 to 5 origins, October-aligned | Model choice, calibration data, dashboard accuracy view | M5 finding 6; VN1; Tashman; FPP3 | Medium | Low |
| 6 | Simulation-based P10/P50/P90 with horizon-wise conformal calibration | Expert-tier intervals, coherent by construction | Conformal benchmark on 3,000+ monthly sales series; CQR; reconciliation review | Medium | Medium |
| 7 | Bottom-up coherence plus optional diagonal-weight (WLS) alignment to family x region forecasts | "Forecasts that add up" | FPP3; reconciliation review; M5 findings 5 | Low to medium | Low |
| 8 | Baselines: seasonal naive, moving average, AutoETS/AutoTheta on aggregates, Croston/SBA/TSB/ADIDA/IMAPA | Required tiers and honest yardstick | M5 Table 4; statsforecast | Low | None |
| 9 | Cold-start model from analogue launches and ramp curve | Planned launches and very young series | Hu et al. life-cycle clustering; 625 in-window launch series available [D] | Low to medium | Medium |
| 10 | Equal-weight ensemble of 2 to 4 members, gated by backtest | A few percent accuracy, more stability | M5 finding 2; VN1; forecast-combination puzzle | Low | Low |
| 11 | Chronos-2 zero-shot as challenger and aggregate-level member | Innovation evidence; independent check | fev-bench; Chronos-2 paper; local feasibility check | Low | Low if gated |
| 12 | LightGBM quantile regression with conformal correction | Challenger for the interval method | CQR; M5 uncertainty top methods | Low | Low |

Not recommended: recursive multi-step forecasting on raw orders; Tweedie on raw units as the main model; Croston
family as a production forecast; learned ensemble weights; full MinT-shrink or ERM reconciliation; fine-tuning a
foundation model; TimesFM-3, TiRex and TabPFN-TS on this hardware (reasons in section 10).

---

## 3. Question 1: lessons from M5, VN1 and the Kaggle retail competitions

### 3.1 What the winners did

**M5 Accuracy** (42,840 hierarchical Walmart series, 28-day horizon). Read from the organisers' paper
([Makridakis et al.](https://statmodeling.stat.columbia.edu/wp-content/uploads/2021/10/M5_accuracy_competition.pdf)) [P]:

| Place | Method | Details that transfer |
|---|---|---|
| 1 | Equal-weight mean of LightGBM models pooled per store, store-category, store-department; each in a recursive and a non-recursive version (220 models, 6 per series) | Tweedie objective, no early stopping, tuned on the last four 28-day windows using both mean and standard deviation of error |
| 2 | Equal-weight LightGBM per store, adjusted with multipliers so the bottom-level sum matches N-BEATS forecasts of the top levels | LightGBM used only calendar and price features, no sales lags; custom asymmetric loss |
| 3 | Equal-weight mean of 43 LSTM networks (DeepAR-like), Tweedie-type loss | About 100 features including zero-sales periods |
| 4 | Non-recursive LightGBM per store, one model per forecast week | Tweedie, no early stopping, no hyper-parameter optimisation |
| 5 | Recursive LightGBM per department, multipliers to match recent store-department mean | Poisson objective |

Findings stated by the organisers [P]: all top-50 used cross-learning (one model across many series); simple
equal-weight combinations dominated and only one reported combination used unequal weights; top methods were on
average more than 20% better than the best benchmarks but "the differences were smaller at lower aggregation levels";
external adjustments that align bottom forecasts with upper levels "proved to be beneficial"; an effective
cross-validation strategy was decisive because many teams failed to pick their own best submission; the winner found
recursive models more accurate on average but less stable, so he averaged recursive and non-recursive.

The benchmark table in the same paper is the key warning for bottom-level work [P]: against Croston's method,
bottom-up exponential smoothing was 52.7% better at the top level but only 1.2% better at the product-store level, and
seasonal naive was 27.0% worse than Croston at that level. At the bottom level, simple methods are nearly
indistinguishable; gains come from cross-learning and explanatory variables. The special-issue editorial quotes
Kolassa's discussion that only 7.5% of teams beat the bottom-up exponential-smoothing benchmark
([PMC9232271](https://pmc.ncbi.nlm.nih.gov/articles/PMC9232271)) [P].

**M5 Uncertainty.** From the same editorial [P]: 1st place (Lainder and Wolfinger) used LightGBM with careful
cross-validation and data augmentation; 2nd combined machine learning with non-parametric estimation of the
distribution and predicted the median and other quantiles separately; 3rd used gradient-boosted trees with neural
networks; a 6th-place white-box state-space model estimated quantiles by Monte Carlo simulation; performance
deteriorated at more granular levels. I could not open the full results paper
([record](https://ideas.repec.org/a/eee/intfor/v38y2022i4p1365-1385.html)), so there are no winner margins here.
Ziel's commentary argues that GBM objectives used in M5 do not match overdispersed, zero-heavy counts and recommends
distributional models such as the negative binomial ([arXiv 2107.06675](https://arxiv.org/abs/2107.06675)) [P, abstract].

**VN1 (2024)**: 15,053 weekly product-warehouse series, 13-week horizon, score = MAE% + abs(Bias%), both divided by
total sales ([SupChains/VN1](https://github.com/SupChains/VN1), [supchains.com](https://supchains.com/vn1-forecasting-competition/)) [P]:

| Rank | Score | MAE% | Bias% |
|---|---|---|---|
| 1 Figura and Stubbs | 46.37% | 45.25% | +1.12% |
| 2 Furlotte | 46.57% | 46.26% | -0.31% |
| 3 Nikzad | 47.58% | 46.00% | +1.58% |
| 4 Schwartz | 47.74% | 47.54% | -0.20% |
| 5 Hoang | 48.08% | 44.99% | +3.09% |
| Naive (last value) | 50.70% | 50.13% | -0.56% |
| 12-week moving average | 80.46% | 60.97% | +19.49% |

Lessons from the organiser's interviews with the top 20 [P]: LightGBM was the most used model; most combined several
models or several runs; about half wrote under 300 lines and nearly all ran in under 10 minutes; only two flagged
outliers; none used Prophet; "a fast and robust way to evaluate models" was the key skill; freeze the model before
the final scoring. Two points matter for us. First, 5th place had the best MAE in the top five and lost on bias: a
metric that includes bias is won by bias control. Second, a moving average carried +19.5% bias because of
seasonality, so a level-only baseline is dangerous over a seasonal horizon. One search summary of the organiser's
Medium article says the winning ensemble gave ARIMA a 30% weight; I could not open the article (HTTP 403), so treat
that as unverified [S].

Zero-shot foundation models on VN1: Nixtla reports TimeGPT at 0.4651, which would sit between 1st and 2nd, but it was
not an eligible entry ([Nixtla](https://nixtla.github.io/nixtlar/articles/vn1-forecasting-competition.html)) [P]. A
blog claims a fine-tuned Moirai-base reached 0.4629 after the fact using four 80 GB GPUs
([dev.to](https://dev.to/orange111/achieving-1st-place-in-the-vn1-forecasting-competition-with-fine-tuned-moirai-model-2cmb));
that is not an official placing [P for the blog's content].

**VN2 (2025-26) winner**, the closest published recipe to ours
([arXiv 2601.18919](https://arxiv.org/abs/2601.18919)) [P]: one global CatBoost per horizon (direct, not recursive, "to
avoid error accumulation"); targets and lag features divided by a per-series scale (annualised trailing 53-week mean,
at least 45 in-stock weeks, floor 1); stockout weeks set to missing before any feature or target is computed;
observation weights halving for each year back in time (tunable); loss RMSE on the scaled target while tuning on MAE
in original units; features were lags, rolling means and medians, exponentially weighted means, rolling standard
deviation and IQR, differences, Fourier terms, a last-year window, non-zero rate, time since spike. The author warns
that series identifiers as categorical features "would generalize poorly to unseen stores or products".

**Kaggle Rossmann, Favorita, Wikipedia, Walmart**, from the review by Bojer and Meldgaard
([arXiv 2009.07701](https://arxiv.org/abs/2009.07701)) [P, full text]:

- Rossmann (1 to 48 days ahead): the winner adapted XGBoost with "a trend adjustment using a ridge regression model to
  deal with the fact that GBDT cannot extrapolate trends"; features were statistics and rolling statistics at several
  hierarchy levels plus event counters (days until, into and after an event). Ensembling several XGBoost models gave
  about 5% over the best single model, with diversity from data subsets, feature subsets, and direct versus iterated
  prediction. A hybrid of local ARIMA/ETS plus a global model on the residuals placed 26th, 11% behind the winner.
- Favorita (1 to 16 days): the winner's innovation was "one model per forecast horizon ... to allow the models to
  learn what information is useful for each horizon"; features were rolling statistics grouped by store, item, class
  and combinations, including exponential moving averages; the winner trained on recent data only.
- Wikipedia (12 to 42 days): series scaled independently "to facilitate cross-learning", with the series median kept
  as a feature so scale-dependent patterns remain learnable; year-ago and quarter-ago values supplied explicitly.
- Validation: most winners used a hold-out of the same length as the forecast horizon; Favorita top solutions also
  combined grouped K-fold with time-series cross-validation.

Why trees dominate and where they fail: Januschowski et al. attribute it to robustness, low sensitivity to
hyper-parameters and handling of sparse targets
([IJF 2022](https://ideas.repec.org/a/eee/intfor/v38y2022i4p1473-1481.html)) [S]; piecewise-constant leaves mean they
do not forecast beyond the range of the training targets ([Hyper-Trees](https://arxiv.org/html/2405.07836v5)) [S].

### 3.2 Direct or recursive for 19 months

- Ben Taieb et al. on the NN5 benchmark: multiple-output (direct-type) strategies performed best, the recursive
  strategy propagates errors along the horizon, and deseasonalisation improved every strategy
  ([arXiv 1108.3259](https://arxiv.org/abs/1108.3259)) [S].
- GIFT-Eval attributes the decline of some foundation models at long horizons to recursive error accumulation
  ([arXiv 2410.10393](https://arxiv.org/html/2410.10393)) [P].
- mlforecast is recursive by default and offers one model per horizon via `max_horizon`; its own example shows direct
  can be worse on some series, so it is an empirical choice
  ([docs](https://nixtlaverse.nixtla.io/mlforecast/docs/how-to-guides/one_model_per_horizon.html)) [S].

Recommendation: **direct, with the horizon as a feature in one stacked model**, plus horizon-bucket models (1 to 6,
7 to 12, 13 to 19 months) as ensemble diversity. Reasons specific to this task: the horizon is 19 steps; order-level
noise has a coefficient of variation near 0.30 [D], which a recursive model would feed back into its own lags; and
the strongest drivers at long horizons are known in advance (calendar, macro, events, lifecycle, ordering phase),
exactly the situation of the M5 2nd place whose LightGBM used no sales lags at all. If a recursive member is wanted
for diversity, recurse on the smoothed level only, never on raw orders.

### 3.3 Recipe: target, features, hyper-parameters

Target (one training row per series x origin month t x horizon h, target month t+h on-phase and not censored):

```
units(s, t+h)            unconstrained order units in the target month
k(s, t+h)                months of latent demand the order covers (1, 2, 3; 0.5 weight for a shutdown month) [D]
L(s, t)                  trailing-12-month units / 12, data up to t only (cycle-neutral because 12 is a multiple of every cycle length)
y = units / (L * k)      ratio target, about 1.0 on average
```

Model the order, not a monthly allocation of it. Noise is applied per order [D], so spreading one order over k months
would create k identical pseudo-observations.

Feature set (computed at origin t unless marked "target month"):

| Group | Features | Source of the idea |
|---|---|---|
| Level and momentum | L3/L12, L6/L12, L12 now / L12 one year earlier, slope of log level, exponentially weighted means (span 3, 6, 12) over L12, rolling median / L12, coefficient of variation of the last 12 orders, last three orders / L12 | Favorita, VN2 |
| Aligned seasonal lag | y at target month minus 12 (minus 24 when h > 12), average of the same calendar month over all past years / L | Wikipedia winner, VN2 |
| Hierarchy at origin | Same momentum ratios for the SKU, family x region, customer x region and region totals; series share of its SKU | Rossmann, Favorita |
| Horizon and calendar (target month) | h, month of year (categorical plus sin/cos), quarter, months covered k, shutdown catch-up flag | Favorita per-horizon idea, VN2 |
| Ordering cycle | Cycle type, months since the cycle last changed, phase confidence | [D] |
| Macro (target month) | Each indicator at its family-specific lead, expressed as change since the origin month and as year-on-year change, not as raw level; `EV_Adoption_Index` change x powertrain (EV, ICE, Universal) | Trees cannot extrapolate; EV effect [D] |
| Lifecycle (target month) | Age in months, months to EOL (capped), ramp factor, lifecycle status, successor active | [D] |
| Events (target month) | Flags by event type where scope matches the series; months until and since the nearest price change (pre-buy and post-dip windows); holiday months by region | Rossmann event counters |
| Static | Family, business unit, size class (numeric), powertrain, region, channel, log price, intermittency class, log L as the retained scale feature | Wikipedia winner |
| Data quality | Share of the last 12 months that was imputed or unconstrained | VN2 |

Do not use `SKU_ID`, series id or customer name as raw categorical features: they do not exist for cold starts and
they let the model memorise levels the ratio target was designed to remove. Use out-of-fold target encodings if a
customer effect is wanted.

LightGBM starting configuration (LightGBM 4.7.0 is installed in `.venv`). The parameter meanings are from the
[LightGBM docs](https://lightgbm.readthedocs.io/en/latest/Parameters.html) [P]; the numeric values are my starting
points, not sourced, and the M5 4th place shows that untuned defaults are competitive:

```
member A: objective='regression' (L2) on y          -> targets the mean ratio
member B: objective='gamma' on y (log link)          -> targets the mean, always positive
learning_rate=0.03, num_leaves=63, min_data_in_leaf=200, feature_fraction=0.7,
bagging_fraction=0.7, bagging_freq=1, lambda_l2=5, max_bin=255,
cat_smooth=20, min_data_per_group=200
n_estimators fixed from cross-validation (expect 1,000 to 2,000); no early stopping in the final fit
sample weight = L(s,t) * decay^(years before the fold origin), decay tuned in {1.0, 0.85, 0.7}
average 5 seeds
optional member C: linear_tree=True on the same features (not available with regression_l1)
```

Both objectives target the conditional mean. Weighting by L makes the loss volume-weighted like WAPE. Size: roughly
3 to 4 million rows x 60 features (82 usable origins x 19 horizons for a full-life series, fewer for short lives and
off-phase months), about 1 GB as float32; use every second origin month if memory is tight.

Tweedie and Poisson: they won M5 because zeros there were stochastic. Here 98.7% of zeros are placed by a
deterministic cycle [D]. Keep `objective='tweedie'` (`tweedie_variance_power` between 1.0 and 2.0, default 1.5, log
link [P]) only for a challenger trained on all raw rows with phase features, to show the comparison in the backtest
table.

### 3.4 Pitfalls from the competitions

- A log1p target with squared error (Rossmann and Favorita style, matched to their log-based metrics) predicts roughly
  the geometric mean. In this data the mean of log(actual / expected) is -0.04 to -0.09 depending on order size [D],
  so that is a 4% to 8% under-forecast. Use the ratio target with L2 or gamma, or apply a smearing correction.
- `regression_l1` and quantile 0.5 target the median: 3% low here (section 5).
- Direct multi-horizon leakage: inside a fold with origin O, a training row (t, h) is legal only if t + h <= O.
- The per-series level, seasonal indices, cycle and phase assignment, lost-account flags and target encodings must be
  recomputed with data up to each fold's origin.
- Early stopping on the fold you report inflates the score; M5's 1st and 4th place did not use early stopping.
- For h = 19 the newest usable training origin is 19 months before the end of data. Long-horizon rows are always
  older than short-horizon rows; time-decay weights partly compensate.

---

## 4. Question 2: intermittent-demand methods, and deterministic ordering cycles

### 4.1 When each method wins

| Method | Idea | Wins when | Fails when | Source |
|---|---|---|---|---|
| Croston | Smooth demand sizes and inter-demand intervals separately; updates only when demand occurs | Stationary intermittent demand; identical to exponential smoothing when every period has demand | Positively biased; no reaction to obsolescence | [M5 Table 4](https://statmodeling.stat.columbia.edu/wp-content/uploads/2021/10/M5_accuracy_competition.pdf) [P], [TSB abstract](https://econpapers.repec.org/RePEc:eee:ejores:v:214:y:2011:i:3:p:606-615) [S] |
| SBA | Croston with a bias correction | Intermittent, erratic and lumpy classes (cut-offs: average demand interval 1.32, squared CV 0.49) | Same obsolescence blind spot | [arXiv 2304.03092](https://arxiv.org/pdf/2304.03092) [S] |
| TSB | Updates a demand probability every period | Demand dying out: lost accounts, pre-EOL decline | Less stable than SBA on stationary series | [Teunter, Syntetos, Babai 2011](https://dx.doi.org/10.1016/j.ejor.2011.05.018) [S] |
| ADIDA | Aggregate to lower frequency, forecast, disaggregate | Aggregation bucket near lead time plus review period | Wrong bucket; seasonal structure inside the bucket | [Nikolopoulos et al. 2011](https://link.springer.com/article/10.1057/jors.2010.32), [ADIDA review](https://orca.cardiff.ac.uk/62791/1/A%20systemic%20view%20of%20the%20ADIDA%20framework.pdf) [S] |
| IMAPA | Average forecasts over several aggregation levels | No single right bucket; robust default | Same flat-forecast limitation | [statsforecast tutorial](https://nixtlaverse.nixtla.io/statsforecast/docs/tutorials/intermittentdata.html) [P] |
| Temporal hierarchies for intermittent data | Bring trend and seasonality visible at aggregate levels down to the intermittent level | Series with seasonality hidden by zeros | Needs per-level forecasts and reconciliation | [Kourentzes and Athanasopoulos 2021](https://eprints.lancs.ac.uk/id/eprint/144210) [S] |
| iETS | y = occurrence x size, ETS on sizes, several occurrence models | Need a proper predictive distribution; trends in size or probability | Per-series estimation cost | [ADAM book ch. 13](https://openforecast.org/adam/ADAMIntermittent.html) [P] |
| Renewal-process models | Generalise Croston to interval distributions with "aging, clustering and quasi-periodicity" | Quasi-periodic arrivals | Research code only | [arXiv 2010.01550](https://arxiv.org/abs/2010.01550) [P, abstract] |
| Hurdle (classifier x regressor) | P(order) from a global classifier, size from a regressor | Occurrence is stochastic and driven by features. On 516 automotive OEM daily series, global classifiers were best for occurrence and simple exponential smoothing for size | Median of the mixture is 0 when P(order) < 0.5 | [arXiv 2103.13812](https://arxiv.org/abs/2103.13812) [P, abstract] |
| Tweedie or negative-binomial global models | One model, zero-inflated likelihood | Stochastic zeros at scale (M5). Tweedie head best at the highest quantiles on 40,000+ intermittent series | Unnecessary when zeros are deterministic | [arXiv 2601.14031](https://arxiv.org/abs/2601.14031) [P, abstract] |

Every Croston-type method outputs a flat demand rate per period. With a deterministic cycle that is structurally
wrong at row level: it puts volume into off-phase months and removes it from order months. That is the 0.506 versus
0.290 backtest gap already measured [D]. statsforecast 2.0.1 in `.venv` provides `CrostonClassic`,
`CrostonOptimized`, `CrostonSBA`, `TSB`, `ADIDA`, `IMAPA`, `AutoETS`, `AutoTheta`, `AutoARIMA`, `MSTL`, so the
Advanced-tier "intermittent-demand methods" requirement costs a few lines.

### 4.2 Deterministic ordering cycles

I found no literature specific to calendar-anchored B2B ordering cycles; the nearest are renewal processes and the
ADIDA observation that aggregating to the review period removes intermittence. The practical consequence of those
two is the design in rank 1:

1. Aggregation at the known cycle length is ADIDA with the bucket given by the data rather than a heuristic. A
   12-month trailing total is neutral to every cycle length in this data.
2. Occurrence is a lookup, not a model: on-phase months get an order, off-phase months get exactly 0.
3. Order size = sum of latent monthly demand over the months the order covers (accumulation rule [D]).
4. A classifier is needed only for the exceptions: the 27 series that changed cycle and lost-account detection [D].
   Give it features such as months since the last order relative to cycle length and the run of zero on-phase months.

When the phase is uncertain between two months, put the whole order in the more likely month. With probability p for
month A, the expected absolute error is 2(1 - p)S for "all in A" against 4p(1 - p)S for splitting pS and (1 - p)S,
so splitting is worse whenever p > 0.5, and both have zero bias [C].

---

## 5. Question 3: the point forecast under WAPE and bias

What the literature says:

- Different error measures are minimised by different functionals of the predictive distribution: mean for squared
  error, median for absolute error, so one point forecast cannot be best for several measures
  ([Kolassa 2020](https://www.research.lancs.ac.uk/portal/en/publications/why-the-best-point-forecast-depends-on-the-error-or-accuracy-measure(1cf3a975-80d0-42e9-bd50-b195cee086f8)/export.html)) [S].
- For intermittent demand the median is often 0, so a flat-zero forecast can minimise MAE while being useless and
  -100% biased ([Hewamalage et al.](https://arxiv.org/abs/2203.10716) [P]; [mean-based error measures](https://arxiv.org/abs/1310.5663) [P, abstract]).
- Only the mean is additive across a hierarchy: "the only error measure whose minimizing point forecasts are coherent
  is the MSE", while MAE-optimal forecasts are usually not coherent
  ([Kolassa, commentary](https://eprints.lancs.ac.uk/id/eprint/214012/8/Commentary_on_evaluating_hierarchical_forecasts.pdf)) [S].
- Bias matters downstream more than line-level accuracy: on a spare-parts panel, accuracy rank and order-service rank
  were negatively correlated (r = -0.555) and service tracked the direction of cumulative bias
  ([arXiv 2609.13840](https://arxiv.org/abs/2609.13840)) [P, abstract].
- VN1 scored MAE% + abs(Bias%); the entry with the best MAE of the top five finished 5th because of +3.09% bias [P].

What it means for this data. The zero-median trap does not apply once the phase is deterministic: P(order) is about 0
or 1. The live question is the skew of order sizes. The sibling noise analysis
(`research/scratch/demand-dgp/logs/07.log`, provisional) finds actual / expected with mean 1.00 and median 0.97, a
gamma-like shape, and variance about 1.175 mu + 0.0729 mu^2 [D]. I simulated a close match (Poisson counts around a
gamma-distributed mean with squared CV 0.0729, so variance mu + 0.0729 mu^2; 2 million draws per case) [C]:

| Expected order | Forecast = median | Forecast = mean |
|---|---|---|
| 30 units | WAPE 0.2574, bias -3.3% | WAPE 0.2585, bias 0.0% |
| 60 units | WAPE 0.2365, bias -3.3% | WAPE 0.2374, bias 0.0% |
| 150 units | WAPE 0.2227, bias -2.7% | WAPE 0.2236, bias 0.0% |

Forecasting the median buys about 0.1 point of WAPE and costs about 3 points of bias. The same simulation gives the
noise floor for row-level WAPE: about 0.35 at 8 units, 0.30 at 15, 0.26 at 30, 0.24 at 60, 0.22 at 150. A perfect
model of the mean cannot go below that, so judge the model by bias and by aggregate-level accuracy, where independent
noise cancels (residual correlation between series is about 0 [D]; 50 equal independent series give a floor near
0.03).

Recommendation:

1. Point forecast = conditional mean of the order on on-phase months, 0 on structural-zero rows (off-phase, after
   EOL, lost account).
2. No global shading factor. Allow a multiplier per family x horizon bucket only if its sign is the same in at least
   three backtest folds; M5's 2nd and 5th place gained from such multipliers, but with four folds they are easy to
   overfit.
3. Round to the nearest integer. For series whose mean order is under about 3 units, compare with cumulative rounding
   (round the running total and difference it), which preserves each series' 19-month total; keep whichever has the
   lower WAPE + abs(bias) in backtest.
4. Report WAPE, bias and their VN1-style sum for every model, by family, region and horizon.
5. State the convention in the methodology: `Units_Sold_Forecast` is the expected value; P50 is the median and sits
   about 3% lower; the expected value is the one that adds up across the hierarchy and has zero bias.

---

## 6. Question 4: probabilistic forecasts

Evidence:

- Conformalized quantile regression wraps any quantile model and gives finite-sample coverage under exchangeability,
  with interval width that adapts to heteroscedastic noise ([Romano et al.](https://arxiv.org/abs/1905.03222)) [P, abstract].
- A 2026 benchmark on more than 3,000 monthly sales series (12-month horizon, 90% target) found that multi-step split
  conformal (one residual quantile per horizon step), adaptive conformal inference and analytic ARIMA intervals met
  the target, while EnbPI, SPCI and the Nixtla conformal setting under-covered (all three were run with default
  hyper-parameters); multi-step split conformal had the best Winkler score on the larger corpus
  ([arXiv 2601.18509](https://arxiv.org/html/2601.18509v1)) [P].
- Conformal forecasting across many series treats the series as the exchangeable unit
  ([Stankeviciute et al., NeurIPS 2021](https://proceedings.neurips.cc/paper/2021/hash/312f1ba2a72318edaaa995a67835fad5-Abstract.html)) [S].
- Adaptive conformal inference corrects coverage online as outcomes arrive
  ([Gibbs and Candes](https://arxiv.org/abs/2106.00170)) [P, abstract]. It needs feedback during the horizon, so it
  suits production monitoring, not a one-shot 19-month forecast.
- mlforecast's `PredictionIntervals(n_windows, h)` calibrates on cross-validation windows per horizon and warns that
  intervals are often too narrow
  ([docs](https://nixtlaverse.nixtla.io/mlforecast/docs/how-to-guides/prediction_intervals.html)) [P].
- Separately fitted quantile models can cross; sorting the quantiles (monotone rearrangement) never increases
  estimation error ([Chernozhukov et al.](https://arxiv.org/abs/0704.3649)) [P, abstract].
- Metrics: quantile (pinball) score, Winkler score, CRPS as the average quantile score over all probabilities, and
  skill scores against a naive benchmark ([FPP3 5.9](https://otexts.com/fpp3/distaccuracy.html)) [P]. M5 used a
  weighted scaled pinball loss over nine quantiles.

Recommended method, ranked:

1. **Simulation from a two-part predictive distribution** (primary).
   - Order noise: negative binomial around the mean with the fitted variance function (about a mu + b mu^2 with
     a = 1.175, b = 0.0729 [D]; re-estimate on the final clean panel).
   - Level uncertainty: multiplicative error of the mean forecast, growing with horizon, estimated from backtest
     residuals of aggregates (series, SKU, family x region) per horizon bucket.
   - Draw 1,000 to 2,000 sample paths per series; P10/P50/P90 are integer quantiles of the samples.
   - Calibrate: per horizon bucket (1 to 3, 4 to 6, 7 to 12, 13 to 19) and segment (volume tercile x cycle type),
     rescale the lower and upper spread so that backtest coverage of each tail is 10%. This is split conformal with
     multiplicative scores, per horizon, pooled across series.
2. **Multiplicative split conformal alone**: P10 = F x q10(A/F), P90 = F x q90(A/F) with quantiles taken from backtest
   ratios in the same horizon bucket and segment. Simple and robust; use it as the fallback and as the check on
   method 1.
3. **LightGBM quantile regression** (`objective='quantile'`, `alpha` 0.1, 0.5, 0.9) on the ratio target, sorted, then
   conformalized. Challenger only: three extra models, crossing, and weak tails in small leaves.

Report in the dashboard: coverage of [P10, P90] against 80%, share below P10 and above P90 against 10% each, pinball
loss at the three quantiles divided by mean demand, Winkler score for the 80% interval, relative interval width, all
by horizon bucket and family, with skill against intervals built from seasonal-naive residuals.

Pitfalls:

- Pooled residuals look plentiful (thousands of series) but are clustered in four or five origins. A common shock
  such as a macro surprise appears only four or five times. Check coverage per fold, not only pooled, and say in the
  methodology that intervals are conditional on the supplied macro path.
- Censored months must be scored against unconstrained demand or excluded.
- Off-phase rows have P10 = P50 = P90 = 0; exclude them from coverage statistics or coverage is flattered.
- For the procurement view, the P90 of several months together is the P90 of the summed sample paths, never the sum
  of monthly P90s.

---

## 7. Question 5: hierarchical reconciliation

Evidence:

- Reconciled forecasts are S G yhat. Bottom-up and top-down are special cases; top-down cannot be unbiased;
  historical-proportion top-down is less accurate at low levels than bottom-up
  ([FPP3 11.3](https://otexts.com/fpp3/reconciliation.html)) [P].
- MinT uses the covariance of base-forecast errors. The sample covariance is poor when the number of series is large
  relative to history length, hence shrinkage; simpler diagonal choices are OLS, variance scaling (`wls_var`) and
  structural scaling [P]. MinT improved the bottom level in the FPP3 tourism example and worsened it in the prison
  example [P].
- The 2024 review ([Athanasopoulos et al.](https://robjhyndman.com/papers/hf_review.pdf)) [P, full text] reports the
  "volatile performance of MinT, especially for short time series, where estimation errors in W1 can dominate" and
  the surprisingly good performance of structural scaling; it links this to the forecast-combination puzzle.
- Non-negativity is not preserved by OLS or MinT; options are quadratic programming or the "set-negative-to-zero"
  heuristic followed by re-aggregation [P].
- Probabilistic: draw samples for the bottom series, impose dependence, aggregate; reconciling quantiles directly is
  valid only under perfect dependence: "Quantiles are only preserved under linear combinations when the data are
  perfectly dependent" [P]. For Gaussian base forecasts, MinT minimises the log score
  ([arXiv 2103.11128](https://arxiv.org/abs/2103.11128)) [P, abstract].
- Discrete data: reconciling counts with continuous methods gives non-integers and rounding breaks coherence;
  dedicated methods exist ([Zhang et al.](https://arxiv.org/abs/2305.18809), [Corani et al.](https://arxiv.org/abs/2207.09322)) [S].
  The review calls mixed discrete and continuous hierarchies an open problem [P].
- Alternatives: train the bottom model with a hierarchy-aware loss, up to 10% better RMSE on M5 and no
  post-processing ([arXiv 2310.12809](https://arxiv.org/abs/2310.12809)) [P, abstract]; align the bottom-up sum to
  an independent top-level forecast, the M5 2nd-place method ([arXiv 2103.08250](https://arxiv.org/abs/2103.08250)) [P].
- hierarchicalforecast offers BottomUp, TopDown, MiddleOut, MinTrace, ERM and sample-based probabilistic methods
  (Normality, Bootstrap, PERMBU, Conformal) ([docs](https://nixtlaverse.nixtla.io/hierarchicalforecast/index.html)) [P].
  It is not installed; none of what follows needs it.

What is practical when the scored level is the bottom:

1. **Bottom-up of the mean forecasts** is the default. Every hierarchy in the brief (SKU, family, total, region,
   channel, customer) is a sum of SKU x Region rows, so one bottom-level table is coherent for all of them at once,
   non-negative and integer. This satisfies the Expert item by construction; show the check in the dashboard.
2. **Alignment to upper-level forecasts** is the only reconciliation worth testing, because upper levels see trend
   and macro response much more clearly than a noisy series (CV 0.30 at the bottom, a few percent at family x
   region). Use weighted least squares with diagonal weights (base-forecast error variances, or structural scaling).
   Residual correlation across series is about 0 here [D], so a diagonal W is the right model and the full
   shrinkage estimator would add only estimation noise with roughly 3,700 nodes and under 90 months. In practice:
   produce independent forecasts for total, family, region and family x region; solve the WLS projection with sparse
   matrices; keep structural-zero rows fixed at 0; set any negative to 0 and re-aggregate.
3. Accept the alignment only if bottom-level WAPE + abs(bias) does not worsen and family x region WAPE improves in at
   least three folds.
4. Skip full MinT-shrink and ERM (too many parameters for the history) and top-down (biased), except top-down
   allocation for cold-start series.
5. **Coherent quantiles**: aggregate the sample paths from section 6 and take quantiles at each node. Give the level
   error a shared component within family x region so aggregate intervals are not understated, and keep order noise
   independent across series. Summing bottom P90s would overstate aggregate uncertainty many times over. Samples from
   a negative binomial are integers, so every node's quantiles are integers and no discrete reconciliation is needed.
6. Optional originality: the ordering cycle is a temporal hierarchy (month, cycle bucket, year). Forecasting the
   latent rate and summing it into orders already enforces that each order equals the latent demand of the months it
   covers; describe it as temporal coherence
   ([temporal hierarchies](https://eprints.lancs.ac.uk/id/eprint/84905)) [S].

---

## 8. Question 6: unconstraining censored demand

- A model trained on shipped units reproduces the shortage. On 50,000 stockout-annotated retail series, training on
  recovered demand moved forecast bias from -7.37% to between +0.57% and +2.58% and WAPE from 31.75% to 29.02%;
  recovery overshot on low-volume items ([FreshRetailNet-50K](https://arxiv.org/html/2505.16319v2)) [P].
- The VN2 winner set stockout weeks to missing before computing any lag, rolling statistic or target
  ([arXiv 2601.18919](https://arxiv.org/abs/2601.18919)) [P].
- Classical unconstraining (expectation-maximisation, projection detruncation, imputation) is surveyed by
  [Guo et al. 2012](https://onlinelibrary.wiley.com/doi/10.1155/2012/270910) and a Tobit Kalman filter for lost-sales
  demand by a [2023 IJF paper](https://www.sciencedirect.com/science/article/abs/pii/S0169207023000961); I could not
  open either, so they are pointers only [S].

This project is in a better position than any of those: `research/stockouts-unconstrained.md` reconstructs requested
units exactly for listed months and imputes the unlisted Electrical Assemblies shortage months at 5.3% WAPE [D].
Modelling rules that follow:

1. Train and evaluate on unconstrained demand. The brief asks for unconstrained demand in the forecast window.
2. Remove back-order spill from the month after a stockout (it is the previous month's demand) before computing
   levels and targets.
3. Keep a `was_censored` flag and an `imputed_share_12m` feature; give imputed months a lower sample weight (0.5 is a
   reasonable start) rather than dropping them.
4. In backtests whose test window covers 2021-03 to 2022-09, score against unconstrained actuals and report the
   Electrical Assemblies family separately.
5. Do not pass a stockout indicator as a feature for the target month: the forecast window has no supply limits.

---

## 9. Question 7: cold start and new products

- Hu et al. (Dell data) fit life-cycle curves to past products, cluster them, and forecast a new product from its
  cluster's curve; simple triangle and trapezoid shapes with data-driven clustering forecast best, with mean absolute
  error 2% to 3% below the company's forecasts
  ([M&SOM 2019](https://pubsonline.informs.org/doi/fpi/10.1287/msom.2017.0691), [Kellogg summary](https://insight.kellogg.northwestern.edu/article/how-to-predict-demand-for-your-new-product-2)) [S].
- Global models on static attributes are the standard machine-learning answer; identifier features do not transfer to
  unseen items (VN2 winner) [P]. A 2026 preprint on conditional generative life-cycle models confirms that borrowing
  across products is the active research line ([arXiv 2604.20370](https://arxiv.org/abs/2604.20370)) [S].

Recipe using what the data offers [D]: 625 series launched inside the window, a ramp of 1 - exp(-(k+1)/tau) with tau
about 4.5 months, and successors that behave as independent SKUs rather than inheriting the predecessor's customers.

1. Mature level prior for a new series: LightGBM (or a shrunken group median) on static features only: family, size
   class, powertrain, region, channel, log price, the predecessor's level in the same region when `Replaces_SKU`
   exists, and the family x region mean level. Train on the mature level of historical launches.
2. Multiply by the ramp curve by months since launch, then by the same seasonal, macro and event multipliers as
   mature series.
3. Ordering cycle unknown: forecast monthly until two or three orders reveal the phase; for planned launches use the
   most common cycle of the customer or channel and state the assumption.
4. Validate by leave-launch-out: hide the first 19 months of historical launches, predict from attributes, and report
   WAPE and bias separately for the cold-start segment.
5. Intervals: empirical quantiles of actual / prior across historical launches. They will be wide, and that is the
   honest answer for the dashboard's lifecycle view.
6. For series with 3 to 12 months of history, blend the prior with the observed level, with the weight on the
   observed level rising with the number of orders seen.

---

## 10. Question 8: time-series foundation models

### 10.1 Benchmark standing

fev-bench (100 tasks, 46 with covariates, only 7 monthly; single A10G GPU), from the paper
([arXiv 2509.26468 v4](https://arxiv.org/html/2509.26468v4)) [P]:

| Model | Win rate (quantile loss) | Skill | Median runtime per 100 series | Covariate support (per the model's own page) |
|---|---|---|---|---|
| Chronos-2 | 91.4% | 47.3% | 0.8 s | Past, known-future, categorical |
| TiRex | 83.3% | 42.6% | 0.2 s | None in v1 |
| TimesFM-2.5 | 79.6% | 42.2% | 1.9 s | Via XReg |
| Toto-1.0 | 72.4% | 40.8% | 22.3 s | Not checked |
| TabPFN-TS | 69.7% | 41.5% | 109.4 s | Known-future only |
| Moirai-2.0 | 67.4% | 39.3% | 0.4 s | Not checked |
| Chronos-Bolt | 67.0% | 38.9% | 0.3 s | Not checked |
| Statistical ensemble | 45.5% | 20.7% | 146.9 s | None |
| Seasonal naive | 19.6% | 0% | 0.5 s | None |

On the 42 tasks with dynamic covariates, Chronos-2's skill rises from 40.9% without them to 47.0% with them, and the
paper notes that most pretrained models ignore covariates [P].

Late-2026 standing, from one secondary article dated 2026-10-23 that warns most numbers are vendor-published
([comparison](https://pasqualepillitteri.it/en/news/26634/time-series-ai-compared-timesfm-chronos-timestral)) [S];
the t0 figures agree with the t0 abstract ([arXiv 2609.24559](https://arxiv.org/abs/2609.24559)) [P, abstract]:

| Model | Released | Parameters | GIFT-Eval MASE / CRPS | fev-bench skill | Weights licence |
|---|---|---|---|---|---|
| Timestral-209M (Mistral) | 2026-10-15 | 5M to 209M | 0.658 / 0.446 | 50.39 | Modified MIT, revenue cap |
| t0-gamma | 2026-10-13 | about 256M | 0.661 / 0.452 | 49.42 | Apache 2.0 |
| TimesFM-3 (Google) | 2026-08-31 | 330M | 0.667 / 0.456 | 48.99 | Non-commercial, non-production |
| Chronos-2 (Amazon) | 2025-10 | 120M (28M small) | 0.698 / 0.485 | 47.28 | Apache 2.0 |
| TiRex-2 | 2026-07-01 | 82.5M | 0.697 / n/a | 45.5 | Apache 2.0 open release |

The gaps are one to three points and the article notes results reverse between datasets. I could not read the live
GIFT-Eval leaderboard (it renders client-side).

### 10.2 Monthly data and long horizons

- GIFT-Eval paper: foundation models lead from daily to yearly frequency, but AutoARIMA had the best monthly MAPE and
  performance of recursive models declines at long horizons ([arXiv 2410.10393](https://arxiv.org/html/2410.10393)) [P].
- A 2026 study of TimesFM-3 against classical models ([arXiv 2610.00589](https://arxiv.org/html/2610.00589v1)) [P]:
  on M4 monthly rolling origins TimesFM-3 (MASE 0.914) did not differ significantly from AutoARIMA (0.923) or a
  classical combination (0.907); with four or more seasonal cycles AutoARIMA's error was 21% to 24% lower on a
  seasonal ARIMA process; beyond 12 steps the foundation model's advantage weakened and on a plateauing process all
  three foundation models forecast a decline; on intermittent demand it showed no advantage over simple history-based
  benchmarks.
- A decision-aware benchmark found Chronos-2's instance normalisation creates bias on intermittent series that can be
  corrected without retraining ([arXiv 2609.13840](https://arxiv.org/abs/2609.13840)) [P, abstract].

Expectation for this task (94 monthly points, 19 steps): about as good as a well-built statistical ensemble on smooth
aggregates, not better than a structural model that knows the ordering phase, the EOL dates and the EV elasticity.

### 10.3 Feasibility on this machine

Checked locally, read-only: conda `base` (Python 3.13) has torch 2.9.1+cu128 with CUDA available, the GTX 1650 Ti
reports compute capability 7.5 and the build's architecture list includes `sm_75`; transformers 5.6.2,
accelerate 1.12.0, peft 0.19.1, pandas and pyarrow are present; `einops` and `chronos-forecasting` are not. The
project `.venv` (Python 3.12) has no torch. Free disk is 9.5 GB.

| Model | Weights on disk | Extra install | Verdict |
|---|---|---|---|
| Chronos-2 (`amazon/chronos-2`) | 478 MB | `chronos-forecasting` + `einops` into conda base; all other requirements (torch >=2.2,<3; transformers >=4.41,<6; accelerate >=1.1,<2) already met | **Use.** CPU and GPU inference supported; context up to 8,192, horizon up to 1,024 in one pass; 21 quantiles; past and known-future covariates |
| Chronos-2 small (`autogluon/chronos-2-small`) | 112 MB | Same | Use as the CPU fallback |
| TimesFM-2.5 (200M) | 925 MB | `timesfm[torch]` | Optional second model; Apache 2.0; covariates via XReg |
| TimesFM-3 | larger (330M) | Same | Skip: weights are non-commercial, non-production only |
| TiRex v1 (35M) | small | `tirex-ts` | Skip on GPU: its CUDA kernels need compute capability 8.0 or later, this card is 7.5; no covariates in v1 |
| TabPFN-TS | n/a | `tabpfn-time-series` | Skip: default mode sends data to a cloud service, local mode requires accepting a licence, and it was the slowest model on fev-bench (109 s per 100 series on an A10G) |
| Timestral, t0, TiRex-2 | 20 MB to 1 GB | New packages | Skip unless time remains: three to six weeks old and not independently verified |

Sources: [Chronos-2 card](https://huggingface.co/amazon/chronos-2),
[weights](https://huggingface.co/amazon/chronos-2/tree/main),
[small](https://huggingface.co/autogluon/chronos-2-small/tree/main),
[dependencies](https://raw.githubusercontent.com/amazon-science/chronos-forecasting/main/pyproject.toml),
[repo](https://github.com/amazon-science/chronos-forecasting), [paper](https://arxiv.org/html/2510.15821v1),
[TimesFM repo](https://github.com/google-research/timesfm),
[TimesFM-2.5 weights](https://huggingface.co/google/timesfm-2.5-200m-pytorch/tree/main),
[TiRex](https://github.com/NX-AI/tirex), [TabPFN-TS](https://github.com/PriorLabs/tabpfn-time-series) [all P].

Chronos-2 throughput is published only for an A10G (about 300 series per second at context 2,048, horizon 64) [P].
With 94-point contexts and about 3,700 series the job is small, but time it here before relying on it.

### 10.4 How to use it

1. Aggregated latent series (total, 7 families, 6 regions, 42 family x region, about 600 SKUs), horizon 19, quantiles
   0.1 / 0.5 / 0.9, with the macro indicators and calendar as known-future covariates. This is where it is most
   likely to help, as an input to the alignment step in section 7.
2. Bottom-level latent series as a benchmark row in the backtest table.
3. One experiment for the originality story: raw order series with the on-phase indicator and months-covered as
   known-future covariates, to see whether in-context learning recovers the ordering cycle.
4. Run it in the conda env as a separate script that reads and writes parquet. Commit the output parquet so the
   one-command pipeline and the dashboard work for reviewers without torch or network access. Pin the model revision.
5. Gate: it enters an ensemble only at levels where it improves WAPE + abs(bias) in at least three of four folds.

Pitfalls: its point output is the median, so compare its bias carefully; it knows nothing about EOL, launches, lost
accounts or unconstrained demand, so apply structural masks afterwards and feed it unconstrained history; keep the
default float32; do not fine-tune (LoRA is supported, but four or five origins cannot validate it).

---

## 11. Question 9: ensembling and backtest design

### 11.1 Ensembling

- M5: the 1st, 2nd and 3rd places were equal-weight averages; of the reported combinations in the top 50 only one
  used unequal weights [P].
- VN1: most top-20 solutions combined models or several runs of one model [P].
- Rossmann: averaging XGBoost variants trained on different subsets and with direct and iterated prediction gave
  about 5% over the best single model [P].
- FFORMA placed 2nd in M4 by learning combination weights from 42 series features with XGBoost
  ([IJF 2020](https://econpapers.repec.org/RePEc:eee:intfor:v:36:y:2020:i:1:p:86-92)) [S]; a feature-based variant
  for intermittent demand improved point and quantile accuracy on two datasets
  ([arXiv 2204.08283](https://arxiv.org/abs/2204.08283)) [P, abstract]. Both learn from tens of thousands of series
  and many origins.
- Estimated weights are fragile; the reconciliation review ties this to the forecast-combination puzzle, where
  "performance of forecast combinations is hindered by imprecise estimation of covariances" [P]. See also the
  [50-year review of forecast combinations](https://arxiv.org/abs/2205.04216) [P, abstract].

Recipe:

1. Members: (a) transparent multiplicative model; (b) LightGBM ratio L2; (c) LightGBM gamma or horizon-bucket
   variant; (d) the upper-level-aligned version of the average; (e) Chronos-2 where it passes its gate.
2. Equal weights on the mean forecasts. Drop a member only if removing it improves WAPE + abs(bias) in at least three
   folds.
3. FFORMA-style selection only in a coarse form: allow weights to differ across at most three or four segments
   (cycle type, volume tercile, lifecycle stage), shrunk halfway to equal weights, and only if the ranking of members
   in a segment is the same in every fold.
4. Combine distributions by pooling sample paths in proportion to the weights, not by averaging quantiles.

### 11.2 Rolling-origin design with 94 months and a 19-month horizon

Principles: rolling origin with several test periods is more reliable than one hold-out
([Tashman 2000](https://econpapers.repec.org/RePEc:eee:intfor:v:16:y:2000:i:4:p:437-450)) [S]; report error by horizon
([FPP3 5.10](https://otexts.com/fpp3/tscv.html)) [P]; expanding windows suit short series, and normalising,
decomposing or extracting features over the full series before splitting is leakage
([Hewamalage et al.](https://arxiv.org/html/2203.10716v2)) [P]; choose by mean and standard deviation across windows
(M5 winner) [P]; freeze before the final evaluation (VN1) [P].

| Fold | Origin | Test window | Notes |
|---|---|---|---|
| A | 2025-03 | 2025-04 to 2026-10 | Latest possible 19-month window. All simple methods were +6% biased here [D]. Keep as the final check, not for tuning. |
| B | 2024-10 | 2024-11 to 2026-05 | Same calendar alignment as the real task (origin October, target November to May of the second year). |
| C | 2023-10 | 2023-11 to 2025-05 | Same alignment. |
| D | 2022-10 | 2022-11 to 2024-05 | Same alignment. 46 months of training; Middle East and Africa has 10 months; the chip shortage ended 2022-09. |
| E (stress) | 2021-10 | 2021-11 to 2023-05 | Optional. Test window contains the shortage; score against unconstrained demand; report separately. |

Rules:

1. Expanding training window; everything that learns from data (cleaning thresholds that depend on level, cycle and
   phase detection, lost-account flags, seasonal indices, elasticities, encodings, the level L) is refit per fold.
2. Lifecycle information allowed at an origin: launch and EOL dates as the master would have shown them. Emulate
   cold starts: series launched after the origin get the cold-start model.
3. Macro inputs for target months: use actual values, which mirrors the real task where the future path is supplied.
   Before trusting that, compare the supplied 2026-11 to 2028-05 path with history (month-to-month volatility). If it
   is smoother, add a sensitivity run with smoothed macro inputs in the backtest.
4. Metrics per fold and pooled: WAPE, bias, WAPE + abs(bias), by family, region, channel, horizon month and horizon
   bucket, at SKU x Region, SKU, family x region and total level; interval metrics from section 6; all against
   seasonal naive, moving average and the Croston family.
5. The test windows of folds A to D overlap, so pooled results are not four independent samples. Show per-fold
   numbers and use the spread as the stability measure.
6. Tune on folds B to D with a small grid; confirm once on fold A; then refit on all data to 2026-10 with the frozen
   configuration.
7. Add a line to the accuracy view: achieved row-level WAPE against the noise floor from section 5.

---

## 12. Pitfall checklist

| Pitfall | Consequence | Guard |
|---|---|---|
| Median-type objective (L1, quantile 0.5, log target without correction) | 3% to 10% under-forecast | Mean-type objective on the ratio target |
| Flat-rate intermittent method used for row-level forecasts | Volume in off-phase months; WAPE about 0.5 | Phase mask plus accumulation |
| Recursive forecasting on raw orders | Noise fed back for 19 steps | Direct multi-horizon |
| Raw macro levels in a tree model | Flat response once the index leaves its historical range (EV adoption) | Changes since origin, plus the parametric member |
| Target month after the fold origin in training rows | Leaked backtest | Enforce t + h <= origin |
| Level, indices, phase or flags computed on the full history | Leaked backtest | Refit per fold |
| Series or SKU id as a categorical feature | Memorised levels; nothing for cold starts | Static attributes and encodings |
| Early stopping on the reported fold | Optimistic score | Fixed tree count |
| Learned ensemble or bias multipliers from four folds | Overfit | Equal weights; sign-consistency rule |
| Summing quantiles up the hierarchy | Aggregate intervals far too wide | Aggregate sample paths |
| Coverage computed with structural-zero rows | Flattered coverage | Exclude them |
| Full MinT covariance with about 3,700 nodes and under 90 months | Unstable reconciliation | Diagonal weights or bottom-up |
| Reconciliation moving off-phase or post-EOL rows away from 0 | Structural errors | Keep them fixed |
| Training on shipped units | Negative bias after shortages | Unconstrained demand, spill removed |
| Foundation model in the critical path | Reviewer cannot run the pipeline | Cached parquet, optional step |
| Cloud inference client (TabPFN default) | Data leaves the machine | Do not use |

---

## 13. What I could not verify

- The full M5 Uncertainty results paper and Vandeput's Medium article on VN1 returned HTTP 403. The M5 Uncertainty
  material here comes from the special-issue editorial; the VN1 material from the organiser's GitHub repository and
  web page. The "ARIMA at 30% weight" detail is from a search summary only.
- The live GIFT-Eval and fev-bench leaderboards could not be read. The late-2026 standings rest on one secondary
  article and the t0 abstract.
- Several papers were read at abstract level only (marked "abstract"). Claims about TSB, ADIDA, FFORMA, Tashman,
  Kolassa 2020 and Hu et al. come from search summaries of pages I could not open in full.
- No literature was found on calendar-anchored B2B ordering cycles. The treatment in section 4.2 is reasoning from
  ADIDA, renewal processes and this project's own data findings.
- LightGBM numeric settings in section 3.3 are starting values from general practice, not from a cited source.
- Section 5's simulation depends on a variance fit in another lens's working log, which that lens rates as
  provisional. Re-run it once the final clean panel exists.
- Chronos-2 speed on this CPU and GPU was not measured, and nothing was installed or downloaded.

---

## 14. Sources

| Topic | Source | URL | Read |
|---|---|---|---|
| M5 accuracy | Makridakis, Spiliotis, Assimakopoulos, IJF 2022 | https://statmodeling.stat.columbia.edu/wp-content/uploads/2021/10/M5_accuracy_competition.pdf | Full text |
| M5 special issue | Editorial | https://pmc.ncbi.nlm.nih.gov/articles/PMC9232271 | Page |
| M5 uncertainty | Makridakis et al., IJF 2022 | https://ideas.repec.org/a/eee/intfor/v38y2022i4p1365-1385.html | Record only |
| M5 2nd place | Anderer and Li | https://arxiv.org/abs/2103.08250 | HTML |
| M5 objectives critique | Ziel | https://arxiv.org/abs/2107.06675 | Abstract |
| Kaggle review | Bojer and Meldgaard | https://arxiv.org/abs/2009.07701 | Full text |
| VN1 data, scores, lessons | SupChains | https://github.com/SupChains/VN1 | Page |
| VN1 lessons | SupChains | https://supchains.com/vn1-forecasting-competition/ | Page |
| VN1 lessons | Vandeput, Medium | https://nicolas-vandeput.medium.com/vn1-forecasting-competition-what-i-learned-from-the-best-forecasters-ba8f314ec21f | Blocked |
| VN1 TimeGPT | Nixtla | https://nixtla.github.io/nixtlar/articles/vn1-forecasting-competition.html | Page |
| VN1 Moirai claim | Blog | https://dev.to/orange111/achieving-1st-place-in-the-vn1-forecasting-competition-with-fine-tuned-moirai-model-2cmb | Page |
| VN2 winner | Szablowski | https://arxiv.org/abs/2601.18919 | HTML |
| Trees in forecasting | Januschowski et al. | https://ideas.repec.org/a/eee/intfor/v38y2022i4p1473-1481.html | Summary |
| Tree extrapolation | Hyper-Trees | https://arxiv.org/html/2405.07836v5 | Summary |
| Multi-step strategies | Ben Taieb et al. | https://arxiv.org/abs/1108.3259 | Summary |
| Direct models | mlforecast | https://nixtlaverse.nixtla.io/mlforecast/docs/how-to-guides/one_model_per_horizon.html | Summary |
| LightGBM parameters | Docs | https://lightgbm.readthedocs.io/en/latest/Parameters.html | Page |
| Intermittent models | statsforecast | https://nixtlaverse.nixtla.io/statsforecast/docs/tutorials/intermittentdata.html | Page |
| iETS | Svetunkov, ADAM | https://openforecast.org/adam/ADAMIntermittent.html | Page |
| Classification cut-offs | Wang et al. | https://arxiv.org/pdf/2304.03092 | Summary |
| TSB | Teunter, Syntetos, Babai | https://dx.doi.org/10.1016/j.ejor.2011.05.018 | Summary |
| ADIDA | Nikolopoulos et al. | https://link.springer.com/article/10.1057/jors.2010.32 | Summary |
| ADIDA review | Spithourakis et al. | https://orca.cardiff.ac.uk/62791/1/A%20systemic%20view%20of%20the%20ADIDA%20framework.pdf | Summary |
| Intermittent temporal hierarchies | Kourentzes and Athanasopoulos | https://eprints.lancs.ac.uk/id/eprint/144210 | Summary |
| Renewal processes | Turkmen et al. | https://arxiv.org/abs/2010.01550 | Abstract |
| Two-fold approach | Rozanec et al. | https://arxiv.org/abs/2103.13812 | Abstract |
| Local vs global intermittent | Damato et al. | https://arxiv.org/abs/2601.14031 | Abstract |
| Point forecast and measure | Kolassa 2020 | https://www.research.lancs.ac.uk/portal/en/publications/why-the-best-point-forecast-depends-on-the-error-or-accuracy-measure(1cf3a975-80d0-42e9-bd50-b195cee086f8)/export.html | Summary |
| Coherence and MAE | Kolassa commentary | https://eprints.lancs.ac.uk/id/eprint/214012/8/Commentary_on_evaluating_hierarchical_forecasts.pdf | Summary |
| Mean-based measures | Prestwich et al. | https://arxiv.org/abs/1310.5663 | Abstract |
| Evaluation practice | Hewamalage et al. | https://arxiv.org/html/2203.10716v2 | First half |
| Accuracy vs service | Chin et al. | https://arxiv.org/abs/2609.13840 | Abstract |
| CQR | Romano et al. | https://arxiv.org/abs/1905.03222 | Abstract |
| Adaptive conformal | Gibbs and Candes | https://arxiv.org/abs/2106.00170 | Abstract |
| Conformal benchmark | Sabashvili | https://arxiv.org/html/2601.18509v1 | HTML |
| Conformal multi-series | Stankeviciute et al. | https://proceedings.neurips.cc/paper/2021/hash/312f1ba2a72318edaaa995a67835fad5-Abstract.html | Summary |
| Conformal intervals | mlforecast | https://nixtlaverse.nixtla.io/mlforecast/docs/how-to-guides/prediction_intervals.html | Page |
| Quantile crossing | Chernozhukov et al. | https://arxiv.org/abs/0704.3649 | Abstract |
| Distribution metrics | FPP3 5.9 | https://otexts.com/fpp3/distaccuracy.html | Page |
| Reconciliation | FPP3 11.3 | https://otexts.com/fpp3/reconciliation.html | Page |
| Reconciliation review | Athanasopoulos et al. | https://robjhyndman.com/papers/hf_review.pdf | Full text |
| Reconciliation library | hierarchicalforecast | https://nixtlaverse.nixtla.io/hierarchicalforecast/index.html | Page |
| Gaussian probabilistic reconciliation | Wickramasuriya | https://arxiv.org/abs/2103.11128 | Abstract |
| Discrete reconciliation | Zhang et al. | https://arxiv.org/abs/2305.18809 | Summary |
| Count reconciliation | Corani et al. | https://arxiv.org/abs/2207.09322 | Summary |
| Hierarchy-aware loss | Sprangers et al. | https://arxiv.org/abs/2310.12809 | Abstract |
| Temporal hierarchies | Athanasopoulos et al. | https://eprints.lancs.ac.uk/id/eprint/84905 | Summary |
| Censored demand dataset | FreshRetailNet-50K | https://arxiv.org/html/2505.16319v2 | HTML |
| Unconstraining survey | Guo et al. | https://onlinelibrary.wiley.com/doi/10.1155/2012/270910 | Blocked |
| Tobit Kalman filter | IJF 2023 | https://www.sciencedirect.com/science/article/abs/pii/S0169207023000961 | Summary |
| Life-cycle curves | Hu et al. | https://pubsonline.informs.org/doi/fpi/10.1287/msom.2017.0691 | Summary |
| Life-cycle curves | Kellogg Insight | https://insight.kellogg.northwestern.edu/article/how-to-predict-demand-for-your-new-product-2 | Summary |
| Cold-start generative | Preprint | https://arxiv.org/abs/2604.20370 | Summary |
| fev-bench | Shchur et al. | https://arxiv.org/html/2509.26468v4 | HTML |
| GIFT-Eval | Aksu et al. | https://arxiv.org/html/2410.10393 | HTML |
| Chronos-2 | Ansari et al. | https://arxiv.org/html/2510.15821v1 | HTML |
| Chronos-2 card | Hugging Face | https://huggingface.co/amazon/chronos-2 | Page |
| Chronos-2 weights | Hugging Face | https://huggingface.co/amazon/chronos-2/tree/main | Page |
| Chronos-2 small | Hugging Face | https://huggingface.co/autogluon/chronos-2-small/tree/main | Page |
| Chronos package | GitHub | https://github.com/amazon-science/chronos-forecasting | Page |
| Chronos dependencies | pyproject | https://raw.githubusercontent.com/amazon-science/chronos-forecasting/main/pyproject.toml | File |
| TimesFM | GitHub | https://github.com/google-research/timesfm | Page |
| TimesFM-2.5 weights | Hugging Face | https://huggingface.co/google/timesfm-2.5-200m-pytorch/tree/main | Page |
| TiRex | GitHub | https://github.com/NX-AI/tirex | Page |
| TabPFN-TS | GitHub | https://github.com/PriorLabs/tabpfn-time-series | Page |
| 2026 model comparison | Pillitteri | https://pasqualepillitteri.it/en/news/26634/time-series-ai-compared-timesfm-chronos-timestral | Page |
| t0 | Meyer et al. | https://arxiv.org/abs/2609.24559 | Abstract |
| TimesFM-3 vs classical | Preprint | https://arxiv.org/html/2610.00589v1 | First 60% |
| FFORMA | Montero-Manso et al. | https://econpapers.repec.org/RePEc:eee:intfor:v:36:y:2020:i:1:p:86-92 | Summary |
| Feature-based intermittent combinations | Li et al. | https://arxiv.org/abs/2204.08283 | Abstract |
| Forecast combinations review | Wang et al. | https://arxiv.org/abs/2205.04216 | Abstract |
| Out-of-sample tests | Tashman 2000 | https://econpapers.repec.org/RePEc:eee:intfor:v:16:y:2000:i:4:p:437-450 | Summary |
| Time-series cross-validation | FPP3 5.10 | https://otexts.com/fpp3/tscv.html | Page |

Local evidence used: `docs/problem_statement.md`, `docs/evaluation_criteria.md`, `research/panel-missing-zeros.md`,
`research/stockouts-unconstrained.md`, `research/lifecycle-master.md`, `research/scratch/demand-dgp/logs/07.log` and
`09c.log`; simulation script `calc/mae_bias.py` (working files, not included in the repository).
