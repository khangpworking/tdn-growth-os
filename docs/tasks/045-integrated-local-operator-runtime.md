# Task 045 — integrated local operator runtime

Task 045 packages the existing frontend, verified read paths, and opt-in OWNER write paths behind one Fedora-local HTTP origin and documents an operator-safe launch path. It adds no new B3–B10 business semantics.

## Architecture and configuration

- One Node process serves prebuilt `frontend/dist`, `/api/*`, optional `/owner-api/*`, and `GET /healthz` from one exact origin.
- The default origin is `http://127.0.0.1:8787`; host validation permits loopback only (`127.0.0.1` or `::1`) and rejects wildcard/LAN binding.
- Required runtime configuration is `TDN_WORKSPACE_DB` and `TDN_ARTIFACT_ROOT`. Host/port default to `127.0.0.1:8787`.
- `TDN_OWNER_API_ENABLED` is exactly `true` or `false` and defaults disabled. Enabled mode additionally requires a strong `TDN_OWNER_API_TOKEN` and valid `TDN_OWNER_API_ACTOR_ID`; the server derives the OWNER API allowed origin from its own exact origin.
- Disabled mode does not open the OWNER application and returns the same safe 403 boundary for `/owner-api/*`. Reads retain the existing file-must-exist/query-only behavior.
- This is local development authorization for one trusted operator, not public or production authentication.

## Static and health boundaries

The runtime preloads a real, readable `frontend/dist`, rejects symlinks, dotfiles, unsupported files, missing referenced assets, traversal and malformed paths, excludes source maps from its serving inventory, and serves only regular allowlisted asset types. `/` and `/index.html` receive the built index; application navigation stays in the existing URL hash, including explicit `?mode=demo#/…`. Unknown path, API, and asset requests do not receive HTML fallback. Static responses carry restrictive same-origin/security headers.

`GET /healthz` returns only `status`, application `version`, and `ownerWritesEnabled`. Other methods are rejected. Health is operational liveness/configuration disclosure, not a database-integrity or B3–B10 completion claim.

## Lifecycle

Startup validates configuration and static assets before listening, then opens the verified read application and, only when enabled, the existing OWNER application. Partial startup closes anything already opened. `SIGINT` and `SIGTERM` converge on one idempotent shutdown that stops accepting traffic and closes OWNER/read database resources. Startup and launcher output do not print token, database path, or artifact path.

Operator steps are authoritative in `docs/runbooks/fedora-local-operator-runtime.md`, including the exact Node `24.15.0`/npm `11.12.1` pins, positional migration syntax, production frontend build, disabled/enabled examples, health check, real/demo distinction, and clean shutdown.

## B3–B10 integrated smoke contract

The disposable, synthetic-only smoke in `tests/integration/operator-app-journey.test.ts` is the full acceptance shape for the integrated boundary:

1. reserve a loopback port and create private disposable database/artifact roots;
2. serve a real production frontend asset, health, and an initially empty verified portfolio;
3. prove an unauthenticated OWNER mutation is denied;
4. create a discovery workspace and create/revise a candidate;
5. freeze the exact B3 candidate revision in a basket;
6. record exact B7 `PASS` and explicitly create its independent product workspace;
7. record PASS in all four B8 lanes and explicitly freeze the exact four-PASS clearance;
8. create and update the B9 working STP, then irreversibly lock it;
9. record B10 `HOLD`, then append the exact-predecessor correction to `APPROVE`;
10. read portfolio, discovery, basket, B7 linkage, product/B8, B9, and B10 projections and verify exact lineage/effective state;
11. stop cleanly, verify the port closes, reopen query-only, inspect durable synthetic outcomes, owner-only file modes, empty request staging/no temporary residue, and no token/private path leakage.

A separate disabled-mode smoke verifies static/read/health availability, stable 403 OWNER behavior, unchanged database bytes, and no artifacts. A launcher smoke covers `SIGTERM`. These are documented acceptance targets; this documentation change does **not** claim a final full suite, CI result, or final commit SHA.

“B3–B10” here means the complete currently implemented operator journey across that range. There are no separate B4, B5, or B6 runtime records/actions in this repository slice, so the smoke must not be read as validation of their future business definitions. Likewise, B10 `APPROVE` only establishes the existing `readyForB11` meaning; it allocates or spends no funds and does not start B11.

## Exclusions

No migration, business service/API/frontend semantics change, B4–B6 implementation, B11 implementation, real/private data, real B3–B10 decision, funding transfer, provider/AI/Pi call, external action, public auth, multi-user roles, systemd, proxy, TLS, remote/LAN/internet access, backup/restore, deployment, worker, scheduler, or Windows service/backport is included.
