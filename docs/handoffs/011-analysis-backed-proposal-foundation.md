# Task 011 handoff — Analysis-backed proposal foundation

Status: implemented on `feature/011-analysis-backed-proposal-foundation`; PR #11 must remain draft.

## Identity

- Starting SHA: `6b23e69a86b8ce09437c86db140d8117ebbdadff`.
- Required base `main`: `1a2bbbcd92d860d791e64720c35388703fca146b`.
- Complete implementation SHA: `e6930165362602642fdddadaec3510e815216b5b`.

## Contracts and producer configuration

- `analysis-backed-proposal-submission` is a closed `analysis_backed_proposal_v1` submission with only contract version, bounded caller key/version, fixed `research_evidence_review_v1` type, source audit UUID, bounded objective, bounded proposal content, non-empty evidence links, bounded unique open questions and fixed `request_human_review` next step.
- Every object uses `additionalProperties: false`; all strings, arrays and integers are bounded.
- Request rejects proposal UUID/state/timestamp/source digest/producer, approval/rejection/HOLD, approver/role, model/provider/prompt/tools/credentials/SQL/path, commands/URLs/external actions, arbitrary transitions and Box 4 fields.
- `analysis-backed-proposal` is the application-owned immutable envelope: application UUID, `PROPOSED` state and timestamp; verified source audit ID/artifact SHA-256; trusted producer ID/version; exact validated request content.
- Tested trusted producer configuration: `producerId: "orchestrator:direct-submission"`, `producerVersion: 1`. Configuration validation requires a bounded lowercase namespaced ID and positive safe integer version.

## Migration 0008

- Added only `migrations/0008_orchestrator_proposals.sql`.
- Exactly one Box 3 table: `orchestrator_proposals`.
- Stores proposal UUID, key/version/type, constrained `PROPOSED` state, source audit/artifact foreign keys with `ON DELETE RESTRICT`, trusted producer identity/version, canonical request digest, proposal artifact digest and created timestamp.
- Unique identity is `(proposal_key, proposal_version)`.
- Update/delete triggers reject mutation of completed proposal rows.
- No evidence-link/objective/scenario/state-event/approval/actor/role/policy/job/action table exists. Proposal detail remains in one canonical artifact.

## Evidence-link validation

The service reads Box 2 only through injected `ResearchEvidenceAuditReader` and derives a unique claim-code-to-assessment map from the verified audit. It rejects unknown or duplicate proposal claim codes and duplicate source audit claim codes before writes.

Exact mapping:

- `supported` → `support`
- `contradicted` → `risk`
- `mixed` → `support`, `risk`, or `uncertainty`
- `insufficient_evidence` → `uncertainty`

Focused tests prove valid links for all assessments and reject unknown code, duplicate code, supported-as-risk/uncertainty, contradicted-as-support, and insufficient-as-support before proposal artifact/row writes. This validates evidential use only and does not decide proposal quality.

## Identity and versioning

- Execution identity: `(proposal_key, proposal_version)`.
- Canonical request SHA-256 binds the complete validated submission, verified source audit artifact digest, and configured producer ID/version.
- Same key/version plus exact identity returns the prior proposal with `deduplicated: true` and creates no second artifact.
- Same key/version with changed request, source digest or producer identity conflicts.
- Version 1 needs no predecessor. Version `N>1` requires existing version `N-1` for the same key.
- Sequential higher versions create new immutable proposals and preserve prior row/artifact bytes. No automatic supersession or lifecycle transition is added.

## Persistence, replay, and reader

- Service validates request and evidence links before proposal artifact/database writes.
- It builds and validates the application-owned envelope, writes canonical JSON to the existing content-addressed artifact store, verifies compatible manifest metadata, and inserts one proposal row in a short transaction.
- Existing artifact-before-database orphan caveat remains; no reconciliation was added.
- Replay loads row/manifest, verifies digest/size/media/path/contract metadata, fatal-parses and schema-validates JSON, verifies canonical bytes, rereads the exact verified audit through `ResearchEvidenceAuditReader`, rederives evidence mapping, recomputes canonical identity, and compares proposal ID/key/version/type/state/time, source identity/digest, producer identity, request hash and artifact metadata.
- Tests cover missing, corrupt, noncanonical, artifact metadata, source digest and producer mismatch.
- `AnalysisBackedProposalReader` returns only verified immutable proposal data and grants no mutation, approval or execution authority.

