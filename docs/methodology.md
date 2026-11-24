# Methodology

This document explains the method end to end, for the jury. It covers how we framed the problem, what the data forensics
found, how the data was cleaned and audited, how anomalies and unconstrained demand were handled, how the forecast was
built and validated, what the results are, and what they mean for a planner.

Every number here is read from a pipeline output, and the source file is named. Detail lives elsewhere and is linked,
not repeated:

- [`modelling.md`](modelling.md): every experiment, ablation, slice and calibration table of the forecast;
- [`architecture.md`](architecture.md): stage contracts and output schemas;
- [`../research/DATA_DOSSIER.md`](../research/DATA_DOSSIER.md): the forensic evidence behind each rule (cited as
  "dossier x.y").

**Terms.**

- A *series* is one SKU in one region. History has 3,083 series and the forecast window has 3,068.
- A *cell* is one series in one month.
- *Shipped units* are what the ERP recorded. *Unconstrained demand* is what customers requested; it differs from shipped
  units only when supply ran short.
- *Latent demand* is the monthly-equivalent demand of a series, before it is grouped into orders.
- An *ordering cycle* is the calendar pattern on which a customer orders. An *on-phase* month is one in which the cycle
  places an order, and an *off-phase* month is one in which it does not.
- A *structural zero* is a forecast row that must be 0 by rule.
- *WAPE* is Σ|actual − forecast| / Σ actual, and *bias* is Σ(forecast − actual) / Σ actual. Both are computed over the
  cells of a selection, never as an average of per-series values.
- An *origin* is the last month of data a backtest forecast may use. A *fold* is one origin together with the 19 months
  forecast from it.

---

## 1. Problem framing and approach

The brief asks for four things: clean a messy ERP extract, find and explain anomalies, forecast `Units_Sold` for the
58,219 rows of `test.csv` (2026-11 to 2028-05, 19 months), and build a dashboard for planners and managers.

Three facts, all established before any modelling, change how the problem should be solved:

1. **The target is unconstrained demand, but history records shipments.** Business rule 7 asks for what customers will
   request. In stock-out months `Units_Sold` is lower than demand, and the stock-out file lists only some of those
   months.
2. **Most zeros are scheduled, not missing or random.** Customers order on calendar cycles (business rule 6). Of the
   36,057 zero rows in the cleaned history, 35,595 (98.7 %) fall on off-phase months of the series' cycle
   (`outputs/clean/train_clean.parquet`: `units_sold = 0` and `on_phase = False`). A forecaster that treats these zeros
   as noise or intermittency spreads every order over the wrong months.
3. **The data is synthetic, so its rules can be recovered exactly.** Every injected error leaves an exact arithmetic
   signature, and the row identifier encodes the full panel. Cleaning can be exact and asserted, rather than
   heuristic.

The approach follows from these facts:

```
research (10 forensic lenses + 10 skeptic reviews -> DATA_DOSSIER.md)
  -> clean       exact rules, asserted counts, fix log, data-quality report
  -> demand      unconstrained demand, ordering cycles, account events, forecast-window grid
  -> anomalies   one-off orders, measured event effects, training masks, anomaly register
  -> features    calendar, holidays, lags, macro lead / lag, EV shift, lifecycle
  -> backtest    rolling origins, 19-month horizon, as-of rebuild, model ladder, interval calibration
  -> forecast    structural model placed on the cycle, P10/P50/P90, bottom-up coherence, submission.csv
  -> export      dashboard data bundle (the app reads nothing else)
```

`make all` runs the seven stages in order. Each stage can also run alone and writes a record that is merged into the
data-quality report (`outputs/quality/dq_report.json`).

---

## 2. Data forensics: what we found

Before writing the pipeline, ten investigations examined the data, one per lens: labels and keys, dates and duplicates,
numeric reconciliation, panel structure and zeros, stock-outs, lifecycle and master data, macro indicators, the events
calendar, the demand generator, and the structure of the test file. A separate skeptic tried to refute each report.
The surviving findings, with corrections, are merged in `research/DATA_DOSSIER.md`. The pipeline turns each finding
into a rule and asserts the count the dossier established (check `expected` in `dq_report.json`). If a count moves,
the build fails.

### 2.1 Record_ID is a grid

`Record_ID` (`CEL-NNNNNNN`) is the generator's row counter. It numbers a complete grid: SKU, then the SKU's own region
order, then month. Within a series, `record number − month index` is constant. This gives three results:

- **Authoritative keys.** The decoded SKU, region and month agree with the labels on every row where the labels are
  usable. They also repair the 30 rows whose year reads `2062`.
- **Missing rows located exactly.** The 3,083 series blocks cover 245,548 cells. 244,566 records are present, so
  982 rows were deleted (0.40 %). Each gap is a known series and month (check `TRN-K13-MISSING-ROW`).
- **Blank regions filled.** 737 records with a blank region get their region from the block. A second method that does
  not use Record_ID (the SKU-customer-channel combination, and the only region of the SKU with no row that month) gives
  the same answer for all 737 (check `TRN-K7-WITNESS`, 0 disagreements).

A third independent witness is the load timestamp. The repaired month equals `month(Load_Timestamp) − 1` on every row,
and the pipeline asserts this (`src/celeris/cleaning/keys.py`).

### 2.2 Error taxonomy

All counts are from `outputs/quality/dq_report.json`. Each check's `affected` equals the dossier's `expected` count.
"Records" are unique `Record_ID`s and "raw rows" are rows of `train.csv`.

**`train.csv`: keys, dates, labels and duplicates**

| Rule | Error | Affected | Fix | Method |
|---|---|---|---|---|
| K1 | Exact duplicate load | 2,946 records | Keep one copy | exact |
| K2 | Superseded re-load (restatement) | 736 records | Keep the latest `Load_Timestamp` (business rule 2). Never sum versions. The latest load equals `Shipped_Units` on 17 of 17 restated stock-out months (`ORC-RESTATEMENT-LATEST`). | exact |
| K3 | Date written in 7 formats | 9,967 raw rows (9,821 records) | Normalise to `YYYY-MM`; anything unknown raises | format |
| K4 | Year typo `2062` | 30 raw rows | Swap the last two digits; confirmed by the load timestamp | exact |
| K5 | `Month` column holds the load month | 246 raw rows | Drop raw Year / Month and recompute them from `Date` (business rule 1) | exact |
| K6 | Region label variants (case, abbreviation, whitespace, punctuation, wording) | 6,199 raw rows (6,117 records) | Map to the canonical label. Read every file as text, so the region `NA` does not become a missing value. | format |
| K7 | Blank region | 737 records | Decode from the Record_ID block; assert agreement with the witness | derived |
| K8 | Sales channel variants | 3,745 raw rows (3,683 records) | Map; assert one channel per series | format |
| K9 | SKU_ID variants (case, missing dash, leading space, dropped zero, underscore) | 3,741 raw rows (3,683 records) | Normalise; assert the SKU is in the master and equals the decoded SKU | format |
| K10 | Customer name variants | 2,490 raw rows (2,455 records) | Normalise; unmapped names raise | format |
| K11 | Product family blank | 1,252 raw rows (1,228 records) | Look up from the SKU prefix | derived |
| K12 | SKU description blank | 996 raw rows (982 records) | Take from the SKU master | derived |
| K13 | Deleted rows | 982 cells | Kept as `missing_row`, **never zero** (business rule 3); treated from the ordering cycle (section 5) | see 5 |

