# Skeptic review of lens `macro-indicators` (`research/macro-indicators.md`)

**Bottom line.** The file repairs (F1, F2), the window paths (F3), the family driver sets (F4), the channel structure (F5, F7) and the EV term (F8) hold up when rebuilt from the raw files with new code.

The results that change the forecast need corrections:

- **x1.10 scaling (F6).** It fits only the investigator's own path, whose s was fitted log-linearly on the full sample. If the pipeline re-estimates s together with the cap and a 2021-22 era factor, the calm-era amplitude is 1.00 +- 0.03, and applying x1.10 on top counts the same effect twice.
- **Hard cap at 1.40-1.45 and floor at 0.40 (F6).** The data do not support either. The upward saturation is real, but it is soft, and the floor makes the fit worse.
- **Window hump size (F10).** The size of the hump depends on which path model is used. Five independent variants give a total multiplier of x1.041 to x1.080 in 2026-11 and a window mean of x1.011 to x1.036. The investigator's x1.068 / x1.028 is mid-range. My closest variant reproduces it (x1.064 / x1.027).
- **One driver per SKU (F4).** A pure single-driver SKU path loses to a shrunk 3-driver SKU path in every backtest cell.

**How I checked.** I wrote all code new (`research/scratch/macro-indicators-verify/`). I did not import or read any of the investigator's scripts or artefacts. I built the demand panel myself from `train.csv` and `inventory_stockouts.csv` (`v03_panel.py`):

- latest-load de-duplication;
- Record_ID block offsets for the month and the series;
- units restored from revenue / price for blank, x10, x100, sign and pack-10 rows;
- `Requested_Units` used as demand on listed stock-out cells, and back-order spill removed from the following month;
- the 1,925 unlisted ELA shortage cells masked.

Checks on the panel:
- train units equal `Shipped_Units` on 99.0 % of the 5,804 listed cells;
- 3,083 series;
- the macro analysis uses 2,180 monthly or monthly-with-shutdown series (150,113 cells).

**Two caveats.**
- My paths are not the investigator's BMA, so where numbers differ by a few percent the difference is model uncertainty, not a refutation.
- The backtest (`v14`) uses full-sample seasonal factors, the same leak as the investigator's.

---

## Verdicts

| # | Finding | Verdict | One-line reason |
|---|---|---|---|
| 1 | File structure; R1 duplicate 2022-06 (keep line 44), R2 AUTO 2019 x100, R3 PMI 4.79 -> 47.9, R4 RAW re-based, R5 five blanks | **confirmed** (two wording errors) | All counts reproduce. 47.9 is not "between the neighbours", and the AUTO 2.6 run is in history, not the window. |
| 2 | RAW factor K = 1.25 (range 1.20-1.30) | **confirmed, range narrowed to 1.21-1.26** | The second-difference minimum is at exactly 1.25. Under re-rounding only K = 1.25 or 1.274 fit all 36 cells, which excludes 1.20, 1.22-1.24, 1.26 and 1.30. |
| 3 | Window paths: smooth, no shocks, the stated means and turning points | **confirmed** | Every number in the table reproduces to +-0.01 (sd of changes +-0.08). |
| 4 | SKU-level primary driver from a family set of three; economic sign; about 0.17/sd | **partially_confirmed** | Family sets, sign and size hold. But single-driver paths lose to shrunk 3-driver SKU paths in every backtest cell, so "one driver" must not be imposed. |
| 5 | Integer lag 1-4, SKU property; same in all regions and channels; Aftermarket 0.42x | **partially_confirmed** | Bulk of lags 1-4 and channel/region equality confirmed. 3 SKUs have P(lag 0) > 0.9 and 3 have P(lag 5-6) > 0.9, so "never 0, 5 or 6" is too strong. |
| 6 | Log-linear with cap 1.40-1.45 (floor 0.4); muted 2021-22; x1.10 for the window | **partially_confirmed** | Muting and upward saturation are real. Hard cap and floor are not the best form. x1.10 depends on how the path was fitted (double-counting risk). |
| 7 | Aftermarket = 0.42 x path + FUEL@1 -0.0623/sd | **partially_confirmed** | FUEL@1 is -0.0632 +- 0.0031 (exact). Damping is 0.37 +- 0.015, not 0.42. No fuel effect in 2019-07..2020-12. |
| 8 | EV term: zero lag, ICE -1.16 %/pt, EV +3.64 %/pt, class level | **confirmed** | ICE -1.19, EV +4.15 full sample / +3.74 +- 0.43 on the plateau. Lag 0 is best for both. Log-linear beats linear-in-level. |
| 9 | Backtest: macro path worth 1.1-2.3 cell-WAPE points; SKU paths beat family; x1.10 best | **partially_confirmed** | Path worth 0.8-1.8 points and two thirds of family x month error. SKU-joint beats family at cell level. "x1.10 best" does not hold: gamma 1.0/1.1/1.2 differ by at most 0.0005 cell WAPE and the ranking flips between origins. |
| 10 | Window multiplier: total x1.068 (2026-11) -> x0.999 (2028-05), mean x1.028; PMP/HYD up, ELA/BSS flat | **partially_confirmed** | Direction and shape are robust in all 5 variants. Size: x1.041-1.080 at the start, mean x1.011-1.036. PMP x1.044-1.114, HYD x1.017-1.053. |
| 11 | ELA in the chip shortage is not inflated beyond its drivers | **confirmed (sign), size differs** | My residual against the calm-era path is -0.071 (investigator -0.017). Either way it is not inflated. |
| 12 | Pipeline recipe | **partially_confirmed** | Inherits the corrections to F4, F6 and F10 below. |

