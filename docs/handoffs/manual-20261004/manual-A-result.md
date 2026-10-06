# Handoff: A, supplemental source integration

Updated: 2026-10-04 (Asia/Bangkok)

Status: **READY_FOR_UI / READY_FOR_REVIEW** for the bounded A assignment. The overarching automation goal remains paused. This does not mark any analytical section complete.

Worktree: `C:/Users/Admin/Documents/Codex/2026-08-27/cou/work/research-automation-v1`

Starting branch/HEAD: `fix/research-real-world-audit` / `0116091fd5dc0902594f92d969dfb3ee0732c9c8`. No commit, push or branch switch. Essential inherited changes and untracked files were preserved.

## Completed

- Verified the inherited run-bound upload, canonical server context, reload inventory, HTTP wiring and browser clients on disposable Linux.
- Regenerated the supplemental contract on Linux and copied its generated TypeScript back to Windows. The current schema already contained the prepared-list contract; the previous generated file did not.
- Fixed an actual admission discrepancy: a Foundation-valid, origin-bound prepared package lacking the server-created context failed GET inventory with 500 but was admitted by POST report revision with 202.
- Factored `verifyPreparedSupplementalSource` from inventory. Admission and historical replay now verify the same exact single package, context and member metadata, without scanning the inventory. Selection must also match the prepared family, descriptor path, package identity and both digests.
- Existing explicit-selection behavior for manual packages without an automation origin is unchanged. Foreign-run prepared selection still returns 400, before queuing an attempt.

The regression extends the existing real HTTP intake owner. It uses the real Foundation writer to construct the missing-context case; it does not mock the admission decision. It verifies generic integrity rejection and unchanged database, attempt list and report versions.

## Stable UI contract and client

Read-only GET: `/api/workspaces/:workspaceId/research-automation/runs/:runId/sources/supplemental`.

Client: `loadPreparedSupplementalSources(workspaceId, runId)` in `frontend/src/research-automation/api.ts`.

List shape: `{ contractVersion: 'automation-supplemental-prepared-list-v1', workspaceId, runId, packages }`.

Each package has `requestKey`, `family` (QUOTE/BOUNDED), `state`, `packageId`, `manifestArtifactSha256`, `packageContentSha256`, `descriptorPath`, `files`, `sourceLabel`, `acquiredAt`, `provenance`, `admission`. Each file has `path`, `sha256`, `byteSize`, `mediaType`. `acquiredAt` can be null; do not invent acquisition time.

POST: `/owner-api/workspaces/:workspaceId/research-automation/runs/:runId/sources/supplemental`.

Client: `prepareSupplementalSource(workspaceId, runId, request, files, token)`; read its actual signature before calling. It snapshots the request/files before awaiting, computes uploaded-byte digests and validates the exact returned receipt. The client sends once; it does not auto-retry or admit.

Request generated type: `ResearchAutomationSupplementalPrepareRequest`. Fields: `contractVersion: 'automation-supplemental-prepare-v1'`, stable `requestKey`, `family`, `sourceLabel`, `acquiredAt`, `descriptorPath`, and `files: [{ path, mediaType, representationRole }]`. FormData contains one `metadata` JSON plus `file:<logicalPath>` members. Maximum 16 uploaded files, 8 MiB each, 32 MiB total. Server-owned `automation-supplemental/` is reserved.

Receipt generated type: `ResearchAutomationSupplementalPrepareReceipt`: package fields above plus `contractVersion: 'automation-supplemental-prepared-v1'` and `exactRetry`. New creation is 201; retained exact retry is 200. A prepared-list entry omits those two receipt-only fields.

Always retain the constant meanings:

- `state: 'PREPARED_NOT_ADMITTED'` describes stored source preparation, even after a revision uses it.
- `provenance: 'OPERATOR_SUPPLIED_UNVERIFIED'` is not authenticated provider collection.
- `admission: 'SEMANTIC_REPLAY_REQUIRED_AT_REVISION'` is not a completed section or approved conclusion.

Use existing `createReportRevision` from `report-revisions-api.ts`, with the exact current predecessor pair and the exact selected package fields. QUOTE and BOUNDED are separate request variants, each with Metric/native reviews KEEP. They cannot be combined into a new invented contract.

The service recursively inherits the previous quote/bounded selection when that family's field is absent from a later revision. An explicit SKIP stops inheritance. Thus adding the other family in a subsequent version retains the prior family under the current service; never infer analytical completeness from this. Historical versions remain selectable and unchanged.

