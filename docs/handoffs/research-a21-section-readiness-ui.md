# Research A21 handoff: exact-version section readiness API and UI

## Delivery state

Implementation is prepared on `feature/research-a21-section-readiness-ui`,
stacked after Research A20. Linux release verification and the draft PR handoff
are pending.

## Implemented scope

- Exact report-version readiness route at
  `GET /api/reports/:reportId/versions/:version/sections`.
- Closed schema and generated TypeScript for section readiness.
- One-to-one verified projection from the embedded catalog and packet sections.
- Frontend validation of exact report identity, semantic version, membership
  order and closed response shape.
- Readiness matrix with current counts, Market/Insight filters and expandable
  method, prerequisite, blocker, claim, evidence and trace details.
- Truthful loading, connection and integrity-failure states.

## Preserved boundaries

This slice exposes existing packet truth only. It does not implement a missing
section method, create a chart or claim, invoke AI, accept evidence, approve a
report or add any decision control. Framework approval is not report-content
approval.

## Release evidence

Pending Linux CI on the final pushed head. No Windows test, build or typecheck
is part of this delivery.