---

## Evidence per finding

### F1. File structure and repairs: confirmed (`v01_macro_file.py`)

**Structure.**
- 6,709 bytes, 115 CRLF line endings, no BOM, no whitespace.
- 114 rows x 11 columns. `YYYY-MM` on all rows, and Year/Month agree with Date everywhere.
- 113 distinct months 2019-01..2028-05, none missing.
- Decimal patterns:
  - PMI: `dd.d` x113, `d.dd` x1 (the error);
  - AUTO: `-d.ddd` x12 (all of 2019) and 1-decimal elsewhere;
  - one blank in each of INV, ORD, UTIL, FUEL and EV, at exactly the 5 months listed.

**R1 (duplicate 2022-06).**
- Only PMI (53.9 / 52.7) and ORD (102.9 / 104.3) differ.
- Deviation from the neighbour midpoint:
  - line 43: PMI +1.05, ORD -1.40;
  - line 44: PMI -0.15, ORD 0.00.
- In calm 2022-26, only 7.1 % of months deviate as much as line 43 on PMI, and 3.8 % on ORD.
- Keep line 44: **confirmed**.

**R2.**
- x100 joins smoothly: -3.5, -3.3, -4.9 | -6.4, -9.7.

**R3.**
- PMI 2023-05: robust z of the first difference is -63. x10 is the only factor that fits, and no other cell in any indicator passes a x10 / x0.1 / x100 test.
- One false hit is explained: AUTO 2021-07 = -8.8 only "fits" x0.01 because its neighbours (+15.2, -15.4) average about 0.
- **Wording error:** the repaired 47.9 is *not* between its neighbours 47.2 and 46.1. It sits 0.7 above 2023-04 and is followed by a -1.8 drop. 47.9 is still the right repair: `4.79` has two decimals, which is exactly 47.9 / 10. The impact is nil (one 2023 month).

**R5.**
- Never adjacent, none in the window. 56 changed cells + 1 dropped row = 12 + 1 + 36 + 5 + the 2 differing cells of the dropped row. Reproduced.

**"No other errors".**
- No further decimal shifts.
- Runs of 3 equal values: AUTO 2.6 (**2026-03..05, history**), AUTO 1.8 (2026-12..2027-02) and AUTO 2.4 (2027-09..11). The report says all such runs are in the window, which is wrong for the 2.6 run. It is still rounding, not an error.
- The other large robust z-scores are all 2020 pandemic months, the 2021 AUTO base effect and chip-shortage swing (2021-06/07: -24, -27), RAW 2021-02 (+5.5, a commodity rally inside the re-based segment) and the FUEL 2022 spike. All are economic events.

### F2. K = 1.25: confirmed, range narrowed (`v02_raw_rebase.py`)

