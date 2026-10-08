# Handoff — NEXT-SOURCES keyword filter integrations and source evidence (U-12/G-13, U-27)

Updated: 2026-10-08
Worktree/branch: `khangpworking/ultimate-next-sources` (base `9985490`, PR169 merged)
Completed: versioned AI keyword/exclusion drafting with fake transport; P5 SerpApi L9 consumer module (service wiring explicitly deferred); U-27 source-appendix projection module. No P9/U23 collectors exist — left unbuilt with no shim, no false completion.
Changed paths:
- `src/modules/analysis/keyword-list-drafting.ts` (new)
- `src/modules/analysis/keyword-meaning-filter.ts` (one additive export: data validator)
- `src/modules/analysis/research-automation/serpapi-l9-filter.ts` (new)
- `src/modules/analysis/source-appendix-projection.ts` (new)
- `tests/unit/keyword-list-drafting.test.ts` (new)
- `tests/unit/serpapi-l9-filter.test.ts` (new)
- `tests/unit/source-appendix-projection.test.ts` (new)
- `src/modules/analysis/keyword-list-draft-record.ts` (new: retained draft record retain/replay via generic CAS)
- `tests/unit/keyword-list-draft-record.test.ts` (new)
Pending (need explicit allocation/lease, not started):
- service.ts collection/history hunks wiring the SerpApi L9 consumer (Insight exclusive lease; request exact hunks when ready)
- canonical schemas + generated derivatives for the drafting request and appendix projection (single-writer lease ungranted; Insight first in queue)
- P9/U23 collectors and their L9 callers (no code exists; packages unbuilt)
- Market/Insight rendering of the appendix projection (Sol/OMP own templates; projection contract handoff to follow)
Evidence (commands, results, relevant revision):
- Task-provided Node 24.15.0 / npm 11.12.1 runtime (per-command PATH).
- `node scripts/typecheck.mjs` exit 0.
- Focused suites exit 0: keyword-list-drafting 4/4, serpapi-l9-filter 4/4, source-appendix-projection 3/3, keyword-meaning-filter 12/12 (additive export covered, behavior unchanged).
- `git diff --check` clean; service.ts, reports.ts, providers.ts, contracts, manifests untouched.
Unresolved:
- Exact service collection/history integration hunks (awaiting allocation).
- Canonical projection contracts (awaiting single-writer lease).
- P9/U23 collector packages (unbuilt; explicit blocker).
Next action: Astra independent review; coordinator owns review/CI/merge. No worker merge.
Business decisions pending: none. Drafted lists are MODEL_DRAFTED versioned input, not approval; no caps set or changed.

## Checklist evidence

| ID | Status | Evidence |
|---|---|---|
| U-12 | PARTIAL: drafting + P5 consumer module DONE; service wiring ESCALATED | DONE: AI drafts versioned keyword/exclusion lists from sales product names + frozen scope seeds through an injected fake transport; output validated against the canonical data contract with exact frozen term bytes; transport failures and malformed/duplicate output fail closed with nothing retained. P5 SerpApi consumer maps retained web results to stable URL+position identities and classifies via the merged L9 core, keeping excluded/unclear out of main counts with reason accounting. ESCALATED: service.ts collection/history wiring (exclusive lease; hunks to be allocated). |
| U-27 | PARTIAL: projection DONE; contract/rendering ESCALATED | DONE: pure versioned projection expands one row per registry ID with actual IDs, single-or-mixed tiers (never aggregated), report names, L9 excluded/unclear counts with reasons, L10 video-comment source type, and E12/E13 attribution verbatim. ESCALATED: canonical schema + generated derivative (lease), Market/Insight template rendering (Sol/OMP). |
| G-01 | DONE | This table (U-12/U-27 PARTIAL with explicit ESCALATED remainder; no B items assigned). |
| G-02 | PENDING until exact-head CI | Typecheck + focused suites exit 0 (drafting 4, draft-record 3, serpapi-l9 4, appendix 4, filter 12); no local full suite (no concurrent suites); no waiver. |

## Bounds rationale (no business or cap invention)

- Term 200 chars, recordId 300 chars, reportName/attribution 300 chars, group 120 chars, reasons 200 chars: same bounds as the existing keyword-meaning-filter and source-status contracts.
- Seed lists max 200 terms and prompt max 65536 bytes: engineering caps bounding model payload and artifact size (65536 matches the existing model max-response bound); drafted output lists re-validated by the canonical schema (max 500).
- Appendix max 50 sources / 200 usages and 4 registry IDs per entry: engineering caps bounding report size; 4 matches the source-status contract maxItems.
- Draft-record prompt/artifacts: 4 MiB replay bound as a read safety limit.
| G-03 | N/A | No frontend changes. |
| G-04 | PENDING | No contract edits (lease ungranted). |
| G-05 | DONE | `git diff --check` clean; only owned new modules, one additive export, new tests, handoff. |
| G-06 | DONE | Synthetic fixtures only; no secrets, paths, IPs, runtime data. |
| G-07 | DONE | Fake transports only; no provider/model calls. |
| G-08 | N/A | No owner-facing prose. |
| G-09 | DONE | Missing stays missing (null snippets, absent context); no invented records or counts. |
| G-10 | DONE | No report/render paths touched; deterministic replay asserted by rerun equality. |
| G-11 | DONE | No existing tests touched. |
| G-12 | DONE | This handoff with per-item evidence. |
| G-13 | PARTIAL | Core + P5 consumer report included/excluded/unclear with reasons and versions; collection-path filtering and P9/U23 consumers remain with their packages (not claimed). |
