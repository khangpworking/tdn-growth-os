# Research A23: deterministic M13 provenance appendix

## Outcome

Complete the executable provenance portion of M13 without AI prose. A
source-backed report using catalog 0.3.0 produces
`m13-provenance-appendix.json` and binds it to the M13 packet entry, semantic
identity, interpretation replay, immutable report-version artifact set and
HTML evidence view.

The appendix records the exact source-package identity, selected file bytes
and metadata, normalized-input/normalization-receipt/calculation digests, and
the evidence locator for every retained record, revenue value, unit value and
optional label. It reports locator and label coverage without converting an
absent label into a value.

## Boundaries

- Exact byte verification does not authenticate a provider collection.
- Locators identify retained source bytes; they do not prove market
  completeness or source truth.
- The artifact contains no AI interpretation, conclusion or human decision.
- Existing catalog 0.1.0 and 0.2.0 reports remain replay-compatible. Catalog
  0.3.0 requires exact M02 and M13 method artifacts and otherwise fails closed.
- Source evidence, deterministic calculation, AI interpretation and human
  decision remain separate layers.

## Verification plan

- Pure deterministic tests for exact package/file/record lineage and drift
  rejection.
- Source-backed integration proving artifact, packet, semantic and HTML
  binding.
- Exact-version replay through interpretation and report-version boundaries.
- Linux-only full repository check and report preview.
