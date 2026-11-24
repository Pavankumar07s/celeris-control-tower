"""Quantiles of any aggregate of forecast rows (contract formula, ``docs/architecture.md``).

```
M = sum mean
V = sum var_noise + sum_series (cv_level x sum of the series' selected means)^2
                  + sum_groups (cv_group x sum of the family x region's selected means)^2
sigma^2 = ln(1 + V / M^2),  mu = ln M - sigma^2 / 2,  Pq = exp(mu + z_q x sigma)   (0 when M = 0)
```

The dashboard ports this function exactly; the bundle carries a few results computed here on the bundled (rounded)
inputs so the front end can verify its port at start-up.
"""

from __future__ import annotations

import math
from collections.abc import Sequence

import numpy as np
import pandas as pd

Z_P10 = -1.2815515655446004
Z_P90 = 1.2815515655446004


def aggregate_quantiles(rows: pd.DataFrame, z: Sequence[float] = (Z_P10, 0.0, Z_P90)) -> list[float]:
    """Quantiles of the sum over ``rows`` (columns ``series``, ``group``, ``mean``, ``var_noise``, ``cv_level``,
    ``cv_group``; ``cv_level`` constant per series and ``cv_group`` per group)."""
    m = float(rows["mean"].sum())
    if m <= 0:
        return [0.0 for _ in z]
    v = float(rows["var_noise"].sum())
    by_series = rows.groupby("series").agg(s=("mean", "sum"), cv=("cv_level", "first"))
    v += float(np.square(by_series["cv"] * by_series["s"]).sum())
    by_group = rows.groupby("group").agg(s=("mean", "sum"), cv=("cv_group", "first"))
    v += float(np.square(by_group["cv"] * by_group["s"]).sum())
    sigma2 = math.log1p(v / (m * m))
    mu = math.log(m) - sigma2 / 2
    sigma = math.sqrt(sigma2)
    return [math.exp(mu + zq * sigma) for zq in z]
