# Handoff — Task 001 SQLite foundation

Updated: 06/09/2026
Worktree/branch: `<private path, withheld>` / `feature/001-sqlite-foundation`
Completed:
- Inspected current repository state, architecture/task/plan/status, the warehouse field inventory, the legacy pipeline package/migration proposal, and the relevant Content Studio phase-4 package/lock/migration implementation without reading runtime/private data.
- Added a new authoritative local SQLite foundation with WAL, foreign keys, 5-second busy timeout, FULL synchronous mode, checksum migration ledger, `user_version`, and idempotent second migration execution.
- Added SHA-256 content-addressed artifact storage with same-directory temporary files, digest verification, and atomic rename; SQLite stores manifest metadata.
- Added canonical JSON Schema + AJV validation and generated TypeScript contract for one manual/synthetic Box 1 input.
- Added source, ingestion, evidence, product, observation, and observation-evidence schema/service/query path. Product names do not define identity; cross-provider observations share a platform-product/metric/period identity and are not double-counted.
- Added synthetic fixture and integration coverage for required/FK rejection, migration rerun, rollback, idempotency, cross-provider identity, lineage, artifact roundtrip/hash, missing-vs-zero, money precision, percentage scale, and Trends-index semantics.
- Recorded inventory/reuse decision and the short data dictionary in `docs/foundation-data-dictionary.md`.

Changed paths:
- `.gitignore`
- `package.json`
- `package-lock.json`
- `contracts/foundation/manual-observation.schema.json`
- `contracts/foundation/manual-observation.generated.ts`
- `migrations/0001_foundation.sql`
- `src/platform/db/database.ts`
- `src/platform/db/migrations.ts`
- `src/platform/db/index.ts`
- `src/platform/artifacts/artifact-store.ts`
- `src/platform/artifacts/index.ts`
- `src/modules/foundation/canonical-json.ts`
- `src/modules/foundation/validation.ts`
- `src/modules/foundation/foundation-service.ts`
- `src/modules/foundation/index.ts`
- `tests/fixtures/manual-observation.synthetic.json`
- `tests/integration/sqlite-foundation.test.ts`
- `scripts/generate-foundation-contract.mjs`
- `scripts/typecheck.mjs`
- `scripts/migrate.ts`
- `scripts/ingest-manual.ts`
- `docs/foundation-data-dictionary.md`
- `docs/STATUS.md`
- `docs/handoffs/001-sqlite-foundation.md`

Evidence (commands, results, relevant revision):
- `package.json` pins Node `24.15.0` and npm `11.12.1`; `node --version` → `v24.15.0`; `npm --version` → `11.12.1`.
- `node -e "...require('better-sqlite3')..."` → driver loaded; SQLite `3.53.2`.
- `npm run check` → generated the contract, strict TypeScript check passed, 6/6 integration tests passed.
- `npm run db:migrate -- <temporary-path>/foundation.sqlite` first run → `appliedVersions:[1]`, WAL, foreign keys `1`, busy timeout `5000`; second run → `appliedVersions:[]`, current version `1`.
- `npm run --silent foundation:ingest -- <temporary-db> <temporary-artifacts> tests/fixtures/manual-observation.synthetic.json` → 4 metric observations, source `manual:synthetic-calcium-001`, grain `calendar_month`, SHA-256 artifact `fa5af0bb55514fdddf68c8f4d65e036d0d1e304283792a13eab4eb6dcb508c7f`.
- `npm ci` → clean lockfile install, 65 packages installed, 0 vulnerabilities (with the noted transitive deprecation warning).
- `npm audit --omit=dev` → 0 vulnerabilities.
- `git diff --check` → passed.
- Repository residue scan after temporary smoke run found no `.sqlite`, `.sqlite-wal`, `.sqlite-shm`, or `.env` files outside ignored dependencies.
- No commit was created; parent should review the worktree diff.

Unresolved:
- Task 001 intentionally has no collectors, provider calls, Data Pack, API/UI, worker, production backup/restore, retention execution, or legacy migration/backfill.
- Filesystem and SQLite do not form one physical transaction. Artifact writes are atomic/content-addressed and database writes are transactional; a process failure after artifact rename but before manifest commit can leave an unreferenced artifact for later reconciliation. It cannot create partial authoritative database state.
- The Content Studio phase-4 worktree was heavily modified at inspection time. Its Windows `.git` pointer required explicit WSL resolution; the recorded branch/revision is inventory evidence only, not evidence of the running source.
- `npm ci` emits the upstream deprecation warning for `prebuild-install`, a transitive dependency of the deliberately reused/pinned `better-sqlite3` 12.11.1; audit reports no known vulnerabilities.

Next action:
- Parent reviews schema/identity semantics and final check evidence, then creates the next scoped Box 1 task. Do not connect real providers or import old data under Task 001.

Business decisions pending:
- Per-source collection rights, retention/deletion rules, source-specific evidence-grade policy, product matching where a stable platform product ID is unavailable, RPO/RTO, backup cadence, and owner-approved real fixtures.
