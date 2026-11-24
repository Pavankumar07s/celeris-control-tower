// Shapes of the JSON files written by `python -m celeris export` (src/celeris/export). Columnar: one array per field.

export type Num = number | null;
export type Dict = { dict: string[]; codes: number[] };

export interface SelfCheck {
  label: string;
  family?: string;
  sku?: string;
  region?: string;
  channel?: string;
  customer?: string;
  months: number[];
  mean_sum: number;
  p10: number;
  p50: number;
  p90: number;
}

export interface LadderEntry {
  model: string;
  wape: number;
  bias: number;
  cells: number;
}

export interface Meta {
  bundle_version: number;
  package_version: string;
  provisional: boolean;
  sources: Record<string, { path: string; provisional: boolean }>;
  source_sha256: Record<string, string>;
  pipeline_sha256: Record<string, string>;
  startup_files: string[];
  files: { path: string; bytes: number; sha256: string }[];
  rows: Record<string, number>;
  submission: { rows: number; total_units: number; matches_forecast: boolean };
  price_assumption: { vs_2026_pct: Record<string, number> };
  uncertainty: Record<string, unknown>;
  /** `origins`: every backtest origin (the time machine replays all); `scored_origins`: the decision folds that are
   *  pooled into every WAPE and bias (the stress fold is replayed but never pooled). */
  backtest: { models: string[]; final: string; origins: string[]; scored_origins?: string[]; ladder: LadderEntry[]; noise_floor: number | null };
  members: string[];
  quantile_selfcheck: SelfCheck[];
}

export interface Dims {
  months: { first: string; count: number; as_of: number; window: [number, number] };
  families: { name: string[]; code: string[]; bu: string[] };
  regions: string[];
  channels: string[];
  customers: string[];
  skus: {
    id: string[];
    family: number[];
    description: (string | null)[];
    size_class: (string | null)[];
    powertrain: (string | null)[];
    launch: (string | null)[];
    launch_master: (string | null)[];
    eol: (string | null)[];
    replaces: (string | null)[];
    status: (string | null)[];
    tier: (string | null)[];
  };
  series: {
    sku: number[];
    region: number[];
    channel: number[];
    customer: number[];
    start: Num[];
    end: Num[];
    start_rec: Num[];
    in_test: number[];
    cycle: (string | null)[];
    cycle_kind: (string | null)[];
    lost: number[];
    lost_since: (string | null)[];
    switch_month: (string | null)[];
  };
  segments: { series: number[]; customer: number[]; start: number[]; length: number[] };
  events: {
    id: string[];
    type: string[];
    scope_type: string[];
    scope_value: string[];
    region: (string | null)[];
    customer: (string | null)[];
    family: (string | null)[];
    channel: (string | null)[];
    start: number[];
    end: number[];
    start_day: (string | null)[];
    end_day: (string | null)[];
    n_days: Num[];
    in_window: number[];
    announced_pct: Num[];
    description: string[];
  };
  prices: { years: number[]; h2_2022_column: number; width: number; values: Num[] };
  flag_bits: Record<string, number>;
  accum_mask: number;
}

export interface HistoryFile {
  u: Num[];
  f: number[];
  d_gap: number[];
  d_val: number[];
}

export interface ForecastFile {
  series: number[];
  start: number[];
  length: number[];
  cv_level: number[];
  group: number[];
  groups: { family: number[]; region: number[]; cv_group: number[] };
  /** Market-wide coefficient of variation shared by every row (the (cv_common × M)² term). */
  cv_common?: number;
  forecast: number[];
  mean: number[];
  var_noise: number[];
  zero_reason: number[];
  zero_reasons: string[];
  price: number[];
}

export interface ForecastDetail {
  p10: number[];
  p50: number[];
  p90: number[];
  latent_mean: number[];
  accum: number[];
  factors: Record<"level" | "f_season" | "f_holiday" | "f_macro" | "f_ev" | "f_lifecycle" | "f_event", number[]>;
  members: Record<string, number[]>;
}

export interface ProfilesFile {
  series: Record<string, (number | string | null)[]>;
  account_events: Record<string, (number | string | null)[]>;
}

export interface Check {
  stage: string;
  check_id: string;
  file: string;
  rule: string;
  title: string;
  description: string;
  dimension: string;
  severity: "error" | "warning" | "info";
  unit: string;
  affected: number;
  expected: number | null;
  before: { metric: string; value: number; passed: boolean };
  after: { metric: string; value: number; passed: boolean };
  breakdown: Record<string, number>;
  action: string;
  examples: Record<string, unknown>[];
}

