# events-calendar lens: every event in events_calendar.csv and its measured effect

## Headline

`events_calendar.csv` is formally clean: 68 rows, two date precisions (48 starts are `YYYY-MM`, 20 are `YYYY-MM-DD`), one open-ended event (EV-052), three `Customer | Region` scopes, and no label variants. Every Scope_Value matches a canonical train label. All holiday dates are the real calendar dates: Lunar New Year (LNY) is always 10 days and Ramadan always 30 days.

I measured each event with three methods that do not share code:
- **M**: a multiplicative factor model.
- **F**: a model-free difference-in-differences on the cleaned panel.
- **V**: a fully independent re-derivation from the rough-clean table, written for this pass.

They agree, and these effects are real:
- **Moving holidays.** One rule covers both: the month multiplier is `1 - 0.30 x share of the event's days falling in that month`. LNY in Asia Pacific (APAC) has depth 0.305 ± 0.017. Ramadan in Middle East & Africa (MEA) has depth 0.24 to 0.32 depending on the method.
- **Fixed-month regional dips.** North America July x0.83 and Europe August x0.63 are listed. Four more recur every year but are not in the calendar: APAC October x0.81, Latin America (LATAM) January x0.85, India June x0.90 and India October x1.08. The India October peak is not tied to the Diwali date.
- **Stocking-channel year-end pattern.** Every year, Tier-1 Distributor and Aftermarket (T1+AM) run Dec x1.12 and Jan x0.91 relative to Direct OEM and Export (OEM+EXP).
- **The announced 9 % rise of 2023 (EV-030).** T1+AM bought ahead: a further x1.41 in Dec 2022, then x0.69 in Jan 2023 and x0.84 in Feb 2023. Over the three months the volume nets out.
- **COVID lockdowns.** They follow the listed region-months, with a trough of x0.05 in India in April 2020.
- **Nexon x Europe strike (EV-038).** x0.145 in 2023-10 and 2023-11, with no catch-up.
- **Red Sea disruption (EV-039).** Export x {Europe, MEA} only: x0.62, x0.62, then x1.61 in March 2024.
- **Helios x India second line (EV-052).** A permanent step of x1.24 from 2025-10.
- **MEA opening (EV-024).** A ramp of `1 - exp(-(k+1)/5.9)`.

Some events touch only price, supply or data:
- **Annual price rises.** Every SKU changes on 1 January by the announced percentage, with a per-SKU spread of 0.6 pp.
- **2022 surcharge (EV-027).** Invoice price x1.06 on every SKU in 2022-07..12. Demand does not change.
- **Chip shortage (EV-019).** It cuts shipments only.
- **ERP migration (EV-033).** The quantities of 380 LatAm Aftermarket and Export rows are blank. Their price reveals whether each row was an order (332) or a zero month (48).

Five events are decoys with no effect: the 2019 rebrand (EV-006), Hannover Messe (EV-043), the CRM upgrade (EV-048), the new APAC sales director (EV-035) and the Pune dealer conference (EV-058).

A residual scan of 29,984 scope x month cells finds no unlisted demand event beyond the recurring regional months.

**Forecast window (2026-11..2028-05).** A seasonal-naive model would get the moving holidays wrong:
- Ramadan moves into February in both 2027 and 2028.
- In 2028, LNY is split between January and February.

The corrections to a naive seasonal model are x0.76 to x1.25 for MEA (9.1 % of volume) and x0.87 to x1.16 for APAC. The other window effects:
- **Orion x North America (EV-062).** Use x0.15 for 2027-07 and 2027-08, by analogy with the Nexon strike.
- **Helios x India.** Keep x1.24 for all 19 months.
- **Year-end channel pattern.** Apply the ordinary pattern twice (Dec 2026 / Jan 2027 and Dec 2027 / Jan 2028), but not the 2022 pre-buy: no announcement event is listed for the window.

## 0. Inputs, methods, verification

- **Base panel.** `research/scratch/events-calendar/panel.parquet` has 245,548 SKU x Region x month cells. It was built by `e00_build_panel.py` from three peer artefacts:
  - units_fix from numeric-reconcile `row_diagnosis.parquet`;
  - unconstrained demand from stockouts-unconstrained `unconstrained_demand.parquet`;
  - the Record_ID grid and ordering patterns from panel-missing-zeros.

  I re-ran `f00_verify_panel.py` this pass. All 244,566 / 244,566 Record_IDs match a raw row parsed from scratch (latest Load_Timestamp). Units and price equal the raw parse on every row. The only canonical-format date disagreements are the 30 raw `2062-xx` rows, which the panel repairs. The 1,244 rows whose units the peers changed all satisfy `fixed units x invoice price = |revenue|` within 1 % (sign 491, x10 293, x100 75, pack-of-10 385).
- **Method M** (`ev2.py`, `e10_fit.py`, `e20_refit.py`; output `fit20.pkl`). Multiplicative model `mu[s,t] = L[s] x (F[family,t] x R[region,t] x C[channel,t] x P[powertrain,t] + carry of preceding off-cycle months)`, fitted by IPF on cleaned cells. Event cells are excluded from the fit. The effect of an event = sum(y) / sum(mu) on its scope, with series-clustered standard errors.
- **Method F** (`f10_modelfree_did.py`, `f13`, `f16`, `f17`). Model-free difference-in-differences on stable monthly-cycle single-customer series (1,495). The scope is compared with an unaffected control, and both are normalised by the same series' own reference months.
- **Method V** (new this pass: `v01_independent.py`; log `logs/v01_independent.log`; table `v01_independent_effects.csv`, 184 rows). It reads only `data/interim/train_rough.parquet`:
  - units = |units_raw|, with no unit fixes;
  - cells above 4 x the series median are dropped;
  - only 1,454 monthly single-customer series are used;
  - effect = ratio of sums in scope vs control, with 200 series-bootstrap draws.

  V reproduces M and F to within sampling error on every key effect (the tables below show all three).

## 1. The calendar: clean, 68 events, 10 touch the forecast window

**(a) Evidence.** I checked for stray whitespace and label variants and found none.
- Start_Date: 48 `YYYY-MM`, 20 `YYYY-MM-DD`. End_Date: 47 / 20, plus 1 blank (EV-052, open-ended).
- Scope_Type: Region 48, Global 15, Customer 3, Product_Family 1, Channel 1.
- Event_Type: Holiday 39, Price Change 11, Disruption 5, Customer Event 3, Corporate 2, System 2, Marketing 2, Supply Constraint 1, Market Entry 1, Announcement 1, Logistics 1.
- Month-precision dates span the whole month. Day-precision dates are exact. LNY windows are always 10 days and Ramadan windows always 30 days, at the real astronomical dates (for example LNY 2027-02-06, Ramadan 2028-01-28).
- The three Customer scopes are `Customer | Region` pairs. Each event applies to that customer's series in that region only. I verified that the Nexon and Helios customers in other regions are unaffected: 1.035 ± 0.037 and 0.973 ± 0.013.

Tidy version: `events_tidy.csv`, with start/end day, n_days, scope split into customer / region / family / channel, sub_type, pct, and window flags. One row per event x month with day shares: `events_month_exposure.csv`. "Win" below = touches 2026-11..2028-05.

