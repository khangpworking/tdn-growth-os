# Task 003 handoff — Multi-row JSON export ingestion

Status: implemented on `feature/003-json-export-ingestion`; keep PR #3 draft for review.

## Completed

- Added canonical JSON Schema and generated TypeScript contract for a provider-shaped multi-row JSON export.
- Added a byte-oriented service path and CLI that parse and validate before artifact or domain writes.
- Stored exact input file bytes, including whitespace, with the exact-byte SHA-256 as both request and artifact digest.
- Reused Task 001 source, product, observation, evidence, identity, lineage, integer, missing-versus-zero, timestamp, and transaction behavior without a migration.
- Added synthetic Metric.vn Product Card-shaped coverage for multiple products, shared lineage, idempotency, duplicate/conflict handling, and timezone offsets.

## Changed paths

- `contracts/foundation/json-export.schema.json`
- `contracts/foundation/json-export.generated.ts`
- `scripts/generate-foundation-contract.mjs`
- `scripts/ingest-json-export.ts`
- `src/modules/foundation/foundation-service.ts`
- `src/modules/foundation/validation.ts`
- `src/modules/foundation/index.ts`
- `tests/fixtures/json-export.synthetic.json`
- `tests/integration/json-export-ingestion.test.ts`
- `package.json`
- `docs/foundation-data-dictionary.md`
- `docs/STATUS.md`
- `docs/handoffs/003-json-export-ingestion.md`

## Verification

- Focused Task 003 integration tests: 5/5 passed locally.
- `npm run check`: 14/14 integration tests passed locally, including contract generation and strict TypeScript checking.
- `git diff --check`: passed locally.
- New CLI smoke test: exact fixture-byte SHA-256 and byte-for-byte round trip passed; database and artifact files were mode `0600`; disposable output was removed.
- Existing Task 001 integration coverage continues to verify live WAL/SHM permissions on Fedora.
- GitHub Check workflow on PR #3: passed for implementation commit `53ffc11091379349a16b8a46d94cd6509034357c` ([run 34011336793](https://github.com/khangpworking/tdn-growth-os/actions/runs/34011336793)).

## Remaining limitations

- Input is JSON only; no provider connection, XLSX/CSV parser, scheduling, worker, UI, aggregation, Data Pack, backup, or retention executor is included.
- Every export row must carry a stable synthetic/platform product ID. Mapping exports without one remains a Data Owner decision; product name is not used as identity.
- As in Task 001, artifact storage precedes the SQLite transaction, so a database failure after a new artifact write can leave an unreferenced content-addressed file for later operational cleanup.
- Exact supplied period strings remain part of observation identity, so equivalent instants written with different RFC 3339 strings remain distinct identities.
- Simultaneous same-key imports are not coordinated beyond the existing SQLite uniqueness constraint; this narrow synchronous Task 003 CLI/service path does not add worker-level concurrency handling.
