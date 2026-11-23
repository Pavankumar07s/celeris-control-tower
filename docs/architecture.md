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
tests/                     pytest suite (schema, invariants, oracle, rule fixtures, corruption-recovery, idempotence, contract)
outputs/                   everything the pipeline writes (see below)
dashboard/                 static web app; reads only `dashboard/public/data/*` written by `celeris export`
docs/                      problem statement, jury criteria, this file, methodology
research/                  forensic reports and skeptic reviews (evidence of process; not used at runtime)
Makefile                   all, clean-data, test, install (dashboard, submission added with their stages)
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

## Metrics

- `WAPE = Σ|actual − forecast| / Σ actual` over the selected cells (never an average of per-series WAPEs).
- `bias = Σ(forecast − actual) / Σ actual`.
- Backtests score against unconstrained demand, with a 19-month horizon and rolling origins.
