# Handoff — FOLLOWUP-NO-PURCHASE-GUARD (U16/L8)

Updated: 2026-10-09. Bounded implementation complete; independent final-head review and hosted full Check pending.
Code freeze: `4ae7ca8cd672ed291d57c1abc12e41340a24c63c`; the final handoff commit/PR head is reported through the fresh worker lifecycle.
Worktree/branch: assigned Orca worktree; `khangpworking/ultimate-no-purchase-guard-sol`, placed from reviewed main `e4b78f01b573d8284235fe06e693d587ffaabca7`, then normally merged named reviewed main #187 `5f38281680a51bae1c49539060d655e093789f2f` under a precise composition grant. No branch switching, reset, rebase or sibling WIP incorporation.

Completed:

- Added packet/input `1.3.0` and prompt `1.4.0`. The candidate envelope stays `1.0.0` and binds the exact versioned packet digest. Earlier packet/prompt factories and candidate admission remain version-aware, including the historical `1.2.0` general-purchase gap.
- The new authored-only guard covers M11/M12/I15 candidate prose, proposal fields and nested counterevidence relations. Structured claim references/enums and source artifacts are excluded. Source text is never normalized or rewritten; matching uses a temporary NFC view.
- Vietnamese/English general purchase proposals now trigger the existing `PURCHASE_SUGGESTION_NOT_ALLOWED` validator error. The existing adapter maps it to constraint-admitted `INVALID_DECISION_CANDIDATES`, with no ledger, migration or kernel change.
- New-version rejected proposals receive plain Vietnamese blocked-state copy, without displaying the rejected candidate. Earlier report copy remains unchanged.
- Actual authenticated OWNER HTTP actions reach fake model transports and the owning synthesis ledger/report builder. General-purchase responses settle as INVALID; source-based assessment and explicit no-purchase responses stay VALID. Exact action retries/report reads after removing model configuration add no writes or calls.
- Current service packets are `1.3.0`; when an execution is reused, its exact retained admission packet is read, identity-checked and byte-replayed at its saved version. VALID/INVALID/UNKNOWN executions keep their own historical packet rather than acquiring the current guard identity.
- Generic reports use renderer `v24`; existing specialized renderer precedence (`20/22/23/21/19/18/17/15/14`) remains unchanged. Versioned decision packet/prompt identities carry the guard semantics inside those composed reports.

Changed paths:

- `src/modules/analysis/research-automation/decision-purchase-guard.ts`
- `src/modules/analysis/research-automation/decision-packets.ts`
- `src/modules/analysis/research-automation/decision-synthesis-input.ts`
- `src/modules/analysis/research-automation/decision-synthesis-execution.ts`
- `src/modules/analysis/research-automation/synthesis-evidence-report.ts`
- `contracts/analysis/automation-decision-{packets,synthesis-input,synthesis-prompt}.schema.json` and their generated types.
- `tests/unit/decision-purchase-guard.test.ts`, `tests/unit/decision-purchase-version.test.ts`, `tests/integration/research-automation-no-purchase-api.test.ts`.
- Exact leased hooks in `src/modules/analysis/research-automation/service.ts` and the generic fallback in `reports.ts`.
- This handoff. Incoming reviewed-main crosscheck paths are outside this task's authored diff.

Evidence (commands, results, relevant revision):

