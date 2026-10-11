# Handoff — JEV-209b live Jev second pass

Updated: 2026-10-12
Worktree/branch: `wp/jev-209b-live`
Completed: service-owned Jev wiring for P9 and Market web collection, sidecar retention/replay, new-report labels, invalid-sidecar fallback, contract registry integration, and synthetic coverage. No commit was created.

Changed paths:

- `src/modules/analysis/research-automation/service.ts` — optional `l9Jev`, P9 callback, Market COLLECTION triage, report admission, and exact replay verification.
- `src/modules/analysis/research-automation/source-evidence.ts` — retained web sidecar, deterministic admission projection, invalid-fingerprint fallback, and Jev triage helper.
- `src/modules/analysis/research-automation/p9-source-intake.ts` — P9 sidecar validation/fingerprint fallback with deterministic corpus preservation.
- `src/modules/analysis/research-automation/l9-jev-triage.ts` — exact-match and unavailable-sidecar helpers.
- `src/modules/analysis/research-automation/reports.ts` — new sidecar report appendix labels and web admission.
- `src/api/operator-app.ts` — passes parsed `researchJev` configuration into the API configuration object.
- `contracts/analysis/automation-source-evidence.schema.json` and generated derivative — optional retained `jevTriage` field.
- `scripts/generate-foundation-contract.mjs` — registry entry for `analysis/l9-jev-triage`.
- `tests/unit/jev-209b-operator.test.ts`, `tests/unit/jev-209b-rejection.test.ts`, `tests/integration/jev-209b-live.test.ts`, `tests/integration/jev-209b-p9.test.ts` — fake-fetch and synthetic integration coverage.

Sidecar decision:

The sidecar remains attached to the COLLECTION source-evidence packet because the packet already owns the deterministic web admission and is replay-verified. This keeps the Jev audit additive, preserves the no-sidecar byte shape, and lets report-time admission use the same fingerprint-bound result. P9 retains its sidecar as a package member, as already defined by the P9 intake contract.

Owner decisions applied:

- “Off, or no sidecar retained: every stored document and every report is byte-identical to today.” The fixed flag-off step/report hashes are asserted from the pre-Jev deterministic fixture; the optional field is omitted when disabled.
- “Jev down, timeout or invalid answers: deterministic L9 result, run note `L9_JEV_UNAVAILABLE` where the run already records stage notes, the run never fails because of Jev.” Network/model failure and rejected sidecars produce an unavailable sidecar while deterministic admission remains authoritative.
- “Reader text never says Jev, TypeSafe or any provider.” The appendix exposes only the machine-classifier labels `đúng sản phẩm (máy phân loại)` and `không nói về sản phẩm (máy phân loại)`.
- “New Market reports still pass `assertMarketBusinessGate` (GATE-209).” The new Market path remains behind the existing report gate; no gate assertion was weakened.

Evidence:

- `npm run contracts:generate`: exit 0; the generated source-evidence derivative was produced by the repository generator. No frontend generated validator was changed.
- `node ../tools/typecheck-win.mjs`: exit 0, `files 920 status 0`.
- Focused Jev/source/P9 run: 28 passed, 1 failed. The only failure is the required operator test on Windows, before its assertions: `TypeError: frontend/dist is unreadable` at `src/api/operator-app.ts:376`, matching the existing Windows frontend permission failure also seen in `tests/integration/operator-app.test.ts`.
- `node --import tsx --test tests/unit/jev-209b-rejection.test.ts`: 1/1 passed.
- `git diff --check`: exit 0.
- No network, live provider, paid call, key/config read, commit, push, merge, PR, or deployment was performed.

Blocked / needs other lane:

- `src/api/research-automation-api.ts` is explicitly prohibited in this lane. It does not yet declare or construct the Jev client from `researchJev`, so `operator-app.ts` can only pass the parsed configuration object to that API boundary. The coordinator/owner of that file must add the client construction and service injection; this is the remaining live operator-to-service wiring blocker.
- The operator configuration test cannot reach its Jev assertions on Windows because the existing `preloadFrontend` permission check rejects synthetic temporary directories. The test is retained and not weakened or skipped; Linux CI remains the source of truth.
- The worktree’s shared Git index is not writable in this Windows session, so staging the new handoff/tests failed with `index.lock: Permission denied`; the five new files remain untracked for the coordinator to add.

## Checklist evidence

| ID | Status | Evidence |
|---|---|---|
| JEV-209 | DONE within owned paths | Optional service injection, P9 sidecar retention, Market web sidecar retention, report admission/labels, deterministic fallback, registry entry, and synthetic fake-fetch tests are implemented. |
| U-12 | DONE for this lane | Jev remains a second pass over deterministic L9 results; full-input fingerprint matching rejects stale/forged sidecars and records unavailable fallback. |
| U-19 | PARTIAL | P9 service wiring and package retention are covered; the operator/API construction remains blocked by the prohibited API file. |
| U-27 | DONE for this lane | New M13/I17 appendix text uses the required machine-classifier labels and never exposes provider names; legacy report versions remain unchanged. |
| G-02 | PARTIAL | Typecheck and focused tests passed; one required operator test has the documented Windows-only `frontend/dist is unreadable` failure. |
| G-03 | N/A | No frontend source or generated frontend validator changed. |
| G-04 | DONE | Source-evidence schema was regenerated; generator registry now includes `analysis/l9-jev-triage`; no hand-edited generated file. |
| G-05 | DONE | Only lane-owned production paths, allowed contract paths, new tests, and this handoff were changed. |
| G-06 | DONE | Synthetic fixtures and fake fetch only; no secrets, machine paths, IPs, emails, or customer data. |
| G-07 | DONE | Jev calls are injectable; tests use fake fetch and no live provider. |
| G-08 | DONE | Reader-facing output does not name Jev, TypeSafe, or providers. |
| G-09 | DONE | Unknown/invalid/low-confidence values fall back to deterministic decisions; no unknown value becomes zero. |
| G-10 | DONE | Flag-off fixed hashes and legacy renderer paths preserve existing replay semantics. |
| G-11 | DONE | No existing assertion was weakened, deleted, or skipped. |
| G-12 | DONE | This handoff records paths, decisions, evidence, blockers, and per-item status. |

## Coordinator note (round 1)

The writer flagged that the automation API builds the service and was outside the brief. The coordinator added the API boundary in the same lane: ResearchAutomationApiConfiguration.researchJev, a TypesafeJevClient built only when the configuration is enabled, refused without the OWNER writer (checked before any database opens), and passed as the l9Jev option to the OWNER writer service only. The read-only service never gets the client. Test: 	ests/unit/jev-209b-operator.test.ts (second test).
