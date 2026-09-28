# Research A10: immutable report-version ledger

## Objective

Persist an already verified A4/A7 report bundle as an immutable, replayable
version. This is the first durable boundary joining source evidence,
deterministic calculations and a separately explicit review state.

## Required behavior

- Create a report series only from an exact workspace, finalized source package,
  selected source paths and section catalog digest.
- Persist every exact source, normalized result, packet, chart, HTML view,
  evidence envelope, semantic-content identity and review-state artifact.
- Record selected source membership and report artifact membership before the
  parent version is finalized; membership cannot be appended or changed later.
- Start at version 1 and require the exact previous semantic content ID for each
  later version. There is deliberately no implicit “latest” read.
- Replay through the owning source-package and discovery-workspace readers,
  rebuild deterministic calculations, and compare every byte and membership.
- Exact retry returns the same identities with zero database mutation. Changed
  content under the same report key/version fails closed.
- `readVersion` and history reads do not write files or database state.
- Interpretation remains `NONE`; human review remains `UNREVIEWED`.

## Four-layer boundary

1. Source evidence: exact original bytes and verified package/workspace lineage.
2. Calculation: normalized input, result, claims and charts rebuilt by code.
3. AI interpretation: absent in A10 and recorded explicitly as `NONE`.
4. Human decision: absent in A10 and recorded explicitly as `UNREVIEWED`.

Framework approval authorizes this structure only. It does not approve a report
claim, AI interpretation or business decision.

## Explicit exclusions

- No provider or AI call.
- No fifth automated section or new business method.
- No live data import, dashboard mutation, public sharing or PDF renderer.
- No human approval endpoint or decision mutation.
- No implicit selection of the latest source, catalog or report version.

## Verification ownership

- Integration coverage owns create/retry/replay, explicit predecessor history,
  membership freeze and missing-artifact failure.
- Existing A1–A9 tests continue to own arithmetic, source mapping, semantic
  identity and renderer behavior; A10 does not duplicate their formulas.
- Linux CI is the typecheck/test/build gate. Windows tests, builds and
  typechecks are not run.
