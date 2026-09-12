# Task 042 handoff — governed candidate-basket freeze and UI

## Delivered

- Dedicated query-only `GET /api/workspaces/:workspaceId/candidate-baskets` read path that discovers exact-workspace basket IDs, verifies every basket through the existing Task 026 reader, returns deterministic basket-family/version order, and exposes only safe basket and frozen-member fields.
- Closed `POST /owner-api/workspaces/:workspaceId/candidate-baskets` route with URL-only workspace identity, non-empty exact candidate ID/version selections, safe receipts, and 201 new / 200 verified exact-retry behavior.
- Exclusive mutation delegation to Task 026 `CandidateBasketService.freezeBasket()`, with exact ACTIVE-workspace and historical-candidate verification and no direct basket SQL writes.
- Fail-closed handling for malformed requests, authentication/enablement/origin failures, unknown resources, duplicates, wrong-workspace or missing revisions, stale identities, skipped versions, changed membership, and persisted integrity drift.
- Task 040/041 request-owned staging preserved, including cleanup limited to the current private staging directory, verified canonical `EEXIST`, narrow exact missing-artifact recovery, concurrent identical-request convergence, and no root sweep, unrelated deletion, orphan registration, or partial membership.
- Real Vietnamese discovery UI with initially empty exact-version candidate selection, hidden stable basket identity, new-family or next-version flow, confirmation, double-submit guard, no optimistic mutation, authoritative success/conflict reload, ambiguous retry preservation, and immutable basket history.
- Demo mode remains synthetic. No rank, score, recommendation, winner, B7 decision, product workspace, candidate mutation, provider/research/AI action, migration, production auth, deployment, or real/private basket data is introduced.

## Final handoff evidence required

The final governed PR comment records the immutable full SHA and matching draft PR, final-SHA CI, and handoff links together with:

- Focused read API, OWNER API, Task 026 replay/history, frontend state, and frontend interaction commands and totals.
- Exactly one final `npm run check` result.
- New freeze, exact retry, changed-content conflict, skipped-version, duplicate-member, wrong-workspace, absent historical revision, and concurrent identical-request evidence.
- Immutable historical replay after later candidate revision and later basket-version evidence, including deterministic ordering and no implied rank.
- Read-only/file-must-exist/query-only/database-byte preservation and generic integrity-boundary evidence.
- Request-owned staging, narrow exact recovery, canonical mismatch refusal, unrelated/pre-existing-file safety, and zero orphan/partial membership evidence.
- Safe closed request/receipt/read fields, no hashes/paths/SQL/actors/stacks, and unchanged migrations and canonical Task 026 service/contracts.
- UI empty selection, exact-version confirmation, no optimistic mutation, conflict reload, ambiguous retry identity, immutable history, and synthetic-only demo evidence.
- POSIX owner-only database/WAL/SHM/artifact permission probes.
- Credential/private/runtime residue audit, clean worktree, and matching local/remote/PR heads.
- Remaining limitations.

Keep the PR open and draft. Do not force-push, merge, deploy, create a B7 decision or product workspace, or freeze a real calcium basket.