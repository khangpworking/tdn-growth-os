# Handoff — SYNC-6 source board (B-01…B-07)

Updated: 2026-10-08
Worktree/branch: `khangpworking/ultimate-impl-sync6-opencode` (Orca workspace `ultimate-impl-sync6-opencode`, base `c2014bb`)
Completed: 11-card source board: additive contract, registry-driven builder, TikTok cap exposure, P4/per-operation/workspace history, grouped frontend with reconciliation copy, synthetic regressions.
Changed paths:
- `contracts/api/research-automation-source-status-api.schema.json` (sole-lease edit; released)
- `contracts/api/research-automation-source-status-api.generated.ts` (via `contracts:generate`)
- `src/modules/analysis/research-automation/source-status.ts`
- `src/modules/analysis/research-automation/service.ts` (`readSourceActivity` history-only; FINAL, OMP may integrate)
- `src/modules/analysis/research-automation/providers.ts` (TikTok cap config exposure only)
- `frontend/src/research-automation/SourceStatusBoard.tsx`
- `tests/unit/research-automation-source-board.test.ts` (new), `tests/unit/research-automation-providers.test.ts`
- `tests/integration/research-automation-source-status.test.ts`, `tests/integration/pageindex-upload.test.ts`
- `frontend/tests/research-source-status.test.ts`, `frontend/tests/pageindex-source-status.test.ts`, `frontend/tests/pageindex-run-wiring.test.ts`
Evidence (commands, results, relevant revision):
- Runtime `/tmp/tdn-sync1-tools/node-v24.15.0-linux-x64/bin` (Node v24.15.0, npm 11.12.1, per-command PATH). `better-sqlite3` rebuilt for Node 24 (local `node_modules` only, ignored).
- `npm run contracts:generate` idempotent: only the 2 intended contract files differ. Frontend validators regenerated under lease (ignored build output).
- `node scripts/typecheck.mjs` exit 0; `tsc -p frontend/tsconfig.json` exit 0; `vite build` ok (2.32s).
- Focused backend 28/28 exit 0 (integration source-status incl. legacy-payload acceptance, unit board incl. registry-ID existence, unit providers).
- Focused frontend 12/12 exit 0; full `frontend:test` 258/258 exit 0.
- Full `npm test`: 1205 pass; failures limited to known-baseline Task045 x3 + Cloud CLI (G-02 listed) and local-environment issues reproduced identically on unmodified baseline via `git stash`: `pageindex-upload` fixture-run test (host `python3` lacks `pypdf`, no network to install) and a 30s slow-host timeout in `case-contract` (baseline failed 2 in the same file vs 1 with changes — timing flake on a loaded host).
- `git diff --check` clean; `gh` draft PR below.
Unresolved: none in scope. Future readers/activation stay dependency-bound (P9 TikTok comments + video reading, P10 official stats + World Bank, U-23 Meta ads, P5 Trends collector): cards render `NOT_BUILT` with owning package, zero history.
Next action: Astra independent review; merge only on exact-head required CI (no worker merge).
Business decisions pending: none. Approved $3 TikTok test-run value was never written into code or defaults.

## Checklist evidence

