# Verification of lens `lifecycle-master` (skeptic review)

Reviewer: independent skeptic. Every number below comes from my own code, run on the raw CSVs. I did not use the investigator's scripts or artefacts. The one exception is that I read `sku_master_clean.csv` to measure the spread of the per-SKU betas it publishes. Scripts are in `research/scratch/lifecycle-master-verify/` (working files, not included in the repository; `v01`–`v19`, shared helpers in `vlib.py`).

**My own cleaning (independent of `train_rough.parquet`).**
- Dedup on Record_ID, keeping the latest Load_Timestamp. Dates and labels parsed again.
- Units: `-` → 0; blank with price 0 → 0; blank with revenue present → revenue/price; `abs()` for sign errors.
- ×10 / ×100 errors fixed only where the price matches the canonical price. India pack rows ×10.
- Stockout rows replaced by Requested_Units.
- One-offs winsorised at 4× the rolling median. 373 flagged; 332 blank units left as unknown.
- Total units come to 11.74 M; the numeric-reconcile lens gets 11.72 M.

Most model checks use a multiplicative Poisson fixed-effects fit (IPF), with these factors:
- series level;
- region × month;
- family × month;
- powertrain × month for EV and ICE (Universal is the reference);
- optional age effects.

## Summary of verdicts

| # | Finding | Verdict | Impact on clean data / forecast |
|---|---|---|---|
| 1 | Record_ID running counter, 982 deleted rows, 30 rows dated 2062, 737 blank regions | **confirmed** | grid / missing-row mask |
| 2 | Series start/end set by master lifecycle dates | **confirmed** | lifecycle mask |
| 3 | Master profile | **confirmed** (trivial: earliest launch 2009-01, not 2009-04) | none |
| 4 | BSS-018 Launch_Date is 4 months late | **confirmed** | 16 rows kept |
| 5 | PMP-004 Business_Unit | **confirmed** | 1 master row |
| 6 | Launch ramp `1-exp(-(k+1)/tau)`, tau about 4.5 | **confirmed**, with two caveats on how to apply it | 18 young + 10 cold-start series |
| 7 | MEA entry ramp, tau 6.25 | **partially_confirmed** (my tau 5.75, weakly identified) | 2022 history only |
| 8 | EOL: last 6 months at a flat ×0.60, no last-time buy | **partially_confirmed**: window and level confirmed, a graded decline fits better than a flat step | 108 test rows |
| 9 | Successors are independent series | **partially_confirmed**: structure reproduced exactly; level-ratio statistics not re-run | 117 rows |
| 10 | Cross-sectional level prior | **confirmed** | cold-start prior |
| 11 | EV shift: zero-lag, log-linear in EV_Adoption_Index | **partially_confirmed**: class-level betas, lag and form confirmed; **per-SKU heterogeneity refuted** | EV 9.8 % and ICE 13 % of volume, plus Universal if per-SKU betas are used |
| 12 | Forecast-window lifecycle calendar and test rows | **confirmed** | 156 post-EOL rows, cold starts |
| 13 | 16 lost accounts | **confirmed** | 304 rows, about 0.7 % of volume |
| 14 | Price is 0.00 exactly when units are 0 | **confirmed** (LatAm count corrected: 380, not 392) | blank-unit recovery |

---

## Finding-by-finding evidence

### F1. Record_ID is a running counter: CONFIRMED (`v02_segments.py`)
- I split the rows into runs of the same SKU with a constant offset `rec − month_index`. This gives exactly **3,083 segments**.
  - Each segment is a unique SKU × Region.
  - No segment has more than one region label, and no SKU × Region pair is split across two segments.
  - So no other row in the whole file has a shifted Date. A shifted Date would break the offset and create an extra segment.
- **IDs:** they run from 1 to 245,548 and **244,566** are present, so **982 are absent**.
  - 956 absent IDs fall inside segments and 26 fall in the gaps between them.
  - Of the 26, 10 are deleted first rows: all 10 "+1 starts" have exactly one free ID before them.
  - The other 16 are deleted last rows: all 16 "−1 ends" have one free ID after them.
