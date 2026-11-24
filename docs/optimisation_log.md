# Optimisation round: lab notebook

Running notebook of the optimisation round on the frozen rolling-origin backtest (worktree `model-opt`, base commit
9255a0f). Appended after every experiment so the work can be resumed. Numbers are series x month WAPE / bias against
unconstrained demand, "score" = WAPE + |bias|. Scripts named `lab/x.py` are in `research/optimisation_lab/`, `lab2/x.py`
in `research/optimisation_lab/lab2/`; their prediction caches and snapshots are working files, not included in the
repository.

## 0. Protocol (declared before any experiment)

- **Decision origins** (unchanged): 2022-10 (45), 2023-10 (57), 2024-10 (69), 2025-03 (74). Stress origin 2021-10 (33)
  reported, never used to decide.
- **Confirmation origins** (declared now, looked at only when confirming a candidate that already passed on the decision
  origins): **2023-03 (50), 2024-03 (62), 2025-01 (72)**. Caveat: 2025-01 shares 17 of its 19 target months with
  2025-03, so it is a weak confirmation; 2023-03 and 2024-03 sit five months from any decision origin and are the
  informative ones.
  *Deviation, recorded at release (25 Nov 2026).* The rule "looked at only when confirming a candidate that already
  passed" was not kept throughout. The confirmation origins were also scored for the converged fit alone (E4), which
  had failed the decision rule, and for its driver-switch margins (2024-03); they appear in the E4 slices and in the
  diagnoses of step 2, E6 and step 5; and a prototype of the adopted estimator had been scored on them before it was
  declared (section 3). The adopted estimator (E5a) was designed after those results were seen. The
  confirmation origins are therefore a consistency check, not an untouched hold-out.
- **Keep rule.** A change is kept only if (a) it lowers the series-level score in at least 3 of the 4 decision origins,
  (b) the mean gain over the decision origins exceeds 0.0005 (the noise threshold already used in `docs/modelling.md`),
  (c) it does not raise the mean score over the confirmation origins (and does not hurt 2 of 3 of them), and (d)
  family x month WAPE and total bias do not degrade materially. Stress origin watched, never decisive.
- **No leakage.** Every change uses only data up to the origin; `tests/test_model_structural.py::test_no_leakage_after_the_origin`
  must keep passing.
- **Baseline (shipping structural model, from `outputs/backtest/summary.json`)**:

| Origin | WAPE | bias | score | oracle WAPE |
|---|---|---|---|---|
| 2022-10 | 0.28821 | -1.02 % | 0.29843 | 0.25190 |
| 2023-10 | 0.26141 | -1.20 % | 0.27342 | 0.23463 |
| 2024-10 | 0.25165 | +0.52 % | 0.25682 | 0.22956 |
| 2025-03 | 0.25175 | +1.10 % | 0.26278 | 0.23047 |
| mean | 0.26326 | -0.15 % | 0.27286 | 0.23664 |
| stress 2021-10 | 0.36176 | +3.26 % | 0.39436 | 0.27644 |

## 1. Error decomposition (decision origins; scripts `lab/decomp.py`, `slices.py`, `series_reg*.py`)

Method. `A` = shipping structural model. `oracle` = A rescaled per series by sum actual / sum forecast on its own
horizon (the existing noise floor). Oracle swaps: a hindsight fit as of 2026-10 (all data) provides each factor
matrix (season, holidays, SKU macro path, EV, events); one component of A is replaced by its hindsight value and the
as-of level is re-estimated on the swapped factors (same 24-month level cells), so the swap isolates factor error
from level error. `swap_all` replaces every factor; `oracle_all` = swap_all with the in-hindsight level.

| variant (mean of 4 decision origins) | WAPE | bias | score | fam x month WAPE |
|---|---|---|---|---|
| A (shipping) | 0.26326 | -0.15 % | 0.27286 | 0.0345 |
| swap season | 0.26302 | -0.10 % | 0.27241 | 0.0338 |
| swap holidays | 0.26324 | -0.20 % | 0.27337 | 0.0345 |
| swap SKU macro path | 0.25827 | +0.05 % | 0.26296 | 0.0267 |
| swap EV factor | 0.26253 | +0.10 % | 0.26920 | 0.0347 |
| swap events (Helios step known) | 0.26315 | +0.01 % | 0.27433 | 0.0355 |
| swap all factors | 0.25700 | +0.47 % | 0.26286 | 0.0266 |
| oracle (as-of factors, hindsight level) | 0.23664 | -0.14 % | 0.23802 | 0.0295 |
| oracle_all (hindsight factors and level) | 0.23344 | -0.14 % | 0.23482 | 0.0224 |
| level window 36 / 48 / all, as-of factors | 0.26349 / 0.26425 / 0.26608 | | 0.27362 / 0.27414 / 0.27612 | |
| level window 36 / 48 / all, hindsight factors | 0.25709 / 0.25780 / 0.25966 | | 0.26231 / 0.26235 / 0.26413 | |

