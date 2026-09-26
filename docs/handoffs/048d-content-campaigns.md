# Handoff — Task 048d Content Studio campaigns

Updated: 2026-09-26
Worktree/branch: `feature/048d-content-campaigns`, stacked on `feature/048c-content-prompt-library` `65eb263` (PR #47, not merged yet). Rebase onto `main` once #47 merges; the migration number 0024 holds only if nothing else takes it first.
Completed:
- **Brief and decisions.** `docs/tasks/048d-content-campaigns.md`; the owner approved P1–P4 on 2026-09-25 (defaults to 051, delete/restore in 048d, items pin catalog versions, research link verified only).
- **Data.** Migration 0024: campaigns, revisions and a DELETE/RESTORE lifecycle, with 048c's alternation, chronological and 30-day triggers copied under campaign names. Schema-version assertions 23 → 24.
- **Contracts and service.** Four flow schemas and validators; `ContentCampaignService`: create, revise, delete, restore, exact retry, drift conflicts, verified reads. Every write verifies the brand, each pinned catalog item version and its brand, the tier keys and the research product workspace, and writes nothing on failure.
- **APIs.** `GET /api/content/campaigns` (no query string) and `GET /api/content/campaigns/:campaignId`; OWNER create, revisions and lifecycle, with history verified before every write.
- **UI.** “Nội dung” navigation and `#/content`: brand filter with client-side counts, table, “Đã xóa gần đây” with restore, shared create/edit form with tier chips and an explicit catalog-version upgrade, detail with four disabled next steps and delete confirmation, demo mode.
Changed paths: see the brief's “Owned paths”, plus the extended demo-reset assertion in `frontend/tests/content-prompts.test.ts` (brief §7).
Evidence (commands, results, relevant revision):
- **Linux CI:** no checks run on this PR while its base is `feature/048c-content-prompt-library`; CI runs once it targets `main`.
- **Codex pre-review:** two P2 findings, both verified and fixed in `b21576c`:
  - the campaign editor showed the latest catalog version's tier chips for an item pinned to an older version;
  - the summary fallback invented `tier-N` keys.

  Chips are now hidden until “Dùng phiên bản mới” is applied. Summary-only items keep their existing tier keys, and their upgrade is disabled.
- **Local Windows** (Codex runs the tests and reports the results; Claude reviews each diff against the plan):
  - frontend 111/111 after the fix; frontend typecheck and build clean; root typecheck `status 0`;
  - root `npm test` 362/378, the 16 failures being the known Windows-only set;
  - campaign backend suites 20/20 (migration 2, contracts 2, service 9, API 7);
  - content integration suites 63/65, the 2 failures being in the known Windows-only set.
Unresolved:
- **Operator startup** requires migration 0024. Apply the runbook migration step before starting a build that contains it.
- **Stacked on #47.** Whichever of #47/#48 merges changes `src/api/content-api.ts`; this branch needs a rebase after them.
- **Cascade on delete** (“Ẩn cả … bên dưới”) arrives with 050, when Insight records exist below a campaign.
- **Item and research-link locking** is decided by 050 (Insight lock). Until then both change only through a campaign revision.
- **Campaign defaults** are 051 (P1).
- **`INTENT.md` has two D33 headings;** renumbering needs an owner decision (brief §6).
Next action: independent review of the draft PR, then the owner merges it after #47.
Business decisions pending:
- Strip EXIF metadata before live Poster calls?
- Catalog archive/delete, which is still undefined.
- D33 renumbering in `INTENT.md`.
