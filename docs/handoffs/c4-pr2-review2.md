# Handoff — c4 PR2 delta review

Updated: 2026-10-24
Worktree/branch: arch-c4-2-names-callers / arch/c4-2-names-callers
Completed: reviewed only c7a02cb6..HEAD; repaired the saved-PDF copied-text blocker in the e52f0344 delta. No push or GitHub actions.
Completed: PDF numeric character references now pass the citation name check before registration; unsafe excerpts are withheld individually without changing retained evidence.
Changed paths: src/modules/analysis/research-automation/pdf-excerpt.ts; tests/unit/c4-report-language-callers.test.ts; this handoff.
Evidence (commands, results, relevant revision): the extended existing PDF regression failed on e52f0344 with PROVIDER_NAME_IN_LABEL; final npm run typecheck and six directly affected test files passed (106 tests, zero failures/cancellations). Logs: ~/arch-2410/c4-2/review2-*.log.
Evidence: restoring only the single withheld mapping identifier recovers historical Insight HTML SHA-256 da43f057f66c821e4c21369a146c7e0277472db8f813c80ec4c5613a12688002; source/semantic/Market hashes remain pinned.
Evidence: copied quote/context projections retain record counts, source identities and withholding notes; TikTok URL projections retain citation identity and replay checks. Authored names still fail the Insight gate.
Evidence: paid-lane files, cost/retry, service.ts, U13, U32, shared matching and glossary files are unchanged by the reviewed fixes. Task test process group exited without leftovers.
Unresolved: none. Local checks used Node v22.23.2; the repository declares Node 24.15.0.
Next action: coordinator reads ~/arch-2410/c4-2/review2.md and runs supported-runtime release CI.
Business decisions pending: none; owner Q1–Q5 apply.
