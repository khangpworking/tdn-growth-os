# Task 034 handoff — Read-only workspace API

## Scope delivered

- Local Node/TypeScript HTTP API for portfolio, discovery workspace detail, and independent product workspace detail.
- Explicit existing SQLite database and artifact-root startup configuration.
- SQLite read-only/file-must-exist opening plus query-only mode; no migrations or writes.
- Exact-version catalog enumeration followed by existing Box-owned verified replay/readers, with ID-based in-memory relationship composition and deterministic output ordering.
- Closed browser response contract and TypeScript response types.
- Task 033 frontend defaults to the typed real API data source; synthetic state is restricted to explicit `?mode=demo`.
- Truthful real loading, empty, not-found, integrity, and connection states; no fallback.
- Real B8 controls disabled and B9/B10 informational.
- Focused backend/frontend tests, including duplicate titles, missing/corrupt artifacts, unavailable API, method rejection, and database byte identity.

## Local commands

Terminal 1:

```bash
cd /path/to/tdn-growth-os
TDN_WORKSPACE_DB=/absolute/path/to/existing.sqlite \
TDN_ARTIFACT_ROOT=/absolute/path/to/artifacts \
TDN_WORKSPACE_API_PORT=8080 \
npm run workspace-api:start
```

Terminal 2:

```bash
cd /path/to/tdn-growth-os
npm run frontend:dev
```

The Vite `/api` proxy targets `127.0.0.1:8080`. API binding remains loopback-only.

## Explicit limitations

There are no POST/PUT/PATCH/DELETE routes, B8/B9/B10 mutations, mutable STP operations, authentication, roles, reviewer workflow, provider calls, scraping, AI/Pi, workers, scheduling, deployment, or Windows backport. The API is a local read-only projection, not a production authenticated service. Production API writes and real decisions remain unimplemented.

## Review notes

Confirm final SHA, PR link, CI link, exact focused/full results, migration tree digest equality, database byte identity, and privacy/residue checks in the draft PR handoff comment. Keep the PR draft and open; do not merge or deploy.
