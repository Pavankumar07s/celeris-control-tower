"""Feature catalogue (problem statement workstream 3): name, group, definition, source and the models that use it.

Written to ``outputs/features/feature_catalogue.csv`` by the ``features`` stage. Groups follow the workstream tiers:
calendar / lags and rolling / intermittency (Core), macro lead-lag / events / lifecycle (Advanced), lag stability and
the EV shift (Expert).
"""

from __future__ import annotations

import pandas as pd

from celeris.features.panel import LAGS, WINDOWS
from celeris.models.gbm import FEATURES as GBM_FEATURES

S = "structural"
G = "gbm"
B = "baselines"
D = "dashboard"

_ROWS: list[tuple[str, str, str, str, str]] = [
    # calendar (Core)
    ("month", "calendar", "Calendar month 1..12 of the requested delivery month", "test.csv / train Date", f"{S} (season), {G} (calendar_month)"),
    ("quarter", "calendar", "Calendar quarter 1..4", "Date", D),
    ("days_in_month", "calendar", "Days in the month", "Date", D),
    ("is_december / is_january", "calendar", "Year-end flags (ordinary channel year-end pattern)", "Date", D),
    ("f_season", "calendar", "Region x calendar-month x channel x calendar-month seasonality (+ Thermal x month), each profile averaging 1, estimated per origin by ratio of sums", "train_clean demand_uc (fit cells)", f"{S}, {G}"),
    ("lny_days_apac", "moving holiday", "Days of the Lunar New Year window in the month (Asia Pacific); 2027-02: 10, 2028-01: 6, 2028-02: 4", "events_calendar.csv (day-precision Holiday rows)", S),
    ("ramadan_days_mea", "moving holiday", "Days of Ramadan in the month (Middle East & Africa); 2027-02: 21, 2027-03: 9, 2028-01: 4, 2028-02: 26", "events_calendar.csv", S),
    ("f_holiday", "moving holiday", "1 - depth x days / window length (LNY 10 days, Ramadan 30 days); depths estimated per origin by Poisson MLE", "events_calendar.csv + demand_uc", f"{S}, {G}"),
    # lags and rolling (Core)
    *[(f"lag_{k}", "lags / rolling", f"Filled unconstrained demand {k} month(s) before, on the full grid with explicit gaps", "train_clean demand_filled", D) for k in LAGS],
    *[(f"roll_mean_{w}", "lags / rolling", f"Trailing {w}-month mean of filled unconstrained demand (months before t)", "demand_filled", D) for w in WINDOWS],
    *[(f"roll_std_{w}", "lags / rolling", f"Trailing {w}-month standard deviation of filled unconstrained demand", "demand_filled", D) for w in WINDOWS],
    ("level_me_12", "lags / rolling", "Trailing 12-month monthly-equivalent level: sum of demand / latent months the orders carried (cycle-aware)", "demand_filled, accum_span, carry_weight", f"{B} (cycle_aware uses 24 months)"),
    ("zero_share_12", "lags / rolling", "Share of zero months in the trailing 12 (scheduled off-months included)", "demand_filled", D),
    ("ratio_level12 / ratio_level36 / ratio_level_all", "level", "De-factored level over the last 12 / 36 months / all history relative to the 24-month level", "demand_uc / structural factors", G),
    ("resid3 / resid6 / resid12", "level", "Recent in-sample residual ratio: demand / fitted expectation over the last 3 / 6 / 12 months", "demand_uc / structural fit", G),
    ("level", "level", "Forecast level: ratio of sums of de-factored unconstrained demand over the last 24 months of level cells (arithmetic, mean-unbiased); credibility blend with the cross-sectional prior for series younger than 24 months; prior for cold starts", "train_clean (level_mask, train_weight)", S),
    ("prior_level / ratio_prior", "level", "Cross-sectional level prior: log-linear model on family, tier x region, channel and powertrain of mature series, smeared to the mean", "series levels as of the origin", f"{S}, {G}"),
    # intermittency (Core)
    ("sbc_adi_36 / sbc_cv2_36 / sbc_class_36", "intermittency", "Syntetos-Boylan ADI, CV^2 and class (smooth / intermittent / erratic / lumpy; cut-offs 1.32 / 0.49) on the trailing 36 months; reporting only, the zeros are scheduled by the cycle", "demand_uc", f"{G} (adi, cv2), backtest slices"),
    ("cycle_kind / accum_span / carry_weight", "ordering cycle", "Ordering-cycle regime (M / A / B / Q / T), latent months an order carries and the weight of carried months (0.5 after an annual shutdown)", "outputs/clean/test_grid.parquet, demand state", f"{S} (accumulation), {G}, {B}"),
    # macro (Advanced / Expert)
    ("macro_leadlag (family x indicator x lag 0..12 x era)", "macro lead-lag", "Weighted correlation of the family macro index (de-seasonalised, de-levelled, EV removed) with each standardised indicator at lags 0..12, by era; is_driver = selected by forward selection in that era", "macro_clean.csv + demand_uc", "outputs/features/macro_leadlag.csv"),
    ("family drivers", "macro lead-lag", "Up to 3 indicators per family by forward selection (economic sign, chi-square gain >= 9) at their best lag 0..6, with a lag posterior from the deviance profile; refit at every origin", "macro_clean.csv + demand_uc", S),
    ("f_macro", "macro", "SKU macro multiplier exp(lm(t)) relative to its level-window mean; lm = soft-capped (slope 0.5 above 0.25) sum of SKU coefficients x indicators averaged over the SKU lag posterior; coefficients shrunk to the family (prior sd 0.06 per sd); 2021-01..2022-11 amplitude x0.9; Aftermarket = damping x path + Fuel at lag 1", "macro_clean.csv (known values for target months)", f"{S}, {G}"),
    ("macro_sensitivity", "macro", "Change in log latent demand per +1 unit of each indicator at each lag, per SKU and channel group", "fitted SKU paths", "outputs/forecast/macro_sensitivity.csv (what-if)"),
    ("f_ev", "EV shift", "exp(beta_class x (EV index(t) - level-window mean)), zero lag, class level (EV / ICE; Universal 0), betas by Poisson MLE per origin", "macro_clean.csv EV_Adoption_Index", f"{S}, {G}"),
    # lifecycle (Advanced / Expert)
    ("months_since_launch", "lifecycle", "Months since the product launch (effective launch date; BSS-018 2025-02)", "sku_master_clean.csv", f"{S}, {D}"),
    ("series_age", "lifecycle", "Months since the series' first month (region age for the MEA opening cohort)", "series_blocks.csv", G),
    ("months_to_eol", "lifecycle", "Months to the EOL date (negative after EOL)", "sku_master_clean.csv", f"{S}, {G}"),
    ("f_lifecycle", "lifecycle", "Launch ramp 1 - exp(-(k+1)/4.6) on product age (launches), 1 - exp(-(k+1)/6) on series age (MEA opening cohort), times the EOL phase-out 0.90 / 0.81 / 0.71 / 0.61 / 0.52 / 0.42 at 5..0 months to EOL; 0 after EOL", "sku_master_clean.csv, series_blocks.csv", f"{S}, {G}"),
    ("lifecycle_phase", "lifecycle", "post_eol / lost_account / eol_phaseout / cold_start / just_launched / young / mature", "outputs/clean/test_grid.parquet", D),
    # events (Advanced)
    ("f_event", "events", "Helios Auto Parts India programme step (measured multiplier, half exposure in 2025-09) x Orion Driveline North America 2027-07/08 shutdown (measured Nexon 2023 strike multiplier, no catch-up), customer at time", "events_clean.csv + customer_history.csv + demand_uc", f"{S}, {G}"),
    ("event masks (history)", "events", "COVID 2020-02..09, pre-buy T1 + AM 2022-12..2023-02, Nexon strike, Red Sea Export EU / MEA, one-offs, unknown targets: excluded from fitting (train_mask); semiconductor window, EOL phase-out and pre-switch months excluded from levels (level_mask)", "train_clean train_mask / level_mask", S),
    ("one_offs12 / imputed12", "data quality", "One-off orders and imputed cells in the last 12 months", "train_clean is_one_off / is_imputed", G),
]


def feature_catalogue() -> pd.DataFrame:
    """The catalogue as a frame (one row per feature or feature family)."""
    frame = pd.DataFrame(_ROWS, columns=["name", "group", "definition", "source", "used_by"])
    gbm = set(GBM_FEATURES)
    frame["in_gbm"] = frame["name"].map(lambda n: any(part.strip() in gbm for part in n.replace("/", " ").split()))
    return frame
