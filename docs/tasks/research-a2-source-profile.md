# Research A2 — exact Metric workbook profile

Owner authorized coordinated report automation; business methodology belongs to `Review marketing framework files`. Coding base is A1 commit `781e819b54b97434794600fcf7d03764484efbf9` (PR #52, not yet merged). This branch is separate from Content Studio 049.

## Scope

One offline profile, `metric-shopee-product-list-sheet1-v1`, produces A1 normalized input, a cell-audit receipt, deterministic quantitative result and Vietnamese draft. Not a complete market/insight report or an AI inference engine.

```sh
npm run research:metric:normalize -- /private/export.xlsx /private/manifest.json - /private/new-bundle
# Replace - with a frozen labels JSON path when available.
```

Python 3 (standard library only) reads bounded OOXML bytes via a fixed shell-free subprocess. TypeScript validates canonical contracts and business mapping and reuses A1 calculations. No spreadsheet macros/formulas are evaluated, filesystem ZIP extraction or networking occurs. This narrow reader deliberately rejects non-flat/unsupported workbooks rather than becoming a general Excel engine.

Manifest contract: `contracts/analysis/metric-source-manifest.schema.json`. Labels contract: `contracts/analysis/metric-source-labels.schema.json`. Sheet1 must have the exact 20-column header, contiguous rows 1..lastRow, and an exact file hash. Header fingerprint is `8c2bdf296db44d3ab32e4e67908a0385cc34960717270a38ae05e325f5127bba`. Reject formulas, hidden rows/columns, merged cells, filters, ambiguous cells, missing required identity/category, duplicate listing keys, malformed numbers, wrong header/range/hash. No silent row exclusion.

## Frozen business mapping

| Column | Mapping |
|---|---|
| A | Original title |
| B | Exact `https://shopee.vn/product/{shopId}/{listingId}` identity |
| J | Exact `https://shopee.vn/shop/{shopId}` cross-check |
| K | Exact `1__{listingId}__{shopId}` cross-check, never identity repair |
| D / E | Period units / revenue VND, exact decimal integer strings |
| M | Original level-2 category, mandatory |
| C,F–I,L,N–T | Retained typed receipt only; no implicit analysis |

In particular R/T lifetime totals are not period E/D, O launch date is not the reporting period, and Q shop name is not an ID. Blank D/E remains missing, zero remains observed zero. No currency conversion or multiplication of price by units. `displayedValue` records the source lexical cell value, not Excel-rendered formatting; the receipt makes this limitation explicit. Precision is operator-declared and never promoted.

Scope, reporting period, ON/OFF/UNSPECIFIED selection, acquisition time and provenance must be explicit manifest declarations. They are never inferred from filenames or filesystem times, and do not authenticate provider provenance. One workbook per run; ON/OFF files are never concatenated. Unknown-label inclusion/exclusion is explicit, not a real-report default.

Row SHA-256 uses canonical JSON of the 20 typed cells (including style indices); workbook SHA binds original bytes/styles. Label sidecars must cover exactly every data row and bind workbook digest, row digest, shop/listing IDs, A1 content fingerprint and method/codebook. Adjudication stays as supplied (human/assistant/unknown); this path does not authenticate it. Missing sidecar permits all-scope only; stale/partial/extra/mismatched supplied sidecar rejects the whole label-enabled package.

## Output and recovery

New outside-Git 0700 bundle; four files at 0600. Exact retry recomputes and verifies deterministic bytes, then reuses without writes. Changed/corrupt/partial bundles or symlinks fail closed. Rejection is a JSON stderr diagnostic with input hashes, first failing locator and code; no partial output or raw row content. Cleanup is limited to files created by this invocation. Output is a private file bundle, not a DB-backed ledger or approval.

## Validation and exclusions

Linux CI only: no Windows tests, typechecks or builds. Test-audit authoring gate: one actual source/CLI boundary owns mapping, numeric precision, label freshness, rejection and publication; no repeated calculator/ranking/browser/load tests. Fixtures are synthetic OOXML, not copies of private exports.

No real acceptance claimed: the inspected Metric exports lack an explicit completed run manifest/acquisition declaration and real UNKNOWN policy. No Windows-to-Fedora transfer is established. Do not substitute synthetic data into a real report. Kalodata/trade imports/legacy reports/reviews without verified listing lineage remain outside this profile. No DB migration, provider, AI, paid call, real report publication, UI, runtime change, deployment or merge.
