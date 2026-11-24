# Requirements traceability

This matrix maps every requirement of the problem statement ([`problem_statement.md`](problem_statement.md)) to where it
is delivered, the evidence for it, and its status. It covers:

- every Core, Advanced and Expert cell of the five workstreams;
- every dashboard view with each of its "must show" items, and every optional view;
- the seven business rules;
- the submission contract and the portal fields.

**How each claim was checked.** Each row was verified against the code under `src/celeris/` and `dashboard/src/`, and
against the committed outputs under `outputs/` and `dashboard/public/data/`. Other documents were not taken on trust.
Numbers are read from the output named in the row. "Check `X`" refers to a check in
`outputs/quality/dq_report.json`, which records the check's before and after values. "Test `f`" refers to a pytest
function under `tests/`, run by `make test`, or by `make test-all` for the one slow test.

**Status.**

- **done**: delivered as asked.
- **partial**: delivered with a stated limitation.
- **missing**: not delivered.

Partial and missing items are listed again under [Gaps](#gaps), ordered by importance.

---

## 1. Workstreams

### 1.1 Cleaning

| ID | Tier | Requirement | Where delivered | Evidence | Status |
|---|---|---|---|---|---|
| C1.1 | Core | Profile all files | `src/celeris/cleaning/` (one module per file and step), `cleaning/profile.py` (`test_checks`, `sample_checks`), `quality/report.py::build_report` → `dq_report.json` → `files` | Each of the 7 files has rows raw / clean, its checks, issues and cells changed: train 66 checks, test 15, stock-outs 12, master 10, macro 7, events 5, sample submission 1 (116 in total). Test `test_outputs.py::test_dq_report_structure`. | done |
| C1.2 | Core | Standardise labels | `cleaning/labels.py` (`resolve_column`, `resolve_sku`), `src/celeris/reference/label_aliases.csv` with `PROVENANCE.md` | Region variants on 6,199 raw rows, channel 3,745, SKU 3,741, customer 2,490, blank family 1,252, blank description 996 (checks `TRN-K6`…`TRN-K12`, all 0 after). Unknown variants raise. Tests `test_rules_keys.py::test_region_variants_recover`, `test_channel_variants_recover`, `test_sku_variants_recover`, `test_customer_variants_recover`, `test_unknown_customer_raises`, `test_alias_table_cannot_shadow_or_escape_the_vocabulary`. | done |
| C1.3 | Core | Standardise dates | `cleaning/dates.py` (`parse_month_text`, `repair_year_typo`), `cleaning/keys.py` | 9,967 raw rows in 7 formats → `YYYY-MM` (check `TRN-K3-DATE-FORMAT`). 30 `2062` typos repaired and confirmed by `month(Load_Timestamp) − 1` (`TRN-K4-YEAR-TYPO`). 246 wrong Month values recomputed from Date (`TRN-K5-MONTH-COLUMN`). Tests `test_every_date_format_recovers_the_month`, `test_unknown_or_invalid_dates_raise`, `test_year_typo_is_a_digit_swap`. | done |
| C1.4 | Core | De-duplicate | `cleaning/dedup.py::deduplicate`; `outputs/quality/dedup_decisions.csv` | 2,946 exact duplicate loads and 736 superseded loads dropped; the latest `Load_Timestamp` is kept (checks `TRN-K1`, `TRN-K2`). The latest load equals `Shipped_Units` on 17 of 17 restated stock-out months (`ORC-RESTATEMENT-LATEST`). Tests `test_dedup_keeps_the_latest_load_and_never_sums`, `test_dedup_is_order_invariant`, `test_dedup_raises_when_same_timestamp_differs`, `test_outputs.py::test_dedup_decisions`. | done |
| C1.5 | Core | One clean row per Date-SKU-Region | `cleaning/record_id.py` (`derive_blocks`, `decode`), `cleaning/grid.py::build_grid` → `outputs/clean/train_clean.parquet` | 245,548 rows = 244,566 records + 982 missing rows; 0 duplicate keys (checks `TRN-UNQ-KEY`, `TRN-GRID-CELLS`, `TRN-GRID-BLOCKS` for the 3,083 blocks). Tests `test_grid_is_records_plus_missing_rows`, `test_train_clean_schema`, `test_reference_crosscheck.py::test_block_table_matches_labels_keys_lens`. | done |
| C2.1 | Advanced | Reconcile units × price = revenue | `cleaning/prices.py::build_price_table` → `outputs/clean/price_table.csv` (4,894 cells); `cleaning/numeric.py` (`classify`, `apply_fixes`) | Every record falls into exactly one of 15 numeric states (`TRN-NUM-STATES`, 0 violations). Revenue = units × invoice price to the cent on 244,234 records (`TRN-NUM-REVENUE-IDENTITY`, 0 violations). Fixed: revenue × 10 (425), digit transpositions (312), zeroed prices (295), blank units recovered from revenue / price (2,545). Tests `test_each_state_is_detected_and_fixed`, `test_digit_swap_signature`, `test_rows_outside_every_state_fail_the_build`, `test_units_are_non_negative_integers_and_revenue_reconciles`. | done |
| C2.2 | Advanced | Fix unit and currency errors | `cleaning/numeric.py` | Fixed: units × 10 (293), units × 100 (75), thousands separators (44 raw values), price in cents (614), EUR block, Europe Direct OEM 2022-Q1 (498), pack-of-10 block, India Aftermarket 2021-H2 (385, ±5 units), sign errors (491). Units = `Shipped_Units` on 5,761 of 5,761 comparable stock-out rows (`ORC-UNITS-SHIPPED`). Tests `test_pack_row_keeps_its_revenue`, `test_cents_price_does_not_touch_units_and_revenue_x10_does_not_touch_units`, `test_corruption_recovery_on_clean_rows`, `test_outputs.py::test_units_match_shipped_units`. | done |
| C2.3 | Advanced | Handle missing rows vs zeros | Missing rows from Record_ID gaps (`cleaning/record_id.py`), kept as `row_status = missing_row`; treated from the ordering cycle in `demand/fill.py::treat_missing` | 982 missing rows, never zero-filled: 26 listed in the stock-out file (units known), 118 off-phase and 1 lost-tail → 0, 833 + 4 on-phase → unknown (masked, filled for display) (`demand_uc_method` in `train_clean.parquet`; check `DEM-MISSING-TREATMENT`). The 36,057 zero rows stay 0. Tests `test_missing_rows_stay_missing`, `test_missing_rows_are_treated_from_the_cycle`, `test_offphase_zeros_stay_zero_and_unknown_cells_stay_nan`. | done |
| C2.4 | Advanced | Clean the indicators | `cleaning/macro.py::clean_macro` → `outputs/clean/macro_clean.csv`, `outputs/quality/macro_change_log.csv` | 56 cells changed and 1 duplicated row dropped: duplicate month 2022-06, 12 fraction cells, 1 decimal shift, 36 old-base cells ÷ 1.25, 5 blanks (checks `MAC-M1`…`MAC-M5`, `MAC-COMPLETE`). Tests `test_outputs.py::test_macro_clean`, `test_reference_crosscheck.py::test_macro_matches_macro_lens`. | done |
| C3.1 | Expert | Tested, one-command pipeline | `Makefile` (`make all` = `python -m celeris all`: clean, demand, anomalies, features, backtest, forecast, export); `src/celeris/cli.py`; `tests/` | 233 tests: 232 in `make test`, plus 1 slow end-to-end test in `make test-all`. Raw inputs hashed and asserted unchanged; later stages invalidated when a stage re-runs; two full runs byte-identical. Tests `test_reproducibility.py::test_all_twice_gives_identical_outputs`, `test_reruns_invalidate_later_stages_and_reproduce_outputs`, `test_raw_inputs_are_unchanged`, `test_cli_registers_stages_in_architecture_order`. | done |
| C3.2 | Expert | Machine-readable data-quality report | `outputs/quality/dq_report.json`, `fix_log.parquet`, `manifest.json`, `stages/*.json` | 116 checks with severity, before / after, breakdown, action and examples. 55 fail before; after cleaning, 0 errors and 4 documented warnings. 73,875 cells changed and 3,683 rows dropped, all in a 77,558-row fix log that replays onto the raw data. Manifest holds SHA-256 of 7 inputs and 50 outputs. Tests `test_fix_log_replays_onto_raw`, `test_fix_log_schema_and_completeness`, `test_manifest_lists_every_output_with_its_hash`, `test_report_merges_every_stage`. | done |

### 1.2 Anomalies

| ID | Tier | Requirement | Where delivered | Evidence | Status |
|---|---|---|---|---|---|
| A1.1 | Core | Flag outliers | `anomalies/expectation.py` (`one_off_rule`, `detect_one_offs`): two passes against the phase-aware unconstrained expectation | 507 one-off orders flagged (check `ANM-ONE-OFFS`; `is_one_off` in `train_clean.parquet`), median 5.0 × expected. Tests `test_anomalies.py::test_one_off_rule_fixtures`, `test_one_offs_are_real_stocking_channel_orders`, `test_expected_demand_is_phase_aware_and_unbiased`. | done |
| A1.2 | Core | Separate errors from real events | `anomalies/register.py::build_register`: `class` = `data_error` / `real_event` | Data errors: 37 episodes and 2,558 cells (`DE.*`, `RC.*`). Real events and structure: 299 episodes and 8,905 cells (`RE.*`, `ST.*`). Errors are fixed in the clean stage; real events are kept, then modelled or masked. Test `test_register_contract`. | done |
| A1.3 | Core | Anomaly register | `outputs/anomalies/anomaly_register.csv` | 11,799 rows: 336 episodes and 11,463 cells. Columns: type, class, scope, dates, cause, evidence, detection, action, confidence, impact units and USD, in-window flag. Check `ANM-REGISTER-COVERAGE`: every Core / Advanced / Expert anomaly type is present. Tests `test_register_counts`, `test_register_contract`. | done |
| A2.1 | Advanced | Structural breaks | `anomalies/events.py::measure_effect` (difference-in-differences, customer at the time); register types `RE.PROGRAM_STEP`, `RE.REGION_OPENING`, `RE.DISRUPTION`, `ST.CUSTOMER_SWITCH` | Helios India step from 2025-09 (×1.22 by difference-in-differences in the register, ×1.240 in the structural model); MEA opening 2022-01; COVID 2020 (5 episodes, 16,356 cells masked); 23 customer-switch level steps (`structural_factors.json`, `train_mask`). Test `test_measured_event_effects`. | done |
| A2.2 | Advanced | Early buying before price rises | `RE.PREBUY_PRICE_RISE` (EV-030), `anomalies/masks.py::build_masks` | Tier-1 and Aftermarket, 2022-12..2023-02: 4,035 cells masked from fitting (`train_mask = prebuy_price_rise`). No pre-buy in the window, because no rise was announced in advance. | done |
| A2.3 | Advanced | Holidays | `RE.HOLIDAY` (48 episodes); `features/calendar.py::holiday_day_counts` | Lunar New Year and Ramadan modelled by day counts (depths 0.281 and 0.312 per full window, `structural_factors.json`). Fixed regional shutdown months are in region × month seasonality. Check `FEAT-HOLIDAY-DAYS`; test `test_model_features.py::test_moving_holiday_day_counts`. | done |
| A2.4 | Advanced | Stock-outs | `demand/unconstrained.py` (`supply_pass`, `cycle_pass`), `demand/semiconductor.py` | 5,830 listed rows; 1,925 unlisted semiconductor cells imputed; 1,034 back-order carries removed; 105 hidden stock-out months recovered by D1 / D2 / D3; 50 suspected (check `DEM-UC-INFERRED-STOCKOUTS`). Register: `RE.STOCKOUT_LISTED`, `RE.STOCKOUT_UNLISTED`, `RE.SEMICONDUCTOR_ALLOCATION`, `RE.BACKORDER_CATCHUP`. Tests `test_demand_rules.py::test_s1_listed_and_s2_carry_removed`, `test_d1_phantom_order_moves_back_and_spill_is_removed`, `test_d2_hidden_stockout_from_carried_in`, `test_d3_hidden_second_month`, `test_s5_semiconductor_imputation`. | done |
| A2.5 | Advanced | Estimate unconstrained demand | `demand_uc` column of `train_clean.parquet` (`demand/unconstrained.py`) | 11,831,100 units requested vs 11,724,013 shipped (+0.91 %). Electrical Assemblies +44.8 % in 2021 and +29.2 % in 2022. Lost sales 106,925 units, USD 109.9 M (check `DEM-UC-UPLIFT`). Tests `test_uplift_matches_the_dossier`, `test_stockout_accounting_identities`, `test_demand_recovery.py::test_semiconductor_imputer_recovers_hidden_listed_months`. | done |
| A3.1 | Expert | Ordering-cycle changes | `demand/cycles.py` (`fit_cycles`, `segment`) → `outputs/clean/account_events.csv`, `series_state.csv` | 27 cycle changes, 2022-01..2023-11 (check `DEM-CYCLE-CHANGES`). Every series has a cycle: M 1,539, A 775, B 297, Q 242, T 230 (`DEM-CYCLE-PATTERNS`). Tests `test_demand_rules.py::test_injected_cycle_changes_are_detected`, `test_null_series_give_no_false_changes`, `test_every_template_is_recovered`, `test_demand_outputs.py::test_cycle_changes`. | done |
| A3.2 | Expert | Customer switches | `demand/accounts.py` (`customer_history`, `customer_switches`) → `customer_history.csv`, `account_events.csv` | 23 switches, 2022-07..2025-05 (`DEM-CUSTOMER-SWITCHES`). The level is taken from post-switch months. Events are joined on the customer at the time. Tests `test_lost_accounts_and_switches`, `test_customer_history_supports_joins_at_time`, `test_demand_asof.py::test_account_state_follows_the_history`. | done |
| A3.3 | Expert | Lost accounts | `demand/cycles.py::lost_accounts`, `demand/accounts.py::lost_account_table` | 16 lost accounts (2025-04..2026-01; `DEM-LOST-ACCOUNTS`). Their 304 test rows are forecast 0. Test `test_demand_rules.py::test_lost_account_needs_six_silent_months_on_a_live_series`. | done |
| A3.4 | Expert | Master data vs transactions | `cleaning/master.py` (`correct_business_units`), `record_id.py` (effective launch) → `sku_master_clean.csv`; register `RC.MASTER_BU`, `RC.MASTER_LAUNCH`, `RC.SALES_BEFORE_MASTER_LAUNCH`, `RC.DOCUMENTATION` | PMP-004 business unit corrected (`MST-S1-BU`). BSS-018 launch moved from 2025-06 to 2025-02, the month of its first sales (16 cells; `MST-S2-LAUNCH`). After the correction, the business unit in `test.csv` agrees with the master on every row (`TST-BU-MASTER`, 0 violations). The stock-out `Fill_Rate_Pct` definition contradicts the data on 4,890 rows (`STK-I2-FILL-DOCUMENTATION`). Tests `test_outputs.py::test_master_clean`, `test_reference_crosscheck.py::test_blocks_fail_loudly_when_the_master_contradicts_the_ids`. | done |

### 1.3 Features & drivers

| ID | Tier | Requirement | Where delivered | Evidence | Status |
|---|---|---|---|---|---|
| F1.1 | Core | Calendar features | `features/calendar.py::calendar_frame` → `outputs/features/calendar_features.csv` | Month, quarter, days in month, year-end flags, region × month and channel × month seasonality, Thermal profile (`feature_catalogue.csv`, group `calendar`). | done |
| F1.2 | Core | Lags | `features/panel.py::panel_features` → `train_features.parquet`, `test_features.parquet` | Lags 1, 2, 3 and 12 on the full grid with explicit gaps. Test `test_model_features.py::test_trailing_statistics_do_not_look_ahead`. | done |
| F1.3 | Core | Rolling statistics | `features/panel.py` | Means and standard deviations over 3, 6 and 12 months; 12-month level and zero share. | done |
| F1.4 | Core | Intermittency class | `anomalies/profile.py::sbc` → `outputs/anomalies/series_profile.csv`; `features/panel.py::intermittency_at` | Syntetos-Boylan class per series: smooth 2,197, intermittent 749, erratic 101, lumpy 36 (check `ANM-SERIES-PROFILE`). Also as of each origin, for backtest slices (`metrics.csv`, `slice_type = intermittency`). Test `test_anomalies.py::test_series_profile`. | done |
| F2.1 | Advanced | Which indicator leads which family, and at what lag | `features/macro.py` (`leadlag_table`, `select_drivers`, `fit_sku_paths`) → `outputs/features/macro_leadlag.csv` (2,184 rows), `sku_macro_drivers.csv` (601 SKUs), `outputs/forecast/macro_sensitivity.csv` | Three drivers per family at lags 1–3 at 2026-10, for example Hydraulic PMI @2, Powertrain auto production @3, Electrical new orders @2; near-tied driver sets are averaged with posterior weights (`structural_factors.json` → `family_macro_drivers`, `family_macro_driver_sets`; check `FEAT-MACRO-LEADLAG`). Test `test_model_structural.py::test_macro_drivers_have_the_economic_sign`. | done |
| F2.2 | Advanced | Event features | `models/structural.py::event_scopes`; `anomalies/events.py`; `f_event`, `f_holiday` in `forecast.parquet` | Helios step × 1.240, Orion shutdown × 0.144, LNY / Ramadan day counts, history masks (`feature_catalogue.csv` groups `events`, `moving holiday`). Test `test_forecast_contract.py::test_cold_starts_and_window_events`. | done |
| F2.3 | Advanced | Lifecycle features | `features/lifecycle.py` (`ramp`, `phaseout`, `lifecycle_matrix`); `lifecycle_phase` in `test_grid.parquet` | Launch ramp (τ = 4.6), MEA opening ramp (τ = 6), end-of-life phase-out 0.90 … 0.42, months since launch / to end of life. Test `test_model_features.py::test_lifecycle_factors`. | done |
| F3.1 | Expert | Is the lag structure stable over time? | `outputs/backtest/macro_drivers_by_origin.csv` (15 origins); `dq_report.json` → `family_drivers_by_era`; `macro_leadlag.csv` (`era`) | Four families keep one driver at the same indicator and lag at all four decision origins and at 2026-10 (Brake auto production @1, Chassis auto production @2, Electrical new orders @2, Powertrain auto production @3); in Hydraulic, Precision and Thermal PMI leads every time but its lag moves. By era, Hydraulic's PMI lag moves from 4 to 2, and Chassis and Thermal lose their earlier drivers in 2023–2026. See [`methodology.md`](methodology.md) 6.2. | done |
| F3.2 | Expert | The shift to electric vehicles | EV term in `models/structural.py`; `f_ev` in `forecast.parquet`; dashboard Macro view "The EV shift" | Class-level, zero-lag: EV +0.0363 and ICE −0.0117 per index point (`structural_factors.json`). Removing it raises backtest WAPE + abs(bias) from 26.76 % to 28.92 % (`experiments.csv`, `components / minus_ev`). | done |

### 1.4 Forecasting

| ID | Tier | Requirement | Where delivered | Evidence | Status |
|---|---|---|---|---|---|
| M1.1 | Core | Two baselines | `models/baselines.py` (`naive_mean12`, `seasonal_naive`, `moving_average6`, `cycle_naive`) | Mean over 4 decision folds: last-12-month mean WAPE 51.62 %, seasonal naive 38.70 %, 6-month moving average 52.42 %, cycle-aware naive 31.24 % (`summary.json` → `ladder`). | done |
| M1.2 | Core | One better model | `models/structural.py` (`fit_structural`, `predict`) | Structural model: WAPE 26.11 %, bias +0.18 % (`summary.json`, `chosen_model = structural`). | done |
| M1.3 | Core | Time-based backtest | `backtest/harness.py::run_backtest_folds` → `outputs/backtest/predictions.parquet`, `metrics.csv` | Expanding-window folds; scored only on months after the origin (check `BT-FOLDS`). | done |
| M2.1 | Advanced | Intermittent-demand methods | `models/intermittent.py` (`statsforecast`: Croston, SBA, TSB, ADIDA, IMAPA) | WAPE 51.26–51.62 % on the same cells; they assume random zeros, but 98.7 % of zero months are scheduled. See [`methodology.md`](methodology.md) 7.2. | done |
| M2.2 | Advanced | A global ML model | `models/gbm.py` (LightGBM, direct multi-horizon, 32 features, 3 seeds × 300 rounds) | WAPE 26.73 %, bias +1.5 %. Failed the ensemble rule: improved 0 of 4 folds, the rule needs 3 (`summary.json` → `ensemble`). Reported as a negative result; feature importance in `gbm_importance.csv`. | done |
| M2.3 | Advanced | Rolling-origin backtest with a 19-month horizon | `backtest/stage.py`, `backtest/metrics.py` | 4 decision origins (2022-10, 2023-10, 2024-10, 2025-03) and a stress origin (2021-10), each 19 months ahead. 225,942 scored cells against unconstrained demand. WAPE and bias by family, region, channel, horizon, calendar month, cycle kind and intermittency, at 6 aggregation levels (`metrics.csv`, 34,362 rows). The demand state is rebuilt as of each origin. Tests `test_model_structural.py::test_no_leakage_after_the_origin`, `test_demand_asof.py::test_state_at_an_origin_ignores_later_data`, `test_backtest_metrics.py::test_errors_are_taken_after_aggregation`; check `BT-LEAKAGE-ORACLE`: every fold scores above its oracle. | done |
| M3.1 | Expert | New launches with no history (via `Replaces_SKU`) | Cold-start prior in `models/structural.py`; successor price in `models/forecast_stage.py::invoice_prices`; dashboard Lifecycle view draws each successor against its predecessor | 3 planned launches: PTC-029 replaces PTC-005, PMP-020 replaces PMP-003, THM-012 replaces THM-001. 10 series, 117 rows, 4,058 units. Rows start exactly at the launch (check `TST-BEFORE-LAUNCH`). `Replaces_SKU` sets timing and price. The level comes from a cross-sectional prior, because successors inherit none of the predecessor's regions, customers or channels. On the historical successor series of the decision folds (242 cells), the prior gives WAPE 38.2 % and bias +7.0 % (`predictions.parquet`). | done |
| M3.2 | Expert | End of life | `features/lifecycle.py::phaseout`; `is_post_eol` in `test_grid.parquet` | 156 rows after end of life are exactly 0: PTC-005 72, PMP-003 54, THM-001 30. 108 phase-out rows use factors 0.90 … 0.42. On rows within 11 months of end of life the phase-out lowers WAPE + abs(bias) from 73.8 % to 42.1 % (`experiments.csv`, `eol_phaseout`). Check `FC-STRUCTURAL-ZEROS`; test `test_forecast_contract.py::test_structural_zeros_are_exactly_zero`. | done |
| M3.3 | Expert | Events in the forecast window | `models/structural.py` (`event_scopes`, strike analogue); `structural_factors.json` | Helios Auto Parts India × 1.240 (1,235 rows). Orion Driveline North America 2027-07/08 × 0.144 on latent demand (62 series, 124 shutdown rows; orders 3,779 → 714 → 574 → 3,425 units for 2027-06..09). LNY / Ramadan day counts. 16 lost accounts at 0 (304 rows). Test `test_cold_starts_and_window_events`. | done |
| M3.4 | Expert | P10 / P50 / P90 ranges | `models/quantiles.py` (`row_quantiles`, `calibrate`, `aggregate_quantiles`); `p10`, `p50`, `p90` in `forecast.parquet`; `outputs/forecast/uncertainty.json`, `aggregates.csv` | Four variance components, calibrated so P10–P90 covers 80.0 % of rows, 80.0 % of family × region × month and 80.3 % of total × month in the backtest. Leave-one-origin-out coverage is reported (`summary.json` → `coverage`). Check `FC-QUANTILE-ORDER`; tests `test_model_quantiles.py::test_calibration_reaches_about_80_percent_coverage`, `test_row_quantiles_match_a_negative_binomial`. | done |
| M3.5 | Expert | Forecasts that add up across the hierarchy | Bottom-up sums of the submitted integers; `outputs/forecast/aggregates.csv` (total, family, region, channel, family × region per month) | Check `FC-HIERARCHY`: 0 violations. The 19-month total of `aggregates.csv` equals the submission total, 2,805,199 units. Aggregate quantiles come from one variance formula, never from summed row quantiles. Tests `test_forecast_contract.py::test_hierarchy_adds_up`, `test_model_quantiles.py::test_node_quantiles_match_the_reference_implementation`. | done |

### 1.5 Dashboard (tiers)

| ID | Tier | Requirement | Where delivered | Evidence | Status |
|---|---|---|---|---|---|
| D-T1 | Core | The 5 required views | `dashboard/src/views/{Overview,DataHealth,Explorer,Anomalies,Forecast}.tsx` | Section 2.2 below: every "must show" item is delivered (D5.2 and D5.3 since the fixes of 24 Nov 2026). | done |
| D-T2 | Advanced | + 2 optional views | `dashboard/src/views/` | 7 optional views (section 2.3). | done |
| D-T3 | Expert | + 4 optional views, deployed or polished | 7 optional views; one design system for all 12 views (`docs/design_system.md`, `dashboard/src/styles/tokens.css`) | Polished: shared components, light and dark themes, computed headlines, an "i" popover on every chart. A static build is in `dashboard/dist`; it is not yet deployed to a public URL. | done (polished); deployment pending |

---

## 2. Dashboard

### 2.1 Application-level requirements

| ID | Requirement | Where delivered | Evidence | Status |
|---|---|---|---|---|
| D0.1 | Any tool; runs locally with documented setup | React + TypeScript + Vite + ECharts; `dashboard/dist` (built, committed); `make dashboard`, `make dashboard-dev` | `python3 -m http.server 8000 -d dashboard/dist` (README, `docs/dashboard.md`). | done |
| D0.2 | Reads from pipeline outputs, not hand-typed numbers | `src/celeris/export/` → `dashboard/public/data/*.json`; `dist/data` is an identical copy | `meta.json`: `provisional: false`, SHA-256 of each source. The export refuses a bundle whose totals disagree with `submission.csv`. Tests `test_export_bundle.py::test_forecast_totals_equal_submission`, `test_history_totals_equal_pipeline`, `test_lost_sales_and_register_match_pipeline`, `test_export_is_deterministic`. | done |
| D0.3 | One app with two parts | Rail groups in `dashboard/src/app/context.ts`: Overview (both parts), What happened, What will happen, Act | 12 views in one single-page app. | done |
| D0.4 | Shared filters: family, SKU, region, channel, customer | `dashboard/src/components/FilterBar.tsx`; filters kept in the URL hash | All five filters apply to every view. The customer filter follows the customer at the time, across 23 switches. | done |
| D0.5 | Training-data part on the cleaned history, including unconstrained demand | Overview, Demand explorer, Stock-outs timelines (`history.json`) | Shipped history plus unconstrained demand where stock-outs censored shipments; lost sales shaded. | done |
| D0.6 | Prediction part on the forecast, with P10 / P50 / P90 | Forecast & accuracy, Overview, Procurement (`forecast.json`, `forecast_detail.json`) | Row-level P10 / P50 / P90 are the pipeline's. Aggregate ranges are recomputed in the browser (`dashboard/src/data/quantiles.ts`) with the full contract formula, `cv_common` included (fixed 24 Nov 2026); the start-up self-check reproduces the pipeline's seven reference quantiles (19-month total 2.73 M – 2.88 M). | done |
| D0.7 | History and forecast on one continuous timeline, forecast clearly marked | `dashboard/src/charts/timeline.ts`, `TimelineChart.tsx` | A "last actual" rule at 2026-10, a tinted forecast window, history in ink and forecast in orange; the forecast starts from the last actual. | done |

### 2.2 Required views

| ID | View | Must show | Where delivered | Evidence | Status |
|---|---|---|---|---|---|
| D1.1 | Executive overview (both parts) | Units and revenue trend from history into the forecast on one timeline | `views/Overview.tsx` timeline module; Units / USD switch in `components/shell/Masthead.tsx` | 2019-01 → 2028-05 in units or USD; a figure strip always shows the other measure. | done |
| D1.2 | | Mix by family, region and channel | `views/Overview.tsx` ("where the change comes from" bar table; outlook small multiples) | Shares and 12-month change by region, family or channel; click to filter. | done |
| D1.3 | | Headline 19-month forecast | `views/Overview.tsx` hero figure | Equals the submission total, 2,805,199 units (`meta.json` → `submission.matches_forecast: true`). Its range strip shows the calibrated 2.73 M – 2.88 M. | done |
| D2.1 | Data health (training) | Issues by type and file | `views/DataHealth.tsx` ("Files" table; "Issues by rule · rows affected"; issue × month heat-strip) | From `quality.json` (built from `dq_report.json` and `fix_log.parquet`). | done |
| D2.2 | | Rows affected | `views/DataHealth.tsx` | Rows and cells per rule, coloured by recovery method; row waterfall 248,248 → 245,548. | done |
| D2.3 | | Before vs after cleaning | `views/DataHealth.tsx` ("Every check, before vs after cleaning") | All 116 checks with their before and after metric. | done |
| D3.1 | Demand explorer (training) | Drill-down family → SKU → region → customer | `views/Explorer.tsx` (navigator and breadcrumb) | The level follows the filters: family → SKU → region → customer. | done |
| D3.2 | | Seasonality | `views/Explorer.tsx` ("Seasonality") | Seasonal index by year for the selection. | done |
| D3.3 | | Zero months | `views/Explorer.tsx` ("Zero-month calendar") | Every zero is labelled: scheduled off-month, lost-account tail, or a zero on an order month. | done |
| D3.4 | | Lifecycle | `views/Explorer.tsx` (series card, composition) | Status, launch, end of life, ordering cycle and its changes, customers over time. | done |
| D4.1 | Anomaly monitor (training) | Flagged points on the time series | `views/Anomalies.tsx` ("Flagged points on the series") | Diamonds for data errors fixed, triangles for real events; clusters on aggregates. | done |
| D4.2 | | Type, reason and action | `views/Anomalies.tsx` ("Anomaly register" table, "Anomalies by type") | Columns: type, class, scope, period, reason, action, confidence, impact in units and USD, event; CSV export. Built from all 11,799 register rows. | done |
| D5.1 | Forecast & accuracy (prediction) | Forecast vs history | `views/Forecast.tsx` (continuous timeline with band; backtest time machine) | The forecast continues the history; any origin's backtest can be replayed against actuals. | done |
| D5.2 | | Backtest WAPE and bias by horizon | `views/Forecast.tsx` ("WAPE by horizon", "Interval calibration") | WAPE per horizon 1–19 for every model, with the noise floor. Bias by horizon is charted too (a WAPE | Bias toggle, fixed 24 Nov 2026). | done |
| D5.3 | | Backtest WAPE and bias by family and region | `views/Forecast.tsx` ("Bias by family × region" heatmap; stairstep recomputed for any filter) | Bias for every family × region (heatmap); WAPE and bias by family, region or channel in one table against seasonal naive and the floor; WAPE or bias by horizon (toggle). Pooled over the four decision folds on common cells: final 26.1 %, LightGBM 26.7 % (as `summary.json`). | done |

### 2.3 Optional views

| ID | Optional view | Where delivered | Evidence | Status |
|---|---|---|---|---|
| O1 | Macro lead / lag heatmap | `views/Macro.tsx` ("Which indicator leads which family", lag profile by era, model-free shifted-indicator check, the EV shift, per-SKU sensitivities) | From `macro_leadlag.csv`, `macro_sensitivity.csv`, `macro_clean.csv` (`macro.json`). | done |
| O2 | What-if (for example PMI −3) | `views/WhatIf.tsx` (preset "PMI −3 from Jan 2027") | Latent demand × exp(Σ β · Δindicator at each SKU's lag), passed through each series' ordering cycle; structural zeros stay zero. | done |
| O3 | Procurement plan from P90 forecasts | `views/Procurement.tsx` | Service levels P80 / P90 / P95 / P97.5 and a lead time; buffer by SKU in units and USD; aggregate cover vs naive sum of monthly quantiles. Buffers use the full formula, `cv_common` included (fixed 24 Nov 2026). | done |
| O4 | Lifecycle (end of life and launches) | `views/Lifecycle.tsx` (lifecycle map, end-of-life run-offs, cold starts against their predecessor, recent launches) | Run-offs reach zero after the end-of-life month (business rule 5). | done |
| O5 | Stock-outs and lost sales | `views/Stockouts.tsx` | Shipped vs unconstrained demand; lost vs back-ordered units; heatmap by family × month; lost sales by year / family / region / reason; largest-loss series. Totals equal the pipeline (test `test_lost_sales_and_register_match_pipeline`). | done |
| O6 | Exception list for planners | `views/Exceptions.tsx`; rules in `src/celeris/export/exceptions.py` | 8 deterministic rules → 305 cases on 304 series, USD 70.4 M revenue at risk, ranked; each has a cause and an action (`exceptions.json`). Test `test_exceptions_are_ranked_and_explained`. | done |
| O7 | Data download | `views/Downloads.tsx` | CSV extracts of the selection, including `submission.csv` in contract format; bundle files with SHA-256; pipeline hashes from the manifest. | done |

---

## 3. Business rules

| # | Rule | Where enforced | Evidence | Status |
|---|---|---|---|---|
| 1 | `Date` is authoritative over `Year` / `Month` | `cleaning/keys.py`, `cleaning/dates.py`: raw Year / Month are dropped and recomputed from Date | 246 rows whose Month disagreed (`TRN-K5-MONTH-COLUMN`, 0 after). The 30 `2062` dates are repaired and confirmed by the load timestamp. Test `test_every_date_format_recovers_the_month`. | done |
| 2 | Repeated `Record_ID`: keep the latest `Load_Timestamp` | `cleaning/dedup.py::deduplicate` | 736 superseded loads replaced by the latest; never summed (summing would add 42,870 phantom units, register `DE.RESTATEMENT`). 17 of 17 restated stock-out months match `Shipped_Units` (`ORC-RESTATEMENT-LATEST`). Test `test_dedup_keeps_the_latest_load_and_never_sums`. | done |
| 3 | `Units_Sold = 0` is no order; a missing row is not a zero | `cleaning/record_id.py`, `cleaning/grid.py`, `demand/fill.py` | 982 missing rows kept as `missing_row`. Only those on scheduled off-months (118) or a lost tail (1) become demand 0; 837 stay unknown and are masked. Tests `test_missing_rows_stay_missing`, `test_offphase_zeros_stay_zero_and_unknown_cells_stay_nan`. | done |
| 4 | Prices are per SKU, in USD, the same in every region, changing on 1 January except listed surcharges | `cleaning/prices.py::build_price_table` → `price_table.csv` | One list price per SKU and year (2022 split for the +6 % surcharge of 2022-H2), 4,894 cells (`TRN-PRICE-TABLE`, `TRN-PRICE-SURCHARGE`). Cents, EUR and pack-of-10 prices corrected to it. Forecast prices: 2026 price × 1.045 in 2027 and × 1.0868 in 2028. Test `test_outputs.py::test_price_table`. | done |
| 5 | No sales after `EOL_Date` or before a planned `Launch_Date` | Test grid (`demand/testgrid.py`), `features/lifecycle.py`, forecast stage | 156 post-end-of-life test rows forecast 0. No test row before a launch (`TST-BEFORE-LAUNCH`, 0 violations). The one train conflict (BSS-018 sold from 2025-02, master launch 2025-06) is a master-data error; BSS-018 is not a planned launch, and the master is corrected. Tests `test_structural_zeros_are_exactly_zero`, `test_cold_starts_and_window_events`. | done |
| 6 | Customers order on their own cycle, which can change | `demand/cycles.py` (`fit_cycles`, `project_cycle`, `accumulation_weights`) | 3,083 series with a calendar cycle (`DEM-CYCLE-PATTERNS`); 27 changes. Forecasts accumulate latent demand onto the projected cycle; 8,382 off-phase test rows are 0. Tests `test_orders_accumulate_the_projected_cycle`, `test_accumulation_spans_and_carry_weights`, `test_projection_extends_the_regime_with_explicit_weights`. | done |
| 7 | Forecast unconstrained demand, not constrained shipments | `demand/unconstrained.py`; models trained on `demand_uc`; backtest scored on it (`backtest/targets.py`) | Unconstrained demand +0.91 % over shipments (Electrical +44.8 % in 2021). The forecast window carries no supply constraint. Test `test_uplift_matches_the_dossier`. | done |

---

## 4. Submission contract and portal fields

| ID | Requirement | Where delivered | Evidence | Status |
|---|---|---|---|---|
| S1 | `submission.csv`: one row per `test.csv` row | `outputs/forecast/submission.csv` (`models/forecast_stage.py`) | 58,219 rows; keys `Date, SKU_ID, Region` equal to `test.csv` in the same order (checked row by row against `data/raw/test.csv`). Check `FC-SUBMISSION-CONTRACT`. | done |
| S2 | Header `Date,SKU_ID,Region,Units_Sold_Forecast` | same | Header matches `sample_submission.csv` (check `SMP-FORMAT`). Test `test_forecast_contract.py::test_submission_contract`. | done |
| S3 | Non-negative integers, no blanks | same | Integer type; minimum 0; 0 blanks; 8,842 zeros, all structural. Rounded to the nearest integer, not floored. | done |
| S4 | Portal: Title, Description, Theme, Instructions to Run | [`submission.md`](submission.md) | Ready-to-paste text; run steps match the `Makefile` (`make -n` dry run). | done |
| S5 | Portal: Demo Link (working demo) | not yet | `dashboard/dist` is ready to host as a static site (`docs/dashboard.md`, "Deploy the static build"). | missing |
| S6 | Portal: Repository URL | not yet | Placeholder in `submission.md`. `data/raw/` is git-ignored, so the repository holds code, outputs and the built dashboard, but not the provided data. | missing |
| S7 | Portal: Source code upload (zip, at most 50 MB) | the git tree | A zip of the committed tree at `HEAD` is 40.5 MB (`git archive --format=zip HEAD`), under the limit. It excludes `data/raw/`, `node_modules/` and `research/scratch/`. | done |

---

## Gaps

The partial and missing items above, ordered by their importance to the jury, then what was fixed since the first
review.

**Open**

1. **No public demo and no repository URL yet (S5, S6, D-T3).** The site is a static build and can be hosted as it is
   (GitHub Pages or Cloudflare Pages; see `docs/dashboard.md`).

**Fixed**

- 24 Nov 2026: the aggregate P10–P90 ranges in the dashboard include the common-error term `cv_common` (both quantile
  ports, the bundle and the formula in `docs/dashboard.md`; `tests/test_export_quantiles.py`), so the 19-month total
  reads 2.73 M – 2.88 M and the first month 153,360 – 161,934, as the pipeline computes them (D0.6, O3, D1.3).
- 24 Nov 2026: the dashboard's backtest figures pool the four decision folds on the cells every model forecast
  (`tests/test_export_bundle.py::test_backtest_pools_decision_folds_on_common_cells`); the stress fold is replayed in the
  time machine only (D5.2, D5.3). It shows our model 26.1 %, LightGBM 26.7 %, seasonal naive 38.6 %, floor 23.5 %
  (pooled over the cells; 23.6 % as the mean of the folds).
- 24 Nov 2026: Forecast & accuracy shows WAPE and bias by family, region and channel in one table and has a WAPE | Bias
  toggle on the horizon chart (D5.2, D5.3); `docs/dashboard.md` says orange for the forecast and states the formula
  with `cv_common`.
- 25 Nov 2026: `outputs/backtest/summary.json` → `leakage_check.rule` named `tests/test_model_leakage.py`, which does
  not exist; it now names `tests/test_model_structural.py::test_no_leakage_after_the_origin`.
- 25 Nov 2026: the bundle was re-exported after the optimisation round (converged factor fit), the static build in
  `dashboard/dist` was rebuilt on it (`dist/data` identical to `public/data`) and the screenshots were retaken.
- 25 Nov 2026: the backtest stage runs its structural fits, leave-one-origin-out calibrations and per-fold metrics in
  three worker processes, with byte-identical outputs; `make all` takes about 11 minutes instead of about 25 (the
  backtest 600 s instead of 1,436 s on the reference machine).

Not gaps, but limits of the method, stated in [`methodology.md`](methodology.md) section 14:

- out-of-sample interval coverage varies by fold (family × region × month 63.7 %–89.7 % leave-one-origin-out);
- the Orion shutdown magnitude and the macro hump amplitude cannot be tested;
- LightGBM did not pass the ensemble rule;
- cold starts rest on a prior (fold WAPE 68.2 %).
