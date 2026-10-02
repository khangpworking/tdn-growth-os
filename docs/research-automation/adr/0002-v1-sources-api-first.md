# 0002. v1 sources, API first

- **Status:** Accepted (owner, 2026-10-01; API-first finding 2026-10-02)
- **Date:** 2026-10-01

## Context

In tgos today, input is offline only:

- Source packages come in through a workbook, a manifest and labels (Task 023).
- Shopee reviews come through Apify (Task 015).

Automation needs live collection. When the owner pasted a Shopee product link during prototype testing, it was a bot-verify / traffic page rather than the product page. Scraping marketplace pages is fragile and gets bot-checked.

## Decision

v1 collects from three source classes:

1. **Open web.**
2. **Site APIs from a list the owner will send.**
3. **Scholarly sources.**

Prefer official or provider APIs over scraping marketplace pages. Every source is reached only through an approved, typed adapter operation ([0006](0006-approach-3-fixed-skeleton-ai-proposes.md)).

The first adapter to build is chosen by the **data fields its responses actually return**: comparable product records, measures, units, time basis and stable IDs. Which API arrives first doesn't decide it.

## Consequences

- Slice 1 can't start until the API list exists and one API is shown to fit the chosen evidence method ([0011](0011-fe-first-then-thin-slice.md)).
- Retained raw responses need a raw→normalized mapping, and derived representations are marked non-independent.
- Scholarly papers don't automatically describe this buyer population. Reports must say so.
- Pasted marketplace links are treated as references to resolve, not as pages to scrape. The prototype unwraps Shopee `next=` URLs only for display.
