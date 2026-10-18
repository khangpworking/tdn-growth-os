# Handoff — CIHANG-209 CI `check` hangs in the shared browser lock tests

Updated: 2026-10-18
Worktree/branch: `wp/ci-hang-209`

Completed: about one CI `check` run in three stopped printing after the TikTok
or Meta lane unit tests and was cancelled at 30 minutes. Main hung there too.

Cause: three tests that hold the in-process Metric capture lock used a fixed
number of event-loop turns (200 `setImmediate` turns, or a 30 ms sleep) as the
signal that the fake capture had started. `runMetricCapture` prepares its
capture directory before it calls the executor, so on a slow filesystem the
assertion ran first and failed. The fake capture was then never released, the
lock stayed held, and the next test in the file waited for it forever (a
referenced test-runner interval and the 27-minute executor timer kept the
process alive).

Changed paths:

- `tests/unit/meta-auto-lane.test.ts`, `tests/unit/tiktok-top-ads-lane.test.ts`, `tests/unit/metric-capture-runner.test.ts` — each lock test waits for a promise the fake executor resolves when it actually starts, raced against capture completion so an early stop fails the assertion instead of waiting. Held operations are released and awaited in `finally`, so a failed assertion cannot strand the lock for later tests.
- `docs/handoffs/CIHANG-209.md`

Deliberate non-changes: no source file, lock, timeout or test-runner setting
changed. No test was removed or skipped.

Evidence (Linux, Node 24.15.0, investigation run before this branch):

- Ordinary repetitions: 400/400 exit 0 before and 400/400 after; the hang did not reproduce spontaneously there.
- With a diagnostic-only 50 ms delay on the capture's final `stat`: TikTok lane 10/10 stalled, Meta lane 10/10, Metric capture 1/1 before; 0/40 each after, with every test body completing.
- A forced assertion failure while the fake capture held the lock now fails that one test and lets every later test finish.
- `npm run typecheck` passed; the three files together pass 58/58.
- Windows pre-check on this branch: the three files pass 58/58.
- No browser, real OpenCLI, network, provider or production call was made.

Unresolved: none for this lane. A per-file test timeout could be added later as an extra guard.

Next action: review at the exact head, CI, merge.

Business decisions pending: none.
