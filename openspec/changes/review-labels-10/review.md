# Handoff — independent review of review-labels-10

Updated: 2026-11-04
Worktree/branch: assigned detached review checkout for `wp/review-labels-10`; reviewed source `03afefc67b66ef239f541c4788bd7651566848f9` against `origin/main`.

Completed:
- Reviewed R-RV01–R-RV07, migration preservation, exact pinned text, scoring, error atomicity, legacy readers, existing test edits and PR implementation claims.
- Fixed R-RV07: orphan current-version labels outside the current source set must still require a matching codebook row. The new negative control failed before the fix and passes after it. Truly uncoded snapshots still build.
- Repaired reference self-comparisons by comparing actual loader results with the frozen reference. Added mixed-policy retry and public MCP refusal controls.

Changed paths:
- `tools/mcp-insight/insight_tools.py`, `tools/mcp-insight/CONTRACT.md`.
- `tools/mcp-insight/tests/test_app_labels_10.py`, `tools/mcp-insight/tests/test_coding.py`, `tools/mcp-insight/tests/part2/test_shared_evidence.py`.
- `tests/integration/raw-db-v1-review-labels-10.test.ts`, this handoff.

Evidence (review changes included unless stated):
- Node 24.14.0: `npm run typecheck` passes. The six requested Node files passed 76/76 before the review test extension; the affected integration file then passed 20/20.
- The two requested app-label Python files plus the two repaired test files passed 119/119 (31 requested app-label cases and 88 affected cases).
- Owner-pinned codebook and filter copies match byte for byte. An independent Python calculation, importing no labeller code, verified every frozen golden prompt, hash and label across all five cases; original review inputs are unchanged. The golden file is not regenerated during tests.
- Diff whitespace and added-line privacy checks pass. No network, real provider call, production database, deployment or backfill was used. No test processes remain.

Unresolved: no blocking defects remain. PR implementation claims match the final change; trial accuracy and cost figures were not remeasured in this offline review.
Next action: coordinator pushes the local review commit and runs CI before merge. Deployment and relabelling remain separate owner decisions.
Business decisions pending: `tools/mcp-insight/insight_tools.py` retains the R-I39/R-IM11 `quy cách` mapping to removed `T-QUYCACH`; the new codebook cannot supply that motive kind. Public checks confirm clean refusal (`MOTIVE_KIND_NOT_KEPT` for an unkept motive and `INVALID_ARGUMENT` for the removed theme), with a valid retained motive as the positive control. R-IM14 claim catalogues for new theme codes remain out of scope.
