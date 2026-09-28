# Research A8 handoff: evidence-bound interpretation contract

## Scope delivered

- Accepted ADR 0005 for separate source, calculation, AI interpretation and
  human-decision layers.
- Added closed request, untrusted-output and application-owned interpretation
  artifact schemas with generated TypeScript.
- Added a pure builder that re-verifies the exact A7 source-backed bundle,
  replays the A3 packet from its exact result and catalog bytes, resolves
  citations from deterministic claims and rejects unsupported sections,
  citations, numbers, decision/regulated-authority language and invented
  provenance.
- Added a stable interpretation-content digest that excludes run ID, time,
  provider telemetry and render bytes.
- Added an offline prompt policy and one focused test owner for this boundary.

## Preserved limits

- Only sections already in `PARTIAL_DETERMINISTIC_DRAFT` with fact claims can be
  interpreted. No fifth deterministic section was added.
- The model cannot supply citation values, locators, provenance or approval.
- `evidenceLogic` is a concise user-visible explanation, not chain-of-thought.
- No provider call, credential, migration, database row, API, UI, approval,
  source collection or deployment was added.
- Report persistence migration 0029 still waits for Content Studio migrations
  0026 through 0028 to reach the same branch.

## Verification

- Contract generation: PASS locally; generation only.
- Windows test/build/typecheck: not run by policy.
- Independent static review findings closed: A3 deterministic replay, broader
  language/provenance guards, hypothesis coverage and forged-packet regression.
- Linux full repository check: PASS on implementation head `99daefd2ee9e198a743b3082a68de23a035bc323` —
  https://github.com/khangpworking/tdn-growth-os/actions/runs/36388535823
- Linux report preview: PASS on the same head —
  https://github.com/khangpworking/tdn-growth-os/actions/runs/36388535819
- `git diff --check`: PASS.

## Delivery state

Draft PR #64 remains open on `feature/research-a8-evidence-bound-interpretation`:
https://github.com/khangpworking/tdn-growth-os/pull/64

The PR is stacked on Research A1 through A7 and is not merge-ready until those
dependencies are resolved. No deployment or provider call was performed.
