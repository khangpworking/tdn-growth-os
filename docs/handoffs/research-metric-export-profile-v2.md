# Metric export profile v2 handoff

## Completed

GPT took over the implementation while Claude quota was unavailable. The
existing signed-in Metric UI supplied an original Shopee export. The new
explicit profile reads its reordered columns and slug product URLs, while
the legacy profile remains unchanged. Profile/version/header declarations
are paired by the canonical JSON Schema; TypeScript was generated on Linux.

Linux affected checks passed 19/19, with zero skips, across the normalizer,
preparation, readiness and calculator suites. Backend TypeScript passed.
The new v2 regression failed against baseline `ecfa251` with
`INVALID_MANIFEST`, then passed after the repair. The initial isolated archive
was missing its Git-boundary marker, so one CLI outside-Git test failed for
environment setup. After restoring that test boundary, all affected tests
passed. A subsequent rejection-locator assertion was corrected to identify
the conflicting shop cell rather than the initiating product URL cell.

The actual offline normalization CLI accepted 223 records and wrote a private
bundle with no database mutations, AI calls or provider calls. All source
cells and lexical numeric values are retained. Final-head CI for this new
profile slice is not yet verified at this documentation checkpoint. Independent
read-only GPT review found no actionable issue in the schema, mapping and test
scope; it did not attest private-source completeness or variant identity.

## Source audit

The original workbook and capture metadata remain outside Git. Its measured
period is 2025-10-02 through 2026-09-28, not the requested end of 2026-10-01.
The source UI disallowed later dates. The export maximum was 223 records;
its rounded broader-query headline does not prove export completeness.

The keyword selection includes nonfood records, including skin masks and
fishing bait. Food-category membership alone also does not establish the
approved product-market membership. No label sidecar was assigned.
Unlabelled rows remain available for ALL-only sample calculations; they are
not automatically promoted to frozen UNKNOWN decisions, WIDE or CORE.

The exact selected listing is present at row 46, verified by product URL,
shop URL and composite ID. An initial diagnostic compared only canonical
URLs and incorrectly reported absence. The private audit metadata records
the corrected identity check. The exported title differs from the owner URL
in pack size; listing identity does not establish variant identity.

Acquisition timestamp and commercial precision remain unconfirmed. The UI
session made one analysis query and one download using the existing account;
point usage and monetary cost were not verified and are not claimed as zero.
No account purchase or subscription change occurred.

## Still open

- Exact Foundation package and confirmed-run attachment with source filter,
  partial-period and sample-coverage metadata.
- Frozen full Metric output for M03/M04, not just an M03 summary.
- Genuine classification evidence for WIDE/CORE and remaining source operands
  for the other sections and real-world cases.
- Claude final design approval and owner final-report approval.

The automated web report has not yet been changed to consume this export.
No migration, dependency, active operator data, runtime, deployment, real
business decision or provider collection endpoint was changed.
