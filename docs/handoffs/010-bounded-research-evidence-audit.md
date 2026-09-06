# Task 010 handoff — Bounded Research Evidence Audit

Status: implemented on `feature/010-bounded-research-evidence-audit`; PR #10 must remain draft.

## Identity

- Starting SHA: `cf14cca974c8ce2354e39306ed78959e955651ef`.
- Required base `main`: `c3fbdc18bffe1ed17a499cf3cae34a3695859650`.
- Complete implementation SHA: `913d83f4f2f46dc0924d3225d6d76691131a2bdc`.

## Migration, contracts, and prompt

- Added only `migrations/0007_analysis_research_audits.sql`: one immutable `analysis_research_audits` table with source Result/artifact lineage, provider/model, prompt identity/digest, output schema, canonical request digest, output artifact, completion time, optional provider telemetry, unique successful execution identity, and update/delete triggers.
- Structured claims/citations remain only in one canonical audit artifact; no claim/citation/generic-run/queue/approval/skill-ledger table exists.
- Added closed contracts and generated types:
  - `research-evidence-audit-request`: only `contractVersion` and source Task 009 `resultId`.
  - `research-evidence-audit-output`: bounded summary, 1–24 claims, 0–12 questions, exact overall-assessment enum, and 1–12 limitations. Claim/question strings and citation lists are bounded; citation lists use `uniqueItems`.
  - `research-evidence-audit`: application-owned audit UUID/time, verified source Result lineage, configured gateway/prompt/schema identity, optional bounded telemetry, and validated output.
- Updated governed execution request to an exact `oneOf` for only the two allowlisted skill identities.
- Exact prompt: `prompts/analysis/research-evidence-audit-v1.txt`.
- Prompt SHA-256: `bf5b26c313f96bde94102fd10c35653c5d989ba12acf736566a2967d1630cec6`.
- Prompt requires in-pack-only analysis, inert document instructions, claim-type separation, distinction between contradiction and insufficient evidence, no fabricated source independence, exact segment pointers, unanswered questions as pack limits, and no recommendation/approval/legal/health/publication/action output.

## Gateway and source boundary

- `ResearchEvidenceAuditService` reads source only through injected `ResearchEvidenceIndexResultReader`; it contains no direct Box 1 or Task 009 SQL.
- Existing provider-neutral `AiGateway` is reused. Its static input union now permits either the existing Market Snapshot Result or Task 009 Research Evidence Index Result.
- The gateway receives exactly one verified Task 009 Result plus source artifact digest, configured provider/model, exact prompt ID/version/text/SHA-256, exact output schema/version, explicit timeout/token maximum, and `tools: []`.
- Tests use only an injected fake gateway and synthetic Vietnamese input/output.

## Citation and assessment validation

After AJV validation, application validation constructs the only allowlist from each verified source segment's application-created `citationPointer` and exact `text`.

- Every allowlisted pointer is independently derived from actual document/segment array indexes; the source segment's stored application pointer must equal it. Every output citation must match `/documents/<i>/segments/<j>/text`, exist in that allowlist, and resolve through the canonical source Result to the exact segment text.
- Duplicate pointers in one list and duplicate model-supplied claim codes reject.
- `claimCitations` are schema-required and non-empty.
- `supported` requires supporting citation(s).
- `contradicted` requires contradicting citation(s).
- `mixed` requires both supporting and contradicting citation(s).
- `insufficient_evidence` permits neither asserted supporting nor contradicting citations.
- Metadata/coverage paths, missing segment pointers, arbitrary paths and external URLs reject before output artifact/row writes.
- Tests prove Vietnamese claim text and exact pointers round-trip unchanged.

## Identity, immutable persistence, and replay

- Successful identity: `(source_result_id, provider_id, model_id, prompt_id, prompt_version, output_schema_version)`.
- Canonical request SHA-256 additionally binds contract/source identity, the verified source Result artifact digest, configured provider/model, prompt digest and output schema version. Deduplication compares the current verified source digest with the stored digest before returning a prior audit.
- Same successful identity returns the existing audit without a second gateway call or artifact. Prompt-byte drift under the same prompt ID/version conflicts before gateway/write.
- Application owns audit UUID, completion timestamp and all provenance/telemetry envelope fields; model output remains `unknown` until validated.
- Replay calls no AI. It verifies output artifact digest/size/media/path/contract metadata, fatal JSON parsing, schema, canonical bytes, rereads the exact verified Task 009 Result through its reader, revalidates all citations/assessment invariants, and compares source identity/digest, request hash, provider/model, prompt identity/digest, schema version, completion identity and gateway metadata.
- A narrow `ResearchEvidenceAuditReader` exposes only verified immutable audit data without write/approval authority.