Reading.
- Of the 2.66-point WAPE gap (3.48 score points) to the oracle, **factor paths carry 0.63 WAPE points (1.00 score
  point), almost all of it the SKU macro path** (0.50 WAPE, 0.99 score, and it halves the fold-level bias: mean |bias|
  0.96 % -> 0.47 %). EV adds 0.07 WAPE / 0.37 score (bias of the 2022-10 / 2023-10 folds), seasonality 0.02, holidays
  0, events 0 (knowing the Helios step raises the bias of the recent folds).
- **The series level carries the rest (about 2.0-2.4 WAPE points)**. With true factors the level window optimum is
  flat over 24-48 months, so longer windows do not fix it. Rough split: the oracle's own in-sample fit of the
  horizon noise about 0.6 points (19 noisy orders per series), 24-month estimation noise about 0.5 points, the rest
  is series-level drift between the window and the horizon (log sd of the series horizon ratio 0.154 with as-of
  factors, 0.144 with hindsight factors) that no as-of signal predicts well: regressions of the log horizon ratio
  on log(L12/L24), log(L36/L24), log(L_all/L24), log(level/prior) and the SKU-mates' momentum have R^2 0.005-0.07,
  with coefficients that shrink towards 0 at the most recent origin (2025-03: R^2 0.006).
- Not forecastable by construction: one-off orders 0.7-0.9 points of WAPE per fold, lost accounts appearing inside
  the horizon 0.3-0.5 points (2024-10, 2025-03), cycle changes inside the horizon 0.3-1.0 points (2022-10 only).
- Slices (mean excess WAPE over the oracle; total 0.0266): Q-cycle series 0.052 (8 % of volume), B 0.033, M 0.021,
  A 0.020; young series 0.049 (10 % of volume, bias +1.9 %), cold starts 0.197 (1 %, bias +10.9 %); EV SKUs 0.043
  with bias -9.6 % (largest at 2022-10 / 2023-10, log horizon ratio +0.24 / +0.18 / +0.06 / +0.02); small series
  (level < 25) 0.038-0.041; MEA 0.035; horizon 13-19 0.032 vs 0.017 at 1-3. Families and channels are even
  (0.022-0.036). Horizon 1-3 bias -1.4 % is the 2022-12 pre-buy of the 2022-10 fold (-18 % in that month), not a
  general short-horizon effect.
- A cross-sectional size effect exists (series with level > 100 over-forecast by 3.5-4.7 % at all four origins,
  level < 25 under-forecast), slope of the log ratio on log level -0.040 / -0.035 / -0.012 / -0.010 within region x
  tier x channel x powertrain: regression to the mean, weakening as the history grows.

## 2. Experiments

### E1. Level estimator (factor fit fixed, only the level stage changes; `lab/sweep_levels.py`)
Hypothesis: a better bias-variance trade-off in the level (exponential discounting, longer windows for low-information
series, NB precision weights, shrinkage to the cross-sectional prior or to the size mean) recovers part of the level
error. Score delta vs shipping (2022-10 / 2023-10 / 2024-10 / 2025-03), mean:

| variant | delta per origin | mean delta | wins |
|---|---|---|---|
| window 48 for series with level < 25 | -0.00065 / +0.00005 / -0.00028 / -0.00025 | -0.00028 | 3 |
| total-free size shrink gamma 0.02 | -0.00086 / -0.00131 / +0.00056 / +0.00077 | -0.00021 | 2 |
| window 36 for level < 25 | -0.00038 / +0.00013 / -0.00038 / -0.00012 | -0.00019 | 3 |
| NB precision weights (a 1.4, b 0.065) | +0.00103 / +0.00095 / -0.00098 / -0.00112 | -0.00003 | 2 |
| Q window 36 / 48 | | +0.00015 / +0.00057 | 1 / 2 |
| Q + B window 36 / 48 | | +0.00034 / +0.00096 | 1 / 2 |
| exponential tau 12 / 18 / 24 / 36 | | +0.00133 / +0.00049 / +0.00052 / +0.00099 | 1-2 |
| shrink to prior, 1 / 3 pseudo-months | | +0.00065 / +0.00441 | 0 |

Decision: **all rejected** (no variant clears 0.0005; the best, -0.00028, is within noise). The 24-month ratio of
sums sits at the optimum of this family, consistent with the flat window profile under hindsight factors.

### E2. Macro-path hyper-parameters (full refit; `lab/sweep_cfg.py macro`)
Hypothesis: the macro path is the largest factor error, so its estimator settings might be off. Mean score delta /
wins / mean WAPE: gamma 1.1 -0.00065 / 3 / 0.26304 (2022-10 +0.0082); model sd 0.02 -0.00064 / 3 / 0.26325; prior sd
0.08 -0.00051 / 3 / 0.26329; min months 30 -0.00048 / 3 / 0.26320; min gain 16 -0.00047 / 2; min gain 4 -0.00007;
lag decay 0.3 +0.00001, 0.8 +0.00147; model sd 0.05 +0.00134; prior sd 0.04 +0.00249; gamma 0.9 +0.00392; two
drivers +0.01055. Decision: **all rejected**. WAPE is flat (0.2630-0.2635) across every setting; the score moves come
from shifts of the fold-level bias of +-0.3 pp with no consistent direction, i.e. noise. The as-of macro error is
coefficient-estimation variance that these settings do not reach.