- **Closed form:** `start_rec = 1 + Σ earlier block lengths`, with block = `max(launch, 2019-01, 2022-01 for MEA) .. min(EOL, 2026-10)` and BSS-018 from 2025-02. It reproduces the start record of **3,083 / 3,083** series.
- **Missing IDs per year:** 92, 102, 106, 134, 130, 151, 138, 129. That is about 0.4 % of rows each year, i.e. proportional to the row count.
- **2062 dates:** 30 rows have year 2062, and Year = 2026 in all of them. The counter puts all 30 in 2026, with the month agreeing in 30 / 30.
- **Blank regions:** 737 rows, all 737 recoverable from their segment.
- **Extra check (`v18`): the deletions are random with respect to ordering cycles.**
  - Share of missing rows vs share of present rows by series zero-share: 0.485 / 0.475 (monthly), 0.269 / 0.272, 0.101 / 0.086, 0.146 / 0.168.
  - In cyclic series, 84 missing months sit off-phase and 59 on-phase (99 unclear).
  - Only 4 missing rows are in LatAm in 2023-03..05, so the deletions are not the ERP event.
  - Correction to the rule "impute, never zero": see Corrections, item 5.

### F2. Series start/end = master lifecycle: CONFIRMED (`v02`)
- **Start − expected:** 0 for 3,069 series, +1 for 10, −4 for 4 (BSS-018).
- **End − expected:** 0 for 3,067, −1 for 16.
- All 25 Discontinued series end exactly in their EOL month.
- **MEA:** 520 series. 461 start in 2022-01: 459 of their SKUs launched before 2022-01 and 2 launched in 2022-01. The other 59 launched later.
- **Coverage:** 598 SKUs appear in train. The only master SKUs absent are the 3 Planned Launch SKUs (PMP-020, PTC-029, THM-012).
- **Series per region:** India 521, MEA 520, Europe 517, APAC 515, LatAm 511, NA 499.
- **Regions per SKU:** 3 regions for 3 SKUs, 4 for 159, 5 for 178, 6 for 258.

### F3. Master profile: CONFIRMED (`v03_master.py`)
- 601 rows, 601 unique SKUs; family counts as stated. No whitespace or format problems.
- Every description starts with its Size_Class. The 147 form factors each map to exactly one powertrain and one family.
- Status vs dates is consistent for 601 / 601.
- The Status × Powertrain table and the family × powertrain counts match exactly.
- Launch years 2019–2027: 3, 33, 29, 23, 25, 14, 7, 4, 3; 460 SKUs launched before 2019.
- **Only error:** the earliest launch is **2009-01**, not 2009-04 (no impact).

### F4. BSS-018: CONFIRMED (`v04_bss018.py`)
- All 4 series have rows for 2025-02..05, each loaded once, and the load lands in the month after the row's Date (2025-03-01 .. 2025-06-03).
- The price is 285.65, identical to the rest of 2025.
- The values start low and ramp up from 2025-02, e.g. NA 16, 20, 17, 39, 35 …; LatAm 14, 36, 40, 29, 51.
- These rows sit inside the contiguous Record_ID block (F1 closed form). So the generator created the series from 2025-02, and the master date is the error.

### F5. PMP-004 BU: CONFIRMED (`v03`)
- Master says `Power & Drive Systems`.
- Train says `Advanced Manufacturing` in all 534 raw rows (524 after dedup / blanks), and test does too (114 rows).
- It is the only SKU whose train or test BU differs from the master.

### F6. Launch ramp: CONFIRMED, with caveats (`v10_ramp.py`, `v12_ramp_sku.py`, `v11_2019start.py`)

**Shape and tau**
- Non-parametric age effects for 625 launch series, fitted jointly with region × month, family × month and the EV/ICE × month effects (k = 0..13):
  0.17, 0.34, 0.49, 0.59, 0.67, 0.75, 0.79, 0.83, 0.87, 0.83, 0.91, 0.91, 0.91, 0.98. After that, about 1.
