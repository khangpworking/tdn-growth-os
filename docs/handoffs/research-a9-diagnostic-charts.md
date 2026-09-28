# Research A9 handoff: deterministic M03/M04 diagnostic charts

## Scope delivered

- Extended the verified chart projection with M03 membership sensitivity and
  M04 group-composition/top-shop-removal diagnostics.
- Added exact Result pointers, row membership, ratio lineage, Result digest and
  explicit limits to each diagnostic.
- Rendered the diagnostics in the existing private HTML evidence report with
  direct drill-down links.
- Advanced the internal chart contract to `research-report-charts-v2` because
  the meaning-bearing chart payload changed.

## Preserved limits

- A1 remains the only calculation owner; A9 does not recompute formulas in the
  renderer or tests.
- The report still has only four bounded deterministic section drafts. A9 does
  not open a fifth section or complete M03/M04 methodology.
- Membership sensitivity is not growth. Group scopes overlap. Leader removal is
  not a forecast, recommendation or market scenario.
- No provider/AI call, approval, migration, database write, API or operator
  action is included.

## Verification

- `git diff --check`: pending final delivery verification.
- Impeccable/Antislop UI audit: no blocking finding; only pre-existing advisory
  typography/radius tokens were reported and the approved visual system was not
  changed.
- Independent static review: all pointer, ratio-denominator, visible-value,
  collapsed-disclosure and missing-state findings closed; no release blocker
  remains.
- Linux full repository check and report preview: pending final delivery
  verification.
- Windows tests/build/typecheck: not run by policy.

## Delivery state

Local implementation is stacked on Research A8. Final commit, draft PR and
Linux verification links will be recorded after delivery.
