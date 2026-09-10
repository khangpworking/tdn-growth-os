# Handoff — Task 028 product workspace from exact B7 PASS

Updated: 2026-09-10
Worktree/branch: Fedora `tdn-growth-os-feature-028-product-workspace` / `feature/028-product-workspace-from-b7-pass`
Completed:
- Added a closed three-field Box 4 request and immutable product-workspace artifact contract.
- Added exact decision-ID Box 5 reader boundary and PASS-only product-workspace creation/replay.
- Added strict immutable migration 0016 with one globally unique key and one workspace per exact B7 PASS.
- Preserved copied available discovery workspace, basket, candidate, decision, OWNER actor, policy, and digest lineage.
- Verified exact retry has zero database mutations and source/key conflicts fail closed.
Changed paths:
- `contracts/flow/product-workspace-*.schema.json` and generated TypeScript
- `migrations/0016_product_workspaces.sql`
- `src/modules/flow/product-workspace-{service,reader}.ts`, Flow validation/exports
- `src/modules/governance/candidate-b7-decision-reader.ts`, Governance exports
- focused migration/behavior tests and status documentation
Evidence (commands, results, relevant revision):
- Required base: `2c4199e6728db5bc8f03b9e0e5097d146e403eb7`.
- Node `24.15.0`, npm `11.12.1` focused Task 028 tests: 11/11 PASS.
- Full test suite: 157/157 PASS before final repository check.
- Private calcium database read-only readiness probe: schema v15, B7 decisions 0, no product-workspace table yet; no decision or workspace created.
Unresolved:
- B8 work itself, B8–B14 transitions, funding, supplier, legal/scientific/quality approval, publication, launch, API/UI, workers, AI/provider behavior, and external actions remain out of scope.
Next action:
- Run final repository checks, commit/push, await GitHub Checks, and preserve the draft PR for review.
Business decisions pending:
- Any real B7 decision and any real calcium product-workspace creation remain owner actions outside this task.
