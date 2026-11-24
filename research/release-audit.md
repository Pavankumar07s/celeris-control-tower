# Release audit: Celeris Control Tower, `main` at `dd088a1`

Auditor's run on 2026-11-25, from a fresh clone, against the jury criteria in `docs/evaluation_criteria.md`. Everything
below was checked by running a command or opening an output file. Anything I could not check is labelled as such.

## Verdict

**Not ready to submit yet, because of one blocker: there is no working demo link and no repository URL.** The engineering is ready:

- A fresh clone rebuilds every output byte for byte in 10 minutes 12 seconds.
- The test suite passes.
- The submission file meets the contract.
- The committed dashboard build opens, both at the site root and from a sub-path, with every data file present.
- Every quantitative claim I sampled (about 60) matches the outputs.

The remaining risk is in the write-ups:

- three or four claims would not survive a pointed question;
- a handful of numbers are quoted differently in the documents and on screen;
- the shipped research files still contain local paths and traces of the AI workflow.

All of these can be fixed in a few hours.

---

## BLOCKER

### B1. No demo link and no repository URL, though the portal requires both

- **Evidence.**
  - `docs/submission.md` line 65 has `<DEMO_URL>`, line 70 `<REPOSITORY_URL>` and line 89 `git clone <REPOSITORY_URL>`.
  - README line 200 says "The demo is not deployed yet".
  - Traceability rows S5 and S6 are `missing`, and D-T3 reads "deployment pending".
  - `methodology.md` line 891 repeats it.
  - The portal field is "Demo Link (working demo)". A judge with ten minutes will not clone the repository and start a server.
- **What I verified, so deployment is low-risk.**
  - I served the committed `dashboard/dist` from `python -m http.server` at `/` and, as on GitHub Pages, from a sub-path: I served `dashboard/` and opened `/dist/#/downloads`.
  - Headless Chrome 155 loaded both. All 36 requests returned 200, there was no 404, and the only absolute or localhost reference is a help string about Web Crypto.
  - Every file the app fetches exists in `dist/data`: 12 top-level JSON files, `lineage/{BSS,CSS,ELA,HYD,PMP,PTC,THM}.json` and `backtest_origin_{2021-10,2022-10,2023-10,2024-10,2025-03}.json`. These are the 23 files listed in `meta.json`.
  - The page renders "2.81M units", "P10–P90 2.73M–2.88M", "305 cases, $70.4M" and "Quantile engine: 7 of 7 checks match the pipeline".
  - Data download reports "23 of 23 files … re-hashed with SHA-256, every file matches".
- **Fix (about 30 minutes).**
  1. Push the repository to the `Pavankumar07s` account.
  2. Publish `dashboard/dist`, for example `git subtree push --prefix dashboard/dist origin gh-pages`, or a Pages Actions workflow that uploads `dashboard/dist` as is, with no rebuild.
  3. Open the Pages URL once and check that the hero and the rail self-check render.
  4. Replace the placeholders in `docs/submission.md` (lines 65, 70, 89).
  5. Put the link at the top of README and remove README line 200.
  6. Set traceability S5, S6 and D-T3 to done, move Gaps item 1 to "Fixed", and update `methodology.md` lines 891 and 902.

---

## SHOULD-FIX

### S1. "Held-back confirmation origins" overstates how independent they are

- **Where the claim is made.**
  - README line 26: "passed a declared optimisation round with held-back confirmation origins".
  - `docs/submission.md` lines 45–46: "checked on held-back origins".
  - `methodology.md` lines 625–627: confirmation origins are "looked at only after a candidate has passed on the decision origins".
  - `methodology.md` lines 642–643: the converged fit is "out of sample on the three confirmation origins".
- **What the project's own log shows.**
  - `docs/optimisation_log.md` lines 176–183: E4, the converged fit alone, was scored at the three confirmation origins although it had failed the decision rule (2 of 4 wins).
  - `docs/optimisation_log.md` lines 218–225: a prototype of the adopted method ("conv_bma") had been scored at all seven origins before it was declared.
  - The adopted E5a was designed after both results were seen. The log discloses this honestly, but the headline documents do not.
- **Fix.** Reword README line 26 and submission.md line 46 to "checked on three later confirmation origins (partly seen during development; see `optimisation_log.md`)". In methodology 8.4, replace "looked at only after…" and "out of sample on the three confirmation origins" with: "The confirmation origins were also scored for the failed E4 run and for an undeclared prototype, so they are only partly held out."

### S2. The pipeline is locked to this one extract, but the next steps promise scheduled re-runs

- **Evidence.**
  - `src/celeris/config.py`, from line 116: `EXPECTED` holds about 60 dossier counts, for example `train.date_nonstandard_raw: 9_967` and `grid.cells: 245_548`.
  - `src/celeris/quality/checks.py:30` `expect()` raises `ForensicMismatch` when any count differs.
  - README "What is original" item 1 sells this: "the pipeline fails the build if a count moves".
  - Yet `methodology.md` line 902 proposes "a scheduled re-run of `make all` when new months arrive". With new data that re-run fails by design.
- **Why it matters.** "What happens next month?" is an obvious jury question.
- **Fix (documentation, 10 minutes).** In methodology §3 and §14, say that the asserted counts lock the pipeline to this audited extract, and that a new extract needs `EXPECTED` re-baselined, or the checks downgraded to warnings, before scheduled runs. Optionally add a `--no-forensic-lock` flag later; do not change code tonight.

