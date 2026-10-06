# Three-case execution acceptance matrix

Pinned code baseline: `0116091fd5dc0902594f92d969dfb3ee0732c9c8`.
Owner request: one implementation for exact Shopee jelly and keyword thermos/fan,
separate Market/Insight web reports and PDFs. This is the pre-execution matrix;
`UNVERIFIED` is not failure, success or missing evidence. Do not copy old report
states into the new-build column, and do not change an expectation after a failure.

## Input sets and controls

- J: Thạch dừa, exact Shopee listing shop `78085196`, item `17678138164`.
  Original live audit run `dd336e59-fd03-4f15-b416-56904a04f62a` had no selected
  product. Later isolated native review proof retained 62 rows (20 readable),
  with one I04 and three I05 declarations, not full Insight completion.
  Later Metric preparation retained 223 rows; no membership labels were adopted.
  These are separate evidence versions, never fused by product name.
- T: Bình giữ nhiệt. Original live audit run
  `5e26b699-8d94-4a83-bce3-a0b6ba02fe8f` selected three product IDs. Saved
  Kalodata responses support descriptive measures, not whole-market totals or
  an attested annual measurement period. No matching accepted review corpus has
  yet been evidenced for this acceptance set.
- F: Quạt cầm tay. Original live audit run
  `34799cbb-8a4d-40b3-9b1e-e09e6dc2cd7b` selected three product IDs, with the same
  coverage limits as T. Do not reuse T's reviews or measurements for F.

Private input bytes, package/manifest digests, selected IDs and expected arithmetic
must be pinned in an outside-Git execution receipt before reruns. Existing report
PDFs are output evidence, not ingestion sources. The original benchmark and later
acceptance receipts live outside Git. Their existence does not replace input replay.
Synthetic fixtures remain under `tests/`; every new operation needs independent
literal expected results and at least one eligible positive case. The expectation
column below defines output kinds. The narrow M05/I04 synthetic contract is pinned
below; remaining positive expectations and the real acceptance set are still OPEN.

## Synthetic source-routing checkpoint, 2026-10-03

Input fixture: `tests/fixtures/research-three-case-contract.json`, revision
`three-case-owner-contract-v1`, SHA-256
`e1483d5fc26b622587e61b498082369c2f5317b6ab2d6f28f2689efdf3844d2d`.
Every value and review is synthetic, including responses for J's real listing ID.
The T/F Shopee IDs are synthetic. This is not provider collection, owner acceptance
or a benchmark of real content completeness.

| Case | M05 literal revenue | M05 literal units | Located I04 quote |
|---|---|---|---|
| J | 0, observed_zero | 7, observed_value | Tôi đã dùng thạch dừa |
| T | 2500.25, observed_value | 0, observed_zero | Tôi đã dùng bình giữ nhiệt |
| F | 900, observed_value | 12, observed_value | Tôi đã dùng quạt cầm tay |

The service-boundary test keeps all three original review sources in one database
before starting the runs. Each run selects its own provider object and an explicit
separate Shopee listing; these selections do not establish a physical-product join.
Independent literal windows cover the requested 365 days with 13 bounded queries.
Each case expects 26 located M05 observations and one DECLARED ACTION_REPORTED I04
record. Quoted text stays pending. Request-window coverage does not establish
annual measured coverage or additive totals; the test requires incomplete
partitions with no subtotal.

Linux verification uses Node 24.15.0 on an isolated scratch database and retained
artifacts. It checks both web reports and query-only replay of all six saved report
bytes without additional transport calls or database mutations. It does not test
PDF export, source-attachment/version APIs, M01/I14 synthesis or live execution.
The owning test is `tests/integration/research-automation-case-contract.test.ts`:
4/4 PASS (one parent and three case subtests), zero failures or skips. Backend
typecheck also passed on that isolated slice.
The original synthetic checkpoint did not establish real-data acceptance.

## Retained real-source replay, 2026-10-04

`REAL_PARTIAL` below means original source bytes replayed into current methods
in an isolated database, with no source calls or original data mutation. It does
not mean full analytical or owner acceptance. See
[scope/replay handoff](../handoffs/research-m02-source-scope.md).
T/F each retain 39 detail responses over 13 windows for 3 selected products plus
2 balance checks, yielding 78 M05 measures, 39 M06 records and 3 M09 date
statements. Both have no selected peers and no eligible unit-price arithmetic.
M02/M13 have offline web inspection at two viewport sizes. J's original scope
has no COLLECTION; the separate later review/Metric packages remain unjoined.

## Per-section expectations

Each of the J/T/F columns will record four independent axes: verified source,
executed method, useful output scope, review state. Missing sources must have a
specific next action; with sufficient admitted inputs, unexpected BLOCKED is a
failure. Dates UNKNOWN stay visible but never count as annual measured coverage.

