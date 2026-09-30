# Research A40 — Machine-actionable methods for all 30 sections

Date: 2026-09-30
Status: plan authorized for drafting; new business methods require review.
Base: `ea38e7f8295c8cbd61ec7776c4363958867c1f10` (A38/A39, draft PR #100).
Branch: `feature/research-a40-section-method-specs`.

## Owner request and result

The owner requested a plan first, then Luna at xhigh reasoning to methodize all
30 market/insight sections sufficiently for a machine to follow. Codex owns
coordination and technical review. The **Review marketing framework files**
session owns business-method review. This batch produces specifications, not
30 executed sections or an approved market report.

Deliver a versioned recipe for each canonical section: what it answers, the
exact inputs, how to process them, what may be reported, what blocks a result,
and what still needs a human decision. A readiness checklist alone is not a
recipe. Approved partial methods retain their limited scope.

## Completion has separate meanings

Record these dimensions separately for every section:

1. Specification coverage: concrete procedure drafted, incomplete, or reviewed.
2. Business authority: existing approved submethod, proposed rule, or unresolved
   owner parameter. Approval applies to the named submethod, not the entire section.
3. Implementation: existing bounded code path, new code required, or human step.
4. Input readiness: assessed only against an exact supplied dataset; otherwise
   NOT_ASSESSED. A method document does not make inputs PRESENT.
5. Execution/review: not run, verified output, or human-reviewed output. Do not
   use specification coverage to imply any of these states.

These are documentation dimensions, not new runtime enums. The operational
catalog and historical report contracts remain unchanged in this batch.

## Sources and precedence

Current section identity/order/title authority:
`docs/research/report-section-catalog-v1.json`, catalog 0.6.0,
`PLANNING_METADATA_NOT_EXECUTABLE_METHOD`.

Approved cross-cutting decisions: `INTENT.md`, especially D40–D42 and A32–A38.
Accepted bounded implementations and handoffs: A22 M02, A23 M13, A24 M08/P4,
A25 I03, A26 I17, A27 charts, A28/A29 readiness, A30/A31 preparation,
A32–A37 M03, and A38 integrated delivery. Read actual implementations when
describing arithmetic; do not derive a new formula from a section title.

Business session confirmation, received 2026-09-30:

- No approved full method exists for M01/M11/M12/I01/I14/I15.
- The six-family input packet supplies prerequisites and claim boundaries;
  it does not supply every analytical procedure or owner threshold.
- Historical `SOURCE_OF_TRUTH_Market_Insight.*` and
  `Ma_tran_30_section_v18_2026-09-22.*` under the business session's `outputs/`
  are reference material, not current executable authority.

Create an authority index with repository-relative source paths, actual file
SHA-256 where available, the supported rule and approval scope. External local
paths belong in private working notes; do not copy private report examples,
customer data, usernames or raw source material into Git. Record the business
session ID `01a0a8fd-02d2-7e71-ba4c-244930d054bd` and date for its clarification.
If a reference conflicts with current policy, flag the conflict, not a silent
replacement. No source hash means no claim that that source was pinned.

## Work sequence and ownership

### 1. Codex writes this plan and freezes the authoring boundary

Work in a separate branch from the completed A38 delivery. Preserve its report,
code and operational catalog. Share this plan with the business session.

### 2. Luna xhigh authors the 30 recipes

One author maintains consistent fields across the batch. Use four work groups;
every section belongs to exactly one group:

| Group | Sections | Treatment |
| --- | --- | --- |
| Existing bounded methods (7) | M02, M03, M04, M08, M13, I03, I17 | Document exact existing submethods and their remaining gaps. |
| Additional market methods (5) | M05, M06, M07, M09, M10 | Specify observational, comparison and forecast procedures; keep new choices proposed. |
| Additional insight methods (12) | I02, I04, I05, I06, I07, I08, I09, I10, I11, I12, I13, I16 | Specify case/coding/sampling/measurement procedures and claim limits. |
| Synthesis and owner decisions (6) | M01, M11, M12, I01, I14, I15 | Specify source-bound synthesis and decision inputs; never invent an approved ranking or strategy rule. |

Do not delay all sections for one missing policy. Draft the safe portions,
identify the unavailable operation, and centralize the unresolved parameter.
Related sections may share a common contract, but need distinct procedures and
outputs. Do not create 30 copies of a generic readiness paragraph.

### 3. Codex reviews execution clarity; business session audits authority

Review the same version of the documents. Check formulas, denominators,
dependencies, source references and whether a developer could implement the
procedure without choosing hidden business rules. Send the business session
the index and representative methods plus all unresolved decisions.

Return corrections to Luna, then publish a coverage matrix separating approved
bounded methods, proposed recipes and decisions still needed. The owner gets a
short consolidated decision list, not a question for every document.

### 4. Implementation follows reviewed methods in separate batches

Later code batches reuse A30 preparation, A31 readiness, existing method owners,
verified artifacts, ChartSpec and A10 immutable report versions. Group by shared
input/operation families rather than one PR for every small section. Start with
approved, data-compatible deterministic operations. Add AI interpretation only
behind a reviewed output/citation contract; human decisions remain human.

This plan does not authorize changing framework semantics merely to remove a
blocker. Any new mandatory decision must be approved before that operation is
enabled. Missing data should not block specification work for unrelated methods.

## Required recipe fields

Each `sections/<ID>.md` must contain:

- Exact ID/title, spec version, authority and named executable sub-scope.
- Business question and explicit non-goals.
- Mandatory/optional input fields with types, units, source locators and identity
  requirements; distinguish structural validity from evidence provenance.
- Compatibility checks: period/timezone, entity universe, sampling frame,
  codebook, metric/unit, inclusion and exclusion, numerator and denominator.
- Ordered procedure with formulas or unambiguous pseudocode. Name the output
  of each step. Identify owner-supplied choices before execution.
- Missing/observed-zero/UNKNOWN rules, deduplication unit, rounding policy,
  deterministic ordering/ties and counterevidence treatment.
- Concrete output fields and a small synthetic worked example with independently
  reasoned expected result. A blocked example must name the failing prerequisite.
- Allowed claim forms, forbidden conclusions and exact evidence links needed.
- AI responsibilities, if any, separated from deterministic calculation;
  validation and human review rules. No AI-generated executable code.
- Upstream dependencies and downstream use, avoiding cycles. M01 can summarize
  upstream sections but those sections must not require its summary to compute.
- Proposed stable blocker codes, existing code references where applicable, and
  reopen/versioning behavior. Proposed codes are not registered runtime codes.
- Open parameters with authority and impact, and acceptance scenarios protecting
  a distinct observable behavior rather than restating this document.

Use `docs/research/section-methods-v1/` for the index, common rules, authority
index, 30 Markdown recipes and `method-index.json`. The JSON index provides
machine-readable IDs, versions, dependency IDs, recipe paths, authority scopes,
implementation scope and open-decision references. It is a draft planning
registry, not runtime admission authority. Keep prose algorithms human-reviewable
until domain choices stabilize; do not build a universal DSL/interpreter here.

## Evidence-family requirements to preserve

- M05/M06/M07/M09: explicitly defined demand proxies, real supply denominators,
  comparable competitor universes and dated driver/risk sources respectively.
  Sales are not automatically demand; co-occurrence is not causality.
- M10: compatible daily history, frozen universe, train/validation/holdout,
  missing-day policy, baseline and error measures. No approved model, minimum
  history, horizon or threshold may be inferred from an example. Forecast and
  owner-authored scenarios must have separate labels and procedures.
- I02/I04–I08: stable case/episode identity, located quote/event, context,
  codebook, coder/adjudication, sampling and counterevidence. Review rows are not
  people. Quotes do not establish population prevalence or causality.
- I09/I10/I12/I13: frozen sampled corpus, located content, dedup and adjudicated
  coding. Not found in a sample is not unmet demand; touchpoint effectiveness
  needs exposure/outcomes. Preserve I13's canonical title, Thương hiệu và đối thủ.
- I11: comparable groups and denominators; sparse-cell and uncertainty rules
  declared before inspecting results. No invented cutoffs or group definitions.
- I16: separate design-only output from executed experiment results; require
  outcome, unit, comparator, instrumentation and assignment before any lift claim.
- M01/M11/M12/I01/I14/I15: a supplied owner question/objective, exact upstream
  claims, explicit conflicts and reviewed prioritization/decision policy. An
  unranked evidence inventory may be drafted without claiming a preferred strategy.

## Reproducibility and AI boundaries

Keep four separate layers: source evidence, reproducible computed results,
AI interpretation, and user decisions. Preserve exact input, method and policy
versions and content digests. A deterministic operation with identical inputs
and versions must return identical output. A rendered report must reuse retained
accepted output rather than silently generating another interpretation.

New AI generation is a distinct versioned attempt and may vary. Temperature or
a seed does not prove determinism or truth. Retain model/config/prompt version,
input/claim references, returned output, validation result and human disposition.
Store a concise evidence-linked rationale, assumptions, alternatives and limits;
do not request or store private hidden chain-of-thought as evidence.

UNKNOWN stays visible but excluded from WIDE under the frozen policy. Missing
never becomes zero. ALL/WIDE/CORE overlap and cannot be added. Hashes establish
byte integrity, not provider truth. Existing manual review evidence must not
receive invented product/listing/person identifiers or commercial measurement
periods. AI numeric assertions must use verified facts; no inference may be
presented as source evidence. Validators reduce risk, not guarantee no hallucination.

## Verification proportional to this batch

This is documentation/spec authoring. Read and parse documents; inspect Git diff
and whitespace. No Windows tests, build or typecheck. Do not add source-string
tests that merely check the new documents repeat themselves.

For later implementation, each acceptance scenario names the observable result,
credible regression, primary owning boundary and whether current coverage already
protects it. Use independently calculated synthetic examples; focus on missing
versus zero, incompatible periods/universes, ties, unsupported claims and replay
only where the method actually owns those behaviors. Reuse shared evidence and
storage tests rather than repeating them 30 times. Execute focused tests and
final integration checks in Linux CI, not Windows.

## Initial batch acceptance and exclusions

- Exactly 30 unique canonical IDs, titles and ordered index entries.
- Every section has an actionable procedure for its declared scope, or explicitly
  names the unresolved rule preventing that procedure from being approved.
- Worked examples and blocker cases are synthetic and do not claim execution.
- Source/authority pointers exist; proposed choices never masquerade as approval.
- No circular dependencies, unexplained denominators or hidden owner defaults.
- Coverage matrix and consolidated owner decisions reviewed by Codex and the
  business session. A review finding remains open until corrected or disclosed.

No runtime source/contract/migration/dependency changes, provider collection,
paid/AI calls, private data copies, report-content generation, automatic merge,
deployment or changes to PR #100. LangGraph, JEV, OpenViking and WeKnora remain
future experiments; no installation is needed to specify these methods.

The business-method session confirmed that the owner's restriction on new
customer surveys, interviews, usability experiments and LLM-simulated customer
answers remains current. Do not propose or require those activities as an
unblock, or ask the owner to perform them. Use existing published/owned data and
already available research; retain missing-evidence limits. I16 can specify a
future design as METHOD_ONLY / NOT_EXECUTED, without recruitment or collection.
Primary-customer collection requires a separate future owner decision outside
A40. Synthetic arithmetic examples are test fixtures, never respondent evidence.

## Plan audit, 2026-09-30

The business-method session read this plan and found no material boundary
omission. This approves the drafting approach, not the new section algorithms.
It recommended keeping decision output closed when owner inputs are absent,
avoiding inferred denominators and proxy substitutions, keeping forecasts
closed without an explicit forecast policy, making M01 downstream-only, and
retaining only P4 as the existing executable part of M08. These recommendations
remain proposals where they introduce new behavior; they do not rewrite already
approved calculator rules. Luna received these constraints before authoring.

Follow-up business clarification: define an optional, unexecuted AI-candidate
contract for evidence-linked hypotheses/directions/options. Keep those candidates
in layer three as PROPOSED_UNAPPROVED, separate from owner-authored options,
validated facts and human decisions. This preserves the intended AI-proposes,
human-decides workflow; it does not activate generation or select a new policy.
No new mandatory rationale field may be added to existing button-only B7/B10
decisions. Use the business direction I01 -> evidence -> M11/I14 -> I15 -> M12;
historical decisions are optional context, not a circular upstream requirement.
