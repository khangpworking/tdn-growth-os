# Task 034 — Read-only workspace API and real-data frontend

## Outcome

Task 034 connects the Task 033 React workspace to persisted SQLite records through a narrow local read-only HTTP API. Normal frontend mode uses the API. Synthetic browser-memory state remains available only at `?mode=demo` and retains a visible warning.

This task adds no business write, migration, authentication, provider call, AI/Pi execution, worker, schedule, deployment, or external action.

## Local Fedora startup

Prerequisites: Node 24.15.0, npm 11.12.1, an existing migrated SQLite database, and its matching artifact root.

Terminal 1 — API:

```bash
cd /path/to/tdn-growth-os
npm ci
TDN_WORKSPACE_DB=/absolute/path/to/existing.sqlite \
TDN_ARTIFACT_ROOT=/absolute/path/to/artifacts \
TDN_WORKSPACE_API_PORT=8080 \
npm run workspace-api:start
```

The API binds to `127.0.0.1` by default. Only loopback host configuration is accepted.

Terminal 2 — Vite:

```bash
cd /path/to/tdn-growth-os
npm run frontend:dev
```

Open the Vite URL for real read-only mode. The development proxy forwards `/api` to `http://127.0.0.1:8080`. Open `?mode=demo#/` only when the explicitly labelled synthetic demo is wanted.

## API

- `GET /api/workspaces`
- `GET /api/workspaces/:workspaceId`
- `GET /api/product-workspaces/:productWorkspaceId`

Malformed IDs return 400, unknown IDs return 404, and failed verified replay returns a generic 500 integrity response. Non-GET methods are rejected. Browser responses omit paths, SQL, stacks, actor identifiers, and artifact hashes.

The API opens the supplied database with SQLite read-only and file-must-exist options, sets `PRAGMA query_only = ON`, runs no migrations, and composes relationships in memory by verified IDs. Catalog queries enumerate only owning records and exact candidate versions; existing Box-owned replay/read services verify artifacts and lineage. Ordering is stable.

## Frontend behavior

Normal mode renders loading, truthful empty portfolio, route-not-found, integrity failure, and connection failure states without falling back to demo records. Duplicate names remain safe because routing and relationships use IDs. B8 controls are disabled in real mode; B9 and B10 remain informational. Existing responsive, keyboard-focus, and reduced-motion behavior is retained.

## Acceptance

Focused tests cover deterministic response composition, duplicate names, empty data, malformed/unknown IDs, unavailable API, corrupt/missing artifacts, explicit demo selection, no silent fallback, query-only behavior, and byte-identical database reads. The full repository check remains the final acceptance command.
