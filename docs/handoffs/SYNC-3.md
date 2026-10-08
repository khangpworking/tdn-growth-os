# Handoff — SYNC-3 (U-02, U-04, U-05, U-07, U-16)

Updated: 2026-10-08
Worktree/branch: `ultimate-impl-sync3-omp`, branch `khangpworking/ultimate-impl-sync3-omp` (base `c2014bb`, refreshed main merged)

Completed: the five assigned plan items are implemented as version-gated additions on top of the frozen 1.0.0/1.1.0
behaviour, and the owned source, contracts and generated derivatives are committed and pushed on this branch. Every
new semantic is opt-in behind a version discriminator, so a retained artifact still validates and replays
byte-identically. Canonical contract writes happened under one narrow schema lease, used for the synthesis-input
packet enum and released after the regeneration and focused checks below.

## Changed paths

Owned source:
- `src/modules/analysis/located-insight-methods.ts` — U-02: labelled I01 `workingQuestion`
  (`AI_PROPOSED_AWAITING_OWNER`, owner fields to add) in place of the hard `I01_OWNER_QUESTION_REQUIRED` blocker.
- `src/modules/analysis/bounded-analysis-gates.ts` — U-04: source-backed platform groups with explicit retail or
  wholesale subdivision, derived group labels, retained-source-key member identity, authenticated-member rate proof,
  per-partition blockers, `MIN_RATE_RECORDS = 30`.
- `src/modules/analysis/report-method-packets-extension.ts`, `report-method-packets-pages.ts` — U-04 retained-member
  resolution and rendering (`Phạm vi N`).
- `src/modules/analysis/report-located-insight-pages.ts` — U-02 rendering; the page states that the system or the
  model proposes the working question.
- `src/modules/analysis/research-automation/insight-model-execution.ts` + `insight-model-prompt-v1-schemas.json` —
  U-05: current prompt `insight-model-prompt-v2` lifts the blanket persona ban and keeps "no people counts"; the v1
  prompt builds from the frozen base-commit `$defs` bytes it was released with, so its historical digest is stable.
- `src/modules/analysis/research-automation/decision-packets.ts` — U-07/U-16: packet `1.2.0`, labelled
  `aiProposal` slot, at most three candidates per section, required `immediateTask`/`proposedOwner`/`proposedDeadline`,
  `PURCHASE_SUGGESTION_NOT_ALLOWED`.
- `src/modules/analysis/research-automation/decision-synthesis-input.ts` — prompt `1.3.0`, sibling
  `workingQuestion`, `1.2.0` support.
- `src/modules/analysis/research-automation/decision-synthesis-execution.ts` — the `1.2.0` adapter, plus the
  rejected-response mapping described under U-16.
- `src/modules/analysis/research-automation/synthesis-evidence-report.ts`,
  `m01-evidence-inventory.ts` (`inventoryVersion` `1.1.0` and `automationM01InventoryVersion`),
  `located-review-bridge.ts` (U-02 deterministic producer), `service.ts` (narrow dispatch of the new versions and
  retained-version replay).
- `contracts/analysis/{located-insight-methods,bounded-analysis-gates,automation-decision-packets,automation-m01-evidence-inventory,automation-decision-synthesis-input,automation-decision-synthesis-prompt,automation-insight-model}.schema.json`
  and their regenerated derivatives.

Tests: `tests/unit/sync3-version-semantics.test.ts` (new), `bounded-analysis-gates`, `report-method-packets-extension`
(modes `plain|excluded|aliased|declared`), `report-method-packets-pages`, `report-reader-projection`,
`research-automation-decision-packets`, `research-automation-decision-synthesis-input`,
`research-automation-m01-evidence-inventory`, `located-insight-methods`, `research-automation-renderer-identity`,
`report-located-insight-pages`, `research-automation-report-citations`, `source-package-literal-review-adapter`;
`tests/integration/research-automation-exact-reviews.test.ts` (U-02 producer through the real pipeline),
`research-automation-decision-synthesis-execution.test.ts` (rejected-response retention),
`research-automation-native-reviews.test.ts`, `research-automation-api.test.ts`,
`research-insight-prompt-retention.test.ts`, `research-automation-methods.test.ts`,
`research-automation-case-contract.test.ts`, `research-automation-supplemental-intake.test.ts`,
`source-only-method-packets.test.ts`.

