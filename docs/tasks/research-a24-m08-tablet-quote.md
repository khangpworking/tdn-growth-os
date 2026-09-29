# Research A24: bounded M08/P4 tablet-quote normalization

## Outcome

Materialize `tablet-quote-normalization-v1` inside the 30-section report
pipeline as `M08/P4 · Chuẩn hóa giá quote viên đơn lẻ`.

One report may select exactly one raw JSON quote and one canonical quote input
from the same finalized source package. The report retains both files, emits
`m08-tablet-quote-method.json`, binds it into packet, semantic identity,
interpretation replay and immutable report-version identity, then shows the
result in the HTML report.

## Evidence and trust boundary

- Raw quote bytes remain source evidence.
- Canonical quote input remains a declared structured representation.
- Exact rational and half-even display values are reproducible calculation.
- No AI interpretation or human decision is created.
- Output remains `SCENARIO`, `UNREVIEWED`, `DECLARED_UNVERIFIED` and
  `NOT_AUTHENTICATED`.
- Missing quote files keep M08 blocked.

## Exclusions

- No ALL/WIDE/CORE membership or FactObservation.
- No comparison, ranking, dose equivalence, margin or recommendation.
- No broader M08 unit economics.
- No provider authentication, live collection or real-data import.
- No report approval or business action.

## Persistence design

Migration 0034 keeps the original immutable Metric source table and its 2-3
source invariant. One separate immutable table retains the exact supplemental
quote pair in global source order. Existing report rows receive a default zero
supplemental count and remain replayable without a data rewrite.

## Verification

- Unit ownership: M08 artifact identity, exact-byte lineage and fail-closed
  source-reference checks.
- Source-backed integration ownership: package to packet, semantic and HTML
  composition, plus the blocked no-quote path.
- Report-version integration ownership: four-source immutable persistence,
  replay, exact retry and migration compatibility.
- Linux-only full repository check and report preview are release gates.
