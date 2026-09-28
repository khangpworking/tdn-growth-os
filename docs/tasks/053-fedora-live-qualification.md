# Task 053 — Fedora live qualification

Status: BRIEF ONLY, **not authorized**. No step below runs until the owner authorizes this task in writing, naming the exact `main` merge SHA, the final migration filename and the schema version it targets.
Lane: **Controlled** (first real provider calls; Task 047 §8, ADR 0003 decision 5, Task 049 §1).
Owner/worktree: `docs/053-fedora-live-qualification` (this brief); execution happens on the Fedora operator, not in a worktree.
Goal: prove on the Fedora operator, with fresh data and the smallest number of real calls, that the Caption & Poster release works end to end. Then hand the owner a checklist for retiring the Windows Content Studio.

Non-goals:
- Code changes. If qualification finds a defect, stop; the fix is a separate Normal-lane PR, and this task restarts from its new merge SHA.
- Migrating Windows Content Studio data (brands, photos, prompts, outputs) to Fedora. Fedora starts with fresh, owner-entered data.
- AI edit proposals (052, deferred), social publishing, video, automatic retries, queues, a second runtime.
- Changing the CLIProxy configuration, or reading its files.

## 1. Preconditions (all must hold before the first real call)

1. PR #68 (provider-model provenance) is merged. The owner has the merge SHA, the migration filename and the schema version (expected `0034_flow_content_ai_provider_model.sql`, v34, unless `main` takes 0034 first).
2. Linux CI is green on that exact SHA. A run that never started (for example, blocked by GitHub billing) is not green.
3. The owner has decided the EXIF question from `docs/content-studio-release.md` §4. Until then, the Poster steps (§3.3) use only reference photos the owner has already stripped of metadata, or they are skipped.
4. The owner has chosen where the CLIProxy key lives persistently (Task 049 P2 open item 6):
   - **(a)** exported in the private shell that starts the operator, as today;
   - **(b)** a systemd `EnvironmentFile=` outside the repository, mode 600, owned by the operator user.

   The owner types the key. The agent never sees, prints or stores it.
5. A backup of the operator database (`sqlite3 <db> ".backup <file>"`) was taken after the migration step and before the first call.

## 2. Deploy and migrate (runbook: `docs/runbooks/fedora-local-operator-runtime.md` §2–§4)

1. Check out the authorized SHA; `npm ci`; build.
2. Run the migration CLI against the operator database; confirm `PRAGMA user_version` equals the authorized schema version and `PRAGMA integrity_check` returns `ok`.
3. Start exactly one executor, with the CLIProxy base URL `http://127.0.0.1:8317` and the key set by the owner.
4. `GET /api/content/ai/status` must report `"configured": true`. This check spends no quota. Every allowlisted model must be `available: true`. A model is available only when CLIProxy's model list contains its provider model id from the route table in `src/platform/ai/creative-ai-gateway.ts`, so this check verifies the table, including Gemini 3.5 Flash Low → `gemini-3.8-flash-high` (owner, 2026-09-28). **Any `available: false` stops the task**: correct the table in a separate PR first.

## 3. Real calls (budget: 7 calls; nothing retries automatically)

The owner creates the fixture data through the UI: one brand with a logo and display rules; one catalog item with a tier and two product photos, plus a third photo if the multi-reference check needs it; one campaign; one locked insight.

| # | Model | Call | Pass when |
|---|---|---|---|
| 3.1 | GPT-5.6 Sol | 1 Big Idea | attempt `succeeded`; idea artifact stored and verifies; no “Ẩn” value in the stored input bundle |
| 3.2 | GPT-5.6 Luna | 1 Angle from 3.1 | as 3.1; branch code `A1` |
| 3.3 | Gemini 3.5 Flash Low | 1 Caption from 3.2 | as 3.1; `providerModel` = `gemini-3.8-flash-high` on the attempt row and in the artifact; contact footer appended by the system |
| 3.4 | GPT Image 2 | 1 Poster, one reference (product photo) | attempt `succeeded`; image validates; references in the package are exactly the ticked photo |
| 3.5 | GPT Image 2 | 1 Poster, product photo + logo (+ second photo) | as 3.4, with every reference recorded in order, product photo first |
| 3.6 | Gemini 3.1 Flash Image | 1 Poster, one reference | as 3.4 |
| 3.7 | Gemini 3.1 Flash Image | 1 Poster, multi-reference as 3.5 | as 3.5 |

The multi-reference result is recorded per image model. If a model rejects or ignores extra references, the release keeps “product photo first if only one reference is accepted” (release criterion 5). The owner then decides whether that model stays selectable for multi-reference Posters. The gateway caps references at 4 (`CLIPROXY_MAX_REFERENCES`).

**Evidence recorded per call:** attempt id, product model, provider model, status, duration and output artifact SHA-256. Do not record the generated text or image, prompt text, the key, or request/response bodies.

**Stop at once on:**
- any `failed` attempt whose error is not a provider rejection that the brief expects (3.5/3.7 reference rejection);
- any key-like string in a log, response, error or artifact;
- any unexpected error from the operator;
- an attempt left `running` after the call returns.

Do not retry. Record the evidence and report to the owner.

## 4. Restart check (optional; owner chooses, costs at most 1 call)

Release criterion 6 is already covered by CI with fake providers. A live check means stopping the executor while a text call is in flight, starting it again, and confirming that the attempt is `interrupted` and nothing retried. Skip it unless the owner wants live proof.

## 5. Verify after calls

1. `PRAGMA integrity_check` is `ok`; `PRAGMA user_version` is unchanged.
2. Every package references the exact brand revision, catalog snapshot and prompt versions it used (the package view shows them).
3. Only `.executor.lock` of the running executor exists; it is never deleted by hand.

## 6. Retire-Windows checklist (owner executes; the agent only prepares it)

- [ ] §3 passed for every model the owner wants to keep, and the owner has used Fedora for real work for an agreed period.
- [ ] Every brand, catalog item and prompt still needed has been re-entered on Fedora (no data migration; Windows data stays where it is).
- [ ] Windows Content Studio is stopped and no longer started at login; its data folder is kept read-only as an archive until the owner decides otherwise.
- [ ] Any CLIProxy client key used only by Windows is revoked by the owner.
- [ ] `docs/content-studio-release.md` records the retirement date and the Fedora merge SHA in use.

## 7. Report

The report names the SHA, schema version and date, and gives the §3 evidence table, the multi-reference result per image model, and any stop. It updates `docs/content-studio-release.md` §2 (053 status) and §5 (decisions) in a docs PR.
