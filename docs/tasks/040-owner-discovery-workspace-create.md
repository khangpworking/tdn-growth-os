# Task 040 — OWNER discovery workspace creation

Task 040 connects the existing Task 025 `DiscoveryWorkspaceService.createWorkspace()` to the opt-in local OWNER API and the real market portfolio.

A discovery workspace is one broad market-opportunity research area, such as “Thị trường collagen” or “Chăm sóc giấc ngủ”. It can later contain multiple product candidates. This is not a finalized interpretation of B0; B0 remains future-planned.

## Endpoint

`POST /owner-api/workspaces`

The closed request contains only `contractVersion`, `workspaceKey`, `title`, and optional `description`. The server delegates exclusively to Task 025 and performs no direct discovery SQL writes. The closed receipt contains only contract version, workspace ID/key, ACTIVE state, title, optional description, created time, and exact-retry state.

New creation returns 201; verified exact retry returns 200; malformed input 400; missing/incorrect token 401; disabled writes or disallowed Origin 403; key/content identity conflict 409; unsupported method 405; persisted integrity failure generic 500. Existing opt-in startup, loopback binding, strong bearer token, constant-time comparison, exact Origin, 4 KiB body, server configuration, no-store response, and safe error protections remain unchanged. The read API remains separate and query-only.

The local OWNER gate authorizes creation. No new governance decision, role, or capability is introduced.

## Identity and UI

The real portfolio exposes “Create new research” and the existing memory-only OWNER unlock is reachable there. The form contains required market/opportunity title and optional description. It does not expose a technical workspace key.

Opening a form generates one random Task 025-valid key. React retains that key for the active form across pending requests, connection ambiguity, and retry. It is not derived from the title. Duplicate titles therefore remain distinct by key and ID. Changed content under an already-used key fails closed.

The UI states: “Creating this workspace only creates an empty research area. It does not start collection, analysis, or provider activity.” Locked or pending state disables submission. The UI does not optimistically insert a row. After success it reloads the authoritative read API, requires the exact returned ID to appear as an empty workspace with zero candidates and products, and only then navigates. On 409 it reloads and explains the identity conflict. Ambiguous connection failures preserve the same active-form key for safe retry. Demo creation remains synthetic and never calls the OWNER API.

## Exclusions

Creation does not define B0, create/edit/delete/archive candidates or workspaces, create candidate revisions, baskets, B7 decisions, products, reports, collections, or provider records, run research or analysis, call providers or AI/Pi, add production authentication/roles, migrations, workers, scheduling, deployment, real calcium data, private data, Windows backport, or LSP requirements.
