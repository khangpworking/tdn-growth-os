# Controlled calcium collection: current Metric export compatibility

Owner authorized one calcium study using Metric, Kalodata, SerpApi and Apify,
prioritizing sufficient data with actual cost reporting. No subscription,
business approval, fabricated source, or public-data publication is authorized.

## Narrow repair

Add explicit `metric-shopee-product-list-sheet1-v2` / `2.0.0` alongside unchanged
v1. Current exports move category-path K, brand F, shop I and composite ID J;
period revenue E, sold units D and category level 2 M remain unchanged.
Named Shopee URLs must agree exactly with exported shop and composite IDs.
V2 alone admits a genuinely childless empty inline-string cell as missing;
competing values, formulas and malformed strings remain rejected. Never rewrite
the source workbook or label the new layout v1.

Preserve raw bytes, source locators, exact integers and missing versus zero.
224 exported rows are a selected subset, not the rounded provider overview's
whole market. No label sidecar is invented; WIDE/CORE remain blocked where labels
are missing. Provider-reported quantities are not independently verified sales.

## Validation and release

Test owner: actual workbook normalizer. Synthetic reordered headers, slug URLs,
empty-inline missing values and mismatched identities protect this new mapping;
existing v1 cases continue to protect historical replay. Linux only. Generate
contracts, typecheck and focused boundary tests; full CI before any release.
No migration, dependencies, UI redesign or runtime restart in this repair.
Live source intake uses existing owning services after WAL-consistent backup.
New release activation remains a separate reviewed step.
