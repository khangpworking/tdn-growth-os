# Handoff — P5.2 M01 unranked evidence inventory (first slice)

Updated: 2026-10-03
Worktree/branch: `work/research-automation-v1`, `fix/research-real-world-audit` (HEAD `0116091`, dirty tree preserved; nothing committed)

Completed:
- New canonical contract `automation-m01-evidence-inventory` 1.0.0 and a pure builder/replay verifier over the verified `AutomationSourceClaims` artifact.
- Builder revalidates the untrusted claims artifact with `validateAutomationSourceClaims` first. It then requires the scope snapshot to match the run, the artifact runId and workspaceId to match the run, artifact `scopeSha256 = sha256(canonicalJson(scope))`, and artifact `claimsSha256` to equal the caller's replayed digest. Error codes: `RUN_SCOPE_IDENTITY_MISMATCH`, `RUN_IDENTITY_MISMATCH`, `WORKSPACE_IDENTITY_MISMATCH`, `SCOPE_IDENTITY_MISMATCH`, `CLAIMS_IDENTITY_MISMATCH`. Upstream claim errors propagate as `AutomationSourceClaimsValidationError`.
- Output fields:
  - `sectionId=M01`, `ownerQuestion={state:UNSET,text:null}`, `ordering=CATALOG_SECTION_ORDER_M05_I02_I04_UNRANKED`, `conclusion=null`.
  - Items are grouped in catalog order M05 → I02 → I04. Within a section they keep the upstream artifact order, with no value, relevance or priority sort.
  - Each item binds the claimId, sectionId, basis, `evidenceKind` (`SELF_REPORTED_DECLARATION` for DECLARED), state, the full method identity, and the source locator: package, logicalPath, sha256, locator, recordLocator and attribution.
  - Each item also carries measure, value, unit, precision, period, periodText, scope, coverage, declaration (attribution and provenance), and the observation and claim limitations.
  - Statements and spans stay upstream; they are not copied into M01.
- With no claims the output is `status=INSUFFICIENT_EVIDENCE`, `insufficientEvidence=NO_ELIGIBLE_UPSTREAM_CLAIMS` and `items=[]`.
- `verifyAutomationM01EvidenceInventory` validates the untrusted value against the schema, rebuilds it from the same inputs and requires canonical equality (`M01_EVIDENCE_INVENTORY_REPLAY_MISMATCH`).
- No AI, provider, network, DB or runtime call.

Changed paths (all new):
- `contracts/analysis/automation-m01-evidence-inventory.schema.json`
- `contracts/analysis/automation-m01-evidence-inventory.generated.ts`: the initially handwritten version was replaced by root's actual Linux generation.
- `src/modules/analysis/research-automation/m01-evidence-inventory.ts`
- `tests/unit/research-automation-m01-evidence-inventory.test.ts`
- `docs/handoffs/research-p5-m01-evidence-inventory.md`

Original Claude handoff executed no checks. Root's follow-up on the isolated Linux scratch passed generation/typecheck and the M01/three-case group 9/9, followed by affected automation/native/exact 26/26. A deliberate skipped M01 replay guard failed the missing-artifact assertion; the restored source then passed typecheck and 9/9. Independent Luna review found no integration blocker. No Windows test/build/typecheck or live operation was performed. Invocations:
- `npm run contracts:generate`, then `git diff contracts/analysis/automation-m01-evidence-inventory.generated.ts`
- `node --import tsx --test tests/unit/research-automation-m01-evidence-inventory.test.ts`
- `node scripts/typecheck.mjs`

Unresolved:
- Root added generator registration and owning service build/store/replay using a separate M01 artifact and closed reference. Renderer-authored M01 data is stripped; registration commits with the report outputs. Visible report rendering remains open.
- In the current service a MARKET report's claims artifact holds only M05 claims and an INSIGHT artifact holds only I02/I04. This builder inventories exactly one bound artifact. Showing I02/I04 under M01 needs a root decision: a paired-run claims artifact, or an additive multi-artifact input bound to each `claimsSha256`.
- Upstream claims carry no separate disposition field. Only admitted claims exist there, plus declaration provenance (adjudication/disagreement), which is copied unchanged. No disposition was invented.
- Still open in P5: I14 retained candidates, model execution and retention, the owner-question `SUPPLIED` path, M01 rendering, the UI delivery gate, real three-case content, PDF acceptance and release.

Next action: implement and verify the narrow I14 admission/validation boundary, then integrate retained synthesis inputs before model execution. Visible M01 rendering and exact paired-claim composition remain separate unfinished work.
Business boundary: the recorded business review already permits M01 to cite eligible upstream sections. The unresolved question is technical binding to the paired Insight artifact, not renewed permission to cite it. Owner-question relevance/priority remains unset; catalog-order inventory continues without it.
