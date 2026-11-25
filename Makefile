PY ?= .venv/bin/python

.PHONY: all clean-data demand anomalies features backtest forecast submission export dashboard dashboard-dev test test-all install source-zip

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

## backtest: rolling-origin backtest (4 folds + stress fold), model ladder, uncertainty calibration -> outputs/backtest
##   (~10 min and 2.7 GB in total with 3 worker processes; CELERIS_WORKERS=1: ~23 min, 1.5 GB, identical outputs)
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

## test: run the fast pytest suite (tests marked slow are deselected; pipeline runs go to temp dirs)
test:
	$(PY) -m pytest

## test-all: the whole suite including the slow end-to-end test (python -m celeris all twice into temp dirs; ~24 min,
##   peak ~4 GB of memory, ~0.2 GB of temporary disk)
test-all:
	$(PY) -m pytest -m "slow or not slow"

## install: editable install of the package into the project virtualenv (no dependency changes)
install:
	uv pip install --python $(PY) -e . --no-deps

## source-zip: zip of the committed tree (HEAD) for the portal's source upload -> dist_zip/celeris_source.zip (git-ignored).
##   Leaves out dashboard/public/data, the duplicate of dashboard/dist/data (.gitattributes, export-ignore); data/raw and
##   other untracked files are never included. Commit first: uncommitted changes are not in the zip.
source-zip:
	mkdir -p dist_zip
	git archive --worktree-attributes --format=zip -9 --prefix=celeris-control-tower/ -o dist_zip/celeris_source.zip HEAD
	@ls -l dist_zip/celeris_source.zip
