# Research A22 — deterministic M02 scope and method account

## Outcome

Complete the executable part of M02 without AI prose. A source-backed report
using catalog 0.2.0 produces `m02-scope-method.json`, binds it to the M02 packet
entry, the semantic identity and the immutable report-version artifact set.

The account records the exact declared scope and period, selected source bytes,
raw-byte mappings, normalization profile, UNKNOWN policy, locator coverage,
missing-versus-zero counts, precision coverage, label coverage and explicit
limitations. Identical verified inputs produce identical canonical bytes and
identity.

## Boundaries

- Exact package bytes are replayed, but this does not authenticate a provider.
- The export scope is not promoted to the whole market.
- Missing remains distinct from observed zero.
- UNKNOWN remains visible and follows the explicit WIDE policy.
- M02 remains an unreviewed deterministic draft; it creates no narrative,
  interpretation, conclusion or OWNER decision.
- Catalog 0.1.0 reports replay unchanged. Catalog 0.2.0 requires the new exact
  method artifact for M02 and otherwise fails closed.

## Verification plan

- Pure deterministic coverage and membership tests for the M02 builder.
- Source-backed integration proving artifact, packet and semantic binding.
- Exact-version API projection of the method-artifact identity.
- Linux-only full repository check and report preview.

