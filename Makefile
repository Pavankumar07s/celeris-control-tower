PY ?= .venv/bin/python

.PHONY: all clean-data demand anomalies features backtest forecast submission export dashboard dashboard-dev test install

## all: run every registered pipeline stage in order (clean, demand, anomalies, features, backtest, forecast, ...)
all:
	$(PY) -m celeris all

## clean-data: part A, clean every raw file -> outputs/clean, outputs/quality
clean-data:
	$(PY) -m celeris clean

## demand: part B, unconstrained demand, cycles, account events, test grid (needs clean-data)
demand:
	$(PY) -m celeris demand

## anomalies: part B, one-offs, masks, anomaly register, series profile (needs demand)
anomalies:
	$(PY) -m celeris anomalies

## features: feature tables, macro lead/lag analysis, feature catalogue -> outputs/features (needs anomalies)
features:
	$(PY) -m celeris features

## backtest: rolling-origin backtest (4 folds + stress fold), model ladder, uncertainty calibration -> outputs/backtest (~25 min, 1.3 GB)
backtest:
	$(PY) -m celeris backtest

## forecast: fit as of 2026-10, forecast.parquet, submission.csv, quantiles, hierarchy checks -> outputs/forecast (needs backtest)
forecast:
	$(PY) -m celeris forecast

## submission: alias of forecast; the file is outputs/forecast/submission.csv
submission: forecast

## export: dashboard data bundle -> dashboard/public/data (needs the clean, demand, anomalies and modelling outputs)
export:
	$(PY) -m celeris export

## dashboard: export the bundle and build the static app -> dashboard/dist (serve with: python -m http.server -d dashboard/dist)
dashboard: export
	cd dashboard && npm ci --no-audit --no-fund && npm run build

## dashboard-dev: Vite dev server on the current bundle (http://localhost:5173)
dashboard-dev:
	cd dashboard && npm run dev

## test: run the pytest suite
test:
	$(PY) -m pytest

## install: editable install of the package into the project virtualenv (no dependency changes)
install:
	uv pip install --python $(PY) -e . --no-deps
