# A42 wave 1 integration

Status: implementation checkpoint, Linux CI and visual acceptance pending.
Branch: `feature/research-a42-live-report-wave1`. Base: A38/A39 checkpoint
`ea38e7f8295c8cbd61ec7776c4363958867c1f10`; dependency PR #100.

## Delivered boundaries

- New `report-kit-v1` presentation in the retained create request. Absent
  selection keeps legacy HTML byte-for-byte. Historical replay and missing
  publication recovery rebuild with the recorded selection.
- Approved Market/Insight visual language, all 30 sections, static charts and
  evidence links. No sample report figures become evidence. Licensed Montserrat
  400/700 Latin, Latin-ext and Vietnamese fonts are bundled inline; only the
  new profile permits `font-src data:`. No scripts or remote resources.
- OWNER generation API and runtime wiring. Users explicitly choose a retained
  source member; intake remains separate. No latest-source selection, inferred
  labels, AI interpretation or provider collection.
- Stable request keys recover ambiguous responses. Committed retries verify
  their exact package without global discovery. UI reload selects the returned
  report/version/semantic identity, never the newest history entry.
- M05 exact-decimal source partitions, M06 literal supply inventory, M07
  declared-peer compatibility, M09 attributed events. Explicit normalized JSON
  descriptors, exact locators and adopted configurations are required. This is
  not automatic raw PDF/XLSX extraction or verification of business truth.
- Descriptor, output and an exact-byte evidence envelope are retained as three
  artifacts. Output affects semantic identity. The 40-artifact limit, migrations
  and legacy semantics are unchanged.

## Intentional limits

The web picker supports retained Metric Shopee Sheet1 under UNKNOWN-excluded-
from-WIDE. It does not upload files, select tablet quotes or descriptive inputs,
generate AI claims, or append a second version to a series. The descriptor is
already usable through the report service/CLI contract.

Fresh discovery verifies a bounded package inventory and fails visibly if a
package is corrupt or exceeds its read budget; it never silently hides evidence.
An already committed retry is isolated from unrelated packages. Browser reload
clears unfinished in-memory request keys: inspect history before starting anew.

Supplemental M05/M06/M07/M09 rows do not overwrite the catalog packet's older
delivery states; HTML explains this distinction. All 30 visible sections do
not imply all 30 methods ran, complete inputs, approved findings or trust grades.

## Validation and release

Tests cover actual HTTP-to-retained-report generation, exact UI selection,
legacy replay, extension retention, method/source boundaries and rendering.
Synthetic data only. Local work is contract generation/static inspection;
execution, typechecks, build and browser captures run only on Linux CI.

Follow A42's Fedora release checkout, actual schema-delta check, quiescent
recovery copy, same database/artifact/token paths and read-only activation
verification. Activation waits for CI, visual review, dependency integration
and explicit release approval. No merge, live migration, deployment, provider
call or real business write was performed by this wave.
