# Research A18: exact review-target read API

## Objective

Expose one retained A17 review target to a local presentation layer without
silently selecting another report, interpretation, intended use or render.

## Required behavior

- Add `GET /api/report-review-targets/:reviewTargetId`.
- Accept only an exact lowercase SHA-256 target identity.
- Read through the A17 ledger, which must replay the A10 report, A13
  interpretation, immutable row, active manifest and canonical artifact bytes.
- Return the canonical A16 review-target contract without a second projection
  that could omit or reinterpret its evidence membership.
- Return safe generic 400, 404 and integrity-error responses.
- Keep SQLite read-only, file-must-exist and query-only.

## Explicit exclusions

- No target list, implicit latest selection or search.
- No human decision, review state, reviewer, actor, authority or timestamp.
- No approve/reject action, OWNER API or UI.
- No report, interpretation or target write.
- No provider call, regeneration, publication, deployment or migration.

## Verification ownership

The existing report-API integration behavior owns exact target retrieval,
malformed and unknown identities, absence of list/latest behavior, safe output
and upstream-corruption failure. A16 and A17 remain authoritative for target
composition, persistence, retry and replay semantics.
