# Offline source compatible temporal M03 v1

Updated: 2026-10-02. Assigned checkout: research-automation-v1. Standard pure-method implementation lane. No activation, provider calls, source acquisition, legacy A32/recipe changes, registry, service, renderer or UI integration.

## Scope and authority

Implements section 3 and common boundaries of `Research_Method_Contracts_Temporal_Quote_Synthesis_Corpus_v1_2026-10-02.vi.md`, proposal version 1.0.0, exact SHA-256 `ec82948d923e4be231b5a63324855d6887d74b0ab994bb1fd6afa478635bb2f6`. Pinning that proposal does not manufacture an adoption receipt or live-source acceptance. Technical/business review disposition and activation remain coordinator work.

The canonical JSON Schema defines `source-compatible-temporal-v1`, version 1.0.0. Generated TypeScript is generated on Linux only. Public offline boundaries are `validateTemporalWindowInput`, `buildTemporalWindowMethod`, and `verifyTemporalWindowMethod`.

## Input boundary and defaults

Input is a normalized source-bound declaration, **not verified provider truth**. The caller must verify exact source package/artifact bytes, raw request/response hashes, locator/field pointer resolution, source identity/measure/semantics assertions, profile/mapping replay, upstream result integrity/readiness and snapshot disposition authority. Raw response/request digest declarations must reference registered SOURCE artifacts; a null raw request is allowed for non-request sources. If the original capture embeds the payload, the admission adapter must retain its exact payload bytes separately rather than invent a registered source artifact. JSON alone does not prove timezone, additivity, category membership, source authority or complete upstream contributions. Declaration refs cannot masquerade as source/verified-upstream semantic proof.

Frozen frame retains source-issued provider/country/platform/shop/listing IDs, exact-variant versus source listing-aggregate scope, UNKNOWN/conflicting identity, frozen membership, universe purpose, scope/labels revisions and source/declaration refs. Observations retain literal metric/mapping/definition/unit/currency/dimension and precision/state, raw request/response digests, requested/raw query windows separately from measured windows, retrieval time, actual boundary convention/mapping, named timezone or source calendar basis, explicit duration semantics, membership partitions and upstream scalar readiness/completeness/overlap declarations.

Inventory is the default: an empty `requests` array performs no temporal arithmetic. Derived series keys include source namespace, definition/mapping/measure/unit/currency/dimension, exact subject identities/variant scope and frozen frame revisions. Inventory order uses declared canonical interval then frozen identity order, with stable observation-ID ties; unmapped windows remain inventory, never infer a measurement interval from query or retrievedAt.

Requested operations select exact observation IDs. No entity totals are calculated here. A selected-set scalar with multiple subjects needs complete ready METHOD_RESULT proof, fixed subject membership and resolved entity overlap; missing members remain in the frame. Coverage exposes operation subjectMemberKeys separately from frozen frameMemberKeys: complete describes the subject only; entireFrameComplete additionally requires all frozen members. A valid single-listing subseries cannot imply whole-frame completeness. No post-hoc intersection, missing-to-zero or newest-wins repair occurs.

- SUM_DISJOINT_WINDOWS requires source-proven additive PERIOD_FLOW, same series/time basis, exact complete operands, disjoint mapped half-open intervals, and exact target start/end plus no gap. Calendar/year target meaning must already be declared/mapped; rolling365 is not a calendar year.
- ABSOLUTE_CHANGE requires the same compatible period-flow/frame gates, baseline then comparison, no overlap, equal explicit duration basis/value/unit. It returns signed exact comparison minus baseline.
- RELATIVE_CHANGE adds a strictly positive baseline gate and exact 100×delta/baseline. Baseline zero still permits absolute delta and complete observation coverage, but not growth.

Elapsed durations are checked against canonical instants in milliseconds. Source-calendar duration comparison only admits the pinned fixed `calendar-day` unit with explicit named basis and source/verified-upstream proof; month/quarter/year or other variable/unknown units remain inventory and gate change, even if both say “1 month”. Calendar days are never inferred by dividing hours. DST civil days can only compare using an explicit source-calendar declaration, not an implicit equal-hour/day rule. Unknown timezone/boundary/mapping/duration preserves inventory and gates relevant operations. Rolling, cumulative, stock and unknown meanings are inventory-only; no counter differencing or per-day normalization.

Same-series same-window revisions require an explicit source-bound disposition selecting one snapshot and naming all rejected revisions. Unresolved or unselected revisions gate calculation. Duplicate capture refs also gate calculation. Definition changes form separate series and cannot be joined by title.

BigInt reduced rational arithmetic preserves zero and signed deltas. Sum/change display uses the supplied upstream EXACT_DECIMAL or HALF_EVEN_2 policy only when consistently declared; UNKNOWN yields exact result with no invented display policy. Relative percent uses pinned two-decimal half-even. Exact source byte/semantic verification remains separate from hash validity and arithmetic.

## Bounds, evidence and handoff

AJV owns bounded canonical input/output contracts: 500 observations/members, 100 operations, 1000 sources, finite text/ref/decimal lengths, and 8 MiB serialized input/output. Canonical interval endpoints require explicit-offset ISO timestamps with at most millisecond precision; sub-millisecond canonical endpoints reject instead of Date.parse silently truncating them. Raw source timestamp strings remain literal inventory and may retain higher precision without being admitted as canonical intervals. No truncation or silent qualifier loss. Whole frozen input and full semantic output carry canonical SHA-256; replay rebuilds all metadata/calculations and never refetches or uses current clock/policy.

Changed paths: new temporal schema/generated contract, `src/modules/analysis/temporal-window-method.ts`, `tests/unit/temporal-window-method.test.ts`, this handoff, and generator registration. Generator registration also includes coordinator-requested foundation `shopee-exact-request` and `shopee-exact-collection`; their implementation remains root-owned.

Test-audit authoring gate: six tests at the actual method boundary use independent synthetic expected values and protect inventory-default behavior, arithmetic/zero/signed rounding, operation-specific gates, DST/duration semantics, snapshot/definition isolation, and corrupt lineage/full semantic replay. Legacy A32 tests cannot catch these new contract risks; no private/test-only seams or source greps were added. These are synthetic semantic tests, not acceptance of a real year, seasonality or actual Kalodata temporal basis.

No Windows generation/tests/typecheck/build were run. Coordinator Linux commands:

```sh
npm run contracts:generate
npm run typecheck
node --import tsx --test tests/unit/temporal-window-method.test.ts
git diff --check
```

Linux verification on the isolated Fedora checkout passed: contract generation,
repository typecheck and all six owning method tests, including the final
sub-millisecond rejection and raw-literal preservation cases. No Windows
execution or real-source/provider call was used for that proof.

The business session completed static review against the pinned proposal on
2026-10-02 and found no material business deviation within this offline scope.
It did not execute tests and did not certify source/locator truth. In particular,
consumers must inspect operation status/reasons, not treat coverage.complete as
permission to use a blocked result. See the versioned bounded disposition in
`docs/research/remediation-contract-review-v1.md`.

Exact-byte and upstream-result admission, source proof replay,
authority/activation and live integration remain out of scope. Offline method
output is neither complete M03 analysis nor external-market coverage.
