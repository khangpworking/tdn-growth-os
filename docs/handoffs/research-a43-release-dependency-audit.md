# A43 release dependency audit

Updated: 2026-10-01, 06:38 Asia/Bangkok (UTC+07:00).
Repository: `khangpworking/tdn-growth-os`.
Worktree/branch: `work/research-a24`, `feature/research-a43-located-insight-methods`.
Scope: read-only Git/GitHub inventory plus this handoff. This is a proposed
release path, not merge or activation authority. A43's concurrent edits are
outside the audited candidate; the pinned candidate is A42 PR #101.

## Result

The 13 open research PRs form one cumulative ancestor chain, including the
nine PRs whose GitHub base is `main`. They are not independent changes.
Current main is an ancestor of every candidate. No divergent commits or
GitHub-reported merge conflicts exist at this snapshot. All 13 remain draft;
all have successful Check and preview checks. This establishes integration
feasibility and CI evidence, not approval or real-input acceptance.

The earliest existing complete candidate is A42 head
`23d4fb75147789079271f2d59489929d92f8cb2f`: it includes all listed prerequisites,
the retained report reader, opt-in report-kit presentation and initial OWNER
generation flow. L0/L1 do not need to wait for A43 or the remaining methods.
The full main-to-A42 delta is 44 commits and 253 changed paths; review it as a
release, using the smaller adjacent PR deltas below to avoid repeated review.

## Verified dependency graph and heads

```text
main 31f1559
  -> #88 A27 -> #89 A28 -> #91 A29 -> #92 A30 -> #93 A31
  -> #94 A32 -> #95 A33 -> #96 A34 -> #97 A35 -> #98 A36
  -> #99 A37 -> #100 A38/A39 -> #101 A42
```

Each arrow was checked with `git merge-base --is-ancestor` (exit 0) and
`git rev-list --left-right --count` (0 commits unique to the predecessor).
The increment columns compare adjacent heads, not the sometimes cumulative
GitHub PR diff. Branch names and SHA values came from `gh pr list` and Git
objects; no fetch or checkout change was necessary.

