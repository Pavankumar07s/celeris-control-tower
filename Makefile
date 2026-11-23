PY ?= .venv/bin/python

.PHONY: all clean-data demand anomalies test install

## all: run every registered pipeline stage in order (currently: clean, demand, anomalies)
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

## test: run the pytest suite
test:
	$(PY) -m pytest

## install: editable install of the package into the project virtualenv (no dependency changes)
install:
	uv pip install --python $(PY) -e . --no-deps
