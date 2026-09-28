# Research A16 handoff: exact report review target

## Delivery state

Implementation is prepared on `feature/research-a16-review-target`, stacked on
the reviewed A15 dashboard head. Final Linux-CI evidence and the exact delivery
SHA are recorded in the PR handoff after the branch is published.

## Implemented scope

- Closed canonical review-target contract and generated TypeScript type.
- Pure composer over the A10 exact report reader and A13 exact interpretation
  reader; no direct storage access and no implicit latest selection.
- Exact source membership, scope, calculation, interpretation, item/claim and
  rendered-report binding.
- Explicit caller-supplied intended use plus fail-closed unknown geography and
  source-rights markers.
- Content-derived target identity and canonical replay bytes.

## Preserved boundaries

The result is an unapproved inventory for internal review. It records no OWNER
decision, reviewer, authority, publication permission or action. No API/UI,
migration, provider call, database mutation, report regeneration, live source or
deployment behavior is added.

## Release evidence

Pending final-head Linux CI. Windows tests, builds and typechecks are not release
evidence and were not run.
