"""Intermittent-demand methods (problem statement workstream 4 Advanced; dossier 6.3 #3): Croston, SBA, TSB, ADIDA
and IMAPA from ``statsforecast``.

They are required by the problem statement and reported honestly in the model ladder, although the dossier explains
why they fit this data poorly: 98.7 % of the zero months are scheduled off-months of a calendar-anchored ordering cycle
(dossier 1 #3), so the zeros are deterministic, not random. These methods forecast a flat per-month rate on every
month, including the months in which the customer never orders, and spread each order's mass over its off-months.

Each method is fitted per series on the filled unconstrained history (from the series start to the origin) and gives a
flat forecast for the horizon; a series without history gets 0. TSB uses ``alpha_d = alpha_p = 0.1``.
"""

from __future__ import annotations

import os

import numpy as np
import pandas as pd

os.environ.setdefault("NUMBA_NUM_THREADS", "4")

from statsforecast.models import ADIDA, IMAPA, TSB, CrostonClassic, CrostonSBA  # noqa: E402

from celeris.models.context import OriginContext  # noqa: E402

TSB_ALPHA = 0.1
METHODS = ("croston", "sba", "tsb", "adida", "imapa")


def _models() -> dict[str, object]:
    return {
        "croston": CrostonClassic(),
        "sba": CrostonSBA(),
        "tsb": TSB(alpha_d=TSB_ALPHA, alpha_p=TSB_ALPHA),
        "adida": ADIDA(),
        "imapa": IMAPA(),
    }


def intermittent_levels(ctx: OriginContext) -> pd.DataFrame:
    """Flat per-month forecast of each method for every series with history (index series_no)."""
    filled = ctx.state.filled.demand_filled
    life = ctx.state.panel.life
    as_of = ctx.as_of
    models = _models()
    rows = []
    for s in range(filled.shape[0]):
        months = np.flatnonzero(life[s, : as_of + 1])
        if len(months) == 0:
            continue
        y = np.nan_to_num(filled[s, months[0] : as_of + 1]).astype(float)
        out = {"series_no": s}
        for name, model in models.items():
            if y.sum() <= 0:
                out[name] = 0.0
            elif len(y) < 3:
                out[name] = float(y.mean())
            else:
                out[name] = float(model.forecast(y=y, h=1)["mean"][0])
        rows.append(out)
    return pd.DataFrame(rows, columns=["series_no", *METHODS]).set_index("series_no")


def intermittent_forecasts(ctx: OriginContext, targets: pd.DataFrame) -> dict[str, np.ndarray]:
    """Per method, the flat forecast for every target row (0 for series without history)."""
    levels = intermittent_levels(ctx)
    s = targets["series_no"]
    return {name: np.nan_to_num(s.map(levels[name]).to_numpy(dtype=float)) for name in METHODS}