**`train.csv`: numbers (units × price = revenue)**

A canonical price table (`outputs/clean/price_table.csv`, 4,894 SKU × period cells) gives the list price per SKU and
year, with 2022 split at the July surcharge. Against it, every record falls into exactly one of 15 numeric states
(`TRN-NUM-STATES`). Two states are clean: 202,244 priced records and 35,390 zero rows. The other 13 states are errors:

| State | Error | Records | Fix | Method |
|---|---|---|---|---|
| N1 | Units blank, revenue present | 2,545 | units = revenue / price | exact |
| N2 | Units blank on a zero row | 450 | units = 0 | exact |
| N3 | Units `-` placeholder | 217 | units = 0 | exact |
| N4 | Sign error (negative units and revenue) | 491 | absolute value of both; never netted | exact |
| N5 | Units × 10 | 293 | units = revenue / price | exact |
| N6 | Units × 100 | 75 | units = revenue / price | exact |
| N6b | Thousands separator in units text | 44 raw values | strip before classifying; 3 are genuine large orders | format |
| N7 | Revenue × 10 | 425 | revenue = units × price; units untouched | exact |
| N8 | Revenue digit transposition | 312 | revenue = units × price | exact |
| N9 | Price in cents | 614 | price ÷ 100 | exact |
| N10 | Price and revenue in EUR (Europe, Direct OEM, 2022-Q1) | 498 | canonical USD price; revenue recomputed | exact |
| N11 | Units booked in packs of 10 (India, Aftermarket, 2021-H2) | 385 | units × 10; `Shipped_Units` where listed | approximate (±5 units) |
| N12 | Units and revenue blank (Latin America ERP migration, 2023-03..05) | 332 | units unknown: masked in training, filled for display | unknown |
| N13 | Price and revenue zeroed on a real order | 295 | canonical price; revenue recomputed | exact |

The 13 error states cover 6,932 records (2.83 %). No record carries two errors. After cleaning, revenue equals units ×
invoice price to the cent on all 244,234 records with known units (`TRN-NUM-REVENUE-IDENTITY`). Cleaned units equal
the stock-out file's `Shipped_Units` on 5,761 of 5,761 comparable rows (`ORC-UNITS-SHIPPED`), and the pack-of-10 rows
match to within ±5 units on 42 of 42.

**Other files**

| File | Error | Cells | Fix |
|---|---|---|---|
| `macro_indicators.csv` | M1: month 2022-06 appears twice | 1 row | keep the later row |
| | M2: auto production YoY stored as a fraction (2019) | 12 | × 100 |
| | M3: PMI decimal shift (2023-05: 4.79) | 1 | 47.9 |
| | M4: raw-material index on an old base (2019–2021) | 36 | ÷ 1.25 |
| | M5: single blanks | 5 | mean of the neighbouring months |
| `sku_master.csv` | S1: PMP-004 business unit contradicts its family and every transaction | 1 | corrected |
| | S2: BSS-018 launch date 4 months after its first sales | 1 | effective launch 2025-02; registered as a master-data conflict |
| `inventory_stockouts.csv` | `Fill_Rate_Pct` does not follow its documented formula | 4,890 rows | documentation conflict registered; a realised fill rate is computed instead |
| `test.csv`, `events_calendar.csv`, `sample_submission.csv` | none (formally clean) | 0 | used as the label vocabulary and output contract |

### 2.3 Errors versus real events

The brief asks us to tell errors, which we fix, apart from real events, which we model or exclude and explain. Every
row of the anomaly register (`outputs/anomalies/anomaly_register.csv`) carries `class = data_error` or
`class = real_event`:

| Class | Episodes | Cells | Examples |
|---|---|---|---|
| Data errors and master / documentation conflicts (`DE.*`, `RC.*`) | 37 | 2,558 | all rules of section 2.2; PMP-004 business unit; BSS-018 launch; the `Fill_Rate_Pct` definition |
| Real events and structure (`RE.*`, `ST.*`) | 299 | 8,905 | stock-outs, semiconductor allocation, back-order catch-up, one-off orders, COVID, pre-buy, strike, Red Sea, holidays, programme step, MEA opening, cycle changes, customer switches, lost accounts, launches, end of life |

Real events are never deleted. They stay in the cleaned history and the dashboard. For modelling, each one is either
modelled (holidays, programme step, launch ramp, end-of-life phase-out) or masked from estimation, with the reason
recorded (section 4).

Scheduled off-phase zeros are structure, not anomalies, and are not registered.

---

## 3. Cleaning pipeline and data-quality report

**Design rules** (`docs/architecture.md`):

- raw files are read-only and hashed at the start and end of every run;
- every file is read as text;
- every fix is a named rule with an asserted count;
- every changed cell is written to a fix log;
- runs are deterministic.

The cleaning stage is `src/celeris/cleaning/`. Its steps run in this order:

1. keys, labels and dates;
2. de-duplication;
3. the Record_ID decode and grid;
4. prices;
5. numeric states;
6. indicators, master data, events and stock-outs;
7. the oracle check against the stock-out file.

**Data-quality report** (`outputs/quality/dq_report.json`):

- 116 checks over the seven files. Each check has its rule, severity, affected count, expected count, a before and after
  metric, a breakdown, the action taken and up to five examples.
- 55 checks fail before cleaning.
- After cleaning, 0 checks of severity `error` fail. Four `warning` checks remain, and each is an unknown value that
  is masked, not guessed:
  - 332 ERP blank records (`TRN-N12-ERP-UNITS-LOST`);
  - 330 ERP cells still unknown after the demand stage (`DEM-ERP-BLANKS`);
  - 837 on-phase missing rows of unknown size (`DEM-MISSING-TREATMENT`);
  - 26 listed stock-out months with no train record (`ORC-MISSING-ROWS-LISTED`). Their units are taken from the
    stock-out file.
