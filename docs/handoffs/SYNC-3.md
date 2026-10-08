# Handoff — SYNC-3 (U-02, U-04, U-05, U-07, U-16)

Updated: 2026-10-08
Worktree/branch: `ultimate-impl-sync3-omp`, branch `khangpworking/ultimate-impl-sync3-omp` (base `c2014bb`)

Completed: owned source implemented for all five items, version-aware and additive. No schema/generated file was written (single-writer lease still held by SYNC-6). The isolated `reports.ts` M05 renderer-identity commits requested by Astra are committed and pushed; the rest of the source is still uncommitted.

Committed and pushed (isolated for SYNC-1 to cherry-pick):
- `fc07995b253cbdd13f1f2777889f1b508e0ff11f` — `src/modules/analysis/research-automation/reports.ts` plus new `tests/unit/research-automation-renderer-identity.test.ts`.
- `884bef0ef832ee5286825b0fee80a267416a8773` — correction from coordinator review: the new kit identity applies only when `kind === 'MARKET'`, so an INSIGHT report that merely carries an unused Market descriptive method keeps `automation-report-kit-v12`. Adds the regression test `an INSIGHT report keeps v12 even when an unused Market descriptive method is attached`.

Changed paths (uncommitted):
- `src/modules/analysis/located-insight-methods.ts` (U-02: `semanticsVersion` input, `methodVersion` output, labelled `workingQuestion` on I01 naming every owner field still to add)
- `src/modules/analysis/bounded-analysis-gates.ts` (U-04: derived source-backed groups, authenticated-member rate proof, per-partition blockers, rate partition identity)
- `src/modules/analysis/report-method-packets-pages.ts` (U-04: version-aware I11 page — derived group labels, descriptive-rate table, counted-record count; 1.0.0 copy byte-identical)
- `src/modules/analysis/report-method-packets-extension.ts` (U-04: `verifyTree` resolves every `memberSources`/`numeratorMemberSources` entry against retained evidence)
- `src/modules/analysis/report-located-insight-pages.ts` (U-02 rendering, `WORKING_QUESTION_AI_PROPOSED_AWAITING_OWNER` gloss)
- `src/modules/analysis/research-automation/insight-model-execution.ts` (U-05: `insight-model-prompt-v2` + `insightModelPrompt(version)`)
- `src/modules/analysis/research-automation/decision-packets.ts` (U-07/U-16: `packetVersion` `1.2.0`, `aiProposal` slot, working-question gap, candidate cap 3, `PURCHASE_SUGGESTION_NOT_ALLOWED` guard)
- `src/modules/analysis/research-automation/decision-synthesis-input.ts` (U-02/U-07/U-16: prompt `1.3.0`, `ownerInputs.workingQuestion`, v1.2.0 support preservation)
- `src/modules/analysis/research-automation/decision-synthesis-execution.ts` (admission `1.2.0` ↔ prompt `1.3.0` binding)
- `src/modules/analysis/research-automation/synthesis-evidence-report.ts` (U-07 rendering: AI-proposed immediate task/owner/deadline shown, labelled awaiting the owner)
- `src/modules/analysis/research-automation/m01-evidence-inventory.ts` (U-02: `inventoryVersion` hook)
- `tests/unit/sync3-version-semantics.test.ts` (new)

Evidence (commands, results, relevant revision):
- Runtime: cached Node 24.15.0 / npm 11.12.1 (`/home/pkhang/.cache/tdn-toolchains/node-v24.15.0-linux-x64/bin`); `node_modules` from a prior successful `npm ci`.
- Affected unit tests (bounded concurrency 2): **37/37 PASS** — `node --test-concurrency=2 --import tsx --test tests/unit/{bounded-analysis-gates,research-automation-renderer-identity,report-method-packets-pages,report-method-packets-extension,located-insight-methods,research-automation-decision-packets,research-automation-m01-evidence-inventory,research-automation-decision-synthesis-input,research-automation-decision-synthesis-execution}.test.ts`. Old-version (1.0.0/1.1.0) builders still produce byte-identical output; no existing assertion was weakened or deleted (G-11: none updated). Decision-rendering tests (`report-reader-projection`, `research-automation-i14-evidence-admission`) also pass.
- Committed renderer tests: `tests/unit/research-automation-renderer-identity.test.ts` **2/2 PASS**; `tests/unit/research-automation-report-citations.test.ts` 7/7 PASS; `report-assembly-snapshot` PASS.
- `npm run typecheck`: 18 errors, all of the same class — the new field/enum names are not yet in the generated types (`groupBasis`, `memberSources`, `numeratorMemberSources`, `semanticsVersion`, `workingQuestion`, `inventoryVersion`, `1.2.0`, `1.3.0`, `insight-model-prompt-v2`). No logic or type-shape error. Expected while the schema lease is held.
- `tests/unit/sync3-version-semantics.test.ts`: 1 PASS (U-05 prompt version), 3 FAIL — every failure is AJV input validation of a new field/enum (`additionalProperties`, enum), i.e. the un-regenerated schemas. They must pass after generation.

