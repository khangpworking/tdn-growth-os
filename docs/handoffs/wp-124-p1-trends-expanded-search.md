# Handoff — WP-124-P1 trends + expanded search (offline slice)

Updated: 2026-10-07
Worktree/branch: Orca worktree on `wp/124-p1-trends-expanded-search`, branched from `origin/main` `35cad2d`.
Lane: Standard. Local commits only — never pushed, no PR, no merge.

## Completed

Three new, self-contained modules. Nothing is wired into the research run, the API,
`providers.ts`, `service.ts` or the reports; that is WP-124-P1b after the paid Phase 0
spike confirms the real response shape.

1. `search-trends.ts` — trends client for `engine=google_trends`:
   - `SEARCH_TRENDS_LIMITS` `{ maxKeywords: 5, maxCallsPerRun: 4, geo: 'VN', hl: 'vi', date: 'today 12-m' }`.
   - `planTrendsRequests` dedupes case/whitespace-insensitively, keeps the first 5 and lays out
     1 × TIMESERIES (all keywords, `q` joined with `,`), 1 × RELATED_QUERIES per first-2 keyword
     (single-query data type) and 1 × GEO_MAP_0 (first keyword): ≤ 4 calls, `[]` for empty input.
   - `parseTrends` yields typed facts for the three expected shapes; an index must be an integer
     0–100, `"<1"` or a missing value stays `null` (never 0); unknown/missing required arrays → `null`.
   - `trendsCacheKey` — deterministic, secret-free.
   - `fetchTrends` — `NOT_CONFIGURED` without a key (zero calls), `CANCELLED` on abort (zero calls),
     `FAILED` on HTTP error or unknown shape (exactly one capture, no retry), `OK` with facts.
     `api_key` is set on the URL only; `requestParameters` and the capture never hold it.
2. `expanded-search-queries.ts` — pure `buildExpandedQueries` (product templates, then brand
   templates, then adjacent product pairs; products → brands → pairs fill order; case-insensitive
   dedupe; trim/collapse; drop empty and > 80-char names; cap 10) and `expandedSearchCacheKey`.
   Only words from the owner-confirmed inputs plus the fixed template words are ever emitted.
3. `SearchCallBudget` in `expanded-search-queries.ts` — per-run ceiling, defaults trends 4 / search 10;
   `take` returns `false` once exhausted (no queueing, no retry).

Synthetic fixtures: `tests/fixtures/search-trends/{timeseries,related,geo,bad-shape}.json`
(2 keywords × 52 weekly points with 3 `"<1"`/missing points, 3 top + 2 rising queries including
`Breakout`, 5 regions with 1 `"<1"` value). Invented names only. No network, no paid provider,
key is the literal `test-key-not-real`.

### Design choices worth a reviewer's eye

- Capture `operation` is `'none'`: `ProviderOperation` in `providers.ts` has no `google_trends`
  member and this WP owns no provider types. The engine is preserved in
  `requestParameters.engine`. P1b should add a `serpapi.google_trends` operation when it wires this in.
- RELATED_QUERIES and GEO_MAP_0 facts carry `keyword`, taken from `search_parameters.q` (the
  provider's own echo). No echo → `null` (never guessed). TIMESERIES needs no single keyword.
- GEO_MAP_0 `region` prefers `location`, falls back to `geo`.
- `planTrendsRequests` drops empty keywords after normalisation so an empty `q` is never sent.
- `SearchCallBudget` lives in `expanded-search-queries.ts`; its two default limits are read from
  `SEARCH_TRENDS_LIMITS.maxCallsPerRun` and `EXPANDED_SEARCH_MAX_QUERIES`, so the trends client
  module stays free of query-builder knowledge.

## Changed paths

New files only (no existing file edited):

- `src/modules/analysis/research-automation/search-trends.ts`
- `src/modules/analysis/research-automation/expanded-search-queries.ts`
- `tests/unit/research-automation-search-trends.test.ts`
- `tests/unit/research-automation-expanded-search-queries.test.ts`
- `tests/fixtures/search-trends/timeseries.json`
- `tests/fixtures/search-trends/related.json`
- `tests/fixtures/search-trends/geo.json`
- `tests/fixtures/search-trends/bad-shape.json`
- `docs/handoffs/wp-124-p1-trends-expanded-search.md`

## Evidence

All commands run in the worktree root. No network, no paid provider, no AI call.

- Baseline `npm test` on `35cad2d` (recorded before this work; not re-run): **1041 tests, 1034 pass,
  4 fail, 3 skipped**. The 4 are the non-owned known failures below.
- Post-change full `npm test`: **1060 tests, 1053 pass, 4 fail, 0 cancelled, 3 skipped** —
  exactly **+19 tests, +19 passes**, the same 4 failures, no new failure.
- The same 4 failures confirmed as the known non-owned set by an isolated run:
  `node --import tsx --test tests/integration/operator-app-journey.test.ts tests/integration/pageindex-cloud-cli.test.ts`
  → **4 tests, 0 pass, 4 fail**: the three `Task045 …` smoke tests (they need `frontend/dist`) and
  `Cloud CLI persists private unreviewed results…`. Not touched by this WP.
- New unit tests:
  `node --import tsx --test tests/unit/research-automation-search-trends.test.ts tests/unit/research-automation-expanded-search-queries.test.ts`
  → **19 tests, 19 pass, 0 fail**.
- `npm run typecheck` → **PASS** (exit 0).
- `git diff --check origin/main...HEAD` → clean (exit 0).
- `git diff --numstat origin/main...HEAD` → all additions, new files only (no edits to existing files).
- Checklist step 10: case-sensitive grep for `lượt tìm`, `searches`, `volume`, `SerpApi`, `serpapi`
  over the new source, test and fixture files → **0 hits**. The only case-insensitive matches are
  internal identifiers — the imported constant `SERPAPI_LIMITS` and the capture provider id
  `'SERPAPI'` — neither is user-facing report text.

### Test-audit review of the new tests

Reviewed against the `test-audit` skill and its `TDN-GROWTH-OS.md` note. Each test owns one
observable contract (plan shape/dedupe/cap, each parsed shape, null ≠ 0, `null` on unknown shape,
zero calls without a key or after abort, one capture with no retry, key never recorded, cache-key
identity, builder fill order/dedupe/cap, no invented words, budget exhaustion). No test-only
production seam was added; the fake `ProviderTransport` never computes the values it asserts;
fixtures supply data only. The "same input → same key" and "never carries the key" checks are the
brief's explicit determinism/secret-free requirements.

## Commits

```
35a4157 WP-124-P1: add search-trends client, expanded query builder and per-run call budget
```

`git status` is clean; the handoff itself is a follow-up commit on the same branch.

## Unresolved

- Not wired into `service.ts`/`providers.ts`/reports — deliberately out of scope (WP-124-P1b).
- `CHANGELOG.md` and `docs/STATUS.md` are not owned paths, so they were not touched; the
  integrating WP should record these modules when they are wired in.
- Paid Phase 0 spike (≤ 6 paid calls, owner-approved) still required before any real call is made.

## Next action

WP-124-P1b: confirm the real `google_trends` response shape in the Phase 0 spike, add a
`serpapi.google_trends` `ProviderOperation`, then wire the plan, query builder and budget into the
research run behind the owner gate.

## Business decisions pending

- Owner approval to run the Phase 0 paid spike (≤ 6 calls) before wiring.
- Whether the 12-month trends window and the expanded-query templates are the wording the owner
  wants to see in reports (report presentation is Phase 4).
