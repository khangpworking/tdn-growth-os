# Task 035 handoff — Read-only B9 and B10 product journey

## Delivered

- Added verified read-only B9 status projection for NOT_STARTED, WORKING, and LOCKED.
- Added verified read-only B10 projection for no decision, effective APPROVE/HOLD/REJECT, B11 readiness, and ascending immutable correction history.
- Added `GET /api/product-workspaces/:productWorkspaceId/b9` and `/b10` without changing existing Task 034 endpoint behavior.
- Added narrow Box 4/5 read interfaces and closed API response contracts.
- Preserved SQLite read-only/file-must-exist/query-only operation, no migrations, no writes/repairs, owner-boundary ID catalogs, verified replay, deterministic order, and generic integrity errors.
- Replaced real-mode B9/B10 placeholders with truthful read-only views; retained explicit labelled demo mode.
- Added focused backend and frontend coverage.

## Verification and delivery checklist

Before handoff, record final full SHA, draft PR URL, final-SHA CI URL, focused and full test counts, clean worktree/remote/PR SHA alignment, database byte-identity evidence, unchanged migration and pre-existing contract trees, and privacy/residue checks.

Keep the PR open and draft. Do not merge or deploy.

## Remaining limitations

No API or UI writes, STP save/lock, B10 decision submission, B11 records/actions, login/authentication/roles, AI/Pi, provider calls, scraping, workers, schedules, notifications, deployment, Windows backport, or private calcium data are included.
