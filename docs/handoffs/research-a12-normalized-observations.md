# Research A12 handoff: exact normalized observations in SQLite

## Delivery state

Implementation is in progress on
`feature/research-a12-normalized-observations`. Final commit, pull request and
Linux verification links are added after publishing.

## Implemented scope

- Migration 0031 for immutable normalized datasets, source membership,
  observation rows and exact report-version origins.
- Analysis-owned materializer and verified reader path.
- Exact canonical-byte replay with source-package lineage verification.
- Offline report-version command wiring and a bounded receipt.
- Focused behavior, CLI and migration coverage.

## Preserved boundaries

The immutable `normalized-input.json` artifact remains authoritative. SQLite is
only an exact query projection. Missing is not zero; exact integer strings are
not converted through floating point; source locators and declared precision
remain attached. This task adds no AI interpretation, human approval, provider
call, new section method, UI, API or live import.

## Release evidence

Pending final-head Linux CI. No Windows test, build or typecheck is release
evidence.
