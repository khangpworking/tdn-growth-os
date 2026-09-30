# Research A27 handoff

## Delivery status

- Branch: `feature/research-a27-chart-spec`
- Draft PR: pending
- Reviewed implementation SHA: pending
- Linux Check: pending
- Research report preview: pending

## Delivered scope

- Canonical `ResearchChartSpec` JSON Schema and generated TypeScript contract.
- Deterministic fourteen-view materializer and exact replay verifier.
- Mark-level ChartData and Result/evidence pointers with stable semantic IDs.
- Explicit axes, scale, zero, domain, geometry, unit and category ordering.
- Missing, observed-zero and UNKNOWN policies frozen in the spec.
- Fail-closed group visual above 100 categories without silent truncation.
- Source-backed envelope, export and semantic identity binding.
- Visible Vietnamese ChartSpec explanation and downloadable canonical JSON.

## Boundaries

- No new market calculation, ranking, forecast, causality or recommendation.
- No AI/provider call, interpretation, human decision or approval.
- No new report section; executable deterministic coverage remains 7/30.
- No database migration, runtime write, live data, deployment or real calcium
  report.
- CSS and renderer-only output remain outside semantic business identity.

## Verification

Linux CI and preview evidence will replace the pending fields before owner
review. Windows tests, builds and typechecks are not release evidence.
