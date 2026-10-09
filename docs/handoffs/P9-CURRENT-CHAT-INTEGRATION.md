# Handoff — P9 current-chat integration (bounded OWNER source slice)

Updated: 2026-10-09
Worktree/branch: `ultimate-next-chat-pool-docs-claude` / `khangpworking/ultimate-next-chat-pool-docs-claude`.
Base: main `3d416d18decd31b903ba23454bec461ab20d0a37`.
Run/task: `run_adc3551f8ed8` generation4 / `task_e1104f5366ac`. Sole coordinator: `term_f78f7d8d-0a0e-4b5d-8a29-1f7a4912317d`.
Source parent: `0130da49f7c67e3edf9c4b19cbacf0b0e09d9b0b` (inherited P9 PR191 source).

Completed: this document only. It records the bounded OWNER outcome, the integration plan, the conflict list, the proof split, and the release gates. No product, test, or status file changed.

## Source state

P9 owning source is implemented on the inherited branch at `0130da49`. Main at `3d416d18` does not contain that source. The P9 owning files are absent on main.

The plan is a faithful composition of the `0130da49` source into `3d416d18`. No merge and no release happened yet. OpenCode authors and integrates the composition. OpenCode publishes only after review.

Independent `git merge-tree` and OpenCode's actual merge both report four content conflicts:

1. `scripts/generate-foundation-contract.mjs`
2. `src/api/research-automation-api.ts`
3. `src/modules/analysis/research-automation/source-status.ts`
4. `tests/integration/research-automation-source-status.test.ts`

Two files auto-merge but need semantic inspection:

- `src/modules/analysis/research-automation/service.ts`
- `tests/unit/research-automation-source-board.test.ts`

No declared API test or generated automation contract file conflicts.

## Bounded outcome

Scope: S07 TikTok comment corpus and S14 video reading. The flow uses the existing authenticated OWNER routes.

1. OWNER uploads a prepared P4 table. The P4 verifier selects videos by explicit option A (ceil 20 percent) or option C (minimal prefix reaching 80 percent). Separate REVIEW_VIDEO additions are allowed. Selection refuses above 30 videos.
2. OWNER records the before-call intent. The configured fake collector returns comments under the approved cap. The cap is 30 videos and 200 top-level comments per video.
3. The retained sanitized S07 corpus is read with citations, history, and activity counts.
4. S14 operator intake stores inert prepared video readings. Read and retry stay inert.

Excluded from this package: model calls, live collector calls, UI capability, report generation, method or decision logic, policy changes, deploy, and paid staging.

Requirement coverage: P9-01 to P9-05, P9-07 to P9-10, and the U19, U25, and B03 source slice. P9-06 (coding, report, persona) stays NOT_BUILT.

Preserved semantics: unknown sales period. Missing, null, and zero values stay explicit. Seller, creator, and reply exclusions stay in force. HMAC author key and privacy stripping stay in force. No cross-platform join, no population estimate, and no approval.

## Owned source paths (on `0130da49`)

- `src/modules/analysis/research-automation/p9-source-intake.ts`
- `src/modules/analysis/research-automation/tiktok-video-selection.ts`
- `src/modules/analysis/research-automation/tiktok-comment-intake.ts`
- `src/modules/analysis/research-automation/video-reading-intake.ts`
- `src/platform/collectors/apify-tiktok-comments.ts`
- `src/api/research-automation-api.ts` (P9 routes)
- `src/modules/analysis/research-automation/service.ts` (P9 wiring hunk)
- `src/modules/analysis/research-automation/source-status.ts` (S07 and S14 state)
- `contracts/analysis/tiktok-comment-collection-v1.schema.json` and its generated pair
- `contracts/analysis/video-reading-v1.schema.json` and its generated pair
- `tests/integration/research-automation-p9-sources.test.ts`
- `tests/fixtures/p9-cold-replay.ts`
- `tests/unit/research-automation-source-board.test.ts` (S07 and S14 additions)

The inherited provenance receipt already exists. This document does not repeat canonical hash checks.

## Integration plan and conflict handling

