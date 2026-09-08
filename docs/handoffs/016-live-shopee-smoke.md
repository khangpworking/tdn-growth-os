# Handoff — Task 016 bounded live Shopee smoke

Status: LIVE PASS using existing run/dataset; no additional Actor launch.
Branch: `feature/016-live-shopee-smoke`.
PR: <https://github.com/khangpworking/tdn-growth-os/pull/16> (must remain open and draft).
Starting SHA: `5650f158c059ebc2ef91f8e696d5f0c8f76ad9ba`.
Final SHA: recorded in the PR handoff comment because a commit cannot contain its own SHA.

## Live evidence

- Existing Apify run: `i6T1liAKkm9r2iNZs`; dataset: `uGmehqbbdXCqBvjED`; build: `qegOxhQ9LAGnjhzod`; status: `SUCCEEDED`.
- Settings: one listing, 20 reviews, all stars, all content, provider-side maximum charge USD 0.10.
- Finalized usage: USD 0.084 (20 review events, one Actor-start event, 20 dataset-item events).
- Application counts: fetched 20, normalized 20, kept 2, removed 18, invalid 0, duplicate 0, provider-reported 20.
- Raw page digest `9ae3481d6b5296aa2d0e99758f01ba1015b51d82f02c7560e82d7f40aa4ef326` verified over 32,969 exact bytes and persisted `0600`.
- Lineage verified through source `provider:apify-shopee-reviews`, completed ingestion, request digest, collection artifact, evidence row, and `unverified` evidence grade.
- Replay returned the same collection ID and collection/result digests with `deduplicated=true`. The second application invocation used persisted artifacts and made no provider call.

## Scope change and corrections

The owner reduced the proposed smoke from 50 reviews/USD 0.30 to 20 reviews/USD 0.10 based on current per-event pricing. Production remains 500. The rejected pre-run request revealed that the Actor requires `startUrls` objects; the successful external request used that corrected shape. Application changes align the smoke gate to 20, represent the observed `contentFilter=all` provenance without changing the production `with comments` default, and add a run+dataset-pinned GET-only resume mode that verifies the provider-recorded charge cap and persisted `INPUT` record before downloading data. Existing persisted replay also rejects changed run, dataset, cap, content filter, or row-limit arguments.

## Limitations

One operator-supplied stationery listing does not validate Metric selection, calcium-market representativeness, or multi-listing behavior. Metric login remains deferred. Provider evidence is not independently verified, review dates do not match the research period, E0–E5 calibration is absent, and the calcium filter's two kept rows are heuristic outputs rather than business conclusions. No merge or deployment is authorized.
