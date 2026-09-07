# Handoff — Task 014 approved proposal intake

Updated: 15/09/2026.
Worktree/branch: Fedora Orca worktree `tdn-growth-os-feature-014-approved-proposal-intake`; `feature/014-approved-proposal-intake`; PR #14 remains open/draft.
Completed: minimal Box 4 approved-proposal intake and non-executable `AUTHORIZED_PLAN` shell with closed request validation, exact current verified approval enforcement, immutable canonical artifact/row, replay, and narrow read-only reader.

## Identity

- Authorized starting SHA: `baa5a8f73363fd1a586e0bdbc8848c497b07075d`.
- Required merge base: `a1f5b93d041587d72c010e0686080ac31f9fd6ad`.
- Implementation SHA: `8b66c36f257f4a390677670a6c74706084db158c`.
- Final handoff SHA: the commit containing this document; its full immutable SHA is recorded in the PR `HANDOFF_TO_CODEX` comment because a commit cannot contain its own hash.

## Changed paths

- `contracts/flow/approved-proposal-intake-request.{schema.json,generated.ts}`
- `contracts/flow/authorized-plan.{schema.json,generated.ts}`
- `migrations/0010_flow_authorized_plans.sql`
- `src/modules/flow/{validation,approved-proposal-intake-service,authorized-plan-reader,index}.ts`
- `scripts/generate-foundation-contract.mjs`
- `tests/integration/{approved-proposal-intake,sqlite-foundation}.test.ts`
- `docs/{STATUS,foundation-data-dictionary}.md`
- `docs/handoffs/014-approved-proposal-intake.md`

## Contracts and trusted producer

- Closed `approved_proposal_intake_request_v1` accepts exactly contract version, bounded lowercase plan key, fixed plan type, source proposal UUID, approved decision UUID, and `define_manual_tasks` next step.
- Extra state, IDs/timestamps/digests, producer, actor/policy/approval, B0–B14/work/task/command/schedule/job/tool/action payload, credential/path/SQL/retry/connector, model/provider/Pi, or arbitrary configuration fields reject before writes.
- Application-owned `AuthorizedPlan` contains plan UUID, `AUTHORIZED_PLAN` state/time, key/type, exact proposal and decision digest lineage, approval decision version/actor/policy/time snapshots, trusted producer, fixed next step, and literal SHA-256 of the canonical closed request.
- Trusted producer configuration: bounded Box 4 identity `flow:approved-proposal-intake` and positive producer version 1. The request cannot select or override it.
- Migration 0010 SHA-256: `4c2b348adb776e12bf011f90b46d6e12cd17798fc3374ffe399a3ffa67ffaebb`.

## Authorization and identity binding

- Box 4 reads Box 5 only through injected `GovernedProposalDecisionReader`; production Flow source contains no direct Box 3 or Box 5 table SQL.
- Intake requires a well-formed reader result for the exact source proposal, exactly three expected fields, `effectiveState === APPROVED`, a schema-valid decision with `action === APPROVE` and `resultState === APPROVED`, exact requested decision UUID, and exact decision proposal UUID.
- The canonical decision artifact SHA-256 is recomputed from a deep snapshot of the verified envelope. Proposal digest, decision digest/version, actor/role, policy/version, and approval timestamp are derived only from that envelope.
- PROPOSED, HOLD, REJECTED, wrong-decision, wrong-proposal, malformed-reader, and mutated-reader cases reject before plan writes.
- Durable identity is unique plan key and unique approved decision UUID. Exact retries replay-verify and deduplicate without a second artifact. Changed same-key identity, reused decision under another key, or changed producer conflicts.

## Replay and immutability evidence

- Replay verifies plan artifact digest, size, media type, relative path, contract metadata, fatal JSON parse, schema, and canonical bytes.
- It rereads the current effective decision through the declared reader, requires the exact referenced approval to remain current, recomputes its digest, and compares proposal, decision, actor, policy, approval-time, producer, state, request hash, row, and artifact metadata.
- Tests cover missing, corrupt, noncanonical, manifest metadata, authorization, producer, and source-reader mismatch.
- `flow_authorized_plans` rejects direct update/delete. Task 011 proposal and Task 013 decision complete rows and exact artifact bytes remain unchanged after intake.
- `FlowAuthorizedPlanReader` exposes only verified immutable plan-shell data and grants no mutation, task creation, worker dispatch, or execution authority.

## Verification evidence

- Focused Task 014 integration tests: **9/9 passed**.
- Full `npm run check`: contract generation, strict TypeScript, and **81/81 integration tests passed**.
- `git diff --check`: passed.
- Migration probe: version 9 upgraded exactly once to 10; idempotent rerun applied nothing.
- Exact retry/deduplication and changed-key/reused-decision/producer conflicts passed.
- Independent final review: no remaining medium/high correctness, security, or acceptance gaps.
- Static audit: no direct Box 3/5 SQL and no AI/Pi/child-process/shell/network/n8n/worker/scheduler/connector runtime authority in Flow source.
- Fedora permission probe: database, WAL, SHM, Task 011 proposal artifact, Task 013 decision artifact, and Task 014 plan artifact all remained `0600`.
- No dependency, lockfile, CI, Task 012 experiment, migrations 0001–0009, Task 011 source, or Task 013 source/behavior change.
- Residue audit: no runtime database/WAL/SHM, credential, private data, provider output, command payload, environment file, log, or temporary artifact remained or was tracked.

## Migration integrity

Migrations 0001–0009 remain byte-identical:

- `0001`: `cc454e4c837cac9ae4718fe3e963f9b9fad2b20ce0c4e6ae47757a25e701a7eb`
- `0002`: `b62f1a6d3ad5d0c7c4b26855da8f6b71bc3d5845b9fd6e8d6d13e1f468680d46`
- `0003`: `a13daec88cfe5abbb4a26d517744c9c6ccc613841eb47c3d9932264a1c5157ec`
- `0004`: `0e8add96ffe9cbfce075a5457349273ecac4d76bfc1bad98d19d6e0258b5530d`
- `0005`: `e4785c6f98cf3a262b1ffa71dc7e374ae38263db4fe9b47677575d54389d7592`
- `0006`: `241b8a941db06673322b44aa2e7e5c26b5c45a390afcb06ca5062ced66ddeb88`
- `0007`: `18509c37e92f9d3a1b89921b2c827eadaa2ea58eeb5f15fe4e1f4a252e4f273b`
- `0008`: `285e1591771294455a9212d3cc1f3b02f17ade50e38718bfa337a8b9c6ebe848`
- `0009`: `f7c08885f9e7b42d12fbdd3b37011df65855ae21a7a4e33b3d2e490fd67d8439`

## Scope and limitations

`AUTHORIZED_PLAN` means only eligible for future manual task definition. It is not running, executing, published, or authorization for any external action. Task 014 adds no detailed B0–B14 states, tasks/work items, assignment, deadline, schedule, queue, worker, lease, retry, cancellation, connector, command, publication, spending, contact, authentication, API/UI, notification, AI, Pi, n8n, or provider behavior.

Unresolved/business decisions: B0–B14 meanings and transition criteria; approved proposal types eligible for tasks/actions; task ownership/dependencies/deadlines/cancellation/rework/evidence; additional role gates and action thresholds; retry/rollback/incident/outcome policy.

Next action: Task 015 should be a business-definition task, not code-first, to define the smallest real B0–B14 slice, staff gates, and one manually executable calcium-business workflow before adding manual task records or transitions. Worker dispatch and external actions remain separate later work.
