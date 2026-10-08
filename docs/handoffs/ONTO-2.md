# Handoff — ONTO-2

Updated: 2026-10-08
Worktree/branch: assigned Orca worktree; `pkg/ONTO-2-open-ontologies`.
Completed: ontology implementation, 12 independent fixtures, masked cold review,
throwaway guide exercises and pre-fix regressions. All shapes remain proposed.
Changed paths: `ontology/`, `docs/runbooks/ontology-use-cases-and-maintenance.md`,
`docs/handoffs/ONTO-2.md` only. No dependency manifest or configuration change.
Evidence (commands, results, relevant revision): fetched base
`22af557d326c2523c884fee81a129eb4b1bf96f2`; unchanged baseline 49/49.
Implementation commit: `4ff2870998bee48b5096326d759497dbaee525ed`. Final receipt:
`ontology/results/2026-10-08-4ff2870998be.{md,json}`: 86/87 match, one ESCALATED, independent 12/12; smoke/certificate pass.
Unresolved: escaped tab/newline/CR data cannot be judged by the installed verified
checker; expected REJECT remains unchanged. Wider semantic/authenticity limits
are explicitly ESCALATED in each review.
Next action: owner reviews draft PR and explicit escalations. No merge or deployment by this worker.
Business decisions pending: none requested; no adoption. Owner-reported problems
list is empty. Domain expertise/authenticated evidence remain needed before reliance.

## Checklist evidence

| Item | Status | Evidence |
|---|---|---|
| A-01 | DONE | Exact fetched origin/main base above; branch renamed as assigned. |
| A-02 | DONE | `ontology/results/2026-10-08-22af557d326c-baseline.{md,json}`: unchanged 49/49, inference and certificate pass. |
| A-03 | ESCALATED | E12/E13 exact attribution and E13 metadata implemented; named E4 modes and persona links covered; duplicate-author removed. Space/Unicode whitespace rejected; escaped tab/newline/CR evaluator limitation remains. See per-rule reviews. |
| A-04 | DONE | 12 fixtures by GPT-6-astra; rule excerpts/vocabulary only; provenance and frozen independent manifest retained. |
| A-05 | DONE | Fresh GPT-6-astra cold reviewer, masked inputs only; E4 final flag fix re-reviewed; E12/E13 reviews recorded. reviewed by model, not by a domain expert. |
| A-06 | DONE | Final run on `4ff2870998be`: commands, hashes, expected/actual for all 87 rows in results; 86 matched and one explicitly ESCALATED. |
| A-07 | DONE | Guide receipts 8/8, independent guide fixtures and masked cold review; ten corrections listed in runbook §3.9. Throwaway artifacts deleted. |
| A-08 | DONE | This templated handoff, full dataset table, ONTO-2 commits; own-branch push and draft PR recorded below. |

## Active goal gate self-check

These are the active ONTO-2 gate meanings. The application-package gate list in `docs/tasks/research-batch-2-packages.md` does not define these outcomes. Repository application tests were extra evidence, not required by the active gates, and were not used to determine G-2.

| Gate | Status | Evidence |
|---|---|---|
| G-2 | ESCALATED | Ontology run only: unchanged baseline 49/49. Final run has 86/87 expected verdicts matched; one whitespace-only tab/newline/CR case is explicitly ESCALATED because the verified checker returns UNDETERMINED. Expected REJECT is unchanged and this case is not counted as a pass. See final result JSON. |
| G-3 | DONE | Changed-shape controls and invalid-condition cases are in the manifest and final result: E4 26/26 matched; E12 12 matched plus the G-2 escalation; E13 21/21 matched. The RDF-identical E4-duplicate-author.ttl and its manifest row were removed. No expected verdict was changed to force a pass. |
| G-4 | DONE | 12 independent cases authored by GPT-6-astra, different from the Codex shape author, from rule text/vocabulary only. All 12 expected verdicts stayed unchanged and all 12 matched. See independent manifest, provenance and final result. |
| G-5 | DONE | Fresh GPT-6-astra blind reviews cover each changed shape E4, E12 and E13 using masked inputs without rule IDs. E4's final flag change was re-reviewed. All shapes remain `proposed`; each review says “reviewed by model, not by a domain expert.” |
| G-6 | DONE | Executed guide sections 3.3, 3.4 and 3.5. Throwaway add/change-rule exercise, commands and verdicts are recorded; temporary shape, data and state were deleted. Ten corrections are listed in runbook §3.9. |
| G-12 | DONE | Synthetic ontology data only; no secrets, machine paths, IPs or real commercial data in changed files. No provider calls, integration install, agent registration/configuration change or OpenWiki CI workflow. package.json and lockfile unchanged; no merge or deployment. |
| G-13 | DONE | This handoff has a row for every A-01..A-08 and expected/actual rows for every ontology dataset. The assigned branch is pushed, draft PR #181 is open, and final git status is clean. |

