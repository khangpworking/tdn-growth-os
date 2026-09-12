# Task 041 handoff — OWNER product candidate UI

## Delivered

- Closed candidate-create and append-only candidate-revision OWNER endpoints under exact discovery-workspace and candidate URL IDs.
- Exclusive delegation to Task 025 `ProductCandidateService`; current-candidate workspace membership is verified through the existing reader before revision.
- Closed exact-version receipts, 201/200 create/retry behavior, bounded validation, explicit 404/409 behavior, and generic persisted-integrity failures.
- Task 040 request-owned staging reused for both paths, with narrowly verified exact missing-artifact recovery and no root sweep or canonical/unrelated deletion.
- Real discovery UI with Vietnamese create/edit forms, hidden stable key, exact expected version, double-submit guard, no optimistic mutation, authoritative reload, conflict reload, ambiguous retry identity, and historical product-snapshot notice.
- Demo remains synthetic. No candidate basket, B7 decision, product workspace, relationship, score/rank, provider, AI, migration, deployment, or real/private candidate data.

## Final handoff evidence required

The final governed PR comment records the immutable full SHA and its matching draft-PR, final-SHA CI, and handoff links together with:

- Focused backend/frontend test commands and totals.
- Exactly one final `npm run check` result.
- Creation/revision/exact-retry/conflict mutation evidence and historical-version replay evidence.
- Frozen basket/B7/product-workspace preservation and zero downstream creation evidence.
- Request-owned staging, exact recovery, and unrelated/pre-existing-file safety evidence.
- Read API query-only/database-byte preservation, unchanged migrations and canonical Task 025 contracts/service.
- POSIX owner-only database/WAL/SHM/artifact permission probes.
- Credential/private/runtime residue audit, clean worktree, and matching local/remote/PR heads.
- Remaining limitations.

Keep the PR open and draft. Do not force-push, merge, deploy, or create a real calcium candidate.
