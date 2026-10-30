# Handoff — IMCP-P1 independent offline tests

Updated: 2026-10-30

Worktree/branch: disposable treehouse worktree 3; `wp/insight-mcp-p1-tests`,
created from `wp/insight-mcp-p1`. Local delivery only.

Completed: tests for IM-Q1–IM-Q51, including F310 excluded logistics, IMCP-O1
mixed writers, F311 packaging appearance, and F312 codebook version 2026-10-30.3.
Every test function names its row and its discriminating negative control.
Sources/transports/keys are synthetic; the real implementation imports only at
test setup. The shared confidentiality guard checks all exercised public results
and logs, including failure paths. The contract/spec/implementation are untouched.

Changed paths: only `tools/mcp-insight/tests/` — pytest fixtures/support, five
test modules, the F312 codebook oracle, README and this handoff.

Evidence (commands, results, relevant revision):

- `PYTHONDONTWRITEBYTECODE=1 .evr2-review/venv/bin/python -m pytest tools/mcp-insight/tests --collect-only -q -p no:cacheprovider`:
  **198 collected**, exit 0.
- `PYTHONDONTWRITEBYTECODE=1 .evr2-review/venv/bin/python -m pytest tools/mcp-insight/tests/test_portraits_and_spec.py::test_im_q49_ri39_kept_motives_and_exact_owner_f310_sentence -q -p no:cacheprovider`:
  **1 passed**, including its four invalid in-memory spec variants.
- AST inventory: all 51 distinct contract rows represented; every test function
  has its negative-control docstring. Collection checks Python syntax/imports.
- Standalone synthetic harness probe: source fixtures, fd-relative temporary
  storage cleanup, a real read-only SQLite INSERT refusal, and complete fake
  probability maps passed. This does not execute the subject or certify SLAYER.
- Proof files are outside Git at
  `/home/pkhang/firstmate/data/insight-mcp-p1-tests/`.
- Baseline is reviewed contract revision 6 plus handled F312 message 001. No
  network, real provider/key/database, npm sweep, push, merge or deployment.

Unresolved: implementation-dependent behavior and actual SLAYER equality have
not run because `insight_tools.py`, its data and semantic models have not landed
in this checkout. The README's **Contract gaps** lists every chosen internal
name/storage/envelope assumption; these are integration points to reconcile,
not new product requirements. No skipped contract assertion is used to mask the
missing implementation.

Next action: Firstmate/code author can merge this local branch into the author
branch, reconcile the documented interface assumptions with production
conventions, install/use its pinned Python dependencies and run the new Python
suite offline. Keep assertions/independent expected results intact.

Business decisions pending: owner question 15 about overlap metadata remains
with its existing owner. Tests do not interpret that list or assert its disputed
wording. O1 is settled and fully asserted; F312 is applied.
