# P3.2a/P4.3a: implementation boundaries and delivery order

Date: 2026-10-03, checkpoint 2026-10-04. Status: rule-adoption and selected
assignment receipt backend/API and classified report integration implemented and
Linux-verified; rule-adoption and assignment-selection UI passed independent
finish review and documentation review. Real acceptance remains open.
Authority: [bounded business semantics](../research/research-batch-acceptance-semantics.md)
and execution plan v2.4. No new methodology, provider authorization or real
coding acceptance is granted by this document.

## What already exists

Metric preparation replays the exact workbook, manifest, optional labels,
normalized input and receipt through `MetricInputPreparationService.readVerified`.
`MetricSourceLabels` is a closed historical sidecar whose adjudication is a
declaration. It does not record authenticated selection or actor/time. The
readiness/calculator/recipe path may consume that sidecar under its original
semantics; do not relabel old outputs as application-approved.

Automation Metric source v2 intentionally has `labelsPath: null`. It cannot
silently become the acceptance-aware classified path. Source selection and
report revision v1 also have no accepted-coding reference.

Insight has retained proposals, exact source records, candidate spans and
attribution. Its adopted literal projection authorizes only the pinned narrow
source-bound declarations. Clear adopted mappings do not need a new per-row
review. Pending/ambiguous model or literal candidates remain distinct. Declared
`HUMAN_REVIEWED` provenance by itself is not an authenticated application receipt.

## Delivery order

Prerequisite completed 04/10: exact rulebook adoption against confirmed scope,
with trusted OWNER/time and immutable read/retry through the production API.
See [implementation handoff](../handoffs/research-b1-metric-rule-adoption.md).
This does not satisfy step 1's assignment receipt or adopt the real J/T/F rules.

Step 1 backend/API subsequently completed: [membership handoff](../handoffs/research-b1-metric-membership.md),
Linux typecheck and affected tests 95/95 PASS. This does not adopt real rules or
labels. Step 2 is now integrated: [classified report handoff](../handoffs/research-b1-classified-metric-revision.md),
Linux typecheck and affected group 78 PASS, one optional PDF skip. Step 3 now has
Linux frontend proof (219/219 full, 19/19 focused) and independent Ship review.
Step 4 is in progress; do not count a receipt owner as complete report integration.

1. **Metric-specific receipt, not a generic approval engine.** Bind the exact
   verified preparation/universe, source content and scope, rulebook revision,
   immutable proposal content/ID and selected assignment revisions. Actor and
   timestamp come from the trusted OWNER boundary, not the request. Keep the
   existing labels schema unchanged; receipt lives beside it.
2. **One end-to-end automation revision.** New acceptance-aware contracts must
   carry that exact receipt into a new report pair. Reuse the existing attempt,
   exact predecessor, cancellation, pair commit and read-replay mechanisms.
   No mutation of the previous report, no new collection and no third report
   ledger. Receipt storage alone or an offline-only recipe is not completion.
3. **Visible selection and consequence.** Read proposals through the verified
   source/preparation owner. The UI shows scope, rule revision, assignment and
   source, with explicit selection and confirmation including hidden selected
   rows. Publish selection receipts without pretending a partial subset is the
   whole universe. Once every member has a valid disposition, the new version
   may use existing classified arithmetic with UNKNOWN excluded from WIDE.
4. **Insight-specific overlay second.** Reuse proven receipt/retry mechanics,
   not Metric assignment semantics. Preserve family, span, attribution, group,
   relation, qualifiers and counterevidence. Bind exact corpus and rule/parser
   identity. Partial accepted quotes may be displayed; incomplete dispositions
   still block final corpus ratios. Acceptance does not authenticate the review
   author or convert a self-report into observed behavior.

If a rulebook or scope is still a proposal, record that prerequisite as unresolved.
Do not invent adoption from an arbitrary `codebookVersion` string or from a batch
confirmation. Proposed edits create a new immutable proposal revision; they do
not erase source qualifiers or silently resolve a disagreement.

## Atomicity and replay

- Validate the complete selected set before writing. Stale source, scope,
  proposal or rule revisions reject the entire new batch.
- Check a known exact request before current-revision conflict checks and
  replay its verified original receipt/time. It does not approve newer content.
- Accumulate accepted assignments without double-counting; reject mutually
  exclusive assignments according to the domain codebook. Unselected is pending.
- Preserve original membership, missing values and original raw bytes. No
  filtering the universe down to accepted rows to unlock calculations.
- Read-only receipt/report replay verifies exact saved dependencies and never
  invokes classification, model inference or provider collection.

## Smallest sufficient verification

Use one primary owning-service acceptance journey with synthetic rows from the
three industry fixtures, independent expected totals and explicit UNKNOWN.
Exercise partial then complete coverage, unchanged historical report, exact
retry, stale divergent batch and conflicting assignments. HTTP/UI tests own
only their distinct auth, hidden-selection confirmation and response-reload
risks. Run checks on Linux scratch; no Windows project checks or live data.

## Coordination

