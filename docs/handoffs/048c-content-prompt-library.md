# Handoff — Task 048c Content Studio prompt library

Updated: 2026-09-25
Worktree/branch: `feature/048c-content-prompt-library`, based on `main` `28ab3191847159de0db70c00a5bf8e40687eafc7` (the merge of PR #46; `origin/main` was unchanged when this branch was pushed). Draft PR: https://github.com/khangpworking/tdn-growth-os/pull/47.
Completed:
- **Release plan.** Marked 048b merged. Set the 048c scope and moved the prompt picker and “save freestyle to library” to 050 (`docs/content-studio-release.md`, brief `docs/tasks/048c-content-prompt-library.md`).
- **System prompts and layers.** `prompts/content/library/*.md` and `prompts/content/system/*.md` were split by script from the four old Content Studio templates, with verbatim sections. The only change is one adapted Caption paragraph: the contact block is appended by the system, and hidden values are never sent. `ContentPromptLibrary` pins every file by SHA-256, and a `.gitattributes` line keeps the files LF.
- **Data and service.** Migration 0023 (prompts, revisions, and a DELETE/RESTORE lifecycle with alternation and 30-day triggers), contracts, validators and `ContentPromptService`: create with verified lineage, revise, delete, restore, exact retry, drift conflicts, verified reads.
- **APIs.** Read routes for the library, a user prompt and a system prompt; OWNER routes for create, revisions and lifecycle, with history verified before every write.
- **UI.** The “Thư viện prompt” page, following blueprint screen 10.
Changed paths: see the brief's “Owned paths”, plus `docs/STATUS.md` and `docs/frontend/screenshots/task-048c/`.
Evidence (commands, results, relevant revision):
- **Verified code head** `9ece01b8b086d563f643aa6255e6f76c04e9c87b`: Linux CI `npm run check` passed with frontend 92/92 and backend 356/356 — https://github.com/khangpworking/tdn-growth-os/actions/runs/36105195428.
- **Local Windows:**
  - frontend 92/92;
  - backend 340/356, with the same 16 Windows-only failures as `main`;
  - typechecks, build and contract regeneration clean.
- **Mutation checks and end-to-end check:** see brief §7.
- The commit after the verified head (this handoff) changes docs only.
Unresolved:
- **Operator startup** now also requires migration 0023. Apply the runbook migration step before starting a build that contains it.
- **System prompt model recommendations** are `gpt-5.6-sol` (text) and `gpt-image-2` (Poster). They are defaults from the Task 047 model list, to be confirmed in 049/053.
- **The Poster system prompt is the old B2B infographic style,** with a navy/gold corporate palette. Brands with a different style should duplicate it and adapt their own copy.
- **Usage counts** (“dùng N lần”) need generation records (050/051).
- **Demo mode** lists system prompts by name only. Their texts need the runtime.
- **Module layout** stays flat in `src/modules/flow/`, consistent with 048/048b. ADR 0003 names `src/modules/flow/content/`; moving the files later is mechanical.
Next action: Independent review of PR #47, then owner merge. After that: 048d (campaigns, taking its migration number from merged main). 049 waits for Controlled-lane authorization.
Business decisions pending:
- Strip EXIF metadata before live Poster calls?
- Catalog archive/delete, which is still undefined.
- Manual edit and version handling for Caption and Poster, to reconcile when 051 is briefed.
