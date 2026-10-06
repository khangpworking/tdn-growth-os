# Source-bound semantic model proposals

04/10/2026. Uncommitted integration on baseline
`0116091fd5dc0902594f92d969dfb3ee0732c9c8`, not a Fedora release.
Plan P4.4; benefits I02/I04/I05/I06/I07/I08/I09/I10/I13.

## Delivered boundary

`ResearchAutomationService.proposeModelInsightCoding` now verifies an exact
source/rule adoption, sends an explicitly selected batch of at most 100 readable
included records to a supplied text transport, retains the execution, validates
the response and publishes an unaccepted proposal through the existing owner.
It does not create receipts or update a report. The existing explicit selection
and report-revision path remains necessary.

The model-facing payload contains original record indexes and exact text plus
the adopted question/rules/codebook. It excludes records outside the batch and
the authenticated actor. The retained admission separately binds the actor,
request, source pair, adoption digest and complete input. Full corpus membership
is preserved for later denominators; a batch is not a new population.

The server validates closed schemas, exact UTF-16 spans, source-local relations,
codebook membership and explicit batch boundaries. Model claims of human
approval are discarded; every generated row is PENDING_AI. Declared uncertainty,
qualifiers and counterevidence remain. Structural validity is not semantic truth.
Omitted records are not automatically classified as UNCODED.

Each subsequent batch retains the previous proposal's other records. A changed
source, rule revision or proposal predecessor blocks new dispatch/publication.
If the predecessor changes while the model runs, the outcome is still retained,
but publishing conflicts. Exact retries reuse retained output without another
model call, including after a later report/rule version. INVALID and ambiguous
transport outcomes are terminal for that request, not automatic retries.

## Persistence

Migration 0047 extends the existing Analysis execution ledger with a distinct
INSIGHT_CODING parent. It does not pretend that coding is a running REPORTS step
or a supplemental report attempt. Existing execution rows/artifacts/timestamps
are copied unchanged, with new parent fields null. Prior migration files were
not edited by this slice. No migration was run on the live operator database.

## Verification

- Linux contract generation and backend typecheck passed.
- Existing three-industry source → model proposal → explicit partial/full
  receipt → report revision → historical read journey passed (4 node:test
  results including the parent). All model/data ports are synthetic.
- Focused response, batch, shared-execution and populated-upgrade group: 16/16
  passed. This group covers wrong quotes, outside-batch rows, invented codes,
  forged approval, preserved uncertainty, source/rule staleness, batches,
  terminal invalid/unknown outcomes, historical retry and previous executions.
- Linux legacy I14 and migration-affected group passed 91/91; frontend typecheck
  passed. The final source/model three-industry, batch and response group passed
  7/7 after the manual-request-key conflict preflight was added. Groups overlap;
  their counts are not added together.
- No real model/provider call, business acceptance, new UI, PDF approval,
  commit, push, merge or deployment is claimed.

ZCode GLM-5.3-Flash high ended at its 300000 ms timeout with no session/output or
changed module. GPT implemented and audited the module instead. Claude's known
quota reset had not occurred; no independent Claude approval is claimed.

## Next production slice

1. Operator transport and OWNER endpoint are now integrated in the next
   [checkpoint](research-insight-model-runtime-api.md), not deployed. Reads do
   not dispatch and opportunity synthesis does not grant coding permission.
2. Connect the existing coding review panel to generation/activity. Implement
   complete-corpus batch progression without silently truncating oversized text.
3. Evaluate source-bound coding using the approved rubric on real retained data,
   preserving pending/unknown and explicit human acceptance.
4. Feed accepted results into the broader report families and run three-product
   web/PDF acceptance. Do not count this backend slice as 30-section completion.
