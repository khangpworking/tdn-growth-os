# Handoff — Shopee U22 synthesis BACKEND (OpenCode owning integrator)

Base: `3f352b7`. Branch: `khangpworking/ultimate-shopee-synthesis-opencode`.
Backend commits: `3e53e14` (canonical interface), `cf3d6a3` (selection/context/validator freeze),
`d77b79e` (genuine setup + corrections + unknown-refusal proof), `c20a1a6` (frontend correction);
`cf247cf` normal `--no-ff` merge of Claude head `d8b20cf` (disjoint frontend paths, approved intent
carried unchanged). No rebase/force/reset.

## Delivered owner journey (backend)

Retained U22 sample (`automation-review-sample-v1`, policy27 private collection) →
`GET shopee-coding/samples` (selection + eligibility counts) → `GET shopee-coding/context`
(full propose binding, no caller guessing) → `POST shopee-coding/proposals` (OWNER model draft,
one dispatch per requestKey under a durable atomic claim) → retained draft + cited synthesis
(`GET shopee-coding[/:packageId]`, history, consumption) → `POST reader-reports/shopee`
(OWNER build, consumption row written atomically) → existing V2 list/open/decide.
Counts are application-computed from retained records; only codes/labels/findings are proposed,
`PROPOSED_AWAITING_REVIEW`, awaiting owner review. No prior human adoption required.

## Trust boundaries (all enforced before model/write)

Workspace/run/scope/source-set binding (sourceSet nullable: U22 runs carry no confirmed set, never
fabricated), sampleId + corpus artifact identity (`view.corpus.artifactSha256`, never `digest(view)`),
per-record eligibility (SELECTED_TEXT + READABLE), exact keyword bytes (nullable), complete model
configuration, run currency + revision, coding-package server origin on lookup/read/exact retry.
Voice/source/config/trust mismatches refuse before any model dispatch (zero dispatches); model-proposed
wrong quotes rejected AFTER exactly one model response, before retention, settling COMPLETED/INVALID.
Unknown periods stay unknown; missing/null/zero distinct; excluded/unreadable rows stay reasoned
evidence outside primary counts. Closed projection carries no author identifier fields; free text may
still carry personal information (documented, not overclaimed). Renderer27 refusal and frozen
`NATIVE`/`EXACT_SHOPEE`/method-kind unions untouched. Findings at I10 (topic codes); Reader sections
I02/I10/I17 from `INSIGHT_SECTION_IDS`. Templates carry no literal digits (publish gate); the retained
proposed label travels in `finding.label` + the I10 body, counts substitute from the bundle via `nar`.

## Execution integrity (owned claim table, kernel untouched)

`migrations/0053`: UNIQUE requestKey claim, forward-only PREPARED→DISPATCHING→COMPLETED|DISPATCH_UNKNOWN
with trigger gates (TikTok 0052 pattern); mutex never held across the model call; second instance
observes the claim; unknown/invalid terminal for their key; only a new owner key dispatches again.
`migrations/0054`: one consumption row per successful Shopee Reader build, atomically with the revision
insert. Latest-migration expectations updated to 54 across 10 suites; historical SQL hashes intact.

## Proof (actual; planned-but-absent items are NOT evidence)

- Owning suite 8/8 exit 0 (`tests/integration/research-shopee-coding.test.ts`): genuine fake-collector
  setup, refusal battery, null-keyword draft, race single-dispatch, INVALID/UNKNOWN terminality,
  fabrication refusal, unknown digest pair refused by the Reader builder with zero consumption,
  configless cold reopen query-only. Full log: `/tmp/opencode/shopee-t4-owning8-20261010.log`.
  (`shopee-t3` preserves a 7/8 run: label-in-template tripped the no-literal-digits publish gate;
  reverted to the proven generic form + separate `finding.label`.)
- Backend typecheck exit 0 (`/tmp/opencode/shopee-tc3-typecheck-20261010.log`); contracts + validator
  generation exit 0; frontend typecheck/build exit 0; frontend client 5/5 exit 0.
- Migration suites 46/46 + 34/34 exit 0 (`shopee-t10`, `shopee-t11` logs).
- Mounted native journey PASS (`/tmp/ultimate-shopee-synthesis-2026-10-10/mounted-harness/attempt2/`):
  confirm → propose (exactly 1 dispatch) → open/evidence (real textPointer locator, no reconstructed
  string) → build → exact retry → reader tab (quote + record context + proposed marking) → decide →
  coding retry after reconfirm → reload reopen, same revision; durable 1/1/1; source collections
  unchanged; no page errors or Shopee endpoint failures. Attempt1 failure (stale `frontend/dist`)
  preserved with its log.
- Serialization exception (honest): an earlier 8/8 log (`shopee-t2`) ran inside the released frontend
  window; all evidence above uses distinct fresh paths. A stale `tc2.log` pointer was never Shopee
  proof and is superseded.
- NOT WRITTEN (do not cite): dedicated `research-shopee-reader` integration suite,
  `shopee-coding-context` / operator-config unit suites, broader historical replay (release gate).

## Frontend composition (Claude head + tiny authorized correction)

`ShopeeReportPanel.tsx` + `shopee-report-api.ts` merged via `cf247cf`; panel mounted in RunView for
`DRAFT_READY` runs. Correction in `c20a1a6`: primary selection line shows counts only (hashes stay in
technical details); `renderFinding` module-local, isolated helper test removed. Compact UI must render
`finding.label` + substituted template, never an invented summary/count.

## Limits / remaining gates

No live/paid calls; synthetic fixtures + fake transports only. Full suite, broader historical replay,
final independent review and PR/merge/release gates remain coordinator-owned.

## Correction cycle 2026-10-11 (two diagnosed blockers, same branch)

1. I02 count-scope (reviewer P2): saved I02 labeled the coded count as collected records (3 coded of
   89 eligible). `prepareShopeeReaderBuild` now counts the authenticated eligible total from the same
   retained view and I02 reads “đã thu thập: 89 … trong đó 3 bản ghi có mã đề xuất … Đơn vị là bản ghi”,
   with I17 clarified to “bản ghi có mã”. Humanizer SKILL + preservation rules read before the edit;
   numbers/terms/modals preserved, no historical builder/contract/policy touched. Owning proof: the
   existing settlement scenario extended (test-audit gate answered; no new file/seam) — RED pre-fix
   (`shopee-u2-scopered-20261011.log`, 89 vs 3 for the intended reason), GREEN post-fix (`shopee-u3`).
2. Hosted full `38033574659` FRONTEND failure (`research-automation.test.ts:103`, readerReads 2≠1):
   the panel eagerly loaded the saved Reader list alongside admission loads. The panel now loads the
   saved list only after sample/context/history succeed — same success behavior, no request without
   admission; no shared-list refactor, test expectation unchanged. Unchanged test reproduced the
   failure pre-fix (`shopee-u1-frontfail-prefix-20261011.log`) and passes 13/13 post-fix (`shopee-u4`).
Fresh set: owning 8/8 (`shopee-u6`), backend typecheck (`shopee-u5`), frontend typecheck/build
(`shopee-u7`, `shopee-u8`), mounted attempt3 PASS with 1 dispatch and 1/1/1 durable counts
(`shopee-u9-mounted3-20261011.log` + `mounted-harness/attempt3/`; attempts 1–2 preserved).
