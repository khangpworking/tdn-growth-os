# Task 048c — Content Studio prompt library

Status: DONE (pending review)
Lane: Standard
Owner/worktree: `feature/048c-content-prompt-library` (base `main` `28ab319`)
Goal: “Thư viện prompt” as designed in Task 047 §1 and blueprint screen 10. Prompts have two layers: the user writes only the creative layer, and the system adds a locked layer at generation time. The library has two kinds of prompts:
- **Hệ thống (system) prompts:** read-only, ported from the old Content Studio templates; one default per type.
- **Của tôi (my) prompts:** the OWNER can create, edit (new version), duplicate, delete, and restore within 30 days.

No AI calls.
Non-goals:
- The library/freestyle picker on generation screens, and saving a freestyle prompt to the library. Both move to 050, which uses the create API from this slice.
- Usage counts (“dùng N lần”), which need generation records.
- Model discovery or overrides (049).
- Generation itself, AI editing, campaign defaults (048d), deployment.
Dependencies: Task 047 §1–§4, ADR 0003 decisions 5–6, Task 048b (patterns and the shared editor).
Owned paths: `migrations/0023_flow_content_prompts.sql`; `prompts/content/**` (+ one `.gitattributes` line keeping them LF); `contracts/flow/content-prompt-*.schema.json`, `contracts/api/content-api.schema.json`, `contracts/api/owner-content-prompt-api.schema.json` (+ generated); `scripts/generate-foundation-contract.mjs` (list only); `src/modules/flow/content-prompt-{library,service}.ts`, `validation.ts`, `index.ts`; `src/api/content-api.ts`, `src/api/operator-app.ts` (only if routing changes); `frontend/src/{routing.ts,App.tsx,PromptsPage.tsx,prompt-data-source.ts,styles.css}`; tests `tests/integration/content-prompt*.test.ts`, `tests/unit/content-prompt-library.test.ts`, `frontend/tests/content-prompts.test.ts`; schema-version assertions 22 → 23; `docs/STATUS.md`, `docs/content-studio-release.md`, this brief, `docs/handoffs/048c-content-prompt-library.md`.
Minimum verification: `npm run check` green on Linux CI. Locally: all new tests pass, and no failures beyond the known Windows-only set.
Escalate when: a change is needed outside the owned paths, or an existing assertion must be weakened.

## 1. Prompt types and models

- **Types:** `BIG_IDEA`, `ANGLE`, `CAPTION`, `POSTER`. The UI calls them Big Idea, Góc, Caption and Poster.
- **Recommended model:**
  - text types: `gpt-5.6-sol`, `gpt-5.6-luna` or `gemini-3.5-flash-low`;
  - Poster: `gpt-image-2` or `gemini-3.1-flash-image`.

  These are the models approved in Task 047 §4. Model discovery and per-run overrides belong to 049.

## 2. System prompts and system layers (read-only, in the repository)

- `prompts/content/library/*.md` holds the creative layers of the four old Content Studio templates:
  - `content-studio-big-idea-v3.1`
  - `content-studio-angle-v3`
  - `content-studio-social-post-v3` (Caption)
  - `poster-master-prompt-v2`

  They keep the role, strategy, mechanisms, quality tests, style and anti-cliché rules. Each is the “Mặc định” (default) for its type.
- `prompts/content/system/<type>-v1.md` holds the system layer ported from the same templates: locked-input and data-not-instructions rules, fact limits, reasoning secrecy, and the output contract. For Poster it adds the canvas, caption and brand data blocks.
  - The library shows it as “Phần hệ thống · tự thêm” (the part the system adds).
  - 050 and 051 assemble it at generation time; they may add later versions.
- `src/modules/flow/content-prompt-library.ts` registers each file with its id, type, version, name, description, recommended model and tags. It serves the text together with its SHA-256.
  - A unit test pins every file's hash, so any change to a system prompt is a deliberate new version.
  - Stored values from the old runtime, private data, and placeholders filled with real data are not copied.

## 3. User prompts (database, migration 0023)

Migration 0023 adds three tables, all immutable (triggers reject UPDATE and DELETE):
- **`flow_content_prompts`:** `prompt_key` is unique; the type is fixed at creation.
- **`flow_content_prompt_revisions`:** sequential versions, following the brand and catalog pattern.
- **`flow_content_prompt_lifecycle`:** append-only `DELETE` / `RESTORE` events with sequential numbering.
  - The two actions must alternate, starting with `DELETE`.
  - Events never go back in time: each one must be dated at or after the one before it.
  - The database rejects a `RESTORE` more than 30 days after its `DELETE`.
  - Nothing is ever physically deleted. After 30 days a deleted prompt is no longer listed or restorable, but its versions stay readable for lineage.

A prompt artifact records the prompt's identity (`promptId`, `promptKey`, `promptType`, `version`), provenance (`createdAt`, `requestSha256`) and content:

- **Required:** `name` (up to 120 characters), `creativeText` (up to 12000), `recommendedModel` (matching the type).
- **Optional:** `description` (up to 300), `tags` (up to 8 unique, each up to 40), `demoInput` (up to 2000), `demoOutput` (up to 4000).
- **Lineage** (version 1 only): optional `duplicatedFrom` pointing to the exact system or user prompt version it was copied from, verified when created.

Service rules follow brands and catalog: exact retry, 409 on drift or a stale version, verified reads, and restoration of an unpublished artifact on exact retry. Revising a deleted prompt is a conflict.

## 4. APIs

- **Read:**
  - `GET /api/content/prompts`: system prompts, plus user prompts that are active or restorable (each read at its captured version).
  - `GET /api/content/prompts/:promptId`: the verified prompt, its history, its lifecycle state, and the system layer for its type.
  - `GET /api/content/system-prompts/:id`: the system prompt text and SHA-256, plus its system layer.
