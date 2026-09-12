# Task 041 — OWNER product candidate creation and revision

Task 041 connects the existing Task 025 `ProductCandidateService.createCandidate()` and `reviseCandidate()` methods to the opt-in local OWNER API and the real discovery-workspace UI.

One ACTIVE discovery workspace is one broad market opportunity and may contain multiple independent candidates. Candidate identity is workspace-scoped key plus immutable candidate ID, never label. Duplicate labels under distinct keys are valid. Revising one candidate neither relates it to nor changes another candidate.

## OWNER API

- `POST /owner-api/workspaces/:workspaceId/candidates`
  - Closed body: `contractVersion`, `candidateKey`, `label`, optional `summary`.
- `POST /owner-api/workspaces/:workspaceId/candidates/:candidateId/revisions`
  - Closed body: `contractVersion`, `expectedVersion`, `label`, optional `summary`.

Workspace and candidate IDs come only from URL paths. Before revision, the existing verified candidate reader confirms that the current candidate belongs to the requested workspace. Both paths delegate exclusively to Task 025; there are no direct candidate SQL writes.

The closed receipt contains only contract version, candidate ID, workspace ID, candidate key, `EXPLORING`, exact resulting version, label, optional summary, exact-version creation time, and exact-retry state. New versions return 201; verified exact retries return 200; malformed input 400; invalid authentication 401; disabled writes/disallowed Origin 403; unknown workspace/candidate 404; key/content, stale/skip, or workspace-pairing conflict 409; persisted integrity failure generic 500.

## Append-only and frozen history

Each revision appends one immutable version. Exact historical versions remain replayable. Existing basket membership, B7 decisions, and independent product workspaces continue referencing the exact candidate version they froze. Editing the latest candidate cannot mutate or replace those records.

Task 041 creates no basket, B7 decision, product workspace, candidate relation, score, rank, comparison, state transition, deletion, archive, provider activity, research, AI/Pi output, or downstream action.

## Artifact safety and recovery

The OWNER paths reuse Task 040 request-scoped staging. A request stages only its deterministic missing content below its unique private `.owner-api-requests/<uuid>` directory. Cleanup removes only that private directory; it never scans the artifact root or deletes a canonical/unrelated path. Publication hard-links only staged request-owned content and accepts canonical `EEXIST` only after exact digest and byte-size verification.

If database commit succeeds before publication, an exact create/revision retry may recover only its exact missing target after checking request bytes/hash, candidate row and identity, target version, full manifest metadata/timestamps, canonical digest and size, and confirmed path absence. Existing corruption or any mismatch fails as generic integrity error.

## Real and demo UI

The real “Khám phá và rổ cơ hội” view supports OWNER create and edit forms with required candidate/product-concept name and optional summary. Technical candidate keys are generated and hidden. One active create form retains its key across pending, ambiguous response, and retry. Revision sends the displayed exact current version as `expectedVersion` and preserves candidate key/ID.

The UI prevents synchronous double submission and performs no optimistic insertion or edit. Success reloads the query-only read API and requires the exact returned candidate ID/version/content. Conflict reloads authoritative current state and explains that a newer revision exists without overwriting it. Candidates display current label, optional summary, exact version, `EXPLORING`, and whether a product workspace exists from a frozen historical version. If so, the UI states that the product workspace retains the B7 snapshot.

Visible scope warning: “Ứng viên mới chỉ ở trạng thái khám phá. Thao tác này chưa chọn sản phẩm, chưa tạo B7 và chưa tạo workspace sản phẩm.” Demo mode remains explicitly synthetic and never calls OWNER APIs.

## Explicit exclusions

No scoring/ranking/comparison, candidate relationships, delete/archive/state controls, 60-question framework, B1–B6 forms, basket, B7 decision, product-workspace creation, collection/provider calls, AI/Pi, migrations, production authentication/roles, deployment, real calcium candidates, private data, Windows backport, or LSP requirement.
