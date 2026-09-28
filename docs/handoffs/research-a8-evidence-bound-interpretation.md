# Research A8 handoff: evidence-bound interpretation contract

## Scope delivered

- Accepted ADR 0005 for separate source, calculation, AI interpretation and
  human-decision layers.
- Added closed request, untrusted-output and application-owned interpretation
  artifact schemas with generated TypeScript.
- Added a pure builder that re-verifies the exact A7 source-backed bundle,
  resolves citations from A3 deterministic claims and rejects unsupported
  sections, citations, numbers and authority language.
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
- Linux focused/full CI and independent static review: pending delivery.

## Delivery state

Local implementation on `feature/research-a8-evidence-bound-interpretation`.
Final commit, draft PR, Linux evidence and exact handoff comment remain pending.
