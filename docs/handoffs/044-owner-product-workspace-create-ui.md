# Task 044 handoff — OWNER product-workspace creation from exact B7 PASS

## Delivered

- A closed opt-in OWNER route for explicit product-workspace creation from one URL-scoped exact B7 PASS decision.
- Mutation delegation exclusively to the existing Task 028 `ProductWorkspaceService`, retaining one-workspace-per-PASS, globally unique key, immutable frozen lineage, and exact-retry behavior.
- Verified B7 read projection linking a frozen member to its product workspace only by exact decision identity and complete replayed source lineage.
- Request-scoped artifact publication restricted to the committed digest, plus narrow recovery for only an exact missing canonical product-workspace artifact.
- Real discovery UI with PASS-only create eligibility, hidden stable generated identity, compact confirmation, duplicate-submit guard, authoritative reload/receipt verification, linked-workspace display, and explicit demo isolation.
- Closed generated API contract plus narrow intent, task, status, and handoff documentation.

## Changed paths in scope

- `INTENT.md`
- `contracts/api/owner-product-workspace-api.schema.json`
- `contracts/api/owner-product-workspace-api.generated.ts`
- `contracts/api/workspace-api.schema.json`
- `contracts/api/workspace-api.generated.ts`
- `scripts/generate-foundation-contract.mjs`
- `src/api/owner-api.ts`
- `src/api/workspace-api.ts`
- `frontend/src/ProductWorkspaceCreatePanel.tsx`
- `frontend/src/App.tsx`
- `frontend/src/data-source.ts`
- `frontend/src/model.ts`
- `frontend/tests/data-source.test.ts`
- `tests/integration/owner-product-workspace-api.test.ts`
- `docs/tasks/044-owner-product-workspace-create-ui.md`
- `docs/handoffs/044-owner-product-workspace-create-ui.md`
- `docs/STATUS.md`

## Review focus

Confirm the exact workspace/basket/decision URL scope, PASS-only eligibility, closed two-field body, hidden stable key, exclusive Task 028 service delegation, one product workspace per exact PASS, globally unique key, zero-mutation exact retry, safe 400/404/409/generic-500 mapping, no direct product-workspace SQL, complete read-projection lineage checks, query-only byte stability, receipt/reload validation, demo isolation, and absence of automatic B8 or downstream authority.

Artifact review should verify that only the winning committed digest is published, losing/concurrent requests leave no orphan canonical or staging files, exact recovery is limited to a truly absent matching target, and corruption or upstream/manifest drift is never healed.

## Final evidence required before PASS handoff

- Generated contracts and strict backend/frontend TypeScript checks.
- Focused Task 027/028/042/043/044 service, OWNER API, read API, concurrency, recovery, and frontend tests.
- Frontend production build and static authority/residue review.
- Migration and protected Task 028 service integrity checks.
- Read-only/query-only database byte-preservation and empty-B8 acceptance checks.
- `git diff --check` and review for private/runtime/credential residue.
- One narrow independent review.
- Exactly one final full `npm run check`.
- Normal push to `feature/044-owner-product-workspace-create-ui`, an open draft PR, final-SHA GitHub CI success, clean worktree, and matching local/remote/PR SHA.
- A PR comment beginning exactly `HANDOFF_TO_CODEX commit=<FINAL_SHA> result=PASS` and recording changed paths, focused/full checks, CI, artifact safety, limitations, and residue findings.

Do not merge, deploy, force-push, create a real business product workspace, issue a real B7/B8 decision, or perform a provider/external action.
