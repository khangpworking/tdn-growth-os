# Research A17: immutable review-target ledger

## Objective

Retain and replay one A16 review target without regenerating AI output or
silently changing the report, scope, intended use or rendered file.

## Required behavior

- Accept a closed request naming one report ID/version, one interpretation ID
  and one explicit intended-use string.
- Recompose the target only through the A10 and A13 verified readers.
- Store canonical target bytes in the existing content-addressed artifact store
  and one immutable SQLite row with the exact report, interpretation, rendered
  report and intended-use identity.
- Derive the target ID from canonical meaning. Exact retry returns the same
  identity with zero database mutations; a different intended use is a separate
  target rather than a rewrite.
- Replay by target ID, rebuild from exact upstream readers and compare the row,
  manifest, artifact bytes and content identity.
- Reject extra request fields and fail closed on missing, corrupt or mismatched
  lineage.

## Explicit exclusions

- No human decision, reviewer identity, approval state, authority or timestamp.
- No API, UI, publication, export, model call or regeneration.
- No automatic latest selection or source/method change.
- No delegation, revocation or external source-use rights.

## Verification ownership

One integration behavior owns target persistence, exact retry, replay,
different-use identity, closed input, immutability and corrupt-artifact failure.
A separate narrow migration check owns v32→v33 and idempotent rerun. Existing
A10/A13/A16 tests remain authoritative for their own semantics.
