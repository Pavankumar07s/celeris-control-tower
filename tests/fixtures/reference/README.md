# Reference files for the cross-check tests

These files are outputs of the forensic investigations described in `research/*.md`. They were produced by the
investigations' own scripts, written before the pipeline existed and independently of it. The tests compare the
pipeline's results with them. The package never reads them.

The scripts and the rest of their working files (`research/scratch/`) are not included in the repository. The files
below were copied from there unchanged on 25 Nov 2026. The two large tables are stored gzip-compressed (`gzip -9 -n`);
decompressed, they are byte-identical to the originals. The SHA-256 is that of the original, uncompressed file.

| File | Rows | Produced by | Read by | SHA-256 of the original |
|---|---|---|---|---|
| `labels-keys/record_id_blocks.csv` | 3,083 | labels-keys lens (`research/labels-keys.md`, "Artefacts") | `test_reference_crosscheck.py::test_block_table_matches_labels_keys_lens` | `1b62851276023c16062b256b114d47fc4583b70366278f59b1f97a218b8d0cae` |
| `labels-keys/missing_rows_from_record_id_gaps.csv` | 982 | labels-keys lens | `test_reference_crosscheck.py::test_missing_cells_match_labels_keys_lens` | `e26684980428d81c11e580fec24b965316d040d4f0b344fb968ebec0a6bbaa1a` |
| `macro-indicators/macro_clean.csv` | 113 | macro-indicators lens (`research/macro-indicators.md`) | `test_reference_crosscheck.py::test_macro_matches_macro_lens` | `031529414833d18d7dae2da3a2e6c6305437b79d5c37011abc229fd7de7375ff` |
| `panel-missing-zeros/series_table.csv.gz` | 3,093 | panel-missing-zeros lens (`research/panel-missing-zeros.md`) | `test_demand_outputs.py::test_research_crosschecks` | `0307b8540ee2e8a7986ac548f9a95bdcaaed5390faf9d6294251f8c1049d814b` |
| `panel-missing-zeros/test_phase_mask.csv.gz` | 58,219 | panel-missing-zeros lens | `test_demand_outputs.py::test_research_crosschecks` | `a176378b3e5ba8a5390e205717228f9208a855800a625719af6591499a7c6f8d` |
| `panel-missing-zeros/cycle_changes_detail.csv` | 27 | panel-missing-zeros lens | `test_demand_outputs.py::test_cycle_changes` | `6d6a8f69ca0bf224390e3c917ef295d8b5d0d9040405d49a5549ebec196999bd` |
| `demand-dgp/oneoff_orders_dgp.csv` | 541 | demand-dgp lens (`research/demand-dgp.md`) | `test_anomalies.py::test_one_offs_are_real_stocking_channel_orders` | `1d0dcd9182112166ef290bc7362f458ffdf979e107a8418a240ad346a9c5949b` |

Check a compressed file against its hash with `zcat <file>.csv.gz | sha256sum`.
