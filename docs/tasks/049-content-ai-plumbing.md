# Task 049 — Content Studio AI plumbing

Status: DRAFT. The owner approved the Controlled lane, P1 and P5 on 2026-09-27; P2 and P3/P4 are pending (see §0).
Lane: **Controlled** (provider and credential boundary; Task 047 §8, ADR 0003 decision 5)
Owner/worktree: `feature/049-content-ai-plumbing`, from `main` `cfb234a`.
Goal: the application-owned path that 050 and 051 use for every creative AI call. That path covers:
- a creative gateway for text and images;
- a CLIProxy adapter behind it;
- an attempt record for every call, with a startup sweep that turns `running` into `interrupted`;
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
| P2 | Configuration and credentials (pending) | Two optional environment variables read by `operatorAppConfigurationFromEnvironment`: `TDN_CLIPROXY_BASE_URL` and `TDN_CLIPROXY_API_KEY`. The base URL must be `http://127.0.0.1:<port>`, `http://[::1]:<port>` or `http://localhost:<port>`, with no user info, query or fragment: CLIProxy runs on the same Fedora host, and this rule blocks sending the key anywhere else. The key must be 1–512 printable ASCII characters with no whitespace. On Fedora the value is `http://127.0.0.1:8317`, and the key lives in an env file outside the repository (mode 600) that the operator start command loads. **If either variable is unset, AI is disabled:** the operator starts normally and every AI entry point reports `ai_not_configured` (“Chưa cấu hình AI”). The key is never logged, returned by an API, stored in the database or put in an error message. |
| P3 | Models and routing (pending: ids unverified) | The allowlist is exactly the existing `ContentPromptModel` enum (GPT-5.6 Sol, GPT-5.6 Luna, Gemini 3.5 Flash Low; GPT Image 2, Gemini 3.1 Flash Image). A fixed table maps each to its CLIProxy model id and endpoint family. Following the old client: text uses `POST /v1/chat/completions`; GPT Image 2 uses `/v1/images/generations` (no reference) and `/v1/images/edits` (with references); Gemini 3.1 Flash Image uses `/v1beta/models/<id>:generateContent` with inline references. The exact CLIProxy model ids are **unverified**: the Fedora agent's safety guard blocked `GET /v1/models`. The table is one constant, so 049 ships with the enum values as provisional ids. The ids are then verified from the owner's model list, or at the latest in 053 before any real call. A wrong id shows up as `available: false` in P4, never as a silent call to another model. |
| P4 | Model discovery (pending, with P3) | `GET /v1/models` on CLIProxy: listing spends no generation quota. The result is intersected with the allowlist and never adds a model. It is exposed to the UI as `GET /api/content/ai/status` → `{ configured, models: [{ id, kind: text\|image, available }], checkedAt }`. The result is cached for 5 minutes, and a failed listing reports `available: false` with a safe error code rather than failing the page. |
| P5 | Attempt storage (**approved** 2026-09-27) | Migration 0025 (next free number on `main`) adds `content_ai_attempts`. A row is written as `running` **before** the provider call and closed exactly once, to `succeeded`, `failed` or `interrupted`. Triggers forbid every other update and all deletes. The operator runs the startup sweep inside `openOperatorApp`, before it accepts requests. A later manual retry is a new attempt with a `retry_of` reference; nothing retries automatically. |

## 1. Data (migration 0025, provisional number)

`content_ai_attempts`:
- `attempt_id` (text primary key), `kind` (`generate` in 049; the check constraint also admits `edit` for 052), `modality` (`text` / `image`);
- `target_type` and `target_id`: which 050/051 record the call is for (free text checked for shape here; 050/051 own their meaning);
- `model` (in the allowlist), `prompt_ref` (a system or user prompt id plus version, or the SHA-256 of a freestyle prompt), `input_bundle_sha256`, `call_count` (integer ≥ 1, the calls this attempt represents);
- `state` (`running` / `succeeded` / `failed` / `interrupted`), `error_code` (null unless `failed` or `interrupted`; from a closed list), `retry_of` (nullable reference to another attempt);
- `created_at`, `closed_at`, `actor_id`; `output_sha256` and `usage_json` (token counts only) when succeeded.

Triggers:
- insert only as `running`, with `closed_at`, `error_code` and outputs null;
- the only allowed update is `running` → a terminal state, setting `closed_at` ≥ `created_at`, with `error_code` present exactly for `failed`/`interrupted` and `output_sha256` present exactly for `succeeded`;
- no delete.

Schema-version assertions go from 24 to 25. Migrations 0001–0024 are not edited.

No prompt text, input text, image bytes, provider response body or credential is stored in this table. Outputs are stored by the 050/051 services that own them.

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
- request, response and timeout limits enforced while streaming the response body (port `boundedResponseText`);
- `temperature` set per request rather than fixed at 0;
- image bytes decoded from `b64_json` or Gemini `inlineData`, then checked with the 048b validators (PNG/JPEG only, fully decodable, size and dimension limits) before they are returned;
- `redirect: 'error'`, so the key is never forwarded.

## 3. Attempts service and startup sweep

`src/modules/flow/content-ai-attempt-service.ts`:
- `run(input, call)`: writes the `running` row, calls the gateway through `call`, validates the output (structured-output schema when given), closes the row as `succeeded` or `failed`, and returns the result or rethrows the typed error. The row is always closed exactly once, including when validation throws.
- `sweepInterrupted(now)`: one transaction that turns every `running` row into `interrupted` (`error_code = 'interrupted_by_restart'`) and returns the count.
- `list(filter)` for 050/051 reads.

