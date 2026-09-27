# Task 049 — Content Studio AI plumbing

Status: IMPLEMENTED LOCALLY, IN REVIEW (plan v5, 2026-09-27). Uncommitted; no PR has been opened. The owner approved the Controlled lane, P1, P2 and P5 on 2026-09-27 and delegated completion of the v5 design; P3/P4 are implemented with **provisional** model ids that Task 053 must verify before any real call. The corrections of plan v5 are applied below; §9 records them.
Lane: **Controlled** (provider and credential boundary; Task 047 §8, ADR 0003 decision 5)
Owner/worktree: `feature/049-content-ai-plumbing`, from `main` `cfb234a`.
Goal: the application-owned path that 050 and 051 use for every creative AI call. That path covers:
- a creative gateway for text and images;
- a CLIProxy adapter behind it;
- an attempt record for every call, with an executor-only startup sweep that turns `running` into `interrupted`;
- model discovery that spends no quota;
- a call-count helper;
- fake providers, so every test runs without a network.

**No real provider call is made or authorized by this task.** Tests use injected fake transports. CI never opens a network connection. The first real call on Fedora is Task 053 and needs its own owner authorization (ADR 0003 decision 5).

Non-goals:
- **Any generation screen, route or prompt assembly.** Insight, Big Idea and Angle are 050; Caption and Poster are 051. So are the input-bundle builders, the brand-fact check and the “Đang tạo · n” tray.
- **Automatic retries** (Task 047 §1: none, ever); queues or background workers; streaming responses.
- **AI edit proposals** (052, deferred by the owner).
- **Changes to the analysis `AiGateway`** and its callers (`interpretation-service.ts`, `research-evidence-audit-service.ts`). See P1.
- **EXIF stripping of reference photos:** an open owner decision, needed before the first live Poster calls in 051/053.
- Deployment, Fedora configuration, credentials in the repository.

Dependencies: Task 047 §3 (AiAttempt), §4 (attempt lifecycle, call count, models, Poster references), §6, §7 (CLIProxy reuse inventory and lessons); ADR 0003 decision 5; AGENTS.md (Controlled lane, “provider calls … require task-specific authorization”); 048b image validation (`content-image.ts`, `content-jpeg.ts`); 048c model enum (`ContentPromptModel`).

## 0. Owner decisions

Fedora facts (reported by the Fedora agent on 2026-09-27, read-only, no request sent): CLIProxyAPI 7.2.110 listens on `127.0.0.1:8317` under the user systemd unit `cliproxyapi.service`. It requires a client API key (one is configured). It defines no model aliases. Its routes include all four endpoint families in P3; none was called. It configures no request-size, timeout or rate limits, so the application-side limits in §2 are the only ones.

