# Research A31 — preparation-bound 30-section readiness

## Purpose

Evaluate the 30-section planning catalog before calculation, using one exact,
replay-verified A30 preparation rather than an already-created report version.

## In scope

- Exact preparation digest plus exact catalog bytes/digest.
- One closed deterministic readiness result with a content identity.
- `PRESENT`, `ABSENT` and `INVALID` input checks with evidence references.
- `READY_TO_CALCULATE`, `BLOCKED` and `INVALID` section states.
- `UNKNOWN` labels remain valid frozen decisions; A30's version-bound
  `wideUnknownPolicy` remains unchanged and no WIDE result is calculated here.
- Offline CLI writing one owner-only result outside Git.

## Current expected outcome

For the synthetic A30 shape with complete frozen labels and verified normalized
locators, M02, M03, M04 and M13 are ready to calculate. The other sections stay
blocked by their actual missing prerequisites. This readiness does not mean a
section is calculated, drafted, interpreted, reviewed or approved.

## Out of scope

No database migration or readiness ledger, calculation, SectionRecipe executor,
claim, chart, AI call, human decision, API, UI, report, provider call or source
collection. Existing report-version readiness remains unchanged.

## Verification policy

One unit owner covers all catalog inputs, deterministic replay, label absence,
digest drift and unknown future input IDs. Do not duplicate A30 persistence or
A28/A29 report-version readiness tests. Linux CI is authoritative.
