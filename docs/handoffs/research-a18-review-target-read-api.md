# Research A18 handoff: exact review-target read API

## Delivery state

Implementation is prepared on `feature/research-a18-review-target-read-api`,
stacked on Research A17. Final Linux CI and draft-PR identity are recorded after
publication.

## Implemented scope

- Exact-digest `GET /api/report-review-targets/:reviewTargetId` route.
- Canonical A16 response schema reused by the report API contract.
- Verified A17 replay through exact A10/A13 readers before every response.
- Closed malformed, absent and corrupt-state handling.
- Read-only/query-only database operation and no target enumeration.

## Preserved boundaries

The response is an internal, unapproved review inventory. It records no human
decision, reviewer or authority and grants no publication or source-use right.
No OWNER route, UI, migration, AI/provider call, external action or deployment
is included.
