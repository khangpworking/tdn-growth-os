# Research A19: OWNER review-target creation API

## Objective

Allow the local OWNER operator to retain one exact A16 review target without
turning that preparation step into a human decision.

## Required behavior

- Add `POST /owner-api/report-review-targets`.
- Accept only the closed canonical request: exact report ID/version, exact
  interpretation ID and an explicit intended use.
- Delegate creation and replay verification to the A17 ledger.
- Return `201` for creation and `200` for an exact, mutation-free retry.
- Reject extra fields and malformed identities as safe `400` responses.
- Return safe `404` responses when the exact report version or interpretation
  does not exist.
- Treat persisted lineage, identity, manifest or artifact disagreement as an
  integrity failure, never as a user-editable conflict.
- Preserve the existing local OWNER token, exact-origin, body-size and loopback
  runtime boundaries.

## Explicit exclusions

- No reviewer, actor, authority, role, rationale or decision field.
- No approve, reject, hold, revoke or publish action.
- No list or implicit latest report, interpretation or target selection.
- No report or interpretation generation, provider call or regeneration.
- No UI, migration, external access, deployment or real business record.

## Verification ownership

The existing report API integration owns the smallest complete flow: create an
exact A19 target through the real OWNER HTTP boundary, verify exact retry and
closed input, then read the same target through A18. A16 and A17 remain the
authorities for composition, persistence, replay and artifact integrity.