| Method | K |
|---|---|
| Polynomial + step in log RAW, degree 1-2, windows 3/4/5/6/8/10/12 months | 1.236 / 1.227 / 1.198 / 1.174 / 1.152 / 1.158 / 1.186 |
| Same, degree 3 | 1.239 / 1.241 / 1.252 / 1.241 / 1.195 / 1.168 / 1.139 |
| Summed absolute 2nd difference of the level, 2021-07..2022-06 | **minimum at 1.25 (20.32)**; flat 1.22-1.26 (20.3-20.7); 1.20 gives 24.9, 1.30 gives 27.8 |
| AR(1) of the log change, one-sided | 1.213 +- 0.022 / 1.217 +- 0.025 |
| Mean of the surrounding 6 / 2 log changes | 1.233 / 1.238 |

**Fingerprint test.** Assume a 1-decimal true value x K, re-rounded to 1 decimal.
- On a 0.0005 grid over K = 1.15-1.35, only **K = 1.25 and K = 1.274** fit all 36 pre-2022 cells.
- Cells inconsistent with other K values: 1.20 has 6 (83.1, 85.5, 87.3, 120.3, 144.3, 143.7 all have 10v ≡ 3 mod 6, which is impossible under K = 1.2); 1.22 has 4; 1.24 has 3; 1.26 has 7; 1.30 has 3.
- 1.25 passes for *any* 1-decimal data: 0.8 x n/10 is always within 0.04 of the 0.1 grid. So the test cannot prove 1.25, but it rules out the nearby alternatives if the generator re-rounds.
- This contradicts the investigator's "not informative" conclusion, although their control (5.9 % of the grid passing) and my control share (0.2 %) both show 1.25 passing trivially.

**Impact.**
- Re-based means: 2019 = 72.0 at K = 1.25 (75.0 at 1.20, 69.2 at 1.30).
- The window RAW values are untouched.
- Only RAW-driven CSS SKUs are affected (24 SKUs have RAW as their best driver in my scan).

### F3. Window paths: confirmed (`v13_window.py`, first block)

My cleaned table reproduces every investigator number:

| Indicator | Last-12-month mean | sd of monthly change (2025-26 / window) |
|---|---|---|
| PMI | 50.21 | 0.47 / 0.20 |
| AUTO | 2.32 | 0.44 / 0.15 |
| INV | 54.93 | 1.40 / 0.74 |
| RAW | 104.22 | 2.17 / 0.87 |
| ORD | 105.17 | 1.12 / 0.59 |
| UTIL | 79.61 | 0.63 / 0.26 |
| FUEL | 90.79 | 3.13 / 1.11 |
| EV | 90.33 | 0.48 / 0.41 |

- The PMI peak is 53.1 in 2027-01, and ORD reaches its minimum of 98.8 in 2027-03.
- UTIL starts at 83.8, above its history maximum of 83.4. That is z = +2.0 against history and **+1.36 sd above the last 12 months**.
- Window start against the last 12 months: PMI +0.52 sd, ORD -0.47 sd, RAW -0.70 sd, INV -0.32 sd, FUEL +0.34 sd.

### F4. Driver structure: partially confirmed (`v04_index.py`, `v05_family.py`, `v06_sku.py`, `v14_backtest.py`)

**Family level.**
- Method: my own family x month index from a fixed-effects model with series, region x moy, channel x moy, family x month and powertrain x month terms; family seasonality removed by ratio to a moving average on calm years.
- Exhaustive search over all 35 three-of-seven driver sets x lags 0..6 (12,005 fits per family).
- Rank of the investigator's set: CSS **1**, THM 3, PMP 4, BSS 7, PTC 8, ELA 9, HYD 27.
- The top-20 fits use the investigator's indicator trio 100 % of the time in BSS, CSS, ELA and PMP, 17 of 20 in THM and 11 of 20 in PTC.
- HYD: PMI and UTIL always; the third driver is ambiguous (INV, FUEL or ORD).
- Lags agree within +-1. My best lags are BSS INV@3-4 (not 2), ELA ORD@3 (not 2) and HYD PMI@3 (not 2).