The operator calls `sweepInterrupted` during startup, after the migration check and before listening. A sweep failure stops startup, like other startup failures.

## 4. Call-count helper

`src/modules/flow/content-ai-call-count.ts` (shared with the frontend through the existing contracts/shared pattern if one fits, otherwise duplicated with a parity test):
- a pure function that turns a planned action into `{ text, image, total }` calls plus the Vietnamese label from Task 047 §4 (“2 × 2 Big Idea = 4 lượt AI”, “3 Caption + 3 Poster”);
- 050/051 call it before running, and store its `total` as the attempt's `call_count`.

## 5. API

- **Read:** `GET /api/content/ai/status` (P4). It never returns the base URL or key.
- No OWNER write route in 049; generation routes arrive with 050/051.

## 6. Risks and recovery (Controlled lane)

| Risk | Control | Recovery |
|---|---|---|
| Key leaked through logs, errors, API responses or a redirect | Loopback-only base URL; `redirect: 'error'`; the key is only in the `Authorization` header; tests assert that it is absent from every error, log line, API body and database row | Rotate the CLIProxy key on Fedora; unset the variables to disable AI |
| Unbounded cost or hung calls | No automatic retry; per-call timeout; call count shown before running (050/051); one attempt row per action | Kill the operator; the sweep marks the attempts `interrupted` on the next start |
| Crash mid-call leaves `running` rows (the I73 lesson) | Startup sweep before serving; the triggers make “closed exactly once” a database rule | A restart is itself the recovery; restart and recovery tests for every attempt state |
| Hostile or oversized provider output | Streaming byte limit; strict envelope parsing; image validation; structured-output schema check | The attempt fails with a typed code; nothing is written downstream |
| Migration 0025 on the operator | Additive table only; no backfill | Apply it with the runbook migration step before starting a build that contains it. Rolling back the build leaves an unused table |
| Wrong CLIProxy model ids | Fixed allowlist table; discovery shows unavailable models | Correct the table in 053 before the first real call |

**Independent review is justified:** this is the first code that holds a provider credential and sends requests out of the application.

## 7. Acceptance

1. With no CLIProxy variables, the operator starts, `GET /api/content/ai/status` reports `configured: false`, and every gateway method fails with `ai_not_configured`.
2. The configuration is rejected unless it is exactly as in P2: non-loopback hosts, `https` to a remote host, user info, a query or fragment, or a weak key all fail startup with a message that doesn't include the key.
3. With a fake transport: text and both image families produce the right URL, method, headers and body; references keep their order; the documented envelopes parse; every failure code in §2 is produced by the matching fault (timeout, abort, HTTP error, malformed JSON, missing content, oversized declared and streamed bodies, invalid image bytes, schema mismatch, a redirect).
4. The key appears in no error message, log line, API response or database row in any test.
5. Attempts: a success, a provider failure and a validation failure each leave exactly one closed row; direct SQL cannot insert a non-running row, update a closed row, reopen one, move `closed_at` before `created_at` or delete a row.
6. Restart: a `running` row left by a killed process becomes `interrupted` on the next open, before any request is served; closed rows are untouched; a sweep failure stops startup.
7. Discovery intersects the proxy's list with the allowlist, never adds a model, caches for 5 minutes and degrades to `available: false` on failure.
8. The call-count helper matches the 047 §4 examples.
9. The analysis `AiGateway` files and their tests are unchanged. `npm run check` is green on Linux CI, and no test opens a network connection.

## 8. Owned paths

- **Database:** `migrations/0025_flow_content_ai_attempts.sql` (take the next free number from merged `main`).
- **Contracts:** `contracts/api/content-api.schema.json` (AI status defs) and its generated file; an attempt artifact schema only if 050 needs it now (otherwise 050 adds it).
- **Platform:** `src/platform/ai/creative-ai-gateway.ts`, `cliproxy-creative-gateway.ts`, `fake-creative-gateway.ts`, `index.ts` (new exports only).
- **Backend:** `src/modules/flow/content-ai-attempt-service.ts`, `content-ai-call-count.ts`, `index.ts`; `src/api/content-api.ts` (status route); `src/api/operator-app.ts` (configuration, gateway wiring, startup sweep).
- **Tests:** `tests/unit/content-ai-*.test.ts` (adapter, call count), `tests/integration/content-ai-*.test.ts` (migration, attempts, sweep, status route), and the schema-version assertions (24 → 25).
- **Docs:** `docs/STATUS.md`, `docs/content-studio-release.md`, the operator runbook section on environment variables and migrations, this brief, `docs/handoffs/049-content-ai-plumbing.md`.

Minimum verification: `npm run check` green on Linux CI. Locally, all new tests pass with no failures beyond the known Windows-only set. Codex pre-review of the branch, then the independent review (required for this lane).

Escalate when:
- a change is needed outside the owned paths, including the analysis gateway;
- an existing assertion must be weakened;
- any step would need a real provider call, a real key, network access in tests, or Fedora access;
- the owner's CLIProxy model ids or endpoints differ from P3 in a way that changes the gateway interface.

## 9. Implementation notes

(Filled in during implementation: deviations from this brief, review findings and their fixes.)
