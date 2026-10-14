# PRESFIX-209 handoff

Base: `wp/presfix-209` at `31fec758` (= the deployed `origin/main` used by the failing runs). All app state
on the operator host was read-only; evidence copies stay on that host and are not part of the repository.

## Result

| Item | Finding | Action |
|---|---|---|
| (a) thạch dừa presentation `9e76bb31…` failed | Real bug: the review-shortfall notice printed the retained Shopee listing URL as visible link text, which fails Market machine rule 3. | Fixed in `reports.ts` (`reviewOutcomeNotice`). |
| (b) 5/14 machine rules for every presented report | Not a report defect. The coordinator audited the run's generated **draft**, not the presented revision. | No rule was "fixed"; the rules that already passed were left alone. |
| (c) bình giữ nhiệt `e67156b7…` confirm failed integrity | Correct-by-design rejection: the capture descriptor is bound to `{runId, start}` at prepare time, so another run's package can never be admitted. | Documented; no code change. Procedure below. |

## (a) Rule 3 failed on the review-shortfall notice

`assertMarket14MachineRules` reports every failed machine rule; the production log shows exactly one:

```
{"event":"research_automation_report_failed","runId":"9e76bb31-4dd0-4999-8ef0-268838340a02","stage":"RENDER","errorName":"TypeError","errorMessage":"MARKET_14_RULES_FAILED:3"}
```

Cause chain:

- `research-automation/reports.ts:257` `reviewOutcomeNotice` rendered
  `<a href="…shopee.vn/product/<shopId>/<itemId>">…/product/<shopId>/<itemId></a>` — the URL as *link text*.
- `market-14-rules.ts:63` `technicalLeaks` includes `/\/[a-z_]+\/\d+\b/gu`, which matches `/product/<shopId>`.
- The presentation gate at `reports.ts:1010` (`if (marketPresentation) { … assertMarket14MachineRules(…) }`) therefore threw.
- The notice exists only for a non-OK exact-Shopee outcome bound to the report's collection (`reports.ts:242-245`).
  Run `9e76bb31` collected 5/5 listings at 1 review each (`PARTIAL_LISTINGS`, operator log line 44), so
  every one of the five listings hit the notice.

Why the other two runs passed the same gate: `9dec9d6e` (canxi) confirmed with `exactShopeeUrls: []`
(`cx-shopee-urls.json` = `[]`), and `c6fc7e2c`'s collection outcome is `OK` (operator log line 29) — neither
renders the notice. Their presentation revisions are COMMITTED (`cx-pres.out.json`, `bgn3-pres.out.json`),
so rules 1, 2, 5, 7, 9, 11, 13 already pass for capture-backed presentations.

### Fix

`reports.ts:262-263`: the URL stays in the link target; the reader sees the report's own ordinal label
(`Sản phẩm #n`, the same convention `readerProductLabel` uses):

```html
<li><a href="https://shopee.vn/product/<shopId>/<itemId>" rel="noopener noreferrer">Sản phẩm #1</a> — Sản phẩm này chỉ lấy được 0/300 bình luận.</li>
```

The audit was left alone on purpose: the codebase's own reader-safety rule refuses this URL as reader text.
`readerSafe` (`descriptive-report.ts:24`) delegates to `readerTextSafe` in `reader-plain-text.ts`, whose
`READER_POINTER = /\/[a-z_]+\/\d+(?:\b|\/)/i` (`:39`) matches `/product/1` and makes
`readerSafe('https://shopee.vn/product/1/2')` false — so the renderer was the inconsistent side. Whitelisting
external URLs in `technicalLeaks` would weaken rule 3 for every report.

### Proof

- Failing before: new integration case run against the unmodified notice reproduces the production error —
  `MARKET_14_RULES_FAILED:3`, attempt `FAILED`.
- Passing after: the same case passes, with `machineRuleFailures(html) === []`.
- `tests/integration/research-automation-exact-reviews.test.ts:740` now also asserts the notice text carries
  no locator (`/product/\d`, `http(s):`, `shopee.vn`) while the `href`s stay unchanged.

## (b) The audited HTML was the generated draft

The audit inputs were fetched without a presentation pair:

