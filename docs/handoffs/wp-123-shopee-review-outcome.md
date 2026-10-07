# Handoff — WP-123 Shopee review outcome: classify, log, run-page + report notice

Updated: 2026-10-07
Worktree/branch: `wp/123-shopee-review-outcome`, based on `origin/main` 35cad2d. Built and verified on Linux (Claude Code cloud session).

Completed:
- **Pure outcome module** `exact-shopee-outcome.ts`:
  - `countReviewsPerListing(selected, pages)`: matches rows by `itemId`, and by `shopId` when the row has one, comparing as strings. Every requested listing appears once, with 0 when no row matches. Rows for listings that were not requested are ignored.
  - `classifyExactShopee(...)` applies the 4 rules in order. **Edge case (written in a code comment too):** 0 rows from a run that did not fail (`SUCCEEDED`, or a fixture) counts as `PROVIDER_BLOCKED`, because the reader still gets no reviews.
  - `exactShopeeOutcomeLimitation(...)` returns the extra limitation: `EXACT_SHOPEE_REVIEWS_BLOCKED` / `_TIMEOUT` / `_PARTIAL`, with the message `n/N sản phẩm có đánh giá.`
- **Collector:**
  - `Run.statusMessage` is read in `parseRun` through the exported `providerStatusMessage()`: trimmed, control characters replaced, at most 300 chars, `null` otherwise.
  - `CollectedPages.actorStatusMessage` is filled from the last polled run. The fixture collector leaves it undefined.
  - `saveExact` copies only `mode`, `actor`, `warnings` and `pages`, so the field never reaches the frozen packet (test below).
- **Step result:** `StepResultDocument.exactShopeeOutcome` is optional and persisted beside `exactShopee`, but only when a collection reference exists.
  - The validator accepts a valid shape and rejects a bad one: unknown outcome, bad date, message over 300 chars, 0 or more than 5 listings, a non-Shopee URL, a negative count, or the field without `exactShopee`.
  - Old documents without the field still load.
- **Bridge:**
  - Counts and outcome are computed on both the new and the reused path. On the reused path `providerMessage` is `null` and `reused` is `true`.
  - Returns `exactShopeeOutcome` and `outcomeLimitation`; the service appends the latter. The existing `limitation` is unchanged.
  - Writes exactly one JSON log line per collection: `info` when OK, `warn` otherwise. The catch branch logs `{ event, runId, outcome: 'ERROR', errorCode }`. No token, URL, review text or provider message is logged.
  - `collect()` takes an optional `now`; the service passes its own clock, so `attemptedAt` follows the service clock.
- **Run page:** the 3 plain-Vietnamese labels from the brief were added to `limitationLabels`.
- **Reports** (`reports.ts`), shown when the outcome is not OK **and** the report's collection still carries `exactShopee`:
  - One notice box after the headline in BOTH reports. It holds:
    - the date (dd/mm/yyyy, Vietnam time);
    - links to the products with 0 reviews;
    - "Phần bị ảnh hưởng": `REVIEW_DEPENDENT_SECTIONS`; the market report adds "(trong báo cáo insight)";
    - "Phần vẫn dùng được: doanh thu, giá, đối thủ, nhu cầu tìm kiếm."
  - In the insight report, I03 and I17 also start with a plain sentence. For example: `Lần thu ngày 02/10/2026 không lấy được đánh giá Shopee nào cho 5 sản phẩm đã chọn. …`
  - When the outcome is absent or OK, the HTML is byte-identical. Integration test: the OK run renders identically to the same input without the field.
- **Why each section is in `REVIEW_DEPENDENT_SECTIONS`** (`reports.ts`):
  - I02, I04, I05, I07, I08: `literalFamilies` plus `renderLocatedInsightSection` (literal reading of located review records, `located = input.nativeReview ?? input.locatedReview…`);
  - I06, I09, I10, I13 (and the five above): `codingFamilies` / `semanticCodingFamilies` (`usesCodingFamily`, `insightCodingView`) over the same review records;
  - I03, I17: `baseAppendix` reads `reviewCorpus`, `corpusTraceSection`, `nativeReviewContext` and `retainedReviewStatus`;
  - no MARKET section reads the review corpus.

