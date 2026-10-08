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