| # | Decision | Recommendation |
|---|---|---|
| P1 | Gateway shape (**approved** 2026-09-27) | A **new `CreativeAiGateway`** interface in `src/platform/ai/`, next to the analysis `AiGateway`, which stays byte-identical. The analysis gateway is typed to market-snapshot and evidence-index inputs; widening it would touch two governed analysis services for no benefit. ADR 0003 says “mở rộng”; a sibling interface under the same platform boundary satisfies it without re-testing B-analysis. |
| P2 | Configuration and credentials (**approved** 2026-09-27) | Two optional environment variables read by `operatorAppConfigurationFromEnvironment`: `TDN_CLIPROXY_BASE_URL` and `TDN_CLIPROXY_API_KEY`. The base URL must be exactly `http://127.0.0.1:<port>` or `http://[::1]:<port>` with an optional trailing `/` (numeric loopback only; `localhost` is rejected because it goes through name resolution), with no user info, path, query or fragment: CLIProxy runs on the same Fedora host, and this rule blocks sending the key anywhere else. The key must be 1–512 printable ASCII characters with no whitespace. On Fedora the value is `http://127.0.0.1:8317`. In 049 both variables are exported in the private shell that starts the operator, like `TDN_OWNER_API_TOKEN`; any persistent mechanism (for example a systemd `EnvironmentFile=` outside the repository, mode 600) is a Task 053 runbook decision. **If both variables are unset, AI is disabled:** the operator starts normally and every AI entry point reports `ai_not_configured` (“Chưa cấu hình AI”). **If exactly one is set, startup fails**: a half-configured operator is almost always a typo. The key is never logged, returned by an API, stored in the database or put in an error message. |
| P3 | Models and routing (pending: ids unverified) | The allowlist is exactly the existing `ContentPromptModel` enum (GPT-5.6 Sol, GPT-5.6 Luna, Gemini 3.5 Flash Low; GPT Image 2, Gemini 3.1 Flash Image). A fixed table maps each to its CLIProxy model id and endpoint family. Following the old client: text uses `POST /v1/chat/completions`; GPT Image 2 uses `/v1/images/generations` (no reference) and `/v1/images/edits` (with references); Gemini 3.1 Flash Image uses `/v1beta/models/<id>:generateContent` with inline references. The exact CLIProxy model ids are **unverified**: the Fedora agent's safety guard blocked `GET /v1/models`. The table is one constant, so 049 ships with the enum values as provisional ids. The ids are then verified from the owner's model list, or at the latest in 053 before any real call. A wrong id shows up as `available: false` in P4, never as a silent call to another model. |
| P4 | Model discovery (pending, with P3) | `GET /v1/models` on CLIProxy: listing spends no generation quota. The result is intersected with the allowlist and never adds a model. It is exposed to the UI as `GET /api/content/ai/status` → `{ contractVersion, configured, checkedAt, error?, models: [{ id, kind: text\|image, available }] }`. A successful listing is cached for 5 minutes and a failed one for 30 seconds; concurrent reads share one in-flight listing. A failed listing reports `available: false` with a safe error code rather than failing the page. |
| P5 | Attempt storage (**approved** 2026-09-27) | Migration 0025 (next free number on `main`) adds `flow_content_ai_attempts`. A row is written as `running` **before** the provider call and closed exactly once, to `succeeded`, `failed` or `interrupted`. Triggers forbid every other update and all deletes. Only the executor (the operator with owner writes enabled, holding the executor lock) runs the startup sweep inside `openOperatorApp`, before it accepts requests; read-only operators never sweep. A later manual retry is a new attempt with a `retry_of` reference; nothing retries automatically. |

## 1. Data (migration 0025)

`flow_content_ai_attempts` (`STRICT`; content tables use the `flow_content_` prefix):
- `attempt_id` (text primary key), `kind` (`generate` in 049; the check constraint also admits `edit` for 052), `modality` (`text` / `image`, consistent with the model);
- `target_type` and `target_id`: which 050/051 record the call is for (free text checked for shape here; 050/051 own their meaning);
- `model` (in the allowlist), `prompt_ref` (a system or user prompt id plus version, or the SHA-256 of a freestyle prompt), `input_bundle_sha256`, `planned_action_call_count` (integer 1–100; see §4);
- `state` (`running` / `succeeded` / `failed` / `interrupted`), `error_code` (null unless `failed` or `interrupted`; from a closed list that adds `persist_failed` and `interrupted_by_restart` to the gateway codes), `retry_of` (nullable reference to a `failed` or `interrupted` attempt for the same target);
- `created_at`, `closed_at`, `actor_id`;
- `output_sha256` (references `artifact_manifests`), `latency_ms`, `provider_request_id`, `input_tokens`, `output_tokens` (audit metadata required by ARCHITECTURE.md; provider metadata only on success).

Output/state matrix: `succeeded` always carries `output_sha256`; `failed` carries one only with `persist_failed` (the output was stored and registered, then the domain write failed); `running` and `interrupted` never do.

Triggers:
- insert only as `running`, with `closed_at`, `error_code`, outputs and metadata null; `INSERT OR REPLACE` of an existing id is refused;
- the only allowed update is `running` → a terminal state, setting `closed_at` ≥ `created_at` under the matrix above; identity columns never change;
- no delete.

Every CHECK and trigger condition evaluates to exactly 0 or 1 (`IS` / `IS NOT` / `coalesce`), so a NULL cannot slip a row through.

Schema-version assertions go from 24 to 25. Migrations 0001–0024 are not edited.

No prompt text, input text, image bytes, provider response body or credential is stored in this table. Output bytes live in the content-addressed artifact store with a registered `artifact_manifests` entry; the 050/051 domain records that use them are written by those services through the synchronous `persist` step (§3).

## 2. Platform: `CreativeAiGateway` and the CLIProxy adapter

