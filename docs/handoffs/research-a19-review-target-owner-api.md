# Research A19 handoff: OWNER review-target creation API

## Delivery state

Implementation is prepared on
`feature/research-a19-review-target-owner-api`, stacked after Research A18.
Final PR and Linux verification evidence are pending.

## Implemented scope

- Closed `POST /owner-api/report-review-targets` request and receipt contracts.
- Exact A10 report-version, A13 interpretation and intended-use selection.
- A17 creation plus verified replay before returning a receipt.
- `201` creation, `200` exact retry, safe `400`/`404` and integrity-error
  handling.
- Existing local OWNER authentication, origin and request-size controls.

## Preserved boundaries

Creating a target only prepares an immutable review packet. It is not approval
of the framework's content, a report conclusion or an AI interpretation. The
route adds no reviewer, decision, authority, publication right, UI, migration,
provider call, deployment or real business action.

## Release evidence

Pending Linux CI on the final pushed SHA. No Windows test, build or typecheck is
part of this delivery.
