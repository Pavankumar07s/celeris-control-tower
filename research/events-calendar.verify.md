# Skeptic review of lens `events-calendar`

**Reviewed:** `research/events-calendar.md`.
**Scripts and logs:** `research/scratch/events-calendar-verify/` (working files, not included in the repository; `vp00` and `vc01`..`vc14`, with `logs_vc*.txt`).

## Bottom line

The lens holds up. I rebuilt everything from the raw files with my own code and reproduced every effect that matters for the forecast:
- moving holidays that follow the listed dates (LNY in APAC, Ramadan in MEA);
- the stocking-channel year-end pattern and the 2022-23 pre-buy;
- the Nexon strike (x0.145), the Helios step (x1.24) and the Red Sea shift;
- the ERP blanks (380 = 332 + 48);
- the decoys;
- the window corrections for APAC and MEA, to within 1-3 %.

Nothing is refuted outright. Four things need correcting:
1. **Helios per-series heterogeneity is not reproduced.** The proposed per-series shrink rule (0.57 x own ratio) has no support. Apply one uniform step.
2. **Window uncertainty is understated for months with few holiday days** (APAC 2028-01/02, MEA 2027-03 and 2028-01). The data contain one LNY split year and no Ramadan-free March, so the functional form is not pinned down.
3. **The "four unlisted regional months" are not the complete set.** At least six more region x month cells are stable and >= 5 % off. A full region x month seasonal handles them; a set of named dummies would not.
4. **Small numerical slips:**
   - LNY depth is 0.28, not 0.305.
   - The APAC Jan/Feb base is about 1.0-1.02, not 1.035-1.04.
   - The 259 non-x1.06 surcharge rows are 46 cents errors plus 213 rows of 16 SKUs launched in H2 2022, not "cents-type errors".

## Method

**Independent panel** (`vp00_panel.py`, from `data/raw` only; nothing from `research/scratch/events-calendar/` is used):
- 248,248 raw rows -> 244,566 Record_IDs (latest Load_Timestamp kept), 3,083 series.
- 737 blank regions and 30 `2062-xx` dates recovered from the per-series Record_ID offset (0 series with more than one offset, 0 duplicate keys).
- Own label maps, including fuzzy matching of customer typos.
- Own unit states. They match numeric-reconcile exactly: ok 239,778, blank_rec 2,545, neg 491, blank_zero 450, pack10 385, blank_unknown 332, x10 293, dash 217, x100 75.
- Unconstrained demand = `Requested_Units` on listed stock-out rows (5,804 matched; units = Shipped on 99.4 %), with back-orders removed from the next month.

**Cycle classes** (`vc02`): 1,489 monthly (M) series and 754 A-type series (one fixed zero month a year).

**Effect estimators.** They differ from the investigator's V/F/M:
- (i) Region index `sum y / sum L` on M single-customer series. It is demeaned within region-year over that region's neutral months, minus the median of the 5 old regions per month, with a 200-draw series bootstrap (`vc03`).
- (ii) A two-way log model `z[r,t] = g[t] + a[r,moy] + c[r,yr] + h(days)`. It has 7 holiday functional forms, a leave-one-year-out (LOYO) backtest against a fixed region x month seasonal, and window corrections (`vc04`).
- (iii) Season-normalised channel ratios stratified by region (`vc06`).
- (iv) DiD with series bootstrap for customer and channel events (`vc07`, `vc10`).

## Verdicts