## Checklist evidence

| ID | Status | Evidence |
|---|---|---|
| U-02 | DONE | The in-repo located descriptor producer is `located-review-bridge.ts#prepareProposal`: every newly prepared descriptor carries `semanticsVersion: '1.1.0'` and a non-empty `workingQuestionProposal` built by `locatedScopeWorkingQuestion(scope.definition)`, a deterministic versioned system template over the frozen run scope that states in its own text that it awaits the owner, is never written into an owner-authored brief field and never selects evidence. `tests/integration/research-automation-exact-reviews.test.ts` (20/20) drives collection, the frozen corpus, located review and both reports through the service and asserts the retained descriptor, the exact `workingQuestion` object with its `ownerFieldsToAdd`, a still-null owner brief, the record texts equal to the retained coding records, the adopted overlay at `1.1.0` and the absence of `I01_OWNER_QUESTION_REQUIRED`; `report-located-insight-pages` asserts the rendered gloss. |
| U-04 | **PARTIAL** | Safe gate done: `bounded-analysis-gates.ts` `1.1.0` derives disjoint source-backed platform groups (plus an explicit retail/wholesale subdivision only when the source states the basis), keeps a declared label from renaming a group, identifies members by the retained source key (sha256 + locator) so two logical paths for one record are one record, and removes the blanket blockers into per-partition blockers plus counts-only output. A rate is emitted only when the partition has no blocker, the declared counts are safe integers, each group's denominator equals its unique `INCLUDED` `LOCATED_RECORD` member count, the numerator is a distinct subset, members are pairwise disjoint, and there are at least 30 members. Not done overall: classified-rate eligibility still depends on the SYNC-4 count/coding work, so no classified rate is claimed here. `tests/unit/report-method-packets-extension.test.ts` covers the retained package in `plain`, `excluded` (not-an-included-record / duplicate reference), `aliased` (one record under two paths) and `declared` (label without a stated basis) modes; `bounded-analysis-gates.test.ts` keeps the `1.0.0` duplicate-cell behaviour byte-identical. |
| U-05 | DONE | `insight-model-execution.ts` adds `insight-model-prompt-v2`, which lifts the blanket persona ban and keeps the "no people counts" rule; every new preparation now dispatches v2, and a settled execution replays the prompt bytes it was prepared with. v1 no longer re-serializes the live contracts: it embeds the frozen pre-change fragments in `insight-model-prompt-v1-schemas.json` (a data fixture, not a contract and not a generator input), and `tests/unit/sync3-version-semantics.test.ts` pins the historical v1 digest `b7fca3c33c55ba6531fa3eab9008d6da11cdad4391a3a7f7878db87efebb5e78` plus the exact v1→v2 delta (the lifted persona ban and the located-contract fragment, nothing else). `tests/integration/research-insight-prompt-retention.test.ts` now expects v2 for the new dispatch and keeps the exact-retry and zero-new-model-call replay assertions on the retained bytes. |
| U-07 | DONE (insight draft packets; the Market ranking half belongs to SYNC-1) | Packet `1.2.0` declares the labelled AI-proposal slot and admits at most three candidates for M11, M12 and I15 (`CANDIDATE_COUNT_EXCEEDS_PROPOSAL_LIMIT`); every candidate must carry a non-empty `immediateTask`, `proposedOwner` and `proposedDeadline` (`CANDIDATE_PROPOSAL_FIELDS_REQUIRED`) while owner options stay a separate list. The hypothesis candidate gained the same three optional fields in the packet contract under the narrow lease, prompt `1.3.0` states the requirement instead of "may also add", and `synthesis-evidence-report.ts` renders all three as awaiting-owner proposals for M11/M12/I15 in both reports. `tests/unit/report-reader-projection.test.ts` loops the three sections; `research-automation-decision-packets.test.ts` asserts the cap, the required fields, the `1.1.0` legacy acceptance (up to twenty candidates, no proposal fields) and byte-identical replay. |
| U-16 | DONE (I16 = N/A by construction) | `decision-packets.ts` rejects any authored purchase or trial-order suggestion at the `1.2.0` candidate boundary (`PURCHASE_SUGGESTION_NOT_ALLOWED`, recursive over every candidate string) and prompt `1.3.0` states the ban. **I16 has no authored output in this build**: `bounded-analysis-gates.ts` `i16()` is deterministic with no model call, and `tests/unit/report-method-packets-pages.test.ts` asserts the I16 page renders no proposal wording. Precise validator errors versus stored verdicts: the validator keeps the exact guard code, while the retained ledger only supports the stable generic decision-candidate code, so `classifyResponse` maps the three `1.2.0` guard codes onto the ledger-supported `INVALID_DECISION_CANDIDATES` instead of letting the rejection escape as a dispatch failure. `tests/integration/research-automation-decision-synthesis-execution.test.ts` drives one rejected response per guard on its own synthetic parent at packet `1.2.0` with admission `1.1.0`, plus a VALID positive control, and asserts each rejection is stored and replayed as `INVALID`/`INVALID_DECISION_CANDIDATES` with `dispatched: false` and no redispatch. |
| B-01…B-07 | N/A | Assigned to SYNC-6; `docs/tasks/ultimate-v1.11-tdn-sync-plan.md:369` assigns SYNC-3 only U-02, U-04, U-05, U-07 and U-16. |
| G-01 | DONE | This table reports every assigned ID of the package. |
| G-02 | PENDING (hosted gate) | `npm run typecheck` is clean on the final tree and the affected tests pass locally, but the local full run was interrupted on instruction and released, so the full result is not claimed here. The mandatory gate is the exact-head hosted `npm run check` on the pushed draft, which also runs `frontend:build`. The hosted `Check` on the previous head `fcd92b0` failed 15 of 1245 tests in five integration files; the causes found and fixed were the synthesis-input packet enum, the required proposal fields in synthetic responses meant to be accepted, the new-dispatch prompt version, and the rejected-response mapping. Locally the three `Task045` runtime tests need a built `frontend/dist`; they pass once it exists, which is a pre-existing environment condition, not a waived assertion. |
| G-03 | N/A | `frontend/` source was not changed. |
| G-04 | DONE | `npm run contracts:generate` was run after every contract edit under the narrow lease, and the regenerated output is committed. |
| G-05 | DONE | `git diff --check` is clean; every changed path is owned by this package or explicitly granted (the analysis contracts under the narrow single-writer lease, the narrow `service.ts` dispatch, and the method-packet render/verify files). |
| G-06 | DONE | Synthetic fixtures only; no secrets, tokens, machine paths, home directories, IPs or real commercial data. |
| G-07 | DONE | No provider or model call in any builder or test; `NO_AI_OR_PROVIDER_CALL_WAS_MADE` remains a stated limitation where relevant. |
| G-08 | DONE | Owner-facing additions are plain Vietnamese and name no provider; platform names appear only as source-stated values. |
| G-09 | DONE | Missing stays missing: unresolved owner fields stay listed, `null` states stay `null`, no zero substitution, no invented group membership, no invented people counts and no invented proposal text presented as the owner's own. |
| G-10 | DONE | Retained `1.0.0`/`1.1.0` artifacts validate and replay byte-identically; every new semantic is version-gated; the retained-version replay tests cover the old I11 duplicate-cell behaviour, the old decision candidates and the old located descriptor. |
| G-11 | DONE | No existing assertion was deleted, skipped or weakened. Three assertions this package itself added earlier in the branch were updated to the corrected semantics: the located integration test now requires a non-empty proposal text instead of `text: null`; the U-07 prompt test expects the cap of three with the required-field wording instead of "at most 20"; and the M12/I15 prompt wording moved from "may also add" to "must include". Copy this package changed and re-asserted: the located I01 working-question gloss, the `1.1.0` I11 page text and the rate-table heading. |
| G-12 | DONE | This file uses the `templates/handoff.md` fields plus this evidence table. |
| G-13 | N/A | This package does not collect records by keyword and creates no search, social, comment or ad collection path. |

