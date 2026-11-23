"""Series x month arrays of the cleaned train grid, truncated at an ``as_of`` month.

Every data-dependent function of the demand and anomaly stages works on a ``Panel``: dense ``(series, month)`` arrays
over the 94 training months (2019-01 .. 2026-10) where everything after ``as_of`` is outside the series' life, and the
stock-out file restricted to months ``<= as_of``. So a state computed at an earlier origin cannot depend on later data
(the rolling-origin backtest refits cycles, lost accounts, switches and fills this way; dossier 6.7).

Reference data known in advance is not truncated: the product master (launch, EOL, powertrain) and the Record_ID block
of each series (its planned sales window).
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from celeris.cleaning.record_id import MEA_OPENING_IDX
from celeris.config import LAST_TRAIN_MONTH_IDX, MEA_REGION

N_MONTHS = LAST_TRAIN_MONTH_IDX + 1
SEMICONDUCTOR_FAMILY = "Electrical Assemblies"
SEMICONDUCTOR_FIRST_IDX = 26  # 2021-03, EV-019
SEMICONDUCTOR_LAST_IDX = 44  # 2022-09
SERIES_COLUMNS = (
    "series_no",
    "sku_id",
    "region",
    "product_family",
    "sales_channel",
    "powertrain_application",
    "sku_tier",
    "lifecycle_status",
    "launch_idx",
    "eol_idx",
    "start_idx",
    "end_idx",
)


@dataclass(frozen=True)
class Panel:
    """Dense arrays of one as-of view of the training history.

    Arrays are ``(n_series, 94)``; row ``i`` is ``series.iloc[i]`` (``series_no == i``). ``units`` holds shipped units
    after the stock-out overlay (NaN where unknown or outside the life); ``positive_unknown`` marks records whose units
    are unknown but whose order exists (ERP blanks, N12); ``missing_row`` marks deleted records (their units are known
    only where the stock-out file lists them). Stock-out arrays are NaN where the cell is not listed.
    """

    as_of: int
    series: pd.DataFrame
    life: np.ndarray
    units: np.ndarray
    positive_unknown: np.ndarray
    missing_row: np.ndarray
    listed: np.ndarray
    semiconductor_row: np.ndarray
    requested: np.ndarray
    carried_in: np.ndarray
    shipped: np.ndarray
    backordered: np.ndarray
    fill_pct: np.ndarray

    @property
    def n_series(self) -> int:
        return len(self.series)

    @property
    def start(self) -> np.ndarray:
        return self.series["start_idx"].to_numpy()

    @property
    def end(self) -> np.ndarray:
        """Last month of each series' life in this view (block end, capped at ``as_of``)."""
        return np.minimum(self.series["end_idx"].to_numpy(), self.as_of)

    @property
    def alive_at_as_of(self) -> np.ndarray:
        """Series whose planned sales window reaches ``as_of`` (started and not yet past EOL)."""
        return (self.start <= self.as_of) & (self.series["end_idx"].to_numpy() >= self.as_of)

    @property
    def age(self) -> np.ndarray:
        """Months since the series' first month (negative before it)."""
        return np.arange(N_MONTHS)[None, :] - self.start[:, None]

    @property
    def launched_in_window(self) -> np.ndarray:
        """Series whose first month is a product launch or the MEA opening, not the 2019-01 window start."""
        return self.start > 0

    @property
    def mea_opening_cohort(self) -> np.ndarray:
        """MEA series of SKUs launched before the region opened: they start together in 2022-01 (EV-024)."""
        return (
            (self.series["region"] == MEA_REGION).to_numpy()
            & (self.start == MEA_OPENING_IDX)
            & (self.series["launch_idx"].to_numpy() < MEA_OPENING_IDX)
        )

    @property
    def product_launch(self) -> np.ndarray:
        """Series whose first month is the product launch (in-window launches, MEA opening cohort excluded)."""
        return (self.start > 0) & ~self.mea_opening_cohort

    @property
    def semiconductor_cell(self) -> np.ndarray:
        """ELA cells inside the semiconductor window (every one is supply-constrained; dossier 2.7 I4)."""
        family = (self.series["product_family"] == SEMICONDUCTOR_FAMILY).to_numpy()
        months = (np.arange(N_MONTHS) >= SEMICONDUCTOR_FIRST_IDX) & (np.arange(N_MONTHS) <= SEMICONDUCTOR_LAST_IDX)
        return family[:, None] & months[None, :] & self.life