| ID | Start | End | Days | Scope | Scope value | Type | Description | Win |
|---|---|---|---|---|---|---|---|---|
| EV-001 | 2019-01-01 | 2019-01-31 | 31 | Global | All | Price Change | Annual list-price increase of about 2.0% effective 1 January | |
| EV-002 | 2019-02-05 | 2019-02-14 | 10 | Region | Asia Pacific | Holiday | Lunar New Year holiday period | |
| EV-003 | 2019-05-06 | 2019-06-04 | 30 | Region | Middle East & Africa | Holiday | Ramadan | |
| EV-004 | 2019-07-01 | 2019-07-31 | 31 | Region | North America | Holiday | North American summer retooling weeks | |
| EV-005 | 2019-08-01 | 2019-08-31 | 31 | Region | Europe | Holiday | European summer plant shutdowns | |
| EV-006 | 2019-10-01 | 2019-10-31 | 31 | Global | All | Corporate | Celeris rebrands product catalogue | |
| EV-007 | 2020-01-01 | 2020-01-31 | 31 | Global | All | Price Change | Annual list-price increase of about 2.0% effective 1 January | |
| EV-008 | 2020-01-25 | 2020-02-03 | 10 | Region | Asia Pacific | Holiday | Lunar New Year holiday period | |
| EV-009 | 2020-02-01 | 2020-03-31 | 60 | Region | Asia Pacific | Disruption | COVID-19 lockdowns and plant closures | |
| EV-010 | 2020-03-01 | 2020-05-31 | 92 | Region | Europe | Disruption | COVID-19 lockdowns and plant closures | |
| EV-011 | 2020-04-01 | 2020-06-30 | 91 | Region | India | Disruption | COVID-19 lockdowns and plant closures | |
| EV-012 | 2020-04-01 | 2020-06-30 | 91 | Region | Latin America | Disruption | COVID-19 lockdowns and plant closures | |
| EV-013 | 2020-04-01 | 2020-06-30 | 91 | Region | North America | Disruption | COVID-19 lockdowns and plant closures | |
| EV-014 | 2020-04-24 | 2020-05-23 | 30 | Region | Middle East & Africa | Holiday | Ramadan | |
| EV-015 | 2020-07-01 | 2020-07-31 | 31 | Region | North America | Holiday | North American summer retooling weeks | |
| EV-016 | 2020-08-01 | 2020-08-31 | 31 | Region | Europe | Holiday | European summer plant shutdowns | |
| EV-017 | 2021-01-01 | 2021-01-31 | 31 | Global | All | Price Change | Annual list-price increase of about 2.5% effective 1 January | |
| EV-018 | 2021-02-12 | 2021-02-21 | 10 | Region | Asia Pacific | Holiday | Lunar New Year holiday period | |
| EV-019 | 2021-03-01 | 2022-09-30 | 579 | Product_Family | Electrical Assemblies | Supply Constraint | Global semiconductor shortage - Celeris shipments allocated below customer demand | |
| EV-020 | 2021-04-13 | 2021-05-12 | 30 | Region | Middle East & Africa | Holiday | Ramadan | |
| EV-021 | 2021-07-01 | 2021-07-31 | 31 | Region | North America | Holiday | North American summer retooling weeks | |
| EV-022 | 2021-08-01 | 2021-08-31 | 31 | Region | Europe | Holiday | European summer plant shutdowns | |
| EV-023 | 2022-01-01 | 2022-01-31 | 31 | Global | All | Price Change | Annual list-price increase of about 5.0% effective 1 January | |
| EV-024 | 2022-01-01 | 2022-01-31 | 31 | Region | Middle East & Africa | Market Entry | Celeris opens Middle East & Africa sales region | |
| EV-025 | 2022-02-01 | 2022-02-10 | 10 | Region | Asia Pacific | Holiday | Lunar New Year holiday period | |
| EV-026 | 2022-04-02 | 2022-05-01 | 30 | Region | Middle East & Africa | Holiday | Ramadan | |
| EV-027 | 2022-07-01 | 2022-12-31 | 184 | Global | All | Price Change | Temporary 6% raw-material surcharge on all invoices | |
| EV-028 | 2022-07-01 | 2022-07-31 | 31 | Region | North America | Holiday | North American summer retooling weeks | |
| EV-029 | 2022-08-01 | 2022-08-31 | 31 | Region | Europe | Holiday | European summer plant shutdowns | |
| EV-030 | 2022-11-01 | 2022-11-30 | 30 | Global | All | Announcement | 2023 price increase (about 9%) announced to customers on 15 November 2022 | |
| EV-031 | 2023-01-01 | 2023-01-31 | 31 | Global | All | Price Change | Annual list-price increase of about 9.0% effective 1 January | |
| EV-032 | 2023-01-22 | 2023-01-31 | 10 | Region | Asia Pacific | Holiday | Lunar New Year holiday period | |
| EV-033 | 2023-03-01 | 2023-05-31 | 92 | Region | Latin America | System | ERP migration in Latin America - some transactions were not migrated | |
| EV-034 | 2023-03-23 | 2023-04-21 | 30 | Region | Middle East & Africa | Holiday | Ramadan | |
| EV-035 | 2023-07-01 | 2023-07-31 | 31 | Region | Asia Pacific | Corporate | New regional sales director appointed | |
| EV-036 | 2023-07-01 | 2023-07-31 | 31 | Region | North America | Holiday | North American summer retooling weeks | |
| EV-037 | 2023-08-01 | 2023-08-31 | 31 | Region | Europe | Holiday | European summer plant shutdowns | |
| EV-038 | 2023-10-01 | 2023-11-30 | 61 | Customer | Nexon Motor Group \| Europe | Customer Event | Labour strike at Nexon Motor Group European assembly plants | |
| EV-039 | 2024-01-01 | 2024-03-31 | 91 | Channel | Export | Logistics | Red Sea shipping disruption delays export shipments to Europe and MEA | |
| EV-040 | 2024-01-01 | 2024-01-31 | 31 | Global | All | Price Change | Annual list-price increase of about 4.5% effective 1 January | |
| EV-041 | 2024-02-10 | 2024-02-19 | 10 | Region | Asia Pacific | Holiday | Lunar New Year holiday period | |
| EV-042 | 2024-03-11 | 2024-04-09 | 30 | Region | Middle East & Africa | Holiday | Ramadan | |
| EV-043 | 2024-04-01 | 2024-04-30 | 30 | Global | All | Marketing | Hannover Messe trade fair participation | |
| EV-044 | 2024-07-01 | 2024-07-31 | 31 | Region | North America | Holiday | North American summer retooling weeks | |
| EV-045 | 2024-08-01 | 2024-08-31 | 31 | Region | Europe | Holiday | European summer plant shutdowns | |
| EV-046 | 2025-01-01 | 2025-01-31 | 31 | Global | All | Price Change | Annual list-price increase of about 3.7% effective 1 January | |
| EV-047 | 2025-01-29 | 2025-02-07 | 10 | Region | Asia Pacific | Holiday | Lunar New Year holiday period | |
| EV-048 | 2025-02-01 | 2025-02-28 | 28 | Global | All | System | CRM platform upgrade | |
| EV-049 | 2025-03-01 | 2025-03-30 | 30 | Region | Middle East & Africa | Holiday | Ramadan | |
| EV-050 | 2025-07-01 | 2025-07-31 | 31 | Region | North America | Holiday | North American summer retooling weeks | |
| EV-051 | 2025-08-01 | 2025-08-31 | 31 | Region | Europe | Holiday | European summer plant shutdowns | |
| EV-052 | 2025-09-01 | open | - | Customer | Helios Auto Parts \| India | Customer Event | Helios Auto Parts commissions second Indian assembly line (permanent capacity increase) | Y |
| EV-053 | 2026-01-01 | 2026-01-31 | 31 | Global | All | Price Change | Annual list-price increase of about 3.7% effective 1 January | |
| EV-054 | 2026-02-17 | 2026-02-26 | 10 | Region | Asia Pacific | Holiday | Lunar New Year holiday period | |
| EV-055 | 2026-02-18 | 2026-03-19 | 30 | Region | Middle East & Africa | Holiday | Ramadan | |
| EV-056 | 2026-07-01 | 2026-07-31 | 31 | Region | North America | Holiday | North American summer retooling weeks | |
| EV-057 | 2026-08-01 | 2026-08-31 | 31 | Region | Europe | Holiday | European summer plant shutdowns | |
| EV-058 | 2026-09-01 | 2026-09-30 | 30 | Region | India | Marketing | Dealer conference, Pune | |
| EV-059 | 2027-01-01 | 2027-01-31 | 31 | Global | All | Price Change | Annual list-price increase of about 4.5% effective 1 January | Y |
| EV-060 | 2027-02-06 | 2027-02-15 | 10 | Region | Asia Pacific | Holiday | Lunar New Year holiday period | Y |
| EV-061 | 2027-02-08 | 2027-03-09 | 30 | Region | Middle East & Africa | Holiday | Ramadan | Y |
| EV-062 | 2027-07-01 | 2027-08-31 | 62 | Customer | Orion Driveline \| North America | Customer Event | Planned retooling shutdown at Orion Driveline North American plants | Y |
| EV-063 | 2027-07-01 | 2027-07-31 | 31 | Region | North America | Holiday | North American summer retooling weeks | Y |
| EV-064 | 2027-08-01 | 2027-08-31 | 31 | Region | Europe | Holiday | European summer plant shutdowns | Y |
| EV-065 | 2028-01-01 | 2028-01-31 | 31 | Global | All | Price Change | Annual list-price increase of about 4.0% effective 1 January | Y |
| EV-066 | 2028-01-26 | 2028-02-04 | 10 | Region | Asia Pacific | Holiday | Lunar New Year holiday period | Y |
| EV-067 | 2028-01-28 | 2028-02-26 | 30 | Region | Middle East & Africa | Holiday | Ramadan | Y |
| EV-068 | 2028-08-01 | 2028-08-31 | 31 | Region | Europe | Holiday | European summer plant shutdowns | after window |

