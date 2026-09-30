# Research A41: close method-configuration gaps

## Objective and authorization

The owner requested a plan and Luna xhigh execution of the remaining method
configuration work after A40. Produce a useful implementation packet for all 30
sections, resolving what existing authority supports and proposing concrete
configurations where it does not. Do not equate a reviewed draft with owner
approval, available input, executable code or a completed report.

This is specification and business-review work. Runtime implementation follows
the resulting scoped decisions; it is not part of this batch.

## Starting point

Read AGENTS.md, README.md, docs/STATUS.md, the A40 task, and
docs/research/section-methods-v1/{index.md,common-rules.md,method-index.json}.
Read the relevant recipes and cited authority before resolving a gap. Preserve
the existing A40 files as the reviewed baseline. Do not rewrite their pinned
authority hashes or silently broaden the seven existing bounded methods.

## Ownership

- Codex owns this plan, technical feasibility review, integration and handoff.
- GPT Luna, xhigh reasoning, owns the configuration packet and proposal register.
- Review marketing framework files owns the business-method review. Ask it for
  explicit scoped dispositions, references and corrections, not a blanket PASS.
- The owner retains decisions about commercial objectives, risk tolerance,
  ranking/strategy, consequential actions and approval of materially new policy.

Codex relays business-session findings to Luna. One writer owns the new packet.
Neither agent may label its own recommendation OWNER_APPROVED.

## Work sequence

1. Decompose A40 D01-D12 into actual parameters and claim types. Classify each
   as inherited authority, proposed method configuration, per-run input,
   missing evidence, or a material owner decision. Do not turn missing data
   into another policy question or require owner answers for ordinary metadata.
2. Draft concrete profiles for descriptive market operations (D01-D04),
   qualitative evidence coding (D06-D07), advanced analysis (D05/D08-D10),
   and synthesis plus retained AI proposals (D11-D12).
3. Request business review in those batches. Capture its exact scoped result.
   Correct findings; preserve open disagreements rather than claiming closure.
4. Map every canonical section to its existing scope, proposed new operation,
   exact required configuration/input, allowed claims and blocked advanced scope.
5. Prepare a small owner decision brief only for material choices still needed.
   Give a recommendation, alternative and concrete effect of deferring it.
6. Codex reviews the complete packet and orders independent implementation
   batches. Report what can be specified/implemented without further business
   invention and what still requires owner approval or data.

## Required depth

For each D group, give explicit parameter names, types/allowed values, proposed
values or required run-supplied values, rationale, source authority, validation,
missing/invalid behavior, deterministic output, forbidden claims, versioning and
at least one small worked example where relevant. An unresolved parameter must
say which operation it blocks. Repeating "needs approval" is not a resolution.

Prefer the smallest useful v1 over an entire analytics framework. Define
concrete source-bound coding categories/inclusion rules as reviewable proposals;
do not leave qualitative sections as empty templates. Preserve multiple labels,
negation, hearsay attribution, mixed statements and counterevidence. Do not
invent cross-record people or episode IDs. Same-record explicit order is allowed
only under A40's SOURCE_STATED_ORDER boundary.

Market profiles must specify the measured object, source family, period, units,
deduplication and comparability. Observed sales/search/listing activity keeps its
literal label unless a separately approved proxy interpretation is supplied.
Do not add overlapping totals or compare incompatible Metric/Kalodata periods.

For advanced methods, propose an implementable eligibility/evaluation profile,
but distinguish analyst recommendations from accepted models/thresholds.
Unsupported forecast, population, causal, conversion or effectiveness claims
remain disabled. Do not invent a model-selection score or numeric threshold
merely to fill a field. A source-bound descriptive alternative must be considered
before blocking the entire section.

Synthesis profiles must enable useful AI-proposed hypotheses/options without
requiring the owner to write every idea. Separate fact extraction/computation,
retained AI interpretation and human disposition. Specify citation checks and
claim boundaries, retained attempts, exact replay and deliberate regeneration.
Do not claim that fixed temperature makes generation deterministic or that a
citation validator proves semantic truth. No hidden chain-of-thought retention.
Keep B7/B10 button-only contracts unchanged.

## Deliverables

Write only under docs/research/method-configurations-v1/:

- index.md: operator-readable outcome, authority distinctions and implementation order.
- market-profile.md: D01-D04.
- qualitative-profile.md: D06-D07.
- advanced-profile.md: D05/D08-D10.
- synthesis-ai-profile.md: D11-D12.
- resolution-register.json: D01-D12 and subparameters, with provenance and status.
- section-admission-matrix.md: exactly 30 canonical sections, scoped readiness for implementation.
- owner-decisions.vi.md: concise Vietnamese recommendations, only genuine owner choices.

The register is planning data, not a runtime admission contract. Keep authority,
business-review disposition, implementation, input readiness and execution as
separate fields. Allowed closure labels include INHERITED_WITH_REFERENCE,
BUSINESS_REVIEWED_PROPOSAL, RUN_INPUT_REQUIRED, EVIDENCE_REQUIRED,
OWNER_DECISION_REQUIRED and DEFERRED_ADVANCED_SCOPE. These labels are not
permissions to execute. Record the reviewed file revision/digest when freezing
business-review evidence; changed bytes require a relevant re-review.

Codex writes docs/handoffs/research-a41-method-configuration-closure.md and adds
a scoped status entry after review. The A40 packet remains unchanged.

## Verification and limits

Inspect completeness, canonical IDs/titles, cross-references, parameter types,
scope coherence, dependencies and synthetic arithmetic examples. Read-only JSON
parsing, hashes and Git whitespace checks are sufficient for this documentation
batch. Do not add tests that only assert document text. Future code uses focused
behavior tests at the owning boundary and Linux CI; no Windows tests, build or
typecheck in this task.

Use existing source knowledge only. No new surveys, interviews, recruitment,
experiments or simulated respondents. No paid/provider calls, new source
collection, plugin installation, production code/schema/catalog modification,
private-data publication, push, PR, merge or deployment. Do not require the owner
to gather new customer data as an unblock. Missing inputs remain explicit.

Stop the batch only when the packet and review are complete or all remaining
work genuinely needs unavailable authority/data. Deliver partial closure with
exact blockers; never claim all 30 sections are executable merely to finish.
