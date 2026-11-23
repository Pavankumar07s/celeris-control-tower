# Skeptic review: lens `numeric-reconcile`

**Bottom line.** The numeric diagnosis holds up. I rebuilt it from the RAW files with my own code and got the same state counts, price table, block definitions and stockout validation as the investigator, all exact. **One finding needs a correction that matters for the forecast: the one-off orders (F15).** The count of 438 reproduces exactly, but about 60 of them (14 %) are doubtful. The proposed fix, "replace by the median of the 6 neighbouring orders", gives wrong values when the neighbouring months are themselves constrained or follow a cycle. The worst case sits at the forecast origin: PMP-040 Latin America, 2026-09 and 2026-10. Two smaller corrections apply to F12 (pack-block revenue) and F6 (how stable the imputation bias is). I found no refutations.

**Method.** Scripts: `/home/pavan/Desktop/mks/research/scratch/numeric-reconcile-verify/s00_profile.py … s21_strict_rule.py`.
- They read only `data/raw/train.csv`, `inventory_stockouts.csv`, `sku_master.csv` and `test.csv`.
- Nothing from `research/scratch/numeric-reconcile/` was used, and the rough-clean parquet was not used either.
- Each script parses the raw text itself: 7 date formats, label variants, SKU variants.
- De-duplication keeps the latest `Load_Timestamp`, then recovers Region and fixes the 2062 dates from the Record_ID offset.
- Cached intermediates are small: `s_train.parquet` (11 MB), `s_flags.parquet`, plus CSV summaries.

## Verdict summary

| # | Finding | Verdict |
|---|---|---|
| 1 | Identity exact, 15 mutually exclusive states | **confirmed** |
| 2 | Canonical price table; SKU-specific annual rises | **confirmed** |
| 3 | +6 % surcharge Jul–Dec 2022 | **confirmed** |
| 4 | Zero-row convention, `-` and blank-zero | **confirmed** |
| 5 | Blank units recoverable from revenue/price | **confirmed** |
| 6 | Latin America ERP block (Aftermarket + Export, 2023-03…05) | **confirmed** (imputation bias is year-dependent, see below) |
| 7 | Negative units = sign errors | **confirmed** |
| 8 | Units ×10 / ×100, thousands separators | **confirmed** |
| 9 | Revenue ×10 and digit transpositions | **confirmed** |
| 10 | Price in cents | **confirmed** |
| 11 | Price and revenue zeroed on real orders | **confirmed** |
| 12 | India Aftermarket pack-of-10 block | **partially_confirmed**: one sub-claim about revenue is wrong |
| 13 | Europe Direct OEM EUR block (0.89) | **confirmed** |
| 14 | Stockout validation 5,761/5,761; latest duplicate is the right one | **confirmed** |
| 15 | 438 genuine one-off orders; mask them in training | **partially_confirmed**: about 60 doubtful; the masking rule is unsafe as written |
| 16 | Record_ID encodes series and month | **confirmed** |
| 17 | Pre-buy before the 9 % rise (Tier-1 and Aftermarket only) | **confirmed** |

## Findings in detail

### F1 Identity and 15 states: confirmed
- **Raw text signatures** (s00) are identical to the report:
  - Units: digits 244,127; blank 3,362; `-d` 497; `-` 218; `d,ddd` 44.
  - Price is always `d.d`.
  - Revenue: `d.d` 247,368; negative 497; blank 383.
- **Reconciliation** (s03):
  - Rows with q = 1 that reconcile: 202,735. Removing the 491 negative rows (which also reconcile) leaves 202,244.
  - Maximum |r − u·p| on those rows is 1.16e-10.
  - The smallest discrepancy on any non-reconciling priced row is **$9.00**.
- **States** (s04): I built a 12-flag error signature per row on my own.
  - Every row carries **0 or 1** flag, so the errors never co-occur.
  - Counts: none 237,634 (= 202,244 + 35,390); u_blank 2,947 (= 2,545 recoverable + 402 blank-zero); q100 614; q089 498; u_neg 491; rev10 425; q10 385; u_blank+r_blank 380 (= 332 priced + 48 zero); transposition 312; zeroed price 295; u10 293; dash 217; u100 75.
  - All 15 investigator states reproduce.
