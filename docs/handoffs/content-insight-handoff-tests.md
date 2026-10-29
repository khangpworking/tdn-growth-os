# Handoff — content-insight-handoff independent tests

Updated: 2026-10-29
Worktree/branch: assigned worktree, `wp/content-insight-handoff`

Completed:
- 49 new synthetic test cases cover all 35 retained contract rows: CIH-Q1–Q14 and CIH-Q16–Q36. Owner answers remove Q15/Q37 and retain the existing full campaign-create form for Q11/Q21.
- Real Box 2 persistence/query/owner-decision tests; Box 4 service and HTTP tests; existing React/JSDOM component style; existing fake creative gateway only.
- Populated 0061→0062 upgrade preserves owner-service-created TYPED/STP artifacts, a locked campaign, report decisions, original artifact bytes and foreign keys.
- Full rollback is exercised by a temporary SQLite trigger at Insight insertion after campaign preparation; HTTP request-owned artifact cleanup is checked as well as ledger state.
- Big Idea/Angle dispatch contains the expected frozen snapshot and edited three fields; pre-change prompt bytes/hashes are pinned from 82391f12. Retained idea, caption and artifact bytes survive a newer report. TYPED/STP controls receive no report block.
- Mutation proof: widening approval to include REJECTED fails Q13; accepting a locked handoff fails Q25 (201 vs 409); mapping motivation to painPoint fails Q22. Every source file was restored byte-for-byte; the final new-suite run is green.

Changed paths:
- Tests: `tests/integration/content-insight-handoff.test.ts` (32), `tests/integration/content-insight-handoff-generation.test.ts` (2), `frontend/tests/content-insight-handoff.test.ts` (15).
- Synthetic helpers/fixtures: `tests/helpers/content-insight-handoff-{fixture,b10}.ts`, `tests/fixtures/content-insight-handoff-{statement.ts,prompt-baseline.json}`; migration-directory option in `tests/helpers/insight-reader-fixture.ts`.
- Existing fixture repairs: statement/report schema registrations in `tests/integration/content-{insight,package}-api.test.ts`; settle the new report-list read in `frontend/tests/content-insight-page.test.ts`, preserving the unmount assertions.
- Minimal production fixes: `src/modules/flow/content-insight-service.ts:144` and `src/api/content-api.ts:1072` preserve the exact report-source locked refusal; `content-insight-service.ts:397` converts unavailable B10 reads to the existing B10 gate refusal; `content-insight-service.ts:398` rejects clearance for another product.

Evidence (Node 24.14.0, Linux):
- 34 explicitly named files: the 31 author-listed files plus the three new files. Initial combined run: 354/355; its sole failure was a new test incorrectly expecting 400 for an unknown brand (the existing route correctly returns 404). Corrected that fixture expectation and reran all three new files: **49/49 PASS**. All 31 author-listed files passed **306/306**; their relevant code/fixtures stayed unchanged after that run. Final distinct evidence: **355/355 PASS**, zero skipped/cancelled.
- `npm run typecheck`: PASS. `npm run frontend:typecheck`: PASS. `git diff --check`: PASS.
- No full suite, browser/E2E/load run, live AI/provider call, deployment or production-state access.

Unresolved:
- **R-C08 workflow gap:** `src/modules/analysis/research-automation/reader-publish.ts:110` refuses publishing a new Insight reader revision while the latest revision is APPROVED; the transaction repeats that guard at line 62. The new query/UI can handle approved newer revisions, but the existing owner publisher cannot create that progression after approval. Q13/Q16/Q30/Q31/Q32 use explicit valid synthetic ledger/build-record fixtures for those newer states, with real owning-service decisions. These fixtures are not claimed as publisher receipts or proof that the full owner workflow is reachable. The existing publisher and approved rules were left unchanged, as required when code and spec disagree.
- Q35 checks verbatim retention of a manually reviewed complete third-person synthetic sentence. First-person/fragment counterexamples are documented; no automated Vietnamese semantic classifier or grammar rejection is claimed.

Next action: separate Stage 5 review; owner resolution of the R-C08 publisher/spec gap; final-SHA Linux CI before merge.
Business decisions pending: owner disposition of the R-C08 gap. No approval withdrawal, merge or deployment is performed in this stage.
