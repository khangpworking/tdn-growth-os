# Handoff — shared Analysis-owned synthesis execution kernel (plan v2.4)

Updated: 2026-10-04

## GPT integration checkpoint, after Claude handoff

Claude job `task-muta56w1-oi36la` finished and was retrieved. GPT audited the
kernel and added the decision adapter, its section-specific closed configuration,
migration 0046 and boundary tests. The original Claude-owned scope below is a
historical handoff; statements that migration/adapters were not written apply
only to that handoff.

Current additional paths:
- `src/modules/analysis/research-automation/decision-synthesis-execution.ts`
- `contracts/analysis/automation-decision-synthesis-configuration.schema.json`
- Its Linux-generated TypeScript and root generator registration.
- `migrations/0046_analysis_section_synthesis_executions.sql`
- `tests/integration/research-automation-decision-synthesis-execution.test.ts`
- `tests/integration/research-automation-synthesis-migration.test.ts`
- Optional migration/report-kind inputs on the existing synthetic parent helper.
- Current-schema assertions in migration-affected suites; historical v45 test
  is explicitly pinned to v45 rather than accidentally opening the latest schema.

Linux scratch evidence (Node 24.15.0, synthetic data, no real transport):
- Contract generation and root typecheck PASS.
- Shared/decision/I14 execution, transport and migration group: 29/29 PASS.
- Native source and I14/decision method group: 31/31 PASS.
- Migration-affected Content/Shopee/source-package suites: 76/76 PASS.
- A first upgrade-test attempt failed because it called the migration internals
  on a safe-integer application handle. The test now uses the real `openDatabase`
  startup boundary. No production migration guard was weakened.

Upgrade proof includes PREPARED and COMPLETED I14 records created under schema
45, all business rows/manifests and artifact bytes preserved at 46, foreign-key
integrity, idempotent rerun, and query-only terminal retry with no additional
transport call. Decision proof covers all three sections, wrong-section config,
retained INVALID responses, corruption rejection and cross-section live-dispatch
recovery refusal. No model-quality or business acceptance is claimed.

The ZCode narrow SQL audit returned `failed`; its output was not an approval.
No retry or replacement model was launched. GPT's code audit and Linux proof
remain the evidence for this checkpoint.

**Next required step:** connect the three adapters to report execution and exact
historical replay, present retained drafts with source links, and test the real
service caller. No new general engine is needed. The operator must opt in to
decision synthesis separately; an I14 setting must not enable three extra calls.
Until that step lands, M11/M12/I15 still display their packets, not generated
drafts. No provider activation, live database migration, commit or deployment
occurred. This checkpoint does not increase completed-section counts.

## Original Claude-owned extraction handoff

Worktree/branch: `research-automation-v1`, `fix/research-real-world-audit`, uncommitted on `0116091`.
Completed: The I14 persistence/dispatch lifecycle is now one section-parameterized
kernel. `AutomationI14SynthesisExecutions` is a thin wrapper over that kernel plus an
explicit I14 adapter. The kernel is ready for M11/M12/I15 adapters, but no decision
adapter is wired. Service, transport, contracts, migrations and tests are unchanged.
Changed paths:
- `src/modules/analysis/research-automation/synthesis-execution.ts` (new kernel)
- `src/modules/analysis/research-automation/i14-synthesis-execution.ts` (wrapper + `I14_ADAPTER`; file is untracked, so there is no git baseline to diff against)
- `docs/handoffs/research-shared-synthesis-execution.md` (this file)
Evidence (commands, results, relevant revision): **None run.** No tests, typecheck,
build or contract generation were run on Windows, as instructed. Existing I14 tests
were read but not executed. Linux checks are owned by GPT.
Unresolved: see "Assumptions" and "Not done" below.
Next action: GPT audits, writes boundary regressions, adds migration 0046 and runs
Linux checks. Then the decision adapters (M11/M12/I15) are added in the service owner's
slice.
Business decisions pending: none.