- Unchanged P9 schema and generated v1 files import byte-exact from `0130da49`.
- `scripts/generate-foundation-contract.mjs`: the generator registry is unioned with main. The generator runs once after the actual input change. No generic generated contract is hand-merged. No all-contract change is invented.
- `src/api/research-automation-api.ts`: P9 routes are added next to the Insight, Reader, Persona, Macro, and World Bank routes on main.
- `src/modules/analysis/research-automation/source-status.ts` and `tests/integration/research-automation-source-status.test.ts`: S07 and S14 state is added to main's board. Assertions from both parents are preserved.
- `service.ts` and `tests/unit/research-automation-source-board.test.ts`: auto-merged. Each hunk needs semantic inspection.

Original tracked tests and assertions stay immutable. Assertions from both parents stay in force.

## Proof split

Reused evidence (inherited, unaffected):

- Distinct 0130 review `/tmp/ultimate-p9-currentmain-final-review-sol/report-0130da49f7c67e3edf9c4b19cbacf0b0e09d9b0b.md`: bounded43 PASS, bounded review scope only.
- Original budget correction, clean cold replay, and historical P9 evidence.
- Original run `37882581793` cancellation, preserved at `/tmp/ultimate-next-chat-pool-2026-10-09/pr191-original-cancelled-full.log`. The run was cancelled. It is not a release pass.
- Main private22, 23, and 25, Market, Reader23, Reader25, and Persona26 unaffected evidence. This evidence carries until a changed dependency justifies a focused cross-boundary check.

New proof (candidate delta, pending):

- Focused P9 checks on the integrated candidate: owning source tests, API, source-status, and source-board tests.
- Strict repository typecheck on the integrated candidate.
- Generated-contract drift check after conflict resolution, limited to the four conflict surfaces above.
- Docs commit: `git diff --check` and docs scope check. These passed for this document.

## Release gates (pending)

None of these gates is claimed as passed in this document.

1. OpenCode integrates this docs commit into the exact candidate.
2. OpenCode resolves the four content conflicts and reviews the two semantic-inspection hunks.
3. Focused owned and affected checks on the integrated candidate.
4. Distinct final Codex `gpt-6.1-sol` high exact-head review. The reviewer is distinct from the author.
5. Fresh hosted full, generated, and readiness checks on the exact final head.
6. Current-main check, normal matching-head merge, and postmerge check.
7. The coordinator owns the normal merge after gates pass and owns the release.

## Limitations

- Failure, cold replay, and privacy: the raw page is not kept. Only sanitized allowlisted pages are kept. Byte-exact raw reconstruction is not available by design. P9-03 stays PARTIAL.
- Sales period: P4 supplies run and workspace identity, and an optional acquisition date. P4 does not supply an authenticated sales measurement period. The source period stays UNKNOWN_UNVERIFIED. Publish dates never supply sales coverage.
- Collector: all checks use the fake injected collector. Live collection is not authorized.
- Coding binding: the current coding path admits only Shopee sources. TikTok sources cannot use it. P9-06 stays blocked.
- Unknown and missing values stay null or explicit exclusions. No totals are invented.

## Requirement status

| ID | State | Remaining gap |
| --- | --- | --- |
| P9-01 | PARTIAL | Frozen run and package selection exists on `0130da49`. Candidate cold-replay acceptance is pending. |
| P9-02 | PARTIAL | Fake collector and cap are proven on `0130da49`. Live provider and retained intent receipts are not released. |
| P9-03 | PARTIAL | Dedupe and accounting are proven on `0130da49`. Raw-page retention stays partial under the privacy policy. |
| P9-04 | PARTIAL | HMAC and sanitation are proven on `0130da49`. Candidate persisted and API privacy scan is pending. |
| P9-05 | PARTIAL | Located records and exclusions are proven on `0130da49`. Candidate retained source interface checks are pending. |
| P9-06 | ESCALATED | No additive coding version is granted. The source binding is Shopee-only. Coding, report, and persona stay NOT_BUILT. |
| P9-07 | PARTIAL | S14 inert reading is proven on `0130da49`. Candidate authenticated S14 read and retry are pending. |
| P9-08 | DONE (independent scope) | No package model, watch, cloud, or transcription path. |
| P9-09 | PARTIAL | CitationRegistry projections are proven on `0130da49`. Owning report and read integration is pending. |
| P9-10 | PARTIAL | Focused synthetic checks are proven on `0130da49`. Candidate acceptance is pending. |
| U11 | BLOCKED | Statistic and release decision waits for OWNER. |
| U19 | PARTIAL | Source slice only. |
| U25 | PARTIAL | Source slice only. |
| U26 | BLOCKED | Revision and recollection policy waits for OWNER. |
| U32 | BLOCKED | Positive platform totals wait for OWNER. |
| U40 | BLOCKED | Live and paid acceptance is not authorized. |
| B03 | PARTIAL | Source slice only. |

