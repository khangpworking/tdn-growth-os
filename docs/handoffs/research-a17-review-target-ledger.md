# Research A17 handoff: immutable review-target ledger

## Delivery state

Implementation is being prepared on `feature/research-a17-review-target-ledger`,
stacked on draft A16 PR #73. Final delivery SHA and Linux CI are added after the
branch is published.

## Implemented scope

- Closed review-target create request contract.
- Migration 0033 with immutable row, exact report/interpretation lineage guards
  and active JSON-artifact guard.
- Content-addressed canonical target persistence, exact retry and verified
  replay through the A10/A13 readers.
- Narrow exact-ID reader for future presentation layers.

## Preserved boundaries

The retained object is still an internal, unapproved review inventory. It has no
decision/reviewer/authority fields and grants no publication or source-use
right. No API/UI, AI/provider call, report mutation, external action or
deployment is included.

## Release evidence

Pending final-head Linux CI. Windows tests, builds and typechecks are not release
evidence and were not run.
