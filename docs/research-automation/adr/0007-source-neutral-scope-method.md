# 0007. Source-neutral scope method beside frozen M02

- **Status:** Accepted (Astra round 1 objection, resolved round 3)
- **Date:** 2026-10-01

## Context

My first plan mapped the definition card straight into today's Metric M02 (v2.0.0). That doesn't work:

- `m02-scope-method.schema.json` is fixed to Shopee/TikTok, VND, measurement dates, and the workbook/manifest/labels roles.
- M02's labels are coreCandidate / adjacent / outside / unknown.
- M08/P4 is tablet-quote arithmetic.

None of this fits arbitrary categories or open-web sources. M13, I03 and I17 are also tied to Metric-specific artifacts or calculation lineage.

## Decision

- Add a **new, versioned, source-neutral scope method** beside M02. Historical Metric M02 v2.0.0 and the other existing methods remain frozen and replayable.
- Never fabricate workbooks, dates or tablet units to satisfy an existing contract.
- Keep **desired scope** (what the owner approved, e.g. "Vietnam, last year") separate from **observed coverage** (what the data actually covers). A current listing snapshot is not annual evidence.
- **Rings:**
  - CORE ⊂ WIDE: WIDE is CORE plus the adjacent members.
  - UNKNOWN is kept separate, and nothing is forced into exclusive labels.
  - The UI calls the rings Direct / Near / Outside, with UNKNOWN shown on its own.
- Approving a classification **rule** is separate from accepting individual **memberships**. AI-assigned membership isn't accepted just because the owner approved the rule.
- A method only becomes eligible when source normalization and the method itself both support the input. Having compatible measures is not enough. M08 needs a unit-normalization method for each category.
- The minimal source-neutral changes that M02, M13, I03 and I17 need are made **explicit** in slice 1, not assumed to be reuse.

## Consequences

- The section renderers must accept the new scope lineage alongside the Metric lineage.
- Sections without a compatible method render blocked or not-run with a reason; they are never filled in approximately.
- The schema is versioned from day one, so later categories can extend it without breaking replay.
