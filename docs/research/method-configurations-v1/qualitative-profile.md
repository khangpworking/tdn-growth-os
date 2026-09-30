# Qualitative evidence configuration profile v1

Status: concrete v1 coding proposal, not owner-approved codebook, implementation or analysis of an existing corpus. It covers D06 (I02, I04-I08) and D07 (I09, I10, I13). It uses only already-held or published material. It does not require new surveys, interviews, recruitment, experiments or synthetic respondents.

## Shared record and coding contract

Each coding unit must resolve to an internal `EvidenceRecordRef`: exact source/package digest, file/version, row/span/quote locator, available time metadata, source attribution, coding/adjudication provenance. That locator supports a located example without inventing a provider, person, listing, product, case or episode ID. Use a case/episode key only when the source issued a stable key. No key means records stay unlinked across sources and cannot support people/cohort counts, cross-source joins or journey aggregation.

Before coding, freeze corpus membership, source digests, inclusion/exclusion rule, selected question, codebook version, coder role and adjudication rule. Retain the exact source wording needed to interpret each code, including negation, condition, uncertainty, hearsay and speaker attribution. Use at most one code per coding dimension per explicit clause, except where the rules below allow multiple distinct codes. Store `UNKNOWN`, `NOT_STATED`, `CONFLICTING` and `UNLOCATED` distinctly. `NOT_STATED` means a reviewed located record does not state the field; `UNKNOWN` means the record cannot resolve it; `UNLOCATED` is not eligible for a source-backed claim. None is a negative response or zero.

Proposed coder workflow:

1. Inventory all included source records and exact locators. Excluded and unreadable records remain in a coverage ledger with a reason.
2. Segment a located record only at source-visible sentence, clause, row or event boundaries. Keep a parent-record reference. Do not create an inferred case/person key.
3. Apply the reviewed literal mappings below without per-row owner approval. A human adjudicator resolves ambiguous category mapping or leaves `UNCLEAR`/`UNCLASSIFIED`; do not force a code. Preserve coder disagreement and counterevidence.
4. Count coded records or spans only, always naming the count unit. Repeat references to the same digest and locator or real source record key may collapse. Identical text at separate locators remains separate. A text hash alone never deduplicates evidence.
5. Sort by the frozen source order and locator, then by explicit codebook order. Keep all located examples available regardless of whether a corpus frame supports a percentage.

The candidate codebook is `located-evidence-v1-draft`. A human reviewer adopts or amends it once as a versioned scheme; coders then apply clear literal mappings without asking the owner to approve each row. Escalate only ambiguous cases, unsupported alias mappings or a proposed codebook change. A complete within-corpus ratio is permitted when the frozen corpus membership/inclusion rule, coding unit, period/frame and codebook revision are fixed and the denominator is complete: `recordsWithCode / allEligibleIncludedRecords`. Always report excluded, unreadable, uncoded and multi-coded units; a multi-coded record may contribute to more than one numerator, so code percentages need not sum to 100%. Unknown external sampling does not invalidate a ratio that is explicitly limited to this frozen corpus, but it never supports a population, customer, sentiment-share or market-rate claim. Population inference requires a population-relevant frame/person unit and separately approved uncertainty method. AI may propose a code only as a layer-3 candidate with exact evidence pointers under the separate D12 contract; it cannot create evidence or finalize a code.

Corpus membership counts are source-inventory facts, not counts of accepted AI
codes. Preserve that denominator even while coding is incomplete. Keep pending
AI suggestions and unresolved coding separate from adjudicated assignments; do
not turn pending into absence, silently remove those records, or report a final
code ratio while coding decisions for the eligible denominator remain pending.
Show accepted-code counts with coding coverage and a partial label instead.
A reviewed UNCLEAR/UNCODED disposition is a completed coding outcome, not a
pending suggestion; it remains visible under the frozen inclusion rule.

## D06: situation, behavior, attitude, journey, reason and barrier