- **Best tau = 4.65** with free scale 1.000 (RMSE 0.028).
- Poisson profile likelihood: tau = 4.75 pooled; Universal 4.75 (291 series), EV 4.75 (302), ICE 5.25 (34).
- Alternatives fit worse:

| Form | RMSE |
|---|---|
| Exponential, tau 4.65 | 0.028 |
| Hill | 0.034 |
| Gompertz | 0.035 |
| Best linear `min(1,(k+1)/R)` | 0.074 |

- EV launches follow the same curve once the EV-index effect is in the base: τ 4.75, the same as Universal. That confirms the investigator's claim.

**Backtest** (497 non-MEA series launched 2020-01..2024-11, next 19 months from the first n months)

| n | Bias, mean of history | Bias, ramp-aware with base | Bias, ramp-aware without base | WAPE mean | WAPE ramp + base |
|---|---|---|---|---|---|
| 2 | −73.8 % | −6.6 % | −18.6 % | 0.747 | 0.434 |
| 3 | −67.1 % | −2.7 % | −15.7 % | 0.675 | 0.341 |
| 6 | −52.6 % | +0.2 % | −11.6 % | 0.528 | 0.233 |
| 9 | −43.1 % | +0.3 % | −9.9 % | 0.432 | 0.177 |

This reproduces the investigator's table: −73 / −67 / −53 / −43 and −9 … +1 %.

**Per-SKU tau is mostly noise**
- Per SKU: median 4.75, 10–90 % range 3.5–6.4.
- The mean log-likelihood gain over τ = 4.5 is only 7.6 per SKU. The cyclic orders are strongly over-dispersed, so a gain of that size from one extra parameter is expected even when τ is shared.
- **Split-half test** (regions split at random into two halves, 114 SKUs): the correlation of τ between halves is **0.26** (Spearman 0.25).
- So τ varies a little by SKU, but it cannot be estimated for a series with 3–7 months. The investigator says "medium for per-SKU τ"; I would say low.

**Caveat A: where k starts (missed).**
- The report defines k as "months since series start", and the rule is `ramp = 1-exp(-(k+1)/4.5)`. Applied literally to the 1,997 non-MEA series that start in 2019-01 only because the data window opens then, that rule would put 2019-01 at 0.20.
- **The data show no ramp there:**
  - The 2019-01..06 totals of those series are 95k, 104k, 126k, 121k, 122k, 111k units, so 2019-01 is not at 20 %.
  - The 35 SKUs launched in 2018 (187 series) have age effects of about 1 from product age k = 1 onward: 1.12, 0.99, 1.15, 0.88, 1.05, 1.04 …
- So the ramp applies only to SKUs launched inside the history (Launch ≥ 2019-02; BSS-018 from 2025-02), with k = t − launch, and to MEA entry. It does not apply to series that start in 2019-01, including SKUs launched in late 2018.
- The forecast window is unaffected. Only de-ramping of history is at risk.

**Caveat B: the base adjustment is needed.**
- Without the region/family/EV base, the ramp-aware level is biased by −10 % to −19 % (table above).
- The 3 young EV SKUs (ELA-017, THM-011, PMP-019) also need the EV multiplier.

### F7. MEA entry ramp: PARTIALLY CONFIRMED (`v10` region × month effects)
- **Identification:** all 459 entry series start together, so any model with MEA × month effects absorbs the ramp. My joint age effect is therefore not identified; it comes out at about 1.
- **Indirect estimate:** I took the MEA region × month effect divided by the geometric mean of the other regions, relative to the same calendar month in 2024–2026. For 2022 (k = 0..11) this gives 0.13, 0.36, 0.52, 0.42 (Ramadan), 0.57, 0.60, 0.60, 0.96, 0.67, 0.81, 0.84, 0.98.
- **Best tau = 5.75** (RMSE 0.095), against the investigator's 6.25 and the panel lens's 4.8–5.7.
- The shape and the slower-than-launch speed are confirmed; τ is only known to lie in about 5.5–6.25.
- Mature MEA level ×0.518 vs APAC (F10): confirmed.
- Forecast impact: nil. History impact: only how far 2022 MEA is de-ramped.

