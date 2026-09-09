# Task 022 — Combined Vietnamese market-and-review evidence report

Compose one deterministic offline Vietnamese Markdown report from two explicitly selected, already persisted Results: one `market_snapshot_v1` Result and one adapter3 Shopee review Result.

The feature reuses verified readers and Task 021 review rendering. Export is exact-digest, read-only, outside Git, owner-only (`0600`), and refuses overwrite. It does not run analyses or filters, call providers, scrape, or write the database.

The report preserves lossless integer strings and missing-versus-zero semantics. Market and review scopes remain visibly separate unless an existing verified shared identity exists; names are never used as a join. The listing revenue-selection period does not constrain review dates, and no aggregate sentiment, confidence, demand, opportunity, or overall market conclusion is produced.

Acceptance uses coherent synthetic persisted inputs only and covers verified composition, scope differences, missing versus zero, large integers, traceable retained reviews, corrupt/unsupported rejection, deterministic output, output safety, and absence of execution side effects.
