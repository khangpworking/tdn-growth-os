# Research A32: closed M03 recipe and verified metric set

## Outcome

A32 is the first calculation consumer of the A30 preparation and A31 readiness
boundaries. It materializes one deterministic metric set for M03 only after the
exact catalog says M03 is ready. Future chart and AI consumers must bind to the
returned `metricSetSha256`; they must not independently recalculate or invent
numbers.

## Closed recipe

The request fixes section `M03`, recipe `m03-scope-totals` version `1.0.0`, the
exact preparation digest, catalog digest and readiness digest. The service
replays A30, recomputes A31 from the exact catalog bytes, verifies the approved
M03 method identity, then delegates arithmetic to the existing
`metric-scope-v1` calculator.

The output preserves:

- exact normalized input artifact/value identity and source lineage;
- ALL, WIDE and CORE membership, counts, observed totals and completeness;
- missing versus observed zero and non-exact observations;
- ALL-to-WIDE/CORE membership deltas;
- the versioned policy that UNKNOWN is retained in ALL and excluded from WIDE;
- method, rounding and catalog versions plus explicit limitations.

ALL/WIDE/CORE overlap and are not additive. A membership difference is not
market growth, market share, forecast or causation. A listing is not asserted to
be a unique product.

## Boundary

A32 adds no migration, database write, chart, narrative, AI call, provider call,
human approval or report version. The CLI opens SQLite read-only/query-only and
writes one new owner-only JSON file outside Git. Existing legacy calculation and
report commands remain available and are not silently reclassified as compliant
with A30–A32.
