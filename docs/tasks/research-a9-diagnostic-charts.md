# Research A9: deterministic M03/M04 diagnostic charts

## Objective

Deepen the existing source-backed report with code-generated diagnostics that
already exist in the verified A1 Result. A9 makes membership sensitivity, group
composition and top-shop-removal sensitivity visible without introducing a new
formula, section method, AI conclusion or business recommendation.

## Required behavior

- Replay the exact A3 packet and A1 Result before reading any diagnostic value.
- M03 membership comparisons show exact revenue/unit deltas, removed row
  membership and Result pointers for ALL to WIDE/CORE.
- M04 group composition shows each group's observed revenue/listing count and
  within-scope share with exact member-row and ratio pointers.
- M04 top-shop-removal views preserve the original denominator for remaining
  revenue share and the recomputed denominator for post-removal Top K shares.
- Every visible diagnostic links to an evidence block containing the exact
  Result digest and pointers used.
- Missing labels, values or denominators remain blocked/partial rather than
  becoming zero.
- The chart contract advances to `research-report-charts-v2`; the A1 calculation
  contract and 30-section method catalog remain unchanged.

## Interpretation limits

- Membership deltas are filter sensitivity within one period, not growth.
- ALL, WIDE and CORE overlap and are not additive market segments.
- Group shares apply only inside the displayed scope.
- Top-shop removal is a static sensitivity test, not a forecast or recommendation.
- These diagnostics deepen only M03 and M04. The automated-section count remains
  four: M02, M03, M04 and M13.

## Explicit exclusions

- No fifth section, new business methodology or inference claim.
- No AI/provider call, prompt, approval or human decision.
- No database migration, API, operator mutation or live data import.
- No claim that observed exports represent the full market.

## Verification ownership

- The A1 calculator remains the sole owner of arithmetic.
- The focused chart unit test owns projection state, values, lineage and missing
  evidence behavior without reimplementing formulas.
- The source-backed report integration test owns HTML anchors and renderer
  publication behavior.
- Linux CI and preview are release gates. Windows tests, builds and typechecks
  are not run.
