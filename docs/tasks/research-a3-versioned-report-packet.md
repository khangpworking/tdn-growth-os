# Research A3a — offline versioned report packet

## Scope and authority

Owner assigned the TDN task implementation and **Review marketing framework files** methodology. The 2026-09-28 business handoff recommends a smaller A3a before the original A3 database/workspace integration. This is a draft packet, not an official report or a new research method.

Base: A2 `de697351febb15c60a51ec4da1b78b67962cedd8`, integrated with main `ff20bbb1cc344fdf68eb7713327077826f899b81` without altering either domain's behavior. Depends on draft PRs #52 and #54; do not merge before their review/acceptance.

## Public boundary

Offline CLI takes one exact A1-format result file, its expected byte SHA-256, a section catalog file, its expected byte SHA-256, and a new outside-Git output directory. A2 produces the same A1 result format. Schema validation and deterministic A1 recalculation must reproduce the entire supplied canonical result; a hash alone is not sufficient.

The packet binds the catalog snapshot, exact result bytes, normalized-input digest, declared source hashes, calculation/rounding versions, packet policy and renderer version. No runtime timestamp, generated UUID or implicit latest lookup enters deterministic identity. Changed dependencies produce a different content identity; this does not invent a sequential report history.

The catalog is planning metadata, not an executable or approved methodology. Its historical template maturity is not proof of a new report's maturity. Section IDs are extensible; unimplemented handlers remain explicit. No catalog field can grant approval or supply a numeric claim.

Application-owned FACT observations only: listing/shop counts, observed revenue/units, and eligible top-shop shares, with exact JSON pointers, period/scope, coverage, precision caveats and denominator references. These are observations of normalized input, not verified market facts. No caller-supplied FACT text, INFERENCE, HYPOTHESIS or manual evidence import is supported in A3a. Importing those categories requires its own method/rights/review boundary later; a schema cannot prove their truth.

M02/M03/M04/M13 get bounded partial outputs; wide/core remain blocked when labels are stale/missing. I03/I17 carry method/provenance scaffolding only. Other sections retain missing-input/manual/method/not-implemented states from the versioned planning catalog. No assertion that all 30 sections are complete.

All outputs remain UNREVIEWED/DRAFT. No approval command exists. Source hashes and scope/acquisition declarations are preserved but A3a does not reopen raw workbooks or authenticate providers. The result therefore remains NORMALIZED_INPUT_ONLY, even if produced by A2; A2 receipt hashes alone do not upgrade verification.

Catalog source: sanitized 2026-09-28 handoff from **Review marketing framework files**. Only generalized titles, historical maturity, required-input categories and reopen conditions are committed. No historical report findings, numbers, private locators or source digests are published. Adaptation: M08 is METHOD_ONLY, not SCENARIO_ONLY, because this run supplies no economics assumptions; M10 is BLOCKED without series/holdout. Fixed method IDs/versions for M02/M03/M04/M13 dispatch only the small packet handlers above, not the complete original section methods. Future section IDs can be represented but do not execute any code.

## Files and replay

Bundle: `metric-result.json`, `section-catalog.json`, `packet.json`, `report.md`. Result/packet JSON is canonical with one LF; selected catalog bytes (which may be pretty-printed) are preserved exactly. Same input/method bytes reproduce the same packet and Markdown. Existing exact bundles are verified and reused without writes; mismatch, missing or extra files fail without overwrite. Directory 0700 and files 0600 on Linux; outside Git; no symlink output target/files. `packetId` hashes canonical packet content excluding the self-ID (not the packet file bytes); the CLI separately reports `packetFileSha256`.

## Test authoring gate

- One owner-boundary fixture protects section state, correct exact references and independent observed numeric expectations; credible regression is misbinding scope or silently promoting missing/estimated values.
- A table covers tampered results/hashes/catalog identities and unsupported claims; current A1 tests do not own packet intake or section-state semantics.
- One actual CLI lifecycle test protects retained bytes, exact retry, changed-dependency identity and no overwrite; calculation tests cannot exercise publication.
- No test-only production seams. No duplicate full-flow browser tests, provider mocks, load or race suite. Linux CI only; no Windows tests/typecheck/build.

## Non-scope

No DB/migration, workspace binding, official approval, UI, worker/scheduler, AI/JEV, Content Studio changes, live source intake, private corpus publication or provider call. Manual case/claim rights and raw-source acceptance remain unresolved and must not be guessed.