### E3. Other settings (`lab/sweep_cfg.py other`)
season prior 100 / 1000 units 0.00000; launch tau 3.8 +0.00077, 5.5 +0.00231; young threshold 12 +0.00049, 36
+0.00396; young n0 1 / 3 +0.00028 / 0.00000; EV betas from 2021 on -0.00077 (3 wins, WAPE worse 0.26351): rejected.
**Backfit iterations 10: -0.00249 (2 wins), WAPE 0.26255 (4 of 4 better)**: followed up in E4.

### E4. Backfit convergence (`lab/iters.py`)
Finding: the six-iteration backfit is **not converged**. With more iterations the EV beta keeps rising (2025-03:
0.0288 at 6, 0.0315 at 8, 0.0351 at 14, 0.0367 at 30 iterations; 2022-10: 0.0176 -> 0.0296 and still moving) and so
does the LNY depth (0.23 -> 0.28). Both converge to the forensic team's independent estimates (EV +0.036..0.038, LNY
0.28-0.30, dossier 4.6 / 4.8), which the shipping model attributed to "level and ramp terms absorbing the EV trend".
Cause: alternating updates of the segment levels and of the EV beta (Newton step with the levels held fixed) zig-zag
along a ridge (the EV index trends inside each segment), so each iteration moves beta a little.

| iterations | 2022-10 | 2023-10 | 2024-10 | 2025-03 | mean WAPE | mean bias | mean score |
|---|---|---|---|---|---|---|---|
| 6 (shipping) | 0.28821 / -1.02 % | 0.26141 / -1.20 % | 0.25165 / +0.52 % | 0.25175 / +1.10 % | 0.26326 | -0.15 % | 0.27286 |
| 14 | 0.28641 / -0.14 % | 0.25987 / -0.31 % | 0.25144 / +0.92 % | 0.25137 / +1.14 % | 0.26227 | +0.40 % | 0.26854 |
| 20 | 0.28633 / +0.11 % | 0.25980 / -0.12 % | 0.25146 / +0.98 % | 0.25138 / +1.16 % | 0.26224 | +0.53 % | 0.26817 |
| 30 | 0.28636 / +0.25 % | 0.25986 / -0.03 % | 0.25147 / +1.01 % | 0.25139 / +1.17 % | 0.26227 | +0.60 % | 0.26839 |

WAPE improves at every origin; the score improves strongly at the two older folds and worsens at 2024-10 (+0.004,
bias +0.5 pp) and is flat at 2025-03. Next: a profile-likelihood Newton step for the EV betas (levels profiled out)
so the fit converges in a few iterations, then evaluate the converged estimator as one candidate.


### E4 (continued). Why the backfit does not converge
Recovered from the lab's caches (these runs had not been logged when they were made): `lab/cand.py` evaluated, at the decision
origins, C1 = 8 iterations with a profile-likelihood EV step (segment levels profiled out) and a profile holiday step
(region x calendar-month factor profiled out), C2 = Bayesian model averaging over family driver sets
(`lab/bma.py`), and C1+C2:

| variant | 2022-10 | 2023-10 | 2024-10 | 2025-03 | mean score | wins |
|---|---|---|---|---|---|---|
| shipping | 0.29843 | 0.27342 | 0.25682 | 0.26278 | 0.27286 | |
| C1 profile, 8 it. | 0.28694 | 0.25999 | 0.26315 | 0.26519 | 0.26882 | 2 |
| C2 BMA drivers | 0.30498 | 0.27626 | 0.25452 | 0.25604 | 0.27295 | 2 |
| C1 + C2 | 0.29874 | 0.26299 | 0.25893 | 0.25840 | 0.26976 | 2 |

Convergence traces (`lab/conv.py`, 60 iterations, largest change of log g over live cells between iterations):
- **Profile EV step works**: EV beta reaches its fixed point in about 4-8 iterations instead of 40+ (2025-03:
  0.0367 at iteration 4 vs 0.0288 / 0.0315 / 0.0362 / 0.0367 at 6 / 8 / 20 / 40 plain iterations; 2022-10: 0.0284 at
  4 vs 0.0299 after 60 plain iterations). Plain and profile reach the same EV / LNY values.
- **But neither variant ever converges at 2025-03**: the largest change stays at 0.574 forever. Cause: a 2-cycle in the
  forward selection of the Precision Machined Parts drivers (first driver `ord@2` gain 158.38 vs `pmi@3` 157.99:
  each choice shifts levels / EV / season enough to flip the next selection). It moves 426 PMP series, up to 0.57 log
  points on one cell (PMP-047). The shipped 2025-03 forecast therefore depends on whether `n_iter` is odd or even.
- **Profile holiday step is unidentified when the holiday never moves within a calendar month**: at 2022-10 MEA has
  one Ramadan (2022-04), every MEA x month code has a single share value, the profile score is identically 0 and the
  bisection returns noise (Ramadan depth jumps 0 / 0.31 / 0.61 / 0.8 between iterations). Must fall back to the plain
  step when no code has two distinct shares.
Fix to implement: (1) hysteresis in the family driver selection (keep the previous iteration's set unless the newly
selected one has a lower penalised RSS, RSS + min_gain x k, by a margin), (2) holiday profile only where identified,
(3) a convergence criterion (largest change of log g < tol, with a cap) instead of a fixed count.