- **Totals** (s16) match to the unit and the cent:
  - Naive units 12,030,253 vs corrected 11,723,379.
  - Naive revenue $8,684.43 M vs corrected $8,575.85 M.
  - Phantom units: ×100 adds 376,101 and ×10 adds 145,593. Sign errors shift the total by 2 × 26,439 = 52,878. Blank units hide 142,754.

### F2 Canonical price: confirmed
- The mode per SKU × period gives **4,894 cells for 598 SKUs**. The minimum mode share is 0.571, at PMP-017 2022-H1, exactly as reported.
- Every priced row has q ∈ {1, 100, 10, 0.89}:
  - Exact equality q == 1 on 206,717 rows, == 100 on 614, == 10 on 385.
  - **0 rows** fall in any other class, so there are no regional prices and no stale January prices.
- Annual increases reproduce to 3 decimals (2.001 / 2.511 / 5.019 / 9.026 / 4.472 / 3.710 / 3.752 %).
- Deviation from the announced figure: n 3,750, mean +0.013, SD 0.601, skew 0.01, excess kurtosis −0.10, range −2.31…+1.95.
  - KS against a normal: p = 0.703. A uniform distribution is rejected (p < 1e-4).
  - Largest cross-year |r| = 0.105.
  - Family means sit within ±0.03 pp. That is tighter than the report's ±0.14; the report averages differently.

### F3 Surcharge: confirmed
- Of the 529 SKUs that have 2022-H1, 2022-H2 and 2023 prices, 528 satisfy `H2 = round(H1 × 1.06, 2)` exactly. THM-051 is off by 1 cent (1132.35 vs 1132.34).
- 2023 prices sit +2.85 % above the surcharged H2 price on average, so 2023 is built from the H1 list price.

### F4 Zero rows: confirmed
- There are **0** rows with u = 0 and p > 0, and **0** with u = 0 and r ≠ 0.
- All 217 dash rows have p = 0 and r = 0.
- Blank units with p = 0: 402 have r = 0.0 and 48 have blank r. All 48 are in the Latin America block.
- Shipped_Units = 0 on all blank-zero and dash rows that appear in the stockout file (s05).

### F5 Blank units recoverable: confirmed
- 2,545 rows. r/p is an integer (tolerance 1e-6) on 2,545/2,545, none round to 0, and all have q = 1.
- On the stockout file, the u_blank rows match 83/83: 70 recoverable plus 13 blank-zero.

### F6 Latin America ERP block: confirmed, with a caveat on imputation
- Blank revenue occurs on **380 rows, all Latin America**: 126 / 126 / 128 rows in 2023-03 / 04 / 05.
  - This is 246/246 Aftermarket and 134/134 Export rows.
  - Direct OEM (6 of 586) and Tier-1 (5 of 460) have blank units only, with revenue present. Those are ordinary recoverable rows.
- Latin America row counts per month stay at 470–481. Internal gaps are 0–4 per month around the window, so no rows were deleted.
- The 48 price-0 rows are true zero months. A zero share of 0.126 matches other years' Mar–May zero share for these channels (0.127–0.133).
- **Backtest:**
  - On the investigator's design (2022, 2024, 2025; 1,020 rows) it reproduces exactly: mean ±12 months WAPE 28.9 %, bias −1.1 %.
  - Adding 2021 (1,321 rows) moves the bias to **−5.6 %**. The bias is not stable, which is one more reason to mask these rows in training rather than impute them.
  - My imputed volume is 15,537 units, against the report's ~15,985.

