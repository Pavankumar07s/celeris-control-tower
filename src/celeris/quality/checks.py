"""Data-quality checks with before/after metrics, and the forensic assertions they carry.

A ``Check`` is one line of ``dq_report.json``: it says which rule of the dossier it covers, how many rows / cells the
issue touched in the raw data (``before``) and how many remain after cleaning (``after``). When the dossier states the
count, the check carries it in ``expected`` and constructing the check fails if the pipeline disagrees, so every
documented number is a hard assertion (architecture principle 5).
"""

from __future__ import annotations

import math
from collections.abc import Iterable, Iterator, Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any, Literal

import numpy as np
import pandas as pd

from celeris.config import EXPECTED

Severity = Literal["error", "warning", "info"]
Dimension = Literal["completeness", "uniqueness", "validity", "consistency", "accuracy", "conformity"]
MAX_EXAMPLES = 5


class ForensicMismatch(AssertionError):
    """A count produced by the pipeline differs from the one established in the dossier."""


def expect(key: str, actual: int | float) -> None:
    """Assert that ``actual`` equals the dossier count ``EXPECTED[key]``."""
    expected = EXPECTED[key]
    if actual != expected:
        raise ForensicMismatch(f"{key}: dossier says {expected}, pipeline found {actual}")


@dataclass(frozen=True)
class Metric:
    """A measured quantity and whether it satisfies the check."""

    name: str
    value: int | float
    passed: bool

    def to_dict(self) -> dict[str, Any]:
        return {"metric": self.name, "value": _json_scalar(self.value), "passed": self.passed}


@dataclass(frozen=True)
class Check:
    """One data-quality check on one input file.

    ``severity`` follows the report contract: ``error`` must pass after cleaning (the stage fails otherwise),
    ``warning`` is a documented residual (for example the 331 ERP cells whose order size is unknown), ``info`` is a
    profile fact or a documentation conflict that needs no action.
    """

    check_id: str
    file: str
    rule: str
    title: str
    description: str
    dimension: Dimension
    severity: Severity
    unit: str
    affected: int
    before: Metric
    after: Metric
    action: str
    expected_key: str | None = None
    examples: tuple[Mapping[str, Any], ...] = field(default=())
    breakdown: Mapping[str, int] = field(default_factory=dict)
    breakdown_expected_prefix: str | None = None

    def __post_init__(self) -> None:
        if self.expected_key is not None:
            expect(self.expected_key, self.affected)
        if self.breakdown_expected_prefix is not None:
            for part, count in self.breakdown.items():
                expect(f"{self.breakdown_expected_prefix}.{part}", count)
        if self.severity == "error" and not self.after.passed:
            raise ForensicMismatch(f"{self.check_id} ({self.title}) still fails after cleaning: {self.after}")
        if len(self.examples) > MAX_EXAMPLES:
            raise ValueError(f"{self.check_id}: at most {MAX_EXAMPLES} examples")

    def to_dict(self) -> dict[str, Any]:
        return {
            "check_id": self.check_id,
            "file": self.file,
            "rule": self.rule,
            "title": self.title,
            "description": self.description,
            "dimension": self.dimension,
            "severity": self.severity,
            "unit": self.unit,
            "affected": self.affected,
            "expected": None if self.expected_key is None else EXPECTED[self.expected_key],
            "before": self.before.to_dict(),
            "after": self.after.to_dict(),
            "breakdown": {part: int(count) for part, count in self.breakdown.items()},
            "action": self.action,
            "examples": [dict(example) for example in self.examples],
        }


def issue_check(
    *,
    check_id: str,
    file: str,
    rule: str,
    title: str,
    description: str,
    dimension: Dimension,
    unit: str,
    affected: int,
    action: str,
    remaining: int = 0,
    severity: Severity = "error",
    expected_key: str | None = None,
    examples: Sequence[Mapping[str, Any]] = (),
    breakdown: Mapping[str, int] | None = None,
    breakdown_expected_prefix: str | None = None,
) -> Check:
    """A check for an issue present in the raw data: ``before`` counts it, ``after`` counts what is left."""
    return Check(
        check_id=check_id,
        file=file,
        rule=rule,
        title=title,
        description=description,
        dimension=dimension,
        severity=severity,
        unit=unit,
        affected=int(affected),
        before=Metric(f"{unit}_with_issue", int(affected), affected == 0),
        after=Metric(f"{unit}_with_issue", int(remaining), remaining == 0),
        action=action,
        expected_key=expected_key,
        examples=tuple(examples),
        breakdown=dict(breakdown or {}),
        breakdown_expected_prefix=breakdown_expected_prefix,
    )


def invariant_check(
    *,
    check_id: str,
    file: str,
    rule: str,
    title: str,
    description: str,
    dimension: Dimension,
    unit: str,
    checked: int,
    violations_before: int,
    violations_after: int,
    action: str,
    severity: Severity = "error",
    expected_key: str | None = None,
    examples: Sequence[Mapping[str, Any]] = (),
    breakdown: Mapping[str, int] | None = None,
    breakdown_expected_prefix: str | None = None,
) -> Check:
    """A rule that must hold on the data: ``affected`` is the number of rows it was evaluated on."""
    return Check(
        check_id=check_id,
        file=file,
        rule=rule,
        title=title,
        description=description,
        dimension=dimension,
        severity=severity,
        unit=unit,
        affected=int(checked),
        before=Metric("violations", int(violations_before), violations_before == 0),
        after=Metric("violations", int(violations_after), violations_after == 0),
        action=action,
        expected_key=expected_key,
        examples=tuple(examples),
        breakdown=dict(breakdown or {}),
        breakdown_expected_prefix=breakdown_expected_prefix,
    )


def examples_from(frame: pd.DataFrame, columns: Sequence[str], n: int = MAX_EXAMPLES) -> list[dict[str, Any]]:
    """The first ``n`` rows of ``frame`` as JSON-safe dictionaries (the frame's order must be deterministic)."""
    head = frame.loc[:, list(columns)].head(n)
    return [{column: _json_scalar(value) for column, value in row.items()} for row in head.to_dict("records")]


class CheckLog:
    """Ordered collection of checks with unique identifiers."""

    def __init__(self) -> None:
        self._checks: dict[str, Check] = {}

    def add(self, check: Check) -> Check:
        if check.check_id in self._checks:
            raise ValueError(f"duplicate check id {check.check_id}")
        self._checks[check.check_id] = check
        return check

    def extend(self, checks: Iterable[Check]) -> None:
        for check in checks:
            self.add(check)

    def __iter__(self) -> Iterator[Check]:
        return iter(self._checks.values())

    def __len__(self) -> int:
        return len(self._checks)


def _json_scalar(value: Any) -> Any:
    """Convert numpy / pandas scalars to plain JSON values; missing values become ``None``."""
    if value is None or value is pd.NA or value is pd.NaT:
        return None
    if isinstance(value, np.generic):
        value = value.item()
    if isinstance(value, float) and math.isnan(value):
        return None
    return value
