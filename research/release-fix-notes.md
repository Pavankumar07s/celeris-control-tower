# Release fix notes (documents, tests, packaging)

Running log of the documentation and packaging pass after the release audit (`research/release-audit.md`) and the
second dashboard review (`research/dashboard-review-r2.md`, finding M3), 25 Nov 2026. Scope: README, `docs/` (except
`design_system.md`, `design_gate_results.md`, `screenshots/`), research text files (hygiene), `src/celeris/cli.py` and
`config.py`, `pyproject.toml`, `Makefile`, `tests/`, new top-level files. Nothing under `dashboard/` was edited, no
pipeline stage was run against `outputs/`, and no model code or output changed. Every number written was read from an
output file (`outputs/…`, `dashboard/public/data/…`) or from a measurement named below.

## Log: finding → what was done → evidence

| Finding | What was done | Evidence |
|---|---|---|
| **B1** demo and repository URL | Closed by the team owner's decision: repository `https://github.com/Pavankumar07s/celeris-control-tower`, demo `https://pavankumar07s.github.io/celeris-control-tower/` (`gh-pages` branch, published by the orchestrator after this pass). Every placeholder replaced: README ("Ten minutes" block, first line; Dashboard row; workstream table; Known issues), `docs/submission.md` (Demo Link, Repository URL, Instructions to Run, demo preparation), `docs/requirements_traceability.md` (D-T3, S5, S6, Gaps: moved to Fixed), `docs/methodology.md` §14 (bullet "not deployed" removed; next step 4), `docs/dashboard.md` ("Deploy the static build"). | `grep -rn "DEMO_URL\|REPOSITORY_URL\|not deployed" README.md docs/` returns nothing outside `design_*` |
| **S1** confirmation origins | Reworded everywhere to what the lab notebook supports: declared in advance, E1–E3 scored on the decision origins only, but the confirmation origins were scored for E4 after it failed the rule (and at 2024-03 for its driver-switch margins), used in the E4 slices and the diagnoses of step 2, E6 and step 5, and seen for the `conv_bma` prototype before E5a was declared; so a consistency check, not an untouched hold-out. README (accuracy row), `submission.md` (description), `methodology.md` 8.4 (new paragraph), §12 row, §14 bullet, `modelling.md` (summary, 4 honesty note, 6 intro, 11 protocol + new paragraph), `optimisation_log.md` (dated "Deviation, recorded at release" note in the protocol). | `docs/optimisation_log.md` E4 table (confirmation rows), E4 margin sensitivity (2024-03), section 3 (`conv_bma` at all seven origins; rows in `research/optimisation_lab/results.csv`) |
| **S2** forensic lock | Stated in `methodology.md` §2 and a new paragraph in §3 (192 asserted counts; deliberate; re-baseline or monitored thresholds for a rolling run), §14 bullet and next step 4, `architecture.md` principle 5, README ("What is original" 1 and Quick start 3), `config.py` docstring (comment only), traceability limits. | `len(EXPECTED) == 192` in `src/celeris/config.py`; `expect()` in `celeris.quality.checks` |
| **S3** 80 % band | "with 80 % confidence" removed from the demo script; the bands are described as calibrated in sample to cover 80 % of monthly backtest actuals (rows 80.0 %, family × region × month 80.0 %, total × month 80.3 %); `methodology.md` 10.3 adds that the 19-month total has only four backtest totals (4 of 4 inside), family × region 19-month totals are covered 97.0 %, the total's band is −2.6 % / +2.6 %, and it leaves out the hump amplitude and new losses. README row, traceability M3.4 (LOO total × month 47.4–100 %). | `summary.json` → `coverage` (`monthly`, `horizon_total`, `leave_one_origin_out`); `aggregates.csv` |
| **S3** losses in the window | Now an inference everywhere: "the data suggest none are scheduled; dossier 4.15 rates this plausible; the test file has no customer change" (`modelling.md` 11, `optimisation_log.md` E4 and step 2, `methodology.md` §14). | `research/DATA_DOSSIER.md` 4.15 ("PLAUSIBLE … the test file confirms 0 switches") |
| **S3** `Replaces_SKU` | Stated precisely: in the model it sets only the successor's assumed price (`models/forecast_stage.py`); it also pairs predecessor and successor for display (Lifecycle view, register, inbox); timing comes from the master's launch dates, which fall in the predecessor's last months; the level comes from the prior, because successors inherit no region, customer or channel and the predecessor's level was far more biased; the blend (slightly worse on the first fit) was not re-run. `methodology.md` §11, `modelling.md` 5.5 and §10, traceability M3.1. Precision slip fixed: `modelling.md` 5.5 said 19 successor series; there are 14. | `predictions.parquet` (242 successor cold-start cells: WAPE 38.2 %, bias +7.0 %, WAPE + abs(bias) 0.452, pooled); `sku_master_clean.csv` dates; `series_blocks.csv` (14 series of ELA-015, HYD-021, PTC-028) |
| **S4 / M3** one set of numbers | The documents now lead with the figures the dashboard shows, pooled over the cells of the four decision folds: seasonal naive 38.6 %, cycle-aware naive 31.1 %, in-hindsight floor 23.5 %, intermittent methods 51.2–51.6 %, MEA 34.2 %, hierarchy table, slices, cold starts 65.3 % / +9.3 %. The floor is called "in-hindsight floor" as on screen. `methodology.md` 9.1 explains the two statistics once and is the only place that lists the mean-of-folds values (a table column and one paragraph); decision scores (WAPE + abs(bias)) stay means of folds and are labelled. README glossary explains "latent demand", "cycle-aware naive" and "in-hindsight floor"; the demo script explains them in the spoken lines. The gap to the floor is written as 2.5 points (26.07 − 23.54) with a note that the screen prints 2.6, the difference of its rounded figures. Traceability M1.1, M1.2, M2.1, M2.2 moved to pooled values. | `metrics.csv` (sums over the four origins) = `meta.json` → `backtest.ladder`; `summary.json` → `ladder` (means) |
| **S4** macro "4 vs 5 of 7" | Two different tests, both correct. By origin (same indicator and lag at every decision origin and 2026-10): 4 families (Brake, Chassis, Electrical, Powertrain). Dashboard (a driver of the model whose correlation at its lag keeps its sign and abs(r) ≥ 0.5 in 2019–22 and 2023–26): 5 families (Electrical, Hydraulic, Powertrain, Precision, Thermal). Recomputed the dashboard's 5 independently from `macro.json`; it is right. Both definitions are now named wherever a count is quoted (`methodology.md` 6.2, traceability F3.1, `dashboard.md` view guide). | `macro_drivers_by_origin.csv`; `dashboard/public/data/macro.json` → `leadlag`; `macro_leadlag.csv` |
| **S4** "3,093 series in view" | Explained in README terms and `methodology.md` terms: 3,083 history series plus the 10 cold-start series. | `test_grid.parquet` (10 series with no `series_no`) |
| **S5** numeric-error sentence | README now adds up: 4,071 units restored exactly (N1–N6) + 2,144 price or revenue recomputed (N7–N10, N13) + 385 pack-of-10 within ±5 (N11) + 332 unknown (N12) = 6,932. | `dq_report.json` → `summary.train_numeric_states`, `TRN-NUM-TOTALS` |
| **S6** tests in a fresh clone | The seven reference files the cross-checks read (five that caused the four skips, plus two read by conditional assertions in `test_anomalies.py` and `test_demand_outputs.py`) copied unchanged to `tests/fixtures/reference/` (the two large tables gzip-compressed, byte-identical when decompressed; 0.91 MB in total), with a README giving producer, reader and SHA-256 of each. `tests/conftest.py` points `RESEARCH` there. No test reads `research/scratch` any more. Counts updated: 235 tests, 234 in `make test`. | Run below: 234 passed, 0 skipped |
| **S7** local paths | All absolute local paths (a home directory and a temporary working directory) removed from tracked files: 21 research reports (repository-relative paths; "working files, not included in the repository" wherever they cite `research/scratch/`), 15 scripts in `research/optimisation_lab/lab2/` (paths now relative to the repository via `__file__`, with `CELERIS_OUTPUTS` and `CELERIS_LAB_SNAPSHOT` environment overrides; every script still compiles). No analysis text changed. | `git grep` for the two path prefixes, outside `dashboard/`, returns nothing |
| **S7** AI-workflow traces | Jury documents: `optimisation_log.md` ("session scratchpad", "second analyst", "predecessor", "hand-over", "Third analyst", "task brief" rewritten neutrally; script paths explained), `modelling.md` ("a predecessor's prototype"). Research files: housekeeping notes about a local tool instruction removed (labels-keys, labels-keys.verify, lifecycle-master, panel-missing-zeros, stockouts-unconstrained, demand-dgp, dates-dups, dates-dups.verify; test-structure row shortened); "another agent's working log" → "another lens's"; "Skill tool" wording and `.claude/skills` paths in the two design-skill notes now say "a local copy, not included in the repository". | grep for "skill tool", "scratchpad", "analyst", "agent" in README and `docs/*.md` (except `design_*`) returns nothing |
| **S8** licences | `docs/third_party/OFL-IBM-Plex.txt` and `OFL-Source-Serif-4.txt` (upstream LICENSE files of IBM/plex and adobe-fonts/source-serif, fetched 25 Nov 2026, line endings normalised) and `docs/third_party/NOTICE.md` (fonts with the version and notice embedded in each WOFF2 file, read from its `name` table; ECharts 6.1.0 Apache-2.0 with its NOTICE and d3 BSD-3 part, ZRender BSD-3, React / React DOM / scheduler MIT, tslib 0BSD, build tools, Python packages, design checklists as references only, organisers' material). README links it. `.claude/` added to `.gitignore` explicitly (it was ignored only by a global excludes file; `git ls-files .claude` is empty). No project licence added. | `dashboard/node_modules/*/package.json` and `LICENSE` files; font `name` tables |
| **S10** missing data | `python -m celeris <stage>` checks the seven files before anything runs and prints, in four or five lines, which files are missing, that the dataset is distributed by the hackathon organisers, and where to put it; exit status 2; nothing is written. Two tests in `tests/test_cli.py`. Documented in README, `submission.md`, `architecture.md` principle 8. | `tests/test_cli.py` (2 passed) |
| **S11** zip sizes | Updated from the real build (below) in `submission.md` and traceability S7. | `make source-zip` |
| **S12** dependencies | `scikit-learn`, `duckdb`, `polars` removed from `pyproject.toml`: nothing in `src/`, `tests/` or `dashboard/dev` imports them, none is in the dependency closure of the remaining packages, and every `celeris` module plus `statsforecast.models` and `lightgbm` imports with the three blocked. `requirements.lock.txt` added: `uv pip freeze` of the working environment restricted to the closure of the declared packages and the `test` extra (32 packages; `uv pip install --dry-run --offline -r requirements.lock.txt` → "Would make no changes"). README "Exact reproduction" says byte-identical outputs were verified with these versions (the audit's fresh-clone rebuild used this environment; the manifest records the same python, pandas, numpy, pyarrow versions). Slow-test marker text aligned with the Makefile (about 24 min, about 4 GB). | `importlib.metadata` closure; import check |
| **Packaging** | `.gitattributes`: `dashboard/public/data export-ignore`. `dashboard/dist` (with `dist/data`) is what a reviewer needs to open the site without Node and stays complete; `make all` / `make export` write `public/data` (the export creates the folder) and `make dashboard` re-exports before building, so the duplicate is not needed. `make source-zip` → `dist_zip/celeris_source.zip` (`git archive --worktree-attributes -9` of `HEAD`), `dist_zip/` git-ignored. Documented in README, `submission.md`, `architecture.md`. | Zip below |
| **README for a jury in a hurry** | "Ten minutes with this submission" at the top: demo link first, the three views and what each proves, the three results with their numbers, the reproduction command and runtime (and that the data is not needed to inspect results), and where the limitations are. Known issues cleaned (none open). | |
| **NICE-TO-HAVE** | Node 20.19+ (README, `submission.md`, `dashboard.md`); Windows note (WSL; `CELERIS_WORKERS=1` avoids the forkserver pool, untested) and the no-`make` command; `research/scratch/` marked as not shipped in the README map and `architecture.md`; traceability C1.3 "6 non-standard formats" and methodology K3; lost units 106,924.5 / 80,663.5 explained (fractional imputations; the check truncates); methodology 10.2 mean 2,805,160 vs rounded total 2,805,199 explained; ×1.039 footnote (×1.044 on known cells, 212 filled cells); the Data health view's "47 of 90 blocking" next to "55 of 116" explained in README and the demo script; description word count label updated (about 440 words). | outputs as named |

**Tests.** `.venv/bin/python -m pytest -q` after the code and test changes: `234 passed, 1 deselected in 172.16s
(0:02:52)`; maximum resident set 2.66 GB; no skip.

**Source zip.** `make source-zip` on `dd088a1` (the committed tree; this pass is not committed): 38,534,459 bytes
(38.5 MB, 36.7 MiB), 433 files, 73.8 MB uncompressed; `dashboard/public/data` absent, `dashboard/dist/data` complete
(24 files). Ten largest members (compressed): `outputs/backtest/predictions.parquet` 11.23 MB,
`outputs/features/train_features.parquet` 5.25 MB, `outputs/clean/train_clean.parquet` 3.69 MB,
`outputs/forecast/forecast.parquet` 2.89 MB, `dashboard/dist/data/backtest.json` 1.07 MB,
`outputs/quality/fix_log.parquet` 0.90 MB, `outputs/quality/stages/clean_fix_log.parquet` 0.90 MB,
`outputs/features/test_features.parquet` 0.58 MB, `outputs/backtest/metrics.csv` 0.57 MB,
`dashboard/dist/data/forecast_detail.json` 0.52 MB. Projected with this pass committed (same file selection, zip
level 9, calibrated against `git archive` to within 14 kB): about 39.2 MB for 449 files. Margin to 50 MB: about 11 MB.

## For the dashboard engineer (not edited by this pass)

1. **Favicon and theme colour (audit S9).** `dashboard/index.html` lines 8–10 and the same lines in
   `dashboard/dist/index.html`: favicon bars `%23121826` → `%23141414` and `%232B4BD6` → `%23C24E08`; `theme-color`
   `#FBFBF9` → `#EDE6D6` (light) and `#0E1117` → `#0A0A0A` (dark).
2. **Node engines (audit NTH 1).** Add `"engines": {"node": ">=20.19"}` to `dashboard/package.json`; the documents
   now say Node 20.19 or later (Vite 7.3.8 requires `^20.19.0 || >=22.12.0`).
3. **Licences in the hosted site (S8).** The deployed `dist` carries the fonts and the React, ECharts, ZRender and
   tslib code, but no licence text: the minified chunks have no licence comments. Copy
   `docs/third_party/OFL-IBM-Plex.txt`, `OFL-Source-Serif-4.txt` and `NOTICE.md` (or a plain-text version) into
   `dashboard/public/licenses/` so the build puts them in `dist/`, and link them from the footer or the Data download
   view. Alternatively keep legal comments in the build (esbuild `legalComments`).
4. **`docs/design_system.md` (S7).** Lines 25–30 (§0, step 1) tell the reader to "Load the two skills … with the Skill
   tool" and point at `.claude/skills/ui-ux-pro-max/` and `.claude/skills/dashboard-designer/SKILL.md`, neither of which
   is in the repository. Suggested text: "1. The design follows two public rule sets used as checklists: UI/UX Pro Max
   (github.com/nextlevelbuilder/ui-ux-pro-max-skill; how it applies here: `research/dashboard-skill-ui-ux-pro-max.md`)
   and dashboard-designer (a community rule set under MIT; `research/dashboard-design-skills.md`, section 9). Chart
   rules: `research/dashboard-design-skills.md` §7." Also drop "Also load **`dataviz`** before writing chart code" or
   rephrase as "follow the chart rules of §6". Line 19 already says the cited `research/scratch/design-editorial/` is
   not kept in the repository.
5. **`docs/design_gate_results.md` (S7, NTH 3).** Lines 21, 131 and 169 cite `research/scratch/dash-fix-r1/…`, which
   is not shipped: add "(working files, not included in the repository)".
6. **Macro matrix outlines (minor, does not change the "5 of 7").** `macro.json` → `leadlag.driver_lag` falls back to
   a driver selected in one era only when the indicator is not a driver of the full-history fit
   (`src/celeris/export/macro.py`, the `whole if len(whole) else drivers` line). The matrix therefore outlines as "the
   model's drivers" five indicator-lag pairs that the 2026-10 model does not use: Brake PMI @0 and raw-material cost
   @0, Chassis utilisation @3 and fuel price @1, Hydraulic inventory days @0. None of them is stable, so the count is
   the same with or without them; but the outline and the hero's definition ("a model driver") disagree for those
   cells. Fix: outline only `era == "all"` drivers (`structural_factors.json` → `family_macro_drivers` lists the same
   sets), or label era-only drivers differently.
7. **"2.6 points" above the floor.** The screen takes the gap from the printed figures (26.1 − 23.5); the exact pooled
   gap is 2.53 points (26.07 − 23.54). The documents now say 2.5 and explain the 2.6. Optional: compute the gap from
   unrounded values, or keep it (it lets a reader check the arithmetic on screen).
8. **Data health headline (audit NTH 7).** Optional: add "of 116 checks, 55 failed" next to "47 of the 90 failed"; the
   documents and the demo script now explain both counts.

## For the team owner

1. **Project licence: pending.** There is no `LICENSE`; a public repository without one is "all rights reserved".
   Not added in this pass, by instruction.
2. **After publishing:** open both URLs once and check that the Overview hero ("2.81M units", "P10–P90 2.73M–2.88M")
   and the rail self-check ("Quantile engine: 7 of 7 checks match the pipeline") render under
   `/celeris-control-tower/`, and that Data download reports 23 of 23 files verified (https is a secure context). The
   documents already state the demo as live.
3. **Commit, then build the upload.** `make source-zip` zips `HEAD` only; commit this pass first (about 39.2 MB
   expected). Untracked files to decide on: `research/release-audit.md` (contains eight absolute local paths in its
   reproduction log; neutralise them before committing it), `research/dashboard-review-r2.md`, this file.
4. **Organisers' material (audit NTH 8).** `docs/problem_statement.pdf` (and its transcription) is shipped while the
   dataset is not; decide whether the brief may be redistributed in a public repository.
5. **`src/celeris/reference/PROVENANCE.md` line 22** cites `research/scratch/labels-keys/map_region.csv`, which is not
   shipped (outside this pass's scope): add "(working files, not included in the repository)".
6. **Font files.** If the WOFF2 files were subset locally rather than taken as distributed upstream, OFL §3 (Reserved
   Font Names "Plex" and "Source") applies to the family names in the CSS; worth a one-line confirmation of where they
   came from.
7. Commit `afdce1f`'s message lists ".claude/skills" as added, which is harmless but untrue (history is not rewritten).