### F7–F11, F13: confirmed
| Finding | Rows | Exact check | Stockout match |
|---|---|---|---|
| F7 sign errors | 491 | 491/491 reconcile with negative u and r | 14/14 |
| F8 units ×10 | 293 | `u = 10·r/p` exact; raw ends in 0: 100 % | 2/2 |
| F8 units ×100 | 75 | exact; raw ends in 00: 100 % | 4/4 |
| F9 revenue ×10 | 425 | revenue inflated $161.92 M | 9/9 |
| F9 transpositions | 312 | 307 adjacent-digit swaps + 5 with a dropped leading zero (all "20…" or "10…", e.g. CEL-0119117 20,948.80 → 2,948.80) | 6/6 |
| F10 cents | 614 | `r = u·p/100` on 614/614 | 11/11 |
| F11 price zeroed | 295 | u > 0, p = 0, r = 0 | 10/10 |
| F13 EUR block | 498 | `p == round(cp × 0.89, 2)` to the cent 498/498; all Europe × Direct OEM in 2022-01 / 02 / 03 (169 / 165 / 164); revenue understated $2.429 M | 48/48 |

Notes:
- Thousands separator (F8): 44 comma rows, of which 25 are ×100, 16 are ×10 and 3 are clean.
- EUR scope (F13): 588 rows. 80 are zero rows; 6 blank with p > 0, 1 negative and 1 cents carry another error.

### F12 Pack-of-10 block: partially_confirmed
Confirmed:
- 385 rows, all India × Aftermarket, 2021-07…12, q == 10 exactly.
- Scope is 462 rows. The only priced rows not in the block are 6 blank-unit rows and 1 ×10 row.
- On the 42 stockout rows, `u_raw = max(1, round(Shipped/10))` holds 42/42.
- Error of `u_raw × 10`: mean absolute 2.45, maximum 5, mean signed +0.60.
- For u_raw = 1, the 17 shipped values run 7–14 with mean 10.9.

Corrected:
- The report says "revenue = units × price is the correct USD amount". It is not.
- On these rows `r = u_raw × p_raw` exactly, which is the revenue of 10·u_raw units at list price. The true quantity was rounded away before revenue was computed, so revenue carries the same ±5-unit error.
- Recompute `revenue = units_fixed × canonical` and flag it approximate. Where Shipped_Units exists, use it for both units and revenue.

### F14 Stockout validation and duplicates: confirmed
- 5,804 of 5,830 stockout rows match a train row.
- Corrected units equal Shipped_Units on every matched row except the 42 pack rows and the single imputed Latin America row (CEL-0226433, shipped 65). That is 5,761/5,761.
- All 26 unmatched stockout rows fall inside their series' date range, so they are deleted rows.
- Duplicates:
  - 3,682 IDs. 2,946 have the same timestamp and are identical in all parsed fields.
  - 736 have a later timestamp (maximum gap 24 days). Of these, 732 restate units and revenue (ratio 0.667–1.8), and price changes 0 times.
  - Both versions reconcile on 736/736.
  - On the 17 restated IDs in the stockout file, Shipped equals the latest version 17/17 and the earliest 0/17.

### F15 One-off orders: partially_confirmed. This is the finding that matters.
Confirmed (s06):
- My own detector reproduces **438** rows (ratio ≥ 4 to the median of the 6 nearest positive orders, and ≥ 30 units above it).
- By channel: Direct OEM 226, Tier-1 193, Export 10, Aftermarket 9.
- Ratio median 5.42, maximum 29. Excess 94,896 units (0.809 %). 8.4 % end in 0. 36 fall in the last 6 months and 68 in the last 12.
- Next-3 / previous-3 median ratio is 1.045, so there is no payback.
- Ratio histogram, nmed ≥ 20: OEM/Tier-1 and Aftermarket/Export have the same distribution up to 3× (88.2 / 9.1 / 1.8 / 0.41 % in both). Above 3.5× only OEM/Tier-1 has extra mass, so the one-off component is real and specific to those channels.
- No pile-up at 10×: 11 rows in [9.5, 10.5] vs 12 in [8.5, 9.5).
- **New supporting evidence the report missed:** 6 one-offs are in the stockout file with Shipped equal to units and Requested above it. Example: CEL-0094127 shipped 912, requested 998. The one-offs are part of latent (requested) demand, not something injected after the supply step.

Problems: the detector produces false positives, and the masking rule fails exactly where it matters.