| Section | Proposed fields and values | Coding rule |
|---|---|---|
| I02 situation | `role`, `situation`, `task`, `setting`, `time`; each value is `SOURCE_STATED(text, locator)`, `NOT_STATED`, `UNKNOWN`, `CONFLICTING` or `UNLOCATED` | Copy only directly stated context. Do not infer age, household, income, role or segment. Keep source wording and any approved normalized code side by side. A located example remains usable without a person ID. |
| I04 behavior | `eventKind`: `ATTEMPT_REPORTED`, `ACTION_REPORTED`, `COMPLETION_REPORTED`, `NO_ACTION_EXPLICIT`, `NOT_REPORTED`, `UNKNOWN`; plus `attribution`: `SOURCE_LOGGED`, `SELF_REPORTED`, `OTHER_REPORTED`, `UNKNOWN` | An action verb or explicit no-action statement is required. `NOT_REPORTED` means no event in the source record, not proof no action happened. Do not infer motive or outcome. Across-record ordering requires a source-issued episode/event key; same-record explicit ordering is recorded under I06 only. |
| I05 attitude | `polarity`: `POSITIVE`, `NEGATIVE`, `MIXED`, `NEUTRAL`, `UNCLEAR`, `NOT_STATED`; `target`, `speakerAttribution`, `qualifiers` | Apply to an explicit located statement, retaining negation and attribution. One explicit clause may be positive while another is negative; code the clauses, then mark the parent record `MIXED` if both remain relevant. A star, sale, click, silence or inferred emotion does not establish polarity. |
| I06 journey | For same-record order, use the A40 labels `sequenceBasis=SOURCE_EXPLICIT_SAME_RECORD`, `identityScope=RECORD_LOCAL`, `sequenceState=SOURCE_STATED_ORDER`, plus event locators and explicit relation. For cross-record material, keep a separate proposed `crossRecordLinkStatus` and source-issued episode/event key. | Same-record sequence requires wording such as “first A, then B” linking both spans. Cross-record sequence requires a real source-issued episode/event key plus compatible timestamps or source-issued order; that path is not the same-record A40 method. A simple list or document order remains unresolved. Never invent episode IDs or turn narrative order into instrumented behavior. |
| I07 stated reason | `choiceText`, `reasonClause`, `reasonFacet`, `reasonPolarity`, `speakerBasis`, `resultState` | Require an explicit source statement connecting a choice to a reason, such as “chose A because R.” Apply the literal mapping table below. Code each independently stated reason clause once; multiple clauses may yield multiple facets on one record. Preserve polarity as `AFFIRMED`, `NEGATED`, `CONDITIONAL` or `UNCLEAR`, and attribution as `SELF_STATED`, `OTHER_REPORTED`, `SOURCE_ATTRIBUTED` or `UNKNOWN`. Hearsay remains an attributed reason candidate, not direct experience or automatically negated. No forced single “main reason.” |
| I08 barrier | `attemptedTask`, `obstacleClause`, `barrierFacet`, `resolutionState` | A barrier requires both an explicit attempted task and an explicit obstacle in the same located record. Apply the literal mapping table below. Dissatisfaction without an attempted task/obstacle pair is not a barrier. Keep resolved/unresolved as source-stated only. |

### Literal reason/barrier mapping proposal

| Code | Map only when the located reason/obstacle explicitly says… | Do not map from… |
|---|---|---|
| `PRICE_COST` | cheaper/lower price, price or cost as the stated reason/obstacle | A listed price, large pack or inferred affordability |
| `ACCESS_AVAILABILITY` | delivery, availability, access, or “arrived sooner” as an explicit reason/obstacle | A listed delivery promise without a located choice/task relation |
| `FIT_NEED` | explicit fit between a stated task/need and product attribute; “easier to swallow” maps here only under the reviewed fit-to-task rule | A product attribute alone, with no stated task/need or reason relation |
| `PRODUCT_ATTRIBUTE` | an explicit attribute is named as the reason/obstacle and does not fit a more specific code above | Attribute presence in a listing or source without a stated relation |
| `INFORMATION_TRUST` | explicit information uncertainty, evidence or trust as the reason/obstacle | Silence, lack of a review or coder assumption |
| `OTHER_EXPLICIT` | a complete, explicit reason/obstacle relation that does not match a defined facet | Ambiguous, clipped or unattributed fragments |
| `UNCLEAR` | the explicit relation or facet is ambiguous, clipped or conflicting | A resolvable literal mapping |

`reasonPolarity` and `speakerBasis` are independent dimensions. Example: “I chose B because my friend said delivery arrived sooner” receives `ACCESS_AVAILABILITY + AFFIRMED + OTHER_REPORTED`, not firsthand experience; “not because of price” receives `PRICE_COST + NEGATED`. A conditional reason remains `CONDITIONAL`. Clear rows use the adopted mapping without per-row owner approval; review the ambiguous row or propose a new codebook revision. Preserve exact text and locator for every mapping.

When a proposed facet is ambiguous, preserve the literal source phrase and assign `UNCLEAR`; an adjudicator may add a code in a new codebook revision. Do not silently normalize a phrase to a business taxonomy. A codebook change creates a new revision and requires recoding; retain the former outputs as historical results.

Worked fixture: one synthetic located record says, “I tried to order A, but delivery was unavailable; I chose B because it arrived sooner.” I04 records one `ATTEMPT_REPORTED` and one `ACTION_REPORTED`. I07 maps the explicit reason clause to `ACCESS_AVAILABILITY`; I08 records the attempt plus delivery obstacle under the same facet. The record is one located source record, not one identified customer. A separate record with the same wording at another locator stays separate.

Blocked fixture: a review says “too expensive” but does not identify a choice or attempted task. I05 may code the located explicit negative statement if the codebook is adopted. I07 cannot infer a purchase reason and I08 cannot infer an attempted task. No motive, customer-count or prevalence claim is emitted.

## D07: unmet need, themes and brand/competitor content

### I09 unmet need

