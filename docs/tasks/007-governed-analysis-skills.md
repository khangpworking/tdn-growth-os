# Task 007 — Governed Box 2 analysis-skill boundary

Status: READY. Lane: Standard. Owner: một implementation agent trong worktree do Orca chỉ định.

## Mục tiêu

Formalize năng lực Box 2 đã có ở Task 006 thành skill đầu tiên được allowlist, có contract rõ ràng để Box 3/Pi có thể gọi sau này:

```text
verified market_snapshot_v1 Result
 -> validated skill execution request
 -> explicit allowlisted registry lookup
 -> existing bounded interpretation service
 -> immutable interpretation artifact/run
 -> typed skill execution receipt
```

Không tạo một plugin framework tổng quát. Không duplicate persistence của Task 006. Skill đầu tiên chỉ là adapter mỏng cho năng lực `market-snapshot-interpretation` hiện có.

## Bối cảnh thiết kế

- Box 2 sở hữu các công cụ phân tích và output phân tích.
- Pi dự kiến là runtime điều phối Box 3, nhưng Pi chưa được tích hợp trong task này.
- Sau này Pi chỉ được gọi Box 2 qua boundary có type/validation; Pi không tự load code tùy ý và không sở hữu business truth.
- Các nguồn người dùng đã cung cấp như `marketingskills`, evidence-audit/fact-check, framework 10x6 và `pm-skills` mới chỉ là inventory/reference. Task này không được tuyên bố rằng chúng đã được port hoặc tích hợp.
- Legal skill thuộc Box 5; PM/orchestration skill chủ yếu thuộc Box 3. Không đưa chúng vào Box 2 registry ở task này.

## Đọc

- `AGENTS.md`
- `ARCHITECTURE.md`: Box boundaries, Governed AI, Testing và deferred Pi trigger
- `docs/STATUS.md`
- `docs/foundation-data-dictionary.md`
- Task 006 contracts, `AiGateway`, interpretation service và focused tests
- Chỉ đọc source ngoài repository nếu thật sự cần để ghi provenance; không copy code/license-unknown material.

## Owned paths

- `contracts/analysis/`
- `src/modules/analysis/skills/` hoặc một vị trí nhỏ tương đương trong Box 2
- `src/modules/analysis/index.ts`
- `skills/market-snapshot-interpretation/SKILL.md` nếu cần descriptor dành cho người/agent
- focused integration tests
- `docs/STATUS.md`
- `docs/foundation-data-dictionary.md`
- `docs/handoffs/007-governed-analysis-skills.md`
- `docs/REPOSITORY_MAP.md` chỉ khi thêm thư mục `skills/`

Không sửa migrations 0001–0004, Task 005 calculation semantics, Task 006 interpretation persistence, CI hoặc dependencies trừ khi có blocker được chứng minh.

## Skill identity và registry

Tạo một registry tĩnh, explicit và đóng theo default. Registry ban đầu có đúng một entry:

- skill ID: `analysis:market-snapshot-interpretation`
- skill version: `1`
- owner: Box 2
- input kind: verified `market_snapshot_v1` Result
- execution adapter: existing `MarketSnapshotInterpretationService`
- output reference: existing immutable interpretation ID và artifact SHA-256
- authority: read verified Result; no tools; no shell; no filesystem access ngoài artifact service hiện có; no network ngoài injected `AiGateway`; no approval; no business mutation.

Unknown skill ID/version phải fail closed trước gateway call và trước output write.

Không scan thư mục để tự động discover skill. Không import JavaScript/TypeScript từ SKILL.md, external repository hoặc runtime path. Không dùng `eval`, dynamic module URL, shell command hay arbitrary tool dispatch.

## Execution request contract

Thêm canonical JSON Schema tối thiểu cho request:

- `contractVersion: "1.0.0"`
- `skillId: "analysis:market-snapshot-interpretation"`
- `skillVersion: 1`
- `input.resultId`: UUID của completed `market_snapshot_v1` Result