- Four `info` checks remain flagged by design. They are profile facts, not defects: 27 cycle changes, 23 customer
  switches, 16 lost accounts, and the `Fill_Rate_Pct` documentation conflict.
- **Cells changed: 73,875**, by method:

  | Method | Cells | Meaning |
  |---|---|---|
  | convention | 36,057 | the 0.0 price placeholder on zero rows, filled with the list price for display only |
  | format | 25,762 | dates and labels |
  | exact | 8,387 | values recovered exactly |
  | derived | 2,952 | looked up from reference data (blank family, description, region) |
  | approximate | 385 | pack-of-10 units, ±5 units |
  | unknown | 332 | ERP blanks, masked |

  Rows dropped: 3,683 (3,682 duplicate loads and 1 duplicated macro row).

**Fix log.** `outputs/quality/fix_log.parquet` has 77,558 rows, one per changed cell or dropped row. Each row holds the
rule, raw value, before, after and evidence. Replaying the log on the raw values reproduces the cleaned records
(`tests/test_outputs.py::test_fix_log_replays_onto_raw`). `dedup_decisions.csv` lists every dropped version of a
repeated `Record_ID`.

**Effect on totals** (`TRN-NUM-TOTALS`):

| | Units | Revenue |
|---|---|---|
| Naive coercion: commas stripped, blanks ignored, signs kept | 12,030,253 | USD 8,684.43 M |
| Cleaned | 11,723,379 | USD 8,575.85 M |
| Overstatement | +2.6 % | +USD 108.6 M |

**Reproducibility.** `outputs/quality/manifest.json` records the SHA-256, size and row count of the 7 inputs and
50 outputs, and the library versions. `tests/test_reproducibility.py::test_all_twice_gives_identical_outputs` (in
`make test-all`) runs the whole pipeline twice and compares the hashes.

---

## 4. Anomalies and the register

`src/celeris/anomalies/` writes `outputs/anomalies/anomaly_register.csv`. It has 11,799 rows: 336 episodes (one per
event, rule or series-level change) and 11,463 cells that point to their episode. Each row records:

- the type and class;
- the scope (series, customer, region, family or channel, with the customer at the time);
- the dates;
- the cause, the evidence (counts, witnesses, measured multipliers) and the detection rule;
- the action taken and a confidence level;
- the impact in units and USD;
- whether it touches the forecast window.

**One-off bulk orders.** These are real orders placed by Direct OEM and Tier-1 customers. The median one is 5.0 times
the expected order, and they range from 3.0 to 43 times. They are detected against a *phase-aware, unconstrained* expectation, never a raw neighbour median. A raw
median fails on cycle series, on back-order catch-up and at level steps. The rule is: order > 3.5 × expected, or > 3 ×
for Direct OEM / Tier-1 with an expectation of at least 25 units, and an excess of at least 10 units
(`anomalies/expectation.py::one_off_rule`). The detector runs in two passes. It finds 507 one-offs, which carry
106,709 units above expectation. They stay in history and are masked from level estimation. Because they are real
demand, their expected volume is added back to Direct OEM / Tier-1 forecasts (+1.2 % as of 2026-10; section 8.3).

**Measured event effects.** Effects are measured by difference-in-differences against unaffected series, with the
customer *at the time*, because 23 series changed customer (`anomalies/events.py`):

- the Nexon strike in Europe (2023-10/11) cut latent demand to ×0.144 with no catch-up;
- the Helios Auto Parts programme in India stepped demand up ×1.237 from 2025-09;
- the COVID lockdowns of 2020, the stocking-channel pre-buy before the announced 2023 price rise, and the Red Sea
  disruption of Export to Europe and MEA in 2024-01..03 are all identified;
- five calendar events show no effect and are registered as "reviewed, no effect".

**Training masks.** 23,186 cells are excluded from model fitting (`train_mask` in `train_clean.parquet`). Each mask has
a reason:

| Reason | Cells |
|---|---|
| COVID 2020 | 16,356 |
| Pre-buy before the 2023 price rise (Tier-1 and Aftermarket, 2022-12..2023-02) | 4,035 |
| On-phase missing row (unknown size) | 837 |
| Red Sea (Export, Europe and MEA, 2024-01..03) | 817 |
| One-off order | 507 |
| ERP blank (unknown size) | 330 |
| Lost-account tail | 204 |
| Nexon strike | 93 |
| Hidden second stock-out month | 7 |

Level estimation additionally drops the semiconductor window, end-of-life phase-out months and pre-switch months
(`level_mask`). Imputed semiconductor cells are kept with weight 0.7, and suspected hidden stock-outs with weight 0.5.

**Account events** (`outputs/clean/account_events.csv`):

- 27 ordering-cycle changes (2022–2023), which conserve volume;
- 23 customer switches (2022-07..2025-05), each a permanent level step; the level is taken from post-switch months;
- 16 lost accounts (2025-04..2026-01): live SKUs whose series fell silent for at least 6 months while every other
  region of the SKU kept selling. No silence longer than 5 months has ever ended (dossier 5.2).

None of these appear in the events calendar.

---

## 5. Unconstrained demand and ordering cycles

### 5.1 Rebuilding requested demand

The stock-out file follows exact accounting rules. They hold on 100 % of its 5,830 rows (checks `STK-IDENTITY-*`, 0
violations):

```
Lost      = Requested + Carried_In − Shipped − Backordered
Carried_In(t) = Backordered(t − 1)
Shipped   = floor(f × (Requested + Carried_In))
Backordered = floor(0.4 × shortfall)   (0 on semiconductor rows)
```

`src/celeris/demand/unconstrained.py` uses these rules to derive unconstrained demand (`demand_uc`) for every grid
cell. Each cell gets exactly one method (`DEM-UC-METHODS`):

| Method | Cells | What it does |
|---|---|---|
| shipped | 235,329 | no constraint: demand = shipped units |
| S1 listed requested | 5,830 | listed stock-out month: demand = `Requested_Units` |
| S5 semiconductor imputed | 1,925 | unlisted Electrical Assemblies cell in 2021-03..2022-09: shortfall = depth(month) × severity(series), fitted on the listed rows |
| S2 carry removed | 1,034 | month after a back-order: the catch-up is removed from demand |
| D1 / D2 / D3 hidden stock-out | 29 + 29 / 62 / 14 | unlisted stock-outs recovered from their arithmetic signature |
| spill removed / missing after back-order | 10 / 4 | back-order spill into an off-phase month |
| ERP unknown order | 330 | positive order of unknown size: unknown, masked |
| missing row: off-phase / lost tail | 118 / 1 | demand 0 (scheduled) |
| missing row: on-phase | 833 | unknown, masked; filled for display |