**(b) Classification.** generator_structure (the file itself is clean). **(c) Confidence.** High.

**(d) Rule.**
- Parse `YYYY-MM` as the 1st to the last day of the month and `YYYY-MM-DD` as an exact day. Blank End_Date = open-ended (active through 2028-05).
- Split Customer scopes on `" | "` into (customer, region).
- Expand to event x month with `event_days_in_month` (`events_month_exposure.csv`).
- No label mapping is needed. Validate that every Scope_Value is in the canonical label sets (it is).

## 2. Lunar New Year (APAC): month multiplier = 1 - 0.30 x (LNY days in month / 10), following the listed dates

**(a) Evidence.** APAC vs Europe + India + LATAM + North America (NA), each month relative to the same series' Nov/Dec before and Mar/Apr after:

| month | LNY days | V (rough data) | F (cleaned, model-free) | M (model, median frame) | rule 1 - 0.3 x d/10 |
|---|---|---|---|---|---|
| 2019-01 | 0 | 1.062 ± 0.033 | 1.083 | - | (base) |
| 2019-02 | 10 | 0.727 ± 0.023 | 0.723 | 0.669 | 0.70 |
| 2020-01 | 7 | 0.728 ± 0.022 | 0.738 | 0.847 | 0.79 (COVID-confounded) |
| 2021-02 | 10 | 0.671 ± 0.020 | 0.681 | 0.656 | 0.70 |
| 2022-02 | 10 | 0.696 ± 0.018 | 0.716 | 0.697 | 0.70 |
| 2023-01 | 10 | 0.763 ± 0.029 | 0.748 | 0.726 | 0.70 |
| 2023-02 | 0 | 0.987 ± 0.031 | 0.995 | - | 1.00 |
| 2024-02 | 10 | 0.716 ± 0.019 | 0.704 | 0.688 | 0.70 |
| 2025-01 | 3 | 0.945 ± 0.025 | 0.946 | 0.922 | 0.91 |
| 2025-02 | 7 | 0.821 ± 0.022 | 0.816 | 0.805 | 0.79 |
| 2026-02 | 10 | 0.695 ± 0.018 | 0.695 | 0.677 | 0.70 |

In the V and F columns, LNY-free Januaries run 0.99 to 1.06. The holiday-free APAC Jan/Feb base is about 1.035 to 1.04 of APAC's ordinary months.

- **The dip follows the listed dates, not the calendar month.** In 2023 (LNY 22-31 January) January dropped and February was normal. In 2025 (3 + 7 days) the dip split 0.92-0.95 / 0.81-0.82.
- **Fits.** Linear in event share: depth 0.305 (se 0.017), chi2 12.7 on 11 dof. Free exponent: gamma 1.24 (se 0.19), consistent with linear. "Step" (whole effect in the month with most days): chi2 55.1, rejected. Daily-share variant `1 - 0.88 x days / days_in_month`: chi2 12.1. It is indistinguishable from the event-share form, and its forecast-window multipliers differ by at most 1.5 % (2027-02: 0.685 vs 0.700).
- **No anticipation or payback.** The month before is 0.96-1.02 and the month after 0.96-1.03.
- **The effect is the same for every sub-group** (`e21_interactions.log`): channels 0.995-1.015, families 0.98-1.02, powertrains 0.98-1.00, customers 0.95-1.03 of the APAC-wide effect.
- **2020-02** (3 LNY days + COVID) was 0.40 and is excluded from the fits.

**(b) Classification.** real_event (moving holiday). **(c) Confidence.** High for depth 0.30 ± 0.02 and the day-share mechanism.

**(d) Rule.**
- Feature `lny_days_apac` per month (`v03_moving_holiday_features_2019_2028.csv`).
- Multiply APAC latent demand by `1 - 0.30 x lny_days / 10`.
- Do NOT learn a fixed APAC January/February seasonal index. Estimate the APAC Jan/Feb base on holiday-adjusted data, about 1.035 to 1.04 x APAC ordinary months.

## 3. Ramadan (MEA): month multiplier = 1 - 0.30 x (Ramadan days in month / 30), depth uncertain within 0.24-0.32

**(a) Evidence.** MEA only exists from 2022-01. EV-003, EV-014 and EV-020 fall before any MEA series exists, so their effect cannot be observed (0 MEA cells before 2022-01).

