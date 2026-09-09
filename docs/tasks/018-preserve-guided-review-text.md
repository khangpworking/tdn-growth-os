# Task 018 — preserve guided-field review text

## Scope

The existing calcium filter remains authoritative. This task changes only guided-field boundary handling:

- an explicit double-space boundary remains a confident split;
- when the final guided field has no explicit double-space boundary, its full value is also preserved as review content and the result reports `guidedFieldBoundary: "ambiguous-preserved"`;
- ordinary free text reports `none`.

Original `text` is never modified. Keywords, scoring, product-scoped deduplication, collection limits, field-label signal behavior, and off-product handling are unchanged.

## Contract

`shopee-review-result` adds the required bounded enum `guidedFieldBoundary` (`none`, `explicit`, `ambiguous-preserved`) and advances the adapter identity to `shopee-calcium-v3-adapter2`. No collection or provider interface changes.

## Validation and privacy

Synthetic regression coverage includes single-space, double-space, multiple-field, field-only, and ordinary free-text inputs. The private 3,354-row Task 017 file and Vietnamese before/after report remain outside Git; no usernames, raw reviews, or generated private results are committed.

Increased retention is an observed behavior, not evidence of improved accuracy. Ambiguous retained content still needs owner judgment. Field-label signals and off-product blacklists are explicitly deferred.
