# Handoff — SYNC-5 bounded L9 core (U-12)

Updated: 2026-10-08 (review corrections applied: exact-bytes binding, candidate-restricted resolution)
Worktree/branch: `khangpworking/ultimate-impl-sync6-opencode` (base refreshed to merged PR161 `e306c1b` via normal merge `719d519`; `origin/main` `a2250b7` merged normally before final push)
Completed: pure deterministic L9 keyword-meaning filter module, canonical schema + generated derivative, 12 focused synthetic unit tests, all green. Draft PR163 updated; no merge.
Changed paths:
- `src/modules/analysis/keyword-meaning-filter.ts` (new; generated types + canonical AJV validation, self-validating output)
- `contracts/analysis/keyword-meaning-filter.schema.json` (new canonical schema: data, frozen result, record/records trust boundary, provenance)
- `contracts/analysis/keyword-meaning-filter.generated.ts` (via `contracts:generate`)
- `scripts/generate-foundation-contract.mjs` (one registry line)
- `tests/unit/keyword-meaning-filter.test.ts` (new, 10 tests)
Pending: none. Both narrow leases released after their phases.
Evidence (commands, results, relevant revision):
- Task-provided Node 24.15.0 / npm 11.12.1 runtime (per-command PATH).
- `npm run contracts:generate` touched only the keyword schema derivative; registry diff is the one added line.
- `node scripts/typecheck.mjs` exit 0.
- `node --import tsx --test tests/unit/keyword-meaning-filter.test.ts`: 12/12 pass exit 0 (prior 10 plus exact-bytes binding and candidate-restricted resolution regressions).
- Full unit dir 454/456 pass, 0 fail (2 pre-existing skips) — run before the record-boundary correction; focused file re-verified after.
- No local full `npm test` result exists for this branch state: the one attempt was terminated incomplete by the coordinator before producing a summary, so no pass/fail counts are claimed from it. Exact-head hosted full CI is the mandatory coverage.
- `git diff --check` clean; `service.ts`, `providers.ts`, `reports.ts`, other contracts and manifests untouched.
Unresolved:
- Full `npm test` not run locally (slot discipline; coordinator accepts focused plus mandatory exact-head hosted full CI).
- Exact-head CI on the draft PR head is the gate (G-02 PENDING).
Next action: Astra independent review; coordinator owns ready/merge only after exact-head review and green full GitHub check.
Business decisions pending: none. Keyword/exclusion data is versioned input with explicit provenance, not business approval; AI drafting of the lists belongs to a later integration.

## Checklist evidence

| ID | Status | Evidence |
|---|---|---|
| U-12 | PARTIAL: bounded core DONE; integrations ESCALATED | DONE: versioned keyword/exclusion data (contract `l9-keyword-data-v1`, `dataVersion` per category, explicit `OPERATOR_SUPPLIED`/`MODEL_DRAFTED` provenance bound into the frozen result); accent-sensitive matching (NFC, case-folded, diacritics kept); undiacritized candidates resolve only from own marked context else UNCLEAR, with span-mapped accented look-alike guard (`UNLISTED_ACCENTED_LOOKALIKE` negative case); exclusions win over substrings; retained per-record text/context/reason binding + `byReason` accounting for M13/I17; code+data versions in result; byte-exact record identity; stable replay; canonical AJV validation of data, records and self-validated output; invalid input fails closed; no provider/model calls. ESCALATED (dependency-bound, other owners): AI list drafting, P5/P9/U-23 callers, M13/I17 disclosure. Whole-G-13 consumer compliance is NOT claimed. |
| G-01 | DONE | This table (U-12 PARTIAL with explicit ESCALATED remainder; no B items assigned). |
| G-02 | PENDING until exact-head CI | Typecheck exit 0; focused 12/12 exit 0. No local full-suite result (attempt terminated incomplete; no counts claimed); no waiver claimed. |
| G-03 | N/A | No frontend changes. |
| G-04 | DONE | `contracts:generate` touched only the new keyword derivative; registry diff is the one added line; no hand-maintained type duplication (module imports generated types, AJV validates data/records/output). |
| G-05 | DONE | Six owned paths changed: new module, new schema, new generated derivative, one generator registry line, new unit test, handoff. `git diff --check` clean; no other shared-file edits. |
| G-06 | DONE | Synthetic Vietnamese fixtures only; no secrets, paths, IPs, or runtime data. |
| G-07 | DONE | Pure deterministic module; no provider/AI calls. |
| G-08 | N/A | No owner-facing prose (reason codes are technical, appendix-owned rendering later). |
| G-09 | DONE | Unclear/empty/no-match stay UNCLEAR, never zero or invented; exclusion reasons retained verbatim from input data. |
| G-10 | DONE | No report/render paths touched; replay stability asserted by deepEqual rerun. |
| G-11 | DONE | No existing tests touched. |
| G-12 | DONE | This handoff with per-item evidence. |
| G-13 | PARTIAL | Core reports included/excluded/unclear with reasons and versions for consumers; consumer-side filtering-before-counts/quotes and exclusion disclosure remain with P5/P9/U-23 integrations (not claimed). |
