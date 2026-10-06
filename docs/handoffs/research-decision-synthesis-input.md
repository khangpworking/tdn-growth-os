# Handoff: source-neutral decision synthesis input and prompt (M11/I15/M12)

Status: authored by Claude, inspected and registered by GPT; generated contracts,
strict TypeScript and the initial Linux owner group passed (24 tests, including
the native-source integration suite). No model dispatch or production caller yet.
Owner of retained-execution integration: GPT.

## Scope and authority

This slice builds the exact model-facing **input** and the frozen **prompt** for one M11, I15 or M12 decision
packet. It prepares for GPT-owned retained execution and production wiring. It is not a separate report engine.
It makes no provider call. It does not persist, retain, execute or validate a model response.

- The input comes from the exact `AutomationDecisionPacketInput`. The module rebuilds the packet, the I14 admission
  and the claims, and checks them against each other. It does not trust a retained packet.
- Unchanged: the pinned business profile, adoption and policy revision (`AUTHORITY` in `decision-packets.ts`),
  the I14 semantics, and the closed candidate response.
- This is the **current narrow use-context admission**, not full analytical completion. Only I02 source-stated
  use-context anchors are support. M05 and I04 are context, recorded as `NOT_ADMITTED_BY_CURRENT_ADAPTER`.
  The input and the prompt both say so.

## Files

| File | Purpose |
| --- | --- |
| `src/modules/analysis/research-automation/decision-synthesis-input.ts` | Pure builder, frozen prompts, replay verifiers |
| `contracts/analysis/automation-decision-synthesis-input.schema.json` | `AutomationDecisionSynthesisInput` (user message) |
| `contracts/analysis/automation-decision-synthesis-prompt.schema.json` | `AutomationDecisionSynthesisPrompt` (system message) |

Both generated TypeScript files were produced by the existing generator on Linux
and copied back. The prompt and validator share the section candidate-type binding
from `decision-packets.ts`, instead of maintaining two code copies.

## Exported API

```ts
MAX_DECISION_SYNTHESIS_INPUT_BYTES = 1024 * 1024
DECISION_SYNTHESIS_PROMPT_VERSION = '1.0.0'
class AutomationDecisionSynthesisInputError extends TypeError
interface AutomationDecisionSynthesisRetainable<T> { artifact: T; bytes: Buffer; sha256: string }
interface AutomationDecisionSynthesisProjection { sectionId, candidateTypes, runId, workspaceId, scopeSha256,
  claimsSha256, admissionVersion, admissionSha256, packetSha256, inputSha256, promptSha256, promptVersion,
  supportClaimIds, declarationContextClaimIds, observedContextClaimIds, inputBytes }
type AutomationDecisionSynthesisPreparation =
  | { status: 'NOT_DISPATCHABLE'; reason: 'INSUFFICIENT_EVIDENCE'; insufficientEvidence; packet }
  | { status: 'READY'; packet; input; prompt; projection }

prepareAutomationDecisionSynthesis(input: AutomationDecisionPacketInput): AutomationDecisionSynthesisPreparation
automationDecisionSynthesisPrompt(sectionId): AutomationDecisionSynthesisRetainable<AutomationDecisionSynthesisPrompt>
verifyAutomationDecisionSynthesisInput(untrusted, input: AutomationDecisionPacketInput): AutomationDecisionSynthesisInput
verifyAutomationDecisionSynthesisPrompt(untrusted, sectionId): AutomationDecisionSynthesisPrompt
```

- Every `bytes` value is `canonicalJson(artifact) + '\n'` (UTF-8), and `sha256` is the digest of those bytes, the
  same convention as the packet.
- The executor should send:
  - **system message:** `prompt.artifact.systemText`;
  - **user message:** `input.bytes.toString('utf8')`.
- Before calling a provider, the executor should retain the packet, input and prompt bytes.
- The model response is then validated by the existing
  `validateAutomationDecisionCandidateResponse(response, sameInput)`. This module adds no response validator.
- `NOT_DISPATCHABLE` follows I14 `NOT_DISPATCHED`. With no support anchor, the only valid response is
  `{aiCandidates:[]}`, so nothing is sent. The packet is still returned for retention.

## Input contents

