import numpy as np
from celeris.features.macro import _cap_loss, soft_cap, soft_cap_slope, _batched_ridge

def _soft_cap_fit(
    r: np.ndarray, w: np.ndarray, x: np.ndarray, b: np.ndarray, prior: np.ndarray, prior_sd: float, signs: np.ndarray, n_iter: int,
    line_search: bool = True, smooth: float = 0.0,
) -> np.ndarray:
    """Penalised least squares of the soft-capped path by projected Gauss-Newton with step halving.

    Each step linearises the cap at the current path and solves the ridge problem (signs clipped to the economic
    sign); a row moves only if its loss does not increase, halving the step up to five times. Plain Gauss-Newton
    can alternate between two linearisations for a SKU whose path crosses the knee, and inside the backfit that
    alternation becomes a cycle (CSS-015, ELA-039, BSS-077 at 2022-10).
    """
    loss = _cap_loss(r, w, x, b, prior, prior_sd, smooth) if line_search else np.zeros(len(b))
    for _ in range(n_iter):
        u = np.einsum("ntj,nj->nt", x, b)
        slope = soft_cap_slope(u, smooth=smooth)
        target = _batched_ridge(r - (soft_cap(u, smooth=smooth) - slope * u), w, x * slope[:, :, None], prior, prior_sd)
        target = np.where(target * signs > 0, target, 0.0)
        if not line_search:
            b = target
            continue
        step = target - b
        new_b, new_loss = b.copy(), loss.copy()
        pending = np.ones(len(b), dtype=bool)
        for _ in range(6):
            trial = b[pending] + step[pending]
            trial_loss = _cap_loss(r[pending], w[pending], x[pending], trial, prior, prior_sd, smooth)
            better = trial_loss <= loss[pending]
            rows = np.flatnonzero(pending)
            new_b[rows[better]], new_loss[rows[better]] = trial[better], trial_loss[better]
            pending[rows[better]] = False
            if not pending.any():
                break
            step = step * 0.5
        moved = float(np.max(np.abs(new_b - b))) if len(b) else 0.0
        b, loss = new_b, new_loss
        if moved < 1e-9:
            break
    return b


