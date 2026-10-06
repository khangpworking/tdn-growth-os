# Assignment A: finish supplemental source integration and verify it

You are assigned a bounded coding/verification task on the same Windows computer as the coordinating Codex chat. First read:

`C:/Users/Admin/Documents/Codex/2026-08-27/cou/work/research-automation-v1/docs/handoffs/manual-20261004/COMMON.md`

Then work in that repository. The current goal is paused; perform only A. Do not launch agents or take over B/C.

## Outcome

Finish the existing integration for run-bound supplemental packages used by M08 and M10/I11/I12/I16. Produce a stable, checked backend/client contract that the UI agent can use after reload. This is source preparation and explicit revision admission, not completed analytical content.

Read these additional handoffs:

- `docs/handoffs/research-supplemental-source-intake.md`
- `docs/handoffs/research-supplemental-intake-integration.md`
- `docs/handoffs/research-supplemental-method-client.md`
- `docs/handoffs/research-g-source-snapshot.md`
- `docs/handoffs/research-m08-quote-source.md`

## Current implementation and unfinished work

Claude added canonical server-created context and `readPreparedSupplementalSources` in `supplemental-source-inventory.ts`. GPT wired the service GET, API validator and `loadPreparedSupplementalSources` client. Their final combined delta has not yet been generated/typechecked/tested on Linux.

Existing endpoints:

- POST `/owner-api/workspaces/:workspaceId/research-automation/runs/:runId/sources/supplemental`
- GET `/api/workspaces/:workspaceId/research-automation/runs/:runId/sources/supplemental`

Service/client functions: `prepareSupplementalSource`, `listPreparedSupplementalSources`, `loadPreparedSupplementalSources`, `prepareSupplementalSource` (frontend). Existing `createReportRevision` client accepts quote/bounded variants.

POST uses the existing auth/Origin gates and multipart `metadata` plus `file:<logicalPath>`. Maximum 16 uploaded files, 8 MiB each and 32 MiB total. `automation-supplemental/context.json` is reserved for the server. Uploaded filenames are not storage paths. QUOTE supports structured JSON; BOUNDED may include the two existing pinned Markdown method authorities. Preserve those adopted authority bytes; do not design server authority injection in this task.

Package origin is bound to exact persisted run/start/scope. A prior real HTTP regression found foreign-run source admission returning 202; the origin repair now rejects it. Preserve that fix. Existing manual packages without an automation origin have their established explicit-selection behavior.

## Owned paths

- `src/modules/analysis/research-automation/supplemental-source-intake.ts`
- `src/modules/analysis/research-automation/supplemental-source-inventory.ts`
- `contracts/api/research-automation-supplemental-intake-api.schema.json` and its generated `.ts`
- Supplemental-source portions of `src/modules/analysis/research-automation/service.ts` and `src/api/research-automation-api.ts`
- Supplemental-source portions of `frontend/src/research-automation/api.ts`
- Relevant registrations in `scripts/generate-foundation-contract.mjs`, `scripts/generate-report-validators.mjs`, and generated validator declarations
- `tests/integration/research-automation-supplemental-intake.test.ts`, supplemental-source cases in `tests/integration/research-automation-api.test.ts`, `frontend/tests/research-supplemental-source-api.test.ts`
- Your own result handoff.

Do not edit Insight model prompt/execution, UI components, migration/dependency files or canonical method owners. Keep unrelated existing changes in shared files intact.

## Work checklist

1. Compare owned file hashes with the checkpoint. Audit the final context/inventory code and current wiring before modifying it.
2. Verify generated types derive from the final schema, errors at stored-corruption boundaries stay generic integrity errors, and GET is read-only.
3. Check quote/bounded admission and historical replay use the same run/workspace/family and exact package identities as intake/inventory. Decide from code evidence whether single-package context verification should be reused at admission. If needed, factor an existing verifier; do not scan the entire inventory on every historical read or invent a new framework. A real discrepancy needs a focused regression.
4. Synchronize the final current tree to your disposable Linux snapshot, regenerate there, then run targeted checks. Copy tracked generated output back to your owned Windows paths. Never hand-edit generated types.
5. Test inventory reload, other-run exclusion, canonical context/member metadata, corruption, exact retry, changed-content conflict, readonly GET and upload→same-run revision→historical read. Reuse the existing behavioral tests; avoid duplicate test layers.
6. Publish `manual-A-result.md` with READY_FOR_UI only when the final tested contract/client is coherent. Include the final schema/client hashes and the precise receipt/list shapes.

## Suggested Linux checks

Use package.json as authority; these commands are Linux-only:

```bash
npm run contracts:generate
npm run typecheck
node --import tsx --test tests/integration/research-automation-supplemental-intake.test.ts
node --import tsx --test --test-name-pattern='supplemental' tests/integration/research-automation-api.test.ts
npm run frontend:typecheck
node --import tsx --test frontend/tests/research-supplemental-source-api.test.ts
```

If service/revision behavior changes, run the affected quote/bounded owners and full API suite once. The pre-inventory full API suite passed 13/13; that evidence does not cover this final delta. Generated frontend JS is built by `frontend:validators` inside frontend:typecheck. Do not run every repo test repeatedly.

## Acceptance

Prepared inventory survives a fresh reader/reload without writes; run B cannot list/admit run A's prepared package. Metadata, bytes and package IDs remain verified. An explicit revision creates the intended new pair and old reports remain byte-identical. Exact retry returns retained identities without mutation. Generic integrity failures do not leak internals. UI agent can use generated request/list/receipt types and existing clients without modifying contracts.

Stop after the bounded handoff. No commit, provider/model call, live operator action or deployment.

