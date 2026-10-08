# Handoff — SYNC-3 (U-02, U-04, U-05, U-07, U-16)

Updated: 2026-10-08
Worktree/branch: `ultimate-impl-sync3-omp`, branch `khangpworking/ultimate-impl-sync3-omp` (base `c2014bb`)

Completed: owned source, the seven versioned contracts and their generated derivatives are committed on `khangpworking/ultimate-impl-sync3-omp`. The seven-schema/generated lease was granted at msg_2fc6b3a0609f, used, and explicitly released at msg_a620172d5ef6; a narrow correction lease (msg_0bb0a901100e) was used for the sibling working-question schema and released at msg_462c804ed55c. The isolated `reports.ts` renderer-identity commits requested by Astra are pushed for SYNC-1 to cherry-pick.

Committed and pushed (isolated for SYNC-1 to cherry-pick):
- `fc07995b253cbdd13f1f2777889f1b508e0ff11f` — `reports.ts` + new `tests/unit/research-automation-renderer-identity.test.ts`.
- `884bef0ef832ee5286825b0fee80a267416a8773` — the new kit identity applies only when `kind === 'MARKET'`.
- `7797d9eb14b6045196f3f88dbfb9a3146c5d9141` — version-aware source for all five items.
- `5473386ad6cf6de998468454a748626ad32a20a0` — narrow `service.ts` dispatch: new packets `1.2.0`, new M01 inventories `1.1.0`, retained replay at the saved version.
- `2103f69` — the seven contract deltas, regenerated derivatives and the I11 corrections.
- `8592afb` — sibling working question, platform-only groups and proposal rendering.

