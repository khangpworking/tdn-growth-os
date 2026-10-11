# Handoff — GATE-209 Market business-rule gate

Updated: 2026-10-12
Worktree/branch: `wp/gate-209-market-business`
Completed: pure final-HTML Market business gate, automated Market wiring, read-only flow audit, coordinator CLI, and synthetic unit coverage. No commit created; the coordinator owns the commit.

Changed paths:

- `src/modules/analysis/research-automation/market-business-gate.ts` — new pure gate with G08, U32, E2, section, M12, no-leak and U13 results.
- `src/modules/analysis/research-automation/reports.ts:61,917-923` — Market-only gate import and failure throw; Insight path unchanged.
- `src/modules/analysis/reader-report/lint.ts:18` — exported the existing captured provider-name list; lint behavior unchanged.
- `scripts/audit-market-report.ts` — offline one-file CLI with `PASS|FAIL rule detail` output and nonzero failure exit.
- `tests/unit/gate-209-market-business.test.ts` — 20 synthetic tests covering the gate and the real Market builder boundary.

Round 2:

- `src/modules/analysis/research-automation/market-business-gate.ts` — added the presentation-aware `assertMarketBusinessGate` helper, inline-text concatenation with block/`br` boundaries, decoded/raw NO_LEAK scanning, parsed section counting that ignores script/style/template/comment content, and bounded technical gate details.
- `src/modules/analysis/research-automation/reports.ts:919` — routes the existing presentation Market check through the shared assertion helper; the Insight branch is unchanged.
- `src/modules/analysis/research-automation/service.ts:13,3215` — audits every final Market HTML immediately before the first artifact write, applying the full presentation rules only when `input.marketPresentation` is present.
- `tests/unit/gate-209-market-business.test.ts:67-91` — added inline split, encoded-email/bare-path, script/comment section, and non-presentation helper regressions.
- `tests/integration/gate-209-market-business.test.ts:16` — added a service-level custom-renderer regression proving REPORTS fails before a Market output version or HTML artifact is retained.

Round 2 findings → fixes → tests:

