# Research A38: deterministic 30-section report assembly snapshot

## Objective

Build one canonical `DRAFT_PARTIAL` assembly snapshot from explicitly selected,
replay-verified report inputs. The snapshot freezes the current state of all 30
catalog sections without creating a second report-version history or implying
that unfinished sections are complete.

A10 remains the sole report-version authority. A38 creates a content identity
that a later A39 step may consume when it creates the next immutable A10 report
version. The A38 identity is not a report version, semantic version, review
decision or publication approval.

## Required input boundary

The closed request must select all identities explicitly:

- one exact A10 `reportId` and numeric `reportVersion`;
- the exact A10 catalog digest;
- one exact A30 `preparationSha256`;
- the exact deterministic A31 `readinessSha256` expected from that preparation
  and the A10 catalog bytes;
- exactly one retained A37 M03 `sectionArtifactSha256` for v1; and
- interpretation state `NONE`.

There is no `latest` selection. The service must replay the A10 version before
using it, read the exact catalog artifact through the A10 reader, recompute A31
readiness through its existing service, and replay M03 through the A37 reader.
It must reject any workspace, source-package, selected-source, preparation,
catalog, readiness, section or artifact identity mismatch.

## Snapshot contract

The canonical snapshot must:

- use a fixed versioned assembly profile and content-derived
  `assemblySha256`;
- omit timestamps, random IDs, local paths and environment-specific values from
  its identity;
- carry the exact A10 report, workspace, source-package, source membership,
  evidence-envelope and semantic-content identities;
- carry the exact A30 preparation and A31 readiness identities;
- contain exactly 30 unique section entries in catalog order;
- preserve catalog fallback state/reasons separately from A31 readiness state;
- preserve each section's required inputs and their exact A31 input checks,
  including `PRESENT`, `ABSENT`, `INVALID`, evidence references and codes;
- mark materialization independently from readiness;
- bind M03 to the exact A37 record and all six retained member identities;
- represent every other section with explicit `NOT_MATERIALIZED` state and a
  null artifact rather than omitting it;
- state `DRAFT_PARTIAL`, interpretation `NONE` and human review `UNREVIEWED`;
  and
- state explicitly that it is not final, publishable or commercial-ready.

The readiness state does not prove that a section was calculated or delivered.
The catalog fallback state does not override an exact readiness result. An A37
artifact proves retained deterministic section output, not AI interpretation or
human acceptance.

## Deterministic output

Add an offline CLI that opens the existing database read-only, with
`fileMustExist` and `query_only`, and writes one canonical JSON snapshot outside
Git. It must create the output with owner-only permissions where mode bits are
available and refuse overwrite. It performs no migration, database mutation,
calculation recipe, AI/provider call, report-version creation, review action,
HTML/PDF rendering or publication.

Identical verified inputs must produce byte-identical JSON and the same
`assemblySha256`. Changed section delivery, readiness, catalog or source
identity produces a different snapshot; it never changes an older snapshot.

## Architecture guardrails

- Do not add an A38 relational ledger, version counter or predecessor chain.
- Do not alter A10's closed v1 create contract, version rows or immutable
  memberships in this task.
- Do not register an unowned active artifact manifest merely to make the
  snapshot discoverable. A39 owns durable integration into A10.
- Do not add A13 interpretation support in v1. `NONE` is explicit and closed.
- Do not generalize the A37 reader beyond its current verified M03 contract.
- Correct A37/README wording from “report-version assembler” to “report
  assembly snapshot” where the old phrase would imply that A38 itself creates
  an A10 version.

## Verification ownership

Use two behavior owners only:

1. One snapshot-builder test owns deterministic identity, exact A10/A31/A37
   lineage, 30-section ordering, M03 binding, explicit absence and lifecycle
   flags. A small table may cover A38-specific cross-boundary identity drift.
2. One CLI integration test owns actual read-only wiring, canonical outside-Git
   output, overwrite refusal and owner-only mode.

Do not duplicate A10 history/migration tests, the A31 readiness matrix, A37
six-member replay/immutability tests or private-output path-safety matrices that
already have stronger owners. Linux CI is authoritative; do not run tests,
builds or typechecks on Windows.

## Explicitly deferred to A39 and later

- Persisting the snapshot into the next immutable A10 report version.
- Any A13 interpretation overlay or AI call.
- Human review/decision, FINAL, publication or commercial readiness.
- Assembly HTML, dashboard integration, PDF or renderer versioning.
- Additional materialized section types after their own verified artifact
  readers exist.
