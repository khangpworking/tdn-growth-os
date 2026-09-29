# Task 053 — Fedora live qualification

Status: **passed at `main` `2b208cdbd59ba6141ddf968c65e184d5122900f5` on 2026-09-29 (run 2): 6 real calls, all `succeeded`, schema v34, integrity ok; see §8.** The first authorization ([PR #81 comment](https://github.com/khangpworking/tdn-growth-os/pull/81#issuecomment-5885702572), `45b5147`) was used up to deploy and migrate: the Fedora UI rendered blank because the operator CSP blocked the research report validators (Ajv `new Function`), so no provider call was made (0 of 7). PR #84 (`1a4ae1f`) fixed it; PR #83 (`2b208cd`) set release criterion 8 to one Poster reference. Run 2 used the owner's re-confirmation for `2b208cd` and two revised authorizations that replaced the §3 table (see §8). Migration `0034_flow_content_ai_provider_model.sql`, schema v34 (#83 and #84 add no migration); no retry; no §4 restart call.
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
3. EXIF is decided (owner, 2026-09-29; this also settles 051 C3): reference photos are sent as uploaded, metadata included. For qualification, use photos whose metadata the owner is content to share with the image providers.
4. The owner has chosen where the CLIProxy key lives persistently (Task 049 P2 open item 6):
   - **(a)** exported in the private shell that starts the operator, as today;
   - **(b)** a systemd `EnvironmentFile=` outside the repository, mode 600, owned by the operator user.

   **Recommended: (a)**, with the key read without echo so it never enters shell history (`read -rs TDN_CLIPROXY_API_KEY; export TDN_CLIPROXY_API_KEY`). The operator is started by hand today and systemd units are out of scope (runbook, “Deliberately future work”); (b) becomes the right choice when the operator gets a service unit. The owner confirms the choice when authorizing this task.

   The owner types the key. The agent never sees, prints or stores it.

   **Decided 2026-09-29:** a mode-600 key file outside the repository, loaded in a subshell at start (§8).
5. A backup of the operator database (an online backup; Fedora has no `sqlite3` CLI, so the run uses a read-only `better-sqlite3` helper) was taken after the migration step and before the first call.

## 2. Deploy and migrate (runbook: `docs/runbooks/fedora-local-operator-runtime.md` §2–§4)

1. Check out the authorized SHA; `npm ci`; build.
2. Run the migration CLI against the operator database; confirm `PRAGMA user_version` equals the authorized schema version and `PRAGMA integrity_check` returns `ok`.
3. Start exactly one executor, with the CLIProxy base URL `http://127.0.0.1:8317` and the key set by the owner.
4. `GET /api/content/ai/status` must report `"configured": true`. This check spends no quota. Every allowlisted model must be `available: true`. A model is available only when CLIProxy's model list contains its provider model id from the route table in `src/platform/ai/creative-ai-gateway.ts`, so this check verifies the table, including Gemini 3.5 Flash Low → `gemini-3.8-flash-high` (owner, 2026-09-28). **Any `available: false` stops the task**: correct the table in a separate PR first.

## 3. Real calls (budget: 7 calls; nothing retries automatically)

> Run 2 replaced this table with 6 calls (2 Caption + Poster packages). The reasons and the result are in §8.

The owner creates the fixture data through the UI: one brand with a logo and display rules; one catalog item with a tier and two product photos; one campaign; one locked insight.

| # | Model | Call | Pass when |
|---|---|---|---|
| 3.1 | GPT-5.6 Sol | 1 Big Idea | attempt `succeeded`; idea artifact stored and verifies; no “Ẩn” value in the stored input bundle |
| 3.2 | GPT-5.6 Luna | 1 Angle from 3.1 | as 3.1; branch code `A1` |
| 3.3 | Gemini 3.5 Flash Low | 1 Caption from 3.2 | as 3.1; `providerModel` = `gemini-3.8-flash-high` on the attempt row and in the artifact; contact footer appended by the system |
| 3.4 | GPT Image 2 | 1 Poster, one reference (product photo) | attempt `succeeded`; image validates; references in the package are exactly the ticked photo |
| 3.5 | GPT Image 2 | 1 Poster, two product photos and the logo ticked | as 3.4; only the first ticked product photo is sent, and the logo is requested as a text wordmark (051 C4) |
| 3.6 | Gemini 3.1 Flash Image | 1 Poster, one reference | as 3.4 |
| 3.7 | Gemini 3.1 Flash Image | 1 Poster, ticked as 3.5 | as 3.5 |

The app sends **one** reference per Poster today: `POSTER_MAX_REFERENCES` in `src/modules/flow/content-poster-prompt.ts` is 1 for both image models (051 C4). Steps 3.5 and 3.7 check that fallback; they do not test multiple references. A real multi-reference check first needs a separate code PR that raises that limit for a model (the gateway itself accepts up to 4, `CLIPROXY_MAX_REFERENCES`), and then one extra call per model. Whether to do that is an owner decision tied to C4; until then the release relies on “product photo first if only one reference is accepted” (release criterion 5).

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

The report names the SHA, schema version and date, and gives the §3 evidence table, the single-reference fallback result per image model (3.5, 3.7), and any stop. It updates `docs/content-studio-release.md` §2 (053 status) and §5 (decisions) in a docs PR.

## 8. Result: run 2 (2026-09-29, `2b208cd`)

Authority, all on PR #81:
- [re-confirmation](https://github.com/khangpworking/tdn-growth-os/pull/81#issuecomment-5894011746);
- [revised authorization](https://github.com/khangpworking/tdn-growth-os/pull/81#issuecomment-5895453379);
- [revised authorization (2)](https://github.com/khangpworking/tdn-growth-os/pull/81#issuecomment-5895805490);
- [P1 accepted / P2 fixture](https://github.com/khangpworking/tdn-growth-os/pull/81#issuecomment-5895994976).

**Deploy.** The run went from `45b5147` to `2b208cd`. Backup B2 was taken before checkout (v34, integrity ok). The build ran, and the built assets contain no `new Function` or `eval(`. The migration applied nothing (currentVersion 34). `#/content` rendered, and the console showed no errors. The status check reported `configured: true`, and all five models were `available: true`.

**Key handling (owner decision, 2026-09-29).** This replaces option (a) in §1.4. The CLIProxy key is loaded from `~/.config/tdn-growth-os/cliproxy.env`, and the owner token from its owner-token file. Both files are mode 600 and outside the repository. The app is started through a subshell that loads the key file, so the key reaches only the operator process. The owner later allowed the Fedora agent to start the app and to unlock OWNER from these files, on the condition that it never prints them. The tmux pane key count was 0 after each stop.

**Why the §3 table changed.** The §3 table assumed each Caption and Poster was its own call. The UI does not work that way:
- Creating a package always runs **1 Caption + 1 Poster**, which is 2 calls.
- Poster settings are fixed per package.
- Both the UI and the server allow **one** reference photo (`POSTER_MAX_REFERENCES = 1`), so the two-photo steps 3.5 and 3.7 cannot be set up.

The owner therefore authorized 2 packages from `A1`, each with one product photo plus the logo. That makes 6 calls in total instead of 7.

**The §3.3 footer rule was wrong.** The contact block lists only brand contact values whose display level resolves to **Luôn** (`captionFooter`, `src/modules/flow/content-display-rules.ts`). The fixture brand had none, so P1 correctly shows no footer. For P2, a made-up hotline was added to the brand and set to Luôn with a row override, and P2 shows `Khối liên hệ: Hotline: …`.

| # | Call | Product → provider model | Attempt | State | Created → closed (UTC) |
|---|---|---|---|---|---|
| 3.1 | Big Idea `A` | gpt-5.6-sol → gpt-5.6-sol | in the Fedora 6E output | succeeded | ~15.5 s in the UI |
| 3.2 | Angle `A1` | gpt-5.6-luna → gpt-5.6-luna | in the Fedora 6E output | succeeded | ~5.4 s in the UI |
| P1 | Caption, package A1·1 | gemini-3.5-flash-low → gemini-3.8-flash-high | `451aed4b-d546-4d40-82bc-da93b93c1f89` | succeeded | 18:08:11.581 → 18:08:28.713 |
| P1 | Poster, package A1·1 (1 photo + logo) | gpt-image-2 → gpt-image-2 | `0f09f8f0-ead7-470c-8380-edd46eb82427` | succeeded | 18:08:28.773 → 18:08:59.405 |
| P2 | Caption, package A1·2 | gemini-3.5-flash-low → gemini-3.8-flash-high | `efb6c69b-e6fd-4e7c-80b9-ef70b7b99222` | succeeded | 18:20:46.459 → 18:20:59.402 |
| P2 | Poster, package A1·2 (1 photo + logo) | gemini-3.1-flash-image → gemini-3.1-flash-image | `e92a215d-004d-4e67-9cdb-36966fbebd0b` | succeeded | 18:20:59.460 → 18:21:15.036 |

The 6E read-only SELECT returned 6 rows, all `succeeded` with `error_code` null. Each package shows exactly one reference photo and has the logo option selected. There was no 7th call, no retry and no restart. After the run, the app was stopped and OWNER locked, port 8787 was free, no executor lock remained, and the database was `user_version` 34 with `integrity_check` ok.

**Not verified live.** CI covers each of these with fake providers:
- the attempt ids and times for 3.1 and 3.2;
- output artifact SHA-256 values (they are held in the Fedora 6E output and were not copied here);
- "no Ẩn value in the stored input bundle";
- the logo being sent as a text wordmark;
- the §5.2 pinned revisions.
