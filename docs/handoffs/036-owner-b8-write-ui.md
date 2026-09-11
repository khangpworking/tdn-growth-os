# Task 036 handoff — Local OWNER B8 write UI/API

## Delivered

- Separate opt-in loopback-only OWNER write process and `workspace-owner-api:start` command.
- One mutation endpoint: `POST /owner-api/product-workspaces/:productWorkspaceId/b8-decisions`.
- Explicit database, artifact root, OWNER actor, strong token, exact frontend origin, and enabled-mode configuration.
- Constant-time bearer-token comparison, strict origin/CORS handling, 4 KiB JSON bound, closed request/receipt/error contracts, and generic errors.
- Trusted server-owned OWNER role, B8 capability/policy, identity, UUID, and timestamp; existing Task 029 service remains the sole decision authority.
- Real frontend unlock/lock flow with an in-memory-only token, exact lane versions, pending protection, and authoritative read reload after success or conflict.
- Existing read API and explicit synthetic demo remain separate and backward compatible.
- Focused security, concurrency, mutation-scope, read-only, and frontend tests.

## Final verification checklist

Before handoff, record:

- final full SHA and draft PR URL;
- final-SHA CI URL;
- focused and full test results;
- exact mutation evidence: only immutable B8 decision plus required content-addressed artifact manifest/file records change on success; exact retry adds nothing; protected table counts and product workspace are unchanged;
- read API byte-preservation and query-only diagnostics;
- owner-only database/WAL/SHM/artifact permission probes;
- unchanged migrations and Task 029 governance contracts;
- no credential, private, real calcium, database, artifact, or runtime residue;
- clean worktree and equal local/remote/PR heads.

Keep the PR open and draft. Do not merge, deploy, or issue a real decision.

## Remaining limitations

This remains a manually enabled local-development gate. There are no accounts, production auth, reviewer workflow, clearance creation, B9/B10 writes, B11, provider/AI/Pi access, workers, notifications, deployment, or remote exposure. Access from another computer requires an SSH tunnel to Fedora loopback.
