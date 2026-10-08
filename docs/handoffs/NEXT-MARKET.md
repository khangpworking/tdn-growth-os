# Handoff — NEXT-MARKET bounded reader slice

Updated: 2026-10-08
Worktree/branch: `ultimate-impl-sync1-codex` / `khangpworking/ultimate-next-market`
Assigned base: `998549072ae62b9d619ffbf645ba59b22a920d4e`

Completed: opt-in owner reader request `reader-report-build-v1.2` → input `1.4.0` → builder `reader-report-market-v4`, with evidence-backed unordered M01 findings, retained-spec M08 unit comparisons, truthful missing advertising references and shared U13 publication lint. Older requests still build input `1.3.0` / builder v3; stored reads and exact retries do not regenerate anything.

Changed paths:

- `contracts/analysis/reader-report-input.{schema.json,generated.ts}` and `contracts/api/research-automation-reader-report-api.{schema.json,generated.ts}`.
- `src/modules/analysis/report-visible-text-lint.ts`.
- Reader `build.ts`, `default-peers.ts`, `lint.ts`, `market-template.ts`, `market-template-v2.ts`, new `market-findings.ts` and `market-unit-prices.ts`.
- Explicitly allocated `research-automation/reader-report-revisions.ts` owner build/retention hook.
- New `tests/unit/next-market-reader.test.ts`, `report-visible-text-lint.test.ts`, `tests/helpers/market-unit-price-fixture.ts`, `tests/fixtures/next-market-legacy-reader-hashes.json`; additive owner-service test in `tests/integration/research-reader-report.test.ts`.
- This handoff. Shared status, plan, methodology, source/filter modules, Insight modules, `reports.ts`, `service.ts`, manifests and migrations were not edited.

## Behavior and boundaries

M01 uses six fixed descriptive topics, not an importance or revenue ranking. Each supported finding has Nhận định/Bằng chứng/Trạng thái, real exhibit pointers, product/group/period scope and per-platform operands. Missing operands remove quantitative claims. Missing workbook lineage removes all findings; fewer than four supported findings gets an explicit partial statement. Counts of absent source fields remain genuine inventory observations, not fabricated zero measurements. All pending classified numbers in findings and downstream tables have the draft label in their sentence.

M08 keeps sales average (revenue ÷ sold units) separate from listing/payment/conditional-promotion prices. A new `market-unit-prices-v1` packet carries source hashes, JSON locators and listing/variant-bound observations. The owning reader resolves actual retained artifacts; the projection verifies digest, locator, complete observation equality and workbook listing/platform binding before using a number. Missing/tampered evidence, altered variant/value, duplicate observation and mismatched owner override fail before a report revision is written. Exact optional owner quantity declarations may change only quantity, with the same retained identity, category, price and period; there is no new mandatory owner approval prerequisite.

Standards are 100g net or separately sourced drained mass, 100ml, the same count kind, durable item within the same verified spec group, and an unsplit combo. Durable/combo quantity must be one. Sorting requires the same platform, category, unit/basis, price kind, conditions and period. Missing price/quantity stays listed and is excluded from sorting; observed zero price remains zero. Listings without any verified price/spec observation remain listed as unclear. No quantity is inferred from a title, and new input1.4 does not calculate the historical title-size benchmark. Display rounding is stated; sorting uses the unrounded result. Price observation periods are shown separately from the sales period.

Supported evidence here is **retained operator-supplied JSON spec observations**, verified against their actual bytes. This is declaration verification, not provider/seller authentication. Native HTML/spec extraction, automatic source collection and a frontend packet-upload control are outside this slice. No operator-facing intake route for these standalone spec/declaration blobs is implemented or verified here: existing `SupplementalSourcePanel` → `prepareSupplementalSource` accepts only preflighted QUOTE/BOUNDED method descriptors, not this new reader packet. The positive service test seeds exact artifacts with direct `store.put`; it proves the owner reader consumption/verification boundary, not upload closure. The new owner API is an opt-in path; existing frontend requests retain their old version. No native source capability or live acceptance is claimed.

U33 remains partial: current retained sales/video inputs have no confirmed ROAS/CPA field provenance. The reader explicitly states that absence and the required E1 disclaimer. It neither derives advertising references from spend/sales nor exposes adSpend/adShare.

U13 has no method dependencies. `lintVisibleReportText(html)` returns `VisibleTextLintResult[]` with U13_SUPERLATIVE, U13_PRIORITY and U13_PENDING_NUMBER. Callers mark pending classified measurements `data-classified="pending"`; a table row is one statement, and labels cannot be borrowed from the following sentence. Quotes and headings/title text are exempt from wording checks, not from pending-number checks. Generated claims are never marked as quotes. Exact technical identity phrases and numeric lower bounds are not product superlatives; product uniqueness/superiority still fails. Priority sequences can span paragraphs within a section and require an explicit dependency note. The new owner publication invokes this gate explicitly before artifact writes; older publication results are unchanged.

Independent shared-lint commits handed to Insight: `718ede5d12000bed358fb5693856469ca84c9f1c`, `b4d84c36359836f33e388e343fdbe09bab3032e9`, `319a28edc9836a7f5505940a29380f1f5f556213`. Market auto-report U29/U34/U13 hooks are a coordinator-confirmed **serial follow-up after Insight releases its report phase**, with auto v16 reserved. This PR does not implement or claim those hooks; Insight owns its invocation/markup.

