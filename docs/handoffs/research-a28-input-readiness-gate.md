# Research A28 handoff

## Delivery status

- Branch: `feature/research-a28-input-readiness-gate`
- Parent: Research A27 head `7ccc7db630ca57d100d580083a64a2112ff17e9e`
- Draft PR: #89 (`main` base for Linux verification; it includes unmerged A27 until PR #88 lands)
- Implementation head: `882b55fc37b2e2b5b7c386dd1d29b28bbbb5b74c`
- Verified implementation head: `e7894bd5eb4deeb4d70b8ca1bb25bb19c84738a4`
- Linux Check: PASS, run `36675570267` (176/176 frontend and 602/602 repository tests)
- Research report preview: PASS, run `36675570239` (5/5 focused integration tests, desktop/mobile/PDF artifact retained)

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

- Unit profile proof: PASS in Linux Check.
- Exact-version API integration proof: PASS in Linux Check.
- Mounted frontend readiness proof: PASS in Linux Check.
- Contract generation, strict TypeScript, production build and full repository
  check: PASS in run `36675570267`.
- Report preview and desktop/mobile/PDF capture: PASS in run `36675570239`.
- Windows tests, builds and typechecks are not run and are not release
  evidence.
