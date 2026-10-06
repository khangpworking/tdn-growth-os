# Handoff — source-neutral M11/I15/M12 decision packets and candidate validator (pure boundary)

Updated: 2026-10-04 (correction 2: counterevidence relations and current-adapter wording)
Worktree/branch: `work/research-automation-v1`, `fix/research-real-world-audit` (HEAD `0116091`, dirty tree preserved; nothing committed)
Authority:
- plan v2.4;
- business clarification 2026-10-04 (thread `01a0a8fd-02d2-7e71-ba4c-244930d054bd`, turn `01a104bf-1625-7801-8738-c8959cb6e32c`);
- business clarification 2026-10-04 "Review marketing framework files", turn `01a104db-50f1-76f3-bbe8-f06761c9b677`;
- A41 synthesis profile `5fd879f4…225a`; adoption `5c5d1ea4…b7e7`.

This is a packet and validation boundary only. It is **not** complete M11/I15/M12 automation. Nothing here dispatches a model, reads a database, stores an artifact, renders a report or registers a section.

## Correction 2 (this revision)

### Counterevidence relations
Before this correction, `counterevidenceRefs` accepted any packet claim (including any M05) with only the candidate's generic rationale. Now:
- Each candidate (all three types) requires `counterevidenceRelations` (0..20). Each entry is a closed `DecisionCounterevidenceRelation`:
  - `claimRef`: exact digest; must be one of this candidate's `counterevidenceRefs`;
  - `relationType: 'PROPOSED_COUNTEREVIDENCE'`, `relationStatus: 'HUMAN_REVIEW_REQUIRED'`, `layer: 3`;
  - `counteredTarget` (aiText): must equal the candidate `text` or one of its `assumptions` verbatim;
  - `compatibility`: closed `{ entity, measure, unit, period, scope, denominator }`, each a required aiText that states compatibility or the explicit unresolved mismatch;
  - `inferentialLimitations`: 1..10 aiText.
- Validator rules, all after the schema passes:

  | Condition | Error code |
  |---|---|
  | `claimRef` not in the packet | `UNKNOWN_CLAIM_REFERENCE` |
  | `claimRef` not among this candidate's `counterevidenceRefs` (extra) | `COUNTEREVIDENCE_RELATION_UNBOUND` |
  | Second relation for the same ref | `COUNTEREVIDENCE_RELATION_DUPLICATE` |
  | Target is not the candidate text or an assumption | `COUNTEREVIDENCE_TARGET_NOT_IN_CANDIDATE` |
  | Any `counterevidenceRefs` entry without a relation | `COUNTEREVIDENCE_RELATION_MISSING` |

  Unknown fields are rejected by `additionalProperties:false`.
- What the relation is not:
  - It is not a verified counterclaim, a new source claim or owner input. Original claim identities are untouched.
  - Only the claim binding and the verbatim target are machine-checked. Whether the claim actually counters the target, and every compatibility statement, are **unverified human-review drafts, not machine proof**.
  - Ref membership does not verify the relation. A claim without a retained relation cannot be counterevidence; it stays separate context.

### Current-adapter wording
I02-only support is now labelled as the CURRENT adapter limit, not business eligibility:
- Packet item fields are renamed: `supportEligibility` → `currentAdapterSupport` (`USE_CONTEXT_ANCHOR` | `NOT_ADMITTED_BY_CURRENT_ADAPTER`), and `notEligibleReason` → `currentAdapterReason`.
- `candidateEligibility.rule` is now `CURRENT_ADAPTER_I14_SOURCE_STATED_USE_CONTEXT_ANCHORS_V1`.
- New always-present gap: `SUPPORT_ADAPTER_COVERS_ONLY_I02_SOURCE_STATED_USE_CONTEXT`.
- Packet limitations:
  - added: `CURRENT_SUPPORT_ADAPTER_…_NOT_THE_BUSINESS_ELIGIBILITY_RULE`, `M05_SUPPORTED_PATTERN_OR_CONSTRAINT_AND_I04_ACTION_WITH_RELATED_CONTEXT_AWAIT_CONTENT_SPECIFIC_ADMISSION`, `A_BARE_PURCHASE_OR_USE_ALONE_DOES_NOT_SUPPORT_UNMET_NEED_OR_MARKET_GAP`, `CO_LISTED_SECTIONS_DO_NOT_IMPLY_PRODUCT_PERSON_LISTING_OR_PERIOD_JOIN_DENOMINATOR_MERGE_OR_INDEPENDENCE`;
  - replaced: `ONLY_SOURCE_STATED_USE_CONTEXT_ANCHORS_MAY_SUPPORT_A_CANDIDATE` and `SOURCE_OBSERVATIONS_OR_A_BARE_ACTION_ALONE_…`.
