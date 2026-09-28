# Research A1–A3a — Linux acceptance and remaining decisions

This is a runbook, not authorization to transfer private files, deploy, merge, collect data or call a provider. Use an isolated Linux checkout at the reviewed exact commit. Existing operator processes and databases are not involved.

## Already owned by code, not questions for the owner

- Profile/version: `metric-shopee-product-list-sheet1-v1` / `1.0.0`.
- File/header hashes, sheet/cell locators, row bounds, URL-derived listing/shop identity and exact D/E numeric parsing.
- Scope/period consistency, label freshness, exact arithmetic, deterministic rendering, replay and no-overwrite.
- Supported source is one Shopee workbook per run. Do not concatenate ON/OFF or mix in Kalodata/TradeInt/reviews.

Technical metadata must be calculated/verified from the actual selected file; values from a different export or a historical report cannot be reused merely because the filename is similar.

## Remaining input gates, in order

1. **Source roles — owner resolved 2026-09-28:** for this study use Metric workbook `(4)` / abnormal filter ON as primary; `(3)` / OFF as a separate sensitivity comparison. Bind exact source bytes to the saved filter capture; never sum them or claim the difference measures market movement. Prepare a separate documented scope/period/acquisition manifest and output bundle for each. `selection` may explicitly be `UNSPECIFIED` only if evidence is missing; the current study has saved ON/OFF capture evidence. Current v1 requires an actual date-time for `acquiredAt`; it cannot yet encode unknown. Verify the basis of the saved `file_time_local` before treating it as acquisition evidence: filesystem mtime alone is not sufficient. If acquisition time cannot be established, stop real acceptance and decide a future unknown-date contract revision rather than inventing a timestamp.
2. **Wide scope — owner resolved 2026-09-28:** explicitly set `wideUnknownPolicy=exclude` for the current workflow. Retain fresh UNKNOWN records for inspection/separate disclosure but do not count them in WIDE. CORE membership is unchanged. Keep the field explicit in every version-bound input; do not change the calculator's generic contract to silently default it. Missing/stale/pending labels remain distinct from fresh UNKNOWN.
3. **Labels:** optional for an all-scope draft, required for WIDE/CORE. With no accepted sidecar, pass `-` and keep WIDE/CORE blocked. Existing labels need exact source/row/identity/content/codebook binding and honest adjudication provenance; do not relabel them as OWNER-approved.
4. **Insight later:** authorized evidence package/rights, exact locators, quote-versus-interpretation separation, deduplication and accepted claim methods. Not needed for A3a quantitative drafts; do not fill those sections to make the report appear complete.
5. **Publication:** a draft is never an official conclusion. Report approval is separate from code review/merge and is not implemented by these CLIs.

## Two offline commands, with no database or AI

The manifest and optional sidecar must already satisfy their reviewed schemas. All paths below are placeholders on Linux, outside Git; make the parent private directory first. No command below installs packages, changes a running operator, migrates a database, or contacts a provider.

```sh
set -eu
umask 077
# Use actual private paths, not the literal examples.
source_file=/private/selected-metric-export.xlsx
manifest_file=/private/approved-run-manifest.json
labels_file=-  # or an accepted, exact source-bound sidecar path
metric_bundle=/private/new-metric-bundle
report_bundle=/private/new-report-packet
catalog_file=docs/research/report-section-catalog-v1.json

npm run research:metric:normalize -- \
  "$source_file" "$manifest_file" "$labels_file" "$metric_bundle"

# Continue only if normalization succeeded. Pin the exact retained result and catalog.
result_sha=$(sha256sum "$metric_bundle/result.json" | cut -d ' ' -f 1)
catalog_sha=$(sha256sum "$catalog_file" | cut -d ' ' -f 1)
npm run research:report:packet -- \
  "$metric_bundle/result.json" "$result_sha" \
  "$catalog_file" "$catalog_sha" "$report_bundle"
```

Do not proceed after a rejection. Fix the documented source/manifest issue and choose a new output directory for changed content; never overwrite an old bundle to make a retry pass. CLI diagnostics and reports may contain private metadata and remain outside Git.

## Acceptance evidence to return

- Exact checkout SHA, source/manifest/sidecar/catalog hashes and explicitly declared scope/period/acquisition basis.
- Actual exit status; input/result/packet/report identity; counts and scope blockers, including missing versus observed zero and non-exact source precision.
- Second exact invocation reports `reused: true`, with unchanged retained bytes and modification times.
- Files 0600, bundle directories 0700, no private inputs/results tracked in Git.
- Manual source-cell spot checks of relevant D/E values and identity B/J/K against retained input; automated arithmetic replay does not authenticate the provider.
- No generated inference, official approval, provider/paid call or database mutation.

A3a remains `NORMALIZED_INPUT_ONLY`: its bundle retains the A1 canonical result (including normalized input) and catalog, not the raw workbook. A2's separate receipt documents exact workbook mapping with declared scope. Do not describe these as independent provider verification or full Market/Insight automation.

## Code review gates

Review/accept A1 #52, then A2 #54, then A3a #55. Branch integration and Linux CI do not imply owner merge approval. A3-only review must account for its inherited dependencies. No Windows tests/typechecks/builds are permitted by the current owner instruction.
