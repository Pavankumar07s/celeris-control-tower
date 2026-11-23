# Research lens `methods-cleaning-anomaly`: cleaning, anomaly detection, data-quality reporting and test strategy

Prepared 2026-11-23 for the Celeris hackathon entry. Inputs: `docs/problem_statement.md` (workstream 1 Cleaning, workstream 2 Anomalies), `docs/evaluation_criteria.md` (the 7 jury criteria), and the headlines of the sibling forensic lenses in `research/*.md` and `*.verify.md`. Every external claim cites a URL. Numbers about our data are taken from the named sibling lens. They are not re-computed here, and `DATA_DOSSIER.md` will hold the final values.

---

## Headline

The literature gives a clear recipe, and our data makes it unusually sharp:

1. **Fix errors by cause, never by smoothing.** Correct stockouts first, then outliers. Keep real events in the history and model them. Log every change.
2. **Use statistical detectors only after deterministic rules.** Robust STL with MAD, Hampel, generalised ESD, Chen-Liu and isolation forest come second.
3. **Make all reporting machine-readable.** Report checks before and after cleaning, in a Great-Expectations / ODCS-shaped JSON, and keep a row-level fix log.

On our data, generic detectors would do harm. 98.7 % of the zero months are off-months of deterministic ordering cycles (panel-missing-zeros). A quarterly order carries about 3 months of demand. Noise is negative-binomial. On raw monthly series, a residual detector would therefore flag thousands of normal orders and miss the real anomalies.

The forensic lenses have shown that every injected data error is an **exact arithmetic signature**: a price ratio in {1, 10, 100, 0.89}, revenue equal to units × price to the cent, Record_ID gaps, a later load timestamp. Every real event is a **scope-coherent pattern**: it hits all series in a calendar scope, persists as a level step, or follows a cycle.

**Recommended design:**

- **Layer A: an exact rule engine** for data errors. Each rule is validated against an independent oracle, `inventory_stockouts.Shipped_Units`.
- **Layer B: a model-based anomaly score.** Compute a randomised quantile residual of each observed order against the generator-style expected order: level × season × cycle accumulation × events, with NB dispersion. Use it for one-offs and for anything Layer A did not explain.
- **Layer C: structural detectors.** Template-based segmentation of ordering cycles, trailing-zero run tests for lost accounts, and an exact optimal-partitioning level-shift test.
- **Outputs.** Everything feeds three artefacts: `dq_report.json`, `fix_log.parquet` and `anomaly_register.parquet`, plus the `anomaly_cells.parquet` view.
- **Build and tests.** `make all` builds everything. A pytest suite checks invariants, golden files and the oracle, and includes a **generator-mirroring error injector**. The cleaner must recover 100 % of injected exact-class errors. We know of nothing comparable in a typical student entry, and it is strong evidence for criteria 02, 03 and 06.

---

## 0. How this lens serves the 7 jury criteria

| # | Criterion | What this lens delivers |
|---|---|---|
| 01 | Problem understanding | A rule catalogue that maps every check to business rules 1–7 and to the Core / Advanced / Expert items of workstreams 1–2 (section 8.4) |
| 02 | Data preparation | Exact, oracle-validated cleaning rules; machine-readable DQ report with before / after per rule and per file; row-level lineage of every changed cell; tested one-command pipeline |
| 03 | Model performance & validation | Hide-and-recover validation of every detector and imputer: stockout imputation, missing rows, cycle-change and level-shift detection, each reported as precision / recall / WAPE. Cleaner validated against the stockout file as ground truth |
| 04 | Quality of insights | Anomaly register with cause, evidence, action and **impact in units and USD**, ranked by business impact (lost sales, lost accounts, customer switches) |
| 05 | Dashboard & visualisation | The *Data health* and *Anomaly monitor* views read `dq_report.json` and the register directly, so no number is typed by hand |
| 06 | Originality & innovation | Generator-mirroring corruption-recovery tests; ratio-lattice error classifier; cycle-template segmentation; NB quantile-residual anomaly score; OpenLineage-style lineage file |
| 07 | Solution presentation | One `make all`, a run manifest with input / output hashes, and a fix log that lets a judge trace any cleaned number back to the raw string |

---

## 1. Anomaly detection for monthly demand series

### 1.1 State of the art (what the sources say)