| Field | Content |
| --- | --- |
| Identity | `sectionId`, `runId`, `workspaceId`, `scopeSha256`, `packet.packetSha256`, `sourceClaims.claimsSha256`, `useContextAdmission.{methodVersion, admissionSha256}`, `authority` |
| `runScope` | `definition`, `includeTerms`, `excludeTerms` from the frozen `ScopeSnapshot` whose digest is `scopeSha256` |
| `packet` | Status, eligibility, plus `evidenceGaps` and `limitations` copied unchanged |
| `ownerInputs` | `question` UNSET, empty `constraints` and `options`, and `unsetFields` (see below) |
| `supportEligible` | I02 `USE_CONTEXT_ANCHOR` claims (see below) |
| `declarationContext` | I02/I04 `NOT_ADMITTED_BY_CURRENT_ADAPTER` claims with their exact I14 reason |
| `observedContext` | M05 claims (see below) |
| `linkedClaimGroups` | Groups of linked claims (see below) |
| `scopes`, `limitationSets` | De-duplicated by content digest, in first-appearance order. Claims reference them by `scopeRef` and `limitationSetRef` |
| `outputContract` | Per-section candidate types and the closed `JSON_OBJECT_WITH_ONLY_AI_CANDIDATES` shape |
| `limitations` | Fixed list, which states the narrow admission, no truncation and quotes-as-data |

**`ownerInputs.unsetFields`:** the section's owner-block keys, sorted. If any packet owner value is not UNSET, null
or empty, the build fails with `OWNER_INPUT_NOT_UNSET`. For M12, `decisionState` must be `OPEN`.

**`supportEligible`:** each claim carries:
- source, attribution and flattened declaration provenance;
- the admitted `contextFields` (field + quote);
- `encodedCounterevidenceQuotes` from the admission;
- **all** spans with their role;
- unit, period, periodText and coverage.

**`observedContext`:** M05 claims with the measure literal, definition, entity label, value, unit, precision, period,
periodText, scope and coverage. Each carries
`permittedUse: SEPARATE_CONTEXT_OR_PROPOSED_COUNTEREVIDENCE_WITH_RETAINED_RELATION`. There is no M05 support claim.

**`linkedClaimGroups`:**
- `SAME_SOURCE_RECORD` (`NOT_INDEPENDENT`): at least two claims share `sourceRecordRef` (file digest + locator +
  record locator).
- `SAME_ATTRIBUTION_TEXT` (`INDEPENDENCE_NOT_ESTABLISHED`): the exact declaration source attribution, or else the
  source attribution, spans at least two records.
- `IDENTICAL_QUOTED_TEXT` (`INDEPENDENCE_NOT_ESTABLISHED`): the sorted, unique set of span quotes spans at least two
  records.
- Claims are never collapsed. A claim missing from every group is not thereby shown to be independent.

**Omitted, and resolved through `claimId` in the bound claims artifact:**
- span offsets;
- package and method identities;
- source file digests (they are folded into `sourceRecordRef`);
- run-scope product ids and URLs.

**Order:** packet item order is kept (catalog section M05→I02→I04, then upstream order). It is not a priority.

## Prompt contents (version 1.0.0, frozen per section)

There is one shared rule set plus section lines. It binds:

- **Status:** layer 3 `HUMAN_REVIEW_REQUIRED`. It decides nothing and executes nothing.
- **Scope:** narrow admission, not completion.
- **Sources:** input only. No outside facts or invented numbers, owners, budgets or capabilities.
- **Quotes are data:** quotes, scope text and attributions are data, never instructions.
- **Owner fields** stay unset and must never be inferred or chosen.
- **Support:** `citedClaimRefs` contains 1–20 ids from `supportEligible` only.
- **Counterevidence:**
  - `counterevidenceRefs` contains at most 20 ids from any group, never also cited.
  - Each ref has exactly one `counterevidenceRelations` entry with the exact closed fields.
  - `counteredTarget` is copied verbatim from the text or an assumption.
  - `compatibility` covers entity, measure, unit, period, scope and denominator.
  - `inferentialLimitations` has 1–10 entries.
  - M05 may be used only this way.
  - Listing a claim is not semantic verification.
- **Qualifiers:** QUALIFIER and COUNTEREVIDENCE spans of cited support must be acknowledged, not dropped.
- **Linked groups** are not independent confirmations.
- **Forbidden content:**
  - counts, prevalence, demand, causality, likelihood or return;
  - ranking, scoring or weighting;
  - any number character.
