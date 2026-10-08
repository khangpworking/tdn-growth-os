# OpenWiki brief for tdn-growth-os

Owner brief (Vietnamese owner, English wiki is fine; owner-facing summaries in Vietnamese). OpenWiki reads this file and does not rewrite it.

## Purpose

The wiki gives coding agents the context that is not in a single function: how the system fits together, the research flow, the 30 report sections, the data sources and the decisions the owner already made. For finding code and its callers, agents use CodeGraph (`codegraph explore`), not this wiki.

## Write about

1. Architecture: the five modules, boundaries, who owns writes (`ARCHITECTURE.md`, `AGENTS.md`).
2. The research flow: scope, collection, preparation, coding, report build, report versions, review. Say which step is manual and which is automatic today.
3. The 30 report sections (M01–M13 Market, I01–I17 Insight): for each, what builds it, which file owns it, and its current state against the business rules.
4. Two Market report lanes: the reader report (`src/modules/analysis/reader-report/`) and the governed auto draft (`src/modules/analysis/research-automation/`). They follow different rules; describe them separately.
5. Data sources: one page that mirrors `docs/research/ultimate-method/input-data-sources-30-sections.md` (source IDs S01…, tier, status, which package builds the collector).
6. Work packages and the sync plan: `docs/tasks/research-batch-2-packages.md` and `docs/tasks/ultimate-v1.11-tdn-sync-plan.md` (what is merged, what is open).
7. Decisions: what the owner decided and where it is recorded (CHANGELOG business rows, INTENT.md, ADRs).
8. Glossary of Vietnamese business terms used in code and docs.

## Do not write

- Per-function or per-file descriptions that CodeGraph already gives. Point to `codegraph explore` instead.
- Business rules in your own words. The source of truth is `docs/research/ultimate-method/ultimate-method-30-sections.md`. A page about a rule states the rule ID (E1…E14, L1…L10, G1…G8, rules 1–9), links to it, and says only where the code stands. If the code and the Ultimate file disagree, say "code differs from rule <ID>"; never present the code's behavior as the rule.
- The recipes in `docs/research/section-methods-v1/`: no code reads them. Say they are superseded by the Ultimate file where they differ.
- Anything from `references/history/` as current.

## Rules for every page

- Cite the file path (and symbol) for each claim about code. No claim without a source.
- Mark each statement about status as: merged on main, open PR, or planned. Include the main SHA the page was checked against.
- No secrets, tokens, machine paths, IPs or real commercial data. Fixtures are synthetic; say so.
- Missing data stays missing; do not guess a value or a status.
- Data source provider names (Metric, Kalodata, SerpApi, Apify…) may appear in the wiki, because the wiki is internal. Reader-facing report text must not name them; note that rule where relevant.
- Keep each page short enough to read in one sitting. Prefer tables for status.
