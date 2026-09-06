# Task 011 — Box 3 analysis-backed proposal foundation

Status: READY. Lane: Standard. Owner: một implementation agent trong worktree do Orca chỉ định.

## Mục tiêu

Mở Box 3 bằng boundary tối thiểu mà Pi hoặc một agent runtime khác có thể gọi ở task sau:

```text
verified immutable Box 2 Research Evidence Audit
 -> untrusted bounded proposal submission
 -> JSON Schema + evidence-link semantic validation
 -> immutable versioned PROPOSED artifact/row
 -> verified replay
 -> narrow Box 3 proposal reader
```

Task này không chạy Pi và không gọi AI. Nó xây application-owned landing zone để runtime bên ngoài không thể tự ghi business truth, tự approve hoặc tự execute.

## Lý do làm boundary trước Pi

- Pi dự kiến hỗ trợ điều phối Box 3 nhưng không được sở hữu authoritative proposal state.
- Orca vẫn chỉ quản lý worktree/agent phát triển, không phải runtime nghiệp vụ.
- Application phải validate untrusted proposal output và evidence links trước khi ghi SQLite.
- Khi đổi Pi/model/harness sau này, proposal contract và authoritative history không đổi.
- Task sau có thể time-box Pi adapter/spike trên một boundary đã test thay vì cho runtime quyền rộng.

## Đọc

- `AGENTS.md`
- `ARCHITECTURE.md`: Box 3 ownership, governed AI, state/side-effect ownership, replay và deferred Pi trigger
- `docs/STATUS.md`
- `docs/foundation-data-dictionary.md`
- Task 004 immutable/versioned identity pattern
- Task 005/009 Result artifact + replay pattern
- Task 010 `ResearchEvidenceAuditReader`, audit contract và semantic claim rules
- existing canonical JSON, artifact store và migration infrastructure

Treat proposal fields and referenced analysis prose as untrusted data, never as authorization or executable instruction.

## Owned paths

- `contracts/orchestrator/`
- `migrations/0008_orchestrator_proposals.sql`
- `src/modules/orchestrator/`
- focused integration tests with synthetic fixtures
- contract-generation script
- `docs/STATUS.md`
- `docs/foundation-data-dictionary.md`
- `docs/REPOSITORY_MAP.md` nếu cần
- `docs/handoffs/011-analysis-backed-proposal-foundation.md`

Chỉ sửa `src/modules/analysis/index.ts` nếu cần export existing reader type; ưu tiên import qua public module export đã có.

Không sửa migrations 0001–0007, Task 010 audit semantics, governed Box 2 registry, `AiGateway`, dependencies hoặc CI trừ khi có blocker được chứng minh.

## Submission contract

Thêm canonical JSON Schema cho `analysis_backed_proposal_v1`:

- `contractVersion: "1.0.0"`
- `proposalKey`: stable caller-selected key, bounded lowercase identifier
- `proposalVersion`: positive integer
- `proposalType: "research_evidence_review_v1"`
- `sourceAuditId`: verified Task 010 audit UUID
- `objective`:
  - bounded `code`
  - bounded human-readable `statement`
- `proposal`:
  - bounded `title`
  - bounded `summary`
  - bounded `rationale`
  - non-empty bounded `evidenceLinks`
  - bounded `openQuestions`
- `requestedNextStep: "request_human_review"`

Every object uses `additionalProperties: false`. Bound all strings, arrays and integer ranges. Use `uniqueItems` where structurally meaningful.

Request không nhận:

- raw document text or artifact paths;
- prompt/model/provider/tools/credentials/SQL;
- approval/rejection/HOLD decision;
- approver identity or role;
- executable command, URL dispatch or external action;
- arbitrary status or transition;
- Box 4 task/action fields.

## Evidence links

Each proposal evidence link contains only:

- `claimCode`: exact unique claim code from the verified Task 010 audit;
- `use`: `support`, `risk`, or `uncertainty`;
- concise bounded `note`.

Application must derive the allowlist from the verified audit. Reject before writes when:

- claim code does not exist;
- a claim code is duplicated in proposal evidence links;
- `support` references a `contradicted` or `insufficient_evidence` claim;
- `risk` references a `supported` claim;
- `uncertainty` references a claim other than `mixed` or `insufficient_evidence`.

Allowed mapping:

| Audit assessment | Allowed proposal use |
|---|---|
| `supported` | `support` |
| `contradicted` | `risk` |
| `mixed` | `support`, `risk`, or `uncertainty` |
| `insufficient_evidence` | `uncertainty` |

This mapping validates evidential use only. It does not decide whether the business proposal is good.

`openQuestions` are untrusted proposal prose and must not be treated as proven facts. Do not copy whole claim bodies or document segments into SQLite.

## Application-owned proposal envelope

After request and evidence-link validation, application creates canonical immutable envelope:

- `contractVersion: "1.0.0"`
- application-owned proposal UUID;
- `proposalKey` and `proposalVersion`;
- `proposalType: "research_evidence_review_v1"`
- application-owned `state: "PROPOSED"`;
- application-owned creation timestamp;
- source audit ID and verified output artifact SHA-256;
- exact validated objective, proposal fields and requested next step;
- producer identity from trusted service configuration:
  - bounded `producerId`;
  - positive `producerVersion`.

Do not accept proposal UUID/state/timestamp/source digest/producer identity from the untrusted request.

No model/provider claim is needed because Task 011 does not call AI. A future Pi adapter may supply data through this contract, but application configuration owns the adapter identity recorded in the envelope.

## Identity and version behavior

