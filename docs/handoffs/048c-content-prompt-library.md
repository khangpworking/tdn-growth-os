# Handoff — Task 048c Content Studio prompt library

Updated: 2026-09-25
Worktree/branch: `feature/048c-content-prompt-library`, based on `main` `28ab3191847159de0db70c00a5bf8e40687eafc7` (the merge of PR #46; `origin/main` was unchanged when this branch was pushed). Draft PR: https://github.com/khangpworking/tdn-growth-os/pull/47.
Completed:
- **Release plan.** Marked 048b merged. Set the 048c scope and moved the prompt picker and “save freestyle to library” to 050 (`docs/content-studio-release.md`, brief `docs/tasks/048c-content-prompt-library.md`).
- **System prompts and layers.** `prompts/content/library/*.md` and `prompts/content/system/*.md` were split by script from the four old Content Studio templates, with verbatim sections. The only change is one adapted Caption paragraph: the contact block is appended by the system, and hidden values are never sent. `ContentPromptLibrary` pins every file by SHA-256, and a `.gitattributes` line keeps the files LF.
- **Data and service.** Migration 0023 (prompts, revisions, and a DELETE/RESTORE lifecycle with alternation, chronological and 30-day triggers), contracts, validators and `ContentPromptService`: create with verified lineage, revise, delete, restore, exact retry, drift conflicts, verified reads.
- **APIs.** Read routes for the library, a user prompt and a system prompt; OWNER routes for create, revisions and lifecycle, with history verified before every write.
- **UI.** The “Thư viện prompt” page, following blueprint screen 10.
Changed paths: see the brief's “Owned paths”, plus `docs/STATUS.md` and `docs/frontend/screenshots/task-048c/`.
Evidence (commands, results, relevant revision):
- **Verified head** `1b5018bcef4bf02347680765eb4a34274424a760` (the last code change is `c56a285`): Linux CI `npm run check` passed with frontend 95/95 and backend 358/358 — https://github.com/khangpworking/tdn-growth-os/actions/runs/36118422969. The previous verified head `f9a0462` passed in run 36114548557.
- **Codex pre-review:** three findings, all verified and fixed with a test that failed first (commits `0c7f452`, `6d2cd8d`, `f9a0462`; details in brief §7):
  - an exact create retry now verifies the full prompt history;
  - the Poster system layer now has data-not-instructions, fact limits and an output contract, and is repinned;
  - “+ Prompt mới” on a detail page keeps its editor open.
  The earlier head `9ece01b` passed CI in run 36105195428.
- **Codex re-review:** three more findings, all verified and fixed with a test that failed first (details in brief §7):
  - “Đặt lại demo” now resets demo content too;
  - a prompt deleted elsewhere during an edit shows its deleted state, with the draft kept;
  - lifecycle events can no longer be dated before the previous one.
  An exact create retry now verifies history only when the create was deduplicated, so a changed create stays 409.
  Fixes are in commits `b7110ef` and `c56a285`, with docs in `1b5018b`.
- **Local Windows:**
  - frontend 95/95;
  - backend 342/358, with the same 16 Windows-only failures as `main`;
  - typechecks, build and contract regeneration clean.
- **Mutation checks and end-to-end check:** see brief §7.
- The commit after the verified head (this handoff) changes docs only.
Unresolved:
- **Operator startup** now also requires migration 0023. Apply the runbook migration step before starting a build that contains it.
- **System prompt model recommendations** are `gpt-5.6-sol` (text) and `gpt-image-2` (Poster). They are defaults from the Task 047 model list, to be confirmed in 049/053.
- **The Poster system prompt is the old B2B infographic style,** with a navy/gold corporate palette. Brands with a different style should duplicate it and adapt their own copy.
- **Usage counts** (“dùng N lần”) need generation records (050/051).
- **Demo mode** lists system prompts by name only. Their texts need the runtime.
- **Brand and catalog create retries** get the same full-history check in the separate draft PR https://github.com/khangpworking/tdn-growth-os/pull/48. It also touches `src/api/content-api.ts`, so whichever of #47 and #48 merges second needs a rebase.
- **Module layout** stays flat in `src/modules/flow/`, consistent with 048/048b. ADR 0003 names `src/modules/flow/content/`; moving the files later is mechanical.
Next action: Independent review of PR #47, then owner merge. After that: 048d (campaigns, taking its migration number from merged main). 049 waits for Controlled-lane authorization.
Business decisions pending:
- Strip EXIF metadata before live Poster calls?
- Catalog archive/delete, which is still undefined.
- Manual edit and version handling for Caption and Poster, to reconcile when 051 is briefed.