**SKU level** (single driver, 7 indicators x lags 0..6, on the SKU index):
- 544 SKUs scanned; **311 confident** (gain > 25 and at least 10:1 over the runner-up indicator; investigator 306).
- **301 (96.8 %) have their best driver inside the family set.**
- **309 of 311 have the economic sign.** The 2 exceptions (CSS-072 AUTO@6, PMP-018 INV@5) sit at implausible lags and are misidentifications, not counter-examples.
- |s| per sd: mean 0.185, true sd 0.051, p10/50/90 = 0.123 / 0.177 / 0.251 (investigator 0.173 / 0.042 / 0.119 / 0.166 / 0.235).
- By driver: AUTO 0.168, FUEL 0.188, INV 0.172, ORD 0.214, PMI 0.170, RAW 0.204, UTIL 0.184.
- The finding "same size per sd for every indicator" holds within about +-20 %.

**One driver, or a mixture?**
- In joint 3-driver SKU fits:
  - the sign-aligned coefficients are negatively correlated across SKUs (-0.11 to -0.54 between driver pairs), which is the signature of a dominant primary driver;
  - their true across-SKU sd (0.04 to 0.09) is about as large as the mean, so this is real SKU heterogeneity, not a fixed family mixture;
  - but 4 to 23 SKUs per family have two or three drivers with |t| > 3: BSS 23 of 71, CSS 22 of 73, THM 23 of 66, PMP 15, PTC 12, ELA 7, HYD 4.
- The decisive test is out of sample (`v14`, unbiased arithmetic levels). The pure single-driver path is **worse** than the shrunk 3-driver SKU path in all 4 origin x window cells:

| Origin, level window | Single-driver | Shrunk 3-driver |
|---|---|---|
| 2024-03, W = 12 | 0.2466 | 0.2432 |
| 2024-03, W = 24 | 0.2451 | 0.2417 |
| 2025-03, W = 12 | 0.2491 | 0.2453 |
| 2025-03, W = 24 | 0.2421 | 0.2393 |

- Single-driver is even worse than the family path at 2025-03.
- So the "exactly one driver" reading must not be imposed in the pipeline. The investigator's BMA averages over drivers, which is the right kind of object.

### F5. Lags and channel / region equality: partially confirmed (`v12_channel.py`, `v15_lags_misc.py`)

**Lags** (confident SKUs, lag posterior for the best driver).
- MAP lag counts: 0: 25, 1: 56, 2: 102, 3: 93, 4: 26, 5: 5, 6: 4.
- The posterior exceeds 0.9 for 28 % of SKUs (investigator 33.8 %).
- With posterior > 0.9:
  - lag 0: BSS-068, BSS-078, THM-049;
  - lag 5-6: CSS-072, PTC-059, PTC-064 (the first is a wrong-sign SKU).
- So "1-4, never 0, 5 or 6" is the bulk but not absolute. The impact is small, because every lag reads a known window value.

**Channels.**
- The amplitude on the SKU path (series-demeaned, path fitted on non-Aftermarket cells) is OEM 1.001, T1 1.000, EXP 1.056, AM 0.370.
- R2 peaks at shift 0 for OEM, T1 and EXP; Aftermarket at -1 / 0 (0.0480 / 0.0479).

**Regions.**
- APAC 0.855, EU 0.923, IND 0.885, LATAM 0.937, NA 0.871, MEA 1.193.
- These are channel mixes, since about 17 % of each old region's cells are Aftermarket: 0.83 + 0.17 x 0.37 = 0.89.
- MEA exists only from 2022, which falls in the higher-amplitude calm years.
- No regional effect beyond that: **confirmed**.

### F6. Functional form, era muting, x1.10: partially confirmed (`v08_paths.py`, `v10_form.py`, `v11_gamma_cap.py`)

**Era muting** (pooled gamma of the in-sample path, SKU fixed effects):

| Path | 2019-07..2020-12 | 2021-01..2022-11 | 2023-03..2024-12 | 2025-01..2026-10 |
|---|---|---|---|---|
| Single-driver SKU, log-linear | 1.103 | **0.938** | 1.098 | 1.051 |
| Family 3-driver | 1.040 | **0.959** | 1.172 | 1.120 |

This reproduces the investigator's 0.961 / 1.123 / 1.075.

**Saturation** (311 confident SKUs, 25,178 SKU-months; change in deviance against log-linear):

