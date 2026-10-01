# Research A32 handoff: closed M03 recipe

- Added closed request and verified metric-set contracts for M03.
- Bound calculation to exact A30 preparation, exact A31 readiness and exact
  catalog bytes.
- Reused `metric-scope-v1`; no parallel arithmetic implementation was added.
- Preserved missing/zero/non-exact state, explicit scope membership, source
  lineage and the frozen UNKNOWN-exclusion policy for WIDE.
- Added read-only/query-only CLI `research:metric:m03` with outside-Git,
  owner-only, no-overwrite output.
- Added one behavioral test owner for the new A30 → A31 → A32 boundary; existing
  calculator tests remain the arithmetic owner.

This is not a completed M03 report section. It creates the exact computed data
that later chart and evidence-bound narrative steps must share.
