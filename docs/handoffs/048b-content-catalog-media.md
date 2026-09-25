# Handoff — Task 048b Brand catalog and reference media

Updated: 2026-09-25
Worktree/branch: `feature/048b-content-catalog-media`, based on `main` `76c21aaffbc770a62ad2dfed03aeceac3738d50e` (release commit of PRs #44 and #45; `origin/main` was unchanged when this branch was pushed). Draft PR: https://github.com/khangpworking/tdn-growth-os/pull/46.
Completed:
- Reconciled the Content Studio plan with merged code and recorded the remaining slices, the Caption & Poster release criteria and the blockers in `docs/content-studio-release.md`. Task 047 §8 links to it.
- Migration 0022 with the media, catalog item and item revision tables. Image validation in `content-image.ts` (PNG checks ported from the old Content Studio; JPEG and WebP added). `ContentMediaService`, `ContentCatalogService`, and the optional brand logo. Shared helpers in `content-artifacts.ts`.
- New read, preview and OWNER routes in `src/api/content-api.ts`. Uploads go to `readOwnerBytes` in `owner-http.ts`. Every write verifies the brand and item history and the bytes of referenced images first.
- Frontend: the “Sản phẩm & dịch vụ” tab, catalog editor, logo field, `MediaUpload`, and the draft editor generalized in `draft-editor.ts`.
- Orchestrator follow-up on `3c55c3f`: both findings fixed (brief §7).
  - Uploads now accept only fully decodable PNG and JPEG. The new JPEG entropy checker is `content-jpeg.ts`; WebP is rejected by owner decision.
  - Media uploads now verify brand history before registering.
  - Owner decisions recorded in `docs/content-studio-release.md` §5: AI edit deferred; PNG/JPEG only.
Changed paths: see the brief's “Owned paths” (`docs/tasks/048b-content-catalog-media.md`), plus `docs/STATUS.md`, `docs/tasks/047-content-studio-design.md` (§8 pointer) and `docs/frontend/screenshots/task-048b/`.
Evidence (commands, results, relevant revision):
- **Verified head after the review corrections:** `d9f3a856d715132fa7fb2b3d66b9fa7e0126d38c`. Linux CI `npm run check` passed with frontend 79/79 and backend 340/340 — https://github.com/khangpworking/tdn-growth-os/actions/runs/36091178212.
- **Before the corrections:** `2c2d7fdc84ad08f719199c00a787a84cda2dc6a0` passed CI with 79/79 and 336/336 (run 36088589419).
- **Local Windows:**
  - frontend 79/79;
  - backend 324/340, with the same 16 Windows-only failures as `main`;
  - typechecks, build and contract regeneration clean.
- **Real-encoder check:** 93 real JPEGs accepted; CMYK rejected. A 12 MP progressive photo validates in about 0.8 s.
- **End-to-end check** against a local operator on a synthetic database, plus screenshots. See brief §6.
- The commit after the verified head (this handoff update) changes docs only.
Unresolved:
- **Operator startup** now also requires migration 0022. Apply the runbook migration step before starting a build that contains it.
- **Uploaded bytes are stored unchanged.** Stripping EXIF metadata (including location) before images go to image models is an owner decision for 051/053. The orchestrator recommends a derived, stripped, orientation-corrected reference with lineage; that is not approved.
- **Manual edit and version handling** for Caption and Poster (the non-AI part of 052) must be reconciled against the accepted design when 051 is briefed.
- **Catalog items cannot be deleted or archived yet.** The accepted design lists soft delete for Big Ideas, Angles, packages and prompts. For catalog items, a decision is needed when campaigns (048d) start referencing them.
- **Module layout.** ADR 0003 names `src/modules/flow/content/` for the new modules. They are kept flat next to the Task 048 brand service for consistency; moving them all is a later, mechanical change.
- **UI tests.** They use reducer tests plus server-rendered markup (`tsImport` with the frontend tsconfig). A DOM-driven interaction test would need a new dev dependency.
Next action: The orchestrator completes the independent review of PR #46, then the owner authorizes the merge. After that: 048c (prompt library), then 048d (campaigns, taking its migration number from merged main). 049 waits for Controlled-lane authorization.
Business decisions pending:
- Whether to strip photo metadata before live Poster calls.
- Catalog archive/delete, which is still undefined.
- WebP support later, which needs a vetted decoder.
Decided: AI edit is deferred (owner, 2026-09-25).