- `curl .../runs/<run>/reports/market -o td2-pres.html` (no `pairId`).
- `ResearchAutomationService.#readVerifiedReport` (`service.ts:2341-2356`): with `pairId` undefined,
  `selectedPair`/`attempt` are undefined and `output = this.#output(runId, kind)` — the run's draft version.
- `reports.ts:1010` applies the 14-rule gate only when `marketPresentation` is set, i.e. only on a
  presentation attempt. A generated draft is not gated and is not a valid audit target: RULES14-209 added the
  glossary, `Phần`/`PL.x` labels, standalone `Chú thích:` note, `n = …` sample framing, three M12 proposal rows,
  platform icons/charts and all four source labels to the **presentation** body only.

Evidence that the audited bytes were drafts:

| File | md5 |
|---|---|
| `td2-pres.html` == `td2-draft.html` | `b1121aea6f0eebd30b1fcd83b17f38f8` |
| `cx-pres.html` == `cx-draft.html` | `fb75119c78d9b5dc52efdc2f846d2ec3` |
| `bgn3-pres.html` == `market-31a1129f…html` | `1474ccd96915c1b8ec1cba12699c9ec6` |

Auditing the real thạch dừa draft with this worktree's `auditMarket14` reproduces the coordinator's table
(8 machine failures, 4 machine passes + their manual rule-10 pass = 5/14): rules 1, 2, 3, 5, 7, 9, 11, 13 FAIL;
4, 12 PASS; 10 needs an asset/licence trace (READ). The same report presented fails rule 3 only.

Correct fetch for a presented revision:

```
GET /api/workspaces/<ws>/research-automation/runs/<run>/report-versions/<pairId>/reports/market
```

(`research-automation-api.ts:407` `versionReport`, `:670` `readReport(..., versionReport?.[1])`; list pairs with
`GET .../runs/<run>/report-versions`). A presentation attempt that failed has no pair — read the attempt state
(`GET .../runs/<run>/report-attempts/<attemptId>`) instead of the run's draft.

## (c) Reusing another run's capture package is rejected by design

The new bình giữ nhiệt run `e67156b7…` was confirmed with `sources.metric = { decision: 'USE_PREPARED',
packageId: '6ccaab48-220e-4b32-bfbd-f2707bc8c2b8' }` — the package prepared under the earlier bình run
`dbc91658…` (`codex.log:689`, `bgn-new-confirm.out.json` → HTTP 500 `integrity_error`; operator log line 48 →
`MetricMethodFailure: Metric capture descriptor is not bound to this confirmed run.`).

Code path:

- `metric-capture-intake.ts` prepare writes `runBindingSha256 = sha256(canonical({ runId, start }))` into the
  descriptor and stores it under `packageKey(runId, requestKey) = "automation-metric-capture:<runId>-<requestKey>"`.
- `metric-method-bridge.ts:655` (`selectCaptureSource`) rejects any descriptor whose
  `runBindingSha256 !== digest({ runId: input.runId, start: input.start })` → `METRIC_SOURCE_RUN_MISMATCH`.

So the same bytes may be prepared again, but each run needs its own prepare. This is not a code bug; the
confirm should not be retried against the old package.

Steps to run this capture under a new run (no new provider call; the archive bytes are unchanged):