export interface QualityFile {
  summary: {
    files: number;
    checks: number;
    checks_failing_before: number;
    checks_failing_after: Record<string, number>;
    cells_changed: number;
    cells_changed_by_method: Record<string, number>;
    cells_changed_by_file: Record<string, number>;
    rows_dropped: number;
    train_rows_raw: number;
    train_records: number;
    train_grid_cells: number;
    train_missing_rows: number;
    train_numeric_states: Record<string, number>;
    train_units_naive: number;
    train_units_clean: number;
    train_revenue_naive_usd: number;
    train_revenue_clean_usd: number;
    stages: Record<string, Record<string, unknown>>;
  };
  files: {
    file: string;
    rows_raw: number;
    rows_clean: number | null;
    checks: number;
    checks_failing_before: number;
    checks_failing_after: Record<string, number>;
    cells_changed: number;
    cells_changed_by_method: Record<string, number>;
    rows_dropped: number;
    issues: { check_id: string; rule: string; title: string; unit: string; affected: number; severity: string }[];
  }[];
  checks: Check[];
  waterfall: { step: string; value: number; kind: "total" | "delta" }[];
  issues: {
    rows: {
      file: string;
      rule: string;
      step: number;
      title: string;
      dimension: string | null;
      action: string | null;
      cells: number;
      rows: number;
      columns: string[];
      methods: Record<string, number>;
      convention_only: boolean;
    }[];
  };
  heat: { rules: string[]; counts: number[][] };
  dedup: { by_kind: Record<string, number>; value_changed: number; delay_days: Record<string, number>; units_dropped_if_kept: number; units_kept: number };
}

export interface AnomalyFile {
  n: number;
  id: string[];
  level: Dict;
  episode: number[];
  episode_ids: string[];
  type: Dict;
  class: Dict;
  series: number[];
  sku: Dict;
  region: Dict;
  family: Dict;
  channel: Dict;
  customer: Dict;
  scope: Dict;
  start: number[];
  end: number[];
  n_cells: Num[];
  event_id: Dict;
  cause: Dict;
  evidence: (string | null)[];
  detection: Dict;
  action: Dict;
  confidence: Dict;
  impact_units: Num[];
  impact_usd: Num[];
  in_window: number[];
}

export interface StockoutFile {
  listed: {
    series: number[];
    month: number[];
    requested: number[];
    carried_in: number[];
    shipped: number[];
    backordered: number[];
    lost: number[];
    fill_pct: Num[];
    days: number[];
    reason: string[];
    reason_class: string[];
  };
  cells: {
    series: number[];
    month: number[];
    lost: number[];
    lost_usd: number[];
    backorder_out: Num[];
    backorder_in: Num[];
    method: string[];
    listed: number[];
    inferred: number[];
    reason: string[];
    shipped: Num[];
    demand: Num[];
  };
}

export interface MacroFile {
  indicators: string[];
  labels: string[];
  values: Record<string, Num[]>;
  repaired: { month: number[]; indicator: string[]; rule: string[]; before: string[]; after: string[] };
  leadlag: { eras: string[]; lags: number; corr: Num[][][][]; driver_lag: number[][] };
  sensitivity: { sku: number[]; channel_group: string[]; indicator: number[]; lag: number[]; beta: number[] };
}

export interface BacktestFile {
  models: string[];
  final: string;
  origins: string[];
  scored_origins?: string[];
  buckets: [number, number][];
  ladder: LadderEntry[];
  noise_floor: number | null;
  series_buckets: {
    series: number[];
    bucket: number[];
    actual: number[];
    n: number[];
    abs: Record<string, Num[]>;
    err: Record<string, Num[]>;
    n_q: number[];
    below_p10: number[];
    above_p90: number[];
  };
  fine: {
    family: number[];
    region: number[];
    channel: number[];
    horizon: number[];
    actual: number[];
    abs: Record<string, Num[]>;
    err: Record<string, Num[]>;
  };
  metrics: Record<string, (number | string | null)[]>;
  summary: Record<string, unknown>;
}

export interface BacktestOrigin {
  origin: string;
  origin_month: number;
  final: string;
  baseline: string;
  series: number[];
  horizons: number;
  actual: Num[];
  pred: Num[];
  baseline_pred: Num[];
}

export interface ExceptionFile {
  rules: Record<string, { title: string; at_risk: string }>;
  rule: string[];
  series: number[];
  family: number[];
  region: number[];
  start: number[];
  end: number[];
  start_label: string[];
  metric: number[];
  cause: string[];
  action: string[];
  impact_units: number[];
  revenue_at_risk: number[];
  group: string[];
}

export interface LineageFile {
  fixes: {
    series: number[];
    month: number[];
    step: number[];
    rule: string[];
    column: string[];
    method: string[];
    raw: (string | null)[];
    before: (string | null)[];
    after: (string | null)[];
    evidence: (string | null)[];
  };
  dropped: {
    series: number[];
    month: number[];
    record_id: string[];
    kind: string[];
    kept_load: string[];
    dropped_load: string[];
    delay_days: Num[];
    units_kept: (string | null)[];
    units_dropped: (string | null)[];
    value_changed: number[];
  };
}
