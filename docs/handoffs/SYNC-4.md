# Handoff — SYNC-4 bounded draft-count eligibility (U-03)

Updated: 2026-10-08 (final: explicit snapshot branches, version-branched display, v15 identity, receipt wording, same-pair coexistence)
Worktree/branch: `khangpworking/ultimate-impl-sync6-opencode` (base: PR164 `d7ad11f` + PR167 `0d098a1` + PR168 `8a1939d` merged normally)
Completed: U-03 draft counts from retained AI-proposed coding without owner receipts, behind an opt-in `draft-counts-v1` flag; real versioned receipt-free draft selection of one exact proposal through the owning coding service/retention/replay; version-branched display with suppression of unsupported totals; prompt v3 with frozen v1/v2 bytes; synthetic regressions. U-11 remains ESCALATED (no κ statistic anywhere).
Changed paths:
- `contracts/analysis/located-insight-methods.schema.json` (sole-lease edit)
- `contracts/analysis/located-insight-methods.generated.ts` + cascade dependents
- `contracts/analysis/automation-insight-model.schema.json` (prompt enum +v3; strictly necessary new version)
- `contracts/analysis/automation-insight-report-revision.schema.json` (draftInsight variant + draftSelection def)
- `contracts/analysis/automation-insight-report-revision.generated.ts`
- `contracts/analysis/automation-insight-coding-snapshot.schema.json` (explicit v1/v2 branches)
- `contracts/analysis/automation-insight-coding-snapshot.generated.ts`
- `src/modules/analysis/located-insight-methods.ts` (I02-scoped draft eligibility in `summary()`)
- `src/modules/analysis/insight-corpus-counts.ts` (per-code draft counts + single-code/version guards)
- `src/modules/analysis/report-located-insight-pages.ts` (version-branched draft display)
- `src/modules/analysis/research-automation/insight-coding.ts` (resolveDraftProposal, report/verifyReportDraftSnapshot)
- `src/modules/analysis/research-automation/insight-model-execution.ts` (frozen v2 fragments, v3 dispatch)
- `src/modules/analysis/research-automation/insight-model-prompt-v2-schemas.json` (new frozen fixture)
- `src/modules/analysis/research-automation/service.ts` (narrow draftInsight branches)
- `src/modules/analysis/research-automation/reports.ts` (draft-aware views/trace, v15 renderer identity)
- `tests/unit/sync4-draft-counts.test.ts` (new)
- `tests/integration/research-automation-draft-revision.test.ts` (new, 2 service tests)
- `tests/unit/sync3-version-semantics.test.ts` (v2-frozen/v3-live pins)
- `tests/unit/research-automation-reports.test.ts` (v1 branch annotation)
- `tests/integration/research-insight-prompt-retention.test.ts` (new dispatch v3)
Evidence (commands, results, relevant revision):
- Task-provided Node 24.15.0 / npm 11.12.1 runtime (per-command PATH); shared pinned Python interpreter for PDF checks.
- Pre-change hashes captured post-merge: corpus-counts `de29a900…`, located-methods `dd37c1da…` (located 1.1), selected-projection `385204b0…`, located pages `af2a0a69…`, located schema `3472d702…`, v1 prompt digest `b7fca3c3…` (pinned), v2 fragments pinned (`annotations a5cc806c…`, `locatedDefinitions 3495d13a…`).
- `npm run contracts:generate` touched only listed files; `git diff --check` clean.
- `node scripts/typecheck.mjs` exit 0.
- Focused suites exit 0: new `sync4-draft-counts` 7/7 (union draft totals, disposition gate, single-code/version negatives, COMPLETE raw-vs-display distinction, labels, prompt freeze); `research-automation-draft-revision` 2/2 (zero-receipt flow + same-pair receipt-before-draft: I02+I10+I13 routing, v2 snapshot, v15 identity, provenance, wrong-X, both/neither, replay); affected located/corpus/pages/sync3/reports/prompt-retention suites green.
- No provider/model calls; full local suite not run (no slot grant); exact-head hosted CI is the gate.
Unresolved:
- U-11 family-level multi-code Cohen κ: ESCALATED (no statistic invented; unresolved disagreements stay explicit and block release — ratios null, CODING_PENDING/CORPUS_CODING_PENDING retained).
- Scope: U-03 is PARTIAL overall. Delivered: I02 summary and I10/I13 corpus draft counts with version-branched display. Remaining: I04/I05/I06/I07/I08/I09 families remain accepted-only by contract; I11 consumption and any further family expansion belong to later integrations.
- Exact-head CI on the draft head is the gate (G-02 PENDING).
Next action: Astra independent review; coordinator owns ready/merge only after exact-head review and green full GitHub check. No worker merge.
Business decisions pending: none. Owner adoption stays optional recorded authority; AI proposals are never rewritten to approved.

