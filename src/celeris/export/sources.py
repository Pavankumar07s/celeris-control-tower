"""Which modelling outputs feed the bundle: the real files when they exist, otherwise the dev-only provisional ones.

The modelling stages write ``outputs/{forecast,backtest,features}/``. Until they exist, the dashboard is developed on
stand-ins with the same schemas, written by ``dashboard/dev/make_provisional_forecast.py`` to ``outputs/_provisional``.
The choice is made per file and recorded, so the bundle metadata states exactly which inputs were provisional and the
UI shows a badge; nothing is mixed silently.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from celeris.config import Paths

PROVISIONAL_DIR = "_provisional"

# logical name -> path relative to the outputs root (and to the provisional root)
MODEL_FILES: dict[str, str] = {
    "forecast": "forecast/forecast.parquet",
    "submission": "forecast/submission.csv",
    "macro_sensitivity": "forecast/macro_sensitivity.csv",
    "uncertainty": "forecast/uncertainty.json",
    "predictions": "backtest/predictions.parquet",
    "metrics": "backtest/metrics.csv",
    "backtest_summary": "backtest/summary.json",
    "macro_leadlag": "features/macro_leadlag.csv",
}


@dataclass(frozen=True)
class Source:
    name: str
    path: Path
    relative: str
    provisional: bool


@dataclass(frozen=True)
class Sources:
    files: dict[str, Source]

    def __getitem__(self, name: str) -> Source:
        return self.files[name]

    @property
    def provisional(self) -> bool:
        return any(source.provisional for source in self.files.values())

    def describe(self) -> dict[str, dict[str, object]]:
        return {name: {"path": source.relative, "provisional": source.provisional} for name, source in self.files.items()}


def resolve(paths: Paths) -> Sources:
    """Pick the real file for every logical input when it exists, the provisional one otherwise; raise if neither."""
    out: dict[str, Source] = {}
    for name, relative in MODEL_FILES.items():
        real = paths.outputs_dir / relative
        provisional = paths.outputs_dir / PROVISIONAL_DIR / relative
        if real.exists():
            out[name] = Source(name, real, relative, provisional=False)
        elif provisional.exists():
            out[name] = Source(name, provisional, f"{PROVISIONAL_DIR}/{relative}", provisional=True)
        else:
            raise FileNotFoundError(
                f"{real} is missing and no provisional stand-in exists: run the modelling stages, or "
                "`python dashboard/dev/make_provisional_forecast.py` for development")
    return Sources(out)