## Evidence (commands, results, relevant revision)

- Runtime: cached Node 24.15.0 / npm 11.12.1 from a local toolchain cache; no runtime path is part of the repository.
- `npm run contracts:generate`: clean after every contract edit, including the final synthesis-input packet-enum
  change (`git diff --exit-code contracts/` clean after regeneration).
- `npm run typecheck`: clean on the final tree, and clean after each earlier edit.
- Five formerly failing integration files (`research-automation-api`, `-case-contract`, `-methods`, `-native-reviews`,
  `research-insight-prompt-retention`) under `node --test-concurrency=2 --import tsx --test`: **54/54 PASS**.
- Adapter and version regressions (decision-synthesis executions including the VALID control and the three
  stored/replayed generic `INVALID` verdicts, version semantics, decision packets, method-packet extension and
  reader projection): **22/22 PASS** on this working tree.
- Earlier affected evidence that remains valid because its files and inputs are unchanged: the located pipeline
  integration test 20/20 and the method-packet/reader sets 35/35.
- Local full suite: **not completed and not claimed.** The single local runner was interrupted mid-suite on
  coordinator instruction and the slot was released; no automatic local rerun was started, and the log stayed
  machine-local. The exact-head hosted `npm run check` on the pushed draft is the mandatory full gate.
