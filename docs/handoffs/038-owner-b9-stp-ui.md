# Task 038 handoff — OWNER B9 working STP and immutable lock

## Delivered

- Added closed local OWNER endpoints for B9 working save/update and explicit immutable lock.
- Delegated all mutations exclusively to Task 031 `StpService.saveWorking()` and `StpService.lock()`.
- Added opaque verified `workingRevision` to WORKING/LOCKED read projection without exposing the internal digest.
- Added the real-mode non-technical segment editor, explicit Save draft, exact-revision conflict handling, dirty-state/navigation warning, irreversible lock confirmation, post-lock read-only rendering, and separate View B10 action.
- Preserved memory-only token, local opt-in/loopback/exact-Origin/4 KiB boundaries, read-only API guarantees, and synthetic demo isolation.

## Final verification record

The final PR PASS comment must record:

- focused backend/service/read tests and focused frontend tests;
- exactly one successful full `npm run check` after focused checks;
- final-SHA GitHub CI;
- first save creates one working row with no STP artifact; update mutates that same row only; unchanged exact retry has zero mutations;
- lock creates one immutable lock row and one required content-addressed artifact/manifest only; exact retry adds zero mutations;
- post-lock service/API/database immutability and no B10 creation;
- product workspace, B8 decisions, B8 clearance and membership records unchanged;
- failures/concurrency leave no partial rows or orphan manifests/artifacts;
- read API remains `readonly`, `fileMustExist`, `query_only`, byte-preserving and omits revisions only for NOT_STARTED;
- migrations and canonical Task 031 contracts/service unchanged;
- owner-only database/WAL/SHM/artifact permissions;
- no credential, private/runtime data, real calcium STP, provider, merge, or deployment residue;
- clean worktree and equal local/remote/PR heads.

Keep the PR open and draft. Do not merge, deploy, or create a real STP.

## Limitations

This remains a local-development authorization gate, not production authentication. It adds no multiple versions, unlock/reopen, AI-generated STP, autosave, B10 writes, B11, production roles, migration, provider call, worker/schedule/deployment, Windows backport, or LSP requirement.