- Task-local Node `24.15.0`, npm `11.12.1`; focused Node tests use `--test-concurrency=2`.
- Code freeze `4ae7ca8cd672ed291d57c1abc12e41340a24c63c`; backend `npm run typecheck` and direct frontend `tsc -p frontend/tsconfig.json --noEmit` pass.
- Initial guard + existing decision packet/prompt units: 11/11 pass. Final focused suite: **51/51 pass**, concurrency two, covering guard/version, actual OWNER HTTP, existing decision execution, native/adopted contexts, default coding, private-source readers and crosscheck lineage.
- Existing owning decision-execution checks: 4/4 pass. New `1.3.0` INVALID query-only read/retry and insufficient-source no-dispatch checks pass. The actual OWNER fixture runs both INVALID and VALID cases and compares every persisted table before/after reopened reads/retries.
- `npm run contracts:generate` ran twice under the explicit GLOBAL grant; only the six authorized schema/generated files changed. Repeat hashes match. GLOBAL explicitly released at `a9bcc675d9d3e554f9c903a56b7d7c2148de9820`.
- Four shared source modules explicitly released at `d29ceafc65fa46914ec3131a25201ef756f5e5a3`. Short reviewed-main composition/generation and exact central service/report phases are explicitly released with this frozen handoff; future shared edits require a new precise grant.
- Existing contract and frontend-validator generation after reviewed-main composition produces no tracked drift; the six U16 hashes still match their original leased checkpoint. `git diff --check origin/main...HEAD` passes.
- Before changing the service default, an actual service/fake-port driver retained two disposable synthetic `1.2.0` fixtures: all VALID, and mixed VALID/INVALID/UNKNOWN. The current implementation reopened the same generated stores without model configuration, preserved both original report-byte hashes, built explicit kept quote-SKIP revisions retaining packet `1.2.0`, and passed query-only exact retry/read with unchanged execution rows and zero calls. No private/runtime database was copied.
- Local evidence: `/tmp/ultimate-u16-final-focused.log`, `/tmp/ultimate-u16-central-typecheck.log`, `/tmp/ultimate-u16-frontend-tsc.log`, `/tmp/ultimate-u16-composed-generation.log`, `/tmp/ultimate-u16-composed-validators.log`, `/tmp/ultimate-u16-legacy-{create,replay}.log`, `/tmp/ultimate-u16-legacy-mixed-{create,replay}.log`. The synthetic historical driver is `/tmp/ultimate-u16-legacy-service-check.mts`. Earlier failed checks remain recorded as before-fix logs; the retention-format defect was corrected, not bypassed.
- The humanizer-vi skill and preservation rules at reviewed revision `576c80fb445a8b2e9ec1993a6490ab6529b89d12` were read for the new Vietnamese copy. No historical prompt, source quote or report was humanized or regenerated.

Checklist evidence:

| ID | State | Evidence / limit |
|---|---|---|
| U16/L8 | DONE for bounded engineering correction | Both reproduced phrases blocked through actual authenticated OWNER/fake transport/service/report; every authored field, negation, descriptive source evidence, trial-order control and old admission checked. Final review/hosted gates remain pending. |
| G01 | DONE for checkpoint | Scoped work, evidence, limits and remaining gates recorded here. |
| G02 | PARTIAL until final hosted gate | Backend typecheck and affected tests pass; full exact-head hosted Check remains required. No baseline waiver. |
| G03 | DONE for affected static/read scope | No authored frontend changes; direct frontend tsc passes after generated validators refresh. OWNER report HTML passes visible-text lint. Full frontend release gate is hosted. |
| G04 | DONE for leased canonical phase | Six authorized additive files; repeat generation has identical hashes and no unrelated drift; GLOBAL released. |
| G05 | DONE for frozen source scope | Only owned/precisely leased authored paths; committed-range whitespace and generation drift checks pass. |
| G06 | DONE for synthetic scope | Disposable synthetic databases/artifacts and loopback-only fake credentials; no private/runtime data. |
| G07 | DONE | Synthetic ports/fixtures only; no live application model/provider calls. |
| G08 | DONE for new copy | Plain Vietnamese, pinned preservation rules, no provider names or raw internal error codes in the new blocked state. |
| G09 | DONE | No fabricated source, approval, business decision, count, release or completion. |
| G10 | DONE for affected replay | Exact new OWNER reads/retries with no writes/calls; actual pre-change 1.2 report/candidate/prompt stores survive current 1.3 code, including kept revisions with VALID/INVALID/UNKNOWN; specialized default/private/crosscheck paths pass. |
| G11 | DONE | Additive tests only; existing assertions unchanged. |
| G12 | DONE for worker handoff | Template fields, per-ID evidence, code freeze and explicit lease releases recorded. Draft PR/final head are reported through the current lifecycle; coordinator owns final review/CI/merge. |
| G13 | N/A | No keyword collection/filter change; existing source admission remains in force. |

Unresolved:

- Independent exact-final-head review and full hosted Check, then normal merge by the coordinator. No full local suite was run; no baseline failure waiver is claimed.
- The guard is a deterministic Vietnamese/English lexical boundary, not a general language classifier or semantic truth verifier. It distinguishes locally governed prohibitions and explicit descriptive evidence from proposed purchase verbs. The bounded source-narration window and token patterns limit matching work; they create no business threshold or statistical rule.
- U11 comparison/statistic/release, U26 policy, U32 aggregates and paid U40 remain unavailable/unresolved.

Next action: push the frozen scoped branch, open the draft PR and send exact head/paths/check evidence. The coordinator owns independent final-head review, full hosted CI and normal merge; this worker never merges.
Business decisions pending: none added by this engineering correction; the existing U11/U26/U32 decisions remain with the owner.