**Results** (`DEM-UC-UPLIFT`, `train_clean.parquet`):

- Unconstrained demand is 11,831,100 units against 11,724,013 shipped, +0.91 % overall.
- For Electrical Assemblies the gap is **+44.8 % in 2021 and +29.2 % in 2022**. The semiconductor shortage constrained
  every Electrical Assemblies cell from 2021-03 to 2022-09, but the file lists only some of them.
- **Lost sales** (never shipped) total 106,925 units and USD 109.9 M. Of that, 2021 and 2022 hold 85,298 units
  (USD 93.2 M), and Electrical Assemblies holds 80,664 units (USD 91.5 M).

### 5.2 Ordering cycles

Each series follows one of 16 calendar-anchored patterns, grouped in five kinds (`src/celeris/demand/cycles.py`,
counts as of 2026-10 from `dq_report.json`):

| Kind | Meaning | Series |
|---|---|---|
| M | every month | 1,539 |
| A | every month except one annual shutdown month | 775 |
| B | every second month | 297 |
| Q | every third month | 242 |
| T | two months on, one month off | 230 |

**An order carries all latent demand since the previous order.** A B order is about two months of demand, and a Q order
about three. The month after an annual shutdown carries its own demand plus half of the shutdown month's demand (weight
0.5). The forecast therefore models latent monthly demand and then places it on the projected cycle:
`order(t) = Σ weight × latent(month)` over the months the order carries
(`demand.cycles.accumulation_weights`).

A cycle change is a single change point, found by segmentation. The regime in force at the origin is the one
projected forward.

**Missing rows** are treated from the cycle. A deleted off-phase row is a scheduled zero. A deleted on-phase row is an
order of unknown size: it is masked from training and filled for display as level × regional calendar index
(`demand/fill.py`).

---

## 6. Features and drivers

The feature catalogue (`outputs/features/feature_catalogue.csv`) has 39 entries in twelve groups. Each entry has its
definition, source and the models that use it. All statistics at month t use months before t only, on the full grid
with explicit gaps (`tests/test_model_features.py::test_trailing_statistics_do_not_look_ahead`).

- **Calendar:** month, quarter, days in month, year-end flags, and region × month and channel × month seasonality.
- **Moving holidays:** Lunar New Year days in Asia Pacific and Ramadan days in MEA, counted from the events calendar.
- **Lags and rolling statistics:** lags 1, 2, 3 and 12; means and standard deviations over 3, 6 and 12 months; zero
  share.
- **Intermittency class:** Syntetos-Boylan ADI / CV² class. Of the 3,083 series, 2,197 are smooth, 749 intermittent,
  101 erratic and 36 lumpy (`dq_report.json`). We use the class for reporting and backtest slices only, because the
  zeros are scheduled.
- **Levels and ordering cycle:** level ratios, residual ratios, prior level, cycle kind, accumulation span, carry
  weight.
- **Macro, EV, lifecycle and events:** described below.

### 6.1 Which indicator leads which family, and at what lag

**Method** (`src/celeris/features/macro.py`). For each family, a macro index is computed: the log of total demand
divided by the expectation without the macro factor. It is correlated with every standardised indicator at lags 0 to
12 months, for three eras (all, 2019–2022, 2023–2026). The result is `outputs/features/macro_leadlag.csv`: 7 families ×
8 indicators × 13 lags × 3 eras = 2,184 rows. Drivers are then chosen by forward selection:

- at most three drivers per family;
- each at its best lag from 0 to 6 months;
- the economic sign is imposed (+ PMI, auto production, new orders, utilisation; − inventory days, raw-material cost,
  fuel);
- a minimum deviance gain is required.

Each SKU then gets its own coefficients on its family's drivers, shrunk toward the family. A soft cap limits large
upward moves.

**Drivers at the final origin, 2026-10**, in order of selection (`outputs/forecast/structural_factors.json` →
`family_macro_drivers`; lag in months):

| Family | Drivers (indicator @ lag) |
|---|---|
| Brake & Safety Systems | auto production @1, fuel price @2, vehicle inventory days @2 |
| Chassis & Structural | raw-material cost @4, auto production @2, new vehicle orders @2 |
| Electrical Assemblies | new vehicle orders @2, PMI @1, auto production @2 |
| Hydraulic Systems | PMI @3, industrial utilisation @0, new vehicle orders @0 |
| Powertrain Components | auto production @3, new vehicle orders @4, industrial utilisation @0 |
| Precision Machined Parts | PMI @2, industrial utilisation @1, auto production @2 |
| Thermal Management | PMI @0, auto production @2, fuel price @2 |

These sets were found from the data alone, and they match the families' indicator sets found independently by the
forensic lens (dossier 4.7). The indicators lead demand by 0 to 4 months. The first driver gives 1 to 4 months of
warning in six families. In Thermal Management it is coincident (PMI at lag 0). Utilisation always acts within 0 to
1 month.

Aftermarket series follow their SKU's macro path damped to 0.378, plus a fuel effect of −0.069 log points per standard
deviation at lag 1 (`outputs/forecast/structural_factors.json`).

### 6.2 Is the lag structure stable?

Two tests were run.

- **By origin** (`outputs/backtest/macro_drivers_by_origin.csv`). In every family, at least one driver keeps both its
  indicator and its lag at every decision origin from 2022-10 to 2025-03 and at 2026-10:
  - Brake auto production @1, selected first every time;
  - Electrical new orders @2, selected first every time;
  - Hydraulic PMI @3, selected first every time;
  - Powertrain auto production @3, selected first every time;
  - Chassis auto production @2, in every set; the first driver alternates between raw-material cost and fuel;
  - Thermal auto production @2 and PMI @0, in every set.

  Precision's PMI moves from lag 3 to lag 2 at 2025-03. The weaker drivers change with the sample, as expected from
  correlated indicators. At the 2021-10 stress origin (34 months of history, much of it COVID) the selection is
  unreliable.
- **By era** (`dq_report.json` → `family_drivers_by_era`). Brake auto production @1 and Powertrain auto production @3 hold
  in both 2019–2022 and 2023–2026. Electrical keeps PMI @2. Hydraulic keeps PMI, but its lag moves from 4 to 1. Chassis
  and Thermal select only utilisation in 2023–2026, because the calm years have too little variation in their earlier
  drivers to pass the threshold.

