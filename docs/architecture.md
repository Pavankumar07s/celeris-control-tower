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
  quality/                 data-quality report, fix log, manifest
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

Columns added to `train_clean.parquet` by later stages:

- demand stage: `demand_uc` (unconstrained demand; NaN where unknown), `demand_uc_method`, `is_stockout_listed`,
  `is_stockout_inferred`, `backorder_in`, `lost_units`, `cycle_kind`, `on_phase`, `is_structural_zero`,
  `is_lost_account`, `demand_filled` (cycle-aware fill for display and lags) and `is_imputed`;
- anomaly stage: `is_one_off`, `event_tags`, `train_mask` (reason the cell is excluded from model fitting, null if
  used), `train_weight`.

### `outputs/quality/`

| File | Contents |
|---|---|
| `dq_report.json` | machine-readable report: `summary` (checks failing before / after by severity, cells changed by method and file, row counts, unit and revenue totals naive vs clean, numeric-state census), `files` (per input file: rows raw / clean, checks, cells changed, issues) and `checks` (per check: `check_id`, `file`, `rule`, `title`, `description`, `dimension`, `severity`, `unit`, `affected`, `expected` (dossier count, asserted), `before` / `after` metric, `breakdown`, `action`, up to 5 `examples`). Severity `error` must pass after cleaning, `warning` is a documented residual, `info` a profile fact |
| `fix_log.parquet` | one row per changed cell: `file`, `step` (dossier 7.1), `rule`, `record_id`, keys (`date`, `sku_id`, `region`), `column`, `method` (exact / approximate / unknown / format / derived / convention / dropped), `raw_value`, `before`, `after`, `evidence` (JSON). De-duplicated rows appear once with `column = <row>`; replaying the log on the raw values reproduces the cleaned record (tested) |
| `dedup_decisions.csv` | every dropped version of a repeated `Record_ID`: `record_id`, `kind` (exact_duplicate / superseded_load), kept / dropped raw row and load timestamp, `delay_days`, units and revenue of both versions, `value_changed`, keys |
| `macro_change_log.csv` | the macro rows of the fix log (56 cells + 1 dropped row) |
| `manifest.json` | SHA-256, bytes and row counts of inputs (by file name) and outputs (path relative to `outputs/`), package and library versions; no timestamps |

### `outputs/anomalies/`

| File | Contents |
|---|---|
| `anomaly_register.csv` | `anomaly_id`, `level` (cell / episode), keys or scope, `date_start`, `date_end`, `type`, `class` (`data_error` / `real_event`), `cause`, `evidence`, `action`, `confidence`, `impact_units`, `impact_usd` |
| `series_profile.csv` | one row per series: lifecycle dates, ordering cycle (kind, phase, changes), customer history, lost-account flag, intermittency class, level statistics |

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
