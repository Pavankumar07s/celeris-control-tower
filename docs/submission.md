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
> **Results.** Backtest WAPE is 26.1 % with bias +0.2 %. Seasonal naive scores 38.7 %, the Croston-type methods
> 51–52 %, and the noise floor is 23.6 %. Summed to total × month, the WAPE is 1.8 %. A LightGBM model scored 26.7 % and
> failed our pre-set ensemble rule, so we report it as a negative result. One declared optimisation round, checked on
> held-back origins, kept one change: a converged factor fit. The forecast totals 2.81 M units (P10–P90: 2.73 M to
> 2.88 M), or USD 2.52 bn. Its bands are calibrated to 80 % coverage and add up across the hierarchy.
>
> **The dashboard** has the 5 required and all 7 optional views, sharing one timeline and one set of filters. It
> includes cell-level lineage from raw to cleaned value, a forecast X-ray, a backtest time machine, a macro what-if, and
> an exception inbox of 305 cases ranked by revenue at risk (USD 70.4 M).

*(About 400 words.)*

---

## Theme

Demand Forecasting & Planning Control Tower

---

## Demo Link

`<DEMO_URL>` — to be filled after deployment. `dashboard/dist` is a static site and can be hosted as it is on GitHub
Pages, Cloudflare Pages or any static host (see [`dashboard.md`](dashboard.md), "Deploy the static build").

## Repository URL

`<REPOSITORY_URL>` — to be filled.

## Source Code upload

A zip of the committed tree, without `data/raw/` and `node_modules/`, is about 40 MB, under the 50 MB limit:

```bash
git archive --format=zip -o celeris.zip HEAD
```

---

## Instructions to Run

Paste as plain text. The commands were checked against the `Makefile` with a dry run (`make -n`).

```
Viewing the dashboard only (no Python or Node setup needed; outputs and the built site are in the repository):

1. git clone <REPOSITORY_URL> celeris && cd celeris
2. python3 -m http.server 8000 -d dashboard/dist
3. Open http://localhost:8000 in a browser. (Opening index.html from disk does not work: browsers block fetch from file://.)

Rebuilding everything from the raw data:

1. Install Python 3.12 and uv (or use pip; see step 3).
2. Create the environment:
      uv venv --python 3.12 .venv
      uv pip install --python .venv/bin/python -e ".[test]"
3. Or, with pip:
      python3.12 -m venv .venv
      .venv/bin/pip install -e ".[test]"
4. Put the seven provided CSV files in data/raw/:
      mkdir -p data/raw
      cp /path/to/student_data/*.csv data/raw/
   Expected files: events_calendar.csv, inventory_stockouts.csv, macro_indicators.csv, sample_submission.csv,
   sku_master.csv, test.csv, train.csv
5. Run the whole pipeline (about 11 minutes):
      make all
   This writes outputs/ (clean data, data-quality report, anomaly register, features, backtest, forecast)
   and the dashboard data in dashboard/public/data/.
6. Run the tests (about 3 minutes):
      make test
7. Rebuild and open the dashboard (needs Node 20 or later):
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

- Serve `dashboard/dist`, open the Executive overview in the light theme, and clear all filters.
- Keep the series ELA-003 · Europe in mind: a quarterly customer, in the family hit by the chip shortage.
- The dashboard's backtest figures (26.1 % on four decision folds) and aggregate ranges (2.73 M – 2.88 M for the
  19-month total) match the pipeline outputs, so the hero strip and the value-added steps can be quoted directly.

| Time | View and action | What to say |
|---|---|---|
| 0:00–0:15 | **Executive overview.** Point at the hero figure and the timeline. | "This is one timeline from January 2019 to May 2028. Ink is what happened and orange is our forecast: 2.81 million units over the next 19 months, between 2.73 and 2.88 million with 80 % confidence." |
| 0:15–0:30 | **Data health.** Point at the row waterfall and the before / after checks. | "248,248 raw rows became one clean row per SKU, region and month. Every error had an exact signature, so every fix is a named rule: 55 checks failed before cleaning, and no errors remain. Cleaned units match the stock-out file on all 5,761 rows." |
| 0:30–0:45 | **Demand explorer.** Filter to ELA-003 · Europe; show the zero-month calendar, then switch the header to "Latent monthly demand". | "These zeros are not lost demand. 98.7 % of zero months are scheduled off-months of the customer's ordering cycle. This customer orders every quarter, and each order carries three months of demand. Our forecast places orders the same way." |
| 0:45–1:00 | **Stock-outs & lost sales.** Point at the shipped vs unconstrained chart in 2021–22. | "Shipments hid demand. In 2021 Electrical Assemblies customers asked for 44.8 % more than was shipped. In total 106,925 units, worth 110 million dollars, were never shipped. We forecast what customers ask for, not what the plant managed to ship." |
| 1:00–1:20 | **Forecast & accuracy.** Open the backtest time machine at origin 2025-03, then the forecast X-ray. | "Here is the forecast we would have made in March 2025, checked against the next 19 months: 25.1 % error against 37.0 % for seasonal naive. Across four origins the error is 26.1 % with almost no bias, close to the 23.6 % noise floor. The X-ray shows why each number is what it is: level, season, holidays, economy, EV adoption, lifecycle and events." |
| 1:20–1:35 | **Lifecycle.** Point at the end-of-life run-offs and the cold starts. | "Three SKUs reach end of life inside the window and run off to zero. Three planned launches replace them, ramping up from their launch month." |
| 1:35–1:50 | **Exception inbox.** Group by cause. | "A planner starts here: 305 cases, ranked by revenue at risk, 70.4 million dollars in total. Lost accounts, the Orion Driveline shutdown in July and August 2027, and launches, each with a cause and an action." |
| 1:50–2:00 | **What-if.** Apply the preset "PMI −3 from Jan 2027". | "If the economy turns, the plan moves through each customer's ordering cycle. And all of this is rebuilt from the raw files with one command: make all." |
