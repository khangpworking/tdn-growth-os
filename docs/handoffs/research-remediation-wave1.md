# Research remediation — wave 1

Date: 2026-10-02. Implementation branch: `fix/research-real-world-audit`.
Base: `9355f57187437fdc22089fecdcffba612fe7673f`.
Changes are uncommitted; not merged, deployed or approved as a complete report.

## Scope and ownership

Owner approved implementation of the [30-section plan](../tasks/research-30-section-remediation-plan.vi.md).
Claude Opus 5.5 high implemented presentation in three isolated files. GPT 6.1 Sol high
implemented the retained-field verifier, method inventory and integration tests;
a separate pass reviewed the root bridge. Root owns Foundation intake, worker
execution, persisted semantic output, historical read verification and Linux proof.
No parallel agents edited the same production file.

The business session `Review marketing framework files` confirmed this slice is
within A41: literal observations, located supply inventory, unranked peer inventory.
It did not approve a new annual-growth formula, generic unit-price formula or
promotion of qualitative coding to facts.

## Changed behavior

- Exact retained Kalodata request/response bytes are checked against product IDs,
  VN/VND request scope, query windows and numeric fields before method admission.
- Historical `INVALID_PAYLOAD` is accepted only after complete current raw-field
  revalidation. The original envelope and its original outcome stay unchanged.
  Other transport/provider errors are not treated as successful observations.
- `kalodata-product-detail-descriptive-v1` records raw/response digests, JSON
  field pointers, source query windows and original capture outcome.
- A real immutable Foundation source package is created. No Metric Result,
  provider identity, source timezone or representative sample is invented.
- The existing descriptive method executes independently of the old Metric-only
  report envelope. M05 retains literal measures with no undeclared sum; M06 counts
  located records, not unique products or total supply; M07 remains unranked when
  no explicit anchor/peer declaration exists. Empty M09 is not completed analysis.
- REPORTS owns method execution and retention; an optional renderer cannot silently
  discard the method payload. Insight-only runs do not create a Market package.
- Historical report reads verify retained package bytes and rebuild the method
  without mutation, provider calls or dependence on current mutable policy files.
- Existing old reports remain immutable. No automatic backfill rewrites them.
- Market and Insight remain separate web/PDF artifacts. A bounded method output
  is counted separately from a completed, accepted analytical section.

## Verification

All execution was in an isolated Fedora checkout on Node 24.15.0, not on Windows
or the active operator database. No live provider was called in this wave.

- Linux typecheck passed.
- Initial owner-boundary/unit/renderer proof: 36/36, including actual Chromium PDF export.
- With the method bridge deliberately disabled, the new integration test failed at
  `REPORTS must execute and persist the existing descriptive method`; restoration
  passed. This is a mutation negative control, not a claim to test the historical
  baseline commit without modifications.
- Raw-field and persisted-method focused proof passed, including raw/normalized
  corruption rejection with no writes or recollection.
- Full repository check passed: 772 backend and 195 frontend tests; typechecks and build passed.
  After the Vietnamese presentation cleanup, typecheck and 21 focused renderer,
  raw-field and persisted-method tests passed again. Do not describe these local
  isolated-Linux runs as final-head GitHub CI.
- Read/retry of the real offline method packages made zero additional DB mutations.

## Retained real-world evidence

Original three-case database was opened read-only/query-only. A different disposable
database/artifact root held new offline method packages. The harness replayed all
103 retained responses; network calls and new provider cost were zero.

| Case | Data available to the method | Actual bounded output |
|---|---|---|
| Thạch dừa exact Shopee listing | 7 discovery responses; no selected matching listing or collection | No method input fabricated; case still blocked on the exact Shopee source |
| Bình giữ nhiệt | 39 detail captures / 78 literal metrics | M05: 78 observations; M06: 39 records; M07: unranked inventory |
| Quạt cầm tay | 39 detail captures / 78 literal metrics | M05: 78 observations; M06: 39 records; M07: unranked inventory |