1. **Backorder catch-up at the forecast origin.** PMP-040 Latin America Direct OEM is flagged in both 2026-09 (141) and 2026-10 (154); neighbour median 33.5.
   - The stockout file has 2026-07: requested 124, shipped 37, backordered 34; and 2026-08: requested 109, carried in 34, shipped 25, backordered 47.
   - So 141 ≈ the month's demand plus 47 back-ordered units. The low "neighbours" (30, 29, 63, 37, 25) are constrained shipments. Before the stockout, the 2025 level was 70–106.
   - Two one-offs in consecutive months is very unlikely at a rate of about 0.27 %.
   - The proposed rule would replace both with 33.5. That is about 3–4× below the requested level of about 110–125, in the last two months of history.
2. **Cyclic big/small series.** Many series (Middle East & Africa above all, plus Latin America) repeat a 3-month pattern of (big, small, 0). Here the median of 6 neighbours mixes big and small orders and understates the level of the "big" months. Examples:
   - PMP-041 MEA 2022-12 = 70, while the big months around it are 26, 38, 67, 56.
   - CSS-068 Latin America Aftermarket 2026-09 = 187, while the same-phase months are 172, 118, 85, **198**, 105, 115.
   - One-off rate per 1,000 positive rows: MEA Direct OEM 6.33 vs 2.0–3.1 in other regions; MEA Aftermarket 2.42 vs 0–0.5.
3. **COVID-adjacent months.** 2020-03 holds the most one-offs of any month (13; mean 4.7). India alone has 6, against a typical rate of about 0.8 per region-month.
   - The 3 "after" neighbours fall in the lockdown dip, which pulls the median down.
   - Examples: CEL-0203512 (ratio to the neighbour maximum 1.11), CEL-0135124 (1.24), CEL-0169433 (1.28), CEL-0148566 (1.54).
   - Masking them deepens the COVID dip in training.
4. **Real level shifts at the series end.** Helios Auto Parts India (EV-052, permanent capacity increase from 2025-09):
   - Post/pre mean-units ratio is 1.24 for its 65 series vs 0.968 for other India series.
   - It has 4 one-offs in the 14 months after the event, against 7 in the 80 months before.
   - PTC-068 India 2026-10 (180) is a series-end candidate in a rising series (…53, 27, 29, 57, 47, 143, 39, 180).

Quantification (s10, s21):
- Ratio to the **maximum** of the 6 nearest orders: below 1.5 for 19 rows, below 2 for 42.
- Ratio to the median of same-phase months (±3, ±6, ±9, ±12): below 2.5 for 42 rows.
- 5 rows follow a back-ordered stockout month.
- A stricter confirmation rule (ratio to neighbour max ≥ 2, same-phase ratio ≥ 2.5, and not after a back-order month) keeps **378 of 438**.
- The **60 doubtful** rows split as follows:
  - Region: India 16, MEA 14, Latin America 14, Asia Pacific 9, Europe 4, North America 3.
  - Channel: OEM 25, Tier-1 19, Aftermarket 8, Export 8. That is 16 of the 19 Aftermarket/Export "one-offs".
  - 13 fall in 2020-01…07 and 5 in the last 6 months.
  - They carry 7,540 excess units.
- List: `research/scratch/numeric-reconcile-verify/s_oneoff_doubtful.csv`.

### F16 Record_ID offset: confirmed
- `rn − month_index` is constant within each of the 3,083 series, and all 3,083 offsets are unique.
- Exactly 30 rows are off by −432; all are dated 2062.
- All 737 blank-region rows are recovered.
- The offset stride is each series' own length: 94 for full series, 58 for MEA, which starts in 2022.
- There are 956 internal missing series-months.
- `Date` agrees with the offset everywhere except those 30 rows, so the 246 rows where the `Month` column disagrees are column errors.

### F17 Pre-buy: confirmed
Matched series with Oct–Mar all present; Dec/Nov ratio for Dec 2022, against a reference of all other transitions (mean ± SD):

| Channel | Dec 2022 / Nov | Reference | Jan 2023 / Nov | Reference |
|---|---|---|---|---|
| Aftermarket | **1.327** | 0.917 ± 0.027 | 0.756 | 0.918 |
| Tier-1 | **1.256** | 0.940 ± 0.015 | 0.661 | 0.875 |
| Direct OEM | 0.849 | 0.899 | – | – |
| Export | 0.838 | 0.794 | – | – |

