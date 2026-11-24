# Submission text for the hackathon portal

Ready-to-paste text for each portal field, followed by a 2-minute demo script. Every number comes from the pipeline
outputs; the sources are listed in [`requirements_traceability.md`](requirements_traceability.md) and
[`methodology.md`](methodology.md).

---

## Title

Three options. The first is recommended.

1. **Celeris Control Tower: Cycle-Aware Forecasts of Unconstrained Demand** *(recommended: it names the two ideas that
   set the entry apart)*
2. Celeris Demand Control Tower: From a Messy ERP Extract to a 19-Month Plan
3. Celeris Planning Control Tower: Forensic Cleaning, Structural Forecasting, Planner Dashboard

---

## Description

> Celeris's sales history is a raw ERP extract of 248,248 rows. It has duplicate loads, seven date formats, label
> variants, unit, price and currency errors, deleted rows, and stock-outs that hide demand. One command cleans it,
> explains every change, forecasts unconstrained demand for all 58,219 SKU × region × month rows from November 2026 to
> May 2028, and feeds a 12-view planning dashboard.
>
> **What we did differently**
>
> - **Forensics first.** `Record_ID` turned out to be the generator's row counter over a complete SKU × region × month
>   grid. Decoding it locates the 982 deleted rows exactly, fills 737 blank regions and repairs 30 year typos. Each of
>   the 6,932 numeric errors (2.83 % of records) has an exact arithmetic signature. After cleaning, units match the
>   stock-out file on 5,761 of 5,761 rows. Of 116 data-quality checks, 55 fail before cleaning and 0 errors remain
>   after.
> - **Zeros are scheduled.** 98.7 % of zero months are off-months of a customer's ordering cycle. We forecast monthly
>   demand and place it on each customer's cycle, so every order lands in the month it will be placed.
> - **Unconstrained demand is the target.** We rebuilt requested demand from the stock-out accounting rules. It is
>   +0.91 % above shipments overall and +44.8 % for Electrical Assemblies in 2021. 106,925 units (USD 109.9 M) were
>   never shipped.
> - **The model explains each forecast.** Each row is the product of level, seasonality, holidays, a SKU macro path,
>   an EV-adoption factor, lifecycle and events. It is validated on four rolling 19-month origins, with the whole
>   demand state rebuilt as of each origin and a no-leakage test.
>
> **Results.** Backtest WAPE is 26.1 % with bias +0.2 %. Seasonal naive scores 38.6 %, the Croston-type methods
> 51–52 %, and the in-hindsight floor (a forecaster that knew each series' true level) 23.5 %. Summed to total × month,
> the WAPE is 1.8 %. LightGBM (26.7 %) failed our pre-set ensemble rule; we report it as a negative result. One declared
> optimisation round kept one change, a converged factor fit; three confirmation origins agree, though they were partly
> seen during the round. The forecast totals 2.81 M units (P10–P90: 2.73 M to 2.88 M), or USD 2.52 bn. Its bands are
> calibrated to cover 80 % of backtest months and add up across the hierarchy.
>
> **The dashboard** has the 5 required and all 7 optional views, sharing one timeline and one set of filters. It
> includes cell-level lineage from raw to cleaned value, a forecast X-ray, a backtest time machine, a macro what-if, and
> an exception inbox of 305 cases ranked by revenue at risk (USD 70.4 M).

*(About 440 words.)*

---

## Theme

Demand Forecasting & Planning Control Tower

---

## Demo Link

https://pavankumar07s.github.io/celeris-control-tower/

The built dashboard (`dashboard/dist`, data included) served as it is from the repository's `gh-pages` branch. No
login and no backend; it opens on the Executive overview.

## Repository URL

https://github.com/Pavankumar07s/celeris-control-tower

Public. It holds the code, the tests, every pipeline output and the built dashboard. The hackathon dataset is not in
it: the seven CSV files are distributed by the organisers.

## Source Code upload

`make source-zip` writes `dist_zip/celeris_source.zip`: the committed tree (`git archive` of `HEAD`), without
`data/raw/` (the dataset is not distributed with the code), `node_modules/` and `research/scratch/` (never committed),
and without `dashboard/public/data`, a duplicate of `dashboard/dist/data` that `make export` rewrites
(`.gitattributes`). Built from `dd088a1` it is 38,534,459 bytes (38.5 MB, 36.7 MiB); with this release's changes
committed, about 39.2 MB. Both are under the 50 MB limit. Commit before building: the zip holds only committed files.

```bash
make source-zip     # = git archive --worktree-attributes --format=zip -9 -o dist_zip/celeris_source.zip HEAD
```

---

## Instructions to Run

Paste as plain text. The commands were checked against the `Makefile` with a dry run (`make -n`).

```
The live dashboard: https://pavankumar07s.github.io/celeris-control-tower/

About the data: the seven CSV files of the dataset are distributed by the hackathon organisers and are NOT in the
repository. Every pipeline output (outputs/) and the built dashboard (dashboard/dist) are committed, so a reviewer can
inspect every result without them. Only rebuilding needs them, in data/raw/.

Viewing the dashboard locally (no data, no Python or Node setup needed):

1. git clone https://github.com/Pavankumar07s/celeris-control-tower.git celeris && cd celeris
2. python3 -m http.server 8000 -d dashboard/dist
3. Open http://localhost:8000 in a browser. (Opening index.html from disk does not work: browsers block fetch from file://.)

Rebuilding everything from the raw data:

Linux or macOS. On Windows use WSL: the backtest's worker pool needs the "forkserver" start method. (CELERIS_WORKERS=1
avoids the pool, but the project is not tested on Windows.)

1. Install Python 3.12 and uv (or use pip; see step 3).
2. Create the environment:
      uv venv --python 3.12 .venv
      uv pip install --python .venv/bin/python -e ".[test]"
   For the exact versions that rebuild the committed outputs byte for byte:
      uv pip install --python .venv/bin/python -r requirements.lock.txt
      uv pip install --python .venv/bin/python -e . --no-deps
3. Or, with pip:
      python3.12 -m venv .venv
      .venv/bin/pip install -e ".[test]"
4. Put the seven CSV files distributed by the hackathon organisers in data/raw/ (they are not in the repository;
   without them every pipeline command stops with a short message naming the missing files):
      mkdir -p data/raw
      cp /path/to/student_data/*.csv data/raw/
   Expected files: events_calendar.csv, inventory_stockouts.csv, macro_indicators.csv, sample_submission.csv,
   sku_master.csv, test.csv, train.csv
5. Run the whole pipeline (about 11 minutes):
      make all
   (without make: .venv/bin/python -m celeris all)
   This writes outputs/ (clean data, data-quality report, anomaly register, features, backtest, forecast)
   and the dashboard data in dashboard/public/data/.
6. Run the tests (about 3 minutes; 234 tests, the slow end-to-end test is deselected):
      make test
7. Rebuild and open the dashboard (needs Node 20.19 or later):
      make dashboard
      python3 -m http.server 8000 -d dashboard/dist
   Then open http://localhost:8000

Key outputs:
- Submission file: outputs/forecast/submission.csv (58,219 rows)
- Data-quality report: outputs/quality/dq_report.json
- Anomaly register: outputs/anomalies/anomaly_register.csv
- Backtest summary: outputs/backtest/summary.json
- Documentation: README.md, docs/methodology.md, docs/requirements_traceability.md
```

---

## Two-minute demo script

**Preparation.**

- Open the live demo (https://pavankumar07s.github.io/celeris-control-tower/) or serve `dashboard/dist` locally, open
  the Executive overview in the light theme, and clear all filters.
- Keep the series ELA-003 · Europe in mind: a quarterly customer, in the family hit by the chip shortage.
- Every figure in the script below is on the screen at that moment, and the written documents quote the same figures
  (backtest errors pooled over the cells of the four folds). If asked why `summary.json` shows slightly different
  benchmark values: it also stores the mean of the four folds' values, on which the decision rules were applied
  (methodology 9.1).
- The Data health view counts the 90 blocking checks (47 failed on the raw files); the documents count all 116 checks
  (55 failed). Both are right.

| Time | View and action | What to say |
|---|---|---|
| 0:00–0:15 | **Executive overview.** Point at the hero figure and the timeline. | "This is one timeline from January 2019 to May 2028. Ink is what happened and orange is our forecast: 2.81 million units over the next 19 months, with a P10 to P90 range of 2.73 to 2.88 million. The ranges are calibrated to cover 80 % of the months we backtested, and they add up across the hierarchy." |
| 0:15–0:30 | **Data health.** Point at the headline, the row bridge and the checks hero. | "248,248 raw rows in train.csv became 245,548 grid cells, one per month, SKU and region; 982 missing rows were rebuilt from the Record_ID grid, never zero-filled. Every error had an exact signature, so every fix is a named rule: 47 of the 90 blocking checks failed on the raw files, and every one passes now. 108 of all 116 checks pass; the eight still open are documented warnings and notes." |
| 0:30–0:45 | **Demand explorer.** Filter to ELA-003 · Europe; show the zero-month calendar, then switch the header to "Latent monthly demand". | "These zeros are not lost demand: the calendar marks every zero month of this series as a scheduled off-month. This customer orders every quarter, and each order carries three months of demand. Latent demand is that underlying monthly demand, before it is grouped into orders: this switch spreads each order back over the months it covers. We forecast latent demand and place it on the customer's cycle." (If asked for the overall figure, from the documents: 98.7 % of the 36,057 zero months in history are scheduled off-months.) |
| 0:45–1:00 | **Stock-outs & lost sales.** Point at the headline, the hero and the lost-units chart peaking in October 2021. | "Shipments hid demand. 106,925 units, 109.9 million dollars at invoice price, were never shipped, and Electrical Assemblies accounts for 75 % of them; 80 % of the loss fell in 2021 and 2022, mostly to semiconductor allocation. We forecast what customers ask for, not what the plant managed to ship." |
| 1:00–1:20 | **Forecast & accuracy.** Open the backtest time machine at origin 2025-03, then the forecast X-ray. | "Here is the forecast we would have made in March 2025, checked against the next 19 months: 25.1 % error against 37.0 % for seasonal naive. Across four origins the error is 26.1 % with a bias of +0.2 %, against 38.6 % for seasonal naive and 31.1 % for cycle-aware naive, a flat level placed on each customer's ordering calendar. The in-hindsight floor, 23.5 %, is what a forecaster would score if it had known each series' true level in advance: the noise nobody can remove. The X-ray shows why each number is what it is: level, season, holidays, economy, EV adoption, lifecycle and events." |
| 1:20–1:35 | **Lifecycle.** Point at the end-of-life run-offs and the cold starts. | "Three SKUs reach end of life inside the window and run off to zero. Three planned launches replace them, ramping up from their launch month." |
| 1:35–1:50 | **Exception inbox.** Group by cause. | "A planner starts here: 305 cases on 304 series, ranked by revenue at risk, 70.4 million dollars in total. Lost accounts, the Orion Driveline shutdown in July and August 2027, and launches, each with a cause and an action." |
| 1:50–2:00 | **What-if.** Apply the preset "PMI −3 from Jan 2027". | "If the economy turns, the plan moves through each customer's ordering cycle. And all of this is rebuilt from the raw files with one command: make all." |
