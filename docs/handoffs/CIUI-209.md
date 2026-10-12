# Handoff — CIUI-209 frontend deterministic tests

Updated: 2026-10-12
Worktree/branch: `ciui-209`, `wp/ciui-209-frontend-flakes`

Completed:

- Reproduced the frontend suite from the task baseline: five completed sequential runs were green (294/294 each; baseline runs 1, 3, 6, 7 and 8). One additional baseline invocation was interrupted while still progressing and produced no test failure. The supplemental UI file was green alone (7/7), and the Insight crosscheck UI file was green alone (1/1).
- Root cause: `research-supplemental-source-ui.test.ts` used a fixed 5 ms sleep after React actions. Upload requests perform asynchronous Web Crypto hashing before `fetch`, and inventory/revision actions also settle asynchronously. Assertions on request counts and notices could therefore run before the relevant state existed under slower CI scheduling.
- Replaced fixed-delay assertions with a bounded `until` helper that polls the requested UI/request state. Upload dispatch, retry dispatch, late-response handling, inventory reload, and revision dispatch now each await their concrete condition.

Changed paths:

- `frontend/tests/research-supplemental-source-ui.test.ts:33-38` — bounded state wait helper.
- `frontend/tests/research-supplemental-source-ui.test.ts:67-72` — render waits for initial loading to settle.
- `frontend/tests/research-supplemental-source-ui.test.ts:97-234` — request, response, reload, and notice assertions wait on explicit conditions.
- `docs/handoffs/CIUI-209.md` — this handoff.

Evidence (commands, results, relevant revision):

- `npm ci --offline --no-audit --no-fund` — completed (Node 22.23.2 emitted the repository's existing engine warning).
- `npm run frontend:typecheck` — PASS.
- `npm run typecheck` — PASS.
- `npm run frontend:test` after the fix — 5 consecutive green runs, each 294/294 tests passing.
- `node --import tsx --test frontend/tests/research-supplemental-source-ui.test.ts` — 7/7 PASS.
- `node --import tsx --test frontend/tests/research-insight-crosscheck-ui.test.ts` — 1/1 PASS.

Unresolved: None.

Next action: Review the local commit; do not push or open a PR.

Business decisions pending: None.