- Candidate limitations add: the current-adapter support note, the four relation notes (proposed/unverified, membership does not verify, compatibility is not proof, no relation means context only), and number-free period/denominator wording.
- Support eligibility was **not** widened. M05 and I04 are still not admitted as support. Owner fields stay UNSET; priority, preference, choice and execution stay null.

## Contract and module (current shape)
- Contract `contracts/analysis/automation-decision-packets.schema.json` (`AutomationDecisionPackets`). The root is `oneOf` of two `$defs`:
  - `packet` (`AutomationDecisionPacket` = M11 | I15 | M12 packet), method `automation-decision-packet` 1.0.0;
  - `candidates` (`AutomationDecisionCandidates` = M11 | I15 | M12 envelope), method `automation-decision-candidates` 1.0.0.

  Both stay 1.0.0 because nothing is released; see the compatibility notes.
- Module `src/modules/analysis/research-automation/decision-packets.ts`. It has one AJV instance and compiles `#/$defs/packet` and `#/$defs/candidates` by `$ref`.

### Deterministic packet (`buildAutomationDecisionPacket`)
- **Identity.** The input embeds the exact `AutomationI14EvidenceAdmissionInput` with an explicit saved `admissionVersion`. The unmodified `buildAutomationI14EvidenceAdmission` runs first, so its codes apply unchanged:
  - run/scope/workspace/scope-digest/claims identity;
  - located output replay and row binding (`LOCATED_*`);
  - literal projection binding (`LITERAL_PROJECTION_*`).

  Claims are revalidated with `validateAutomationSourceClaims`, and `claimsSha256` must equal the admission's. Every claim must be exactly an anchor or `unassigned` (`ADMISSION_CLAIM_COVERAGE_MISMATCH`).
- **Bindings retained:** `sourceClaims`; `useContextAdmission` (admission version and `admissionSha256` of the exact bytes); `authority` (pinned profile and adoption digests as schema consts; `policyRevision 'a41-source-neutral-decision-packets-v1'`). Neither the pinned profile nor the legacy Metric packet was changed.
- **Items.** `items` reference each upstream claim, grouped M05 → I02 → I04 in upstream order (`CATALOG_SECTION_ORDER_M05_I02_I04_UNRANKED`). Each item has `claimId`, `sectionId`, `basis`, `evidenceKind`, `currentAdapterSupport`, `currentAdapterReason`, and the encoded COUNTEREVIDENCE and QUALIFIER span counts. Statements, spans, values and attribution stay in the bound claims artifact; a renderer joins by `claimId`.
- **Owner inputs** are explicit UNSET, and the schema accepts nothing else:
  - `ownerQuestion` UNSET; `ownerConstraints: []`;
  - M11 `opportunity`: definition, size, weights, risk and return UNSET; `priority: null`;
  - I15 `strategy`: `ownerOptions: []`; objective, horizon, risk appetite, trade-off weights, capability, cost and review trigger UNSET; `preferredOption: null`;
  - M12 `action`: `decisionState 'OPEN'`, `ownerOptions: []`; accountable owner, budget, capability, risk, criteria and timing UNSET; `chosen: null`, `executionAuthorization: null`.
- **Status and gaps.** `status` is UNRANKED_EVIDENCE_INVENTORY, or INSUFFICIENT_EVIDENCE (`NO_ELIGIBLE_UPSTREAM_CLAIMS`) with no claims. Computed `evidenceGaps`, at most 8:
  - always: `OWNER_QUESTION_UNSET`, `CROSS_CLAIM_COUNTEREVIDENCE_NOT_ASSIGNED_WITHOUT_OWNER_HYPOTHESIS`, `UPSTREAM_CLAIM_ADAPTERS_LIMITED_TO_M05_I02_I04`, `SUPPORT_ADAPTER_COVERS_ONLY_I02_SOURCE_STATED_USE_CONTEXT`;
  - when true: `NO_ELIGIBLE_UPSTREAM_CLAIMS`, `NO_SOURCE_OBSERVATION_CLAIMS`, `NO_LOCATED_DECLARATION_CLAIMS`, `NO_ADMISSIBLE_SOURCE_STATED_USE_CONTEXT`.
- **Candidate eligibility** is `candidateEligibility {rule, status SUPPORT_ANCHORS_AVAILABLE|INSUFFICIENT_EVIDENCE, insufficientEvidence}`.
- **Other errors:** `INVALID_DECISION_PACKET:<ajv>`, `DECISION_PACKET_TOO_LARGE` (64 MiB), `DECISION_SECTION_UNSUPPORTED`, `ADMISSION_VERSION_REQUIRED`.

