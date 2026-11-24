# Architecture and data contracts

Single source of truth for how the repository is laid out and what every pipeline stage writes. Builders keep this file
current when a contract changes. The evidence behind every rule is in `research/DATA_DOSSIER.md` (authoritative) and the
lens reports beside it.

## Principles

1. **Rebuild from raw.** Every output is derived from `data/raw/*.csv` by code in `src/celeris`. Nothing at runtime reads
   `research/` or `data/interim/`. Small reference tables that encode forensic findings live in `src/celeris/reference/`
   with a provenance note, and tests cross-check them against the raw data.
2. **Raw data is read-only.** Read with `dtype=str, keep_default_na=False` (the literal region `NA` must not become NaN).
   The pipeline hashes `data/raw/*` at start and asserts the hashes are unchanged at the end.
3. **One command.** `make all` runs every stage in order; each stage is also runnable alone and is idempotent.
   Running a stage invalidates every later stage (their records and outputs are deleted, see `outputs/quality/`), so
   `all` and the stages run one at a time in order give byte-identical outputs.
4. **Deterministic.** Fixed seeds, stable sort orders, no wall-clock values inside data files. Two runs give identical
   output hashes (`outputs/quality/manifest.json`).
5. **Assert the forensics.** Counts established in the dossier (245,548 grid cells, 244,566 records, 982 missing rows, …)
   are hard assertions or tests, so a regression in a rule is caught immediately.
6. **Every change is explained.** Each modified cell has a row in the fix log (rule, raw value, before, after, evidence);
   each excluded or re-interpreted demand point has a row in the anomaly register (type, cause, action).
7. **Errors vs real events.** Data errors are fixed. Real events are kept in the cleaned history and either modelled or
   masked from training, never silently deleted.

## Layout