Astra/coordinator feedback already applied:
- `msg_14a7384405c9`: 1.2.0 now preserves 1.1 additional support (`decision-synthesis-input.ts:243`, `decision-packets.ts:118`); retained-candidate replay passes the retained version.
- `msg_11fc1edf35da` / `msg_e0d9b4168dc6`: unknown/ambiguous buyer → `UNSPECIFIED` label (never all-buyer).
- `msg_33826b18f26e` / `msg_174c7e31d06d` (I11 rate evidence): a rate is emitted only when the partition has no blocker and every group is a fully specified platform+buyer group with a `LOCATED_RECORD` unit, a declared denominator that equals its **unique authenticated member-reference count**, at least 30 members, and a numerator whose member set is contained in that member set and has exactly the declared numerator size. `memberSources`/`numeratorMemberSources` are retained source references, resolved to existing retained evidence by `verifyTree` (`METHOD_PACKET_INVALID_MEMBER_SOURCES`, `METHOD_PACKET_EMPTY_EVIDENCE_REFERENCE`). Two cells for the same group in one partition now fail (`I11_DUPLICATE_GROUP_CELL`) instead of overwriting the numerator/denominator; member overlap raises the per-partition blocker `I11_GROUP_MEMBER_OVERLAP`; the `rates` output carries the partition index so differing scopes stay distinguishable; anything unproven stays counts-only, no shortcut.
- `msg_33826b18f26e` (I01): `ownerFieldsToAdd` now lists the question **and** every unset supplementary owner field (`decisionToInform`, `intendedAudience`, `scope`, `knownConstraints`).
- `msg_dcc7d85a690b`: decision candidates now render the AI-proposed immediate task, owner and deadline, labelled as awaiting the owner, in `synthesis-evidence-report.ts`.
- `msg_4b441097cc9f` (resource gate): no full-suite run started; only bounded `--test-concurrency=2` runs on the affected files.
- Classified-rate eligibility stays SYNC-4 dependency-bound, no synthetic acceptance.

Unresolved (blockers):
1. Schema lease. Astra confirms it stays HOLD: SYNC-6 has not released, then a very short SYNC-1 final generator phase, then my seven schemas. Seven `contracts/analysis/*.schema.json` files (plus the method-packet input schema for `groupBasis`/`memberSources`/`numeratorMemberSources`) and `npm run contracts:generate` cannot be written until then. Until that point the 1.2.0/1.3.0/prompt-v2/method-1.1.0 artifacts cannot validate and the three version-aware tests stay red.
2. U-04 producer wiring. The gate consumes `cells[].groupBasis` (source-stated platform + explicit RETAIL/WHOLESALE) and `cells[].memberSources`/`numeratorMemberSources` as the authenticated-member proof, verified by `report-method-packets-extension.ts` `verifyTree`; whoever assembles the I11 input must populate them from retained evidence, and Astra authorized me to wire the producer/render/replay in `report-section-pages.ts`, `report-method-packets-pages.ts`, `report-method-packets-extension.ts`, `bounded-methods.ts`. Gate rendering and the `verifyTree` member resolution are done; the producer assembly is not. Note the verifier's retained-source-file cap (4) may need a decision once members span files.
3. M01 `inventoryVersion` and the U-02 working-question producer must be passed by the caller (`service.ts` / report assembly), which is not an owned path. Prepared, not applied: `service.ts` still builds packets as `packetVersion '1.1.0'` (line ~1890) and M01 without `inventoryVersion`; the narrow grant is queued behind SYNC-6.

Next action: after the lease grant, apply the schema deltas (gate input/output, method-packet input, located-insight-methods, decision packets, decision-synthesis input/prompt, insight model, M01), including `groupBasis`/`memberSources`/`numeratorMemberSources`/`rates[].partition`, `npm run contracts:generate`, confirm the version tests and the affected set, run `npm run typecheck` and the bounded full suite, then commit the remaining source (renderer commits `fc07995`/`884bef0` already separate cleanly), push, open a draft PR and report. Do not merge, deploy or make provider calls.
Business decisions pending: the I11 rate-governance wording for the methodology doc (Ultimate §6.3 ≥30 applied per source-stated platform+buyer group, classified-rate eligibility SYNC-4 dependency-bound) — Astra is documenting this.