### F8. EOL phase-out: PARTIALLY CONFIRMED (`v13_eol.py`)
- **Setup:** 23 of the 25 discontinued series. Two MEA series have no reference period outside MEA's young period.
  - Expected value = series level (from m = 7..30) × region × month × family × month × ICE-index factor × early ramp.
- **Ratio actual / expected by months to EOL, m = 0..8:**

| Series | m0 | m1 | m2 | m3 | m4 | m5 | m6 | m7 | m8 |
|---|---|---|---|---|---|---|---|---|---|
| All 23 | 0.50 | 0.43 | 0.55 | 0.87 | 0.76 | 0.60 | 1.44 | 0.79 | 0.88 |
| 17 monthly-ordering series | 0.32 | 0.53 | 0.61 | 0.78 | 0.81 | 0.79 | 1.07 | 0.85 | 1.09 |

- **3-month buckets (m0–2, 3–5, 6–8, 9–11):** all series 0.50, 0.74, 1.04, 0.92; monthly series 0.49, 0.79, 1.00, 0.97. The investigator has 0.52, 0.67, 0.96, 0.81.
- **Per SKU:** m0–2 ranges 0.32–0.56 and m3–5 ranges 0.58–0.92 (investigator: 0.45–0.58 and 0.52–0.88).
- **Window and level confirmed:** every form is best at W = 6 months. The best flat step is ×0.61 (log-likelihood gain 414.9; the investigator reports 412.7 for ×0.60). No bucket in m 6–23 is above 1.1 on monthly series, so there is no last-time buy.
- **Shape not confirmed:** graded forms beat the flat step.

| Data | Flat step, W = 6 | Linear from 1 at m = 6 | Geometric, W = 6 |
|---|---|---|---|
| All series | 414.9 (×0.61) | 425.4 (to 0.42 at m = 0) | 431.8 (to 0.45) |
| Monthly series only | 270.6 (×0.64) | 353.9 (to 0.38) | — |

  Figures are log-likelihood gains over no decline.
- On the monthly series, the EOL month runs at about 0.32–0.42. A flat 0.60 over-forecasts the EOL month by about 50 % and under-forecasts m = 5 by about 30 %.
- The 6-month total is similar either way: 3.7 for the step and 3.9–4.0 for the graded forms.
- **Impact:** small, about 900 units over 108 rows. It is a free fix.
- **EOL Announced SKUs show no decline yet** (`v16`). Ratio vs 2023-11..2025-10, quarterly through 2026-08..10:
  - PMP-003: 0.97–1.04.
  - THM-001: 0.81–1.41 (noisy).
  - PTC-005: last quarter 0.78 at m = 9..7. It had 0.82 in 2024-11 too, and the monthly values (NA 85, 94; India 154; APAC 35, 43) show no sustained drop. This is noise, so the claim is confirmed.

### F9. Successors: PARTIALLY CONFIRMED (`v14_test_misc.py`, `v17_coldstart.py`)
- **Pair table reproduced exactly** for all 6 historical pairs: predecessor regions, successor regions, common regions, same customer and same channel. For example THM-009 → THM-010 has 5 / 6 / 5 / 2 / 2, and PTC-025 → PTC-027 has 4 / 4 / 2 / 0 / 1.
- **Launch gap:** 2 months before the predecessor's EOL for 4 pairs, 3 months for 5 pairs. Confirmed.
- **The 3 future pairs share no customer and no channel** in any common region (PMP-003 → PMP-020, PTC-005 → PTC-029, THM-001 → THM-012). That strengthens "do not transfer history".
- Predecessor levels in the shared regions are a poor guide, e.g. PTC-005 LatAm 7.7 vs a prior of 41 for PTC-029 LatAm.
- **My cross-sectional prior** (with a smearing factor of 1.133) for the 10 cold-start series is within about ±10 % of the investigator's recommended L in all 10 cases. Examples: PTC-029 APAC 51.7 vs 52; PMP-020 NA 66.9 vs 62; THM-012 Europe 70.3 vs 69.
- **Not re-run:** the level ratios (median 0.93) and the WAPE comparison (prior 0.19 vs predecessor 0.40). They rest on 6 pairs (low confidence, as the investigator says) and affect about 4k units.

