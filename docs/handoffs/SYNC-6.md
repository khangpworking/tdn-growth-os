# Handoff — SYNC-6 source board (B-01…B-07) + PR161 review corrections

Updated: 2026-10-08 (follow-up: review corrections on top of `ebdeb7a`, merged `origin/main` `4215b27` normally)
Worktree/branch: `khangpworking/ultimate-impl-sync6-opencode` (Orca workspace `ultimate-impl-sync6-opencode`, prior base `c2014bb`)
Completed: 11-card source board: additive contract, registry-driven builder, TikTok cap exposure, P4/per-operation/workspace history, grouped frontend with reconciliation copy, synthetic regressions; plus review corrections (PAGEINDEX null-vs-zero copy, built-flag readiness without fabricated wiring).
Changed paths:
- `contracts/api/research-automation-source-status-api.schema.json` (prior sole-lease edit; lease released; untouched in this follow-up)
- `contracts/api/research-automation-source-status-api.generated.ts` (generated; untouched in this follow-up)
- `src/modules/analysis/research-automation/source-status.ts`
- `src/modules/analysis/research-automation/service.ts` (`readSourceActivity` history-only; FINAL, OMP owns further service work — untouched in this follow-up)
- `src/modules/analysis/research-automation/providers.ts` (TikTok cap config exposure only — untouched in this follow-up)
- `frontend/src/research-automation/SourceStatusBoard.tsx`
- `tests/unit/research-automation-source-board.test.ts` (new), `tests/unit/research-automation-providers.test.ts`
- `tests/integration/research-automation-source-status.test.ts`, `tests/integration/pageindex-upload.test.ts`
- `frontend/tests/research-source-status.test.ts`, `frontend/tests/pageindex-source-status.test.ts`, `frontend/tests/pageindex-run-wiring.test.ts`
Evidence (commands, results, relevant revision):
- Task-provided Node 24.15.0 / npm 11.12.1 runtime (per-command PATH). `better-sqlite3` rebuilt for Node 24 (local `node_modules` only, outside Git).
- No generator scripts ran in this follow-up (lease released); previously generated contract + browser validators reused as-is.
- `node scripts/typecheck.mjs` exit 0; `tsc -p frontend/tsconfig.json` exit 0 (direct invocations, no generator step).
- Focused suites exit 0 with captured statuses: backend integration source-status 4/4, unit board 6/6, unit providers 19/19, frontend board/PageIndex/run-wiring 13/13. Full `frontend:test` 258/258 exit 0 (prior run; rerun after latest copy edit covered by the 13 focused frontend tests).
- Full `npm test` was NOT rerun in this follow-up (SYNC-1 holds the full-suite slot; no overlapping full suite per coordinator instruction).
- Prior full-suite observation (before follow-up): 1205 pass; failures were Task045 x3 + Cloud CLI (the G-02-listed baseline set) plus two local-environment failures, both since resolved/diagnosed: (a) `pageindex-upload` fixture-run test expects READY but got FAILED because the default host `python3` lacks `pypdf` (required by `scripts/read-pageindex-pdf.py`; pinned requirement lives in `scripts/requirements-pageindex.txt`); with the shared task-provided pinned Python interpreter the file passes 6/6 exit 0 — environmental cause proven, product code and host setup untouched; (b) a 30s timeout in `research-automation-case-contract` on a loaded host, reproduced on the unmodified baseline (worse there: 2 fail vs 1 with changes — timing flake), recorded as unresolved local validation pending exact-head CI.
- `git diff --check` clean; `git status` shows only the owned paths above.
Unresolved:
- Exact-head GitHub CI on the new PR head is the remaining gate (G-02 PENDING). At last inspection PR161 head `ebdeb7a` showed check IN_PROGRESS; corrections in this follow-up move the head, so CI must be re-inspected after push.
- Local validation gap, not a product claim: a 30s slow-host timeout in `research-automation-case-contract` (reproduced on the unmodified baseline). Needs exact-head CI, not a local waiver. The missing-`pypdf` failure is resolved locally via the shared task-provided pinned interpreter (6/6 exit 0); host `python3` itself remains without `pypdf` (global setup untouched per instruction).
- Future source activation stays dependency-bound: P9 (TikTok comments, video reading), P10 (official statistics, World Bank), U-23 (Meta ads), P5 (Trends collector) own their reader + `NOT_BUILT` flip + run wiring. The board renders placeholders with owning packages and zero history.
Next action: push follow-up commit to draft PR161; Astra independent review; coordinator owns ready/merge only after exact-head review and green full GitHub check. No worker merge.
Business decisions pending: none. The approved $3 TikTok test-run value was never written into code or defaults.

