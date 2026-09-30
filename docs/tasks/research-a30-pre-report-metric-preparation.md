# Research A30 — pre-report Metric input preparation

## Purpose

Establish the pre-report side of the report-first lifecycle break. One exact
source selection can become a verified canonical input and queryable SQLite
projection before readiness or an approved section calculation runs. A30 does
not yet require existing calculation/report entry points to consume that
preparation; that consumer gate is a later boundary.

The structured-unit approach is informed by Zhao and Yao, “Structured AI
Agents for Reliable Visualization Report Generation” (IEEE VIS×GenAI 2025),
but this implementation does not execute model-generated code.

## In scope

- Closed request selecting an exact ACTIVE workspace, finalized source package,
  package manifest digest, workbook path, manifest path and optional labels path.
- Input-only normalization with no `calculateMetricScopes()` call.
- Canonical normalized-input, receipt and result artifacts.
- Reuse of A12 dataset/source/row tables and a new immutable preparation lineage
  row in migration 0036.
- Exact retry with zero database mutations and full source/artifact/projection
  replay.
- Derived artifact sizes are rejected before publication or database mutation
  when they exceed the bounded replay limit.
- Offline CLI for an operator-owned database and artifact root.

## Acceptance

- The prepared input preserves missing versus observed zero, `UNKNOWN`, exact
  evidence references and the frozen WIDE policy.
- A changed or invalid source selection fails before preparation persistence.
- Artifact, manifest, source, projection or lineage drift fails closed.
- No report version or metric result is required or created.
- Existing report-origin A12 replay remains compatible.
- Migration 35→36 and idempotent rerun pass.

## Out of scope

No M03/other section calculation, SectionRecipe executor, claim, ChartSpec,
narrative, AI call, human decision, dashboard, HTML/PDF report, provider call,
source collection, API or UI. Existing direct calculation/report commands are
not changed or presented as preparation-gated by A30.

## Verification policy

Use the existing normalization integration owner plus one A30 integration owner
for persistence/replay and migration. Do not add browser, race, load, stress or
duplicated full-flow tests. Windows tests/build/typecheck are not release
evidence; Linux CI is authoritative.
