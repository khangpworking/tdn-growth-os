# Handoff — Luna A qualitative draft interface freeze

Updated: 2026-10-11
Worktree/branch: `khangpworking/ultimate-luna-a-backend-r1` (base `059c22fa7643bc484d0f18ef470aec00c7743300`)
Authoritative backend commit: `db2686b`

Completed:

- Froze the additive `automation-qualitative-draft-v1` contract for retained S05 Shopee reviews and S07 TikTok comments. The contract owns source-bound situation, journey, topic, stated sentiment, confidence, exact quote/locator membership, source hashes, verified-author state, ambiguity/unavailable states, scoped record accounting, evidence cards, and the mandatory `U11_STATISTIC_UNAVAILABLE` policy.
- Removed persona definitions, arrays, generated types, and validation from this contract boundary. The owned contract has no persona, demographic, causal, kappa, pooled-count, or release-statistic fields; counts are only reconciled source-record accounting, with `mainConclusionUse: EXCLUDED` and `releaseEligibility: UNAVAILABLE`.
- Added query-only service entry points: `ResearchAutomationService.validateShopeeQualitativeDraft(workspaceId, runId, value)` and `ResearchAutomationService.validateTikTokQualitativeDraft(workspaceId, runId, packageId, value)`. Both authenticate the existing run binding, replay retained S05/S07 source bytes, call `checkQualitativeDraft`, and return the canonical `AutomationQualitativeDraft`; they do not dispatch models, collect live data, write SQLite/CAS, or mutate historical coding bytes.

Changed paths:

- `scripts/generate-foundation-contract.mjs`
- `contracts/analysis/automation-qualitative-draft-v1.schema.json`
- `contracts/analysis/automation-qualitative-draft-v1.generated.ts`
- `src/modules/analysis/research-automation/qualitative-draft-contracts.ts`
- `src/modules/analysis/research-automation/service.ts`
- `tests/unit/qualitative-draft-contracts.test.ts`
- `docs/handoffs/LUNA-A-QUALITATIVE-INTERFACE.md` (this handoff)

Evidence (commands, results, relevant revision):

- `db2686b` is the authoritative six-path backend commit; no report, renderer, UI, PDF, collector, or shared-policy path was changed.
- Pinned `/home/pkhang/.cache/tdn-toolchains/node-v24.15.0-linux-x64/bin/node scripts/typecheck.mjs`: `TYPECHECK_EXIT_CODE=0`. The focused synthetic qualitative contract check had already passed with 2 subtests before this follow-up; it was not rerun.
- `git diff --check`: exit 0 before commit. Static JSON parse succeeded for schema ID `https://tdn.local/contracts/analysis/automation-qualitative-draft-v1.schema.json` with defs `binding`, `sourceIdentity`, `record`, `classification`, `card`, and `draft`.
- Existing TikTok integration evidence remains bounded and unchanged: no TAP/Vitest completion output during repeated 30-second polls, and the known foreground run ended by SIGINT with exit 130. Retained evidence remains in `/tmp/tdn-tiktok-coding-FOeRVG`, `/tmp/tdn-tiktok-coding-D6wvjv`, and `/tmp/tdn-tiktok-coding-xqSyHn` (SQLite/WAL/SHM files preserved). Coordinator-host PGIDs were not visible in this worker namespace; explicit SIGINT attempts to only PGIDs `1847251` and `1848260` returned `No such process` exit 1 without signaling another PID.

Projection semantics and consumer entry points:

- The producer/consumer boundary is the canonical `AutomationQualitativeDraft` returned by the two service methods above, not a second reader schema or a conversion into the older coding-pair contracts. The returned draft retains platform/source separation, exact source record order and membership, UTF-16-safe quote spans, locators, source/package hashes, verified authors only, and explicit low/ambiguous/unavailable states.
- Existing `prepareShopeeReaderBuild` and `prepareTikTokReaderBuild` entry points still consume their historical `ShopeeDraftCoding`/`ShopeeCitedSynthesis` and `TikTokDraftCoding`/`TikTokCodedReport` pairs. They were intentionally left untouched because Reader/report paths are owned by the report author; the report author should consume the frozen `AutomationQualitativeDraft` boundary in that separate consumer change rather than ask this backend task to invent an adapter or duplicate type.

Unresolved:

- The report author must integrate the canonical `AutomationQualitativeDraft` into the existing Reader consumer in the report-owned checkout. This is a consumer migration, not a backend producer gap; no adapter is needed on the backend boundary.
- TikTok’s prior integration hang remains an evidence limitation; no retry, collector call, or live provider call is authorized here.

Next action: coordinator integrates `db2686b` (and this handoff document) on the matching backend head, then the report author consumes the two service entry points and canonical contract without changing source identity or policy semantics.

Business decisions pending: owner review is still required before any qualitative draft can enter a released or main conclusion; U11 reliability remains unavailable.
