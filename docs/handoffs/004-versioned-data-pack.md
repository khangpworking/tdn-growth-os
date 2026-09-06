# Task 004 handoff — Versioned finalized Data Pack

Status: implemented on `feature/004-versioned-data-pack`; keep PR #4 draft for review.

## Completed

- Added migration `0002_data_packs.sql` only; migration 0001 remains byte-identical.
- Added canonical request and frozen-manifest JSON Schemas with generated TypeScript types.
- Added explicit-observation Data Pack finalization and verified artifact replay through the Box 1 service.
- Frozen canonical manifests snapshot exact scope/period strings, product identity/display name, lossless decimal-string values/scales, and sorted evidence/source/ingestion/raw-artifact lineage.
- Added database triggers making finalized pack rows and membership immutable.
- Added idempotent semantic requests, higher-version same-key supersession, and conflict validation.

## Changed paths

- `contracts/foundation/data-pack-request.schema.json`
- `contracts/foundation/data-pack-request.generated.ts`
- `contracts/foundation/data-pack-manifest.schema.json`
- `contracts/foundation/data-pack-manifest.generated.ts`
- `migrations/0002_data_packs.sql`
- `scripts/generate-foundation-contract.mjs`
- `src/modules/foundation/data-pack-service.ts`
- `src/modules/foundation/validation.ts`
- `src/modules/foundation/index.ts`
- `tests/integration/versioned-data-pack.test.ts`
- `tests/integration/sqlite-foundation.test.ts`
- `docs/foundation-data-dictionary.md`
- `docs/STATUS.md`
- `docs/handoffs/004-versioned-data-pack.md`

## Verification

- Focused Task 004 integration tests: 7/7 passed locally.
- `npm run check`: 21/21 integration tests passed locally, including contract generation and strict TypeScript checking.
- `git diff --check`: passed locally.
- Fedora permission probe: live database, WAL, SHM, and frozen manifest artifact were all mode `0600`; disposable output was removed.
- GitHub Check workflow on PR #4: pending pushed commit.

## Remaining limitations

- Callers must provide explicit observation IDs; no business selection/filter rules are implemented.
- No calculation/Result, UI, provider, AI, worker, approval, backup/restore, retention executor, or artifact reconciliation is included.
- Artifact storage precedes the SQLite transaction, so a failed finalization after writing a new manifest can leave an unreferenced content-addressed artifact for later operational cleanup.
- Supersession records lineage but does not choose a current version or hide prior versions.
