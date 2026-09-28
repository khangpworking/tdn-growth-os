# Research A10 handoff: immutable report-version ledger

## Delivery state

Implementation is in progress on
`feature/research-a10-report-version-ledger`. The branch temporarily includes
the unmerged Content Studio migration stack so migration 0030 can be developed
after 0026–0029. It must be integrated onto final `main` only after those four
migrations are reviewed and merged.

## Implemented locally

- Migration 0030 for immutable report series, versions, artifact membership and
  source membership.
- Closed create/read contracts and generated TypeScript projections.
- `ReportVersionService` and explicit-version reader with deterministic replay.
- Offline `research:report:version` command.
- Focused synthetic integration coverage.

## Pending release evidence

- Contract regeneration using the pinned Linux dependencies.
- Final-head Linux full check and independent review.
- Current-base integration after Content Studio migrations 0026–0029 land.
- Commit, push, draft PR and exact-head handoff.

No provider call, live import, human decision, deployment or real report version
has been created by this work.