- Hosted `Check` on the previous head `fcd92b0`: FAILED, 1245 tests, 1227 passed, 15 failed, 3 skipped, all failures
  inside the five integration files above. The causes were fixed and the files re-run locally as reported; a fresh
  hosted run on the final head is required.
- The frontend validator generator was run once, writing only the git-ignored
  `frontend/src/generated/report-validators.generated.js`; it produced no contract change. After a direct
  `vite build` the three `Task045` operator-app tests pass locally.

## Unresolved

1. **U-04 is PARTIAL.** The safe gate and the descriptive, source-backed rate rules are implemented and tested, but
   classified-rate eligibility depends on the SYNC-4 count/coding work. No classified rate is emitted in this
   package.
2. `CITED_BEHAVIOR_CONTEXT_MISSING` is registered in the decision adapter code list but is absent from the ledger's
   `validation_code` constraint, so that specific rejection could not be stored as an `INVALID` verdict. It is
   pre-existing and outside this change; recorded here as a follow-up limitation rather than expanded now.
3. The bounded gate input and the native original descriptor arrive as uploaded or upstream data; only the located
   descriptor is produced in this repository. The retained-source-file cap (4 per method packet) may need an owner
   decision once I11 members span more files.
4. Market-side U-07 (removing the `top 3 cells by revenue` ranking and `Thứ tự theo doanh thu`) is outside this
   package's owned paths.

## Business decisions pending

None that block this package. The group-basis rule (a declared label never renames a group; a platform-only group is
never compared with a buyer subdivision of the same platform), the three-candidate cap and the required proposal
fields are settled scope decisions, not open questions. The two open items are the SYNC-4 classified-rate dependency
and the retained-file cap noted above; both are dependencies, not decisions this package can take.

## Next action

Report the draft PR URL, final head SHA, test results and the blockers above to the coordinator; keep the PR as a
draft until the hosted full gate is green. Do not merge, do not deploy, and make no further contract write without a
new lease.
