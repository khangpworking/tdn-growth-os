# P5: opt-in I14 CLIProxy synthesis transport

Date: 2026-10-03. Worktree: `fix/research-real-world-audit`, baseline
`0116091`. Uncommitted integration slice in the existing dirty tree. Tests are
written by Claude and subsequently checked by GPT on isolated Fedora (no
Windows test/typecheck/build). Not enabled anywhere; no provider call, real
credential or private data was used.

## Scope

Before this slice, `openResearchAutomationApi` never supplied
`i14SynthesisAi`, so only synthetic service tests could dispatch I14. This
slice adds the production `AutomationI14TextPort` and an explicit opt-in. It
does not change I14 admission, retention, prompts, contracts, migrations,
Content Studio or the frontend.

- `src/modules/analysis/research-automation/i14-cliproxy-transport.ts` (new):
  `i14CliproxySynthesisConfiguration(modelId)`,
  `createI14CliproxySynthesisAi({ cliproxy, configuration })` and
  `AutomationI14TransportError`.
- `src/api/research-automation-api.ts`: optional `i14Synthesis`, which only the
  OWNER writer service receives. The configuration is refused without `owner`.
- `src/api/operator-app.ts`: environment opt-in, validation and pass-through.
  `scripts/serve-operator-app.ts` needs no change because it already parses
  `process.env` through `operatorAppConfigurationFromEnvironment`.
- `tests/integration/research-automation-i14-cliproxy-transport.test.ts` (new).

## Activation contract

| Environment | Effect |
| --- | --- |
| `TDN_RESEARCH_I14_AI_ENABLED` absent or `false` | Off. `researchI14Ai` is absent; an admitted INSIGHT settles `NOT_DISPATCHED` / `AI_NOT_CONFIGURED`. A set model or CLIProxy is ignored. |
| `TDN_RESEARCH_I14_AI_ENABLED` any other value | Startup error. |
| `true` | Requires `TDN_RESEARCH_I14_AI_MODEL` matching the configuration contract's `modelId` pattern, `TDN_CLIPROXY_BASE_URL`/`TDN_CLIPROXY_API_KEY`, and `TDN_OWNER_API_ENABLED=true`. Otherwise startup fails. |

The resolved non-secret configuration is fixed apart from the model:
`providerId: "cliproxy"`, `temperature: null`, `maxOutputTokens: 16384`,
`timeoutMs: 300000`, `maxResponseBytes: 262144`.

- The model id records what the operator requested. It is not selected,
  defaulted or checked against `/v1/models`, so it never claims availability.
- `/healthz` does not report I14 activation.
- The reader `ResearchAutomationService` is constructed without a port in every
  configuration. Reads, `GET` views, settled replay and recovery never call
  the port.
- Worker shutdown still works as before:
  `worker.close()` → `interruptActive()` → the service controller → the
  owner's dispatch signal → `fetch` abort.

## Transport and security limits

- **One request.** Exactly one `POST {baseUrl}/v1/chat/completions` per call,
  with `redirect: "error"`, `stream: false` and no automatic retry.
- **Request body.** The body is exactly the retained `systemText`, the
  retained input bytes as `userText`, the retained `modelId` and
  `max_tokens`. Temperature is omitted while it is retained as `null`. There is
  no `response_format`, tools or other provider option.
- **Configuration binding.** A request whose configuration differs canonically
  from the bound configuration fails with `configuration_mismatch` before any
  network call.
- **Size bounds.** The request is limited to 4 MiB. The response envelope is
  limited to `2 * maxResponseBytes + 64 KiB`, checked first against
  `content-length` and then while streaming. A non-2xx body is cancelled
  unread.
- **Credential echo.** These fail with `malformed_envelope`:
  - raw envelope bytes containing the key;
  - any parsed envelope key or string containing it, which covers JSON
    escapes;
  - parsed message content that contains it when that content is JSON.
- **Envelope shape.** Exactly one choice with non-empty string content is
  required. Only `{ text }` is returned; reasoning fields, usage, ids and
  headers are discarded.
- **Errors.** Error `message` is the closed code. `httpStatus` is the only
  extra field, and there is no `cause`. The retention owner also discards the
  thrown error and retains only `TRANSPORT_OUTCOME_AMBIGUOUS`.

## Replay limits and caveats