### S3. Wording that would not survive a pointed question

- **The 80 % band.** `docs/submission.md` line 139 (demo script) says "between 2.73 and 2.88 million with 80 % confidence".
  - Calibration is on monthly series, family × region and total × month cells, in sample (80.0 / 80.0 / 80.3 %).
  - The 19-month total band (±2.6 %) is checked only on 4 backtest totals (4 of 4 covered).
  - Family × region 19-month totals are covered 97 %, so the bands are wide at that level.
  - Leave-one-origin-out total × month coverage is 47 % for 2022-10 (`summary.json` → `coverage`).
  - The band also excludes the untestable macro-hump amplitude and new account losses (about 0.7 %; methodology §14).
  - **Fix:** say "a calibrated P10–P90 range (80 % on backtest months)" and keep the caveat ready.
- **Losses in the window.** `docs/modelling.md` line 633 says "no losses are scheduled in the test window" as a fact. The dossier rates this PLAUSIBLE only (`DATA_DOSSIER.md` 4.15). **Fix:** write "the data suggest none are scheduled; see dossier 4.15".
- **"Via `Replaces_SKU`" for cold starts.** `Replaces_SKU` sets only the timing and the price.
  - The level comes from a cross-sectional prior.
  - With the converged fit the prior scores 0.452 (WAPE + |bias|) on the 242 successor cells, worse than the 0.434 the geometric blend scored before. The blend was not re-run (`modelling.md` 5.5).
  - The methodology's "a predecessor-based level was more biased" is true only for the pure predecessor route.
  - **Fix:** state this trade-off in one line in methodology §11.

### S4. The same number is quoted differently on screen and in the documents

- **Cause.** The dashboard pools the cells of the four folds; the documents average the folds.
- **Differences.**
  - On screen (`meta.json` → `backtest.ladder`; Forecast hero): seasonal naive 38.6 %, cycle-aware naive 31.1 %, in-hindsight floor 23.5 %, MEA 34.2 %.
  - In README, submission.md and methodology: 38.7 %, 31.2 %, 23.6 % and 34.4 %.
- **The worst case.** The demo script (`submission.md` line 143) says "close to the 23.6 % noise floor" while the hero on screen reads "in-hindsight floor 23.5%".
- **Other pairs a judge could set side by side.**
  - "5 of 7 families with a stable driver" on the Macro view (same indicator in both eras) against "four families" in traceability F3.1 and methodology 6.2 (same indicator and lag at every decision origin).
  - "3,093 series in view" on screen (3,083 history series plus 10 cold-start series) against "3,083 series" in README.
- **Fix.**
  - Quote the on-screen values in the demo script.
  - Add one footnote under README "Headline results": "The dashboard pools the four folds' cells: 38.6 %, 31.1 %, 23.5 %."
  - Name the definition in the Macro hero, or in F3.1.

### S5. The numeric-error sentence in README does not add up

- **Evidence.** README line 21: "6,932 records … 4,071 are restored exactly, 385 to within ±5 units, and 332 are unknown". That sums to 4,788.
- **What is missing.** The 2,144 price and revenue fixes: N7 425, N8 312, N9 614, N10 498, N13 295. The 4,071 is `units_exact_recovered` in check `TRN-NUM-TOTALS`.
- **Fix.** "… 4,071 unit values are restored exactly, 2,144 price or revenue values are recomputed exactly, 385 units are restored to within ±5, and 332 are unknown and masked."

### S6. Test counts: a reviewer in a fresh clone sees 228 passed and 4 skipped, not 232

- **Evidence.** In the clean clone: `228 passed, 4 skipped, 1 deselected in 172.27s`. The four skips need files in `research/scratch/`, which is not shipped:
  - `labels-keys/record_id_blocks.csv`, 258 KB;
  - `labels-keys/missing_rows_from_record_id_gaps.csv`, 45 KB;
  - `macro-indicators/macro_clean.csv`, 8 KB;
  - `panel-missing-zeros/series_table.csv`, 1.4 MB, plus `test_phase_mask.csv`, 9.0 MB.
- **Why it matters.** Traceability rows C1.5 and C2.4 cite two of the skipped tests as evidence (`test_block_table_matches_labels_keys_lens`, `test_macro_matches_macro_lens`).
- **Fix.**
  - Either state it in README line 100, `docs/submission.md` step 6 and traceability C3.1: "in a fresh clone 228 pass and 4 skip, because they cross-check against research artefacts that are not shipped".
  - Or ship the three small files (about 311 KB) under `research/scratch/…` with a `.gitignore` exception, which brings the count to 231 passed and 1 skipped.

### S7. Local paths and AI-workflow traces in shipped files

- **What is in the repository.**
  - 23 research files contain `...` (for example `research/DATA_DOSSIER.md` line 844, `research/dates-dups.md` line 5).
  - 16 scripts in `research/optimisation_lab/lab2/*.py` and `research/methods-forecasting.md` line 807 hard-code `<scratch>/...`. That path carries the username and the tool name, and the scripts cannot run for anyone else.
  - `docs/design_system.md` lines 24–29 tell the reader to "Load the two skills … with the Skill tool" and point at `.claude/skills/...`.
  - `docs/optimisation_log.md` lines 32, 134 and 218–220 say "session scratchpad", "Third analyst", "predecessor" and "hand-over".
