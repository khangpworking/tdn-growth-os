# 0001. Two research modes

- **Status:** Accepted (owner, 2026-10-01)
- **Date:** 2026-10-01

## Context

Owners arrive in two different states:

- **Specific product.** Some already have a product in mind, such as "viên canxi nano cho bà bầu, 60 viên, 320k".
- **Category exploration.** Others know only a broad keyword, such as "giày" or "đồ chơi".

One flow can't serve both well. A product owner shouldn't be interviewed about things they already said. An explorer can't describe a product they don't understand yet. The keyword is open-ended: canxi is only an example.

## Decision

Support two modes:

- **Sản phẩm cụ thể (product):** the owner gives a description, links or a photo. The system reads it and proposes matching real products. There is no interview ([0004](0004-product-mode-skips-interview.md)).
- **Khám phá ngành (category):** the owner gives only a keyword. A short interview clarifies it, and the system then shows real segments to pick from ([0003](0003-category-interview-then-quick-search.md)).

The mode is chosen on step 1 and can be corrected at any time; changing it resets the downstream steps. Nothing in either mode is specific to one category.

## Consequences

- Two paths through steps 2–4 that meet at the same market definition (step 5) and run (step 6).
- The mode decides what step 1 shows ([0013](0013-step1-mode-and-paste-split.md)).
- Tests must cover both modes, and more than one category, in every scenario.