| Form | No era factor | 2021-22 era factor 0.9 |
|---|---|---|
| cap 1.3 | -232 | -204 |
| cap 1.4 | -225 | **-269** |
| cap 1.45 | -205 | -261 |
| cap 1.5 | -184 | -253 |
| cap 2.0 | -30 | -139 |
| **cap 1.4 + floor 0.4** | -179 (**worse than the cap alone by +45**) | -224 |
| linear-in-level, log(1+u) | -45 | -5 |
| tanh, k = 0.3 to 1.0 | +158 to +2,355 (much worse) | +57 to +2,538 |
| **soft cap: slope 1 below u = 0.25, 0.5 above** | **-264** | **-316** (best) |

What the deviance table shows:
- The upward saturation is real.
- The era factor is still needed on top of the cap (-269 vs -225).
- **The floor is not supported.**
- A soft cap beats every hard cap by 47 or more.

The binned means agree. In 2021-22 the mean log response keeps rising above log 1.45 = 0.372:
- u = 0.51 -> 0.418 (x1.52, about 3 se above the cap);
- u = 0.69 -> 0.495 (x1.64, about 5 se above the cap).

A hard cap would hold the mean at or below the cap. The investigator's own bins (u 0.56 -> 1.547, u 0.75 -> 1.653) show the same thing.

On the negative side the response is *steeper* than log-linear outside 2021-22 (lm -0.80 -> -0.88), so there is no floor.

**Window impact of the form is small.** Only UTIL-driven SKUs reach u = 0.3-0.45 in 2026-11..2027-02. In that range:
- the soft cap gives 0.28-0.35;
- a hard cap at 1.45 gives at most 0.372;
- log-linear gives 0.30-0.45.

That is +-3 % on about 36 UTIL-primary SKUs for about 4 months.

**x1.10 is a property of the investigator's path, not of the generator** (`v11`, 311 confident SKUs, s re-estimated under each form):

| How s is estimated | Mean \|s\| | Gamma 2023-03..24-12 | Gamma 2025-01..26-10 |
|---|---|---|---|
| log-linear, all months | 0.185 | 1.119 | 1.071 |
| cap 1.4, all months | 0.197 | 1.037 | 1.028 |
| **cap 1.4 + 2021-22 era factor 0.9, all months** | 0.207 | **0.999** | **0.989** |
| soft cap + era 0.9 | 0.207 | 1.011 | 0.995 |
| log-linear, fitted on 2023-03..2026-10 only | 0.195 | 0.990 | 1.022 |

- The calm-era excess comes entirely from fitting a linear slope through the muted and saturated 2021-22 cells.
- Applying 1.10 to the investigator's own artefact (log-linear BMA, capped afterwards) is consistent with their calibration.
- But a pipeline that re-estimates s with the cap and an era factor, or on calm years only, must use **gamma = 1.0**. Otherwise the amplitude is inflated by about 10 %, about +0.5 % on the total in 2026-11 and +2 to +4 % on HYD and PMP.

### F7. Aftermarket: partially confirmed (`v12_channel.py`, 12,267 Aftermarket cells in 177 monthly series)

- **Damping:** c = **0.370 +- 0.015**, against 0.42 +- 0.013 in the report. The investigator's 430 series include cycle series.
- **Fuel effect:**
  - FUEL@1: -0.0632 +- 0.0031 per sd; deviance gain 42 RSS units, the best of all candidates;
  - FUEL@0: -0.0624, almost as good;
  - RAW@1, INV@1, PMI@1 and ORD@2 all give smaller gains;
  - control on Direct-OEM cells: FUEL@1 = +0.0017 +- 0.0018, i.e. none.
- **By era:** c / fuel = 0.35 / **-0.009** (2019-07..2020-12), 0.31 / -0.072 (2021-22), 0.35 / -0.081 (2023-26).
  - The fuel effect is absent in the first era, which contradicts "robust in every era".
  - The two eras that matter agree with -0.06 to -0.08.
- **Window impact** of 0.37 vs 0.42: the Aftermarket share of the macro hump changes by about 0.4 % in 2026-11.

### F8. EV term: confirmed (`v07_ev.py`; powertrain x month factor against Universal in the same fixed-effects model)

| Class | Lag 0 | Lag 1 | Lag 2 | Lag 4 |
|---|---|---|---|---|
| ICE | **-1.191 %/pt, R2 0.987** | -1.179 | -1.166 | -1.136 |
| EV (from 2022-05) | **+4.147 %/pt, R2 0.991** | +3.972 | +3.810 | +3.488 |

