# Handoff — SYNC-2 bounded U-01 default peers

Updated: 2026-10-08 (core/reader checkpoint; draft integration remains gated)
Worktree/branch: `ultimate-impl-sync1-codex` / `khangpworking/ultimate-impl-sync1-codex`.
Completed: deterministic offline E11 peer selector; source-backed reader M07 for complete and nullable inputs; reader 1.3 retention through the existing immutable build record; canonical rule/input/result contract; descriptive 1.2 rule and explicit missing-membership dispatch; synthetic boundary, identity, compatibility, retention and legacy-byte checks.
Changed paths: new `analysis/default-market-peers.ts`, `reader-report/default-peers.ts` and their canonical/generated contract; reader input/schema, build and both market templates; descriptive methods/schema; reader revision retention; narrow canonical-reference registration in the API/report-generation service and validator generator; contract generator registry; focused unit/integration tests; this handoff. Shared model/bridge/reports and research-automation service are untouched at this checkpoint.
Evidence (commands, results, relevant revision): normal merges of main after PR161, PR162 and PR163, without conflicts, rebase or force push. Sole schema lease granted and explicitly released after repeated `npm run contracts:generate`, clean generated contract output against the staged intended changes, strict browser validator generation and affected validation. Backend `npm run typecheck` and direct frontend TypeScript check pass. Initial affected suite: 41/41 pass (core, reader web, SYNC-1 corrections and owning reader retention); added schema/version-policy suite: 10/10 pass. Final core/classified-adapter/schema/version/replay checkpoint: 11/11 pass; backend typecheck passes on that source revision. Follow-up core/reader retention plus full legacy draft byte-guard suite: 21/21 pass; affected frontend checks: 18/18 pass without generation. Retained-rule trust-boundary follow-up (`68427a0`): strict canonical marker validation, missing/altered/extra-field rejection, 13/13 focused peer tests and backend typecheck pass. No full suite yet; coordinator schedules its slot.
Unresolved: shared draft/model/bridge/service integration awaits SYNC-3 merge and explicit ownership release. U-26 automatic collection, scope revision, recollection and admission policy remains ESCALATED. No full completion or deployment claim.
Next action: coordinator reviews this checkpoint; after SYNC-3 release, integrate the already approved retained StartSnapshot rule marker before quick search and default-peer draft dispatch through existing classified sales inputs, preserving marker-free runs. The coordinator also approved owning service computation, adapter-independent retention and read verification against the frozen marker and verified classified input after shared release; absent sales remains an explicit empty/missing result. Complete affected and scheduled full validation, refresh this handoff, push and open the authorized draft PR.
Business decisions pending: none for the bounded E11 peer rule. U-26 remains separately escalated; no collection/provider/cap/admission workflow changes are authorized here.

## Method and retention boundaries

- Rule `e11-sales-peers-v1` fixes the 50% threshold, minimal prefix in descending revenue, stable identity tie break, exact source-title-label/shop identities and complete compatible group denominator. It is declared before reader workbook parsing and retained with input and result.
- Exact decimal strings and BigInt determine membership. The result retains input sales rows once, eligible source references, exclusion reasons, group totals, selected identities and their individual source membership. Every group/platform frame remains separate; no cross-platform sum or name join.
- Unknown brands use source-backed shop IDs. Missing shop IDs and source-title mismatches remain ambiguous. Reader aliases do not merge default identities. A title label is labelled as coming from the seller title; it is not a verified legal brand identity.
- Missing revenue, unknown group membership, missing sources, conflicting references and overlapping listing IDs block a complete group denominator. Zero revenue retains an observed zero and selects nobody. Other group/period/platform/frame/unit rows have explicit exclusions. Exact source-reference duplicates alone collapse.
- Owner additions are retained and displayed separately; they do not alter revenue membership or the default threshold. Quick-search cards and screen leader tables never provide sales membership.
- Reader 1.3 uses `reader-report-market-v3`; existing reader 1.0/1.1/1.2 render paths remain intact. The owning revision record retains the selected rule/result and exact retries/read APIs return committed artifacts without redispatch.
- Descriptive 1.2 retains the rule and explicitly requires a compatible classified sales group. Detail literals do not manufacture group membership, a revenue denominator or an owner anchor. Versions 1.0/1.1 retain their original semantics.

