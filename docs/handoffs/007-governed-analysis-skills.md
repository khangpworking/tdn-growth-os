# Task 007 handoff — Governed Box 2 analysis skills

Status: implemented on `feature/007-governed-analysis-skills`; keep PR #7 draft for review.

## Identity

- Starting SHA: `00d77d1ea32e77c4ace92e8fa5b16fbf09ed3c54`.
- Final SHA: pending final commit.

## Completed

- Added a canonical AJV execution request with only contract version, skill ID/version, and `input.resultId`.
- Added a static, explicit, default-closed registry containing exactly one capability.
- Added a thin executor that resolves the exact identity, delegates only the Result ID to Task 006, and returns existing immutable interpretation/artifact references in a typed receipt.
- Added a short declarative child `SKILL.md`; application code never scans or loads it.
- Added no migration, execution ledger, artifact wrapper, provider integration, Pi runtime, shell/tool dispatch, or dynamic plugin mechanism.

## Exact registry entry

- Skill ID/version: `analysis:market-snapshot-interpretation@1`.
- Owner/enabled adapter: Box 2, enabled, `MarketSnapshotInterpretationService`.
- Input: verified immutable `market_snapshot_v1` Result.
- Output: existing immutable interpretation ID and output artifact SHA-256.
- Allowed authority: read the verified Result and use Task 006's configured injected `AiGateway` boundary.
- Denied authority: tools, shell, arbitrary filesystem access, approval, and business mutation.

## Reused Task 006 components

- `MarketSnapshotInterpretationService` for verification, gateway execution, output validation, persistence, idempotency, and replay.
- Existing `MarketSnapshotResultReader`, prompt, schemas, `AiGateway`, content-addressed artifact store, and `analysis_interpretations` row/artifact.
- The adapter creates no second interpretation service, gateway, output artifact, table, ledger, or execution identity.

## Changed paths

- `contracts/analysis/governed-skill-execution-request.schema.json`
- `contracts/analysis/governed-skill-execution-request.generated.ts`
- `scripts/generate-foundation-contract.mjs`
- `src/modules/analysis/validation.ts`
- `src/modules/analysis/index.ts`
- `src/modules/analysis/skills/governed-analysis-skills.ts`
- `skills/market-snapshot-interpretation/SKILL.md`
- `tests/integration/governed-analysis-skills.test.ts`
- `docs/STATUS.md`
- `docs/foundation-data-dictionary.md`
- `docs/REPOSITORY_MAP.md`
- `docs/handoffs/007-governed-analysis-skills.md`

## Verification

- Focused Task 007 tests: 4/4 passed locally.
- Contract generation and strict TypeScript: passed locally.
- Full `npm run check`: passed locally, 36/36 integration tests.
- `git diff --check`: passed locally.
- Fedora governed-skill probe: database, WAL, SHM, Data Pack, Result, and interpretation artifact files remained mode `0600`; no skill ledger existed and disposable output was removed.
- GitHub Check: pending push.
- Migrations 0001–0004 are unchanged from the starting SHA, with SHA-256 values:
  - `cc454e4c837cac9ae4718fe3e963f9b9fad2b20ce0c4e6ae47757a25e701a7eb`
  - `b62f1a6d3ad5d0c7c4b26855da8f6b71bc3d5845b9fd6e8d6d13e1f468680d46`
  - `a13daec88cfe5abbb4a26d517744c9c6ccc613841eb47c3d9932264a1c5157ec`
  - `0e8add96ffe9cbfce075a5457349273ecac4d76bfc1bad98d19d6e0258b5530d`

## Limitations and recommended next task

- Registry contents are intentionally compile-time and fixed to one capability; there is no installation, discovery, enablement database, or runtime plugin lifecycle.
- No external skill content has been ported. Legal remains Box 5, orchestration/PM remains Box 3, and external skill repositories remain inventory/reference only.
- No live provider, Pi session/workspace, queue, worker, API, UI, proposal, approval, or action exists.
- Recommended next task: design a typed Box 3 proposal boundary that consumes immutable Box 2 references without granting approval or side-effect authority; keep Pi integration deferred until separately justified.