## Exported API — `synthesis-execution.ts`

Types and constants:

- `AutomationSynthesisSectionId = 'I14' | 'I15' | 'M11' | 'M12'`
- `AutomationSynthesisReportKind = 'INSIGHT' | 'MARKET'`
- `AUTOMATION_SYNTHESIS_REPORT_KIND`: I14/I15 → `INSIGHT`, M11/M12 → `MARKET`
- `AutomationSynthesisExecutionParent`: the same shape as the former I14 parent.
- `AutomationSynthesisIdentity { runId, workspaceId, scopeSha256 }`
- `AutomationSynthesisDispatchConfiguration { timeoutMs, maxResponseBytes }`: the minimum every section configuration must carry.
- `AutomationSynthesisTextRequest<Configuration>` and `AutomationSynthesisTextPort<Configuration>`
- `AutomationSynthesisExecutionRequest<Source, Configuration> { parent, source, ai, signal? }`
- `AutomationSynthesisResponseCode = 'RESPONSE_NOT_TEXT' | 'RESPONSE_TOO_LARGE' | 'RESPONSE_NOT_JSON'`
- `AutomationSynthesisUnknownCode = 'INTERRUPTED_AFTER_CLAIM' | 'TRANSPORT_OUTCOME_AMBIGUOUS' | 'RESPONSE_NOT_RETAINED'`
- `AutomationSynthesisRetainedCandidates<Candidates>`
- `AutomationSynthesisExecutionOutcome<Candidates, Code>`: `NOT_DISPATCHED | PREPARED | VALID | INVALID | DISPATCH_UNKNOWN`
- `AutomationSynthesisExecutionView<Candidates, Code>`: the outcome union plus `ABSENT | DISPATCHING`.
- `AutomationSynthesisActivity`: states, outcomes and billing, with the same shape as the I14 activity.
- `AutomationSynthesisExecutionErrorCode`: the former I14 error codes minus `SYNTHESIS_INPUT_TOO_LARGE`, plus `PARENT_REPORTS_EXCLUDE_MARKET`.

Error classes:

- `AutomationSynthesisExecutionError(code)`: a default error for adapters that have no historical error class.
- `AutomationSynthesisExecutionIntegrityError extends ResearchAutomationIntegrityError`

Adapter types:

- `AutomationSynthesisArtifactCodec<T> { maxBytes, validate: (v) => v is T }`
- `AutomationSynthesisAdapterTypes { source, admission, input, prompt, configuration, candidates, validationCode }`
- `AutomationSynthesisBuild<T> { admission, admissionBytes, inputBytes: Buffer | null }`: `inputBytes` is `null` when the section is not dispatchable.
- `AutomationSynthesisRetainedArtifacts<T>`: the admission, input, prompt and configuration, each as both value and bytes.
- `AutomationSynthesisResponseVerdict<T>`: `VALID { candidates }` or `INVALID { code }`.
- `AutomationSynthesisAdapter<T>` members:
  - Data:
    - `sectionId`
    - codecs `admission`, `input`, `prompt`, `configuration`
    - `candidatesMaxBytes`
    - `validationCodes`, the closed set
    - `promptBytes`, used only for a new preparation and never on replay
  - Errors:
    - `executionError(code)`
    - `integrityError()`
  - Build and identity:
    - `build(source)`
    - `identity(admission)`
    - `atRetainedVersion(source, admission)`: rebuilds the source at the saved admission version, so historical replay never uses current prompts or versions.
  - Retained checks:
    - `bindsRetained(retained, expected & { admissionSha256 })`: returns a boolean. The kernel treats a throw as integrity.
    - `systemText(prompt)`
  - Response handling:
    - `classifyResponse(parsed, source)`: returns INVALID only with a declared closed code; anything else must throw.
    - `replayCandidates(stored, source, retained)`: returning undefined or throwing means integrity.