V (rough data, MEA non-export series vs the 4 old regions, relative to the same series' Jun-Oct mean of the year):

| month | 2023 | 2024 | 2025 | 2026 |
|---|---|---|---|---|
| Jan | 0.898 (0 d) | 1.037 (0 d) | 1.162 (0 d) | 1.066 (0 d) |
| Feb | 0.952 (0 d) | 1.100 (0 d) | 1.058 (0 d) | **0.938 (11 d)** |
| Mar | **0.869 (9 d)** | **0.780 (21 d)** | **0.764 (30 d)** | **0.749 (19 d)** |
| Apr | **0.783 (21 d)** | **0.871 (9 d)** | 1.039 (0 d) | 0.998 (0 d) |
| May | 0.942 | 0.952 | 1.027 | 0.976 |

- **The dip follows the listed dates.** In 2025 Ramadan fell entirely in March: March 0.76, April 1.04. In 2023 (9 days in March, 21 in April) April was the deeper month.
- **2023 is still in the MEA opening ramp** (age 12-16 months), which explains the low 2023 January/February.
- **Depth estimates by method:**

| method | depth per 30 Ramadan days (se) | fit |
|---|---|---|
| M: full MEA seasonal + opening ramp + holiday | 0.317 (0.031) | chi2 90.0 / 44 dof; no Ramadan term: chi2 264.4 |
| F (`f13`): non-export, ramp-adjusted, 7 Ramadan months | 0.282 (0.038) | chi2 5.8 / 5 dof |
| V: rough data, free Feb/Mar/Apr bases | 0.239 (0.055) | chi2 14.7 / 8 dof |

  The weighted mean is about 0.29, consistent with the LNY value of 0.30. The weak point is that no mature year has a Ramadan-free March (2023-2026 Marches had 9, 21, 30 and 19 days). The March base is therefore identified only through the linear form.
- **Model-based observed vs rule:** 2022-04 (29 d) 0.676 vs 0.693; 2025-03 (30 d) 0.714 vs 0.683; 2026-03 (19 d) 0.781 vs 0.799; 2026-02 (11 d) 0.854 vs 0.884.
- **No payback.** The month after is 0.98-1.04.
- **Same effect across channels and customers.** T1 0.974 ± 0.017, Export 0.994 ± 0.018, AM 1.07 ± 0.05, OEM 1.04 ± 0.05; customers 0.97-1.03.

**(b) Classification.** real_event (moving holiday). **(c) Confidence.** High that the effect exists and follows the day counts. Medium for depth 0.30 (±0.05).

**(d) Rule.**
- Feature `ramadan_days_mea` per month. Multiply MEA latent demand by `1 - 0.30 x days / 30`.
- Never use a fixed MEA Feb/Mar/Apr seasonal index learned on 2022-2026: Ramadan sat in March/April there, and in the window it moves to February.
- Exclude Export x MEA 2024-01..03 (Red Sea, finding 11) when estimating the MEA seasonal base.

## 4. Fixed-month regional dips: two listed, four unlisted; the same months drive the annual-shutdown ordering cycles

**(a) Evidence.** Each region vs the other old regions, relative to months t-3, t-2, t+2 and t+3 (V; F gives the same within ±0.01):

| effect | in calendar | by year (2019, 2021-2026) | mean | sd across years |
|---|---|---|---|---|
| North America July | EV-004/015/... | 0.838 0.850 0.814 0.834 0.820 0.846 0.823 | 0.832 | 0.014 |
| Europe August | EV-005/016/... | 0.616 0.606 0.594 0.669 0.641 0.627 (2026: 0.657 F) | 0.625 | 0.027 |
| APAC October | **no** | 0.847 0.768 0.805 0.843 0.795 0.789 | 0.808 | 0.031 |
| LATAM January | **no** | 0.860 0.826 0.848 0.829 0.862 0.862 | 0.848 | 0.017 |
| India June | **no** | 0.887 0.920 0.915 0.936 0.890 0.879 0.904 | 0.905 | 0.021 |
| India October | **no** | 1.067 1.061 1.034 1.078 1.095 1.157 | 1.082 | 0.042 |
| India November (Diwali test) | no | 0.998 0.901 0.948 1.028 0.949 0.944 | 0.961 | 0.045 |

- **No Diwali effect.** Diwali fell on 2019-10-27, 2021-11-04, 2022-10-24, 2023-11-12, 2024-11-01 and 2025-10-20, yet the India October peak is there every year and November never rises when Diwali falls in November.
- **No anticipation or catch-up.** The months before and after the listed dips are 0.94-1.05 (M, `e30.log`).
- **Same effect across channels, families, powertrains and customers** (0.94-1.05 of the region effect, `e21_interactions.log`).
- **Link to ordering cycles** (new this pass, `v02_extra.py`). Each annual-shutdown ("A-") ordering pattern maps to a region:

| pattern | series | region |
|---|---|---|
| A-Aug | 141 | all Europe |
| A-Jul | 126 | all North America |
| A-Feb | 44 | all APAC |
| A-Nov | 46 | all India |
| A-Dec / A-Jan / A-Jun | - | spread over APAC, India, LATAM and MEA |

  The order after the shutdown carries 0.50 of the shutdown month's latent demand, regional holiday factor included: implied c = 0.504 (EU), 0.500 (NA), 0.46-0.55 elsewhere. A-Feb APAC series are zero in February in every year (zero share 0.91-1.00), including 2023 when LNY fell in January. The shutdown month is fixed; it does not follow LNY.

**(b) Classification.** real_event, recurring = generator_structure (regional seasonal profile). The four unlisted dips are generator seasonality, not events. **(c) Confidence.** High.

**(d) Rule.**
- Learn region x calendar-month seasonality (no SKU-level seasonality). The fixed dips, listed or not, are then reproduced automatically.
- Do not add holiday dummies on top. Nothing changes in the window: the correction factor is 1.0.
- A-Xxx series: forecast 0 in the shutdown month, and add 0.5 x that month's latent demand to the next month.

## 5. Annual price increases: every SKU changes on 1 January by the announced percentage (±0.6 pp per SKU); the surcharge is exactly x1.06

**(a) Evidence.** Modal price per SKU and year from the rough table, independent of numeric-reconcile (`v02_extra.py` d):

| Jan of | calendar | SKUs | median change | mean | sd | p05-p95 |
|---|---|---|---|---|---|---|
| 2020 | 2.0 % | 463 | 2.009 % | 2.001 | 0.584 | 1.08-2.98 |
| 2021 | 2.5 % | 496 | 2.486 % | 2.511 | 0.594 | 1.57-3.46 |
| 2022 | 5.0 % | 524 | 4.995 % | 5.019 | 0.607 | 4.05-6.15 |
| 2023 | 9.0 % | 545 | 9.031 % (list to list) | 9.021 | 0.616 | 8.00-10.02 |
| 2024 | 4.5 % | 569 | 4.489 % | 4.472 | 0.590 | 3.47-5.46 |
| 2025 | 3.7 % | 581 | 3.705 % | 3.710 | 0.618 | 2.71-4.75 |
| 2026 | 3.7 % | 588 | 3.751 % | 3.752 | 0.595 | 2.81-4.73 |

- 100 % of SKUs change price in January and essentially never in other months (17 SKU-months over the whole history, at most 8 in one month).
- The 2022 minimum of -7 % in an earlier pass (`f14`) was a method artefact. The modal-per-year method finds no 2022 outlier (range 2.69-6.88 %).
- **Surcharge (EV-027).** The 2022-07 / 2022-06 modal price ratio is 1.05998-1.06002 on all 530 SKUs. 13,879 of 14,138 positive-price rows in 2022-07..12 are at exactly x1.06 vs June. The other 259 are cents-type errors (x106, x105.999...) handled by numeric-reconcile.
- **Invoice vs list in 2023.** 2023-01 invoice / 2022-12 invoice = 1.0286 = 1.09 / 1.06. Invoice prices rose only 2.9 % when the 9 % list rise took effect, because the surcharge ended.

**(b) Classification.** real_event (price). **(c) Confidence.** High.

**(d) Rule.**
- Price table: `list(SKU, y) = list(SKU, y-1) x (1 + pct_y + e_SKU,y)`, observed per SKU. Invoice = list x 1.06 in 2022-07..12.
- Dashboard revenue in the window: apply +4.5 % (2027) and +4.0 % (2028) to each SKU's 2026 list price.
- Price changes are not a demand driver by themselves: the SKU-level elasticity is -0.19 (se 0.36), not significant. Their demand effect is the channel year-end pattern (finding 6).

## 6. Year-end: stocking channels buy ahead of every rise (ordinary Dec x1.12 / Jan x0.91 vs OEM+EXP); the announced 2023 rise tripled it, then paid back

**(a) Evidence.** T1+AM vs OEM+EXP, relative to Sep-Nov before and Mar-May after. Export x (Europe, MEA) is dropped because of the Red Sea disruption. V (rough) and F (cleaned):

| year-end (rise) | Nov V | Dec V | Dec F | Jan V | Jan F | Feb V | Feb F |
|---|---|---|---|---|---|---|---|
| Jan 2020 (2.0 %) | 0.984 | 1.071 | 1.069 | 0.895 | 0.898 | 1.020 | 1.017 |
| Jan 2021 (2.5 %) | 1.063 | 1.119 | 1.105 | 0.894 | 0.876 | 0.989 | 0.978 |
| Jan 2022 (5.0 %) | 0.979 | 1.130 | 1.176 | 1.000 | 0.983 | 1.030 | 1.008 |
| **Jan 2023 (9 %, announced 15 Nov 2022)** | 0.967 | **1.583** | **1.577** | **0.639** | **0.625** | **0.869** | **0.842** |
| Jan 2024 (4.5 %) | 0.999 | 1.116 | 1.121 | 0.923 | 0.920 | 1.006 | 1.003 |
| Jan 2025 (3.7 %) | 0.987 | 1.104 | 1.099 | 0.882 | 0.885 | 1.004 | 1.001 |
| Jan 2026 (3.7 %) | 0.998 | 1.148 | 1.144 | 0.918 | 0.915 | 1.008 | 1.021 |

Standard errors are about 0.02-0.03.

- **Ordinary years** (F, n = 6):
  - Dec 1.119 (sd 0.037), Jan 0.911 (sd 0.038), Feb 1.005.
  - The Dec slope per pp of the rise is +0.027 (se 0.011). That is weak: the 2022 year-end (5 %) carries most of it, and the 2022 January payback did not happen (open question 6).
- **Split by channel.** The demand-dgp channel profile gives T1/AM Dec x1.06/1.07, Jan x0.95/0.97, and OEM/EXP Dec x0.94/0.955, Jan x1.06/1.045.
- **2022-23, the announced rise (EV-030).** Relative to the ordinary pattern, Dec x1.41, Jan x0.69, Feb x0.84. M gives T1+AM Dec 1.404 ± 0.016, Jan 0.720 ± 0.014, Feb 0.857 ± 0.010, Mar 0.996, with OEM 0.995 and EXP 1.000. The extra volume nets out: +0.40 - 0.28 - 0.14 = -0.02 of a month.
- **No anticipation in the announcement month.** T1+AM Nov 2022 = 0.967 (V) / 0.980 (F). The z = -5.2 in the global-total Nov 2022 test (`f17`) is an artefact: Dec 2022 is one of the neighbours in that test's denominator.
- **Homogeneous across customers, regions and families.** Dec 2022 stocking vs non-stocking ratio within customer is 1.49-1.79 for all 12 customers. The MEA customers sit at the top, consistent with MEA ramp/Ramadan confounding of the reference months. Within region it is 1.49-1.71 and within family 1.41-1.68.
- **Examples:**
  - T1 THM-050 / LATAM, Sep 2022 to Apr 2023: 646, 217, 129, 223, 50, 71, 142, 224.
  - T1 BSS-003 / APAC: 148, 153, 151, **367**, 98, 160, 212, 188.

**(b) Classification.** real_event (ordinary pattern = generator channel seasonality; 2022-23 = announced-rise pre-buy). **(c) Confidence.** High.

**(d) Rule.**
- Learn channel x calendar-month seasonality with 2022-12, 2023-01 and 2023-02 masked (or dummied) for Tier-1 Distributor and Aftermarket. If they are left in, a mean seasonal over 7 years overstates T1+AM December by about 6 % and understates January by about 4.5 %.
- Forecast window: 2026-12 / 2027-01 and 2027-12 / 2028-01 get the ordinary pattern only. That is T1+AM x1.065 / x0.955 and OEM+EXP x0.945 / x1.05 vs a channel-neutral seasonal: a ratio of 1.13 / 0.91.
- No pre-buy multiplier, because no announcement event is listed for 2027 or 2028.
- Anomaly register: EV-030 = "early buying, real, volume-neutral", scope T1+AM, months 2022-12..2023-02.

## 7. Surcharge 2022-07..12 (EV-027): price only, no demand effect

**(a) Evidence.** Total demand of mature monthly series, Jul-Nov / Feb-Jun of the same year (F, MEA excluded): 2022 0.987, against 2019 0.925, 2021 0.871, 2023 0.970, 2024 1.036, 2025 0.906. The ratio of common factors F(Jul-Sep)/F(Apr-Jun) is 0.939 in 2022 against 0.874-0.967 in other years.

**(b) Classification.** real_event (price). **(c) Confidence.** High. **(d) Rule.** Revenue/price reconciliation only; no demand feature.

## 8. COVID lockdowns (EV-009..013): depth follows the listed region-months, then a global V-shaped trough and recovery

**(a) Evidence.** 2020-MM / 2019-MM by region, divided by the same ratio for regions with no lockdown listed that month (V; * = listed lockdown month; F agrees within 0.03):

| month | APAC | Europe | India | LATAM | NA |
|---|---|---|---|---|---|
| 2020-01 | 0.824 | 1.075 | 1.043 | 1.003 | 1.074 |
| 2020-02 | 0.680* | 1.018 | 1.033 | 0.936 | 1.008 |
| 2020-03 | 0.822* | 0.724* | 0.995 | 0.913 | 1.087 |
| 2020-04 | (ref) | 0.249* | 0.057* | 0.392* | 0.333* |
| 2020-05 | (ref) | 0.606* | 0.339* | 0.633* | 0.471* |
| 2020-06 | 1.044 | 0.958 | 0.700* | 0.810* | 0.793* |
| 2020-07 | 1.124 | 0.912 | 1.033 | 0.943 | 0.985 |

- APAC January 2020 (0.824) is consistent with the 7 LNY days (rule 0.79), not with an early lockdown.
- On top of the regional lockdowns there is a global trough. Absolute index vs the seasonal normal, from M:
  - 2020-07: 0.63-0.66 in every region;
  - 2020-09: 0.89-0.94;
  - 2020-10: back to 1.00-1.03;
  - 2020-11..12: an overshoot to +4-11 %.
- No catch-up of the lost lockdown volume.

**(b) Classification.** real_event. **(c) Confidence.** High (depths). Medium (exact split between the regional and global components).

**(d) Rule.** Mask 2020-01..2020-09 for every region in level, seasonality, noise and driver estimation, or use region x month lockdown dummies plus a global COVID factor. Never let 2020 enter a seasonal-naive or same-month-last-years average.

## 9. Semiconductor shortage (EV-019, ELA 2021-03..2022-09): shipments only; ELA unconstrained demand also runs high inside the window (cause unresolved)

**(a) Evidence.**
- **ELA shipped / unconstrained demand by month (M):** 2021-02 0.986, 2021-03 0.902, 2021-06 0.717, 2021-09 0.476 (trough), 2022-09 about 0.91, then 1.00 from 2022-10. Other families in the same window: 0.995-1.001.
- **Stock-out file:** 4,314 "Semiconductor allocation" rows, all ELA and all inside the window. 69.1 % of ELA window cells are listed. The unlisted ones are constrained just as hard (shipped / two-way fit: listed 1.002, unlisted 0.995, ratio 1.007 ± 0.011). The stockouts-unconstrained lens imputes them.
- **New this pass** (`v02_extra.py` c, `v02_ela_relative_demand.csv`):
  - ELA unconstrained demand relative to other families (base 2019-07..2020-01 and 2023-01..2024-06) averages 1.090 inside the window, peaking at 1.202 in 2021-11. It tracks the shortage depth: `rel = 0.94 + 0.47 x depth`, r = 0.84 over 19 months. The earlier pass found 1.00 + 0.44 x depth, r = 0.88.
  - Listed cells (Requested_Units) give 1.095 and imputed unlisted cells 1.074.
  - However, ELA's relative level also swings with no shortage at all: 2019 0.95, 2020 0.86, 2023 0.96, 2024 1.14, 2025 1.08, 2026 1.13 (year means). So a macro cycle cannot be ruled out.
  - No over-ordering at series level: series with a more severe allocation do not request more (slope +0.10, se 0.08).

**(b) Classification.** real_event (supply only). The demand bump is ambiguous (possibly a generator "panic ordering" term, possibly ELA's macro cycle). **(c) Confidence.** High for the supply effect. Low for the cause of the bump.

**(d) Rule.**
- Train on unconstrained demand (stock-out lens rules S1/S5).
- In addition, mask ELA 2021-03..2022-09 in level and seasonality estimation, so that neither the cut shipments nor the possibly inflated requests set the ELA level.
- No forecast-window effect.

## 10. Customer events: Nexon strike x0.145 (no catch-up), Helios step x1.24 (permanent), Orion shutdown in the window

**(a) Evidence.**

**EV-038, Nexon Motor Group x Europe, 2023-10..11.**
- Effect vs other Europe customers: V 0.149 ± 0.012 / 0.139 ± 0.015; F 0.150 / 0.138; M 0.145 ± 0.010 / 0.145 ± 0.012.
- Before and after: Sep 1.06, Dec 0.91 ± 0.06 (V), Jan 1.00.
- It hits every channel (AM 0.165/0.142, OEM 0.148/0.147, T1 0.134/0.138) and every family (0.08-0.20).
- It is a multiplier, not a zeroing: 0 of 35 and 0 of 37 on-phase cells are zero. Series-level ratios run 0.075-0.217 (10th-90th percentile).
- Nexon in other regions is unaffected (1.035 ± 0.037).
- Lost: 3,863 of 4,905 counterfactual units (78.8 %), not recovered.
- Non-monthly cycles follow "latent demand x 0.145, then accumulated to the order month": sum |error| 1.65 vs 4.04 for "multiply the order month".
- Examples: HYD-068 / Europe 2023-07..2024-01 = 56, 38, 103, **17, 11**, 398, 86. BSS-066 = 66, 72, 85, **15, 7**, 83, 51.

**EV-052, Helios Auto Parts x India, from 2025-09, open-ended.**
- DiD vs other India customers, post 2025-10..2026-10 vs pre 2024-09..2025-08: V 1.238; F 1.249 ± 0.045; M step 1.239.
- Month by month (V): 2025-09 1.14, then 1.26, 1.22, 1.29, 1.14, 1.23, 1.21, 1.23, 1.24, 1.37, 1.14, 1.35, 1.28, 1.20. A step with no visible trend: 2025-10..2026-03 1.19 vs 2026-04..10 1.23 (F).
- Placebos are flat: one year earlier 1.007 ± 0.041; Helios in other regions 0.973 ± 0.013.
- All channels move (OEM 1.29, T1 1.26, AM 1.36, EXP 1.15).
- The step varies by series: 59 series, quantiles 1.04 / 1.12 / 1.23 / 1.36 / 1.45, excess sd of the true step about 0.16 (chi2/dof 3.56 vs 1.43 for the 421 India controls).
- Test: 65 Helios x India series, 1,235 rows, about 2.8 % of recent volume.

**EV-062, Orion Driveline x North America, 2027-07..08.**
- No history: Orion NA July/August in 2019-2026 was 0.91-1.09, so there was never a past retooling.
- Test: 62 series and 124 window rows. Channels: 28 OEM, 13 AM, 12 T1, 9 EXP. Cycles: M 26, A-Jul 18, B0 6, B1 3, T0 3, Q2 3, T1 1, Q1 1, Q0 1. Orion NA holds 12.2 % of NA volume and 2.31 % of the total.
- The only analogue is the Nexon customer-plant event (x0.145). The Event_Type and Scope_Type are the same, and the description says the plants are "shut".

**Not in the calendar:** 23 customer switches, 16 lost accounts and 31 ordering-cycle changes found by other lenses (`f14_raw_checks.log` d). None coincides with EV-038, EV-052 or EV-062 except two Helios India switches (CSS-085 in 2022-07, THM-047 in 2025-01) that predate EV-052.

**(b) Classification.** real_event. **(c) Confidence.** High (Nexon, Helios). Medium-low for the Orion magnitude: one analogue.

**(d) Rules.**
- **Nexon:** mask 2023-10..11 for Nexon x Europe in training. Anomaly register: "customer strike, real, x0.145, no catch-up".
- **Helios:** for Helios x India, estimate the level on 2025-10 onwards, or scale pre-event history by 1.24. Per series, shrink: `step_s = 0.57 x (own post/pre ratio) + 0.43 x 1.24`. Keep the level flat through the window; do not extrapolate the 2025-09..10 rise as a trend.
- **Orion:** multiply the latent demand of the 62 Orion x NA series by **0.15** (P10 0.10, P90 0.80) in 2027-07 and 2027-08, on top of the NA July index. Then accumulate through each cycle (`orion_na_2027_series.csv`). Order-month multipliers at x0.15:

  | cycle | multiplier |
  |---|---|
  | M | 0.15 in Jul and Aug |
  | A-Jul | Jul 0, Aug 0.15 |
  | B0 | Jul 0.61, Sep 0.58 |
  | Q0 | Jul 0.75, Oct 0.72 |
  | Q1 | Aug 0.45 |
  | Q2 | Sep 0.45 |

  No anticipation in June and no catch-up in September.

## 11. Red Sea (EV-039): Export x {Europe, MEA} only; x0.62, x0.62, x1.61, net x0.93

**(a) Evidence.** Export vs non-export in the same region:

| region | Jan 2024 | Feb 2024 | Mar 2024 | Apr 2024 |
|---|---|---|---|---|
| Europe (V) | 0.520 ± 0.038 | 0.618 ± 0.056 | 1.510 ± 0.092 | 0.901 ± 0.047 |
| MEA (V) | 0.671 ± 0.039 | 0.660 ± 0.035 | 1.598 ± 0.086 | 1.056 ± 0.058 |
| Other regions (V) | 0.983 ± 0.047 | 1.015 ± 0.042 | 0.979 ± 0.045 | 0.994 ± 0.035 |
| EU+MEA (M) | 0.622 ± 0.019 | 0.624 ± 0.018 | 1.613 ± 0.042 | 0.993 ± 0.026 |

- Net Jan-Mar: 0.951 ± 0.037 (Europe), 0.923 ± 0.037 (MEA). March recovered about 72.5 % of the units deferred from January and February.
- The effect is the same for every large MEA customer: the three with 49-58 series each run Jan 0.61-0.69 and Mar 1.60-1.69. By family: Jan 0.58-0.69, Mar 1.45-1.95.
- The stock-out file has no matching rows: 11 listed rows on 820 cells, about the background rate.
- Cycles: "latent x factor, accumulated" fits better than "multiply the order month" (chi2 94.7 vs 157.2 over 20 cells).
- **Pitfall found this pass:** pooling Europe and MEA in a crude ratio gives March 1.325, not 1.6. The Export scope is mostly MEA and is hit by Ramadan in March 2024 (21 days), while the pooled non-export control is mostly Europe. Always stratify by region.
- Examples (MEA Export, 2023-10..2024-05): PTC-021 = 132, 158, 193, **128, 87, 218**, 125, 84; BSS-057 = 50, 39, 78, **32, 44, 93**, 85, 75.

**(b) Classification.** real_event. The scope is narrower than listed: Export x Europe/MEA only, not Export everywhere. **(c) Confidence.** High.

**(d) Rule.** Mask Export x {Europe, MEA} for 2024-01..03 in training, or divide by 0.62 / 0.62 / 1.61. Anomaly register: "logistics delay, real, deferred and partly recovered". No window effect.

## 12. MEA opening (EV-024): ramp 1 - exp(-(k+1)/5.9), no cannibalisation

**(a) Evidence.**
- 0 MEA cells before 2022-01. 461 of 520 MEA series start in 2022-01; the rest are later launches.
- Region index / mature level by month of age (M): 0.16, 0.30, 0.40, 0.48, 0.55, 0.67, 0.70, 0.73, 0.78, 0.84, 0.82, 0.90, then 0.86-0.94 in months 12-17. Model `1 - exp(-(age+1)/5.85..5.89)` gives 0.16, 0.29, 0.40, 0.50, 0.57, 0.64, 0.70, 0.75 ... 0.87 at month 11. Model-free (F), non-export: 0.19, 0.35, 0.42, 0.34 (Ramadan), 0.57, 0.69, ...
- No cannibalisation: Export series in other regions held level or rose in the 6 months after the opening (Europe 0.949 -> 1.009, India 1.013 -> 1.076, APAC 1.021 -> 1.067).

**(b) Classification.** real_event (generator ramp). **(c) Confidence.** High.

**(d) Rule.** Divide 2022-2023 MEA history by the ramp before estimating MEA level and seasonality. MEA is mature in the window (factor 1.0).

## 13. System events: only the ERP migration leaves an error signature, and its blanks are partly recoverable from price

**(a) Evidence.**
- **264 event x error-flag tests** (`e17_system.log`): 2 have p < 0.001 and 7 have p < 0.01, against 2.6 expected by chance at p < 0.01. Both p < 0.001 hits are EV-033: units blank 27.2 % of LatAm raw rows in 2023-03..05 vs 1.2 % elsewhere (x22.6), and zero-row blanks x21.3.
- **EV-033 shape:** 380 LatAm rows, 2023-03..05, with Units and Revenue both blank. Aftermarket has 246 of 246 rows blank (81, 82, 83 per month). Export has 134 of 134 (45, 44, 45). Direct OEM and Tier-1 have 0 both-blank rows. No both-blank row exists anywhere else in train. 128 series and all 9 non-MEA customers are affected.
- **Price tells order from zero month** (new this pass, `v02_extra.py` b). In ordinary rows price = 0 exactly when units = 0: 35,390 of 35,390 zero-unit rows have price 0, and 0 of 202,244 positive-unit rows do.
  - All 332 EV-033 rows classed `units_and_revenue_blank` have price > 0. They were orders of unknown size, and 331 of 332 fall on on-phase months of the series' ordering cycle.
  - The other 48 blanked rows have price 0. They are exact zero months (for example CEL-0001484 BSS-003 2023-04, cycle T0; CEL-0003068 BSS-006 2023-04, cycle B0).
  - Example of a blanked order: CEL-0000427..429, BSS-001 / LATAM Aftermarket, 2023-03..05, price 715.82, in a monthly series that reads 0, 11, 8, -, -, -, 6, 12, 21.
- **Not missing rows.** The "not migrated" transactions are rows with blanked quantities: the LatAm missing-row rate in the window is 0.28 % vs 0.40 % overall.
- **EV-048 (CRM upgrade):** no flag is elevated. Load lag mean 1.198 days vs 1.192 overall; duplicate share 3.07 % vs 2.97 %.
- **Error blocks with no calendar entry:**

  | block | region | months | rows | p |
  |---|---|---|---|---|
  | currency_eur_block (Direct OEM) | Europe | 2022-01..03 | 498 | < 1e-6 |
  | uom_pack10_block | India | 2021-07..12 | 385 | < 1e-6 |

  numeric-reconcile documents and fixes both.

**(b) Classification.** data_error caused by a real system event. EV-048 is a decoy. **(c) Confidence.** High.

**(d) Rule.**
- EV-033 rows with price 0: units = 0 exactly.
- EV-033 rows with price > 0: units unknown but positive. Impute them from the series' phase-aware expectation (for the dashboard and for revenue), mask them in model training, and never treat them as a demand drop.
- Anomaly register: "system event: quantities lost in ERP migration", 380 rows, action impute / mask.

## 14. Decoys: events with no measurable effect

**(a) Evidence.**

| event | test | result |
|---|---|---|
| EV-006 rebrand, 2019-10 | global month vs neighbours, vs the same contrast in other years | z = +0.44 (M) / +2.11 (F, n = 5 years). 0 SKU descriptions changed: 460 SKUs sold before and after, 0 modal-description changes, 0 non-master descriptions. No load or duplicate anomaly. |
| EV-043 Hannover Messe, 2024-04 | same | z = -0.07 (M) / +0.12 (F) |
| EV-048 CRM upgrade, 2025-02 | same | z = +0.69 (M) / +2.37 (F, n = 6 years). No data-error signature. |
| EV-035 APAC sales director, 2023-07 | APAC vs other regions, half-years | 2023-H2 1.040 ± 0.022 vs neighbouring years (placebos 1.011, 0.970). Largest of 70 region-half-years in M (+3.2 %, sd 0.9 %), gone by 2024 (deviation 0.996-0.999). No step in level. |
| EV-058 Pune dealer conference, 2026-09 | India vs other regions, vs the same months in 2024-25 | 2026-09 0.997 ± 0.030 (V) / 0.956 ± 0.031 (F, Helios excluded); 2026-10 0.968-0.971 |

The F z-scores near +2 come from 5-6 years of contrasts and 4 tests, so they are not significant.

**(b) Classification.** generator_structure (decoys: listed, no demand effect). **(c) Confidence.** High for EV-006/043/048/058. Medium for EV-035 (a small transient cannot be excluded).

**(d) Rule.** No feature and no adjustment. In particular, the last two history months for India are not inflated, so the level needs no deflation. Anomaly register: list each one as "event reviewed, no effect".

## 15. No hidden demand events beyond the recurring regional months

**(a) Evidence.**
- **Two-way residual scan** (M, `e22_scan.log`): 29,984 region / channel / family / customer x region / channel / family / customer x month cells. Robust sd of z is 0.97. Every strong residual is explained by a listed event (pre-buy 86 cells, Red Sea 23, Nexon 2), except 4 isolated cells with effective z of about -4.5: Falcon Gulf x Direct OEM 2023-06 0.73; Meridian x LATAM 2024-09 0.79; Kestrel x PMP 2025-02 0.71; Falcon Gulf x HYD 2026-05 0.73.
- **Customer x region x month scan** (4,404 cells): only known events plus Apex x India 2019-09 (0.77) and Meridian x LATAM 2024-09 (0.79).
- **Region half-year deviations** from own seasonality: sd 0.009, max 0.032 (APAC 2023-H2).

**(b) Classification.** generator_structure. **(c) Confidence.** Medium-high: an unlisted effect below about 10 % on a small scope would not be detected.

**(d) Rule.** Treat the calendar plus the four recurring regional months as the complete demand-event set. The 4 isolated cells go into the anomaly register as "unexplained dip, no action".

## 16. Forecast window 2026-11..2028-05: expected multipliers per scope and month

**(a) Evidence.** File: `v03_fw_event_multipliers.csv`. "Correction" = rule multiplier / the average multiplier that a fixed calendar-month seasonal trained on 2019-2026 has baked in. History averages: APAC Jan 0.944, Feb 0.756 (2019, 2021-2026). MEA Feb 0.972, Mar 0.803, Apr 0.925 (2023-2026). Test rows are from test.csv.

| month | scope | event | P50 | P10-P90 | correction vs naive seasonal | test rows |
|---|---|---|---|---|---|---|
| 2026-11..2028-05 | Helios x India | EV-052 step | 1.24 vs pre-2025-09 level | 1.15-1.32 | 1.0 if level from 2025-10 on; 1.24 if a pre-step level is used | 65 per month |
| 2026-12, 2027-12 | T1+AM | ordinary year-end (EV-059 +4.5 %, EV-065 +4.0 %) | 1.065 | 1.03-1.10 | 1.0 (2022-12 masked) / about 0.94 if not | 1,466 / 1,472 |
| 2026-12, 2027-12 | OEM+EXP | mirror | 0.945 | 0.92-0.97 | 1.0 | 1,592 / 1,596 |
| 2027-01, 2028-01 | T1+AM | January payback | 0.955 | 0.93-0.98 | 1.0 / about 1.045 if 2023-01 not masked | 1,466 / 1,472 |
| 2027-01, 2028-01 | OEM+EXP | mirror | 1.05 | 1.02-1.08 | 1.0 | 1,592 / 1,596 |
| 2027-01 | APAC | no LNY days | 1.00 | - | **1.059** | 510 |
| 2027-02 | APAC | LNY EV-060, 10 d | 0.70 | 0.67-0.73 | **0.926** | 510 |
| 2028-01 | APAC | LNY EV-066, 6 d | 0.82 | 0.80-0.84 | **0.868** | 511 |
| 2028-02 | APAC | LNY EV-066, 4 d | 0.88 | 0.87-0.89 | **1.164** | 511 |
| 2027-02 | MEA | Ramadan EV-061, 21 d | 0.79 | 0.75-0.83 | **0.812** | 516 |
| 2027-03 | MEA | Ramadan EV-061, 9 d | 0.91 | 0.89-0.93 | **1.134** | 517 |
| 2027-04 | MEA | no Ramadan days | 1.00 | - | **1.081** | 517 |
| 2028-01 | MEA | Ramadan EV-067, 4 d | 0.96 | 0.95-0.97 | 0.960 | 518 |
| 2028-02 | MEA | Ramadan EV-067, 26 d | 0.74 | 0.69-0.79 | **0.761** | 518 |
| 2028-03 | MEA | no Ramadan days | 1.00 | - | **1.246** | 518 |
| 2028-04 | MEA | no Ramadan days | 1.00 | - | **1.081** | 518 |
| 2027-07 | North America | EV-063 summer retooling | 0.832 | 0.81-0.85 | 1.0 (seasonality) | 497 |
| 2027-07, 2027-08 | Orion x North America | EV-062 shutdown | 0.15 (latent, then cycle-accumulated) | 0.10-0.80 | 0.15 | 62 per month |
| 2027-08 | Europe | EV-064 summer shutdown | 0.625 | 0.59-0.67 | 1.0 (seasonality) | 513 |
| 2027-01, 2028-01 | LATAM | unlisted January dip | 0.848 | 0.82-0.87 | 1.0 (seasonality) | 507 / 510 |
| 2027-06 | India | unlisted June dip | 0.905 | 0.88-0.94 | 1.0 | 517 |
| 2027-10 | APAC | unlisted October dip | 0.808 | 0.77-0.85 | 1.0 | 511 |
| 2027-10 | India | unlisted October peak | 1.082 | 1.03-1.16 | 1.0 | 517 |
| 2027-01, 2028-01 | all | price rises EV-059 / EV-065 | no direct demand effect (only via the year-end row) | | | |
| 2028-08 | Europe | EV-068 | outside the window | | | |

Recurring events not listed for the window:
- The NA July dip recurs (EV-063 is listed for 2027).
- The four unlisted regional months recur.
- The stocking-channel year-end recurs before both listed price rises.
- No summer event falls in 2028 inside the window.

**(b) Classification.** real_event (expected). **(c) Confidence.** High for the holiday day-count corrections and the year-end. Medium for Orion.

**(d) Rule.**
1. Model latent demand with region x month and channel x month seasonality estimated on de-evented history:
   - mask COVID 2020, the 2022-12..2023-02 T1+AM pre-buy, Nexon 2023-10..11, Red Sea 2024-01..03 Export EU/MEA, ELA 2021-03..2022-09 and the EV-033 blanks;
   - divide MEA 2022-23 by the ramp;
   - divide APAC and MEA by the holiday rule.
2. Re-apply the holiday rule with the window day counts (`v03_moving_holiday_features_2019_2028.csv`).
3. Apply the Helios step and the Orion multiplier on latent demand. Then accumulate through each ordering cycle and zero the A-Xxx shutdown months.

## Artefacts

All files are in `research/scratch/events-calendar/` (working files, not included in the repository).

**Inputs and checks**
- `events_tidy.csv`: the 68 events, parsed: days, scope split, sub_type, pct, window flags.
- `events_month_exposure.csv`: event x month day shares.
- `panel.parquet`: the cleaned panel from peer artefacts, re-verified against raw by `f00_verify_panel.py` (`logs/f00_verify_panel.log`).

**Event effects**
- `events_register_final.csv`: one row per event with before / during / after effects, `class4`, `pipeline_rule` and `forecast_window_multiplier`. It supersedes `events_register.csv`.
- `v01_independent_effects.csv` with `v01_independent.py` and `logs/v01_independent.log`: an independent re-derivation from the rough table (184 effect rows).
- `v02_extra.py` and `logs/v02_extra.log`: A-cycles vs regions; EV-033 price-zero test; ELA inflation (`v02_ela_relative_demand.csv`); price change by year; pre-buy by customer and region.
- `logs/v04_examples.log`: concrete example series.

**Forecast window**
- `v03_fw_event_multipliers.csv`: the forecast-window table above, with P10/P50/P90, corrections and test-row counts.
- `v03_moving_holiday_features_2019_2028.csv`: lny_days_apac and ramadan_days_mea for 2019-01..2028-05, plus multipliers (rule and alternative forms).
- `orion_na_2027_series.csv`: order-month multipliers for the 62 Orion x NA test series at latent x0.15, x0.25 and x0.40.

**Earlier-pass tables, still valid**
- `fw_event_multipliers.csv` and `fw_moving_holiday_multipliers.csv` (first-pass forecast-window tables, superseded by `v03`).
- `event_multipliers_history.csv`, `covid_lockdown_relative.csv`, `redsea_export_by_region.csv`, `prebuy_2023_by_scope.csv`, `prebuy_2023_cycle_propagation.csv`.
- `region_seasonal_median_frame.csv`, `region_seasonal_relative.csv`, `channel_seasonal_relative.csv`, `mea_ramadan_fit.csv`, `system_events_error_tests.csv`.
- `f10_modelfree_did.csv`, `f10_lny_modelfree.csv`, `f10_yearend_by_year.csv`, `f13_*.csv`, `f14_*.csv`.
- Model fits `fit10.pkl` and `fit20.pkl`.

## Open questions (ranked by likely impact on forecast accuracy)

1. **Ramadan depth and the MEA Ramadan-free February-April base.** Depth is 0.24-0.32 depending on the method, and no mature year has a Ramadan-free March. This affects MEA (9.1 % of volume) in 2027-02..04 and 2028-01..04, about ±4 % on those 7 MEA months. The corrections vs a naive seasonal model are large (x0.76 to x1.25), so getting the mechanism right matters far more than the last digit of the depth.
2. **Size of the ordinary year-end shift in the window.** The ratio is Dec 1.12 vs 1.145 if the weak dose slope is real (4.5 % in 2027). This is about ±2 % on T1+AM (about 48 % of volume) in 4 of the 19 months.
3. **Orion EV-062 magnitude.** 0.15 (strike analogue) vs 0.25-0.8 if "planned retooling" behaves like the NA July retooling (0.83). This is 62 series in 2 months, about 0.25 % of window volume. 0.15 minimises expected absolute error unless the prior that the generator reuses the strike template is below about 50 %.
4. **Helios x India.** Is the step still rising (2025-10..2026-03 1.19 vs 2026-04..10 1.23), and how heterogeneous is it per series (excess sd 0.16)? This is 2.8 % of volume over all 19 months.
5. **ELA demand bump during EV-019.** A generator over-ordering term or the ELA macro cycle? It matters only for training and for the lost-sales numbers (it inflates "unconstrained" ELA demand in 2021-22 by up to 20 %), not for the window.
6. **Missing January payback at the 2022 year-end.** T1+AM January 2022 ratio is 1.00 vs 0.88-0.92 in other years. The likely cause is a channel-specific macro response in late 2021 (AM/OEM 1.10-1.29 in 2021-10..2022-02). Low impact.
7. **LNY functional form.** Event share (0.30 x d/10) vs day share (0.88 x d/dim): at most 1.5 % difference on APAC window months. Negligible.
