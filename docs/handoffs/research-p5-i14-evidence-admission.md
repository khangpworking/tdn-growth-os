# Handoff — P5 I14 evidence admission and candidate validator (pure boundary)

Updated: 2026-10-03
Worktree/branch: `work/research-automation-v1`, `fix/research-real-world-audit` (HEAD `0116091`, dirty tree preserved; nothing committed)

Completed:
- New contract `automation-i14-evidence-admission` 1.0.0 with a pure builder and replay verifier: `buildAutomationI14EvidenceAdmission` and `verifyAutomationI14EvidenceAdmission`.
- New closed contract `automation-i14-candidates` 1.0.0 with a pure response validator, `validateAutomationI14CandidateResponse`. There is no provider call, attempt ledger, storage or model selection.
- Identity checks reuse M01's checks and codes: run/scope, run, workspace, `scopeSha256 = sha256(canonicalJson(scope))`, and the replayed `claimsSha256`. Upstream claims are fully revalidated with `validateAutomationSourceClaims`.
- The frozen located/native `output` is replayed with `verifyLocatedInsightMethods` before any row is read. A forged body under an unchanged `methodOutputId` therefore fails.
- Each I02/I04 claim is bound to its exact frozen row:
  - method id, version and `methodOutputId` equal the output's (`LOCATED_METHOD_BINDING_MISMATCH`);
  - `outputPointer` is `/input/<i02|i04>/<n>` for the claim's own section and is in that section's accepted `annotationPointers` (`LOCATED_OUTPUT_POINTER_NOT_ADMITTED`);
  - the row's record locator, `recordLocator`, source sha256, source `logicalPath` and attribution all match (`LOCATED_SOURCE_RECORD_MISMATCH`);
  - the claim's span set exactly equals the row's spans, and its declaration attribution and provenance equal the row's (`LOCATED_ROW_BINDING_MISMATCH`). Located claims without an output fail with `LOCATED_METHOD_OUTPUT_REQUIRED`.
- Admission rule `I02_SOURCE_STATED_SITUATION_TASK_OR_SETTING_WITHOUT_QUALIFIERS_V1` reads only the adopted structured I02 field states. It does not interpret keywords, span text, product names or I04 events. Each claim is either an anchor or `unassigned` with one reason:
  - Any `CONFLICTING` field among the five → `CONTEXT_FIELD_CONFLICTING`.
  - No `SOURCE_STATED` situation, task or setting (role or time alone) → `NO_SOURCE_STATED_USE_CONTEXT_FIELD`.
  - Non-empty qualifiers → `CONTEXT_QUALIFIER_SEMANTICS_NOT_ENCODED`.
  - Otherwise the claim is an anchor.
  - Every I04 claim → `I04_BEHAVIOR_ALONE_IS_NOT_USE_CONTEXT`.
  - M05 → `NOT_A_LOCATED_DECLARATION`.
  - No anchors → `status=INSUFFICIENT_EVIDENCE`, `insufficientEvidence=NO_ADMISSIBLE_SOURCE_STATED_USE_CONTEXT`.
- Each anchor carries:
  - claimId, the full method, and the source package/logicalPath/sha256/locator/recordLocator/attribution;
  - every `SOURCE_STATED` field (role and time included) with its exact span;
  - the row's counterevidence spans (empty means none encoded);
  - the claim's declaration.

  Upstream order is kept; it is not a rank.
- Candidate validator behaviour:
  - The admission is rebuilt from the same inputs; a passed admission is never trusted.
  - The response must be exactly `{ aiCandidates }` (`CANDIDATE_RESPONSE_FIELDS_INVALID`).
  - The envelope (`INVALID_I14_CANDIDATES:<ajv errors>`) has:
    - `ownerQuestion` UNSET;
    - `ownerDirections` schema-limited to `[]`;
    - `admission.admissionSha256 = sha256(exact admission bytes)`;
    - `validation={structural:SCHEMA_AND_REFERENCES_PASSED, semantic:NOT_VERIFIED_HUMAN_REVIEW_REQUIRED}`;
    - fixed limitations.
  - Each candidate is closed (D12 names) with these fields and no others:
    - `candidateType` HYPOTHESIS|OPPORTUNITY_DIRECTION, `candidateStatus` HUMAN_REVIEW_REQUIRED, `layer` 3;
    - `text`, `conciseEvidenceLinkedRationale`;
    - `citedClaimRefs` (supporting, 1..20) and `counterevidenceRefs` (0..20; empty = not supplied);
    - `assumptions` 1..10, `unknowns` 0..10, `evidenceGaps` 0..10, `limitations` 1..10.

    Score, rank, preference and reasoning fields are therefore rejected.
  - All AI text rejects any Unicode number character.
  - Reference checks:
    - candidates when the admission is insufficient → `CANDIDATES_WITHOUT_ADMITTED_USE_CONTEXT`;
    - cited refs must be anchors (`CITED_CLAIM_NOT_ADMITTED`);
    - counterevidence refs must be I02/I04 claims of this admission (`COUNTEREVIDENCE_CLAIM_NOT_ELIGIBLE`);
    - no ref may be both (`CLAIM_CITED_AS_SUPPORT_AND_COUNTEREVIDENCE`).

