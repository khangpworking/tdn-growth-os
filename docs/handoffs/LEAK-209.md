# Handoff — LEAK-209 Market method trace

Updated: 2026-10-12
Worktree/branch: `wp/leak-209-market-trace`
Completed: Market M03/M04 method traces now render limitation, method and rounding identifiers as plain Vietnamese presentation copy. Stored limitation codes, bridge logic, source-package identities and hashes are unchanged. Unknown limitation and identifier values use generic Vietnamese fallbacks; classified traces continue to suppress the two classification limitation codes.

Changed paths:
- `src/modules/analysis/research-automation/metric-method-report.ts` — private limitation/id display maps, generic fallbacks, and the local SVG class rename needed to keep the forbidden-name substring guard clear.
- `tests/unit/leak-209-metric-trace.test.ts` — synthetic renderer tests for M03/M04, classified/unclassified variants, all known codes, unknown fallbacks and classification-code suppression.
- `docs/handoffs/LEAK-209.md`

Owner decisions applied:
- Plan line 447: “Owner-facing text: plain Vietnamese, no provider names (G-08).”
- G-08: the comparison sentence does not name a data source; no provider name or raw machine identifier is emitted in the method trace.
- L4/E2: mapped sentences do not add superlatives, ranking or priority wording.
- R1: no missing value is rendered as 0 by this change.
- The stored `LIMITATIONS` codes in `metric-method-bridge.ts` were not edited; `<code>` SHA-256 values remain unchanged.

Evidence (commands and results):
- `node --import tsx --test tests/unit/leak-209-metric-trace.test.ts` — PASS, 4/4.
- `node --import tsx --test tests/unit/research-automation-reports.test.ts` — PASS, 18/18 non-skipped; 2 PDF tests skipped because Chromium is unavailable.
- `node --import tsx --test tests/unit/report-visible-text-lint.test.ts` — PASS, 2/2.
- `node --import tsx --test tests/unit/research-automation-report-citations.test.ts` — PASS, 6/6.
- `node ..\\tools\\typecheck-win.mjs` — PASS, exit 0.
- `git diff --check` — PASS.
- `rg` review of `metric-method-report.ts` — only stored SHA-256 values remain in `<code>`; limitation and method/rounding identifiers are mapped before rendering.

What remains and why:
- `node --import tsx --test tests/integration/market-presentation-report.test.ts` could not execute its synthetic workbook fixture on Windows. All 3 tests fail at `tests/integration/market-presentation-report.test.ts:75` because `spawnSync('python3', ...)` returns no stdout and the test calls `.toString()` on `undefined`. This is reported as a Windows-only environment failure; the test was not weakened or changed.
- The integration test contains no assertion of the old raw limitation/id text, so no expectation update was needed.
- No other renderer leak was identified in the owned file. A full rendered-output sweep of the existing integration fixture remains for the Linux/CI environment that provides `python3`; no other lane-owned file was edited.

Blocked / needs other lane:
- No code change is requested from another lane. Linux CI or a Windows environment with the repository’s expected `python3` command should rerun the Market integration test and confirm the complete rendered-output sweep.

## Checklist evidence

| ID | Status | Evidence |
|---|---|---|
| LEAK-209 | DONE | `metric-method-report.ts:17-34` maps all eight `LIMITATIONS` entries plus `SHORTER_PERIOD`, maps both known ids and provides generic fallbacks; `metric-method-report.ts:75` renders only mapped reader copy while retaining hash codes. Focused tests pass 4/4. |
| G-08 | DONE | Focused tests render M03/M04 in classified and unclassified modes and assert no `CITATION_FORBIDDEN_NAMES`, raw limitation codes, `metric-scope-v1` or `percent-half-even-2-v1`. |
| G-09 | DONE | Presentation-only change; no value or missing-value handling changed, and no zero was introduced. |
| G-10 | PARTIAL | `metric-method-bridge.ts` and stored limitation data were untouched; hash fields remain rendered as before. Full integration replay could not run on Windows because of the `python3` fixture failure above. |
| G-11 | DONE | No existing assertion was deleted, skipped or weakened. No integration expectation required updating. |
| G-12 | DONE | This handoff records changed paths, decisions, evidence, blocker and remaining verification. |
