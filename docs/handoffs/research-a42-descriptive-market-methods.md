# Handoff: A42 descriptive market methods

Updated: 2026-10-01. Worktree: `work/research-a24`.

## Completed

Implemented the adopted, bounded M05/M06/M07/M09 methods as the explicit
`source-bound-descriptive-market` profile, version `1.0.0`. This is a
source-normalized descriptive output, not completion of the broader sections,
provider authentication, a reviewed interpretation, or a business decision.

- M05 retains literal source measures and partitions exact source file, measure
  definition, unit, period/timezone and scope. An exact decimal subtotal requires
  a source-declared additive member frame, complete required-member declaration,
  located atomic source keys, matching proof and no repeated member/key locator.
  Missing and UNKNOWN contribute no fabricated zero; observed zero remains zero.
  Incomplete membership/value coverage produces a partial subtotal. Overlap,
  incompatible declarations, missing unit/period or non-exact values block sums
  while preserving the inventory. Source decimal precision is retained with
  BigInt arithmetic. No cross-file/provider sum, rate or demand interpretation.
- M06 retains located source-stated objects, status, quantities and units.
  Counts mean located records. Unique entity counts remain null; no stock,
  aggregate supply, freshness or market-share calculation is implemented.
- M07 displays explicitly declared source-local peers in owner order. Values
  compare only within identical scope/measure/unit/period/timezone declarations.
  Missing membership returns an unranked inventory. Undeclared candidates remain
  in retained input but are excluded from the declared comparison display.
  There is no difference,
  ratio, score, rank, normalization or automatic peer selection.
- M09 retains attributed source wording, publication/event dates separately,
  linked contrary claims, and unknown dates at the end. Missing target links
  remain blocked. No inferred entity joins, causal effect, impact score or
  layer-three hypothesis output is produced.

Repeated references to the same exact digest/locator collapse; identical text
at different locators remains distinct. Conflicting normalized rewrites of one
exact reference fail closed. Existing M13 `{sourceSha256, locator}` vocabulary
is reused through a schema reference. Source package identities retain existing
package/version/manifest/content fields; no new entity identity scheme exists.

## Production integration boundary

`buildDescriptiveMarketMethods(input)` returns `{output, bytes}` and
`verifyDescriptiveMarketMethods(output)` recomputes the full deterministic
output, including its content identity. Both use the canonical JSON Schema;
input is at `descriptive-market-methods.schema.json#/$defs/input`.

`buildReportDescriptiveExtension(logicalPath, bundle, sourcePackages)` returns
undefined without reading when selection is absent. Otherwise it reads the
exact finalized package selected by the report and returns
`{output, bytes, inputBytes, inputSha256, files}`. The package-selected JSON
descriptor contains all input fields **except `sourcePackage`**. Supplied
package identity is rejected; verified reader identity is injected, avoiding a
self-referential manifest digest.

The extension verifies descriptor/source bytes, logical-path membership,
evidence-family/provenance metadata and package identity. It accepts only JSON
Pointers into registered retained `application/json` sources. Unsupported
locators do not silently become verified evidence. The pointer must resolve
the following literal structure:

| Reference | Exact referenced JSON value |
| --- | --- |
| M05/M07 observation | Observation excluding `source` and `aggregation` |
| M06 observation | Supply record with its nested observation excluding `source` and `aggregation` |
| Member key | Literal source-issued key string |
| Additivity proof | Aggregation declaration excluding `members` and `proof` |
| Run configuration | `{configuration, question, scope}`, with configuration excluding `runConfiguration` |
| Peer declaration | Peer set excluding `declaration` |
| Event | Event excluding `source`, `targetLink`, `conflictRefs` |
| Event target link | Exact `namedScope` string |

This proves equality to selected source-normalized declarations, not source
truth or provider authenticity. General XLSX/prose extraction and time-window
disjointness inference are outside this adapter. A future adapter needs an
explicit method revision and source mapping, not a permissive fallback.

Authority is pinned in code to the accepted immutable bytes, which must also
exist in the selected package:

- A41 market profile: `ddd4c0dcebc9a07a215646abce5152060f7d0c45c2582676ef84e2eb1ae3d8f7`.
- A41 adoption: `5c5d1ea4d6d8b8aebfbdc3d92cb51718351890184cc290aac82411722636b7e7`.

Historical replay does not reread mutable repository authority files. The
synthetic helper reads these exact documents only to construct test package
bytes; production receives them from retained package storage.

Exactly three files are added to the report, preserving the existing 40-artifact
database limit without migration:

1. `descriptive-market-input.json`: exact package descriptor bytes.
2. `descriptive-market-methods.json`: canonical output with resolved package identity.
3. `descriptive-evidence-files.json`: canonical envelope containing
   `contractVersion: "1.0.0"`, `encoding: "base64"` and `files[]`; each entry
   retains logical path, digest, byte size, media type, evidence family,
   provider provenance and exact `bytesBase64`. Decode the base64 bytes and
   compare their SHA-256 to the retained digest before external use.

At most four distinct registered JSON source blobs are accepted. Descriptor,
method output and encoded evidence envelope each have an 8 MiB limit.
Root owns real report dispatch, semantic supplemental digest, HTML projection,
exports and generation registration. Old reports with no selected extension
must preserve historical bytes and remain on their original rendering path.

## Changed paths

- `src/modules/analysis/descriptive-market-methods.ts`
- `src/modules/analysis/report-descriptive-extension.ts`
- `contracts/analysis/descriptive-market-methods.schema.json`
- `contracts/analysis/descriptive-market-methods.generated.ts` (root-generated)
- `tests/unit/descriptive-market-methods.test.ts`
- `tests/unit/report-descriptive-extension.test.ts`
- `tests/helpers/descriptive-market-fixture.ts`
- This handoff.

## Verification and test ownership

The test-audit authoring gate selected distinct observable failure boundaries:
exact decimal arithmetic, overlap/frame rejection, missing/UNKNOWN/zero and
partial coverage, compatibility partitioning, record identity, source-stated
supply semantics, declared peer eligibility/order, dated counterevidence,
schema/reference validation, recomputation after digest tampering, package and
authority binding, exact raw-byte retention and locator/value equality.
Twelve method tests and four extension tests are authored. Expected arithmetic
is hand-computed (12 + 8 = 20 and
9007199254740993.10 + 0.20 = 9007199254740993.30). No test depends on production
source text or an export added only for testing. The reusable helper supplies
synthetic package bytes to the report service integration test owner.

Static inspection and `git diff --check` completed on Windows. Contract
generation was performed by the root coordinator under the existing static
generation exception. No Windows tests, typecheck or build ran. Linux focused
method/extension tests, typecheck and real report service creation/replay checks
are pending the coordinator's runner at this handoff checkpoint.

## Remaining scope

No provider calls, installs, migrations, real-data actions, commits, pushes or
deployment occurred in this lane. A40 recipes and the accepted A41 packet were
not edited. No additional owner policy decision is needed for this bounded
scope. Real inputs must satisfy the explicit retained JSON source profile;
source truth, semantic review and optional advanced methods remain separate.