- Tier-1 Dec + Jan + Feb total: 2.704 vs 2.734, so demand was pulled forward, not created.
- Aftermarket has a net **+8 %** of a November (2.916 vs 2.703 ± 0.062) with no payback in March (1.092). The investigator does not mention this.
- Dec 2021, before the 5 % rise: Tier-1 0.915, Aftermarket 0.890, so no pre-buy then.
- Removing one-offs changes nothing material.
- The uplift appears in every region, including MEA (1.48); Latin America is the weakest (0.94 vs about 0.73 normally).

## Corrections the pipeline must apply
1. **One-offs (F15).**
   - Do **not** apply "replace by the median of the 6 neighbours" to every one of the 438 rows.
   - Detect on the unconstrained series: use Requested where the stockout file has it, and treat `shipped − carried_in` as the month's demand in catch-up months.
   - Require confirmation: ratio to the neighbour max ≥ 2, same-phase ratio ≥ 2.5, and not right after a back-ordered stockout month.
   - Keep (do not mask) the 60 doubtful rows listed in `s_oneoff_doubtful.csv`.
   - For confirmed one-offs, cap at a robust same-phase level instead of the plain neighbour median.
   - In particular, never mask PMP-040 Latin America 2026-09 / 10 to 33.5. Its demand level is about 110–125 (requested 124 / 109 in 2026-07 / 08).
   - Treat series-end candidates in Helios India series after 2025-09 as possible level shifts.
2. **Pack block (F12).**
   - Set `revenue = units_fixed × canonical` and flag it approximate; do not keep the raw revenue as "correct".
   - Use Shipped_Units for both units and revenue on the 42 rows that have it.
3. **Latin America ERP (F6).** Mask the 332 rows in the training target, as proposed. If they are imputed for display, state the bias range (−1 % to −6 % depending on backtest years).
4. **Revenue forecast prices.**
   - 3 planned launches in test have no 2026 price: PMP-020, PTC-029, THM-012 (117 test rows).
   - They need an explicit rule. One option: the predecessor's 2026 price (PMP-003 1265.24, PTC-005 2383.36, THM-001 525.83) × the in-sample successor/predecessor ratio. That ratio's median is about 1.18 over 6 pairs, with a range of 0.99–1.84, so flag it as an assumption.
5. Everything else in the report's cleaning order is safe as written:
   - Rules for F4, F5 and F7–F11, F13 and F14.
   - Precedence: blank / dash / sign first, then the price class, then k.
   - Pipeline test: units equal Shipped on 5,761 rows; pack rows within ±5.

## Missed
- **One-off false positives and the stockout confound** (F15 above). This is the most consequential miss: the detector runs on constrained shipments, so recovery and catch-up months look like spikes.
- **Cycle confound.** A frequent (big, small, 0) 3-month order pattern, strongest in MEA and Latin America, breaks median-of-neighbours outlier tests. Any anomaly rule should compare same-phase months. The cycle and forecasting lenses should model this pattern explicitly.
- **Supporting evidence.** 6 one-offs appear in the stockout file with Requested > Shipped (e.g. CEL-0094127: 998 requested, 912 shipped). One-offs exist in latent demand, so the hidden test truth very likely contains them at the training rate (about 0.27 % of OEM/Tier-1 order months).
- **Aftermarket pre-buy is partly incremental** (+8 % of a November over Dec–Feb 2023, no March payback). Neutralising only Dec 2022 leaves Jan/Feb 2023 depressed. Use an event dummy for each of the three months.
- **Pack-block revenue** is not the true USD amount (F12).
- **Prices for test launches** are missing (correction 4).
- **Unverified pointer for the stockout / events lens:** non-Helios India volume rises to 24,186 in 2026-09 and 26,677 in 2026-10, against about 22,000 typical. Check it against EV-058 (Pune dealer conference, 2026-09) before treating 2026-10 India values as the origin level.

## Not checked
- F6: "128 series, 125 blank in all 3 months".
- F3: the claimed absence of a demand response to the surcharge.
- F15: exact generator parameters for one-off size; I only showed that extra mass starts at about 3.5× in OEM/Tier-1.
