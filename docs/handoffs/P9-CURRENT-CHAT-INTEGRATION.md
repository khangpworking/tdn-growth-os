# Handoff — P9 current-chat integration (bounded OWNER source slice)

Updated: 2026-10-09
Worktree/branch: `ultimate-next-chat-pool-docs-claude` / `khangpworking/ultimate-next-chat-pool-docs-claude`. The clean worktree is placed at exact main `3d416d18decd31b903ba23454bec461ab20d0a37`.
Run/task: `run_adc3551f8ed8` generation4 / `task_e1104f5366ac`. Sole coordinator: `term_f78f7d8d-0a0e-4b5d-8a29-1f7a4912317d`.
Source parent: `0130da49f7c67e3edf9c4b19cbacf0b0e09d9b0b` (inherited P9 PR191 source).

Completed: this document only. It records the bounded OWNER outcome, the integration surfaces, the proof split, and the release gates. No product, test, or status file changed.

## Bounded outcome

Scope: S07 TikTok comment corpus and S14 video reading. The flow uses the existing authenticated OWNER routes.

1. OWNER uploads a prepared P4 table. The P4 verifier selects videos by explicit option A (ceil 20 percent) or option C (minimal prefix reaching 80 percent). Separate REVIEW_VIDEO additions are allowed. Selection refuses above 30 videos.
2. OWNER records the before-call intent. The configured fake collector returns comments under the approved cap. The cap is 30 videos and 200 top-level comments per video.
3. The retained sanitized S07 corpus is read with citations, history, and activity counts.
4. S14 operator intake stores inert prepared video readings. Read and retry stay inert.

Excluded from this package: model calls, live collector calls, UI capability, report generation, method or decision logic, policy changes, deploy, and paid staging.

Requirement coverage: P9-01 to P9-05, P9-07 to P9-10, and the U19, U25, and B03 source slice. P9-06 (coding, report, persona) stays NOT_BUILT.

Preserved semantics: unknown sales period. Missing, null, and zero values stay explicit. Seller, creator, and reply exclusions stay in force. HMAC author key and privacy stripping stay in force. No cross-platform join, no population estimate, and no approval.

## Source versions and file paths

Main at `3d416d18` contains the P9 owning source from `0130da49`. The P9 owned paths are:

- `src/modules/analysis/research-automation/p9-source-intake.ts` (owning service)
- `src/modules/analysis/research-automation/tiktok-video-selection.ts`
- `src/modules/analysis/research-automation/tiktok-comment-intake.ts`
- `src/modules/analysis/research-automation/video-reading-intake.ts`
- `src/platform/collectors/apify-tiktok-comments.ts`
- `src/api/research-automation-api.ts` (P9 routes, additive hunks)
- `src/modules/analysis/research-automation/service.ts` (additive hunks)
- `src/modules/analysis/research-automation/source-status.ts` (S07 and S14 state)
- `contracts/analysis/tiktok-comment-collection-v1.schema.json` and its generated pair
- `contracts/analysis/video-reading-v1.schema.json` and its generated pair
- `tests/integration/research-automation-p9-sources.test.ts`
- `tests/fixtures/p9-cold-replay.ts`
- `tests/unit/research-automation-source-board.test.ts` (S07 and S14 expectations only)

The inherited handoff lists canonical schema SHA256 values. The comment schema is `8722e384…cba3`. The video-reading schema is `a5c49feb…3a91`. The additive generator is `6e60f463…62ec`. Verify these against the main files before release. Do not trust this document for them.

## Integration dependencies (conflict risk)

Main changed 178 files relative to `0130da49`. The P9 integration overlaps only where these shared surfaces changed on main.

1. `src/api/research-automation-api.ts`: main added Insight, Reader, Persona, Macro, and World Bank route hunks. P9 added its routes in the same file.
2. `src/modules/analysis/research-automation/service.ts`: main changed this service for Metric, Insight, and Reader. P9 added a service-level wiring hunk.
3. `src/modules/analysis/research-automation/source-status.ts` and `tests/integration/research-automation-source-status.test.ts`: S07 and S14 state and board expectations.
4. `tests/unit/research-automation-source-board.test.ts` and `tests/integration/research-automation-api.test.ts`: shared assertions. Original assertions stay immutable. Only S07 and S14 state expectations may change.
5. `contracts/analysis/automation-*.generated.ts` and `contracts/api/research-automation-*.generated.ts`: main regenerated these. Any additive P9 generated entry must come from regeneration after conflict resolution. Do not hand-merge it.
6. `docs/handoffs/P9.md`: inherited handoff. This document does not rewrite it.