## Checklist evidence

| ID | Status | Evidence |
|---|---|---|
| U-03 | PARTIAL (delivered: I02 summaries, I10/I13 corpus counts; remaining families + U-11 explicit) | Draft totals = eligible accepted + eligible pending proposals, deduped by stable record identity (reports dedupe sourceSha256+locator across codes/corpora, never summed), on INCLUDED records with matching eligible CODED dispositions (PENDING/UNCLEAR/UNCODED/missing excluded; each negative tested; same-record multi-code/duplicate cases tested); single-code invariant enforced when multiCode=false; draft flag requires current 1.1.0 semantics (derived draft input selects it without rewriting retained evidence); disagreements excluded everywhere; provenance never rewritten (asserted verbatim); accepted counts/pending tallies/blockers unchanged; raw accepted ratios still publish when COMPLETE while draft display suppresses ratios (distinction tested); versioned receipt-free draft selection of exact proposalId through resolveDraftProposal/reportDraftSnapshot/verify (zero receipts by construction, explicit v2 branch, immutable replay, wrong-X/both/neither negatives); version-branched display: flagged outputs show draft totals with same-sentence labels incl. zero; unsupported families (I04-I09) withhold classified totals/tables with explicit unavailable explanation AND unavailable section state (never usable-draft), accepted coverage tallies suppressed in draft views; draft renderer identity v15 gated on the v2 marker (Market v14/marker-free bytes retained); receipt wording states no-use with history preserved; legacy flag-absent output byte-identical. |
| U-11 | ESCALATED | No κ statistic, no second-model cross-check, no release-count claim; unresolved disagreements stay explicit and block release (ratios null, CODING_PENDING/CORPUS_CODING_PENDING retained). |
| G-01 | DONE | This table (U-03 PARTIAL with explicit delivered/remainder, U-11 ESCALATED). |
| G-02 | PENDING until exact-head CI | Typecheck + focused/affected suites exit 0 (listed above); no local full suite (no slot); no waiver. |
| G-03 | N/A | No frontend changes. |
| G-04 | DONE | Generation touched only listed files; prompt v2 frozen fixture + v3; explicit v1/v2 snapshot branches; no hand-maintained type duplication. |
| G-05 | DONE | `git diff --check` clean; changed paths are SYNC-4 owned or lease-granted; no unrelated edits. |
| G-06 | DONE | Synthetic fixtures only; no secrets, paths, IPs, runtime data. |
| G-07 | DONE | No provider/model calls in builders or tests (fake transports only where the harness requires). |
| G-08 | DONE | Draft copy is plain Vietnamese; no provider names. |
| G-09 | DONE | Missing/unreadable/excluded/unclear/disagreement kept distinct from zero; counts never summed across kinds. |
| G-10 | DONE | Flag-absent output byte-identical (legacy keys absent, legacy HTML without draft copy); v1 digest + v2 frozen fragment shas pinned; v3 delta limited to draft fragments; retained-version replay paths untouched; v1 revision/snapshot branches byte-exact (legacy AJV assertions). |
| G-11 | DONE | Updated (not weakened): sync3 v2-embeds-current pin → v2-frozen/v3-live pins; prompt-retention dispatch v2 → v3; reports-test snapshot annotation → v1 branch. No other assertions touched. |
| G-12 | DONE | This handoff with per-item evidence. |
| G-13 | N/A | No keyword collection in SYNC-4 (read-only count eligibility). |