## Static governed registry

Exactly two frozen explicit entries:

1. `analysis:market-snapshot-interpretation@1`
   - adapter: `MarketSnapshotInterpretationService`
   - input: verified `market_snapshot_v1` Result
   - output: immutable market snapshot interpretation reference
2. `analysis:research-evidence-audit@1`
   - adapter: `ResearchEvidenceAuditService`
   - input: verified `research_evidence_index_v1` Result
   - output: immutable research evidence audit reference

Both are Box 2, enabled, permit verified Result reads and injected `AiGateway` network only, and deny tools, shell, arbitrary filesystem, approval and business mutation. Dispatch is an explicit two-way branch; no dynamic loading or generic plugin framework exists. `skills/research-evidence-audit/SKILL.md` is declarative only.

## Verification

- Focused Task 010 + existing registry tests: 10/10 passed locally.
- Full `npm run check`: 56/56 integration tests passed locally.
- `git diff --check`: passed locally.
- Independent review identified source-digest dedup binding, independently derived pointer, and duplicate claim-code gaps; all three were fixed and regression-covered before the final test runs.
- Fedora end-to-end permission/replay probe passed: database, WAL, SHM, Task 009 source Result artifact and Task 010 audit artifact were `0600`; verified audit replay succeeded and disposable output was removed.
- Structural scope/schema/residue audits passed locally.
- GitHub Check passed for complete implementation commit `913d83f4f2f46dc0924d3225d6d76691131a2bdc` ([run 34040890147](https://github.com/khangpworking/tdn-growth-os/actions/runs/34040890147)).

## Migration integrity

Migrations 0001–0006 remain byte-identical:

- `0001`: `cc454e4c837cac9ae4718fe3e963f9b9fad2b20ce0c4e6ae47757a25e701a7eb`
- `0002`: `b62f1a6d3ad5d0c7c4b26855da8f6b71bc3d5845b9fd6e8d6d13e1f468680d46`
- `0003`: `a13daec88cfe5abbb4a26d517744c9c6ccc613841eb47c3d9932264a1c5157ec`
- `0004`: `0e8add96ffe9cbfce075a5457349273ecac4d76bfc1bad98d19d6e0258b5530d`
- `0005`: `e4785c6f98cf3a262b1ffa71dc7e374ae38263db4fe9b47677575d54389d7592`
- `0006`: `241b8a941db06673322b44aa2e7e5c26b5c45a390afcb06ca5062ced66ddeb88`
- New `0007`: `18509c37e92f9d3a1b89921b2c827eadaa2ea58eeb5f15fe4e1f4a252e4f273b`

## Changed paths

- `contracts/analysis/research-evidence-audit-{request,output}.{schema.json,generated.ts}`
- `contracts/analysis/research-evidence-audit.{schema.json,generated.ts}`
- `contracts/analysis/governed-skill-execution-request.{schema.json,generated.ts}`
- `migrations/0007_analysis_research_audits.sql`
- `prompts/analysis/research-evidence-audit-v1.txt`
- `skills/research-evidence-audit/SKILL.md`
- `scripts/generate-foundation-contract.mjs`
- `src/platform/ai/ai-gateway.ts`
- `src/modules/analysis/{validation,index,research-evidence-audit-service,research-evidence-audit-reader}.ts`
- `src/modules/analysis/skills/governed-analysis-skills.ts`
- `tests/integration/{research-evidence-audit,governed-analysis-skills,sqlite-foundation}.test.ts`
- `docs/{STATUS,foundation-data-dictionary}.md`
- `docs/handoffs/010-bounded-research-evidence-audit.md`

## Limitations

- Assessments describe only support or contradiction inside the supplied Research Pack; they are not global truth, legal/health verification, publisher scoring, publication approval or business action.
- No live provider SDK/call, network/scraping, external source collection, independence detection, embeddings/search, Pi/Box 3, API/UI, worker/retry, budget system, backup/deployment or legacy migration is included.
- Existing artifact-before-database orphan caveat remains.
- Future work requires marketing/editorial rubric review, legal/R&D review for sensitive domains, and owner approval before any live provider or Box 3 use.