**Plateau only (2024-12..2026-10).**
- ICE: -2.04 +- 0.33 %/pt.
- EV: **+3.74 +- 0.43 %/pt**, which supports the investigator's +3.64 for the window regime over my full-sample +4.15.

**Functional form for ICE.**
- Log-linear RSS 0.0410.
- Quadratic RSS 0.0402, with a local slope at EV 91 of -1.26.
- Linear-in-level is worse (0.0500).
- So the steep ICE plateau slope is noise or confounding, and -1.16 stands.

**Window factors** with the investigator's betas: ICE 0.960 / 0.952 / 0.991 / 0.982 (mean 0.975), EV 1.135 / 1.169 / 1.029 / 1.059 (mean 1.086). These match the report.

### F9. Backtest: partially confirmed (`v14_backtest.py`, `v14_backtest_arith.csv`)

Setup:
- monthly series, model cells;
- paths refitted on data up to the origin;
- level = mean of de-factored units over the last W months.

| Origin, W | None: cell / family x month | Family path | SKU-joint path (gamma 1.0 / 1.1 / 1.2) |
|---|---|---|---|
| 2024-03, 12 | 0.2529 / 0.0704 | 0.2466 / 0.0236 | 0.2432 / 0.2432 / 0.2433; family x month 0.0303 / 0.0277 / 0.0253 |
| 2024-03, 24 | 0.2509 / 0.0752 | 0.2465 / 0.0256 | 0.2417 / 0.2417 / 0.2420 |
| 2025-03, 12 | 0.2629 / 0.0821 | 0.2458 / 0.0226 | 0.2453 / 0.2448 / 0.2445 |
| 2025-03, 24 | 0.2478 / 0.0570 | 0.2397 / 0.0209 | 0.2393 / 0.2392 / 0.2393 |

What the backtest confirms:
- The macro path is worth 0.8 to 1.8 points of cell WAPE.
- It cuts family x month error by about two thirds.
- SKU-level (shrunk joint) paths beat the family path at cell level by 0.04 to 0.5 points.

What it does not confirm:
- The family path is better at family x month level.
- **"x1.10 is best at both origins" is not reproduced.** Cell differences between gamma 1.0, 1.1 and 1.2 are 0.0005 or less, and the ranking changes with origin and path.
- Gamma is not identified by backtests of this length.

With log-mean levels (`v14_backtest.csv`) every variant is biased by about -3 % to -10 %. The pipeline must use arithmetic (or smeared) levels for unbiased aggregates.

### F10. Window multiplier: partially confirmed (`v08_paths.py`, `v13_window.py`)

Volume-weighted (unconstrained demand 2024-11..2026-10), relative to the last-12-month mean, EV term included:

| Variant | 2026-11 | 2027-01 | 2027-04 | 2027-10 | 2028-05 | Window mean | PMP mean | HYD mean | ELA mean |
|---|---|---|---|---|---|---|---|---|---|
| A: SKU single driver | 1.041 | 1.032 | 1.017 | 1.004 | 0.995 | 1.011 | 1.044 | 1.022 | 0.965 |
| B: family 3-driver, full sample | 1.062 | 1.056 | 1.042 | 1.021 | 0.998 | 1.027 | 1.087 | 1.053 | 0.965 |
| C: family 3-driver, calm-era coefficients | 1.072 | 1.067 | 1.051 | 1.027 | 1.002 | 1.034 | 1.109 | 1.017 | 0.997 |
| **D: SKU joint, shrunk, cap 1.45** | **1.064** | 1.059 | 1.040 | 1.018 | 0.999 | **1.027** | 1.077 | 1.046 | 0.979 |
| D x 1.10 | 1.070 | 1.064 | 1.044 | 1.019 | 0.999 | 1.030 | 1.084 | 1.050 | 0.976 |
| E: SKU joint, calm era only | 1.080 | 1.075 | 1.054 | 1.023 | 1.000 | 1.036 | 1.114 | 1.041 | 0.992 |
| Investigator (x1.10) | 1.068 | 1.059 | 1.040 | 1.019 | 0.999 | 1.028 | 1.088 | 1.047 | 0.982 |