```
data/raw/                  the seven provided CSVs (read-only)
src/celeris/
  config.py                paths, date ranges, constants, thresholds
  io.py                    raw readers, parquet/csv writers, hashing
  reference/               small lookup tables (label maps, …) + PROVENANCE.md
  cleaning/                keys, dedupe, record-id grid, prices, numeric states, macro, master, events, stockouts
  demand/                  stockout overlay, unconstrained demand, ordering cycles, account events, missing-cell treatment
  anomalies/               one-offs, event masks, anomaly register
  quality/                 data-quality checks, fix log, manifest, per-stage records + aggregator (stagelog.py)
  tables.py                column contract of train_clean.parquet across stages
  features/                calendar, holiday day counts, macro paths, lifecycle, levels
  models/                  baselines, intermittent methods, structural model, global GBM, ensemble, quantiles, reconciliation
  backtest/                rolling-origin harness and metrics
  export/                  dashboard data bundle, submission file
  cli.py                   `python -m celeris <stage>`; stages: clean, demand, anomalies, features, backtest, forecast, export, all
                           (only registered stages are callable; a later stage plugs in with one `Stage` entry in `STAGES`)
tests/                     pytest suite (schema, invariants, oracle, rule fixtures, corruption-recovery, idempotence, contract);
                           `make test` deselects `@pytest.mark.slow`, `make test-all` adds the end-to-end `all` run (~20 min)
outputs/                   everything the pipeline writes (see below)
dashboard/                 static web app; reads only `dashboard/public/data/*` written by `celeris export`
docs/                      problem statement, jury criteria, this file, methodology
research/                  forensic reports and skeptic reviews (evidence of process; not used at runtime)
Makefile                   all, clean-data, test, test-all, install (dashboard, submission added with their stages)
```

Part A lives in `src/celeris/cleaning/`: one module per dossier step (`keys` 1, `dedup` 2, `record_id` 3, `grid` 4,
`prices` 5, `numeric` 6, `macro` 11, `master` 12, plus `events`, `stockouts`, `oracle`, `profile` for test.csv /
sample_submission.csv), orchestrated by `train.py` (steps 1-6) and `stage.py` (`run_clean`, the `clean` stage). The only
hand-shipped lookup is `reference/label_aliases.csv` (see its `PROVENANCE.md`); everything else, including the
Record_ID block table, is derived from the raw files at run time.

Part B lives in `src/celeris/demand/` (dossier steps 7-9 and section 5) and `src/celeris/anomalies/` (step 10):

| Module | Content |
|---|---|
| `demand/overlay.py` | step 7(0): `Units_Sold := Shipped_Units` on 69 listed cells, revenue recomputed, fix-log rule `S0` |
| `demand/panel.py` | dense (series x month) arrays of one as-of view; nothing after `as_of` is read |
| `demand/semiconductor.py` | depth(month) x severity(series) fitted on listed semiconductor rows; S5 imputer |
| `demand/unconstrained.py` | SU algorithm: `supply_pass` (S1, S5, S2, D2) and `cycle_pass` (D3, D1, spill, suspects) |
| `demand/cycles.py` | 21 calendar templates, single-change-point segmentation, lost accounts, error rates, late-cohort prior, posteriors, accumulation span + carry weight, `project_cycle`, `accumulation_weights` |
| `demand/fill.py` | missing-cell treatment from the cycle; regional calendar index; `demand_filled` |
| `demand/accounts.py` | customer history (customer at time), switches, lost-account table |
| `demand/state.py` | `demand_state(history, as_of)`: the whole demand state as of an origin month (pure function) |
| `demand/testgrid.py` | forecast-window grid (structural zeros, cycle projection, lifecycle position) |
| `anomalies/expectation.py` | IPF multiplicative factor model, phase-aware expectation, two-pass one-off detection |
| `anomalies/events.py` | event scopes (customer at time), refined windows, measured effects (difference in differences) |
| `anomalies/masks.py` | `event_tags`, `train_mask`, `level_mask`, `train_weight` |
| `anomalies/register.py`, `profile.py` | anomaly register (episode + cell), series profile |

### As-of API (for the backtest)

```python
from celeris.config import Paths
from celeris.demand.stage import load_history
from celeris.demand.state import demand_state
history, master, _ = load_history(Paths())          # overlaid grid + stock-outs + series table
state = demand_state(history, as_of=69)              # 2024-10: cycles, lost accounts, switches, fills as known then
grid = state.project(range(70, 89))                  # p_order, on_phase, accum_span, carry_weight per series x month
from celeris.demand.cycles import accumulation_weights
weights = accumulation_weights(grid)                 # order(t) = sum weight x latent(month)
from celeris.anomalies.expectation import detect_one_offs
one_offs = detect_one_offs(state)                    # one-off flags and expectation as of the origin
```

Everything data-dependent (semiconductor model, unconstrained demand, cycles and their error rates and prior, lost
accounts, customer history and switches, regional index and fills, one-offs) is computed from months `<= as_of`
only; master data and the Record_ID blocks (planned sales windows) are reference data known in advance.

## Stage outputs

Dates are `YYYY-MM` strings; `month_idx` is months since 2019-01 (0-based). Keys are always `date, sku_id, region`.

### `outputs/clean/`

| File | Grain | Contents |
|---|---|---|
| `train_clean.parquet` | one row per grid cell (245,548), sorted by `series_no`, `month_idx` | keys, `month_idx`, `year`, `month` (recomputed from Date), `series_no` (Record_ID block, 0..3082), `record_id` (null if the row is missing), `product_family`, `business_unit`, `sku_description`, `customer`, `sales_channel`, `row_status` (`observed` / `missing_row`), `units_raw` (original text), `units_sold` (cleaned shipped units, nullable integer), `numeric_state` (one of the 15 documented states, e.g. `N0_ok`, `N11_pack_of_10`, `N12_erp_units_lost`; null on missing rows), `fix_rule` (`\|`-joined dossier rule ids that corrected an error or format in the record, in step order; null if untouched; convention fills such as the zero-row price placeholder are in the fix log only), `list_price_usd`, `unit_price_usd` (invoice price in force incl. surcharge, also on zero and missing rows), `revenue_usd`, plus the columns added by the demand and anomaly stages below |
| `price_table.csv` | SKU × price period (`YYYY`, `2022H1`, `2022H2`) | `surcharge`, `list_price_usd`, `invoice_price_usd`, `list_change_pct` (vs the previous year's list price), `n_priced_records`, `mode_share` |
| `series_blocks.csv` | series (3,083) | Record_ID block table: `series_no`, `sku_id`, `region`, `start_rec`, `end_rec`, `start_idx`, `end_idx`, `length`, `start_date`, `end_date` (the series' sales window) |
| `macro_clean.csv` | month (113) | `date`, `year`, `month`, the 8 indicators cleaned in snake_case (`ism_manufacturing_pmi`, ...), `is_forecast_window`; 2019-01 → 2028-05 |
| `sku_master_clean.csv` | SKU (601) | corrected master (`business_unit`), `launch_date` (master) and `launch_date_effective`, `eol_date`, `replaces_sku`, `lifecycle_status`, `sku_tier` (core / tail / null), `n_train_series`, `train_regions` (Record_ID order), `first_train_month`, `last_train_month`, `in_test`, `bu_corrected`, `launch_corrected` |
| `events_clean.csv` | event (68) | `event_type`, scope type/value split into `scope_region`, `scope_customer`, `scope_family`, `scope_channel`; `start_day`, `end_day`, `start_month`, `end_month` (open-ended: end of the forecast window), precisions, `open_ended`, `n_days`, `in_forecast_window`, `after_forecast_window`, `announced_pct`, `description` |
| `stockouts_clean.csv` | date × SKU × region (5,830) | typed stock-out records + `month_idx`, `realised_fill_pct`, `reason_class` (semiconductor / operational), `impact` (none / carried_in_only / shortfall) |
| `test_grid.parquet` | test row (58,219, test.csv order) | keys, `month_idx`, `year`, `month`, `series_no` (null for the 10 cold-start series), `customer`, `sales_channel`, `product_family`, `business_unit`, `powertrain_application`, `sku_tier`, `lifecycle_status`, `launch_date` (effective), `eol_date`, `replaces_sku`, `months_since_launch` (product), `series_age`, `months_to_eol`, `lifecycle_phase` (post_eol / lost_account / eol_phaseout / cold_start / just_launched / young / mature), `is_cold_start`, `is_post_eol`, `is_eol_phaseout` (months 5..0 before EOL), `is_lost_account`, `lost_since`, `cycle_pattern`, `cycle_kind` (`unknown` for cold starts), `cycle_posterior`, `p_order` (probability of an order: cycle posterior; late-cohort prior for cold starts; 0 after EOL and on lost accounts), `on_phase`, `accum_span` (latent months the order carries, counting back into train where needed; 0 off-phase), `carry_weight` (weight of each carried month: 0.5 after an annual shutdown, 1.0 otherwise, null when nothing is carried), `is_structural_zero`, `structural_zero_reason` (post_eol / lost_account / off_phase = `p_order < 0.5`) |
| `series_state.csv` | series (3,083) | demand state at 2026-10: keys, family, channel, powertrain, tier, `start_date`, `end_date`, `cycle_pattern`, `cycle_kind`, `cycle_phase`, `cycle_pattern_before`, `cycle_posterior`, `cycle_change_month` (first month of the tie window), `cycle_change_window_end`, `months_classified`, `cycle_mismatches`, `last_order_month`, `trailing_silent_months`, `is_lost_account`, `lost_since`, `pre_loss_level`, `customer_first`, `customer_at_origin`, `n_customers`, `switch_month`, `switch_level_ratio` (region-adjusted), `semiconductor_severity` |
| `account_events.csv` | event (66) | `event_type` (cycle_change 27 / customer_switch 23 / lost_account 16), `series_no`, keys, `month`, `window_end`, `before`, `after`, `level_before`, `level_after`, `level_ratio`, `level_ratio_region_adjusted`, `silent_months` |
| `customer_history.csv` | customer run (3,106) | `series_no`, `run`, `customer`, `first_idx`, `last_idx`, `n_records`: customer at time for event joins |
| `semiconductor_depth.csv` | month (19) | estimated depth of the semiconductor shortfall per month (2021-03..2022-09) |
| `regional_index.csv` | month (94) | regional calendar index behind the cycle-aware fill (one column per region) |

Columns added to `train_clean.parquet` by later stages (`celeris.tables`). The demand stage also amends
`units_sold`, `revenue_usd` and `fix_rule` on the 69 listed cells of step 7(0) (fix-log rule `S0`):

- demand stage:
  - `demand_uc` (float): unconstrained requested demand; NaN where unknown (837 on-phase missing rows, 330 ERP
    blanks, D3 on-phase cells); 0 on off-phase / lost-tail missing rows;
  - `demand_uc_method`: `shipped`, `S1_listed_requested`, `S5_semiconductor_imputed`, `S2_carry_removed`,
    `D2_hidden_stockout`, `D1_hidden_stockout`, `D1_phantom_removed`, `D3_hidden_second_month`, `spill_removed`,
    `missing_after_backorder`, `erp_unknown_order`, `missing_offphase_zero`, `missing_lost_tail_zero`,
    `missing_onphase_unknown`;
  - `is_stockout_listed`, `is_stockout_inferred` (D1 / D2 / D3, spill origins and unlisted semiconductor cells),
    `stockout_suspect` (S2 cell below 0.35 x local level: suspected hidden second month);
  - `backorder_in` (units removed as carry or spill), `backorder_out` (units pushed to the next month), `lost_units`
    (never shipped);
  - `cycle_pattern`, `cycle_kind` (regime in force in that month), `on_phase`, `accum_span`, `carry_weight` (as in
    the test grid), `is_structural_zero` (off-phase or lost tail), `is_lost_account` (lost tail);
  - `demand_filled` (known demand, 0 on structural zeros, else level x accumulated regional index; never null) and
    `is_imputed` (cell whose demand is a fill or an inferred zero);
- anomaly stage: `expected_demand` (phase-aware unconstrained expectation of the order; 0 on structural zeros),
  `is_one_off`, `event_tags` (`|`-joined), `train_mask` (reason the cell is excluded from model fitting, null if
  used), `level_mask` (reason it is excluded from level / seasonality estimation: the train mask, the semiconductor
  window, EOL phase-out or pre-switch months), `train_weight` (0 masked, 0.7 S5, 0.5 suspected stock-out, else 1).

### `outputs/quality/`

| File | Contents |
|---|---|
| `dq_report.json` | machine-readable report: `summary` (checks failing before / after by severity, cells changed by method and file, row counts, unit and revenue totals naive vs clean, numeric-state census), `files` (per input file: rows raw / clean, checks, cells changed, issues) and `checks` (per check: `check_id`, `file`, `rule`, `title`, `description`, `dimension`, `severity`, `unit`, `affected`, `expected` (dossier count, asserted), `before` / `after` metric, `breakdown`, `action`, up to 5 `examples`). Severity `error` must pass after cleaning, `warning` is a documented residual, `info` a profile fact |
| `fix_log.parquet` | one row per changed cell: `file`, `step` (dossier 7.1), `rule`, `record_id`, keys (`date`, `sku_id`, `region`), `column`, `method` (exact / approximate / unknown / format / derived / convention / dropped), `raw_value`, `before`, `after`, `evidence` (JSON). De-duplicated rows appear once with `column = <row>`; replaying the log on the raw values reproduces the cleaned record (tested) |
| `dedup_decisions.csv` | every dropped version of a repeated `Record_ID`: `record_id`, `kind` (exact_duplicate / superseded_load), kept / dropped raw row and load timestamp, `delay_days`, units and revenue of both versions, `value_changed`, keys |
| `macro_change_log.csv` | the macro rows of the fix log (56 cells + 1 dropped row) |
| `manifest.json` | SHA-256, bytes and row counts of inputs (by file name) and outputs of every stage run (path relative to `outputs/`), package and library versions; no timestamps |
| `stages/<stage>.json`, `stages/<stage>_fix_log.parquet` | the record of one stage: its checks (each with `stage`), headline, cleaned row counts, the outputs it wrote, and its fix-log rows. `celeris.quality.stagelog.publish` merges every record in stage order into `dq_report.json` (checks of all stages; `summary.stages_run`, `summary.stages.<stage>` headlines), `fix_log.parquet` and `manifest.json` after each stage. Running a stage deletes the records and outputs of later stages (a file an earlier stage also writes, `train_clean.parquet`, is kept and rewritten without the later columns) |

### `outputs/anomalies/`

| File | Contents |
|---|---|
| `anomaly_register.csv` | `anomaly_id` (deterministic: `type:key`), `level` (episode / cell), `episode_id` (cells point to their episode), `type` (`DE.*` / `RC.*` data errors and master or documentation conflicts; `RE.*` real events; `ST.*` structural and lifecycle events), `class` (`data_error` / `real_event`), `sku_id`, `region`, `product_family`, `sales_channel`, `customer` (at time), `scope`, `date_start`, `date_end`, `n_cells`, `event_id` (events calendar), `cause`, `evidence` (compact JSON: counts, witnesses, measured multipliers), `detection`, `action`, `confidence` (high / medium / low), `impact_units`, `impact_usd` (signed; see `celeris.anomalies.register`), `in_forecast_window`. Off-phase cycle zeros are structure and are not registered; formatting errors are one episode per rule (the fix log holds their cells) |
| `series_profile.csv` | one row per series (3,083): keys, family, BU, channel, powertrain, tier, lifecycle status, effective launch, EOL, replaced SKU, history window, cycle (pattern, kind, phase, posterior, before, change month), customer first / at origin / count, switch month and ratio, lost-account flag / month / pre-loss level, Syntetos-Boylan ADI, CV² and class (full life and last 36 months, on `demand_uc`), `level_last12` (monthly-equivalent, one-offs at expectation), `mean_monthly_demand`, `n_orders`, `mean_order`, `zero_share`, stock-out exposure (listed, inferred, suspected months, lost units, unconstraining uplift), `n_missing_rows`, `n_imputed`, `n_one_offs`, `n_fixes`, `n_anomaly_cells` |

### `outputs/backtest/`, `outputs/forecast/`

| File | Contents |
|---|---|
| `backtest/predictions.parquet` | origin, model, keys, horizon, actual (unconstrained), prediction, quantiles |
| `backtest/metrics.csv` | WAPE, bias and WAPE + \|bias\| by origin × model × slice (family, region, channel, horizon, calendar month, level) |
| `forecast/forecast.parquet` | one row per test row: mean (submitted), P10, P50, P90, the multiplicative components behind the mean |
| `forecast/submission.csv` | `Date, SKU_ID, Region, Units_Sold_Forecast` — 58,219 rows, non-negative integers |

### `dashboard/public/data/`

Compact JSON written by `celeris export`; the dashboard reads nothing else and no number in it is typed by hand.
The file list, what each is built from and which view loads it are in `docs/dashboard.md`. The stage writes nothing
under `outputs/`; `meta.json` records, per modelling input, whether the real file or the dev-only stand-in in
`outputs/_provisional/` was used. The destination is `Paths.bundle_dir` (`--bundle-dir`): `dashboard/public/data` for
the default outputs root, `<out-dir>/dashboard_bundle` when `--out-dir` points anywhere else, so runs into a temporary
directory (tests, experiments) never rewrite the dashboard's bundle.

## Metrics

- `WAPE = Σ|actual − forecast| / Σ actual` over the selected cells (never an average of per-series WAPEs).
- `bias = Σ(forecast − actual) / Σ actual`.
- Backtests score against unconstrained demand, with a 19-month horizon and rolling origins.

## Contracts for the modelling and dashboard builds

These were fixed before modelling and the dashboard were built in parallel. Change them only by editing this section.

### Ownership

| Area | Owner | Paths |
|---|---|---|
| Features, models, backtest, forecast | modelling | `src/celeris/{features,models,backtest}/`, stages `features`, `backtest`, `forecast`, `outputs/{features,backtest,forecast}/`, `tests/test_model_*.py`, `tests/test_backtest_*.py`, `tests/test_forecast_*.py`, `docs/modelling.md` |
| Export and web app | dashboard | `src/celeris/export/`, stage `export`, `dashboard/`, `tests/test_export_*.py`, `docs/dashboard.md` |

Shared files (`src/celeris/cli.py`, `config.py`, `tables.py`, `Makefile`, `pyproject.toml`, this file): re-read immediately
before editing and make small additive edits in your own part only.

### `outputs/forecast/forecast.parquet` — one row per `test.csv` row (58,219), in `test.csv` order

| Column | Meaning |
|---|---|
| `date`, `sku_id`, `region` | keys |
| `forecast` | submitted value: non-negative integer |
| `mean` | conditional mean of the order in that month before rounding (0 on structural zeros) |
| `p10`, `p50`, `p90` | row-level quantiles of the order, integers, `p10 ≤ p50 ≤ p90` |
| `latent_mean` | monthly-equivalent latent demand for the month, defined on every row including off-phase months (0 only for lost accounts, after end of life and before launch) |
| `level`, `f_season`, `f_holiday`, `f_macro`, `f_ev`, `f_lifecycle`, `f_event` | multiplicative components; their product equals `latent_mean` |
| `accum_span`, `carry_weight`, `structural_zero_reason` | cycle placement, copied from `outputs/clean/test_grid.parquet` |
| `pred_<member>` | each ensemble member's mean for the row |
| `var_noise` | variance of the order noise, independent across rows |
| `cv_level` | relative standard deviation of the series-level error, common to every month of the series |
| `cv_group` | relative standard deviation of the error shared by all series of the same family × region |
| `cv_common` | relative standard deviation of the error shared by every row (period-level bias; added by the modelling build, same value on every row) |
| `price_usd`, `revenue_mean` | assumed invoice price for the month and `mean × price_usd` |

`order(t) = Σ weight × latent_mean(month)` over the months the order carries (`celeris.demand.cycles.accumulation_weights`),
so a consumer can recompute orders after scaling latent demand (used by the what-if view).

**Quantiles of any aggregate** (any filter selection, one month or several):

```
M = Σ mean
V = Σ var_noise
  + Σ over series  (cv_level × Σ of that series' selected means)²
  + Σ over groups  (cv_group × Σ of that family×region's selected means)²
  + (cv_common × M)²                                   (modelling build addition; 0 reproduces the original formula)
sigma² = ln(1 + V / M²),  mu = ln M − sigma² / 2,  Pq = exp(mu + z_q × sigma)      (0 when M = 0)
```

with `z = −1.2816, 0, +1.2816` for P10, P50, P90. `celeris.models.quantiles.aggregate_quantiles` is the reference
implementation; the dashboard ports it exactly. The modelling stage calibrates `cv_level`, `cv_group` and `cv_common` on the backtests
so that P10–P90 covers about 80 % at series, SKU, family × region and total level, and writes the parameters and the
measured coverage to `outputs/forecast/uncertainty.json`. For a single row the dashboard shows the row-level `p10/p50/p90`.

### Other modelling outputs

| File | Contents |
|---|---|
| `outputs/forecast/submission.csv` | `Date, SKU_ID, Region, Units_Sold_Forecast` in `test.csv` order |
| `outputs/forecast/macro_sensitivity.csv` | `sku_id, channel_group` (`aftermarket` / `other`), `indicator`, `lag`, `beta` = change in log latent demand per +1 unit of the cleaned indicator at that lag |
| `outputs/features/macro_leadlag.csv` | `product_family, indicator, lag` (0–12), `corr`, `era` (`all`, `2019-2022`, `2023-2026`), `is_driver` |
| `outputs/backtest/predictions.parquet` | `origin, model, date, sku_id, region, horizon` (1–19), `actual` (unconstrained demand, null if masked), `pred`, `is_scored`; `p10, p50, p90` for the final model |
| `outputs/backtest/metrics.csv` | `origin` (or `mean`), `model`, `level` (`series`, `sku`, `family_region`, `family`, `region`, `total`), `slice_type` (`all`, `family`, `region`, `channel`, `horizon`, `horizon_bucket`, `calendar_month`, `cycle_kind`, `intermittency`), `slice_value`, `n_cells`, `actual_sum`, `pred_sum`, `abs_err_sum`, `wape`, `bias` |
| `outputs/backtest/summary.json` | model ladder (naive → seasonal naive → cycle-aware → structural → final) with mean WAPE and bias across origins, noise-floor estimate, quantile coverage by level, the chosen model and why |

**Modelling build notes (additive refinements of the contract above, made by the modelling build):**

- Model names in `predictions.parquet` / `metrics.csv` / `summary.json`: `naive` (last-12-month mean), `seasonal_naive`,
  `moving_average` (6 months), `croston`, `sba`, `tsb`, `adida`, `imapa`, `cycle_aware` (cycle mask × accumulation ×
  24-month level), `structural`, `gbm`, `ensemble`, `oracle` (in-hindsight level: the noise floor, not a forecast) and
  `final` (the submitted model; the only one with `p10/p50/p90`). Origins are `YYYY-MM` labels: decision folds
  2022-10, 2023-10, 2024-10, 2025-03 and the stress fold 2021-10 (excluded from `mean` and from every decision).
- **Why `cv_common` was added**: with independent series and family × region errors only, the calibrated P10–P90
  covered 47 % of total × month actuals in the backtest, because each fold carries a period-level bias common to all
  series (-1.2 % .. +1.1 % in the final configuration). A common component fixes the total level without widening rows.
- `metrics.csv` has one more `slice_type`, `subset`, with values `all_scored`, `excl_lost_accounts`, `excl_one_offs`,
  `excl_lost_and_one_offs`, `excl_event_masked` (the with / without comparisons of dossier 6.7). `origin = mean` is
  the average WAPE / bias of the four decision folds (sums are totals over them).
- `summary.json` ladder entries carry `model`, `label`, `wape`, `bias`, `score` (= WAPE + |bias|, means over the
  decision folds) plus `mean_over_decision_folds` and `by_origin` details; top-level `noise_floor_wape`,
  `chosen_model`, `why`, `coverage`, `experiments` (per experiment: `default` = `shipped_variant`,
  `best_by_mean_score`, `gain_vs_default`, `rule_indication`, `variants`), `leakage_check`.
- `forecast.parquet`: `level` is the series level (including the expected one-off volume of Direct OEM / Tier-1
  series, +1.2 % as of 2026-10) expressed at the level-window (last 24 months) average of the macro and EV factors, so `f_macro` and `f_ev` are multipliers relative to that window; `f_event` is the Helios India
  programme step (the level is on the pre-step scale) times the Orion 2027-07/08 shutdown multiplier; `f_lifecycle` is
  the launch ramp × EOL phase-out (0 after EOL). `pred_<member>` lists the ensemble members only (`pred_structural`
  when the structural model ships alone).
- `uncertainty.json`: `noise_a`, `noise_b` (per region), `noise_scale` define `var_noise = noise_scale × (a·m + b·m²)`
  (plus an Orion multiplier term on rows that carry a shutdown month); `cv_level` is a map by lifecycle segment
  (`mature`, `young`, `cold_start`), `cv_group` and `cv_common` numbers. Consumers should use the row columns of
  `forecast.parquet`, which already hold the values per row; `coverage` holds the measured P10–P90 coverage by level.
- `macro_sensitivity.csv` and `macro_leadlag.csv` name indicators by their cleaned column names in `macro_clean.csv`
  (`ism_manufacturing_pmi`, …, `ev_adoption_index`).
- Extra files: `outputs/features/{feature_catalogue.csv, calendar_features.csv, sku_macro_drivers.csv,
  train_features.parquet, test_features.parquet}`, `outputs/backtest/{experiments.csv, macro_drivers_by_origin.csv,
  gbm_importance.csv, uncertainty_calibration.json}`, `outputs/forecast/{aggregates.csv (bottom-up sums and aggregate
  P10/P50/P90 per month for total, family, region, channel, family × region), structural_factors.json (fitted seasonal
  profiles, holiday depths, EV betas, event multipliers, family macro drivers)}`. Methodology: `docs/modelling.md`.