**Conclusion.** The lag of the leading driver is stable wherever the data can identify it. The minor drivers cannot be
identified on half the history. The model refits the full history at every origin.

### 6.3 The shift to electric vehicles

The EV effect is a class-level, zero-lag, log-linear term in the EV adoption index:

- EV SKUs: +0.0280 per index point;
- ICE SKUs: −0.0117 per index point;
- Universal SKUs: 0.

Per-SKU EV coefficients were tested and rejected as noise (dossier 4.8). In the window the index rises from 93.8
(2026-11) to 94.6 (2027-01/02), then falls to 90.7 (2027-12) and 91.9 (2028-05). Its mean over the last 12 months of
history is 90.32 (`outputs/clean/macro_clean.csv`). EV SKUs therefore get a hump early in the window and ICE SKUs a
shallow dip.

Removing the EV term raises backtest WAPE + |bias| from 27.29 % to 29.28 %. Estimating the coefficients on data from
2023 onward only gives 28.31 % (`outputs/backtest/experiments.csv`). The forecast holds 302,300 units for EV SKUs,
342,379 for ICE SKUs and 2,148,575 for Universal SKUs.

### 6.4 Lifecycle and event features

- **Launch ramp:** `1 − exp(−(k + 1) / 4.6)`, with k months since the product launch.
- **MEA opening ramp:** time constant 6 months; MEA opened in 2022-01.
- **End-of-life phase-out:** factors 0.90, 0.81, 0.71, 0.61, 0.52 and 0.42 in the last six months before end of life
  (`src/celeris/features/lifecycle.py`).
- **Events:** the Helios programme step and the Orion shutdown multiplier.

---

## 7. Forecasting

Details and every experiment are in [`modelling.md`](modelling.md), sections 3 and 6.

### 7.1 Baselines

The baselines are:

- `naive`: the flat mean of the last 12 months;
- `seasonal_naive`: the same calendar month of the latest year;
- `moving_average`: the flat mean of the last 6 months;
- `cycle_aware`: a flat 24-month level placed on the projected ordering cycle, with no seasonality.

All of them are computed as of each origin (`src/celeris/models/baselines.py`).

### 7.2 Intermittent-demand methods, and why scheduled zeros defeat them

The intermittent methods are Croston, SBA, TSB, ADIDA and IMAPA, from `statsforecast`, fitted per series on the
unconstrained history (`src/celeris/models/intermittent.py`). They assume zeros arrive at random. Their forecast is a
flat rate per month.

Here, 98.7 % of zero months are scheduled by a calendar cycle. A flat rate is wrong in both kinds of month: it puts
demand into off-phase months, where the order will be 0, and it puts too little into the order month, which carries two
or three months of demand for B, Q and T customers. All five methods score 51.3–51.6 % WAPE, no better than the flat
12-month mean (51.6 %). The cycle-aware naive scores 31.2 % with the same flat-level idea.

### 7.3 The structural model

The structural model (`src/celeris/models/structural.py`) mirrors how the data was generated:

```
latent[s,t] = level[s]
            × R[region, month] × C[channel, month] × TH[month]^Thermal               f_season
            × (1 − d_LNY × LNY days/10)^APAC × (1 − d_Ram × Ramadan days/30)^MEA      f_holiday
            × exp(SKU macro path at its lags)                                        f_macro
            × exp(beta[class] × (EV index[t] − reference))                           f_ev
            × launch ramp × end-of-life phase-out                                    f_lifecycle
            × Helios step × Orion shutdown                                           f_event
order[s,t]  = Σ over carried months of weight × latent        (0 on structural zeros)
```

At every origin the model is estimated from data up to the origin only:

1. Seasonality, holiday depths, EV coefficients, the Helios step and the SKU macro paths are fitted together by a
   Poisson likelihood with exact block updates (ratios of sums).
2. The level of each series is a ratio of sums over its last 24 months of usable cells. A log mean would bias
   aggregates down.
3. Series younger than 24 months blend toward a cross-sectional prior, weighted as 2 pseudo-months. Cold starts take
   the prior.
4. One-off volume is added back for Direct OEM and Tier-1.

All seven multiplicative components are written to `outputs/forecast/forecast.parquet` for every row. Their product
equals `latent_mean` on every row (`FC-COMPONENTS`, `tests/test_forecast_contract.py::test_components_multiply_to_latent_mean`).
This is what makes each forecast explainable: the dashboard's forecast X-ray draws the same product as a waterfall.

### 7.4 Global LightGBM

The LightGBM model is a direct multi-horizon model (`src/celeris/models/gbm.py`):

- **Target:** the ratio `actual / structural forecast`, fitted with an L2 objective and weighted by the structural
  forecast.
- **Training rows:** come from as-of structural forecasts made every 3 months at inner origins before the fold's
  origin.
- **Features:** 32, never raw indicator levels or identifiers.
- **Training:** 3 seeds × 300 rounds.

It scores 27.31 % WAPE with bias +2.1 %. Its most important features are the macro and EV multipliers and the family
(`gbm_importance.csv`). It learns period-specific macro errors from 2021–2024 that do not carry over to later periods.

### 7.5 The ensemble rule

The ensemble rule was fixed in advance. A member joins the structural model, with equal weight, only if the ensemble
improves WAPE + |bias| in at least 3 of the 4 decision folds. The structural + LightGBM ensemble improved only one fold
(`summary.json` → `ensemble`):

| Fold | Structural (WAPE + abs(bias)) | Ensemble (WAPE + abs(bias)) | Ensemble better? |
|---|---|---|---|
| 2022-10 | 29.84 % | 30.12 % | no |
| 2023-10 | 27.34 % | 26.52 % | yes |
| 2024-10 | 25.68 % | 26.44 % | no |
| 2025-03 | 26.28 % | 27.15 % | no |

**The structural model ships alone.** The LightGBM model is reported as a negative result.

---

## 8. Validation

### 8.1 Design

- **Rolling origins, expanding window, 19-month horizon** (the same horizon as the real task). The decision folds have
  origins 2022-10, 2023-10, 2024-10 and 2025-03. The 2021-10 fold is a stress test: it falls in the chip shortage and
  before the MEA opening. It is reported but never used for a decision or an average (check `BT-FOLDS`).
- **Scoring.** Forecasts are scored against unconstrained demand at SKU × region × month. Cells whose demand is unknown
  are not scored. The four folds give 225,942 scored cells. Metrics are cut by family, region, channel, horizon,
  calendar month, cycle kind and intermittency class, at six aggregation levels (`outputs/backtest/metrics.csv`).