## Checklist evidence

| ID | State | Evidence |
|---|---|---|
| U-02 | ESCALATED | Source done: `semanticsVersion` 1.1.0 + I01 `workingQuestion` (state/label/text/ownerFieldsToAdd listing `questionText` plus every unset supplementary owner field), renderer block, `ownerInputs.workingQuestion` (1.2.0 only, outside owner fields), M01 `inventoryVersion` hook; owner-field insertion avoided; the new proposal never filters or selects evidence; evidence-membership regression written. Blocked: schema lease (no 1.1.0 artifact validates) and the M01 caller (`service.ts`, not owned) must pass `inventoryVersion`. |
| U-04 | ESCALATED | Source done: disjoint groups derived only from source-stated platform + explicit RETAIL/WHOLESALE (`UNSPECIFIED` otherwise, never all-buyer); a rate needs an unblocked partition and, per group, `LOCATED_RECORD` unit, unique authenticated member references whose count equals the declared denominator, ≥30 members, and numerator members contained in that set with exactly the declared numerator size, else counts only (`I11_RATE_REQUIRES_COMPATIBLE_DENOMINATORS_AND_30_RECORDS`); duplicate cells for one group in a partition fail (`I11_DUPLICATE_GROUP_CELL`); member overlap raises the per-partition blocker `I11_GROUP_MEMBER_OVERLAP`; `rates` carries the partition index; `I11_GROUP_POLICY_MISSING`/`I11_PUBLICATION_NOT_AUTHORIZED` removed for 1.1.0; `verifyTree` resolves every member reference to retained evidence. Producer assembly (caller supplies `groupBasis`/`memberSources` from retained evidence) still pending, plus the schema lease. |
| U-05 | DONE | `insight-model-prompt-v2` lifts only the persona ban; "no people counts" kept; v1 retained for replay; `adapter.promptBytes` uses v2. Test `U-05 lifts only the persona ban in prompt v2…` PASS. Schema enum for `contractVersion` pending. |
| U-07 | ESCALATED | Source done: packet 1.2.0 `aiProposal` slot + label, working-question gap, prompt 1.3.0 with `proposedOwner`/`proposedDeadline`/`immediateTask` (deadlines spelled in words, aiText no-digit rule) and candidate cap 3 for M12/I15, and candidate rendering that shows the proposed task/owner/deadline labelled as awaiting the owner. Blocked: schema lease (enum/defs). |
| U-16 | ESCALATED | Source done: prompt 1.3.0 no-purchase ban + runtime authored-output guard `PURCHASE_SUGGESTION_NOT_ALLOWED` gated to packet 1.2.0 (old candidates replay). I16 has no AI-authored prose in this build (deterministic `bounded-analysis-gates.ts`), so its authored-output part is N/A-by-construction. Blocked: schema lease; guard test red on enum only. |
| G-01 | DONE | Every U/B ID above is reported with evidence or an explicit reason. |
| G-02 | ESCALATED | 37/37 affected unit tests pass under `--test-concurrency=2`; `npm run typecheck` shows only the 18 expected schema-lag errors. Full `npm test` not yet run (device: new-version artifacts cannot validate before generation; coordinator resource gate forbids overlapping full suites). Baseline failures unchanged. |
| G-03 | N/A | No `frontend/` change. |
| G-04 | ESCALATED | Contract generation not run; the schema deltas are unwritten under the held lease. No generated file is touched. |
| G-05 | PENDING | Renderer commits `fc07995`/`884bef0` stage only `reports.ts` + its test. The remaining uncommitted source stays inside the owned paths (plus the new test and this handoff); full `git diff --check origin/main...HEAD` runs before the final commit. |
| G-06 | DONE | No secrets, machine paths, home directories, IPs or real commercial data added; synthetic fixtures only. |
| G-07 | DONE | No provider or AI call in any change; the new test uses in-process builders only. |
| G-08 | DONE | New owner-facing strings are plain Vietnamese with no provider names. |
| G-09 | DONE | Missing stays missing; no invented sources, groups, buyer types or people counts. |
| G-10 | DONE | Old-version builders unchanged (37/37 replay/replay-mismatch tests pass); retained artifacts read byte-identical; retained prompts/candidates still validate. |
| G-11 | DONE | No existing test deleted, skipped or weakened; none needed updating (new behavior is version-gated). |
| G-12 | DONE | This file uses the template fields plus the checklist table. |
| G-13 | N/A | No keyword-based collection in these changes. |