Changed paths:
- `src/modules/analysis/research-automation/exact-shopee-outcome.ts` (new)
- `src/platform/collectors/apify-shopee.ts`
- `src/modules/analysis/research-automation/exact-shopee-bridge.ts`
- `src/modules/analysis/research-automation/model.ts` (one optional field and a type import)
- `src/modules/analysis/research-automation/service.ts`:
  - the exact-Shopee call (it passes `this.#now`), `#persistSourceResult` and the step validator, plus one import line;
  - review fix: `#reportCollection` and the Market report input in the report-render path.
- `src/modules/analysis/research-automation/reports.ts`
- `frontend/src/research-automation/run-status.ts`
- `tests/unit/research-automation-exact-shopee-outcome.test.ts` (new, 8 tests)
- `tests/integration/research-automation-exact-reviews.test.ts`: one new test with 4 subtests, plus an optional `onRender` hook on the local `fixture()` helper. Existing cases are unchanged.
- `docs/handoffs/wp-123-shopee-review-outcome.md` (this file)

Evidence (commands, results, relevant revision):
- `npm test` before (35cad2d, Linux): tests 1041, pass 1033, fail 3, skipped 5.
  - The 3 failures are the Task045 runtime smoke tests in `tests/integration/operator-app-journey.test.ts`. They fail with `production frontend/dist is required; build it before running this smoke test`, which is an environment precondition and not this change.
- `npm test` after: tests 1054, pass 1046, fail 3 (the same 3 Task045 tests), skipped 5. The 13 new tests all pass.
- `node --import tsx --test tests/unit/research-automation-exact-shopee-outcome.test.ts` → 8/8 pass.
- `node --import tsx --test tests/integration/research-automation-exact-reviews.test.ts` → 15/15 top-level pass: the 14 existing ones plus the new one with 4 subtests.
- `npm run typecheck` → exit 0.
- `npm run frontend:typecheck` → exit 0.
- `npm run frontend:test` → 248/248 pass.
- `git diff --check origin/main...HEAD` → clean.
- Commits: see `git log --oneline origin/main..HEAD` on the branch.

Unresolved:
- **Brief deviation 1: packet sha256 test.** The brief asks for an identical packet sha256 with and without `actorStatusMessage`. Two separate saves can never give the same sha256, because each fresh save mints a random `collectionId` and a wall-clock `createdAt`. That is pre-existing behaviour in `shopee-collection-service.ts`, outside Owned paths. The test proves the intent three ways instead:
  - the packets are deep-equal apart from those two fields;
  - replaying the same pages without the message into the same store returns the same sha256;
  - no stored artifact contains the message text.
- **Brief deviation 2: forbidden words in the report body.** The brief asks that the report body contain none of `Metric`, `PROVIDER_`, … . Pre-existing report copy already does, for example the M02/M03 text "gói Metric" and the method code `NO_AI_OR_PROVIDER_CALL_WAS_MADE`. That copy is outside this WP. The test therefore proves:
  - the added notice and review sentences contain none of the forbidden words or codes;
  - with the added markup removed, the page is byte-identical to the render without the field.
  Cleaning the older copy is a separate decision.
- **Run-page label test:** `frontend/tests` has no existing run-status label test, so none was added there, per the brief. The unit test reads the label map from `run-status.ts` as text, because importing the frontend module breaks the server typecheck (`node16` resolution).
- **Replaced or skipped review source (fixed after owner review, 2026-10-07):**
  - The first version hid the notice only in the Insight report. The Market report reads the full collection step, so after a revision that skips or replaces the exact review source it still showed the old notice.
  - Now `#reportCollection` also drops `exactShopeeOutcome`.
  - The Market report gets the collection without `exactShopeeOutcome` whenever the review collection no longer carries `exactShopee`.
  - The integration test makes a SKIP revision and checks that both reports of the new pair have no notice, while the original pair keeps it.
  - The run-page blocker stays, because it records what the collection step did. The pre-existing `EXACT_SHOPEE_ACTOR_FAILED` blocker behaves the same way.
- **Skills:** the `test-audit` skill and its `TDN-GROWTH-OS.md` note are not in this repo or this environment. `humanizer-vi` is not installed either. The Vietnamese strings follow the brief's wording and stay short.

Next action: The coordinator reviews, then the owner decides on a PR. Merge needs owner approval. WP-125-A2 (wire the citation registry into `reports.ts`) can start after this lands.
Business decisions pending: whether to clean pre-existing provider names and method codes from the report body (see Unresolved).