Kernel class:

- `AutomationSynthesisExecutionKernel<T>`
  - `new ({ db, artifactStore, now, uuid?, adapter })`: throws `TypeError('SYNTHESIS_SECTION_UNSUPPORTED')` for an unknown section.
  - `execute(request)`
  - `read(parent, source)`: query-only.
  - `recoverInterruptedDispatches(): number`
  - `readActivity(workspaceId, runId)`: counts rows of this adapter's section only.

There is one kernel instance per section adapter. It is the only code that writes to
`analysis_research_automation_ai_executions`. Every row query selects the exact
`(parent run/attempt, section_id)`.

## Exported API — `i14-synthesis-execution.ts` (unchanged surface)

Every previous export is kept with the same name and shape:

- `MAX_I14_SYNTHESIS_INPUT_BYTES`
- `AutomationI14SynthesisConfiguration` (re-export)
- `AutomationI14ExecutionParent`: now an alias of the kernel parent.
- `AutomationI14TextRequest` and `AutomationI14TextPort`
- `AutomationI14ExecutionRequest`: still `admission`. The wrapper maps it to the kernel's `source`.
- `AutomationI14ValidationCode`
- `AutomationI14UnknownCode`: an alias.
- `AutomationI14RetainedCandidates`
- `AutomationI14ExecutionOutcome` and `AutomationI14ExecutionView`
- `AutomationI14ExecutionErrorCode` and `AutomationI14ExecutionError`
- `AutomationI14ExecutionIntegrityError`: same message; it now extends the kernel integrity error.
- `AutomationI14SynthesisExecutions`: same constructor and the methods `execute`, `read`, `recoverInterruptedDispatches`, `readActivity → { i14 } | undefined`.

The I14 behavior below is ported verbatim, not redesigned:

- Prompt, input and candidate bytes.
- Error mapping. The kernel's `PARENT_REPORTS_EXCLUDE_MARKET` is unreachable for I14 and maps to integrity.
- Validation codes.
- The `admissionVersion` replay.
- Empty and disabled behavior.
- At most one dispatch.
- Query-only read.
- Terminal retry.
- Artifact manifest checks.
- Cancellation and timeout handling. The timeout reason becomes `${sectionId}_DISPATCH_TIMEOUT`, which is `I14_DISPATCH_TIMEOUT` for I14 as before.
- Recovery.

## Recovery: centralized, guarded across sections

`recoverInterruptedDispatches` is **centralized**. A single unscoped update turns every
`DISPATCHING` row, whatever its section, into `DISPATCH_UNKNOWN/INTERRUPTED_AFTER_CLAIM`.

**Safety with shared DBs.** A module-level registry of in-flight executions is keyed by
`path.resolve(db.name)`, the same key that `withDatabaseMutationMutex` uses, and is
shared by every adapter.

- An execution is registered inside the claim mutex, right after the claim
  transaction, and unregistered in `finally`.
- Recovery from any wrapper throws `ACTIVE_DISPATCH_IN_PROCESS` (through that adapter's
  error class) if any section has an in-flight dispatch on that DB.
- So a wrapper can never silently recover another adapter's live dispatch. It fails
  loudly instead.

**Why section-scoped recovery was rejected.** Under the one-writer-per-DB rule, a
`DISPATCHING` row with no in-process registration is interrupted by definition, whatever
its section. Scoping recovery by section would leave rows stranded unless every
adapter's wrapper were called at startup.

The existing service call (inside the `recoverOnStart` transaction) therefore already
covers decision rows once 0046 admits them. A second call from another wrapper is
harmless and returns 0. No new locks or services were added.

## Guidance for M11/M12/I15 adapters

**Instances and prompts.** Use one adapter and one kernel instance per section, with
`promptBytes = automationDecisionSynthesisPrompt(sectionId).bytes`.