- **Port failures settle as unknown.** Any failure the port raises after the
  owner's claim settles `DISPATCH_UNKNOWN` / `TRANSPORT_OUTCOME_AMBIGUOUS`,
  terminally and without retry. That includes
  `configuration_mismatch`, `request_too_large`, an oversized envelope and an
  echoed secret. The model may have been billed, so none of them become
  `INVALID`. Only text that reaches the owner can produce `INVALID`, such as
  `RESPONSE_TOO_LARGE` or `RESPONSE_NOT_JSON`.
- **Fenced JSON is invalid.** Without `response_format`, a model that wraps
  JSON in a Markdown fence settles `INVALID` / `RESPONSE_NOT_JSON`. The
  transport does not strip or repair text.
- **Unadopted defaults.** The fixed bounds (16384 tokens, 300 s, 256 KiB) are
  implementation defaults, not an adopted policy. Changing them changes the
  retained configuration identity of later executions.
- **Model ids with `/`.** The configuration contract's `modelId` pattern
  rejects `/`, so provider-prefixed CLIProxy model ids cannot be configured.
  That pattern is root-owned and unchanged.
- **Duplicated helpers.** The secret and bounded-read helpers in
  `src/platform/ai/cliproxy-creative-gateway.ts` are private. Small local
  equivalents live in the new transport because that shared file is outside
  this slice. Root may extract a shared helper later.
- **Long calls.** One opted-in INSIGHT report build can wait up to `timeoutMs`
  on the model. There is no separate service deadline.

## Tests written (not run)

`tests/integration/research-automation-i14-cliproxy-transport.test.ts` uses a
real loopback HTTP server as the fake CLIProxy, with no provider and no
credential.

- **Exact request.** Checks the method, path, Bearer header and exact body,
  that the result is `{ text }` only, configuration mismatches and a
  pre-aborted signal with no extra request.
- **Failure table.** Each case gets one request and a key-free error:
  - gateway 500 echoing the key;
  - a raw key in the envelope;
  - an escaped key in the envelope;
  - an escaped key inside JSON content;
  - an oversized streamed body;
  - a non-JSON envelope;
  - two choices.
- **Abort.** Caller abort reaches the in-flight request and closes the server
  connection.
- **Activation.** An environment table for off, invalid, incomplete and
  complete opt-in. A read-only `openResearchAutomationApi` with `i14Synthesis`
  is refused.

The service-level I14 end-to-end path and retention behaviour are already
covered by `tests/integration/research-automation-native-reviews.test.ts`;
this slice does not duplicate them. An `openOperatorApp` dispatch test is left
as a root option.

## Next root checks (isolated Fedora)

1. `npm run typecheck`.
2. `node --import tsx --test tests/integration/research-automation-i14-cliproxy-transport.test.ts tests/integration/operator-app.test.ts tests/integration/research-automation-api.test.ts tests/integration/research-automation-native-reviews.test.ts`.
3. Decide the fixed bounds, the `modelId` pattern for prefixed models, and
   whether to adopt `response_format` before any operator enables
   `TDN_RESEARCH_I14_AI_ENABLED`.

## Root verification checkpoint

2026-10-03: isolated Linux scratch at
`~/.cache/tdn-p1-isolation-20261003-ZVXHsB`, Node 24.15.0.
Typecheck passed, including a final rerun after all four transport/wiring/test
files had finished copying. The focused transport, operator-app, research API
and native-review suites passed **36/36**, with no skipped or failed tests.
The HTTP gateway in these tests is a synthetic local server, not CLIProxy or a
paid provider. This is not a full release run, final-head CI, or a live-model
quality/availability benchmark. Independent Luna read-only audit followed the
actual operator/API/worker/retention paths and found no reachable blocker;
no additional production change or duplicate permanent test was requested.

A separate bounded Linux acceptance used `openResearchAutomationApi`, its real
worker, a raw synthetic native package admitted by Foundation, and a loopback
fake CLIProxy. The HTTP confirmation produced exactly one gateway request and
a persisted I14 candidate in the Insight report. Both reports were available.
After closing the writer and reopening the API read-only without synthesis
configuration, Insight bytes were identical and the call count remained one.
The disposable database, artifact directory and two listeners were closed and
removed. This composes the production API wiring without duplicating the
retention suite or calling a provider. Script evidence is outside Git under
`artifacts/research-execution-20261003/i14-http-wiring-acceptance.ts` in the
coordinator workspace.
