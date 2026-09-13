# Task 045 handoff — integrated local operator runtime

## Delivered

- One built-in Node HTTP runtime serves the verified production frontend, read API, optional OWNER API, and health endpoint from one exact loopback origin while keeping separate existing read-only and writable application handles.
- Startup validates and immutably preloads `frontend/dist`; static responses are allowlisted and traversal-safe, while API namespaces never receive HTML fallback.
- Runtime configuration defaults to `127.0.0.1:8787`, derives the exact OWNER Origin internally, rejects non-loopback binding, keeps writes opt-in, and never prints private paths or credentials.
- Frontend boot uses relative `/healthz`, `/api/...`, and `/owner-api/...`; unavailable writes hide the token form and show truthful Vietnamese status without demo fallback or persistence.
- Disposable integration coverage executes the complete synthetic B3→B10 journey, disabled runtime, actual production assets, query-only reopen, owner-only file modes, empty staging, and launcher SIGTERM shutdown.
- Fedora runbook covers exact Node/npm pins, explicit migration, production build, shell-only configuration, health, real/demo distinction, and clean shutdown.

## Changed areas

- `src/api/operator-app.ts`, `src/api/index.ts`, `scripts/serve-operator-app.ts`, and `package.json`.
- `frontend/src/App.tsx`, `frontend/src/data-source.ts`, and focused frontend tests.
- `tests/helpers/disposable-operator-runtime.ts`, focused runtime tests, and full disposable journey tests.
- `docs/runbooks/fedora-local-operator-runtime.md`, task/handoff/STATUS, and `INTENT.md`.

No dependency, migration, canonical domain service, generated business contract, or runtime data is changed.

## Review focus

Confirm that commands use the actual `npm run db:migrate -- <database-path>` positional syntax; `TDN_WORKSPACE_DB` is described as runtime-only; examples contain placeholders rather than credentials or real paths/data; the canonical default remains `http://127.0.0.1:8787`; enabled writes retain strong token/actor requirements; normal mode is persisted while `?mode=demo` is synthetic; and no text recommends wildcard, LAN, internet, proxy, or forwarded exposure.

Confirm the task document covers one-origin architecture, production-static validation, `/healthz`, idempotent lifecycle closure, the complete currently implemented synthetic B3→B7→B8→B9→B10 journey, disabled behavior, residue/privacy checks, and exclusions without claiming B4–B6/B11 implementation or new business authority.

## Evidence still required before final PASS

- Review documentation against current launcher/configuration/migration syntax.
- Run relevant focused operator runtime and B3–B10 journey checks.
- Run frontend production build and inspect served static behavior.
- Run exactly the governed final full check when requested by the parent workflow.
- Record clean diff/worktree, final commit SHA, remote/PR SHA agreement, and final GitHub CI result.

Final full-check, CI, and SHA evidence are intentionally deferred until governed delivery is complete. No deployment or real business operation is performed.
