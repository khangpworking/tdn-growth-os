# Task 035 — Read-only B9 and B10 product journey

## Outcome

Task 035 extends the existing Task 034 local read-only workspace API and React frontend so one persisted product workspace can truthfully show its verified B9 STP state and B10 effective decision plus immutable correction history.

The implementation remains entirely read-only. It adds no STP save/lock controls, B10 decision controls, B11 records/actions, authentication, AI/Pi, providers, scraping, workers, scheduling, migration, or deployment.

## API

Existing Task 034 endpoints and contracts remain compatible. New endpoints:

- `GET /api/product-workspaces/:productWorkspaceId/b9`
- `GET /api/product-workspaces/:productWorkspaceId/b10`

B9 returns `NOT_STARTED`, `WORKING`, or `LOCKED`. Working content includes the working STP ID, timestamps, ordered segments, resolved target keys, positioning statement, and B8 clearance ID. Locked state adds the lock ID, `LOCKED_STP`, and lock time while preserving the exact frozen STP content.

B10 returns an empty history/effective decision when no decision exists, or an ascending immutable correction history with the effective APPROVE/HOLD/REJECT decision and `readyForB11`. History is verified for sequential decision numbers, exact predecessors, one requested product workspace, and one exact locked STP.

SQLite remains `readonly`, `fileMustExist`, and `query_only`; no migrations run. Owner-boundary catalog queries enumerate minimal IDs only, and existing Box 4/5 readers replay and verify records. Errors remain generic and omit paths, digests, actor IDs, SQL, request hashes, and stacks.

## Frontend

Real mode fetches the new B9/B10 endpoints through the typed data-source boundary. B9 distinguishes a mutable working draft from the immutable official locked STP and renders segment cards, primary/secondary target labels, positioning, and applicable timestamps. B10 renders the effective category-and-funding decision, B11 readiness, and correction timeline. APPROVE is explicitly described as authorization to proceed—not evidence of funding transfer, allocation, or execution.

There are no real-mode edit, lock, APPROVE, HOLD, or REJECT controls. Explicit `?mode=demo#/` remains available with its persistent synthetic warning.

## Verification

Focused API tests cover B9 not-started/working/locked, ordered segments and target resolution, B10 absent and effective states, correction history, integrity failures, deterministic responses, and byte-identical database reads. Frontend focused tests cover typed mapping, exact IDs/versions, no fallback, and explicit demo behavior. The final acceptance command is `npm run check`.
