# Research A38/A39: integrated prepared report delivery

Owner-approved acceleration revision, 2026-09-30. This supersedes the earlier
JSON-only A38 slice and its requirement for an existing A10 report. The business
framework owner confirmed the bounded seven-section scope and first-version
creation without a predecessor. This is one usable delivery batch.

## Outcome

Exact retained preparation and source selection, pinned catalog/readiness and
retained M03 -> reusable bounded section outputs -> readable HTML -> immutable
A10 report version -> verified reopening. First creation uses version 1 and no
predecessor; append uses the exact existing semantic predecessor. Never infer
latest. Preserve the existing A10 series as the sole report version authority.

The seven reusable tracks are M02, M03, M04, M08/P4, M13, I03 and I17. Reuse
existing calculators, methods and presentation rather than rebuilding them.
M08/P4 materializes only when exact supplemental quote inputs exist. All 30
catalog sections remain visible, in order. Catalog fallback, readiness,
delivered output and human approval are separate facts. Missing-data statuses
are not completed sections. The report remains DRAFT_PARTIAL, interpretation
NONE and review UNREVIEWED; no final/publication/commercial-ready claim.

## Required boundaries

- Replay A30 preparation, recompute exact A31 readiness, and read exact A37 M03.
  Reject workspace, package, selection, normalized input, catalog, readiness or
  M03 identity drift before creating a report version.
- Reuse source-backed report methods and verify their normalized input/result
  against pinned preparation/M03. Never switch to a different workbook,
  taxonomy, period or UNKNOWN policy.
- A38 snapshot binds all 30 sections and actual artifact digests. It has no
  report counter/history. A10 retains the snapshot and exact dependencies.
- Version the new request/render/replay profile. Historical A10 v1 requests,
  bytes, readers, interpretation/review bindings and A37 replay must remain
  unchanged. Do not edit applied migrations. Add a migration only if required
  by a real persistence constraint; do not create a second version ledger.
- Snapshot inputs are verified preparation, readiness, source-backed bundle and
  retained M03. No prior report is an assembly prerequisite. No final report
  semantic ID appears inside its own evidence trace or assembly identity.
- Preserve first-storage artifact metadata, exact retries with zero mutations,
  changed-content conflicts and bounded filesystem cleanup.

## Business limits

M03/M04 describe the observed panel and explicit denominator only, not market
size/share, representativeness, demand, growth, causality or forecast. ALL,
WIDE and CORE overlap; UNKNOWN is visible in ALL and excluded from WIDE, never
silently OUTSIDE. Missing is not zero. M02/I03 describe methods, M13/I17 trace
sources; none proves source truth or a consumer finding. M08/P4 is exact quote,
currency, date and explicit pack-count normalization only, not margins, dosage,
affordability, ranking or recommendation.

## Parallel ownership and interfaces

Takeover update: after both Claude lanes reached quota, the owner authorized
GPT to finish their production scope. GPT backend and integration-test lanes
have disjoint ownership; Codex coordinates the HTML, CLI, CI and independent
review. The original interface and business scope below remain unchanged.

- Claude integration lane owns A10 new profile, prepared-report orchestration,
  CLI, shared generator/exports/package registration and any necessary additive
  persistence change. It does not edit the assembly lane's files.
- Claude assembly lane owns `report-assembly-snapshot.ts`,
  `report-assembly-html.ts` and `report-assembly-snapshot.schema.json` plus its
  generated type. It reuses existing section outputs; no legacy renderer edits.
- Codex owns tests, CI, this brief, INTENT and consolidated status/handoff.
  Shared files have one writer. No worker commits/pushes while others edit;
  the coordinator checkpoints the combined diff.

Assembly interface: `buildReportAssemblySnapshot({ bundle, preparation,
readiness, retainedM03 }) -> { snapshot, bytes }`; all argument types are the
existing verified bundle/preparation/readiness/retention types. New output is
defined by its canonical JSON Schema. `renderReportAssemblyHtml({ bundle,
snapshot, retainedM03, semanticVersionId? }) -> string` reuses the approved
report design and provides readable section readiness/evidence navigation.
Version/report IDs and timestamps do not enter assembly content identity.

## Verification and exclusions

Operator entry point (run on Linux against an explicitly selected private
database and artifact root):

```sh
npm run research:report:assemble -- <database> <artifact-root> <request.json> <section-catalog.json>
```

The closed `prepared-report-v1` request pins `reportKey`, sequential `version`,
`previousSemanticVersionId` (null for the first version), the existing
`sourceRequest`, `preparationSha256`, `readinessSha256` and
`sectionArtifactSha256`. The command retains the report and binds its normalized
dataset through the existing store. It prints the exact version receipt, not
report bodies. Existing exact-version report readers/downloads reopen
`report.html` and its evidence members. Creating this profile through a new web
form or generating AI interpretation from it is outside this batch.

Codex applies test-audit: one assembly behavior owner, one A10 integration owner
for the new profile and legacy compatibility, and one CLI/filesystem boundary
where needed. Existing arithmetic tests remain the arithmetic owner. Linux-only
targeted checks during iteration, full check on the combined delivery head,
preview of the actual new report. No Windows tests, build or typecheck.

No new provider collection, runtime AI calls, human approval, deployment,
production data mutation, framework change, broad M08, new workflow engine or
automatic merge. Blocked sections remain explicit. PDF production is deferred;
print inspection may use the existing synthetic Linux preview tooling.