Set `unmetNeedCandidate=true` only when one located record explicitly contains both (a) a desired/needed state and (b) a current, failed or unavailable state, with an explicit relation between them. Store two exact pointers and the linking phrase. A desire without a stated gap, a complaint alone, or silence in the corpus is insufficient. Output incomplete cases as `DESIRE_ONLY`, `CURRENT_STATE_ONLY`, `RELATION_UNCLEAR` or `UNLOCATED`, not as unmet needs. The output is a located candidate statement, not a demand estimate.

Toy fixture: “I need a calcium tablet that is easier to swallow, but this one is too large” contains a desired state and a stated failure in the same record, so it can be retained as a located unmet-need candidate. “I like easy-to-swallow tablets” has no stated current gap and is not one.

### I10 themes and concerns

Freeze a corpus manifest and inclusion rule. The coding unit is the source-native record when one exists; otherwise it is the exact located paragraph/passage chosen before coding. Do not split/merge units after seeing code counts. Store `included`, `excluded` or `unreadable` with the reason. A complete within-corpus ratio needs frozen corpus membership and a complete eligible-included denominator, not a probability sample. Unknown external selection still blocks population/customer claims.

For a supplied codebook, preserve its exact revision and order. Under the proposed open-coding route, a human coder drafts corpus-specific codes by assigning `T001`, `T002`, etc. in first-encountered locator order to explicit topic phrases and retaining phrase/first pointer. Freeze that list before producing counts; clear literal matches do not need row-by-row owner review. Ambiguous matches go to adjudication; a new concept or mapping needs a new codebook revision. New or overlapping concepts are either multiple-coded under the frozen rule or sent to adjudication; do not change counts mid-pass. This route describes only this frozen corpus and cannot be presented as a reusable market taxonomy without review.

Output `recordCountByCode` and `recordRatioByCode` in frozen codebook order plus `includedRecordCount`, `unreadableCount`, `excludedCount`, `uncodedCount`, multi-code rule and exact evidence pointers. `recordRatioByCode` is present only when `includedRecordCount` is complete under the frozen inclusion rule and units/period/frame/codebook match; calculate `recordsWithCode / includedRecordCount`. Label it as a ratio within this frozen corpus. Counts overlap under multi-coding; show the overlap and do not force ratios to sum to 100%. Unknown external selection blocks population/customer prevalence, not this explicitly scoped corpus ratio. No trend without compatible repeated-period corpus frames.

Toy fixture: five synthetic located source records are frozen: A and B receive `T001 packaging`; C receives `T002 taste`; D receives both; E remains uncoded. Output counts `T001=3`, `T002=2` in codebook order, `includedRecordCount=5`, `uncodedCount=1`, `recordRatioByCode=3/5` and `2/5`, and an explicit overlap note. These ratios describe only the five-record fixture; they are not customer sentiment or population shares.

### I13 brands and competitors

Preserve each source-stated brand/competitor string and its locator. Resolve an entity only through a source-issued ID or human-approved alias map pinned to a revision. A peer comparison requires an owner-declared peer set; absent that, emit an unranked mention inventory. The exact canonical section title remains `Thương hiệu và đối thủ`.

For content comparison, freeze corpus, content-unit rule, channel, period, inclusion rule and codebook. Count located content units by the reviewed codebook only; a complete within-corpus `n/N` is allowed when those units and denominator are fixed, with excluded/unreadable/uncoded/multicode counts shown. Unknown external selection still forbids population/customer/market claims. Do not sum reposts or merge matching text without a real stable identity rule. An owner-approved alias or peer list may support membership but cannot create provider/product/listing identities. Message presence does not establish awareness, sentiment, persuasion, sales impact or superiority.

Toy fixture: two distinct located page spans mention “Brand Q,” with no stable brand ID and no peer declaration. Output two located mentions under the source string “Brand Q,” no unique-brand count, peer assignment, rank or market share.

## Readiness, authority and versioning

Required per run: exact source manifest and locators, corpus membership, inclusion/exclusion ledger, coding question, source-native unit, source attribution and provenance. Required only for the named claim: source-issued episode ID for a multi-record journey; owner-approved peer set for competitor membership; a complete compatible denominator for a within-corpus ratio; a population-relevant frame/person unit and approved uncertainty method for population inference. These missing inputs block the affected claim, not located-example inventories.

Sources: A40 `sections/I02.md`, `I04.md`-`I10.md`, `I13.md`, `common-rules.md`, and `authority-index.md`; the A40 plan’s evidence-family rules; the current report-section catalog for IDs/titles. The coordinator relayed D06-D07 recommendations from business session `01a0a8fd-02d2-7e71-ba4c-244930d054bd` on 2026-09-30: explicit source-bound context/action/attitude/reason/obstacle coding, no star/silence inference, corpus counts in codebook order, and owner-declared peer membership. The session response has no frozen file digest in this packet; its recommendations do not constitute owner approval. Pin exact source bytes and reviewed profile revision before any future implementation.
