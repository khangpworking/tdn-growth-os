# Handoff — SYNC-1 Market reader rules

Updated: 2026-10-08
Worktree/branch: `khangpworking/ultimate-impl-sync1-codex`, assigned base `c2014bb59207daf2bc7ca2389a530e96bba34b8e`.
Completed: Scoped reader corrections, both M05 lanes, nullable workbook/metric/source flow, per-platform identity and arithmetic, retained-version replay regressions. Validation is complete using the exact combined evidence described below; publication receipt is supplied through the live Dispatch.
Changed paths: `src/modules/analysis/reader-report/{build,bundle,classify,market-template,market-template-v2,market-proposals,metric-rows,nullable-metrics,web-facts}.ts`; `src/modules/analysis/descriptive-market-methods.ts`; `src/modules/analysis/research-automation/{descriptive-report,reader-report-revisions}.ts`; `contracts/analysis/{reader-report-input,descriptive-market-methods}.{schema.json,generated.ts}`; derived `contracts/api/research-automation-reader-report-api.generated.ts`; `tests/helpers/sync1-reader-fixture.ts`; `tests/unit/sync1-market-corrections.test.ts`; three scoped existing test assertion updates listed below; this handoff.
Evidence (commands, results, relevant revision): Node 24.15.0 / npm 11.12.1; synthetic fixtures and fake transports only. Final commands are recorded below.
Unresolved: U-32 positive cross-platform total exception remains ESCALATED; R3 timezone, universe, disjointness proof and L5 are unresolved. The implemented safe portion always keeps new-reader platforms separate. Renderer dispatch integration, deterministic generation and final local coverage are complete. The exact-head GitHub full check and independent review remain coordinator gates.
Next action: Coordinator verifies the supplied draft PR/head, exact-head GitHub full check and independent review before any conditional merge. No merge or deployment is authorized to this worker.
Business decisions pending: U-32 aggregation authority; proposed tasks, owners and event-based deadlines in M12 await owner approval. No business numeric policy was added.

## Implementation and compatibility

- New reader builds use `reader-report-market-v2` and reader input `1.2.0`. Reader input `1.0.0` / `1.1.0` retain their numeric constraints and historical output paths; the new contract permits missing sales/source values and observed zero.
- Empty workbook sales cells become `null`; actual zero stays zero. Missing members make complete sums unknown, zero/missing denominators make ratios unknown, and unknown opening dates do not produce an observed zero cohort. Metrics serialize null and render “Chưa có dữ liệu”. The adapter retains explicit legacy conversion for replay.
- Complete positive inputs reuse inspected per-platform metrics; incomplete or zero inputs use the missing-data projection. That view preserves all workbook rows, source headlines, monthly values/chart, known per-platform reconciliation, shops and retained source tables with citations. It never adds cross-platform sample totals.
- M01/M04 show group and price shares side by side with exhibit pointers. M11 retains every platform/group hypothesis in classification order; M12 contains three prerequisite proposals, each with immediate task, proposed owner and event-based deadline visibly awaiting approval. Revenue cannot select or prioritize these proposals.
- New M05 copy treats estimated in-sample sales as a measure of demand, keeps source, period and platform scope, and separates search interest. It preserves source declarations and uncertainty; it does not infer outside-sample size, unmet demand, forecasts or buyer counts.
- Descriptive method `1.1.0` changes the interpretation identity; verification rebuilds the retained method version. Method `1.0.0` keeps its original limitation and HTML. The report renderer dispatch is owned and supplied separately by OMP: exact commits `fc07995b253cbdd13f1f2777889f1b508e0ff11f` and `884bef0ef832ee5286825b0fee80a267416a8773` were inspected and cherry-picked as `2e251f1` and `0363498`. Their only paths are `src/modules/analysis/research-automation/reports.ts` and `tests/unit/research-automation-renderer-identity.test.ts`. The bump applies only to new-method Market reports; unused Market methods do not change Insight bytes.
- Lowercased brand-name intersection is absent from the new reader. Brand labels remain per platform; title/name similarity cannot prove shared brands, sellers or people.
- `reader-report-revisions.ts` was explicitly assigned as a supporting integration path. Existing stored HTML reads and exact retries remain immutable; no changes were authored in `service.ts`, `decision-packets.ts` or `reports.ts`.
- Vietnamese interpretation edits used reviewed `humanizer-vi` revision `576c80fb445a8b2e9ec1993a6490ab6529b89d12`, including preservation rules. No application prompt integration or historical rewrite was performed.