| PR / method | Head branch after `feature/` | Exact head SHA | GitHub base | New commits / changed paths from predecessor |
|---|---|---|---|---|
| [88](https://github.com/khangpworking/tdn-growth-os/pull/88), A27 ChartSpec | `research-a27-chart-spec` | `7ccc7db630ca57d100d580083a64a2112ff17e9e` | main | 3 / 18 |
| [89](https://github.com/khangpworking/tdn-growth-os/pull/89), A28 readiness | `research-a28-input-readiness-gate` | `89281a63e2793070ec5881a07421ea401cbf7654` | main | 4 / 15 |
| [91](https://github.com/khangpworking/tdn-growth-os/pull/91), A29 SQLite projection binding | `research-a29-normalized-observation-ledger` | `c65c1dbba3d1110dca4202414ab58eedfa06f7ba` | main | 2 / 10 |
| [92](https://github.com/khangpworking/tdn-growth-os/pull/92), A30 preparation | `research-a30-m03-section-recipe` | `08d9393dee54e614e7a2006122cddb76c46091ef` | main | 4 / 41 |
| [93](https://github.com/khangpworking/tdn-growth-os/pull/93), A31 readiness | `research-a31-preparation-readiness` | `f1e1cfe4913a317c44535a383cc905c4c35859a0` | main | 3 / 13 |
| [94](https://github.com/khangpworking/tdn-growth-os/pull/94), A32 metrics | `research-a32-m03-verified-metric-set` | `edcd613b0b4b55301ad57555347828ea21efd123` | main | 1 / 15 |
| [95](https://github.com/khangpworking/tdn-growth-os/pull/95), A33 chart bundle | `research-a33-m03-chart-bundle` | `7affb3dff7fd69d16aeec4b8282345e0b5687a42` | main | 1 / 16 |
| [96](https://github.com/khangpworking/tdn-growth-os/pull/96), A34 evidence envelope | `research-a34-m03-narrative-evidence` | `00393cdcabb52e5265def2870766949bd20c4631` | main | 1 / 18 |
| [97](https://github.com/khangpworking/tdn-growth-os/pull/97), A35 factual narrative | `research-a35-m03-deterministic-narrative` | `2d258faa5a38558470d1f4972fb84cf61682005e` | main | 1 / 16 |
| [98](https://github.com/khangpworking/tdn-growth-os/pull/98), A36 section artifact | `research-a36-m03-section-artifact` | `459665fbe6d2645305d1111d23d3faf7835fe126` | #97 branch | 2 / 18 |
| [99](https://github.com/khangpworking/tdn-growth-os/pull/99), A37 artifact ledger | `research-a37-m03-section-artifact-ledger` | `00d5cb36faaf36538a3328d7a4d64ff7504a8de7` | #98 branch | 6 / 28 |
| [100](https://github.com/khangpworking/tdn-growth-os/pull/100), A38/A39 assembly | `research-a38-report-assembly-snapshot` | `ea38e7f8295c8cbd61ec7776c4363958867c1f10` | #99 branch | 5 / 29 |
| [101](https://github.com/khangpworking/tdn-growth-os/pull/101), A42 wave 1 | `research-a42-live-report-wave1` | `23d4fb75147789079271f2d59489929d92f8cb2f` | #100 branch | 11 / 111 |

All `main` base OIDs were `31f1559d24aac2c886f4a7ecde5485511aaa736a`.
Each stacked base OID equals its predecessor's exact head above. GitHub
returned `OPEN` (open-list membership), `isDraft=true`, `MERGEABLE`, `CLEAN`
and empty `reviewDecision` for every row.

Overlap inspection confirms why the main-based branches cannot be treated as
parallel: #89/#91 change `src/api/report-api.ts`; #92 through #100 repeatedly
change `package.json`, `scripts/generate-foundation-contract.mjs` and
`src/modules/analysis/index.ts`. #101 changes contract generators,
`src/api/report-api.ts`, `src/api/operator-app.ts` and adds generation wiring.
These are already ordered changes in shared files, not competing versions to
cherry-pick independently. No merge simulation or conflict resolution was
needed: the exact ancestry establishes that the current heads do not diverge.
New main commits, rebase/squash operations or new PR heads invalidate that fact.

## Current CI evidence

Every Check run below reports the exact head in the table. Both checks are
completed successfully for every row. Preview success is synthetic report
evidence, not business acceptance or a Fedora runtime check.

| PR | Check run | Preview run |
|---|---|---|
| 88 | [36672105754](https://github.com/khangpworking/tdn-growth-os/actions/runs/36672105754) | [36672105747](https://github.com/khangpworking/tdn-growth-os/actions/runs/36672105747) |
| 89 | [36675867890](https://github.com/khangpworking/tdn-growth-os/actions/runs/36675867890) | [36675867816](https://github.com/khangpworking/tdn-growth-os/actions/runs/36675867816) |
| 91 | [36678714008](https://github.com/khangpworking/tdn-growth-os/actions/runs/36678714008) | [36678713904](https://github.com/khangpworking/tdn-growth-os/actions/runs/36678713904) |
| 92 | [36685722417](https://github.com/khangpworking/tdn-growth-os/actions/runs/36685722417) | [36685722571](https://github.com/khangpworking/tdn-growth-os/actions/runs/36685722571) |
| 93 | [36687990093](https://github.com/khangpworking/tdn-growth-os/actions/runs/36687990093) | [36687990104](https://github.com/khangpworking/tdn-growth-os/actions/runs/36687990104) |
| 94 | [36689841654](https://github.com/khangpworking/tdn-growth-os/actions/runs/36689841654) | [36689841689](https://github.com/khangpworking/tdn-growth-os/actions/runs/36689841689) |
| 95 | [36691238040](https://github.com/khangpworking/tdn-growth-os/actions/runs/36691238040) | [36691237996](https://github.com/khangpworking/tdn-growth-os/actions/runs/36691237996) |
| 96 | [36692902793](https://github.com/khangpworking/tdn-growth-os/actions/runs/36692902793) | [36692902867](https://github.com/khangpworking/tdn-growth-os/actions/runs/36692902867) |
| 97 | [36694370154](https://github.com/khangpworking/tdn-growth-os/actions/runs/36694370154) | [36694370089](https://github.com/khangpworking/tdn-growth-os/actions/runs/36694370089) |
| 98 | [36701013499](https://github.com/khangpworking/tdn-growth-os/actions/runs/36701013499) | [36701013492](https://github.com/khangpworking/tdn-growth-os/actions/runs/36701013492) |
| 99 | [36709140073](https://github.com/khangpworking/tdn-growth-os/actions/runs/36709140073) | [36709140062](https://github.com/khangpworking/tdn-growth-os/actions/runs/36709140062) |
| 100 | [36727631981](https://github.com/khangpworking/tdn-growth-os/actions/runs/36727631981) | [36727632152](https://github.com/khangpworking/tdn-growth-os/actions/runs/36727632152) |
| 101 | [36766353400](https://github.com/khangpworking/tdn-growth-os/actions/runs/36766353400) | [36766353460](https://github.com/khangpworking/tdn-growth-os/actions/runs/36766353460) |

Main's exact head has successful push Check
[36667851797](https://github.com/khangpworking/tdn-growth-os/actions/runs/36667851797).
#88's workflow runs `npm run check`; that workflow is unchanged through #99.
#100 and #101 job details explicitly show successful full integration checks
and skipped research-iteration checks. Current routing can select reduced
research checks for eligible draft stacks; a green badge alone is not proof
of a full release check on a future head.

#101's current Check completed at 2026-10-01 02:35:02 ICT; preview completed
at 02:34:18 ICT. The Check log records 657/657 backend and 182/182 frontend
tests, zero failures, production frontend build and generated-contract drift
verification. Preview job steps include retained legacy/prepared exports,
desktop/mobile/PDF capture, assembled report, report-kit and artifact upload.
These newer runs cover the final documentation head; A42's handoff cites the
earlier executable-code checkpoint and its original visual inspection.

## Review and input readiness are separate gates

| Dimension | Verified status | Still required |
|---|---|---|
| Code dependency availability | Entire prerequisite chain is in #101; exact main is its ancestor | Pin final integration/release SHA; recheck if heads change |
| Linux CI | All listed heads green; #101 full check and synthetic preview verified | Full check and relevant production-operator browser journey on final integrated release |
| Independent code review | A37 handoff records three corrections after independent review; A38/A39 records repaired binding/cleanup and no remaining scoped blockers; A42 records retry-boundary repair and scoped visual confirmation | Release-wide review coverage must be recorded; this audit is not a semantic code review |
| GitHub review records | `GET /pulls/{number}/reviews` returned `[]` for all 13 PRs | No GitHub approval may be inferred; any required merge review remains unresolved |
| Earlier review traceability | A27 handoff names a reviewed implementation SHA; A28-A36 handoffs provide validation evidence | Independent reviewer/scope coverage for every earlier increment was not established by this audit; absence of GitHub reviews does not prove no off-platform review occurred |
| Method policy | A41 adoption and A42 plan record accepted scoped methods | Method acceptance does not validate a particular output or source |
| Real-input readiness | A42 checks use synthetic data; supported picker is retained Metric Shopee Sheet1 with UNKNOWN excluded from WIDE | Owner-authorized exact package, period/scope/profile and source acceptance; no raw arbitrary workbook support is implied |
| Business semantics | Missing methods/inputs remain explicit; prepared reports remain partial and unapproved | Review real results before treating them as findings; no approval follows from 30 visible section headings |
| Fedora readiness | Not inspected in this audit | Actual commit/PID, database/artifact paths, schema ledger/checksums, executor lock and recovery plan |

A42's initial UI cannot upload sources, select supplementary quote/descriptive
inputs, generate AI claims or append another version to an existing series.
Descriptive M05/M06/M07/M09 descriptors work through the service/CLI contract.
These limits do not prevent L0 or the bounded initial L1, but they must remain
visible in acceptance criteria. The real review corpus mentioned in A42 remains
manual/unverified without provider/listing IDs; historical retention counts
are not accuracy evidence. No private inputs were searched or opened here.

## Migration and runtime delta

Git tree inspection shows main has migrations 0001-0035 and #101 has 0001-0037.
`git diff main..A42 -- migrations` contains exactly two additions and no edits
to earlier migrations:

| Added migration | First candidate | Relevant requirement |
|---|---|---|
| `0036_analysis_metric_input_preparations.sql` | #92 / A30 | Immutable exact-source preparation table; references existing normalized datasets and artifact manifests; package/workspace and dataset indexes |
| `0037_analysis_section_artifacts.sql` | #99 / A37 | Immutable M03 section artifact and six-role member tables; foreign key to preparation and artifact manifests; M03/renderer constraints |

#100 and #101 add no migrations. Across main to #101, `package-lock.json`,
dependency versions and `src/platform/db/migrations.ts` are unchanged;
`package.json` only gains research CLI scripts. Migration runner requires a
contiguous ledger, matching names/checksums and `PRAGMA user_version`.
`src/api/operator-app.ts:191` requires both runtime database version and
ledger maximum to equal the executable's migration head before startup.
Consequently, an executable at main/schema 35 will reject a schema-37 DB;
an additive SQL change does not make binary-only rollback safe.

This is a repository-to-repository delta, not the live Fedora delta. Do not
assume Fedora is schema 20, 35 or 37. Determine actual schema and matching
migration checksums through the authorized runtime preflight. If earlier than
35, inspect every missing migration, not just these two. If newer/different,
resolve the discrepancy before activation. Exercise the real delta on a
recovery copy, retain a consistent DB/artifact recovery set, and account for
writes after the recovery point before any restore.

## Shortest safe release proposal

1. Use the existing A42 head as the L0/bounded-L1 candidate. A43 can continue
   independently; do not make its unfinished methods a release prerequisite.
   Close review gaps on the actual cumulative delta and confirm the release
   scope. No new framework, source connector or domain setup is required.
2. When merge authority is granted, preserve commit ancestry and process
   `#88 -> #89 -> #91 -> #92 -> #93 -> #94 -> #95 -> #96 -> #97 -> #98 -> #99
   -> #100 -> #101`. This is a proposed topological order, not authorization.
   Recheck bases/heads at each boundary. #98-#101 currently target feature
   branches; after each prerequisite lands, verify or explicitly retarget the
   child to the intended release base before merging. Do not accidentally
   merge a child only into an obsolete feature branch. Avoid squash/rebase
   unless the stack has been deliberately replanned and its new deltas checked.
3. If retaining the existing PR history requires a separate release checkout,
   prepare it from pinned main and integrate the reviewed candidate there.
   The ancestry already proves no current-main conflict; do not reimplement
   or independently cherry-pick shared layers. Record the resulting release
   SHA and compare its tree against the reviewed candidate. Recheck current
   main before relying on this snapshot.
4. Run full Linux release verification and contract drift on the final SHA,
   plus the production operator path for index/history/readiness/report HTML,
   evidence download and reopening after restart. For bounded L1, use scratch
   data to verify explicit source choice, retained result selection and retry.
   Existing synthetic preview evidence is useful but not the live API journey.
5. In the authorized Fedora release task, inspect actual runtime/schema,
   validate migration/recovery on a copy and prepare the exact release with
   its pinned toolchain. Obtain release-specific activation approval before
   changing the operator, applying live migrations or writing business data.
   Activate localhost only, with one executor and the preserved paths, then
   perform read-only live verification. Domain/Cloudflare remains later work.
6. Accept a real report only after the exact source package and scope pass
   source/profile checks and the output receives semantic review. If these
   inputs are not ready, L0 may expose honest empty states or clearly labeled
   synthetic evidence; do not delay the UI solely to imply all 30 methods ran.

Unresolved: release-wide review coverage, merge authority, final release-head
verification, actual Fedora state/recovery and real-input acceptance. There is
no observed current Git conflict or failing candidate CI to repair.
Next action: coordinator uses this graph to choose and review the pinned L0/L1
release, then opens the runtime preflight under its separate authority.
Business decisions pending: none newly inferred by this audit; exact real-input
selection and release activation remain outside this read-only assignment.

Completed/changed paths: only this handoff was added by the audit agent.
Evidence commands: GitHub PR/branch/run/review reads, Git ancestry/count/diff/
tree inspection, and scoped handoff/workflow/migration source reads. No PR
mutation, merge, push, deployment, SSH, provider call, Windows test, build or
typecheck was performed.
