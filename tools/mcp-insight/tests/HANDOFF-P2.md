# Handoff — IMCP-P2 independent offline tests

Updated: 2026-10-30

Worktree/branch: isolated treehouse slot 3, local `wp/insight-mcp-p2-tests`,
branched at reviewed contract revision 10, `59d0fb99`.

Completed: 195 new pytest cases covering all 27 rows IM-Q52–IM-Q78, with
synthetic source packets, temporary SQLite stores, copied rule data and fake
Jev transport. The R14 changed-text/rebuild/successful-recode lifecycle and
R15 unchanged-text lifecycle have independent fixtures and contributor sets.
R12 uses a real interrupted block change; the baseline R1–R13 count is kept
separate. Part 1 tests, support and reference JSON are byte-identical to base.

Changed paths: only `tools/mcp-insight/tests/`: new `part2/` fixture/support
and five test modules, an appended README section, and this handoff.

Evidence (commands, results, relevant revision):

- `python -m pytest tools/mcp-insight/tests --collect-only -q -p no:cacheprovider`:
  **405 collected** (210 existing + 195 new), no collection errors.
- `python -m pytest tools/mcp-insight/tests --ignore=tools/mcp-insight/tests/part2 -q -p no:cacheprovider`:
  **210 passed in 27.03s**. No existing test was edited or deselected within
  part 1. Only the new directory was excluded.
- Q73's codebook/reference/old-rule/old-version control: **1 passed**.
- A baseline run of the new directory on the part 1 implementation produced
  **155 failed, 39 setup errors, 1 passed**. Inspection found the expected
  absent new tools, store writers and frame, plus the five-versus-nine tool
  surface mismatch. There were no network/read-only audit violations or
  dependency failures. This is baseline evidence, not part 2 runtime acceptance.
- An AST row inventory confirms every new test is named with its IM-Q row and
  carries an NC docstring; rows are exactly 52 through 78. A Git-byte comparison
  confirms all pre-existing test/support/fixture files are unchanged, apart
  from the authorized README append.
- All pytest output, synthetic runtime data and environment setup evidence
  are outside Git under `/home/pkhang/firstmate/data/insight-mcp-p2-tests/`.

The behavioral interpreter is
`/home/pkhang/firstmate/data/insight-mcp-p2-tests/venv/bin/python` (Python 3.14,
pytest 9.2.0, MCP 1.30.0, motley-slayer 1.4.1). It was installed solely from
cached wheels using `--no-index --no-cache-dir`. The historical
`.evr2-review/venv/bin/python` also collected successfully but had no SLAYER
or YAML; it was not modified. Every pytest run set
`PYTHONDONTWRITEBYTECODE=1` and disabled the cache provider. Behavior runs used
`--basetemp` inside the external task directory.

Unresolved: the concurrent part 2 implementation has not landed in this
checkout, so its successful behavior and mutants cannot yet be executed.
README's `contract gaps (part 2)` heading records narrow interface assumptions.
It also records that the preserved Q1 test asserts five tools; integrating the
new nine-tool implementation requires the authorized IM-Q52 amendment to that
old assertion. No implementation or contract was changed to resolve it here.

Next action: firstmate/code author integrates the local branch, reconciles the
documented representation assumptions, then runs this Python directory against
the implementation and obtains the independent review. No push, merge, new
worktree, provider call, real key/store access, repository-wide sweep,
deployment or `/no-mistakes` run was performed.

Business decisions pending: none.
