# Celeris Automobili Industrial: Demand Forecasting & Planning Control Tower

(Faithful transcription of the organisers' problem-statement PDF, which is not redistributed in this repository; the PDF is authoritative.)

**Format:** 1-week project, individual or teams of 2–3. **Level:** students to ~7 years' experience. Every workstream has
Core, Advanced and Expert tiers. Everyone must finish Core; the higher tiers set apart the strongest submissions.

## 1. Overview

Celeris Automobili Industrial is a tier-1 supplier of automotive and industrial components. It sells about 600 SKUs in 7
product families to OEMs and distributors across 6 regions. Monthly forecasts per SKU and region drive procurement,
production scheduling and inventory.

The sales history (Jan 2019 – Oct 2026) is a raw ERP extract and is **messy**. It covers a pandemic, a chip shortage, an
inflation spike, the shift to electric vehicles and the opening of a new region.

**Your task:** clean the data, find and explain anomalies, **predict `Units_Sold` for every row in `test.csv` (Nov 2026 –
May 2028, 19 months)**, and build a dashboard that planners and managers can use.

## 2. Data

| File | Rows | Description |
|---|---|---|
| train.csv | 248,248 | Monthly sales per SKU-region by requested delivery month, 2019-01 → 2026-10. Not cleaned. |
| test.csv | 58,219 | Rows to forecast, 2026-11 → 2028-05. Clean keys. |
| macro_indicators.csv | 114 | 8 economic indicators, 2019-01 → 2028-05 (forecast window included). Not cleaned. |
| sku_master.csv | 601 | Product master and lifecycle. |
| events_calendar.csv | 68 | Known business events, some in the forecast window. |
| inventory_stockouts.csv | 5,830 | Supply-constrained months: requested, shipped, back-ordered and lost units. Known to be incomplete. |
| sample_submission.csv | 5 | Submission format. |

All names are fictional and the data is synthetic.

### 2.1 train.csv

| Column | Description |
|---|---|
| Record_ID | ERP transaction-line identifier. |
| Date | Requested delivery month, YYYY-MM (orders are booked 2–3 months earlier). Authoritative period. |
| Year | Calendar year. |
| Month | Calendar month (1–12). |
| Product_Family | Product line (7 families, e.g. Powertrain Components, Hydraulic Systems). |
| Business_Unit | Owning business unit; each family belongs to exactly one BU. |
| SKU_ID | Product identifier, [FamilyCode]-[NNN]. |
| SKU_Description | Product name with nominal size and form factor. |
| Customer_Name | OEM / tier-1 customer for the SKU in the region (can change over time). |
| Sales_Channel | Direct OEM, Tier-1 Distributor, Aftermarket or Export. |
| Region | North America, Europe, Asia Pacific, India, Latin America, Middle East & Africa. |
| Units_Sold | **Target.** Units shipped in the month; 0 = no order. Equals demand except in stockout months (see inventory_stockouts.csv). |
| Unit_Price_USD | Selling price per unit in USD. |
| Revenue_USD | Units_Sold × Unit_Price_USD. |
| Load_Timestamp | When the row was loaded into the data warehouse. |

### 2.2 test.csv

Same columns as train.csv without Record_ID, Units_Sold, Unit_Price_USD, Revenue_USD and Load_Timestamp.
(Date, Year, Month, Product_Family, Business_Unit, SKU_ID, SKU_Description, Customer_Name, Sales_Channel, Region.)

### 2.3 macro_indicators.csv

Each value is for the month it was measured. Effects on demand may be delayed by one or more months and differ by SKU.

| Column | Description |
|---|---|
| Date | Month the indicator was measured, YYYY-MM. |
| Year / Month | Calendar year / month. |
| ISM_Manufacturing_PMI | Purchasing Managers Index; above 50 = expansion, below 50 = contraction. |
| Auto_Production_YoY_Pct | Global auto production growth, year over year, in percent. |
| Vehicle_Inventory_Days | Days of vehicle inventory on dealer lots (high = soft demand). |
| Raw_Material_Cost_Index | Steel and aluminium cost index, base 100 = Jan 2024. |
| New_Vehicle_Orders_Index | New vehicle orders index (leading indicator). |
| Industrial_Util_Rate_Pct | Industrial capacity utilisation, percent. |
| Fuel_Price_Index | Fuel price index. |
| EV_Adoption_Index | Electric-vehicle adoption trend index. |

### 2.4 sku_master.csv

| Column | Description |
|---|---|
| SKU_ID | Product identifier. |
| Product_Family | Product line. |
| Business_Unit | Owning business unit. |
| SKU_Description | Product name. |
| Size_Class | Nominal size class (e.g. Compact 12, Heavy-Duty 70). |
| Powertrain_Application | ICE (combustion only), EV (electric only) or Universal. |
| Launch_Date | Month the SKU was (or will be) launched, YYYY-MM. |
| EOL_Date | End-of-life month, YYYY-MM; blank if none planned. |
| Replaces_SKU | SKU this product succeeds; blank if none. |
| Lifecycle_Status | Active, Discontinued, EOL Announced or Planned Launch. |

### 2.5 events_calendar.csv

| Column | Description |
|---|---|
| Event_ID | Event identifier. |
| Start_Date | Start of the event (YYYY-MM or YYYY-MM-DD). |
| End_Date | End of the event; blank if open-ended. |
| Scope_Type | What the event applies to: Global, Region, Product_Family, Channel or Customer. |
| Scope_Value | The affected value (e.g. a region name, or `Customer | Region`). |
| Event_Type | Price Change, Disruption, Supply Constraint, Holiday, Customer Event, Logistics, System, etc. |
| Description | Free-text description. Not every event affects demand. |

### 2.6 inventory_stockouts.csv

In these months Celeris could not ship everything customers had asked for, so `Units_Sold` is **lower than true demand**.
The file lists only some of the affected months.

| Column | Description |
|---|---|
| Date | Requested delivery month, YYYY-MM. |
| SKU_ID | Product identifier. |
| Region | Sales region. |
| Requested_Units | Units customers asked to have delivered in this month (true demand for the month). |
| Carried_In_Units | Units back-ordered in the previous month and due now. |
| Shipped_Units | Units actually shipped this month (what train.csv should show as Units_Sold). |
| Backordered_Units | Shortfall carried to the next month and shipped then. |
| Lost_Units | Shortfall never shipped: Requested + Carried_In − Shipped − Backordered. |
| Fill_Rate_Pct | Shipped / (Requested + Carried_In), percent. |
| Stockout_Days | Approximate days out of stock in the month. |
| Reason | Cause of the shortage (e.g. Semiconductor allocation, Logistics delay). |

### 2.7 sample_submission.csv

| Column | Description |
|---|---|
| Date | Forecast month (requested delivery month), 2026-11 → 2028-05. |
| SKU_ID | As in test.csv. |
| Region | As in test.csv. |
| Units_Sold_Forecast | Predicted units. Non-negative integer, no blanks. One row for every row of test.csv. |

## 3. Business rules

1. `Date` is authoritative. If `Year` or `Month` disagree with it, trust `Date`.
2. A repeated `Record_ID` means the row was loaded twice. The row with the latest `Load_Timestamp` is correct.
3. `Units_Sold = 0` means no order. A missing row is **not** a zero.
4. Prices are per SKU, in USD, the same in every region, and change on 1 January, apart from surcharges listed in the events calendar.
5. No sales after an SKU's `EOL_Date`, or before a planned launch's `Launch_Date`.
6. Customers order on their own cycle (monthly, every second month, quarterly, …), and the cycle can change over time.
7. The forecast window has no supply limits. Forecast unconstrained demand (what customers will request for delivery in each month), not constrained shipments.

**Expect** duplicates, missing values and rows, inconsistent labels and dates, quantities or prices that don't reconcile, unit
and currency mistakes, and reference data that contradicts the transactions. **Expect also** real but unusual demand: one-off
orders, disruptions, stockouts and account changes. The list is not exhaustive. Part of the grade is telling **errors** (fix
them) apart from **real events** (model them or exclude them, and explain).

## 4. Workstreams

| Workstream | Core | Advanced | Expert |
|---|---|---|---|
| 1. Cleaning | Profile all files. Standardise labels and dates. De-duplicate. One clean row per Date-SKU-Region. | Reconcile units × price = revenue. Fix unit and currency errors. Handle missing rows vs zeros. Clean the indicators. | Tested, one-command pipeline. Machine-readable data-quality report. |
| 2. Anomalies | Flag outliers and separate errors from real events. Anomaly register. | Structural breaks, early buying before price rises, holidays, stockouts. Estimate unconstrained demand. | Ordering-cycle changes, customer switches, lost accounts. Master data vs transactions. |
| 3. Features & drivers | Calendar features, lags, rolling stats, intermittency class. | Which indicator leads which family, and at what lag. Event and lifecycle features. | Is the lag structure stable over time? The shift to electric vehicles. |
| 4. Forecasting | 2 baselines + 1 better model, time-based backtest. | Intermittent-demand methods; a global ML model; rolling-origin backtest with a 19-month horizon. | New launches with no history (via Replaces_SKU), EOL, events in the forecast window. P10/P50/P90 ranges. Forecasts that add up across the hierarchy. |
| 5. Dashboard | The 5 required views (below). | + 2 optional views. | + 4 optional views, deployed or polished. |

## 5. Dashboard

Use any tool. It must run locally with documented setup and read from your pipeline outputs, not from numbers typed in by hand.

Build one app with two parts that share the same filters (family, SKU, region, channel, customer):

- **Training-data dashboard**: what happened, built on your cleaned history (2019-01 → 2026-10), including unconstrained demand where you corrected for stockouts.
- **Prediction dashboard**: what will happen, built on your forecast (2026-11 → 2028-05), with P10/P50/P90 ranges where you have them.

Wherever both appear, show history and forecast on **one continuous timeline**, with the forecast clearly marked, so a planner can see how the forecast continues the history.

| Required view | Part | Must show |
|---|---|---|
| Executive overview | Both | Units and revenue trend from history into the forecast on one timeline; mix by family, region and channel; headline 19-month forecast |
| Data health | Training data | Issues by type and file, rows affected, before vs after cleaning |
| Demand explorer | Training data | Drill-down family → SKU → region → customer; seasonality, zero months, lifecycle |
| Anomaly monitor | Training data | Flagged points on the time series, with type, reason and action |
| Forecast & accuracy | Prediction | Forecast vs history; backtest WAPE and bias by family, region and horizon |

**Optional views:**

- macro lead/lag heatmap;
- what-if (e.g. PMI −3);
- procurement plan from P90 forecasts;
- lifecycle (EOL and launches);
- stockouts and lost sales;
- exception list for planners;
- data download.

## Submission form fields (hackathon portal)

Title; Description (rich text); Theme ("Demand Forecasting & Planning Control Tower"); Demo Link (working demo);
Repository URL; Source Code upload (zip, max 50MB); Instructions to Run.

## Jury evaluation criteria

See `docs/evaluation_criteria.md`: Problem Understanding; Data Preparation; Model Performance & Validation; Quality of
Insights; Dashboard & Visualization; Originality & Innovation; Solution Presentation ("a balanced mix of technical depth,
practical insights, creativity, and communication").
