# Handoff — Bounded G source snapshot module

Updated: 2026-10-04
Worktree/branch: work/research-automation-v1 on `fix/research-real-world-audit` (uncommitted; existing dirty work preserved)

Completed:
- Canonical request schema `AutomationBoundedReportRevisionRequest` (`automation-bounded-report-revision-v1`): `requestKey` UUID, `previousPairId` SHA256, `sources.metric`/`sources.nativeReview` both KEEP (reuses `automation-classified-report-revision.schema.json#/$defs/keep`), `boundedMethods` is either `$defs/selection` (`USE_PACKAGE` + `packageId`, `manifestArtifactSha256`, `packageContentSha256`, `descriptorPath`) or `{decision: SKIP}`. All nested objects are closed. `descriptorPath` uses the existing logical relative path pattern.
- Snapshot schema `AutomationBoundedMethodSnapshot` (`automation-bounded-method-snapshot-v1`): closed `binding` (`workspaceId`, `runId`, `startSha256`, `scopeSha256`, `previousPairId`), `selection` → request `$defs/selection`, `descriptorSha256`, `output` → `bounded-analysis-gates.schema.json`.
- `bounded-methods.ts` exports `buildAutomationBoundedMethods(selection, binding, reader)` and `verifyAutomationBoundedMethods(value, binding, selection, reader)`. Parameter types are indexed from the generated `AutomationBoundedMethodSnapshot` type. There is no hand-maintained type.
  - AJV 2020 (strict) registers the gates, classified revision, bounded revision and snapshot schemas. It validates the selection, the binding and the final snapshot.
  - Reads exactly `selection.packageId` with an explicit 32 MiB per-file / 128 MiB total budget. It requires the package ID, manifest artifact SHA256 and content SHA256 (reader and manifest) to match the selection exactly.
  - Calls `buildVerifiedMethodPacketSources` without changing it. That helper enforces the adoption and advanced authority hashes, literal source and pointer replay, and the gate calculation.
  - Requires `decisions === null` and gates to be present. Decision claims are rejected, never admitted.
  - Verification first AJV-checks the stored value, then rebuilds from the same package. It requires the same `descriptorSha256` and full `canonicalJson` equality.
  - Errors are `ReportMethodPacketsExtensionError` codes: `BOUNDED_METHOD_*` or the helper's `METHOD_PACKET_*`. The reader may also throw Foundation errors. The coordinator maps these to safe boundary errors.

Changed paths:
- contracts/analysis/automation-bounded-report-revision.schema.json (new)
- contracts/analysis/automation-bounded-method-snapshot.schema.json (new)
- src/modules/analysis/research-automation/bounded-methods.ts (new)
- docs/handoffs/research-g-source-snapshot.md (new)

Evidence (commands, results, relevant revision):
- Both schemas parse as JSON (node `JSON.parse`).
- An AJV strict compile was not possible on Windows: the worktree has no `node_modules`. No tests, typecheck, build or generation were run, per the task.

Unresolved / limitations:
- Both generated contracts now exist, generated on Linux after registration in `scripts/generate-foundation-contract.mjs`. The existing revision API accepts the closed bounded variant.
- Source-only verification covers literal references and bytes. It does not cover semantic truth, period compatibility between the package and the run scope, or human approval. Gate output keeps the source period, `UNKNOWN`, missing vs observed-zero states and method blockers exactly as `buildBoundedAnalysisGates` produces them. Method policy and calculations are unchanged.
- The binding fields (`startSha256`, `scopeSha256`, `previousPairId`) are carried and compared, but not derived here. The caller must supply the current run values and keep the request and snapshot selection identical.
- Gates are design or eligibility only, as the gates schema enforces (`NOT_EXECUTED`, null estimate, null forecasts). There is no approval, forecast, causal estimate or AI execution.
- The helper caps each parsed file at 8 MiB and allows at most four distinct referenced source files. That is stricter than the read budget.

## GPT integration checkpoint, 2026-10-04

The existing automation revision service now admits the exact source package before
writing the request. Both reports retain the canonical bound snapshot; read-only
historical replay rebuilds the source and compares the complete canonical snapshot.
A normal KEEP revision retains it; an explicit bounded SKIP removes it only from
the new pair. Neither path redispatches a provider or model. Invalid package hashes,
descriptor pointers and decision-bearing packages fail before admission writes.

M10/I11/I12/I16 render the existing gate method output as `EVIDENCE_INVENTORY`,
not completed analysis. Their links open an embedded complete snapshot in M13/I17,
not a nonexistent relative JSON download. The legacy standalone renderer keeps its
existing download link. Period compatibility is not inferred from package identity.

GPT corrected two TypeScript issues in the module: literal contract-version typing
and redundant unknown-value access. Full canonical equality includes descriptor
identity; no separate descriptor-only mismatch diagnostic is promised.

Linux scratch evidence (not the running Fedora operator):

- Contract generation and root typecheck passed.
- Affected service/source/API/renderer group: **23/23 passed**.
- Final owner/renderer/report group: **14 passed, 1 optional Chromium PDF test
  skipped**, zero failures. Groups overlap and must not be summed.
- Persisted lifecycle test covers admission rejection without mutations, exact
  retry, frozen output, KEEP/SKIP, historical query-only replay and corrupt source
  rejection. DOM checks cover the local evidence anchors and escaped full payload.
- Negative control removing source replay failed at the corrupt-source assertion;
  correct code was restored before the final passing check.
- Logs retained outside Git as `tdn-g-source-{affected,negative,final}-20261004.log`.

No full release suite, browser/PDF visual acceptance, source-picker UI, real-data
acceptance, merge or deployment is claimed. The four methods still need appropriate
real inputs; forecast/causal execution and approval are not invented by this path.

Next action: source-native M08 admission and remaining section-family integration,
then shared source selection and three-case acceptance. Do not replace breadth with
another verification-only engine or promote these gates to completed analysis.

Business decisions pending: none.
