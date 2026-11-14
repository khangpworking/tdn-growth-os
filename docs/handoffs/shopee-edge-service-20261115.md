# Handoff — Review service: stale queued references must not re-execute a job

Updated: 2026-11-15
Worktree/branch: `/home/pkhang/lanes/shopee-edge-bridge-20261115` · `fix/shopee-edge-bridge-20261115` · base `4c9320ba34fe2b9a4b8f314a7c4f309952f62167`

## Completed

A cancelled queued job keeps its queue item; resuming it adds a second item.
Pre-fix the worker's only admission check skipped `state == 'cancelled'`, so the
stale item could execute the resumed job again after the first item had already
stored a truthful terminal result. BrowserWorker now admits a job only when its
current persisted state is exactly `queued`. Stale duplicate references are
drained without executing.

## Root cause

- `cancel_job` on a queued job sets `state='cancelled'` but cannot remove the
  item already in `asyncio.Queue`.
- `resume_job` resets `state='queued'` and enqueues another item.
- `run_job` skipped only `cancelled`. Once resume changed the state back to
  `queued`, the old item executed the job; the second item then re-executed the
  succeeded job. Draining produced `queuedReferencesAfterResume=2`,
  `statesAfterEachReference=[succeeded, succeeded]`, `crawlerInvocations=2`.

Restart flow was inspected: `initialize_db` marks `running` as `interrupted`,
and lifespan re-enqueues only rows currently `state='queued'`. The new guard
admits exactly those.

## Protected invariants

- Which jobs may be resumed is unchanged; `resume_job` eligibility, capture
  policy, defaults, caps, accounting and stored evidence are untouched.
- A cancelled queued job without resume never runs (existing behavior kept).
- A resumed job executes exactly once and stores the same truthful result and
  terminal state; nothing is erased or replaced.
- No new test-only seam; the test drives the real `create_job`, `cancel_job`,
  `resume_job` endpoints and the real `BrowserWorker.run()` drain with a fake
  page.

## Changed paths

- `tools/shopee-review-service/app.py`
- `tools/shopee-review-service/tests/test_app.py`
- `docs/handoffs/shopee-edge-service-20261115.md`

## Evidence

Primary owner-boundary regression:
`ServiceTests.test_cancel_then_resume_executes_the_job_once_after_draining_stale_queue_items`
runs real create → cancel while queued → resume → worker drain with a fake page
and asserts one crawler invocation, `state=succeeded`, and the stored result's
exact `job_id`/`complete`/records. The negative control in the same test creates
and cancels a queued job without resume and asserts zero crawls, `state=cancelled`,
and no result file. The scenario builds its own fresh `BrowserWorker` and patches
`app.worker` only for that scenario with `mock.patch.object`, so the shared module
worker, its queue, page and loop binding are restored on exit. Resume and cancel
endpoints run against that exact patched worker.

Claim boundary: this proves no duplicate terminal execution and the
cancelled-without-resume negative control. It does not claim a new FIFO or
resume-tail-position guarantee, and adds no durable queue fields. Existing resume
behavior (progress counters reset, fresh crawler config) is unchanged; no new
saved-cursor continuation behavior is claimed.

Red (pre-fix, intended duplicate execution):

```sh
PYTHONDONTWRITEBYTECODE=1 \
~/.local/share/tdn-growth-os/shopee-review-sampling-6075386f-1111-r2/service-venv/bin/python \
  -m unittest discover -s tools/shopee-review-service/tests -p 'test_app.py' \
  -k cancel_then_resume -v
# FAILED (failures=1): AssertionError: 2 != 1
```

Green (post-fix):

```sh
# same command with -k cancel_then_resume
# Ran 1 test ... OK

# same command with -p 'test_*.py'
# Ran 6 tests ... OK

git diff --check
# clean
```

Review follow-up (test isolation only): the production guard is unchanged and
the original D red log is retained; no new red proof was taken for this
refactor. Raw outputs are outside Git in
`/home/pkhang/lanes/shopee-edge-bridge-20261115-evidence/`.
`sourceCalls=0`, `productionMutations=0`, `browserStarted=false`; temporary
isolated `APP_DATA_DIR`/`SHOPEE_FLOW_STATE` roots and a synthetic token only.
The read-only service venv and runtime paths were not written.

## Unresolved

None for the service scope.

## Next action

Exact Sol review of the unpushed commits. No push, merge, deploy, or restart.

## Business decisions pending

None.