**Source and admission.**
- `source` is `AutomationDecisionPacketInput`.
- `admission` is the packet artifact, so `admission_sha256` is the packet digest.
- `atRetainedVersion` returns `{ ...source, evidence: { ...source.evidence, admissionVersion: packet.useContextAdmission.methodVersion } }`.

**Build.** Use `prepareAutomationDecisionSynthesis`. `inputBytes` is `null` when the
section is not dispatchable.

**Configuration.** Each section needs its own configuration codec. An I14 setting must
not authorize decision dispatch.

**Classifying responses.**
- Call `buildAutomationDecisionPacket(source)` first, outside the try block.
  `validateAutomationDecisionCandidateResponse` rebuilds the packet internally, so a
  packet-build failure must not be classified as INVALID.
- Map only `AutomationDecisionPacketValidationError`. Never map
  `AutomationI14ValidationError`, because the two share some code names.
- Map these closed response codes (from `validateAutomationDecisionCandidateResponse`):
  - `CANDIDATE_RESPONSE_FIELDS_INVALID`
  - `CANDIDATE_TYPE_SECTION_MISMATCH`
  - `INVALID_DECISION_CANDIDATES`: thrown as `INVALID_DECISION_CANDIDATES:<ajv text>`, so map it by prefix to the bare code.
  - `CANDIDATES_WITHOUT_ADMITTED_USE_CONTEXT`
  - `UNKNOWN_CLAIM_REFERENCE`
  - `CITED_CLAIM_NOT_ADMITTED`
  - `CLAIM_CITED_AS_SUPPORT_AND_COUNTEREVIDENCE`
  - `COUNTEREVIDENCE_RELATION_UNBOUND`
  - `COUNTEREVIDENCE_RELATION_DUPLICATE`
  - `COUNTEREVIDENCE_TARGET_NOT_IN_CANDIDATE`
  - `COUNTEREVIDENCE_RELATION_MISSING`
- Rethrow every other code. That includes `DECISION_SECTION_MISMATCH`, the packet-build
  codes and `DECISION_PACKET_*`.

**Replay.** `replayCandidates` uses `verifyAutomationDecisionCandidates` and checks that
the packet digest, run, workspace, scope and section match.

## Migration 0046 requirements (GPT-owned, not written here)

- Allow `section_id IN ('I14','I15','M11','M12')` with the same columns.
- Make the insert trigger check the report kind per section. I14/I15 need reports
  that include INSIGHT; M11/M12 need reports that include MARKET.
- Extend the `validation_code` CHECK with the decision closed codes above. Keep the
  three response codes and the six I14 codes.
- Keep the unique indexes per `(run_id, section_id)` and `(attempt_id, section_id)`.
- Do not edit 0042.

## Assumptions

- **Registry scope.** The in-flight registry covers a single process, and all
  connections to one DB file resolve to the same `db.name` path. This matches the
  existing mutex assumption.
- **Pure adapters.** Adapter functions do no DB, store, clock or provider access.
  `atRetainedVersion` and `systemText` must not throw.
- **New settled-replay check.** On settled replay the kernel now checks the stored
  `validation_code` and `unknown_code` against the closed sets and raises integrity on a
  mismatch. Migration 0042 CHECKs already make this unreachable for valid I14 rows.
- **Undeclared INVALID codes.** If an adapter returns an INVALID code it did not
  declare, the kernel treats it as integrity. After a dispatch, that settles as
  `DISPATCH_UNKNOWN/RESPONSE_NOT_RETAINED`, never INVALID.
- **I14 cannot report integrity as INVALID.** I14's `classifyResponse` maps only
  `AutomationI14ValidationError` closed codes. The same deterministic build has already
  succeeded earlier in the call, so a build failure cannot surface there.

## Not done

- **Activity contract.** The `ResearchAutomationAiActivity` contract still exposes only
  `i14`. Decision activity needs a contract and transport change, which was out of scope.
- **Decision adapters.** No decision adapter was written and no service wiring was done.
