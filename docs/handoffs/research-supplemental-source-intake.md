# Handoff — Run-bound supplemental source intake and reload inventory (M08 quote, M10/I11/I12/I16 bounded)

Updated: 2026-10-04
Worktree/branch: work/research-automation-v1 on `fix/research-real-world-audit` (uncommitted; all other dirty work preserved)
Plan: v2.4 R1. **Source intake only; this is not accepted analysis.**

These slices advance the source path for five sections. They do not complete five analyses, and there is **no section completion count increase**.

## Status

- **Slice 1 (prepare).** The parent integrated the POST/service. Linux generation, typecheck and the persisted intake test passed (parent-reported).
- **Slice 2 (this update).**
  - Adds a server-created context member, so prepared packages can be rediscovered after a browser reload.
  - Adds a verified read-only inventory.
  - Also tightens request binding and input snapshotting.
  - **Nothing in slice 2 has been run.** No tests, typecheck, build or generation was run on Windows, by instruction.

## Completed

### Prepare (`supplemental-source-intake.ts`)

Unchanged from slice 1:

- **Request and storage:** one closed metadata request plus a transport byte `Map`, stored through `SourcePackageService.intakeAutomationAttachment` inside `RequestScopedArtifactStore.withOwnership`.
- **Binding:** the origin binding is `sha256(canonicalJson({runId, start, scope}))`.
- **Publication:** only the verified committed members are published, one exact digest at a time.
- **Package key:** `automation-supplemental:<runId>-<quote|bounded>-<requestKey>`, version 1.

New in slice 2:

- **Server context member.**
  - The server writes `automation-supplemental/context.json` into the same Foundation package. It is canonical JSON, closed by `$defs/sourceContext`.
  - Its contents are `contractVersion`, a fixed `declaration`, `workspaceId`, `runId`, `runBindingSha256` and the normalized `request`. The normalized request has `requestKey`, `family`, `sourceLabel`, `acquiredAt`, `descriptorPath`, and files sorted by path.
  - Its metadata: role `derived`, `non_independent`, `operator_supplied_unverified` (the declarations it records are the operator's), and its own fixed `provenanceBasis`.
- **Reserved path.** Every uploaded path under `automation-supplemental/` is rejected with `RESERVED_PATH`, before any write.
- **Preflight.**
  - The unchanged quote or bounded owner runs over the exact package about to be stored, including the context.
  - Every *uploaded* file must be consumed by the owner (`UNCONSUMED_FILE`).
  - The context must **not** be consumed as a method source (`CONTEXT_CONSUMED_AS_SOURCE`).
  - Bounded Markdown is still only a digest-pinned authority.
- **Input snapshot.** The request (canonical clone) and every byte buffer (`Buffer.from` copies) are captured synchronously before the first `await`. Changes the caller makes during preflight cannot alter what is checked or stored.
- **Request identity.**
  - File declarations are normalized by path before storage, so reordering equivalent declarations is an exact retry (`exactRetry: true`, zero mutation).
  - Under the same identity, these changes conflict (`SourcePackageRequestConflictError`):
    - descriptor bytes;
    - label;
    - `acquiredAt`;
    - `representationRole`;
    - any context field.
  - Re-pointing `descriptorPath` under the same identity is rejected by preflight, because with every file consumed no other member can form a valid descriptor. In every case nothing is mutated.
- **Receipt.** The receipt shape is **unchanged**. `receipt.files` lists only the uploaded members, never the context. It is built by the same `preparedSupplementalPackage` projection the inventory uses.

### Reload inventory (`supplemental-source-inventory.ts`, new)

`readPreparedSupplementalSources(reader, { runId, start, scope })` uses only public `FoundationSourcePackageReader` interfaces (`AutomationSourcePackageLookup & FinalizedSourcePackageReader & SourceAttachmentOriginReader`), following `metric-source-inventory.ts`. For each package found by `findAutomationAttachmentPackagesByKeyPrefix('automation-supplemental:<runId>-')` it checks:

1. **Identity.** The verified read (`readFinalizedSourcePackage`) must match the lookup entry: ID, manifest digest, key, version 1. Failure: `PACKAGE_IDENTITY_MISMATCH`.
2. **Origin.** The attachment origin binding must equal the binding of this exact run/start/scope, and the origin manifest must match. Failure: `ORIGIN_BINDING_MISMATCH`.
3. **Context presence.** Exactly one JSON context member. Failure: `CONTEXT_MISSING`.
4. **Context form.** Fatal UTF-8 decode, closed AJV schema, byte-identical canonical JSON, and a request that is already normalized (it passes the same declaration rules as preparation). Failure: `CONTEXT_INVALID`.
5. **Context run.** The context's run ID, workspace and run binding must equal the bound run's. Failure: `CONTEXT_RUN_MISMATCH`.
6. **Context request.** The package key must equal the key derived from the context family and request key, and the manifest label and `acquiredAt` must equal the request's. Failure: `CONTEXT_REQUEST_MISMATCH`.
7. **Members.** Both `files` and `manifest.files` must exactly equal the metadata preparation writes for this request, including membership count, evidence family, provenance and role. Digests and sizes come from the verified bytes. Failure: `MEMBER_METADATA_MISMATCH`.

What the inventory returns, and does not do:

- Any failure throws `PreparedSupplementalSourceError(code)` and fails the **whole read** closed. There is no partial list and no guessing.
- On success it returns `ResearchAutomationSupplementalPreparedList`: `{contractVersion: 'automation-supplemental-prepared-list-v1', workspaceId, runId, packages}`. Each `ResearchAutomationSupplementalPreparedPackage` is the receipt without `contractVersion`/`exactRetry`.
- It does not replay methods, authenticate providers, admit anything, scan files, write or delete.
- Every entry stays `PREPARED_NOT_ADMITTED` / `SEMANTIC_REPLAY_REQUIRED_AT_REVISION` whether or not a revision selected it. Nothing implies a report, revision or historical run state.

## Changed paths (owned files only)

- `contracts/api/research-automation-supplemental-intake-api.schema.json`
  - Adds `$defs/path` (documents the reserved directory), `preparedPackage`, `preparedList` and `sourceContext`.
  - The root `oneOf` now also includes `preparedList`.
  - The request and receipt shapes are unchanged.
- `src/modules/analysis/research-automation/supplemental-source-intake.ts`
- `src/modules/analysis/research-automation/supplemental-source-inventory.ts` (new)
- `tests/integration/research-automation-supplemental-intake.test.ts`
- `docs/handoffs/research-supplemental-source-intake.md`

No shared service, API, generator, frontend or API integration test was edited.

## Parent integration

- **Regenerate** `contracts/api/research-automation-supplemental-intake-api.generated.ts` (the generator entry and `ignoreMinAndMaxItems` already exist). New exports:
  - `ResearchAutomationSupplementalPreparedList`
  - `ResearchAutomationSupplementalPreparedPackage`
  - the root union now includes the list.
  - Both modules import these generated types, so typecheck fails until regeneration.
- **GET wiring.**
  - Call `readPreparedSupplementalSources(new FoundationSourcePackageReader(...) /* the existing service reader */, { runId, start, scope })` with the **exact persisted** confirmed `StartSnapshot`/`ScopeSnapshot`, the same objects passed to `prepare`.
  - No scope confirmed means nothing can be listed; return an empty or 409 response as you prefer.
  - Validate the response with `#/$defs/preparedList`.
  - Map `PreparedSupplementalSourceError` to a 500-class integrity failure, not 400: it means a stored package under the run prefix is not server form.
- **Selection.** Revision selection uses `{decision: 'USE_PACKAGE', packageId, manifestArtifactSha256, packageContentSha256, descriptorPath}` copied from an entry. Admission still replays the owner semantically.
- **New exports from `supplemental-source-intake.ts`:**
  - `SupplementalRunBinding`, `SupplementalSourceContext`
  - `SUPPLEMENTAL_CONTEXT_PATH`, `SUPPLEMENTAL_CONTEXT_DECLARATION`, `SUPPLEMENTAL_READ_BUDGET`
  - `supplementalPackageKey`, `supplementalPackageKeyPrefix`, `supplementalRunBindingSha256`
  - `normalizeSupplementalRequest`, `expectedSupplementalMetadata`, `parseSupplementalContext`, `preparedSupplementalPackage`, `byPath`
  - Only the list function and the error class are needed for wiring.
- **New rejection codes (400):**
  - `RESERVED_PATH`
  - `CONTEXT_CONSUMED_AS_SOURCE`
- **Existing data.** No migration. A package prepared by slice 1 would have no context and would fail the inventory closed. These files were never released, so the parent's local Linux databases from slice-1 runs should be discarded rather than adapted.

## Evidence

**Not run** (Windows execution forbidden): tests, typecheck, build, generation.

Intended Linux commands:

```bash
npm run contracts:generate
npm run typecheck
node --import tsx --test tests/integration/research-automation-supplemental-intake.test.ts
```

The single persisted owner test (synthetic data only) now covers:

- **17 rejections before any mutation**, adding `RESERVED_PATH`. An empty inventory is checked before any preparation.
- **Prepare.** For QUOTE and BOUNDED, the caller's buffers are overwritten during preflight and the receipt digests still match the original bytes. The stored package has exactly one extra member, the context, which binds the run, workspace, request key, family and descriptor path. The unchanged owners replay the stored package.
- **Exact retry and conflicts.**
  - An exact retry with reversed file declarations and a reversed map returns an identical receipt with no mutation.
  - Four same-identity conflicts (bytes, label, `acquiredAt`, role) mutate nothing.
  - A re-pointed descriptor is rejected with no mutation.
- **Reload.**
  - A fresh inventory read returns both packages equal to their receipts.
  - A second run's package appears only in that run's list.
- **Tamper (fail-closed).** Packages are forged through `SourcePackageService.intakeAutomationAttachment` under fresh run prefixes.
  - An unchanged forged copy is listed. This is the positive control proving the forger reproduces server form.
  - Then 10 tampered variants each fail with their expected code:
    - context missing;
    - extra context key;
    - non-canonical context bytes;
    - unsorted request files;
    - context run ID of another run;
    - context request key not matching the package key;
    - context label not matching the manifest label;
    - origin bound to another run;
    - a member with altered provenance;
    - an undeclared extra member.
  - The original run's list is unaffected afterwards.

## Unresolved / limits

- **Descriptor path not semantically checked.** The inventory verifies the context is exactly server form and consistent with the package. It does **not** re-run the method owner. A same-binding Foundation writer could therefore record a semantically wrong `descriptorPath` that would only be caught by the mandatory semantic replay at revision admission. Only server code writes `AUTOMATION_ATTACHMENT` origins.
- **Lookup limit.** The Foundation prefix lookup stops at 100 entries and throws above that (`lookupEntries`). The list contract also caps `packages` at 100. No pagination exists.
- **Not built here:**
  - a GET route, service method or UI picker (parent/frontend own these);
  - automatic selection;
  - deletion.
- **Not re-tested here.** Recovery for committed-but-unpublished intake is inherited from Foundation and not tested in this slice.

## Decision still open (from slice 1): BOUNDED Markdown authorities

Bounded packages must carry the two pinned Markdown authorities (`advanced-profile.md` `c4e0f5fb…`, `method-configurations-v1-adoption.md` `5c5d1ea4…`). This slice keeps admitting `text/markdown` only for BOUNDED, and only when the existing owner consumes the file as a digest-pinned authority. Markdown is never parsed as textual evidence.

The alternative is server injection of the authority bytes, which needs a change in the shared `report-method-packets-extension.ts`.

## Restrictions honoured

- No Windows tests, typecheck, build or generation.
- No SSH, provider or model calls, secrets, live or private data, migration, new table, commit, push or deploy.
- Method owners and policy are unchanged. Source bytes are never rewritten.

## Next action

Parent:

1. Regenerate the types.
2. Run the Linux typecheck and test.
3. Wire GET/service to `readPreparedSupplementalSources`.
4. Decide the Markdown-authority question.

Business decisions pending: none from this slice.