## PR189 independent-review corrections — 2026-10-09

This section supersedes the earlier bounded-complete claim where independent review found three defects at `6d0cd882f16b4375d528c94b41dd220efb313a84`. The preserved review is `/tmp/ultimate-u16-final-review-sol/report-6d0cd88.md`; the earlier hosted Check was cancelled and supplies no approval. This follow-up completes only those engineering corrections, with new independent final-head review and hosted Check still required.

Worktree/branch: `ultimate-next-insight-sol`, `khangpworking/ultimate-no-purchase-guard-sol`; clean normal placement at exact reviewed `6d0cd88`, preserving reader review branch `a69b02d23b671f23b0ddd4cdd01850d3042cebcf` and Metric review branch `dc0597eec7c124f488c4ee2e3278bb4ad1d5fe5a`. No unmerged reader, private, Metric or P9 source was incorporated. Task `task_93b594cb55d3`, dispatch `ctx_14cfe7c70e7a`; source code/test freeze **`643d7e6eb41814fb011c54c208dea6055d4939e4`**. Final handoff-only head is reported in the fresh lifecycle.

Completed:

- P1: goods orders with ordinary straight/curly possessives, adjectives and quantities now reject through packet1.3's owning candidate validator. Both exact original phrases are covered in every admitted scalar/list proposal field and the actual authenticated OWNER/fake-HTTP path. Recursive authored-field traversal remains in place; inert claim IDs and exact source artifacts remain excluded.
- P2 historical dispatch: a generated packet1.3 alone no longer selects generic renderer24. The matching packet section must have a settled VALID/INVALID/DISPATCH_UNKNOWN execution. Missing, PREPARED, NOT_DISPATCHED or an execution belonging to another section do not change the old fallback. The unchanged marker-free owning M07/descriptive-v2 test now passes with renderer13. Specialized20/22/23/21/19/18/17/15/14 precedence remains unchanged.
- P2 safe negation: `No purchase is needed to assess quality; use public sources and owner data` remains VALID. Direct noun absence with needed/required/necessary is recognized locally; it cannot license another buy/order action in the same or a later clause. Source narration, past wording, purchase/order history, ordering product/source records and “in order to” controls remain available.
- Existing original purchase and trial-order invalid cases remain covered. Current HTTP acceptance runs four distinct modes: original purchase INVALID, new order INVALID, explicit no-purchase VALID, and original public-evidence VALID. It verifies authentic retained packet/input/prompt bindings, admission withholding, visible blocked copy, source-byte equality, unauthorized/forged rejection, exact saved HTML, all-table equality and zero further calls on reopened configless reads/retries.

Changed paths in this follow-up only: `decision-purchase-guard.ts`, the precise generic fallback in `reports.ts`, `tests/unit/decision-purchase-guard.test.ts`, `tests/unit/decision-purchase-version.test.ts`, `tests/integration/research-automation-no-purchase-api.test.ts`, and this handoff. No service, canonical, generator, prompt, schema, execution, API/UI, migration or dependency edit; no GLOBAL/generation. Unmerged packet1.3 correction stays version-stable under the explicit source-review grant. Historical factories remain untouched.

Evidence (all at frozen source above, Node24.15.0/npm11.12.1, focused concurrency2):

