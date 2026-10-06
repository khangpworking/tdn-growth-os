# B1-A: classified Metric calculation in a new report pair

Checkpoint 2026-10-04, unreleased tree on `0116091`, draft PR #110.
This follows the rule-adoption and membership-receipt slices. No real labels,
provider collection, live migration or deployment are authorized by this record.

## User-visible result and boundary

The existing report-revision endpoint now accepts the separate closed
`automation-classified-report-revision-v1` request. It selects an exact previous
pair, rule adoption and receipt set; both source choices must be KEEP. The
original revision-v1 request remains unchanged.

All source records must have an explicitly accepted disposition in that set.
Partial acceptance cannot shrink the universe to unlock a calculation. UNKNOWN
remains in ALL, outside WIDE and CORE. The original normalized input and raw
unclassified snapshot remain retained; a separate classified snapshot projects
the accepted labels into the existing integer calculator. No new classifier or
alternative arithmetic was introduced.

M03 renders ALL/WIDE/CORE totals; M04 renders group composition, shop concentration
and top-shop-removal sensitivity with their own denominators. Missing values,
observed zero and an ineligible ratio remain distinct. These are bounded sample
outputs, not annual growth, whole-market coverage or completed M03/M04 analyses.
The completed-analytical-section counter remains unchanged at zero.

## Persistence and replay

- Reuses report attempts, exact predecessor admission, retry, cancellation and
  atomic Market/Insight pair publication. No new migration or report ledger.
- Canonical proof artifact links exact receipt/proposal digests and adoption.
  Classified input keeps original source locators plus label-proof locators.
- Report reads reconstruct the accepted input and provenance, verify the saved
  snapshot and proof bytes, and do not invoke the calculator or a provider.
- A newer rule does not invalidate an old classified report. Missing selected
  membership or proof bytes fails closed; read-only replay never repairs them.
- A later KEEP revision may retain the frozen classified result. Its separate
  pair-scoped acceptance ledger still starts pending; retaining a historical
  result is not a new approval.
- Classification-only revisions reuse the exact prior Insight AI execution.
  They do not dispatch again, and query-only reads verify the original execution
  dependency. Legacy source-revision behavior is not silently rewritten.

## Regression evidence

The existing persisted HTTP journey is the primary owner. It uploads synthetic
OOXML, confirms scope, creates reports, adopts rules, proposes assignments,
accepts subsets and publishes a new classified pair for three industry names.
Expected arithmetic is independent of the calculator: ordinary 150/100 totals,
observed-zero classified totals, and missing revenue with unavailable ALL ratios.
Old report HTML stays byte-identical; classified reports replay through a newly
opened read-only API. Exact reordered retries, partial-set refusal, later rule
adoption and missing evidence are exercised in the same journey.

Two actual integration failures were reproduced before correction:

1. The report renderer assumed every METHOD_OUTPUT had a descriptive-method
   view. Classified Metric instead uses its own section renderer. The worker
   failed with an undefined `html` property; routing now respects that owner.
2. The shared revision worker dispatched I14 again even though only Metric
   classification changed. A synthetic loopback model observed two calls where
   one was expected. New classified revisions now read the original retained
   execution, preserving its unreviewed candidate and parent identity.

After the second correction: Linux typecheck and affected API/Metric/native
review/I14/calculator/report group passed: 78 PASS, one optional PDF test skipped.
The three-case persisted journey verified exactly one synthetic model call,
including the classified revision and reopened read-only Insight. This closes
the RED two-calls regression without weakening its assertion. Twelve browser
views (three synthetic inputs, M03/M04, desktop 1440 and mobile 390) passed section
navigation, keyboard details/table focus and no page overflow or console errors.
Screenshots and HTML are private coordinator artifacts, not real-data acceptance.

## Remaining work

UI prerequisite follow-up: the verified membership review now exposes sorted,
unique first-contributing `acceptedReceiptIds`. Overlapping acceptance does not
replace this list. The owning persisted journey reconstructs the classified
request from a fresh GET, so browser memory is not needed to recover selections;
pending records still supply no receipt. Linux generation/typecheck and the
three-case journey passed after this additive unreleased API change.

ZCode delivered the isolated `metric-membership-api.ts` client. GPT's audit found
missing exact route identity checks and an empty-universe completeness mismatch.
Linux regressions reproduced both, then passed after correction. Precompiled
schema validators remain CSP-safe; the revision client accepts the separate
classified request with exact receipts and KEEP-only sources. Final Linux frontend
typecheck and both client suites passed (13/13). The temporary scratch-only preview
test was removed; its synthetic HTML/screenshots remain outside Git. Client availability
does not imply a rendered, accepted or usable owner screen yet.

Separate UI actions for rule adoption, assignment selection and creating the new
classified pair are now implemented and independently reviewed. Next method-family work is Insight accepted coding
for I06/I09/I10/I13, with its own span/relation/corpus semantics. Real rule/label
approval, same-version three-product acceptance, two PDFs per real case and full
release checks remain open. No section is marked complete by this slice.

Worker evidence: ZCode GLM-5.3-Flash high passed a small two-file reading task,
but the subsequent four-file review timed out at 240 seconds. A later retry of
a bounded two-file read succeeded in 29.2 seconds; that is not code approval. Claude's scoped
Insight diagnosis reported its session limit. Neither is independent approval;
GPT performed the integration audit and Linux verification.

## UI finish checkpoint, 04/10

The parent version panel now gates classification writes on verified source
readiness and explicit KEEP/KEEP choices. It gives specific recovery guidance
for loading/failed inventory, changed Metric and skipped native review. The
parent-mounted regression failed before the fix in all five forbidden states
and passed afterwards. Linux focused frontend 19/19, full frontend 219/219,
typecheck and production build passed. Existing chunk-size warning remains.

The independent finish reviewer returned Ship with no material findings after
the correction. Four synthetic desktop/mobile row/confirmation captures remain
valid because the gate fix changed no layout. The independent documenter found
an ordinary extension and instructed preservation of DESIGN.md and its sidecar.
This is not proof of a real persisted browser journey or three real PDFs.

Worker attribution: ZCode small read passed in 25.6 seconds; a subsequent
two-file progress edit succeeded. The earlier 480-second edit timeout produced
no UI code. Claude's later source-reader task completed after quota reset.
GPT owns the UI fixes, audit and Linux validation; no live operator was changed.
