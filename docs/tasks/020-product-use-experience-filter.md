# Task 020 — narrow calcium filtering to product-use experiences

## Owner decision

The Shopee calcium filter retains only concrete reported product-use experiences: taste, smell, swallowing, opening/preparation, tolerability, or perceived effects/lack of effects. Buying information is outside this view. Price, shipping/service, authenticity reassurance, purchase motivation, hearsay, and repurchase alone are excluded. Generic praise, repeated use, and “just started” without a concrete experience are insufficient. Mixed comments remain eligible when they include qualifying experience.

Guided-field values may contribute evidence, but field labels alone do not. Negation is preserved when classifying negative signals: “not difficult to drink” can remain a use experience but is not a complaint. Retention records a reported experience; it does not validate health claims or causation.

## Minimal implementation

- Reuse the Task 018 parser and continue preserving ambiguous final-field text and original raw text.
- Keep the established normalized `content` key for product-scoped deduplication, but match eligibility only against guided-field values plus free text.
- Replace broad target-user, authority, comparison, repurchase, and bare-consumption signals with a bounded concrete-experience vocabulary.
- Mask existing buying/logistics noise and narrow hearsay spans before experience matching.
- Preserve numeric scoring weights, deduplication order/scope, collection limits, and provider boundaries.
- Version the adapter as `shopee-calcium-v3-adapter3`.

## Validation and limits

Focused synthetic tests cover qualifying experience dimensions, mixed comments, non-qualifying buying information, field-label-only text, hearsay, generic/repeat/just-started text, and negated complaints. The 20 deliberately selected private Task 019 examples are a development check derived from the owner-approved scope, not individually owner-labeled ground truth or an independent accuracy benchmark.

The private 3,354-row comparison, raw reviews, usernames, and generated Vietnamese report remain outside Git. Decision-count changes and agreement with the 20 examples must not be represented as general accuracy evidence. No scraping, provider call, paid run, merge, deployment, or Windows backport belongs to this task.
