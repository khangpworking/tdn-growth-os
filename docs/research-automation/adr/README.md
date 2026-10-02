# Architecture decision records: Nghiên cứu tự động

Each record has four parts: Context, Decision, Consequences, Status. "Accepted" means the owner agreed in chat. For 0006–0008 and 0011 it also means that GPT-5.6 Astra agreed in the 2026-10-01 debate. Nothing is implemented in tgos yet; the prototype (v5) covers only the UI side.

| # | Decision | Status |
|---|---|---|
| [0001](0001-two-research-modes.md) | Two research modes: specific product and category exploration | Accepted |
| [0002](0002-v1-sources-api-first.md) | v1 sources: open web, owner-listed site APIs, scholarly; APIs over marketplace scraping | Accepted |
| [0003](0003-category-interview-then-quick-search.md) | Category mode: fixed-intent interview that only clarifies the keyword, then a quick search | Accepted |
| [0004](0004-product-mode-skips-interview.md) | Product mode skips the interview; candidates ranked by match | Accepted |
| [0005](0005-candidate-cards-and-inferred-preferences.md) | Candidate cards, inferred preferences, card pick ≠ peer declaration | Accepted |
| [0006](0006-approach-3-fixed-skeleton-ai-proposes.md) | Approach 3: code owns the skeleton, AI proposes, all bytes retained | Accepted |
| [0007](0007-source-neutral-scope-method.md) | New source-neutral scope method beside frozen M02 v2.0.0 | Accepted |
| [0008](0008-standing-authorization.md) | Standing authorization, spent only by "Bắt đầu nghiên cứu" | Accepted |
| [0009](0009-draft-run-through-and-coverage.md) | Run straight through to draft reports; coverage per operation | Accepted |
| [0010](0010-owner-team-loopback-only.md) | Owner/team only, loopback, single operator identity | Accepted |
| [0011](0011-fe-first-then-thin-slice.md) | FE-first prototype, then one thin vertical slice | Accepted |
| [0012](0012-confirm-dialog-report-choice.md) | Confirm dialog with Market / Insight / both | Accepted |
| [0013](0013-step1-mode-and-paste-split.md) | Step 1: mode shows/hides the description; pasted text is split | Accepted |
| [0014](0014-i01-drafted-by-system.md) | I01 owner question drafted by the system, owner-reviewed | Accepted |
| [0015](0015-owner-scope-cards-period-and-output.md) | Scope confirmation; real product images/descriptions; no monetary ceiling; Vietnam and annual periods; separate web/PDF reports | Accepted; implementation pending |

ADR 0015 partially supersedes the monetary-cap and authorization-status statements in 0008 and the mandatory cost-cap display in 0012. Their remaining decisions still apply.

To add a record, copy the shape of an existing one and take the next number. Don't edit an accepted decision in place; write a new record that supersedes it and mark the old one "Superseded by NNNN".