Coordinator corrections applied after the first report (`msg_462c804ed55c`):
- `msg_3e0c075c2dc4` member identity: `bounded-analysis-gates.ts` now keys group members, the numerator subset and the cross-group overlap check on the retained source key (sha256 + locator), so one record retained under two logical paths is one record; a repeated reference additionally names `I11_MEMBER_REFERENCES_NOT_DISTINCT` and keeps that partition counts-only. Negative case added to the retained-membership fixture test.
- `msg_6cb8b9c42313` / `msg_66350ed079a7` / `msg_847c497b9075` / `msg_59cf0762437f` U-02 producer path: `located-review-bridge.ts` `#prepareProposal` is the in-repo located descriptor producer. Every newly prepared descriptor now carries `semanticsVersion: '1.1.0'` and a non-empty `workingQuestionProposal` produced by `locatedScopeWorkingQuestion(input.scope.definition)` — a deterministic, versioned system template over the frozen run scope that states in its own text that it is a system template awaiting the owner, is never written into an owner-authored brief field and never selects or filters evidence. A run that supplies its own upstream proposal keeps that text verbatim. Retained 1.0.0 packages keep replaying byte-identically because verification re-reads the retained descriptor and output. The optional `workingQuestionProposal` run-input field is an *additional* path for a real upstream proposal, not the completion of U-02: the service run itself produces the template without it.
- `msg_d8fa076ae1b6` / `msg_847c497b9075` group-basis alignment: 1.1.0 counts a cell under its source-stated platform/buyer basis first, so a declared label can never rename a group; a declared label with no stated basis (`I11_DECLARED_GROUP_NOT_SOURCE_BACKED`) or a group whose basis is absent (`I11_GROUP_NOT_SOURCE_BACKED`) keeps that partition counts-only even with a valid member set. The I11 page mirrors the same precedence. The 1.0.0 declared-policy path is unchanged.
- `msg_38deb8e54b03` / `msg_61a6967af4ba` / `msg_72aaadea7778` U-07 completeness: new `1.2.0` candidates must carry the three labelled proposal fields and every section is capped at three, M11 included; the narrow canonical lease for the hypothesis-candidate fields was used and released, and prompt `1.3.0` states the requirement explicitly while `1.0.0`-`1.2.0` prose and candidate acceptance stay byte-identical.
- `msg_2e8e012871f6` historical prompt bytes: `insight-model-prompt-v2` and v1 no longer share one live schema interpolation. v1 now builds from `insight-model-prompt-v1-schemas.json`, a frozen data fixture holding the base-commit `$defs` bytes it was released with (not a contract and not a generator input), so `insightModelPrompt('insight-model-prompt-v1').systemText` reproduces its historical digest exactly; v2 embeds the current located contract and lifts the persona ban. The digest is pinned in the test.
- `msg_ffa1678f24ff` refreshed main: `origin/main` (SYNC-1 #162, SYNC-6 #161) merged into the branch at `4990989`, keeping SYNC-6's `readSourceActivity`-only service integration alongside the separate dispatch/replay changes.

Committed paths:
- `src/modules/analysis/located-insight-methods.ts` (U-02: `semanticsVersion`, `methodVersion`, labelled I01 `workingQuestion`)
- `src/modules/analysis/bounded-analysis-gates.ts` (U-04: derived source-backed groups, authenticated-member rate proof, per-partition blockers, rate partition identity, 1.1.0-only duplicate rejection)
- `src/modules/analysis/report-method-packets-pages.ts` / `report-method-packets-extension.ts` (U-04 render and retained-member resolution)
- `src/modules/analysis/report-located-insight-pages.ts` (U-02 rendering)
- `src/modules/analysis/research-automation/insight-model-execution.ts` and `insight-model-prompt-v1-schemas.json` (U-05: v2 persona lift, frozen v1 fragments)
- `src/modules/analysis/research-automation/located-review-bridge.ts` (U-02: located producer path)
- `tests/integration/research-automation-exact-reviews.test.ts` (U-02 producer proof through the real pipeline)
- `tests/unit/report-method-packets-extension.test.ts` (U-04 alias, declared-label and excluded-record cases)
- `src/modules/analysis/research-automation/decision-packets.ts` (U-07/U-16 packet `1.2.0`, `aiProposal`, candidate cap 3, `PURCHASE_SUGGESTION_NOT_ALLOWED`)
- `src/modules/analysis/research-automation/decision-synthesis-input.ts` (prompt `1.3.0`, sibling `workingQuestion`, v1.2.0 support)
- `src/modules/analysis/research-automation/decision-synthesis-execution.ts` (admission `1.2.0` ↔ prompt `1.3.0`)
- `src/modules/analysis/research-automation/synthesis-evidence-report.ts` (U-07 rendering)
- `src/modules/analysis/research-automation/m01-evidence-inventory.ts` (`inventoryVersion`, `automationM01InventoryVersion`)
- `src/modules/analysis/research-automation/service.ts` (narrow dispatch and retained-version replay)
- `contracts/analysis/{located-insight-methods,bounded-analysis-gates,automation-decision-packets,automation-m01-evidence-inventory,automation-decision-synthesis-input,automation-decision-synthesis-prompt,automation-insight-model}.schema.json` and their regenerated derivatives
- tests: `sync3-version-semantics.test.ts` (new), `bounded-analysis-gates.test.ts`, `report-method-packets-extension.test.ts`, `report-method-packets-pages.test.ts`, `report-reader-projection.test.ts`

Evidence (commands, results, relevant revision):
- Runtime: cached Node 24.15.0 / npm 11.12.1 from a local toolchain cache; no runtime path is part of the repository.
- `npm run contracts:generate` was run after every schema edit and is clean (`git diff --exit-code contracts/` after regeneration).
- `npm run typecheck` on `8592afb`: CLEAN, 0 errors.
- Affected set (`node --test-concurrency=2 --import tsx --test`): **55/55 PASS** across `bounded-analysis-gates`, `sync3-version-semantics`, `located-insight-methods`, `research-automation-decision-packets`, `research-automation-m01-evidence-inventory`, `research-automation-decision-synthesis-input`, `research-automation-decision-synthesis-execution`, `report-method-packets-pages`, `report-method-packets-extension`, `research-automation-renderer-identity`, `report-located-insight-pages`, `report-reader-projection`, `research-automation-report-citations`.
- Old-version replay: new `legacy 1.0.0 I11 keeps accepting repeated cells for one group and replays byte-identically` and the existing 1.0.0/1.1.0 builders keep byte-identical output (G-10).
- Local full-suite attempt (`node --import tsx --test tests/unit/*.test.ts tests/integration/*.test.ts`, `--test-concurrency=2`): interrupted on instruction, released, not claimed; see the run result section below.

Astra/coordinator feedback already applied:
- `msg_14a7384405c9`: 1.2.0 preserves 1.1 additional support; retained-candidate replay passes the retained version.
- `msg_11fc1edf35da` / `msg_e0d9b4168dc6`, superseded for platform-only cases by `msg_a393716b213d`: a stated platform with no stated buyer is labelled with the platform alone (never `UNSPECIFIED`, never "all buyers"), and `I11_PLATFORM_ONLY_GROUP_OVERLAPS_BUYER_SUBDIVISION` keeps such a partition counts-only when the same platform also has a buyer subdivision.
- `msg_33826b18f26e` / `msg_174c7e31d06d` (I11 rate evidence): a rate is emitted only when the partition has no blocker, the counts are safe integers, every group's declared denominator equals its unique authenticated member-reference count, the numerator is a distinct subset of the same size, members are pairwise disjoint across groups, at least 30 members exist and each member resolves to a retained `LOCATED_RECORD` text record with `disposition: INCLUDED` (`METHOD_PACKET_MEMBER_NOT_AN_INCLUDED_TEXT_RECORD`, `METHOD_PACKET_DUPLICATE_MEMBER_REFERENCE`).
- `msg_33826b18f26e` (I01): `ownerFieldsToAdd` lists the question and every unset supplementary owner field.
- `msg_407a6ff8900b`: the working question is a sibling of `ownerInputs` and carries the verified retained upstream proposal only.
- `msg_262e7b391fe3`: the real producer fixture asserts the rendered page.
- `msg_dbddc00cac5d`: candidate task/owner/deadline render as awaiting-owner proposals; I16 has no authored output.
- `msg_4b441097cc9f` / `msg_fe531387117d`: no overlapping suites; one bounded affected run, then the single authorised full-suite slot.

## Checklist evidence

| ID | Status | Evidence |
|---|---|---|
| U-02 | DONE | Producer path (implemented, not just an optional helper): `located-review-bridge.ts#prepareProposal` prepares every new located descriptor at `semanticsVersion: '1.1.0'` with a non-empty `workingQuestionProposal` from `locatedScopeWorkingQuestion(input.scope.definition)`, and the real service run retains it — asserted through the full pipeline in `tests/integration/research-automation-exact-reviews.test.ts` (non-empty text, owner brief still null, record membership identical to the retained coding). The optional `workingQuestionProposal` run input is an extra path for a genuine upstream proposal, not the completion of this item. `located-insight-methods.ts` 1.1.0 emits labelled I01 `workingQuestion` (`AI_PROPOSED_AWAITING_OWNER`, owner-field list) instead of `I01_OWNER_QUESTION_REQUIRED`; `decision-packets.ts:141` and `m01-evidence-inventory.ts:80` carry the new gap for 1.2.0/1.1.0 and keep `OWNER_QUESTION_UNSET` for 1.0.0; `decision-synthesis-input.ts` adds the sibling `workingQuestion` read from the verified retained located output; `report-located-insight-pages.ts` gloss. Evidence-invariance test `U-02 labels an AI-proposed working question without changing evidence membership` proves only I01/version differ. |
| U-04 | DONE (SYNC-4-dependency-bound part noted) | Rate eligibility additionally requires the source-stated basis itself: 1.1.0 counts a cell under its stated platform/buyer basis, a declared label with no basis names `I11_DECLARED_GROUP_NOT_SOURCE_BACKED`, a group without a basis names `I11_GROUP_NOT_SOURCE_BACKED`, and either keeps the partition counts-only even with a valid member set (negative case in the retained fixture). Member identity is the retained source key, so a path alias is one record (`I11_MEMBER_REFERENCES_NOT_DISTINCT`). `bounded-analysis-gates.ts` derives disjoint platform(+explicit retail/wholesale) groups, replaces `I11_GROUP_POLICY_MISSING`/`I11_PUBLICATION_NOT_AUTHORIZED` with counts-not-blocked plus per-partition blockers, and emits `rates` only under the authenticated-member proof (≥30 members, compatible denominators, disjoint members); `report-method-packets-extension.ts` resolves members at the retention boundary; `report-method-packets-pages.ts` renders derived labels, the counted-record count and the `Phạm vi N` rate table. Producer fixture in `report-method-packets-extension.test.ts` builds real 1.1.0 rates from retained records, asserts the render and rejects an EXCLUDED member. Classified-rate eligibility requiring SYNC-4 stays dependency-bound: no classified rate is emitted. |
| U-05 | DONE | `insight-model-execution.ts` adds `contractVersion 'insight-model-prompt-v2'` with the blanket persona ban lifted and "no people counts" retained. v1 no longer re-serializes the live contracts: it embeds the frozen pre-change fragments in `insight-model-prompt-v1-schemas.json`, and the test pins the historical v1 digest `b7fca3c33c55ba6531fa3eab9008d6da11cdad4391a3a7f7878db87efebb5e78` (the same template over the base-commit fragments) plus the exact delta to v2: the lifted persona ban and the located-contract fragment, nothing else. |
| U-07 | DONE (insight draft packets; Market ranking half belongs to SYNC-1) | Packets `1.2.0` declare the labelled AI-proposal slot (`aiProposal`, `WORKING_QUESTION_AI_PROPOSED_AWAITING_OWNER`); every section — M11 opportunities included — admits at most three candidates (`CANDIDATE_COUNT_EXCEEDS_PROPOSAL_LIMIT`) and each candidate must carry a non-empty `immediateTask`, `proposedOwner` and `proposedDeadline` (`CANDIDATE_PROPOSAL_FIELDS_REQUIRED`), while owner options stay a separate list. The hypothesis candidate gained the same three fields in the packet contract (narrow lease `msg_72aaadea7778`, released), prompt `1.3.0` now states the requirement for M11/M12/I15 instead of "may also add", and the page renders all three as awaiting-owner proposals for M11 too. Tests: three accepted / four rejected / absent / null / whitespace per section at `1.2.0`, and a `1.1.0` packet still accepting four candidates without the fields. The Market `top 3 cells by revenue` / `Thứ tự theo doanh thu` half belongs to SYNC-1 (Market reader paths are not in this package's owned paths). |
| U-16 | DONE (I16 = N/A by construction) | Decision prompt `1.3.0` bans purchase/trial-order suggestions in the authored M12/I15 candidate contract, and `decision-packets.ts` enforces `PURCHASE_SUGGESTION_NOT_ALLOWED` at the candidate boundary for packet `1.2.0`. **I16 has no authored output in this build**: `bounded-analysis-gates.ts` `i16()` is deterministic with no model call, so there is no authored text to lint; `report-method-packets-pages.test.ts` asserts the I16 page renders no proposal wording and re-derives the same section. This handoff does not claim I16 is enforced from prompt text. |
| B-01…B-07 | N/A | Assigned to SYNC-6 (`docs/tasks/ultimate-v1.11-tdn-sync-plan.md:369` assigns SYNC-3 only U-02, U-04, U-05, U-07 and U-16); none of the B items is in this package's scope. |
| G-01 | DONE | This table reports every assigned ID of the package. |
| G-02 | PENDING (hosted gate) | `npm run typecheck` is clean and the affected sets pass locally, but the local full run was interrupted on instruction and released, so the full result is not claimed here. The mandatory gate is the exact-head hosted `npm run check` on the pushed draft, including `frontend:build`. Locally, the three `Task045` runtime tests pass once `frontend/dist` exists (they fail on a fresh checkout without a built frontend — a pre-existing environment condition, not a waived assertion). Not proven until that CI result exists. |
| G-03 | N/A | `frontend/` was not changed. |
| G-04 | DONE | `npm run contracts:generate` was run after every contract edit; the regenerated output is committed and `git diff --exit-code contracts/` is clean. |
| G-05 | DONE | `git diff --check` clean; every changed path is in this package's owned paths or explicitly granted (`contracts/analysis/*` under the single-writer lease, `service.ts` narrow dispatch, `report-method-packets-pages.ts`/`-extension.ts` render/verify under the coordinator grant). |
| G-06 | DONE | Synthetic fixtures only; no secrets, tokens, machine paths, home directories, IPs or real commercial data. |
| G-07 | DONE | No provider or AI call in any test or builder; `NO_AI_OR_PROVIDER_CALL_WAS_MADE` remains a stated limitation where relevant. |
| G-08 | DONE | Owner-facing additions are plain Vietnamese and name no provider; platform names appear only as source-stated values. |
| G-09 | DONE | Missing stays missing: unresolved owner fields stay listed, `null` states stay `null`, no zero substitution, no invented group membership and no invented people counts. |
| G-10 | DONE | Retained 1.0.0/1.1.0 artifacts validate and replay byte-identically; new versions are opt-in discriminators; the retained-version replay test covers the old I11 duplicate-cell behaviour. |
| G-11 | DONE | No test was deleted, skipped or weakened. One assertion this package itself added was replaced by a stronger one: the located integration test now requires a non-empty proposal text instead of the earlier `text: null`. Copy this package changed and re-asserted: the located I01 working-question note ("do hệ thống hoặc mô hình đề xuất"), the 1.1.0 I11 page text and the rate table heading. `git diff c2014bb..HEAD -- tests/` contains additions plus that one replacement. No copy assertion needed updating: the changed I11 copy is 1.1.0-only and the 1.0.0 page copy is byte-identical, so no existing assertion pinned text that this package changed. New assertions were added to `bounded-analysis-gates`, `report-method-packets-pages`, `report-method-packets-extension`, `report-reader-projection` and `sync3-version-semantics`. |
| G-12 | DONE | This file uses `templates/handoff.md` fields plus the Checklist evidence table. |
| G-13 | N/A | This package does not collect records by keyword; no search/social/comment/ad collection path is created or changed. |

## Run result

Local full suite: **not completed and not claimed**. The single local runner was interrupted mid-suite on coordinator instruction (`msg_0505a4a673f9`, `msg_ffcde379f7d6`); the slot is released and no automatic local rerun was started. Its log stayed machine-local and is not part of this repository. The exact-head hosted `npm run check` on the pushed draft is the mandatory full gate for this package.

What was verified locally on the final tree instead:
- `npm run typecheck`: clean.
- `npm run contracts:generate`: clean after every contract edit; no contract write happened after the lease release, so the generated tree is unchanged.
- Affected set under `--test-concurrency=2`: 60/60 pass across the gate, version-semantics, located, packet, M01, synthesis, page, extension, projection, citation and review-adapter tests.
- The heavy real-pipeline located test (`tests/integration/research-automation-exact-reviews.test.ts`, 20/20) drives collection → frozen corpus → located review → both reports through the service and proves the U-02 producer, the retained descriptor, the adopted overlay and both drafts.
- The three `Task045` runtime tests fail on a fresh checkout only because `frontend/dist` is absent. After a direct `vite build` (no generator run against the leased contracts; the only generator executed was the frontend validator generator, which writes the git-ignored `frontend/src/generated/report-validators.generated.js`), they pass 3/3 locally. No assertion or time limit was changed.
- Source changes made after the interrupted run: the U-02 scope-question producer, the basis-alignment rule, the frozen v1 prompt fragments, the renderer copy and the corresponding tests. Their affected reruns are the 60/60 and 20/20 runs above; they were not covered by the interrupted run.

## Business decisions pending

- Who authors the new-semantics located/bounded descriptors in production. In this repository only the located bridge writes a located descriptor (now at 1.1.0); the bounded gate input and the native original descriptor arrive as uploaded/upstream data.
- Whether a platform-only group may ever be compared with a buyer subdivision of the same platform. Current rule: never, that partition stays counts-only.
- Classified-rate eligibility still depends on SYNC-4; no classified rate is emitted here.
- The retained-source evidence cap of 4 files per method packet may need an owner decision once I11 members span more files.

## Unresolved (blockers, unchanged from the last report)

1. Located/bounded descriptor producers (msg_dc789ed2409c, awaiting owner confirmation). `service.ts` cannot dispatch `semanticsVersion` for located/bounded inputs: they are descriptors read from a finalized source package (`methods/located-input.json`, the bounded `descriptorPath`) and re-verified in `located-review-bridge.ts`, `native-source-review-bridge.ts`, `bounded-methods.ts`. The builders accept `semanticsVersion: '1.1.0'` and the retained-member proof, but the package-side descriptor writer must set the version and populate `i11.cells[].groupBasis`/`memberSources`/`numeratorMemberSources`. Those bridge files only read/verify descriptors, so new located/bounded outputs stay 1.0.0 until that writer is named.
2. The verifier's retained-source-file cap (4) may need a decision once I11 members span more retained files.
3. Market-side U-07 (remove `top 3 cells by revenue` and `Thứ tự theo doanh thu`) is outside this package's owned paths (Market reader / `market-template.ts`).

Next action: report the PR URL, head SHA, test results and blockers to Astra; do not merge or deploy. No further contract writes without a new lease.
