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

## Round 2

Root cause: the Insight crosscheck test used a fixed 20 ms timer as the only way to yield between UI assertions, plus a second fixed-delay polling loop while waiting for the durable report attempt. Under Linux scheduling and worker load, those elapsed-time guesses could leave the test observing an intermediate state and eventually fail after a long wait. The test now yields through React `act` and `setImmediate`, checks the concrete UI or report-attempt state on every turn, and applies a 30 s ceiling with a state-specific failure label. No frontend source race was found or changed; the exact two blinded gateway calls and retained retry bodies were already serialized by the component and API.

Changed paths:

- `frontend/tests/research-insight-crosscheck-ui.test.ts:13-24` — replaced fixed-sleep polling with bounded event-loop/state waits and diagnostic labels.
- `frontend/tests/research-insight-crosscheck-ui.test.ts:133-138` — converted the committed report-attempt loop to the same bounded asynchronous state wait.
- `docs/handoffs/CIUI-209.md` — this round-2 evidence.

Evidence:

- `node --import tsx --test frontend/tests/research-insight-crosscheck-ui.test.ts` — 20/20 consecutive passes; slowest isolated wall duration 29.860 s.
- `npm run frontend:test` — 5/5 consecutive passes, 294/294 tests each (53.22–55.98 s).
- Concurrent load: 3 rounds with `npm run frontend:test` and the crosscheck file running together — all 6 processes passed; crosscheck durations 59.50 s, 63.77 s and 64.15 s.
- `npm run frontend:typecheck` — PASS.
- `npm run typecheck` — PASS.

## Round 3

Root causes addressed:

- The supplemental UI helper still used a 5 ms sleep for 300 iterations, so concrete request/UI waits had only a 1.5 s ceiling. It now yields with a 1 ms timer, checks the concrete state on every turn, and uses a 30 s deadline with a diagnostic state label.
- The crosscheck helper used tight `setImmediate` polling, which could burn CPU under concurrent load. It now yields with a 1 ms timer between bounded state checks.
- The crosscheck panel rendered the no-configuration text while availability was still loading or after failure. It now exposes a minimal `data-availability-state` marker (`loading`, `success`, `error`), and the test waits for `success` before asserting the no-configuration text.

Changed paths:

- `frontend/tests/research-supplemental-source-ui.test.ts:33-38` — deadline-based state wait with timer yield and failure diagnostics.
- `frontend/tests/research-insight-crosscheck-ui.test.ts:13-18,107-108` — CPU-friendly bounded polling and successful availability-settlement wait.
- `frontend/src/research-automation/InsightCrosscheckPanel.tsx:14-15,31-35,107` — availability settlement state and marker.
- `docs/handoffs/CIUI-209.md` — this round-3 evidence.

Evidence:

- Crosscheck UI alone — 20/20 passes; slowest wall duration 35.125 s.
- Supplemental UI alone — 20/20 passes; slowest wall duration 1.812 s.
- `npm run frontend:test` — one initial invocation had an unrelated existing `research-insight-persona-ui.test.ts` timing failure (293/294; 172.399 s); that test passed alone, followed by five consecutive full-suite passes (294/294), slowest 64.228 s.
- Concurrent load — 3 rounds running the full suite and crosscheck together; all 6 processes passed. Slowest crosscheck wall duration 75.032 s; slowest full-suite wall duration 75.031 s.
- `npm run frontend:typecheck` — PASS.
- `npm run typecheck` — PASS.
- `git diff --check` — PASS.

Nothing remains outstanding; no push was performed.