1. Every Market render path could bypass the gate → shared assertion at `service.ts:3215`, before `#artifacts.put` → `tests/integration/gate-209-market-business.test.ts:16` passes with FAILED run, `REPORT_RENDER_FAILED`, no Market output, and no report versions.
2. Inline tags split lexical phrases → `market-business-gate.ts:52-143,168` concatenates inline content and preserves only block/`br` boundaries → `tests/unit/gate-209-market-business.test.ts:67` catches split provider, cross-platform, E2, and M12 proposal text.
3. Encoded leaks and bare path prefixes bypassed NO_LEAK → `market-business-gate.ts:155-168` scans raw HTML, decoded HTML, decoded attributes, and prefix-inclusive path patterns → `tests/unit/gate-209-market-business.test.ts:75` covers both email entities and terminal `C:\`/`D:\`.
4. Script/comment section strings were counted → `market-business-gate.ts:80-126,187` counts parsed section starts while skipping hidden containers and comments → `tests/unit/gate-209-market-business.test.ts:81` fails the adversarial script/comment-only document.
5. Gate details were unbounded and inherited Vietnamese lint prose → `market-business-gate.ts:143-148,197-205` emits `clean`, fixed technical labels, or at most three bounded `snippet:` values; the Insight lint branch remains unchanged → focused unit suite passes and all gate details are bounded by the synthetic passing assertion.

Owner decisions applied:

- “G-08: owner-facing text never names data providers (plan line 447). Jev and TypeSafe count as providers too (owner, 2026-10-12).” Provider matching covers visible text, details, citation register text, title/alt/aria-label attributes, model-id shapes, and excludes hidden/script text and href-only URLs.
- “U-32 is CLOSED: Shopee and TikTok Shop are never added together (plan line 9 and line 246).” The gate uses an explicit documented phrase list; standalone platform names remain allowed.
- “E2 / U-07: no priority order or revenue ranking in M11/M12 (plan line 118 and line 177).” Authored text is checked while headings and quoted text are exempt.
- “L3 / U-13: classified numbers carry ‘đề xuất, chờ chủ duyệt’ in the same sentence.” The three existing visible-text lint results are appended to the Market gate result list.

Flow audit (read-only):

- `src/modules/analysis/research-automation/service.ts:3143` calls `buildResearchAutomationReport` for an authoritative Market presentation.
- A gate throw is caught at `service.ts:3224-3229` before artifact persistence at `service.ts:3214-3222`; no failing HTML/semantic/PDF output is inserted or published.
- The non-revision path settles the REPORTS step as `FAILED` with `REPORT_RENDER_FAILED` and transitions the run to `FAILED` through `service.ts:3468-3490`. A revision attempt is settled as `FAILED` at `service.ts:3225` and leaves the prior committed version unchanged.
- The owner can read the failed run and REPORTS step through the projection at `service.ts:3521-3545`; `service.ts:4202-4227` exposes the safe generic message from `model.ts:159`: “Draft rendering failed; collected data and raw captures are preserved.” The specific `MARKET_BUSINESS_GATE_FAILED:<rules>` text is not retained by this lane because the service catch is owned elsewhere.

Blocked / needs other lane:

- None for the requested publication-blocking behavior: a failing Market report cannot be stored or published.
- If the owner later requires the exact failed gate rule to be visible in the run UI, that needs a separate change in `service.ts`/API, which is outside this lane’s owned paths.
- Existing integration fixtures could not complete on Windows because they invoke `python3`: all three failures occurred before assertions at `tests/integration/market-presentation-report.test.ts:75` with `TypeError: Cannot read properties of undefined (reading 'toString')`. No assertion was weakened.

Evidence:

- `node --import tsx --test tests/unit/gate-209-market-business.test.ts` — 20 passed, 0 failed.
- `node --import tsx --test tests/unit/research-automation-reports.test.ts tests/unit/market-presentation-method.test.ts tests/unit/market-advertising.test.ts` — 25 passed, 0 failed, 2 Chromium-dependent skips.
- `node --import tsx --test tests/unit/research-automation-reports.test.ts tests/unit/market-presentation-method.test.ts tests/unit/market-advertising.test.ts tests/integration/market-presentation-report.test.ts` — 25 passed, 3 Windows-only fixture failures, 2 skips; failures are listed above.
- `node ../tools/typecheck-win.mjs` — exit 0 (`files 912 status 0`).
- `node --import tsx scripts/audit-market-report.ts` — usage guard emitted and exited nonzero without a file argument.
- `git diff --check` — clean; only normal CRLF conversion warnings for existing modified files.

Round 2 evidence:

- `node --import tsx --test tests/unit/gate-209-market-business.test.ts tests/integration/gate-209-market-business.test.ts` — 20 passed, 0 failed.
- `node ../tools/typecheck-win.mjs` — exit 0 (`files 913 status 0`).
- `node --import tsx --test tests/unit/research-automation-reports.test.ts tests/unit/market-presentation-method.test.ts tests/unit/market-advertising.test.ts tests/integration/market-presentation-report.test.ts` — 25 passed, 3 Windows-only setup failures, 2 Chromium-dependent skips.
- The three Windows-only failures are `actual auto service builds source-bound findings/unit tables and immutable reports while stripping adapter injection`, `auto presentation without a receipt preserves zero/missing, keeps references unavailable and rejects unrelated digests before queuing`, and `actual auto revision composes retained literal19/Source18 with Market20 and never discovers an unselected prepared package`; each stops at `tests/integration/market-presentation-report.test.ts:75` with `TypeError: Cannot read properties of undefined (reading 'toString')` before assertions. No test was weakened.
- `git diff --check` — exit 0.

## Round 2 follow-up

- `src/modules/analysis/research-automation/market-business-gate.ts:27,147-159,201` now separates the always-failing E2 phrases (`Thứ tự theo doanh thu`, `top 3`) from `xếp hạng`/`thị phần`. The latter are exempt only when a negation (`không`, `không phải`, `chưa`, `chẳng`) appears in the preceding 40-character clause after the nearest `.`, `;`, `:`, newline or block boundary. Affirmative uses remain failures.
- `tests/unit/gate-209-market-business.test.ts:63-96` covers the renderer disclaimers quoted in the regression, each affirmative example, and a prior-sentence negation that must not exempt a later affirmative use.
- `node --import tsx --test tests/unit/gate-209-market-business.test.ts` — 20 passed, 0 failed.
- `node --import tsx --test tests/integration/research-automation-api.test.ts` — 7 passed, 8 failed. The four named regression tests all passed: `confirm freezes two web reports and reports PDF as unavailable without a renderer`; `bounded revision HTTP contract reaches the existing worker and rejects changing unrelated sources`; `quote revision HTTP contract reaches the existing worker and rejects changing unrelated sources`; `source-bound HTTP confirmation and supplemental versions preserve old report URLs and expose exact attempt cancellation`.
- The eight Windows-only failures were `three industries classify a new report from complete selected acceptance without changing old reports` (`INVALID_LOCATED_INSIGHT_INPUT:data/profileSha256 must be equal to constant, data/adoptionSha256 must be equal to constant`), `OWNER Metric rule adoption is immutable, scope-bound, inert and replayable after reopening` (`438 !== 384` at the existing assertion), `bounded raw Metric upload prepares original bytes without admission, preserves exact retries and late-source isolation` (`Cannot read properties of undefined (reading 'toString')`), `supplemental HTTP intake authenticates before storage and prepares an exact package without report admission` (`400 !== 201`), `OWNER model coding uses its own opt-in, safe receipt, retained retry and shutdown settlement` (`INVALID_LOCATED_INSIGHT_INPUT:data/profileSha256 must be equal to constant, data/adoptionSha256 must be equal to constant`), `OWNER Insight coding round-trips over HTTP with exact source context, retries and a report revision` (same `INVALID_LOCATED_INSIGHT_INPUT`), `reader report routes build, serve and decide one OWNER reader page without touching the draft` (`Cannot read properties of undefined (reading 'toString')`), and `saved revision PDF export reports a genuine render failure distinctly from a missing renderer` (`Cannot read properties of undefined (reading 'toString')`). No assertion was weakened.
- `node ../tools/typecheck-win.mjs` — exit 0 (`files 913 status 0`). `git diff --check` — exit 0.

## Checklist evidence

| ID | Status | Evidence |
|---|---|---|
| G-08 | DONE | `auditMarketReportHtml` scans final reader-visible text and title/alt/aria-label attributes, reuses both provider lists, adds Jev/TypeSafe/CLIProxy/OpenAI/Anthropic/GLM and model-id shapes, and has hidden/script and href-only tests. |
| U-32 | DONE | Explicit additive phrase list; Shopee/TikTok-only test passes and cross-platform-total test fails. |
| U-07 / E2 | DONE | Authored-text detection blocks revenue-order phrases; quote and heading exemption is implemented, with quoted-text regression coverage. |
| U-13 | DONE | Gate returns the three `lintVisibleReportText` results; each U13 failure has focused coverage and the real Market build throw is asserted. |
| GATE-209 | DONE | `SECTIONS_PRESENT`, `M12_PROPOSAL_LABEL`, `NO_LEAK`, CLI behavior, report throw, typecheck and diff checks are evidenced above. |
| Round 2 lifecycle gate | DONE | All final Market HTML paths are checked immediately before persistence; the new integration test proves a provider-bearing custom renderer leaves REPORTS failed and stores no Market output/version. |

Remaining: coordinator review/commit and integration in the shared plan. No generated contracts, migrations, provider calls, network calls, or live data were used.
