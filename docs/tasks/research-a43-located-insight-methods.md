# Research A43: located Insight methods, wave 2

Date: 2026-10-01. Implementation authorized by the owner's continuation of A42.
Base: A42 `23d4fb75147789079271f2d59489929d92f8cb2f`, draft PR #101.

## Deliverable

Implement the adopted bounded I01, I02, I04-I10 and I13 family. Preserve the
approved report design. Capture exact owner declarations, located coding and
corpus-only counts; no provider, AI generation, inferred people or market claims.
Use existing report storage/verified package interfaces instead of a new ledger.

Authority is the unchanged A41 qualitative profile, adoption document and A40
recipes. Historical proposal labels are superseded only within A41 adoption.
Codebook `located-evidence-v1-draft` is pinned; no newly invented NLP taxonomy.
Explicit source-linked normalized annotations may enter as declared coding;
pointer validation is not semantic verification. Pending suggestions are never
accepted merely because their pointers resolve.

## Parallel ownership

1. Located methods: new qualitative schema/generated types, pure methods and
   owning unit tests. I01 brief plus I02/I04-I09 located outputs. Publish the
   input/output contract early for integration.
2. Corpus counts: separate count module and owning tests for I10/I13. Consume
   the shared schema; do not edit it concurrently. Preserve included/excluded/
   unreadable/pending/unclear/uncoded and multi-code coverage. No final n/N until
   the eligible included denominator is complete; zero denominator has no ratio.
3. Release inventory: read-only PR dependency audit and a scoped release note.
   No merge, retarget, remote process or live filesystem mutation.

Coordinator owns shared registrations, retained report integration, docs,
workflow changes, CI and review. Workers may not commit/push, add dependencies,
change migrations or run Windows tests/typechecks/builds/browser code.

After the release audit finishes, that worker may implement the isolated
located-section renderer. A fresh reader performs the independent boundary
review. At most three workers operate beside the coordinator.

## Required invariants

- Exact source bytes and record/quote locators; duplicate locator references
  are not extra records, identical text at different locators stays distinct.
- Negation, conditions, hearsay and attribution remain visible. No star-based
  sentiment, guessed journey, inferred motive or complaint-only unmet need.
- I06 supports explicit within-record order only. I07/I08/I09 require the
  relevant same-record source relation, not disconnected matching fragments.
- Corpus/codebook order and membership are frozen. Counts describe this corpus,
  not people, prevalence or the market. Unknown external sampling stays explicit.
- Replay preserves prior output bytes and request identity. New optional
  method input never silently changes old report artifacts.
- No upload/AI coding editor is implied by method implementation. Missing run
  inputs remain missing and cannot block unrelated existing methods.

## Operator input and output

The existing report version and prepared-assembly JSON request may add
`locatedInsightMethodsPath` alongside `reportPresentation: "report-kit-v1"`.
The path selects one descriptor already retained in the exact source package,
not a filesystem path or an uploaded document guessed by the renderer.
The descriptor is the `input` definition of
`contracts/analysis/located-insight-methods.schema.json`. Its source paths and
digests must belong to the same package. Records use RFC6901 pointers to exact
JSON string/null values; annotation spans use half-open UTF-16 offsets. No
whitespace, Unicode, case or source-text normalization is implicit.

The source package must also retain the exact adopted qualitative profile and
adoption document bytes. At most four referenced JSON source files and an
8 MiB retained evidence bundle are supported. Other native source formats need
a separately evidenced normalization adapter; they are not silently parsed.

`located-insight-bundle.json` retains the verified output, descriptor and
source/authority bytes. Its digest enters semantic identity. Using one bundle
lets quote, descriptive Market and located Insight supplements coexist under
the existing 40-artifact report limit. There is no new table or migration.

I13 counts exact literal phrases only: case and whitespace remain distinct;
each counted code label and quote must equal its declared phrase. This does
not implement alias merging, sentiment about a brand or broader content coding.
The report retains original attributed text even for hearsay and negation.
Supplied `HUMAN_REVIEWED` metadata remains a declaration, not an application
permission or approval receipt.

The packet/snapshot section-status inventory is unchanged. Supplement content
is labelled separately, so the cover's packet count is not used as a claim
that these ten methods have run for every report. This wave adds ten bounded
method implementations; it does not make all thirty sections autonomous.

## Verification and release

Use test-audit: primary behavior proof at each owning boundary, small independent
expected fixtures, no source-grep or test-only production API. Root executes
focused checks then release checks on Linux CI only. Windows is static editing,
contract generation and Git only. New rendering needs bounded Linux visual
confirmation while keeping the approved design.

No merge, live migration, provider call, paid collection or Fedora activation
is authorized by this code task. Release preparation inventories dependencies;
the exact integrated release and data readiness still need acceptance.