39 records are window-bound responses, not 39 products. The 13 query windows do
not by themselves prove a complete annual series, seasonality or additive totals.
Original run records and old report files were not changed. Replay evidence,
screenshots, PDFs and receipts stay outside Git.

## Presentation review and open work

Impeccable technical inspection retained the approved report-kit world. Its sole
static detector advisory was an existing 26px report heading outside the older
application DESIGN.md ramp; the report-specific design remains authoritative.
The older PRODUCT.md/app design documents have stale capability descriptions;
this task does not silently rewrite them.

Initial real-data browser inspection covered desktop 1440px, emulated mobile 390px,
all section links and six PDFs; no page errors or document-level horizontal overflow.
It exposed excessive technical identifiers in method prose and English scope copy;
one bounded cleanup moves identifiers to M13 and uses Vietnamese scope wording.
The second and final browser round passed all six reports again, including method
table row counts, section navigation, emulated mobile overflow and separate PDFs.
This is not designated Claude report-design approval or physical-device testing.

Standard independent Claude Opus 5.5 high review `review-muqrz52m-5efefx` was
collected on 2026-10-02. It requested changes before merge. Its findings and the
follow-up are recorded below. GPT's earlier independent bridge pass also found
the Insight-only coupling, fixed at the worker/report boundary.

## Independent review corrections

- Internal `automation-method:` source packages are excluded from the manual
  source inventory before its 100-package bound or expensive verification.
  Exact-ID package reads still verify them. The regression intakes 101 internal
  packages and retains ordinary inventory limits and corruption rejection.
- Historical report reads validate the already committed v1 method snapshot's
  schema/digest, retained package/descriptor, recorded authority, frozen run
  scope and collection capture membership. They no longer calculate again with
  today's method or authority constants. Full method execution/recomputation
  remains required for newly built/imported calculation output. This read path
  is not a general importer that authenticates an arbitrary self-hashed result.
- A descriptive method failure is recorded explicitly on Market. Its numeric
  fallback is suppressed, source-context evidence remains available, and the
  independently requested Insight report still renders. No automatic paid retry
  occurs. Cancellation retains its existing terminal behavior.
- Recognized binding normalization failures return an empty failed step alongside
  the untouched raw provider result. Service admission verifies step/capture
  lineage before committing and uses the same safe failure projection when
  invalid. Bounded captures and usage survive atomically; invalid comparables do
  not enter reports, and the error is `PROVIDER_OUTPUT_INVALID`.

Linux correction proof: typecheck passed; 47 focused Foundation, generation,
automation/provider and persisted-method tests passed; a further 28 method,
renderer/PDF and raw-verifier tests passed. A separate reader process disables
the active calculator and changes its authority constant while reading an
already saved report through a read-only/query-only connection.

Negative controls used isolated scratch source snapshots, never the operator:
the old bridge rejected that historical read; old service/binding lost the
normalized error/raw-retention path and blocked both reports on method failure;
the old Foundation listing failed with 101 internal packages. Restoring fixes
passed. One initial archive extraction was incomplete, so it proved only the
historical-read regression; the remaining controls were rerun with the correct
archived service/binding and Foundation baseline. No tests were weakened to
obtain green results. These are local Linux proofs, not final-head GitHub CI.

The subsequent independent pass identified an external-abort publication gap.
The service now recognizes an already-aborted signal, checks cancellation after
rendering and again under the publication lock, and settles REPORTS as CANCELLED
without publishing outputs. One table-driven owner-boundary regression covers
all three timings. Linux automation and persisted-method checks passed 23/23.
Against the isolated pre-fix service, the first case incorrectly read 11 artifacts
and the other two incorrectly reached DRAFT_READY. The fixed service was restored
after this negative control. No production-only test hook or cleanup sweep was
introduced.

Remaining review notes: exact package verification still incurs evidence I/O;
no integrity-bypassing cache was added. M07 deliberately uses unranked source
inventory without an explicit method peer declaration; selected UI peers do
not supply that declaration. The 8 MiB semantic bound remains a fail-closed
limit, not an excuse to truncate or silently expand an artifact.

## Subsequent offline methods and review follow-up

