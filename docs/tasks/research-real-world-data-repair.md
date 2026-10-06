# Real-world research: data-loss repair and remaining analysis integration

Date: 2026-10-02. Base: `9355f57187437fdc22089fecdcffba612fe7673f`.
Branch: `fix/research-real-world-audit`. This is a partial repair, not acceptance
of the 30-section automated reporting feature.

## Evidence and causes

The three isolated real-world cases produced separate web/PDF files, but no
completed analytical section. Generation, persistence and PDF export were
insufficient acceptance criteria for the requested product.

1. Kalodata returned Vietnam as `vn`; the parser accepted only `VN`.
2. An explicit empty product selection performed no collection but claimed
   collected coverage.
3. The provider's window observations were discarded by `source-binding.ts`:
   `comparables` was always empty, even after a successful collection.
4. The report peer table returned the first comparable window/metric group
   only. It also failed to bind the displayed dates to capture dates.
5. The new automation renderer does not execute the established source-package
   method pipeline. A section catalog entry is not a completed method.

## Implemented repair

- Claude: accept ASCII case variants of VN, keep wrong country/ID rejection;
  skip no-product collection truthfully; show actual recent discovery dates.
- Codex: retain each supported Kalodata revenue/sales observation with its
  exact product, query window and capture index. Preserve zero; omit missing
  values; reject mismatched or duplicate lineage. Do not use floating-point
  period sums as source observations or market totals.
- Every compatible explicit peer window/metric group is preserved. Selected
  products do not become approved peers automatically.
- Selected observations are readable in M13 with their capture digests even
  when no peer set was approved. No claim of completed M03/M07 is added.
- The report explicitly separates zero completed analytical sections from
  source/context sections. Blocked copy names the unconnected method pipeline
  instead of attributing everything to absent data.
- Renderer version advances to `automation-report-kit-v2`. Previously saved
  reports, source captures and run history remain untouched.

No migration, dependency, canonical API contract, live provider call, live
runtime restart, business action or deployment belongs to this repair.

## Validation ownership

`test-audit` authoring gate: provider-to-step projection owns retention of
window values and capture identity; report tests own visible multi-window
coverage and the distinction between observations and completed analysis.
Existing provider tests did not exercise the dropped projection; existing
renderer tests exercised one window only. No test-only production seam added.

Isolated Fedora, Node 24.15.0. No Windows tests/typechecks/builds.

- Before repair: six backend regression failures and the date-label frontend
  regression failed for the intended behavior. The added M13 observation test
  separately failed before its rendering change.
- After repair: full `npm run check` passed, 755 backend tests passed, one
  Chromium-environment test skipped; frontend 195/195, typechecks and build
  passed. After a table-width-only adjustment, focused report tests passed
  5/5 including actual Chromium PDF generation (no skipped tests).
- Offline exact-byte replay: 103 retained responses, no network transport.
  Thermos: 39/39 annual detail windows, 78 typed metric rows. Fan: 39/39
  windows, 78 rows. Jelly: four discovery details recovered, still no exact
  Shopee listing collection; no TikTok substitute was invented.
- Replay is a new private diagnostic projection, not a mutation or upgrade
  of the original run or a new provider acquisition.

Private validation root: `<private path on the test host, withheld>`.
Original evidence remains in its original private audit directory, outside Git.

### Rendered diagnostic projection

Impeccable/Antislop applied narrowly: retain the incumbent report theme, expose
source values and state limitations plainly. Read mode, ENERGY 1 / RHYTHM 1 /
MOTION 1 for the existing tabular appendix; no new chart or brand treatment.

- Content honesty PASS: actual retained observations only; explicit zero
  completed analytical sections, and no inferred peer approval.
- Navigation PASS: every table-of-contents anchor exercised on all six outputs.
- Rendering PASS: desktop 1440 and mobile 390, zero page errors or document
  overflow; wide evidence tables scroll instead of crushing the columns.
- Export PASS: six separate PDFs rendered from the offline projection.
- Detector: one advisory about an existing 26px heading against the older
  application DESIGN.md ramp. The report theme was not redesigned.

These checks do not replace the designated Claude report-design judge or owner
approval. Diagnostic projections and screenshots remain private outside Git.

## Required next implementation, not completed here

1. Normalize retained captures into the existing verified source-package and
   method-input contracts, with actual locators, period, units, scope and
   missing/zero distinctions. Do not manufacture package IDs/adoption receipts
   to satisfy method schemas. Reuse the existing method services.
2. Add run-bound input selection for Metric evidence. Kalodata selected-listing
   observations cannot satisfy M03/M04 whole-market prerequisites or WIDE.
3. Connect generic, source-located customer evidence for Insight. Product
   descriptions and sales are not consumer testimony. Do not automatically
   apply the calcium-only filter or tablet-price method to other categories.
4. Dispatch eligible methods and retain their actual outputs before rendering.
   Completed analysis, partial method output, missing evidence, missing binding
   and pending owner judgment need distinct machine-readable states.
5. Gate acceptance on supported section content with exact cited evidence and
   expected calculations, not on file existence or the number of headings.
   Re-run all three cases offline first; approve paid collection only for the
   independently identified missing sources. Report design still needs the
   designated Claude review and then owner approval.

This work has not made the three Market/Insight reports analytically complete.
