# Research A29 handoff: exact SQLite readiness projection

## Delivery status

- Branch: `feature/research-a29-normalized-observation-ledger`
- Parent implementation: Research A28 at
  `89281a63e2793070ec5881a07421ea401cbf7654`
- Draft PR: pending
- Linux CI and report-preview verification: pending

## Delivered scope

- `normalized-metric-rows` is present only after exact A12 projection replay.
- Missing exact report/version origin is absent rather than silently accepted.
- Projection, lineage or reconstructed-byte drift is invalid.
- Positive readiness cites `normalized-input.json` and the exact
  `analysis_metric_dataset_origins` record.
- The read API opens SQLite query-only and uses the owning A12 store.

## Preserved boundaries

- No migration, second normalized-row ledger or direct readiness SQL.
- The immutable artifact remains authoritative; SQLite is a verified query
  projection.
- No calculation, section, chart, claim, AI interpretation, review decision,
  provider call or external action was added.
- Deterministic coverage remains 7/30.

## Verification

- Existing readiness unit owner: pending Linux CI.
- Existing report API integration owner: pending Linux CI.
- Full repository check: pending Linux CI.
- Report preview: pending Linux CI.
