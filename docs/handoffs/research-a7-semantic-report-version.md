# Research A7 handoff — semantic report version boundary

## Scope delivered

- Added closed semantic-content and review-state contracts with generated
  TypeScript and runtime validation.
- Added deterministic semantic identity over exact verified source and
  calculation layers.
- Kept renderer/export bytes and human review state outside semantic identity.
- Kept interpretation explicitly absent and review explicitly `UNREVIEWED`.
- Added both artifacts to the private source-backed export, bound them in the
  export manifest/CLI receipt, exposed the semantic ID in HTML, and linked the
  workspace/export manifest for inspection.
- Preserved the 30-section readiness truth; no new method was claimed.

## Changed paths

- `contracts/analysis/report-semantic-content.*`
- `contracts/analysis/report-review-state.*`
- `src/modules/analysis/report-semantic-content.ts`
- `src/modules/analysis/research-report-html.ts`
- `scripts/export-source-backed-report.ts`
- `scripts/generate-foundation-contract.mjs`
- `tests/unit/report-semantic-content.test.ts`
- `tests/integration/source-backed-report.test.ts`
- report task/status/README documentation

## Verification

- Contract generation: PASS locally; this is generation only, not a Windows
  test/build/typecheck run.
- `git diff --check`: PASS.
- Independent static review: PASS with no remaining findings.
- Linux full check: PASS on implementation head `6162aa3c385613b1790cbaea35b0eb21a38ac2cd`.
  - <https://github.com/khangpworking/tdn-growth-os/actions/runs/36385409294>
- Linux report preview: PASS on the same implementation head.
  - <https://github.com/khangpworking/tdn-growth-os/actions/runs/36385409346>
- The prior preview run completed report generation and browser inspection but
  exposed a Chrome profile-cleanup race. The helper now waits for process
  closure and retries removal only for its request-owned temporary directory;
  the succeeding preview run is the regression proof.

The new unit test is the primary owner for semantic identity. The existing CLI
integration is extended only for its distinct publication contract. No existing
assertion is weakened and no duplicate calculation test is added.

## Unchanged boundaries

No migration, database mutation, API/UI, AI/provider call, approval action,
source collection, private data, deployment or production PDF is introduced.
Migration 0029 report persistence remains sequenced after Content Studio
0026–0028. The semantic artifact is a prerequisite for that durable registry,
not a substitute for it.

## Delivery state

Delivered on `feature/research-a7-semantic-version` in draft PR #63:
<https://github.com/khangpworking/tdn-growth-os/pull/63>. The implementation and
preview-cleanup head is `6162aa3c385613b1790cbaea35b0eb21a38ac2cd`;
the handoff-document commit follows it. The PR remains draft because A7 is
stacked on the still-unmerged A1–A6 report automation foundation.
