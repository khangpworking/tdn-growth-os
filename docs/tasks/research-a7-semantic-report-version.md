# Research A7 — semantic report version boundary

## Objective

Give each source-backed report draft one deterministic **content identity** before
SQLite report-run persistence is introduced. The identity must answer “is this
the same evidence-backed meaning?” without changing merely because HTML/PDF is
rendered differently or a human later records a review decision.

This is an implementation boundary, not a new Market/Insight method. The
authoritative 30-section catalog remains unchanged: only M02, M03, M04 and M13
currently have bounded deterministic draft handlers. A7 must not claim that any
additional section, AI interpretation or business conclusion is complete.

## Four-layer boundary

1. **Source evidence** binds the exact verified workspace, evidence envelope,
   source package/manifest/content and selected original source digests.
2. **Calculation** binds normalized input, deterministic Result, packet,
   catalog, chart bytes and every section identity/state.
3. **AI interpretation** is explicitly `NONE` in v1. No prose, hidden model
   reasoning, provider output or recalled context is treated as evidence.
4. **Human decision** is emitted as a separate `UNREVIEWED` snapshot. Approval
   of the governance framework does not approve this report content.

The semantic ID is SHA-256 over canonical JSON source/calculation/interpretation
projections before its own ID is inserted, without the trailing LF used to frame
JSON artifact files. The exact export manifest still binds
the complete envelope, packet, Result, chart and render bytes, while semantic
projections exclude their representation-only renderer/review fields. HTML, PDF,
export-manifest bytes and human review state are intentionally outside that hash. A future interpretation
contract must create a new meaning-bearing version that cites exact evidence;
it must not mutate this v1 artifact.

## Deliverables

- Closed JSON Schemas and generated TypeScript for semantic content and review
  state.
- Runtime schema validation of both emitted artifacts.
- Re-verification of envelope, packet, normalized input, Result, catalog and
  chart objects against their exact bytes before identity creation, plus exact
  Result/catalog chart binding.
- `semantic-content.json` and `review-state.json` in the private A4 export.
- Visible semantic ID and download links for workspace and export manifest in
  the HTML report.
- CLI summary/export manifest binding the semantic ID and review-state digest.

## Explicit exclusions

- No migration, report-run database row, “latest” selection, API or dashboard.
- No AI/provider call, generated interpretation, human approval mutation or
  official calcium conclusion.
- No change to the 30-section catalog, calculation formulas, A1/A2 source
  semantics, A5/A6 standalone arithmetic or renderer approval meaning.
- No production PDF contract. Browser print remains an unapproved rendering.

SQLite persistence is still the next architectural layer, but migration 0029
must wait until the Content Studio 0026–0028 sequence is integrated. A7 is
independent of that sequencing gate and prevents render/export changes from
being confused with content changes in the meantime.

## Test-authoring gate

- The semantic unit test owns content-identity behavior: same inputs are stable,
  renderer-only changes do not alter identity, evidence/calculation changes do,
  review stays separate and corrupted bound bytes fail closed.
- The existing source-backed CLI integration owns publication behavior: the two
  new files are linked and published, IDs/digests agree across artifacts, and
  exact retry remains byte-identical. It does not duplicate arithmetic tests.
- No source-string grep, browser E2E, race/load/stress test or test-only
  production seam is added.
- Do not run tests, builds or typechecks on Windows. Linux CI is authoritative.