Exact-listing Shopee intake v2 and transport cancellation passed 27 owning Linux
tests; the revenue-ranked calcium v1 path is preserved. The exact v2 boundary
does not yet connect the automation UI to a paid collection or a generic coded
customer corpus. M03 temporal and M08 generic price arithmetic now have separate
offline contracts and synthetic Linux proof, without live source admission or
section-completion claims. The business session statically accepted the bounded
M03 semantics and closed its two M08 linkage/unit findings. Its later denominator
clarification 1.1 is recorded in the remediation contract disposition.

Independent Claude Opus 5.5 high review `review-muquhw79-zuelne` found no blocking
defect but identified two medium issues and a lower-severity error-copy issue:

- Zero/fractional count or zero mass must not discard unrelated quotes/operations.
  The business session confirmed operation-local unavailability, not whole-input
  rejection. The M08 owning regression now retains original values, blocks only
  consumed denominators and preserves unrelated eligible results.
- Report fallback citations now resolve COLLECTION capture ordinals through one
  map, not array positions. Reordered/gapped captures retain the correct source
  hashes; duplicate collection ordinals fail closed. Another step's same ordinal
  is not a collision. This does not loosen source verification.
- A failed descriptive attempt now says it failed in M05/M06/M07/M09 and M13;
  it does not misleadingly say the method was never connected. M13 includes the
  safe recorded failure code without paths, credentials or stack traces.

The two existing report-owner tests failed before the corrections (lost peer
rows and missing failure code), then passed. The final focused report/persisted
method suite passed 18/18 on Linux, including actual separate Chromium PDFs.
A disposable synthetic browser check at 1440px and 390px verified failure copy,
M13 navigation, no page errors and no document-level overflow; screenshots remain
outside Git. This does not substitute for the designated final report-design judge.

Other review dispositions: lowercase g/kg is the explicit v1 mass-unit contract;
there is no automatic unit-guessing change. The inherited legacy v1 collector
save serialization note is a separate follow-up, not an unreviewed change to the
calcium path; new exact-v2 saves are serialized. Invalid normalized collection
projections fail as a whole while verified bounded raw captures and usage survive;
silently dropping bad observations would conceal an integrity failure. Empty
provider references already have an owning no-call regression. Cancelled partial
datasets and historical replay remain immutable, not automatic paid retries.

The final isolated Linux full check after these corrections passed **804 backend
and 195 frontend tests**, with zero failures/skips, contract generation, both
typechecks and production build. Actual Chromium was configured for PDF tests.
The tested source archive SHA-256 is
`3cc06b4475972cfc60763a00f7eb313a2700791f82a0e8961c4768d5114749e3`;
Windows/Fedora archive hashes matched, and all four new generated TypeScript
contracts matched after Linux regeneration. Later changes only update these
verification documents. This is working-tree Linux proof, not published-SHA CI.

The business session's final static pass found no material M08 deviation in
clarification 1.1. It did not run tests itself and did not approve source truth,
live activation or completed analysis. No Windows tests, new provider calls,
live migrations/restarts or historical data changes occurred in this correction.

Remaining: automation integration of exact Shopee collection; multi-source
scope/coverage; customer corpus and located Insight inputs; verified admission
and report wiring for temporal/unit-price methods; synthesis; clickable evidence
inspection; final content/design acceptance
for each of the three cases. These cannot be replaced with empty charts, more AI
prose, invented peer approval or blanket `COMPLETE` states.

## Parallel integration follow-up (2026-10-02, not deployed)

The preceding remaining-work list is superseded for exact collection and raw
corpus wiring. Root now owns the optional exact-URL scope request/UI, collector
factory, service composition and report assembly. Two Sol high lanes delivered
the verified Market temporal/quote inventory bridge and generic raw corpus.
See `docs/tasks/research-parallel-integration-v1.md` for the UI/behavior boundary.