### 8.2 No-leakage design

At every origin the pipeline rebuilds the whole demand state from data up to that month:

- unconstrained demand, cycles, lost accounts, customer switches and fills (`demand.state.demand_state`);
- one-offs and masks;
- levels, seasonality, holiday depths, EV coefficients, macro drivers and paths, and the prior.

Only reference data known in advance is shared across origins: the SKU master, the Record_ID blocks, the events
calendar and the indicator values.

`tests/test_model_structural.py::test_no_leakage_after_the_origin` alters every datum after an origin (units,
customers, missing rows, stock-outs). It then asserts that the origin's structural forecasts, baselines and LightGBM
features do not change. `tests/test_demand_asof.py::test_state_at_an_origin_ignores_later_data` does the same for the
demand state.

### 8.3 Noise floor

A forecast cannot be better than the randomness of orders. Two floors are measured for each fold
(`summary.json` → `noise_floor`):

- the **oracle**: the structural model with each series' level refitted on its own horizon, a forecaster who knew the
  future level;
- the **negative-binomial floor**: the expected absolute deviation of the order noise alone.

| Origin | Final WAPE | Oracle WAPE | NB noise floor | Final above oracle |
|---|---|---|---|---|
| 2021-10 (stress) | 36.18 % | 27.64 % | 22.28 % | yes |
| 2022-10 | 28.82 % | 25.19 % | 22.35 % | yes |
| 2023-10 | 26.14 % | 23.46 % | 22.30 % | yes |
| 2024-10 | 25.17 % | 22.96 % | 22.42 % | yes |
| 2025-03 | 25.18 % | 23.05 % | 22.42 % | yes |

Every fold scores above its oracle (`BT-LEAKAGE-ORACLE`). A score below the oracle would signal leakage.

**Honesty note on tuning.** The model started from the dossier's recommended values. The experiments of
[`modelling.md`](modelling.md) section 6 then ran on the same four folds, under a declared rule: a variant replaces the
default only if it lowers mean WAPE + |bias| by more than 0.0005. Two discrete choices changed this way: no
2021–22 era factor in the macro estimator, and the one-off uplift. Each gained 0.1 to 0.2 points. The reported
numbers are in-sample with respect to these two choices only.

---

## 9. Results

### 9.1 Model ladder

Means over the four decision folds, at SKU × region × month (`summary.json` → `ladder`; per-fold values in
[`modelling.md`](modelling.md) 5.1):

| Model | WAPE | Bias | WAPE + abs(bias) |
|---|---|---|---|
| Last-12-month mean (`naive`) | 51.62 % | −3.2 % | 56.88 % |
| 6-month moving average | 52.42 % | −0.6 % | 58.27 % |
| Seasonal naive | 38.70 % | −3.8 % | 44.54 % |
| Croston | 51.49 % | −5.0 % | 56.48 % |
| SBA | 51.26 % | −9.7 % | 60.99 % |
| TSB | 51.45 % | −5.7 % | 57.11 % |
| ADIDA | 51.59 % | −1.1 % | 56.22 % |
| IMAPA | 51.62 % | −1.2 % | 56.21 % |
| Cycle-aware naive | 31.24 % | −3.2 % | 35.15 % |
| Global LightGBM | 27.31 % | +2.1 % | 29.44 % |
| Ensemble (structural + LightGBM) | 26.40 % | +1.0 % | 27.56 % |
| **Structural = final (submitted)** | **26.33 %** | **−0.2 %** | **27.29 %** |
| Oracle (noise floor, not a forecast) | 23.66 % | −0.1 % | 23.80 % |

Each step adds one idea. Placing a flat level on the ordering cycle removes 20 WAPE points against the flat mean.
Modelling latent demand with its drivers removes 5 more. The final model is 2.7 points above the oracle.

### 9.2 Accuracy at every level of the hierarchy

WAPE after summing actuals and forecasts to the node and month; mean of the four folds (`metrics.csv`,
`origin = mean`, `slice_type = all`):

| Model | Series | SKU | Family × region | Family | Region | Total |
|---|---|---|---|---|---|---|
| Seasonal naive | 38.70 % | 25.01 % | 12.79 % | 10.87 % | 9.18 % | 8.32 % |
| Cycle-aware naive | 31.24 % | 21.00 % | 11.67 % | 9.17 % | 9.66 % | 7.44 % |
| **Final** | **26.33 %** | **15.04 %** | **5.58 %** | **3.45 %** | **3.06 %** | **2.14 %** |
| Oracle | 23.66 % | 12.96 % | 4.88 % | 2.95 % | 2.82 % | 1.86 % |

### 9.3 What each component is worth

Ablations remove one component at a time (`experiments.csv`, experiment `components`, mean of four folds):

| Removed | WAPE | Bias | WAPE + abs(bias) | Family × month WAPE |
|---|---|---|---|---|
| nothing (full model) | 26.33 % | −0.2 % | 27.29 % | 3.45 % |
| SKU macro path | 27.82 % | +1.2 % | 31.96 % | 7.21 % |
| EV factor | 28.08 % | +1.2 % | 29.28 % | 4.68 % |
| seasonality | 26.92 % | −0.9 % | 28.06 % | 5.30 % |
| moving holidays | 26.41 % | −0.2 % | 27.56 % | 3.59 % |
| one-off uplift | 26.23 % | −1.1 % | 27.42 % | 3.44 % |

The macro path is the most valuable component: without it, the family × month error doubles. The end-of-life phase-out
changes little overall, but on rows within 11 months of end of life it lowers WAPE + |bias| from 73.8 % to 42.1 %.

### 9.4 By family, region, channel and horizon

For the final model at series × month, WAPE ranges:

- across families: 25.2 % (Brake & Safety) to 28.5 % (Electrical);
- across regions: 23.4 % (Europe) to 34.6 % (MEA, the youngest and smallest region);
- across channels: 25.1 % (Aftermarket) to 29.0 % (Export).

By horizon it rises only from 25.8 % (1–3 months ahead) to 27.0 % (13–19 months). Bias stays within ±1.9 % on every
family, region, channel and horizon bucket. The tables are in [`modelling.md`](modelling.md) 5.4.

Cold starts of each fold score 67.4 % WAPE (4,320 cells). They have no history and no known cycle, so this is
expected. Their share of volume is small.

---

## 10. Uncertainty and coherence across the hierarchy

### 10.1 Error model

The error of an order forecast with mean m is split into four independent variance components (`forecast.parquet`
columns; parameters in `outputs/forecast/uncertainty.json`):