**What is robust.**
- A fading hump that returns to about x1.00 by 2028-05.
- PMP and HYD lead.
- ELA and BSS are flat to down.
- The EV class is x1.09 to x1.11 on average with a peak of about x1.20.
- Without the EV term the total drops by about 0.6 % at the start (A: 1.035 / 1.007).

**What is not robust.** The size of the hump, ±2 points at the start. It hinges on how the weight is split between UTIL (+1.36 sd in the window) and ORD (-0.47 sd), which historically moved together and so are weakly identified.

Window multipliers by primary driver (variant A, mean / 2027-01):
- UTIL x1.108 / x1.253 (x1.205 capped in 2026-11);
- RAW x1.096 / x1.104;
- PMI x1.066 / x1.094;
- AUTO x1.003;
- INV x0.987;
- FUEL x0.966;
- ORD x0.930 / x0.949.

**End of sample.** In 2026-07..10 the actual family indices are 2 % to 9 % above their last-12-month mean. The residual against the path is +0.024 on average across families, within the range of other calm half-years (+0.004 to +0.024). The data at the origin are consistent with the hump starting, and there is no unexplained break.

### F11. ELA during the shortage: confirmed in sign (`v15_lags_misc.py`)

- The ELA index uses listed `Requested_Units` only; the unlisted cells are masked.
- Against the calm-era path (ORD@2, PMI@2, AUTO@3):
  - mean residual -0.071 over 2021-01..2022-11;
  - -0.078 over 2021-03..2022-09, with a maximum of +0.020;
  - -0.004 over 2019-07..2020-12.
- ELA is *below* what its calm-era drivers predict, which is the general saturation in 2021-22. It is not inflated. The investigator's -0.017 is less negative because they used different coefficients.

---

## Corrections the pipeline must apply

1. **Do not stack x1.10 on top of a re-estimated amplitude.**
   - Use `1.10 x lm` only with the investigator's artefact `sku_macro_logmult_final.csv`, which was fitted log-linearly on the full sample.
   - Any path whose s is estimated with the cap and a 2021-22 era factor, or on 2023-03..2026-10 only, must use gamma = 1.0. Its calm-era gamma is 0.99 to 1.01.
   - Record gamma together with the path it calibrates, and never as a global constant.
2. **Drop the 0.40 floor.** It makes the fit worse (+45 deviance against the cap alone).
3. **Saturation.**
   - Keep an upper saturation, but treat a hard 1.45 cap as an approximation.
   - A soft cap (slope 1 up to u = 0.25, then 0.5) fits better by 47 deviance.
   - It only matters for UTIL-primary SKUs in 2026-11..2027-03 (+-3 %).
   - Run the forecast with both and keep the difference as a scenario band.
4. **Do not impose a single driver per SKU.**
   - Use the BMA path or a shrunk 3-driver SKU path.
   - A pure single-driver path loses 0.3 to 0.4 points of cell WAPE in every backtest cell.
5. **Report the window hump as a range, not a point.**
   - Total x1.04 to x1.08 in 2026-11, window mean x1.011 to x1.036.
   - Point estimate about x1.064 / x1.027 (variant D, which matches the investigator).
   - PMP x1.04 to x1.11, HYD x1.02 to x1.05.
   - Use the investigator's artefact for the point forecast, and use the spread between variants for P10/P90 at family level.
6. **Aftermarket damping:** use c = 0.37 to 0.42 (mine 0.370 +- 0.015). The FUEL@1 term (-0.063/sd) is confirmed.
7. **RAW factor:** keep K = 1.25. For sensitivity runs use 1.22 and 1.26, not 1.20 and 1.30: 1.20 fails 6 of 36 cells under re-rounding and gives a visibly worse join.
8. **Levels:** estimate levels as arithmetic means of de-factored units, or apply a smearing correction. A log-mean level biases every variant by -3 % to -10 % at aggregate level (`v14_backtest.csv` against `v14_backtest_arith.csv`).
9. **Text fixes in the report.**
   - F1: PMI 47.9 is above both neighbours, not between them.
   - F1: the AUTO 2.6 run is 2026-03..05 (history).
   - F5: "never lag 0 / 5 / 6" becomes "rarely": 3 + 3 SKUs have posterior > 0.9.
   - F7: the fuel effect is absent in 2019-07..2020-12.
   - F9: "x1.10 best at both origins" is not reproducible; gamma 1.0 to 1.2 are tied within 0.0005 cell WAPE.

