# Handoff — Task 015 file-input Shopee research

Status: FEDORA VALIDATED; implementation acceptance PASS with live collection explicitly NOT RUN.
Branch: `feature/015-file-shopee-research`.
Required base: `f845c5abab6b37f3c71f4225c6831a5c04a3c24e`.
Imported/review starting tip: `1728a0fe2e1497feb8600ae76b667d3946bf32c3`.
Final SHA: the PR handoff comment records the exact final commit because a commit cannot contain its own SHA.

## Approved scope

Fedora is the target runtime and data-storage environment. Task 015 accepts a bounded operator-supplied listing file; it does not log into Metric. The deterministic flow is:

1. validate and retain the exact listing-file bytes;
2. select Shopee listings only by exact period revenue;
3. choose up to five distinct operator-confirmed `productKey` values;
4. choose exactly one highest-revenue representative listing per product, rejecting ties/imprecise revenue/invalid URLs;
5. collect at most 500 raw rows for each selected listing without compensating after filtering;
6. preserve raw pages and provenance;
7. apply the existing callable Python filter;
8. persist and replay a bounded coverage/missing-data summary.

No Metric login/browser extraction, credential inspection, paid API call, deployment, TikTok collection, UI/chat, worker, scheduler, AI, or new deferred feature was performed or added.

## Implementation and review fixes

- Canonical schemas/generated types cover listing input, collection manifest, provider rows, and analysis result.
- Selection uses exact decimal strings through `BigInt`, Shopee-only product identity, operator-supplied nonblank `productKey`/grouping basis, deterministic one-listing choice, and fail-closed tie/precision/URL behavior.
- The fixed Apify adapter uses Actor `zen-studio/shopee-product-reviews-scraper`, `maxReviewsPerProduct=500`, `starFilter=all`, and `contentFilter=with comments`.
- The approved charge cap must be finite, positive, and at most USD 10,000 before any paid POST. Tests use only an injected mock fetch.
- The collection artifact binds a canonical digest of the exact fixed Actor input derived from selected URLs; save and replay reject incoherent mode/status/identifier/stop-reason/settings/input lineage.
- Local start/run receipts are `0600` inside `0700` directories, use exclusive creation, fsync file content and parent-directory entries, and persist intent before POST. Exact resume reuses the same run; ambiguous start never retries POST automatically; changed request/input/budget conflicts.
- Dataset pagination is bounded to 2,500 total and 500 per selected listing. A later-page failure preserves already fetched pages with explicit `dataset_read_failed` partial provenance.
- The foundation service preserves exact request/raw page bytes, canonical collection manifest, source/ingestion/evidence lineage, immutable collection row, and verified replay. Aggregate and per-listing limits are checked at save and replay.
- Provider-reported dataset total is retained separately when the response header exists; otherwise it remains explicit `null`, not inferred from fetched rows.
- The Python stdlib filter retains the owner-supplied v3 keyword/scoring behavior and per-product deduplication. Its subprocess receives only a minimal locale/Python environment and never inherits `TDN_APIFY_TOKEN`.
- Summary statuses conservatively distinguish sample limit, below limit, partial, failed, unavailable, and empty. Malformed rows associated with a selected listing yield partial. Multi-listing zero rows without per-listing provider evidence yield unavailable, not a fabricated evidentiary zero; empty is reserved for a single-listing successful exhausted dataset.
- Migration 0011 adds only immutable `foundation_shopee_collections` and `analysis_shopee_review_results`, including the analysis-to-collection foreign key and artifact lineage.

## Verification evidence

Exact Fedora toolchain:

- Node `v24.15.0`.
- npm `11.12.1`.
- Python `3.14.3` (`/usr/bin/python3`).
- Official Node Linux x64 archive SHA-256 matched published Node `SHASUMS256.txt`: `472655581fb851559730c48763e0c9d3bc25975c59d518003fc0849d3e4ba0f6`.
- `npm ci --ignore-scripts` plus local `better-sqlite3` rebuild: PASS; dependency and lockfile content unchanged.

