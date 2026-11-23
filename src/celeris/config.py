"""Paths, calendar constants, label vocabularies, rule parameters and the dossier's expected counts.

Every number in ``EXPECTED`` is a forensic count from ``research/DATA_DOSSIER.md`` (section given in the comment). The
pipeline asserts each of them (``celeris.quality.checks.expect``), so a regression in any rule fails the build instead of
silently changing the cleaned data.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from types import MappingProxyType
from typing import Final

PROJECT_ROOT: Final[Path] = Path(__file__).resolve().parents[2]

RAW_FILES: Final[tuple[str, ...]] = (
    "train.csv",
    "test.csv",
    "sku_master.csv",
    "macro_indicators.csv",
    "events_calendar.csv",
    "inventory_stockouts.csv",
    "sample_submission.csv",
)


@dataclass(frozen=True)
class Paths:
    """Input and output locations. Tests point ``outputs_dir`` at a temporary directory."""

    raw_dir: Path = field(default=PROJECT_ROOT / "data" / "raw")
    outputs_dir: Path = field(default=PROJECT_ROOT / "outputs")

    @property
    def clean_dir(self) -> Path:
        return self.outputs_dir / "clean"

    @property
    def quality_dir(self) -> Path:
        return self.outputs_dir / "quality"

    def raw(self, name: str) -> Path:
        return self.raw_dir / name


# --- calendar -------------------------------------------------------------------------------------------------------
# month_idx = months since 2019-01 (0-based); 2026-10 = 93 is the last training month.
FIRST_YEAR: Final = 2019
LAST_TRAIN_MONTH_IDX: Final = 93
FORECAST_FIRST_MONTH: Final = "2026-11"
FORECAST_LAST_MONTH: Final = "2028-05"
MEA_REGION: Final = "Middle East & Africa"
MEA_OPENING_MONTH: Final = "2022-01"  # EV-024; no MEA series starts earlier (dossier 2.0)

# --- vocabularies (problem statement 2.1; generator region order, dossier 2.0) ---------------------------------------
REGIONS: Final[tuple[str, ...]] = (
    "North America",
    "Europe",
    "Asia Pacific",
    "India",
    "Latin America",
    "Middle East & Africa",
)
CHANNELS: Final[tuple[str, ...]] = ("Direct OEM", "Tier-1 Distributor", "Aftermarket", "Export")

# --- price rules (dossier 2.2) ----------------------------------------------------------------------------------------
SURCHARGE_RATE: Final = 1.06  # EV-027, invoices of 2022-07..12
SURCHARGE_YEAR: Final = 2022
SURCHARGE_FIRST_MONTH_OF_YEAR: Final = 7
EUR_FACTOR: Final = 0.89  # N10: Europe x Direct OEM 2022-Q1 prices booked in EUR
PACK_SIZE: Final = 10  # N11: India x Aftermarket 2021-H2 booked in packs of 10
CENTS_FACTOR: Final = 100  # N9

# --- macro rules (dossier 2.4) ----------------------------------------------------------------------------------------
MACRO_INDICATORS: Final[tuple[str, ...]] = (
    "ISM_Manufacturing_PMI",
    "Auto_Production_YoY_Pct",
    "Vehicle_Inventory_Days",
    "Raw_Material_Cost_Index",
    "New_Vehicle_Orders_Index",
    "Industrial_Util_Rate_Pct",
    "Fuel_Price_Index",
    "EV_Adoption_Index",
)
MACRO_DECIMALS: Final = 1  # every correct macro cell is written with one decimal
MACRO_REBASED_INDICATOR: Final = "Raw_Material_Cost_Index"
MACRO_REBASE_K: Final = 1.25  # M4; MI.v narrows the plausible range to 1.21..1.26 (run sensitivity at 1.22 / 1.26)
MACRO_BASE_MONTH: Final = "2024-01"  # documented base: Raw_Material_Cost_Index = 100 in Jan 2024
MACRO_BASE_VALUE: Final = 100.0
MACRO_CONTINUITY_MAX_ROBUST_Z: Final = 6.0  # a repaired cell must not leave a first-difference outlier behind

EXPECTED: Final = MappingProxyType(
    {
        # train.csv keys and duplicates (dossier 2.0, 2.1)
        "train.raw_rows": 248_248,
        "train.records": 244_566,
        "train.dup_exact": 2_946,  # K1
        "train.dup_superseded": 736,  # K2
        "train.dup_superseded.value_changed": 732,
        "train.date_nonstandard_raw": 9_967,  # K3
        "train.date_nonstandard_ids": 9_821,
        "train.date_fmt.YYYY/MM": 1_703,
        "train.date_fmt.Mon YYYY": 1_689,
        "train.date_fmt.YYYY-MM-DD": 1_672,
        "train.date_fmt.Mon-YYYY": 1_659,
        "train.date_fmt.MM/YYYY": 1_623,
        "train.date_fmt.MM-YYYY": 1_621,
        "train.date_year_typo": 30,  # K4
        "train.month_column_mismatch": 246,  # K5
        "train.month_column_mismatch.plus_one": 230,
        "train.month_column_mismatch.december": 16,
        "train.region_variant_raw": 6_199,  # K6 (2,244 + 1,948 + 1,315 + 504 + 188)
        "train.region_variant_ids": 6_117,
        "train.region_kind.case": 2_244,
        "train.region_kind.abbreviation": 1_948,
        "train.region_kind.whitespace": 1_315,
        "train.region_kind.punctuation": 504,
        "train.region_kind.wording": 188,
        "train.region_blank_raw": 745,  # K7
        "train.region_blank_ids": 737,
        "train.region_blank_true.Europe": 137,  # per record (LK.v correction)
        "train.region_blank_true.India": 133,
        "train.region_blank_true.Latin America": 133,
        "train.region_blank_true.Asia Pacific": 131,
        "train.region_blank_true.North America": 113,
        "train.region_blank_true.Middle East & Africa": 90,
        "train.channel_variant_raw": 3_745,  # K8
        "train.channel_variant_ids": 3_683,
        "train.channel_kind.case": 1_800,
        "train.channel_kind.punctuation": 1_011,
        "train.channel_kind.abbreviation": 403,
        "train.channel_kind.word_order": 370,
        "train.channel_kind.whitespace": 161,
        "train.sku_variant_raw": 3_741,  # K9
        "train.sku_variant_ids": 3_683,
        "train.sku_kind.lowercase": 768,
        "train.sku_kind.missing_dash": 767,
        "train.sku_kind.leading_space": 749,
        "train.sku_kind.dropped_zero": 738,
        "train.sku_kind.underscore": 719,
        "train.customer_variant_raw": 2_490,  # K10
        "train.customer_variant_ids": 2_455,
        "train.customer_kind.suffix_inc": 631,
        "train.customer_kind.double_space": 629,
        "train.customer_kind.uppercase": 609,
        "train.customer_kind.letter_deleted": 566,
        "train.customer_kind.space_deleted": 55,
        "train.family_blank_raw": 1_252,  # K11
        "train.family_blank_ids": 1_228,
        "train.description_blank_raw": 996,  # K12
        "train.description_blank_ids": 982,
        # Record_ID grid (dossier 2.0, K13)
        "grid.series": 3_083,
        "grid.cells": 245_548,
        "grid.missing": 982,
        "grid.missing.inner": 956,
        "grid.missing.first": 10,
        "grid.missing.last": 16,
        "grid.block.len_94": 1_976,
        "grid.block.len_58": 466,
        "grid.core_skus": 100,
        "grid.region_orders": 433,
        # numeric states, unique IDs (dossier 2.2)
        "num.N0": 202_244,
        "num.N0z": 35_390,
        "num.N1": 2_545,
        "num.N2": 450,
        "num.N3": 217,
        "num.N4": 491,
        "num.N5": 293,
        "num.N6": 75,
        "num.N7": 425,
        "num.N8": 312,
        "num.N9": 614,
        "num.N10": 498,
        "num.N11": 385,
        "num.N12": 332,
        "num.N13": 295,
        # numeric states, raw rows (dossier 2.2, bracketed counts)
        "num_raw.N0": 205_431,
        "num_raw.N0z": 35_805,
        "num_raw.N1": 2_572,
        "num_raw.N2": 455,
        "num_raw.N3": 218,
        "num_raw.N4": 497,
        "num_raw.N5": 295,
        "num_raw.N6": 76,
        "num_raw.N7": 437,
        "num_raw.N8": 316,
        "num_raw.N9": 620,
        "num_raw.N10": 502,
        "num_raw.N11": 390,
        "num_raw.N12": 335,
        "num_raw.N13": 299,
        "num.error_ids": 6_932,
        "num.comma_records": 44,  # N6b
        "num.comma.N5": 16,
        "num.comma.N6": 25,
        "num.comma.N0": 3,  # genuine large orders whose only issue is the comma
        "num.N2.erp_blank_revenue": 48,  # ERP-window rows with price 0 (revenue also blank) are true zeros, counted in N2
        "num.units_exact_recovered": 4_071,
        "num.units_naive_total": 12_030_253,
        "num.units_clean_total": 11_723_379,
        "price.cells": 4_894,
        "price.skus": 598,
        "price.surcharge_off_by_one_cent": 1,  # THM-051
        # inventory_stockouts.csv as an oracle (dossier 2.2, 2.7, K2)
        "oracle.stockout_rows_with_record": 5_804,
        "oracle.units_exact": 5_761,
        "oracle.pack_rows": 42,
        "oracle.erp_unknown": 1,
        "oracle.missing_rows_listed": 26,
        "oracle.restated_listed": 17,
        # stockouts file (dossier 2.7)
        "stockouts.rows": 5_830,
        "stockouts.semiconductor": 4_314,
        "stockouts.operational": 1_516,
        "stockouts.no_impact_all_zero": 825,
        "stockouts.carried_in_only": 45,
        "stockouts.consecutive_pairs": 3_108,
        "stockouts.fill_documented_match": 115,
        "stockouts.semiconductor_with_carry_in": 3,
        "stockouts.total.requested": 235_319,
        "stockouts.total.carried_in": 3_948,
        "stockouts.total.shipped": 140_554,
        "stockouts.total.backordered": 16_886,
        "stockouts.total.lost": 81_827,
        # macro (dossier 2.4)
        "macro.raw_rows": 114,
        "macro.clean_rows": 113,
        "macro.duplicate_month_cells": 2,  # M1
        "macro.fraction_cells": 12,  # M2
        "macro.decimal_shift_cells": 1,  # M3
        "macro.rebased_cells": 36,  # M4
        "macro.blank_cells": 5,  # M5
        "macro.cells_changed": 56,
        # master (dossier 2.5)
        "master.rows": 601,
        "master.bu_corrections": 1,  # S1 PMP-004
        "master.launch_corrections": 1,  # S2 BSS-018
        "master.status.Active": 589,
        "master.status.Discontinued": 6,
        "master.status.EOL Announced": 3,
        "master.status.Planned Launch": 3,
        # events (dossier 2.6)
        "events.rows": 68,
        "events.start_month_precision": 48,
        "events.start_day_precision": 20,
        "events.open_ended": 1,
        "events.in_forecast_window": 10,
        # test.csv and sample_submission.csv (dossier 2.3, 2.8)
        "test.rows": 58_219,
        "test.series": 3_068,
        "test.post_eol_rows": 156,
        "test.cold_start_series": 10,
        "sample.rows": 5,
    }
)
