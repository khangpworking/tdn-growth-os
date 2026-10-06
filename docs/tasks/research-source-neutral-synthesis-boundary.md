# P5 implementation boundary: source-neutral claims and synthesis

Date: 2026-10-03. Status: implementation proposal; business semantics reviewed.
This is not provider activation, acceptance of real coding, or completion of P5.
The execution checklist and A41 scoped adoption remain authoritative.

## Inspected constraint

`report-interpretation.ts` replays a real `SourceBackedReportBundle` through the
Metric packet builder. Its resolver requires claims in the same source section,
`claimType=FACT` and `DETERMINISTIC_NORMALIZED_OBSERVATION`. The corresponding
`decision-evidence-packets.schema.json` fixes references to `metric-result.json`.
Neither is the contract for a review author's reported action or a Kalodata
observation with a distinct measurement definition.

The existing interpretation ledger is also not a generic sink. Migration 0032
has a foreign key and identity triggers binding to `analysis_report_versions`
from migration 0030. That series currently represents real Metric-backed report
versions. Creating a fake series/Metric packet would violate the source boundary.
These are source-code constraints, not a result of a model or live experiment.

## First executable slice

P5.1 first exposes verified claims from the actual automation method outputs;
P5.2 consumes them for M01 and I14 only. Do not couple this slice to classified
Metric completion, an unrelated failed source, or all 30 section outputs.

- Claim eligibility is reconstructed from the exact saved run/report input set,
  selected original sources, frozen method output and adoption/disposition.
  Caller-supplied hashes or an object shaped like a claim are insufficient.
- Keep source observations, reproducible calculations and located declarations
  as distinct bases. Coding acceptance and source authenticity are separate.
  A review statement remains DECLARED with its original attribution, even when
  an adopted literal rule or an explicit batch disposition accepts its coding.
- Each eligible claim retains a content identity, source section, exact source
  locator, method ID/version/output identity, scope, applicable period/unit,
  denominator/coverage and limitations. Do not assume the requested date window
  was the observed measurement period or join TikTok and Shopee by product name.
- M01 may refer to eligible claims from other sections; it must not pass the
  old same-section Metric validator by copying their IDs into fake M01 facts.
  M01 can have an unranked evidence inventory without an owner business question.
- I14 owner-authored directions stay separate from AI candidates. A reported
  action alone is not evidence of a motive, unmet need or actionable direction.
  An explicit relevant use context can support a narrow conditional candidate;
  a gap, motive and constraint need not all be present simultaneously. Separate
  what the claim supports from the proposed inference, assumptions and gaps.
  A bare "used/bought it" record remains unassigned and produces no candidate.
- AI output uses the adopted closed candidate types, supporting and counterclaim
  references, assumptions, gaps and limitations. Numeric values and citations
  are copied by the application from verified bindings, not model prose.
  Citation/schema checks do not prove free-text semantic truth.

## Retention and implementation order

1. Finish P1's exact source/input freezing and committed report-version owner.
   Inspect its actual interfaces before assigning the P5 shared writer.
2. Add a canonical versioned claim/candidate contract and its owner-boundary
   adapter. Do not alter historical Metric packet, interpretation or v1 readers.
3. Compose the source-neutral claim set into the existing automation report
   attempt/version snapshot, using the same content-addressed store and owning
   Analysis service. Do not create a third report ledger just for synthesis.
4. Reuse the existing typed AI gateway/execution boundary. Before an actual call,
   resolve provider/model/configuration and specific authorization. A rejected
   input invokes no model. Store exact input/prompt/configuration, response bytes
   and validation outcome before publishing a result that cites them.
5. Reconcile interrupted or ambiguous model attempts explicitly. A render retry,
   report read or PDF export must never pay for a replacement call. Deliberate
   regeneration is a new explicit attempt/version, not an overwrite.
6. Publish the requested Market/Insight pair atomically through the report
   version owner. A failure must not expose half of a new paired version.

No new standalone AI ledger is selected by this proposal. If the actual P1
attempt owner cannot retain this state, record the concrete missing invariant
before changing its schema; do not loosen migration 0032 merely to reuse its name.

## Acceptance contract

One production-boundary owner exercises M05 source observations and I04 located
declarations from different industries, resolves every candidate reference,
rejects mismatched value/unit/period/scope and unknown references, and proves
historical replay requires neither the current model nor provider calls.
Synthetic model responses test structural wiring, not actual model quality.
Business samples judge unsupported semantic leaps separately. A candidate is
shown as HUMAN_REVIEW_REQUIRED and does not create an owner direction, ranking,
action or approval. A lack of sufficient I14 evidence remains visible.

## Business review receipt, 2026-10-03

