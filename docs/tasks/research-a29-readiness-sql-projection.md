# Research A29: bind readiness to the exact SQLite projection

## Objective

Require `normalized-metric-rows` in exact-version 30-section readiness to
replay the immutable row-queryable SQLite projection introduced by Research
A12. Artifact presence alone is not proof that normalized rows are available
for bounded calculations.

## Required behavior

- Name an explicit report ID and version; never infer latest.
- Read through `NormalizedMetricObservationStore`, not direct SQL.
- Replay the full report version and exact `normalized-input.json` artifact.
- Reconstruct canonical normalized input from SQLite and verify its membership,
  lineage and bytes.
- Return `PRESENT` only when the artifact and projection digests agree.
- Return `ABSENT` when no exact report/version dataset origin exists.
- Return `INVALID` when projection, membership, lineage or byte replay fails.
- Cite both the immutable artifact and exact dataset-origin record when present.

## Boundaries

- Reuse migration `0031_analysis_normalized_metric_observations.sql` and the A12
  store. Do not create a second ledger or rewrite history.
- The content-addressed artifact remains authoritative; SQLite is its query
  projection, not an independent evidence source.
- Preserve missing separately from observed zero, retain `UNKNOWN`, and keep
  WIDE membership version-bound.
- Add no calculation, section, claim, chart, interpretation, human decision,
  provider collection, import path or write UI.
- Deterministic section coverage remains 7/30.

## Verification ownership

- Extend the existing A28 readiness unit owner with `PRESENT`, `ABSENT` and
  `INVALID` projection states plus the dataset-origin evidence reference.
- Extend the existing report read-API integration owner to materialize A12 and
  verify both evidence references.
- Keep A12 tests as the sole owners of schema, row fidelity, immutability and
  idempotency behavior.
- Use Linux CI and the report-preview workflow as release gates. Do not run
  tests, builds or typechecks on Windows.