- **Context.** The commit history is clean: one author, `Pavankumar07s <136047863+Pavankumar07s@users.noreply.github.com>`, 13 commits, no co-author or "Generated with" lines. These files are the remaining traces.
- **Fix (about 30 minutes).**
  1. Run `git grep -l '' | xargs sed -i 's###g'`.
  2. In `research/optimisation_lab/lab2/*.py` and `research/methods-forecasting.md`, replace the `<scratch>/` prefix with `research/scratch/`.
  3. Rewrite `design_system.md` §0 for a human reader: "The design follows two public rule sets: UI/UX Pro Max (github.com/nextlevelbuilder/ui-ux-pro-max-skill) and dashboard-designer (MIT)."
  4. Rename the optimisation-log section "3. Continuation (from b7a96b4)" and replace "predecessor" or "analyst" with "the earlier run".

### S8. Licences

- **No project licence.** There is no `LICENSE`. A public repository without one is "all rights reserved"; jurors can read it but not reuse it. Add MIT, or whatever the team owner decides.
- **Fonts.** The shipped fonts carry no licence text: `dashboard/src/assets/fonts/plex-*.woff2`, `source-serif-4-normal-400-700.woff2`, and the hashed copies in `dist/assets`. `docs/dashboard.md` line 227 says "(OFL)". The SIL OFL 1.1 requires the licence and copyright notice to accompany redistributed font files. **Fix:** add `dashboard/src/assets/fonts/OFL-IBM-Plex.txt` and `OFL-Source-Serif-4.txt`, plus one line in README.
- **Third-party skills.** `.claude/skills/ui-ux-pro-max` declares no licence (no licence field in `SKILL.md`, no `LICENSE` file). `.claude/skills/dashboard-designer` declares `license: MIT`, `author: community`. Neither is tracked: they are ignored by `~/.gitignore_global` (`.claude/`) and are absent from `git archive`. Keep it that way; do not ship `ui-ux-pro-max` without a licence. Commit `afdce1f`'s message lists ".claude/skills" as added, which is harmless but untrue.

### S9. The favicon and browser theme colour still use the old cobalt theme

- **Evidence.** `dashboard/index.html` lines 8–10, and the same lines in `dashboard/dist/index.html`:
  - the favicon bars use `%23121826` (old blue-black ink) and `%232B4BD6` (cobalt);
  - `theme-color` is `#FBFBF9` (old paper) and `#0E1117` (old dark).
- **Why it matters.** This contradicts `design_system.md` line 17 ("no blue … anywhere"), and it shows in every browser tab of the demo.
- **Fix.**
  - Favicon: `%23141414` and `%23C24E08`.
  - `theme-color`: `#EDE6D6` (light) and `#0A0A0A` (dark).
  - Apply the same edit to `dist/index.html`. That file is not in the bundle hash list, so the in-app checksum check is unaffected.

### S10. A missing `data/raw` gives a bare traceback

- **Evidence.** `python -m celeris clean --raw-dir <empty>` ends in `FileNotFoundError: … events_calendar.csv`, raised from `io.sha256_file`, with no hint.
- **Good news.** Nothing is deleted: `run_stage` hashes the raw files before `invalidate_downstream`, so the committed `outputs/` survive.
- **Fix.** In `src/celeris/cli.py` `main()`, after `paths = …`:

  ```python
  missing = [f for f in RAW_FILES if not (paths.raw_dir / f).exists()]
  if missing:
      parser.error(f"missing in {paths.raw_dir}: {', '.join(missing)}; copy the seven provided CSV files there (README, Quick start step 2)")
  ```

  Here `parser` is `_parser()`, and `RAW_FILES` comes from `celeris.config`.

### S11. Source-zip figures are out of date

- `docs/requirements_traceability.md` line 174 says 40.5 MB, and `docs/submission.md` line 74 says "about 40 MB".
- The actual size is 42,913,683 bytes = 42.9 MB = 40.9 MiB. The packaging analysis below has the options.

### S12. Python reproducibility depends on versions that are not locked

- **Evidence.**
  - There is no lock file; `pyproject.toml` pins only ranges.
  - The byte-identical claim holds for the exact environment.
  - `manifest.json` → `software` records only python, pandas, numpy and pyarrow, not lightgbm, scipy or statsforecast, which shape the backtest.
- **Fix.**
  1. Run `uv pip freeze --python .venv/bin/python > requirements.lock`.
  2. In README, add: "for byte-identical outputs: `uv pip install --python .venv/bin/python -r requirements.lock -e . --no-deps`".
  3. Say that byte-identity is guaranteed for the locked versions.
  4. Also drop the unused dependencies `duckdb`, `polars` and `scikit-learn` from `pyproject.toml`. Nothing in `src/` or `tests/` imports them, and none is a transitive requirement. Keep `statsmodels`: statsforecast requires it.

---

## NICE-TO-HAVE

