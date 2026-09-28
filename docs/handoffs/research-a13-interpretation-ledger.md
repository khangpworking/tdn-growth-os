# Research A13 handoff: immutable report interpretation ledger

## Delivery state

Draft PR [#70](https://github.com/khangpworking/tdn-growth-os/pull/70) is
open on `feature/research-a13-interpretation-ledger`.

## Implemented scope

- Migration 0032 for immutable, sequential interpretation runs linked to one
  exact report ID and version.
- Exact content-addressed A8 artifact and prompt retention.
- Full replay through the A10 verified bundle and existing A8 validator.
- Exact retry, multiple-run history and a narrow explicit-version reader.
- Failed persistence removes only request-created, unregistered artifact bytes
  while the database write lock is still held.
- Focused behavior and migration coverage.

## Preserved boundaries

The ledger does not call a model or turn prose into evidence. Citations remain
application-resolved from exact deterministic claims. Every interpretation is
unapproved; A10 report rows remain unchanged, and no user decision or official
report is created. Hidden chain-of-thought and raw provider responses are not
stored.

## Release evidence

- Exact final head `7a249cbce9f553cbceb637379a3d2e567e700114`
  passed the full Linux check with 169/169 frontend and 579/579 repository
  tests: [run 36410679523](https://github.com/khangpworking/tdn-growth-os/actions/runs/36410679523).
- Research report preview passed:
  [run 36410679487](https://github.com/khangpworking/tdn-growth-os/actions/runs/36410679487).
- The integration owner proves that a v1 interpretation still replays exact v1
  evidence after a changed v2 exists, and that a forced database failure leaves
  the artifact tree unchanged.
- Migration 0032 SHA-256 is
  `3adf69726ef02430431f896e562dfc61d0bd86547c46d380fb2308b27c8f941c`.
- No Windows test, build or typecheck is release evidence.

