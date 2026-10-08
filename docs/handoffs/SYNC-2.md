# Handoff — SYNC-2 bounded U-01 default peers

Updated: 2026-10-08 (bounded U-01 implementation complete; independent exact-head CI/review pending)
Worktree/branch: `ultimate-impl-sync1-codex` / `khangpworking/ultimate-impl-sync1-codex`.
Completed: deterministic offline E11 peer selection; reader M07 defaults and owner additions; immutable reader 1.3 rule/input/result retention; strict canonical policy validation; StartSnapshot rule freeze before discovery or sales reads; versioned descriptive v3 package/method 1.2 dispatch; Market v14 defaults for Metric-only and classified drafts; service-owned retention and read binding independent of optional renderers; synthetic compatibility and tamper checks.
Changed paths: canonical/generated default-peer, reader-input and descriptive-method contracts; contract/browser-validator registrations; pure selector/classified adapter; reader build/templates and owning revisions; approved narrow research-automation model, service, bridge, draft and M05 rendering; focused unit/integration tests and fixture; this handoff. No manifests, migrations, provider/admission policies or coordinator-owned documents changed.
Evidence (commands, results, relevant revision): source integration `a5bb413596731a1609941bf7263d616d9e9e937e`; normal refreshed-main checkpoint `984a0320c0e2e5637b317dfb375ed7f8862270eb` includes merged PR161/162/163/164/165. Final affected checks: 75 pass, one pre-existing optional local Chromium skip, zero failures. Actual classified HTTP revision regression passes. Backend typecheck, leased deterministic contract generation/clean output, frontend typecheck/build and all 260 frontend tests pass. Exact commands and lease receipts are below.
Unresolved: U-26 automatic collection, scope revision, recollection and admission policy remains ESCALATED. Mandatory final exact-head hosted full `npm run check` and independent review belong to the coordinator; no local full backend suite was launched, as explicitly instructed. No whole-SYNC-2, business approval or deployment completion claim.
Next action: coordinator reviews the draft PR at its reported exact head and runs the mandatory hosted full gate before any merge. Shared source and schema phases have both been explicitly released; any review correction requires coordinated ownership.
Business decisions pending: none for the bounded E11 rule; U-26 remains separately escalated.

## Method and retention boundaries

- Rule `e11-sales-peers-v1` fixes the 50% threshold, minimal prefix in descending revenue, stable identity tie break, exact source-title-label/shop identities and complete compatible group denominator. It is declared before reader workbook parsing and retained with input and result.
- Exact decimal strings and BigInt determine membership. The result retains input sales rows once, eligible source references, exclusion reasons, group totals, selected identities and their individual source membership. Every group/platform frame remains separate; no cross-platform sum or name join.
- Unknown brands use source-backed shop IDs. Missing shop IDs and source-title mismatches remain ambiguous. Reader aliases do not merge default identities. A title label is labelled as coming from the seller title; it is not a verified legal brand identity.
- Missing revenue, unknown group membership, missing sources, conflicting references and overlapping listing IDs block a complete group denominator. Zero revenue retains an observed zero and selects nobody. Other group/period/platform/frame/unit rows have explicit exclusions. Exact source-reference duplicates alone collapse.
- Owner additions are retained and displayed separately; they do not alter revenue membership or the default threshold. Quick-search cards and screen leader tables never provide sales membership.
- Reader 1.3 uses `reader-report-market-v3`; existing reader 1.0/1.1/1.2 render paths remain intact. The owning revision record retains the selected rule/result and exact retries/read APIs return committed artifacts without redispatch.
- New starts retain the exact rule before QUICK_SEARCH or any sales read. Optional markers are checked against the canonical rule schema on read. Marker-free old starts stay marker-free; exact retries reuse their saved start.
- New detail packages use mapping/normalization v3 and descriptive 1.2, with the exact start rule bound into the retained descriptor. Mapping v1/v2 and methods 1.0/1.1 retain their original verification and semantics. Descriptive 1.2 keeps current M05 demand wording while recording the explicit classified-sales gap for detail-only M07.
- Market v14 consumes the retained classified sales input through the pure adapter, including Metric-only drafts and drafts carrying retained descriptive 1.1. One selected default peer is valid. The obsolete >=2 detail-peer path applies only to marker-free old starts. Owner scope peer IDs retain their original meaning as additions; no scope/admission change occurs.
- The owning service computes the exact default snapshot before calling an optional renderer, strips adapter-supplied peers and persists its authoritative result. Reads verify the result against the frozen start rule, actual scope additions and verified classified input, then serve the saved HTML/PDF. Missing classified input is an explicit empty/missing result, never detail-derived compatible sales or zero.
- Market v12/v13 and every Insight renderer remain unchanged for the same marker-free inputs. Synthetic legacy starts retain v2 packages and original M07 dispatch; opening reports does not write or collect again.

## Frozen synthetic compatibility evidence

Existing SYNC-1 tests still pin reader 1.0/1.1 HTML/metrics and descriptive 1.0 bytes/M05 HTML. This package also pins pre-edit reader 1.2 positive HTML `c45ee04895526bb20d5510f8a6dd1c3de37611e79a83d4ca5c172fe14059edb4`, nullable HTML `60a02aebf8351c22f1f4524c9f2c65410db2f08869ea1396d5815b8f2c8bfe25`, and descriptive 1.1 bytes `ff5dd8500ad8faad17ea16226427f620586b6e232851805d7e0d141d2e911940`, plus the corresponding reader metric hashes. A separate regression pins complete marker-free Market and Insight HTML and semantic bytes for both descriptive 1.0 and 1.1 before shared draft edits.