1. **Node version.** Vite 7.3.8 needs Node `^20.19.0 || >=22.12.0`, but the docs say "Node 20 or later" (README line 118, `dashboard.md` line 77, `submission.md` line 113). Add `"engines": {"node": ">=20.19"}` to `dashboard/package.json` and say "20.19+".
2. **Windows.** The backtest uses `multiprocessing.get_context("forkserver")` (`src/celeris/backtest/parallel.py:152`), which does not exist on Windows. Say "Linux or macOS; on Windows use WSL, or `CELERIS_WORKERS=1`". Also give the no-`make` command: `.venv/bin/python -m celeris all`.
3. **Dead references to unshipped scratch files.** `docs/design_gate_results.md` lines 21, 131 and 169 and many research reports cite `research/scratch/...`. Add to the README repository map: "`research/scratch/` (scripts and caches behind the reports) is not shipped".
4. **README "Known issues".** Lines 197–200 list items that were fixed on 24 Nov. Move them to the traceability "Fixed" list and keep only open issues.
5. **Small precision slips.**
   - Traceability C1.3 says "9,967 raw rows in 7 formats"; they are 6 non-standard formats (check `TRN-K3-DATE-FORMAT`: "Six alternative formats").
   - Lost units are 106,924.5 (fractional); check `DEM-UC-UPLIFT` shows 106,924 and the documents show 106,925.
   - `methodology.md` §10.2 shows a mean of 2,805,160 next to the 2,805,199 submission total, with no note that one is a sum of means and the other a sum of rounded rows.
   - The `pyproject.toml` slow-test marker says "~22 min, 2.7 GB" while README says "about 24 min, about 4 GB".
6. **×1.039.** It uses the display-filled history (2,699,398). On known cells only it is ×1.044. One footnote would pre-empt the question.
7. **Data-health headline.** "47 of the 90 failed" (blocking checks) sits next to README's "55 of 116 fail". Both are right, but the screen could add "of 116 checks, 55 failed".
8. **Problem statement PDF.** The organiser's `docs/problem_statement.pdf` is shipped while the dataset is withheld. Make one consistent decision on third-party material.
9. **Dev-only provisional mode.** `dashboard/dev/make_provisional_forecast.py` and the provisional-mode UI code are fine to keep; the current bundle has `provisional: false` and no pill.

---

## Reproduction log

| Step | Command | Result |
|---|---|---|
| Clone | `git clone ~/Desktop/mks <audit clone>`; `data/raw` symlinked | HEAD `dd088a1` |
| Interpreter | `PYTHONPATH=…/mks-audit/src …/mks/.venv/bin/python -c "import celeris; print(celeris.__file__)"` | `<audit clone>/src/celeris/__init__.py`, Python 3.12.13 |
| Pipeline | `make all PY=.venv/bin/python` with `PYTHONPATH` set (the Makefile default `PY=.venv/bin/python` matches the documented setup) | exit 0; 612 s wall (10:12)<br>stages: clean 8.8 s, demand 2.7 s, anomalies 4.7 s, features 12.5 s, backtest 548.8 s, forecast 12.7 s, export 19.5 s<br>max RSS of one process 2.75 GB<br>README says about 11 min and 2.7 GB |
| Hashes | `sha256sum -c` against the 138 committed files under `outputs/`, `dashboard/public/data/` and `dashboard/dist/` | 138 of 138 match. The 74 regenerated files are byte-identical: 51 `outputs/` and 23 `public/data/`. `git status` is clean. |
| Tests | `python -m pytest -q` (default marker deselects slow) | 228 passed, 4 skipped (research artefacts absent), 1 deselected; 2 min 53 s; max RSS 2.65 GB |
| Test count | `pytest --collect-only` | 232 of 233 collected (1 deselected); 233 with `-m "slow or not slow"` |
| Missing data | `python -m celeris clean --raw-dir <empty dir>` | bare `FileNotFoundError` traceback; no output directory created |
| Dashboard at root | `http.server 8291 -d dist`, headless Chrome `--virtual-time-budget=20000` | 23 requests, all 200; Overview renders 2.81M, 2.73M–2.88M, 305, $70.4M, self-check 7 of 7 |
| Dashboard at sub-path | serve `dashboard/`, open `/dist/#/downloads` | 36 requests, all 200; "23 of 23 files … every file matches"; submission card shows 58,219 rows, 2,805,199, "Identical to the bundle" |
| Make targets | `make -n all test dashboard test-all` | `.venv/bin/python -m celeris all`; `-m pytest`; `celeris export` plus `cd dashboard && npm ci --no-audit --no-fund && npm run build`; `-m pytest -m "slow or not slow"` |
| npm (on paper) | `package.json` against `package-lock.json` | lockfile v3; all 7 direct dependencies pinned and identical in the lock; all 75 entries from registry.npmjs.org; no `engines` field; `node_modules` is 120 MB, as documented |
| Clean-up | `rm -rf <audit clone>` | done; main repository untouched except this file |

**Python dependencies, checked on paper.** Imports in `src/` and `tests/`:

- third-party: pandas, numpy, pyarrow, scipy, statsforecast, lightgbm, pytest;
- standard library: multiprocessing (forkserver), concurrent.futures and others.

Declared but never imported: statsmodels (transitive via statsforecast, so it stays), scikit-learn, duckdb, polars. `requires-python >=3.12,<3.13` is stated in README.

---

## Submission contract (independent check)

`outputs/forecast/submission.csv` against `data/raw/test.csv` and `data/raw/sample_submission.csv`:

- the header `Date,SKU_ID,Region,Units_Sold_Forecast` equals the sample's;
- 58,219 rows, the same number as `test.csv`;
- the keys equal `test.csv` row by row in the same order, with 0 duplicate keys;
- 0 blanks, and every value matches `^\d+$`; min 0, max 629, sum 2,805,199, 8,842 zeros;
- no byte-order mark, LF line endings (the sample uses CRLF, which is harmless).

