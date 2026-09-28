# Research A12: exact normalized observations in SQLite

## Objective

Materialize the exact `normalized-input.json` member of an immutable report
version into row-queryable SQLite without changing its authority or meaning.
The content-addressed artifact remains authoritative; SQL is a verified
projection for later section calculations and evidence navigation.

## Required behavior

- Select an explicit report ID and version. Never infer the latest report.
- Read `normalized-input.json` only through the verified report reader.
- Key one dataset by the exact normalized-input SHA-256.
- Preserve source order, evidence family, role and provenance basis.
- Preserve every record identity, exact decimal integer string, missing versus
  observed zero, precision, displayed value, label state and source locator.
- Bind each report/version origin to its exact source-package lineage.
- Reject references to artifacts outside the dataset source membership.
- Freeze the dataset, source rows, observations and origin links after insert.
- Verify reconstructed canonical bytes against the immutable artifact on every
  read. Exact retry returns the same identity with zero mutations.
- Wire the offline report-version command so newly created versions also have
  a queryable projection and receipt.

## Four-layer boundary

This task deepens layer 1 and layer 2 only. It adds no interpretation, decision,
provider call or report conclusion. Queryable rows do not become independent
evidence and do not strengthen provider provenance.

## Explicit exclusions

- No AI interpretation or human review record.
- No new report section method, chart, dashboard control or API route.
- No Kalodata/Metric join, entity inference or period reconciliation.
- No live source import, provider call, deployment or runtime migration.
- No replacement of immutable source/report artifacts with SQL rows.

## Verification ownership

- One integration test owns materialization, exact replay, missing-versus-zero,
  timezone preservation, immutability and exact retry.
- The existing CLI integration test owns command wiring and persisted counts.
- One migration test owns v30 to v31 upgrade and idempotent rerun.
- Existing A1-A11 tests continue to own calculation formulas, source mapping,
  report replay, API and UI. A12 does not duplicate them.
- Linux CI is the release gate. Windows tests, builds and typechecks are not run.