## Checklist evidence

| ID | State | Evidence / limit |
|---|---|---|
| U-01 | DONE (bounded implementation; review/CI pending) | Frozen selector, reader and draft M07, start policy, service-owned retention, one-peer boundary, missing/zero/identity/group compatibility and legacy bytes pass affected checks. |
| U-26 | ESCALATED | Auto-collection/revision/recollection/admission policy excluded; no workflow activation. |
| B IDs | N/A | None assigned. |
| G-01 | DONE | Every assigned U ID and G ID is recorded with bounded state. |
| G-02 | ESCALATED (hosted gate pending) | Backend typecheck and affected tests pass; coordinator explicitly requires final exact-head hosted full `npm run check` instead of a duplicate local full suite. |
| G-03 | N/A (no frontend source edit) | Leased `frontend:typecheck`, `frontend:build` and `frontend:test` pass; 260/260 tests, no skips. |
| G-04 | DONE | Both schema phases used explicit sole leases; strict canonical AJV and generated types. Final generation on refreshed main has clean committed contracts; final release receipt `msg_85a90a72c79b`. |
| G-05 | DONE | Owned-path review and diff checks; API/report-generation registration and narrow shared owning integration explicitly authorized. Source phase released at `a5bb413` via `msg_bfe248cfc8ef`. |
| G-06 | DONE | Synthetic fixtures only; no runtime databases, private data, secrets, machine paths or IPs added. |
| G-07 | DONE | No live collection, provider or application-model call. |
| G-08 | DONE | Neutral Vietnamese labels preserve evidence, uncertainty and owner-addition separation; prescribed humanizer-vi preservation rules applied; no prompt integration. |
| G-09 | DONE | Missing/zero, ambiguous identity/group, compatibility and explicit exclusions covered. |
| G-10 | DONE | Reader 1.0/1.1/1.2, method 1.0/1.1 and full marker-free Market/Insight byte guards pass; actual legacy/new package, immutable read, policy/result tamper and classified revision regressions pass. |
| G-11 | DONE | No existing test removed, skipped or weakened. New-start owning test now expects method 1.2 and M07 explicit missing-sales output instead of legacy 1.1 detail inventory; added a real marker-free fixture retaining the original expectations. Synthetic guards are restored after controlled corruption. Full frozen byte assertions remain unchanged. |
| G-12 | DONE | All template fields and this checklist present. |
| G-13 | N/A | No keyword collection added or changed. |

## Proposed coordinator-owned documentation update

After exact-head review and full hosted CI pass, record bounded U-01 complete across the reader and draft, preserving explicit missing-data limits and marker-free compatibility. Keep U-26 ESCALATED and the whole auto-collection policy package partial. Shared STATUS, plan, README and methodology files were not edited.

Independent requested coordination-doc review: exact commit `763ed5e4d652cec9bba8f0e0b02ef4a2423f9a23` was read-only reviewed against PR161/162 exact head/merge/green Check evidence, all changed-document local targets and operative U-04 versus Ultimate §6.3. No blocking completion, authority or link issue was found; no coordinator-owned documentation was edited.


## Final validation commands and coordination

All Node/npm checks used the required Node 24.15.0/npm 11.12.1 runtime. Synthetic fixtures and fake transports only.

```sh
npm run typecheck
node --import tsx --test --test-concurrency=2 tests/unit/default-market-peers.test.ts tests/unit/default-peer-reports.test.ts tests/unit/sync1-market-corrections.test.ts tests/unit/research-automation-renderer-identity.test.ts tests/unit/research-automation-reports.test.ts tests/unit/research-automation-report-citations.test.ts tests/integration/research-reader-report.test.ts tests/integration/research-automation-methods.test.ts tests/integration/research-automation-metric-report.test.ts
node --import tsx --test --test-name-pattern='three industries classify' tests/integration/research-automation-api.test.ts
npm run contracts:generate
git diff --exit-code -- contracts
npm run frontend:typecheck
npm run frontend:build
npm run frontend:test
git diff --check origin/main...HEAD
```

Results: backend typecheck passes; affected run 75 PASS / 1 existing optional Chromium SKIP / 0 FAIL; selected classified HTTP test PASS (all three synthetic industries, full accepted universe, immutable old/new report URLs); generated contracts clean; frontend typecheck/build pass and 260/260 frontend tests pass. The frontend build has the existing bundle-size advisory, with no build error. The owning service file passes 17/17 checks including controlled tamper and marker-free legacy cases; those cases are included in the affected run. No full local backend result is claimed.

Initial canonical lease release was `msg_8dd043e51d4f`; final generation lease grant was `msg_de54e84df4fd` and release was `msg_85a90a72c79b`. Shared U-01 source release is `msg_bfe248cfc8ef`. The coordinator retains merge, exact-head CI and independent-review responsibility; no live collection/provider/application-model call, cap change, deployment or PR merge was performed by this worker.

Ancillary requested documentation reviews were read-only: `5fc483d7a4c54ab0aaf72283c7d2bd8f9a36c4f9` PASS (PR163 exact head/merge/full Linux CI and 76 local link targets); `07d81006e28157c3048de0ec86ac24c82ed68505` PASS (PR164 exact head/merge/full Linux CI/preview, bounded U02/U05/U07/U16, partial U04/U12/B03/U32 and 100 local link targets). No coordinator-owned document was edited.
