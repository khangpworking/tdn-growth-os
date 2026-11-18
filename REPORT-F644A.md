# REPORT-F644A — Section 1: product selection (top N / all)

Worktree: `~/lanes/shopee-step1-1711/fedora`, branch `feat/shopee-product-selection` (from origin/main).
Scope: section 1 only. Delete-run and `tools/shopee-desktop` untouched. No push, no PR, no deploy,
no live lane/service/collector/run-directory touched, no real Shopee/Jev/Metric/provider call.

## Files changed

### Production code

| File | Change |
|---|---|
| `skills/tdn-shopee-flow/scripts/shopee_flow.py` | `flow_import_payload` accepts and validates optional `productSelection` (`top` N 1–100 / `all`, nothing else); `flow_m1_import` writes it into `request.json`; gate m2 v2 emits `requested_distinct_products` (detail `{requested, found}`) from `verify-selection` proof. |
| `scripts/module-product-pick.ts` | New `ProductSelection` type and `selectionLimit` / `selectionRequested` / `linksToCheckCount`; `deriveJevProductPick`, `pickProductsWithJev`, `replayJevProductPick` take the selection; new `pickAllShopeeProducts` (all mode: source revenue order, no Jev, no duplicate filtering, dead links rejected and not replaced); proof records `productSelection`, `FEWER_PRODUCTS_THAN_REQUESTED` + `shortageDetail`; `all` proof has no `matcher`/`decisions`. |
| `scripts/module-pick.ts` | Reads `request.productSelection`; computes the shared deadline from `linkCheckBudgetMs(linksToCheckCount(...))`; `all` mode skips the Jev client entirely and calls `pickAllShopeeProducts`. |
| `scripts/module-link-check.ts` | New `linkCheckBudgetMs`: `max(10 min, links × 15 s)` capped at 30 min; `LINK_CHECK_BUDGET_MS` kept as the 10-minute base. |
| `scripts/module-metric-output.ts` | `verifyModuleSelection` replays with the saved `productSelection`, rejects a proof value that differs from `request.json` (`PICK_PROOF_MISMATCH`), returns `requested` / `requestedDistinct` / `shortageDetail`; gate want = N (top) or 1 (all). |
| `skills/tdn-shopee-flow/modules.json` | m2 gate checks: `links_match_source_order`, `requested_distinct_products`. |

### Schemas

| File | Change |
|---|---|
| `skills/tdn-shopee-flow/chuan/request-v2.schema.json` | Optional `productSelection` (`anyOf` top `{mode,count}` / all `{mode}`), closed objects. |
| `skills/tdn-shopee-flow/chuan/selection-v1.schema.json` | `links` up to 100; rank/duplicateOfRank/distinctCount up to 100; `shortageDetail`; `FEWER_PRODUCTS_THAN_REQUESTED`; `productSelection` in the proof; decisions allow `SP1`..`SP99`; v2 conditional requires `matcher`/`decisions` only when mode is not `all`. |
| `skills/tdn-shopee-flow/chuan/module-outputs-v1.schema.json` | m2 optional `requested`, `requestedDistinct`, `shortageDetail`; selectedCount/links/rank limits up to 100; `fiveDistinct` kept (wire compatibility), computed truthfully. |
| `skills/tdn-shopee-flow/chuan/review-stats-v1.schema.json` | links up to 100. |
| `contracts/foundation/shopee-review-sampling.schema.json` | The three `links` arrays (plan, attempt, root plan) up to 100; `stars`/`targets`/`groups` untouched. |
| `contracts/foundation/shopee-module-review-data.schema.json` | Legacy source `links` up to 100. |

### Docs

- `skills/tdn-shopee-flow/SKILL.md`, `skills/tdn-shopee-m1-metric/SKILL.md`: `m1-import` payload field described.
- `skills/tdn-shopee-flow/chuan/selection-v1.md`: v2 sequence, proof fields (`productSelection`, `shortageDetail`), replay and gate want.
- `skills/tdn-shopee-m2-chon/SKILL.md`, `skills/tdn-shopee-m3-binh-luan/SKILL.md`, `skills/tdn-shopee-4-buoc/SKILL.md`: N / all wording instead of exactly 5.

### Tests

