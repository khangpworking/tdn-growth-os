# Research A13 handoff: immutable report interpretation ledger

## Delivery state

Implementation is prepared on `feature/research-a13-interpretation-ledger`.
Draft PR and exact-head Linux evidence will be recorded after publication.

## Implemented scope

- Migration 0032 for immutable, sequential interpretation runs linked to one
  exact report ID and version.
- Exact content-addressed A8 artifact and prompt retention.
- Full replay through the A10 verified bundle and existing A8 validator.
- Exact retry, multiple-run history and a narrow explicit-version reader.
- Focused behavior and migration coverage.

## Preserved boundaries

The ledger does not call a model or turn prose into evidence. Citations remain
application-resolved from exact deterministic claims. Every interpretation is
unapproved; A10 report rows remain unchanged, and no user decision or official
report is created. Hidden chain-of-thought and raw provider responses are not
stored.

## Release evidence

Pending draft PR and Linux CI. No Windows test, build or typecheck is release
evidence.

