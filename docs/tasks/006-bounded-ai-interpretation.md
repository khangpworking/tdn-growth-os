# Task 006 — Bounded AI interpretation with fake gateway

Status: READY. Lane: Standard. Owner: một implementation agent trong worktree do Orca chỉ định.

## Mục tiêu

Tạo bước Box 2 tiếp theo:

```text
immutable market_snapshot_v1 Result
 -> verified Result reader
 -> bounded AiGateway request
 -> untrusted structured model output
 -> AJV + semantic citation validation
 -> immutable interpretation artifact/run
 -> verified replay
```

Task này chỉ dùng injected fake gateway. Không gọi OpenAI hoặc provider thật, không cần API key và không cho AI quyền approve hay mutate business state.

## Đọc

- `AGENTS.md`
- `ARCHITECTURE.md` phần Governed AI, module ownership, replay và Testing
- `docs/STATUS.md`
- Task 005 Result contracts/service/tests
- Artifact, canonical JSON và validation infrastructure hiện có

## Owned paths

- `contracts/analysis/`
- `migrations/0004_analysis_interpretations.sql`
- `src/platform/ai/`
- `src/modules/analysis/`
- `prompts/analysis/`
- focused integration tests
- `docs/STATUS.md`
- `docs/handoffs/006-bounded-ai-interpretation.md`
- Box 2 data dictionary nếu cần

Không sửa migrations 0001–0003, CI, dependency, Result calculation hoặc Data Pack semantics.

## Provider-neutral AiGateway

Thêm interface nhỏ trong `src/platform/ai/`; không thêm provider SDK.

Gateway request phải chứa:

- run ID;
- configured provider/model identifiers;
- prompt ID, version, exact prompt text và SHA-256;
- verified input Result ID/artifact SHA-256 và structured Result;
- output JSON Schema/version;
- explicit timeout và max-output-token limits;
- empty tool list.

Gateway response trả untrusted JSON value, provider request ID nếu có, token usage và latency metadata. Fake gateway chỉ nằm trong tests/fixtures hoặc injected test support; production service không hard-code fake prose.

Model/provider/prompt/limits được cấu hình khi construct service, không nhận tùy ý từ untrusted execution request.

## Input contract

Canonical request chỉ gồm:

- `contractVersion: "1.0.0"`
- `resultId`: UUID của completed `market_snapshot_v1` Result

Không nhận prompt, model, tools, SQL hoặc approval instruction.

## Prompt v1

Thêm một prompt file versioned cho market snapshot interpretation. Prompt yêu cầu:

- mô tả dữ liệu, không đưa health claim;
- không suy ra causal relationship;
- không đưa GO/NO-GO, approval hoặc autonomous action;
- phân biệt observed values, missing values và uncertainty;
- mọi finding phải cite một allowlisted JSON Pointer từ Result.

Store prompt SHA-256; thay nội dung nhưng giữ cùng ID/version phải tạo conflict, không silently overwrite identity.

## Structured output

Canonical JSON Schema cho untrusted model payload:

- concise `summary`;
- ít nhất một `finding` với stable code, statement và one-or-more citations;
- `uncertainties` array;
- citations chỉ là allowlisted JSON Pointer đến deterministic Result fields, ví dụ period, totals và coverage;
- không có recommendation, approval, action hoặc free-form tool call field.

Application phải validate AJV trước, sau đó verify mọi pointer tồn tại trong exact frozen Result và thuộc allowlist. Không tin model-provided digest, model ID, timestamps hoặc provenance; application tạo immutable envelope.

## Persistence

Migration `0004_analysis_interpretations.sql` thêm schema tối thiểu do Box 2 sở hữu:

- immutable AI interpretation/run ID;
- source Result ID và artifact digest;
- provider/model identifier;
- prompt ID/version/digest;
- output schema version;
- canonical request hash;
- output artifact digest;
- completed timestamp;
- provider request ID, input/output token counts và latency khi có;
- unique execution identity phù hợp cho idempotency.

Không thêm retry queue, generic agent state, approval state hoặc tool tables.

## Behavior

1. Validate input trước mọi write/provider call.
2. Read verified immutable Result through a declared read-only Result interface; không query lại Box 1.
3. Build one bounded gateway request with no tools and only the verified Result.
4. Validate untrusted output with AJV and semantic citation checks before artifact/database writes.
5. Persist a canonical application-owned interpretation envelope and immutable run row.
6. Same Result + provider/model + prompt ID/version/digest + output schema version is idempotent and does not call gateway again after success.
7. Changed prompt bytes under the same prompt ID/version must conflict with existing identity.
8. Invalid gateway output leaves no interpretation row/output artifact.
9. Replay verifies artifact digest, JSON/schema/canonical bytes, Result provenance, prompt/model metadata and database row.
10. Keep artifact-before-database orphan caveat; do not add reconciliation.

## Nghiệm thu

- Migration 0004 upgrades version 3 once and reruns idempotently; migrations 0001–0003 remain byte-identical.
- Fake gateway receives exactly one verified Result, explicit limits, prompt digest/schema and an empty tool list.
- Valid fake output creates one immutable interpretation/run and canonical artifact with correct Result lineage.
- Findings cite only existing allowlisted paths; invalid schema, nonexistent pointer or forbidden pointer rejects before output writes.
- Missing Result rejects before gateway call.
- Same successful request is idempotent and fake gateway call count remains one.
- Prompt-content drift with unchanged ID/version conflicts.
- Direct update/delete of completed interpretation row is rejected.
- Replay detects missing/corrupt/noncanonical or metadata-mismatched output where reasonably testable.
- Tests prove no approval/action fields and no business-state mutation path.
- Focused tests, `npm run check`, `git diff --check` and GitHub Check pass.
- Fedora DB/WAL/SHM/artifact permissions remain `0600`; no runtime/private residue remains.

Use the smallest meaningful tests. No live network, race, load or browser tests.

## Không thuộc scope

Official OpenAI SDK, live models, model routing, tools, retries, budget accounting, worker, UI, Box 3 proposal, approval, medical/legal conclusions, autonomous action, eval platform và prompt optimization.

## Business review để lại

Marketing/Finance review wording usefulness and interpretation rubric later. Legal/R&D must review any future health-claim prompt/output. CEO/owner must approve live-provider budget, model choice and whether an interpretation may become a Box 3 proposal. Task 006 output remains unapproved analysis only.

