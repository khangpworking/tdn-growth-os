# Research A28 handoff

## Delivery status

- Branch: `feature/research-a28-input-readiness-gate`
- Parent: Research A27 head `7ccc7db630ca57d100d580083a64a2112ff17e9e`
- Draft PR: pending
- Linux Check: pending
- Research report preview: pending

## Delivered scope

- Closed `report-input-readiness-v1` profile over all 30 catalog input IDs.
- Ordered `PRESENT`, `ABSENT` and `INVALID` checks per exact report version.
- Exact packet, record and verified artifact references with SHA-256 digests.
- Byte/digest mismatch and unknown future input IDs fail closed.
- Optional OWNER tablet count remains visibly absent without blocking M08.
- M08 observation time is present only when the verified method says it is
  known.
- Existing read endpoint and progressive Vietnamese readiness UI extended in
  place.

## Boundaries

- No new market or insight section; deterministic coverage remains 7/30.
- No new calculation, claim, chart, interpretation or human decision.
- No source import, provider/AI call, owner action or report approval.
- No migration, write API, latest-version lookup, live data or deployment.
- Missing is not zero; UNKNOWN and ALL/WIDE/CORE semantics are unchanged.

## Verification

- Unit profile proof: pending Linux CI.
- Exact-version API integration proof: pending Linux CI.
- Mounted frontend readiness proof: pending Linux CI.
- Contract generation, strict TypeScript, production build and full repository
  check: pending Linux CI.
- Report preview and keyboard/desktop/mobile inspection: pending.
- Windows tests, builds and typechecks are not run and are not release
  evidence.