Vietnamese interpretations used humanizer-vi revision `576c80fb445a8b2e9ec1993a6490ab6529b89d12`, with pinned SKILL.md, preservation rules and academic register read. Facts, scoped numbers, uncertainty, source titles, conditions and exact E1 disclaimer remain intact. No application prompt integration or historical interpretation rewrite occurred.

## Evidence

Node 24.15.0 / npm 11.12.1; synthetic fixtures and fake/trusted row adapters only. All tests used concurrency 2.

| Check | Result |
|---|---|
| Shared lint focused test | 2/2 PASS, including nested quotes, decoded wording, same-sentence/table-row labels, dependency ordering, lower bounds and identity-label exceptions. |
| New reader + lint + owner-service affected tests | Final 17/17 PASS, including all lint corrections, plain owner errors, source-title rendering and generated-claim rejection. |
| Existing reader/peer/build/kit regressions | 35/35 PASS, including exact old1.0/1.1 HTML/metric hashes and existing gates. Combined affected run: 52/52 PASS; final changed files rechecked in the 17-test run above. |
| Independent old1.2/1.3 replay | Four complete/nullable cases: exact HTML and metric hashes captured from assigned-base source, all PASS on new source. |
| Backend typecheck | PASS. |
| Canonical generation | PASS under explicit global leases; final `npm run contracts:generate && git diff --exit-code contracts/` exit 0 against staged intended changes, only four allocated contract paths. Strict AJV old/new API validation PASS. |
| Diff checks | Working/staged checks clean; final committed assigned-base range checked before push. |
| Full suite | No local full suite run or claimed; mandatory exact-head hosted `npm run check` remains coordinator gate. |

New owner-service evidence covers artifact resolution, source binding, v4 build identity, retained input/metrics/lint, immutable new and old readback, exact retries without duplicate revisions, wrong-variant rejection and absent-source rejection. Existing assertions were not weakened or removed. A new test initially expected the older revision to remain pending after a newer build; it was corrected to assert the actual `SUPERSEDED` state while preserving exact bytes. No existing test expectation changed.

Canonical leases were explicitly requested and released after each bounded phase, including API generated-type and peer-gate corrections. No source/generator edit occurred while another worker held the writer lease. Final deterministic verification had its own explicit grant and durable release.

## Checklist evidence

| ID | State | Evidence / limit |
|---|---|---|
| U-29 | DONE (new reader slice); auto follow-up pending | Six fixed evidence-backed topics, unordered list, scopes/exhibits/states; unsupported claims dropped, honest insufficient-evidence output; actual owner API/retention flow. |
| U-34 | PARTIAL overall; retained JSON-spec reader calculation/consumption DONE | All five category standards; exact retained-byte/locator/variant/quantity/price binding, compatibility partition/sort, missing/zero and title-guessing negatives, exact owner quantity override. Operator source-blob intake is not closed; native/auto integration remains pending. |
| U-33 | PARTIAL / source dependent | Truthful absent ROAS/CPA, E1 disclaimer, no derivation or adSpend/adShare disclosure; no confirmed retained fields invented. |
| U-13 | DONE (shared contract + new Market reader); auto/Insight integration owned separately | New publication gate, pending-number coverage tests, quote/title and wording checks; isolated dependency commits sent to coordinator. |
| U-11, U-26, U-32 | ESCALATED, unchanged | No κ release claims, new collection/admission policy or positive cross-platform totals. |
| U-40 | N/A / unauthorized | No paid/live staging execution. |
| B IDs | N/A | No source-board/frontend items assigned. |
| G-01 | DONE | Assigned IDs and partial/serial remainders recorded here. |
| G-02 | PARTIAL (hosted gate) | Affected checks and backend typecheck pass; full exact-head hosted check pending, no baseline waiver. |
| G-03 | N/A | No frontend edits. |
| G-04 | DONE | Canonical/generator phases under leases; final staged deterministic regeneration proof exit0, strict AJV validation and generated contracts compile. |
| G-05 | DONE | Owned paths and granted reader API/revisions hooks only; clean working/staged and final committed assigned-base diff checks. |
| G-06 | DONE | Synthetic fixtures only; no secrets, commercial/runtime data or machine paths in artifacts. |
| G-07 | DONE | No application model/provider/collector calls. |
| G-08 | DONE | Neutral Vietnamese, source literals/quotes retained, technical provenance stays in attributes/artifact identity, no provider names introduced in visible copy. |
| G-09 | DONE | Missing never substituted by zero, unavailable claims dropped; no fake source, approval or COMPLETE/release status. |
| G-10 | DONE | Old1.0–1.3 exact replay plus owner-service old/new immutable readback/retry. |
| G-11 | DONE | Additive tests only; no old assertion deleted/skipped/weakened. |
| G-12 | DONE | This handoff uses required fields and checklist evidence. |
| G-13 | N/A | No keyword collection added; source/filter integration remains its owner's work. |

Unresolved: confirmed advertising-field provenance; operator intake for standalone spec/declaration artifacts and native spec extraction/frontend input affordance; serial Market auto hooks and separately owned Insight lint integration; full hosted CI and independent exact-head review.
Business decisions pending: U11 family-level multi-code κ, U26 policy and U32 positive aggregate reconciliation remain escalated; no new business rule was chosen here.
Next action: deliver draft PR and exact SHA; coordinator performs independent review, exact-head hosted checks and any normal merge. Worker never merges/deploys.
