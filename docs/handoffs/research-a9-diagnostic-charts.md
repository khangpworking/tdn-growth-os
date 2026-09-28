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

- `git diff --check`: passed.
- Impeccable/Antislop UI audit: no blocking finding; only pre-existing advisory
  typography/radius tokens were reported and the approved visual system was not
  changed.
- Independent static review: all pointer, ratio-denominator, visible-value,
  collapsed-disclosure and missing-state findings closed; no release blocker
  remains.
- Linux full repository check: passed, 486/486 tests, together with contract
  generation, strict backend/frontend TypeScript, frontend tests and production
  build ([run 36392797081](https://github.com/khangpworking/tdn-growth-os/actions/runs/36392797081)).
- Linux report preview: passed at desktop/mobile sizes with no page error,
  working disclosures/evidence anchors/downloads and acceptable measured
  contrast ([run 36392797004](https://github.com/khangpworking/tdn-growth-os/actions/runs/36392797004)).
- Windows tests/build/typecheck: not run by policy.

## Delivery state

Final implementation head: `7a427d2c94efa67bdf3e231ae1f10973c5c182f3`.
Draft PR: [#65](https://github.com/khangpworking/tdn-growth-os/pull/65).

The PR is intentionally still draft and unmerged because A9 is stacked on the
unmerged Research A1–A8 dependency chain. The working tree, remote branch and PR
head matched when this handoff was prepared.