| # | Finding | Verdict |
|---|---|---|
| 1 | Calendar clean; 68 events; real LNY/Ramadan dates | **confirmed** |
| 2 | LNY: 1 - 0.30 x d/10, follows the dates | **partially_confirmed**: depth 0.28; base and split-month form less certain |
| 3 | Ramadan: 1 - 0.30 x d/30, follows the dates | **confirmed** (form uncertain for months with few days) |
| 4a | Fixed regional dips: 2 listed + 4 unlisted, stable | **partially_confirmed**: stable, but more than 4 unlisted |
| 4b | A-cycles map to regions; next month carries 0.5 of the shutdown month | **confirmed** |
| 5 | Price rises on 1 Jan; surcharge exactly x1.06 | **confirmed** (two count slips) |
| 6 | Year-end T1+AM Dec 1.12 / Jan 0.91; 2022-23 pre-buy x1.41 / 0.69 / 0.84 | **confirmed** |
| 7 | Surcharge has no demand effect | not_checked |
| 8 | COVID depths follow the listed region-months, plus a global trough | **confirmed** |
| 9 | ELA: supply-only; requested demand about 1.09 inside EV-019 | **confirmed** |
| 10a | Nexon x Europe x0.145, no catch-up | **confirmed** |
| 10b | Helios x India x1.24, flat; per-series heterogeneity sd 0.16 | **partially_confirmed**: step yes, heterogeneity **refuted** |
| 10c | Orion x NA: no history; x0.15 by analogy | history and counts confirmed; magnitude **not_checked** (unverifiable) |
| 11 | Red Sea: Export x {EU, MEA} only, about 0.62 / 0.62 / 1.61 | **confirmed** |
| 12 | MEA opening ramp 1 - exp(-(k+1)/5.9) | **confirmed** |
| 13 | EV-033: 380 blanks = 332 orders (price > 0) + 48 zeros | **confirmed** |
| 14 | Decoys EV-006/035/043/048/058 | **confirmed** |
| 15 | No hidden demand events | **confirmed** |
| 16 | Window multipliers and corrections | **partially_confirmed**: P50 reproduced; P10-P90 too narrow for months with few days |

## Details

### F1 Calendar: confirmed

`vc01_calendar.py`:
- **Structure.** 68 rows; Start precision 48 month / 20 day; End precision 47 / 20 / 1 blank (EV-052, the only mixed-precision row).
- **Scope_Type.** Region 48, Global 15, Customer 3, Product_Family 1, Channel 1.
- **Event_Type.** Counts identical to the report. No whitespace or label variants. Every Scope_Value exists in train.
- **Customer scopes** in train: Nexon | Europe 4,052 rows, Helios | India 5,521, Orion | NA 5,262.
- **Holiday dates.** All 10 LNY windows are 10 days and all 10 Ramadan windows are 30 days, at the real dates.
- **Window day counts** (`vc01_holiday_days.csv`):
  - LNY: 2027-02 10; 2028-01 6; 2028-02 4.
  - Ramadan: 2027-02 21; 2027-03 9; 2028-01 4; 2028-02 26.
- **Test rows:**
  - APAC 510/510/511/511; MEA 516/517/517/518/518/518.
  - T1+AM 1,466 / 1,466 / 1,472 / 1,472; OEM+EXP 1,592 / 1,592 / 1,596 / 1,596.
  - Orion x NA: 62 series, 62 rows per month (OEM 28, AM 13, T1 12, EXP 9).
  - Helios x India: 65 series, 1,235 rows.

  All identical to the report.

### F2 LNY: partially_confirmed

**The dip follows the listed dates (confirmed).** Region effect vs the median old region (`vc03`, ± is the bootstrap SE):

| | Jan | Feb |
|---|---|---|
| 2023 (LNY 22-31 Jan) | **0.744 ± 0.030** | 0.958 ± 0.024 |
| 2025 (3 + 7 days) | 0.964 ± 0.027 | 0.860 ± 0.021 |

10-day Februaries: 0.710, 0.673, 0.747, 0.715, 0.684. LNY-free Januaries: 1.024, 0.996, 1.032, 0.977, 1.014.

**LOYO backtest of APAC Jan + Feb, 14 cells** (mean abs log error; `vc04`):