The repository application suite was additional evidence only. It had failures beyond its documented baseline; those results are neither required by these active gates nor the basis for G-2. Sanitized counts are in `ontology/results/2026-10-08-repository-gates.json`.

## G-2 evidence accounting

No fourth ontology run was made. G-2 uses the ontology receipts only: baseline 49/49; final 86/87 matched, with one explicitly UNDETERMINED/ESCALATED case. Application typecheck and repository test outcomes are extra evidence and are not used for G-2.

## Test changes and scope

Only deleted test: `ontology/tests/invalid/E4-duplicate-author.ttl` and its manifest
row, explicitly authorized because repeated RDF literals collapse and it duplicated
E4-four-authors. Existing negative controls retain expected booleans. Fixture
metadata was updated to the new schema so each old negative still isolates its
original condition. Independent expected results were never changed.

Four pre-fix CLI controls prove the original shapes accepted blank file, wrong
attribution, absent indicatorCode and blank author; new shapes reject all four.
Guide receipts contain exact hashes and verdicts. Synthetic quotes are not source
evidence or real customer statements.

Guide corrections: exercised-vs-proposed scope; masked reviewer inputs; negative
path/sourceShape selectors; task scope/draft-only PR; evidence-based change trigger;
rehearsal/retirement behavior; complete offline/telemetry flags; real HEAD/date and
baseline naming; named mode verdicts instead of ignored messages; checker subset
and explicit unsupported-data escalation. Full list: runbook §3.9.

## Every final dataset — expected vs actual