### E4 result: the converged estimator (`lab/variants.py` "conv", `lab/evalv.py`, results in `lab/results.csv`)
Estimator: profile-likelihood EV step, profile holiday step where identified, driver-set hysteresis (margin 2
chi-square units), soft-cap fit by projected Gauss-Newton with step halving (up to 20 steps) on a knee rounded over
+-0.05 (C1; at most 0.006 log points from the hinge), stop when no live cell's log g moves by more than 1e-6 (cap
40). Traces (`lab/conv3.py`): 16-21 iterations at 2022-10 / 2024-10 / 2025-03 / 2023-03 / 2025-01, 29 at 2024-03,
40 at 2023-10 (linear rate 0.77, reaches 1e-4 at about 28) and 40 at the 2021-10 stress origin.

| origin | shipping WAPE / bias / score | converged WAPE / bias / score | delta score | EV beta | LNY |
|---|---|---|---|---|---|
| 2022-10 | 0.28821 / -1.02 % / 0.29843 | 0.28652 / +0.14 % / 0.28788 | -0.01055 | 0.0176 -> 0.0297 | 0.153 -> 0.247 |
| 2023-10 | 0.26141 / -1.20 % / 0.27342 | 0.26070 / -0.66 % / 0.26730 | -0.00612 | 0.0248 -> 0.0342 | 0.253 -> 0.280 |
| 2024-10 | 0.25165 / +0.52 % / 0.25682 | 0.25196 / +1.05 % / 0.26247 | +0.00565 | 0.0283 -> 0.0361 | 0.236 -> 0.274 |
| 2025-03 | 0.25175 / +1.10 % / 0.26278 | 0.25149 / +1.20 % / 0.26354 | +0.00076 | 0.0288 -> 0.0363 | 0.231 -> 0.278 |
| decision mean | 0.26326 / -0.15 % / 0.27286 | 0.26267 / +0.18 % / 0.27030 | -0.00256 (2 wins) | | |
| 2023-03 (confirm) | 0.27573 / -0.54 % / 0.28116 | 0.27454 / +0.91 % / 0.28366 | +0.00250 | | |
| 2024-03 (confirm) | 0.25336 / -1.58 % / 0.26916 | 0.25232 / -0.75 % / 0.25985 | -0.00931 | | |
| 2025-01 (confirm) | 0.25258 / +1.25 % / 0.26508 | 0.25257 / +1.53 % / 0.26792 | +0.00284 | | |
| confirmation mean | 0.27180 | 0.27048 | -0.00132 (1 win) | | |
| 2021-10 (stress) | 0.36176 / +3.26 % / 0.39436 | 0.36757 / +5.36 % / 0.42120 | +0.02684 | 0.0139 -> 0.0275 | |

Family x month WAPE (decision mean) 0.0345 -> 0.0358. Under the declared keep rule this **fails** (2 of 4 decision
wins, 1 of 3 confirmation wins) despite the mean gains.