### Packet replay (`verifyAutomationDecisionPacket`)
1. Validate the schema.
2. Check the section and admission version (`DECISION_SECTION_MISMATCH`, `ADMISSION_VERSION_MISMATCH`).
3. Rebuild the packet and compare canonical JSON (`DECISION_PACKET_REPLAY_MISMATCH`).

### Candidate validator (`validateAutomationDecisionCandidateResponse`)
- The packet is rebuilt, never trusted, and `packetSha256` is taken from its exact bytes.
- The response must be exactly `{ aiCandidates }` (`CANDIDATE_RESPONSE_FIELDS_INVALID`).
- Section/type binding is checked before the schema (`CANDIDATE_TYPE_SECTION_MISMATCH`): M11 HYPOTHESIS|OPPORTUNITY_DIRECTION, I15 STRATEGY_OPTION, M12 ACTION_OPTION.
- Each candidate is closed, with `candidateStatus` HUMAN_REVIEW_REQUIRED and `layer` 3. Fields and bounds:

  | Field | Bound |
  |---|---|
  | `text`, `conciseEvidenceLinkedRationale` | one aiText each |
  | `citedClaimRefs` | 1..20 |
  | `counterevidenceRefs` | 0..20 |
  | `counterevidenceRelations` | 0..20 |
  | `assumptions` | 1..10 |
  | `unknowns` | 0..10 |
  | `evidenceGaps` | 0..10 |
  | `limitations` | 1..10 |
  | I15 `conditions` | 1..10 |
  | M12 `prerequisites` | 1..10 |

  aiText is at most 1000 characters with no Unicode number characters. There are at most 20 candidates. No score, rank, ROI, preference, choice, actor, budget or deadline fields exist.
- Envelope `validation={structural:SCHEMA_AND_REFERENCES_PASSED, semantic:NOT_VERIFIED_HUMAN_REVIEW_REQUIRED}`; schema failures return `INVALID_DECISION_CANDIDATES:<ajv>`.
- Reference checks:
  - Candidates while eligibility is insufficient → `CANDIDATES_WITHOUT_ADMITTED_USE_CONTEXT`.
  - Refs outside the packet → `UNKNOWN_CLAIM_REFERENCE`. This covers cross-run, cross-scope, cross-artifact and candidate-to-candidate refs.
  - Support refs that are not current-adapter anchors → `CITED_CLAIM_NOT_ADMITTED`.
  - Support ∩ counter → `CLAIM_CITED_AS_SUPPORT_AND_COUNTEREVIDENCE`.
  - The relation rules above.

### Candidate replay (`verifyAutomationDecisionCandidates`)
1. Validate the schema and check the section.
2. Re-run the validator on exactly `{aiCandidates}`.
3. Compare canonical JSON (`DECISION_CANDIDATES_REPLAY_MISMATCH`).

Interfaces (unchanged signatures):
- `buildAutomationDecisionPacket(input)` → `{artifact, bytes}`
- `verifyAutomationDecisionPacket(untrusted, input)`
- `validateAutomationDecisionCandidateResponse(untrustedResponse, input)` → `{artifact, bytes}`
- `verifyAutomationDecisionCandidates(untrusted, input)`
- `AutomationDecisionPacketInput { sectionId; evidence: AutomationI14EvidenceAdmissionInput & { admissionVersion } }`
- `AutomationDecisionSectionId`, `AutomationDecisionPacketValidationError`, `MAX_DECISION_PACKET_BYTES`

Generated types used: `AutomationDecisionPacket`, `AutomationDecisionCandidates`, `DecisionPacketItem`. The new title `DecisionCounterevidenceRelation` adds one generated interface.

## Caller requirement (trust boundary)
- **Claims.** `evidence.sourceClaims` must be the artifact the owning Analysis service reconstructed and replay-verified from the exact frozen source/method snapshots. `locatedMethodOutput` and `literalSnapshot` must come from the owning verified bridge, never from API or model input. **Local structural validation is not raw-source authentication.**
- **Market packets with paired Insight claims** (clarification 1):
  - Root composes them only from the exact same frozen run, scope, selected sources and report revision, and the original attribution is retained in the claims artifact.
  - The packet adds no product, person, listing or period join, no denominator merge and no independence claim. The `CO_LISTED_SECTIONS_…` limitation records this.
  - This module enforces only that every claim belongs to one claims artifact with one run/scope identity. Lineage is root's.
- **Semantic support** (whether text follows from cited claims, whether a relation really counters, whether compatibility statements are true) stays human review. There is no approval ledger and no synthetic FACT shim.

## Changed paths
Edited in correction 2; all were created in this lane and none are released:
- `contracts/analysis/automation-decision-packets.schema.json`
- `src/modules/analysis/research-automation/decision-packets.ts`
- `docs/handoffs/research-decision-packets-source-neutral.md`

