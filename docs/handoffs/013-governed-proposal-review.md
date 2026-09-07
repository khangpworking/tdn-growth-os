# Handoff — Task 013 governed proposal review

Updated: 14/09/2026.
Worktree/branch: Fedora Orca worktree `tdn-growth-os-feature-013-governed-proposal-review`; `feature/013-governed-proposal-review`; PR #13 remains open/draft.
Completed: Box 5 human-review decision foundation with closed request validation, trusted actor capability enforcement, append-only APPROVE/REJECT/HOLD history, immutable canonical decision artifacts/rows, verified replay, and a narrow effective-decision reader.

## Identity

- Authorized starting SHA: `a79fd2661f6f238ba65e04a02015ee7bf70e35da`.
- Required merge base: `bc12918e6fca6228a74d9bf2b50634895d19f5f7`.
- Implementation SHA: `5d1fa9d0634162dc807cda86d4069a72b22f5d6c`.
- Final handoff SHA: the commit containing this document; its full immutable SHA is recorded in the PR `HANDOFF_TO_CODEX` comment because a commit cannot contain its own hash.

## Changed paths

- `contracts/governance/governed-proposal-review-request.{schema.json,generated.ts}`
- `contracts/governance/governed-proposal-decision.{schema.json,generated.ts}`
- `migrations/0009_governance_proposal_decisions.sql`
- `src/modules/governance/{validation,governed-proposal-decision-service,governed-proposal-decision-reader,index}.ts`
- `scripts/generate-foundation-contract.mjs`
- `tests/integration/{governed-proposal-review,sqlite-foundation}.test.ts`
- `docs/{STATUS,foundation-data-dictionary}.md`
- `docs/handoffs/013-governed-proposal-review.md`

## Contracts and policy

- Untrusted `governed_proposal_review_request_v1` accepts exactly `contractVersion`, proposal UUID, positive decision version, `APPROVE|REJECT|HOLD`, trimmed bounded rationale, and expected `PROPOSED|HOLD` state. Every object is closed and all fields are bounded.
- The request cannot supply actor/role/capability/authentication/delegation, policy, decision identity/time/result/digest, proposal/evidence/model/provider/tool/credential/SQL/path/URL/command/task/action payload/retry, or external-clearance authority fields.
- Application-owned `GovernedProposalDecision` contains decision UUID/time, exact verified proposal ID/artifact digest, version/transition/rationale, trusted actor/role snapshot, required capability, trusted policy, and canonical request SHA-256.
- Fixed policy ID: `governance:proposal-review-v1`; configured positive policy version; fixed required capability: `governance:proposal-review`.
- Migration 0009 SHA-256: `f7c08885f9e7b42d12fbdd3b37011df65855ae21a7a4e33b3d2e490fd67d8439`.

## Trusted actor and cross-box boundary

- Actor context is a separate trusted application argument with bounded stable actor ID, bounded trimmed role snapshot, and an application-verified `ReadonlySet` of capabilities.
- Missing `governance:proposal-review` rejects before artifact/database writes. Request and actor snapshots are copied before asynchronous work to prevent caller mutation.
- Box 5 reads Box 3 exclusively through injected `AnalysisBackedProposalReader`. Static and focused-test audits found no Box 3 table SQL in `src/modules/governance/`.
- Task 011 proposal state, row, and canonical artifact are never changed. Focused tests snapshot and compare the complete proposal row and exact artifact bytes before and after a decision.

## Transition, identity, replay, and immutability evidence

- Allowed transitions only: `PROPOSED→APPROVED`, `PROPOSED→REJECTED`, `PROPOSED→HOLD`, `HOLD→APPROVED`, and `HOLD→REJECTED`.
- Version 1 requires `PROPOSED`; a later exact sequential version requires a verified immutable `HOLD` predecessor. Terminal reversal, repeated HOLD, stale state/version, skipped version, and missing predecessor reject.
- SQLite CHECK constraints enforce version/previous-state and all five transition tuples. Update/delete triggers make decision rows immutable.
- Durable identity is `(proposal_id, decision_version)`. Exact bound request/proposal/actor/policy identity deduplicates after verified replay; changed identity conflicts. Policy/actor changes can append a valid later decision without rewriting or invalidating historical decisions.
- Replay verifies artifact digest/size/media/path/contract metadata, fatal JSON parse, schema, canonical bytes, exact proposal through the reader, all row/envelope/actor/policy/request metadata, transition, and prior immutable chain. Tests cover missing, corrupt, noncanonical, metadata, proposal, actor, policy, and broken-chain mismatch.
- The effective reader returns `PROPOSED` when no decision exists, otherwise the latest verified decision. It grants no mutation, publication, or execution authority.

## Verification evidence

- Focused Task 013 tests: **10/10 passed**.
- Full `npm run check`: contract generation, strict TypeScript, and **72/72 integration tests passed**.
- `git diff --check`: passed.
- Migration probe: version 8 upgraded exactly once to 9; idempotent rerun applied nothing; invalid transition tuples rejected.
- Independent final review: no remaining medium/high correctness, security, or acceptance gaps.
- Fedora permission probe: database, WAL, SHM, Task 011 proposal artifact, and Task 013 decision artifact all remained `0600`.
- Static authority audit: no direct Box 3 SQL and no AI/Pi/child process/shell/network/Box 4 runtime reference in governance source.
- No dependency, lockfile, CI, Task 012 experiment, migrations 0001–0008, or Task 011 source/behavior change.
- Residue audit: no runtime database/WAL/SHM, credential, private data, provider output, environment file, log, or temporary artifact remained or was tracked.

## Migration integrity

Migrations 0001–0008 remain byte-identical:

- `0001`: `cc454e4c837cac9ae4718fe3e963f9b9fad2b20ce0c4e6ae47757a25e701a7eb`
- `0002`: `b62f1a6d3ad5d0c7c4b26855da8f6b71bc3d5845b9fd6e8d6d13e1f468680d46`
- `0003`: `a13daec88cfe5abbb4a26d517744c9c6ccc613841eb47c3d9932264a1c5157ec`
- `0004`: `0e8add96ffe9cbfce075a5457349273ecac4d76bfc1bad98d19d6e0258b5530d`
- `0005`: `e4785c6f98cf3a262b1ffa71dc7e374ae38263db4fe9b47677575d54389d7592`
- `0006`: `241b8a941db06673322b44aa2e7e5c26b5c45a390afcb06ca5062ced66ddeb88`
- `0007`: `18509c37e92f9d3a1b89921b2c827eadaa2ea58eeb5f15fe4e1f4a252e4f273b`
- `0008`: `285e1591771294455a9212d3cc1f3b02f17ade50e38718bfa337a8b9c6ebe848`

## Scope and limitations

`APPROVED` means only that a future Box 4 intake may consider the proposal. Task 013 does not execute, publish, spend, contact anyone, certify legal/health correctness, authenticate users, add UI/API/workers/notifications, encode staff-specific policy, or add Box 4 behavior. It calls no AI, Pi, model/provider, shell, tool, or network service.

Unresolved/business decisions: owner/staff policy for role-specific or multi-party approval, separation of duties, HOLD expiry/reopening, mandatory evidence/rationale, and per-action authorization remains deliberately deferred.

Next action: Task 014 may add a minimal Box 4 intake that creates only a non-executable authorized workflow plan from a verified Task 013 `APPROVED` receipt; actual workers and external side effects remain later work.
