"""Cross-checks against the forensic research artefacts and hide-and-recover tests of the Record_ID decode (T8).

Research files are read only here, never by the package, and the tests skip when they are absent.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from celeris.cleaning.master import lifecycle_months
from celeris.cleaning.record_id import derive_blocks
from celeris.config import EXPECTED

from .conftest import RESEARCH


def _research(relative: str) -> pd.DataFrame:
    path = RESEARCH / relative
    if not path.exists():
        pytest.skip(f"research artefact {relative} not available")
    return pd.read_csv(path)


def test_block_table_matches_labels_keys_lens(clean_run) -> None:
    research = _research("labels-keys/record_id_blocks.csv")
    ours = clean_run.csv("series_blocks.csv")
    merged = ours.merge(research, on="series_no", suffixes=("", "_research"), validate="one_to_one")
    assert len(merged) == EXPECTED["grid.series"]
    assert (merged["sku_id"] == merged["sku"]).all()
    for column in ("region", "start_rec", "end_rec", "start_idx", "end_idx", "length"):
        assert (merged[column] == merged[f"{column}_research"]).all(), column


def test_macro_matches_macro_lens(clean_run) -> None:
    research = _research("macro-indicators/macro_clean.csv")
    ours = clean_run.csv("macro_clean.csv")
    assert (ours["date"].to_numpy() == research["Date"].to_numpy()).all()
    for column in research.columns[3:11]:
        assert np.allclose(ours[column.lower()], research[column], atol=1e-9), column


def test_missing_cells_match_labels_keys_lens(train_clean: pd.DataFrame) -> None:
    research = _research("labels-keys/missing_rows_from_record_id_gaps.csv")
    ours = train_clean.loc[train_clean["row_status"] == "missing_row", ["sku_id", "region", "date"]]
    key = ["sku_id", "region", "date"]
    research = research.rename(columns={c: c.lower() for c in research.columns})
    assert set(map(tuple, ours[key].to_numpy())) == set(map(tuple, research[key].to_numpy()))


def _records_from(train_clean: pd.DataFrame) -> pd.DataFrame:
    observed = train_clean[train_clean["row_status"] == "observed"]
    return pd.DataFrame(
        {
            "rec_num": observed["record_id"].str[4:].astype("int64").to_numpy(),
            "sku_id": observed["sku_id"].to_numpy(),
            "region_label": observed["region"].to_numpy(),
            "month_idx": observed["month_idx"].to_numpy(),
        }
    )


def test_blocks_survive_hidden_records(clean_run, train_clean: pd.DataFrame, raw_master: pd.DataFrame) -> None:
    """Delete records at random, including first and last cells of series: the decode must place every gap exactly."""
    records = _records_from(train_clean)
    lifecycle = lifecycle_months(raw_master)
    reference = clean_run.csv("series_blocks.csv")[["series_no", "sku_id", "region", "start_rec", "end_rec"]]
    rng = np.random.default_rng(11)
    first = records.groupby(["sku_id", "region_label"])["month_idx"].transform("min") == records["month_idx"]
    last = records.groupby(["sku_id", "region_label"])["month_idx"].transform("max") == records["month_idx"]
    hide = rng.choice(np.flatnonzero(~first & ~last), 2_000, replace=False).tolist()
    hide += rng.choice(np.flatnonzero(first & (records["sku_id"] != "BSS-018")), 40, replace=False).tolist()
    hide += rng.choice(np.flatnonzero(last), 40, replace=False).tolist()
    blocks = derive_blocks(records.drop(index=hide), lifecycle)
    pd.testing.assert_frame_equal(blocks[reference.columns].reset_index(drop=True), reference, check_dtype=False)


def test_blocks_fail_loudly_when_the_master_contradicts_the_ids(train_clean: pd.DataFrame, raw_master: pd.DataFrame) -> None:
    """A launch date earlier than the first sales would leave unexplained ID gaps: the tiling assertion must fire."""
    lifecycle = lifecycle_months(raw_master)
    sku = "BSS-012"  # launched 2026-07
    lifecycle.loc[sku, "launch_idx"] -= 3
    with pytest.raises(AssertionError):
        derive_blocks(_records_from(train_clean), lifecycle)
