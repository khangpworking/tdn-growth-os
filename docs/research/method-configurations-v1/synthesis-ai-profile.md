# Synthesis and AI proposal configuration profile v1

Status: draft method profile for review. It turns the six decision-oriented sections into useful evidence packets while preserving the human decision boundary. The optional AI path is a proposed, unexecuted layer-3 contract. This document does not call a model, activate a prompt or approve any option.

## D11: safe outputs for the six sections

All six methods retain the same four layers: source evidence, reproducible result, AI interpretation, and authorized human decision. Each packet identifies its exact input claim IDs and artifact digests, scope/period/unit/denominator, evidence layer, review disposition, limitations, conflicts and missing fields. Reuse only relevant claims; unrelated sections do not become prerequisites. An exact claim reference must replay before it can support a packet. Missing claims are not negative evidence, and incompatible scopes stay separate.

| Section | Concrete safe v1 output | Fields that remain unset without the owner |
|---|---|---|
| I01 business question | Store exact owner-authored `questionText`, decision, audience, scope and constraints; retain each unset value as `UNSET`. Validate completeness and show candidate section navigation only when the owner selects it. | The question, decision, audience, scope, success definition, deadline and selected sections. No AI-generated objective or default geography/time. |
| M01 main conclusion | Downstream inventory of exact reviewed claims and counterclaims. Group by the supplied owner question when present; otherwise keep catalog order. A separate draft summary may cite those claims. | Relevance/priority policy and any actual conclusion. Missing I01 does not block an unranked inventory. |
| M11 opportunity | Unranked evidence bundles grouped by an exact owner-supplied hypothesis; absent one, group only by source section. Show supporting claims, counterevidence, missing evidence and proxy/denominator limitations. | What counts as an opportunity, priority, size, weights, risk or return. Set `priority=null`. |
| I14 opportunity direction | List exact owner-authored direction labels and associated claims; keep ambiguous/unassigned evidence visible. AI-proposed direction candidates live in a separate array. | Direction definitions, ranking, strategy preference and actionability. Set `priority=null`. |
| I15 strategy | Side-by-side owner alternatives in owner order, with exact evidence and known/unknown cost, capability, time and risk fields. Keep `ownerOptions=[]` when no owner alternative was supplied. | Strategy horizon, risk appetite, trade-off weights, capabilities, cost, preferred option and review trigger. Set `preferredOption=null`. |
| M12 action | Open decision packet with exact question/evidence/constraints, owner alternatives if supplied, and an empty list when none exists. Keep any AI candidates separate. Record no action until a separate authorized human decision exists. | Accountable owner, budget/capability/risk constraints, criteria, chosen action, timing and execution authorization. Set `chosen=null`. |

No method silently scores evidence, interprets unknown as zero, resolves conflicting claims by source count/recency, or turns a suggestion into a decision. If a material decision policy is missing, the corresponding output remains an unranked inventory or open packet; evidence display continues where safe.

Worked fixture: the owner has supplied two exact owner options, A and B, and two compatible cited claims that conflict on one constraint. I15 retains both claims and the conflict, displays A and B in owner order, marks an unmeasured constraint `UNKNOWN`, and returns `preferredOption=null`. M12 can reuse the packet but returns `chosen=null`. No model, numeric score or action is produced.

Blocked fixture: an unreviewed AI paragraph says “launch now,” contains no resolvable fact reference, and no owner question/authority exists. Do not admit it to source or result layers, do not create an owner option or action, and retain only the validation failure if an AI attempt had actually occurred. In this documentation batch no such attempt occurred.

## D12: proposed evidence-linked AI candidate contract

### Status and scope

`PROPOSED_UNAPPROVED`, `NOT_IMPLEMENTED`, `NOT_EXECUTED`. This contract is consistent with AI-proposes/human-decides. It does not approve a provider, model, prompt, numeric method or output authority. Candidate type is a closed enum with section binding: `SUMMARY_DRAFT` → M01; `HYPOTHESIS` or `OPPORTUNITY_DIRECTION` → M11 or I14; `STRATEGY_OPTION` → I15; `ACTION_OPTION` → M12; `DRIVER_HYPOTHESIS` → M09; `CODE_SUGGESTION` → I02, I04-I10 or I13. Reject a type/section mismatch. I01 remains owner-authored; the AI does not invent a business question. Candidate text is layer 3 and must display `candidateStatus=HUMAN_REVIEW_REQUIRED`.

### Proposed input fields

```text
attemptId, intendedSection, candidateType, exactQuestionOrUNSET,
ownerAuthoredConstraintsOrEmpty, eligibleClaimRefs[],
inputArtifactDigests[], profileRevision, promptVersion,
modelAndProviderConfig, outputContractVersion
```

