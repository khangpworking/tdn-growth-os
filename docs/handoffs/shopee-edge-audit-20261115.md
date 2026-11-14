# Handoff — Shopee desktop edge/lifecycle audit

Updated: 2026-11-15
Worktree/branch: `/home/pkhang/lanes/shopee-edge-audit-20261115` ·
`fix/shopee-edge-audit-20261115`
Base: `4c9320ba34fe2b9a4b8f314a7c4f309952f62167` (`origin/main`)

## Completed

- Reproduced and fixed the stale run-selection action path: selecting a run now
  immediately clears the old detail, shows a loading state, and exposes no old
  actions. A detached action event is bound to its visible run and selection
  generation, so it cannot dispatch the newly selected run.
- Added per-run/module single-flight state for `runModule`. A read-response
  rerender during a pending RPC keeps every matching action disabled; a second
  click cannot dispatch a duplicate request.
- Result stats now refresh from the existing terminal status poll when the run
  is no longer RUNNING. Custom/count sampling polling also refreshes stored
  review data and, on the result tab, stored review stats when it observes a
  RUNNING-to-settled transition under the same run selection.
- Create lifecycle now keeps the exact committed run bound/locked when the
  independent status read fails or has no safe entry shape. It shows the
  existing created-but-entry-unverified notice, keeps the flow disabled, and
  prevents a retry gesture from creating another run.
- Sol correction applied: `newEntry` comes only from authoritative
  `api.status().gates.entry` or `null`. `newRun.data.entry` is never used as
  execution authorization, even when it contains PASS. A bridge `entryError`
  is used only for the truthful unverified notice detail.
- Final test-audit consolidation: the two create/status tests are now one
  table-driven owner test. It covers partial `{entry:null, entryError}` and
  bridge `entryPassSlip()` under both status failure and missing entry. Every
  row retains exact created ID, frozen form, truthful notice, disabled flow,
  and no second create.
- The custom-completion regression now also proves delivered UI freshness:
  after sampling settles, rendered `resultCount` contains `12 bình luận` and
  the cached `resultEmpty` state is gone. Read counters remain a secondary
  check, not the only proof.
- Two existing tests were adapted to the intentional loading state: their waits
  tolerate the cleared panel and the stale-output test gates every run-A read.
  Their final assertions were not weakened.

## Changed paths

- `tools/shopee-desktop/index.html`
- `tests/integration/shopee-desktop-ui.test.ts`
- `docs/handoffs/shopee-edge-audit-20261115.md`

No bridge file was edited. `tools/shopee-desktop/tdn_shopee_app.py` and
`test_bridge.py` remain the separate bridge owner's scope.

## Reproduction evidence (pre-fix, pre-consolidation)

Command, run from the worktree:

```bash
node --import tsx --test --test-name-pattern='clears the old detail|detached module action|single-flight|unverified entry|bridge entry PASS|terminal status poll|custom collection completion' tests/integration/shopee-desktop-ui.test.ts
```

Exit `1`; 6 tests failed for the intended behavior:

- selecting B left the visible A detail/action in place;
- a detached A action dispatched `run-b`;
- an unrelated sampling read rerender produced a second `runModule` dispatch
  (`2 !== 1`);
- terminal DONE polling never refreshed the cached zero stats;
- custom completion never refreshed stored review data/stats;
- a created run with a partial entry result and missing status gates threw while
  reading `gates.entry`, losing the committed binding.

Raw output:
`/home/pkhang/lanes/shopee-edge-audit-20261115-logs/red-ui.stdout`
SHA256 `4cc6b307ada92553b15abb3025c7efde5dda90afc4035c63d999441f840e5b79`
(exit `1`; stderr empty).

This red run predates the Sol-requested consolidation. The consolidated owner
test keeps those assertions across four rows. Only the `missing entry` rows
exercise the original unsafe `gates.entry` read; the captured red failure is the
partial-entry row. The two `status failure` rows and the bridge-entry-PASS rows
are authority-boundary preservation guards, not separate original defects:
status-failure identity locking already existed, and bridge `entry` was already
ignored for authorization. The bridge-PASS case was added after Sol's status-only
correction, so it was not part of the six-failure red run.

## Green checks

Focused lifecycle suite:

```bash
node --import tsx --test --test-name-pattern='clears the old detail|detached module action|single-flight|unverified entry|terminal status poll|custom collection completion' tests/integration/shopee-desktop-ui.test.ts
```

Exit `0`; 6 passed, 0 failed.
Raw output:
`/home/pkhang/lanes/shopee-edge-audit-20261115-logs/green-focused-final.stdout`
SHA256 `08f4c330d536255166981cb387d08f097ad852e3f361fd74b5554634fbf87cf6`.

Full Shopee desktop UI suite:

```bash
node --import tsx --test tests/integration/shopee-desktop-ui.test.ts
```

Exit `0`; 79 passed, 0 failed.
Raw output:
`/home/pkhang/lanes/shopee-edge-audit-20261115-logs/green-ui-final.stdout`
SHA256 `f9f4fb3c5887668341fc09614dadd90c29ea81ecae2d156114a09179dc6de96f`.

Typecheck:

```bash
npm run typecheck
```

Exit `0`.
Raw output:
`/home/pkhang/lanes/shopee-edge-audit-20261115-logs/typecheck-final.stdout`
SHA256 `0ce5e881bdbc949a2c0dad8e6c2a3acc5dd5ee077bea50c5e155241a7d4c7423`.

Tests used Node `v22.23.2` with an untracked symlink to the sibling
`deps-node24/node_modules` tree whose `package-lock.json` SHA256 is
`97e3368d9df81183a8d37945c3023bfea6ed04499567092b6bc174451f320b46`, matching
this worktree. The symlink was removed afterward. Logs are outside Git.
`git diff --check` passed.

## Preserved invariants

- Existing backend eligibility, entry gate rules, capture policy, counts,
  limits, caps, approval/evidence/accounting semantics are unchanged.
- Status remains the only authority for create-time entry eligibility.
- Stored review reads only: no new provider, Metric, calendar, Shopee, Jev,
  paid-source, browser, or source call.
- Failed/stale async replies cannot repaint another selected run or re-enable a
  pending module action.
- No production run, config, credential, data, identity, guard, pointer, or
  runtime state was touched.

`sourceCalls=0` · `productionMutations=0`

## Unresolved / next action

- Sol's requested consolidation and delivered-UI assertion are complete. The
  reviewed UI scope is committed locally and remains unpushed.
- Bridge partial `newRun` behavior remains with the separate
  `fix/shopee-edge-bridge-20261115` owner and is not integrated here; integration
  waits for the service test-isolation review.
- Native Windows QA was not run or claimed.

Business decisions pending: none for this scoped UI repair.