## Checklist evidence

| ID | Status | Evidence |
|---|---|---|
| B-01 | DONE | Schema adds 6 IDs, `NOT_BUILT`, optional `pendingPackage/registryIds/tier/tierDetail/group/reportName/spendCapUsd/operations`, maxItems 5→11, version kept v1 so old payloads validate; generated contract + browser validators regenerated under the prior sole lease (released via durable message; untouched since). |
| B-02 | DONE | `SOURCE_REGISTRY` mirrors registry v1.9 IDs/tiers/groups/report names; `cardState()` reads `built` (EXECUTOR_DISABLED precedence kept); roster order asserted at runtime; unit test greps every registry ID in `input-data-sources-30-sections.md`. Tiers: single only when shared; Metric `S01: C; S04: B`, SerpApi `S19 theo trang gốc…`, PageIndex `S22: A; S25: B/C`. Follow-up: `futureCollectorState()` maps built-but-unwired readiness by arrival kind (upload→MANUAL_IMPORT; paid/free collectors→NOT_CONFIGURED/CONFIGURED_NOT_WIRED from credential/cap evidence; never READY/wired); no-key collectors count usable `NOT_REQUIRED` via `collectorCredentialUsable()`; unit matrix covers built/unbuilt × kinds, including TikTok never becoming MANUAL_IMPORT or READY. |
| B-03 | PARTIAL: foundation DONE; future reader/activation ESCALATED | DONE: P4 video count via `FoundationSourcePackageReader.findAutomationAttachmentPackagesByKeyPrefix` per workspace run (metadata only, `lastDataAt` null — interface exposes no timestamp); SerpApi per-operation capture counts (observed search, honest zero Trends; per-op `lastUsageAt` null, provider usage stays on the card); PageIndex workspace history (`analysis_pageindex_run_pdfs` count + question attempts; `lastDataAt` null — table has no timestamp); no intake/replay/collector invoked from reads. ESCALATED to owning packages: P9 TikTok-comment + video-reading readers and flips; P10 official-statistics + World Bank readers and flips; U-23 Meta ads reader and flip; P5 Trends collector and operation naming. Until then the board shows honest zeros, never invented history. |
| B-04 | DONE | `TDN_RESEARCH_TIKTOK_COMMENTS_MAX_CHARGE_USD` exposed as `apifyTikTokComments.maxChargeUsd`; absent stays absent (never defaults to $3); malformed fails closed; no env/cap/collector changes. TikTok credential reflects shared Apify token presence while state stays `NOT_BUILT`. |
| B-05 | DONE | Groups in B1 order with headings; registry/tier/report/cap/operation rows; `NOT_BUILT` copy names owning package; subscription cards read `Theo gói thuê bao (không tốn thêm mỗi lượt)`; Trends row shows empty state; PageIndex copy separates workspace PDFs from account totals and GET reload from the owner POST recheck. Follow-up: `pageIndexWorkspaceCopy()` renders null (ledger unavailable) as unknown, distinct from zero and positive counts; render regression covers null/0/positive. No-key states use truthful copy (READY/CONFIGURED_NOT_WIRED/NOT_CONFIGURED never assert an installed key for `NOT_REQUIRED`). Provider names appear only on this internal board (G-08 exception). |
| B-06 | DONE | 11 cards/states/order, `NOT_BUILT`→(built-flag-driven), cap set/missing, redaction (no secret substrings), no-provider GET (`Allow: GET`, POST 405, recheck POST owner-only with 401/403), workspace isolation, demo mode, executor-disabled, frontend groups/copy incl. null/0/positive PageIndex history, legacy acceptance. |
| B-07 | DONE | No registry status changed, so no registry edit. Constant carries a same-PR update rule; P9/P10/U-23/P5 own their reader + `NOT_BUILT` flip. |
| G-01 | DONE | This table (B-01, B-02, B-04, B-05, B-06, B-07 DONE; B-03 PARTIAL with explicit ESCALATED subitems; U items N/A — not assigned to SYNC-6). |
| G-02 | PENDING until exact-head CI | Typechecks exit 0; focused suites exit 0 (listed above); `pageindex-upload` 6/6 exit 0 via the shared task-provided pinned interpreter. Full `npm test` was not rerun in this follow-up (slot held by Sol/SYNC-1). Prior full run: 1205 pass with Task045 x3 + Cloud CLI (G-02-listed set) plus the slow-host 30s timeout recorded as unresolved local validation above — no waiver claimed. |
| G-03 | DONE | `frontend:typecheck` exit 0; focused frontend 13/13 exit 0; prior full `frontend:test` 258/258 exit 0; production build passes. |
| G-04 | PARTIAL | `contracts:generate` result verified idempotent under the prior lease; no generator ran in this follow-up and no schema/contract file changed. Two remaining tuple casts, both in `source-status.ts`, both array→JSON-Schema-tuple conversions that cannot be built element-wise: (1) `asRegistryIds` (string array → `SourceBoardRegistryIds` tuple union), used for SerpApi known-operation rows; (2) `rows as unknown as SourceBoardOperations` (operation array → bounded-tuple union). All pre-generation shadow interfaces and state/source casts were removed; the builder now returns the generated entry type directly. |
| G-05 | DONE | `git diff --check` clean; changed paths are SYNC-6 owned (list above) plus a normal merge of `origin/main` `4215b27`; `research-automation-api.ts` and `service.ts` untouched in this follow-up (OMP owns service dispatch); no other-group files touched. |
| G-06 | DONE | Synthetic fixtures only; redaction asserted over secrets; no machine-local paths, home directories, IPs, or runtime data in code, tests, fixtures, commits, or this handoff (runtime described without paths). |
| G-07 | DONE | Fake transports only; no provider/AI calls. |
| G-08 | DONE | Plain Vietnamese UI; provider names only on the internal board (allowed); E12/E13 citations verbatim; no Market/Insight interpretation prose (no `humanizer-vi` applicability). |
| G-09 | DONE | Missing stays null (video `lastDataAt`, per-op usage, unconfigured caps, unavailable PageIndex ledger); zero counts are observed zeros; Trends zero is explicit absence, not data. |
| G-10 | DONE (static boundary only) | No report-rendering code changed, so no stored-report bytes could change; legacy 5-card v1 payload validates against the extended contract (executed assertion). No historical byte-replay run was executed here; that proof belongs to exact-head CI. |
| G-11 | DONE | Updated (not weakened) assertions: source-status integration 5→11 roster/metadata; pageindex-upload activity keys for the extended interface; frontend board rewrite for groups/copy; PageIndex workspace/account copy incl. new null/0/positive regression; run-wiring `7 tài liệu`→`7 PDF trong workspace này` (intended reconciliation copy). |
| G-12 | DONE | This handoff with per-item evidence. |
| G-13 | N/A | No keyword collection in SYNC-6 (read-only board). |

## Limits and follow-ups

- Read enumeration is bounded per run by the declared interface (`LIMIT 101` per key prefix) but iterates all workspace runs; fine for small workspaces.
- `SERPAPI_KNOWN_OPERATIONS` documents the expected Trends operation name; P5 renames it in the same PR if the collector persists a different name.
- Exact-head CI on the new head is the gate; local environment cannot substitute for it.