In `src/platform/ai/creative-ai-gateway.ts`:

```ts
interface CreativeAiGateway {
  generateText(request: CreativeTextRequest): Promise<CreativeTextResult>;
  generateImage(request: CreativeImageRequest): Promise<CreativeImageResult>;
  listModels(): Promise<readonly CreativeModelAvailability[]>;
}
```

- **Text request:** model, system layer, creative layer, user input, an optional JSON Schema for structured output, and limits.
- **Image request:** model, prompt, size preset and up to N ordered reference images (bytes plus media type). N is 4 unless P3's verification says otherwise; 047 §4's “product photo first” ordering is the caller's job.
- **Results** carry the output (text, or image bytes plus media type), usage, latency and a provider request id when one is returned. Failures are typed `CreativeAiError`s with a closed code list: `ai_not_configured`, `model_not_allowed`, `request_too_large`, `timeout`, `network_error`, `gateway_http_error`, `malformed_envelope`, `response_too_large`, `invalid_image`, `schema_mismatch`. Each code maps to one safe Vietnamese message.

The adapter (`src/platform/ai/cliproxy-creative-gateway.ts`) ports the old client's safeguards (Task 047 §7), not its code style:
- an injected `transport` (defaults to `fetch`), so tests never touch the network;
- request, response and timeout limits enforced while streaming the response body (port `boundedResponseText`); non-2xx bodies are drained (≤ 4 KiB) and discarded; every abandoned body is cancelled;
- `temperature` set per request (default 0.7) rather than fixed at 0;
- image bytes decoded from `b64_json` or Gemini `inlineData` with strict base64 and bounded to 8 MiB;
- `redirect: 'error'`, so the key is never forwarded;
- a response that contains the key (raw bytes, any parsed envelope key or string, the text or its parsed JSON, decoded image bytes) is rejected as `malformed_envelope`, and every error leaving the adapter is a fresh `CreativeAiError` with no `cause`.

**Validation layering.** The adapter (platform) decodes and bounds bytes only. Image sniffing, `inspectContentImage` (the 048b validators) and structured-output AJV checks run in the attempts service (modules/flow), which owns `invalid_image` and `schema_mismatch`.

## 3. Attempts service and startup sweep

`src/modules/flow/content-ai-attempt-service.ts`:
- `run(input, { stage, persist })`: validates the input before writing anything (preflight rejection writes no row; an unconfigured gateway throws `ai_not_configured` with no row), writes the `running` row, makes **one** gateway call, validates the output (JSON + AJV when a `responseSchema` is given; PNG/JPEG sniffing and `inspectContentImage` for images), then:
  1. stores the exact bytes in a plain `ContentAddressedArtifactStore(artifactRoot)`, verifies the digest and registers the `artifact_manifests` entry in its own short transaction (images: sniffed media type; text: `application/json` when it parses, else `text/plain`). If this fails, the row closes `failed / persist_failed` with no output reference;
  2. runs the caller's `stage` (derived, reconstructable artifacts; may be async);
  3. runs the caller's **synchronous** `persist` inside the transaction that closes the row `succeeded`. If `stage` or `persist` throws, the domain writes roll back and a separate transaction closes the row `failed / persist_failed` **with** the output digest; the manifest and bytes survive.
  The row is closed exactly once. If even the failure close fails, `ContentAiAttemptCloseError` carries the attempt id and digest.
- `sweepInterrupted(now)`: one transaction that turns every `running` row into `interrupted` (`error_code = 'interrupted_by_restart'`) and returns the count. `countRunning()` counts them read-only.
- `list(filter)` for 050/051 reads.

**Executor and viewer split.** Only an operator with owner writes enabled is an executor. At startup the executor acquires `<canonical db>.executor.lock` (exclusive create; any existing lock, including a stale or incomplete one, stops startup and is never modified), verifies the schema is at head on a read-only connection, counts `running` rows, and opens a short-lived writable connection for `sweepInterrupted` only when the count is nonzero, all before listening. A sweep failure stops startup. Read-only operators never take the lock and never sweep. A killed executor leaves its lock; the runbook's manual recovery is required before the next executor start.

**Recovery is bounded.** Only an attempt with a committed output reference and verifiable bytes/manifest can support later owner-requested reuse without a provider call (050/051 may implement it). A crash before the association is recorded may leave unassociated bytes that the sweep cannot reconstruct. 049 adds no recovery endpoint, orphan cleaner or worker.