## Frozen synthetic compatibility evidence

Existing SYNC-1 tests still pin reader 1.0/1.1 HTML/metrics and descriptive 1.0 bytes/M05 HTML. This package also pins pre-edit reader 1.2 positive HTML `c45ee04895526bb20d5510f8a6dd1c3de37611e79a83d4ca5c172fe14059edb4`, nullable HTML `60a02aebf8351c22f1f4524c9f2c65410db2f08869ea1396d5815b8f2c8bfe25`, and descriptive 1.1 bytes `ff5dd8500ad8faad17ea16226427f620586b6e232851805d7e0d141d2e911940`, plus the corresponding reader metric hashes. A separate regression pins complete marker-free Market and Insight HTML and semantic bytes for both descriptive 1.0 and 1.1 before shared draft edits.

## Checklist evidence

| ID | State | Evidence / limit |
|---|---|---|
| U-01 | ESCALATED (core/reader implemented) | Deterministic frozen defaults, source fallback, explicit exclusions, owner additions and reader retention pass focused checks; draft/start marker integration remains gated on SYNC-3 release. |
| U-26 | ESCALATED | Auto-collection/revision/recollection/admission policy excluded; no workflow activation. |
| B IDs | N/A | None assigned. |
| G-01 | DONE | Every assigned U ID and G ID is recorded with bounded state. |
| G-02 | ESCALATED | Typecheck and affected checks pass; full suite awaits coordinator slot after integration. |
| G-03 | N/A | No tracked frontend source edits; direct frontend typecheck and generated validator compilation pass. |
| G-04 | DONE | Explicit sole lease, canonical types, strict AJV, generated validators, repeated deterministic generation; explicit release before shared-path wait. |
| G-05 | DONE | Owned-path review and diff checks; narrow API/report-generation validator wiring authorized independently. |
| G-06 | DONE | Synthetic fixtures only; no runtime databases, private data, secrets, machine paths or IPs added. |
| G-07 | DONE | No live collection, provider or application-model call. |
| G-08 | DONE | Neutral Vietnamese labels preserve evidence, uncertainty and owner-addition separation; prescribed humanizer-vi preservation rules applied; no prompt integration. |
| G-09 | DONE | Missing/zero, ambiguous identity/group, compatibility and explicit exclusions covered. |
| G-10 | DONE (core/reader checkpoint) | Frozen reader 1.0/1.1/1.2 and method 1.0/1.1 bytes, rule/result replay and owning exact reader retries/immutable reads. Shared draft replay remains to validate after integration. |
| G-11 | DONE | No assertion removed, skipped or weakened; Added full legacy draft-byte fixtures and provider-prefixed owner-addition regression; reader web test only registers the newly referenced canonical schema; owning reader test helper exposes its synthetic artifact store for the added retention assertion. |
| G-12 | DONE | All template fields and this checklist present. |
| G-13 | N/A | No keyword collection added or changed. |

## Proposed coordinator-owned documentation update

Record only this bounded U-01 core/reader checkpoint until draft integration and exact-head validation pass. Keep U-26 ESCALATED; do not mark the whole SYNC-2 auto-collection package complete. Shared STATUS, plan, README and methodology files were not changed.

Independent requested coordination-doc review: exact commit `763ed5e4d652cec9bba8f0e0b02ef4a2423f9a23` was read-only reviewed against PR161/162 exact head/merge/green Check evidence, all changed-document local targets and operative U-04 versus Ultimate §6.3. No blocking completion, authority or link issue was found; no coordinator-owned documentation was edited.
