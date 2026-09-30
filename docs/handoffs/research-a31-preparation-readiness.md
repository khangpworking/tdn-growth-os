# Research A31 handoff — preparation-bound readiness

## Delivery

- Branch: `feature/research-a31-preparation-readiness`
- Stacked base: A30 draft PR #92 at `08d9393dee54e614e7a2006122cddb76c46091ef`.
- Draft PR, final SHA and Linux checks: pending publication.

## Implemented

- Closed readiness result contract and deterministic `readinessSha256`.
- Exact A30 preparation replay before all readiness evaluation.
- One check for every distinct catalog input and one state for all 30 sections.
- Evidence references identify the preparation, normalized input, receipt,
  source package and selected sources without inventing lineage.
- Complete valid frozen labels include `UNKNOWN`; missing or stale labels block
  M03/M04 before calculation.
- Offline, outside-Git JSON export CLI.

## Boundaries

No calculation, chart, narrative, AI output, report, human decision, provider
call, database mutation, API, UI or deployment. Readiness is not delivery.

## Verification

- Contract generation: completed locally; not Windows release evidence.
- Linux checks: pending draft PR CI.
