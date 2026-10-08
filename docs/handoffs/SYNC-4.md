# Handoff — SYNC-4 bounded draft-count eligibility (U-03)

Updated: 2026-10-08
Worktree/branch: `khangpworking/ultimate-impl-sync6-opencode` (base: PR164 `d7ad11f` merged to main, merged normally into this branch)
Completed: U-03 draft counts from retained AI-proposed coding without owner receipts, behind an opt-in `draft-counts-v1` flag; same-sentence draft labels in the report renderer; prompt v3 with frozen v1/v2 bytes; synthetic regressions. U-11 remains ESCALATED (no κ statistic anywhere).
Changed paths:
- `contracts/analysis/located-insight-methods.schema.json` (sole-lease edit; released)
- `contracts/analysis/located-insight-methods.generated.ts` + cascade dependents (`automation-insight-coding-snapshot`, `automation-insight-model`, `research-automation-insight-coding-api` generated only)
- `contracts/analysis/automation-insight-model.schema.json` (prompt enum +v3; strictly necessary new version)
- `src/modules/analysis/located-insight-methods.ts` (I02-scoped draft eligibility in `summary()`)
- `src/modules/analysis/insight-corpus-counts.ts` (per-code draft counts in `summarize()`)
- `src/modules/analysis/report-located-insight-pages.ts` (draft tables with same-sentence labels)
- `src/modules/analysis/research-automation/insight-model-execution.ts` (frozen v2 fragments, v3 dispatch)
- `src/modules/analysis/research-automation/insight-model-prompt-v2-schemas.json` (new frozen fixture)
- `tests/unit/sync4-draft-counts.test.ts` (new, 5 tests)
- `tests/unit/sync3-version-semantics.test.ts` (v2-frozen/v3-live pins)
- `tests/integration/research-insight-prompt-retention.test.ts` (new dispatch v3)
Evidence (commands, results, relevant revision):
- Task-provided Node 24.15.0 / npm 11.12.1 runtime (per-command PATH).
- Pre-change hashes captured post-merge: corpus-counts `de29a900…`, located-methods `dd37c1da…` (located 1.1), selected-projection `385204b0…`, located pages `af2a0a69…`, located schema `3472d702…`, v1 prompt digest `b7fca3c3…` (pinned in test).
- `npm run contracts:generate` touched only listed files; `git diff --check` clean.
- `node scripts/typecheck.mjs` exit 0.
- Focused suites exit 0: new `sync4-draft-counts` 5/5 (union draft totals, disposition gate, labels, prompt freeze); affected `located-insight-methods`, `insight-corpus-counts`, `report-located-insight-pages`, `sync3-version-semantics`, prompt-retention integration — 26/26 total.
- No provider/model calls; full local suite not run (no slot grant); exact-head hosted CI is the gate.
Unresolved:
- U-11 family-level multi-code Cohen κ: ESCALATED (no statistic invented; unresolved cross-check yields no release counts — ratios stay null, blockers retained).
- Real receipt-free draft flow needs the owning service to opt the flag into new descriptors (`located-review-bridge.ts` ~line 158); queued narrow request sent to Sol/SYNC-2, no shared files touched.
- Exact-head CI on the draft head is the gate (G-02 PENDING).
Next action: Astra independent review; coordinator owns ready/merge only after exact-head review and green full GitHub check. No worker merge.
Business decisions pending: none. Owner adoption stays optional recorded authority; AI proposals are never rewritten to approved.

## Checklist evidence

| ID | Status | Evidence |
|---|---|---|
| U-03 | DONE (bounded) | Draft totals = eligible accepted + eligible pending proposals, deduped by stable record identity, on INCLUDED records with matching eligible CODED dispositions (PENDING/UNCLEAR/UNCODED/missing dispositions excluded); disagreements excluded everywhere; provenance never rewritten (asserted verbatim); accepted counts/ratios/pending tallies/blockers unchanged; ratios stay null without COMPLETE; every rendered draft number carries `đề xuất, chờ chủ duyệt` in the same sentence (asserted in HTML); legacy flag-absent output byte-identical (asserted key absence + old HTML without draft copy). |
| U-11 | ESCALATED | No κ statistic, no second-model cross-check, no release-count claim; unresolved disagreements stay explicit and block release (ratios null, CODING_PENDING/CORPUS_CODING_PENDING retained). |
| G-01 | DONE | This table (U-03 DONE bounded, U-11 ESCALATED). |
| G-02 | PENDING until exact-head CI | Typecheck + 26 focused tests exit 0; no local full suite (no slot); no waiver. |
| G-03 | N/A | No frontend changes. |
| G-04 | DONE | Generation touched only listed files; prompt v2 frozen fixture + v3; no hand-maintained type duplication. |
| G-05 | DONE | `git diff --check` clean; changed paths are SYNC-4 owned or lease-granted; Sol-owned service/reports/model/descriptive files untouched. |
| G-06 | DONE | Synthetic fixtures only; no secrets, paths, IPs, runtime data. |
| G-07 | DONE | No provider/model calls in builders or tests. |
| G-08 | DONE | Draft copy is plain Vietnamese; no provider names. |
| G-09 | DONE | Missing/unreadable/excluded/unclear/disagreement kept distinct from zero; counts never summed across kinds. |
| G-10 | DONE | Flag-absent output byte-identical (legacy keys absent, legacy HTML without draft copy); v1 digest + v2 frozen fragment shas pinned; v3 delta limited to draft fragments; retained-version replay paths untouched. |
| G-11 | DONE | Updated (not weakened): sync3 v2-embeds-current pin → v2-frozen/v3-live pins; prompt-retention dispatch v2 → v3. No other assertions touched. |
| G-12 | DONE | This handoff with per-item evidence. |
| G-13 | N/A | No keyword collection in SYNC-4 (read-only count eligibility). |
