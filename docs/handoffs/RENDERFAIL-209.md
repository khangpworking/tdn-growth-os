# Handoff — RENDERFAIL-209 Market draft render failure

Updated: 2026-10-13
Worktree/branch: `wp/renderfail-209` (HEAD `b0a5f8f`)

Completed: the reported Market run collected every source, then ended `FAILED` at
`REPORTS` with `REPORT_RENDER_FAILED` and no reason recorded. The real cause is
fixed at the renderer, and the catch sites now record the original error
server-side.

Real exception and throw site (reproduced offline, pre-fix):
`TypeError: MARKET_BUSINESS_GATE_FAILED:U13_SUPERLATIVE` thrown by
`assertMarketBusinessGate` (`src/modules/analysis/research-automation/market-business-gate.ts:312`),
reached from the service-level check in `#executeReports`
(`src/modules/analysis/research-automation/service.ts:3409`) before any HTML
artifact was retained. `auditMarketReportHtml` reported the single failing rule
`U13_SUPERLATIVE`, whose snippet was a **retained source product title** copied
from the results-page capture and shown in the capture-backed M03 table.

Cause: `captureMetricMethodSection` rendered captured source names with bare
`escape(...)`, while every other renderer of retained source text marks it as
copied text (`<span data-quote>`). The owned-wording rules therefore judged a
source product title as the report's own wording. The trigger is data-dependent:
the same code path renders and passes for runs whose captured titles happen to
contain no flagged phrase.

Changed paths:

- `src/modules/analysis/research-automation/metric-method-report.ts:186-193,202,209` — capture names (product title and shop in the platform and unattributed tables) render through the shared `data-quote` marker.
- `src/modules/analysis/research-automation/service.ts:3416-3418,3463-3465,4434-4444` — both render/publication catches keep the stored `REPORT_RENDER_FAILED` wording and now log one JSON line with the original error class and message.
- `tests/unit/renderfail-209-source-literal.test.ts` — new synthetic regression for the reported run shape.
- `tests/integration/gate-209-market-business.test.ts:29-30,59-67` — asserts the logged server-side cause on the existing service-level render-failure test.
- `docs/handoffs/RENDERFAIL-209.md`

Deliberate non-changes:

- No gate rule was relaxed or exempted for the capture path; the fix only marks text copied from the source, exactly as the lint contract (`own` flag in `src/modules/analysis/report-visible-text-lint.ts`) and the existing Market/reader renderers already do. Provider-name (`G08_PROVIDER_NAME`), cross-platform (`U32`), ranking (`E2`) and leak (`NO_LEAK`) results still scan quoted text.
- No data was hidden, dropped or reworded: the captured name stays fully visible with its marker, and the declared platform without captured rows still renders as `không có số liệu`, never `0`.
- The workbook (`legacyMetricMethodSection`) path is unchanged: its bytes are pinned by existing frozen-history tests, and it has no captured source names.
- The stored blocker message is unchanged (the run and step store only the safe `message_code`); the optional error-class suffix in stored wording was not added, so no projection or frontend change was needed.

Evidence (commands and results):

- Offline reproduction harness outside the repository (session temp directory) against a read-only copy of the live operator state at the pinned commit: re-runs the real deterministic bridges and report builder. Fidelity control: the sibling Market run of the same workspace rebuilt byte-exact against its stored `html_sha256`.
- Pre-fix: the reported run built its HTML (805,529 bytes) and then threw `TypeError: MARKET_BUSINESS_GATE_FAILED:U13_SUPERLATIVE` from `market-business-gate.ts:312`; `auditMarketReportHtml` detail `rule: "U13_SUPERLATIVE"` with the copied source title as snippet.
- Post-fix: both Market runs pass `gate PASS` at `{ presentation: false }`; the copied title is still present and now inside `<span data-quote>`; `data-quote` markers 44 in the rebuilt HTML.
- `node --import tsx --test tests/unit/renderfail-209-source-literal.test.ts`: **2/2 PASS**. The test fails without the renderer change (verified by stashing only `metric-method-report.ts`: `not ok 1 …`, gate threw `U13_SUPERLATIVE`).
- `node --import tsx --test tests/integration/gate-209-market-business.test.ts`: **1/1 PASS**, including the new assertion that one `research_automation_report_failed` line with `stage: "RENDER"` carries `MARKET_BUSINESS_GATE_FAILED:G08_PROVIDER_NAME`.
- `node --import tsx --test tests/unit/renderfail-209-source-literal.test.ts tests/unit/e2efix-209-market-honesty.test.ts tests/unit/reader-209-plain-text.test.ts tests/unit/leak-209-metric-trace.test.ts tests/unit/gate-209-market-business.test.ts`: **56/56 PASS**.
- `node --import tsx --test tests/unit/research-automation-reports.test.ts tests/unit/report-visible-text-lint.test.ts tests/unit/u13-209-report-lint.test.ts tests/unit/research-automation.test.ts tests/integration/research-automation-metric-report.test.ts`: **44 PASS, 2 optional Chromium/PDF SKIP, 0 FAIL**.
- `npm run typecheck`: **exit 0**.
- `git diff --check`: **exit 0**.
- No provider, model, network, browser, paid or credential call was made; the live operator state, checkout and run records were read-only and never modified.

Regression test shape (synthetic only, no stored run data):

- Capture-backed Metric snapshot with a copied source title containing `mới nhất, tốt nhất`, a declared `tiktok` platform with no captured rows, and one unattributed row.
- Market input with three exact-Shopee listings of one review each, `PARTIAL_LISTINGS`, `COLLECTION` `PARTIAL`, and one retained capture.
- Assertions: the full Market build plus `assertMarketBusinessGate` does not throw; the copied name stays visible and marked; removing the marker makes the same HTML fail `U13_SUPERLATIVE` again; a provider name inside marked source text still fails `G08_PROVIDER_NAME`; authored superlative text still fails `U13_SUPERLATIVE`.

Next action: coordinator reviews the `RENDERFAIL-209:` commit on `wp/renderfail-209`. No push, PR, merge or deployment was performed.

Business decisions pending: none introduced by this lane.
