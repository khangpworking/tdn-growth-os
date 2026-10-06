# Handoff: independent source methods and attributed M09 dates

Updated: 04/10/2026. Unreleased dirty tree on `0116091`, branch
`fix/research-real-world-audit`, draft PR #110. No commit, merge or deployment.

## Completed

- Extracted `buildVerifiedMethodPacketSources` from the existing report-method
  extension. A verified Foundation package can now run the adopted bounded
  M10/I11/I12/I16 gates without a Metric workbook/result. Existing callers still
  verify their exact calculation/claim bytes before decision packets. No
  forecast, experiment execution, conversion rate or human approval is granted.
- Connected the existing M09 method and report renderer to `launch_date` from
  already admitted Kalodata detail captures. This is an attributed, unclassified
  source statement, not a verified launch event or explanation of sales.
- Same provider product ID and exact date value across query windows produce
  one statement with every contributing capture retained. Different date values
  remain separate with conflict references; no latest-value resolution.
- Publication time stays unknown. Collection time and query windows remain in
  lineage. Valid calendar dates outside the measurement period remain visible;
  malformed dates retain their literal text and have a null parsed date.
- New normalization/package identity is v2; the v1 reader is retained. No
  rewriting of prior reports, new provider calls or product-specific branches.

## Changed paths

- `src/modules/analysis/report-method-packets-extension.ts`
- `tests/integration/source-only-method-packets.test.ts`
- `src/modules/analysis/research-automation/descriptive-method-bridge.ts`
- `tests/integration/research-automation-methods.test.ts`
- Progress, plan, inventory and status documentation.

## Evidence

Linux scratch only; no Windows project tests, build or typecheck.

- Source-only package plus existing extension/prepared-report tests: **7/7
  PASS**, root typecheck PASS. Real Foundation intake and query-only verified
  replay; no Metric bundle supplied by the fixture.
- M09 regression failed on the original bridge at `0 !== 3`, then passed after
  repair. Its fixture supplies raw provider responses through the production
  collection/worker path, not prepared method results. The initial fixture
  counted the quick-search detail call as a collection window; that was fixed
  before the final RED/GREEN pair. No production assertion was weakened.
- Final descriptive bridge/extension/method group: **31/31 PASS**, root typecheck
  PASS. Duplicate windows, conflicting dates, malformed dates, source pointers,
  report rendering and read-only replay are covered. Existing no-date fixtures
  still have empty M09 rather than fabricated events.
- Separate compatibility proof: generated a synthetic report using the actual
  pre-change v1 bridge, switched to the v2 code, then replayed query-only with
  the active calculator unavailable and the active adoption hash changed.
  Expected and returned report SHA both:
  `e8f113b7bad7f29627f51a34365eebb80e9e9c770f703f5e062da6ccd8706755`.
- `git diff --check`: PASS at this checkpoint. No full release suite or CI run.

Logs outside Git: `tdn-source-only-gates-validation.log`,
`tdn-m09-launch-red-final.log`, `tdn-m09-launch-green-final.log` in the
coordinator's `artifacts/research-execution-20261003/` folder. Compatibility
fixture and source are private Linux/coordinator artifacts, not committed data.

Read-only, digest-checked inspection of prior real capture shapes found 39
Kalodata detail responses each for the thermos and handheld-fan audit runs;
their top-level fields include `launch_date`. This establishes field presence,
not correctness or current-tree real report acceptance. The jelly audit run
has no retained collection detail response. No provider call was made.

## Review and remaining work

GPT inspected both changes and owning validators/readers. ZCode's independent
multi-file review timed out at 240 seconds; no independent review approval is
claimed. Small single-file ZCode probes succeeded, which does not prove long
tasks are reliable. Claude's separate Insight UI job is still in progress.

- G source admission, report revision, renderer and UI are **not yet wired into
  automation**. The verified source-only boundary removes an unnecessary Metric
  dependency; it is not completion of M10/I11/I12/I16.
- M09 currently uses captures already admitted for descriptive measurements.
  Source-only event records, additional event sources, substantive driver
  interpretation and real three-case acceptance remain open. Oversized source
  date statements fail the method bound instead of being truncated.
- M08 still lacks verified variant/pack/mass/purchase-condition linkage. Field
  inventories are not a substitute for those inputs.
- No full-section analytical completion count is increased. No final report
  design/PDF acceptance, business acceptance or live activation is claimed.

Next: audit and integrate Claude's I06/I09/I10/I13 UI; connect G source inputs to
the existing exact-version report path; then same-tree real-data acceptance.
No new business decision is requested by this bounded mapping change.