## Compatibility implications (nothing released)
- **Packet bytes change for every input.** This comes from the renamed item fields, the renamed rule const, the new always-present gap and the changed limitations. Any packet retained by root's in-progress wiring (`service.ts` already imports `buildAutomationDecisionPacket` and `verifyAutomationDecisionPacket`) or a fixture built before this revision will fail replay with `DECISION_PACKET_REPLAY_MISMATCH`. Rebuild them. `service.ts` does not read the renamed fields directly (checked by grep).
- **Candidate responses.** The old shape lacks the required `counterevidenceRelations` and is rejected by the schema. Any prompt or response template must add it, even as `[]` when `counterevidenceRefs` is `[]`.
- **Versions.** Contract and method versions were deliberately kept at 1.0.0 because nothing was released. If root has persisted any 1.0.0 packet or candidate artifact anywhere durable, bump the versions instead.
- **Types.** The generated `.generated.ts` is stale; regenerate it. `DecisionPacketItem` field names change, and the candidate interfaces gain `counterevidenceRelations`.

## Evidence (commands, results, relevant revision)
- **Not run on Windows:** no test, typecheck, build or generator, per the lane instruction.
- **Local checks:** a JSON parse of the schema (35 `$defs`), and a grep confirming that no old identifier (`supportEligibility`, `notEligibleReason`, `NOT_SUPPORT_ELIGIBLE`, `I14_ADMITTED_SOURCE_STATED_USE_CONTEXT_ANCHORS_V1`) remains in the schema or module. The generator registration and `ignoreMinAndMaxItems` entry already exist (`scripts/generate-foundation-contract.mjs` lines 8 and 202).
- **Root Linux steps:**
  1. Run `npm run contracts:generate` and review `git diff contracts/analysis/automation-decision-packets.generated.ts`. Expect the renamed `DecisionPacketItem` fields, a new `DecisionCounterevidenceRelation`, and `counterevidenceRelations` on the three candidate interfaces.
  2. Run `node scripts/typecheck.mjs`. The relation loop reads `candidate.counterevidenceRelations`, `.text` and `.assumptions` across the candidate union.
  3. Write the smallest contract tests:
     - one valid relation (target = text, and target = an assumption);
     - ref without a relation → MISSING;
     - relation without a ref → UNBOUND;
     - two relations for one ref → DUPLICATE;
     - relation ref outside the packet → UNKNOWN_CLAIM_REFERENCE;
     - paraphrased target → TARGET_NOT_IN_CANDIDATE;
     - an unknown relation field, a missing compatibility dimension, a number character in compatibility text, and a wrong `relationStatus` or `layer` → INVALID_DECISION_CANDIDATES;
     - M05 used as a ref with a relation is accepted, and the M05 claim's identity in the packet is unchanged;
     - prior packet tests updated for the renamed fields and new gap.

## Unresolved (recorded, not decided here)
- **Support adapter coverage (follow-up, approved semantics in clarification 2).** I02-only support is a TEMPORARY ADAPTER LIMIT, not the business rule. The approved semantics:
  - M05 may support a candidate with an actual supported pattern or constraint;
  - an I04 action may support with related context;
  - a bare purchase or use is insufficient;
  - widening requires content-specific admission, not a section whitelist.

  Not implemented here. It needs a new admission adapter (outside source-claims and I14), which then feeds `currentAdapterSupport`.
- **Counterevidence target granularity.** The target must be the whole candidate text or a whole assumption. A narrower sub-assertion must be expressed as its own assumption. Conditions (I15) and prerequisites (M12) are not targetable; list them as assumptions if they need countering.
- **Compatibility dimensions are fixed** at entity, measure, unit, period, scope and denominator, per clarification 3. A dimension that does not apply, such as the denominator of a declaration, must say so in text. There is no codebook or enum, and no machine comparison of claim fields.
- **Numbers.** Number-free aiText means periods, units and denominators are described, not quoted. Exact values stay in the referenced claims. Spelled-out quantities are not detected.
- **Cross-claim counterevidence** is still not computed by the packet without an owner hypothesis; only AI-proposed relations exist.
- **Not included:** an owner-input path (UNSET-only v1), candidate ids, attempt/model/prompt metadata, a retained-artifact reference schema, storage, registration and rendering. These remain root execution wiring.

Next action: on Linux, root regenerates, typechecks and writes the contract tests above, then continues service wiring (rebuild from reconstructed claims, content-addressed storage, verify on read).
Business decisions pending: the content-specific support admission for M05 patterns/constraints and I04 actions with context; the owner-brief input contract.