| ID | Sufficient input / expected output | J | T | F | Next dependency |
|---|---|---|---|---|---|
| M01 | Exact admissible claims → cited summary draft; not owner-approved | UNVERIFIED | UNVERIFIED | UNVERIFIED | P5 claim boundary |
| M02 | Exact desired scope and observed source/membership account | UNVERIFIED | REAL_PARTIAL: source query scope/web | REAL_PARTIAL: source query scope/web | Actual measured coverage and full source membership |
| M03 | Compatible admitted Metric rows and labels → scoped totals; trend needs compatible periods | UNVERIFIED | UNVERIFIED | UNVERIFIED | P3 acceptance; eligible source |
| M04 | Full scoped result → structure/counts with exact denominator | UNVERIFIED | UNVERIFIED | UNVERIFIED | P3 acceptance; eligible source |
| M05 | Located measures → literal observations; sums only with additive/disjoint proof | Original scope missing collection | REAL_PARTIAL: 78 literal measures | REAL_PARTIAL: 78 literal measures | P2 source coverage; no annual sum inferred |
| M06 | Located objects/status → source inventory with coverage limits | Original scope missing collection | REAL_PARTIAL: 39 records, not unique products | REAL_PARTIAL: 39 records, not unique products | P2 source coverage |
| M07 | Explicit selected peers → compatible side-by-side observations | UNVERIFIED | Verified no selected peers; unranked only | Verified no selected peers; unranked only | Owner/run peer selection |
| M08 | Exact quote/variant/units → eligible arithmetic; absent cost stays absent | UNVERIFIED | 78 quote inventory records; all unit operations unavailable | 78 quote inventory records; all unit operations unavailable | Exact variant/pack/mass/price binding |
| M09 | Located dated events → attributed chronology, no causal claim | Original scope missing collection | REAL_PARTIAL: 3 launch statements | REAL_PARTIAL: 3 launch statements | P2 independent event content; not causal drivers |
| M10 | Exact series → adopted eligibility inventory, NOT forecast completion | UNVERIFIED | UNVERIFIED | UNVERIFIED | G bridge; advanced remains deferred |
| M11 | Verified support/counterclaims → hypothesis candidates, not ranked opportunity | UNVERIFIED | UNVERIFIED | UNVERIFIED | P5 |
| M12 | Actual constraints/options → action candidates, no automatic execution | UNVERIFIED | UNVERIFIED | UNVERIFIED | P5; missing owner inputs UNSET |
| M13 | All selected source/method identities → complete trace and exclusions | UNVERIFIED | REAL_PARTIAL: D source trace/web | REAL_PARTIAL: D source trace/web | Full source/method exclusions and membership |
| I01 | Provided question/brief → declared fields and explicit UNSET | UNVERIFIED | UNVERIFIED | UNVERIFIED | P4 brief adapter |
| I02 | Accepted source context spans → record-local context, no invented persona | UNVERIFIED | UNVERIFIED | UNVERIFIED | P4 admitted corpus |
| I03 | Frozen membership/codebook/dispositions → research-method account | UNVERIFIED | UNVERIFIED | UNVERIFIED | P4/P3.1a |
| I04 | Accepted action spans → attributed actual/intended/negated behavior | UNVERIFIED | UNVERIFIED | UNVERIFIED | P4 admitted corpus |
| I05 | Accepted targeted clauses → polarity/negation/mixed preserved | UNVERIFIED | UNVERIFIED | UNVERIFIED | P4 admitted corpus |
| I06 | Accepted same-record events and explicit relation → located sequence | UNVERIFIED | UNVERIFIED | UNVERIFIED | P4 relation coding |
| I07 | Accepted choice/reason relation → sourced selection reasons | UNVERIFIED | UNVERIFIED | UNVERIFIED | P4 relation coding |
| I08 | Accepted task/obstacle relation → sourced barriers | UNVERIFIED | UNVERIFIED | UNVERIFIED | P4 relation coding |
| I09 | Accepted desired/current state and gap relation → explicit gaps | UNVERIFIED | UNVERIFIED | UNVERIFIED | P4 relation coding |
| I10 | Frozen corpus + complete dispositions → deterministic n/N; otherwise partial counts | UNVERIFIED | UNVERIFIED | UNVERIFIED | P4 corpus coding/acceptance |
| I11 | Real group assignments/compatible units → adopted inventory, no inference | UNVERIFIED | UNVERIFIED | UNVERIFIED | G bridge; actual group evidence |
| I12 | Separate located presence/exposure/outcomes → separate inventories | UNVERIFIED | UNVERIFIED | UNVERIFIED | G bridge; actual evidence |
| I13 | Located literal mentions + alias/code policy → corpus counts, not market share | UNVERIFIED | UNVERIFIED | UNVERIFIED | P4 corpus coding/acceptance |
| I14 | Verified claims → cited opportunity-direction drafts/counterevidence | UNVERIFIED | UNVERIFIED | UNVERIFIED | P5 |
| I15 | Actual options/constraints + claims → strategy alternatives, not approval | UNVERIFIED | UNVERIFIED | UNVERIFIED | P5; missing owner inputs UNSET |
| I16 | Actual protocol/result or declared design → adopted gate/design only | UNVERIFIED | UNVERIFIED | UNVERIFIED | G bridge; no new experiment |
| I17 | Exact quote/span/code/claim references → resolvable evidence index | UNVERIFIED | UNVERIFIED | UNVERIFIED | P4/P3.1a/P6 |

## Checkpoint minimum, not a redefinition of 30-section completion

R1 requires **each** case to show an eligible quantitative Market output among
M03–M08, an accepted located Insight output among I04–I10, and M01/I14 summaries
referencing these exact results. Proposals alone fail this gate. T/F lack a pinned
positive Insight input today; this remains an open source task, not waived by
negative tests. J's unclassified ALL is not enough to claim classified M03/M04.

P0.3 is not complete until exact inputs and independent positive expected values
are frozen for all three cases. An eligible M05 literal value may satisfy the
quantitative checkpoint within its declared limits, but must not be presented as
full demand analysis. R2 still requires automatic supported source collection;
operator-attached exports are explicitly assisted operation.