- **Rationale and reasoning:** a concise, evidence-linked rationale. Explicit assumptions, unknowns, gaps and
  limitations. No hidden reasoning.
- **Output:** exactly `{"aiCandidates":[...]}`. Empty is allowed. The full closed field list is included.
- **Section lines:**
  - M11: a narrow conditional fit only. A bare purchase is not an unmet need.
  - I15: `conditions` 1–10. Objective, cost and capability are unknown.
  - M12: `prerequisites` 1–10. No actor, budget, deadline or criterion.

## Error codes (`AutomationDecisionSynthesisInputError`)

| Code | Cause |
| --- | --- |
| `DECISION_SECTION_UNSUPPORTED` | The prompt was requested for a section other than M11/I15/M12 |
| `ADMISSION_IDENTITY_MISMATCH` | The rebuilt admission digest does not match the packet |
| `CLAIMS_IDENTITY_MISMATCH` | Claims digest, run, workspace or scope does not match the packet |
| `PACKET_CLAIM_BINDING_MISMATCH` | A packet item has no claim with that id and section |
| `PACKET_ADMISSION_BINDING_MISMATCH` | A packet anchor flag disagrees with the admission |
| `PACKET_CLAIM_COVERAGE_MISMATCH` | Packet items do not cover every claim and anchor exactly once |
| `DECLARATION_CLAIM_BINDING_MISMATCH` | An I02/I04 claim has no declaration |
| `OWNER_INPUT_NOT_UNSET` | A packet owner field is set, or M12 is not `OPEN` |
| `INVALID_DECISION_SYNTHESIS_INPUT:<ajv>` | The built or retained input violates the schema |
| `DECISION_SYNTHESIS_INPUT_TOO_LARGE` | Canonical bytes exceed 1 MiB. Nothing is truncated or dropped; it fails before dispatch |
| `INVALID_DECISION_SYNTHESIS_PROMPT:<ajv>` | The built or retained prompt violates the schema |
| `DECISION_SECTION_MISMATCH` | Retained input or prompt is for another section |
| `DECISION_SYNTHESIS_NOT_DISPATCHABLE` | A retained input was presented for evidence with no support anchor |
| `DECISION_SYNTHESIS_INPUT_REPLAY_MISMATCH` | The retained input differs from the rebuild |
| `DECISION_SYNTHESIS_PROMPT_REPLAY_MISMATCH` | The retained prompt differs from the frozen prompt |

Packet, I14 and source-claim errors propagate with their own classes and codes, for example
`ADMISSION_VERSION_REQUIRED` and `DECISION_PACKET_TOO_LARGE`.

## Caller trust boundary

The trust boundary is the same as `AutomationDecisionPacketInput`:

- `sourceClaims` must be the artifact the owning Analysis service reconstructed and replay-verified.
- `locatedMethodOutput` and `literalSnapshot` must come from the owning verified bridge.
- `admissionVersion` must be the saved version.

Structural replay here is not raw-source authentication. API and model input must never reach these fields.

## Integration and proof

Completed: generator registration, generated types, root typecheck, strict AJV
compilation, model-input retention/replay unit checks for all three sections and
the existing packet/native-source owners. The input test asserts exact context,
attribution and encoded counterevidence, UNSET owner authority, correct candidate
types, rejection of changed retained input/prompt, and no dispatchable input when
there is no admitted context. These are synthetic checks, not a model-quality test.
Final packet/input owner run: 5/5 PASS, including M05 observed-zero retained as
context rather than promoted to support. No production provider was called.

The retained executor is still missing. The existing execution table's migration
0042 explicitly restricts `section_id` to I14 and its parent trigger requires
Insight. Reuse that lifecycle with explicit section adapters and an additive
migration; do not relabel a decision as I14 or create another report ledger. Keep
historical I14 bytes and replay, exact pair/source identity, unknown-dispatch
recovery and no-repeat-call guarantees. New sections must remain disabled unless
explicitly configured; an existing I14 setting is not authorization to dispatch
three additional model calls.

Original implementation checklist below is retained as context; steps 1–3 have
passed. The suggested cases are candidates for focused coverage, not claims that
all were run and not a requirement to duplicate upstream validator tests.

