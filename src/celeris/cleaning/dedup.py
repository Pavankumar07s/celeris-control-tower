"""Step 2: one record per Record_ID, the latest load wins (business rule 2; dossier 2.1 K1-K2, 7.1 step 2).

Repeated Record_IDs always come in pairs: 2,946 byte-identical copies (same Load_Timestamp, adjacent rows) and 736
superseded loads (a re-load 5..24 days later in the same month, at the same time of day; units and revenue differ on
732). Rule: sort by (Record_ID, Load_Timestamp, raw row) and keep the last; ties are identical rows. Versions are never
summed (that would add 42,862 phantom units). The rule is validated by ``inventory_stockouts.csv``: on the 17 restated
stock-out months the latest version equals Shipped_Units, the earlier one never does (``celeris.cleaning.oracle``).
"""

from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

from celeris.quality.checks import Check, examples_from, invariant_check, issue_check
from celeris.quality.fixlog import fix_entries

FILE = "train.csv"
EXACT = "exact_duplicate"
SUPERSEDED = "superseded_load"


@dataclass(frozen=True)
class Deduplication:
    """``kept`` flags the surviving raw row of every Record_ID; ``decisions`` has one row per dropped raw row."""

    kept: pd.Series
    decisions: pd.DataFrame


def deduplicate(keys: pd.DataFrame, train: pd.DataFrame) -> Deduplication:
    """Keep the latest load per Record_ID and describe every dropped version.

    ``keys`` is the step-1 frame (index = raw row); ``train`` the raw text frame used to tell exact copies apart.
    Raises if two versions share a load timestamp but differ in content (the rule would be ambiguous).
    """
    ordered = keys.sort_values(["rec_num", "load_ts"], kind="stable")
    latest = ~ordered["rec_num"].duplicated(keep="last")
    kept = pd.Series(False, index=keys.index)
    kept[ordered.index[latest]] = True
    kept_row_by_rec = pd.Series(ordered.index[latest], index=ordered.loc[latest, "rec_num"])

    dropped = keys.loc[~kept, ["record_id", "rec_num", "load_ts", "units_txt", "revenue_txt"]]
    kept_rows = kept_row_by_rec.loc[dropped["rec_num"]].to_numpy()
    survivor = keys.loc[kept_rows, ["load_ts", "units_txt", "revenue_txt"]]
    identical = (train.loc[dropped.index].to_numpy() == train.loc[kept_rows].to_numpy()).all(axis=1)
    same_load = dropped["load_ts"].to_numpy() == survivor["load_ts"].to_numpy()
    if (same_load & ~identical).any():
        raise AssertionError("two versions share a Load_Timestamp but differ in content")
    decisions = pd.DataFrame(
        {
            "record_id": dropped["record_id"].to_numpy(),
            "rec_num": dropped["rec_num"].to_numpy(),
            "kind": pd.Series(same_load).map({True: EXACT, False: SUPERSEDED}).to_numpy(),
            "kept_raw_row": kept_rows,
            "dropped_raw_row": dropped.index.to_numpy(),
            "kept_load_timestamp": survivor["load_ts"].dt.strftime("%Y-%m-%d %H:%M:%S").to_numpy(),
            "dropped_load_timestamp": dropped["load_ts"].dt.strftime("%Y-%m-%d %H:%M:%S").to_numpy(),
            "delay_days": ((survivor["load_ts"].to_numpy() - dropped["load_ts"].to_numpy()) / pd.Timedelta(days=1)),
            "units_kept": survivor["units_txt"].to_numpy(),
            "units_dropped": dropped["units_txt"].to_numpy(),
            "revenue_kept": survivor["revenue_txt"].to_numpy(),
            "revenue_dropped": dropped["revenue_txt"].to_numpy(),
        }
    )
    decisions["value_changed"] = (decisions["units_kept"] != decisions["units_dropped"]) | (
        decisions["revenue_kept"] != decisions["revenue_dropped"]
    )
    decisions = decisions.sort_values("rec_num", kind="stable").reset_index(drop=True)
    return Deduplication(kept=kept, decisions=decisions)


def dedup_checks(keys: pd.DataFrame, dedup: Deduplication) -> list[Check]:
    """K1, K2 and the uniqueness of Record_ID after de-duplication."""
    decisions = dedup.decisions
    exact = decisions[decisions["kind"] == EXACT]
    superseded = decisions[decisions["kind"] == SUPERSEDED]
    versions = keys.groupby("rec_num").size()
    return [
        invariant_check(
            check_id="TRN-UNQ-RECORD-ID",
            file=FILE,
            rule="K1/K2",
            title="One row per Record_ID",
            description=f"{int((versions > 1).sum()):,} Record_IDs appear twice, none three times or more.",
            dimension="uniqueness",
            unit="raw_rows",
            checked=len(keys),
            violations_before=int((versions - 1).sum()),
            violations_after=int((keys[dedup.kept].groupby("rec_num").size() > 1).sum()),
            action="keep the latest Load_Timestamp (tie-break: last raw row)",
            expected_key="train.raw_rows",
        ),
        issue_check(
            check_id="TRN-K1-EXACT-DUPLICATE",
            file=FILE,
            rule="K1",
            title="Exact duplicate load",
            description="Same Record_ID and Load_Timestamp, all 15 columns identical, adjacent rows.",
            dimension="uniqueness",
            unit="raw_rows",
            affected=len(exact),
            action="keep one copy",
            expected_key="train.dup_exact",
            examples=examples_from(exact, ["record_id", "kept_load_timestamp", "units_kept"]),
        ),
        issue_check(
            check_id="TRN-K2-SUPERSEDED-LOAD",
            file=FILE,
            rule="K2",
            title="Superseded load (restatement)",
            description=(
                f"Re-loaded {superseded['delay_days'].min():.0f}..{superseded['delay_days'].max():.0f} days later; "
                "only Units_Sold and Revenue_USD change. The latest load equals Shipped_Units on every restated stock-out month."
            ),
            dimension="accuracy",
            unit="raw_rows",
            affected=len(superseded),
            action="keep the latest load; never sum versions",
            expected_key="train.dup_superseded",
            examples=examples_from(superseded[superseded["value_changed"]], ["record_id", "units_dropped", "units_kept", "delay_days"]),
            breakdown={"value_changed": int(superseded["value_changed"].sum())},
            breakdown_expected_prefix="train.dup_superseded",
        ),
    ]


def dedup_fix_log(decisions: pd.DataFrame) -> pd.DataFrame:
    """One ``<row>`` entry per dropped raw row; ``decisions`` must carry the record keys (date, sku_id, region)."""
    evidence = (
        '{"kind":"' + decisions["kind"] + '","dropped_raw_row":' + decisions["dropped_raw_row"].astype("str")
        + ',"dropped_load":"' + decisions["dropped_load_timestamp"] + '","kept_load":"'
        + decisions["kept_load_timestamp"] + '","kept_units":"' + decisions["units_kept"] + '"}'
    )
    parts = []
    for kind, rule in ((EXACT, "K1"), (SUPERSEDED, "K2")):
        mask = decisions["kind"] == kind
        parts.append(
            fix_entries(
                decisions[mask],
                file=FILE,
                step=2,
                rule=rule,
                column="<row>",
                method="dropped",
                raw_value=decisions.loc[mask, "units_dropped"],
                before="present",
                after="dropped",
                evidence=evidence[mask],
            )
        )
    return pd.concat(parts, ignore_index=True)
