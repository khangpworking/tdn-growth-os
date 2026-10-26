# Handoff — PR #413 merge of main after PR #414

Updated: 2026-10-26
Worktree/branch: `/home/pkhang/lanes/v3s1`, `fm/v3-step1-preset-form`.
Parents: step 1 `144ec0ae5dffd72a894aab9c91489debde4fd012`; fetched main `227bd23e99a7ea870c5f774b649fa3985f40c4a9` (PR #414).

Completed: Merged `origin/main` with a merge commit. Preserved the preset form, confirmed preset runner admission, versioned legacy compatibility, v3 PREPARE rendering, Reader HTML/PDF delivery and worker-close fix. Connected wait-point-confirmed presets to the v3 renderer, replacing step 1's temporary unsupported-PREPARE stop. Owner confirmation bytes are retained under the existing request digest and registered in the same transaction as the retry ledger; PREPARE and fresh read-only API handles resolve the effective preset from that ledger without relying on the capture directory. Saved start snapshots remain intact.

Conflicted files and resolutions:

- `src/modules/analysis/research-automation/service.ts` — the only Git conflict was the opening import block. Kept step 1's `metricV3Category` import and all step 3 Reader/renderer/PDF imports. Reviewed the automatic merge and resolved the semantic PREPARE conflict: confirmed presets now reach the same renderer as start-time presets, and report reads validate against the retained owner request. Retained PR #414's controller registration before artifact reads and its abort checks before quick-search/provider claims.

Automatically merged paths reviewed:

- `src/api/research-automation-api.ts` — kept step 1 request validation plus step 3's configured model identity and v3 report/PDF options.
- `tests/helpers/autorun-harness.ts` — kept the added `v3Report` option alongside existing harness behavior.

Contract/version reconciliation: one consistent set remains: `research-automation-run-v3`, `research-automation-start-v2`, `research-automation-autorun-keyword-v2`, `autorun-scope-record-v2`. Old run-v1/v2, start-v1, keyword-v1 and scope-v1 payloads remain readable without new fields; new preset/category fields cannot masquerade as old versions. Updated PR #414's three explicit-preset test start requests to start-v2. Kept PR #413's existing generated contract types, current-version pins and generator-produced Shopee fixture refresh unchanged. No fixture bytes were edited or regenerated during this merge; `npm run contracts:generate` produced no diff.

Changed paths: all PR #414 paths are carried by the merge; merge-specific integration edits are `service.ts`, `tests/unit/autorun-preset.test.ts`, `tests/unit/metric-v3-report.test.ts` and this handoff. Extended the existing A4 publication test with a confirmation-origin row, covering durable PREPARE, fresh report replay and Reader HTML/PDF over HTTP. The existing preset test still proves runner admission and version guards; its former unsupported stop expectation now checks admission to the renderer with no configured model.

Rules: PR #414 already records the owner-approved v3 exception to R-M01/02/05/07/09/11/13 and R-P10 in `openspec/changes/metric-v3-report-contract/proposal.md`. This merge preserves that scope and the legacy checks; main specs and Vietnamese report prose were not edited.

Evidence (all synthetic; local Chromium `/usr/bin/google-chrome`):

- Requested batch plus PR #414 report delivery tests: **208 passed, zero failures/skips**. Command: `TDN_RESEARCH_PDF_CHROMIUM=/usr/bin/google-chrome node --import tsx --test --test-concurrency=1 tests/unit/autorun-preset.test.ts tests/unit/autorun-service.test.ts tests/unit/v3plug-p2-contract.test.ts tests/unit/shopee-public-review-integration.test.ts tests/unit/research-automation.test.ts frontend/tests/research-autorun-card.test.ts tests/unit/metric-v3-report.test.ts tests/unit/autorun-present.test.ts tests/integration/research-reader-report.test.ts tests/integration/insight-reader-api.test.ts`. Log: `/tmp/pr413-tests-isolated.log`.
- Additional changed-boundary coverage: **87 passed, zero failures/skips**. Same environment/runner with files `tests/unit/{metric-v3-capture,autorun-test-reviews,v3plug-p4b-contract}.test.ts` and `tests/integration/{research-automation-api,c3-reader-publish-module,c3-reader-publish-market,c3-reader-publish-characterization}.test.ts`. Log: `/tmp/pr413-boundaries.log`.
- Final v3 report file after avoiding duplicate recovery checks in the confirmation row: **9/9 passed, zero skips**, including actual Chromium PDF and fresh Reader HTML/PDF HTTP downloads. Log: `/tmp/pr413-v3-final.log`.
- Regression proof: reconstructed the automatic three-way merge from index stages with only the import conflict resolved, temporarily ran the unchanged new A4 confirmation row, and observed the intended failure: `CAPTURE_V3_PREPARE_UNSUPPORTED`, AWAITING_SCOPE instead of DRAFT_READY. Restored the exact final service bytes afterward. Baseline: `/tmp/pr413-merge-baseline/result.log`; repaired rerun: `/tmp/pr413-merge-baseline/repaired.log`.
- `npm run typecheck`, `npm run frontend:typecheck`, `npm run contracts:generate` and `git diff --check`: pass. Contract generation left no changes. Logs: `/tmp/pr413-typecheck-final.log`, `/tmp/pr413-frontend-typecheck.log`, `/tmp/pr413-contracts.log`.
- The initial combined attempt used PR #414's `--experimental-test-isolation=none`; Shopee synthetic tests replace global fetch, causing an unrelated Insight API test to fail with “Network forbidden in synthetic public tests.” Stopped that attempt and reran with default file isolation and concurrency 1; all results above use isolation. No assertions were weakened for this failure.

Unresolved: None.
Next action: Normal PR review/CI. Merge commit and push are authorized; merging the PR and deployment are excluded.
Business decisions pending: None.
