# Handoff — IMCP-P3 independent tests

Updated: 2026-10-30.

Worktree/branch: disposable treehouse worktree
`/home/pkhang/.treehouse/tdn-growth-os-43e4a4/3/tdn-growth-os`, local branch
`wp/insight-mcp-p3-tests`, based on reviewed revision 15
`ee88004221a918575d6bd834b6eb016b3e64f5a4` of `wp/insight-mcp-p3`.

Completed: 268 offline parametrized P3 cases (76 test functions), covering all
47 contract rows IM-Q79–IM-Q125. Each test names its row and negative control.
The full five-round review was read. The tests retain the adopted scope,
short-review, fixed-wording, reason-chain, ledger-isolation and dedupe controls.
Fixtures reuse P1/P2 synthetic sources, real local SLAYER and fake transport;
they never read a key file or call a real provider. No production/app/spec/
contract file changed, and no remote operation, push, merge or PR occurred.

Changed paths:

- `tools/mcp-insight/tests/part3/`: fixtures, support and five test modules.
- `tools/mcp-insight/tests/README.md`: coverage, adapters and contract gaps.
- `tools/mcp-insight/tests/test_boundaries.py`: Q1's exact registry helper.
- `tools/mcp-insight/tests/part2/test_boundaries_p2.py`: Q52's exact registry helper.
- This handoff.

The two old-part edits are the explicitly amended Q79 inventory: exactly
twelve named tools, with the new tools' exact argument names/types. All old
schema checks and negative controls remain unchanged. This exception was also
confirmed by firstmate inbox `001.msg`, read completely and acknowledged by
moving it into `handled/`. No other old test, fixture or assertion changed.

Evidence (all output and scratch outside Git):

- Python: the reusable read-only environment
  `/home/pkhang/firstmate/data/insight-mcp-p2-tests/venv/bin/python` (3.14.3).
  No installation or network access was needed.
- Before amending the two old inventories, ran only the existing Python tests
  under `tools/mcp-insight/tests`, excluding `part3`: **405 passed in 107.80s**.
  Log: `/home/pkhang/firstmate/data/insight-mcp-p3-tests/p1p2-raised.log`.
- The initial full baseline exhausted the shell's 1,024-descriptor limit.
  Rerunning with local, per-process `ulimit -n 65536` succeeded; no shared
  service, system setting or production code was changed.
- After Q79's exact-inventory amendments, ran the two affected old tests:
  both fail at the missing three P3 tools on this base, as expected. Log:
  `/home/pkhang/firstmate/data/insight-mcp-p3-tests/registry-amended.log`.
- `python -m pytest tools/mcp-insight/tests --collect-only -q -p no:cacheprovider`:
  **673 tests collected**, including **268 P3 cases** across **47 rows**.
  Log: `/home/pkhang/firstmate/data/insight-mcp-p3-tests/collect-final.log`.
- All P3 fixture setup/teardown paths ran with `--setup-only` and exited zero
  in 50.01s. This checks fixture mechanics, not P3 business behavior. Log:
  `/home/pkhang/firstmate/data/insight-mcp-p3-tests/p3-setup.log`.
  Later additions reuse these same fixtures and add no new fixture mechanics.
- Focused baseline executions confirm the expected missing registry and
  `submit_section`/`render_report` interfaces. The Q121 fixture independently
  reaches collected/coded 40/38 and 60/55 before the missing tool failure.
  The Q125 fixture reaches its original theme-row precondition with clean
  teardown; no false confidentiality teardown failure masks the absent tool.
  Logs: `p3-baseline.log`, `p3-scope.log`, `p3-collision.log` under the same
  outside-Git proof directory.
- Python AST checks: every new test function has an IM-Q79–IM-Q125 ID and a
  negative-control docstring; all 47 rows are represented. `git diff --check`
  is clean.

Unresolved: P3 behavioral acceptance and mutant execution cannot be certified
against this base: its implementation has not landed here. Tests are neither
skipped nor xfailed. `tests/README.md` lists narrow representation assumptions
for the canonical part hash, archive containers, receipt files and appendix
targets. It also records the Q84/Q89 generic `phần` reference convention versus
the explicit `Thị phần 35%` Market rejection. That test asserts Q89's named
`MARKET_NUMBER` and does not guess an extra numeric rejection code.

Next action: the code author merges this **local** branch into
`wp/insight-mcp-p3`, reconciles only documented representation adapters, and
runs the Python suite with the implementation. Firstmate owns final review
and shipping. No `/no-mistakes`, repo-wide sweep or deployment was run.

Business decisions pending: none requested by this test task. The named
contract ambiguities remain visible for integration; rules were not edited.