Changed paths (all new):
- `contracts/analysis/automation-i14-evidence-admission.schema.json`
- `contracts/analysis/automation-i14-evidence-admission.generated.ts` (root replaced the initial handwritten placeholder through actual Linux generation)
- `contracts/analysis/automation-i14-candidates.schema.json`
- `contracts/analysis/automation-i14-candidates.generated.ts` (root replaced the initial handwritten placeholder through actual Linux generation)
- `src/modules/analysis/research-automation/i14-evidence-admission.ts`
- `tests/unit/research-automation-i14-evidence-admission.test.ts`
- `docs/handoffs/research-p5-i14-evidence-admission.md`

Evidence (commands, results, relevant revision):
- No test, typecheck, build or generator was run on Windows.
- Five synthetic tests were authored against `buildLocatedInsightMethods` with the shared `tests/helpers/located-insight-fixture.ts` and sealed literal claims:
  - exact anchor admission;
  - bare action plus role/time insufficiency;
  - run/scope/claims/output/pointer/locator/span identity rejection, forged-output replay and admission replay;
  - preservation of cited and counterevidence refs and owner separation;
  - schema and reference rejection.
- Root Linux steps:
  1. In `scripts/generate-foundation-contract.mjs`, register `['analysis', 'automation-i14-evidence-admission'],` and `['analysis', 'automation-i14-candidates'],`. Also add both names to the existing `ignoreMinAndMaxItems` list; without that, the small bounds (`maxItems` ≤ 20) generate tuple unions.
  2. Run `npm run contracts:generate`, then `git diff contracts/analysis/automation-i14-*.generated.ts`.
  3. Run `node --import tsx --test tests/unit/research-automation-i14-evidence-admission.test.ts`.
  4. Run `node scripts/typecheck.mjs`.

Root integration checkpoint:
- The INSIGHT owner now builds admission from the same full frozen located v2/native output that produced the owned source claims. It stores a separate content-addressed artifact and closed `automation-i14-admission-reference-v1` digest/size reference.
- Its manifest registers in the same transaction as the requested report outputs. Renderer-authored inline admission or references are stripped; MARKET cannot acquire an I14 reference.
- Read replay first verifies the owning snapshots and reconstructs claims, then rebuilds admission and compares exact bytes/size through the verified artifact reader. Fallback views reconstruct the full method package; no current coding, model, provider or clock is needed. Historical reports without the additive reference retain their prior read path.
- Linux generation/typecheck and I14/three-case invocation passed9/9; the affected automation/native/exact invocation passed41/41. These overlap and are not release validation. The pinned three-case fixtures contain bare actions only and correctly yield insufficient I14 evidence; they were not rewritten into richer contexts to manufacture success.
- A negative control skipped only I14 read replay and failed at the missing-dependency assertion. Root restored the canonical service immediately. After adding exact KEEP-reference assertions, final Linux typecheck and I14/three-case/native/exact passed35/35. Luna independently reviewed exact binding, storage/replay, renderer stripping and KEEP/fallback and found no integration blocker. This is not release approval. No full release check or live operation occurred.

Unresolved:
- Package identity is not cross-checked against the snapshot: the frozen output carries none. The owning service must pass the output of the exact snapshot that produced the claims. Binding is by `methodOutputId`, pointer, record and spans.
- Qualified I02 rows are never admitted. The located contract does not encode which field a negation or condition applies to, so admitting "only if X" contexts needs a field-scoped qualifier or adjudicated codebook change.
- I04 is not linked to I02 by record. A same-record action plus context is not combined.
- Owner question (`I01`/brief) and owner direction labels are not wired; they stay `UNSET`/`[]`.
- No `candidateId`, attempt metadata, human disposition or retention is implemented (out of scope; see D12).
- The number check rejects number characters only. Spelled-out quantities and comparative or prevalence wording ("most", "many") are not detected, so a human must review them.
- `HUMAN_REVIEWED` rows never reach I14, because source-claims admits `DECLARED` provenance only.
- `NOT_A_LOCATED_DECLARATION` (M05) and `CONTEXT_FIELD_CONFLICTING` have no dedicated test.

Next action: finish independent integration review, then retain AI execution inputs/dispatch/response before any model activation. Visible rendering and actual three-case content remain unfinished.
Remaining method/configuration gaps (not new owner approval gates):
- Qualified contexts need encoded field-level qualifier semantics before this narrow adapter can admit them safely; the rejection is a limited implementation rule, not a claim that qualified evidence is useless.
- Role/time-to-action linkage is not implemented; no association is invented by sharing a record.
- A supplied owner question/direction path remains future implementation under the existing business boundary.

The agreed boundary is unchanged: a reported use context supports only a narrow conditional-fit hypothesis. It is not demand, prevalence, superiority or a ranked opportunity.