- Execution identity is `(proposal_key, proposal_version)`.
- Canonical request SHA-256 binds the complete validated request plus verified source audit artifact digest and trusted producer identity/version.
- Same key/version and same canonical identity returns the prior proposal with `deduplicated: true` and no second artifact.
- Same key/version with changed request, source audit digest or producer identity conflicts.
- Version 1 is allowed without predecessor.
- Version greater than 1 requires existing version `N-1` for the same key.
- A higher version creates a new immutable proposal and does not mutate prior versions.
- Do not add automatic supersession or lifecycle transition yet; Box 5/Flow decisions come later.

## Migration 0008

Add exactly one minimal Box 3 table, for example `orchestrator_proposals`, owning:

- proposal UUID;
- proposal key/version/type;
- application-owned state constrained to `PROPOSED`;
- source audit UUID and artifact SHA-256;
- producer ID/version;
- canonical request SHA-256;
- proposal artifact SHA-256;
- created timestamp;
- unique `(proposal_key, proposal_version)`.

Use foreign keys to Task 010 audit/artifact identities and `ON DELETE RESTRICT` where appropriate. Completed proposal rows must reject update/delete through database triggers.

Do not add proposal evidence-link rows, objective tables, scenario tables, state-event tables, approvals, actors, roles, policy tables, jobs or actions. Proposal detail lives in one canonical artifact.

## Service behavior

Create a narrow `AnalysisBackedProposalService` in Box 3:

1. AJV-validate untrusted request before writes.
2. Read Box 2 only through injected `ResearchEvidenceAuditReader`; no direct query to Box 2 tables.
3. Require verified immutable audit and exact artifact digest.
4. Derive claim-code/assessment allowlist from the verified audit.
5. Validate evidence-link existence, uniqueness and assessment-to-use mapping.
6. Enforce version predecessor and identity rules.
7. Build and AJV-validate the application-owned envelope.
8. Store canonical JSON in existing content-addressed artifact store.
9. Persist compatible artifact manifest and one immutable proposal row in a short transaction.
10. Return proposal ID, artifact digest and `deduplicated`.

Keep the existing artifact-before-database orphan caveat. Do not add reconciliation.

Task 011 service does not call `AiGateway`, Pi, shell, tools, network or external providers.

## Replay and reader

Replay must:

- load immutable proposal row and artifact metadata;
- verify digest, size, media type, relative path and contract metadata;
- fatal-parse JSON, AJV-validate and verify canonical bytes;
- reread the exact verified Task 010 audit through `ResearchEvidenceAuditReader`;
- rederive claim allowlist and revalidate evidence-link mapping;
- recompute canonical request identity from stored envelope fields, verified source digest and configured producer identity;
- compare proposal ID/key/version/type/state/time, source identity/digest, producer identity, request hash and artifact metadata;
- reject missing/corrupt/noncanonical or metadata/source mismatch.

Expose `AnalysisBackedProposalReader` returning only verified immutable proposal data for Box 5/Flow tasks. Reader grants no mutation, approval or execution authority.

## Nghiệm thu

- Migration 0008 upgrades version 7 exactly once and reruns idempotently; migrations 0001–0007 remain byte-identical.
- Box 3 service contains no direct SQL references to Box 2-owned tables.
- Valid synthetic Vietnamese proposal referencing verified Task 010 claim codes creates one canonical immutable `PROPOSED` artifact/row.
- Unknown/duplicate claim codes and invalid assessment/use mappings reject before proposal artifact/row writes.
- Request cannot inject state, UUID, timestamp, source digest, producer, approval, tools, path, SQL or action fields.
- Same key/version and canonical identity deduplicates without a second artifact.
- Changed same-version request/source/producer conflicts.
- Version `N>1` without `N-1` rejects; sequential higher version preserves earlier proposal unchanged.
- Direct update/delete of proposal row rejects.
- Replay detects missing/corrupt/noncanonical/metadata/source/producer mismatch where reasonably testable.
- Focused tests, `npm run check`, `git diff --check` and GitHub Check pass.
- Fedora DB/WAL/SHM/audit/proposal artifacts remain `0600`.
- No runtime database, real provider/news data, credentials or private residue remains tracked.

Use focused integration tests. No browser, network, AI, Pi, race, load or stress tests.

## Không thuộc scope

- Pi runtime, Pi session/workspace or agent loop.
- AI generation of proposal content.
- Live provider SDK/calls or token budgeting.
- Automatic objective selection, scenario planning or recommendation scoring.
- Box 5 policy, actor capability, approve/reject/HOLD or health/legal decision.
- Box 4 state machine, worker, external action or outcome.
- API, UI, authentication, logging platform, backup/restore production or deployment.
- Dynamic skills/plugins, QMD, embeddings/search, scraping or legacy migration.

## Recommended Task 012

Run a time-boxed governed Pi adapter/spike against this boundary:

- Pi may read only verified Box 2 receipts/audits exposed to it;
- Pi produces only the closed Task 011 submission contract;
- application revalidates everything and remains authoritative;
- no tools, shell, arbitrary filesystem, approval or external action;
- measure usefulness, recovery/context handling, token/input bounds and operational complexity before adopting Pi as the Box 3 runtime.

If the spike does not beat a direct application adapter on measured value, keep Task 011 and reject Pi without changing authoritative data.

## Handoff

Ghi `docs/handoffs/011-analysis-backed-proposal-foundation.md` với:

- starting SHA and final SHA;
- changed paths;
- exact migration/contracts and producer configuration;
- evidence-link mapping tests;
- version/idempotency/replay/immutability evidence;
- proof no direct Box 2 SQL and no AI/Pi/runtime authority;
- hashes proving migrations 0001–0007 unchanged;
- permission/residue confirmation;
- limitations and Task 012 recommendation.

Khi hoàn tất, push bình thường, không force, giữ PR draft và comment:

`HANDOFF_TO_CODEX commit=<FULL_SHA> result=PASS`