1. Start the run with the same keyword `bình giữ nhiệt` and a requested period covering the capture's measured
   period `2026-09-03 … 2026-10-02` (`assertRunScope` at `metric-capture-intake.ts:132` requires the normalized
   keyword to match and the capture period to sit inside the run's requested period).
2. Recover the retained archive bytes (nothing was deleted): the capture's `snapshot.json`
   (`sha256 86a4bd480441a75b14403b5e9efd7c651b5c8fc801e0480c097337f31c9109e4`, 314,020 B) and `manifest.json`
   (`sha256 7db8a423633d4cd0aeb93a56e8446cee599a1bb73ba3646fd48fdcfa91cd28e4`, 55,967 B) are content-addressed in
   `<state>/artifacts/sha256/86/86a4bd48…` and `<state>/artifacts/sha256/7d/7db8a423…`, and are listed in
   `foundation_source_package_files` for package `6ccaab48-220e-4b32-bfbd-f2707bc8c2b8`. Any retained working
   copy of the same files is equivalent.
3. Prepare them **under the new run** (multipart, as the operator's capture-upload helper does):

```
POST /owner-api/workspaces/<ws>/research-automation/runs/<newRunId>/sources/metric-capture
  metadata = {"contractVersion":"automation-metric-capture-prepare-v1","requestKey":"<fresh uuid>",
              "expectedRevision":<current run revision>,"sourceContext":"…"}
  snapshot = snapshot.json     manifest = manifest.json
```

4. Confirm with `sources.metric = { decision: 'USE_PREPARED', packageId: <new packageId> }` and then request the
   presentation revision. The earlier failure mode leaves the run in `AWAITING_SCOPE`; nothing needs cancelling.
   Alternatively, capture the results page afresh for the new run — also valid, just a provider call.

## Checks run

- `node --import tsx --test --test-name-pattern='partial Shopee review outcome' tests/integration/research-automation-metric-capture.test.ts`:
  fails with `MARKET_14_RULES_FAILED:3` before the fix; passes after.
- New case `capture-backed presentation passes the machine rules with a partial Shopee review outcome and keeps
  the listing URL out of visible text` (`tests/integration/research-automation-metric-capture.test.ts:215`):
  capture-backed run + `PARTIAL_LISTINGS` notice → presentation COMMITTED, rules 1, 2, 3, 5, 7, 9, 11 asserted
  individually, `machineRuleFailures(html) === []`, notice link text `Sản phẩm #1` with the URL only in `href`.
- `npm run typecheck`: PASS.
- `node --import tsx --test tests/integration/research-automation-metric-capture.test.ts tests/integration/research-automation-exact-reviews.test.ts tests/integration/review-coverage-owning.test.ts tests/unit/rules14-209-market-14.test.ts tests/unit/report-review-target.test.ts`: 43/43 PASS.
- Market presentation + revision suites (`market-presentation-report`, `market-presentation-method`, `market-presentation-contract`, `rev-209-market-presentation`, `research-automation-native-reviews`): 31/31 PASS.
- Automation API/Metric method/gate suites (`research-automation-api`, `research-automation-metric-methods`, `research-automation-market-methods`, `gate-209-reader-revision`): 49/49 PASS.
- `git diff --check`: clean.

## Not done / next

- The thạch dừa presentation was not re-requested on the running app (state is read-only for this task). After
  deploy, re-request the revision for `9e76bb31…` from pair `f09f48f6…`; it should commit, and the notice will
  read `Sản phẩm #1…#5`.
- `docs/STATUS.md` was not touched; the coordinator owns the roll-up.
- Optional follow-up (not implemented): the API answers a cross-run `USE_PREPARED` with HTTP 500
  `integrity_error`; a 4xx validation error naming the mismatch would be friendlier. The behavior itself is correct.

## Current branch verification and capture presentation fix

The merge at `89a12e86` retained the URL fix above, but its presentation renderer
also regressed one capture-specific rule-3 boundary: `reports.ts:994-1000`
sanitized hashes, `Sheet1` and snake-case names but left archive members such as
`capture/context.json`, `capture/manifest.json` and `capture/snapshot.json` in the
reader body. The presentation gate therefore rejected a valid capture-backed
revision with `MARKET_14_RULES_FAILED:3`. These are technical trace members and
belong in the semantic technical trace, not visible report prose.

`market-scope-report.ts:78-84` now replaces archive-member JSON paths with the
neutral reader phrase `Tệp được giữ trong bản lưu nguồn` only in the retained
source metadata field; quoted source text is untouched. The presentation path
also renders a separate retained-record chart in
`market-presentation-report.ts:17-39`, with one bar per platform and no summed
cross-platform total. This does not alter capture bytes, calculations, revenue
wording or the source binding. The existing review-shortfall fix at
`reports.ts:257-263` still keeps listing URLs in `href` only.

Added `tests/integration/research-automation-metric-capture.test.ts:212-263`:
it runs both absent-review and partial-review synthetic captures, confirms each
run, requests the Market presentation revision, reads the committed pair, runs
the offline audit CLI, and audits the final HTML. Rules 1, 2, 3, 5, 7, 9 and
11 pass; no machine rule fails; capture provenance and digests are absent from
reader text while exact archive paths remain in the separate semantic artifact.
The test uses synthetic fixture names only and makes no provider or network
calls.
