# Research A23 handoff

## Delivery status

- Draft PR: #80
- Branch: `feature/research-a23-m13-provenance`
- Verified implementation head: `7d22ddd2942d1b1da41e7eb9bbd1b6b8a4487dde`
- Linux Check: PASS, run 36443259788
  - frontend tests: 176/176
  - repository tests: 587/587
  - contract generation, backend/frontend TypeScript and production build:
    PASS
- Research report preview: PASS, run 36443259806

## Delivered

- Canonical `m13-provenance-appendix.json` for catalog 0.3.0.
- Exact source-package, selected-file and raw-byte membership.
- Exact normalized-input, normalization-receipt and calculation lineage.
- Record-level locators for rows, revenue, units and optional labels.
- Explicit coverage counts and unlabelled-record disclosure.
- Packet, semantic-content, interpretation replay, immutable report-version,
  exact readiness and HTML provenance binding.
- Replay compatibility for catalog 0.1.0 and 0.2.0 reports.

## Not delivered

- No provider-authenticity or whole-market-completeness claim.
- No AI interpretation, narrative conclusion or human decision.
- No migration, provider call, live collection, deployment or real report
  version.

The preview gate first exposed a method-file download nested inside a closed
readiness disclosure. The final HTML keeps the readiness filename inert and
uses the dedicated downloads and provenance areas for accessible file links.
