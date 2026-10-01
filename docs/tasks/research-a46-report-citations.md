# Research A46: deterministic report citation projection

## Scope

This slice adds `src/modules/analysis/report-citations.ts`, a presentation-only
adapter for the exact `SourceBackedReportBundle` already produced by A4. It
does not change the report packet, semantic identity, source intake, renderer,
database, API, authentication, provider calls or model prompts.

The existing report boundary already retains the useful lineage: the exact
workspace and source-package identities, selected source SHA-256 values and
raw-byte mappings, normalized metric input, A3 packet claim IDs, metric-result
JSON pointers, membership pointers and source locators. A8 already resolves
model-selected claim IDs to application-owned values; this adapter preserves
that boundary and only projects it into numbered HTML-friendly references.

## Contract

`buildReportCitationProjection({ bundle, references?, candidates?, quoteVerifier? })`
first replays semantic-content validation and checks the exact packet/result
artifacts. References default to every existing packet claim. Explicit model
IDs must be an existing claim ID; unknown, duplicate and `latest`-style IDs
fail closed. There is no database lookup, latest-record selection or source
search.

Each entry carries the semantic report ID, packet/report/envelope identity,
calculation or raw-source artifact SHA-256, source-package identity, and a
typed locator. Existing forms are normalized to PDF page, XLSX sheet/cell,
JSON Pointer, or an explicitly preserved opaque source locator. Numbering is
deterministic from canonical citation identity, not model/request order.

Retrieval candidates are labelled separately from calculation and retained
source evidence. A candidate is not included in a claim's supporting citation
numbers unless its normalized source SHA-256 and locator exactly match one of
that claim's retained source references. Retaining a document alone never
makes an unrelated candidate support a claim.

Quotes are nullable. A supplied quote is never trusted as source truth. A
PageIndex candidate is accepted only when its source SHA-256 and locator are
already retained and the caller's synchronous `quoteVerifier` verifies the
candidate against the exact retained source bytes; otherwise the adapter
rejects it. The verifier receives the exact retained bytes and must echo both
the source SHA-256 and normalized locator in its result, so the adapter cannot
silently attach a quote to another artifact. The verifier is an explicit
application-owned trust boundary: it must parse/compare those bytes itself,
must not call a model. The projection labels this state
`EXTERNAL_VERIFIER_ATTESTED`; the adapter does not mechanically establish
PDF/XLSX quote equality and makes no provider-authentication claim.

Calculated claims and AI interpretation remain distinct. A calculation JSON
pointer is not rendered as a raw-source quote, and a candidate retrieval result
does not promote itself into evidence. Missing raw bytes produce a limitation
instead of a fabricated citation.

## Retrieval options assessment

The A46 pilot records a custom PageIndex adapter at eight calls/eight budget
units, including the GPT 6.1 comparison. That is a selective-retrieval pilot, not a native benchmark, and it did
not cover omitted-source limitations. PageIndex is therefore an optional
candidate producer at this boundary only; it is not a truth store or a new
provider dependency.

## Owner-authorized additive web integration

The subsequent integration registers a separate `report-kit-citations-v1`
presentation, never replacing historical `report-kit-v1` bytes. Both source-backed
and prepared versions retain canonical `citations.json` and replay it through
the existing immutable version reader. The web form defaults to standard and
freezes the explicit presentation in its retry request.

An optional finalized semantic ID must match canonical `semantic-content.json`,
its payload SHA-256 and the recomputed bundle's source/calculation layers. The
owning version service continues to verify prepared and extension dependencies.
No arbitrary digest can substitute another report's citation lineage.

No PageIndex query, AI-generated claim, new source intake, migration or production
retrieval dependency is part of this integration. The budget is exhausted and
the failed selective coverage gate prevents a production model switch.

WeKnora and OpenViking may be useful future retrieval/indexing candidates, but
neither is installed in the live runtime in this slice. They would need to
return exact retained IDs and locators and pass the same byte-level verifier;
an index result cannot bypass A3/A8 lineage, review state or source
provenance. No installation, integration, migration or provider selection is
authorized here.

## Validation

Required Linux check (not run in the Windows worktree used for this task):

```bash
node --import tsx --test tests/unit/report-citations.test.ts
```

The earlier local receipt is invalid for acceptance because it ran on Windows;
Linux CI or a Linux worktree must provide the authoritative receipt.

Final Fedora acceptance: citation tests 4/4 inside the 6/6 focused suite,
backend TypeScript passed, and the complete backend suite passed 711/711.
Read-only CLI export and desktop/mobile citation navigation also passed.
See the A46 handoff for the initial isolated-Git metadata failure, correction
and final Linux evidence. No Windows result is used for acceptance.

The focused tests protect deterministic numbering, exact retained-ID
allowlisting, typed XLSX/JSON/PDF locators, and fail-closed PageIndex quote
verification. They do not retest existing arithmetic, packet construction or
HTML rendering.
