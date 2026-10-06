# B1-A: exact Metric rule adoption

Date: 2026-10-04. GPT implementation after terminal Claude quota/ZCode timeout.
Unreleased worktree on `0116091fd5dc0902594f92d969dfb3ee0732c9c8`, existing PR #110.
No commit, push, merge, live migration, provider/model call or deployment in this slice.

## Delivered

- POST `/owner-api/workspaces/:workspaceId/research-automation/runs/:runId/metric-rule-adoptions`
- GET the corresponding `/api/` collection or `/:adoptionId`.
- Canonical closed request/artifact/receipt schema and Linux-generated types.
- Analysis-owned `AutomationMetricRuleAdoptions`, called by the actual research
  service/API. No generic approval engine or new worker.
- Migration 0043 stores immutable rule adoption, exact canonical request,
  start/scope binding, full rulebook digest, trusted OWNER and time.
  Existing migrations are not edited by this slice.

Adoption requires the already verified, confirmed research scope and the exact
run revision for a new request. The rulebook includes four classification
definitions, group keys/definitions, ID and revision. UNKNOWN is excluded from
WIDE. This does not approve any industry-specific rulebook automatically.

The existing HTTP token/origin gate supplies the actor, not request fields.
Same request returns the original receipt/time. A different request cannot
replace the same run/rule ID/revision. A new explicit rule revision is stored
separately; historical reads use exact adoption IDs, never implicit latest.
Read projections omit actor IDs and internal artifact hashes/paths.

## Integrity and publication

The owner verifies the run/start/scope dependencies, canonical adoption bytes,
row projections, full manifest metadata, content-addressed path and exact size.
The immutable row reconstructs only its own registered bytes for an authorized
exact retry when the canonical file is genuinely missing. Read-only GET does
not repair anything. Changed requests and corrupt present files do not publish.

Writes use the existing database mutex and an SQLite write transaction.
Artifact staging is request-owned; only the exact committed digest is published.
No root sweep or canonical-file deletion. First-storage timestamps remain
unchanged on retry. This artifact includes a unique adoption ID and its original
adoption time, so recovery also verifies its exact original manifest times.

## Evidence

Linux scratch: `~/.cache/tdn-p1-isolation-20261003-ZVXHsB`.
This is not the active operator checkout/database.

- Contract generation and backend typecheck: PASS.
- Focused HTTP adoption journey: PASS.
- Final affected HTTP, migration, Foundation and Content boundary suites:
  **94/94 PASS**. This includes the adoption journey, not 94 additional tests.
- `git diff --check`: PASS.
- v42 to v43 preserves previous migration ledger and existing evidence;
  rerunning applies zero migrations.
- Synthetic HTTP journey covers unconfirmed/stale scope, unauthorized and
  forged actor/time requests, duplicate group keys, exact retry, immutable
  revision conflict, explicit revision 2, historical read after reopening,
  read-only rejection/logical equality, missing-artifact recovery,
  corrupt-file refusal and empty request staging.
- All tables except adoption and artifact manifests are compared before/after
  adoption. No source, assignment, provider call, method or report is created.
- Recovered synthetic artifact mode: 0600.

Initial checks exposed a test snapshot incorrectly assuming every table has a
rowid, and incorrect manifest column names in the new owner. Both were corrected
before PASS. The final affected run also updates a stale v10-upgrade expected
list to include migrations 0042 and 0043; historical checksum assertions remain.

Migration 0043 SHA-256:
`e6c02db3997209a8c60682f4497da3d7b48b865ee315ff2fb3cd1b90860ddc62`.

## Not complete / next

This is one prerequisite of B1-A, **not completed M03/M04**. No rule-adoption UI,
membership proposals, batch receipts, CORE/WIDE calculation or acceptance-aware
report revision is included. Real J/T/F rules remain unadopted.

Continue with exact verified preparation/universe-bound membership proposals
and explicit selected-assignment receipts. Bind an exact adoption ID, preserve
pending versus UNKNOWN, require complete dispositions before classified math,
and use a new report pair/revision without changing historical labels or reports.
Then expose the two distinct confirmations in the existing UI. Keep independent
Insight method integration moving rather than expanding this into a generic
governance framework.
