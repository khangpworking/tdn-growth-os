# PageIndex Cloud connector, 2026-10-04

## Result

Implemented an opt-in backend and real CLI over existing verified source-package readers. Not deployed, not wired into live UI, and not an automatic report-claim admission mechanism. No new live PageIndex call was made during implementation. A separate prompt benchmark ran under its own authorization and does not share this connector's budget.

## Owned changes

- `contracts/analysis/pageindex-cloud-query.{schema.json,generated.ts}`; one new entry in the existing contract generator.
- `src/modules/analysis/pageindex-cloud.ts`.
- `scripts/query-pageindex-cloud.ts`, `scripts/read-pageindex-pdf.py`, optional hash-pinned `scripts/requirements-pageindex.txt`.
- One `research:pageindex:query` package script; no Node package/lockfile change.
- One connector unit test file and one CLI integration owner test.
- Full Linux CI setup of the optional pinned PDF parser; existing validation-scope policy unchanged.
- Task, retrieval architecture and status documentation.

The worktree already contains substantial unrelated research work. This handoff does not claim ownership of those diffs, migrations or generated files. No reset/stash/clean, commit, push, PR or merge was performed.

## Proof actually run

Linux WSL Ubuntu, Node 24.15.0, installed project lockfile in a separate scratch copy:

- Canonical new-contract generation on Linux, using existing generator options.
- Strict TypeScript, noUncheckedIndexedAccess/exactOptionalPropertyTypes, over new connector, CLI, tests and their transitive production imports: PASS.
- Focused connector plus actual CLI tests: 6/6 PASS with pinned `pypdf` 6.19.0.
- Private output 0700/0600, matching receipt digest, exact retained PDF extraction and byte-preserving SQLite reads: PASS.
- Existing completed/ambiguous attempt directory cannot redispatch: PASS.
- Literal/escaped provider key echo, wrong source/document/citation/block, altered units, empty normalized quote and missing evidence cases: PASS.
- Workflow YAML parsing and complete step definitions: PASS. Final-head GitHub execution remains unrun.

Tests use a mocked external transport, not a mocked PDF parser/database. They prove the application-owned contract, not vendor model quality. No Windows project test, build or typecheck was run. No full repository check, final-head GitHub CI, independent model review or Fedora acceptance is claimed.

## Safety and limitations

The vendor does not attest the uploaded document SHA-256. The supplied Cloud identity is operator-bound and checked against metadata, while returned quote text is compared locally to exact TDN bytes. These are distinct checks, not a claim of full Cloud-to-file identity proof. Source period, semantic entailment, source coverage, bounding-box pixels and model accuracy are not certified by local text matching.

Raw answers and candidates remain UNREVIEWED outside Git. No historical report, source, calculation, decision, database row or live process is changed. Output failures leave an attempt record for reconciliation. There is no automatic indexing, paid retry, alternative-provider/model fallback, WeKnora/OpenViking installation or private document upload.

Next release scope: independent review + integrated Linux release gate; then a consented upload/binding lifecycle and UI claim-mapping slice, followed by separately authorized Fedora deployment. The existing four-layer evidence boundary and A46 citation verifier remain authoritative.