| Component | Meaning | Calibrated value |
|---|---|---|
| `var_noise` = scale × (a·m + b·m²) | negative-binomial order noise, independent across rows | a = 1.0; b from 0.045 (North America) to 0.100 (MEA); scale 0.877 |
| `cv_level` | series-level error, common to every month of a series | 0.136 mature, 0.214 young, 0.599 cold start |
| `cv_group` | error shared by a family × region | 0.045 |
| `cv_common` | error shared by every row (period-level bias) | 0.022 |

The parameters are first estimated by the method of moments on backtest residuals. They are then scaled
(split-conformal) so that P10–P90 covers 80 % of actuals at row, family × region × month and total × month level.

### 10.2 Ranges that add up

The P10, P50 and P90 of *any* aggregate (a family, a region, a quarter, a lead-time window) come from one formula
(`celeris.models.quantiles.aggregate_quantiles`):

```
M = Σ mean
V = Σ var_noise + Σ_series (cv_level × Σ series mean)² + Σ_family×region (cv_group × Σ group mean)² + (cv_common × M)²
σ² = ln(1 + V / M²),  μ = ln M − σ² / 2,  Pq = exp(μ + z_q σ),  z = −1.2816, 0, +1.2816
```

Row quantiles are never summed. Summing them overstates the range, because row errors partly cancel. For the 19-month
total:

| | P10 | Mean | P90 |
|---|---|---|---|
| Sum of row quantiles (wrong) | 1,771,622 | 2,793,339 | 3,916,542 |
| Aggregate formula | 2,708,808 | 2,793,339 | 2,878,883 |

Point forecasts are coherent by construction, because every aggregate is a bottom-up sum of the submitted integers.
The forecast stage asserts that the monthly sums at total, family, region, channel and family × region level equal
`outputs/forecast/aggregates.csv` and the submission total (`FC-HIERARCHY`,
`tests/test_forecast_contract.py::test_hierarchy_adds_up`).

### 10.3 Coverage

Share of backtest actuals inside P10–P90 (`summary.json` → `coverage`):

| Evaluation | Rows | SKU × month | Family × region × month | Total × month |
|---|---|---|---|---|
| Calibrated on all 4 folds | 80.0 % | 74.0 % | 80.0 % | 80.3 % |
| Leave one origin out: 2025-03 | 82.0 % | 78.2 % | 88.9 % | 89.5 % |
| Leave one origin out: 2024-10 | 81.8 % | 77.6 % | 88.2 % | 84.2 % |
| Leave one origin out: 2023-10 | 81.0 % | 74.9 % | 79.7 % | 52.6 % |
| Leave one origin out: 2022-10 | 74.8 % | 64.5 % | 62.9 % | 73.7 % |
| Stress fold 2021-10 (never used) | 68.7 % | 50.6 % | 33.4 % | 21.1 % |

Calibrated in sample, the targets are met. Out of sample, the bands are slightly wide for the recent folds and too
narrow for the turbulent 2022-10 fold. Bands calibrated on calm years do not cover a shock year like 2021. SKU × month
coverage is 74 %, because the error model has no component shared by a SKU's regions (section 13).

---

## 11. Forecast-window special cases

Counts from `outputs/clean/test_grid.parquet` and units from `outputs/forecast/forecast.parquet`:

| Case | Rows | Treatment |
|---|---|---|
| Off-phase months | 8,382 | exactly 0, with P10 = P50 = P90 = 0. The next on-phase order carries the off months' demand. |
| Lost accounts (16 series) | 304 | exactly 0 |
| After end of life: PTC-005 from 2027-06, PMP-003 from 2027-09, THM-001 from 2028-01 | 72 + 54 + 30 = 156 | exactly 0 (business rule 5). The end-of-life month itself still sells. |
| End-of-life phase-out (6 months before end of life) | 108 | latent demand × 0.90 … 0.42; 3,990 units |
| New launches via `Replaces_SKU`: PTC-029 (replaces PTC-005, EV, from 2027-03), PMP-020 (replaces PMP-003, EV, from 2027-06), THM-012 (replaces THM-001, Universal, from 2027-10) | 117 rows, 10 series | cross-sectional prior level (family, tier × region, channel, powertrain) × launch ramp; one month of demand per month (cycle unknown); 3,990 units |
| Just-launched / young series | 119 / 356 rows | level blended with the prior (2 pseudo-months) |
| Helios Auto Parts, India | 1,235 | programme step × 1.237 (measured); 78,526 units |
| Orion Driveline, North America, 2027-07/08 retooling shutdown | 62 series, 124 shutdown rows | latent demand × 0.144 (the measured Nexon 2023 strike), no catch-up. Orders: 3,740 units (2027-06), 709 (2027-07), 569 (2027-08), 3,409 (2027-09). |
| Lunar New Year and Ramadan | APAC and MEA rows | day counts: 2027-02 LNY 10 days and Ramadan 21; 2027-03 Ramadan 9; 2028-01 LNY 6 and Ramadan 4; 2028-02 LNY 4 and Ramadan 26 (`FEAT-HOLIDAY-DAYS`) |
| Annual shutdown months (NA July, Europe August, APAC October, LatAm January) | region rows | inside region × month seasonality |
| Year-end before the 2027 and 2028 price rises | Tier-1, Aftermarket, Direct OEM, Export | ordinary channel × month pattern; no pre-buy, because no rise was announced in advance |
| Macro indicators | every row | the supplied paths for 2026-11..2028-05, at each SKU's lags |

**How `Replaces_SKU` is used.** It sets the successor's timing, which meets the predecessor's phase-out, and its
assumed price: the predecessor's 2026 price × the median successor / predecessor price ratio. It does not set the
level. Successors do not inherit the predecessor's regions, customers or channels; 0 of 10 do (dossier 5.4). A test on
the 19 historical successor series of earlier folds supports this choice (242 cells). The prior gives 40.7 % WAPE and
+1.8 % bias (`predictions.parquet`). A predecessor-based level was more biased (`modelling.md` 5.5).

**Totals.**

- The forecast totals 2,793,254 units, ×1.035 the last 19 months of unconstrained demand (2,699,398 units,
  2025-04..2026-10).
- The first 12 months are ×1.043 the same months a year earlier. The level then eases as the macro hump fades.
- Precision Machined Parts (×1.084) and Hydraulic Systems (×1.078) lead, driven by PMI and utilisation. Brake & Safety
  and Thermal are nearly flat (×1.014 and ×1.010).
- Revenue is USD 2,504.2 M at assumed prices: the 2026 invoice price × 1.045 in 2027 and × 1.045 × 1.040 in 2028.

