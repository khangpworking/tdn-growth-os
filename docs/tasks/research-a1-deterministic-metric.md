# Research A1 — deterministic normalized Metric calculation

Owner authorized coordinated implementation on 2026-09-27. Business methodology is owned by **Review marketing framework files**; this worktree owns code. Separate from Content Studio 049. Base: `cfb234a7de8707256a86169b80af6497998966ab`.

## Purpose and boundary

Code owns numbers, ratios and quantitative statements. AI must not fill missing numbers or infer causes from sales. Official conclusions still require human approval. A1 is the bounded offline quantitative foundation for M02/M03/M04/M13, not a complete Market/Insight Report, all 30 sections, raw workbook verification or a production rollout.

```sh
npm run research:metric:calculate -- /private/normalized-input.json /private/new-report-bundle
```

The parent must already exist outside every Git checkout. Creates `result.json` and `report.md` (0600 on Fedora) in a new directory (0700). Exact retry verifies existing bytes and returns `reused:true` without writing. Changed input, altered output, incomplete bundles or symlinks fail closed. A crash during creation may leave an incomplete bundle; it is never accepted or repaired automatically. Only this invocation's created files are cleanup targets.

Result identity includes normalized input digest, `metric-scope-v1`, `metric-draft-vi-v1`, `percent-half-even-2-v1`, full profile, period, source descriptors and codebook. This is file export/replay, not an authoritative SQLite report-run ledger or global result cache. New-directory recalculation is deterministic; existing-bundle verification never invokes AI.

## Methods

- One platform, ON/OFF/UNSPECIFIED selection, period and profile. Every row declares matching measurement context and VND currency. No cross-period aggregation or ON/OFF concatenation.
- Source digests/locators and adjudication are declarations, not proof A1 opened original files or authenticated a human. A2 will verify workbook cells and mapping. JSON retains declared provenance, numeric displayed values and observation precision.
- Platform-scoped listing/shop IDs; duplicate listing identities reject the input. No IDs invented from names.
- Integer strings/BigInt; malformed, negative or fractional amounts reject input, not converted to missing. Missing is null, observed zero is `"0"`. Missing rows permit explicitly incomplete observed subtotals. Non-exact source precision remains flagged. Complete coverage does not mean exact or independently verified values.
- `all`: all valid rows. `wide`: fresh non-OUTSIDE labels with required explicit `wideUnknownPolicy: include|exclude`. `core`: fresh CORE_CANDIDATE. No silent default or implied owner approval for the open real-report UNKNOWN policy.
- Labels bind platform/shop/listing/title/category fingerprint and exact codebook version. Missing/stale/mismatched labels block full wide/core outputs, not otherwise valid all-scope metrics. Adding classifier fields requires a method/fingerprint revision.
- Taxonomy and shop totals preserve coverage. Top 1/3/10 shares retain exact fractions and half-even two-decimal display. Missing revenue blocks complete concentration; zero/absent denominator produces null. Shop ties use canonical code-unit ordering.
- Scope sensitivity includes removed membership, revenue and units deltas with independent completeness, common-shop ranks and top-k retention. Top-shop removal recalculates remaining shops/concentration, including empty and one-shop cases.
- Vietnamese sentences bind to replay-verified JSON metric pointers. Source text is inert escaped Markdown. No causal, clinical, market-size, motivation, strategy, approval or population claim is generated.

## Business acceptance

Independent five-listing synthetic fixture: all revenue/units 185/23, wide 175/22, core 150/15. All top-1 = 150/185 = 81.08%; wide = 150/175 = 85.71%; core group shares 66.67/33.33%. Removing S1 leaves 35 revenue and S2 concentration 25/35 = 71.43%. Revenue deltas -10/-35; units deltas -1/-8. Include-UNKNOWN is explicitly selected only in this fixture.

Read-only methodology review accepted scope membership, freshness, rounding, guards, grouping and removal. Its unitsDelta finding was addressed with independent units completeness and narrative/tests. This is not approval of real data or official conclusions.

## Later slices — not implemented here

- A2: exact workbook/profile adapter and source-cell verification; source transfer to Fedora must be explicit.
- A3: workspace-bound verified Results and report versions; separate Insight case/claim evidence. Never reuse Content Studio attempt rows as a research job ledger.
- Insight records must distinguish FACT, INFERENCE and HYPOTHESIS. Require linked evidence, compatible scope/time, limits, alternatives/counterevidence and falsifiers as appropriate. Structural checks do not prove entailment; no prevalence from convenience reviews, motivation from sales or causal claims from cases.
- AI generation, evaluations, owner approval workflow, UI, workers and JEV are separate slices. No DB migration, dependency, Redis, provider call, private-data import, public upload or deployment in A1.

## Tests

One independent calculator fixture plus table-driven edge cases; one actual CLI test owns publication/replay/conflict/privacy behavior. No speculative load/race/browser suite. Applicable full checks and Fedora validation are required before release; Windows development checks are reported separately.