## Scope and authority

- `src/modules/orchestrator/` contains no direct Box 2 table SQL. The only source boundary is `ResearchEvidenceAuditReader`.
- Task 011 contains no `AiGateway` import/call, Pi runtime/session/loop, shell, tools, networking, external provider, dynamic loading/plugin, approval logic, Box 4 action, API/UI, worker or new dependency.
- The focused fixture is synthetic Vietnamese. The one fake gateway exists only to construct the verified Task 010 prerequisite audit; Task 011 itself never calls it.

## Verification

- Focused Task 011 tests: 6/6 passed locally.
- Full `npm run check`: 62/62 integration tests passed locally.
- `git diff --check`: passed locally.
- Independent static review: no findings.
- Structural audits passed: no direct Box 2 SQL, forbidden runtime APIs, authority fields, protected-path changes, or extra migration table.
- Fedora end-to-end replay/permission probe passed: database, WAL, SHM, source audit artifact and proposal artifact were `0600`; disposable output was removed.
- Residue audit passed: no runtime database/WAL/SHM, credentials, provider/private data, environment files or temporary artifacts remain.
- GitHub Check passed for complete implementation commit `e6930165362602642fdddadaec3510e815216b5b` ([run 34043752853](https://github.com/khangpworking/tdn-growth-os/actions/runs/34043752853)).

## Migration integrity

Migrations 0001–0007 remain byte-identical:

- `0001`: `cc454e4c837cac9ae4718fe3e963f9b9fad2b20ce0c4e6ae47757a25e701a7eb`
- `0002`: `b62f1a6d3ad5d0c7c4b26855da8f6b71bc3d5845b9fd6e8d6d13e1f468680d46`
- `0003`: `a13daec88cfe5abbb4a26d517744c9c6ccc613841eb47c3d9932264a1c5157ec`
- `0004`: `0e8add96ffe9cbfce075a5457349273ecac4d76bfc1bad98d19d6e0258b5530d`
- `0005`: `e4785c6f98cf3a262b1ffa71dc7e374ae38263db4fe9b47677575d54389d7592`
- `0006`: `241b8a941db06673322b44aa2e7e5c26b5c45a390afcb06ca5062ced66ddeb88`
- `0007`: `18509c37e92f9d3a1b89921b2c827eadaa2ea58eeb5f15fe4e1f4a252e4f273b`
- New `0008`: `285e1591771294455a9212d3cc1f3b02f17ade50e38718bfa337a8b9c6ebe848`

## Changed paths

- `contracts/orchestrator/analysis-backed-proposal-submission.{schema.json,generated.ts}`
- `contracts/orchestrator/analysis-backed-proposal.{schema.json,generated.ts}`
- `migrations/0008_orchestrator_proposals.sql`
- `scripts/generate-foundation-contract.mjs`
- `src/modules/orchestrator/{validation,analysis-backed-proposal-service,analysis-backed-proposal-reader,index}.ts`
- `tests/integration/{analysis-backed-proposal,sqlite-foundation}.test.ts`
- `docs/{STATUS,foundation-data-dictionary}.md`
- `docs/handoffs/011-analysis-backed-proposal-foundation.md`

## Limitations

- `PROPOSED` is not approval, truth, recommendation, publication authorization or execution authority.
- Open questions and all proposal prose remain untrusted and are not proven facts.
- No AI proposal generation, Pi runtime, automatic objective/scenario selection, scoring, Box 5 policy/actors/approve/reject/HOLD, Box 4 state machine/action, API/UI/auth, workers, live providers, search/scraping, backup/deployment or legacy migration.

## Recommended Task 012 governed Pi spike

Run a time-boxed governed Pi adapter/spike against this stable boundary. Pi may read only verified Box 2 receipts/audits and emit only the closed Task 011 submission. The application must revalidate every field/link and remain authoritative for proposal ID, state, time, source digest and producer identity. Deny tools, shell, arbitrary filesystem, approval and external action. Measure usefulness, context/recovery behavior, token/input bounds and operational complexity against a direct application adapter. If Pi does not demonstrate better measured value, retain Task 011 and reject Pi without changing authoritative data.