The dashboard's "Download submission.csv", rebuilt from `forecast.json` and `dims.json`, equals the file row for row.

---

## Claims checked against the outputs

Legend: ✓ = matches (to the rounding shown); ⚠ = matches the data, but the wording or another document differs (see the finding).

| # | Claim (document) | Source checked | Found | |
|---|---|---|---|---|
| 1 | 248,248 rows → 244,566 records → 245,548 cells; 2,946 duplicates; 736 superseded; 982 missing (README, sub.) | `dq_report.json` `summary`, checks K1, K2 | same | ✓ |
| 2 | 6,932 records (2.83 %) with numeric errors in 13 states | `train_numeric_states` | sum of N1–N13 = 6,932; 2.834 % | ✓ |
| 3 | 4,071 exact / 385 ±5 / 332 unknown (README) | `TRN-NUM-TOTALS` breakdown | 4,071 is unit recoveries only; 2,144 more fixes not mentioned | ⚠ S5 |
| 4 | 116 checks, 55 fail before, 0 errors and 4 warnings after | `summary` | 116 / 55 / 0 errors, 4 warnings, 4 info | ✓ |
| 5 | 5,761 of 5,761 units = `Shipped_Units` | `ORC-UNITS-SHIPPED` | `units_exact` 5,761 (plus 42 pack rows, 1 ERP) | ✓ |
| 6 | 12,030,253 vs 11,723,379 units; USD 8,684.4 M vs 8,575.9 M | `summary` | 8,684.43 / 8,575.85 | ✓ |
| 7 | 11,831,100 vs 11,724,013 units (+0.91 %) | `DEM-UC-UPLIFT` | same; +0.913 % | ✓ |
| 8 | Electrical Assemblies +44.8 % (2021), +29.2 % (2022) | `train_clean` `demand_uc` / `units_sold` | 44.79 % / 29.16 % | ✓ |
| 9 | Lost 106,925 units, USD 109.9 M; EA 80,664 units (75 %) | `train_clean` `lost_units` × `unit_price_usd` | 106,924.5; 109.95 M; 80,663.5 (75.4 %) | ✓ |
| 10 | 2021–22 lost 85,298 units, USD 93.2 M; EA USD 91.5 M (meth. 5.1) | same | 85,298; 93.22; 91.47 | ✓ |
| 11 | 225,942 scored cells | `metrics.csv` (`all`, mean) | 225,942 | ✓ |
| 12 | WAPE 26.1 %, bias +0.2 %; folds 28.3 / 26.0 / 25.1 / 25.1 | `summary.json` ladder | 0.26111, +0.00179; 0.2832 / 0.25995 / 0.2506 / 0.25071 | ✓ |
| 13 | Full ladder (meth. 9.1, 13 rows) | `ladder` → `mean_over_decision_folds` | every row identical | ✓ |
| 14 | Floor 23.6 %; model 2.5 points above it | `noise_floor_wape` 0.23565 | ✓; dashboard shows 23.5 % (pooled) | ⚠ S4 |
| 15 | Family × month 3.1 %, total × month 1.8 % | `family_month_wape`, `total_month_wape` | 0.03084, 0.01781 | ✓ |
| 16 | Hierarchy table (meth. 9.2) | ladder sub-metrics | all 24 cells match | ✓ |
| 17 | Ablations (meth. 9.3) | `experiments.csv`, mean of 4 folds | macro 27.76 / +1.6 / 32.01 / 7.18; EV 27.95–27.96 / 28.92 / 4.52; season 26.80 / 27.45 / 5.03; holidays 26.18 / 26.85; one-off 26.01 / −0.8 / 26.83 | ✓ |
| 18 | End-of-life phase-out 73.8 % → 42.1 % | `eol_phaseout` targeted rows | 0.7378 → 0.4213 | ✓ |
| 19 | EV from 2023 27.53 %; level windows 27.06 / 26.81 / 26.97; shading 27.31 % with bias −1.32 % | `experiments.csv` | same | ✓ |
| 20 | Ranges by family, region, channel and horizon; bias within ±1.6 % (meth. 9.4) | `metrics.csv`, series level, mean | 25.0–28.2; 23.2–34.4; 25.0–28.7; 25.7–26.7; max abs bias 1.59 % | ✓ |
| 21 | Ensemble table by fold (meth. 7.5) | `summary.ensemble.by_origin` | same | ✓ |
| 22 | Noise floor by origin (meth. 8.3) | `summary.noise_floor` | same | ✓ |
| 23 | Forecast 2,805,199; P10–P90 2.73 M – 2.88 M | `submission.csv`; recomputed with `aggregate_quantiles` | 2,805,199; 2,732,594 – 2,878,467 | ✓ |
| 24 | Sum of row P10 / P90: 1.79 M / 3.92 M | `forecast.parquet` | 1,789,909 / 3,919,913 | ✓ |
| 25 | ×1.039 against the last 19 months (2,699,398) | `train_clean` `demand_filled`, 2025-04..2026-10 | 2,699,397.8 → ×1.0392 (×1.044 on `demand_uc` only) | ✓ (NTH 6) |
| 26 | Revenue USD 2.52 bn | `forecast.parquet` `revenue_mean` | 2,517.2 M | ✓ |
| 27 | 8,842 zeros = 8,382 + 304 + 156 | `structural_zero_reason` | same | ✓ |
| 28 | Post-EOL 72 / 54 / 30; phase-out 108 rows, 4,004 units, 0.90…0.42 | `forecast.parquet`, `test_grid` | same | ✓ |
| 29 | Cold starts 117 rows, 10 series, 4,058 units | `forecast.parquet` | 117; 4,058 | ✓ |
| 30 | Orion North America: 62 series, 124 rows × 0.144; orders 3,779 / 714 / 574 / 3,425 | `forecast` + `test.csv` customer | same | ✓ |
| 31 | Helios India × 1.240, 1,235 rows, 78,929 units | same | same | ✓ |
| 32 | EV / ICE / Universal: 306,974 / 343,280 / 2,154,945 units | `forecast` + master | same | ✓ |
| 33 | EV β +0.0363 / −0.0117 | `structural_factors.json` | 0.03632 / −0.01171 | ✓ |
| 34 | Coverage 80.0 / 74.6 / 80.0 / 80.3; LOO 2025-03 81.6 / 78.1 / 89.5 / 100 | `summary.coverage` | same | ✓ |
| 35 | Uncertainty parameters (b 0.045–0.099, scale 0.894, cv 0.130 / 0.196 / 0.573, 0.042, 0.019) | `uncertainty.json` | same | ✓ |
| 36 | 98.7 % of 36,057 zero months are off-phase | `train_clean` | 35,595 / 36,057 observed zeros | ✓ |
| 37 | 507 one-offs, 106,709 excess units, median ×5.0, range 3.0–43 | `train_clean` | 106,708.9; 5.03; 3.00–43.45 | ✓ |
| 38 | Training masks (9 reasons, 16,356 … 7) | `train_mask` | all 9 identical | ✓ |
| 39 | Cycle kinds M 1,539, A 775, B 297, Q 242, T 230; 16 patterns | `stages.demand`; `series_state` | same; 16 | ✓ |
| 40 | 27 cycle changes / 23 switches / 16 lost accounts / 304 rows | `summary.stages.demand` | same | ✓ |
| 41 | Intermittency 2,197 / 749 / 101 / 36 | `ANM-SERIES-PROFILE` | same | ✓ |
| 42 | Register 11,799 rows; 37 / 2,558 errors; 299 / 8,905 real | register, `register_by_class_level` | same | ✓ |
| 43 | Fix log 77,558 rows; 73,875 cells by method; 3,683 rows dropped | `fix_log.parquet`, `summary` | same | ✓ |
| 44 | Manifest: 7 inputs, 50 outputs | `manifest.json` | 7 / 50 | ✓ |
| 45 | Lead / lag 2,184 rows; catalogue 39 entries in 12 groups; 15 driver origins | CSVs | same | ✓ |
| 46 | Drivers at 2026-10 (meth. 6.1 table) | `family_macro_drivers` | all 7 families identical | ✓ |
| 47 | 4 families keep indicator and lag at every decision origin | `macro_drivers_by_origin.csv` | Brake auto@1, Chassis auto@2, Electrical ord@2, Powertrain auto@3; none in Hydraulic, Precision, Thermal | ✓ (dashboard says 5, see S4) |
| 48 | PMP-004 business unit corrected; BSS-018 launch 2025-06 → 2025-02 | `sku_master_clean.csv` | `bu_corrected` / `launch_corrected` | ✓ |
| 49 | Cold starts 68.2 %, +15.2 %, 4,320 cells | `metrics.csv` `cycle_kind=unknown` | 0.6819, +15.17 %, 4,320 | ✓ |
| 50 | Lost accounts cost 0.2 points; one-offs 0.6 (modelling 5.4) | `metrics.csv` subsets | 25.92 / 25.54 against 26.11 | ✓ |
| 51 | Exceptions: 305 cases, 304 series, USD 70.4 M; by rule 191 / 33.6, 16 / 16.4, 10 / 7.4, 18 / 5.7, 62 / 4.7, 8 / 2.7; ranked | `exceptions.json` | same; strictly ranked; 8 rules defined, 6 fire | ✓ |
| 52 | Time machine 2025-03: 25.1 % against 37.0 % seasonal naive (demo) | `backtest_origin_2025-03.json` | 25.1 / 37.0 | ✓ |
| 53 | Dashboard ladder 26.1 / 26.7 / 38.6; floor 23.5 | `meta.json` ladder | 26.07 / 26.68 / 38.62 / 23.54 | ✓ |
| 54 | First month 153,360 – 161,934 | `aggregates.csv` | 153,359.28 – 161,933.40 | ✓ |
| 55 | `dist/data` identical to `public/data` | `diff -rq` | identical | ✓ |
| 56 | 232 tests in `make test` | fresh clone | 228 pass + 4 skip | ⚠ S6 |
| 57 | `make all` about 11 min; `make test` about 3 min | measured | 10.2 min; 2.9 min | ✓ |
| 58 | Zip about 40 MB / 40.5 MB | `git archive` | 42.9 MB (40.9 MiB) | ⚠ S11 |
| 59 | Description is "about 400 words" | word count | 423 | ✓ |
| 60 | 12 views; 5 required + 7 optional | `dashboard/src/views` | 12 view files; Overview and Downloads rendered | ✓ |