Initial Linux proof passed 31 integration/corpus tests, 9 scoped frontend tests,
both typechecks and the production frontend build. A paired synthetic worker
run produced separate Market/Insight HTML and PDFs through production owners:
M05 has four located records including observed zero, M06 two records, M07 an
unranked inventory, and M03/M08 source inventories. Insight retained five raw
rows as four groups, with one duplicate collapse, one quarantined row and one
invalid rating. Coding remains NOT_CODED. Replay made no writes/provider calls.
The helper used synthetic HTTP transports, not live source credentials or data.
Desktop/mobile HTML and representative printed PDF pages were inspected; this
is report-only acceptance, not a full scope-UI-to-worker browser journey or final
design approval. Portable evidence is outside Git under the task artifacts.

### Independent review and corrections

Claude Opus 5.5 high review `review-muqx3b5t-w2tomy` was read-only/static. Root
also reviewed shared service integration with Sol. Corrections:

- Use API-compatible `apify-shopee` in coverage, blockers and usage. Canonical
  run-schema validation reproduces the former frontend rejection and verifies
  configured/unconfigured/ambiguous paths. No validator was weakened.
- Failed/ambiguous configured review collection is FAILED, not a misleading
  provider-not-configured state. Unknown cost remains unknown.
- Reject invalid main-source lineage or oversized capture sets without dropping
  an independently admitted Shopee collection. Preserve each source's usage;
  a thrown main collector has an explicit UNKNOWN-cost unsettled receipt.
  Request totals count known requests only, as the limitation explains.
- Automation polls the same actor up to 155 times at the existing two-second
  interval, covering its 300-second timeout; no paid POST retry is added.
- Opt-in returned-page retention journals raw pages and an UNVERIFIED receipt
  before Foundation admission, so rejected metadata does not discard paid raw
  pages. One snapshot/run and manual reconciliation; no new ledger or trust.
- If a quote view exceeds report bounds, keep the raw collection intact and
  produce an explicit Insight limitation rather than failing independent Market
  output or truncating review text.

Source isolation, API-schema and size regressions were observed failing for their
intended reasons before correction. The corrected affected API/service/collector
suite passed 57/57 with backend typecheck. Final full proof follows separately.

Final isolated Linux proof: **838 backend + 196 frontend, zero failures/skips**;
contract generation, both typechecks and production build passed. Tested source
archive SHA-256:
`e80e458191cebc34dbba6a023e6b25e40a31b6eaaf436136a682223f2ea02d27`.
Full-check log SHA-256:
`decb73718f2274187c87b4fb48e659f21f8f3bb262dbe0acca7e983bc85062ce`.
Windows/Fedora archive digests matched. The returned-page retention negative
control failed at missing snapshots for paid, cancelled-partial and existing-run
cases; scratch source was restored byte-for-byte before the full check. An initial
Node22 ABI failure was excluded from that evidence; actual proof used Node24.15.
Subsequent changes to this checkpoint update documentation only. No Windows tests,
provider calls, public artifacts, live migration/restart or deployment occurred.

Review dispositions: no mutable verification cache was added; reads still verify
evidence integrity. Runtime authority documents intentionally remain hash-pinned,
not silently replaced by edited prose. A known zero charge for an unconfigured
source records no invocation, not collection success. Model/source scope and
business limitations were not relaxed to raise completion counts.

Final-source paired acceptance also passed in the private artifact folder
`synthetic-paired-reports-ibEiVL`: separate Market and Insight HTML/PDF files,
22 A4 pages each, API-compatible `apify-shopee` coverage, and unchanged read replay.
The fixture deliberately uses 30 days; it does not establish annual source
coverage. Root inspected the final Market mobile and Insight desktop views.
No final Claude design approval or full UI-to-worker acceptance is claimed.

Next semantic slice is located I04 source-reported actions. The business session
`Review marketing framework files` returned its read-only recommendation in turn
`01a0fc9a-7498-7181-bc94-3bdfddbb0338`: use the adopted codebook with a narrow,
version-pinned literal parser, without AI activation or new owner decisions.
Implementation guidance is recorded in the parallel integration task below.
Current raw text does not contain action spans, attribution or coding provenance;
an empty-method adapter would not solve the missing Insight content. Metric
attachment, scope admission, remaining methods and three real-case content/design
acceptance remain outstanding. Zero broad analytical sections are certified.
