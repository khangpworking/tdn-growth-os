# Research A11 handoff: verified report history in the local operator

## Delivery state

Implementation is prepared on `feature/research-a11-report-read-api`. Final
commit, pull request and Linux verification links are added after publishing.

## Implemented

- Analysis-owned report-series catalog and exact verified artifact reads.
- Closed read contracts for workspace report index and replayed history.
- Loopback operator routes for index, history and exact report members.
- Inline, script-free persisted HTML plus attachment-only evidence downloads.
- Real-mode workspace report browser with explicit series and version selection.
- Honest empty/loading/error states and visible `4/30`, `NONE`, `UNREVIEWED` limits.
- No implicit latest selection and no synthetic report fallback.

## Business-methodology audit

The framework audit passed for methodology and boundaries. It did not validate
calcium-market content. Current operational coverage remains four partial
deterministic section methods; AI interpretation and the human decision ledger
are not integrated yet.

## Remaining foundation gap

Normalized rows remain exact report artifacts referenced by SQLite, not
row-level queryable SQLite observations. A11 deliberately replays those
artifacts. A separate next slice will add normalized observation persistence
before broader section automation relies on SQL queries.

## Release evidence

Pending Linux CI on the final pushed SHA. No Windows test, build or typecheck is
used as release evidence.

No provider call, live import, real report version, human decision, deployment,
public exposure or runtime activation is performed by this task.
