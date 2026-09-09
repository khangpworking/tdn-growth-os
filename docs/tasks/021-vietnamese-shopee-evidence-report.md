# Task 021 — Vietnamese Shopee evidence report from saved Results

Status: IMPLEMENTED and locally verified; draft-PR handoff pending.

## Scope

Add one minimal offline command that exports an existing verified Shopee analysis Result selected by its exact artifact SHA-256. V1 explicitly supports only `shopee-calcium-v3-adapter3` and rejects missing, ambiguous, corrupt, mismatched or other-version Results.

The command reuses persisted Result schema, canonical bytes, artifact manifest/digest, collection/request/raw-page lineage, normalized review lineage and recomputed summary verification. It must not call `analyze()`, execute Python/filter code, access providers, mutate SQLite or apply migrations.

## Output contract

The deterministic Vietnamese Markdown report includes only verified topic/period/source/acquisition and collection times, selected products/listings, requested/actual coverage, existing fetched/normalized/kept/removed/invalid/duplicate definitions, provider total when present, existing warnings, and all retained reviews grouped by selected product. Each review includes original wording, rating recovered from verified raw lineage, matched signals, ambiguous-field status, filter score and Result/raw artifact/row references.

Review and metadata text is HTML-escaped with line breaks encoded and rendered in inert quoted/code form so it cannot inject headings, HTML, images or active links. No author identifier is exported; no promise is made that review free text itself lacks personal information.

The report states that score is not sentiment/confidence, hearsay is not firsthand evidence, and reported effects do not prove health claims or causation. It does not invent themes, market conclusions, E0–E5 mappings or absent metadata.

## Persistence and exclusions

The output path must be outside the repository. Creation uses exclusive mode, owner-only `0600` on POSIX, and refuses overwrite. No database table, migration, dependency, UI, generic report framework or AI integration is added. Tests use only small synthetic persisted fixtures; the private 3.354-row Markdown dataset remains a separate offline reference and is not assigned provider lineage.

## Acceptance

Focused tests cover exact digest selection, verified counts/references, safe rendering, empty-kept and partial states, corruption/mismatch/version/ambiguity failures, deterministic bytes, read-only CLI behavior, zero provider/filter calls, outside-Git enforcement, `0600` and overwrite refusal. Run focused tests, then one final `npm run check` and repository integrity/residue checks.
