# Task 037 handoff — exact four-PASS OWNER clearance

## Delivered

- Extended the separate Task 036 local OWNER server with `POST /owner-api/product-workspaces/:productWorkspaceId/b8-clearance`.
- Added closed generated request/receipt contracts without changing Task 030 canonical flow contracts.
- Delegated exclusively to the existing Task 030 `B8ClearanceService` using verified B8 decision/status readers.
- Preserved opt-in startup, strict loopback binding, strong constant-time bearer authentication, exact-origin CORS, server-owned OWNER context, 4 KiB body bound, safe errors, and separate read/write processes.
- Added real-mode current `x/4 PASS` status, exact decision-ID eligibility, pending/double-submit guard, explicit confirmation dialog, authoritative reload on success/409, immutable historical-clearance warning, and separate View B9 navigation.
- Kept demo mode synthetic and explicit.

## Verification required at final SHA

Record in the final PR handoff:

- focused backend clearance/service/read tests and frontend tests;
- exactly one successful full `npm run check` after focused checks;
- final-SHA GitHub CI;
- exact mutation evidence: one clearance, four ordered memberships, and one required content-addressed artifact/manifest only; no product-workspace or B8-row change; no B9/B10 creation;
- exact retry and concurrent duplicate create no second clearance and no additional mutations;
- read API remains `readonly`, `fileMustExist`, `query_only`, and byte-preserving;
- owner-only database/WAL/SHM/artifact permissions;
- no migration or canonical Task 030 contract changes;
- no credential, private/runtime data, real calcium decision/clearance, or other residue;
- clean worktree and equal local/remote/PR heads.

Keep the PR open and draft. Do not merge, deploy, or create a real clearance.

## Limitations

This is a manually enabled local-development OWNER gate, not production authentication. It adds no roles, reasons/notes, automatic/replacement clearance, STP write/lock, B10 write, B11, migration, AI/Pi/provider access, worker/schedule/notification/deployment, Windows backport, or LSP requirement.