### F10. Cross-sectional prior: CONFIRMED (`v15_xsec_levels.py`)
- OLS of log level on region + family + channel + powertrain, 2,812 mature series (2024-11..2026-10, EV-normalised): **R² 0.341**, residual sd 0.50. The investigator has 0.337 and 0.496.
- **Effects:**
  - Region: MEA ×0.518, LatAm ×0.874, NA ×1.066, Europe ×1.045, India ×0.977.
  - Family: THM 0.90, PMP 0.84, CSS 0.775, PTC 0.69, HYD 0.56, ELA 0.52.
  - Channel: Direct OEM 1.11, Tier-1 1.08, Export 0.95.
  - Powertrain: ICE 0.82 vs EV (investigator 0.88).
- Adding Size_Class: R² 0.36.

### F11. EV shift: PARTIALLY CONFIRMED; per-SKU heterogeneity REFUTED (`v08_ev.py`, `v09_ev_sku.py`, `v09b_universal_sku.py`, `v19_universal_drift.py`)

**Class level: confirmed.**
- Non-parametric EV × month and ICE × month effects relative to Universal (mature series, age ≥ 18), regressed on the index (weighted):

| Lag | EV beta | EV wRMSE | ICE beta | ICE wRMSE |
|---|---|---|---|---|
| −1 (lead) | +0.0394 | 0.0514 | −0.0119 | 0.0351 |
| **0** | **+0.0383** | **0.0412** | **−0.0117** | **0.0344** |
| +1 | +0.0367 | 0.0440 | −0.0116 | 0.0349 |
| +3 | +0.0334 | 0.0555 | −0.0112 | 0.0374 |
| +6 | +0.0285 | 0.0794 | −0.0106 | 0.0418 |

  With age ≥ 30: EV +0.0368 and ICE −0.0119, lag 0 again best.
- **Exponential, not power law:** β is constant across periods while a power-law elasticity drifts.

| Group | 2022–23 | 2024–26 | 2024-12..2026-10 (plateau) |
|---|---|---|---|
| ICE β | −0.0133 | −0.0135 | — |
| ICE power-law elasticity | −0.98 | −1.20 | — |
| EV β | 0.0367 | 0.0373 | 0.0398 |
| EV power-law elasticity | 2.76 | 3.33 | 3.62 |

- **Inside the plateau, the EV factor tracks the index:** 1.17 at t = 69 (index 91.7) → 1.03–1.08 at index 88.7–90.0 → 1.25 at 93.1.
- **Shares reproduced:** EV share of units by year 0.0, 0.3, 1.5, 3.1, 6.0, 9.2, 9.9, 9.8 %; ICE 24.1 → 13.0 %.
- **Forecast-window index and multipliers reproduced:**
  - Index: 2026-11 93.8; 2027-01 94.6; 2027-12 90.7; 2028-05 91.9. The last-12-month mean is 90.33.
  - EV multiplier: exp(0.0383 × 3.47) = 1.14 in 2026-11; 1.18 in 2027-01; 1.014 in 2027-12.

**Per-SKU and per-family betas: refuted.**
- The report says the "SKU-level spread is real (standard errors about 0.001 …)". It is not. **Split-half reliability** (regions of each SKU split at random into two halves, β fitted on each half):

| Class | SKUs | Median β | IQR | Split-half correlation | Noise sd per half | Implied true sd |
|---|---|---|---|---|---|---|
| EV | 53 | 0.0380 | 0.0305–0.0450 | **0.06** | 0.018 | ≈ 0.0045 |
| ICE | 86 | −0.0115 | −0.0140 to −0.0086 | **0.12** | 0.006 | ≈ 0.002 |

