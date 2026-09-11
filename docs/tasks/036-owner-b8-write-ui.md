# Task 036 — Opt-in local OWNER B8 write API and real frontend controls

## Outcome

Task 036 adds one bounded local-development mutation path for the single project OWNER to submit button-only B8 `PASS`, `HOLD`, or `REJECT` decisions. It is not production authentication.

The existing Task 034/035 workspace read API remains a separate process and separate SQLite connection opened `readonly`, `fileMustExist`, and `query_only`. Its routes and contracts remain backward compatible and it cannot mutate database rows or artifacts.

## Separate OWNER server

Start the owner process only with explicit configuration:

```bash
TDN_OWNER_API_ENABLED=true \
TDN_WORKSPACE_DB=/absolute/path/to/local.sqlite \
TDN_ARTIFACT_ROOT=/absolute/path/to/local-artifacts \
TDN_OWNER_API_ACTOR_ID=owner:local \
TDN_OWNER_API_TOKEN='<generate-a-random-token-of-at-least-32-characters>' \
TDN_OWNER_API_ALLOWED_ORIGIN=http://127.0.0.1:5173 \
TDN_OWNER_API_HOST=127.0.0.1 \
TDN_OWNER_API_PORT=8081 \
npm run workspace-owner-api:start
```

The process refuses disabled mode, weak/missing tokens, missing storage configuration, malformed origins, and non-loopback binding. It never prints the token. The token is compared in constant time and is not persisted to Git, SQLite, artifacts, URLs, or logs.

Only this mutation route exists:

```text
POST /owner-api/product-workspaces/:productWorkspaceId/b8-decisions
```

The closed JSON body contains only `contractVersion`, `lane`, `expectedVersion`, and `decision`. The URL owns the product workspace ID. Browser-supplied actor, role, capability, policy, timestamp, reasons, notes, evidence, reviewer data, and extra properties are rejected. The server constructs the trusted OWNER context and delegates to the existing Task 029 `ProductB8LaneDecisionService`; it does not duplicate rules or write decision SQL.

The receipt contains only decision ID/version, lane, decision, decided time, and `exactRetry`. Errors are bounded generic JSON. Bodies are capped at 4 KiB. Exact-origin CORS is allowed only for the configured frontend origin.

## Fedora local startup

Run three terminals from the repository root:

```bash
# Terminal 1 — unchanged read server
TDN_WORKSPACE_DB=/absolute/path/to/local.sqlite \
TDN_ARTIFACT_ROOT=/absolute/path/to/local-artifacts \
TDN_WORKSPACE_API_HOST=127.0.0.1 TDN_WORKSPACE_API_PORT=8080 \
npm run workspace-api:start
```

```bash
# Terminal 2 — opt-in owner server (use a freshly generated token)
TDN_OWNER_API_ENABLED=true TDN_WORKSPACE_DB=/absolute/path/to/local.sqlite \
TDN_ARTIFACT_ROOT=/absolute/path/to/local-artifacts \
TDN_OWNER_API_ACTOR_ID=owner:local TDN_OWNER_API_TOKEN='<local-secret>' \
TDN_OWNER_API_ALLOWED_ORIGIN=http://127.0.0.1:5173 \
npm run workspace-owner-api:start
```

```bash
# Terminal 3 — Vite, with read and owner routes proxied to separate servers
npm run frontend:dev
```

When accessing Fedora from another computer, keep all services loopback-only and use an SSH tunnel, for example:

```bash
ssh -L 5173:127.0.0.1:5173 pkhang@fedora
```

Then open `http://127.0.0.1:5173` locally. Do not expose the Vite/read/owner ports on the LAN or Internet.

## Frontend semantics

Real mode offers an explicit **Unlock local OWNER actions** form. Its password input stores the token only in React memory. Reloading clears it; **Khóa** clears it immediately. It is never stored in browser persistent storage.

While locked, pending, or when a button matches the effective lane decision, controls are disabled. Submission uses the exact decision version from the verified read response. Success reloads the entire authoritative state through the read-only API. A `409` also reloads and reports that another decision changed the lane. There is no optimistic state substitution and no demo fallback.

Append-only history, optimistic concurrency, exact retries, repeated-state rejection, and immutable historical B8 clearances remain service-owned semantics. No clearance is created automatically. Demo mode remains unchanged and visibly synthetic.

## Explicit exclusions

No production authentication, accounts/passwords/OAuth, reviewer roles, reasons/notes/evidence, clearance creation, B9 editing/locking, B10 writes, B11, migrations, AI/Pi, providers/scraping, workers/scheduling/notifications/deployment, real calcium decisions, private data, Windows backport, or LSP work.
