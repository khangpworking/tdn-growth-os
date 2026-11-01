# Handoff — YC1 independent claim-layer tests

Updated: 2026-11-01.

Worktree/branch: isolated Treehouse slot 3, local
`wp/insight-claim-layer-tests`, based on reviewed `6cdecfd3`.

Completed: 243 offline pytest cases across all 40 rows IM-Q126–IM-Q165,
independently authored from CONTRACT revision 22 and the full six-round review.
Synthetic source packets, temporary SQLite warehouses/codebooks, in-memory key
replacement, fake Jev answers and fake grader files only. No production edits,
real reviews, real key reads, external transport, model CLI, paid calls, app
runtime access, full-repository sweep, push, PR creation or merge.

Changed paths:

- `tests/part4/`: seven test modules plus two fixture/support files.
- `tests/README.md`: coverage, controls and **contract gaps (claim layer)**.
- Exactly three existing helpers receive the Q126/Q161-approved eighteen-tool
  inventory extension: `test_boundaries.py::schemas`,
  `part2/test_boundaries_p2.py::assert_surface`, and
  `part3/test_boundaries_p3.py::assert_surface`. All prior argument/nested-type
  checks and mutants remain. No other part 1–3 Python content changed.

Evidence (Python 3.14, existing offline venv at
`/home/pkhang/firstmate/data/insight-mcp-p2-tests/venv`):

- `python -m pytest tools/mcp-insight/tests --collect-only -q -p no:cacheprovider`:
  **917 collected** (674 earlier cases + 243 new cases), no collection errors.
- A final fake-transport audit corrected a double subtraction of RAC
  probabilities; all seven checked input values now reach the fake response
  unchanged. Collection was repeated successfully after that fixture-only fix.
- Earlier suite executed by test file in fresh offline pytest processes:
  **673 passed; 1 pre-existing failure**. For that baseline verification only,
  the three amended inventory helpers temporarily used their exact HEAD
  contents so the still-twelve-tool implementation could be tested; the
  eighteen-tool extensions were restored in `finally` and remain the delivery.
- The unchanged failing case is
  `test_portraits_and_spec.py::test_im_q49_ri39_kept_motives_and_exact_owner_f310_sentence`
  (R-I39): line 146 reads
  `openspec/changes/insight-mcp-v1/specs/insight-mcp/spec.md`. At base `6cdecfd3`
  only `openspec/changes/archive/2026-10-31-insight-mcp-v1/...` exists. Git blob
  comparison proves this test is unchanged. No assertion was weakened and its
  path was not edited outside the approved exception.
- New-suite smoke execution stopped after three expected baseline failures:
  Q126 sees twelve tools, and two Q129 cases lack `review.posted_date`.
  This is evidence of the absent claim implementation, not claim acceptance.
- The initial single-process legacy run exhausted the inherited 1024-descriptor
  soft limit; a child-only 8192 limit avoided that failure but the monolithic
  retry timed out at 600 seconds. Fresh processes per test file completed all
  674 earlier cases without changing their assertions.
- `git diff --check` is clean. Proof/logs are outside Git under
  `/home/pkhang/firstmate/data/insight-claim-layer-tests/` (`collect-final.log`,
  `new-baseline.log`, `legacy-file-01.log` through `legacy-file-15.log`,
  `legacy-files-summary.txt`, `baseline-gap.txt`, `fixture-sanity.log`).

Unresolved:

- The concurrent implementation is not present here, so full new-suite green
  execution and production-mutant execution are not claimed.
- Q49's existing archived-path failure is outside this task's authorized old
  test edits. Firstmate/code author should route that separately.
- Representation gaps are centralized in the README: raw-object container,
  numbered JSON diff records, runner/HTML adapters, normalized named-Shopee
  identity metadata for Q138, and the literal packet digest that cannot be
  frozen before prompt bytes/JSON whitespace exist. Independent payload-map
  hashing and one-byte sensitivity are already tested.
- The brief's wrapper shorthand differs from reviewed Q137(d): valid objects
  with source-text wrappers are accepted, with every wrapper byte discarded.
  The tests follow that reviewed row. Malformed/unsafe object contents still
  require GRADES_INVALID and unchanged prior state.

Next action: code author integrates this local branch into the implementation
branch, reconciles only the documented representation adapters, runs the claim
tests (grouping/rebuild cases under PYTHONHASHSEED 0 and 1), and pins a literal
packet fixture digest when the actual templates/serialization are available.
Do not infer successful grading or report acceptance from collection alone.

Business decisions pending: none. OQ36–OQ39 are applied as reviewed; no new
policy, pooled counts, provider run or deployment is proposed.