`additionalProperties: false` ở mọi object.

Request không nhận provider, model, prompt, tools, credentials, SQL, approval, filesystem path hoặc arbitrary configuration. Các cấu hình đó vẫn do application construct Task 006 service.

## Execution receipt

Trả một typed receipt nhỏ, không tạo artifact/table mới chỉ để wrap dữ liệu đã có:

- contract version;
- exact skill ID/version;
- interpretation ID;
- output artifact SHA-256;
- `deduplicated`.

Receipt là application response, không phải authoritative artifact mới. Authoritative execution evidence vẫn là immutable Task 006 interpretation row/artifact.

Nếu cần persisted skill identity, chứng minh vì sao Task 006 prompt ID/version không đủ trước khi đề xuất migration. Default: không migration.

## Minimal skill package

Nếu thêm `skills/market-snapshot-interpretation/SKILL.md`, giữ nó ngắn và declarative:

- khi nào capability phù hợp;
- required verified input;
- output contract/reference;
- authority denied;
- owner Box 2;
- mapping tới prompt/schema/application adapter hiện có.

SKILL.md không được xem là executable authority. Runtime registry trong code là allowlist authoritative.

Không tạo trước `agents/`, `evals/`, `benchmarks/`, `experiments/`, `observations/` con cho skill này nếu task không dùng đến. Không copy nguyên folder template dài-horizon chỉ để có cấu trúc.

## Behavior

1. Validate execution request với AJV.
2. Resolve exact skill ID/version từ static registry.
3. Reject unknown/disabled identity trước gateway call.
4. Delegate tới existing Task 006 service với chỉ `resultId`.
5. Return typed receipt referencing existing immutable interpretation.
6. Same request inherits Task 006 idempotency and does not issue a second gateway call.
7. Existing verified Result, prompt/schema validation, citations, artifact and replay behavior remain unchanged.
8. Skill boundary cannot approve, propose Box 3 state, call tools or mutate another Box.
9. Do not introduce a second generic AI gateway, artifact wrapper or execution ledger.

## Nghiệm thu

- Task 006 behavior remains byte/semantically compatible; migrations 0001–0004 are unchanged.
- Contract generation and strict TypeScript pass.
- Registry contains exactly the explicitly registered capability.
- Valid request invokes the existing adapter and returns correct interpretation/artifact references.
- Repeated valid request deduplicates and gateway call count remains one.
- Unknown skill ID, wrong version, extra configuration, invalid Result ID and missing Result fail at the correct boundary.
- Tests prove the request cannot inject prompt/model/provider/tools/path/approval fields.
- No dynamic code loading, shell execution, arbitrary filesystem access, direct provider SDK or live network is added.
- Focused tests, `npm run check`, `git diff --check` and GitHub Check pass.
- Fedora file permissions and runtime-residue guarantees remain unchanged.

Dùng test nhỏ nhất có ý nghĩa. Không thêm browser, load, race hoặc live-provider tests.

## Không thuộc scope

- Port nội dung từ `marketingskills`, `pm-skills`, evidence-audit, legal skill hoặc framework 10x6.
- Full long-horizon skill package structure.
- Pi runtime, Pi session/workspace management hoặc Orca integration.
- Dynamic skill installation/discovery.
- Additional database table/migration.
- Live provider, model routing, retries, queue, worker, API, UI.
- Box 3 proposal, Box 5 approval hoặc Box 4 action.

## Handoff

Ghi `docs/handoffs/007-governed-analysis-skills.md` với:

- starting SHA và final SHA;
- changed paths;
- exact registry entry;
- reused Task 006 components;
- tests/checks;
- confirmation migrations 0001–0004 unchanged;
- confirmation no live provider/dynamic loading/runtime residue;
- limitations và recommended next task.

Khi hoàn tất, push bình thường, không force, giữ PR draft và comment:

`HANDOFF_TO_CODEX commit=<FULL_SHA> result=PASS`
