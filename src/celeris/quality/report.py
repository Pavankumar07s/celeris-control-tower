"""``dq_report.json``: the machine-readable data-quality report behind the dashboard's "Data health" view.

Structure (field names follow Great Expectations / ODCS conventions, see research/methods-cleaning-anomaly.md 5.2):

- ``summary``: overall before / after figures (checks failing, rows, grid, cells changed by method, unit and revenue
  totals);
- ``files``: one entry per input file with its row counts, checks failing before / after and cells changed;
- ``checks``: every check (stage, id, file, rule, description, severity, unit, affected, expected dossier count, before
  and after metric, breakdown, action, up to five examples).

Checks arrive as dictionaries (``Check.to_dict`` plus the producing ``stage``) so that the records of every pipeline stage
can be merged by ``celeris.quality.stagelog.publish``.

No wall-clock value is written, so two runs give byte-identical reports.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any

import pandas as pd

from celeris import __version__
from celeris.config import RAW_FILES

REPORT_VERSION = "1.0"


def build_report(
    checks: Iterable[Mapping[str, Any]],
    fix_log: pd.DataFrame,
    rows_raw: Mapping[str, int],
    rows_clean: Mapping[str, int],
    headline: Mapping[str, Any],
) -> dict[str, Any]:
    """Assemble the report from the check dictionaries, the fix log and the row counts per file."""
    checks = list(checks)
    changed = fix_log[fix_log["method"] != "dropped"]
    files = []
    for name in RAW_FILES:
        mine = [c for c in checks if c["file"] == name]
        mine_changed = changed[changed["file"] == name]
        files.append(
            {
                "file": name,
                "rows_raw": int(rows_raw[name]),
                "rows_clean": rows_clean.get(name),
                "checks": len(mine),
                "checks_failing_before": sum(not c["before"]["passed"] for c in mine),
                "checks_failing_after": _failing_after(mine),
                "cells_changed": int(len(mine_changed)),
                "cells_changed_by_method": _counts(mine_changed["method"]),
                "rows_dropped": int(((fix_log["file"] == name) & (fix_log["method"] == "dropped")).sum()),
                "issues": [
                    {"check_id": c["check_id"], "rule": c["rule"], "title": c["title"], "unit": c["unit"],
                     "affected": c["affected"], "severity": c["severity"]}
                    for c in mine
                    if not c["before"]["passed"]
                ],
            }
        )
    summary = {
        "files": len(RAW_FILES),
        "checks": len(checks),
        "checks_failing_before": sum(not c["before"]["passed"] for c in checks),
        "checks_failing_after": _failing_after(checks),
        "cells_changed": int(len(changed)),
        "cells_changed_by_method": _counts(changed["method"]),
        "cells_changed_by_file": _counts(changed["file"]),
        "rows_dropped": int((fix_log["method"] == "dropped").sum()),
        **dict(headline),
    }
    return {
        "report_version": REPORT_VERSION,
        "package_version": __version__,
        "evidence": "research/DATA_DOSSIER.md",
        "summary": summary,
        "files": files,
        "checks": [dict(c) for c in checks],
    }


def _failing_after(checks: list[Mapping[str, Any]]) -> dict[str, int]:
    return {
        severity: sum(not c["after"]["passed"] and c["severity"] == severity for c in checks)
        for severity in ("error", "warning", "info")
    }


def _counts(values: pd.Series) -> dict[str, int]:
    return {str(k): int(v) for k, v in values.value_counts().sort_index().items()}