| Dataset | Expected | Actual | Result |
|---|---|---|---|
| tests/valid/E4-identified.ttl | ACCEPT | ACCEPT | PASS |
| tests/valid/E4-unverified.ttl | ACCEPT | ACCEPT | PASS |
| tests/invalid/E4-two-cards.ttl | REJECT | REJECT | PASS |
| tests/invalid/E4-four-authors.ttl | REJECT | REJECT | PASS |
| tests/invalid/E4-missing-label.ttl | REJECT | REJECT | PASS |
| tests/invalid/E4-missing-attribute-quote.ttl | REJECT | REJECT | PASS |
| tests/invalid/E4-missing-card-quote.ttl | REJECT | REJECT | PASS |
| tests/invalid/E4-missing-locator.ttl | REJECT | REJECT | PASS |
| tests/invalid/E4-cross-platform.ttl | REJECT | REJECT | PASS |
| tests/invalid/E4-missing-flag.ttl | REJECT | REJECT | PASS |
| tests/invalid/E4-four-contents.ttl | REJECT | REJECT | PASS |
| tests/valid/L10-review.ttl | ACCEPT | ACCEPT | PASS |
| tests/valid/L10-sales.ttl | ACCEPT | ACCEPT | PASS |
| tests/invalid/L10-creator.ttl | REJECT | REJECT | PASS |
| tests/valid/L10-creator-excluded.ttl | ACCEPT | ACCEPT | PASS |
| tests/invalid/L10-brand.ttl | REJECT | REJECT | PASS |
| tests/valid/L10-brand-excluded.ttl | ACCEPT | ACCEPT | PASS |
| tests/invalid/L10-tagOnly.ttl | REJECT | REJECT | PASS |
| tests/valid/L10-tagOnly-excluded.ttl | ACCEPT | ACCEPT | PASS |
| tests/invalid/L10-emojiOnly.ttl | REJECT | REJECT | PASS |
| tests/valid/L10-emojiOnly-excluded.ttl | ACCEPT | ACCEPT | PASS |
| tests/invalid/L10-missing-source.ttl | REJECT | REJECT | PASS |
| tests/valid/E12-complete.ttl | ACCEPT | ACCEPT | PASS |
| tests/invalid/E12-missing-attribution.ttl | REJECT | REJECT | PASS |
| tests/invalid/E12-missing-file.ttl | REJECT | REJECT | PASS |
| tests/invalid/E12-missing-sheet.ttl | REJECT | REJECT | PASS |
| tests/invalid/E12-missing-row.ttl | REJECT | REJECT | PASS |
| tests/invalid/E12-invalid-status.ttl | REJECT | REJECT | PASS |
| tests/invalid/E12-missing-status.ttl | REJECT | REJECT | PASS |
| tests/valid/E13-complete.ttl | ACCEPT | ACCEPT | PASS |
| tests/invalid/E13-missing-attribution.ttl | REJECT | REJECT | PASS |
| tests/invalid/E13-missing-file.ttl | REJECT | REJECT | PASS |
| tests/invalid/E13-missing-sheet.ttl | REJECT | REJECT | PASS |
| tests/invalid/E13-missing-row.ttl | REJECT | REJECT | PASS |
| tests/invalid/E13-invalid-status.ttl | REJECT | REJECT | PASS |
| tests/invalid/E13-missing-status.ttl | REJECT | REJECT | PASS |
| tests/valid/UNKNOWN-retained.ttl | ACCEPT | ACCEPT | PASS |
| tests/invalid/UNKNOWN-wide.ttl | REJECT | REJECT | PASS |
| tests/invalid/UNKNOWN-hidden.ttl | REJECT | REJECT | PASS |
| tests/invalid/L10-creator-voice-only.ttl | REJECT | REJECT | PASS |
| tests/invalid/L10-creator-count-only.ttl | REJECT | REJECT | PASS |
| tests/invalid/L10-brand-voice-only.ttl | REJECT | REJECT | PASS |
| tests/invalid/L10-brand-count-only.ttl | REJECT | REJECT | PASS |
| tests/invalid/L10-tagOnly-voice-only.ttl | REJECT | REJECT | PASS |
| tests/invalid/L10-tagOnly-count-only.ttl | REJECT | REJECT | PASS |
| tests/invalid/L10-emojiOnly-voice-only.ttl | REJECT | REJECT | PASS |
| tests/invalid/L10-emojiOnly-count-only.ttl | REJECT | REJECT | PASS |
| tests/invalid/E4-missing-attribute-locator.ttl | REJECT | REJECT | PASS |
| tests/invalid/E12-wrong-attribution.ttl | REJECT | REJECT | PASS |
| tests/invalid/E12-blank-file.ttl | REJECT | REJECT | PASS |
| tests/invalid/E12-blank-sheet.ttl | REJECT | REJECT | PASS |
| tests/invalid/E12-blank-row.ttl | REJECT | REJECT | PASS |
| tests/invalid/E13-wrong-attribution.ttl | REJECT | REJECT | PASS |
| tests/invalid/E13-blank-file.ttl | REJECT | REJECT | PASS |
| tests/invalid/E13-blank-sheet.ttl | REJECT | REJECT | PASS |
| tests/invalid/E13-blank-row.ttl | REJECT | REJECT | PASS |
| tests/invalid/E13-blank-indicatorName.ttl | REJECT | REJECT | PASS |
| tests/invalid/E13-missing-indicatorName.ttl | REJECT | REJECT | PASS |
| tests/invalid/E13-blank-indicatorCode.ttl | REJECT | REJECT | PASS |
| tests/invalid/E13-missing-indicatorCode.ttl | REJECT | REJECT | PASS |
| tests/invalid/E13-blank-year.ttl | REJECT | REJECT | PASS |
| tests/invalid/E13-missing-year.ttl | REJECT | REJECT | PASS |
| tests/invalid/E13-blank-datasetUpdateDate.ttl | REJECT | REJECT | PASS |
| tests/invalid/E13-missing-datasetUpdateDate.ttl | REJECT | REJECT | PASS |
| tests/invalid/E4-blank-platform.ttl | REJECT | REJECT | PASS |
| tests/invalid/E4-blank-quote.ttl | REJECT | REJECT | PASS |
| tests/invalid/E4-blank-locator.ttl | REJECT | REJECT | PASS |
| tests/invalid/E4-blank-author.ttl | REJECT | REJECT | PASS |
| tests/invalid/E4-blank-content.ttl | REJECT | REJECT | PASS |
| tests/invalid/E12-mixed-whitespace-file.ttl | REJECT | UNDETERMINED | ESCALATED |
| tests/invalid/E4-foreign-author.ttl | REJECT | REJECT | PASS |
| tests/invalid/E4-foreign-card.ttl | REJECT | REJECT | PASS |
| tests/invalid/E4-blank-attribute-quote.ttl | REJECT | REJECT | PASS |
| tests/invalid/E4-blank-attribute-locator.ttl | REJECT | REJECT | PASS |
| tests/invalid/E4-conflicting-flag.ttl | REJECT | REJECT | PASS |
| tests/independent/e4-author-ids-valid.ttl | ACCEPT | ACCEPT | PASS |
| tests/independent/e4-author-ids-invalid.ttl | REJECT | REJECT | PASS |
| tests/independent/e4-unverified-valid.ttl | ACCEPT | ACCEPT | PASS |
| tests/independent/e4-unverified-invalid.ttl | REJECT | REJECT | PASS |
| tests/independent/l10-valid.ttl | ACCEPT | ACCEPT | PASS |
| tests/independent/l10-invalid.ttl | REJECT | REJECT | PASS |
| tests/independent/e12-valid.ttl | ACCEPT | ACCEPT | PASS |
| tests/independent/e12-invalid.ttl | REJECT | REJECT | PASS |
| tests/independent/e13-valid.ttl | ACCEPT | ACCEPT | PASS |
| tests/independent/e13-invalid.ttl | REJECT | REJECT | PASS |
| tests/independent/unknown-valid.ttl | ACCEPT | ACCEPT | PASS |
| tests/independent/unknown-invalid.ttl | REJECT | REJECT | PASS |