---

## 12. Key technical decisions

| Decision | Alternative rejected | Reason and evidence |
|---|---|---|
| Decode Record_ID and build the full grid first | Treat the extract as a table of rows | Locates the 982 deleted rows exactly and separates "missing" from "zero" (business rule 3). Fills 737 blank regions with 0 disagreements against a second witness. |
| Exact rules with asserted counts | Outlier filters, magnitude thresholds | Every error has an exact signature. Units equal `Shipped_Units` on 5,761 of 5,761 rows. A magnitude rule would "fix" the 507 genuine one-off orders. |
| Keep the latest load; never sum versions | Sum or average duplicates | Business rule 2. The latest load matches `Shipped_Units` on 17 of 17 restated stock-out months. |
| Target = unconstrained demand | Shipped units | Business rule 7. Shipments understate Electrical Assemblies demand by 44.8 % in 2021. |
| Forecast latent demand, then place it on the cycle | Intermittent-demand methods | Zeros are scheduled. Intermittent methods: 51.3–51.6 % WAPE. Cycle-aware naive: 31.2 %. |
| Structural multiplicative model | Black-box model alone | It scores better (26.33 % vs 27.31 % for LightGBM), stays unbiased (−0.2 % vs +2.1 %), and explains each row. |
| Ensemble only by a rule fixed in advance | Learned weights, or keeping LightGBM because it is "ML" | The ensemble improved 1 of 4 folds; the rule needs 3. |
| Arithmetic ratio-of-sums levels over 24 months | Log means; 18, 36 or 48 months | Log means bias aggregates down. 24 months scores best (27.29 % vs 27.55 %, 27.36 %, 27.41 %). |
| Submit the conditional mean, rounded to nearest | Median, shaded mean, floor | Shading by ×0.985 lowers WAPE by 0.1 points but moves bias to −1.65 % (score 27.85 %). |
| Mask real events from estimation; never delete them | Drop or winsorise | Events stay visible in history and the dashboard. Training uses only cells that represent normal demand. |
| Measure event multipliers with the customer *at the time* | Latest customer per series | 23 customer switches. Using the latest customer would put the wrong series in an event's scope. |
| Variance components for ranges | Summing row quantiles; quantile regression per row | Ranges add up at every level; P10–P90 is calibrated to 80 %. |
| Dashboard reads only an exported bundle | Numbers typed into the app | The export refuses a bundle whose totals disagree with `submission.csv` (`tests/test_export_bundle.py::test_forecast_totals_equal_submission`). |

---

## 13. Business impact

**What supply constraints cost.** 106,925 units were requested and never shipped, worth USD 109.9 M. 85,298 of those
units (USD 93.2 M) were lost in 2021–22, mostly in Electrical Assemblies during the semiconductor allocation. A plan
built on shipments would treat those years as low demand and repeat the shortage. Our history and forecast use
requested demand.

**What a planner does differently with this tool:**

1. **Plan on requested demand, not shipments.** The Stock-outs & lost sales view shows where shipments understated
   demand and by how much.
2. **Read zeros correctly.** The demand explorer labels every zero month: scheduled off-month, lost account, or a skipped
   order. The forecast puts each order in the month the customer will place it, with the right number of months of
   demand.
3. **Size safety stock on the aggregate, not on summed rows.** For the 19-month total, the P90 is 2.88 M units, 3.1 %
   above the mean. Summing row P90s would give 3.92 M, which would over-buy by 1.04 M units. The procurement view
   computes lead-time cover from the aggregate formula.
4. **Work a short exception list.** The exception inbox applies eight deterministic rules to the outputs. It holds 286
   items worth USD 66.8 M of revenue at risk (`dashboard/public/data/exceptions.json`). Revenue at risk is the
   forecast-window revenue that depends on the flagged judgement.

   | Rule | Items | Revenue at risk |
   |---|---|---|
   | Forecast vs last year beyond ±25 % | 172 series | USD 30.2 M |
   | Lost accounts (forecast 0; revenue if the account returns) | 16 | USD 16.4 M |
   | Cold starts (planned launches) | 10 | USD 7.2 M |
   | End of life in the window | 18 | USD 5.7 M |
   | Orion Driveline shutdown, 2027-07/08 | 62 | USD 4.6 M |
   | Recent customer switches | 8 | USD 2.7 M |

5. **Watch the right indicator, with its lead time.** For example, Hydraulic Systems follows PMI with a 3-month lag,
   Powertrain follows auto production with 3 months, and Electrical follows new vehicle orders with 2 months. The
   what-if view shows the effect of a shift such as PMI −3 points, passed through each customer's ordering cycle.

---

## 14. Limitations and next steps

**Limitations.**

- **Macro hump amplitude.** The forecast rises early in the window because utilisation (83.8 in 2026-11, above its
  historical maximum of 83.4) and PMI are high. History barely separates utilisation from new orders. The backtest
  cannot fix the amplitude to better than a few tenths of a WAPE point.
- **Orion 2027-07/08 cannot be tested.** No planned customer shutdown exists in history. We use the measured Nexon
  strike (×0.144, no catch-up) and give the rows a wide band (multiplier standard deviation 0.25).
- **One-off orders cannot be placed in a month.** Their expected volume is spread over Direct OEM and Tier-1 orders.
  That removes about 1 point of negative bias but costs about 0.1 point of row WAPE.
- **No new account events are forecast.** Losses, switches and cycle changes inside the window are not predicted. The
  test file shows no switch. If losses continued at their historical rate, about 0.7 % of volume would disappear
  ([`modelling.md`](modelling.md) section 10).
- **Interval coverage is uneven across folds** (section 10.3), and there is no SKU-shared error component.
- **Cold starts** rest on a cross-sectional prior (fold WAPE 67.4 %).
- **LightGBM did not earn its place** with this history length.
- **Dashboard issues.** The dashboard's aggregate ranges and its backtest pooling need two fixes. See "Gaps" in
  [`requirements_traceability.md`](requirements_traceability.md#gaps).

**Next steps**, in order of expected value:

1. A hierarchical level model (SKU effect × region effect × series factor) that shrinks small and Q / B-cycle series
   toward their SKU and region. Level noise accounts for most of the 2.7 points to the oracle.
2. A SKU-shared error component and better separation of utilisation from new orders. Both would tighten the hump
   months and lift SKU × month coverage from 74 %.
3. Better launch priors, using the successor's family and powertrain mix in each region.
4. Deploy the dashboard as a static site, with a scheduled re-run of `make all` when new months arrive.