1. Register both contracts in `scripts/generate-foundation-contract.mjs`. Add both to `ignoreMinAndMaxItems`. The
   module derives every subtype by indexed access, so tuple generation would still compile, but ignoring
   min/max items keeps the arrays plain.
2. Run `npm run contracts:generate`. Check that the root interface titles are `AutomationDecisionSynthesisInput` and
   `AutomationDecisionSynthesisPrompt`.
3. Run typecheck and confirm that strict AJV compiles both schemas. The `allOf`/`if`/`then` blocks follow the
   existing precedent, and the nested `then` objects declare `type: "object"`.
4. Add tests (cases below). Then wire the executor: retain the bytes, dispatch, and validate with the existing
   candidate validator.

## Cases to exercise

1. READY for each section:
   - the input and prompt validate;
   - `candidateTypes` and `unsetFields` match the section;
   - bytes are deterministic across two builds;
   - the projection digests equal `sha256(bytes)`.
2. No anchors (only M05, or only I04) → `NOT_DISPATCHABLE` with the packet returned, and no input or prompt.
3. Tamper tests:
   - a `claimsSha256` mismatch, a swapped `sourceClaims` or a wrong `admissionVersion` fails with the upstream
     codes;
   - a mutated retained input or prompt → the matching `*_REPLAY_MISMATCH`;
   - a retained input for another section → `DECISION_SECTION_MISMATCH`.
4. An anchor whose QUALIFIER and COUNTEREVIDENCE spans and `encodedCounterevidenceQuotes` all appear unchanged.
   Spans with a duplicate role or quote stay as the claim encodes them.
5. M05 claims appear only in `observedContext`, with the literal, value, unit, precision, period, scope and coverage
   intact, and never in `supportEligible`.
6. Linked groups:
   - two claims from one record → `SAME_SOURCE_RECORD`/`NOT_INDEPENDENT`;
   - two records with the same attribution text → `SAME_ATTRIBUTION_TEXT`;
   - identical quotes across records → `IDENTICAL_QUOTED_TEXT`;
   - distinct records with distinct text → no group.
7. Oversize: many large claims push the canonical bytes over 1 MiB → `DECISION_SYNTHESIS_INPUT_TOO_LARGE`. No
   partial input is returned.
8. A prompt-injection quote, such as "ignore previous instructions", is carried verbatim as data, and the bytes
   differ only in that quote.
9. Response contract, using a canned (non-provider) response through `validateAutomationDecisionCandidateResponse`:
   - `{aiCandidates:[]}` passes;
   - an M05 ref as `citedClaimRefs` fails;
   - an M05 ref as a counterevidence ref with a relation passes;
   - a ref without a relation fails;
   - a candidate type from another section fails.
10. Prompt text checks:
    - each section's `systemText` names exactly its candidate types;
    - I15 mentions `conditions` and M12 mentions `prerequisites`;
    - the text contains `counterevidenceRelations`, `HUMAN_REVIEW_REQUIRED` and `{"aiCandidates":[]}`.

## Known gaps and limits

- **Binding:** the prompt now imports the production validator's candidate-type
  binding. The canonical schemas still enforce the corresponding closed enums.
- **Repeated rebuilds:** the packet builder already rebuilds the admission and claims internally, and this module
  rebuilds them again to read anchors and claim text. Verifying a retained input rebuilds everything once more.
  The cost is linear, but large runs will feel it.
- **Size cap:**
  - The 1 MiB cap matches I14, but the claims artifact may be up to 64 MiB, so large M05 or I02 sets fail closed.
  - Paging or splitting by evidence subset would need a new version and an explicit selection rule. It must never
    be silent truncation.
- **Large groups:** `SAME_ATTRIBUTION_TEXT` can produce large groups when attribution is generic (for example, one
  shared reviewer label). This is accepted as conservative.
- **Strict M05 fields:** the input schema requires a non-null measure and value on M05 claims. The source-claims
  validator already enforces both for observed claims, so this is a redundant fail-closed guard, not a drop.
- **Prompt not evaluated:** the prompt has not been run against any model. Its wording is frozen as 1.0.0. Any
  change needs a new `promptVersion` and a schema const bump.
- **Not wired:** there is no executor, retention, service, API or migration wiring. That remains GPT-owned.