## Evidence actually run

Linux scratch, not the live operator: `/home/pkhang/.cache/tdn-p1-isolation-20261003-ZVXHsB`.

Toolchain: Node 24.15.0 / npm 11.12.1 from `/home/pkhang/.nanobot/workspace/.toolchains/node-v24.15.0-linux-x64/bin`.

- Linux `npm run contracts:generate`: PASS.
- Linux backend typecheck: PASS, including after the verifier repair.
- Linux frontend validators and typecheck: PASS.
- Supplemental browser client tests: 2/2 PASS.
- Baseline supplemental HTTP cases: 2/2 PASS.
- Regression before production repair: FAIL for the intended reason, HTTP **202 instead of 500**.
- Regression after repair: 1/1 PASS.
- Final affected backend run: **16/16 PASS**, including full research API, supplemental intake, quote and bounded revision owners (142.22 seconds).
- Windows `git diff --check`: PASS. This is read-only, not a Windows project test.

No Windows project tests/typechecks/builds/generators ran. No full repository suite, final release CI, new browser UI walkthrough or real-data semantic acceptance is claimed by A. The browser UI task has not been implemented by A.

## Tested source identity and delta

Pre-edit selected files were checked against `checkpoint-files.json`. A's pre-edit archive is outside Git at `C:/Users/Admin/Documents/Codex/2026-08-27/cou/artifacts/manual-A-20261004/a-before-and-sync.tar`, SHA-256 `7ef7faf8b2013204b0f5bcb05956a536aa4cf304eff9630ed700cfe669df886c`. This is a selected-file checkpoint, not a release snapshot.

Changed files, before -> final SHA-256:

| File | Before | Final |
| --- | --- | --- |
| supplemental-source-inventory.ts | b1f374388080e3925664e953a4804c37933683271ec18795226e0845471d0bc4 | d61787c10c22f3b2e1ebadcbfc48be51d7eddd3e4672e4416c0d1322af70c6f7 |
| service.ts | 9b7b827381a158a076e77206646566c4308404e4e1e4e0f4cdbeccfba16c9475 | 9a55af6531bf31a0fe65fc6bf0315c27e41e533d7fba94b817752d2024e3745f |
| research-automation-api.test.ts | 2ddb9f72c54b21f38368baa6c5f36643b5a08cf3b469b496ef2f42352b860e94 | 73f0a96f0beb6bcf2873c1ca9ceae00bd3b0762893ac25f8d83db5172ae4e103 |
| supplemental intake generated TS | f4faf9d3ed035e45b0634d1dd6b15bdcdbed2da01a87ae71b834631cc42dc67c | 47cd7c9a4e2d8c98472e64a2e4191f93b093b9196ff0a8e16112667fc1ecf141 |

Unchanged final contract/client dependencies:

- `contracts/api/research-automation-supplemental-intake-api.schema.json`: `f80534b32793be014225ac2b0f851139ad88b3ac506479922c78745be1acdc4b`.
- `frontend/src/research-automation/api.ts`: `f66f810ae87251e73c1cb5f2f677d7867f3d01575730be43d33ddbc999ca9d6b`.
- `frontend/src/research-automation/report-revisions-api.ts`: `b5e5b8e4e9d62a6a061bc480ea2fb34c7bec148724f2976f80f896443abfff87`.
- `frontend/src/generated/report-validators.generated.d.ts`: `16a839782049134588e58b089a869179279e597a49643c892a655e5d74ea9da0`.

The final changed backend, canonical supplemental schema/generated TypeScript, client and validator declaration hashes were compared with Linux checked bytes and matched. Intake, API route wiring, generators and existing client tests are inherited code, not new A edits.

## Unresolved and next action

B may now implement its owned supplemental upload/list/explicit revision UI. A releases the disposable scratch to B; no A test or scratch process remains running. Do not overwrite it with Git HEAD, which lacks essential uncommitted code. Synchronize only B's owned changes and preserve the tested A bytes.

No new business decision is required for this narrow B integration. Suitable real quote/bounded inputs, semantic quality and final three-case web/PDF acceptance remain unproven. This work does not provide arbitrary PDF/XLSX normalization or automatically collect missing evidence.

No live database, runtime, provider/model, migration, dependency or credential action occurred. No commit, merge or deployment.