**Traceability sample (34 rows, Expert rows first).**

- **Rows checked:** C1.1–C1.5, C2.1–C2.4, C3.1, C3.2, A1.1–A1.3, A2.1–A2.5, A3.1–A3.4, F1.4, F2.1, F3.1, F3.2, M1.1, M1.2, M2.1–M2.3, M3.1–M3.5, D0.2, D0.6, D1.3, D5.2, D5.3, O2, O3, O6, O7, and business rules 3, 5 and 6.
- **Code references:** every function, test and path named in seven documents resolves. That is 266 references in README, methodology, traceability, modelling, architecture, dashboard and submission, and no `def` or file is missing.
- **Dashboard features:** each one named exists in `dashboard/src`. Checked: the PMI −3 preset, P97.5, the zero-month calendar, the time machine, the X-ray, the WAPE | Bias toggle, the diamonds and triangles, filters in the URL hash, and the `Units_Sold_Forecast` export.
- **Numbers:** as in the claims table.
- **Exceptions:** C1.5 and C2.4 cite tests that skip in a fresh clone (S6). M3.1's "via `Replaces_SKU`" needs the caveat in S3.
- **Links:** no dead relative links or anchors in README, `docs/*.md` and `DATA_DOSSIER.md`.
- **Screenshots:** all 12 README screenshots exist and match the build; the root render is identical to `final_overview.png`.