The exact conflict hunks belong to OpenCode's integration. This list reflects the main diff. The integration owner confirms each hunk.

## Proof split

Reused evidence (inherited, unaffected by the main change):

- Distinct 0130 review `/tmp/ultimate-p9-currentmain-final-review-sol/report-0130da49f7c67e3edf9c4b19cbacf0b0e09d9b0b.md`: bounded43 PASS, independent review scope only.
- Original budget correction, clean cold replay, and historical evidence for P9.
- Original run `37882581793` cancellation, preserved at `/tmp/ultimate-next-chat-pool-2026-10-09/pr191-original-cancelled-full.log`. This run was cancelled. It is not a release pass.
- Main private22, 23, and 25, Market, Reader23 and Reader25, and Persona26 unaffected evidence. This evidence carries until a changed dependency justifies a focused cross-boundary check.

New proof (pending, not run by this worker):

- Focused P9 integration checks on the integrated candidate: the owning source tests, API, source-status, and source-board tests.
- Strict repository typecheck on the integrated candidate.
- Generated-contract drift check after conflict resolution.
- `git diff --check` and docs scope check for this document.

## Release gates (pending)

None of these gates is claimed as passed in this document.

1. OpenCode integrates this docs commit into the exact candidate before final candidate checks.
2. Focused owned and affected checks on the integrated candidate. Pending.
3. Distinct final Codex `gpt-6.1-sol` high exact-head review. Pending.
4. Fresh hosted full, generated, and readiness checks on the exact final head. Pending.
5. Current-main check, normal matching-head merge, and postmerge check. Pending.
6. The coordinator owns release.

## Limitations

- Failure, cold replay, and privacy: the raw page is not kept. Only sanitized allowlisted pages are kept. Byte-exact raw reconstruction is not available by design. P9-03 stays PARTIAL.
- Sales period: P4 supplies run and workspace identity, and an optional acquisition date. P4 does not supply an authenticated sales measurement period. The source period stays UNKNOWN_UNVERIFIED. Publish dates never supply sales coverage.
- Collector: all checks use the fake injected collector. Live collection is not authorized.
- Coding binding: the current coding path admits only Shopee sources. TikTok sources cannot use it. P9-06 stays blocked.
- Unknown and missing values stay null or explicit exclusions. No totals are invented.

## Requirement status

| ID | State | Remaining gap |
| --- | --- | --- |
| P9-01 | PARTIAL | Frozen run and package selection persistence exists in inherited code. Full cold-replay acceptance on the candidate is pending. |
| P9-02 | PARTIAL | Fake collector and cap are proven. Live provider and retained intent receipts are not released. |
| P9-03 | PARTIAL | Dedupe and accounting are proven. Raw-page retention stays partial under the privacy policy. |
| P9-04 | PARTIAL | HMAC and sanitation are proven. Persisted and API privacy scan on the candidate is pending. |
| P9-05 | PARTIAL | Located records and exclusions are proven. Retained source interface checks on the candidate are pending. |
| P9-06 | ESCALATED | No additive coding version is granted. The source binding is Shopee-only. Coding, report, and persona stay NOT_BUILT. |
| P9-07 | PARTIAL | S14 inert reading is proven. Authenticated S14 read and retry on the candidate are pending. |
| P9-08 | DONE (independent scope) | No package model, watch, cloud, or transcription path. |
| P9-09 | PARTIAL | CitationRegistry projections are proven. Owning report and read integration is pending. |
| P9-10 | PARTIAL | Focused synthetic checks are proven. Candidate acceptance is pending. |
| U11 | BLOCKED | Statistic and release decision waits for OWNER. |
| U19 | PARTIAL | Source slice only. |
| U25 | PARTIAL | Source slice only. |
| U26 | BLOCKED | Revision and recollection policy waits for OWNER. |
| U32 | BLOCKED | Positive platform totals wait for OWNER. |
| U40 | BLOCKED | Live and paid acceptance is not authorized. |
| B03 | PARTIAL | Source slice only. |

## Implemented, reviewed, merged, whole acceptance

- Implemented: yes, in the inherited P9 source on main `3d416d18`.
- Reviewed: the 0130 review passed for bounded scope only. Final exact-head review on the integrated candidate is pending.
- Merged: no. This worker does not merge. The integration owner decides.
- Whole acceptance: no. P9 stays active.

## Next action

OpenCode integrates this docs commit, resolves the conflict hunks, and runs the pending gates above. The coordinator sends concrete receipts before final settlement when needed.

Business decisions pending: U11 statistic and release, U26 revision and recollection policy, U32 positive platform totals, U40 live and paid acceptance.
