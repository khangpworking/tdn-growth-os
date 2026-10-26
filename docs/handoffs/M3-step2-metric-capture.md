# Handoff — M3 step 2 Metric capture

Updated: 2026-10-26
Worktree/branch: `fm-m3-step2-metric-capture` / `fm/m3-step2-metric-capture`

Completed:
- Phase A preceded code edits: both scanned PDFs read, all preset controls and five response endpoints mapped; owned tab closed.
- Explicit schema-validated preset enters `buildCaptureSpec`; no inferred second term or category.
- Checkout-only adapter applies the preset, clears selections outside the target category, reads every control back, and checks each submitted request before publishing a window manifest.
- Two exact-date windows captured with four selected platforms; weekly/monthly responses, previous-period KPIs, price/shop-type splits, and first-page brands/shops/products retained.
- Unknown category stopped live with `CAPTURE_CATEGORY_NOT_SELECTABLE`, before submit; its tab closed.

Changed paths:
- `contracts/analysis/metric-v3-*`: input schema/generated type and window-manifest schema.
- `src/modules/analysis/research-automation/{autorun-derive,metric-v3-capture-spec}.ts`: explicit preset entry and validation.
- `tools/opencli-metric/clis/metric/v3-capture.js`, `scripts/capture-metric-preset.ts`: adapter and isolated runner.
- `tests/unit/{metric-v3-capture,autorun-derive}.test.ts`, `tests/fixtures/metric-v3/`: contract rows and sanitized live-shaped fixtures.
- `scripts/generate-foundation-contract.mjs`, `docs/metric/*`, `docs/runbooks/metric-opencli.md`: generation, map, explicit example, operation.

Evidence (Node 24.15.0):
- `npm run typecheck`: PASS.
- `node --import tsx --test tests/unit/metric-v3-capture.test.ts tests/unit/autorun-derive.test.ts`: 16/16 PASS; no full local suite.
- The sorted-key request fixture reproduced `CAPTURE_REQUEST_SCOPE_MISMATCH` before the semantic-field comparison fix and passed afterward. The DOM fixture covers the actual shared-ancestor selector failure; drift rows cover A2/A3.
- Live complete bundle: `~/lanes/m3cap/acceptance-7/manifest.json`; exact spec, window-manifest and raw-file hashes independently verified. Both applied states equal the explicit preset.
- Live negative receipt: `~/lanes/m3cap/acceptance-unknown/stopped.json`; no successful capture manifest.
- Earlier attempts stopped on startup/keyword/date/read-back gates. Among earlier attempts, only 5/6 reached a 30-day search; their partial files remain outside Git. No automatic lookup retries.
- Final review tightened validation to the latest headline response. The accepted bundle contains exactly one response per endpoint/window, so this does not change its acceptance evidence.

A1 observations (exact reference dates):
- 30 days: 35.008532252 billion VND, 193,970 units, 962 products, 587 shops; reference 35.0 billion, 193.9 thousand, 956, 581. TikTok 26.978999125 billion; Shopee 7.930363852 billion.
- 12 months: 379.407808965 billion VND; reference 380.3 billion. TikTok 290.531971506 billion vs 291.0; Shopee 87.391582162 billion vs 87.7.
- Exact historical numerical replay is **not** claimed. Matching filters/dates still produce source differences; their historical cause is not established. Full table and source limitations are in `docs/metric/v3-capture-map.md`.

Unresolved: source-side historical drift; insight requests omit gifts/deleted switches even though headline/table requests carry them. Missing Tiki rows in 30-day responses remain absent, not zero.
Next action: review this capture PR; step 3 consumes the new artifacts for the requested report layout and application integration.
Business decisions pending: none required to implement this explicit capture preset; historical differences remain disclosed for review.
Safety: each live session checked the operator DB read-only first; only owned tabs used/closed. No export/download, authentication/account changes, port 8787 access, production writes, adapter installation, merge, or deployment.


Round 2 (2026-10-26):
- Applied the Sol review patch, retaining its earlier-wrong-request negative row; every retained response is now scope-validated. Logged-out CLI stops print DECISION NEEDED.
- Added explicit `metricV3Preset` input to the existing owner-api start request. The canonical v3 validator remains the sole owner of its contents; start snapshots freeze it and CAPTURE forwards it after restart.
- `runMetricCapture` dispatches explicit input to the actual two-window adapter under the existing enable flag and browser lock, with an owned tab, allow-listed environment, timeout/abort handling and no legacy fallback. Absent-preset execution remains unchanged.
- The guarded checkout CLI now calls that same runner branch. No production install or new application flow.
- Downstream boundary: v3 artifacts are not a legacy snapshot. PREPARE stops with CAPTURE_V3_PREPARE_UNSUPPORTED until step 3 consumes the archive; CAPTURE output remains retained.
- Added runner-boundary synthetic browser transcript rows for both-window publication, unknown-category and login stops/tab cleanup, plus start-snapshot restart forwarding coverage at the service boundary. Legacy rows remain the owner for absent-preset behavior.
- Baseline regression: the new runner row fails on the original runner before opening a preset session; repaired runner passes. Service tests initially could not load the unbuilt local SQLite native module; rebuilding only better-sqlite3 repaired the environment, then all scoped tests passed.
- Round-2 validation (Node 24.15.0): `npm run typecheck` PASS; four touched test files 44/44 PASS plus the touched `autorun-present.test.ts` owner-text/lifecycle file 13/13 PASS (57 total); no full suite. New stop codes reuse existing neutral owner wording. Final retained-request negative row also reproduced the expected pre-patch failure.
- Additional changed paths: API start schema/generated type, start snapshot/model/service, shared browser transport helper, existing autorun text table and its coverage row, runner regression, runbook and this handoff.
- Live runner verification is waiting for the required external `AB-bench.md` receipt; no round-2 Metric access yet.