- Poisson SEs (median 0.002 for EV) understate the real sampling noise about 6–9×, because cyclic orders are over-dispersed.
- **Family betas do not replicate:**
  - Mine: CSS 0.031, THM 0.037, ELA 0.039, PTC 0.042, PMP 0.043, BSS 0.044.
  - Investigator: PMP lowest at 0.034, ELA highest at 0.0445.
  - The order is reversed for PMP.
- **What the investigator's file contains:** `ev_beta_shrunk` in their `sku_master_clean.csv` ranges 0.025–0.053 for EV (sd 0.0052), −0.020 to −0.003 for ICE (sd 0.0033), and **−0.011 to +0.0135 for Universal (sd 0.0036)**.
  - Their shrunk EV betas correlate 0.20 and 0.34 with my two independent half-estimates.

**Universal: "0.0" is a normalisation, not a finding.**
- The time effects are estimated from Universal series, so the Universal class β is zero by construction.
- Per-SKU Universal betas do carry a real SKU component: split-half r = **0.56**, true sd about 0.0046.
- **But it does not behave like an EV-index response or a time trend** (`v19`):
  - I split Universal SKUs into terciles by their 2019–2024-06 slope.
  - Under a continuing trend, the high/low ratio would keep rising by +0.0108 a month, i.e. about +30 % by 2026-10.
  - Instead it rose 0.73 → 1.13 between 2020-H2 and 2023, then stayed flat to falling: 1.07, 1.01, 1.07, 1.06, 1.03 in 2024-H2..2026-H2.
  - In the late period it has no relation to time (slope +0.0007 a month, R² 0.005) or to the index (R² 0.004).
  - It looks like SKU-specific sensitivity to the 2020–2023 macro swings.
- Feeding per-SKU Universal betas × (EV_t − 90.33) into the forecast would add about ±1–2 % of noise, mostly in 2026-11..2027-06, on 77 % of volume.
- The average |EV_t − 90.33| over the window is 2.2 points; at sd 0.0036 that is about 0.8 % multiplier noise on Universal volume.

### F12. Test-window lifecycle calendar: CONFIRMED (`v14`, `v15`, `v16`)
- **Test layout:**
  - 58,219 rows, 3,068 series, 595 SKUs, 0 duplicate keys, all months contiguous.
  - Rows per series: 19 for 3,058 series, 15 for 3, 12 for 4, 8 for 3. The 10 short series start exactly at Launch_Date, and 0 rows fall before launch.
  - **156 rows fall after EOL** (PTC-005 72, PMP-003 54, THM-001 30).
- **Series sets:** 25 train-only series, all Discontinued; 10 test-only.
- **Customer continuity:** the normalised test customer equals the last train customer for 3,058 / 3,058 series, with 0 channel mismatches.
- **EOL SKU levels** (sum over regions, last 12 months): PTC-005 316, PMP-003 317 and THM-001 364 units a month. The investigator has 312 / 312 / 364. Flat forecasts on the post-EOL rows would cost about 8.4k units.
- **Young SKUs** (BSS-012, ELA-017, PMP-019, THM-011): mean of history 330 units a month in total vs a ramp-aware mature level of 702 (EV-90 normalised). The investigator has 330 vs 724.
- **Rows by rule** add up to 58,219.
- **Ramp values reproduced:** PMP-019 0.59, BSS-012 0.67, THM-011 0.79, ELA-017 0.83 in 2026-11.

### F13. 16 lost accounts: CONFIRMED (`v06_zeros_lost.py`, `v06b_zero_pure.py`)
- **Zero runs** (missing and unknown rows break a run): length 3: 8 runs; length 4: 1 run (ELA-026 MEA, in its entry ramp). There are none of length 5–9. Then exactly **16 trailing runs of 10–19 months**, one per series, all on different SKUs, starting 2025-04..2026-01.
  - The investigator's counts differ slightly (3: 9, 4: 1, 5: 1) because blank rows are handled differently. The conclusion is the same: no run longer than 4–5 months has ever recovered.
