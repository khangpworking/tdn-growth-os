# Handoff — GATE-209 Market business-rule gate

Updated: 2026-10-12
Worktree/branch: `wp/gate-209-market-business`
Completed: pure final-HTML Market business gate, automated Market wiring, read-only flow audit, coordinator CLI, and synthetic unit coverage. No commit created; the coordinator owns the commit.

Changed paths:

- `src/modules/analysis/research-automation/market-business-gate.ts` — new pure gate with G08, U32, E2, section, M12, no-leak and U13 results.
- `src/modules/analysis/research-automation/reports.ts:61,917-923` — Market-only gate import and failure throw; Insight path unchanged.
- `src/modules/analysis/reader-report/lint.ts:18` — exported the existing captured provider-name list; lint behavior unchanged.
- `scripts/audit-market-report.ts` — offline one-file CLI with `PASS|FAIL rule detail` output and nonzero failure exit.
- `tests/unit/gate-209-market-business.test.ts` — 13 synthetic tests covering the gate and the real Market builder boundary.

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

- `node --import tsx --test tests/unit/gate-209-market-business.test.ts` — 13 passed, 0 failed.
- `node --import tsx --test tests/unit/research-automation-reports.test.ts tests/unit/market-presentation-method.test.ts tests/unit/market-advertising.test.ts` — 25 passed, 0 failed, 2 Chromium-dependent skips.
- `node --import tsx --test tests/unit/research-automation-reports.test.ts tests/unit/market-presentation-method.test.ts tests/unit/market-advertising.test.ts tests/integration/market-presentation-report.test.ts` — 25 passed, 3 Windows-only fixture failures, 2 skips; failures are listed above.
- `node ../tools/typecheck-win.mjs` — exit 0 (`files 912 status 0`).
- `node --import tsx scripts/audit-market-report.ts` — usage guard emitted and exited nonzero without a file argument.
- `git diff --check` — clean; only normal CRLF conversion warnings for existing modified files.

## Checklist evidence

| ID | Status | Evidence |
|---|---|---|
| G-08 | DONE | `auditMarketReportHtml` scans final reader-visible text and title/alt/aria-label attributes, reuses both provider lists, adds Jev/TypeSafe/CLIProxy/OpenAI/Anthropic/GLM and model-id shapes, and has hidden/script and href-only tests. |
| U-32 | DONE | Explicit additive phrase list; Shopee/TikTok-only test passes and cross-platform-total test fails. |
| U-07 / E2 | DONE | Authored-text detection blocks revenue-order phrases; quote and heading exemption is implemented, with quoted-text regression coverage. |
| U-13 | DONE | Gate returns the three `lintVisibleReportText` results; each U13 failure has focused coverage and the real Market build throw is asserted. |
| GATE-209 | DONE | `SECTIONS_PRESENT`, `M12_PROPOSAL_LABEL`, `NO_LEAK`, CLI behavior, report throw, typecheck and diff checks are evidenced above. |

Remaining: coordinator commit and integration in the shared plan. No generated contracts, migrations, providers, network calls, or live data were used.
