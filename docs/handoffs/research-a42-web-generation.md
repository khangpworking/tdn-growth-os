# A42 W2: retained-source web report creation

Status: code and focused synthetic tests written; execution awaits Linux integration.

## Completed

- Added OWNER-gated source inventory and report creation endpoints. Inventory replays source-package ownership readers and parses retained manifest/label JSON only; it does not normalize workbooks, calculate, write, invoke a CLI or call a provider.
- Named choices bind exact package manifest and logical members through a server-derived selection identity. No request accepts filesystem paths, user-entered hashes, invented package IDs or a client-selected catalog.
- Pinned the existing catalog to `926a175fa9104df4cefde799ad601861d94b4e9d4d7fe1dbf7717dc163a8e255`. Only the existing Shopee Sheet1 profile with UNKNOWN excluded from WIDE is offered. The picker explicitly states that workbook mapping and complete label coverage are checked on creation.
- Creation uses existing preparation, readiness, M03 calculation/chart/evidence/narrative/section, retention and A10 services. New reports are version 1 with a null predecessor and `reportKey = web-<requestKey>`. Existing-series version creation is deferred. Requests select the root-integrated `report-kit-v1` presentation.
- Missing optional labels create the existing source-backed partial-report profile and explicitly report that the prepared M03 method did not execute. Missing tablet quote stays a blocker; no quote is guessed. Corrupted evidence fails closed.
- Preparation/section stages publish only after their owning services commit successfully, within request-owned staging. Report history remains in A10. Repeating the same key/evidence returns the same version; changed evidence with the same key conflicts.
- Added the creation form using existing report screen classes, native labeled controls and the existing visual system. It requires explicit source selection, carries the OWNER token only in memory/request headers, disables duplicate submissions and retains the exact request for ambiguous retries. Stale completions cannot call back into another workspace, a changed OWNER session or an unmounted component.

## Owned files

- `contracts/api/research-generation-api.schema.json` (canonical); generated TypeScript produced by root registration.
- `src/modules/analysis/report-generation-service.ts`
- `src/api/research-generation-api.ts`
- `tests/integration/research-generation-api.test.ts`
- `tests/integration/report-generation-service.test.ts`
- `frontend/src/research-generation-client.ts`
- `frontend/src/ResearchReportCreatePanel.tsx`
- `frontend/tests/research-report-create.test.ts`

## Integration requirements

`openResearchGenerationApi(configuration: OwnerHttpConfiguration)` returns `{ handler, close }`. Root owns routing and resource closure. The API loads the pinned catalog relative to `src/api`; the existing runtime runs source through tsx. A separately relocated build must include the same resource.

- `GET /owner-api/research-generation/inputs?workspaceId=<existing UUID>` requires OWNER authorization and exact allowed Host/Origin. Returns `ResearchGenerationInputs`.
- `POST /owner-api/research-generation/reports` accepts exactly `{ contractVersion: '1.0.0', workspaceId, selectionId, requestKey }`, bounded at 4 KiB. `requestKey` is a lowercase UUID v4 generated once for the operation. Returns `ResearchGenerationReceipt`, HTTP 201 on creation and 200 for exact retry.
- Root added verified package metadata enumeration in the foundation owner, canonical contract registration and legacy A10 missing-publication recovery. Those shared edits are separate from this lane.
- Root must register `researchGenerationInputs` and `researchGenerationReceipt` in the existing precompiled browser validators and declarations. Runtime AJV compilation is intentionally absent from the browser.
- Render `ResearchReportCreatePanel` with `{ workspaceId, ownerToken, writesAvailable, onCreated }`, preferably keyed by workspace ID and only in real mode. On an active completion, reload report history and select the exact returned report ID/version. Do not infer the latest version.
- The HTTP module opens an existing SQLite file and asserts required tables; it performs no migration/startup provider action. Root owns deployment/runtime activation.

## Test ownership and checks

The HTTP test owns transport admission and one real source-alias-to-new-preparation/M03/A10 journey, including restart and exact retry. A source alias deliberately creates a fresh preparation so the fixture's existing retained section cannot supply the result being asserted. Existing tests retain ownership of arithmetic, chart rendering and A10 publication recovery.

Service tests protect adapter-only admission and lifecycle risks: optional-label profile selection, committed preparation recovery after interrupted publication, and preventing a corrupt source from becoming an empty/successful report. They use real services and synthetic bytes; the failure store overrides the existing production publication boundary, with no test-only production export.

Mounted UI tests protect explicit selection, duplicate-submit suppression, stable ambiguous retries, OWNER gating and stale response handling. Their response fixtures model only HTTP responses; they do not claim persistence proof.

Run on Linux:

```sh
npm run contracts:generate
npm run frontend:validators
node --import tsx --test tests/integration/research-generation-api.test.ts tests/integration/report-generation-service.test.ts
node --import tsx --test frontend/tests/research-report-create.test.ts
```

Also run the root's shared typecheck, integration and release gates. Perform the retained-report browser journey at desktop/mobile, including keyboard selection, pending/error/retry, exact report opening and evidence download.

Actual checks here: static production/test inspection, `git diff --check` passed, Impeccable static detector returned `[]` for the new UI/client. No Windows test, typecheck, build or browser execution ran. No commit, push, provider call, real data access, migration or activation occurred in this lane.

## Limits and remaining evidence

- The initial inventory is bounded to 100 packages and 500 source choices, with per-package byte limits. Root was notified to enforce the package bound before replay within its owning enumeration method.
- Incomplete or incompatible source profiles are not silently adapted. This batch offers retained Metric source combinations only; it does not add upload.
- Request recovery state stays in the mounted form. A full page reload clears the form's pending request; the retained result remains discoverable through A10 history. Cross-page durable browser recovery is not implemented.
- This is a partial deterministic report, with no AI interpretation or human approval. Thirty recipe specifications do not imply thirty executed methods.
- UI inherits the existing navy/blue report controls, spacing and responsive classes so the creation action remains part of the current report workflow. No new palette, fonts, imagery or design-system changes were introduced. Visual acceptance remains unverified until the Linux browser pass.
