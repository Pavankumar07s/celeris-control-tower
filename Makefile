PY ?= .venv/bin/python

.PHONY: all clean-data test install

## all: run every registered pipeline stage in order (currently: clean)
all:
	$(PY) -m celeris all

## clean-data: part A, clean every raw file -> outputs/clean, outputs/quality
clean-data:
	$(PY) -m celeris clean

## test: run the pytest suite
test:
	$(PY) -m pytest

## install: editable install of the package into the project virtualenv (no dependency changes)
install:
	uv pip install --python $(PY) -e . --no-deps