## Validation

All commands used Node 24.15.0 / npm 11.12.1. After the final generator lease was released, direct frontend commands reused its output and did not regenerate validators while another worker held the lease.

| Command | Result |
|---|---|
| `npm ci` | PASS; dependency manifests/locks unchanged. |
| Focused reader/report/descriptive suite | 91 PASS, 0 FAIL, 2 existing optional skips. |
| Corrected renderer/report + seven SYNC-1 regressions, concurrency 2 | 23 PASS, 0 FAIL, 1 existing optional PDF skip. |
| `npm run contracts:generate` | PASS; only the five scoped contract paths changed. |
| Second `npm run contracts:generate && git diff --exit-code contracts/` | PASS; deterministic against staged intended contract changes. |
| `npm run frontend:validators` | PASS under exclusive final lease; generated JS is ignored and tracked declaration unchanged. |
| `npm run typecheck` | PASS on the final source/contracts. |
| `node_modules/.bin/tsc -p frontend/tsconfig.json --noEmit` | PASS. |
| `node_modules/.bin/vite build --config frontend/vite.config.ts` | PASS; static runtime prerequisites built. |
| `node --test-concurrency=2 --import tsx --test frontend/tests/*.test.ts` | 257 PASS, 0 FAIL, 0 SKIP. |
| `node --test-concurrency=2 --import tsx --test tests/unit/*.test.ts tests/integration/*.test.ts` | 1,216 tests: 1,210 PASS, 3 initial FAIL, 3 existing optional SKIP; same coverage as `npm test`, with coordinator-required concurrency limit. All three failures resolved in affected reruns below. |
| PDF integration rerun, concurrency 1, documented interpreter override | 7 PASS, 0 FAIL, 0 SKIP. Installed hash-pinned `pypdf==6.19.0` from `scripts/requirements-pageindex.txt` in a task-local virtual environment outside Git. |
| `research-automation-methods` integration rerun, concurrency 1 | 15 PASS, 0 FAIL, 0 SKIP after correcting the fresh method-version expectation to 1.1.0. |
| `git diff --check` and staged assigned-base range check | PASS; final committed range checked before publication. |

The raw full command exited 1: two PDF tests lacked the documented parser, and one fresh-method integration assertion still expected the superseded version. No application source changed during full coverage. Only the documented task-local parser environment and the specifically listed fresh-version assertion changed for the successful affected reruns. The coordinator explicitly accepted combining this exact evidence instead of repeating unaffected tests; the exact-head GitHub full check remains required before merge. This is not a claim that the initial full command exited 0 or an exception for unresolved failures.

The initial schema phase and short final phase both had explicit exclusive coordinator leases and durable RELEASE messages; no generators were run outside those phases. Initial strict AJV schema compilation and descriptive tests passed.

Synthetic replay tests pin independently generated pre-change reader HTML and metrics for both retained input versions, plus descriptive method bytes and M05 HTML. The seven regressions cover missing/zero, contracts, workbook conversion, unknown dates, source coverage, no combined total/name identity, unranked revenue-insensitive proposals, both M05 lanes, source retention and reconciliation.

Existing assertions updated without removing or weakening behavior coverage:

1. `tests/integration/research-reader-report.test.ts`: zero-unit derived ASP now expects `null`, preserving the distinction between undefined ratio and actual zero.
2. `tests/unit/research-automation-reports.test.ts`: the new-method M05 assertion expects E10 in-sample demand wording and separately stated search interest instead of the superseded “not demand” copy. Added assertions build both real retained method versions and check their renderer identity; the historical-copy and existing Insight full-output equality assertions remain valid.