`Review marketing framework files`, thread
`01a0a8fd-02d2-7e71-ba4c-244930d054bd`, completed turn
`01a1004f-f0b3-7c81-8740-40350e460326`, returned AGREE on basis separation,
retained source-neutral candidates and historical replay, with the narrow I14
eligibility clarification above under A41. This is semantic review, not code,
real evidence acceptance, model activation or an implemented API.

M01 requires at least one exact replayable eligible upstream claim; preserve
its basis, disposition, scope, unit, period and coverage. Accepted coding or an
adopted literal mapping may contribute, but an unaccepted proposal cannot.
Without an owner question keep UNSET and catalog-order inventory, not a ranking
or an invented business objective. Attribute declarations as self-report.

The reviewed synthetic contrast is "I take a fan to work" versus "I used it".
The former can support considering fit for that explicitly reported context,
not a conclusion about missing supply, lighter-product demand or population need.
The latter alone leaves `aiCandidates=[]` with insufficient evidence visible.
Empty counterclaim membership does not establish the absence of counterevidence.
Both candidate types remain HUMAN_REVIEW_REQUIRED; rendering before review is
allowed, but subsequent acceptance cannot turn them into source facts or execution
authority. All references and app-rendered numbers must resolve exactly; schema
and pointer checks do not prove the prose is semantically supported.

## P5.1 implementation checkpoint, 2026-10-03

The source-neutral claim schema and generated types now project M05 observed
values/zero and adopted I02/I04 declarations from automation method snapshots.
The owning service retains canonical claim bytes in the existing artifact store
and registers their manifest in the same report-output transaction. The report
semantic artifact contains a closed digest/size reference, not an inline copy
that would crowd out its independent report or source metadata. No third ledger
or migration is added. Optional presentation adapters cannot author this field.

Read replay verifies exact source/method snapshots, reconstructs the claim bytes
and compares them to the referenced saved artifact, including byte size. A
shortened native or exact-collection presentation retains its frozen method
package reference; the owning reader reconstructs its adopted declarations
without running current coding, a model or a provider. Unknown/missing values
and pending proposals do not become source-observed claims. Measure meanings,
units, requested query-window limitations and declaration attribution remain
explicit. This first slice does not admit a claim as authenticated truth.

Linux generation/typecheck and the 37-test affected owner invocation passed;
the 22-test exact-review/descriptive sibling invocation passed. These are
overlapping focused groups, not final release proof. The three-industry fixture
is synthetic and not real evidence acceptance. Supplemental KEEP checks exact
claim-reference reuse; native presentation-size fallback keeps its action claim.
Independent review found size and contract-bound issues; those were repaired
and the resulting storage delta is undergoing focused re-review.

Focused follow-up: the reviewer confirmed a real KEEP bug for exact-review
presentation fallback. A supplemental version now reconstructs that exact
retained method package before building claims while keeping the presentation
fallback reference. The existing oversized-view test failed on the prior path
because it published empty claims, then passed after the repair without another
collector call. The reviewer rechecked this delta and found no remaining blocker.
The suggested >30 limitation/>64 MiB case was withdrawn: production method
builders retain nine fixed limitations and enforce their own 8 MiB output bound;
schema capacity alone did not establish a reachable bug. No new overflow state
or schema was added for that unproven case.

The three affected owner files passed 30/30 on Linux. A narrower final invocation
after restoring a deliberate negative control passed typecheck and 12/12 tests.
The negative control skipped only source-claim replay verification and caused
the missing-artifact assertion to fail. Both Market and Insight now have owning
boundary checks for missing/corrupt claim files and query-only unchanged replay.
These invocations overlap and do not constitute final release validation.

M01/I14 synthesis, model execution/retention, UI delivery gate, real three-case
content, PDF acceptance and release remain open. No checkbox is ticked; no live
operator/database, provider/model call, owner decision, commit/push/merge or
deployment was performed by this checkpoint.

## M01 owned inventory checkpoint, 2026-10-03

Claude's resumed job `task-mus8qqhv-b21nqu` completed a deterministic M01
inventory builder and replay verifier. GPT registered its canonical contract,
regenerated the types on Linux, and integrated the Market output owner. The
full inventory has its own content-addressed artifact; the report semantic
stores a closed digest/size reference, avoiding an inline duplicate under the
report JSON bound. Its manifest commits with the claims and report outputs.
The owner strips renderer-authored M01 data, reconstructs from the exact
verified claims on read and compares the canonical bytes and size. Existing
reports without this additive reference retain their historical path.

This first slice inventories only the bound Market M05 claim artifact. It does
not claim to have composed the paired Insight claims, chosen relevance or
generated a summary. Owner question remains UNSET, ordering is unranked and
conclusion is null. Empty claims produce explicit insufficient evidence. No
AI model, provider, owner direction or decision is involved.

