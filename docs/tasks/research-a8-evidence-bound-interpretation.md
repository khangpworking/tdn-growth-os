# Research A8: evidence-bound report interpretation contract

## Objective

Implement the first code boundary for ADR 0005 layer three. A8 accepts an
untrusted structured interpretation of the exact A7 source-backed report and
produces one application-owned, immutable artifact whose claims can be traced
back to deterministic report facts.

A8 is not a live model call and does not claim that the 30-section business
methodology is complete. Synthetic fixtures exercise the boundary offline.

## Required behavior

- Closed request, untrusted-output and application-owned artifact schemas.
- Exact A7 semantic content and A3 packet verification before interpretation.
- Only `PARTIAL_DETERMINISTIC_DRAFT` sections with existing fact claims are
  eligible.
- Every interpretation item cites unique existing claim IDs from the same
  section.
- Application code resolves and copies citation facts from the verified packet.
- User-visible conclusion and evidence-logic text cannot contain unsupported
  numeric literals or decision/action language.
- `HYPOTHESIS` items require assumptions; `INTERPRETATION` items do not silently
  become recommendations.
- Artifact identity separates meaning-bearing interpretation content from
  provider request IDs, token counts, latency and render bytes.
- No chain-of-thought field exists.

## Explicit exclusions

- No provider call, live model, credential, network access or paid action.
- No migration, SQLite row, API, UI, dashboard or human review mutation.
- No new 30-section formula or completion claim.
- No source collection, retrieval index, LangGraph, JEV, WeKnora or OpenViking
  runtime.

## Verification ownership

- A focused unit test owns output validation, citation resolution, unsupported
  number/language rejection and stable content identity.
- Existing A1 through A7 tests continue to own calculations, source replay,
  chart rendering and export publication. A8 must not duplicate them.
- Contract generation and Linux full CI remain release gates. No Windows test,
  build or typecheck run is authorized.
