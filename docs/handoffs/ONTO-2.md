# Handoff — ONTO-2

Updated: 2026-10-08
Worktree/branch: assigned Orca worktree; `pkg/ONTO-2-open-ontologies`.
Completed: ontology implementation, 12 independent fixtures, masked cold review,
throwaway guide exercises and pre-fix regressions. All shapes remain proposed.
Changed paths: `ontology/`, `docs/runbooks/ontology-use-cases-and-maintenance.md`,
`docs/handoffs/ONTO-2.md` only. No dependency manifest or configuration change.
Evidence (commands, results, relevant revision): fetched base
`22af557d326c2523c884fee81a129eb4b1bf96f2`; unchanged baseline 49/49.
Final implementation receipt and complete dataset table follow in the evidence commit.
Unresolved: escaped tab/newline/CR data cannot be judged by the installed verified
checker; expected REJECT remains unchanged. Wider semantic/authenticity limits
are explicitly ESCALATED in each review. Repository G-2 is under investigation.
Next action: record final implementation SHA receipts, complete gates, push own
branch and open draft PR. No merge or deployment.
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
| A-06 | ESCALATED | Final implementation receipt pending this implementation commit; supported matrix already 86/87 with one explicit escalation, independent 12/12. |
| A-07 | DONE | Guide receipts 8/8, independent guide fixtures and masked cold review; ten corrections listed in runbook §3.9. Throwaway artifacts deleted. |
| A-08 | ESCALATED | Implementation prepared; final evidence commit, push and draft PR follow. |

## Gate self-check

IDs G-2…G-6, G-12/G-13 map to G-02…G-06, G-12/G-13 in
`docs/tasks/research-batch-2-packages.md` (no separate ontology gate list found).

| Gate | Status | Evidence |
|---|---|---|
| G-2 | ESCALATED | Initial environment lacked dependencies and used Node 22. Restored dependencies without manifest edits and used Node 24.15.0; typecheck passed. Repository tests still under investigation. |
| G-3 | N/A | No frontend changes. |
| G-4 | N/A | No contract changes. |
| G-5 | DONE | Allowed paths only; diff whitespace check clean. Final committed check follows. |
| G-6 | DONE | Synthetic data only; changed-file scan and manual inspection; no keys, provider configuration, runtime data or real commercial evidence. |
| G-12 | DONE | All template fields, checklist and final dataset table in this handoff. |
| G-13 | N/A | No keyword collection. |

## Retry accounting

G-2 round 1: typecheck exit 1 with missing node_modules. Changed environment only:
`npm ci --ignore-scripts --no-audit --no-fund`, Node 24.15.0, native dependency rebuild.
G-2 round 2: typecheck passed; full repository suite reported failures beyond its
four documented baseline failures. No source/test assertion was changed.
G-2 round 3: focused checks on the extra failing areas; record outcome below.
No fourth gate attempt. Tool compiler limitations and resolution are separately
recorded in `ontology/review/ONTO-2.md`; no tool process crashed.

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