Why the recent folds get worse (`lab/slicev.py`): the converged fit removes the EV-SKU under-forecast at every origin
(EV bias -20.2 / -12.1 / -4.8 / -1.1 % -> -2.5 / -0.6 / -0.1 / +1.1 % at the decision origins; -15.6 / -11.5 / -1.6 %
-> -0.4 / -2.4 / +1.4 % at the confirmation origins; EV WAPE 0.397 -> 0.369 at 2022-10) and leaves ICE and Universal
series almost unchanged. At 2023-03, 2024-10, 2025-01 and 2025-03 the Universal series are over-forecast by +1.0 to
+1.8 % in both fits; the EV under-forecast used to offset that, so removing it raises the total bias. Of that
positive bias, accounts lost inside the horizon contribute +0.30 / +0.40 / +0.48 pp (2024-10 / 2025-01 / 2025-03;
not forecastable; the data suggest that no losses are scheduled in the test window, an inference rated plausible in
dossier 4.15, see also 9.1 #6) and Direct OEM /
Export series most of the rest (+1.7 to +2.7 % at the three recent origins). The level-window hypothesis ("levels
estimated on a window where the old EV beta was baked in") does not apply: levels are re-estimated inside the same
fit with the new factors; the shift is in the EV SKUs only. One fold-specific cost of discrete driver selection: at
2024-10 the converged path keeps Chassis `fuel@0 + auto@2 + pmi@2` (shipping: `raw@5 + auto@2 + ord@2`, a near tie),
Chassis bias +0.8 -> +2.9 %, WAPE +0.007 on that family.

Sensitivity of the converged fit to the driver-switch margin (reported, not used to choose; `lab/results.csv`
"conv_m5", "conv_m0.5"): margin 5 / 2 / 0.5 give decision scores 0.28788 / 0.27042 / 0.26398 / 0.26349 (m5),
0.28788 / 0.26730 / 0.26247 / 0.26354 (m2), 0.28788 / 0.27195 / 0.26109 / 0.26042 (m0.5; does not converge at
2025-03), and at 2024-03 0.26810 / 0.25985 / 0.25985. Which of two near-tied family driver sets sticks moves a fold's
score by up to 0.008: discrete driver selection is a large source of fold-level noise. Motivates E5a.

### E10. Rounding of the submitted mean (declared: cumulative per-series rounding beats independent rounding)
`lab/rounding.py` on the converged predictions, 7 origins: only 0.00-0.05 % of scored rows have 0 < mean < 3 (0.01-0.35 %
of actual volume). Score delta vs unrounded: nearest integer -0.00005 on average (better at 6 of 7), cumulative
+0.00003. **Rejected** (no effect beyond 1e-4); the submission keeps nearest-integer rounding.

### E11 (preliminary, on the shipping backtest outputs). Horizon-aware GBM blend
Declared before running: fixed schedules A (GBM weight 0.5 at h 1-3, 0.25 at 4-6, 0 after) and B (0.5 x max(0, 1 -
(h - 1) / 12)) vs structural alone, `lab/gbm_blend.py` on `outputs/backtest/predictions.parquet`. A: -0.00068 mean,
3 of 4 (2022-10 +0.00049, 2023-10 -0.00124, 2024-10 -0.00189, 2025-03 -0.00007); B: -0.00079, 3 of 4 (2025-03
+0.00043). Equal weights (shipped rule): +0.00270, 1 of 4. Both fixed schedules are at the noise threshold and the
GBM depends on the structural member, so the test must be redone on the converged model's backtest, with
confirmation origins, before anything is kept.

---------------------------------------------------------------------------------------------------------------------
## 3. Continuation (from b7a96b4)

Finding not logged by the earlier run: the lab's result table `lab/results.csv` holds a prototype "conv_bma"
(converged fit + `lab/bma2.py`: every sign-consistent family driver set of at most three indicators, lags by
coordinate search, weight `exp(-(RSS + 9k)/2)`, best four sets with weight >= 1 % of the best) already evaluated at
all seven origins before any declaration (score 0.29108 / 0.26283 / 0.25898 / 0.25705 decision, 0.27044 / 0.25968 /
0.26120 confirmation; 54-204 s per fit, not converged at 2025-03 after 40 iterations). Those numbers are reported for
reference only: they were looked at before the estimator was declared and the prototype monkey-patches the package.

### E5a. Model-averaged family driver sets (declared before evaluating the package implementation)
Hypothesis: picking one of several near-tied driver sets per family is a discontinuous estimator whose choice moves a
fold by up to 0.008 (E4); averaging the SKU paths over the sets with posterior weights removes that noise.
Estimator (`MacroConfig.set_averaging`, `celeris.features.macro.family_driver_sets`): every set of 0..3 indicators is
scored at its best lag combination (0..6 each, all 7^k combinations, batched least squares on the centred Gram
matrix) among those whose coefficients all carry the economic sign; `S = RSS + 9 k` (the forward selection's own
criterion); weights `exp(-(S - S_min)/2)`; the best 4 sets with weight >= 1 % of the best, renormalised. Each set gets
its lag posterior and family coefficients as in the forward selection; the SKU stage runs once per set and the SKU
linear predictors are averaged with the set weights before the soft cap. Driver-set hysteresis is not used in this
mode. On top of the converged fit (E4 "conv"). Selection mode reproduces the cached base / conv predictions exactly
(max abs difference 0). Differences to the prototype: exact (not coordinate-search) lag optimum and sign constraint
inside the lag search. Disclosure: the 2025-03 result of this implementation was seen once while timing it (15 s,
36 iterations, converged) before this entry was written.

E5a result (`lab2/ev.py avg`, `lab2/results.csv`). Score (WAPE / bias / score); deltas vs shipping and vs conv:

| origin | shipping | conv (E4) | conv + set averaging | delta vs shipping | delta vs conv | iterations |
|---|---|---|---|---|---|---|
| 2022-10 | 0.29843 | 0.28788 | 0.28320 / -0.77 % / 0.29092 | -0.00751 | +0.00304 | 22 |
| 2023-10 | 0.27342 | 0.26730 | 0.25995 / -0.16 % / 0.26157 | -0.01185 | -0.00573 | 31 |
| 2024-10 | 0.25682 | 0.26247 | 0.25060 / +0.89 % / 0.25946 | +0.00264 | -0.00301 | 18 |
| 2025-03 | 0.26278 | 0.26354 | 0.25071 / +0.76 % / 0.25836 | -0.00442 | -0.00518 | 36 |
| decision mean | 0.27286 | 0.27030 | 0.26112 / +0.18 % / 0.26758 | -0.00529 (3 of 4) | -0.00272 (3 of 4) | |
| 2023-03 (confirm) | 0.28116 | 0.28366 | 0.26983 / +0.06 % / 0.27046 | -0.01070 | -0.01320 | 21 |
| 2024-03 (confirm) | 0.26916 | 0.25985 | 0.25188 / -0.78 % / 0.25963 | -0.00953 | -0.00022 | 31 |
| 2025-01 (confirm) | 0.26508 | 0.26792 | 0.25156 / +0.95 % / 0.26102 | -0.00406 | -0.00690 | 19 |
| confirmation mean | 0.27180 | 0.27048 | 0.26370 | -0.00810 (3 of 3) | -0.00677 (3 of 3) | |
| 2021-10 (stress) | 0.39436 | 0.42120 | 0.32254 / -0.63 % / 0.32886 | -0.06550 | -0.09234 | 28 |

WAPE better than shipping at all 7 origins; family x month WAPE 0.0474 / 0.0334 / 0.0213 / 0.0213 (mean 0.0309 vs
0.0345, better at all four); every fit converged (largest change of log g < 1e-6 at 18-36 iterations; 8-17 s per fit
vs 54-204 s for the prototype). Most families end on one set (weight > 0.99); Hydraulic and Thermal average two or
three at 2025-03. The scores are within 0.0002 of the prototype's at the confirmation origins.
**Passes the keep rule against shipping** (3 of 4 decision origins, mean gain 0.0053, confirmation 3 of 3, aggregates
better); the converged fit alone did not. Candidate for the factor fit; step 2 (recent over-forecast) next.

### Step 2. The recent over-forecast, re-diagnosed on the converged + averaged fit (`lab2/diag.py`, `ana*.py`)
Bias with / without the rows of accounts lost inside the horizon (`final_lost_tail`; not forecastable; the data suggest
none are scheduled in the test window, dossier 4.15), score in brackets:

| origin | bias all rows | bias excl. lost | score all | score excl. lost |
|---|---|---|---|---|
| 2022-10 | -0.77 % | -0.77 % | 0.29092 | 0.29092 |
| 2023-10 | -0.16 % | -0.17 % | 0.26157 | 0.26157 |
| 2024-10 | +0.89 % | +0.59 % | 0.25946 | 0.25353 |
| 2025-03 | +0.76 % | +0.29 % | 0.25836 | 0.24890 |
| 2023-03 | +0.06 % | +0.06 % | 0.27046 | 0.27046 |
| 2024-03 | -0.78 % | -0.83 % | 0.25963 | 0.25963 |
| 2025-01 | +0.95 % | +0.55 % | 0.26102 | 0.25318 |

What remains at the three recent origins (+0.59 / +0.29 / +0.55 pp, 2024-10 / 2025-03 / 2025-01), by contribution:
- **Young (< 24 months) and cold-start series: +0.39 / +0.43 / +0.43 pp** - essentially all of it. Young tail-tier
  series are over-forecast by +4.6 / +6.3 / +5.7 % (+0.6 to +1.9 % at the older origins; core young series are
  under-forecast), the youngest most (0-5 months since start: positive at all 7 origins, +3 to +21 %); cold starts
  (all tail tier) by +14 / +35 / +20 % (+5 to +9 % at the older origins). Swapping any factor for its hindsight value
  leaves this unchanged, so it is the level prior, not a factor path.
- Mature series: +0.20 / -0.14 / +0.12 pp, Direct OEM +1.05 / +0.52 / +0.85 % against Tier-1 / Aftermarket -0.1 to
  -1.2 %; the Direct OEM sign flips between old (-0.5 to -0.8 %) and recent origins and survives the hindsight macro
  and season swaps: the period-specific error of the one-off uplift already documented (not fixable as of the origin).
  Mature Export series are no longer over-forecast (-0.06 / +0.37 / +0.41 %); the "Export" excess of E4 was young
  Export series (+9.5 % / +15.8 % at 2024-10 / 2025-01).
- Series with level > 100: +0.8 to +3.5 % at every origin (regression to the mean; size shrinkage rejected in E1).
- Macro path: swapping in the hindsight path moves the recent bias by -0.06 / -0.08 / -0.07 pp only. Seasonality,
  holidays: 0. The Helios step (swap_event) raises it.
As-of evidence for the prior (`lab2/prior_check.py`): in-sample, the tail-tier series launched 6-24 months before the
origin run at 0.96 / 0.88 / 0.93 / 0.92 x the prior (2022-10 / 2023-10 / 2024-10 / 2025-03; 0.95 / 0.87 / 0.91 at the
confirmation origins), and the single smear factor leaves mature core series at 1.13-1.18 x and mature tail series at
0.963-0.976 x the prior at every origin.

### E6. Launch-cohort calibration of the prior (declared before evaluation)
Hypothesis: the prior is fitted on mature series and smeared to their mean; new tail-tier launches run below it, so
cold starts and young blends of the tail tier inherit an upward bias. Estimator (`StructuralConfig.launch_cohort =
(6, 24)`, level stage only): multiply the prior of every tail-tier series by `c` = sum of demand / sum of prior x
accumulated factors over the level-window cells of the tail-tier product-launch series launched 6-24 months before
the origin (c = 1 with fewer than 30 such series). Young blends and cold starts of the tail tier use the calibrated
prior; mature levels and core series are untouched. Compared with the converged + averaged fit ("avg").

E6 result (`lab2/ev.py avg_lc`): score 0.29240 / 0.26588 / 0.25710 / 0.25626 vs avg 0.29092 / 0.26157 / 0.25946 /
0.25836 (delta +0.00148 / +0.00431 / -0.00236 / -0.00210, mean +0.00033, 2 of 4). WAPE improves at all four origins
(mean -0.0006) but the calibration factor is a noisy predictor of the launch-cohort error: at 2023-10 c = 0.88
over-corrects (cold starts +5.4 % -> -6.4 %, young launches +2.0 % -> -1.3 %, total bias -0.16 % -> -0.69 %), at
2025-03 c = 0.92 under-corrects (cold starts still +24 %). **Rejected** (not run on the confirmation origins). The
young / cold-start over-forecast is real but its size varies by cohort more than an as-of ratio can predict.

### Step 3. Decision on the factor fit
Scores excluding the rows of accounts lost inside the horizon (secondary view, declared before this decision) give the
same verdict: avg vs shipping 0.29092 / 0.26157 / 0.25353 / 0.24890 vs 0.29843 / 0.27342 / 0.25084 / 0.25324
(3 of 4, mean -0.00525), confirmation 0.27046 / 0.25963 / 0.25318 vs 0.28116 / 0.26916 / 0.25716 (3 of 3, mean
-0.00807). **Decision: adopt the converged fit with model-averaged driver sets** (E4 + E5a): it passes the keep
rule in both views, improves WAPE at all 7 origins, family x month WAPE at all 4 decision origins, and the stress
origin by 0.065. The converged fit alone (E4) is not adopted: it fails the rule, and its gain came with the discrete
driver-selection noise that E5a removes.

### E11 (proper). Horizon-aware GBM blend on the adopted structural member (declared before evaluation)
The GBM member is retrained exactly as in the harness (inner origins every 3 months from 2021-10, targets before the
fold's origin) on the converged + averaged structural forecasts, for the four decision and three confirmation origins
(`lab2/gbm_eval.py`). Schedules fixed in advance (from the preliminary E11): A = GBM weight 0.5 at h 1-3, 0.25 at
h 4-6, 0 after; B = 0.5 x max(0, 1 - (h - 1) / 12); the shipped equal-weight rule is reported for reference. A
schedule is kept only if it passes the keep rule against the structural member alone; if both pass, the one with the
larger mean decision gain.

E11 result (`lab2/gbm_eval.py avg`, `lab2/blend.py avg gbm_avg`). Score deltas vs the structural member alone:

| schedule | 2022-10 | 2023-10 | 2024-10 | 2025-03 | decision mean / wins | 2023-03 | 2024-03 | 2025-01 | confirmation mean / wins |
|---|---|---|---|---|---|---|---|---|---|
| A (0.5 / 0.25 / 0) | +0.00092 | -0.00018 | -0.00180 | -0.00001 | -0.00027 / 3 | +0.00102 | -0.00095 | -0.00129 | -0.00040 / 2 |
| B (linear to h 13) | +0.00004 | -0.00025 | -0.00157 | +0.00046 | -0.00033 / 2 | +0.00618 | -0.00126 | -0.00071 | +0.00140 / 2 |
| equal weights (shipped rule) | +0.00104 | +0.00423 | +0.00009 | +0.00496 | +0.00258 / 0 | +0.03479 | -0.00245 | +0.00270 | +0.01168 / 1 |
| GBM alone | +0.02516 | +0.01895 | +0.00214 | +0.01143 | +0.01442 / 0 | | | | |

Identical verdicts excluding the lost-account rows. **Rejected**: neither schedule clears the 0.0005 threshold on the
adopted structural member (the preliminary -0.0007 / -0.0008 on the shipping member came mostly from the EV and
driver-choice errors the new member no longer makes). The GBM stays out; the equal-weight rule still drops it.

### Step 5. Young / cold-start priors and quarterly-cycle series
- Young / cold-start priors: E6 above (rejected).
- Quarterly cycle (`lab2/anaq.py`): Q series' excess over the oracle is 0.63 / 0.48 / 0.28 / 0.27 pp of total WAPE
  (8 % of volume) at the decision origins. At 2022-10 / 2023-10 / 2023-03 8-13 % of the Q error is phase error (orders
  in months the as-of cycle says are off: cycle changes inside the horizon, 63-129 rows); at the recent origins none.
  The rest is level-estimation noise of a series with 8 orders in 24 months: the Q level window 36 / 48 was already
  rejected in E1 (+0.00015 / +0.00057) and shrinkage to the cross-sectional prior hurt (E1). The diagnosis offers no
  as-of fix, so no experiment was run. Two systematic cycle effects were noticed for the record: A-cycle series are
  over-forecast at 6 of 7 origins (+0.5 to +1.6 %) and B-cycle series under-forecast at 7 of 7 (-0.2 to -2.5 %);
  each moves total bias by 0.1-0.4 pp in opposite directions. Not pursued (it needs a look at the carry weights of
  the demand stage, outside this round's scope).

### Integration run (adopted estimator as the package default; `python -m celeris backtest`, 30.0 min, peak RSS 1.32 GB)
The stage reproduces the lab numbers exactly (decision scores 0.29092 / 0.26157 / 0.25946 / 0.25836, mean 0.26758;
stress 0.32886). Its experiment grid, re-run on the new default, flags one setting: **SKU prior sd 0.12 scores
0.26478 vs 0.26758 for 0.06, better at 4 of 4 decision origins** (with the shipping fit it was 0.2731 vs 0.2729).
Every other grid variant is worse or within 0.0002 (gamma 1.1 now +0.0027, era 0.9 +0.0014, log-linear +0.0007).

### E12. SKU coefficient prior sd 0.12 (the grid's existing variant; declared before the confirmation run)
Hypothesis: with converged factors and averaged family sets, the SKU coefficients are over-shrunk at prior sd 0.06.
Only the grid value 0.12 is tested (no tuning of the value). Decision origins from the backtest stage
(`experiments.csv`), confirmation and stress from `lab2/ev.py avg_sd12`.

E12 result. Score vs the adopted fit (prior sd 0.06):

| origin | sd 0.06 (adopted) | sd 0.12 | delta | WAPE 0.06 -> 0.12 | bias 0.06 -> 0.12 | iterations (last change) |
|---|---|---|---|---|---|---|
| 2022-10 | 0.29092 | 0.28660 | -0.00432 | 0.28320 -> 0.28425 | -0.77 -> -0.24 % | 40 (3.9e-5) |
| 2023-10 | 0.26157 | 0.26102 | -0.00055 | 0.25995 -> 0.26000 | -0.16 -> +0.10 % | 40 (1.0e-1) |
| 2024-10 | 0.25946 | 0.25731 | -0.00215 | 0.25060 -> 0.25031 | +0.89 -> +0.70 % | 23 |
| 2025-03 | 0.25836 | 0.25417 | -0.00419 | 0.25071 -> 0.25066 | +0.77 -> +0.35 % | 40 (2.4e-2) |
| 2023-03 (confirm) | 0.27046 | 0.27229 | +0.00183 | | | 40 |
| 2024-03 (confirm) | 0.25963 | 0.25976 | +0.00013 | 0.25188 -> 0.25163 | | 40 (2.4e-2) |
| 2025-01 (confirm) | 0.26102 | 0.25828 | -0.00274 | 0.25156 -> 0.25128 | | 40 (2.9e-2) |
| 2021-10 (stress) | 0.32886 | 0.33414 | +0.00528 | | | 37 |

**Rejected**: worse at 2 of 3 confirmation origins (rule c), mean WAPE over the decision origins slightly worse
(0.26131 vs 0.26111; the decision gain is |bias| moving in both directions, the E2 pattern), and with the looser
prior the backfit no longer converges at 6 of 8 origins (largest change of log g still 0.02-0.10 after 40
iterations), so its forecasts would depend on the iteration cap. Prior sd stays 0.06.

### Integration and clean-up
- Package defaults are now the adopted estimator (`StructuralConfig`: `n_iter` 40, `tol` 1e-6, `ev_profile`,
  `holiday_profile`; `MacroConfig`: `set_averaging`, `cap_iter` 20, `cap_line_search`, `cap_smooth` 0.05,
  `switch_margin` 2 for the selection mode). `StructuralConfig() == lab2 "avg"` was checked, so every lab number above
  is the shipped configuration. The rejected E6 option (`launch_cohort`) was removed from the package; its code is kept
  in `research/optimisation_lab/lab2/e6_launch_calibration.py.txt` (so `lab2/ev.py avg_lc` no longer runs).
- Reporting: `summary.json` -> `diagnostics_by_origin.*.family_driver_sets` and `backfit_iterations`;
  `structural_factors.json` -> `family_macro_driver_sets`, `backfit_iterations`; `macro_sensitivity.csv` sums the
  weighted response over the averaged sets (same schema). `macro_drivers_by_origin.csv`, `sku_macro_drivers.csv` and
  the era analysis keep their schema and report the best-weighted set.
- Speed-up without changing results: in the soft-cap Gauss-Newton fit a row whose coefficients did not move would
  recompute the same step forever, so it is frozen. Bit-identical predictions and SKU paths at 2025-03, 2022-10 and
  2021-10 (`lab2/check_cap.py`), about 20 % less time per fit (13.0 vs 15.9 s at 2025-03).
- Tests: `test_averaged_driver_sets_are_weighted_and_sign_consistent` and `test_backfit_converges` added to
  `tests/test_model_structural.py`.
- Stage runs (first integration run, before the speed-up): features 19.8 s / 0.92 GB, backtest 1,799 s / 1.32 GB,
  forecast 15.6 s / 0.74 GB.
- Final stage runs with the final code (`/usr/bin/time -v`): features 14.7 s / 0.93 GB, backtest 1,516 s (25.3 min,
  was 30.0 min before the soft-cap speed-up) / 1.32 GB, forecast 13.2 s / 0.72 GB. The 19 output files of the three
  stages have the same SHA-256 hashes as the first integration run, so the speed-up and the removal of the E6 option
  changed nothing.

### Conclusion of the round
One change adopted: the converged factor fit (profile EV / holiday steps, convergence criterion, smoothed soft cap
fitted by projected Gauss-Newton) with model-averaged family driver sets. Decision mean WAPE 0.26326 -> 0.26111, bias
-0.15 % -> +0.18 %, score 0.27286 -> 0.26758; confirmation mean 0.27180 -> 0.26370; stress 0.39436 -> 0.32886; family
x month WAPE 0.0345 -> 0.0308. Rejected: E1-E3, E6, E10, E11, E12 (E4 alone). Submission total 2,793,254 ->
2,805,199 (+0.43 %), EV SKUs +1.55 %.
