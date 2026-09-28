# Research A20 handoff: review-target preparation and inspection UI

## Delivery state

Implementation is being prepared on `feature/research-a20-review-target-ui`,
stacked after Research A19. Draft PR and Linux verification are pending.

## Implemented scope

- Explicit intended-use form under the selected interpretation.
- Confirmation snapshot naming the exact report and interpretation versions.
- A19 OWNER write followed by authoritative A18 read before navigation.
- Stable exact-digest route and reloadable review-target page.
- Four-layer summary with clear unapproved and no-decision states.
- Truthful blocked, loading, not-found, connection and integrity guidance.

## Preserved boundaries

This interface prepares and reads an immutable packet only. It does not decide,
approve, reject, delegate review authority, grant source rights or publish a
report. Demo mode does not fabricate targets.

## Release evidence

Pending Linux CI on the final pushed SHA. No Windows test, build or typecheck is
part of this delivery.
