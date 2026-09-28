# Research A12 handoff: exact normalized observations in SQLite

## Delivery state

Draft PR [#69](https://github.com/khangpworking/tdn-growth-os/pull/69) is open on
`feature/research-a12-normalized-observations`.

## Implemented scope

- Migration 0031 for immutable normalized datasets, source membership,
  observation rows and exact report-version origins.
- Analysis-owned materializer and verified reader path.
- Exact canonical-byte replay with source-package lineage verification.
- Offline report-version command wiring and a bounded receipt.
- Focused behavior, CLI and migration coverage.

## Preserved boundaries

The immutable `normalized-input.json` artifact remains authoritative. SQLite is
only an exact query projection. Missing is not zero; exact integer strings are
not converted through floating point; source locators and declared precision
remain attached. This task adds no AI interpretation, human approval, provider
call, new section method, UI, API or live import.

## Release evidence

- Exact implementation head `c122890aaca5e43f77e080e5dc909e2350ab3982`
  passed the full Linux check with 169/169 frontend and 577/577 repository tests:
  [run 36406335192](https://github.com/khangpworking/tdn-growth-os/actions/runs/36406335192).
- Research report preview passed:
  [run 36406335269](https://github.com/khangpworking/tdn-growth-os/actions/runs/36406335269).
- Migration 0031 SHA-256 is
  `a0086e22e8764ec8cd6bfc2f098dec28cff4cd5c80faf2a7c9363ba912123a1a`.
- No Windows test, build or typecheck is release evidence.