The 49-row unchanged baseline table is retained in its separate baseline receipt.

## Every guide/regression dataset

| Dataset | Shape version | Expected | Actual | Result |
|---|---|---|---|---|
| guide-v1 | v1 | ACCEPT | ACCEPT | PASS |
| guide-v2 | v1 | REJECT | REJECT | PASS |
| guide-v1 | v2 | REJECT | REJECT | PASS |
| guide-v2 | v2 | ACCEPT | ACCEPT | PASS |
| E12-blank-file | before-fix | ACCEPT | ACCEPT | PASS |
| E12-wrong-attribution | before-fix | ACCEPT | ACCEPT | PASS |
| E13-missing-indicatorCode | before-fix | ACCEPT | ACCEPT | PASS |
| E4-blank-author | before-fix | ACCEPT | ACCEPT | PASS |

| Smoke dataset | Expected | Actual | Result |
|---|---|---|---|
| tests/smoke.ttl | 2 loaded; 1 inferred; ASK true; certificate exit 0 | 2 loaded; 1 inferred; ASK true; certificate exit 0 | PASS |

## Delivery

Implementation: `4ff2870998bee48b5096326d759497dbaee525ed`.
Evidence: `f6fd705` (`ONTO-2: record final verdict matrix and escalated repository gate`).
Draft PR: https://github.com/khangpworking/tdn-growth-os/pull/181
Verified draft=true, base=main, head=pkg/ONTO-2-open-ontologies.
Only the assigned work branch was pushed. Final delivery-receipt commit records
this URL; all tested shape/fixture/runner hashes remain identical. No merge/deploy.
