# Handoff — Task 049 Content Studio AI plumbing

Updated: 2026-09-27
Worktree/branch: `feature/049-content-ai-plumbing` from `main` `cfb234a`. Implemented from plan v5. **Uncommitted, no PR.** Migration 0025 is the next free number on that base.
Roles: Claude implemented production code, contracts, migration and docs and reviewed every GPT diff. GPT-5.6 Luna (Codex) wrote the CLIProxy adapter and designed and ran all tests.

Completed:
- **Gateway.** `CreativeAiGateway` in `src/platform/ai/`, a sibling of the unchanged analysis `AiGateway`: five allowlisted models, fixed error codes, a disabled gateway and a scripted fake for tests.
- **Configuration.** `TDN_CLIPROXY_BASE_URL` + `TDN_CLIPROXY_API_KEY`: numeric loopback only, both or neither, the key never echoed.
- **Adapter.** `createCliproxyCreativeGateway`: OpenAI chat, GPT Image 2 generations/edits, Gemini `generateContent`, `/v1/models`; size and time limits, redirect rejection, bounded body reads, drained error bodies, secret scan of raw bytes, parsed envelope, returned text and image bytes.
- **Data.** Migration 0025 `flow_content_ai_attempts`: STRICT, NULL-safe CHECKs, output/state matrix, close-once and no-replacement triggers, output FK to `artifact_manifests`.
- **Service.** `ContentAiAttemptService.run(input, { stage, persist })`: one gateway dispatch per attempt; output validated, stored, verified and registered before `stage` and the synchronous `persist` run; `ContentAiAttemptCloseError` when the close itself fails; `countRunning`, `list`.
- **Runtime.** Single executor per database (`<canonical db>.executor.lock`); executor-only startup sweep to `interrupted_by_restart`; startup refuses an older schema; `GET /api/content/ai/status` with a 5 min / 30 s discovery cache and shared in-flight listing; call-count preview.
- **Docs.** Brief (status, corrections, §9), ADR 0004 (Proposed), runbook (variables, migration order, executor lock and manual recovery), STATUS, release row.

Changed paths: see the brief's §8 “Owned paths”.

Evidence: see “Test results” below.

## To verify in Task 053 (first real calls)

- **Model ids are provisional.** Each route maps the product id to the same provider id (`gpt-5.6-sol`, `gpt-5.6-luna`, `gemini-3.5-flash-low`, `gpt-image-2`, `gemini-3.1-flash-image`). Confirm against CLIProxy's `/v1/models`.
- **Multi-reference GPT Image 2 edits** send repeated `image[]` fields (`source-<i>.png|jpg`). One reference uses the old runner's single `image` field. The multi-reference form is unverified against CLIProxy.
- **Gemini auth** sends both `Authorization: Bearer` and `x-goog-api-key`, copied from the old runner. Confirm CLIProxy accepts both.
- **Decoded image output is capped at 8 MiB** (the old runner allowed 20 MiB) because `inspectContentImage` caps PHOTO images at 8 MiB. Measure real output sizes.

### Deliberate departures from the old Content Studio code

- **Text:**
  - The base URL is root-only; the old client accepted `/v1` or `/chat/completions` suffixes.
  - Models come from a fixed allowlist.
  - Two system messages (system layer, creative layer) instead of one.
  - Default temperature 0.7 instead of 0.
  - Adds `stream: false`, `max_tokens` and `response_format`.
  - Empty content is an error.
  - Usage keeps only input and output tokens.
  - Returns the provider `id`.
  - Drops status and byte-count metadata.
  - Limits are 1 MiB / 2 MiB / 120 s (were 64 KiB / 64 KiB / 45 s).
- **Images:**
  - Multipart is built with `FormData`.
  - Multiple references are new.
  - WebP data URLs are rejected.
  - MIME is sniffed from the bytes by the service; the envelope type is only cross-checked.
  - Output is capped at 8 MiB.
  - Dimensions, digest and the size-mismatch warning moved to the service.
- **Transport:**
  - Adds `Accept`, redirect rejection and a charset on JSON bodies.
  - Non-2xx bodies are drained (≤ 4 KiB) and discarded.
  - Error codes are the fixed set.

## Test results

Local Windows, Node 24.15.0. GPT designed and ran the focused suites, and Claude reran the full suite. Linux CI has not run (no PR yet) and is authoritative for Fedora.

- **Typecheck:** clean (246 files). `git diff --check` is clean. Regenerating the contracts leaves the committed output byte-identical.
- **New focused suites:**

  | Suite | Result |
  |---|---|
  | adapter | 11/11 |
  | configuration | 5/5 |
  | gateway | 4/4 |
  | status source | 4/4 |
  | call count | 2/2 |
  | migration | 5/5 |
  | attempt service | 10/10 |
  | status route | 2/2 |
  | operator | 0/8 on Windows; 8/8 with a scratch preload |

  The operator failures come from the directory-mode limitation below. The preload only adds execute bits to directory modes and is not in the repository.
- **Existing suites with the schema head raised to 25:**

  | Suite | Result |
  |---|---|
  | brand | 6/6 |
  | catalog | 7/7 |
  | prompt | 8/8 |
  | campaign migration | 2/2 |
  | SQLite foundation | 9/9 |
  | source-package intake | 4/4 |
  | Shopee file research | 15/20 |

  The five Shopee failures are baseline failures (Apify `fsync` `EPERM`).
- **Root `npm test`:** 407/431.
  - The same-base baseline at `cfb234a` gives 364/380, with 16 Windows-only failures.
  - Compared with the baseline, the only new failures are the 8 operator tests above. The 16 baseline failures are unchanged: operator-app/Task045 `frontend/dist`, Apify 015/016 `EPERM`, and 023 symlink `EPERM`.
- **Frontend:** not changed by 049, so the frontend typecheck, build and tests were not rerun.
- **Protected files:** the analysis gateway files and `content-image.ts` are identical to `cfb234a`.

## Review findings

- **Timeout mapping (adapter).** A transport that rejected with its own `TimeoutError`/`AbortError` was reported as `timeout`, although the adapter's timer had not fired. It now uses the fired signal only, in all four places, with a regression test.
- **GPT's test fixes (reviewed):**
  - Direct terminal-row fixtures now follow the running → terminal trigger.
  - The status-route AJV test registers the referenced flow schemas.
  - The catalog test's flow-table list includes `flow_content_ai_attempts`.
- **Other checks:** no assertion was weakened, and no production defect was found by the tests.

## Limitations and unresolved

- **No live call was made.** Provider compatibility is unproven until 053, which needs its own owner authorization.
- **Startup requires migration 0025.** Apply the runbook migration step before starting a build that contains it.
- **A killed executor leaves its lock.** The next executor start fails until the owner follows the manual recovery in the runbook. This is deliberate (ADR 0004).
- **Bounded recovery.** Only attempts with a committed output reference can later reuse bytes without a new provider call. A crash between storing bytes and closing the attempt leaves unlinked bytes that the sweep does not relink.
- **Where the key is stored persistently on Fedora** is decided in 053.
- **Windows:** directory `stat.mode` has no execute bits, so `preloadFrontend` rejects `frontend/dist` as unreadable. Operator-app tests that load the real frontend fail on Windows for this pre-existing reason; Linux CI is authoritative.

Next action: owner review of the uncommitted diff; on approval, commit, open a draft PR and let Linux CI run.
Business decisions pending:
- Accept ADR 0004.
- Persistent key storage (053).
- Strip EXIF metadata before live Poster calls?