**Outlier taxonomy (Chen and Liu 1993, `tsoutliers`, X-13).**
- Chen & Liu's joint estimation of ARIMA parameters and outlier effects ([JASA 88(421), doi:10.2307/2290724](https://doi.org/10.2307/2290724)) defines the standard taxonomy, implemented in R `tsoutliers`:
  - **IO**: innovational outlier.
  - **AO**: additive outlier, a single-point spike.
  - **LS**: level shift, a permanent step.
  - **TC**: temporary change, a step that decays geometrically.
  - **SLS**: seasonal level shift. ([package page](https://search.r-project.org/CRAN/refmans/tsoutliers/html/tsoutliers-package.html))
- `tso()` defaults ([tso help](https://rdrr.io/cran/tsoutliers/man/tso.html)):
  - `types = c("AO","LS","TC")` and TC decay `delta = 0.7`.
  - The critical value is `cval = 3` for n ≤ 50, `4` for n ≥ 450, and `3 + 0.0025 (n − 50)` in between. For our 94-month series that gives **cval ≈ 3.11**.
- X-13ARIMA-SEATS uses the same AO / LS / TC family and adds **ramps**, which need a start and an end date ([Census working paper](https://census.gov/content/dam/Census/library/working-papers/2013/adrm/jsm2013lytrasfinal.pdf)). It also adds a **seasonal outlier** regressor, which Census describes as the same as the seasonal level shift. Census warns that under seasonal differencing it can be hard to tell apart from a level change ([Monsell 2007](https://apps.bea.gov/icsp/fcsm/assets/docs/2007FCSM_Monsell-II-B.pdf)).

**Decomposition and residual tests.**
- Hyndman's `forecast::tsoutliers()` works in three steps ([Hyndman 2021](https://robjhyndman.com/hyndsight/tsoutliers/)):
  - It decomposes the series with robust MSTL and seasonally adjusts it only if seasonal strength exceeds 0.6.
  - It re-estimates the trend with Friedman's super-smoother.
  - It flags remainders outside Q1 − 3·IQR / Q3 + 3·IQR, replaces them by interpolation and repeats.
- Hyndman's own caveat: a weak but over-fitted seasonal component can "absorb" outliers. `tsclean()` uses the same machinery to fill gaps ([docs](https://search.r-project.org/CRAN/refmans/forecast/html/tsclean.html)).
- In Python, `statsmodels` has `STL(..., robust=True)`, which uses outer-loop robustness weights, and `MSTL` with `stl_kwargs` passed through ([MSTL docs](https://www.statsmodels.org/stable/generated/statsmodels.tsa.seasonal.MSTL.html); method: [Bandara, Hyndman & Bergmeir](https://arxiv.org/abs/2107.13462)). Both are installed in our `.venv` (statsmodels 0.15).
- Even robust decomposition is corrupted by the anomalies it tries to find. One proposed fix replaces the trend with a median ([robust decomposition for seasonal metrics](https://ar5iv.labs.arxiv.org/html/2008.09245)).

**Robust scores.**
- Modified z-score: `M = 0.6745 (x − median)/MAD`, with |M| > 3.5 flagged as potential outliers ([NIST / Iglewicz & Hoaglin](https://www.itl.nist.gov/div898/handbook/eda/section3/eda35h.htm)).
- Hampel identifier ([SAS](https://blogs.sas.com/content/iml/2021/06/01/hampel-filter-robust-outliers.html)):
  - The window is 2k+1, typically k = 3.
  - The scale is 1.4826·MAD and the threshold is usually 3.
  - Flagged points are replaced by the rolling median.

**Generalised ESD (Rosner 1983).**
- It needs only an *upper bound* r on the number of outliers. The count is the largest i with R_i > λ_i.
- It resists masking better than repeated Grubbs tests, but it assumes approximate normality ([NIST](https://www.itl.nist.gov/div898/handbook/eda/section3/eda35h3.htm)).
- Twitter's Seasonal-Hybrid ESD runs generalised ESD on STL residuals with median and MAD ([Hochenbaum et al.](https://arxiv.org/abs/1704.07706)). A later paper reports high type-I error from this pairing and notes that the period must be set by hand ([arXiv 1911.05376](https://arxiv.org/pdf/1911.05376)).

**Count-data residuals.**
- Randomised quantile residuals invert each observation's fitted CDF into a normal quantile ([Dunn & Smyth 1996](https://gksmyth.github.io/pubs/residual.pdf)).
- For Poisson and NB models they have low type-I error and good power against over-dispersion and zero inflation ([Feng et al. 2020](https://pmc.ncbi.nlm.nih.gov/articles/PMC7329451)). This is the principled replacement for z-scores on counts.

**Isolation forest.**
- In scikit-learn, `contamination='auto'` uses the paper's offset of −0.5, and negative `decision_function` values are outliers ([sklearn](https://scikit-learn.org/stable/modules/generated/sklearn.ensemble.IsolationForest.html)).
- It ignores time order unless temporal features are engineered in, and windowing adds tuning burden ([survey](https://arxiv.org/pdf/2004.00433)).

**Enterprise practice (data errors vs real events).**
- **SAP IBP** ([SAP Learning](https://learning.sap.com/courses/mastering-sap-ibp-for-demand/cleaning-data-automatically); [SAP blog](https://blogs.sap.com/2019/03/31/data-cleansingoutlier-correction-methods-in-ibp-demand/); [SAP AI preprocessing](https://learning.sap.com/courses/discovering-ai-in-sap-integrated-business-planning/understanding-ai-in-demand-planning-preprocessing-1)):
  - It detects with mean ± multiplier·σ, IQR, or a majority vote of several detectors, including isolation forest and DBSCAN.
  - It corrects with mean, median or tolerance computed *excluding* the outliers.
  - It warns that seasonal peaks can be flagged wrongly and advises keeping promotions that explanatory variables can account for.
- **Oracle RDF preprocessing** ([Oracle](https://docs.oracle.com/cd/E75759_01/pdf/cloud/190/html/user_guide/output/apx_preproc.htm)):
  - It corrects stockouts using out-of-stock flags, with standard-median or exponential-smoothing "velocity" imputation.
  - It flags outliers only on *non-promoted* periods.
  - It provides heuristic rules for populating missing out-of-stock flags.
  - Oracle's cleansing guidance runs stockout correction *before* outlier correction ([Oracle data cleansing](https://docs.oracle.com/cd/E75759_01/pdf/cloud/190/html/user_guide/output/datacleansing_pe.htm)).
- **The counter-view** ([SAS](https://blogs.sas.com/content/sascom/2015/05/26/stop-cleansing-your-historical-shipment-data); [IBF](https://ibf.org/knowledge/jbf-articles/does-demand-history-really-need-to-be-cleaned-1144)):
  - Cleansing history often *hurts* accuracy and adds personal bias.
  - Model shortages, outliers and promotions with intervention (dummy) variables instead of editing the history.
- **The consensus:** correct true errors and stockouts, keep explainable events and model them, validate automatic correction on seasonal items, and log every change.

### 1.2 What this means for our data

The sibling lenses established five facts:
- a multiplicative latent-demand generator;
- calendar-anchored ordering cycles: 16 patterns, P(order | on-phase) = 99.87 %;
- orders that accumulate latent demand since the previous order;
- NB noise with region-specific dispersion;
- one-off multipliers of x3–x10 on Direct OEM and Tier-1 (demand-dgp, panel-missing-zeros).

Consequences:

1. **Do not run STL / Hampel / ESD on raw monthly units.**
   - An off-phase zero followed by a 3-month order is a structural pattern, not an AO.
   - On bi-monthly and quarterly series, an STL seasonal with period 12 cannot represent phase-anchored zeros. Residuals become bimodal, so MAD scaling breaks down.
   - Use these detectors only on **cycle-aggregated monthly-equivalent series**: order quantity divided by months covered. Use them as an independent cross-check, not as the primary detector.
2. **The primary statistical detector should be model-based:**
   - Compute `E[y_t]` for every cell from the fitted generator decomposition: level × family season × channel × region calendar × event multipliers × lifecycle ramp × cycle accumulation.
   - Score with an **NB randomised quantile residual** `z_t = Φ⁻¹(F_NB(y_t; E[y_t], k_region))`. Tail probabilities are then comparable across a 3-unit and a 3,000-unit series.
   - Use two tiers:
     - **Review**: p < 1e-4.
     - **Strong**: p below a family-wise level such as 0.05 / 245,548 ≈ 2e-7, i.e. |z| ≈ 5.1.
   - With about 245k grid cells, a 1e-4 threshold still lets through about 25 false alarms under the null. Report that number. It is an honest, quantitative statement juries like.
3. **Iterate to avoid masking**, as `tsoutliers` and generalised ESD do:
   - Fit the level with robust statistics.
   - Flag, exclude the flagged cells, refit, re-score. Two passes are enough.
4. **Isolation forest is low priority.**
   - Run it once on *series-level* features: zero share, CV², price ratio dispersion, revenue-gap share, restatement share, load-lag anomalies.
   - Use it as an "unknown-unknowns sweep". If it surfaces nothing beyond the rule catalogue, say so in the DQ report as a completeness check.
   - Never use it to fix values.
5. **One-off orders:**
   - A cell that reconciles exactly (revenue = units × canonical price) yet scores in the strong tier is a **real one-off order**: keep it, flag it, and exclude it from level estimation.
   - Do **not** replace it with a neighbour median on a cycle series. The numeric-reconcile skeptic found that this gives wrong values when neighbours are constrained or off-phase, as at PMP-040 LATAM 2026-09/10.
   - Instead, set the training target to `E[y_t]` from the model fitted without the flagged cell, or down-weight the cell. Record both values in the register.

### 1.3 Separating data errors from real events: decision procedure

Apply the tests in order. The first that fires decides the class, and every cell ends in exactly one class.

| Step | Test | Fires → class | Example on our data |
|---|---|---|---|
| 1 | A key witness disagrees: Record_ID grid vs Date text vs Load_Timestamp month | data_error (key) | 30 `2062-MM` dates; 745 blank regions (dates-dups, labels-keys) |
| 2 | An arithmetic identity is violated (`rev = units × price`, price = canonical × m with m ≠ 1) | data_error (numeric) | 13 error states, 6,932 rows (numeric-reconcile) |
| 3 | A repeated Record_ID has a later load | data_error (restatement); keep the latest | 736 restatements; latest = Shipped_Units 17/17 (dates-dups) |
| 4 | The cell is in a listed stockout, or has the backorder rebound signature | real_event (supply) → unconstrain | `inventory_stockouts` + unlisted ELA semiconductor cells |
| 5 | The deviation is coherent across all series in an events-calendar scope × period | real_event (calendar) → model as a feature | LNY APAC depth 0.30; Europe strike x0.145 (events-calendar) |
| 6 | Persistent step at a key change (customer name change, zero run on on-phase months, cycle template change) | real_event (structural) → LS / SLS / lost account | 23 switches, 16 lost accounts, 27 cycle changes |
| 7 | Isolated cell, identities hold, strong-tier NB residual | real_event (one-off order) → keep and flag, exclude from level | 438 candidates, about 60 doubtful (numeric-reconcile verify) |
| 8 | Master data contradicts the transactions | reference_conflict → document and decide which source wins | PMP-004 BU, BSS-018 launch date (lifecycle-master) |
| 9 | None of the above, review tier | unexplained → register with `status = review` | expected near zero; report the count |

The principle behind this table is the SAS / IBF / SAP consensus above: **fix only what is provably an error, model what is an event, and never let a statistical detector overwrite an identity-consistent value.**

---

## 2. Change points, structural breaks and order-cycle periodicity

### 2.1 State of the art

- **PELT** (Killick, Fearnhead & Eckley 2012, [arXiv 1101.1438](https://arxiv.org/abs/1101.1438), JASA 107:1590):
  - Exact penalised segmentation, with cost linear in n under mild conditions.
  - Implemented in R `changepoint` ([refman](https://cran.r-project.org/web/packages/changepoint/refman/changepoint.html)) and Python `ruptures`, which offers `l2`, `l1`, `rbf` or custom costs with `min_size`, `jump` and a penalty set at predict time ([ruptures](https://github.com/deepcharles/ruptures); [paper](https://arxiv.org/pdf/1801.00826)).
  - The Truong–Oudre–Vayatis review organises methods by cost function, search method and penalty ([arXiv 1801.00718](https://arxiv.org/abs/1801.00718)).
  - **`ruptures` is not installed and we may not install it.** With n = 94, exact optimal partitioning (O(n²)) costs about 9k cost evaluations per series, about 27 M for all 3,083 series. That is seconds in numpy, so we do not need PELT's pruning. Write a 40-line dynamic program.
- **CUSUM:**
  - `statsmodels.stats.diagnostic.breaks_cusumolsresid` is the Ploberger–Krämer OLS-residual CUSUM, a parameter-stability test with Brownian-bridge p-values ([docs](https://www.statsmodels.org/dev/generated/statsmodels.stats.diagnostic.breaks_cusumolsresid.html)).
  - Use it as a *test* (is there any break?), not as a locator.
- **Bai–Perron** multiple-break regression:
  - The sequential sup-F procedure tests l against l+1 breaks; the alternative is BIC selection.
  - The sequential approach carries pre-testing bias, and the different tests can disagree ([2025 empirical guide](https://arxiv.org/pdf/2507.22204); [Kejriwal](https://Krannert.purdue.edu/research/working-papers-series/2017/1303-MohitoshKejriwal.pdf)).
  - It is the econometric gold standard when breaks sit in *regression coefficients*. Relevant to us for "is the macro lag structure stable?" (workstream 3 Expert), less so here.
- **BOCPD** (Adams & MacKay 2007, [arXiv 0710.3742](https://arxiv.org/abs/0710.3742); [walkthrough](https://www.gregorygundersen.com/blog/2019/08/13/bocd/)):
  - Online posterior over the run length since the last change.
  - Not robust when the model is misspecified: spurious changepoints ([robust BOCPD](https://arxiv.org/pdf/2302.04759)).
  - Useful as a *monitoring* story for the forecast window ("alert when actuals break the forecast regime"), not needed offline.
- **Periodicity:**
  - AutoPeriod (Vlachos et al. 2005) takes candidate periods from periodogram peaks, which may be false through spectral leakage, and verifies them on the ACF. Recent variants use permutation thresholds ([description](https://arxiv.org/pdf/2312.08535); [toolbox](https://github.com/codelionx/periodicity-detection)).
  - RobustPeriod uses Huber-robust periodogram and ACF ([arXiv 2002.09535](https://arxiv.org/pdf/2002.09535)).
  - Inter-demand intervals give the Syntetos–Boylan–Croston classification: ADI 1.32, CV² 0.49, tested on 3,000 automotive series ([SBC 2005](https://eprints.lancs.ac.uk/id/eprint/73095)).
- **Obsolescence:** TSB (Teunter, Syntetos & Babai 2011) updates the *demand probability* every period, so the forecast decays after zeros. It is the forecasting counterpart of lost-account detection ([EJOR](https://dx.doi.org/10.1016/j.ejor.2011.05.018); [tsintermittent](https://search.r-project.org/CRAN/refmans/tsintermittent/html/tsb.html)).

### 2.2 Recommendations for our data

**(a) Ordering-cycle state and cycle changes: template segmentation, not generic periodicity.**
- The 16 cycle patterns are calendar-anchored: monthly, monthly with one shutdown month, 2 × bi-monthly phases, 3 × quarterly phases, 3 × "2-on-1-off" (panel-missing-zeros).
- A single-period periodogram mislabels "2-on-1-off" and "shutdown" patterns.
- Recommended algorithm:
  - Let `o_t = 1[y_t > 0]`, with missing rows as NA.
  - For each template `T_j` (a 12-month 0/1 calendar mask), define the segment cost as the Bernoulli negative log-likelihood of `o_t` given `T_j`, with ε = 0.005 mismatch probability (from the measured 99.87 % / 99.37 %).
  - Exempt known stockout spill months and launch-ramp months.
  - Find segments by exact optimal partitioning over templates with penalty β per change, plus `min_size` = 6 months.
  - Output: the template per segment, the change month and from → to.
  - Validate against the 27 known cycle changes: report exact-month recall and false changes on the 3,056 non-changing series. Also check volume conservation: level ratio ≈ 1.00 across the change.
  - Calibrate β by simulation: generate null series from each series' own template with ε flips, and choose β so that fewer than 1 % of null series produce a false change.
- Report ACF on `o_t` (lags 1–12) and `scipy.signal.periodogram` peaks *only as an independent cross-check* in the write-up. "Two independent methods agree on N series" is good evidence.

**(b) Lost accounts: a trailing run test on on-phase months.**
- Under the active hypothesis, P(no order in an on-phase month) ≈ 0.0013 (panel-missing-zeros).
- So two consecutive on-phase zeros have p ≈ 1.7e-6. Declare "lost" after ≥ 3 on-phase zeros with no recovery, which gives an expected false-alarm count of about zero over 3,083 series.
- For quarterly series, three on-phase zeros take 9 months. All 16 known losses have 10–19 zero months, so the rule catches them.
- Register each loss as an LS to zero, with the impact in units and USD per year: pre-loss monthly level × 12 × price.
- Forecast 0 in the window. TSB-style decay is the generic fallback for the literature citation.

**(c) Level shifts: customer switches, programme steps and the new region.**
- On the cycle-aggregated monthly-equivalent series in log scale, run exact optimal partitioning with a Poisson / NB cost and a BIC-type penalty (k·log n). Calibrate by simulation, as in (a).
- Use it **for completeness, not discovery**:
  - Known steps come from labels: a Customer_Name change (23 switches), events-calendar items (EV-052 Helios ×1.24), and the MEA opening ramp `1 − exp(−(k+1)/τ)`.
  - The detector proves there are **no unlabelled level shifts** beyond them. Report "detected shifts not explained by a label or event: N".
  - Confirm per-series stability with `breaks_cusumolsresid` p-values on the residuals of the series' fitted model.
- Estimate each step as the ratio of robust means before and after, excluding ±1 month, and store it in the register (`effect_multiplier`).

**(d) BOCPD (optional, originality).**
- A 60-line BOCPD with a Poisson–Gamma model on monthly-equivalent demand could power an "early warning" badge in the dashboard's exception list.
- Only worth it if time allows. Rate it low impact and medium effort.

---

## 3. Unconstraining censored demand under stockouts

### 3.1 State of the art

- **Revenue-management literature.**
  - Expectation-Maximisation (EM) and projection detruncation (PD) are the best single-class unconstraining methods in Weatherford & Pölt's comparison, ahead of booking-profile and naive methods. EM has a rigorous statistical basis; PD is a heuristic variant ([summary in arXiv 1711.10910](https://arxiv.org/pdf/1711.10910); [Georgia Tech comparison](https://repository.gatech.edu/entities/publication/02d562ce-c7ef-4305-9177-49a41fedbc49)).
  - EM performs poorly on small samples, where exponential-smoothing-based approaches do better ([Kourentzes et al. 2017](https://eprints.lancs.ac.uk/id/eprint/88027/1/Kourentzes_2017_Unconstraining.pdf)).
- **Censored-demand forecasting.**
  - Tobit exponential smoothing and a Tobit Kalman filter reduce bias substantially under lost sales ([arXiv 2407.17920](https://arxiv.org/pdf/2407.17920); [IJF 2024](https://econpapers.repec.org/RePEc:eee:intfor:v:40:y:2024:i:3:p:1055-1068); with time aggregation: [arXiv 2409.05412](https://arxiv.org/pdf/2409.05412)).
  - The classic references are Nahmias (1994) and Conrad (1976). The **backorder vs lost-sales** distinction matters: backordered demand reappears later and is not lost ([Pedregal et al. slides](https://itise.ugr.es/PresentacionPDF/ITISE2022_55.pdf)).
  - ML approaches recover latent demand from sales plus an availability mask ([FreshRetailNet-50K](https://arxiv.org/pdf/2505.16319)).
- **Enterprise practice.** Oracle imputes flagged stockout periods from trend and seasonality, using standard median or exponential-smoothing velocities from the periods before and after. Where flags are missing, it derives them with threshold rules on the sales rate ([Oracle](https://docs.oracle.com/cd/E75759_01/pdf/cloud/190/html/user_guide/output/apx_preproc.htm)).

### 3.2 Recommendation: an information hierarchy, where exact beats statistical

Our case is far richer than the RM setting. The stockout file **observes demand directly** (`Requested_Units`) and gives the backorder carry exactly. The stockouts lens reverse-engineered `Shipped = floor(fill × (Req + CarriedIn))`, `Backordered = floor(0.4 × shortfall)` (0 for semiconductor) and `CarriedIn(t) = Backordered(t−1)`, all holding on 100 % of rows. Use, in order:

1. **Listed months:** unconstrained = `Requested_Units`. The following month: subtract `Carried_In`, even when that month is not listed (stockouts-unconstrained). No estimation.
2. **Unlisted months with an arithmetic signature:** a rebound equal to own demand + 0.4 × shortfall. Back-solve exactly; the lens found 105 such cells.
3. **Unlisted structural censoring:** the ELA semiconductor window 2021-03..2022-09, of which only 69.1 % is listed. Impute with the family-wide depth curve × per-series severity, which the lens validated at 5.3 % WAPE and −0.2 % bias. This is a model-based, projection-style imputation, the analogue of PD with known structure.
4. **Statistically undetectable residue:** about 300 random operational stockouts are hidden. Do not impute. State the expected bias in the DQ report: hidden lost units ≈ count × mean shortfall.
5. **EM / Tobit:** cite them as the standard methods and explain why we did not need them. They assume a parametric demand distribution and a known censoring point, which is inventory, and we do not observe inventory. We observe demand itself.

**Validation** (criterion 03):
- **Hide-and-recover:** mask a random 20 % of listed stockout months, rerun the detector and imputer, and report detection recall / precision and imputation WAPE / bias on the hidden cells. Repeat with 5 seeds.
- Show the result in the DQ report and on the dashboard's stockouts view.

---

## 4. Price / units / revenue reconciliation; unit-of-measure and currency errors

### 4.1 State of the art

- Statistical offices detect price errors by comparing each price with a **reference price** and setting fences. The UK ONS's illustration is a 30004 among values of 4, the magnitude jump a decimal or cents error produces ([ONS](https://www.ons.gov.uk/economy/inflationandpriceindices/methodologies/outlierdetectionforrailfaresandsecondhandcarsdynamicpricedata)).
- Scanner-data research models the **log price ratio** as a mixture and sets control limits on it ([arXiv 1912.01832](https://arxiv.org/pdf/1912.01832)).
- Walmart's pricing-anomaly system uses cost and other-channel reference prices to find the *data error behind* a price anomaly ([arXiv 1902.09566](https://arxiv.org/abs/1902.09566)).
- In ERP, unit-of-measure errors come from alternative-unit conversion factors (numerator / denominator to the base unit) ([SAPinsider: 11 common UoM errors](https://sapinsider.org/avoid-these-11-common-unit-of-measure-errors/)).

### 4.2 Recommendation: the "ratio-lattice" classifier

Business rule 4 holds exactly: price per SKU × year, identical across regions, plus the +6 % surcharge in Jul–Dec 2022. The identity also holds to the cent. Error detection is therefore a **lattice-snapping problem**, not a statistical one.

1. Build the canonical price table `P*(sku, year[, surcharge period])` as the robust mode across regions and months (numeric-reconcile).
2. For each row compute three ratios:
   - `r_p = price / P*`;
   - `r_rev = revenue / (units × price)`;
   - `r_u = units / E[units]`, where `E[units]` comes from §1.2 and is used only for ambiguity.
3. Snap `log10 r` to a **finite lattice of candidate multipliers**: {1, 10, 100, 1000, 0.1, 0.01, 12 (dozen), FX rates found empirically (EUR ≈ 0.89 in the Europe OEM 2022-Q1 block)}. Use a tolerance of about 1e-6 relative, since the identity is exact.
4. The **pattern of off-lattice-1 ratios decides which field is wrong**:
   - `r_p = 100` → price in cents. Units are fine.
   - `r_rev = 10` with `r_p = 1` → revenue ×10. **Do not recompute units from revenue.**
   - Revenue and units consistent, units ×10 against the series, and `r_p = 1` → units ×10.
   - `r_p = 10` with units ×0.1 → a pack-of-10 UoM row. Revenue is already correct (dates-dups verify).
5. **Block detection for UoM and currency.**
   - Group rows by scope (region × channel × customer) × month and compute the share of rows carrying the same non-unit multiplier.
   - A contiguous run of months with a high share is a *block*: India AM 2021-H2 pack-of-10, Europe OEM 2022-Q1 EUR, LATAM AM/EXP 2023-03..05 blanking.
   - A true FX block shows the *same* multiplier across all SKUs in the block, while random price typos do not. That is the test separating currency from typo.
   - Apply fixes **row by row**, never to a whole cell or block blindly. The skeptic showed that a blanket ×10 on the India block would inflate revenue tenfold and corrupt 6 non-pack rows.
6. **Guardrails, enforced as tests:**
   - Each rule may touch only its declared field(s).
   - After cleaning, total revenue may change only by the sum of revenue-field fixes.
   - Every fixed row reconciles to the cent.
   - Every fixed unit value matches `Shipped_Units` wherever the stockout file lists the cell. The numeric lens reports 5,761 / 5,761 matched; use this as the **independent oracle**.
7. **Genuine large orders:** rows 4–29× the series level that reconcile perfectly are **real one-offs** (§1.2 step 7). Keep them and register them.

---

## 5. Machine-readable data-quality reporting

### 5.1 What the established tools emit

**Great Expectations.**
- Each expectation result has `success` and `result`. For column-map expectations:
  - `BASIC` returns `element_count`, `missing_count`, `missing_percent`, `unexpected_count`, `unexpected_percent`, `unexpected_percent_nonmissing` and `partial_unexpected_list` (capped at 20).
  - `SUMMARY` adds `partial_unexpected_index_list` and `partial_unexpected_counts`.
  - `COMPLETE` adds `unexpected_list`, `unexpected_index_list` and `unexpected_index_query`.
  - Aggregate expectations return `observed_value` ([GE result format](https://docs.greatexpectations.io/docs/reference/learn/expectations/result_format/)).

**Soda (SodaCL).**
- A check's outcome is pass / warn / fail, or error for an invalid check.
- Scan results can be written to JSON (`-srf`) ([SodaCL overview](https://docs.soda.io/soda-v3/soda-cl-overview); [metrics and checks](https://docs.soda.io/soda-documentation/soda-v3/sodacl-reference/metrics-and-checks)).

**Deequ.**
- Computes *metrics* (completeness, max, correlation, ...) and evaluates *constraints* on them.
- Stores metrics in a **metrics repository** so that anomaly checks can compare a run with history, e.g. a row count up 50 % against the previous run ([AWS: Deequ](https://aws.amazon.com/blogs/big-data/test-data-quality-at-scale-with-deequ); [PyDeequ](https://aws.amazon.com/blogs/big-data/monitor-data-quality-in-your-data-lake-using-pydeequ-and-aws-glue)).

**Data contracts.**
- The Open Data Contract Standard (ODCS v3.x, Bitol / Linux Foundation) attaches `quality[]` rules to schema properties with these fields:
  - `metric` (`nullValues`, `missingValues`, `invalidValues`, `duplicateValues`, `rowCount`);
  - operators `mustBe`, `mustBeLessThan`, `mustBeBetween`, ...;
  - `unit` (rows / percent), `dimension`, `severity`, `businessImpact`.
- Dimensions: accuracy, completeness, conformity, consistency, coverage, timeliness, uniqueness ([ODCS data quality](https://bitol-io.github.io/open-data-contract-standard/latest/data-quality); [repo](https://github.com/bitol-io/open-data-contract-standard); [v3.1 release](https://bitol.io/?p=302)).
- Fowler's framing: a contract is the versioned, machine-readable interface of a dataset (schema, semantics, quality, SLAs, ownership), kept in git and tested in CI ([martinfowler.com](https://martinfowler.com/articles/data-contracts.html)).

**Lineage.**
- OpenLineage attaches facets to runs, jobs and datasets ([object model](https://openlineage.io/docs/spec/object-model)).
- The `dataQualityAssertions` dataset facet lists `{assertion, success, column?, severity?}` ([facet](https://openlineage.io/docs/spec/facets/dataset-facets/data_quality_assertions)). A column-lineage facet maps output columns to input columns.
- OpenRefine records every operation as a replayable JSON history, but excludes single-cell edits. This is the known gap that a **row-level fix log** closes ([Data Carpentry](https://datacarpentry.org/openrefine-socialsci/05-scripts.html); [provenance paper](https://ar5iv.labs.arxiv.org/html/2112.08259)).

**Frictionless validation reports.**
- A top-level `valid` flag, per-table stats, and errors tagged `#table`, `#row` or `#cell`, with `rowNumber`, `fieldName` and `cell` ([Frictionless](https://framework.frictionlessdata.io/docs/guides/validating-data)).

### 5.2 Recommendation

**Do not install GE, Soda or Deequ.**
- Deequ needs Spark.
- GE is a heavy dependency with an extensive API, and the disk has about 7.9 GB free and is shared.
- Judges must run our code locally.

Instead, emit our own JSON that is **shape-compatible** with GE result fields and ODCS rule fields, so the structure is instantly recognisable to a data-engineering judge. The `dq` module is about 200 lines of pandas.

Artefacts, written by `make dq`:

| File | Grain | Purpose |
|---|---|---|
| `outputs/dq/dq_report.json` | run → files → checks and rules | The machine-readable DQ report. The Data health view reads it |
| `outputs/dq/fix_log.parquet` (+ `.csv.gz`) | one row per changed cell (record × field) | Row-level lineage of every fix |
| `outputs/dq/contract_clean_panel.json` | per output table | ODCS-shaped contract: schema plus quality rules with thresholds. The same thresholds drive the tests |
| `outputs/dq/lineage.json` | run | OpenLineage-style run / job / inputs / outputs with SHA-256 hashes, plus a column-lineage map |
| `outputs/manifest.json` | run | Input and output hashes, row counts, package versions, seed, wall time |

**Structure of `dq_report.json`.** Field names follow GE and ODCS. Counts come from the sibling lenses; `<computed>` marks values the pipeline fills in.

```json
{
  "report_version": "1.0",
  "run": {"run_id": "2026-11-24T10:02:11Z-7f3a", "code_version": "git:abc1234 or sha256 of src/",
          "python": "3.12.13", "packages": {"pandas": "3.1", "numpy": "2.5"}, "seed": 42,
          "inputs": [{"file": "data/raw/train.csv", "sha256": "…", "rows": 248248}],
          "duration_s": 41.7},
  "summary": {"files": 6, "checks": 58, "checks_failed_before": 19, "checks_failed_after": 0,
              "rows_raw": 248248, "rows_clean": 244566, "grid_cells": 245548, "missing_cells": 982,
              "cells_changed": "<computed>", "rows_changed_pct": "<computed>",
              "units_delta_total": "<computed>", "revenue_delta_usd_total": "<computed>"},
  "files": [{
    "file": "train.csv", "rows_before": 248248, "rows_after": 244566,
    "issues_by_type": {"duplicate_exact": 2946, "restatement": 736, "date_format_variant": 0, "date_year_typo": 30,
                        "label_variant": 0, "blank_region": 745, "units_x10": 293, "price_in_cents": 614},
    "completeness": {"Units_Sold": {"before": "<computed>", "after": "<computed>"}},
    "checks": [{
      "check_id": "TRN-UNQ-001",
      "expectation_type": "expect_compound_columns_to_be_unique",
      "kwargs": {"column_list": ["Date", "SKU_ID", "Region"]},
      "dimension": "uniqueness", "severity": "error", "business_rule": 2,
      "before": {"success": false, "element_count": 248248, "unexpected_count": 3682, "unexpected_percent": 1.483,
                 "partial_unexpected_index_list": ["CEL-0000123", "…"]},
      "after":  {"success": true,  "element_count": 244566, "unexpected_count": 0, "unexpected_percent": 0.0}
    }]
  }],
  "rules": [{
    "rule_id": "NUM-07", "name": "units_x10", "file": "train.csv", "fields": ["Units_Sold"],
    "class": "data_error", "dimension": "accuracy",
    "detection": "units*P* = revenue/10 and price/P* == 1 and units/E[units] ~ 10",
    "fix": "units := units / 10 (exact)", "code_ref": "src/celeris/clean/numeric.py::fix_units_scale",
    "rows_flagged": 293, "rows_fixed_exact": 293, "rows_imputed": 0, "rows_left": 0,
    "units_delta": "<computed>", "revenue_delta_usd": 0.0,
    "oracle": {"name": "inventory_stockouts.Shipped_Units", "comparable": "<computed>", "matched": "<computed>"},
    "confidence": "high", "examples": ["CEL-0012345", "CEL-0045678"]
  }],
  "anomaly_summary": {"register_rows": 0, "by_class": {"data_error": 0, "real_event": 0, "structural": 0},
                      "impact_units": 0, "impact_revenue_usd": 0},
  "known_limits": ["~300 hidden operational stockouts not detectable; expected under-statement ≈ X units"]
}
```

Design rules:
- **Before and after for every check.** The *before* run is the raw profile: expectation failures there *are* the profiling result. The *after* run must pass. One function evaluates both, which gives the Data health view's before / after directly.
- **Per rule, the counts must add up:** flagged = fixed_exact + imputed + left. Report impact in units and USD, an **oracle** block wherever an independent witness exists, and ≤ 5 example IDs, following GE's capped partial lists.
- **Per file:** issues by type, rows and cells affected, completeness before / after, duplicates before / after. Cover all 6 input files: macro and events checks are small but required ("profile all files").
- **Severity:** `error` blocks the pipeline (the contract is violated after cleaning); `warn` is a known residual risk. These mirror the OpenLineage and Soda semantics.
- **No hand-typed numbers.** The README and slides quote the JSON through a tiny `make report` that renders `dq_report.md` from it.

**Row-level lineage (`fix_log`) schema:**

`fix_id, run_id, step_order, rule_id, file, record_id, raw_row, date, sku, region, field, value_raw (string as read), value_before, value_after, method (exact | derived | imputed | dropped | kept_flagged), evidence (JSON: ratios, witness values), oracle_match (bool or null), confidence`

- Every cleaned table also carries `n_fixes` and a `fix_flags` bitmask column, so the dashboard can show "this cell was corrected by NUM-07" on hover.
- A row dropped by de-duplication appears once, with `method = dropped` and the surviving version's load timestamp as evidence.
- The fix log is **replayable**: applying it to raw must reproduce the clean table exactly. That is a test (§6), and it closes OpenRefine's single-cell gap.

**Contract (`contract_clean_panel.json`):**
- ODCS-shaped: `schema[].properties[]` with `logicalType`, `required`, `unique`, plus `quality[]` rules using `metric` / `mustBe` / `dimension` / `severity`.
- Use JSON, not YAML: PyYAML is not installed, and Python reads JSON natively.
- Example rules:
  - `rowCount mustBe 244566` on `train_clean`;
  - `duplicateValues mustBe 0` on (Date, SKU, Region);
  - `nullValues mustBe 0` on Units_Sold for non-imputed rows;
  - `invalidValues mustBe 0` for Units < 0;
  - a custom rule "revenue = units × P* to the cent".

**Scorecard.** A severity-weighted pass rate per file and dimension (completeness, uniqueness, validity / conformity, consistency, accuracy). Easy to chart, and honest because it is computed from the JSON.

---

## 6. One-command reproducible pipeline and test strategy

### 6.1 State of the art

- **Make vs DVC vs Snakemake.**
  - Make is universally available and enough for small linear pipelines ([practitioner comparison](https://lugarun.github.io/posts/2023-10-09-my-data-science-project-tooling.html)).
  - DVC's `dvc.yaml` declares `cmd / deps / outs / params`, and `dvc repro` reruns only changed stages using `dvc.lock`. It adds data versioning but no public Python API for building workflows ([DVC pipelines](https://dvc.org/doc/user-guide/pipelines/defining-pipelines); [dvc.yaml](https://doc.dvc.org/user-guide/project-structure/dvcyaml-files); [ZnTrack paper](https://arxiv.org/pdf/2401.10603)).
  - Snakemake infers the DAG from input / output file names, with wildcards ([rules](https://snakemake.readthedocs.io/en/stable/snakefiles/rules.html)).
- **Schema validation.** Pandera's `lazy=True` collects all failures into `SchemaErrors.failure_cases` (schema_context, column, check, failure_case, index) and an error report with counts per reason ([lazy validation](https://pandera.readthedocs.io/en/stable/lazy_validation.html); [error report](https://pandera.readthedocs.io/en/latest/error_report.html)). Its schemas can generate Hypothesis strategies ([data synthesis](https://pandera.readthedocs.io/en/stable/data_synthesis_strategies.html)).
- **Property-based testing.**
  - Hypothesis provides `hypothesis.extra.pandas.data_frames()` / `column()` ([strategies](https://hypothesis.readthedocs.io/en/latest/reference/strategies.html)).
  - Typical data invariants are no NaN, keys unique and monotonic order. Property tests complement unit tests rather than replace them ([Clarity AI](https://medium.com/clarityai-engineering/property-based-testing-a-practical-approach-in-python-with-hypothesis-and-pandas-6082d737c3ee)).
  - **Idempotence** (`f(f(x)) == f(x)`) is a core invariant for cleaning and de-duplication ([CASRAI guide](https://casrai.org/guides/property-based-testing)).
- **Golden files.** Compare transform output on a fixed small input with a stored expected file, regenerated deliberately with a flag ([pytest-golden](https://pypi.org/project/pytest-golden); [PySpark golden utils](https://apache.googlesource.com/spark/+/refs/heads/master/python/pyspark/testing/goldenutils.py)).
- **The ML Test Score** (Breck et al., Google): 28 tests across data, model, infrastructure and monitoring. A test earns 1 point if run manually and documented, 2 if automated ([Google Research](https://research.google/pubs/the-ml-test-score-a-rubric-for-ml-production-readiness-and-technical-debt-reduction/)). It is a citable frame for "our pipeline is production-grade".

### 6.2 What is available locally

Checked in `.venv`:
- **Present:** pytest 9.2, pandas, numpy, scipy, statsmodels, statsforecast, scikit-learn, duckdb, polars, pyarrow, and GNU make at `/usr/bin/make`.
- **Absent:** pandera, hypothesis, ruptures, great_expectations, jsonschema, click, PyYAML.

So we recommend **zero new dependencies**:
- an argparse CLI;
- schema checks via a 60-line helper whose spec dict mirrors pandera's (if the team later installs pandera, the specs translate 1:1);
- property tests via a seeded numpy fuzzer.

### 6.3 Recommended pipeline

```
make all        # = make clean-data anomalies features backtest forecast dashboard-data dq test
make clean-data # python -m celeris clean  --raw data/raw --out data/clean
make anomalies  # python -m celeris anomalies
make dq         # python -m celeris dq     -> outputs/dq/*.json, fix_log.parquet, manifest.json
make test       # pytest -q tests/  (fast suite < 60 s; -m slow for the full oracle/backtest checks)
make report     # renders dq_report.md and README numbers from JSON
```

- **Make targets are files** (`data/clean/train_clean.parquet`, ...), so `make` reruns only stale stages, with no DVC needed. Mention DVC or Snakemake in the README as the production path, but do not depend on them.
- **Determinism:**
  - Fixed seeds and sorted outputs.
  - Parquet written with stable row order and no timestamps inside data files.
  - `manifest.json` records the SHA-256 of every output.
  - The test "run twice → identical hashes" proves reproducibility.
- **Raw immutability:** the pipeline asserts that `data/raw/*` hashes are unchanged at the end of every run.

### 6.4 Test strategy: the matrix

| # | Test family | What it asserts (examples on our data) | Data | Runtime |
|---|---|---|---|---|
| T1 | **Contract / schema** (pandera-style helper) | Dtypes; `Units_Sold` non-negative integer; Region ∈ 6 canonical values; channel ∈ 4; SKU pattern `[A-Z]{3}-\d{3}`; dates within 2019-01..2026-10 | clean outputs | s |
| T2 | **Invariants on real outputs** | One row per (Date, SKU, Region); grid = 245,548 cells = 244,566 rows + 982 flagged missing; rev = units × P* to the cent on every non-imputed row; price identical across regions per SKU-year (surcharge excepted); no sales after EOL / before launch, or registered as a reference conflict; zero months on off-phase are zeros, not NaN; missing rows stay NaN, not 0 (rule 3) | full run | 10–20 s |
| T3 | **Oracle tests** | Every exactly-recoverable unit fix equals `Shipped_Units` where listed (5,761 / 5,761); the latest restatement equals Shipped (17 / 17); unconstrained = Requested on listed months | full run | s |
| T4 | **Rule unit tests** (hand-built fixtures, about 10 rows per rule) | Each of the 13 numeric error states, the 7 date formats, label variants, blank region / family recovery, duplicates and restatements. **Adversarial look-alikes**: a ×8 one-off that reconciles must *not* be changed; a pack-of-10 row must keep its revenue; a cents price must not touch units | tiny CSVs in `tests/fixtures/` | ms |
| T5 | **Corruption-recovery property tests** (originality) | Take N clean rows, inject the generator's error types with a seeded fuzzer (×10, ×100, blank, sign flip, cents, EUR block, date-format variant, label variant, year typo, duplicate with later load), run the cleaner, and assert exact recovery for the exact classes and bounded error for imputed ones. Report the recovery rate per error type in the DQ report | synthetic from clean | 5–30 s |
| T6 | **Metamorphic and idempotence tests** | `clean(clean(raw)) == clean(raw)`; shuffling raw row order does not change the output; renaming a label to another known variant does not change the output; the fix log replayed on raw reproduces the clean table | full and sample | s |
| T7 | **Golden-file tests** | A curated about 300-row raw sample covering every state, error and event type → expected clean Parquet, register and DQ JSON in `tests/golden/`; `assert_frame_equal`; regenerate only with `--update-golden` | sample | s |
| T8 | **Detector validation** (hide-and-recover) | Masked stockout months: recall / precision / WAPE above stated floors. Synthetic series with an injected cycle change / level shift / loss: exact-month recall ≥ 95 % and false changes < 1 % on null series. Missing-row decode equals the Record_ID gaps | simulated | 30–60 s, `-m slow` |
| T9 | **Output contract** | Submission has 58,219 rows, keys equal to test.csv, non-negative integers, no blanks; P10 ≤ P50 ≤ P90; the hierarchy adds up; DQ JSON has all required keys (structure test in plain Python, since jsonschema is absent) | outputs | s |
| T10 | **Reproducibility** | Two runs give identical output hashes; raw hashes unchanged | full | as long as the pipeline |

These map onto the ML Test Score data section: schema expectations, invariants, a test of the data pipeline itself, and reproducibility. Say so in the methodology doc, ideally with a small "our ML Test Score" table. It is a cheap, credible signal for criteria 02 and 07.

---

## 7. Anomaly-register design for demand planners

### 7.1 What practice suggests

- **Reason codes are mandatory on planning adjustments.** AWS Supply Chain requires one of a fixed picklist (Promotion, Holiday, Seasonal, New Product, Product Rampdown, Others), with optional free text ([AWS](https://docs.aws.amazon.com/aws-supply-chain/latest/userguide/changing_category.html)).
- **Adjustments carry an audit trail.** PeopleSoft attaches an adjustment reason and comment to each manual change ([Oracle PeopleSoft](https://docs.oracle.com/cd/E13228_01/fscm9pbr0/eng/psbooks/sdpl/htm/sdpl04.htm)).
- **Exceptions are prioritised by impact, with an audit history** ([Manhattan](https://manh.com/solutions/supply-chain-planning-software/demand-forecasting-software/impact-driven-exception-management)).
- **Exceptions are defined by measure, level and threshold** ([Oracle predefined demand-planning exceptions](https://docs.oracle.com/en/cloud/saas/supply-chain-and-manufacturing/25d/faupc/predefined-demand-planning-exceptions.html)).
- **Governance guides recommend storing** the baseline value, the adjusted value, the delta, a picklist reason and the evidence type ([FitGap](https://us.fitgap.com/stack-guides/standardize-forecast-overrides-with-guardrails-and-auditable-evidence)).
- **Gartner notes** that most firms measure forecast error but few act on its root causes ([Gartner](https://www.gartner.com/en/documents/6892666)). A register that links each anomaly to a cause and an action answers exactly that gap.

### 7.2 Recommended design

Use two linked tables:
- an **episode-level register**, one row per anomaly episode, for the planner list and the slides;
- a **cell-level view**, one row per affected series-month, for markers on the dashboard's time series.

They join on `anomaly_id`.

**`anomaly_register.parquet` (episode level):**

| Field | Type | Notes |
|---|---|---|
| `anomaly_id` | str | Deterministic: `ANM-{type_code}-{sku}-{region}-{yyyymm}`, stable across runs so golden tests and dashboard links keep working |
| `anomaly_class` | enum | `data_error` · `real_event` · `structural` · `reference_conflict` · `unexplained` |
| `type_code` | enum | See taxonomy below |
| `shape` | enum | `AO` · `TC` · `LS` · `SLS` · `RAMP` · `BLOCK` (Chen-Liu / X-13 vocabulary, so statisticians recognise it) |
| `scope_level` | enum | cell · series · sku · customer · region×channel · family · global |
| `file`, `sku`, `region`, `family`, `channel`, `customer` | str | Null when the scope is above that level |
| `period_start`, `period_end`, `n_cells` | date, date, int | |
| `detection_method` | str | e.g. `ratio_lattice`, `record_id_grid`, `nb_quantile_residual`, `cycle_template_dp`, `trailing_run_test`, `events_calendar_match` |
| `score`, `p_value` | float | For statistical detectors; null for exact rules |
| `evidence` | JSON str | Ratios, witness values, before / after levels, matched event_id |
| `cause` | str | Human-readable cause, plus `event_id` from events_calendar where matched (e.g. EV-038 Nexon × Europe strike) |
| `observed_units`, `expected_units`, `corrected_units` | float | Over the episode |
| `impact_units`, `impact_revenue_usd` | float | Signed. Data errors: the correction delta. Stockouts: lost and backordered units. Lost accounts: annualised level × price |
| `action` | enum | `FIX_EXACT` · `FIX_IMPUTE` · `UNCONSTRAIN` · `KEEP_FLAG` · `EXCLUDE_FROM_LEVEL` · `MODEL_AS_FEATURE` · `FORECAST_ZERO` · `FORECAST_STEP` · `DOCUMENT_ONLY` |
| `forecast_treatment` | str | What the forecast does with it, e.g. "level step ×0.45 from 2024-05 carried into window" |
| `confidence` | enum + float | high / medium / low, plus a numeric value when available |
| `validated_by` | str | e.g. `stockouts_oracle`, `skeptic_rederivation`, `hide_and_recover` |
| `rule_id` | str | Link to the DQ report rule |
| `status` | enum | `auto` · `confirmed` · `review` |
| `explanation` | str | One-sentence auto-generated text for dashboard tooltips and the planner exception list |

**Taxonomy (`type_code`), seeded from the lens findings:**
- **Data errors:** `DE.DUPLICATE`, `DE.RESTATEMENT`, `DE.DATE_FORMAT`, `DE.DATE_TYPO`, `DE.LABEL_VARIANT`, `DE.BLANK_KEY`, `DE.MISSING_ROW`, `DE.UNITS_BLANK`, `DE.UNITS_SCALE`, `DE.SIGN`, `DE.PRICE_CENTS`, `DE.PRICE_ZEROED`, `DE.REVENUE_SCALE`, `DE.REVENUE_TRANSPOSITION`, `DE.UOM_BLOCK`, `DE.CURRENCY_BLOCK`, `DE.SYSTEM_BLANKING` (ERP migration), `DE.MACRO_*`.
- **Real events:** `RE.ONE_OFF_ORDER`, `RE.STOCKOUT_LISTED`, `RE.STOCKOUT_UNLISTED`, `RE.SEMICONDUCTOR_ALLOCATION`, `RE.BACKORDER_CATCHUP`, `RE.HOLIDAY`, `RE.PREBUY_PRICE_RISE`, `RE.DISRUPTION`, `RE.STRIKE`, `RE.LOGISTICS`, `RE.PROGRAM_STEP`, `RE.REGION_OPENING`, `RE.SURCHARGE`.
- **Structural:** `ST.CUSTOMER_SWITCH`, `ST.LOST_ACCOUNT`, `ST.CYCLE_CHANGE`, `ST.LAUNCH_RAMP`, `ST.EOL_DECLINE`.
- **Reference conflicts:** `RC.MASTER_BU`, `RC.MASTER_LAUNCH`, `RC.SALES_AFTER_EOL`.

**What goes in and what stays out:**
- **Off-phase cycle zeros are not anomalies.** Do not register 35k normal zeros. Report them as structure in the DQ report.
- Pure formatting errors, such as label variants and date formats, are aggregated to **one episode per rule × file** (with counts) rather than one per row. The fix log carries the rows. This keeps the register readable: hundreds of rows, not tens of thousands.

**Prioritisation and presentation:**
- Sort by `|impact_revenue_usd|`.
- The dashboard's Anomaly monitor shows markers by `shape` and colour by `anomaly_class`, with the `explanation` and `action` in the tooltip.
- The exception list (an optional view) filters `real_event` and `structural` episodes that touch the forecast window, such as lost accounts, recent switches and recent cycle changes.
- Two headline numbers belong in the executive summary: lost sales recovered by unconstraining, in units and USD, and the annualised revenue at risk from lost accounts.

---

## 8. Ranked recommendations, pitfalls and criteria mapping

### 8.1 Ranked shortlist (impact on score ÷ effort)

| Rank | Recommendation | Criteria | Effort |
|---|---|---|---|
| 1 | Exact rule engine (Layer A) with ratio-lattice numeric classifier, Record_ID grid keys, row-by-row fixes, stockout oracle | 02, 04 | M (logic already found by the lenses) |
| 2 | `dq_report.json` with before / after per check and per rule, plus `fix_log.parquet` and the manifest; dashboard reads them | 02, 05, 07 | M |
| 3 | Anomaly register (episode and cell level) with cause, action, impact in units and USD, linked to events_calendar ids | 04, 05 | M |
| 4 | Test suite T1–T10 with **corruption-recovery** tests and the oracle; `make all` | 02, 03, 06, 07 | M |
| 5 | Unconstraining by information hierarchy, with hide-and-recover validation | 02, 03, 04 | S–M (lens algorithms exist) |
| 6 | Cycle-template segmentation and trailing-run lost-account test, validated on 27 changes and 16 losses | 03, 06 | S–M |
| 7 | NB randomised-quantile anomaly score (Layer B) for one-offs and the residual sweep, with false-alarm accounting | 03, 06 | M |
| 8 | Level-shift completeness check (exact DP partitioning plus CUSUM test) | 03 | S |
| 9 | ODCS-shaped contract and OpenLineage-style lineage JSON | 06, 07 | S |
| 10 | Isolation-forest series-level sweep (completeness only) and optional BOCPD early-warning badge | 06 | S / M |

### 8.2 Pitfalls to avoid (from the literature and from our skeptic reviews)

1. **Smoothing real events away.** SAS and IBF warn that cleansing destroys signal. Keep one-offs, holidays, strikes and switches in the data and flag or model them.
2. **Seasonal peaks flagged as outliers** (SAP's warning), and here cycle orders flagged as spikes. Never run generic detectors on raw cycle series.
3. **Masking and swamping.** Fit robustly and iterate (tsoutliers, generalised ESD).
4. **Recomputing the wrong field.** When revenue is the corrupt field, units are right. The pack-of-10 rows already have correct revenue.
5. **Cell- or block-level blanket fixes.** Fix row by row and test that no non-target field changes.
6. **Neighbour-median replacement on cycle series** (numeric-reconcile verify). Use model-expected values instead.
7. **Double-counting EOL decline:** measure phase-out factors against the recent level (panel-missing-zeros verify).
8. **Treating missing rows as zeros,** which violates rule 3. Keep them NaN and mark them `DE.MISSING_ROW`.
9. **Unreported residual risk.** State what we cannot detect (hidden operational stockouts) and its expected bias.
10. **Numbers typed by hand into the slides or dashboard.** Everything must come from the JSON and Parquet outputs.

### 8.3 What to show the jury (presentation hooks)

- One slide: *"Every number traces to a raw string."* Click a cleaned cell in the dashboard and show its fix-log lineage (rule, before, after, evidence, oracle match).
- One slide: *"We tested the cleaner against the generator."* Show the corruption-recovery table: injected vs recovered per error type, plus the stockout-oracle match.
- One slide: *"Errors vs events."* Show the §1.3 decision table with counts per class, and the register's top 10 episodes by revenue impact.
- One slide: *"What we cannot know."* Show the residual-risk block from the DQ report.

### 8.4 Coverage of the problem statement (criterion 01)

| Workstream item | Delivered by |
|---|---|
| 1-Core: profile all files, standardise, de-duplicate, one row per Date-SKU-Region | Layer A rules; checks per file in `dq_report.json`; T2 uniqueness |
| 1-Advanced: reconcile units × price = revenue; unit and currency errors; missing rows vs zeros; clean the indicators | Ratio lattice (§4); grid and missing-row decode; macro checks in the DQ report |
| 1-Expert: tested one-command pipeline; machine-readable DQ report | `make all`, T1–T10, §5 artefacts |
| 2-Core: flag outliers, separate errors from real events, anomaly register | §1.3 decision table; §7 register |
| 2-Advanced: structural breaks, early buying, holidays, stockouts, unconstrained demand | §2.2(c); events-calendar matching (`RE.PREBUY_PRICE_RISE`, `RE.HOLIDAY`); §3 |
| 2-Expert: ordering-cycle changes, customer switches, lost accounts, master data vs transactions | §2.2(a)(b); `ST.*` and `RC.*` codes |

---

## Sources

**Outliers and anomaly detection**
- Chen & Liu (1993), JASA: https://doi.org/10.2307/2290724
- `tsoutliers` package: https://search.r-project.org/CRAN/refmans/tsoutliers/html/tsoutliers-package.html
- `tso()` help: https://rdrr.io/cran/tsoutliers/man/tso.html
- Hyndman, *Detecting time series outliers*: https://robjhyndman.com/hyndsight/tsoutliers/
- `forecast::tsclean`: https://search.r-project.org/CRAN/refmans/forecast/html/tsclean.html
- statsmodels MSTL: https://www.statsmodels.org/stable/generated/statsmodels.tsa.seasonal.MSTL.html
- Bandara, Hyndman & Bergmeir (MSTL): https://arxiv.org/abs/2107.13462
- Robust decomposition for seasonal metrics: https://ar5iv.labs.arxiv.org/html/2008.09245
- NIST, modified z-score: https://www.itl.nist.gov/div898/handbook/eda/section3/eda35h.htm
- NIST, generalised ESD: https://www.itl.nist.gov/div898/handbook/eda/section3/eda35h3.htm
- SAS, Hampel identifier: https://blogs.sas.com/content/iml/2021/06/01/hampel-filter-robust-outliers.html
- Hochenbaum et al. (S-H-ESD): https://arxiv.org/abs/1704.07706
- S-H-ESD critique: https://arxiv.org/pdf/1911.05376
- Dunn & Smyth, randomised quantile residuals: https://gksmyth.github.io/pubs/residual.pdf
- Feng et al. 2020, residuals for count data: https://pmc.ncbi.nlm.nih.gov/articles/PMC7329451
- scikit-learn IsolationForest: https://scikit-learn.org/stable/modules/generated/sklearn.ensemble.IsolationForest.html
- Survey of univariate time-series anomaly detection: https://arxiv.org/pdf/2004.00433
- Census, X-13 outlier types: https://census.gov/content/dam/Census/library/working-papers/2013/adrm/jsm2013lytrasfinal.pdf
- Monsell 2007, seasonal outliers: https://apps.bea.gov/icsp/fcsm/assets/docs/2007FCSM_Monsell-II-B.pdf

**Enterprise demand-history cleansing**
- SAP Learning, IBP data cleaning: https://learning.sap.com/courses/mastering-sap-ibp-for-demand/cleaning-data-automatically
- SAP blog, IBP outlier correction: https://blogs.sap.com/2019/03/31/data-cleansingoutlier-correction-methods-in-ibp-demand/
- SAP Learning, AI preprocessing: https://learning.sap.com/courses/discovering-ai-in-sap-integrated-business-planning/understanding-ai-in-demand-planning-preprocessing-1
- Oracle RDF preprocessing: https://docs.oracle.com/cd/E75759_01/pdf/cloud/190/html/user_guide/output/apx_preproc.htm
- Oracle data cleansing: https://docs.oracle.com/cd/E75759_01/pdf/cloud/190/html/user_guide/output/datacleansing_pe.htm
- SAS, *Stop cleansing your historical shipment data*: https://blogs.sas.com/content/sascom/2015/05/26/stop-cleansing-your-historical-shipment-data
- IBF, *Does demand history really need to be cleaned?*: https://ibf.org/knowledge/jbf-articles/does-demand-history-really-need-to-be-cleaned-1144

**Change points, periodicity and intermittency**
- Killick, Fearnhead & Eckley (PELT): https://arxiv.org/abs/1101.1438
- R `changepoint`: https://cran.r-project.org/web/packages/changepoint/refman/changepoint.html
- `ruptures`: https://github.com/deepcharles/ruptures
- `ruptures` paper: https://arxiv.org/pdf/1801.00826
- Truong, Oudre & Vayatis review: https://arxiv.org/abs/1801.00718
- statsmodels `breaks_cusumolsresid`: https://www.statsmodels.org/dev/generated/statsmodels.stats.diagnostic.breaks_cusumolsresid.html
- Empirical guide to multiple change-point tests (2025): https://arxiv.org/pdf/2507.22204
- Kejriwal working paper: https://Krannert.purdue.edu/research/working-papers-series/2017/1303-MohitoshKejriwal.pdf
- Adams & MacKay (BOCPD): https://arxiv.org/abs/0710.3742
- Gundersen, BOCPD walkthrough: https://www.gregorygundersen.com/blog/2019/08/13/bocd/
- Robust and scalable BOCPD: https://arxiv.org/pdf/2302.04759
- AutoPeriod description: https://arxiv.org/pdf/2312.08535
- `periodicity-detection` toolbox: https://github.com/codelionx/periodicity-detection
- RobustPeriod: https://arxiv.org/pdf/2002.09535
- Syntetos, Boylan & Croston (2005): https://eprints.lancs.ac.uk/id/eprint/73095
- Teunter, Syntetos & Babai (TSB): https://dx.doi.org/10.1016/j.ejor.2011.05.018
- `tsintermittent::tsb`: https://search.r-project.org/CRAN/refmans/tsintermittent/html/tsb.html

**Unconstraining censored demand**
- Gaussian processes for demand unconstraining (method comparison summary): https://arxiv.org/pdf/1711.10910
- Georgia Tech comparison of unconstraining methods: https://repository.gatech.edu/entities/publication/02d562ce-c7ef-4305-9177-49a41fedbc49
- Kourentzes et al. 2017: https://eprints.lancs.ac.uk/id/eprint/88027/1/Kourentzes_2017_Unconstraining.pdf
- Tobit exponential smoothing: https://arxiv.org/pdf/2407.17920
- Tobit Kalman filter, IJF 2024: https://econpapers.repec.org/RePEc:eee:intfor:v:40:y:2024:i:3:p:1055-1068
- Tobit with time aggregation: https://arxiv.org/pdf/2409.05412
- Pedregal et al., ITISE 2022 slides: https://itise.ugr.es/PresentacionPDF/ITISE2022_55.pdf
- FreshRetailNet-50K: https://arxiv.org/pdf/2505.16319

**Price, unit and currency errors**
- ONS, outlier detection for dynamic price data: https://www.ons.gov.uk/economy/inflationandpriceindices/methodologies/outlierdetectionforrailfaresandsecondhandcarsdynamicpricedata
- Scanner-data price-change control limits: https://arxiv.org/pdf/1912.01832
- Walmart pricing anomaly detection: https://arxiv.org/abs/1902.09566
- SAPinsider, 11 common UoM errors: https://sapinsider.org/avoid-these-11-common-unit-of-measure-errors/

**Data-quality reporting, contracts and lineage**
- Great Expectations result format: https://docs.greatexpectations.io/docs/reference/learn/expectations/result_format/
- SodaCL overview: https://docs.soda.io/soda-v3/soda-cl-overview
- SodaCL metrics and checks: https://docs.soda.io/soda-documentation/soda-v3/sodacl-reference/metrics-and-checks
- AWS, Deequ: https://aws.amazon.com/blogs/big-data/test-data-quality-at-scale-with-deequ
- AWS, PyDeequ: https://aws.amazon.com/blogs/big-data/monitor-data-quality-in-your-data-lake-using-pydeequ-and-aws-glue
- ODCS data quality: https://bitol-io.github.io/open-data-contract-standard/latest/data-quality
- ODCS repository: https://github.com/bitol-io/open-data-contract-standard
- ODCS v3.1 release: https://bitol.io/?p=302
- Fowler, data contracts: https://martinfowler.com/articles/data-contracts.html
- OpenLineage data-quality assertions facet: https://openlineage.io/docs/spec/facets/dataset-facets/data_quality_assertions
- OpenLineage object model: https://openlineage.io/docs/spec/object-model
- Frictionless, validating data: https://framework.frictionlessdata.io/docs/guides/validating-data
- Data Carpentry, OpenRefine scripts: https://datacarpentry.org/openrefine-socialsci/05-scripts.html
- OpenRefine provenance paper: https://ar5iv.labs.arxiv.org/html/2112.08259

**Pipelines and testing**
- Pandera lazy validation: https://pandera.readthedocs.io/en/stable/lazy_validation.html
- Pandera error report: https://pandera.readthedocs.io/en/latest/error_report.html
- Pandera data synthesis: https://pandera.readthedocs.io/en/stable/data_synthesis_strategies.html
- Hypothesis strategies: https://hypothesis.readthedocs.io/en/latest/reference/strategies.html
- Clarity AI, property-based testing with pandas: https://medium.com/clarityai-engineering/property-based-testing-a-practical-approach-in-python-with-hypothesis-and-pandas-6082d737c3ee
- CASRAI, property-based testing: https://casrai.org/guides/property-based-testing
- pytest-golden: https://pypi.org/project/pytest-golden
- PySpark golden utilities: https://apache.googlesource.com/spark/+/refs/heads/master/python/pyspark/testing/goldenutils.py
- The ML Test Score: https://research.google/pubs/the-ml-test-score-a-rubric-for-ml-production-readiness-and-technical-debt-reduction/
- Practitioner tooling comparison (Make, DVC, Snakemake): https://lugarun.github.io/posts/2023-10-09-my-data-science-project-tooling.html
- DVC, defining pipelines: https://dvc.org/doc/user-guide/pipelines/defining-pipelines
- DVC, dvc.yaml files: https://doc.dvc.org/user-guide/project-structure/dvcyaml-files
- ZnTrack paper: https://arxiv.org/pdf/2401.10603
- Snakemake rules: https://snakemake.readthedocs.io/en/stable/snakefiles/rules.html

**Anomaly register and planning governance**
- AWS Supply Chain, demand plan overrides: https://docs.aws.amazon.com/aws-supply-chain/latest/userguide/changing_category.html
- Oracle PeopleSoft Demand Planning: https://docs.oracle.com/cd/E13228_01/fscm9pbr0/eng/psbooks/sdpl/htm/sdpl04.htm
- Manhattan, impact-driven exception management: https://manh.com/solutions/supply-chain-planning-software/demand-forecasting-software/impact-driven-exception-management
- Oracle, predefined demand-planning exceptions: https://docs.oracle.com/en/cloud/saas/supply-chain-and-manufacturing/25d/faupc/predefined-demand-planning-exceptions.html
- FitGap, forecast override guardrails: https://us.fitgap.com/stack-guides/standardize-forecast-overrides-with-guardrails-and-auditable-evidence
- Gartner: https://www.gartner.com/en/documents/6892666