Linux typecheck and the M01/three-case invocation passed 9/9; the affected
automation/native/exact invocation passed 26/26. Disabling only the M01 replay
block made the missing-dependency assertion fail; the canonical service was
restored before the final typecheck and 9/9 rerun. Luna independently reviewed
the builder, canonical contracts, storage/replay and tests and found no
integration blocker. The groups overlap; they are not release validation or
real evidence acceptance. Rendering, cross-report composition, I14, retained
AI execution and the remaining broad checklist stay open.

## Inspected retention gap before AI wiring, 2026-10-03

The current report owner treats rendering as repeatable local work:
`recoverOnStart()` requeues RUNNING supplemental attempts and REPORTS steps;
`interruptActive()` also requeues an active supplemental attempt. That is
appropriate for the current deterministic methods, but not permission to retry
an ambiguous paid AI call. No model execution has been inserted into this path.

Migration 0041 retains a supplemental source request, frozen source set,
terminal state and committed report pair. It does not retain a model dispatch
identity, prompt/configuration, dispatch state, response artifact or validation
outcome. The initial report also has a REPORTS step rather than a supplemental
attempt row. These are the concrete missing invariants; storing only an AI
paragraph in the final semantic report would not close the crash window.

The next retained-execution slice must bind call state to the existing initial
or supplemental execution identity, not create a separate report series. Before
dispatch it must retain the exact eligible inputs, prompt and non-secret model
configuration. A returned response must be durably retained with its validation
outcome before a report uses it. Restart after ambiguous dispatch must expose an
interrupted/unknown outcome and must not issue a replacement call. A retained
response may be replayed for a render retry without invoking the gateway; an
explicit regeneration needs a new execution identity and cannot overwrite the
earlier response. Read/PDF routes remain call-free.

The existing analysis AiGateway input is restricted to MarketSnapshotResult or
ResearchEvidenceIndexResult. The creative gateway has a usable text transport,
but its model enum and the Content Studio attempt service are domain-specific.
Do not fabricate a Metric result, Content Studio item or model availability to
reuse those identities. Reuse transport mechanics only after inspecting their
actual contracts. Any minimal extension belongs to the Analysis execution owner
and its shared writer. No new table, gateway extension or provider activation is
claimed by this checkpoint.

Luna's independent read-only audit confirmed the gap and the existing atomic
report-pair publication. It also found that the historical Analysis
interpretation service retains completed interpretations, but does not claim a
durable dispatch before its gateway call; it must not be used as proof of safe
automation retry. This checkpoint does not alter that historical path.

The smallest viable extension is an AI execution subrecord owned by the same
Analysis automation service, bound to the initial run or supplemental attempt.
It is not another report series. A possible dispatch becomes terminal
DISPATCH_UNKNOWN on recovery, never ordinary queued render work. Persist the
exact returned candidate text/defined response envelope and its validation
outcome, not hidden reasoning or an indiscriminate provider payload. Final pair
publication must bind all requested report artifacts and the retained AI
execution references atomically. Exact input/response replay must be independent
of current provider/model configuration. These are implementation constraints,
not new model-call authorization or a completed retention feature.

## I14 owned admission checkpoint, 2026-10-03

Claude's job `task-mus9epun-ubnjh6` completed a pure structured-I02 admission
adapter and closed candidate validator. GPT generated the contracts on Linux
and integrated a separate admission artifact/reference into the Insight owner.
Read replay rebuilds it from the same exact verified claims and full frozen
located/native method output; renderer-authored admission is stripped. Its
manifest commits with the paired report outputs. Empty or bare-action evidence
is explicitly insufficient and cannot authorize a candidate. No model executes
through this integration.

This is a deliberately limited first admission rule: situation, task or setting
must be SOURCE_STATED; role/time alone is insufficient. Qualified or conflicting
rows are retained as unassigned, not erased or relabelled false. Field-scoped
qualifier semantics and action/context linkage remain implementation gaps. The
business permission for narrow conditional hypotheses is unchanged. Candidate
structure/reference validation remains distinct from human semantic review;
the number-character rejection does not detect spelled-out quantities or all
unsupported comparative/prevalence prose.

Linux generation/typecheck and the first I14/three-case invocation passed9/9;
the affected automation/native/exact invocation passed41/41. A skipped-I14-read
negative control failed at the intended missing-dependency assertion, and the
canonical source was restored. The focused invocations overlap and are not full
release proof. Visible synthesis, retained model execution, real coding/content,
UI/PDF acceptance and deployment remain open; no broad checkbox is ticked.

After restoration and exact KEEP-reference assertions, Linux typecheck and the
I14/three-case/native/exact invocation passed35/35. Luna's independent code
review found no integration blocker. Claude's next job `task-musaixix-rya3ov` implements only the durable
Analysis execution subrecord; no gateway is activated or real call authorized.