- **OWNER:**
  - `POST /owner-api/content/prompts`: create.
  - `POST /owner-api/content/prompts/:promptId/revisions`.
  - `POST /owner-api/content/prompts/:promptId/lifecycle`, with `{contractVersion, action, expectedSequence}`.
  - These use the same token, origin, preflight and exact-key rules as the other content writes. The body limit is 96 KiB.
  - Every write verifies the existing history first, and writes nothing if verification fails.

## 5. UI

Route `#/prompts/:type[/:promptRef]`, reached from the “Thư viện prompt” entry in the top navigation. It follows blueprint screen 10:
- **Type tabs** with counts.
- **Prompt list:**
  - system prompt marked “Hệ thống · Mặc định”;
  - user prompts marked “Của tôi · vN”;
  - “+ Prompt mới” (new prompt);
  - an “Đã xóa gần đây” (recently deleted) section with Restore.
- **Detail view:**
  - name and description; actions “Nhân bản” (duplicate), “Sửa (tạo vN+1)” (edit, creating the next version), and the “⋯” menu with Xóa (delete);
  - model and tags;
  - “Phần sáng tạo · bạn viết” (the creative part you write);
  - “Phần hệ thống · tự thêm” (the system part), read-only and collapsible;
  - demo input and output.
- **Delete confirmation** happens inline and states the 30-day window.
- **Editing** reuses the shared editor: drafts survive a 409 and fields lock while saving.
- **Demo mode** keeps its data in memory.

## 6. Acceptance

1. Migration 0023 applies on top of 0022 and reruns idempotently; 0001–0022 stay byte-identical. The lifecycle triggers enforce order, alternation, chronological dates and the 30-day restore window.
2. System prompts and layers are served with their pinned hashes and verified before use. Their files cannot change silently.
3. User prompts: create, revise, duplicate with verified lineage, delete and restore. Exact retries do nothing new, drift gives 409, and every read is verified. The recommended model must match the type.
4. HTTP: closed bodies, boundary rules, zero writes on rejection, and history verified before writing.
5. Frontend: routes, validated reads, exact request bodies, conflict-safe drafts, delete and restore, locked while saving, no hard-coded origins.

## 7. Verification (local Windows, Node 24.15.0 / npm 11.12.1)

- **Static checks.** Contracts regenerate with no diff. The strict backend typecheck (temporary tsconfig workaround), the frontend typecheck and the production build all pass.
- **New tests:**
  - system prompt registry: 3, including a tampered or missing file being refused;
  - prompt service and migration: 8, covering lifecycle triggers, lineage, the 30-day window and the v22→v23 upgrade with 0022 pinned;
  - HTTP: 6, covering library reads, receipts, retries and conflicts, zero writes on rejection, delete/restore/expiry, and history verification before writes;
  - frontend: 9, covering routes, drafts, validated reads, exact bodies, demo lifecycle, and the rendered detail and editor.
- **Mutation checks.** Each of these breaks a test:
  - skipping the file-hash check;
  - skipping history verification on revisions and on lifecycle changes;
  - skipping the lineage pre-check or the expired-prompt filter;
  - removing the conflict mapping.
- **Suites.** Frontend 95/95. Backend 342/358; the 16 failures are the same Windows-only set as on `main`. The operator content test passes with the scratch permission shim.
- **Codex pre-review fixes** (each with a test that failed first):
  - An exact create retry now verifies the full prompt history, like revisions and lifecycle changes. Before the fix, a retry after a later revision was tampered returned 200; now it returns 500 `integrity_error` and writes nothing. A changed create with the same key still returns 409, as for brands and catalog items (PR #48).
  - The Poster system layer now states that the Caption and Brand reference data are its only facts, treats UNTRUSTED blocks as data, forbids invented facts, and ends with an output contract. Its pinned SHA-256 changed to `8bb9d08dc3218a94ee3acc4a1658554c7953fafeeccfdcad4951ef21769d9b00`.
  - “+ Prompt mới” on a prompt detail page no longer closes its own editor when it navigates to the type list. Checked in headless Chrome with a trusted click: the old build showed the form for about 1 ms, and the fixed build keeps it open.
- **Codex re-review fixes** (each with a test that failed first):
  - “Đặt lại demo” now also returns the demo brand, catalog, media and prompts to their seed. Before, a demo prompt created before the reset stayed listed.
  - If a prompt is deleted elsewhere while its edit form is open, the 409 reload now shows the deleted state with “Khôi phục” instead of the form, and says the unsaved draft is kept. Restoring brings the form back with the draft.
  - A lifecycle event dated before the previous one, for example a `RESTORE` recorded before its `DELETE` after a clock rollback, is refused by a new trigger, `flow_content_prompt_lifecycle_not_chronological`. The service returns 409 first and writes nothing.
- **End to end.** A local operator ran on a fresh synthetic database (schema 23) on port 18912. Through the UI:
  - opened the Big Idea system prompt (creative text and system layer shown read-only);
  - duplicated it as a user prompt (version 1, lineage “Nhân bản từ prompt hệ thống”) and edited it to version 2;
  - deleted it: inline confirmation, “Đã xóa gần đây · 1”, restore deadline shown;
  - restored it.
- **Screenshots** (headless Chrome, exact viewports; no horizontal overflow):
  - [`system-prompt-desktop.png`](../frontend/screenshots/task-048c/system-prompt-desktop.png) (1440)
  - [`user-prompt-desktop.png`](../frontend/screenshots/task-048c/user-prompt-desktop.png) (1440)
  - [`user-prompt-phone.png`](../frontend/screenshots/task-048c/user-prompt-phone.png) (390)

