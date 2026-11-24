"""The ``export`` stage: read the pipeline outputs, write the dashboard data bundle to ``paths.bundle_dir``
(``dashboard/public/data`` for the default outputs root, ``<outputs_dir>/dashboard_bundle`` for any other one, or
``--bundle-dir``).

Start-up files (loaded by every view): ``meta.json``, ``dims.json``, ``history.json``, ``forecast.json``.
Lazy files (loaded by the views that need them): ``forecast_detail.json``, ``profiles.json``, ``quality.json``,
``anomalies.json``, ``stockouts.json``, ``macro.json``, ``backtest.json``, ``backtest_origin_<YYYY-MM>.json``,
``exceptions.json``, ``lineage/<family code>.json``.

The stage writes nothing else (no file under ``outputs/`` outside the bundle) and keeps no wall-clock value, so two
runs on the same inputs give byte-identical bundles. Stale bundle files from an earlier run are removed first.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pandas as pd

from celeris import __version__
from celeris.config import Paths
from celeris.export.anomalies import build_anomalies
from celeris.export.backtest import build_backtest
from celeris.export.encode import Json, write
from celeris.export.exceptions import build_exceptions, series_bucket_frame
from celeris.export.forecast import build_detail, build_forecast, check_submission, load_rows, price_assumption, self_check
from celeris.export.history import Frames, build_dims, build_history, build_profiles, build_stockouts, series_index
from celeris.export.macro import build_macro
from celeris.export.quality import build_lineage, build_quality
from celeris.export.sources import Sources, resolve
from celeris.io import sha256_file

BUNDLE_VERSION = 1
STARTUP_FILES = ("dims.json", "history.json", "forecast.json")
PIPELINE_INPUTS = (
    "clean/train_clean.parquet", "clean/test_grid.parquet", "clean/sku_master_clean.csv", "clean/series_state.csv",
    "clean/series_blocks.csv", "clean/events_clean.csv", "clean/stockouts_clean.csv", "clean/price_table.csv",
    "clean/account_events.csv", "clean/macro_clean.csv", "anomalies/anomaly_register.csv",
    "anomalies/series_profile.csv", "quality/dq_report.json", "quality/fix_log.parquet",
    "quality/dedup_decisions.csv", "quality/macro_change_log.csv",
)


def _csv(path: Path) -> pd.DataFrame:
    return pd.read_csv(path, keep_default_na=False, na_values=[""])


def load_frames(paths: Paths) -> Frames:
    clean = paths.clean_dir
    return Frames(
        cells=pd.read_parquet(clean / "train_clean.parquet"),
        grid=pd.read_parquet(clean / "test_grid.parquet"),
        master=_csv(clean / "sku_master_clean.csv"),
        state=_csv(clean / "series_state.csv"),
        profile=_csv(paths.anomalies_dir / "series_profile.csv"),
        blocks=_csv(clean / "series_blocks.csv"),
        events=_csv(clean / "events_clean.csv"),
        stockouts=_csv(clean / "stockouts_clean.csv"),
        prices=_csv(clean / "price_table.csv"),
        account_events=_csv(clean / "account_events.csv"),
    )


def _clear(bundle_dir: Path) -> None:
    if bundle_dir.exists():
        for path in sorted(bundle_dir.rglob("*.json")):
            path.unlink()


def _pipeline_hashes(paths: Paths) -> dict[str, str]:
    manifest = json.loads((paths.quality_dir / "manifest.json").read_text(encoding="utf-8"))
    listed = {entry["path"]: entry["sha256"] for entry in manifest["outputs"]}
    return {relative: listed.get(relative) or sha256_file(paths.outputs_dir / relative) for relative in PIPELINE_INPUTS}


def run_export(paths: Paths, bundle_dir: Path | None = None) -> dict[str, Any]:
    """Write the bundle to ``bundle_dir`` (default ``paths.bundle_dir``) and return its metadata (also ``meta.json``)."""
    bundle_dir = paths.bundle_dir if bundle_dir is None else bundle_dir
    sources: Sources = resolve(paths)
    frames = load_frames(paths)
    index = series_index(frames)
    segments, history = build_history(frames)
    dims = build_dims(frames, index, segments)

    rows = load_rows(pd.read_parquet(sources["forecast"].path), frames.grid, index)
    submission = pd.read_csv(sources["submission"].path, dtype={"Date": str, "SKU_ID": str, "Region": str},
                             keep_default_na=False)
    submission_check = check_submission(rows, submission)

    summary = json.loads(sources["backtest_summary"].path.read_text(encoding="utf-8"))
    backtest, per_origin = build_backtest(pd.read_parquet(sources["predictions"].path), _csv(sources["metrics"].path),
                                          summary, index)
    report = json.loads((paths.quality_dir / "dq_report.json").read_text(encoding="utf-8"))
    fix_log = pd.read_parquet(paths.quality_dir / "fix_log.parquet")
    dedup = _csv(paths.quality_dir / "dedup_decisions.csv")
    register = _csv(paths.anomalies_dir / "anomaly_register.csv")

    files: dict[str, Json] = {
        "dims.json": dims,
        "history.json": history,
        "forecast.json": build_forecast(rows, index),
        "forecast_detail.json": build_detail(rows),
        "profiles.json": build_profiles(frames, index),
        "quality.json": build_quality(report, fix_log, dedup),
        "anomalies.json": build_anomalies(register, index),
        "stockouts.json": build_stockouts(frames, index),
        "macro.json": build_macro(_csv(paths.clean_dir / "macro_clean.csv"), _csv(paths.quality_dir / "macro_change_log.csv"),
                                  _csv(sources["macro_leadlag"].path), _csv(sources["macro_sensitivity"].path), index),
        "backtest.json": backtest,
        "exceptions.json": build_exceptions(index, rows.frame, frames.grid, frames.state, frames.account_events,
                                            frames.cells, frames.events,
                                            series_bucket_frame(backtest["series_buckets"], backtest["final"])),
    }
    for origin, payload in per_origin.items():
        files[f"backtest_origin_{origin}.json"] = payload
    for code, payload in build_lineage(fix_log, dedup, index).items():
        files[f"lineage/{code}.json"] = payload

    _clear(bundle_dir)
    written = {name: write(payload, bundle_dir / name) for name, payload in files.items()}
    uncertainty = json.loads(sources["uncertainty"].path.read_text(encoding="utf-8"))
    meta: dict[str, Any] = {
        "bundle_version": BUNDLE_VERSION,
        "package_version": __version__,
        "provisional": sources.provisional,
        "sources": sources.describe(),
        "source_sha256": {name: sha256_file(source.path) for name, source in sources.files.items()},
        "pipeline_sha256": _pipeline_hashes(paths),
        "startup_files": list(STARTUP_FILES),
        "files": [{"path": name, "bytes": path.stat().st_size, "sha256": sha256_file(path)} for name, path in sorted(written.items())],
        "rows": {"history_cells": len(frames.cells), "series": len(index.table), "segments": len(segments),
                 "forecast_rows": len(rows.frame), "anomaly_register": len(register), "fix_log": len(fix_log)},
        "submission": submission_check,
        "price_assumption": price_assumption(rows, frames.cells),
        "uncertainty": uncertainty,
        "backtest": {"models": backtest["models"], "final": backtest["final"], "origins": backtest["origins"],
                     "scored_origins": backtest["scored_origins"], "ladder": backtest["ladder"],
                     "noise_floor": backtest["noise_floor"]},
        "members": [m.removeprefix("pred_") for m in rows.members],
        "quantile_selfcheck": self_check(rows, index),
    }
    write(meta, bundle_dir / "meta.json")
    return meta
