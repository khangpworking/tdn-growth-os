# Research A30 handoff — pre-report Metric input preparation

## Delivery

- Branch: `feature/research-a30-m03-section-recipe`
- Base stack head at start: `c65c1dbba3d1110dca4202414ab58eedfa06f7ba`
- Draft PR: https://github.com/khangpworking/tdn-growth-os/pull/92
- Verified implementation SHA before this documentation-only update:
  `36e0794ba212c0654b4309c3e5e95b6c933d3d8c`.
- Linux repository check: PASS, 605/605 tests:
  https://github.com/khangpworking/tdn-growth-os/actions/runs/36685354335
- Linux report preview: PASS:
  https://github.com/khangpworking/tdn-growth-os/actions/runs/36685354207

## Implemented

- Split input-only Metric normalization from the approved market calculation.
- Added closed preparation request/result contracts and generated types.
- Added migration 0036 with one immutable pre-report preparation lineage table.
- Added content-addressed input/receipt/result persistence, exact replay and a
  narrow verified reader.
- Rejects oversized derived artifacts before publishing bytes or mutating the
  database, so every committed preparation remains replayable under its bound.
- Reused the A12 dataset/source/row projection without duplicating normalized
  rows or creating a report origin.
- Added an offline preparation CLI and recorded the structured-report boundary.

## Boundaries

No calculation, claim, chart, AI output, human decision, report version,
provider call, source collection, API, UI, deployment or real calcium record is
created by this task. Arbitrary AI-generated Python/JavaScript is explicitly
outside the architecture. A30 adds the preparation path and identity; it does
not yet gate the older direct calculation/report entry points.

## Verification

- Contract generation: completed locally; it is not Windows release evidence.
- `git diff --check`: PASS.
- Linux contract generation, strict TypeScript, frontend checks/build and full
  repository suite: PASS, 605/605 tests.
- Linux report preview: PASS.
