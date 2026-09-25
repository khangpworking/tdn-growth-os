# Handoff — Task 048b Brand catalog and reference media

Updated: 2026-09-25
Worktree/branch: `feature/048b-content-catalog-media`, based on `main` `76c21aaffbc770a62ad2dfed03aeceac3738d50e` (release commit of PRs #44 and #45; `origin/main` was unchanged when this branch was pushed). Draft PR: https://github.com/khangpworking/tdn-growth-os/pull/46.
Completed:
- Reconciled the Content Studio plan with merged code and recorded the remaining slices, the Caption & Poster release criteria and the blockers in `docs/content-studio-release.md`. Task 047 §8 links to it.
- Migration 0022 with the media, catalog item and item revision tables. Image validation in `content-image.ts` (PNG checks ported from the old Content Studio; JPEG and WebP added). `ContentMediaService`, `ContentCatalogService`, and the optional brand logo. Shared helpers in `content-artifacts.ts`.
- New read, preview and OWNER routes in `src/api/content-api.ts`. Uploads go to `readOwnerBytes` in `owner-http.ts`. Every write verifies the brand and item history and the bytes of referenced images first.
- Frontend: the “Sản phẩm & dịch vụ” tab, catalog editor, logo field, `MediaUpload`, and the draft editor generalized in `draft-editor.ts`.
Changed paths: see the brief's “Owned paths” (`docs/tasks/048b-content-catalog-media.md`), plus `docs/STATUS.md`, `docs/tasks/047-content-studio-design.md` (§8 pointer) and `docs/frontend/screenshots/task-048b/`.
Evidence (commands, results, relevant revision):
- **Verified code head** `2c2d7fdc84ad08f719199c00a787a84cda2dc6a0`: Linux CI `npm run check` passed with frontend 69+10 = 79/79 and backend 336/336 — https://github.com/khangpworking/tdn-growth-os/actions/runs/36088589419.
- **Local Windows:**
  - frontend 79/79;
  - backend 320/336, with the same 16 Windows-only failures as `main`;
  - typechecks, build and contract regeneration clean.
- **End-to-end check** against a local operator on a synthetic database, plus screenshots. See brief §6.
- The commit after the verified head (this handoff) changes docs only.
Unresolved:
- **Operator startup** now also requires migration 0022. Apply the runbook migration step before starting a build that contains it.
- **Uploaded bytes are stored unchanged.** Stripping EXIF metadata (including location) before images go to image models is an owner decision for 051/053.
- **Catalog items cannot be deleted or archived yet.** The accepted design lists soft delete for Big Ideas, Angles, packages and prompts. For catalog items, a decision is needed when campaigns (048d) start referencing them.
- **Module layout.** ADR 0003 names `src/modules/flow/content/` for the new modules. They are kept flat next to the Task 048 brand service for consistency; moving them all is a later, mechanical change.
- **UI tests.** They use reducer tests plus server-rendered markup (`tsImport` with the frontend tsconfig). A DOM-driven interaction test would need a new dev dependency.
Next action: Independent review of PR #46. After it merges, start 048c (prompt library) or 048d (campaigns) as the release plan says.
Business decisions pending: Whether AI edit (052) gates the release, and whether to strip photo metadata before live Poster calls. Both are listed in `docs/content-studio-release.md` §4.