## 4. Call-count helper

`src/modules/flow/content-ai-call-count.ts` (shared with the frontend through the existing contracts/shared pattern if one fits, otherwise duplicated with a parity test):
- a pure function that turns a planned action into `{ text, image, total }` calls plus the Vietnamese label from Task 047 §4 (“2 × 2 Big Idea = 4 lượt AI”, “3 Caption + 3 Poster”);
- 050/051 call it before running, and store its `total` as each attempt's `planned_action_call_count`.

`planned_action_call_count` (renamed from `call_count`) is **not additive**: six attempts of a six-call action each store 6. Each admitted attempt dispatches at most one gateway operation; rows count recorded attempts, not confirmed HTTP requests, billable calls or charges. A row can exist before dispatch or before an adapter-side rejection, and an unknown provider outcome stays unknown. An action id is added only when 050/051's batch workflow needs one.

## 5. API

- **Read:** `GET /api/content/ai/status` (P4). It never returns the base URL or key.
- No OWNER write route in 049; generation routes arrive with 050/051.

## 6. Risks and recovery (Controlled lane)

| Risk | Control | Recovery |
|---|---|---|
| Key leaked through logs, errors, API responses or a redirect | Loopback-only base URL; `redirect: 'error'`; the key is only in the `Authorization` header; tests assert that it is absent from every error, log line, API body and database row | Rotate the CLIProxy key on Fedora; unset the variables to disable AI |
| Unbounded cost or hung calls | No automatic retry; per-call timeout; call count shown before running (050/051); one attempt row per call | Kill the operator; after the manual lock recovery, the next executor start marks the attempts `interrupted` |
| Crash mid-call leaves `running` rows (the I73 lesson) | Executor-only startup sweep before serving; the triggers make “closed exactly once” a database rule | Manual stale-lock recovery (runbook), then one executor restart sweeps; restart and recovery tests for every attempt state |
| Two executors on one database (double sweep, racing writes) | Exclusive `<canonical db>.executor.lock`; realpath-canonical path; hard-linked databases rejected; any existing lock blocks startup | Stop all executors and starters, confirm ownership, remove only the confirmed stale lock (runbook) |
| Schema older than the build | Startup refuses unless `user_version` and `schema_migrations` both equal the newest migration | Apply migrations with the runbook step, then start |
| Hostile or oversized provider output | Streaming byte limit; strict envelope parsing; image validation; structured-output schema check | The attempt fails with a typed code; nothing is written downstream |
| Migration 0025 on the operator | Additive table only; no backfill | Apply it with the runbook migration step before starting a build that contains it. Rolling back the build leaves an unused table |
| Wrong CLIProxy model ids | Fixed allowlist table; discovery shows unavailable models | Correct the table in 053 before the first real call |

**Independent review is justified:** this is the first code that holds a provider credential and sends requests out of the application.

## 7. Acceptance

1. With no CLIProxy variables, the operator starts, `GET /api/content/ai/status` reports `configured: false`, and every gateway method fails with `ai_not_configured`.
2. The configuration is rejected unless it is exactly as in P2: `localhost` or any non-numeric-loopback host, `https`, user info, a path, query or fragment, a weak key, or exactly one variable set all fail startup with a message that includes neither the key nor the raw URL.
3. With a fake transport: text and both image families produce the right URL, method, headers and body; references keep their order; the documented envelopes parse; every failure code in §2 is produced by the matching fault (timeout, abort, HTTP error, malformed JSON, missing content, oversized declared and streamed bodies, invalid image bytes, schema mismatch, a redirect).
4. The key appears in no error message, log line, API response or database row in any test.
5. Attempts: a success, a provider failure and a validation failure each leave exactly one closed row; direct SQL cannot insert a non-running row, update a closed row, reopen one, move `closed_at` before `created_at` or delete a row.
6. Restart: only the lock-owning executor sweeps, before any request is served; a `running` row becomes `interrupted`; closed rows are untouched; a sweep failure stops startup; any existing lock (even incomplete or stale) blocks a second executor; a viewer never sweeps. Success requires verified stored bytes, a registered manifest and a synchronous persist; a failed persist keeps the verified output reference.
7. Discovery intersects the proxy's list with the allowlist, never adds a model, caches for 5 minutes (30 seconds after a failure), shares in-flight listings and degrades to `available: false` on failure.
8. The call-count helper matches the 047 §4 examples.
9. The analysis `AiGateway` files and their tests are unchanged. `npm run check` is green on Linux CI, and no test opens a network connection.