def series_table(blocks: pd.DataFrame, master_clean: pd.DataFrame, cells: pd.DataFrame) -> pd.DataFrame:
    """One row per series (``series_no`` 0..n-1): block window, master attributes and the series' channel."""
    master = master_clean.set_index("sku_id")
    out = blocks[["series_no", "sku_id", "region", "start_idx", "end_idx"]].sort_values("series_no").reset_index(drop=True)
    if not (out["series_no"].to_numpy() == np.arange(len(out))).all():
        raise AssertionError("series_no must run 0..n-1")
    for column in ("product_family", "powertrain_application", "sku_tier", "lifecycle_status"):
        out[column] = out["sku_id"].map(master[column]).astype("str")
    out["launch_idx"] = out["sku_id"].map(master["launch_date_effective"]).map(_month_idx).astype("int64")
    out["eol_idx"] = out["sku_id"].map(master["eol_date"]).map(lambda v: _month_idx(v) if isinstance(v, str) else np.nan)
    channel = cells.groupby("series_no")["sales_channel"].first()
    out["sales_channel"] = out["series_no"].map(channel).astype("str")
    return out.loc[:, list(SERIES_COLUMNS)]


def _month_idx(text: str) -> int:
    return (int(text[:4]) - 2019) * 12 + int(text[5:7]) - 1


def build_panel(cells: pd.DataFrame, stockouts: pd.DataFrame, series: pd.DataFrame, as_of: int = LAST_TRAIN_MONTH_IDX) -> Panel:
    """Dense as-of arrays from the grid cells (with overlaid ``units_sold``) and the cleaned stock-out file.

    ``cells`` needs ``series_no``, ``month_idx``, ``row_status``, ``numeric_state`` and ``units_sold``; ``stockouts``
    the cleaned stock-out columns plus ``series_no``. Nothing after ``as_of`` is read.
    """
    if not 0 <= as_of <= LAST_TRAIN_MONTH_IDX:
        raise ValueError(f"as_of must be a training month index, got {as_of}")
    n = len(series)
    shape = (n, N_MONTHS)
    months = np.arange(N_MONTHS)
    start = series["start_idx"].to_numpy()
    end = np.minimum(series["end_idx"].to_numpy(), as_of)
    life = (months[None, :] >= start[:, None]) & (months[None, :] <= end[:, None])

    view = cells[cells["month_idx"] <= as_of]
    i, t = view["series_no"].to_numpy(dtype="int64"), view["month_idx"].to_numpy(dtype="int64")
    units = np.full(shape, np.nan)
    units[i, t] = view["units_sold"].astype("Float64").to_numpy(dtype="float64", na_value=np.nan)
    positive_unknown = np.zeros(shape, dtype=bool)
    positive_unknown[i, t] = (view["numeric_state"] == "N12_erp_units_lost").to_numpy() & np.isnan(units[i, t])
    missing_row = np.zeros(shape, dtype=bool)
    missing_row[i, t] = (view["row_status"] == "missing_row").to_numpy()

    listed_rows = stockouts[stockouts["month_idx"] <= as_of]
    li, lt = listed_rows["series_no"].to_numpy(dtype="int64"), listed_rows["month_idx"].to_numpy(dtype="int64")
    listed = np.zeros(shape, dtype=bool)
    listed[li, lt] = True
    semiconductor_row = np.zeros(shape, dtype=bool)
    semiconductor_row[li, lt] = (listed_rows["reason_class"] == "semiconductor").to_numpy()

    def column(name: str) -> np.ndarray:
        out = np.full(shape, np.nan)
        out[li, lt] = listed_rows[name].to_numpy(dtype="float64")
        return out

    units[~life] = np.nan
    return Panel(
        as_of=as_of,
        series=series.reset_index(drop=True),
        life=life,
        units=units,
        positive_unknown=positive_unknown & life,
        missing_row=missing_row & life,
        listed=listed & life,
        semiconductor_row=semiconductor_row & life,
        requested=column("requested_units"),
        carried_in=column("carried_in_units"),
        shipped=column("shipped_units"),
        backordered=column("backordered_units"),
        fill_pct=column("fill_rate_pct"),
    )


def shift(values: np.ndarray, k: int, fill: float | bool = np.nan) -> np.ndarray:
    """Shift along the month axis: ``out[:, t] = values[:, t - k]`` (``k > 0`` looks back, ``k < 0`` ahead)."""
    out = np.full(values.shape, fill, dtype=np.result_type(values.dtype, fill))
    if k > 0:
        out[:, k:] = values[:, :-k]
    elif k < 0:
        out[:, :k] = values[:, -k:]
    else:
        out[:] = values
    return out


def row_nanmedian(values: np.ndarray) -> np.ndarray:
    """Median of each row ignoring NaN (rows must hold at least one value): sort, NaN last, average the middle pair.

    ``np.nanmedian`` falls back to a masked-array path for short rows and is two orders of magnitude slower.
    """
    ordered = np.sort(values, axis=1)
    n = (~np.isnan(values)).sum(axis=1)
    low = np.take_along_axis(ordered, ((n - 1) // 2)[:, None], axis=1)[:, 0]
    high = np.take_along_axis(ordered, (n // 2)[:, None], axis=1)[:, 0]
    return (low + high) / 2
