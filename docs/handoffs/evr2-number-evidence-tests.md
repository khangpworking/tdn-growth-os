# Handoff — EVR2 independent acceptance tests

Updated: 2026-10-27
Worktree/branch: treehouse tdn-growth-os-43e4a4/2, fm/evr2-tests; pushed to existing fm/evr2-number-evidence.
Completed: A1–A6 acceptance rows and negative controls. Production code unchanged. Fake DOM, synthetic zinc captures, in-memory S3 transport, no live source/MCP/R2 calls.
Changed paths: tests/integration/evr2-number-evidence.test.ts; tests/helpers/evr2-evidence-fixture.ts; tests/fixtures/evr2/; tools/mcp-market/tests/test_number_evidence.py.
Evidence (commands, results, relevant revision): code head 6632768b3ff141456d27cbded3a9c3be6ba353e9; `TDN_RESEARCH_PDF_CHROMIUM=/opt/google/chrome/chrome npm exec --yes --package=node@24.15.0 -- node --import tsx --test tests/integration/evr2-number-evidence.test.ts` passed 15/15, no skips; isolated-venv `python -m pytest -q -p no:cacheprovider tools/mcp-market/tests` passed 28 tests + 76 subtests; `npm run typecheck` passed. Only added Node test file and MCP suite ran.
Unresolved: A6 requires TDN_RESEARCH_PDF_CHROMIUM and pdftotext; real Chromium rendering/text extraction passed locally. Live integrations remain unverified. Worktree-local SQLite binding was rebuilt for Node 24. No owned Node/npm/Chrome process remained after verification.
Next action: fresh independent exact-head review of https://github.com/khangpworking/tdn-growth-os/pull/420, then coordinator handles CI/merge. Never merged/deployed here.
Business decisions pending: none found by acceptance tests; pre-existing R-P10 gap documented in coding handoff remains unchanged.

A1: flag OFF matches frozen pre-EVR2 HTML/trace, omits sidecar/R2 and disables API; ON fails the same OFF invariant.
A2: both windows retain all 12 members each, exact bytes/settings and source hashes; upload/read-back faults retain LOCAL_ONLY, missing section is PARTIAL, changed local bytes fail, and failed uploads still publish readable reports.
A3: all 496 synthetic report trace entries carry source refs; removing one raw-source ref blocks with V3_NUMBER_EVIDENCE_MISSING.
A4: frozen pre-EVR2 v1/v2 HTML/trace and retained synthetic PDF survive fresh reads and HTTP downloads with evidence ON; digest-valid HTML drift fails replay for both versions.
A5: stored source lookup/settings/24h links, independent GET signature vector/seven-day cap, workspace/ref/origin/auth refusals; MCP uses exact read-only OWNER GET without session mint/write gate. A temporary mutation dropping number_ref fails the unchanged MCP contract test.
A6: enabled report HTML and Chromium PDF text have no provider name; a branded source product blocks rendering and injected PDF text fails the same absence check.