- `tests/unit/module-pick.test.ts`: N=1 (0 questions, 1 check), N=8 (7 questions, 8 checks, PASS), N=8 with 5 rows → `FEWER_PRODUCTS_THAN_REQUESTED {requested:8,found:5}`, all-mode dead link (not replaced, no Jev, no matcher/decisions, skip recorded), all-mode duplicate names not deduped, all-rejected → `{requested:1,found:0}`, budget table.
- `tests/unit/module-product-pick.test.ts`: selection pass-through, top shortage codes.
- `tests/unit/module-metric-output.test.ts`: top-8 replay + real Python gate m2 (`requested_distinct_products`, `{requested:8,found:8}`), all-mode replay with 9 links, explicit top shortages, tampered `productSelection` → `PICK_PROOF_MISMATCH`, gate check names.
- `tests/unit/module-run-fixture.ts`: optional `productSelection` in request bytes.
- `tests/integration/shopee-desktop-ui.test.ts`: docs card shows the new gate check names.
- `skills/tdn-shopee-flow/tests/test_m1_import.py`: top 1 / top 8 / all written to request; changed selection → `IMPORT_ID_CONFLICT`; 9 invalid shapes → `IMPORT_INPUT_INVALID` with no run folder; absent key still produces the exact old request.
- `skills/tdn-shopee-flow/tests/test_flow.py`: fake `verify-selection` returns the new fields.

## Behaviour

- `productSelection` is optional. Absent = top 5, byte-identical old behaviour: no proof field, top-5 walk with Jev dedupe, legacy shortage codes (`PICK_PRODUCT_UNRESOLVED`, `FEWER_THAN_FIVE_DISTINCT_PRODUCTS`), gate want 5.
- `{"mode":"top","count":N}`: today's Jev walk + duplicate filtering + link check, stopping at N accepted links. Candidates exhausted → `FEWER_PRODUCTS_THAN_REQUESTED` with `{requested:N, found:k}`.
- `{"mode":"all"}`: no Jev call, no duplicate filtering. Every Shopee product from the M1 revenue order, capped at 100, link-checked. A dead link (`PRODUCT_UNAVAILABLE`, `RATINGS_MISSING`, `NO_TARGET_STAR_REVIEWS`) is rejected and not replaced. Session/other link-check failures stop M2 as today. PASS needs ≥1 accepted.
- Selection proof records the selection; `verify-selection` replays from the saved log and partial responses, never calling the collector or Jev. A saved proof whose `productSelection` differs from `request.json` fails with `PICK_PROOF_MISMATCH`.
- Gate m2 uses `requested_distinct_products` (want = N, or 1 for all). Old runs keep their stored check name; the app/readers accept both.
- Link-check budget is one shared deadline: `max(10 min, links × 15 s)`, capped at 30 min.
- M3, step 4, `outputs` and `linkIssues` accept 1–100 links (array caps raised; no per-link logic changed).

## Every 5 assumption changed

| Site | Before | Now |
|---|---|---|
| `shopee_flow.py` payload validation | closed key set without selection | allows `productSelection`, validated (top 1–100 / all) |
| `flow_m1_import` request | never wrote a selection | writes it when present |
| `shopee_flow.py` gate m2 (v2) | `links_match_source_order` + implicit 5 | `requested_distinct_products` with `want` = N / 1 |
| `modules.json` m2 checks | `five_distinct_products` | `requested_distinct_products` |
| `module-product-pick.ts` walk stop | `links.length === 5` (v2) | stop at `selectionLimit` (N or 100) |
| v2 shortage reason | always the legacy pair | `FEWER_PRODUCTS_THAN_REQUESTED` + detail only when a selection is declared; legacy pair when absent |
| v2 proof | always `matcher`/`decisions` | omitted for `all` |
| `module-pick.ts` Jev construction | always before the walk | not built for `all` |
| `module-pick.ts` deadline | fixed `LINK_CHECK_BUDGET_MS` | `linkCheckBudgetMs(linksToCheckCount(...))` |
| `module-metric-output.ts` replay | 5 links, no selection | selection-aware replay, request/proof cross-check |
| gate output `fiveDistinct` | literal 5 meaning | still emitted (schema/wire), now means "links ≥ requested" |
| selection schema `links` cap | 5 | 100 |
| outputs schema `links`/`selectedCount`/rank caps | 5 | 100 |
| review-stats `links` cap | 5 | 100 |
| review-sampling `links` (3 arrays) | 5 | 100 |
| module-review-data legacy source `links` | 5 | 100 |
| m2/m3/step-4/file-format docs | exactly 5 | N / all, 1–100 |