## Implemented, reviewed, merged, whole acceptance

- Implemented: yes, on the inherited branch at `0130da49`. Not on main `3d416d18`.
- Reviewed: the 0130 review passed for bounded scope only. Final exact-head review on the integrated candidate is pending.
- Merged: no. OpenCode publishes only after review. The coordinator owns the normal merge.
- Whole acceptance: no. P9 stays active.

## Next action

OpenCode composes the `0130da49` source onto `3d416d18`, resolves the four conflicts, and runs the pending gates above. The coordinator sends concrete receipts before final settlement when needed.

Business decisions pending: U11 statistic and release, U26 revision and recollection policy, U32 positive platform totals, U40 live and paid acceptance.

## Evidence appendix (OpenCode author, integrated candidate)

Candidate: merge `17705c8e8b3e1298afd4467cc680f57a067ea312`, tree `f2ff05d229fb9eea81d346563dc4388a8090ca83`, parents `3d416d18decd31b903ba23454bec461ab20d0a37` + `0130da49f7c67e3edf9c4b19cbacf0b0e09d9b0b`. This appendix supersedes the "Merged: no" line above for the source composition only; docs integration and all release gates below remain pending. No old section was rewritten.

Conflict decisions (faithful union, no assertion relaxed): generator `ignoreMinAndMaxItems` keeps `private-insight-source-projection` and adds `tiktok-comment-collection-v1` + `video-reading-v1` (P9 registry entries added, every main registration retained); `research-automation-api.ts` keeps main reviewCollection/persona/macro/World-Bank/reader-V2 admissions and adds P9 config field, P9 AJV schemas, P9 write-service spread, P9 route fallback, and P9 read/history blocks (one shared-brace artifact removed; verified by typecheck); `source-status.ts` `manualSource` union covers `VIDEO_READING` + `WORLD_BANK` with auto-merged built registry (S07/S14 built `true`/package `null` from P9, S23 built `true` from main); status test loop reduced to `META_AD_LIBRARY`/`OFFICIAL_STATS` with HEAD WORLD_BANK assertions plus 0130 P9 assertions (both parents' compatible assertions kept; superseded NOT_BUILT entries follow the merged registry truth). `service.ts` and board-test unions inspected: purely additive P9 activity/history hunks, no main logic altered. Coordinator-approved type-only widening (ask grant in run): `p9-source-intake.ts` `keywordDraft` option to `Promise<RetainedKeywordListDraftRecord>`; P9 consumes only `output` (identical `KeywordMeaningFilterData` in v2/v3) plus opaque retained bytes, so runtime behavior is unchanged. No schema, migration, manifest, capability, or policy change.

Focused results (pinned Node24.15.0/npm11.12.1, concurrency2, `npm ci` after package+lock equality, SQLite smoke ok): `npm run typecheck` PASS; `frontend:typecheck` PASS; `contracts:generate` byte-identical across all 231 tracked generated files (zero diff, P9 generated pairs reproduce from merged inputs); P9 sources+selection 16/16 PASS; source-status integration 4/4 PASS; source-board/contracts 10/10 PASS; apify-tiktok/video-reading/budget 16/16 PASS; world-bank/appendix 8/8 PASS; reader private22/admission + Insight19/21 API 4/4 PASS; review-coverage-owning PASS. Complete failure kept: `pageindex-upload` 5/6, `fixture run indexes attached PDF once` expects `READY` got `FAILED` at test.ts:85; reproduced identically on pristine main `3d416d1` in an isolated worktree, so it is pre-existing and outside this changed boundary; no assertion touched. Ignored `frontend/src/generated/report-validators.generated.js` created by frontend statics was removed after the run; no other task outputs remain.

Reused unaffected evidence: 0130 bounded43 PASS review, budget correction/clean cold/historical evidence, run37882581793 cancellation log; main private22/23/25, Market, Reader23/25, Persona26 evidence carries (focused cross-boundary checks above cover the changed admission/Reader dependencies). Source/composition/canonical/heavy leases remain held until author `worker_done`; publication HELD for distinct final Codex `gpt-6.1-sol`/high exact-head review, fresh hosted full/generated/readiness, current-main/normal merge/postmerge, all coordinator-owned.
