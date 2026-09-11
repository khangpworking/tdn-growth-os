# Task 039 — OWNER combined B10 category-and-funding decision UI

Task 039 connects the existing Task 032 `ProductB10DecisionService` to the opt-in local OWNER server and real React UI. B10 v1 remains one combined OWNER decision: category/portfolio approval plus authorization for the product to receive funding. Allowed values are `APPROVE`, `HOLD`, and `REJECT`.

## OWNER endpoint

`POST /owner-api/product-workspaces/:productWorkspaceId/b10-decisions`

The closed request contains only `contractVersion`, exact verified `lockedStpId`, `previousDecisionId`, and `decision`. Product identity comes only from the URL. The first decision requires null predecessor; a correction requires the exact current effective decision ID. Actor, role, capability, policy, timestamp, reason, notes, amount, and workspace ID are rejected.

The server constructs an OWNER context with `governance:product-b10-review`, server-owned actor ID/time/identity, and delegates exclusively to Task 032. The closed receipt contains only contract version, decision ID/number, predecessor, decision, decided time, `readyForB11`, and exact-retry state.

Existing opt-in startup, loopback binding, strong bearer token, constant-time comparison, exact Origin, 4 KiB body limit, no-store responses, generic integrity errors, and memory-only frontend token remain unchanged. Malformed input is 400; missing/invalid credentials 401; disallowed origin 403; unknown product or locked STP 404; stale/wrong/cross-workspace predecessor or lock, repeated state, changed identity, and concurrent correction 409; persisted corruption generic 500.

## Semantics

Every new or corrected B10 decision appends one immutable record and artifact. Decision numbers are gapless and predecessor-linked. Earlier decisions remain replayable. Concurrent corrections from one predecessor cannot both append. Exact retries produce no mutations. `readyForB11` is true only for effective `APPROVE`; this task creates no B11.

APPROVE authorizes progress and eligibility to receive funding. It does not allocate, transfer, or spend money.

## Real UI

The real B10 panel shows product identity, verified locked-STP status/time, effective decision/number, `readyForB11`, and chronological immutable history. OWNER controls are disabled while locked, pending, without a verified locked STP, or when matching the effective state. Buttons are Approve category + authorize funding, Hold, and Reject.

Confirmation identifies the selected value and first-decision versus correction behavior, states that corrections append history, and explains that APPROVE moves no money. There is no reason, amount, reviewer, attachment, AI recommendation, automatic decision, optimistic update, or automatic navigation. Success and 409 reload authoritative read data; conflicts explain that the effective decision changed without overwriting it. Demo remains synthetic and never calls the OWNER API.

## Exclusions

No funding amount/allocation, money transfer, B11 state/task/execution, free text/reviewer/attachment, AI/Pi recommendation, STP edit/unlock, production authentication/new roles, migration, provider, worker/schedule/notification/deployment, real calcium decision, private data, Windows backport, or LSP requirement.
