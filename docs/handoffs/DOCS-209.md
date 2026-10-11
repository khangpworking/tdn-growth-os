# Handoff — DOCS-209 record owner decisions of 2026-10-11 (#209)

Updated: 2026-10-11
Worktree/branch: `wp/docs-209-owner-decisions` from `origin/main` `a5b9344`
Completed:
- Recorded the owner decisions from [#209](https://github.com/khangpworking/tdn-growth-os/issues/209) in the docs. Order: U-32 → U-26 → U-11 phase 1 → U-40.
- Ultimate Method bumped to v1.13:
  - rule 3 and L5: Shopee and TikTok Shop are never added together;
  - E14: new "Phạm vi và hủy" part (cancel-only, cancel deletes partial data but keeps one spend-log line, scope change = new revision, completed report never overwritten);
  - new E15: comment topics ranked by mention count, one table per platform, strict ranking, "Khác" under 3 mentions, at most 1 top-up round when "Khác" is above 20%;
  - E11 second model and κ (G2, G7, G8 rows) marked deferred, text kept for history;
  - L4, I10, G8 and section 9 updated to match.
- CHANGELOG rows BR-20261011-01…03. README bumped to v1.13.
- Sync plan:
  - banner updated;
  - U-32 checked (closed by owner, PR #162);
  - U-26 rewritten as decided, implementation pending;
  - U-11 split into U-11a (coding, ranking, "Khác", `needsTopUp` signal) and U-11b (top-up wiring after U-26 merges), with the κ cross-check kept as a deferred block;
  - U-40 runs last, as one bình giữ nhiệt pilot only, and needs the owner's budget cap;
  - #209 order and open owner items added.
- No unmerged code item is checked.

Changed paths:
- `docs/tasks/ultimate-v1.11-tdn-sync-plan.md`
- `docs/research/ultimate-method/ultimate-method-30-sections.md`
- `docs/research/ultimate-method/CHANGELOG.md`
- `docs/research/ultimate-method/README.md`
- `docs/handoffs/DOCS-209.md`

Evidence (commands, results, relevant revision):
- I grepped the code read-only for cross-platform totals across `src/modules/analysis/reader-report/` (`build.ts`, `market-template.ts`, `web-facts.ts`, `lint.ts`), `reader-report-revisions.ts`, the Metric scope calculator, the combined market review export script and the Insight code.
  - New reader builds use contract 1.3.0 or 1.4.0. Those builds take the per-platform path and call `reconcileWebWithRows` with `perPlatformOnly: true`.
  - No sums were found in Insight code or the export script.
- Docs only, so no test run was needed.

Unresolved:
- **Blockers — U-32 code follow-up (not fixed here, docs-only lane):** the legacy reader path for contracts 1.0.0/1.1.0 still computes cross-platform sums:
  - `reader-report/build.ts`, legacy branch after the current-contract early return: the `both.*` revenue, units, n and share fields, and the `src.cover.rev` total across all rows;
  - `market-template.ts`: legacy-only text allowing a two-platform total when labelled, plus `{{both.non.share}}` and `{{brand.bothCount}}`;
  - `web-facts.ts` `reconcileWebWithRows`: the legacy call sums rows across platforms (it is not called with `perPlatformOnly`).

  This path is likely kept so stored legacy versions replay byte-identical (G-10). A code PR should decide whether to keep it as replay-only, which would need a guard so no new build can select 1.0.0/1.1.0, or to retire it. The owner decision says no new output may add the two platforms.
- AGENTS/CHANGELOG convention says business-rule commits start with `business-rule:`. This commit uses `docs(#209): ` as the coordinator asked.

Next action:
1. The coordinator reviews and opens the PR.
2. Code PR for U-26.
3. Code PR for U-11a, then U-11b after U-26 merges.
4. Decide the U-32 legacy replay follow-up.
5. U-40 (bình giữ nhiệt pilot only) after the owner sets the budget cap; further cases need a new owner decision.

Business decisions pending:
- Release label for phase-1 topic counts. Without the second-model check, the label "phân loại do AI, đã kiểm chéo" cannot be used. Recorded in E15 as "còn chờ chủ".
- The U-11 second-model check (κ) remains deferred.
- Total budget cap for the U-40 batch. Nothing runs without it.
