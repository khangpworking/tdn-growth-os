# Insight model browser client

04/10/2026. Unreleased working tree on `0116091`; no live activation.

The browser client now sends an explicit model-coding request through the
existing OWNER endpoint. Request and response validators are precompiled from
canonical schemas, compatible with the operator CSP. It accepts only the
expected HTTP status and verifies PROPOSAL kind and new-versus-exact-retry
semantics. NOT_DISPATCHED, PREPARED, INVALID and DISPATCH_UNKNOWN remain distinct
outcomes, never successful proposals. AbortSignal reaches fetch. There is no
automatic retry, acceptance, report regeneration or source collection.

Changed: insight-coding-api.ts, validator generator/declarations and the
existing client test suite. No new dependency, schema or backend change.

## Evidence

- Isolated Fedora checkout: `~/.cache/tdn-p1-isolation-20261003-ZVXHsB`.
- Linux frontend typecheck, including validator generation: PASS.
- Client suite: 3/3 PASS.
- Final affected client plus existing mounted coding UI suites: 9/9 PASS
  (includes the preceding three, not additional nine).
- Production frontend build: PASS. Existing large-chunk warning remains;
  no bundle-size claim is made.
- `git diff --check`: PASS at client checkpoint.
- No Windows project test, model/provider call, private data or deployment.

Test ownership: the new client test protects the browser's transport boundary,
especially wrong receipt kinds, status mismatches, unsafe response fields,
invalid local batches and accidentally retrying an ambiguous paid call. Server
authentication/persistence remain owned by the existing HTTP integration test.

## Still open

This client alone is not a working generation button. Claude task
`task-mutinc9i-c3vag8` was assigned the existing panel's explicit full-corpus
batch flow and mounted lifecycle tests, using Opus 5.5 high. Its output needs
GPT audit, Linux checks and bounded browser/finish review before acceptance.
No worker result is assumed in this checkpoint. Real semantic benchmark,
three-case acceptance and release remain open; section completion unchanged.
