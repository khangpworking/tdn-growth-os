# Research A26: I17 directional evidence trace

## Outcome

Materialize I17 as a deterministic, replay-bound index from one exact source
package, method chain and calculation result to the artifacts and JSON pointers
that already own each method fact and M03/M04 quantitative claim.

The artifact records the exact source-package and catalog identities, normalized
input, metric result, claim set, M02/M08/M13/I03 method artifacts, claim scope,
membership, denominator, coverage, limitations and reopen conditions. It is
part of packet, semantic, report-version and interpretation replay identity and
appears in the static HTML report.

## Directional identity

I17 binds only upstream identities. The final packet binds the I17 artifact,
then semantic content and the immutable report version bind the final packet.
I17 must not embed the final packet ID or semantic-version ID, because either
would create a circular content hash.

## Truth boundary

- `RESOLVED` means the referenced pointer exists. It does not mean the value is
  complete, authenticated, representative, approved or true.
- Missing, observed zero, UNKNOWN and non-exact states remain unchanged.
- `TRACE_FOR` and `CALCULATION_BASIS` are trace relations, not proof labels.
- M13 remains the owner of source inventory, raw-byte lineage and locators.
- I17 creates no conclusion, insight, recommendation, ranking, causality,
  effectiveness claim, AI interpretation or human decision.
- Optional M08 absence leaves M08 blocked and does not prevent I17 from tracing
  the remaining exact method and calculation chain.

## Verification ownership

The existing source-backed integration case owns package-to-I17 binding,
canonical identities, exact method membership, claim pointers, denominator,
coverage, optional-M08 behavior, replay and HTML/download exposure. The
report-version integration case owns the resulting 30-section readiness count.
No duplicate unit suite or test-only production seam is added.

Authoring-gate rationale:

1. The observable contract is a canonical, directional and replayable trace
   from exact upstream artifacts and claims to resolvable pointers.
2. The credible regression is a changed/wrong artifact, digest, pointer,
   denominator, optional method membership or circular identity.
3. Existing tests own the upstream artifacts but did not previously prove the
   cross-layer I17 relationship or its visible export.
4. The assertions use the real package-to-report boundary and need no new
   production-only seam.

Linux Check and the research-report preview are release gates. Windows is used
only for contract generation and static diff inspection.

## Explicit follow-up

A26 does not claim a complete visualization contract. The next bounded chart
increment should introduce a closed, versioned ChartSpec that maps every visible
series/mark to exact chart-data pointers and claim IDs, including chart type,
axis/scale, unit, ordering and missing/zero/UNKNOWN behavior. Its digest belongs
in semantic identity; presentation-only CSS does not.
