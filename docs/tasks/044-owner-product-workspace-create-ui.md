# Task 044 — OWNER product-workspace creation from exact B7 PASS

Task 044 connects the existing Task 028 `ProductWorkspaceService` to the opt-in loopback OWNER API, the verified B7 read projection, and the real discovery-workspace frontend. Product-workspace creation remains a separate explicit action after B7 PASS; recording PASS never creates a workspace automatically.

## Business boundary

- One product workspace is created from one exact verified B7 `PASS` decision selected by decision ID.
- The URL binds the discovery workspace, frozen candidate basket, and B7 decision. The request body contains only `contractVersion` and an application-generated `productWorkspaceKey`.
- Product workspace ID, title, optional frozen candidate summary, `ACTIVE` state, `B8` entry step, creation time, and all source lineage are owned or derived by the existing Task 028 service. Callers cannot override them.
- `HOLD`, `REJECT`, an unknown decision, or any workspace/basket/decision lineage mismatch fails closed before product-workspace creation.
- Each exact B7 PASS may create at most one product workspace, and each product-workspace key is globally unique. Exact retry deduplicates with zero database mutations; changed PASS/key pairings conflict.
- Creation establishes an independent workspace ready for future B8 work. It does not make a B8 decision, create a B8 clearance, enter B9, approve B10, allocate funding, approve a supplier or claim, publish, launch, or perform an external action.

## OWNER API

`POST /owner-api/workspaces/:workspaceId/candidate-baskets/:basketId/b7-decisions/:decisionId/product-workspace`

The closed JSON body is exactly:

```json
{
  "contractVersion": "1.0.0",
  "productWorkspaceKey": "product-<application-generated-identity>"
}
```

The endpoint reuses the existing loopback-only, explicitly enabled OWNER server, strong bearer authentication, constant-time token comparison, exact-Origin CORS, bounded JSON input, and safe error responses. The token remains outside the request body and persisted records.

Before mutation, the endpoint verifies the URL-scoped discovery workspace and basket, replays the exact B7 decision, requires `PASS`, and checks the complete workspace/basket pairing. Mutation delegates exclusively to `ProductWorkspaceService.createWorkspace()`; the API does not write product-workspace SQL directly and does not change the canonical Task 028 request or service contract.

A new workspace returns 201 and a verified exact retry returns 200. Invalid closed input returns 400, unknown exact resources return safe 404 where appropriate, semantic source/key conflicts return 409, and persisted row, manifest, artifact, or lineage drift returns the generic integrity response. The safe receipt contains only product-workspace identity/key, source workspace/basket/candidate/version/B7 decision identities, `ACTIVE`/`B8`, title, creation time, and exact-retry status.

## Read API

The existing query-only B7 route remains:

`GET /api/workspaces/:workspaceId/candidate-baskets/:basketId/b7`

For a decided member, the read path looks up a product workspace only by the exact B7 decision ID. If one exists, it replays the workspace through the Task 028 verified reader and checks the full frozen discovery-workspace, basket key/version, candidate key/version/label/optional summary/state, and B7 decision identity/time before returning a small product-workspace summary. It never infers relationships from names or from the candidate’s current editable revision.

The projection exposes no artifact/request hashes, paths, actor/capability/policy internals, SQL, or stack details. A non-PASS decision linked to a product workspace, duplicate or mismatched lineage, or corrupt/missing persisted evidence fails with the existing generic integrity response. SQLite remains read-only, file-must-exist, and query-only, and read acceptance must preserve database bytes.

## Artifact safety

Task 040–043 request-scoped staging remains in force. Only deterministic request-owned bytes are staged. After the service commits, publication is restricted to the digest referenced by that result; cleanup removes only the current private request directory. Canonical `EEXIST` is accepted only after digest and byte-size verification, with no artifact-root scan, sweep, unrelated unlink, or canonical replacement.

Exact-retry recovery is restricted to a genuinely absent canonical artifact for the exact persisted product-workspace target. Recovery verifies the closed request digest, immutable row, exact verified B7 PASS and frozen lineage, manifest metadata/timestamps, expected canonical bytes, digest, size, and relative path before publishing only those bytes. Existing corruption, upstream B7 corruption, manifest drift, changed identity, or any other mismatch remains fail-closed.

## Frontend

- Only an exact frozen basket member with effective B7 `PASS`, a decision ID, and no linked product workspace shows `Tạo workspace sản phẩm`.
- Real mode requires the existing memory-only OWNER unlock. Locked, incomplete, or pending state disables the action.
- Opening confirmation freezes workspace ID, basket ID, candidate ID/version, decision ID, and one hidden generated Task 028-valid product-workspace key. The same snapshot is retained across an ambiguous failure so retry uses the same identity.
- The compact confirmation explains that the new independent workspace starts at B8 and that no B8 decision is made.
- The UI prevents synchronous/asynchronous duplicate submission, makes no optimistic insertion, and reloads authoritative read data after success or 409. Success is accepted only when the exact receipt and B7/product projections agree; no automatic demo fallback occurs.
- Once linked, the frozen member shows the verified workspace summary and a separate action to open its B8 profile. It does not offer another create action.
- Explicit demo mode remains synthetic, mutates only in-memory state, uses no OWNER request, and keeps its visible demo warning.

## Exclusions

No automatic workspace creation on PASS, caller-supplied title/summary/state/step/source identity, candidate mutation, B7 correction, B8 decision or clearance, B9/B10 action, funding operation, supplier/legal/scientific/quality approval, provider/research/AI/Pi execution, new migration, canonical Task 028 service change, production authentication, worker, deployment, Windows backport, private data, or real business product workspace is included.