3. `tests/integration/research-automation-methods.test.ts`: a fresh collection-to-report execution now expects descriptive method `1.1.0`; all zero/missing, evidence, immutable byte-read and no-redispatch assertions remain unchanged. Legacy `1.0.0` replay is pinned separately by frozen method bytes and M05 HTML.

## Checklist evidence

| ID | State | Evidence / limit |
|---|---|---|
| U-06 | DONE | New M01/M04 neutral group/price shares and pointers; synthetic no-superlative assertion; old reader bytes preserved. |
| U-07 (Market M11/M12 only) | DONE | Full group inventory; three dependency-ordered proposals with immediate task/owner/deadline and explicit pending approval; changing revenues leaves M12 unchanged. Draft packets and Insight are outside this assignment. |
| U-08 (reader + draft M05) | DONE | Reader 1.2.0 and descriptive method 1.1.0 E10 copy, source/period/platform scope, estimate disclaimer and separate search-interest wording; legacy method copy replayed exactly. Owner renderer dispatch integrated; actual builder-version assertions cover Market v13/current and v12/legacy, with existing Insight full-output equality retained. |
| U-30 | DONE | Nullable schema, adapter, derivation, metrics and renderer; observed zero remains zero; unknown cohorts/ratios stay missing; synthetic regressions. |
| U-31 | DONE | No new cross-platform brand intersection/count; per-platform labels and identity caveat; identical synthetic titles/names remain distinct. |
| U-32 | ESCALATED | Safe per-platform output implemented and tested, including absence of combined totals for same-export inputs; positive exception awaits reconciled R3 timezone/universe/disjointness and L5. No positive exception implemented or claimed complete. |
| B IDs | N/A | No B items assigned. |
| G-01 | DONE | Every assigned U ID and all G IDs recorded here; partial U-32 explicitly escalated. |
| G-02 | DONE | Final backend typecheck PASS; full 1,216-test coverage plus all affected repaired reruns described above. No unresolved local failure; raw initial exit 1 is disclosed. Coordinator accepted exact combined evidence and still requires exact-head GitHub full check. |
| G-03 | N/A | No tracked frontend edits; supplemental frontend validation follows schema generation. |
| G-04 | DONE | Explicit initial/final schema leases, strict AJV compilation, deterministic repeated contracts generation and clean unstaged contract output against the staged intended changes; validators generated before explicit lease release. |
| G-05 | DONE | Working/staged assigned-base and final committed range diff checks plus owned-path review. Supporting reader revisions path authorized separately; reports.ts/renderer test changes are exact coordinator-requested owner commits only. |
| G-06 | DONE | Synthetic data only; no runtime databases, commercial data, secrets, machine paths or IPs added to repository artifacts. |
| G-07 | DONE | No live collectors, providers or application AI calls invoked; tests use synthetic/fake input. |
| G-08 | DONE | New interpretation uses neutral Vietnamese and approved platform/search names; source quotes remain inert and unchanged. |
| G-09 | DONE | Missing/zero, nullable denominator/date and source-derivation regressions; no invented numeric policy or cross-platform identity. |
| G-10 | DONE | Frozen pre-change reader 1.0/1.1 HTML+metrics and method 1.0 bytes+M05 HTML hashes; existing immutable read/exact retry integration tests. |
| G-11 | DONE | No test removed/skipped/weakened; three scoped behavior/copy/version assertion changes documented above. |
| G-12 | DONE | This handoff includes every template field and the checklist evidence table. |
| G-13 | N/A | No keyword collector added or changed. Existing source evidence is read as data; L9 collection is a separate package. |

## Proposed coordinator-owned documentation updates

After independent review, record U-06/U-07 Market-only/U-08/U-30/U-31 implementation evidence and the new reader/method versions in STATUS and the sync plan. Keep U-32 ESCALATED with only its safe per-platform portion implemented. Draft/Insight U-07 and aggregation authority remain separately owned; do not mark them complete from this package. No shared README/STATUS/checklist/methodology changes were authored here.
