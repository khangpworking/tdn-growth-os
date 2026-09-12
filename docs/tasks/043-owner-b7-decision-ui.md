# Task 043 — governed B7 candidate decisions and UI

Task 043 connects the existing Task 027 `CandidateB7DecisionService` to the verified workspace read API, opt-in loopback OWNER API, and B3 frozen-basket frontend.

## Business boundary

- One immutable OWNER decision targets one exact basket ID and version plus one exact frozen candidate ID and version.
- Only `PASS`, `HOLD`, and `REJECT` are accepted. There is no reason, rationale, note, evidence, attachment, reviewer, explanation, or AI field.
- The candidate must be an exact member of the verified frozen basket. Current editable candidate revisions never substitute for the frozen version.
- One exact member can be decided at most once. Exact retries deduplicate; changed decisions conflict. Reconsidering HOLD requires another basket version.
- Multiple members may independently PASS. PASS grants eligibility only for a future separate product-workspace action; this task creates no product workspace and grants no B8–B10, funding, supplier, publication, launch, or external-action authority.

## Read API

`GET /api/workspaces/:workspaceId/candidate-baskets/:basketId/b7`

The query-only, file-must-exist API validates both UUIDs, verifies workspace/basket pairing, replays the basket through `FlowCandidateBasketReader`, and reads every exact frozen member through the Task 027 verified decision reader. Member order is the verified frozen order. The closed response exposes only workspace/basket identity and frozen metadata, frozen candidate identity/label/optional summary/state/version, effective B7 state, and decision ID/time when present. Artifact/request hashes, paths, actor and policy internals are not exposed. Any identity, membership, ordering, row, manifest, or artifact drift returns the generic integrity response without database mutation.

## OWNER API

`POST /owner-api/workspaces/:workspaceId/candidate-baskets/:basketId/b7-decisions`

The closed JSON body is exactly:

```json
{
  "contractVersion": "1.0.0",
  "candidateId": "<uuid>",
  "candidateVersion": 1,
  "decision": "PASS"
}
```

The URL owns workspace and basket identity. The server owns decision ID/time, actor ID, OWNER role snapshot, `governance:candidate-b7-review`, and fixed Task 027 policy. After verifying the exact basket and frozen member, mutation delegates exclusively to `CandidateB7DecisionService.decide()`.

New decisions return 201; verified exact retries return 200. Changed decisions return 409. Unknown exact resources return safe 404 where appropriate. Persisted corruption or drift returns generic 500. The safe receipt contains only contract version, decision/workspace/basket/candidate identities, candidate version, decision, time, and exact-retry status.

## Artifact safety

Task 040–042 request-scoped staging is retained. Only deterministic request-owned bytes are staged. Publication occurs after the database operation and is restricted to the digest referenced by the committed result, preventing a losing concurrent request from publishing an unreferenced artifact. Cleanup removes only the private request directory. Canonical EEXIST is accepted only after digest/size verification.

Exact-retry recovery is limited to the exact persisted B7 decision whose canonical file is genuinely absent. It verifies the request, immutable row, verified basket/member snapshot, actor/policy fields, manifest metadata and timestamps, canonical digest/size/path, and actual absence before recovering only those bytes. Changed requests, existing corruption, and every mismatch fail closed. No root scan, sweep, unrelated unlink, or canonical replacement exists.

## Frontend

Each frozen member shows its immutable label/optional summary/version, current editable-version distinction, B7 state, and immutable decision time. `NO_DECISION` has exactly three controls: `Đạt`, `Tạm giữ`, and `Loại`. A compact confirmation freezes basket ID, candidate ID/version, and decision in one immutable request snapshot and warns that the decision cannot be directly changed. It asks for no reason.

OWNER lock, incomplete identity, pending state, and existing decisions disable writes. Synchronous/asynchronous duplicate submissions are guarded. Success and 409 reload authoritative reads and verify the exact decision; the UI never inserts optimistically or navigates automatically. Decided states explain eligibility/reconsideration/scope without offering product-workspace creation. Demo mode is visibly synthetic, mutates only in-memory state, and never calls OWNER API.

## Exclusions

No product-workspace creation, automatic PASS action, same-version correction, rationale/free text, AI recommendation, ranking/scoring, B8–B10 change, provider/research execution, migration, authentication infrastructure, real decision, deployment, or Windows backport is included.
