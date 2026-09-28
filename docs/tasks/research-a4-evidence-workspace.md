# Research A4 — evidence-backed report workspace

## Objective and authority

Continue the owner's full report-automation objective, not only a report formatter:
original evidence → validation/SQLite normalization → readiness for 30 sections →
versioned deterministic calculations → charts and separately labelled AI
interpretations → human review → versioned dashboard/HTML/PDF.

Business methodology belongs to **Review marketing framework files**. Code must
not invent missing methods, classification labels, identifiers, periods, findings
or owner approvals. No provider collection, paid AI call, production deployment,
live migration or real business approval is authorized by this development task.

## Four layers

1. Source evidence: retain exact original bytes, provenance declarations and
   source locators. An XLSX representation is not an independent second source.
2. Calculations: reproducible code, explicit scope/period, exact values, method
   versions, missing-versus-zero and numerator/denominator/membership pointers.
3. AI interpretations: separate generated conclusions, checkable explanations,
   assumptions, limitations and supporting references. Never store purported
   hidden model thinking as independently verified evidence. Prior AI output may
   be recalled as an interpretation, not recycled as an independent fact.
4. Human decisions: bind the exact interpretation/report version and trusted
   actor. Acceptance does not authenticate a source or prove a claim true.

## Implementation sequence and integration constraints

- Extend the verified A1/A2/A3 boundaries; do not replace their method semantics.
- First connect an exact existing Foundation source package and verified Flow
  workspace to raw-byte re-parsing, a deterministic packet and chart data.
- Publish an offline evidence-linked HTML bundle with original sources and
  machine-readable dependencies, preserving the existing A3 bundle contract.
- Persist normalized observations and report-run/version identities in SQLite,
  then connect the operator dashboard and explicit human-review boundary.
- Add method-approved interpretation generation/validation through the existing
  AI boundary, without making live calls during development.
- Finish HTML/PDF and scoped acceptance. None of the earlier slices alone proves
  the full goal complete.

Migration coordination: the current branch has 0001–0025. Open Content Studio
PRs #56–#59 allocate 0026–0028. Reserve 0029 for research after that integration;
do not install a gapped migration tree, placeholders, or unreviewed Content code
just to unblock this branch. Chart/export/source-reader work can proceed now.

## Current bounded contracts

Select a package by exact ID and expected manifest digest, a workspace by ID,
and workbook/manifest/optional-label logical paths within that package. Read
cross-Box data only through verified interfaces. Re-parse the retained workbook;
do not trust a supplied calculation or receipt in place of original bytes.

Keep A3's `NORMALIZED_INPUT_ONLY` meaning unchanged inside its packet. A separate
source-backed envelope records that original package bytes were actually read
and re-parsed. This proves mapping/replay, not provider authenticity, commercial
period validity or correctness of operator labels.

Charts initially expose only the existing M03 totals and M04 concentration
handlers. ALL/WIDE/CORE overlap and must never be added together. Top 1/3/10
shares are cumulative, not disjoint donut segments. Missing observations are
not zero. Exact integer strings survive both display and evidence export.
Unsupported methods and unready sections remain visible with blockers.

Primary Metric (4), filter ON, and sensitivity Metric (3), filter OFF, stay
separate. UNKNOWN is retained for inspection but excluded from WIDE by the
approved explicit run policy. Unknown acquisition time stays null, never mtime.

## Validation and test authoring gate

No Windows tests, typechecks or builds. Verify through Linux CI. Synthetic
fixtures only in Git; original/private data stays outside Git.

- Chart unit boundary owns exact values, references and blocked/zero states;
  calculation tests already own arithmetic, so do not duplicate their suite.
- Source-backed integration owns actual persisted package/workspace replay,
  source selection/mismatch, deterministic envelope and no database mutation.
- Export CLI owns outside-Git publication, exact retries, no overwrite and safe
  HTML source rendering. A real DOM check owns links/escaping, not source grep.
- SQLite integration later owns normalization/version persistence and replay.
  Tests must exercise real storage, not mocks that supply the asserted result.

## Open items to collect, not silently decide

Real accepted classification sidecar; unimplemented per-section business methods;
interpretation approval semantics not already established; exact migration
integration base; deployment/live-provider authorization. Independent work
continues while these are resolved. WeKnora/OpenViking/LangGraph/Jev remain optional
future experiments rather than new dependencies of this implementation.
