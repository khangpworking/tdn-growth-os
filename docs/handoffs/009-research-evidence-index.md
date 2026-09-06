# Task 009 handoff — Deterministic Research Evidence Index

Status: implemented on `feature/009-research-evidence-index`; keep PR #9 draft for review.

## Identity

- Starting SHA: `5caef348f999fc8f4de72d3dc1704fa30b75f28a`.
- Complete implementation SHA: `23f0a203a117d881f6bdbe581b4edf81268db0d0`.

## Migration and contracts

- Added only `migrations/0006_analysis_research_results.sql` with one immutable `analysis_research_results` table, provenance/result artifact foreign keys, unique execution identity, focused indexes, and update/delete protection.
- Added closed canonical contracts and generated TypeScript types:
  - `research-evidence-index-request`: contract version, finalized Research Pack UUID, fixed `research_evidence_index_v1`, fixed calculation version 1.
  - `research-evidence-index-result`: application-owned identity/time/source/coverage plus deterministic document and segment arrays with exact byte ranges, hashes, text, and derived JSON Pointer citations.
- No segment, citation, claim, or document-body table was added. Derived segments exist only in the single canonical Result artifact.

## Box boundary and deterministic segmentation

- `ResearchEvidenceIndexService` receives Box 1 data only through the declared `FinalizedResearchPackReader`; it contains no direct SQL reference to Box 1-owned tables.
- For each exact verified document Buffer:
  1. An initial `EF BB BF` BOM is excluded from the first candidate range.
  2. LF (`0A`) or EOF ends each physical line.
  3. A CR (`0D`) immediately before LF/EOF is excluded; every other byte, including CR elsewhere, spaces, tabs, casing, punctuation, Vietnamese UTF-8 bytes, and a BOM appearing at a later line start, remains exact.
  4. Each candidate slice is fatal UTF-8 decoded and skipped only when `text.trim().length === 0`.
  5. Retained lines receive per-document `segmentIndex` values from zero in byte order.
  6. `byteStart`/`byteEnd` are exact half-open offsets into the unchanged raw artifact.
  7. `textSha256` hashes exactly `rawBytes.subarray(byteStart, byteEnd)` and `text` is the fatal decoding of exactly that slice.
  8. A document yielding no retained line rejects before Result writes.
- Documents retain the verified Research Pack manifest's deterministic document-ID order.
- Citation pointers are application-derived exactly as `/documents/<document-array-index>/segments/<segmentIndex>/text`.
- Focused tests resolve citation pointers back to exact Result text and slice every byte range back to matching text/hash.

## Identity, idempotency, and replay

- Execution identity is `(research_pack_id, calculation_key, calculation_version)`.
- Canonical request SHA-256 binds all four closed request fields.
- Same identity and canonical request returns the existing Result without writing another artifact; changed stored request hash conflicts.
- Calculation validates request, reads the verified Research Pack, computes all segments, validates the Result, writes canonical JSON to the existing content-addressed artifact store, then persists one immutable row plus compatible artifact manifest in a short transaction.
- Replay loads the immutable Result row/artifact metadata, verifies digest/size/media/path/contract, fatal-parses JSON, validates schema/canonical bytes, rereads Box 1 through `FinalizedResearchPackReader`, recomputes the complete Result while preserving stored Result UUID/time, and compares request hash, source pack/digest, coverage, documents, segments, byte ranges, text hashes/text, and pointers.
- A narrow `ResearchEvidenceIndexResultReader` is exposed for Task 010.

## Verification

- Focused tests: 6/6 passed locally.
- Full `npm run check`: passed locally, 50/50 integration tests.
- `git diff --check`: passed locally.
- Independent focused re-review after edge-case fixes: no findings.
- Fedora permission/replay probe: database/WAL/SHM/raw document/Research Pack manifest/Result artifact were `0600`; verified replay produced two expected segments and disposable output was removed.
- Residue and forbidden-scope audits: passed locally.
- GitHub Check: passed for complete implementation commit `23f0a203a117d881f6bdbe581b4edf81268db0d0` ([run 34038583462](https://github.com/khangpworking/tdn-growth-os/actions/runs/34038583462)).

## Migration integrity

Migrations 0001–0005 are byte-identical to the starting SHA:

- `0001`: `cc454e4c837cac9ae4718fe3e963f9b9fad2b20ce0c4e6ae47757a25e701a7eb`
- `0002`: `b62f1a6d3ad5d0c7c4b26855da8f6b71bc3d5845b9fd6e8d6d13e1f468680d46`
- `0003`: `a13daec88cfe5abbb4a26d517744c9c6ccc613841eb47c3d9932264a1c5157ec`
- `0004`: `0e8add96ffe9cbfce075a5457349273ecac4d76bfc1bad98d19d6e0258b5530d`
- `0005`: `e4785c6f98cf3a262b1ffa71dc7e374ae38263db4fe9b47677575d54389d7592`
- New `0006`: `241b8a941db06673322b44aa2e7e5c26b5c45a390afcb06ca5062ced66ddeb88`

## Changed paths

- `contracts/analysis/research-evidence-index-request.{schema.json,generated.ts}`
- `contracts/analysis/research-evidence-index-result.{schema.json,generated.ts}`
- `migrations/0006_analysis_research_results.sql`
- `scripts/generate-foundation-contract.mjs`
- `src/modules/analysis/{validation,index,research-evidence-segmentation,research-evidence-index-service,research-evidence-index-result-reader}.ts`
- `tests/integration/{research-evidence-index,sqlite-foundation}.test.ts`
- `docs/{STATUS,foundation-data-dictionary}.md`
- `docs/handoffs/009-research-evidence-index.md`

## Limitations and recommended Task 010

- This is deterministic line indexing only. It does not extract/normalize claims, judge truth/evidence fit, score sources, call AI, port an external skill, fetch/scrape, parse HTML/PDF/DOCX, embed/search, orchestrate Pi, expose API/UI, run workers, or migrate legacy data.
- The existing artifact-before-database orphan caveat remains.
- Recommended Task 010: add a bounded fact-check/evidence-audit interpretation over the verified `ResearchEvidenceIndexResultReader`, with strict citation allowlisting and no autonomous action.