Deliberately unchanged (legacy-only paths): Python `links_1_to_5` branch of gate m2, `autorun-pick-v3` picker (`derivePeriodProductPick`, still 5 with its own shortage codes), `src/modules/foundation/shopee-module-review-data.ts:121` `journals.length > 5`. `tools/shopee-desktop` untouched (app coder).

## Worst-case M2 time for N=100

100 link checks × 15 s per link = 1500 s = **25 minutes**, below the 30-minute cap. Top 100 on a 100-row package asks at most 99 Jev questions (each up to 3 sends) plus the same 100 link checks, so the link-check deadline is the binding limit.

## Test commands and counts

```
node scripts/typecheck.mjs
  clean (no output)

node --import tsx --test tests/unit/module-pick.test.ts \
  tests/unit/module-product-pick.test.ts tests/unit/module-metric-output.test.ts \
  tests/integration/shopee-desktop-ui.test.ts
  145 tests, 145 pass, 0 fail

python3 -m unittest discover -s skills/tdn-shopee-flow/tests -p 'test_*.py'
  Ran 162 tests, OK (4 skipped)
```

Additionally run earlier in this task with the same tree: `tests/unit/metric-v3-capture.test.ts` (29 pass), and the Python suite after each Python edit.

## Round-1 fix (review `review-505-r1.md`)

All four findings fixed; nothing else in section 1 changed. No push, no PR, no deploy.

| # | Finding | Fix |
|---|---|---|
| 1 | `contracts/foundation/shopee-module-review-data.schema.json:817` aggregate row limit 10,000 blocks a valid 100-link export. | `maxItems` raised to **200,000** = 100 links × the policy's per-link maximum (`totalPerLink` max 2000 in `contracts/foundation/shopee-review-sampling.schema.json`). Regenerated the foundation TS types (`node scripts/generate-foundation-contract.mjs`); this also caught up the stale F644 `links` caps in `shopee-module-review-data.generated.ts` / `shopee-review-sampling.generated.ts`. New test: 34 links × 300 rows = 10,200 rows exports as JSON. |
| 2 | `scripts/module-metric-output.ts:247` all-mode rejections reported a later accepted link as `replacedBy`. | `m2LinkIssues` takes the request's `productSelection`; in `all` mode `replacedBy` is always `null`. Top/absent mode keeps today's replacement. New test: all mode with a dead middle link followed by an accepted one → `replacedBy: null`, 2 links kept. |
| 3 | `skills/tdn-shopee-flow/scripts/shopee_flow.py:878` requests without `productSelection` (old runs, legacy policies) switched to `requested_distinct_products`. | Gate m2 v2 keys off the **presence** of `productSelection` in `request.json`: absent → historical `five_distinct_products` with its original shape (`got = shortageReason`, `'UNVERIFIED'` on failure); present → `requested_distinct_products` with `{requested, found}`. Readers already take any `id`/`ok` check, and `verify-selection` still returns both `fiveDistinct` and `requestedDistinct`. Updated the real-gate test for a request without the field to assert `five_distinct_products`. |
| 4 | `skills/tdn-shopee-flow/scripts/shopee_flow.py:2707` explicit `"productSelection": null` was treated as absent. | Payload validation now tests `'productSelection' in payload`, so `null` is not a dict and fails `IMPORT_INPUT_INVALID`. Added `('explicit null', None, …)` to the invalid-input cases. |

Checks after the fix:

```
node scripts/typecheck.mjs
  clean (no output)

node --import tsx --test tests/unit/module-pick.test.ts \
  tests/unit/module-product-pick.test.ts tests/unit/module-metric-output.test.ts \
  tests/integration/shopee-desktop-ui.test.ts
  146 tests, 146 pass, 0 fail (was 145; +1 all-mode linkIssues row)

node --import tsx --test tests/integration/shopee-module-review-export.test.ts
  7 tests, 7 pass, 0 fail (+1 multi-link >10,000-row row)

python3 -m unittest discover -s skills/tdn-shopee-flow/tests -p 'test_*.py'
  Ran 162 tests, OK (4 skipped)
```