`eligibleClaimRefs[]` contains only exact fact/claim IDs, artifact digest/version, pointer, scope, denominator/measure when relevant, and known limitations. Empty or unreviewed evidence does not authorize a free-standing strategy/action candidate. Owner-authored alternatives and `aiCandidates[]` are separate inputs/outputs. Missing owner constraints remain missing; the model cannot complete them.

### Proposed candidate fields and acceptance checks

Each candidate carries:

```text
candidateId, candidateType, text, layer=3,
candidateStatus=HUMAN_REVIEW_REQUIRED, citedClaimRefs[],
targetEvidenceRecordRef|null, codebookId/version/dimension/allowedCode|null,
sourceEventClaimRefs[], affectedMetricRef|null, mechanism|null,
conciseEvidenceLinkedRationale, assumptions[], counterevidenceRefs[],
unknowns[], evidenceGaps[], limitations[],
attemptId, inputDigest, outputDigest, modelAndConfig,
promptVersion, validationResult, humanDispositionRef|null
```

The deterministic validator can check a closed schema, allowed section/candidate-type enums, required fields, exact artifact/claim pointers, and structured numeric bindings. Every numeric output must bind to verified claim IDs or a separately named reproducible arithmetic operation; a renderer, not free prose, should insert those values. Reject a missing/unresolvable reference or a structured binding whose value/scope differs from its verified fact. Do not promise that a string scanner or citation validator can detect every unsupported claim in arbitrary prose. Candidate rationale and free text are untrusted draft text: optional automated flags are warnings only, and a human must review whether the wording, entities, constraints, assumptions and action language are supported. No draft is automatically released or accepted. Keep prohibited decision fields out of the closed output schema (score, rank, weight, probability, ROI, preferred option, execution authorization); a human reviewer also checks semantic claims that structure alone cannot verify.

For `CODE_SUGGESTION`, require a matching frozen codebook ID/version, dimension, allowed-code list, exact target evidence span and qualifiers for context, negation, condition and attribution/hearsay. The candidate must include a suggested code or `UNCLEAR`, concise rationale, alternatives/limits and the attempt metadata. A codebook mismatch or invalid locator fails structural validation; a semantically ambiguous mapping stays `UNRESOLVED` for human adjudication. An unadjudicated suggestion does not enter code counts, n/N, group analysis or synthesis. After adjudication, the accepted code remains a human-coded interpretation, not source fact.

For `DRIVER_HYPOTHESIS`, require exact event claim references and counterevidence, source scope/entity basis, affected metric, proposed mechanism, assumptions, gaps and limits. Keep it a candidate only. It cannot state causality, score likelihood/impact, rank, forecast or become an accepted claim until a human reviews it. A review disposition does not convert it into source evidence.

Retain model/provider configuration, exact prompt version, exact input digest, returned candidate bytes, validator/version/result and subsequent human accept/edit/reject/defer disposition. Keep concise user-facing evidence rationale, not hidden chain-of-thought. Replaying a report reuses the exact retained output; deliberate regeneration creates a new attempt and cannot overwrite the earlier one. A seed or fixed temperature does not make generation deterministic.

Keep candidate workflow status separate from human disposition. The proposed `humanDisposition` is `ACCEPTED`, `EDITED`, `REJECTED`, `DEFERRED` or null, with its own authorized human decision reference. `ACCEPTED` may be copied into an owner decision only after the authorized human creates that decision; it does not change the original AI candidate. An empty `ownerOptions[]` does not make any candidate an owner option. No accepted decision means `preferredOption=null` and/or `chosen=null`.

Toy fixture: eligible claim `C-1` says an existing source reports 12 located offer records for period P. A structured binding may cite `C-1` and reproduce `12 located records`; it cannot bind that count as 12 unique suppliers because the verified unit is `locatedRecordCount`, not a unique entity. If free prose says “12 suppliers,” structural validation cannot guarantee it will catch that wording; the candidate remains untrusted and a human must reject or correct it before use. This illustrates why citations support review but do not prove semantic truth.

Existing B7/B10 decisions remain button-only. This proposal does not add a required rationale field; any future report-level rationale reference is separate and optional. Drafting this specification did not execute a provider/model call or create an AI-candidate artifact.

## Versioning and authority

Sources: A40 `sections/M01.md`, `M11.md`, `M12.md`, `I01.md`, `I14.md`, `I15.md`, `common-rules.md`, and `authority-index.md`. The A40 common-rules file holds the same unexecuted candidate boundary. The coordinator relayed the 2026-09-30 business clarification in session `01a0a8fd-02d2-7e71-ba4c-244930d054bd`: permit unranked evidence-linked AI candidates for review; keep candidates separate from owner choices; preserve exact citations, config and disposition; do not alter B7/B10 contracts. It has no frozen source-file digest in this packet and is not approval to implement or execute. Any future adoption requires a new exact profile/contract revision and owner authorization where business policy changes.
