# Research A20: review-target preparation and inspection UI

## Objective

Give the local OWNER operator a truthful UI for preparing and reopening one
exact A19 review target without introducing a human-decision action.

## Required behavior

- Start only after the user explicitly selects a report series, report version
  and retained interpretation run.
- Require an explicit intended use; never synthesize or silently trim it.
- Show the exact report version, interpretation number and intended use again in
  a confirmation dialog before the write.
- Call A19, then read the exact returned digest through A18 before navigating.
- Give each target a stable hash route so reload and back/forward preserve the
  exact identity.
- Present source evidence, deterministic calculation, AI interpretation and
  human decision as four visibly separate layers.
- Mark the target as unapproved and show that layer four has no decision.
- Preserve loading, not-found, connection and integrity-failure states without
  synthetic fallback.
- Keep OWNER token memory-only and reuse existing dialog accessibility.

## Explicit exclusions

- No approve, hold, reject, revoke or publish control.
- No reviewer, authority, reason, attachment or decision field.
- No target list, default target or implicit latest selection.
- No report/interpretation generation, provider call or external action.
- No backend/domain change, migration, deployment or real business record.

## Verification ownership

One mounted preparation test owns the closed write, authoritative GET and stable
navigation flow. One mounted target-page test owns the four-layer presentation
and absence of decision controls. Contract validation owns rejection of extra
response fields; routing owns the exact digest path.
