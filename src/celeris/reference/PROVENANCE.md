# Reference tables: provenance

The pipeline derives almost every lookup from the raw files themselves:

| Lookup | Derived from | Code |
|---|---|---|
| Canonical customers | `test.csv` (clean keys, dossier 2.3) | `celeris.cleaning.keys.vocabularies` |
| Canonical SKUs, family, description | `sku_master.csv` (601 SKUs; prefix -> family is unique) | `celeris.cleaning.master` |
| Family -> business unit | majority BU per family in `sku_master.csv`; corrects PMP-004 (dossier 2.5 S1) | `celeris.cleaning.master.correct_business_units` |
| Record_ID block table | the raw rows: constant `rec_num - month_idx` per SKU-region, blocks tiling 1..245,548 | `celeris.cleaning.record_id.derive_blocks` |
| Canonical prices | mode of the non-zero raw price per SKU x period (dossier 2.2) | `celeris.cleaning.prices.build_price_table` |

Only one table is shipped by hand, because it encodes abbreviations that cannot be derived by a normalisation rule.

## `label_aliases.csv`

Normalised alias keys (lower case, only letters, digits and `&`; see `celeris.cleaning.labels.normalise_key`) for
`Region` and `Sales_Channel`, with the canonical label and the kind of variant reported in the data-quality report.
Variants that differ from a canonical label only by case, whitespace or punctuation (`asia pacific`, `Europe `,
`Asia-Pacific`, `Tier 1 Distributor`) are resolved by the normalised key and need no entry.

- Source: `research/scratch/labels-keys/map_region.csv` and `map_sales_channel.csv` (labels-keys lens, 31 region and
  17 channel raw variants), confirmed by the skeptic review `research/labels-keys.verify.md` section 5 and 6: every
  variant maps to exactly one Record_ID-decoded region / one series channel, 0 over-merges.
- Evidence of correctness at runtime: the pipeline asserts that every non-blank label equals the region decoded from
  `Record_ID` (247,503 / 247,503 rows) and that every series has a single channel (3,083 / 3,083), and an unknown
  variant raises.
- Row counts by kind (raw rows, asserted in `celeris.config.EXPECTED`): Region abbreviation 1,948 and wording 188;
  Sales_Channel abbreviation (`T1 Distributor`) 403 and word order (`OEM Direct`) 370.
