# Research automation v1 backend slice

Status: implemented on the draft branch; Linux integration passed. Exact-head PR CI, final design review and owner approval remain release gates.

This task adds the smallest durable execution path for an explicitly owner-started
Vietnam research run:

```text
start + quick search -> AWAITING_SCOPE -> explicit scope confirmation
  -> collection -> RENDERING -> immutable partial draft(s)
```

The analysis service owns request-key idempotency, revision guards, scope policy,
capture/artifact lineage, usage attribution, cancellation, and report output
manifests. The worker owns only claiming and settling execution steps. The
operator's existing one-executor database lock remains the process boundary.

Raw provider exchanges returned in a settled provider result are
content-addressed capture artifacts. Request and response bytes are retained
losslessly as base64 fields inside a canonical capture envelope; the public
projection exposes only safe metadata. Progress callbacks do not yet carry raw
bytes, so an in-flight exchange interrupted before the provider returns has no
capture row and remains an explicit unknown-cost/coverage state. A provider
failure or missing capability remains visible as a blocker. Unknown cost is
stored as `UNKNOWN`; provider-specific credits are not combined into a monetary
total. An account-wide provider balance delta is retained in the raw capture,
but is not attributed as this run's charge; cost reconciliation remains
`UNKNOWN` whenever paid usage is not directly settled. Period sums are not exposed as comparables unless every contributing
capture and metric unit can be represented by the downstream report contract.

The workspace is verified through `FlowDiscoveryWorkspaceReader`; migration
0038 intentionally has no cross-Box workspace foreign key. Draft semantic JSON,
HTML, and real PDF bytes (when an operator renderer is configured) are immutable
artifact rows. Reports remain partial and `UNREVIEWED`; no B7-B10 approval is
performed by automation.

The service/API/worker are wired into the operator, with the offline report-kit
renderer and local Chromium PDF port. Synthetic Linux tests exercise API
receipts, readonly reads, interruption/no provider replay, cancellation,
invalid-PDF rejection and actual separate PDF output. Browser acceptance uses
the production bundle and a disposable no-provider operator, not the live web.
Final release evidence and pending design/owner gates are recorded in
`docs/handoffs/research-automation-v1.md`.

Not implemented in this slice: owner photo input, automatic Metric acquisition,
Apify/Shopee product detail, automatic SerpApi supplementation, provider-side
mapping of owner scope terms, evidence-backed CORE/WIDE classification, and
completion of all 30 analytical sections. These omissions must not be
interpreted as completed capabilities merely because a run reaches DRAFT_READY.
