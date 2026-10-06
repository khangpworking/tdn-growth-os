# Handoff — deterministic stale model coding test

Updated: 2026-10-06
Worktree/branch: fix/research-stale-model-test-clock

Completed:
- Isolated the stale-result publication scenario from real filesystem latency
  with a scoped Node test mock for `setTimeout`, reset in `finally`.
- Preserved the `/changed/` rejection, retained `VALID` execution, mutation-free
  exact retry, manual request-key protection and dispatch-count assertions.
- Added explicit latest-manual-winner and absent-stale-proposal checks, plus a
  diagnostic execution outcome if the stale call unexpectedly resolves.
- Added a separate deterministic timeout regression: wait for transport entry,
  commit a manual winner, advance the clock to the unchanged one-second deadline,
  verify abort and `DISPATCH_UNKNOWN`, then release a valid late response and
  verify retained unknown replay without proposal publication or redispatch.
- No production code, workflow, dependency, timeout limit or provider changes.

Changed paths:
- `tests/integration/research-automation-exact-reviews.test.ts`
- This handoff.

Evidence (base `b042aec507a3fa8359086df865cacc67db9ecfb0`):
- Cloud Linux Node 24.19.0; CI remains pinned to repository Node 24.15.0.
- Locked `npm ci`, strict `npm run typecheck`, and `git diff --check` passed.
- Both focused scenarios passed four consecutive runs; an independent read-only
  review also ran them successfully and found no blocking issue.
- Whole exact-reviews file plus decision-synthesis execution tests: 17/17 passed.
- I14 execution tests: 4/4 passed.
- Full `npm run check` attempted with the pinned optional PDF verifier. Frontend
  checks passed, but integration export tests encounter this sandbox's protected
  Git marker in the temporary directory, triggering their required outside-Git
  safeguard. The conditional-economics CLI failure reproduces in isolation.
  This is not a full local pass; use the draft PR's exact-head GitHub CI result.

Unresolved:
- Prior CI logs show a missing expected stale rejection, but do not identify the
  returned execution status. The real timeout race is a concrete possible cause,
  not a proven reconstruction of those runs.
- GitHub CI validation of the published head remains required.

Next action: Review exact-head CI and the narrow test diff before any merge.
Business decisions pending: None. Merge and deployment are outside this task.
