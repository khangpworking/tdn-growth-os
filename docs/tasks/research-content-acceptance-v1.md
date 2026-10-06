# Research content acceptance v1 (pre-code freeze)

Date: 2026-10-02. Checkpoint: `53538fc095ffd092e5f36647b2098ed9c11398bb` on
`fix/research-real-world-audit` ([draft PR #110](https://github.com/khangpworking/tdn-growth-os/pull/110)).
Author: Claude Opus 5.5 high, as a proposal for independent GPT audit. Nobody
self-approves this document. It sets content targets before more code. It
reports no execution, approves no business conclusion and authorizes no
provider call.

Authority: [30-section plan](research-30-section-remediation-plan.vi.md),
[method inventory](../research/automation-method-execution-inventory.md),
[contract review](../research/remediation-contract-review-v1.md),
[parallel integration](research-parallel-integration-v1.md) and A41 adoption.
Business authority stays with the `Review marketing framework files` session.
This document adds no method, schema, approval system or report design.

## Independent review disposition (GPT, 2026-10-02)

**AMEND; C1 is not assigned for implementation yet.** The proposal below is
retained for review, subject to these corrections:

- Date eligibility gates period-bound claims, not all qualitative coding.
  Category CORE/WIDE/UNKNOWN and date eligibility are separate dimensions;
  do not change category membership merely because a date is missing. Undated
  records cannot support an annual WIDE claim. They remain labelled context. C2 may prepare
  that path without waiting for C1 to establish a source date field.
- Source discovery for keyword cases stays system-owned. Missing thermos/fan
  URLs first require discovery and exact identity/selection integration, not an
  instruction that the owner must research provider listings. Ask only when
  scope is ambiguous or an established selection approval is needed.
- M07 currently has bounded unranked inventory, not the owner-declared-peer
  comparison asked for in the matrix. It is not completion of that question.
- A business approval cannot establish a provider field's undocumented meaning.
  Keep date mapping unknown until actual field and semantic evidence supports it.

The independent [source inventory](../handoffs/research-source-inventory-20261002.md)
verifies 103 original captures. No review rows were available in the inspected
audit store or the one collection in the separately named legacy operator
store. The Task 016 page was not located in the checked roots. These results
do not establish absence elsewhere. The business session independently agreed
with the date, discovery and M07 amendments (turn
`01a0fccd-bb67-7091-8c6a-3370d2b8ccd9`). Literal rule proposals may be prepared
and reviewed in parallel with source discovery, but are not source verification
or real-content acceptance. No new owner decision is required at this point.

## 1. Three separate states

| State | Meaning | Who sets it |
|---|---|---|
| Technical execution | Production automation called the method on the run's retained inputs and saved output that replays without provider calls. | Linux proof (GPT) |
| Usable content | The section answers its reader question below with source-bound values, quotes or coding, labelled with scope, period and coverage. | This matrix, checked against the rendered report |
| Human approval | An authenticated authorized person accepted the report. | Owner / designated reviewers only |

These are **not** usable content: a blank method; an executed method with no
eligible records; a provenance or manifest table alone; a gate that only
explains why nothing ran; all-pending coding; a heading with boilerplate.
Those may be honest limitations. They never count as a completed section.
`completedAnalyticalSections: 0` is hardcoded in
`src/modules/analysis/research-automation/reports.ts:142`. That conservative
value stays. It is not a progress gauge and this document does not change it.

## 2. Failure categories

Use the first category that blocks the minimum output. Use more than one only
when each blocks a different part.

| Code | Use when | Not when |
|---|---|---|
| `SRC` SOURCE_MISSING | No admitted retained input of the needed kind exists for this case in the inspected evidence. | Evidence elsewhere was not inspected. Then say NOT_VERIFIED; never claim the source cannot exist. |
| `SEM` EVIDENCE_MISSING / SEMANTICS_UNVERIFIED | Input exists, but a needed field, meaning, unit, window, additivity, variant/pack or relation is absent or unproven by retained docs/schema/captures with locators. | A literal zero. `OBSERVED_ZERO` stays a value, not a bug and not missing. |
| `MAP` MAPPING_OR_INTEGRATION_MISSING | Source and method both exist, but the versioned mapping, bridge, retention or render path is not wired. | The method itself cannot do the operation (use `UNS`). |
| `UNS` METHOD_UNSUPPORTED | The operation is outside adopted A41 methods or deliberately disabled. | A gate rendering correctly. That is a valid limitation, not a defect. |
| `OWN` OWNER_DECISION | Only for unavailable rights, unresolved material scope/peer/brief, or a new activation. | Literal mappings, row labelling, budget preference (already recorded) or anything an adopted rule resolves. |

Status tags used in the matrix: `OUT` = bounded method output retained and
replayed from real captures; `CTX` = context/inventory only.

## 3. Verified case facts (read-only inspection)

Source: `artifacts/research-real-world-audit-20261002/` outside Git. Inspected:
`{product,thermos,fan}/manifest.json`, `capture-metadata.json`, `benchmark.json`,
`replay-methods-v3/receipt.json`, `replay-methods-v3/browser-receipt.json`,
`synthetic-paired-reports-ibEiVL/acceptance.json`. No raw payload, review text,
screenshot or identifier was copied.

| Fact | Exact jelly (`product`) | Thermos | Fan |
|---|---|---|---|
| Capture baseline commit | `9355f57` (before exact URL intake) | same | same |
| Mode / period | PRODUCT; 2025-10-02 to 2026-10-01, 365 Vietnam calendar days | CATEGORY; same | CATEGORY; same |
| Interview brief | All five fields unknown | same | same |
| Providers in captures | Kalodata only (7 calls: balance, rank, 4 detail) | Kalodata only (48) | Kalodata only (48) |
| Selected products | 0. No card matched the exact listing; collection skipped | 3, auditor-selected; no business approval or representativeness | 3, same basis |
| Offline replay v3 | Method `NO_USABLE_OBSERVATIONS`; 4 discovery details only | 39 window records, 78 literal values; M05=78, M06=39, M07 unranked inventory | same counts |
| Shopee review corpus | None in these artifacts. The run predates `exactShopeeUrls` | None. No exact Shopee URL was declared | None |
| Serp / dated documents | None captured | None | None |
| Cost | Unknown; account-wide points delta only | Unknown | Unknown |

The Kalodata detail response key set (from `responseShape.dataKeys`, no values)
includes revenue, sales volume, unit/min/max price, review **count**, launch
date and revenue trend. It contains no review text. The meaning, window
boundaries, timezone and additivity of these fields are not established by any
retained provider document in Git. The open-center link in
`docs/handoffs/research-automation-provider-readiness.md` is a URL, not
retained bytes with locators.

The synthetic pair (`ibEiVL`) is transport proof: `completedAnalyticalSections=0`,
`NOT_CODED`, synthetic IDs. It is **not** real-source evidence for any case.

NOT_VERIFIED: whether a matching exact Shopee collection for shop `78085196` /
item `17678138164`, or any thermos/fan review corpus, exists in the Fedora
runtime, another artifact root or a private inventory. Which commit produced
replay v3 is also not recorded in the receipt.

## 4. Family definitions (shared by rows)

| Family | Sections | Production path at checkpoint | Prerequisite for usable content | Minimum meaningful output |
|---|---|---|---|---|
| LIT literal market | M05, M06, M07 | Kalodata detail → Foundation package → D (`descriptive-method-bridge.ts`), retained, replayed | Admitted captures for the case's selected/declared products | Source-named literal values or records per window, with zero/missing/NON_EXACT kept. Labelled as the selected or declared products, never "the market". |
| ARITH market arithmetic | M03, M04, M08 | M03/M08 inventory only (`market-method-bridge.ts`); C/M03 recipe and M08 generic quote are not run on live inputs | Run-bound Metric export (M03 single-period, M04), **or** a reviewed Kalodata semantic mapping (M03 sum/change); offer/variant/pack/mass evidence (M08) | One exact admitted calculation, with frame and coverage. If arithmetic is not admitted, a literal inventory plus the specific missing operand. The inventory alone is not completion. |
| EVENT | M09 | D executes; empty | Retained accessible dated documents linked to an entity | At least one located, dated, attributed event with an entity basis and counterevidence slot |
| GATE | M10, I11, I12, I16 | G exists; its extension still requires Metric `packet.json` | Series / group policy / touchpoint records / experiment protocol | Gate with the actual inventory and named missing inputs. Always a limitation, never analytical completion. |
| SYN synthesis | M01, M11, M12, I14, I15 | P exists; accepts legacy FACT only | Versioned tagged synthesis adapter (accepted in contract review) plus usable upstream claims | Claims with refs from usable upstream sections; owner options/directions or explicit UNSET; no ranking or selection |
| CTX context/trace | M02, M13, I01, I03, I17 | Wired (automation context, M13 package trace, raw corpus I03/I17) | Frozen scope/start/captures; for I03/I17 a retained corpus | Requested vs observed scope per source; executed-method list; record-level trace. Context sections can pass as context, not as analysis. |
| LOC located Insight | I02, I04–I10, I13 | L exists; no corpus → L bridge; no pinned Vietnamese literal rules | Admitted real review corpus; pinned rule revision under the adopted `located-evidence-v1-draft` codebook; corpus-to-L mapping | Located spans with attribution, negation, condition and hearsay; accepted vs pending counts shown separately. Records are not people. Not every record must fill every field. |

Common review-date rule for all LOC/CTX Insight rows: retain all review text.
If a source date exists, project the literal value and pointer under a versioned
mapping, keeping UNKNOWN. Label every row `IN_PERIOD`, `OUT_OF_PERIOD` or
`DATE_UNKNOWN`. Only `IN_PERIOD` rows support period-bound claims. Undated rows
may appear as separately labelled context, never as annual evidence or WIDE.
An observed date span alone does not prove completeness. Today the corpus
projects no date (`CAPTURE_WINDOW_NOT_REVIEW_DATE_OR_VARIANT_SELECTION`).

## 5. Thirty-section acceptance matrix

Case cell: J = exact jelly, T = thermos, F = fan. The denominator is 30. No row
is dropped for being blocked.

### Market

| ID | Reader question | Minimum meaningful output | Family / prerequisite | J · T · F now | Blocking category | Next action · owner |
|---|---|---|---|---|---|---|
| M01 | What can we say, on which evidence, and what is still unknown? | Claim inventory from ≥1 usable section, with refs and explicit unknowns; no default conclusion | SYN | J `SRC` (no upstream) · T/F `MAP` | `MAP` | After ≥1 usable Market and Insight family: synthesis adapter · root lane (GPT assigns) |
| M02 | What was studied: requested vs observed, which rules applied? | Per-source requested period, observed query windows, CORE/WIDE/UNKNOWN state, executed-method list | CTX + scope-rule application | `CTX` all | `MAP` (scope rules recorded, not applied) | Scope membership rule application · root lane |
| M03 | How big is the defined market in the period, and how did it move? | One exact admitted total, or per-window literal inventory explicitly labelled "not a total" + missing operand | ARITH | J `SRC` · T/F `CTX` (inventory) | T/F `SEM` (Kalodata meaning/additivity/window); all `SRC` (Metric) | Retain Kalodata field docs with locators → business-reviewed mapping (GPT); Metric export via the existing manual-step path (owner performs export; not a new decision) |
| M04 | How is the market split, with a valid denominator? | Group/shop table; share only with a complete denominator | ARITH (full C output) | `SRC` all | `SRC` (Metric) | Same Metric dependency. A 3-product selection cannot substitute. |
| M05 | What do sources literally report about sales/revenue per window? | Literal per-window values under source names; no subtotal without disjoint additive proof | LIT | J `SRC` · T/F `OUT` (78 values) | Sums: `SEM` | T/F acceptable as bounded content if labelled "selected products". Rendered-label check at design review; no code. |
| M06 | Which listings/shops/offers do sources show, in what state? | Located records with source-stated object/status; coverage; `uniqueEntityCount` stays null | LIT | J `SRC` · T/F `OUT` (39 window records, not 39 products) | Breadth: `MAP` (rank pagination inventory not wired); status: `SEM` (no stock/status field in the detail key set) | Thin but honest. Breadth needs a paginated inventory source. Market lane, after semantics. |
| M07 | How do owner-declared peers compare with the anchor on the same metric and window? | Same-measure, same-window side-by-side table; unranked | LIT + declared peers | J `SRC` · T/F `OUT` (unranked auditor picks) | Peer claim: `OWN` | Unranked inventory needs no owner input. Owner confirms peers only if a competitor comparison is a case objective. Batch with the I13/T/F scope question. |
| M08 | What prices are observed per offer/variant, and per comparable unit where valid? | Literal price inventory (unit/min/max separate); per-item or per-100g only with linked count/mass | ARITH (`generic-quote-unit-v1`) | J `SRC` (no Shopee product/variant detail; actor collects reviews) · T `CTX`+`SEM`+`UNS` · F `CTX`+`SEM` | `SEM` (variant/pack/count/mass) | T per-ml/capacity is outside v1 (`UNS`). It needs business review only if wanted. Jelly price needs a product-detail source (`SRC`). |
| M09 | Which dated, sourced events could affect this market? | ≥1 located dated attributed event with entity link; otherwise honest "no admitted events" | EVENT | `SRC` all (D empty) | `SRC`, then `MAP` (search result → retained page → M09 record) | Market lane, after source plan. Search hits alone are not events. |
| M10 | Can we forecast? If not, exactly why? | Gate with the actual series inventory and missing split/gap policy | GATE | `UNS` all | `UNS` (forecast disabled) + `MAP` (G needs Metric packet) | No action. Activation would be a new owner decision. Not asked now. |
| M11 | Which evidence-backed opportunity hypotheses exist, with counterevidence? | Source-section grouped claims or owner hypotheses with support/counter; no rank | SYN | `MAP` all | `MAP` | With M01 |
| M12 | Which decision options and constraints are open? | Owner options/constraints or explicit UNSET open decision with linked evidence | SYN | `MAP` all | `MAP` | With M01. UNSET is valid; no owner prompt. |
| M13 | Can every rendered number be traced to source bytes? | Capture → package → method trace for each value shown | CTX | J `CTX` (discovery only) · T/F `CTX` | none | Verify trace per usable row at acceptance |

### Insight

| ID | Reader question | Minimum meaningful output | Family / prerequisite | J · T · F now | Blocking category | Next action · owner |
|---|---|---|---|---|---|---|
| I01 | What did the owner ask, and with which constraints? | Declared brief with UNSET fields | CTX | `CTX` all (all fields unknown) | none | UNSET is correct. Do not ask the owner to fill it. |
| I02 | In which situations/tasks/settings do the selected-listing reviews describe use? | Located context spans with attribution; pending visible | LOC | `SRC` all | `SRC` → `MAP` → rule pin | Corpus first (§7 SA-1/SA-2) |
| I03 | Which records were studied/excluded, over which dates, in what coding state? | Corpus coverage including IN_PERIOD / OUT_OF_PERIOD / DATE_UNKNOWN and coding state | CTX (raw coverage wired) | `SRC` all (no corpus) | Code: `MAP` (no date eligibility); field: NOT_VERIFIED | **Proposed next code task C1 (§6)**, gated by check RC-1 |
| I04 | Which actions do reviews explicitly report as tried/done/completed/not done, and attributed to whom? | Located action spans with attribution, negation and condition; pending/unresolved separate | LOC + pinned I04 rule table | `SRC` all | `SRC`; rules: `SEM` (proposal table not pinned) | C2 after corpus + business pin. The six-sentence table only proves plumbing. |
| I05 | What attitudes toward which targets are stated, with negation/mixed? | Clause polarity with target and quote; stars/silence not used | LOC + rule pin | `SRC` all | `SRC`; rules: `SEM` (no Vietnamese rule set drafted) | Business session drafts/pins rules once on real corpus vocabulary |
| I06 | What order of events does one record explicitly state? | Same-record ordered spans only; no default journey | LOC + explicit relation | `SRC` all | `SRC` | Needs positive same-record order evidence. Do not chase it. |
| I07 | Which choice reasons are stated in the same record? | Choice + reason clause + facet; hearsay kept | LOC + facet rule pin | `SRC` all | `SRC`; rules: `SEM` | With I04 family |
| I08 | Which attempted tasks met which obstacles? | Task + obstacle pair in the same record | LOC + facet rule pin | `SRC` all | `SRC`; rules: `SEM` | With I04 family |
| I09 | Which explicit gaps between desired and current state are stated? | Explicit gap relation with exact quotes; partials separate | LOC + explicit gap | `SRC` all | `SRC` | Only if the corpus contains explicit gaps |
| I10 | What topics appear in this frozen corpus? | Counts in codebook order with pending/multi-code shown; ratios only when coding is complete | LOC | `SRC` all | `SRC` | Ratios are not a prerequisite for the first family |
| I11 | Do declared groups differ? | Group inventory under a declared policy with real assignment evidence | GATE | `SEM` all (no group assignment evidence; demographics may not be inferred) | `SEM` + `MAP` (G) | Honest gate only. No action now. |
| I12 | Which touchpoints show presence, exposure or outcome? | Separate presence/exposure/outcome inventories | GATE | `SRC` all | `SRC` + `MAP` (G) | After corpus |
| I13 | Which brands/products do reviews mention? | Located literal mentions with counts in the frozen corpus; no alias invention | LOC | `SRC` all | `SRC`; alias/peer list `OWN` only if membership is needed | Literal mentions need no owner input |
| I14 | Which opportunity directions have support and counterevidence? | Directions with support/counter claims; no priority | SYN | `MAP` all | `MAP` | With M01 |
| I15 | Which strategic alternatives and constraints apply? | Options/constraints or UNSET; decision stays open | SYN | `MAP` all | `MAP` | With M01 |
| I16 | Which experiment design or existing result applies? | DESIGN_ONLY gate; NOT_EXECUTED | GATE | `MAP` all | `MAP` (G) | Honest gate only |
| I17 | Can every quote/code be traced to an exact source span? | Raw quote + page/pointer per record; coding trace once coding exists | CTX (raw quotes wired) | `SRC` all (no corpus) | `SRC` | C1 adds per-quote date state |

### Current tally (no execution claim)

Usable bounded descriptive content from real captures: **thermos and fan,
M05/M06**, plus an M07 unranked inventory that does not yet answer the
owner-declared-peer comparison question. They describe three auditor-selected
products, not the category. Exact jelly
has no usable analytical content. Context-only for all cases: M02, M13, I01.
For thermos/fan also M03/M08 inventories. Certified complete: **0 of 30**.

## 6. Proposed next code task for Claude: C1 review-date eligibility

**Why this one.** Every case uses a 365-day period. The agreed business rule
requires explicit in/out/unknown period state. The only wired Insight path
(raw corpus → I03/I17) currently says "Kỳ báo cáo không lọc ngày review". Every
later I02–I09 claim needs this per-row eligibility. Building the located bridge
first would mean reworking it. C1 is small, sits on an existing retained and
replayed path, and does not depend on codebook rule pinning, paid calls or the
synthesis adapter. Its content value still needs a real corpus (SA-1).
**I04 is not chosen.** No real corpus exists and its rule table is unpinned.

**Gate: read-only check RC-1 must return first (§7).** The row schema
`contracts/foundation/apify-shopee-rows.schema.json` declares an optional
`createdAt` (`date-time`). It was authored in commit `1728a0f` for task 015,
before the task-016 live smoke. The synthetic fixture has no date key, and
`additionalProperties: true` means the live smoke passing validation does not
prove the key exists. So the field name, format, offset and meaning are
**NOT_VERIFIED**. C1 must use exactly what RC-1 reports. It must not guess a
key or fall back to capture time.

Behavior (new mapping `apify-shopee-review-row-v2`, contract
`research-review-corpus-v2`):

- Per version: the date literal verbatim, its JSON pointer and a parse state
  (`PARSED_WITH_OFFSET`, `NO_OFFSET`, `UNPARSEABLE`, `NULL`, `ABSENT`).
- Eligibility against the frozen start snapshot `requestedPeriod` (inclusive
  Vietnam calendar dates, UTC+7). Rules:
  - `IN_PERIOD` or `OUT_OF_PERIOD` only for parsed instants under a mapping
    whose meaning (review creation time) is documented or business-reviewed.
  - Otherwise `DATE_UNKNOWN` with a reason. No offset and no documented source
    timezone also gives `DATE_UNKNOWN`.
  - Same-ID versions with different dates get record eligibility `CONFLICTING`.
- Coverage adds `inPeriodRawRows`, `outOfPeriodRawRows`, `dateUnknownRawRows`
  (sum = `rawRows`), plus an observed date span labelled "not completeness".
  No row is removed. Quarantined rows keep their own state.
- I03 shows the three counts and the period. I17 shows each quote's date state.
  Undated rows stay labelled context. Template and design unchanged.

Owned paths:

- `src/modules/analysis/research-automation/review-corpus.ts`: add the v2
  builder; keep the v1 builder byte-for-byte; `verify` dispatches on the stored
  `contractVersion`; export a v1|v2 union type so `service.ts` is untouched.
- `contracts/analysis/research-review-corpus-v2.schema.json` (new; v1 schema
  unchanged) plus one registration line in
  `scripts/generate-foundation-contract.mjs`. GPT regenerates the `.generated.ts`
  on Linux via `npm run contracts:generate`. I do not hand-write generated files.
- `src/modules/analysis/research-automation/exact-shopee-bridge.ts`: pass
  `start.requestedPeriod` to the builder; `verifyCorpus` dispatch.
- `src/modules/analysis/research-automation/review-corpus-report.ts`: I03/I17
  rendering for v2; v1 rendering unchanged.
- Tests: `tests/unit/research-review-corpus.test.ts` and
  `tests/integration/research-automation-exact-reviews.test.ts`.

Production entry and callers (unchanged call graph):
`ResearchAutomationService` report step (`service.ts:494-495`) →
`ExactShopeeBridge.corpus` (`exact-shopee-bridge.ts:81-82`) →
`buildResearchReviewCorpus`; read path `service.ts:306-310` →
`verifyCorpus` (`exact-shopee-bridge.ts:84-85`) → `verifyResearchReviewCorpus`;
render `reports.ts:180-181` → `reviewCorpusSection`.

Old replay compatibility: stored v1 corpora verify against the unchanged v1
builder and render with the existing copy. New runs write v2. Saved report
versions stay byte-identical. No migration, recollection or recompute of
history.

Test boundary (Linux only; GPT executes):

- One unit boundary table: inclusive start/end with the +07:00 conversion
  (e.g. `2025-10-01T17:00:00Z` counts on the start day); out-of-period;
  `ABSENT`/`NULL`/`UNPARSEABLE`/`NO_OFFSET`; conflicting same-ID dates; row
  conservation; v1 snapshot replay unchanged.
- Extend the existing first exact-reviews integration test: counts in I03 HTML
  match independent expectations; stored v1 snapshot still verifies.
- Expected values are written by hand, not by the function under test.

Dependencies:

1. RC-1 result.
2. If the actor documentation does not state the date's meaning, a one-line
   business-session mapping review before eligibility is emitted. Literal
   projection may still ship, with all rows `DATE_UNKNOWN`.
3. If RC-1 finds no usable date key, cancel C1. I03 then states "no source
   review date" explicitly through a copy-only change, and C2 becomes next.

**C2 (next candidate; implementation assignment still to be scoped):** corpus
→ located-insight (L) bridge for I02/I04/I05/I07/I08 with I03/I17 trace.
Literal rule proposals may be prepared and reviewed now under the adopted
codebook; implementation needs a pinned rule revision and source mapping.
Real-content acceptance needs an admitted real corpus. C1 is required only
for claims requiring known period eligibility, not separately labelled undated
qualitative context. No AI coding activation; ambiguous rows stay pending.

## 7. Precise read-only checks and source actions

| ID | What, exactly | Owner | Notes |
|---|---|---|---|
| RC-1 | On Fedora, verify the retained task-016 raw Apify page (sha256 `9ae3481d6b5296aa2d0e99758f01ba1015b51d82f02c7560e82d7f40aa4ef326`, 32,969 bytes; see `docs/handoffs/016-live-shopee-smoke.md`). Report only: union of row key names; for each key matching `/date\|time\|creat\|ctime\|submit\|updat/i` its JSON type, present/null/absent counts and value **shape class** (ISO with `Z` / with numeric offset / without offset; epoch s / ms). Also report whether any actor output-schema or README for build `qegOxhQ9LAGnjhzod` is retained, with locator. | GPT | No comment text, no values, no author fields, no provider call. If the page is not retained: NOT_VERIFIED. C1 then waits for the first SA-1 page and runs the same check on it. |
| RC-2 | On a read-only copy of the runtime SQLite DB, list `foundation_shopee_collections` and, from each `artifact_sha256` packet, `selected[]` shop/item pairs. Report whether `78085196`/`17678138164` appears and its page row counts. | GPT | Resolves the jelly NOT_VERIFIED. No writes. |
| SA-1 | Controlled exact Shopee review collection for the jelly listing through the wired `exactShopeeUrls` path | GPT under existing controlled-case authorization | Not authorized by this assignment. The no-dollar-limit preference is already recorded; do not re-ask. |
| SA-2 | Thermos/fan review source: no exact Shopee listing was declared and Kalodata returns only a review count | `OWN` (conditional) | Ask once, batched with the M07 peer question: confirm exact listing URLs for thermos/fan Insight, or accept Insight as `SRC` for those cases. Whether Kalodata offers review text is NOT_VERIFIED; check retained docs first. |
| SA-3 | Retain Kalodata product-detail field documentation (revenue, sales volume, unit price, revenue trend, launch date; window/timezone/additivity) with locators; then a reviewed mapping revision | GPT retrieves; business session reviews | Prerequisite for any M03 sum/change on Kalodata. A model or session assertion is not enough. |
| SA-4 | Run-bound Metric export for M03/M04 | Owner performs export through the existing manual-step path | Existing plan; not a new decision |

## 8. Lanes and acceptance (unchanged)

Up to three lanes: Market evidence/mapping (SA-3, M08 evidence), Insight
evidence/coding (C1 → C2), root report integration (synthesis adapter, G
decoupling, scope rules). Asymmetric probes are intermediate. Release acceptance
remains three paired real reports, six PDFs, meaningful screenshots and
reconciled cost evidence. Proposed test labels are not independent
human-labelled accuracy ground truth.
