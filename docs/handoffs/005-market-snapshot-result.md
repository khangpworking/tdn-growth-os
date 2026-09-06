# Task 005 handoff — Deterministic market snapshot Result

Status: implemented on `feature/005-market-snapshot-result`; keep PR #5 draft for review.

## Completed

- Added only migration `0003_analysis_results.sql`; migrations 0001/0002 remain byte-identical.
- Added canonical `market_snapshot_v1` request and Result contracts with generated TypeScript types.
- Added a declared read-only Box 1 `FinalizedDataPackReader`; Box 2 calculates only from verified frozen manifest bytes and does not query current observation/product tables.
- Added exact BigInt sums, coverage counts, missing-versus-zero behavior, sorted ignored metrics, canonical artifact persistence, immutable Result rows, idempotency, and verified replay.

## Exact calculation behavior

- `periodRevenueVndTotal`: BigInt sum of frozen `period_revenue_vnd` values, serialized as a decimal string; `null` when absent.
- `periodUnitsSoldTotal`: BigInt sum of frozen `units_sold` values, serialized as a decimal string; `null` when absent.
- An observed zero produces `"0"` and contributes one unique product to that metric's observed-product count.
- Coverage contains selected observation count, unique `(platform, platformProductId)` count, and unique observed-product count for each supported metric.
- Every unsupported metric code is emitted once in sorted `ignoredMetricCodes`; no unsupported metric is aggregated.

## Changed paths

- `contracts/analysis/market-snapshot-request.schema.json`
- `contracts/analysis/market-snapshot-request.generated.ts`
- `contracts/analysis/market-snapshot-result.schema.json`
- `contracts/analysis/market-snapshot-result.generated.ts`
- `migrations/0003_analysis_results.sql`
- `src/modules/foundation/data-pack-reader.ts`
- `src/modules/foundation/data-pack-service.ts`
- `src/modules/foundation/index.ts`
- `src/modules/analysis/validation.ts`
- `src/modules/analysis/market-snapshot-service.ts`
- `src/modules/analysis/index.ts`
- `scripts/generate-foundation-contract.mjs`
- `tests/integration/market-snapshot-result.test.ts`
- `tests/integration/sqlite-foundation.test.ts`
- `docs/foundation-data-dictionary.md`
- `docs/STATUS.md`
- `docs/handoffs/005-market-snapshot-result.md`

## Verification

- Focused Task 005 integration tests: 6/6 passed locally.
- `npm run check`: 27/27 integration tests passed locally, including six-contract generation and strict TypeScript checking.
- `git diff --check`: passed locally.
- Fedora permission probe: live database, WAL, SHM, Data Pack manifest, and Result artifact were all mode `0600`; disposable output was removed.
- GitHub Check workflow on PR #5: pending pushed commit.

## Remaining limitations

- Only exact neutral sums and coverage for `period_revenue_vnd` and `units_sold` are implemented.
- No averages, growth aggregation, ROI, scoring, ranking, thresholds, recommendations, AI, UI, worker, provider, approval, automatic selection, backup/restore, retention executor, or artifact reconciliation.
- Artifact storage precedes the SQLite transaction, so a failed Result write after a new artifact can leave an unreferenced content-addressed artifact for later operational cleanup.
- Concurrent same-calculation execution is protected by the database uniqueness constraint but is not coordinated into a shared idempotent response; worker/race handling remains outside this synchronous task.
