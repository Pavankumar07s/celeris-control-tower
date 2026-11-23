# Jury evaluation criteria ("How will your solution stand out?")

Source: hackathon portal screenshot supplied by the team on 2026-11-21.

> Our jury will evaluate submissions based on a balanced mix of technical depth, practical insights, creativity, and communication.

| # | Criterion | What the jury looks at |
|---|---|---|
| 01 | Problem Understanding | Clarity in understanding the problem statement and defining a well-structured approach. |
| 02 | Data Preparation | Quality of data cleaning, preprocessing, and feature engineering, where applicable. |
| 03 | Model Performance & Validation | Effectiveness of the machine learning approach, model performance, and validation methodology. |
| 04 | Quality of Insights | Relevance, accuracy, and practical value of the insights derived from the data. |
| 05 | Dashboard & Visualization | Clarity, usability, and effectiveness of the dashboard in communicating findings. |
| 06 | Originality & Innovation | Uniqueness of the approach and creativity in solving the problem. |
| 07 | Solution Presentation | Ability to explain the methodology, key technical decisions, and business impact of the solution. |

## What this means for our build

- Seven criteria, apparently balanced: forecast accuracy is one of seven. Insights, dashboard, originality and
  presentation together carry more weight than raw model score, so each needs a deliberate deliverable.
- **01** → a visible, well-structured approach: README + methodology doc that maps every Core / Advanced / Expert
  item of the problem statement to where it is delivered.
- **02** → cleaning rules with before/after evidence, a machine-readable data-quality report, tests, feature catalogue.
- **03** → rolling-origin backtest with a 19-month horizon, baselines vs our model, WAPE and bias by family / region /
  horizon, calibrated P10/P50/P90, hierarchy coherence — all reproducible.
- **04** → insights must be accurate (traceable to pipeline outputs) and practical (what a planner should do).
- **05** → clarity and usability first; history and forecast on one continuous timeline; shared filters.
- **06** → originality must be real and explainable (our generator-forensics approach, cycle-aware forecasting, etc.).
- **07** → explain methodology, key technical decisions and business impact (units, revenue, lost sales, inventory).
