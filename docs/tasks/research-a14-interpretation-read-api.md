# Research A14: exact-version interpretation read API

## Objective

Expose retained A13 interpretation overlays for local operator inspection while
preserving the four-layer evidence boundary and exact report-version identity.

## Required behavior

- List interpretations only for one explicit report ID and version.
- Read one interpretation only by its explicit interpretation ID under that
  exact report ID/version pair.
- Replay the A13 artifact and underlying report bundle before returning data.
- Return safe generation identity plus conclusion, evidence logic,
  application-resolved citations, assumptions and limitations.
- Preserve deterministic history order and section identity.
- Return generic not-found and integrity responses without exposing paths,
  storage-only hashes, SQL or stack traces.
- Keep SQLite read-only, file-must-exist and query-only.

## Private fields excluded from the API

- Prompt text and prompt digest.
- Provider request ID.
- Input/output token counts and latency.
- Request identity, artifact digest/path and manifest internals.
- Hidden chain-of-thought or raw provider output, which A13 does not retain.

## Explicit exclusions

- No model/provider call or regeneration.
- No human review, acceptance, rejection or official-report selection.
- No report write, migration, UI/dashboard or section-method change.
- No live data import, deployment or provider collection.

## Verification ownership

The existing report read-API integration test is extended as the owner of the
transport projection: exact-version list/detail, safe-field filtering, 400/404
handling and generic integrity failure. A13 remains the owner of persistence,
immutability and deterministic replay; A8 remains the owner of interpretation
language and citation validation.
