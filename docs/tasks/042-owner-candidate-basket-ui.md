# Task 042 — governed candidate-basket freeze and UI

Task 042 connects the existing Task 026 `CandidateBasketService.freezeBasket()` and verified `CandidateBasketReader` to the local workspace read API, opt-in OWNER API, and real discovery-workspace UI. This is B3: an explicit immutable snapshot of product opportunities, not a ranking, recommendation, approval, B7 decision, or product-workspace action.

## Business semantics

One ACTIVE discovery workspace may contain multiple independent candidates and multiple basket families. A basket family is identified by workspace ID plus basket key. Each basket version freezes at least one member selected by exact candidate ID and exact historical candidate version. Versions are gapless and append-only; later candidate revisions do not alter frozen membership or content. A later basket version may deliberately change membership or select newer candidate revisions. Application-owned deterministic ordering never implies score, rank, preference, or winner selection.

## Read API

- `GET /api/workspaces/:workspaceId/candidate-baskets`
  - Discovers basket IDs only for the exact workspace and replays every result through the existing verified Task 026 reader.
  - Returns baskets deterministically by basket key and ascending version.
  - Exposes only basket ID, workspace ID, basket key/version, frozen time, and exact members with candidate ID/key/version, label, optional summary, and `EXPLORING` state.

The existing read server remains SQLite read-only, file-must-exist, and query-only. Workspace, membership, artifact, or persisted-identity drift crosses the existing generic integrity-error boundary. Hashes, artifact paths, SQL details, actors, stack traces, and mutable controls are not exposed, and reads must preserve database bytes.

## OWNER API

- `POST /owner-api/workspaces/:workspaceId/candidate-baskets`
  - Closed body: `contractVersion`, `basketKey`, `version`, and a non-empty `candidates` array whose entries contain exactly `candidateId` and `candidateVersion`.

Workspace identity comes only from the URL. The route reuses the existing loopback-only opt-in server, exact-origin CORS, bounded JSON parsing, bearer token, server-owned OWNER authority, and safe error boundary. Mutation delegates exclusively to Task 026 `CandidateBasketService.freezeBasket()`; the API performs no direct candidate-basket SQL writes.

Before freezing, the exact ACTIVE workspace and every exact historical candidate revision are verified. Duplicate candidate IDs, wrong-workspace candidates, absent revisions, stale identity, skipped versions, and changed content for an existing basket key/version fail closed. A new basket returns 201; a verified exact retry returns 200. Malformed input returns 400, invalid authentication 401, disabled writes or disallowed Origin 403, unknown resources 404, business/version conflicts 409, and persisted-integrity failures a generic 500. The receipt contains only contract version, basket ID, workspace ID, basket key/version, frozen time, member count, and exact-retry state.

## Artifact safety and concurrency

Task 040/041 request-scoped staging remains authoritative. Each request stages only its deterministic missing content in its own private `.owner-api-requests/<uuid>` directory, and cleanup removes only that directory. Publication never scans or deletes the artifact root, canonical files, or unrelated files.

Post-commit recovery is restricted to the one genuinely missing canonical artifact of a fully verified committed exact basket retry. Existing canonical content must match its expected digest and byte size. Concurrent identical requests converge to one creation and one verified exact retry; failed or losing requests leave no registered orphan artifact, partial basket row, or partial membership.

## Real and demo UI

The discovery workspace shows each current candidate with name, optional summary, `EXPLORING`, exact current version, and an initially unchecked selection control. The OWNER can create a new basket family or append the next version to an existing family. Technical basket keys are generated and hidden. The exact key, target version, and selected candidate revisions remain stable across pending, ambiguous failure, and retry.

Freezing requires at least one explicit selection and a compact confirmation that lists exact candidate versions and explains immutability. The UI prevents synchronous double submission and performs no optimistic insertion. Success reloads authoritative read data and requires the exact returned basket/version/membership. A 409 reloads current truth without silently changing the retained request. Existing baskets are shown as immutable version history with exact frozen members; current candidate edits do not rewrite that history.

Visible scope copy states that freezing a basket creates only an immutable snapshot and does not create a B7 decision or product workspace. Demo mode remains explicitly synthetic and never calls the OWNER API.

## Explicit exclusions

No scoring, ranking, comparison, winner selection, PASS/HOLD/REJECT, B7 review, product-workspace creation, candidate mutation/state transition/relation/delete/archive, research or collection run, provider call, AI/Pi output, migration, production authentication/roles, worker, scheduler, deployment, private data, real calcium basket, Windows backport, or LSP requirement.