| ID | Status | Evidence |
|---|---|---|
| B-01 | DONE | Schema adds 6 IDs, `NOT_BUILT`, optional `pendingPackage/registryIds/tier/tierDetail/group/reportName/spendCapUsd/operations`, maxItems 5→11, version kept v1 so old payloads validate; generated contract + browser validators regenerated under sole lease (released via `msg_628c6bd1d090`). |
| B-02 | DONE | `SOURCE_REGISTRY` mirrors registry v1.9 IDs/tiers/groups/report names; `cardState()` reads `built` (EXECUTOR_DISABLED precedence kept); roster order asserted at runtime; unit test greps every registry ID in `input-data-sources-30-sections.md`. Tiers: single only when shared (S02/S05/S07/S14/S15/S21/S23); Metric `S01: C; S04: B`, SerpApi `S19 theo trang gốc…`, PageIndex `S22: A; S25: B/C`. |
| B-03 | DONE | P4 video count via `FoundationSourcePackageReader.findAutomationAttachmentPackagesByKeyPrefix` per workspace run (metadata only, `lastDataAt` null — interface exposes no timestamp); SerpApi per-operation capture counts (`serpapi.google.search` observed, `serpapi.google.trends` honest zero; per-op `lastUsageAt` null, provider usage stays on the card); PageIndex workspace history (`analysis_pageindex_run_pdfs` count + question attempts; `lastDataAt` null — table has no timestamp); future sources honest zeros with owner comments. No intake/replay/collector invoked from reads. |
| B-04 | DONE | `TDN_RESEARCH_TIKTOK_COMMENTS_MAX_CHARGE_USD` exposed as `apifyTikTokComments.maxChargeUsd`; absent stays absent (never defaults to $3); malformed fails closed; no env/cap/collector changes. TikTok credential reflects shared Apify token presence while state stays `NOT_BUILT`. |
| B-05 | DONE | Groups in B1 order with headings; registry/tier/report/cap/operation rows; `NOT_BUILT` copy names owning package; subscription cards read `Theo gói thuê bao (không tốn thêm mỗi lượt)`; Trends row shows empty state; PageIndex copy separates workspace PDFs from account totals and GET reload from the owner POST recheck; providers named (internal-board G-08 exception). |
| B-06 | DONE | 11 cards/states/order, `NOT_BUILT`→(built-flag-driven), cap set/missing, redaction (no secret substrings), no-provider GET (`Allow: GET`, POST 405, recheck POST owner-only with 401/403), workspace isolation, demo mode, executor-disabled, frontend groups/copy, legacy acceptance. |
| B-07 | DONE | No registry status changed, so no registry edit. Constant carries a same-PR update rule; P9/P10/U-23/P5 own their reader + `NOT_BUILT` flip. |
| G-01 | DONE | This table (B-01…B-07 DONE; U items N/A — not assigned to SYNC-6). |
| G-02 | DONE with documented environment limits | Typechecks exit 0. `npm test` 1205 pass; remaining failures are G-02-listed (Task045 x3, Cloud CLI) or local-environment (missing `pypdf`, slow-host timeout), each reproduced identically on the unmodified baseline. |
| G-03 | DONE | `frontend:typecheck` exit 0, `frontend:test` 258/258, production build passes. |
| G-04 | DONE | `contracts:generate` idempotent; only the 2 intended files differ; no hand-maintained type duplication (shadow interfaces/casts removed; one documented array→tuple conversion remains). |
| G-05 | DONE | `git diff --check` clean; all changed paths are SYNC-6 owned (list above); no other-group files touched (`research-automation-api.ts` untouched — cap flows through existing `providers` config). |
| G-06 | DONE | Synthetic fixtures only; redaction asserted over secrets/token/caps-boundary (caps are non-credential numbers); no paths/IPs. |
| G-07 | DONE | Fake transports only; no provider/AI calls. |
| G-08 | DONE | Plain Vietnamese UI; provider names only on the internal board (allowed); E12/E13 citations verbatim (`Cục Thống kê (nso.gov.vn)`, `Ngân hàng Thế giới (World Bank Open Data)`); no `humanizer-vi` needed (no Market/Insight interpretation prose). |
| G-09 | DONE | Missing stays null (video `lastDataAt`, per-op usage, unconfigured caps); zero counts are observed zeros; Trends zero is explicit absence, not data. |
| G-10 | DONE | Legacy 5-card v1 payload validates against the extended schema; no report/render paths touched, so stored versions read back byte-identical; no renderer bump needed. |
| G-11 | DONE | Updated (not weakened) assertions: source-status integration 5→11 roster/metadata; pageindex-upload activity keys for the extended interface; frontend board rewrite for groups/copy; PageIndex workspace/account copy; run-wiring `7 tài liệu`→`7 PDF trong workspace này` (intended reconciliation copy). |
| G-12 | DONE | This handoff with per-item evidence. |
| G-13 | N/A | No keyword collection in SYNC-6 (read-only board). |

## Limits and follow-ups

- Read enumeration is bounded per run by the declared interface (`LIMIT 101` per key prefix) but iterates all workspace runs; fine for small workspaces, disclosed per coordinator guidance.
- `SERPAPI_KNOWN_OPERATIONS` documents the expected Trends operation name; P5 renames it in the same PR if the collector persists a different name.
- Local-only failures (missing `pypdf`, slow-host timeout) need a proper CI environment; exact-head CI on the PR is the gate.