## Missed (within this lens)

1. **The calm-era gamma is an artefact of the estimator.** Once s is estimated with the cap and an era factor, the "x1.10" amplitude disappears. This is the main double-counting risk in the forecast.
2. **The window outcome turns on UTIL against ORD.** Over the last 12 months UTIL rises by 1.36 sd and ORD falls by 0.47 sd; history rarely separates the two. That attribution sets the start of the hump to within ±2 % for HYD, PMP and PTC.
   - UTIL-primary SKUs get about x1.22 to x1.25 at the start of the window.
   - ORD-primary SKUs get about x0.93 on average.
   - SKU-level identification of UTIL vs ORD deserves its own check (e.g. a posterior on the driver for the 36 UTIL and 115 ORD SKUs of my scan) before freezing.
3. **The double-rounding fingerprint has some power.** It rules out K = 1.20, 1.22-1.24, 1.26 and 1.30 if the generator re-rounds. Only 1.25 and 1.274 survive.
4. **The negative side is not floored.** It is slightly steeper than log-linear. A symmetric saturation such as tanh is strongly rejected (+158 to +2,355 deviance), so the open question 1 suggestion "refit with a tanh link" should be dropped in favour of a one-sided soft cap.
5. **A plateau-only ICE slope of -2.0 +- 0.3 %/pt** (2024-12..2026-10) is steeper than the full-sample -1.19. A quadratic form gives only -1.26 locally, so keep -1.16. If the plateau slope were right, ICE SKUs would be about 2 % lower over the window. Flag it as an uncertainty for ICE-heavy families (THM, PTC).
6. **Log-retransformation bias in levels** (see correction 8). This affects any pipeline step that averages log demand to form a level.
7. **The end-of-sample data already show the start of the hump** (2026-07..10 actual indices are 2 % to 9 % above the 12-month mean). A 24-month level will partly miss it. This argues for the de-factored level the investigator recommends, not a raw recent level.
8. **RAW 2021-02 jump.** Its robust z is +5.5 (102.0 -> 114.2 on the old base), the second largest RAW move after the re-basing break. I read it as part of the 2021 commodity rally, not an error, but it was not discussed. It only affects RAW-driven CSS sensitivities.

## Scripts and outputs (`research/scratch/macro-indicators-verify/`)

**Data preparation**
- `v01_macro_file.py` -> `macro_raw_numeric.csv`: file structure, error types, duplicate row, runs, decimal-shift tests.
- `v02_raw_rebase.py`: RAW K by polynomial step, second difference, AR(1) and fingerprint.
- `v03_panel.py` -> `vpanel.parquet`: own de-duplicated, unit-repaired, unconstrained panel from raw.
- `v04_index.py` -> `G_fam.csv`, `H_sku.csv`, `PT_factor.csv`, `cells.parquet`, `pflags.parquet`: fixed-effects indices.
- `vlib.py`: shared cleaned macro table and z-scores.

**Driver structure**
- `v05_family.py` -> `v05_family_best.csv`: exhaustive family driver and lag search, era stability.
- `v06_sku.py` -> `v06_sku_scan.csv`: SKU single-driver scan and joint 3-driver dispersion.

**Effects and forms**
- `v07_ev.py`: EV and ICE factors, lag, plateau and functional form.
- `v10_form.py` -> `v10_form.csv`: log-linear / cap / floor / linear-level / tanh / soft-cap comparison.
- `v11_gamma_cap.py`: era gamma when s is estimated with the cap and era factor.
- `v12_channel.py`: channel and region amplitude and lag shift, Aftermarket damping and fuel.

**Window and validation**
- `v08_paths.py` -> `v08_window_multipliers.csv`: era gamma, saturation bins, window variants A, B and C, end-of-sample check.
- `v09_resid_time.py`: family residual by half-year.
- `v13_window.py` -> `v13_window_multipliers.csv`: window paths, variants D and E, multipliers by driver.
- `v14_backtest.py` -> `v14_backtest.csv` (log levels), `v14_backtest_arith.csv` (arithmetic levels).
- `v15_lags_misc.py`: lag posteriors, wrong-sign SKUs, ELA 2021-22.
