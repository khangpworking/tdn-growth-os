# 0015. Owner-confirmed scope, real product cards, annual periods and separate reports

- **Status:** Accepted (owner decisions in the TDN operation conversation, 2026-10-02); implementation pending
- **Date:** 2026-10-02 (Asia/Bangkok)
- **Relationship:** Supplements 0005, 0007 and 0009. Partially supersedes 0008's mandatory monetary ceiling and its statement that live use has no owner authorization, and 0012's mandatory cost-cap display. All other constraints remain in force.

## Context

The owner reviewed the automated-research proposal with the TDN operation session. The marketing-method session was consulted about scope, evidence compatibility and source limits. The owner wants annual research periods and a simple interface that does not require understanding Metric or Kalodata.

On 2026-10-02 the owner explicitly retained scope approval, requested real product suggestions from Kalodata or Shopee with images and descriptions, and approved prioritizing sufficient data without a monetary ceiling for owner-started research runs.

## Decision

### 1. Scope approval and run initiation

- Keep one scope-confirmation checkpoint after the quick search and before full collection. The existing definition screen and final confirmation together form this checkpoint; do not introduce another approval screen.
- Show the proposed meaning of the product/category, included and excluded groups, requested dates, and report selection in ordinary language. Preserve the separate explicit peer confirmation for M07.
- Reuse of an approved configuration on a later owner-started run may avoid repeating semantic approval only while its definition remains unchanged. Freeze that run's exact dates and configuration. Scope changes require a new confirmation.
- This decision does not start a research run, add a recurring schedule, or approve downstream B7–B10 business actions.

### 2. Real product suggestions with images and descriptions

- Use real Kalodata or Shopee product/listing records to populate the selection cards. Keep the existing maximum of four principal cards, an eligible exploration card and the none-match action from 0005.
- Each card should show the source product name, source image when available, a short description, platform/source attribution and a link to the original listing. Optional price and shop information must retain their observed date and variant context.
- Preserve the exact provider/listing identity and source record behind the card. A selection means closeness to the owner's intended product; it does not establish a competitor, approve a claim, or prove annual sales coverage.
- A shortened source description must remain attributable. Label an AI-written summary as a summary and retain its source references. Do not generate missing product photos or invent missing descriptions; use an explicit unavailable state.
- Group verified duplicate offers of the same product where possible, with one representative listing. Preserve the underlying listings and platform identities; ambiguous matches remain separate.
- Adapter support must be verified before promising field availability. Kalodata's product-detail documentation exposes structured `product_description` and notes that it can be an empty array; its product-ranking documentation exposes `master_image_url`. Shopee detail/image acquisition still needs a verified connector; the review-scraper contract alone does not establish product-description support.
- Documentation checked: https://www.kalodata.com/open-center/docs . These are documented fields, not a claim that the new feature has collected or rendered them.

### 3. Standing spend policy

- For owner-started research actions within the approved research scope, prioritize sufficient evidence and apply no owner-imposed monetary ceiling. Do not invent a fixed USD cap or require confirmation for each normal provider call.
- Apply the policy to the existing research collection and analysis workflow using its configured sources and models. It does not authorize unrelated operations or purchasing new subscriptions.
- Keep provider operation permissions, intended input-data boundaries, provider/account quotas, rate limits, concurrency limits, finite retry rules and cancellation. Unlimited monetary budget is not an instruction to loop indefinitely or manufacture complete coverage.
- Retain per-run and per-attempt usage, provider receipts and actual charges. Where only credits or estimated costs are available, distinguish those from finalized monetary charges.
- Show "Ưu tiên đủ dữ liệu · Không đặt trần chi phí" with actual usage as it becomes available. A forecast is not a guaranteed total.
- Research starts through an explicit owner action. Page loads and typing do not trigger paid calls. Ambiguous paid starts are reconciled before any replacement start.
- Existing methodological completion rules, unavailable-source states and partial-report behavior still determine when collection stops.

### 4. Vietnam and date selection

- V1 supports Vietnam only. Show the market as fixed information.
- Use the familiar preset dropdown plus visible editable start/end dates. Presets: 30, 90, 180 and 365 days (default), 24 months, calendar year, and custom dates. Custom dates support an exact 360-day interval.
- A preset resolves to explicit dates; editing either date selects Custom. Show the inclusive interval length. Do not equate 360 days, 365 days, calendar months and a calendar year.
- Display the verified data cutoff when it determines the default end date. Freeze explicit dates on a run so its historical report does not drift as time passes.
- Source query-window limits are handled by adapters. Choosing a long interval does not assert complete coverage, nor authorize summing overlapping or truncated monthly rankings as a full-market total.
- Preserve requested period and observed coverage separately, per source and operation. Unsupported history or insufficient evidence produces an explained limitation; do not silently shorten the owner's research period.

### 5. Independent Market and Insight outputs

- Provide separate Market Report and Insight Report web views and two independent PDF exports.
- Preserve the existing choice to request Market, Insight or both.
- Each PDF renders the corresponding saved report version also used by its web view. Export must not call AI to regenerate content.
- Both reports may share a frozen evidence package and run lineage. Each retains its own content and section coverage; rendering/export is not a new research run.

## Consequences

- Prototype v5 has not yet been updated to implement this decision. Its simulated caps, fixed cards and combined run screen are not evidence of these capabilities.
- The data/backend design must represent the spend policy explicitly and retain the authorization and usage records. Historical capped runs remain unchanged.
- Product-detail/image connector validation and reliable long-period acquisition remain engineering work. Missing source fields are visible states, not a reason to synthesize evidence.
- This record captures accepted product decisions. It does not claim that the full prototype, backend design, release or live run has been accepted or executed.