---

## Packaging analysis

**Tracked tree.** 457 files, 96.2 MB uncompressed. Largest:

| Size | File |
|---|---|
| 11.4 MB | `outputs/backtest/predictions.parquet` |
| 5.3 MB | `outputs/features/train_features.parquet` |
| 4.4 MB | `outputs/anomalies/anomaly_register.csv` |
| 4.1 MB | `outputs/clean/train_clean.parquet` |
| 4.0 MB × 2 | `backtest.json` (copies in `dist/data` and `public/data`) |
| 3.3 MB × 2 | `forecast_detail.json` (two copies) |
| 3.2 MB | `outputs/backtest/metrics.csv` |
| 3.0 MB | `outputs/forecast/forecast.parquet` |

**What is not tracked, correctly:** caches, `graphify-out/`, `.claude/`, `node_modules/`, `data/`, `research/scratch/`, the downloaded dataset and PDF, `.venv/`.

**Secrets scan.** No tokens or keys (`ghp_`, `github_pat_`, `sk-`, `AKIA`, private keys, `api_key=` / `password=` patterns), no e-mail addresses outside lock-file package metadata, and no metadata chunks in the PNGs. Personal and tool paths are listed in S7.

**Candidate zip.** Built with `git archive --format=zip -o …/scratchpad/celeris_source_candidate.zip HEAD`.

- Size: 42,913,683 bytes = **42.9 MB = 40.9 MiB**; 457 files; 96.2 MB uncompressed.
- Ten largest members (compressed):

  | Compressed | Member |
  |---|---|
  | 11.23 MB | `outputs/backtest/predictions.parquet` |
  | 5.25 MB | `outputs/features/train_features.parquet` |
  | 3.69 MB | `outputs/clean/train_clean.parquet` |
  | 2.89 MB | `outputs/forecast/forecast.parquet` |
  | 1.08 MB | `dashboard/dist/data/backtest.json` |
  | 1.08 MB | `dashboard/public/data/backtest.json` |
  | 0.90 MB | `outputs/quality/fix_log.parquet` |
  | 0.90 MB | `outputs/quality/stages/clean_fix_log.parquet` |
  | 0.58 MB | `outputs/features/test_features.parquet` |
  | 0.57 MB | `outputs/backtest/metrics.csv` |

- By folder (compressed): `outputs/backtest` 11.8 MB, `outputs/features` 5.9, `dashboard/dist` 4.9, `docs/screenshots` 4.6, `dashboard/public` 4.2, `outputs/clean` 4.0, `outputs/forecast` 3.3, `outputs/quality` 2.0, everything else under 1 MB.

**Size options.**

| Variant | Size | What it costs a reviewer |
|---|---|---|
| `HEAD` as is | 42.9 MB (40.9 MiB) | nothing |
| plus the seven raw CSVs (`zip -9 data/raw/*.csv`; the dataset zip is 7.47 MB) | **50.66 MB (48.3 MiB): over 50 MB if the portal counts decimal MB** | nothing, but it may be refused |
| without `dashboard/public/data` | 38.7 MB | `npm run dev` / `make dashboard-dev` show nothing until `make export` (20 s) is run. `make dashboard` re-exports anyway, and the viewing path (`dist/`) is unaffected. **Recommended exclusion.** |
| without `public/data`, plus the raw CSVs | **46.4 MB** | as above; the safe choice if the data must ship |
| without `public/data`, `train_features.parquet` and `stages/clean_fix_log.parquet` | 32.5 MB | features must be re-run (`make features`, 13 s) before inspecting them. `make all` is unaffected. |

Further exclusions I do not recommend:

- `outputs/backtest/predictions.parquet` (−11.2 MB): `make export` and the cold-start and successor claims (38.2 %, 4,320 cells) read it, so a reviewer would need the 10-minute backtest.
- `research/` (about 0.5 MB): it is the process evidence.

**Command for the recommended zip:**

```bash
git archive --format=zip -o celeris.zip HEAD -- . ':!dashboard/public/data'
```

