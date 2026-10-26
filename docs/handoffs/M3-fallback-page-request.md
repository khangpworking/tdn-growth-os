# Handoff — M3 fallback

Updated: 2026-10-26
Worktree/branch: `/home/pkhang/lanes/m3fb`, `fm/m3-fallback-page-request`; base `75d935da`.
Completed: OpenCLI UI remains first. Only explicit UI/control/selector/bridge failures trigger one complete page-request capture. Partial UI windows move to `ui-failed/`; published windows never mix methods. Session, preset, category, scope and provider-data failures do not trigger fallback. Both failure codes survive in `stopped.json` and the runner result; login still requires an owner decision.
Changed paths: v3 adapter and browser runner, capture runner/stop codes, window JSON Schema, two unit test files, capture map and this handoff. No dependency or migration changes.
Evidence (commands, results, relevant revision):
- `node --import tsx --test tests/unit/metric-v3-capture.test.ts tests/unit/metric-capture-runner.test.ts`: 27/27 pass. `npm run typecheck`: pass. Only touched test files; no full suite.
- Contract rows cover UI success, control/bridge failure, failure after a completed first window, login, unknown category, invalid preset, provider-data error and both methods failing. Every request is checked against the independent sanitized live-map fixture; changed-keyword/date coverage rejects recorded-sample replay.
- Negative controls: original production files fail method/fallback/dual-error rows; login/category guards already existed on the base. Expanding fallback to those forbidden errors fails both safety rows. Evidence: `/home/pkhang/lanes/m3fb-evidence/negative-controls.json` and adjacent logs.
- One live forced fallback, guard CAPTURE/RUNNING=0 through SQLite `mode=ro`, 10 endpoint requests, one runner invocation, owned tab closed. The fault switch is in the outside-Git `live.mts` evidence harness, off by default; it uses the existing process-runner dependency and is unreachable from the owner UI. No production test seam added.
- Live bundle: `/home/pkhang/lanes/m3fb-evidence/e5b2fd5a-f501-4886-aa99-53661c26dff3/run1`; receipt and side-by-side KPI table at `/home/pkhang/lanes/m3fb-evidence/{live-receipt.json,comparison.md}`. Both windows contain all five mapped response bodies; manifest/raw hashes verified. All four KPI platform arrays exactly match the prior UI bundle referenced by M3-capture.md.
- 30d UI = request: 35,008,532,252 VND; 193,970 units; 962 products; 587 shops. 12m UI = request: 379,407,808,965 VND; 1,932,935 units; 2,211 products; 1,262 shops. Dates: 2026-09-20–2026-10-19 and 2025-10-20–2026-10-19.
Unresolved: page requests depend on the current page's taxonomy component and read-only signed-header builder; changes fail closed with category/session errors. This does not implement legacy PREPARE consumption of v3 bundles. Historical PDF differences remain as documented in the capture map.
Next action: review PR; no merge or deployment authorized.
Business decisions pending: none.
Safety: no export/download, login/logout/settings change, production write, port 8787 access, merge or deployment. Credentials stayed in the page; no headers were saved.

## PR #412 owner-text CI repair (2026-10-26)

Completed: checked all six stop codes added by this PR and mapped each to existing plain Vietnamese owner text, with no provider/tool names or percentages.
Changed paths: `frontend/src/research-automation/autorun-text.ts` and this handoff.
Evidence: on base head `17f204beb48e1dfd81b620748f2ac0b594e7750e`, the existing owner-text coverage test reproduced `text for CAPTURE_BRIDGE_TIMEOUT`. After the repair, `node --import tsx --test tests/unit/autorun-present.test.ts tests/unit/metric-capture-runner.test.ts tests/unit/metric-v3-capture.test.ts` passed all 43 tests, including all-stop-code coverage and the PR's two touched test files. No tests changed.
Checks: `npm run typecheck` passed.
Unresolved: none.
Next action: push the repair for CI; no merge or deployment authorized.
