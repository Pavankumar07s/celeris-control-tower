"""Ordering cycles: calendar-anchored patterns, template segmentation, posteriors and projection (dossier 3, 4.9, 5.1,
7.1 step 8; PZ findings 7-14, PZ.v).

Customers order on a fixed calendar cycle (business rule 6). Zeros are scheduled: 98.7 % of zero months are off-months
of one of 16 patterns, P(order | on-phase) = 99.87 % and P(zero | off-phase) = 99.37 %. The candidate set here is the
21 calendar templates those 16 belong to: ``M`` monthly; ``A-<Mon>`` monthly with one annual shutdown month; ``B0`` /
``B1`` every second month (on in Jan / Feb); ``Q0..Q2`` quarterly (on in Jan / Feb / Mar); ``T0..T2`` two on, one off
(off in Jan / Feb / Mar). The phase never moves with Lunar New Year or Diwali.

Algorithm, per series, on the order indicator ``o_t = 1[unconstrained demand > 0]`` (unknown cells excluded):

1. **Lost account**: at least ``LOST_MIN_SILENT`` known zero months after the last order of a series whose planned
   window reaches the as-of month (dossier 5.2: exactly 16 at 2026-10; no internal silence ever exceeds 5 months).
   Its life is truncated at the last order for classification.
2. **Segmentation** (integer mismatch counts, exhaustive): the best single template, and the best split into a
   template before and a different one after a change month with at least ``MIN_SEGMENT`` months on each side (series
   of at least ``MIN_CHANGE_LENGTH`` months). A change is accepted when it removes at least ``CHANGE_PENALTY``
   mismatches. Months whose cost is equal for both regimes form the change window; the change month reported is its
   first month (PZ: 27 changes, 2022-01..2023-11) and the new regime is in force from it, so an unknown cell inside the
   window follows the new pattern (BSS-073 North America 2023-05: its June order carries two months). Zero months in the first ``RAMP_EXEMPT_AGE + 1`` months of a launch
   are launch-ramp noise (P(zero | on) about 10 % at age 0) and are not counted as mismatches.
3. **Posterior** over templates for the current regime: likelihood with the error rates estimated from the
   classification itself (``ErrorRates``) times a prior estimated from the late-launch cohort (``CyclePrior``; PZ
   finding 13). Mature series are certain; the 18 just-launched series get a posterior and ``p_order`` < 1.
4. **Accumulation**: an order carries all latent demand since the previous on-phase month; the month after an annual
   shutdown carries the shutdown month at weight 0.5 (``c`` = 0.49-0.51); the first order of a series launched inside
   the window carries no months before it. This is represented as a span of latent months plus a weight on the
   carried months, never as a ``1.5`` multiplier (PZ.v correction 2).
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from celeris.demand.panel import N_MONTHS, Panel

MONTH_NAMES = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
KINDS = ("M", "A", "B", "Q", "T")
LOST_MIN_SILENT = 6
MIN_SEGMENT = 6
MIN_CHANGE_LENGTH = 18
CHANGE_PENALTY = 4
RAMP_EXEMPT_AGE = 2
RAMP_RATE_AGES = 4  # ages 0..3 get their own P(zero | on-phase) in the likelihood
SHUTDOWN_CARRY_WEIGHT = 0.5
MIN_LATE_COHORT = 50
ORDER = 1
NO_ORDER = 0
UNKNOWN = -1
OUTSIDE = -2


@dataclass(frozen=True)
class Pattern:
    code: str
    kind: str
    phase: str | None
    on: np.ndarray  # bool[12], calendar month 0 = Jan

    def is_on(self, month_idx: int) -> bool:
        return bool(self.on[month_idx % 12])


def _patterns() -> tuple[Pattern, ...]:
    months = np.arange(12)
    out = [Pattern("M", "M", None, np.ones(12, dtype=bool))]
    out += [Pattern(f"A-{name}", "A", name, months != m) for m, name in enumerate(MONTH_NAMES)]
    out += [Pattern(f"B{ph}", "B", str(ph), months % 2 == ph) for ph in range(2)]
    out += [Pattern(f"Q{ph}", "Q", str(ph), months % 3 == ph) for ph in range(3)]
    out += [Pattern(f"T{ph}", "T", str(ph), months % 3 != ph) for ph in range(3)]
    return tuple(out)


PATTERNS: tuple[Pattern, ...] = _patterns()
CODES: tuple[str, ...] = tuple(p.code for p in PATTERNS)
PATTERN_INDEX: dict[str, int] = {code: k for k, code in enumerate(CODES)}
ON_CALENDAR = np.stack([p.on for p in PATTERNS])  # (K, 12)
KIND_OF = np.array([p.kind for p in PATTERNS])


def on_matrix(month_idx: np.ndarray) -> np.ndarray:
    """(K, len(month_idx)) bool: whether each template expects an order in each month (month 0 = 2019-01 = Jan)."""
    return ON_CALENDAR[:, np.asarray(month_idx) % 12]


def calendar_span(pattern: int, month_idx: int) -> int:
    """Months from the previous on-month of ``pattern`` to ``month_idx`` (1 for monthly), by the calendar alone."""
    on = ON_CALENDAR[pattern]
    span = 1
    while not on[(month_idx - span) % 12]:
        span += 1
    return span


CALENDAR_SPAN = np.array([[calendar_span(k, m) for m in range(12)] for k in range(len(PATTERNS))])


def order_indicator(demand: np.ndarray, positive_unknown: np.ndarray, life: np.ndarray) -> np.ndarray:
    """``o_t``: 1 order, 0 no order, -1 unknown (inside the life), -2 outside the life."""
    out = np.full(demand.shape, UNKNOWN, dtype=np.int8)
    out[demand > 0] = ORDER
    out[demand == 0] = NO_ORDER
    out[positive_unknown] = ORDER
    out[~life] = OUTSIDE
    return out


@dataclass(frozen=True)
class ErrorRates:
    """Deviations from the template, estimated from classified cells (PZ: 0.13 % / 0.63 %; ramp 10.7 / 3.0 / 1.4 / 1.1 %)."""

    p_zero_on: float
    p_order_off: float
    p_zero_on_ramp: tuple[float, ...]

    def p_zero(self, age: np.ndarray, launched: np.ndarray) -> np.ndarray:
        ramp = np.array(self.p_zero_on_ramp)
        in_ramp = launched & (age >= 0) & (age < len(ramp))
        return np.where(in_ramp, ramp[np.clip(age, 0, len(ramp) - 1)], self.p_zero_on)


@dataclass(frozen=True)
class CyclePrior:
    """Prior probability of each template per region, from the late-launch cohort (PZ finding 13)."""

    table: pd.DataFrame  # index region, columns CODES

    def log_prior(self, regions: pd.Series) -> np.ndarray:
        with np.errstate(divide="ignore"):
            return np.log(self.table.reindex(regions).to_numpy())


@dataclass(frozen=True)
class Segmentation:
    """Per-series result of steps 1-2 (integer mismatch segmentation)."""

    frame: pd.DataFrame  # one row per series (see ``segment``)
    regime: np.ndarray  # (S, T) template index in force, -1 outside the life


def lost_accounts(o: np.ndarray, panel: Panel) -> pd.DataFrame:
    """Step 1: last order, trailing silent months and the lost-account flag per series."""
    months = np.arange(N_MONTHS)
    has_order = (o == ORDER).any(axis=1)
    last_order = np.where(has_order, np.where(o == ORDER, months[None, :], -1).max(axis=1), -1)
    after_last = months[None, :] > last_order[:, None]
    trailing_zero = ((o == NO_ORDER) & after_last).sum(axis=1)
    lost = has_order & (trailing_zero >= LOST_MIN_SILENT) & panel.alive_at_as_of
    return pd.DataFrame({"last_order_idx": last_order, "trailing_silent": trailing_zero, "is_lost": lost})


def segment(o: np.ndarray, panel: Panel, lost: pd.DataFrame) -> Segmentation:
    """Step 2: best single template or single change point per series (exact search over months and templates)."""
    start, end = panel.start, panel.end
    eff_end = np.where(lost["is_lost"], lost["last_order_idx"], end)
    age = panel.age
    exempt = (o == NO_ORDER) & panel.launched_in_window[:, None] & (age >= 0) & (age <= RAMP_EXEMPT_AGE)
    known = ((o == ORDER) | (o == NO_ORDER)) & ~exempt & (np.arange(N_MONTHS)[None, :] <= eff_end[:, None])
    on = on_matrix(np.arange(N_MONTHS))  # (K, T)
    regime = np.full(o.shape, -1, dtype=np.int16)
    rows = []
    for s in range(len(o)):
        if start[s] > panel.as_of or eff_end[s] < start[s]:
            rows.append(_segment_row(s, None, None, None, None, 0, 0, 0))
            continue
        span = slice(start[s], eff_end[s] + 1)
        mism = ((on[:, span] != (o[s, span] == ORDER)[None, :]) & known[s, span][None, :]).astype(np.int32)
        n = mism.shape[1]
        single = mism.sum(axis=1)
        best_single = int(single.argmin())
        c1 = int(single[best_single])
        change = None
        if n >= MIN_CHANGE_LENGTH:
            cum = np.concatenate([np.zeros((len(PATTERNS), 1), dtype=np.int32), np.cumsum(mism, axis=1)], axis=1)
            cuts = np.arange(MIN_SEGMENT, n - MIN_SEGMENT + 1)
            pre = cum[:, cuts]
            post = cum[:, [n]] - pre
            a, b = pre.argmin(axis=0), post.argmin(axis=0)
            total = pre[a, np.arange(len(cuts))] + post[b, np.arange(len(cuts))]
            best = int(total.min())
            ties = np.flatnonzero((total == best) & (a != b))
            if len(ties) and c1 - best >= CHANGE_PENALTY:
                last = ties[-1]
                change = (int(cuts[ties[0]]), int(cuts[last]), int(a[last]), int(b[last]), best)
        life_slice = slice(start[s], end[s] + 1)
        if change is None:
            regime[s, life_slice] = best_single
            rows.append(_segment_row(s, None, best_single, None, None, c1, c1, n))
        else:
            first_cut, last_cut, a_k, b_k, total_mm = change
            regime[s, life_slice] = b_k
            regime[s, start[s] : start[s] + first_cut] = a_k
            rows.append(_segment_row(s, a_k, b_k, start[s] + first_cut, start[s] + last_cut, total_mm, c1, n))
    frame = pd.DataFrame(rows)
    frame["eff_end_idx"] = eff_end
    return Segmentation(frame=frame, regime=regime)


def _segment_row(s: int, before: int | None, now: int | None, first: int | None, last: int | None, mm: int, single_mm: int, n: int) -> dict:
    return {
        "series_no": s,
        "pattern_before_k": -1 if before is None else before,
        "pattern_seg_k": -1 if now is None else now,
        "change_idx": -1 if first is None else first,
        "change_window_end_idx": -1 if last is None else last,
        "mismatches": mm,
        "mismatches_single": single_mm,
        "n_classified": n,
    }


def estimate_error_rates(o: np.ndarray, panel: Panel, seg: Segmentation) -> ErrorRates:
    """Deviation rates from the template on classified cells (lost tails excluded)."""
    months = np.arange(N_MONTHS)
    inside = (seg.regime >= 0) & (months[None, :] <= seg.frame["eff_end_idx"].to_numpy()[:, None])
    on = np.zeros(o.shape, dtype=bool)
    on[inside] = ON_CALENDAR[seg.regime[inside], np.nonzero(inside)[1] % 12]
    known = inside & ((o == ORDER) | (o == NO_ORDER))
    age = panel.age
    launched = panel.launched_in_window[:, None]
    mature = ~launched | (age >= RAMP_RATE_AGES)
    off_cells = known & ~on & (age >= RAMP_RATE_AGES)
    p_order_off = _rate((o == ORDER) & off_cells, off_cells)
    on_mature = known & on & mature
    p_zero_on = _rate((o == NO_ORDER) & on_mature, on_mature)
    ramp = []
    for a in range(RAMP_RATE_AGES):
        cells = known & on & launched & (age == a)
        ramp.append(_rate((o == NO_ORDER) & cells, cells))
    return ErrorRates(p_zero_on=p_zero_on, p_order_off=p_order_off, p_zero_on_ramp=tuple(ramp))


def _rate(hits: np.ndarray, cells: np.ndarray) -> float:
    """Share of ``hits`` among ``cells`` with add-half smoothing (never exactly 0 or 1)."""
    return float((hits.sum() + 0.5) / (cells.sum() + 1.0))


def estimate_prior(panel: Panel, seg: Segmentation, lost: pd.DataFrame) -> CyclePrior:
    """Template prior per region from identifiable late-launch series (PZ finding 13, ``v20`` rule).

    Kind shares come from series that started after 2019-01 (launches and the MEA opening), were classified on at least
    ``MIN_CHANGE_LENGTH`` months and are alive; the 2019 cohort over-states shutdown months (A share 37.8 % vs 25.4 %).
    Within A, the shutdown month follows the late cohort of the region with add-half smoothing over the months seen in
    that region in any cohort; B / Q / T phases are uniform (PZ: phases independent of everything).
    """
    frame = seg.frame.assign(region=panel.series["region"].to_numpy(), launched=panel.launched_in_window)
    identifiable = (frame["n_classified"] >= MIN_CHANGE_LENGTH) & (frame["pattern_seg_k"] >= 0) & ~lost["is_lost"].to_numpy()
    late = identifiable & frame["launched"]
    cohort = late if late.sum() >= MIN_LATE_COHORT else identifiable
    kinds = pd.Series(KIND_OF[frame.loc[cohort, "pattern_seg_k"].to_numpy()])
    share = (kinds.value_counts().reindex(list(KINDS), fill_value=0) + 0.5) / (len(kinds) + 0.5 * len(KINDS))
    a_codes = pd.Series(np.array(CODES)[frame["pattern_seg_k"].clip(lower=0).to_numpy()], index=frame.index)
    is_a = identifiable & (KIND_OF[frame["pattern_seg_k"].clip(lower=0).to_numpy()] == "A")
    table = pd.DataFrame(0.0, index=sorted(panel.series["region"].unique()), columns=list(CODES))
    pooled = a_codes[is_a].value_counts(normalize=True)
    for region in table.index:
        in_region = frame["region"] == region
        seen = a_codes[is_a & in_region].unique()
        late_counts = a_codes[is_a & cohort & in_region].value_counts()
        if len(seen):
            weights = pd.Series({code: late_counts.get(code, 0) + 0.5 for code in seen})
        else:
            weights = pooled
        weights = weights / weights.sum()
        table.loc[region, "M"] = share["M"]
        for code, w in weights.items():
            table.loc[region, code] = share["A"] * w
        for kind, phases in (("B", 2), ("Q", 3), ("T", 3)):
            for ph in range(phases):
                table.loc[region, f"{kind}{ph}"] = share[kind] / phases
    return CyclePrior(table=table.div(table.sum(axis=1), axis=0))


def log_likelihood(o: np.ndarray, panel: Panel, rates: ErrorRates, first: np.ndarray, last: np.ndarray) -> np.ndarray:
    """(S, K) log-likelihood of each template on months ``first..last`` of each series (unknown months skipped)."""
    months = np.arange(N_MONTHS)
    window = (months[None, :] >= first[:, None]) & (months[None, :] <= last[:, None])
    order = (o == ORDER) & window
    zero = (o == NO_ORDER) & window
    pz = rates.p_zero(panel.age, panel.launched_in_window[:, None])
    on = on_matrix(months)  # (K, T)
    ll_on = order * np.log1p(-pz) + zero * np.log(pz)  # (S, T)
    ll_off = order * np.log(rates.p_order_off) + zero * np.log1p(-rates.p_order_off)
    return ll_on @ on.T.astype(float) + ll_off @ (~on).T.astype(float)


@dataclass(frozen=True)
class CycleFit:
    """Everything the cycle step knows about every series at the as-of month."""

    series: pd.DataFrame  # one row per series: pattern now / before, change window, lost flag, posterior summary
    posterior: np.ndarray  # (S, K) posterior of the current-regime template (rows of empty series are NaN)
    regime: np.ndarray  # (S, T) template index in force per cell (-1 outside the life)
    on_phase: np.ndarray  # (S, T) bool
    accum_span: np.ndarray  # (S, T) int: latent months carried by an on-phase month (0 off-phase / outside)
    carry_weight: np.ndarray  # (S, T) float: weight of each carried month (NaN when nothing is carried)
    rates: ErrorRates
    prior: CyclePrior


def fit_cycles(o: np.ndarray, panel: Panel) -> CycleFit:
    """Steps 1-4 for every series of the panel."""
    lost = lost_accounts(o, panel)
    seg = segment(o, panel, lost)
    rates = estimate_error_rates(o, panel, seg)
    prior = estimate_prior(panel, seg, lost)
    frame = seg.frame
    has_life = frame["pattern_seg_k"].to_numpy() >= 0
    seg_first = np.where(frame["change_idx"] >= 0, frame["change_idx"], panel.start)
    ll = log_likelihood(o, panel, rates, seg_first, frame["eff_end_idx"].to_numpy())
    log_post = ll + prior.log_prior(panel.series["region"])
    log_post -= np.nanmax(np.where(np.isfinite(log_post), log_post, -np.inf), axis=1, keepdims=True)
    posterior = np.exp(log_post)
    posterior /= posterior.sum(axis=1, keepdims=True)
    posterior[~has_life] = np.nan
    current = np.where(has_life, np.nanargmax(np.where(has_life[:, None], posterior, 0.0), axis=1), -1)

    regime = seg.regime.copy()
    months = np.arange(N_MONTHS)
    for s in np.flatnonzero(has_life & (current != frame["pattern_seg_k"].to_numpy())):
        tail = months >= seg_first[s]
        regime[s, tail & (regime[s] >= 0)] = current[s]
    on = np.zeros(o.shape, dtype=bool)
    inside = regime >= 0
    on[inside] = ON_CALENDAR[regime[inside], np.nonzero(inside)[1] % 12]
    span, weight = accumulation(regime, on, panel)

    pattern_now = np.where(current >= 0, np.array(CODES)[np.clip(current, 0, None)], None)
    before = frame["pattern_before_k"].to_numpy()
    out = pd.DataFrame(
        {
            "series_no": frame["series_no"],
            "cycle_pattern": pattern_now,
            "cycle_kind": [None if p is None else PATTERNS[PATTERN_INDEX[p]].kind for p in pattern_now],
            "cycle_phase": [None if p is None else PATTERNS[PATTERN_INDEX[p]].phase for p in pattern_now],
            "cycle_posterior": np.where(has_life, np.nanmax(np.where(has_life[:, None], posterior, 0.0), axis=1), np.nan),
            "cycle_pattern_before": np.where(before >= 0, np.array(CODES)[np.clip(before, 0, None)], None),
            "cycle_change_idx": frame["change_idx"],
            "cycle_change_window_end_idx": frame["change_window_end_idx"],
            "mismatches": frame["mismatches"],
            "mismatches_single": frame["mismatches_single"],
            "n_classified": frame["n_classified"],
            "last_order_idx": lost["last_order_idx"],
            "trailing_silent": lost["trailing_silent"],
            "is_lost_account": lost["is_lost"],
        }
    )
    return CycleFit(out, posterior, regime, on, span, weight, rates, prior)


def accumulation(regime: np.ndarray, on: np.ndarray, panel: Panel) -> tuple[np.ndarray, np.ndarray]:
    """Span of latent months carried by each on-phase month and the weight of the carried months.

    The span reaches back to the previous on-phase month of the series (across a cycle change, PZ finding 9). A series
    launched inside the window carries nothing before its first order (PZ.v missed 1); a series present since 2019-01
    extends its first regime back by the calendar. A carried annual-shutdown month weighs 0.5.
    """
    n, t_max = on.shape
    span = np.zeros((n, t_max), dtype=np.int16)
    weight = np.full((n, t_max), np.nan)
    last_on = np.full(n, -1)
    launched = panel.launched_in_window
    for t in range(t_max):
        live = regime[:, t] >= 0
        is_on = on[:, t] & live
        first_span = np.where(launched, 1, CALENDAR_SPAN[np.clip(regime[:, t], 0, None), t % 12])
        span_t = np.where(last_on >= 0, t - last_on, first_span)
        span[is_on, t] = span_t[is_on]
        carried = is_on & (span_t > 1)
        previous = regime[:, t - 1] if t > 0 else regime[:, t]
        shutdown = KIND_OF[np.clip(previous, 0, None)] == "A"
        weight[carried, t] = np.where(shutdown[carried], SHUTDOWN_CARRY_WEIGHT, 1.0)
        last_on = np.where(is_on, t, last_on)
    return span, weight


def project_cycle(fit: CycleFit, panel: Panel, months: np.ndarray, series_no: np.ndarray | None = None) -> pd.DataFrame:
    """Extend each series' current regime to future ``months`` (absolute month indices after ``panel.as_of``).

    Returns one row per (series, month): ``p_order`` (posterior probability of an order), ``on_phase`` (MAP template),
    ``accum_span`` (latent months the order carries, counting back to the last on-phase month, which may lie in the
    history) and ``carry_weight`` (0.5 for a carried annual-shutdown month, 1.0 otherwise; NaN when nothing is carried).
    Lost accounts and EOL are not applied here (see ``celeris.demand.testgrid``).
    """
    months = np.asarray(sorted(months))
    if len(months) and months.min() <= panel.as_of:
        raise ValueError("project_cycle extends the cycle beyond the as-of month only")
    chosen = np.arange(panel.n_series) if series_no is None else np.asarray(series_no)
    has = fit.series["cycle_pattern"].notna().to_numpy()[chosen]
    k_now = np.array([PATTERN_INDEX.get(p, -1) if isinstance(p, str) else -1 for p in fit.series["cycle_pattern"].to_numpy()[chosen]])
    history_on = np.where(fit.on_phase[chosen], np.arange(N_MONTHS)[None, :], -1).max(axis=1)
    launched = panel.launched_in_window[chosen]
    on_future = on_matrix(months)  # (K, M)
    post = fit.posterior[chosen]
    p_order = np.where(has[:, None], np.nan_to_num(post) @ on_future.astype(float), np.nan)
    rows = []
    last_on = history_on.copy()
    for j, m in enumerate(months):
        is_on = np.where(has, on_future[np.clip(k_now, 0, None), j], False)
        first = np.where(launched, 1, CALENDAR_SPAN[np.clip(k_now, 0, None), m % 12])
        span = np.where(is_on, np.where(last_on >= 0, m - last_on, first), 0)
        prev_k_kind = KIND_OF[np.clip(k_now, 0, None)]
        weight = np.where(is_on & (span > 1), np.where(prev_k_kind == "A", SHUTDOWN_CARRY_WEIGHT, 1.0), np.nan)
        rows.append(
            pd.DataFrame(
                {
                    "series_no": chosen,
                    "month_idx": m,
                    "p_order": p_order[:, j],
                    "on_phase": is_on,
                    "accum_span": span.astype("int64"),
                    "carry_weight": weight,
                }
            )
        )
        last_on = np.where(is_on, m, last_on)
    out = pd.concat(rows, ignore_index=True)
    return out.sort_values(["series_no", "month_idx"], kind="stable").reset_index(drop=True)


def accumulation_weights(projection: pd.DataFrame) -> pd.DataFrame:
    """Explicit latent-month weights of every on-phase month: ``order(t) = sum_j weight_j x latent(t - j)``.

    One row per (series, target month, latent month); the own month weighs 1, carried months ``carry_weight``.
    """
    on = projection[projection["accum_span"] > 0]
    reps = on["accum_span"].to_numpy()
    expanded = on.loc[on.index.repeat(reps), ["series_no", "month_idx", "carry_weight"]].reset_index(drop=True)
    back = np.concatenate([np.arange(r) for r in reps]) if len(reps) else np.array([], dtype=int)
    expanded["latent_month_idx"] = expanded["month_idx"] - back
    expanded["weight"] = np.where(back == 0, 1.0, expanded["carry_weight"])
    return expanded.rename(columns={"month_idx": "target_month_idx"}).drop(columns="carry_weight")
