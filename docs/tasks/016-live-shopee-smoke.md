# Task 016 — Bounded live Shopee smoke verification

Status: LIVE PASS for one explicitly authorized listing; no Metric login, merge, or deployment.

## Authorized scope and change record

The original isolated smoke proposal was 50 reviews with an Apify `maxTotalChargeUsd` cap of USD 0.30. Before a successful run, the owner reduced the scope to 20 reviews and approved a USD 0.10 provider-side cap after confirming the Actor's pay-per-event pricing. The successful run therefore used exactly one listing, `maxReviewsPerProduct=20`, `starFilter=all`, `contentFilter=all`, and `maxTotalChargeUsd=0.10`. This narrower smoke scope does not change the production default or maximum of 500 reviews per listing.

The first capped launch attempt was rejected before creating a run because `startUrls` was sent as a string array. The corrected request used the Actor's required `{ "url": "..." }` objects. A later authorized launch succeeded as run `i6T1liAKkm9r2iNZs`, dataset `uGmehqbbdXCqBvjED`. No automatic retry or replacement run followed that successful launch.

## Application corrections

- Set the isolated smoke constant and CLI gate to 20 while retaining `PRODUCTION_MAX_REVIEWS_PER_PRODUCT=500`.
- Preserve the production `contentFilter=with comments` default, but allow the exact observed smoke provenance `contentFilter=all` in collection contracts and input hashing.
- Add an explicit existing-run collector mode pinned to both run ID and dataset ID. It performs GET requests only, verifies the recorded `maxTotalChargeUsd` equals the approved cap, compares the provider's persisted `INPUT` record byte-canonically with the expected URL/settings, and cannot POST an Actor run.
- Keep the Actor input URL shape as `startUrls: [{ url }]`, covered by focused tests.

## Acceptance evidence

The application fetched the existing successful run and dataset without another paid Actor call, persisted exact raw bytes and lineage, ran the existing filter, and replayed from persistence:

- fetched: 20;
- normalized valid unique rows: 20;
- kept: 2;
- removed: 18;
- invalid: 0;
- duplicates: 0;
- provider-reported dataset rows: 20;
- raw artifact SHA-256: `9ae3481d6b5296aa2d0e99758f01ba1015b51d82f02c7560e82d7f40aa4ef326`, 32,969 bytes, digest verified, mode `0600`;
- source lineage: `provider:apify-shopee-reviews`, completed ingestion, request digest and collection-evidence digest matched, evidence grade `unverified`;
- replay returned the same collection ID, collection digest, and result digest with `deduplicated=true` and did not invoke Python or Apify again;
- finalized provider usage: USD 0.084 under the confirmed USD 0.10 run option.

Raw review bodies, author data, credentials, runtime database, and artifacts are not committed.

## Remaining limitations

This is one operator-supplied stationery listing, not a calcium-market sample and not five Metric-selected products. Metric login/extraction remains unimplemented. Review dates are not constrained to the stated research period. The filter is a calcium-oriented priority heuristic, not sentiment, confidence, clinical evidence, or market inference; only 2 of these 20 unrelated stationery comments were retained. Third-party scraped evidence remains unverified and E0–E5 calibration is deferred.
