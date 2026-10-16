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


## WIKI-2 review corrections (checked base)

Review base: `2b44e4bcf75ac3bfd2a5d3a0de679a0fcb1a48ad`.
These are derivative-wiki corrections, not changes to business rules.

- Every generated page must state this checked main SHA. Historical reviewed
  heads and merge SHAs may be cited as history, never substituted for this base.
  The section matrix and source registry incorrectly used `0116091...` and
  open PR #110. Recheck current `docs/STATUS.md` and the opening implementation
  update in the sync plan. Do not use its explicitly historical audit as current.
- Use only merged on main / open PR / planned for delivery standing, with the
  checked base. Partial bounded merged features and planned remainder must be
  separate. Do not label an old merged PR as open. Full completion is unproven.
- U-, P-, B- and SYNC identifiers are work items, not business-rule identifiers.
  In the Market-lanes page, U-32 must not appear as a rule. When describing the
  legacy cross-platform code divergence, use "code differs from rule 3" and
  "code differs from rule L5", linked to Ultimate; distinguish legacy from
  current per-platform behavior in `src/modules/analysis/reader-report/build.ts`.
- Cite a repository code path beside every code-behavior claim or matrix row;
  symbol names alone are insufficient. In particular repair the Market-lanes
  narrative and the section-matrix builder rows using actual owning files.
- Business rules appear ONLY as IDs plus links. Remove rule paraphrases,
  prohibitions, thresholds and required labels from glossary definitions,
  registry guidance, authority summaries and other generated prose. A glossary
  may translate a term, but must not explain its business-rule conditions.
  Describe actual versioned code behavior with its path separately.
- Preserve source IDs, tiers and collector standing, but do not duplicate
  canonical source-use policies or the historical implementation audit table.
- Keep pages concise: prefer short linked tables and bounded evidence summaries;
  omit speculative safe-extension procedures and function-level walkthroughs.
- No scheduled workflow is authorized or retained. The OpenWiki managed block
  must preserve AGENTS startup priorities and Ultimate business authority;
  CodeGraph handles symbols/callers. Wiki retrieval is optional context.
- Runtime page: remove literal IP addresses (including loopback addresses) and
  machine paths from prose and metadata; say loopback instead. Repository
  presence proves merged behavior, never deployment. Replace "deployed behavior"
  with repository implementation, with no operational acceptance claim.
- Verification page: its historical `d9bd883` base and claim that Git metadata
  was unavailable are inaccurate for this run. Use the checked base above,
  cite real service/contract paths, and state checks were not executed by the
  generator. Omit broad test-authoring recipes; link project working rules.
- Research lifecycle: PR #177 merge SHA is historical evidence, not the checked
  main SHA. Use the review base. Cite service source paths beside lifecycle
  claims, and distinguish the source-backed report ledger from the automation
  run/report-pair and separate reader-revision workflows.
- Operator-workspaces page: add the checked base and explicit delivery standing,
  remove IP literals, and cite the actual owning service/API file for each
  behavioral summary. Do not infer authority from UI or a generation result.
- Package map: PR #172 merge is history, not the checked main reference. Keep
  merged package scope and unresolved remainder, but remove stale exclusive
  writer assignments as current instructions. Cite full repository source
  paths for code claims; `service.ts` or `reports.ts` alone is insufficient.
  Prefer links to existing ownership records over duplicating long tables.


## WIKI-2 correction round 2: remaining observed failures

This is a targeted repair of the first regeneration, not new business scope.
The required literal page header is:
**Checked main SHA:** `2b44e4bcf75ac3bfd2a5d3a0de679a0fcb1a48ad`.
Use this exact value, including on glossary and registry. Neither the PR #161
merge nor the PR #177 merge is the checked base. A historical merge may appear
only as explicitly historical evidence elsewhere; never in a checked header.

- `concepts/vietnamese-business-glossary.md` still uses a PR #177 merge as its
  checked SHA. Replace that header. Convert every Ultimate ID reference into
  a Markdown link, or omit it. Preserve the short translations; no rule prose.
- `integrations/data-source-registry.md` still uses a PR #161 merge as its
  checked SHA. Replace that header. The existing E1–E14 fragment is nonexistent:
  use `#22-ngoại-lệ-đã-được-chủ-duyệt`. Link every E/L ID in its allocation table,
  or remove the optional rule column and link the canonical allocation instead.
- `operations/decisions-and-authority.md`: remove the paraphrased Ultimate §1
  authority-order paragraph. Link §1 without repeating its order or conditions.
  Work IDs and business-rule IDs remain different. Link E14 when referenced.
- `concepts/thirty-report-sections.md`: M08 must distinguish authenticated
  reader-only spec intake owned by
  `src/modules/analysis/research-automation/reader-report-revisions.ts` from
  planned native extraction and auto-report integration. `reports.ts` does not
  own the reader intake. Keep the other checked rows unless evidence changes.
- `workflows/ultimate-alignment-packages.md`: its three implementation-boundary
  paragraphs lost their code paths. Cite
  `src/modules/analysis/keyword-meaning-filter.ts`,
  `src/modules/analysis/located-insight-methods.ts`, and
  `src/modules/analysis/reader-report/build.ts` beside those respective claims.
- `quickstart.md`: add rendered source-path links beside the implementation,
  report-identity, operator composition, migration and package-script claims;
  frontmatter resources alone are not sufficient for a reader of those claims.

Repair these six pages only. Preserve already-correct content in other pages.
Keep generated claim sidecars consistent with the repaired text.


## WIKI-2 correction round 3 (final bounded content repair)

Evidence after round 2: architecture, lifecycle, and verification have the
correct base but omit the required delivery-standing vocabulary; the authority
page links E14 to a nonexistent per-rule anchor. No other content repair is
requested. Plan only these four pages, preserve their behavior descriptions,
source citations and claim sidecars, and do not rewrite unrelated pages.

- `architecture/modular-monolith.md`: directly after the checked SHA, add a
  delivery statement that the described module/API/persistence code is
  **merged on main** at that checked SHA. Baseline-only capabilities remain
  **planned**; this does not establish deployment or operational acceptance.
- `workflows/research-report-lifecycle.md`: replace the bare delivery word
  "implemented" in the checked-SHA paragraph with **merged on main**. Retain
  the explicit lack of deployment, acceptance, and source-backed approval.
- `testing/verification-and-replay.md`: add that the described services,
  contracts, scripts and test files are **merged on main** at the checked SHA.
  Keep INSPECTED and NOT EXECUTED as evidence/check states, not delivery states;
  do not claim checks passed or execute tests.
- `operations/decisions-and-authority.md`: E14 is a bold list item, not a
  Markdown heading. Its valid source link is
  `../../docs/research/ultimate-method/ultimate-method-30-sections.md#22-ngoại-lệ-đã-được-chủ-duyệt`.
  Replace the nonexistent per-rule fragment with this section fragment and
  remove any associated validator comment. Do not restate E14 text.

The checked base remains exactly
`2b44e4bcf75ac3bfd2a5d3a0de679a0fcb1a48ad` throughout.
