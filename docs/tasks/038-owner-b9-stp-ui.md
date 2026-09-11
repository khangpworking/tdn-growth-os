# Task 038 — OWNER B9 working STP editor and immutable lock

## Outcome

Task 038 adds explicit local OWNER actions to create/update the single Task 031 working STP and to irreversibly lock the exact saved draft as the official B9 STP. Saving never locks automatically. Locking never creates a B10 decision or navigates automatically.

Both write paths delegate exclusively to the existing Task 031 `StpService`; the API owns no STP persistence rules or SQL.

## Endpoints

```text
POST /owner-api/product-workspaces/:productWorkspaceId/b9/working
POST /owner-api/product-workspaces/:productWorkspaceId/b9/lock
```

The working request is closed and contains `contractVersion`, `b8ClearanceId`, `expectedWorkingRevision`, ordered `segments`, `primaryTargetSegmentKey`, optional `secondaryTargetSegmentKeys`, and `positioningStatement`. Initial creation uses `null`; updates send the exact opaque revision from the verified read API. The URL owns product identity.

The lock request is closed and contains only `contractVersion` and `expectedWorkingRevision`. The server constructs the trusted OWNER actor and `governance:product-b9-lock` capability before calling `StpService.lock()`.

Working receipts expose only contract version, working STP ID, product workspace ID, opaque revision, created/updated timestamps, and exact-retry state. Lock receipts expose only contract version, lock ID, `LOCKED_STP`, locked time, and exact-retry state. Actor, policy, request hash, artifact path, and internal digest are not returned.

## Opaque revision and reads

The read-only B9 projection derives `workingRevision` from the verified current working digest through a one-way namespaced SHA-256 projection. The frontend treats it as opaque. It is present for WORKING and remains frozen for LOCKED; NOT_STARTED omits it. The read API remains a separate `readonly`, `fileMustExist`, `query_only` process and does not write while composing responses.

## Real-mode editor

The B9 view shows product identity, verified clearance, Not started/Working draft/Locked state, last saved time, and dirty state. Segment keys are stable and generated internally; users edit labels, optional descriptions, one primary radio target, optional unique secondary targets, ordering, addition, and removal. Existing keys and explicit order are preserved.

There is no autosave. **Save draft** requires unlocked OWNER actions and valid Task 031 content, sends the exact current revision (or null initially), disables duplicate submission, and reloads authoritative B9 data. A 409 reloads newer authoritative data and explains the conflict. Browser reload and in-app product navigation warn when edits are unsaved.

**Lock official STP** is enabled only for an unlocked OWNER, a saved exact revision, no dirty edits, no pending request, and no existing lock. Its confirmation explains that the exact saved draft becomes official, cannot be edited/replaced/unlocked in B9 v1, and creates no B10 decision. Success reloads B9, renders frozen content read-only, and offers a separate View B10 action without automatic navigation.

Demo mode remains explicit synthetic in-memory behavior and never calls these OWNER endpoints.

## Security and errors

Task 036 boundaries remain: explicit opt-in, exact loopback binding, strong bearer token checked in constant time, exact Origin, server-owned actor, 4 KiB body limit, no-store responses, and safe generic integrity errors. Malformed content is 400; authentication is 401; forbidden origin/disabled startup is 403; unknown product is 404; stale revision, missing/mismatched clearance, concurrent identity changes, absent working draft for lock, changed second lock, and post-lock edits are 409; persisted corruption is generic 500.

## Exclusions

No multiple STP versions, unlock/reopen, AI-generated STP, autosave, B10 write controls, B11, production authentication/reviewer roles, migration, provider calls, workers/scheduling/deployment, real calcium STP, private data, Windows backport, or LSP requirement.
