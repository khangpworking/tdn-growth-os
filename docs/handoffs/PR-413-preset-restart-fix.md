# Handoff — PR #413 confirmed-preset restart recovery

Updated: 2026-10-26
Worktree/branch: `/home/pkhang/lanes/v3s1`, `fm/v3-step1-preset-form`; baseline `307d2e3670b479e766837e79bc4d9047ed1f314d`.
Completed: Fixed the P1 restart finding. Recovery resolves the effective preset from the immutable start snapshot or durable owner-confirmation request ledger before deciding whether an interrupted PREPARE must stop with `V3_REPORT_INTERRUPTED`. It never requeues that v3 model dispatch. Audited all `metricV3Preset` decisions in the service: QUICK_SEARCH routing and CAPTURE admission now use the same resolver. CAPTURE passes that effective preset and its period to the runner instead of reconstructing authority from scope.json after admission. Existing PREPARE and report-read paths already used the resolver.
Changed paths: `src/modules/analysis/research-automation/service.ts`, `tests/unit/metric-v3-report.test.ts`, this handoff.
Evidence (synthetic fixtures, Node 24.15.0):

- Extended the existing A4 table for both start and form-confirmation origins. Hold a dispatched model call with PREPARE/RUNNING, recover through a fresh service handle, drain the restarted worker, then settle the old request. Assert exactly one total model call, STOPPED / `V3_REPORT_INTERRUPTED`, and no available report.
- Before production edits, the form-confirmation row failed with two model calls instead of one; the start-snapshot row passed. Baseline log: `/tmp/pr413-baseline.log`.
- `node --import tsx --test tests/unit/metric-v3-report.test.ts tests/unit/metric-v3-capture.test.ts tests/unit/autorun-preset.test.ts tests/unit/autorun-service.test.ts`: 26 passed, zero failures, one Chromium-dependent skip. Log: `/tmp/pr413-tests.log`.
- `TDN_RESEARCH_PDF_CHROMIUM=/usr/bin/google-chrome node --import tsx --test tests/unit/metric-v3-report.test.ts`: 9 passed, zero failures/skips, including PDF export and Reader HTTP delivery. Log: `/tmp/pr413-report-pdf.log`.
- `npm run typecheck`: passed. Log: `/tmp/pr413-typecheck.log`. `git diff --check`: passed.
- Rebuilt `better-sqlite3` with Node 24 inside this worktree only after detecting the Node 22 ABI mismatch. No manifest or lockfile changes.

Unresolved: None. Independent review/CI of this repair remains the next gate.
Next action: Commit and push this authorized repair to PR #413; no merge or deployment.
Business decisions pending: None. Recovery remains within R-P02; no approved rules or report prose changed.
