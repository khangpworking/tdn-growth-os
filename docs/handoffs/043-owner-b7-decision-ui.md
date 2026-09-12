# Task 043 handoff — governed B7 candidate decisions and UI

## Delivered

- Dedicated verified B7 read route for each exact workspace/basket.
- Closed opt-in OWNER B7 decision route delegating exclusively to Task 027.
- Exact immutable frozen-member targeting, retry/conflict semantics, and generic integrity boundaries.
- Request-scoped artifact publication limited to the committed digest, plus narrow exact missing-artifact recovery.
- Real B3/B7 UI with three button-only decisions, compact immutable confirmation, authoritative reload, post-decision boundary copy, and synthetic demo isolation.
- Closed generated API contracts, focused backend/frontend coverage, concise intent/status/task documentation.

## Review focus

Confirm authorization and fixed policy/capability, exact frozen versions rather than current revisions, no reason fields, immutable one-decision behavior, idempotency/concurrency, no orphan/unrelated artifact impact, verified query-only ordering and byte stability, strict receipt/reload verification, demo isolation, and absence of product-workspace or downstream action authority.

## Final evidence required before PASS handoff

- Generated contracts and strict TypeScript checks.
- Focused Task 027/042/043 backend and API tests.
- Focused frontend tests and production build.
- `git diff --check` and residue/protected-file review.
- One narrow independent review.
- Exactly one final full `npm run check`.
- Normal push to `feature/043-owner-b7-decision-ui`, open draft PR, final-SHA GitHub CI success, clean worktree, and matching local/remote/PR SHA.
- A PR comment beginning exactly `HANDOFF_TO_CODEX commit=<FINAL_SHA> result=PASS` with paths, checks, limitations, artifact safety, and residue findings.

Do not merge, deploy, force-push, create real decisions, or create product workspaces.
