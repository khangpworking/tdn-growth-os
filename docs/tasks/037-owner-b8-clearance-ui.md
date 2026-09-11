# Task 037 — OWNER confirmation of exact four-PASS B8 clearance

## Outcome

Task 037 extends the separate Task 036 local OWNER API with one explicit confirmation action for the existing immutable Task 030 `READY_FOR_B9` clearance. Nothing runs automatically when the fourth lane becomes PASS.

The action freezes exactly the current verified `LEGAL`, `SCIENTIFIC`, `QUALITY`, and `FINANCE` PASS decision IDs. It does not create or edit an STP, move or mutate the product workspace, create B9/B10 records, or create a replacement clearance.

## OWNER endpoint

```text
POST /owner-api/product-workspaces/:productWorkspaceId/b8-clearance
```

The closed JSON request is:

```json
{
  "contractVersion": "1.0.0",
  "decisionIds": {
    "LEGAL": "<uuid>",
    "SCIENTIFIC": "<uuid>",
    "QUALITY": "<uuid>",
    "FINANCE": "<uuid>"
  }
}
```

The URL owns `productWorkspaceId`. Additional properties and body-supplied workspace identity are rejected. All four decision IDs must be distinct UUIDs and correspond to the exact current decisions displayed by the verified read API.

The OWNER API delegates exclusively to Task 030 `B8ClearanceService`. That service replays each decision, enforces deterministic lane order, verifies PASS state, common product-workspace lineage, and current effective membership, then persists one immutable clearance with four immutable membership rows and one content-addressed artifact. It owns retry, identity, concurrency, and historical-integrity semantics; the API writes no clearance SQL.

The receipt exposes only contract version, clearance ID, `READY_FOR_B9`, cleared time, and `exactRetry`. A new clearance returns 201; verified exact retry returns 200; malformed requests return 400; invalid credentials 401; disallowed origin or disabled startup 403; unknown product workspace 404; stale/non-PASS/mixed/different or second clearance conflicts 409; storage-integrity failures return generic 500.

## Preserved boundary

Use the same local-only startup documented for Task 036:

```bash
TDN_OWNER_API_ENABLED=true \
TDN_WORKSPACE_DB=/absolute/path/to/local.sqlite \
TDN_ARTIFACT_ROOT=/absolute/path/to/local-artifacts \
TDN_OWNER_API_ACTOR_ID=owner:local \
TDN_OWNER_API_TOKEN='<fresh-random-token-with-letters-and-digits>' \
TDN_OWNER_API_ALLOWED_ORIGIN=http://127.0.0.1:5173 \
npm run workspace-owner-api:start
```

Binding remains exactly `127.0.0.1` or `::1`; token comparison remains constant-time; request bodies remain bounded at 4 KiB; origin matching is exact. The read and write servers remain separate processes and separate SQLite connections. The read server remains `readonly`, `fileMustExist`, and `query_only`.

For remote access, expose neither server. Tunnel the loopback Vite port through SSH as in Task 036.

## Real frontend behavior

The existing Task 036 unlock state and memory-only token are reused. Real mode shows the current `x/4 PASS` state. **Confirm eligible for B9** is enabled only when:

- local OWNER actions are unlocked;
- all four current lanes are PASS;
- every lane has an exact current decision ID;
- no clearance exists;
- no request is pending.

A compact confirmation dialog states that the exact current four-PASS set will be frozen and that no STP or workspace transition occurs. Submission uses those exact IDs and is protected against double submission. Success reloads all authoritative product data through the read API. A 409 also reloads current B8 data and warns that one or more lane decisions changed. The UI never optimistically creates real clearance state and never falls back to demo data.

After authoritative reload, an existing clearance is shown with its time as immutable historical evidence. A separate **View B9** action is offered; creation does not navigate automatically. If later B8 state or decision IDs differ, the UI distinguishes current lane state from the frozen clearance and warns that the historical clearance remains immutable and cannot be replaced.

Demo mode keeps its existing synthetic, visibly labelled in-memory behavior.

## Exclusions

No automatic or replacement clearance; STP form/save/lock; B10 write; B11; production authentication or roles; reasons/notes; migration; AI/Pi; provider call; worker/schedule/deployment; real calcium decision/clearance; private data; Windows backport; or LSP requirement.
