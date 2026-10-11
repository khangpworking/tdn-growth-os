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

## Service-owned integration correction (2026-10-11)

This follow-up adds the missing admission and replay path without changing the
historical report, renderer, UI or PDF source files. The authoritative backend
paths are `src/modules/analysis/research-automation/service.ts`, its three
AJV consumer registrations (`src/api/research-automation-api.ts`,
`src/modules/analysis/research-automation/insight-coding.ts`, and
`src/modules/analysis/research-automation/insight-crosscheck-contracts.ts`),
`contracts/analysis/automation-insight-report-revision.schema.json` plus its
generated file, `contracts/analysis/insight-reader-input.schema.json` plus its
generated file, and `contracts/api/research-automation-reader-report-api.schema.json`
plus its generated file.

The closed request identifier is
`automation-insight-qualitative-report-revision-v1`; it carries one explicit
`qualitativeDraft` and no historical Metric/native source-selection object.
Admission authenticates workspace/run/scope/source-set/requested-period lineage,
requires the draft's source identity to select either S05 Shopee or S07 TikTok,
replays the retained source, and calls `checkQualitativeDraft`; no latest
proposal, collector, provider, or coding-pair conversion is used. A qualitative
revision reuses the exact predecessor source membership, is deterministic for
retry/reload/history, and is excluded from Market output.

`#executeReports` carries only the replay-verified draft into
`ResearchAutomationReportInput`; the service explicitly persists that canonical
draft in Insight semantic output and supplies it to the report renderer input for
HTML/PDF generation. `#readVerifiedReport` replays the source and compares the
stored draft byte-for-byte, requiring `automation-report-kit-v28`. The additive
reader request is `insight-reader-build-v4` with `sourceKind: QUALITATIVE`; the
reader input contract is `insight-reader-input-v9` with a `QUALITATIVE_DRAFT`
retained-method identity and renderer `automation-report-kit-v28`.

Focused evidence from this correction: pinned Node 24.15.0 service import,
`scripts/typecheck.mjs`, and contract generation passed; the focused synthetic
contract/revision checks passed (`qualitative-draft-contracts`,
`insight-crosscheck-contracts`, `insight-literal-evidence`, and
`research-automation-draft-revision`: 4 files, 4 tests); JSON contract parse and
`git diff --check` passed.
The report checkout has the separate renderer projection commit `33b3814`, but
that commit predates these closed v9/v4 contracts: its `prepareInsightReaderBuild`
path still emits the historical `insight-reader-input-v1` and does not retain a
`QUALITATIVE_DRAFT` method reference. The report author must rebase/amend that
consumer to select `insight-reader-input-v9` for renderer `v28` while retaining
the source-bound projection; this backend handoff does not modify report/UI/PDF
source. TikTok hang artifacts remain unchanged and no new TikTok test was started.