Checks:

- Focused Task 015 integration tests: **16/16 PASS**.
- Contract generation: PASS.
- Strict TypeScript: PASS.
- Full `npm run check`: **97/97 PASS**.
- `git diff --check`: PASS.
- Independent CLI fixture smoke: PASS — five selected products, zero network calls, fixture mode, 9 fetched rows, 8 normalized rows, exact retry deduplicated to the same result artifact.
- Migration v10→v11 applies only migration 0011 and an idempotent rerun applies nothing: PASS.
- Migration 0011 foreign-key rejection of an orphan analysis result: PASS.
- Immutable collection/result rows, artifact metadata/canonical bytes, source request/selection/filter hashes, raw page replay, and changed-evidence conflict checks: PASS.
- No duplicate paid starts: mocked concurrent lock, prior-start uncertainty, exact same receipt resume, changed identity/budget, and ambiguous POST tests all PASS; no real POST occurred.
- Collection limits: at most five selected products, one representative listing each, 500 raw rows/listing, 2,500 rows/run, bounded 100-row pagination, and no filter backfill: PASS.
- Fedora permissions: database, WAL, SHM, exact request artifact, raw-page artifact, collection artifact, result artifact, start/run receipts are `0600`; receipt directories are `0700`.
- CLI/runtime output contains no review body/author or provider credential. Credential-isolation and token-redaction tests: PASS.
- Disposable Fedora smoke and test runtime data were removed; repository residue scan found no DB/WAL/SHM, environment, token, credential, log, or temporary files.

## Migration integrity

Migrations 0001–0010 are byte-identical to the required base:

- `0001`: `cc454e4c837cac9ae4718fe3e963f9b9fad2b20ce0c4e6ae47757a25e701a7eb`
- `0002`: `b62f1a6d3ad5d0c7c4b26855da8f6b71bc3d5845b9fd6e8d6d13e1f468680d46`
- `0003`: `a13daec88cfe5abbb4a26d517744c9c6ccc613841eb47c3d9932264a1c5157ec`
- `0004`: `0e8add96ffe9cbfce075a5457349273ecac4d76bfc1bad98d19d6e0258b5530d`
- `0005`: `e4785c6f98cf3a262b1ffa71dc7e374ae38263db4fe9b47677575d54389d7592`
- `0006`: `241b8a941db06673322b44aa2e7e5c26b5c45a390afcb06ca5062ced66ddeb88`
- `0007`: `18509c37e92f9d3a1b89921b2c827eadaa2ea58eeb5f15fe4e1f4a252e4f273b`
- `0008`: `285e1591771294455a9212d3cc1f3b02f17ade50e38718bfa337a8b9c6ebe848`
- `0009`: `f7c08885f9e7b42d12fbdd3b37011df65855ae21a7a4e33b3d2e490fd67d8439`
- `0010`: `4c2b348adb776e12bf011f90b46d6e12cd17798fc3374ffe399a3ffa67ffaebb`

Reviewed migration 0011 SHA-256: `c09dbf2e8bd8ee4046565cb6bbbd417c9c7ff3e93c25f79eff60299b58395a65` before the final commit; recompute from the final SHA for merge review.

## Limitations and live status

- **Live Apify collection was NOT RUN.** No token was read, inspected, or used; no paid API/provider request occurred.
- Metric login/browser extraction is deferred and did not block file-input acceptance.
- Synthetic fixtures and mocked provider responses validate contract behavior, not real Shopee completeness, Actor output stability, or market truth.
- A successful multi-listing provider dataset with no rows and no per-listing status cannot prove true zero comments, so the implementation conservatively reports `unavailable`. It does not fabricate per-listing success.
- Review dates are not constrained to the listing revenue period; this limitation is explicit in output warnings.
- The existing keyword score is not confidence, sentiment, clinical evidence, or market population inference. E0–E5 calibration remains deferred; live provider evidence would be `unverified`.
- The artifact-before-database orphan caveat remains unchanged; no reconciliation or deployment work was added.
