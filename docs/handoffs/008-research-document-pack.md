# Task 008 handoff — Exact-byte research documents and Research Packs

Status: implemented on `feature/008-research-document-pack`; keep PR #8 draft for review.

## Identity

- Starting SHA: `c5804cc0eae3113ffbc359096f6111bd3e183d24`.
- Complete implementation SHA: `c59c5fdcee3fff550dce794e7934d1548f9ddb75`.

## Migration and contracts

- Added only `migrations/0005_research_documents.sql` with immutable `foundation_research_documents`, `foundation_research_packs`, and `foundation_research_pack_items` plus focused indexes/triggers.
- Added canonical generated contracts:
  - `research-document-import`: manual source, `text/plain` ingestion/evidence metadata, document provenance/rights metadata.
  - `research-pack-request`: namespaced key/version/purpose, unique explicit document UUIDs, optional predecessor.
  - `research-pack-manifest`: deterministic body-free snapshot of document, rights, evidence, source, ingestion, and raw artifact metadata.

## Identity and idempotency

- Reuses `foundation_sources`, `foundation_ingestion_runs`, `foundation_evidence`, `artifact_manifests`, and `ContentAddressedArtifactStore`.
- `(source_id, idempotency_key)` remains the ingestion identity.
- Request SHA-256 binds canonical validated metadata to the SHA-256 of copied exact bytes.
- Same identity with same metadata and bytes returns the existing document/evidence/ingestion/artifact references; metadata or byte drift conflicts.
- Research Pack identity is `(pack_key, version)` over a semantic request whose document UUIDs are sorted, making input order irrelevant. Corrections require a higher version and explicit same-key lower-version finalized predecessor.

## Behavior and verification coverage

- Manual import copies bytes, fatal-decodes UTF-8, rejects NUL and empty/whitespace-only text, and applies an inclusive 1 MiB ceiling before writes.
- Accepted raw bytes retain BOM/newlines/spacing and are stored exactly once by digest; document bodies are not stored in SQLite or Research Pack manifests.
- Document text is always inert untrusted data. Source locators are preserved but never followed.
- Finalized document, pack, and membership rows are trigger-immutable. Pack finalization verifies selected document lineage and raw artifacts before any manifest/pack write; idempotent document retries also re-verify existing lineage, manifest metadata, digest, and exact bytes.
- Verified read checks manifest digest, size, media type, path, JSON Schema, canonical bytes, pack metadata/request hash/membership, raw artifact lineage, digest, size, path, media type, and fatal UTF-8; it returns exact bytes and decoded text through `FinalizedResearchPackReader`.
- Focused tests: 8/8 passed locally, including pre-finalization and idempotent-retry integrity checks.
- Full `npm run check`: passed locally, 44/44 integration tests.
- `git diff --check`: passed locally.
- Fedora permission probe: database/WAL/SHM/raw document/Research Pack manifest were `0600`, verified bytes matched exactly, and disposable output was removed.
- Independent focused review after integrity fixes: no findings; confirmed pre-finalization and idempotent-retry verification ordering.
- GitHub Check: passed for complete implementation commit `c59c5fdcee3fff550dce794e7934d1548f9ddb75` ([run 34035500256](https://github.com/khangpworking/tdn-growth-os/actions/runs/34035500256)).

## Migration integrity

Migrations 0001–0004 are byte-identical to the starting SHA:

- `0001`: `cc454e4c837cac9ae4718fe3e963f9b9fad2b20ce0c4e6ae47757a25e701a7eb`
- `0002`: `b62f1a6d3ad5d0c7c4b26855da8f6b71bc3d5845b9fd6e8d6d13e1f468680d46`
- `0003`: `a13daec88cfe5abbb4a26d517744c9c6ccc613841eb47c3d9932264a1c5157ec`
- `0004`: `0e8add96ffe9cbfce075a5457349273ecac4d76bfc1bad98d19d6e0258b5530d`
- New `0005`: `e4785c6f98cf3a262b1ffa71dc7e374ae38263db4fe9b47677575d54389d7592`

## Changed paths

- `contracts/foundation/research-document-import.{schema.json,generated.ts}`
- `contracts/foundation/research-pack-request.{schema.json,generated.ts}`
- `contracts/foundation/research-pack-manifest.{schema.json,generated.ts}`
- `migrations/0005_research_documents.sql`
- `scripts/generate-foundation-contract.mjs`
- `src/modules/foundation/{validation,index,research-document-service,research-pack-service,research-pack-reader}.ts`
- `tests/fixtures/research-document.synthetic.vi.txt`
- `tests/integration/research-document-pack.test.ts`
- `docs/{STATUS,foundation-data-dictionary}.md`
- `docs/handoffs/008-research-document-pack.md`

## Limitations and recommended Task 009

- Manual `text/plain` only. No URL retrieval, scraping, network, HTML/PDF/DOCX parsing, AI, claim extraction, fact-checking, external skill port, Pi, API/UI, worker, automatic selection, retention execution, reconciliation, or legacy migration.
- The existing artifact-before-database orphan caveat remains.
- Recommended Task 009: add one bounded Box 2 deterministic claim/evidence preparation result over the verified Research Pack reader before considering any AI fact-check interpretation.