## 8. Owned paths

- **Database:** `migrations/0025_flow_content_ai_attempts.sql` (take the next free number from merged `main`).
- **Contracts:** `contracts/api/content-api.schema.json` (AI status defs) and its generated file; an attempt artifact schema only if 050 needs it now (otherwise 050 adds it).
- **Platform:** `src/platform/ai/creative-ai-gateway.ts`, `cliproxy-configuration.ts`, `cliproxy-creative-gateway.ts`, `fake-creative-gateway.ts`, `index.ts` (new exports only).
- **Backend:** `src/modules/flow/content-ai-attempt-service.ts`, `content-ai-call-count.ts`, `content-ai-status.ts`, `index.ts`; `src/api/content-api.ts` (status route, `REQUIRED_TABLES`); `src/api/operator-app.ts` (configuration, the `openOperatorApp` dependency parameter, gateway wiring, startup checks and executor-only sweep); `src/api/executor-lock.ts`.
- **Tests:** `tests/unit/content-ai-*.test.ts`, `tests/integration/content-ai-*.test.ts`, and the current-head schema-version assertions (24 → 25) in the existing test files that make them.
- **Docs:** `docs/adr/0004-content-ai-synchronous-attempts.md`, `docs/STATUS.md`, `docs/content-studio-release.md`, `docs/runbooks/fedora-local-operator-runtime.md` (environment variables, migrations, executor lock), this brief, `docs/handoffs/049-content-ai-plumbing.md`.

Existing Content Studio manifest helpers are reused without modification.

Minimum verification: `npm run check` green on Linux CI. Locally, all new tests pass with no failures beyond the known Windows-only set. Codex pre-review of the branch, then the independent review (required for this lane).

Escalate when:
- a change is needed outside the owned paths, including the analysis gateway;
- an existing assertion must be weakened;
- any step would need a real provider call, a real key, network access in tests, or Fedora access;
- the owner's CLIProxy model ids or endpoints differ from P3 in a way that changes the gateway interface.

## 9. Implementation notes

Implemented from plan v5 (2026-09-27). Claude wrote the production code and docs; GPT-5.6 Luna (Codex) wrote the CLIProxy adapter and designed and ran the tests; Claude reviewed every GPT diff.

Deviations from the original draft of this brief (plan v5 corrections, applied above):
1. Table `flow_content_ai_attempts` instead of `content_ai_attempts`.
2. Validation layering: the adapter only decodes and bounds bytes; the service owns image validation and schema checks (`invalid_image`, `schema_mismatch`).
3. P2 numeric loopback only (`localhost` rejected).
4. One executor per canonical database with a conservative lock and manual stale-lock recovery; viewers never sweep. This replaces "sweep on every start".
5. Discovery cache: 5 minutes on success, 30 seconds on failure, shared in-flight listing.
6. The key's persistent home on Fedora is a Task 053 decision; 049 documents shell-exported variables.
7. New ADR 0004 (Proposed) records the synchronous-attempt exception to ARCHITECTURE.md §3 rule 5; ADR 0003 is not edited.
8. Output is stored and its manifest registered before dependent persistence; `failed / persist_failed` may keep the verified output reference.
9. Audit metadata: `latency_ms`, `provider_request_id`, `input_tokens`, `output_tokens` columns instead of `usage_json`.
10. Owned paths extended (§8).
11. Exactly one CLIProxy variable set fails startup.
12. A migration check was added: startup refuses a schema that is not at the newest migration.
13. `call_count` renamed `planned_action_call_count`, bounded 1–100, not additive.
14. Integration boundaries: the analysis `AiGateway` is not widened; the table records creative AI calls only; ADR 0004's exception is scoped to Content Studio.

Also found during implementation: `openOperatorApp` now resolves `TDN_WORKSPACE_DB` with `realpath` and requires an existing regular file (`TDN_WORKSPACE_DB must name an existing database file`). Test results, review findings and remaining limitations are in `docs/handoffs/049-content-ai-plumbing.md`.
