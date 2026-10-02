# Automated research v1: implementation handoff

Draft PR: https://github.com/khangpworking/tdn-growth-os/pull/109

Implementation commit: `9d840784c0746b83275cc6afa24eae1c4b94de22`, based on main `2f47e119fa68d540ab01e314af6284dec5786ae7`. Subsequent delivery-documentation commits do not imply activation. Use the exact final PR head and its CI when reviewing or preparing a release.

## Scope

This is the ADR 0011 thin vertical slice, not an assertion that all 30 sections are automated. It adds an explicit owner-started run, bounded quick product discovery, one immutable scope confirmation, durable progress, cancellation, raw-source lineage, and two independent frozen draft outputs. Country is Vietnam. Requested annual/custom dates remain visible and are never silently replaced by a provider's query window.

The approved design decisions are preserved under `docs/research-automation/adr/`. This implementation does not change B7–B10, Content Studio generation, existing manual research, or owner business authority.

## Source readiness

- Kalodata is the primary product discovery/period-detail adapter. It is called only after an explicit owner action. A missing key produces an honest unavailable result.
- SerpApi has a tested current-web adapter, but it is not substituted for product-period evidence or silently run by this first executor slice.
- Metric requires a verified authenticated export; no unattended connector is claimed.
- Apify/Shopee product-detail collection is not wired. A review actor is not assumed to provide listing images/descriptions or verified product lineage.
- Source blockers remain visible. No source is replaced with fixtures in real mode.

The confirmed definition/interview/inclusion/exclusion terms are retained as owner context. This slice does not claim that every provider query applied those conditions, or classify the resulting products as CORE/WIDE. Source-filter mapping and evidence-backed classification remain separate unfinished work.

## Reports

Market (M01–M13) and Insight (I01–I17) have separate HTML views and PDF downloads. Source context is separated from a completed analytical method. Sections lacking verified method inputs remain blocked. No AI narrative, growth inference, market share, health assertion, or business decision is invented.

The renderer reuses the bundled, offline Montserrat report-kit assets. The executor prints the frozen HTML with local Chromium once, stores actual PDF bytes, and serves only retained files. PDF download does not rerun research or call a model. Without Chromium configuration, web output remains available and the PDF link explains its unavailability.

## Configuration and release boundary

Existing explicit database/artifact paths, OWNER token or localhost test session, Host/Origin gates, and one-executor lock remain in force. Research reads use a separate readonly/query-only handle. Only the owner-enabled operator starts the worker or performs interruption recovery.

Server-only optional configuration:

- `TDN_KALODATA_SECRET_KEY`
- `TDN_SERPAPI_API_KEY` (adapter available; not an automatic fallback)
- `TDN_APIFY_TOKEN` (capability only; no product collection)
- `TDN_RESEARCH_PDF_CHROMIUM=/usr/bin/google-chrome`

Migration 0038 must be applied explicitly to a recovery-backed database before activating this release. Startup never migrates or seeds. Do not activate this branch against the running operator merely to test it. Use an isolated checkout, synthetic disposable database, no provider credentials, and a separate port.

Required activation sequence after review: owner saves open edits; verify exact approved commit and prior migration bytes; build with pinned Linux Node; gracefully stop only the verified operator; take a quiescent recovery copy; explicitly migrate; start the release with existing authoritative paths; verify readonly requests, data lineage, and output rendering; retain the previous checkout and recovery instructions. Rollback after schema migration requires an explicit compatible-schema assessment, not an automatic data overwrite.

## Validation status

On the isolated Fedora checkout, the full `npm run check` passed: 745/745 backend tests and 194/194 frontend tests, generated-contract checks, backend/frontend typechecks and production build. Configured local Chrome exercised actual separate Market/Insight PDF output. Later frontend-only polishing is checked with a production rebuild, frontend tests and real-browser acceptance; final PR CI is the exact-head release gate.

The production-bundle browser journey passed at desktop and 390px mobile: product/category editor, 365-day default and custom 360-day period, explicit start, unavailable-source scope, explicit confirmation, two separate web reports, honest missing-renderer PDF state, persistence after reload, no horizontal overflow, and demo isolation. It used an isolated synthetic database without provider credentials. Screenshots and the acceptance receipt remain outside Git; see the browser acceptance handoff.

Independent Luna inspection covered provider evidence binding, API ownership/read-only boundaries, renderer cleanup and shutdown. Findings were repaired before the final Linux check. Prior migrations 0001–0037 and dependency manifests remain unchanged. New migration 0038 SHA-256: `64aa8b07bb955f6bd02f64a8ce7c1f6c31a82facbab24fb744f8bb0ca83c03c0`.

The final credential-echo inspection additionally found JSON Unicode-escaped secrets could bypass the raw-byte guard. The expanded provider-boundary regression failed on the pre-fix Linux source and passed after checking parsed JSON values/keys. The affected provider suite passed 10/10 and backend typecheck passed; response bytes are rejected, not silently rewritten. Final frontend typecheck, 194/194 tests, build and desktop/mobile browser acceptance were repeated after the UI polish.

No Windows tests, build or typecheck were run. No live provider calls, real business records, running-operator restart, merge or deployment occurred.

Claude “Competitor mockup report design” audits only the rendered Market/Insight report design (web/PDF), followed by owner acceptance of those reports. It does not approve the automated-research application UI, execution architecture or whole feature. Code review, application UI feedback and owner merge/deployment authorization remain separate; a code/test pass does not substitute for report-design acceptance.

## Owner-authorized pre-merge review (2026-10-02)

The owner authorized merge if code review passes. Root and three rotated Luna
review lanes inspected lifecycle/persistence, provider/evidence/report boundaries,
and API/UI authorization and async behavior. Five findings required correction:

1. Shutdown could miss a source operation still reading its request artifact and
   let a provider call start after the stop request.
2. Provider cancellation or interruption left downstream steps pending on a
   terminal run.
3. Failure inside the final report transaction left the run rendering instead of
   recording failure; the transaction must publish neither report partially.
4. Failed or ambiguous source windows incorrectly extended observed coverage.
5. SerpApi normalized every returned organic row instead of enforcing its
   requested ten-result bound.

The tests-first Linux run reproduced all five findings through six failing
assertions/cases (14 passed, 6 failed). After correction, backend typecheck and
all 27 affected lifecycle/provider/report/API tests passed, with local Chromium
configured and no skipped tests. Raw-source tables now call their dates query
periods rather than observed coverage, including a plain-language warning.
No Windows execution, live provider call, runtime restart or authoritative
database write was used. Exact final-head CI is recorded in the PR review handoff.

Execution mechanics are now numbered ADR 0006 to avoid colliding with the
pre-existing ADR 0005 report-evidence ledger; that accepted ledger is unchanged.
