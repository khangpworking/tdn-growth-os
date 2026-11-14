# Shopee step 3: limit collection by review pages (C2)

The new-run form offers either a comment count (the existing default: 300) or a maximum number of Shopee review pages (default 10, range 1–100) per product link. Page mode keeps the existing source filters but does not offer an equal split by rating. The page budget is shared across rating filters for each link.

## Persisted policy and compatibility

Count-mode requests retain their `shopee-review-policy-v1` bytes. Page-mode requests use `shopee-review-policy-v2`, `limitBy: "pages"`, `pagesPerLink`, and the review service's existing 2,000-comment safety cap. The deployed `3a4f7056` writer/reader and review service refuse the new shape; rolling back does not make page-mode runs executable by the old version.

The service accepts optional `max_pages` (1–500). Omitting it preserves the existing 500-page behavior and request bytes. Only a requested limit below 500 makes `page_limit` a successful stop. Sampling transport identities include the complete request (including `max_pages`); the legacy collector refuses page-limited jobs when matching its count-only requests.

For page mode, the M3 gate uses `pages_not_exceeded`, preserves `min_reviews_per_link`, and omits the count-target shortfall warning. Exhausting available pages below the cap is valid. Count-mode gates are unchanged.

## Time budget evidence

Six saved jobs from runs `45a1797b` and `abc55ffa` were inspected offline. For 1, 4, 7, 51, 52 and 53 saved pages, job elapsed time divided by saved-page count was respectively 12.198, 6.345, 5.727, 4.558, 4.562 and 4.374 seconds/page. The slowest observed ratio extrapolates to 1,219.8 seconds for 100 pages, below the 1,800-second job deadline, so the maximum stays 100.

This is an estimate from saved count-mode jobs, not a verified 100-page live run. The crawler waits 3.5 seconds after page/filter changes and allows up to 20 seconds for a transition to settle. Slow pages can still reach the deadline; the existing timeout/failure handling remains in effect.

## Verification (2026-11-14)

- Generated contracts reproduce exactly; `npm run typecheck` and `git diff --check` pass.
- Affected backend suites: 343 tests pass.
- Desktop UI suite: 73 tests pass, including limit switching, request shape, summary and run metadata.
- Flow Python suite: 122 tests, 119 pass and 3 existing environment-dependent tests skip. This includes byte comparison against the deployed writer and old-version refusal.
- Desktop Python bridge suite: 50 tests pass.
- Review-service suite: 5 tests pass with a fake browser page and scratch SQLite store. These tests now run in the existing Shopee CI job using locked service dependencies.
- Offline full M3 execution on saved `abc55ffa` records/pages: 2 links, 1/4 saved pages, 3/21 rows; all six gate checks pass under a 10-page limit. Source records/pages are reused inside a synthetic scratch attempt; live run folders are untouched and no source/provider is called.
- The earlier whole-repository local test attempt timed out after 30 minutes with unrelated backend timing failures; it is not reported as a pass. Full Linux CI is required before merge.

## Release boundary

This change is not deployed. A release needs a fresh reviewed Shopee app deployment round, an updated Windows EXE/bridge, and deployment/restart of the review service. No existing deployment round's scripts, approval, lease or receipts may be rerun. Native Windows interaction and live Shopee/Metric/Jev behavior have not been tested by this package.