- **Size:** the pre-loss 12-month means are 29.8–110.8 units a month, **1,010.5 in total**, × 19 = **19,200 units**.
- **Continuity:** all 16 series are in test with 19 rows. The test customer equals the train customer in all 16, and the customer during the zero run is the same as before it.
- **Context:** all 16 onsets fall in the 10 months 2025-04..2026-01. There are none in 2019–2025-03 and none in 2026-02..10, which looks like a generator window placed so the losses are visible. That supports forecasting 0 and expecting no new losses in the test window.

### F14. Price 0.00 exactly when units are 0: CONFIRMED (`v06`, `v14`)
- **Zero rows:** 35,390 rows with units 0, all priced 0.00.
- **Positive rows:** 295 of 205,141 have price 0. I count 205,632 including the 491 sign-error rows.
- **Blank or `-` units:** 3,544 rows. 667 are priced 0 (all 217 dashes are among them); 2,877 have a positive price, and 2,545 of those also have revenue.
- **LatAm 2023-03..05 correction:** 1,426 rows. 391 have blank units, and **380** have blank units *and* blank revenue (not 392). 48 of those 380 are priced 0. 125 series are blank in all three months (confirmed).

---

## Corrections the pipeline must apply

1. **EV betas: use class-level values for every SKU.**
   - EV β = +0.038 per index point.
   - ICE β = −0.0117 per index point (−0.011 is also acceptable).
   - Universal β = 0.
   - All contemporaneous, `exp(β·(EV_t − ref))`.
   - **Do not use `ev_beta_shrunk` / `ev_beta_raw`** from `research/scratch/lifecycle-master/sku_master_clean.csv`. EV and ICE per-SKU spreads are noise (split-half r 0.06 / 0.12). The Universal per-SKU values (−0.011..+0.0135) pick up SKU heterogeneity that does not follow the index.
   - If shrinkage is wanted anyway, the honest settings are prior sd ≈ 0.0045 (EV) and 0.002 (ICE) with sampling sd ≈ 0.013 / 0.004 per SKU. That shrinks each SKU's beta about 90 % (EV) or 80 % (ICE) toward the class mean.
2. **EOL phase-out: use a graded factor instead of a flat ×0.60.**
   - m = 5, 4, 3, 2, 1, 0 → **0.90, 0.81, 0.71, 0.61, 0.52, 0.42** (linear fit, best log-likelihood among the linear forms).
   - The geometric alternative is 0.875, 0.77, 0.67, 0.59, 0.51, 0.45.
   - 1 for m ≥ 6 and 0 after EOL (156 rows, P10 = P50 = P90 = 0).
   - Apply the factor to latent monthly demand before any cycle accumulation.
3. **Ramp scope:**
   - Apply `1 − exp(−(k+1)/4.6)` (τ 4.5–4.75) only to SKUs launched in the history window (Launch ≥ 2019-02; BSS-018 from 2025-02), with k = t − launch.
   - For MEA series of pre-2022 SKUs, use k = t − 2022-01 with τ about 5.75–6.25.
   - **Never** apply it to the series that start in 2019-01 because the data window opens there. That includes the 187 series of 35 SKUs launched in 2018, which show no ramp.
   - Ramp-aware levels must include the region/family/EV base, otherwise they are biased by −10 % to −19 %.
4. **Per-SKU τ:** do not estimate it for young series (split-half r 0.26). Use the pooled τ and shrink the level toward the cross-sectional prior (F10 confirmed).
5. **Missing rows (982):** keep them as missing, never zero, but impute them **phase-aware** from the series' ordering-cycle model.
   - The deletions are random across cycle types, so in cyclic series most missing months are off-phase (84 off vs 59 on).
   - Imputing the series mean into an off-phase month inflates lags and rolling statistics.
6. **Cold-start ×1.10:**
   - It is a mean (smearing) correction; I measured 1.133. Keep it for bias-neutral aggregates and P-ranges.
   - The WAPE-optimal P50 is closer to the median prior (×1.0).
   - Minor: 117 rows.