- Before correction: original independent packet/OWNER order and safe-negation assertions fail (`before-independent.log`), and unchanged historical marker-free assertion fails actual24/expected13 (`before-markerfree.log`). These files are preserved, not overwritten by later PASS.
- Original outside-Git reproductions are copied into `/tmp/ultimate-u16-review-corrections-sol` with import-root substitution only. `original-test-provenance.json` retains original/copy SHA256 and reverse-substitution equality; assertions remain unchanged. Final bounded suite **56/56 PASS** includes those originals, owned guard/version/OWNER tests, existing packet/input/execution tests and the complete unchanged `research-automation-methods.test.ts`. `final-focused.log` records the command output; earlier `after-independent.log` is18/18 PASS.
- Composition controls **33/33 PASS**: owning native/private-source flows, genuine retained crosscheck lineage and default coding (`composition-controls.log`). No specialized renderer code was edited.
- Backend `npm run typecheck` exit0 (`final-typecheck.log`); direct frontend `node node_modules/typescript/bin/tsc -p frontend/tsconfig.json --noEmit` exit0 (`frontend-tsc.log`). No generation, browser test, build or full local suite ran.
- **653/653 protected files unchanged** against the starting6d0 snapshot; canonical/generated/script/migration/frontend fingerprints are in `protected-{start,final}-hashes.json`. Package and lock SHA256 match the installed dependency provenance and source-only exact-main5f archive. Original historical fingerprint driver is preserved; it incorrectly reads a nonexistent packet `.sha256` and serializes only21 digests despite printing30. The separate `public-fingerprints-verified.mts` hashes actual packet bytes and asserts every digest: **30/30 equal** (9 packets,9 inputs,12 prompts) between exact main5f and corrected source.
- Actual source-only main5f services make fresh disposable all-VALID and mixed VALID/INVALID/UNKNOWN packet1.2 stores. Corrected code reads exact original HTML hashes, builds legitimate one-time kept quote-SKIP revisions with packet1.2 and unchanged execution rows, then cold configless/query-only read/retry succeeds with **calls=0, clocks=0, puts=0**. Current packet1.3 mixed store passes the same create/replay/cold sequence. No old/private/runtime store was copied. New revision construction legitimately writes once; only exact retry/read is asserted write-free.
- Each cold run rejects retained input/prompt/config/admission/candidate corruption and restores exact bytes. Retained-boundary driver **11/11 cases PASS** covers wrong workspace/run/pair, changed same-key body, five manifest fields and source/report CAS corruption, with identical restored tables, zero clocks/CAS writes. See `retention-summary.log`, per-fixture logs and `fixture-ledger.json` for exact pairs, HTML hashes, rows and CAS fingerprints.

Lease accounting: initial grant covered only the guard and reports generic selector; coordinator `msg_c30031f424fc`/`msg_5a2be67aa02a` explicitly extended that same guard lease to finding3 safe-negation correction. Both source leases are **RELEASED** at clean committed `643d7e6` via **`msg_3ac65453dc21`**. Guard SHA256 `95d7055f6eb3a177f758f010ad9c91436fe0a8d575ad06c9089c06ec94807692`; reports SHA256 `c69756cdb5c2966548d434d5f6954cf1d0add39e5412fd2bf12501d05b988913`. No shared source edits after release; only this own handoff append remains.

| Gate | Evidence / limit for this correction |
|---|---|
| G01 | Three precise independent findings, before/after evidence, exact source freeze and scoped paths recorded. |
| G02 | Final backend static and56 affected tests PASS; independent new-final-head review/full hosted Check pending. |
| G03 | Direct frontend static and actual OWNER HTML visible lint PASS; no frontend change, generation or browser acceptance claimed. |
| G04 | Protected653 unchanged; historical30 real-byte factory digests equal; no materialization/generation grant used. |
| G05 | Only two leased source hunks, three owned tests and own handoff; committed-range whitespace checked. |
| G06 | Fresh synthetic intake/stores and loopback fake keys only, with task-owned fixture ledger retained. |
| G07 | Fake transports only; no live application model/provider/collector calls or purchase execution. |
| G08 | No Vietnamese AI interpretation or historical copy changed; no new humanizer invocation claimed. |
| G09 | No fabricated approval, source, statistic, completeness, release or owner policy. |
| G10 | Authenticated current invalid/safe controls and old1.2 mixed replay/cold/negative evidence PASS; historical marker-free assertion preserved. |
| G11 | Original independent assertion bodies unchanged; historical renderer assertion unchanged. Existing generic24 unit expectation retained with an explicit settled-execution fixture, plus generated-only/unsettled negative controls. |
| G12 | Template fields, exact freeze, source-release receipt, tests and limits supplied; coordinator owns remaining review/CI/merge. |
| G13 | Source admission unchanged; no new keyword/collection/filter capability or generic S01 mapping claimed. |

Unresolved: deterministic lexical matching is bounded, not an exhaustive language classifier. No race/load/E2E/live-provider acceptance or whole-U16/whole-plan closure is claimed. U11 statistic/alignment/release, U26 policy, U32 aggregation and U40 paid/live work remain unresolved. All historical prompts, schemas and source/report bytes remain protected; new source/proposal cases are not retroactively applied to saved1.2 executions.

Next action: normal fast-forward push to existing draft PR189 after exact remote-head check, then coordinator independent corrected-final-head review, full hosted exact-head Check/readiness and normal merge. Worker never merges. Business decisions pending: none added by these engineering corrections; existing unresolved decisions remain with the owner.