If the owner decides to include the data, append it with `zip -9 celeris.zip data/raw/*.csv`.

**Data instructions.** README's Quick start step 2 is clear: the seven files, `mkdir -p data/raw`, `cp`, the expected listing, and a SHA-256 check against `manifest.json`. The pipeline's own message when the files are missing is not (S10).

**Commit history.** One identity on all 13 commits (author and committer `Pavankumar07s <136047863+Pavankumar07s@users.noreply.github.com>`). No `Co-Authored-By`, "Generated with", Claude or Anthropic lines. Two commits are titled "WIP: …", which is harmless.

---

## Jury read (strict but fair, ten minutes)

| # | Criterion | Score | Why |
|---|---|---|---|
| 01 | Problem Understanding | **9** | Three facts frame everything: shipments are not demand, zeros are scheduled, and errors leave exact signatures. Every Core, Advanced and Expert cell is mapped in the traceability matrix. |
| 02 | Data Preparation | **9** | The best part of the entry: 116 checks with before and after values, a 77,558-row fix log that replays onto the raw data, exact rules, the Record_ID grid with two independent witnesses, missing rows kept apart from zeros, and a lineage drawer. One point off for the README arithmetic slip (S5) and because the method is tied to this exact extract (S2). |
| 03 | Model Performance & Validation | **8** | Rolling origins with a 19-month horizon, the demand state rebuilt as of each origin, a no-leakage test, an oracle noise floor, 14 benchmarks, an honest negative LightGBM result, calibrated and coherent ranges. Lost points: two settings and the optimisation round were chosen on the same four folds; the confirmation origins were partly seen (S1); cold starts score 68 %; out-of-sample band coverage is uneven (47 % at total × month for 2022-10). |
| 04 | Quality of Insights | **8** | Practical and traceable: USD 109.9 M of hidden demand, an exception inbox ranked by revenue at risk, safety stock pooled on the aggregate (3.92 M against 2.88 M), lead indicators per family. It would gain from a short "three actions for the planner this month" opening. |
| 05 | Dashboard & Visualization | **7 now, 9 once deployed** | 12 polished views with one timeline, shared filters, an X-ray, a time machine, a what-if view and in-browser provenance checks. Without a demo link the judge may never see it (B1). Small inconsistencies with the documents (S4, S9). |
| 06 | Originality & Innovation | **9** | Decoding Record_ID, cycle-aware placement of latent demand, rebuilt unconstrained demand, variance components that make ranges add up, self-writing headlines with no LLM. |
| 07 | Solution Presentation | **7** | Thorough and honest, but dense: a 900-line methodology and a README that opens with a wall of numbers. There is no 10-minute path for a judge and no video. The traces in S7 could distract. |

**The five improvements with the most leverage, in a few hours.**

1. **Deploy and fill the links (B1).** This turns criterion 05 from "unseen" into the entry's showcase. The sub-path build is verified to work.
2. **Rewrite the over-claims (S1, S2, S3).** Confirmation origins as "partly held out"; the forensic lock against re-runs; "80 % on backtest months" instead of "80 % confidence"; losses in the window as "plausible"; `Replaces_SKU` used for timing and price only. Pointed questions then meet prepared answers instead of contradictions.
3. **One set of numbers everywhere (S4, S5, S6, S11).** Demo script equal to the screen, the numeric-error sentence fixed, test counts as a reviewer sees them, the zip size updated.
4. **A "10 minutes for the jury" block at the top of README.** Demo link, three screenshots, the five numbers that matter (26.1 % against a 23.6 % floor; 2.81 M with its range; USD 109.9 M of hidden demand; 305 cases / USD 70.4 M; 0 errors after 116 checks) and three key decisions, each with its link. A 2-minute screen recording of the demo script would help too.
5. **Hygiene pass (S7, S8, S9, S10, S12).** Strip local and tool paths, rewrite design_system §0, add the OFL and project licences, fix the cobalt favicon, give a friendly message for missing data, and add `requirements.lock`.

**Pointed questions and the prepared answer.**

- *"Did you tune on your test folds?"* Yes, two discrete choices and the converged fit, under rules declared in advance. All of it is disclosed in methodology 8.3 and 8.4. The confirmation origins are partly seen (S1). The improvement is small (0.5 points), and WAPE fell at all seven origins.
- *"How do you know the Orion shutdown is ×0.144?"* We don't. It cannot be tested; we borrow the measured Nexon strike as an analogue and widen the band (sd 0.25). It costs 5,449 units and USD 4.7 M, which is flagged in the inbox.
- *"Lost accounts forecast at 0: what if they come back?"* The rule is at least six silent months while the SKU's other regions keep selling. No silence longer than five months has ever ended. The USD 16.4 M at risk is surfaced as 16 inbox cases. In the backtest, losses inside the horizon cost 0.2 WAPE points.
- *"Is 2.73–2.88 M really 80 %?"* It is calibrated on monthly cells, not on 19-month totals, and leave-one-origin-out coverage drops in turbulent years (S3).
- *"Isn't Record_ID decoding a synthetic artefact?"* Yes, and we say so. The test file has no Record_ID, so it cannot leak into the forecast. The results are confirmed by two witnesses that do not use Record_ID. In a real ERP the same role would fall to a master grid of SKU × region × month.
- *"What happens next month?"* Today the pipeline is locked to this extract (S2). Say so before being asked.