7. **Small factual corrections:**
   - LatAm ERP blanks: 380 rows have blank units and revenue (391 have blank units), not 392.
   - The earliest master launch is 2009-01.
   - PMP-004 has 534 raw train rows.

## Missed

1. **Per-SKU and per-family EV/ICE betas are noise.** Split-half reliability is 0.06 (EV) and 0.12 (ICE), and the family ordering does not replicate. The investigator's Poisson SE of about 0.001 understates the real noise about 6–9×, so their claim that "SKU-level spread is real" and the per-SKU artefact rest on an invalid SE.
2. **Universal "β = 0" is true by construction**, because the time effects come from Universal series. Per-SKU Universal betas in their artefact are real SKU heterogeneity (r 0.56), but not index-driven and not a continuing trend. In 2024-07..2026-10 the high- vs low-slope terciles show no relation to time or to the index. So: no per-SKU index response for Universal SKUs, and no per-SKU trend extrapolation.
3. **The ramp k-origin trap:** there is no ramp at the 2019-01 window start, including for SKUs launched in late 2018 (age effects of about 1 from product age 1). The report's convention "k = months since series start" would de-ramp 1,997 series wrongly if applied literally.
4. **The MEA entry ramp cannot be identified** separately from MEA × month effects, since all 459 entry series start together. Any model with region × month effects already absorbs it, so do not de-ramp and also fit MEA × month effects on the same months without checking for double counting. My τ estimate is 5.75, not 6.25.
5. **EOL decline is graded** (0.32–0.42 in the EOL month for monthly orderers, about 0.8 at m = 3..5). The report recognised the uncertainty but recommended the flat step.
6. **Deleted rows are random with respect to cycle phase,** so the imputation must be phase-aware rather than set to the series mean (Corrections, item 5).
7. **All 16 lost-account onsets fall inside 2025-04..2026-01,** which looks like a generator placement window. That supports forecasting 0 for them and expecting no new losses in test.
8. **The 3 future successor pairs share no customer or channel** with their predecessors in any common region (0 / 10), which is stronger than the historical 4 / 21 customer matches. Predecessor region levels, e.g. PTC-005 LatAm 7.7 against a prior of about 41, should carry little weight.

## Files (all in `research/scratch/lifecycle-master-verify/`; working files, not included in the repository)

| File | Content |
|---|---|
| `v01_base.py` → `base.parquet` | Dedup / parse base table (5.9 MB) |
| `v02_segments.py` → `segments.csv`, `rec_seg.parquet`, `missing_ids.csv` | Record_ID segments, closed form, 982 missing IDs |
| `v03_master.py`, `v04_bss018.py` | Master profile, BU, BSS-018 |
| `v05_panel.py` → `panel.parquet` | Independent units / demand panel |
| `v06_zeros_lost.py`, `v06b_zero_pure.py` → `zero_runs_ge4.csv`, `lost_accounts_verify.csv` | Zero runs, lost accounts, price identity |
| `v08_ev.py` → `ev_pt_time_age18.csv`, `ev_pt_time_age30.csv` | Non-parametric EV / ICE time effects, lag and form tests |
| `v09_ev_sku.py`, `v09b_universal_sku.py` → `ev_beta_sku_splithalf*.csv` | Per-SKU beta split-half reliability |
| `v10_ramp.py`, `v11_2019start.py`, `v12_ramp_sku.py` → `ramp_age_effects.csv`, `region_time_effects.csv`, `tau_sku_splithalf.csv` | Ramp shape, τ, window-start check, backtest |
| `v13_eol.py` → `eol_series_detail.csv` | EOL curve and parametric fits |
| `v14_test_misc.py`, `v15_xsec_levels.py`, `v16_eola_shares.py`, `v17_coldstart.py`, `v18_missing_random.py`, `v19_universal_drift.py` | Test layout, customers, LatAm, successors, cross-section, EOL-announced levels, shares, cold-start priors, missing-row randomness, Universal drift |
