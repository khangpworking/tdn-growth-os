# Handoff — PR 415 v3 renderer compatibility

Updated: 2026-10-26
Worktree/branch: `/home/pkhang/lanes/v3lay`, `fm/v3-report-layout`

Completed:
- New reports and Reader revisions record `metric-v3-report-v2`.
- Saved reports replay the renderer selected by their retained builder id.
- V1 rendering/trace code and stylesheet preserve origin/main output exactly.
- Unknown renderer ids still stop with the existing integrity error.
- Cross-version regression retains origin/main v1 HTML/trace as a synthetic fixture;
  v1 and v2 read/download, tampered v2 fails replay, unknown ids fail identity.

Changed paths:
- `src/modules/analysis/research-automation/{service,reader-publish}.ts`
- `src/modules/analysis/research-automation/metric-v3-{report,style}-v1.ts`
- `tests/unit/metric-v3-report.test.ts`
- `tests/fixtures/metric-v3/report-v1.{json,md}`

Evidence:
- `TDN_RESEARCH_PDF_CHROMIUM=/usr/bin/google-chrome node --import tsx --test tests/unit/metric-v3-report.test.ts tests/unit/metric-v3-capture.test.ts`: 15/15 pass, no skips, including Chromium PDF downloads.
- `npm run typecheck`: pass.
- Removing only version dispatch makes the v1 regression fail with
  `Stored v3 report differs from retained evidence.`; dispatch restored afterward.
- Frozen rendering body and stylesheet compared exactly with origin/main
  `43a5c183fb5597e4e1de0fd05247e2c00469e3d5`.
- `git diff --check`: pass.

Unresolved: none for the requested compatibility fix.
Next action: independent review of pushed PR; never merge or deploy in this task.
Business decisions pending: none.
