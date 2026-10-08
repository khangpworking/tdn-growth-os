# Handoff — ONTO-1

Updated: 2026-10-08
Worktree/branch: ontology / `pkg/ONTO-1-open-ontologies`
Completed: proposed offline SHACL metadata checks for E4, L10, E12, E13 and UNKNOWN;
49 synthetic dataset checks; independent blind model review and source comparison;
RDFS smoke and installed Lean certificate check. Draft PR delivery only.
Changed paths: `ontology/`, `docs/handoffs/ONTO-1.md`.
Evidence (commands, results, relevant revision): base/main SHA
`998549072ae62b9d619ffbf645ba59b22a920d4e`; installed Open Ontologies 2.0.1,
verified Lean checker toolchain 4.33.1. `--version` was attempted and unsupported.
`./ontology/run-checks.sh`: **49/49 PASS**, comprising **11 ACCEPT** valid fixtures
and **38 REJECT** invalid fixtures, each for the intended constraint.
`bash -n ontology/run-checks.sh`, Python AST parse, `git diff --check` passed.
No application files changed, so no application test suite was run.
Unresolved: source authenticity and broader Ultimate obligations explicitly
ESCALATED in each rule's review; all shapes remain proposed. Model review is not
a domain expert or owner decision.
Next action: owner reviews the draft PR, the exact results and the bounded
translations before deciding whether to merge. No merge/deployment performed.
Business decisions pending: whether to accept these proposed metadata projections
or request stronger evidence linkage; no pipeline integration authorized here.

## Checklist evidence

| Item | Status | Evidence |
|---|---|---|
| O-01 | DONE | Resumed assigned clean worktree; branch HEAD/base is `998549072ae62b9d619ffbf645ba59b22a920d4e`. No replacement worktree or rebase. |
| O-02 | DONE | Ran help first; `--version` rejected. Actual `shacl --verified <shapes>` confirmed. `validate` is syntax-only; default SHACL skips nested constraints. Release identification and binary hash recorded in README/results. |
| O-03 | DONE | Runner exports persistent storage and passes explicit per-dataset scratch data-dir on every CLI command, plus no-connect. Load/check and smoke load/reason/query each share their own directory. |
| O-04 | DONE | README, five proposed rule shape files, valid/invalid fixtures, manifest, fixed-argv shell/Python runner and results directory. |
| O-05 | DONE | Shapes have rule IDs, proposed status, exact version-bound source line links and Vietnamese messages. UNKNOWN links the written owner decision plus Ultimate rule 1. Supplemental L10 condition shapes carry the same metadata. |
| O-06 | DONE | 11 valid and 38 invalid datasets. E4 checks cards/authors/fallback/quotes/locator/AI label/platform; L10 separately checks voice/count exclusions; E12/E13 check each trace field, attribution and status. UNKNOWN wide/hidden negatives. See exact dataset matrix below. |
| O-07 | DONE | Results Markdown and JSON contain commands, versions, executable/input/shape hashes, CLI outputs and verdict per dataset. Runner fails on any mismatch or undetermined result. |
| O-08 | DONE | Separate RDFS smoke: 2 loaded triples, 1 inferred triple, ASK true. Not reported as a business-rule check. |
| O-09 | DONE | reason --certificate ran; installed oo-cert accepted 2 asserted triples/1 derivation, exit 0, theorem OOCert.certificate_sound. No Lean build or claim about business-rule correctness. |
| O-10 | DONE | Different-model GPT-6-astra cold review of five masked inputs, retained transcript; implementer compared with Ultimate/written owner decision in five review notes. reviewed by model, not by a domain expert. Status proposed; unexpressed obligations ESCALATED. |
| O-11 | DONE | Only ontology/ and docs/handoffs/ changed. No configuration/MCP/package changes, real data, merge or deployment. |
| O-12 | DONE | This template-based handoff, ONTO-1 commit, branch push and draft PR; PR delivery evidence in final response/PR metadata. |

## Exact datasets and results

The complete per-dataset expected/actual table and responsible constraint are in
[the results table](../../ontology/results/2026-10-08-998549072ae6.md).
[Companion JSON](../../ontology/results/2026-10-08-998549072ae6.json) retains full
outputs and exact SHA-256 bindings for every dataset and shape.

Key rejections: E4 rejects two cards, four author IDs, absent fallback flag,
only four distinct fallback contents, absent AI label, missing quotes/locator
and multiple platforms. L10 rejects customer voice or counting when creator,
brand, tag-only or emoji-only is declared; corresponding excluded controls pass.
E12/E13 reject absent attribution, missing file/sheet/row, absent or invalid
value status. UNKNOWN rejects WIDE inclusion and removal from ALL.

[Review transcript](../../ontology/review/cold-review.md) and the rule-specific
notes distinguish these checks from source truth, semantic classification,
PDF tracing and unimplemented broader Ultimate obligations.
