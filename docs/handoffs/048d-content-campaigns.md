# Handoff — Task 048d Content Studio campaigns

Updated: 2026-09-26
Worktree/branch: `feature/048d-content-campaigns`, rebased onto `main` `f133f12` (#47 and #48 merged) and targeting `main`. Migration 0024 is still the next free number on `main`.
Completed:
- **Brief and decisions.** `docs/tasks/048d-content-campaigns.md`; the owner approved P1–P4 on 2026-09-25 (defaults to 051, delete/restore in 048d, items pin catalog versions, research link verified only).
- **Data.** Migration 0024: campaigns, revisions and a DELETE/RESTORE lifecycle, with 048c's alternation, chronological and 30-day triggers copied under campaign names. Schema-version assertions 23 → 24.
- **Contracts and service.** Four flow schemas and validators; `ContentCampaignService`: create, revise, delete, restore, exact retry, drift conflicts, verified reads. Every write verifies the brand, each pinned catalog item version and its brand, the tier keys and the research product workspace, and writes nothing on failure.
- **APIs.** `GET /api/content/campaigns` (no query string) and `GET /api/content/campaigns/:campaignId`; OWNER create, revisions and lifecycle, with history verified before every write.
- **UI.** “Nội dung” navigation and `#/content`: brand filter with client-side counts, table, “Đã xóa gần đây” with restore, shared create/edit form with tier chips and an explicit catalog-version upgrade, detail with four disabled next steps and delete confirmation, demo mode.
Changed paths: see the brief's “Owned paths”, plus the extended demo-reset assertion in `frontend/tests/content-prompts.test.ts` (brief §7).
Evidence (commands, results, relevant revision):
- **Linux CI:** runs on the final head now that this PR targets `main`; see the PR checks.
- **Codex pre-review:** two P2 findings, both verified and fixed in `4a8e0a6`:
  - the campaign editor showed the latest catalog version's tier chips for an item pinned to an older version;
  - the summary fallback invented `tier-N` keys.

  Chips are now hidden until “Dùng phiên bản mới” is applied. Summary-only items keep their existing tier keys, and their upgrade is disabled.
- **Local Windows** (Codex runs the tests and reports the results; Claude reviews each diff against the plan):
  - frontend 125/125 after rebasing onto main (includes 048c's tests); frontend typecheck and build clean. Root typecheck is left to Linux CI: after the rebase, the Windows wrapper failed to spawn `tsc` (ENOENT) before any diagnostics ran;
  - root `npm test` 364/380 after rebasing, the 16 failures being the known Windows-only set;
  - campaign backend suites 20/20 (migration 2, contracts 2, service 9, API 7);
  - content integration suites 63/65, the 2 failures being in the known Windows-only set.
Unresolved:
- **Operator startup** requires migration 0024. Apply the runbook migration step before starting a build that contains it.
- **Integration with #47/#48:** the rebase was clean. `src/api/content-api.ts` keeps the prompt and brand/catalog retry checks, and both page-unmount guards and their regressions are present.
- **Cascade on delete** (“Ẩn cả … bên dưới”) arrives with 050, when Insight records exist below a campaign.
- **Item and research-link locking** is decided by 050 (Insight lock). Until then both change only through a campaign revision.
- **Campaign defaults** are 051 (P1).
- **`INTENT.md` has two D33 headings;** renumbering needs an owner decision (brief §6).
- **Independent review:** R2 and R3 are fixed in `fb204f9`, with Codex test-audit tests in `ea08d39`. There are no deviations from the fix plan and no production bug was found by the audit.
- **Focused re-review:** R3 is closed. The R2 page-unmount gap is fixed in `7eb343d`, and a mounted regression that unmounts the page mid-save failed before the fix.
Next action: final-head Linux CI green, inspect the integration diff, then owner merge.
Business decisions pending:
- Strip EXIF metadata before live Poster calls?
- Catalog archive/delete, which is still undefined.
- D33 renumbering in `INTENT.md`.
