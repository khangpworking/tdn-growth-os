# Supplemental method revision client

Date: 2026-10-04. Plan P3.5 and bounded source integration for M08,
M10/I11/I12/I16. Uncommitted development tree; not the deployed Fedora runtime.

## Completed

The browser revision client previously validated only ordinary, classified Metric
and accepted Insight revisions. It rejected the existing quote and bounded-method
requests before sending them to the already implemented OWNER endpoint.

The client now uses the canonical generated request types and precompiled schema
validators for both additional variants. It preserves the exact package ID,
manifest/content digests, descriptor path, previous report pair and retry key.
Both USE_PACKAGE and SKIP are explicit; Metric and native-review choices must
remain KEEP. No default source, automatic retry or source admission is invented.

Changed files:

- frontend/src/research-automation/report-revisions-api.ts
- scripts/generate-report-validators.mjs
- frontend/src/generated/report-validators.generated.d.ts
- frontend/tests/research-report-revisions-api.test.ts

## Evidence

One client-boundary regression owns this gap. Existing backend persistence tests
cannot observe the browser rejecting a valid request before HTTP. The regression
uses the actual client and generated validators, with only HTTP responses stubbed;
it introduces no production-only test seam.

- Before fix: Linux client suite 5 PASS / 1 FAIL. Valid quote request failed at
  createReportRevision with the existing contract rejection.
- After fix: client and mounted report-version suites **10/10 PASS**.
- Linux frontend validator generation, typecheck and production build PASS.
- Invalid mixed variants, source replacement, missing/malformed exact identities,
  traversal path and extraneous SKIP fields are rejected before fetch.
- Ambiguous connection failure sends once; explicit retry retains identical body.
- Existing build warning for a main chunk above 500 kB remains; no performance
  claim or full release-suite claim is made.

Verification used the existing disposable Linux checkout, not the active operator.
No Windows project checks, migration, real data/provider/model call, business
write, commit, deployment or approval occurred.

## Remaining

This closes the browser transport rejection only. It does not provide a source
picker, upload/intake producer, real package, approved analytical result or complete
automation. Source-native M08 intake and suitable real inputs remain next work.
M10/I11/I12/I16 still expose only their currently authorized gate/inventory outputs.
No section completion count increases.
