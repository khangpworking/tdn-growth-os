# 0003. Category mode: clarify-only interview, then quick search

- **Status:** Accepted (owner, 2026-10-01; Astra agreed on fixed intents)
- **Date:** 2026-10-01, revised 2026-10-01 18:13 (v2)

## Context

A broad keyword like "giày" or "giày nam" can mean many markets, so the system needs to know what the owner means before it searches. The owner may be completely new to the market, so any question that needs research to answer defeats the purpose.

The first draft asked about business stage, market position and report purpose. The owner rejected those questions: the interview exists only to clarify the keyword. Code also can't reliably prove that an arbitrary AI-generated question avoids market-fact questions.

## Decision

- In category mode, the order is: **interview first**, then the explicit "Bắt đầu nghiên cứu" ([0008](0008-standing-authorization.md)), then a cheap, bounded quick search that validates the interview with real segments.
- Questions come only from **fixed intents** that code defines: type, who, occasion/use, price level, and a similar product (optional).
  - The AI writes the category-specific wording and options within those intents.
  - Optional recall such as "a product you know" is never required, and never implies that the owner must name competitors.
- The interview never asks about business stage, market position, channel, report purpose, or anything that needs research to answer.
- A fact already in the keyword is not asked again. For example, "giày nam" skips "Dành cho ai".
- Every question has a "Không biết" answer.

## Consequences

- The interview is short, and a newcomer can answer it.
- Uncertainty that the interview leaves stays visible on the definition card, and is not guessed away.
- Business-context inputs such as I01 can't come from the interview. They are drafted elsewhere ([0014](0014-i01-drafted-by-system.md)).
- Segments that match the answers get "Khớp câu trả lời" and are sorted first on step 4.