| model | MAE |
|---|---|
| fixed region x month seasonal | 0.109 |
| event-share linear (the investigator's form) | 0.039 |
| day-share linear | 0.031 |
| convex `(d/10)^2` | 0.024 |

The holiday rule clearly beats a fixed seasonal.

**Corrections:**
- **Depth.** 0.282 in my two-way fit (event-share form), against 0.305 ± 0.017 claimed. Day-share depth is 0.833 per full month. Window effect is small: 2027-02 multiplier 0.718 vs 0.70.
- **Holiday-free APAC Jan/Feb base.** I cannot reproduce "1.035-1.04". Implied bases are Jan 1.01-1.05 and Feb 0.96-1.07, centred on about 1.0-1.02. Only one LNY-free February exists (2023, 0.958). The 1.035 figure is plausibly inflated by the LATAM January dip (x0.85) in the investigator's control set. Estimate the base; do not hard-code it.
- **Functional form for split months is not identified.** 2025 is the only clean split year, since 2020 is COVID-confounded. Full-sample RSS is essentially tied (event-share 0.1623, day-share 0.1628, convex 0.1636), yet the window multipliers differ:
  - 2028-01 (6 d): linear 0.83-0.84, `sqrt` 0.79, convex 0.90;
  - 2028-02 (4 d): 0.885-0.887, 0.83, 0.956.

  The claimed P10-P90 (0.80-0.84 and 0.87-0.89) is too narrow. Event-share vs day-share differs by at most 1.5 % in the window, which is confirmed.

### F3 Ramadan: confirmed

**Follows the dates.** MEA effect (`vc03`):

| year | Feb | Mar | Apr |
|---|---|---|---|
| 2023 | | 0.898 (9 d) | 0.792 (21 d) |
| 2024 | 1.106 (0 d) | 0.792 (21 d) | 0.882 (9 d) |
| 2025 | | **0.740 (30 d)** | **1.084 (0 d)** |
| 2026 | 0.895 (11 d) | 0.749 (19 d) | 0.999 (0 d) |

Month after Ramadan (May): 1.010, 0.967, 1.041, 0.979, so there is no payback.

**Depth.** 0.297 in event-share form, within the claimed 0.24-0.32.

**LOYO on MEA Feb-Apr, 12 cells:**

| model | MAE |
|---|---|
| fixed seasonal | 0.110 |
| event-share linear | 0.049 |
| day-share | 0.047 |
| `sqrt` | 0.047 |
| saturating | 0.048 |
| convex | 0.097 |
| any-day step | 0.073 |

**Caveat.** The linear forms leave a pattern: 19 days (2026-03) is as deep as 30 days (2025-03). LOYO residuals -0.113 and +0.079. Concave forms fit as well. So months with few days are uncertain:
- 2027-03 (9 d): 0.85-0.91 (claimed 0.89-0.93);
- 2028-01 (4 d): 0.90-0.96 (claimed 0.95-0.97).

**March base.** The implied Ramadan-free March base is 0.93-1.06 (mean about 0.99-1.01) under any of these forms. So all forms agree that 2028-03 needs about x1.14 to x1.26 vs a fixed seasonal. The sign and size of this largest correction are robust.

### F4a Fixed-month regional effects: partially_confirmed

Mean and sd across years (`vc05`; 2020 excluded; my reference is the median of the old regions, which differs from the investigator's t±2,3 months, so levels differ slightly):

| effect | mine (mean, sd) | claimed |
|---|---|---|
| NA July | 0.859, sd 0.014 | 0.832 |
| EU August | 0.645, sd 0.018 | 0.625 |
| APAC October | 0.843, sd 0.028 | 0.808 |
| LATAM January | 0.847, sd 0.028 | 0.848 |
| India June | 0.926, sd 0.020 | 0.905 |
| India October | 1.088, sd 0.023 | 1.082 |

**Missed: further stable region-month effects of at least 5 %:**
- APAC December 1.059 (sd 0.006 over 6 years);
- LATAM February 0.937 and August 1.071;
- India January 1.055 and November 1.054;
- MEA Nov / Dec / Jan 1.07-1.10 (3-4 years).

**These are not channel-mix artefacts.** APAC's T1+AM share among M series is 53 %, against 47-56 % elsewhere. That moves December by under 1 %.

**No Diwali effect (confirmed).** India October is 1.05-1.12 every year, wherever Diwali falls.

The rule "learn the full region x calendar-month seasonality" is correct and sufficient. "Calendar + four unlisted months = complete set" is not.

### F4b A-cycles: confirmed

`vc08`:
- **Region mapping.** A-Aug 141 all Europe; A-Jul 125 all NA; A-Feb 43 all APAC; A-Nov 41 all India. A-Dec, A-Jan and A-Jun are spread over APAC, India, LATAM and MEA.
- **Carry fraction c**, inverse-variance pooled over years:

| group | c (se) |
|---|---|
| EU A-Aug | 0.541 (0.034) |
| NA A-Jul | 0.493 (0.023) |
| APAC A-Feb | 0.471 (0.043) |
| India A-Nov | 0.527 (0.039) |
| other groups | 0.37-0.57 |

- **A-Feb APAC is zero in February every year** (1.00 in 2023, when LNY was in January) and never in January.

### F5 Prices: confirmed, with two count slips

`vc09`:
- Annual changes match the table to 0.001 pp (for example 2023: median 9.032 %, sd 0.616).
- n = 529 SKUs for 2023, not 545.
- 15 of 47,044 SKU-months have a non-modal price.
- **Surcharge.** 13,879 of 14,138 positive-price rows in 2022-H2 are at x1.06. The other 259 split into:
  - 46 cents rows (x106);
  - 213 rows of 16 SKUs that have no 2022-H1 reference price (launched in H2 2022). These are not errors.
- 2023-01 / 2022-12 invoice ratio is 1.0286, against 1.09/1.06 = 1.0283.

### F6 Year-end and pre-buy: confirmed

T1+AM / OEM+EXP, region-stratified, mean of 5 old regions (`vc06`):
- **Ordinary seasons:** Nov 1.006, Dec 1.120 (sd 0.035), Jan 0.907, Feb 0.998.
- **2022/23 relative to ordinary:** Nov 0.982 (no anticipation), Dec 1.416, Jan 0.695, Feb 0.858. Net -0.03 of a month.
- **Every region** shows Dec 1.52-1.66 and Jan 0.59-0.67 in 2022/23.
- **2021/22 January payback missing:** 0.971 (confirmed open question 6).
- **Dose slope** is 0.014-0.018 log per pp, weak (confirmed).
- **Per channel vs all-channel** (ordinary years): T1 Dec 1.01-1.07 / Jan 0.92-0.96; AM Dec 1.03-1.13; OEM Dec 0.92-0.96 / Jan 1.02-1.07. This supports x1.065 / x0.955 vs x0.945 / x1.05.

### F7 Surcharge demand effect: not_checked

Low impact.

### F8 COVID: confirmed

`vc10`, `vc14`:
- **April 2020 ratios vs lockdown-free regions:** India 0.056, Europe 0.247, NA 0.325, LATAM 0.391.
- **APAC:** Feb 0.670, Mar 0.825. APAC Jan 2020 is 0.830, consistent with 7 LNY days.
- **Global path**, 2020 vs the mean of 2019 and 2021: 0.35 (Apr), 0.64 (Jul), 0.88 (Sep), 1.02 (Oct), then 1.09-1.16 in Nov-Dec. The overshoot is confirmed.
- **Caveat.** Jan-Feb 2020 already sit at 0.82-0.84 and 2021-H1 runs at 1.12-1.29 vs 2019/2022. That is macro, so it cannot be cleanly split from COVID.

### F9 ELA: confirmed

`vc12`, M series:
- **Listed cells** (Requested_Units) average 1.097 relative to other families inside EV-019, peaking at 1.24 (2022-01).
- **Unlisted shipped cells** average 0.710, confirming they are constrained.
- **67.9 %** of ELA window cells are listed.
- **ELA year means outside the shortage:** 0.97, 0.89, 0.96, 1.13, 1.06, 1.10. The cause stays ambiguous, as the investigator says.

### F10a Nexon: confirmed

`vc07`, DiD vs 207 other-Europe M series, 22 treated:
- 2023-10 0.145 ± 0.013; 2023-11 0.141 ± 0.015.
- Sep 1.045, Dec 0.891 ± 0.057, Jan 1.026: no catch-up.
- Placebos (Nexon in other regions) are 0.80-1.20, with SEs of 0.05-0.14.
- Small slip: 2 of 44 M-series strike cells are zero (the report says 0).

### F10b Helios: partially_confirmed

**Step confirmed:**
- Pooled 2025-10..2026-10 vs 2024-09..2025-08: **1.246 ± 0.040**.
- Halves: 1.214 (2025-10..2026-03) and 1.264 (2026-04..10). Monthly slope +0.0025 per month, not significant, so keep the level flat.
- 2025-09 is 1.116.
- Placebo one year earlier: 1.029. Helios in other regions: 0.945-0.980.

**Heterogeneity refuted:**
- M series: per-series log(post/pre) variance is 0.0204 for treated (n = 21) vs 0.0194 for controls (n = 165). Excess sd 0.045; bootstrap 90 % CI of the variance difference -0.009..+0.010.
- All cycles: treated sd(log) 0.230 (n = 55) vs control 0.317 (n = 375), so no excess.

The claimed excess sd of 0.16 and the shrink rule `0.57 x own + 0.43 x 1.24` therefore have no support. The own ratio is mostly ordinary series noise and drift.

### F10c Orion: history confirmed, magnitude not_checked

- **No past retooling.** Orion x NA July/August 2019-2026: 0.90-1.14.
- **Share.** 12.2 % of NA and 2.31 % of total demand, so the two window months are about 0.24 % of window volume.
- **Magnitude.** x0.15 rests only on the Nexon analogue. The data cannot verify it.
- **Decision note.** With a two-point prior at 50/50, any value between 0.15 and 1.0 has the same expected absolute error. The claim that "0.15 is optimal unless the prior is below 50 %" holds only if one believes 0.15 with more than 50 %. Expected-loss differences are at most about 0.1 % of window volume.

### F11 Red Sea: confirmed

Export / non-export within region, 2024-01..04 (`vc10`):

| region | Jan | Feb | Mar | Apr |
|---|---|---|---|---|
| Europe | 0.536 ± 0.037 | 0.637 | 1.550 | 0.936 |
| MEA | 0.685 ± 0.035 | 0.657 | 1.611 | 1.035 |
| APAC, India, LATAM, NA | 0.90-1.16 | | | |

The other regions are flat within noise.

### F12 MEA ramp: confirmed

- 0 MEA rows before 2022-01. 458 of 520 MEA series start in 2022-01 (claimed 461, which depends on how missing first rows are counted).
- MEA vs mature level by age: 0.185 (age 0), 0.577 (4), 0.697 (5), 0.704, 0.716, 0.823, 0.874, 0.844, 0.859 (11). The model gives 0.156 ... 0.869.

### F13 EV-033: confirmed

`vc09`:
- 380 rows have both units and revenue blank: Aftermarket 81 / 82 / 83 and Export 45 / 44 / 45 per month (246 + 134).
- 0 such rows outside LatAm 2023-03..05.
- 128 series, 9 customers.
- 332 rows have price > 0 and 48 have price 0.
- Positive rows: 331 of 332 sit in a calendar month that is mostly positive in the same series one or two years either side. Zero rows: 48 of 48 sit in mostly-zero months.
- Ordinary rows: 35,390 zero-unit rows all have price 0; 0 zero-unit rows have price > 0.

### F14 Decoys: confirmed

- **EV-006**, with a COVID-free ±3-month reference: z = +0.54. A 13-month centred reference gives a spurious z = +2.5, because the window reaches 2020-02..04. This is the likely source of the F-method's z = +2.11.
- **EV-043:** z = -0.67. **EV-048:** z = +1.13.
- **EV-035:** APAC / others in 2023-H2 is 1.034, against H2 1.016-1.049 in other years.
- **EV-058, India vs May-Aug:** 2026-09 1.002 against 1.02-1.13 in 2021-25, and 2026-10 1.144 against 1.11-1.20. There is no uplift at the forecast origin.

### F15 Hidden events: confirmed

`vc11`: 8,688 sub-group x month cells (channel, family, customer within region), robust sd of z 1.006.
- 8 cells have |z| >= 4. None forms a cross-group cluster.
- One is an EV-033 artefact (LATAM Export 2023-04).
- Three sit in 2023-01/02, at the pre-buy aftermath.

### F16 Window table: partially_confirmed

Corrections vs a fixed region x month seasonal, from my fit (`vc04_window_corrections.csv`, event-share form, investigator's value in brackets):

| region | month | mine | claimed |
|---|---|---|---|
| APAC | 2027-01 | 1.060 | 1.059 |
| APAC | 2027-02 | 0.919 | 0.926 |
| APAC | 2028-01 | 0.881 | 0.868 |
| APAC | 2028-02 | 1.136 | 1.164 |
| MEA | 2027-02 | 0.805 | 0.812 |
| MEA | 2027-03 | 1.120 | 1.134 |
| MEA | 2027-04 | 1.080 | 1.081 |
| MEA | 2028-01 | 0.949 | 0.960 |
| MEA | 2028-02 | 0.754 | 0.761 |
| MEA | 2028-03 | 1.229 | 1.246 |
| MEA | 2028-04 | 1.080 | 1.081 |

The P50 values reproduce. The intervals for months with few days are too narrow (see F2 and F3).

## Corrections the pipeline must apply

1. **Helios x India:** one uniform step of about x1.24 (1.246 ± 0.040) from 2025-10, with 2025-09 at about x1.12. Rescale pre-step history by 1.24, then use the same level estimator as every other series. **Do not** use the per-series shrink `0.57 x own + 0.43 x 1.24`: per-series dispersion of the step is not above control dispersion. Keep the level flat through the window.
2. **LNY:**
   - Use depth **0.28** (range 0.26-0.30), not 0.305. Event-share and day-share forms are interchangeable.
   - Do not hard-code an APAC Jan/Feb base of 1.035-1.04. Estimate it from holiday-adjusted history (about 1.0-1.02). The February base rests on one year (2023).
3. **Window intervals for months with few holiday days:**

   | scope | month | holiday days | P10-P90 multiplier |
   |---|---|---|---|
   | APAC | 2028-01 | LNY 6 | 0.79-0.90 |
   | APAC | 2028-02 | LNY 4 | 0.83-0.96 |
   | MEA | 2027-03 | Ramadan 9 | 0.85-0.92 |
   | MEA | 2028-01 | Ramadan 4 | 0.90-0.97 |

   Keep the linear P50. Use these intervals for the P10/P90 and the dashboard.
4. **Regional seasonality:** learn the full region x calendar-month profile. Do not use dummies for six named months: APAC December (+6 %), LATAM February (-6 %) and August (+7 %), India January and November (+5 %) and MEA November-January (+7-10 %) are stable too.
5. **Anomaly register text:** the 2022-H2 surcharge exceptions are 46 cents rows. The other 213 rows belong to 16 SKUs launched in H2 2022, are correct, and must not be flagged.
6. **Kept as proposed (verified):**
   - mask T1+AM 2022-12..2023-02;
   - mask Nexon EU 2023-10/11;
   - mask Export EU/MEA 2024-01..03;
   - mask ELA 2021-03..2022-09 for level and seasonality;
   - EV-033: 48 rows become 0, and 332 rows are masked or imputed as positive;
   - A-cycle: zero the shutdown month and add 0.5 x its latent demand to the next month;
   - MEA: divide 2022-23 by the ramp; holidays: divide history by the day-count rule and re-apply it with the window day counts.

## Missed

1. **Holiday functional form is the main remaining uncertainty.** It is not negligible for split or small-day months. LOYO even prefers a convex LNY form (MAE 0.024 vs 0.039 linear), driven by one year. The Ramadan linear form leaves 19 days as deep as 30 days. Both rest on 1-2 informative years. This changes APAC 2028-01/02 and MEA 2027-03 / 2028-01 by 5-10 %.
2. **More stable region-month effects than the four named** (see Correction 4). The report's "complete demand-event set" wording would mislead a dummy-based implementation.
3. **The EV-006 z near +2 under method F is a COVID-window artefact** of a wide centred reference, not a near-significant rebrand effect.
4. **Orion decision framing.** Under a 50/50 prior, any multiplier in [0.15, 1.0] has equal expected absolute error. An intermediate value (about 0.3-0.4) minimises the worst case at no cost in expected error. The choice is prior-driven; the total exposure is about 0.24 % of window volume.
5. **The global 2020 path is confounded with macro.** Jan-Feb 2020 already run at 0.82-0.84 of the 2019/2021 average before any lockdown, and 2021-H1 runs at 1.12-1.29. Masking 2020-01..09 is correct, but the size of the "global COVID trough" cannot be separated from the macro path inside this lens.
