# Handoff: controlled calcium collection and Metric v2

Updated: 2026-10-02.
Worktree/branch: research-a24 / feature/controlled-canxi-metric-v2.

## Completed

Added explicit profile/version/header pairing for the current Metric XLSX
layout. V2 checks the exact shop and composite IDs against the product URL,
supports provider slug URLs and recognizes genuinely empty inline-string cells
as missing. Historical v1 behavior and exact source bytes are preserved.

Separately, the owner-authorized operational collection used three Fedora
API credentials and one authenticated Metric browser export. A private
32-file package was ingested via the unchanged foundation service after a
WAL-consistent recovery copy. Exact intake retry produced zero mutations.
Credential values, raw account replies, review bodies, author fields, private
artifacts and generated reports are absent from this branch.

## Changed paths

- Metric manifest schema and generated types.
- Metric source normalizer and standard-library XLSX reader.
- Synthetic workbook fixture and its owning normalizer regression.
- README, status, task brief and this handoff.

## Validation

Linux only, in a separate disposable checkout at base
`2f47e119fa68d540ab01e314af6284dec5786ae7` with this exact production patch:

- Contract generation and backend typecheck: PASS.
- Metric normalizer integration boundary: 9/9 PASS.
- Original 224-row current workbook normalization: PASS, outside Git.
- Full `npm run check`: PASS, 723 backend tests and frontend checks/build.
- New regression on pre-fix production: FAIL at INVALID_MANIFEST as intended;
  restoring the repair makes the same regression PASS.
- `git diff --check`: PASS.

No Windows tests, typechecks or builds were run. There are no migration,
dependency, frontend or domain-authorization changes. Final-head GitHub CI
remains a release gate until the draft PR publishes it.

## Operational evidence and limits

Metric period is 2026-08-30 through 2026-09-28, Shopee only, with a 224-row
export subset. The actual acquisition timestamp was not captured, so it stays
unknown rather than using a helper execution timestamp. Rounded browser
overview values are operator-transcribed observations, not independent proof.

Kalodata: two TikTok keyword rankings, 100 rows each and 187 unique IDs.
No verified Health category ID was supplied. SerpApi: six successful requests;
historical trends, news-query dates and current shopping prices are not merged
as one compatible sales timeline.

The original review Actor failed, yielding zero rows and USD 0.008 charge.
One alternate Actor returned 143 reviews for the exact five selected listings
at USD 0.51837. It is a shop-wide star-bucket sample, not complete product
history; reviews are not restricted to the revenue period. Separate mapping
and raw lineage are retained. The unchanged calcium prioritization filter kept
12 and removed 131, with no accuracy, sentiment or clinical inference.

Known total: USD 0.52637 in Apify charges, 0.2 Kalodata credits, six SerpApi
search credits. Subscription attribution and credit-to-USD conversion are
unknown. No AI calls, public evidence upload or subscription upgrade occurred.

## Unresolved and next action

The private citation preview uses Metric only and remains UNREVIEWED. It has
six PARTIAL_DETERMINISTIC_DRAFT sections, ten METHOD_ONLY, one
MANUAL_REVIEW_REQUIRED and thirteen BLOCKED sections. No classification
sidecar was fabricated; WIDE/CORE remain blocked. No live report was persisted.

Review and verify final-head Linux CI before a separate release activation.
Then add source-bound consumer mappings for retained Kalodata, SerpApi and the
alternate review sample through the existing methodology boundaries. Do not
relax missing-input gates or compare incompatible universes just to fill a
report. Browser login is not a Fedora Metric automation connector.

Business decisions pending: no new owner policy requested by this repair.
Runtime deployment and report approval are separate from source acquisition.
