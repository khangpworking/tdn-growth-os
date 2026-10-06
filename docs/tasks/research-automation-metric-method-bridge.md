# Automation Metric method bridge v1

Status: implemented for one explicitly attached, retained Metric export, with
service/report wiring and a Linux-generated contract. This is a bounded observed
ALL sample. It is not a
completed classified M03/M04 section and does not activate anything live.

## Boundary

`AutomationMetricMethodBridge.execute({runId,start,scope,scopeConfirmedAt},
signal?)` returns `AutomationMetricMethodSnapshot | undefined`.
`verify(snapshot, input)` is the frozen historical reader. No provider call,
Kalodata-derived workbook, new ledger, migration or queue is introduced.

## Source selection

Selection is explicit only. The bridge selects exactly one finalized version-1
Foundation package with the key `automation-metric-source:<runId>`:

- No match returns `undefined`.
- More than one match, a version other than 1, or any listing/read failure fails
  closed.
- Unrelated packages are never substituted.

The package holds exactly four files:

- the descriptor `normalized/automation-metric-source.json`
  (`contracts/analysis/automation-metric-source.schema.json`, canonical bytes)
- the workbook
- the operator profile manifest
- one literal source-context file

The descriptor binds the attachment to the run:

- `runId`, `workspaceId` and the exact `start.keyword`
- `runBindingSha256 = SHA-256(canonicalJson(input))`
- distinct workbook, manifest and context paths
- `labelsPath: null`, the only value v1 allows

Every file is `non_independent`. The descriptor is
`operator_supplied_unverified`.

The descriptor is an operator attachment record. It does not prove provider
authenticity, filters, category or coverage. The context file is kept literally
and is never parsed.

## Method

The bridge reuses existing code only:

1. Existing v1/v2 profiles go through the existing `MetricInputPreparationService`,
   which uses the existing normalizer and the injected workspace reader.
2. `MetricPreparationReadinessService` runs against the exact bytes of
   `docs/research/report-section-catalog-v1.json`.
3. `calculateMetricScopes` runs the generic ALL calculation. There is no
   classifier, labels, relabeling or readiness bypass.

The bridge requires this bounded state:

- ALL is `CALCULATED`. WIDE and CORE are `BLOCKED_LABELS`.
- Every record carries a label issue, and there are no comparisons.
- M03 and M04 readiness are `BLOCKED`.

The source period must lie inside the requested dates. A narrower period adds
`SOURCE_PERIOD_SHORTER_THAN_REQUESTED_NOT_EXPANDED_OR_PRORATED`. It is never
expanded or prorated. The fixed limitations exclude annual growth, TAM,
whole-market share and direct comparison with Kalodata periods.
The declared manifest period is schema-validated and checked before any
preparation writes. The normalized period is checked again after preparation.
This prevents rejected out-of-request attachments from creating preparatory
rows; it does not authenticate the operator's period declaration.

## Retention

Everything is retained in `automation-method:<runId>-metric-v1`, version 1,
with `sourceAcquiredAt` copied from the original.

- **Original files** keep their exact bytes, paths and metadata.
- **Derived files** are JSON marked `non_independent` and
  `operator_supplied_unverified`:
  - the run configuration (`methods/metric-run.json`)
  - the preparation result, normalized input and normalization receipt, as the
    exact preparation artifact bytes
  - the full scope output and the readiness result
  - the exact catalog
  - eight schemas under `profiles/`

The full scope output keeps all shops and groups, numerators and denominators,
`usedShopCount`, `withoutTopShop`, locators, and missing/precision metadata.

Size bounds are 32 MiB per file and about 127 MiB per package. An exact retry
deduplicates with zero mutations. Content-addressed `acquired_at` keeps its
first-storage value.

## Historical verify

`verify` reads only what was retained:

- the method package and the original package, by their exact IDs
- schemas compiled from the retained `profiles/`
- the descriptor, re-checked with the frozen schema

It then checks:

- exact membership and roles
- snapshot bytes against the retained bytes
- the recomputed preparation, request, receipt, input and readiness identities
- catalog identity, the bounded state, the run configuration and the limitations

It never calls the workspace reader, Python, the normalizer, the calculator, the
readiness service, the current catalog, the clock or any intake.

## Validation

Validation lives in `tests/integration/research-automation-metric-methods.test.ts`.
It uses real synthetic v2 XLSX and real persisted services. Nothing was run on
Windows. Linux steps for the coordinating lane:

1. Run `scripts/generate-foundation-contract.mjs` to produce
   `automation-metric-source.generated.ts`.
2. Run typecheck, the test above and `research-automation-metric-report.test.ts`.

The coordinator additionally verified real REPORTS placement, independent
Insight delivery, service-owned method retention despite a presentation adapter
omitting it, and query-only historical report reads with Python unavailable.
The out-of-request zero-write regression failed on the initial bridge (nine
database changes), then passed after the preflight repair. Full release/CI
evidence and remaining limitations belong in the handoff.

## Report presentation

`metric-method-report.ts` projects frozen output into M03/M04 without invoking
the calculator. M03 shows ALL totals and source-cell examples; M04 shows the
saved top-shop ratios, their numerators/denominators, actual shop counts and
without-top-shop sensitivity. WIDE/CORE remain unavailable, never zero. The
existing Report Kit typography, palette and separate Market/Insight exports
are retained. Generic sample output does not bypass classified section readiness.

## Deliberate limits

The source context is literal operator-supplied material, not a verified UI
filter audit. Version 1 admits no classification sidecar. Existing preparation
and readiness readers repeat their source verification during execution;
historical report reads do not. Resolution uses the declared bounded Foundation
inventory reader, so a corrupt or oversized inventory fails closed rather than
silently selecting a substitute. Very large method snapshots can exceed the
existing report bound and are reported as a method failure, without unchecked
numeric fallback or discarding the independent Insight draft. No public upload
endpoint or automatic authenticated Metric export was introduced.
