# Handoff — YC1 independent claim-layer tests

Updated: 2026-11-01.

Worktree/branch: isolated Treehouse slot 3,
`wp/insight-claim-layer-tests`, initially based on reviewed `6cdecfd3`.
For firstmate's follow-up message 001, fast-forwarded to the author's
`28dd9546` for integration verification. That message authorizes pushing the
corrected branch to origin; PR creation and merging remain outside this task.

Initial delivery `8c78e66e`: 243 offline pytest cases across all 40 rows IM-Q126–IM-Q165,
independently authored from CONTRACT revision 22 and the full six-round review.
Synthetic source packets, temporary SQLite warehouses/codebooks, in-memory key
replacement, fake Jev answers and fake grader files only. No production edits,
real reviews, real key reads, external transport, model CLI, paid calls, app
runtime access or full-repository sweep. The initial delivery was local only.

Follow-up: independently verified all three author findings against IM-Q128,
IM-Q140, IM-Q110 and the affected claim rows, then corrected only claim tests:

- Added a claim-only privacy adapter. Private review/product IDs and writer
  keys are checked as literal substrings; review words and writer names still
  use the unchanged normalized scanner. Required per-platform count maps no
  longer collide with word-folded IDs. Three injected raw-ID controls still
  reject public leaks.
- Restricted the store-open audit to events inside the tool call, excluding
  the harness's own snapshots. A new injected tool-side store read still
  fails the audit.
- Moved the Q158/Q159/Q162 section fixtures to data part 13, keeping every
  existing acceptance, number, flag, quote and rendering assertion. A new
  Q161 control retains rejection of an unmarked review-derived claim in part
  8 and accepts the marked sentence there or the post-use sentence in part 13.

The follow-up adds five cases, for **248 claim cases across the same 40 rows**.
It edits no legacy helper or test, production source, contract or spec. The
author-approved Q49 archived-path correction is inherited from `28dd9546`.

Changed paths:

- `tests/part4/`: seven test modules plus two fixture/support files.
- `tests/README.md`: coverage, controls and **contract gaps (claim layer)**.
- Exactly three existing helpers receive the Q126/Q161-approved eighteen-tool
  inventory extension: `test_boundaries.py::schemas`,
  `part2/test_boundaries_p2.py::assert_surface`, and
  `part3/test_boundaries_p3.py::assert_surface`. All prior argument/nested-type
  checks and mutants remain. No other part 1–3 Python content changed.

Initial authoring evidence (Python 3.14, existing offline venv at
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

Follow-up verification against author implementation `28dd9546`:

- **PYTHONHASHSEED=0: 248 passed.**
- **PYTHONHASHSEED=1: 248 passed.**
- Full `tools/mcp-insight/tests --collect-only`: **922 collected**, no errors.
- `git diff --check` is clean; the follow-up diff contains only test paths.

Each of the seven part-4 files ran in a fresh process for each seed, using
`env PYTHONDONTWRITEBYTECODE=1 PYTHONHASHSEED=<seed> <venv>/bin/python -m pytest
tools/mcp-insight/tests/part4/<file> -q -p no:cacheprovider --tb=short
--basetemp <proof>/followup-seed-<seed>-<number>-tmp`, with a child-only 8192
descriptor limit. The outside-Git driver is `validate_followup.py`; results
are in `followup-summary.txt`, `followup-seed-0-01.log` through
`followup-seed-1-07.log`, and `followup-collect-all.log` in the assigned proof
directory.

All test databases, fake responses and grader files remain synthetic and
outside Git under the assigned proof directory. No model runner is executed.

Remaining limits:

- Production-mutant execution is not claimed. The new harness controls inject
  unsafe public output and a store read at real tool boundaries.
- The earlier 673/674 result is historical baseline evidence; this follow-up
  does not rerun the old behavior suite against the implementation.
- Representation gaps are centralized in the README: raw-object container,
  numbered JSON diff records, runner/HTML adapters, normalized named-Shopee
  identity metadata for Q138, and the literal packet digest that cannot be
  frozen before prompt bytes/JSON whitespace exist. Independent payload-map
  hashing and one-byte sensitivity are already tested.
- The brief's wrapper shorthand differs from reviewed Q137(d): valid objects
  with source-text wrappers are accepted, with every wrapper byte discarded.
  The tests follow that reviewed row. Malformed/unsafe object contents still
  require GRADES_INVALID and unchanged prior state.

Next action: code author integrates the pushed test follow-up into the
implementation branch and pins a literal packet fixture digest using the now
available templates/serialization. Behavioral test success uses only fake Jev
and fake graders; it does not attest real grading or customer-report acceptance.

Business decisions pending: none. OQ36–OQ39 are applied as reviewed; no new
policy, pooled counts, provider run or deployment is proposed.