GPT owns shared contracts, migrations and integration/audit. Assign domain files
and UI only after the exact boundary is settled; do not have writers change a
shared schema simultaneously. The optional retained I14 transport is independent
and proceeds in parallel. This acceptance work must not introduce a mandatory
gate for already-adopted clear literal mappings or delay the narrow R1 path.

The code audit found no existing authenticated batch owner to reuse. Reuse
preparation readers, artifact primitives and report-version machinery; do not
borrow B7/B10 decision authority or retrofit historical v1 contracts.

## Next bounded family: I06 / I09 / I10 / I13

Verified against the current tree on 04/10, not inferred from worker output:

| Family | Existing calculation owner | Automation connection still required |
|---|---|---|
| I06 | `located-insight-methods.ts`, same-record explicit event relation | Accepted `Journey` annotations tied to exact source spans; no cross-record person matching |
| I09 | same owner, explicit gap/desire/current-state distinctions | Accepted `Gap` annotations with qualifiers and counterevidence preserved; desire-only must not become unmet need |
| I10 | `insight-corpus-counts.ts`, unique-record n/N and pending dispositions | Adopted corpus/codebook plus accepted assignments/dispositions; full corpus retained, no ratio until existing completeness gates pass |
| I13 | same counts owner, literal mentions and channel-bound ratios | Exact mention spans and approved literal codebook; no fuzzy alias merging or market-share claim |

The existing `literal-review-projection.ts` intentionally admits only I02/I04/
I05/I07/I08 under pinned implementation/policy hashes. Do not widen those bytes
or update their pins to smuggle a new authority into historical reports.
Both `located-review-bridge.ts` and the native reader retain descriptors that
can supply records, but neither currently owns authenticated I06/I09/I10/I13
acceptance. `reports.ts` routes only the literal family on this path.

Execution checklist, preserving the already approved methods:

- [x] GPT defines closed Insight-specific adoption/proposal/acceptance contracts
  using the existing located-input annotation definitions, not a second set of
  formulas. Bind exact pair, corpus source identity and codebook revision; keep
  trusted actor/time outside untrusted input.
- [x] Implement verified corpus selection and immutable proposal/receipt owner.
  Separate semantic annotations from per-record coding dispositions; preserve
  unselected pending, explicit disagreement and every source qualifier.
- [x] Project accepted selections into `buildLocatedInsightMethods`; keep a
  trusted-caller receipt beside declared provenance, never disguise it as a
  provider measurement. Compute all four sections in one owned execution.
- [x] Integrate into the existing revision worker and historical reader using
  exact dependencies. Preserve unchanged Market and retained AI execution;
  read/export must not infer again or collect again.
- [ ] Add selected span/relation review to the existing workflow. Reuse the
  tested confirmation/retry pattern, not the Metric label fields.
- [x] Owning Linux journey proves real method output, exact quote resolution,
  partial pending/no ratio, complete n/N, duplicate references, contradictory
  coding refusal, retries and historical replay. Then update all four rows of
  the 30-section table. Synthetic passing still leaves real acceptance open.

No new semantic decision is needed to begin this bounded implementation. New
industry codebook adoption and real assignments remain explicit OWNER actions.
Do not count this checklist, a retained receipt alone, or an empty method gate
as completed section automation.

04/10 calculation checkpoint: `selected-insight-projection.ts` and its closed
selection schema preserve the full corpus and make unselected coding pending.
They call the existing four-family methods rather than duplicating formulas.
Linux typecheck and 17 focused checks passed; independent code/test audit found
no material defect. This helper alone does not authenticate an acceptance.

Next integration delta is the exact historical source reader plus persisted
Insight adoption/proposal/receipt owner (migration 0045). Its initial Linux
reader/owner journey passed 31/31 including synthetic jelly, thermos and fan.
Final affected Linux checks passed 118/118; independent owner audit found no
material defect. Actor/role are trusted caller context; end-to-end HTTP
authentication is still part of the API integration, not proven by this service.

Report integration checkpoint: the worker freezes the explicitly selected receipt
set; historical replay verifies it without requiring it to remain the latest
proposal. KEEP inherits it, SKIP removes it only from the new report. Market bytes
and retained I14 execution are unchanged by the acceptedInsight revision. Linux
affected group passed 46 tests, with one opt-in PDF test skipped. The separate
synthetic preview produced six PDFs; visual inspection remains a separate gate.
Verified zero ratios have a reproduced RED/GREEN regression. HTTP/UI, real codebook
adoption and real three-case acceptance remain open; no new section is declared
analytically complete. Claude owns the next bounded HTTP connection; GPT audits
and runs Linux verification before the UI consumes it.

HTTP/client checkpoint: the exact-pair read and authenticated adoption/proposal/
receipt routes now delegate to the existing owner. Linux affected group: 48 PASS,
1 optional PDF skip; final post-audit root typecheck and primary HTTP journey
PASS. Client/revision tests: 7/7, frontend typecheck/build PASS. The client guard
regression failed before repair and passed after. UI remains the next integration
step, not an implicit new business approval. No real coding or provider call.
