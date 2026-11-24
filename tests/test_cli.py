"""The command line explains a missing or incomplete ``data/raw`` in a few lines instead of a traceback, and writes
nothing."""

from __future__ import annotations

from pathlib import Path

import pytest

from celeris.cli import main
from celeris.config import RAW_FILES


def _missing_line(err: str) -> list[str]:
    line = next(row for row in err.splitlines() if row.strip().startswith("missing"))
    return [name.strip() for name in line.split(":", 1)[1].split(",")]


def test_missing_raw_data_gives_a_short_message(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    out = tmp_path / "outputs"
    assert main(["clean", "--raw-dir", str(tmp_path / "raw"), "--out-dir", str(out)]) == 2
    err = capsys.readouterr().err
    assert _missing_line(err) == list(RAW_FILES)
    assert "hackathon organisers" in err and "data/raw/" in err and "Traceback" not in err
    assert len(err.splitlines()) <= 6
    assert not out.exists()


def test_incomplete_raw_data_names_only_the_missing_files(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    raw = tmp_path / "raw"
    raw.mkdir()
    for name in RAW_FILES[:-2]:
        (raw / name).write_text("placeholder\n")
    out = tmp_path / "outputs"
    assert main(["all", "--raw-dir", str(raw), "--out-dir", str(out)]) == 2
    assert _missing_line(capsys.readouterr().err) == list(RAW_FILES[-2:])
    assert not out.exists()
