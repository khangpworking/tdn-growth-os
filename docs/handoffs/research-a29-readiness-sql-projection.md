# Research A29 handoff: exact SQLite readiness projection

## Delivery status

- Branch: `feature/research-a29-normalized-observation-ledger`
- Parent implementation: Research A28 at
  `89281a63e2793070ec5881a07421ea401cbf7654`
- Draft PR: [#91](https://github.com/khangpworking/tdn-growth-os/pull/91)
- Implementation SHA: `ad85711218e49d5a25390c8a450d0a8a0b97a391`
- Linux Check: [PASS, 602/602](https://github.com/khangpworking/tdn-growth-os/actions/runs/36678369480)
- Research report preview: [PASS](https://github.com/khangpworking/tdn-growth-os/actions/runs/36678369345)

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

- Existing readiness unit owner covers present, absent and invalid projection
  states plus the exact dataset-origin evidence reference.
- Existing report API integration owner materializes A12 before opening the
  query-only API and verifies artifact plus origin references.
- Full Linux repository check passed: 602 tests, 0 failures.
- Research report preview workflow passed.
- `git diff --check` passed and no Windows test, build or typecheck was run.
