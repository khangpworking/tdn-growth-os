# Handoff — Task 048 Content brands

Updated: 2026-09-25
Worktree/branch: `feature/048-content-brands`, stacked on `feature/047-content-studio-design` (base `origin/main` `7a21b72`). Developed on Windows with portable Node 24.15.0 / npm 11.12.1.
Completed:
- Migration 0021, brand create/revision/artifact contracts and validators, `ContentBrandService` (immutable sequential revisions, exact retry, drift conflict, artifact verification, exact-retry restoration of a committed-but-unpublished artifact).
- `src/api/content-api.ts` read + OWNER handlers, `src/api/owner-http.ts` shared OWNER primitives (same rules as `owner-api.ts`), operator-app routing for `/api/content…` and `/owner-api/content…`.
- Frontend Brands page (`#/brands`, `#/brands/:id`) with display-rule controls, history, OWNER lock/conflict handling and demo mode.
- Independent review fixes (brief §6): revision path verifies existing history first; brand list reads the captured version; OWNER API contract closed on nested profile/display rules; unsaved drafts survive 409 and pending saves via the page-owned editor reducer (`frontend/src/brand-editor.ts`).
Changed paths: see Task 048 brief “Owned paths”; plus schema-version assertions 20 → 21 in three existing tests.
Evidence (commands, results, relevant revision): Task 048 brief §5–§6. Verified code head `2c44a57588f4c01cebe5f4022a0c6031ea49c118`: Linux CI `npm run check` passed with frontend 69/69 and backend 319/319 — https://github.com/khangpworking/tdn-growth-os/actions/runs/36084439872. Local Windows: frontend 69/69, backend 303/319 (same 16 Windows-only failures as the baseline), typechecks, build and contract regeneration clean. The handoff commit after that head changes docs only.
Unresolved:
- Operator startup now also opens the content read API, which requires migration 0021; run the runbook's explicit migration step before starting a build that contains this change (same behaviour as the existing owner tables).
- `owner-http.ts` duplicates the OWNER HTTP primitives that are private inside `owner-api.ts`; a later cleanup could make `owner-api.ts` import them (kept separate to avoid touching the 80 KB file in this slice).
- Local `scripts/typecheck.mjs` cannot spawn `tsc` on Windows (POSIX shim + command-line length); unrelated to this task.
- The conflict/saving UI is covered by reducer tests and a server-rendered component test; a DOM-driven interaction test would need a new dev dependency (e.g. jsdom), which is outside Task 048's owned paths.
Next action: Re-review of the four corrections on PR #45 (kept draft); after merge of #44 and #45, Task 048b (catalog items, tiers, media store for logo/product photos).
Business decisions pending: None.
