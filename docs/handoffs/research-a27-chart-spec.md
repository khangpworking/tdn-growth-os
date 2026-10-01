# Research A27 handoff

## Delivery status

- Branch: `feature/research-a27-chart-spec`
- Draft PR: [#88](https://github.com/khangpworking/tdn-growth-os/pull/88)
- Reviewed implementation SHA:
  `edf9c874ff90714a33ee6eaab5a4e51953320d65`
- Linux Check: PASS —
  [run 36671577825](https://github.com/khangpworking/tdn-growth-os/actions/runs/36671577825)
- Research report preview: PASS —
  [run 36671577894](https://github.com/khangpworking/tdn-growth-os/actions/runs/36671577894)

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

- Contract generation, strict TypeScript, frontend production build and the
  complete repository check passed on Linux.
- Frontend tests: 176/176 passed.
- Repository tests: 601/601 passed.
- Desktop preview: 1440 px; mobile preview: 390 px; neither produced a page
  error.
- The browser walkthrough opened the visible ChartSpec explanation, exercised
  all internal links and downloaded the exact canonical `chart-spec.json`.
- Keyboard Enter/Tab behavior and visible focus passed. Recorded text contrast
  ratios were all at least 5.64:1.
- `git diff --check` passed.
- Windows tests, builds and typechecks were not run and are not release
  evidence.
