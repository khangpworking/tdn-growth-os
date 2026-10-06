# Offline generic quote unit M08 v1

Updated: 2026-10-02. Assigned checkout: research-automation-v1. Standard implementation lane; not activated or wired to a service, provider, UI, legacy P4 or report.

## Scope and authority

Implements section 4 and common boundaries of the business-reviewed `Research_Method_Contracts_Temporal_Quote_Synthesis_Corpus_v1_2026-10-02.vi.md`, version 1.0.0. Exact proposal SHA-256: `ec82948d923e4be231b5a63324855d6887d74b0ab994bb1fd6afa478635bb2f6`. This pins the proposal consulted, not an adoption receipt or permission to acquire source data/activate a method. Review disposition and activation remain coordinator work.

`generic-quote-unit-v1` is a bounded pure offline method. Its input is a normalized **declaration**, not verified provider truth. The caller must verify exact package/artifact bytes, locator and field pointer resolution, parser/configuration bytes and literal mapping replay before treating declarations as source-bound observations. Declared authentication/review fields remain declarations. A checkout reference is required for the OBSERVED_CHECKOUT label but this method cannot attest that a transaction occurred.

## Contract

Canonical JSON Schema and generated TypeScript share one contract. `buildGenericQuoteUnit`, `validateGenericQuoteUnitInput` and `verifyGenericQuoteUnit` use AJV and the canonical serializer. Input and semantic output SHA-256 bind the frozen declarations; replay recomputes every calculation and metadata field. There is no clock, network, source selection or latest-policy dependency.

Inventory retains source package/digests, raw field pointers, source roles, IDs/variant attributes, identity/linkage/conflict states, literal offer/pack text, acquisition and nullable UNKNOWN observation time, parser/mapping revisions, price state and range, conditions, shipping/tax, physical count/composition and separate NET/DRAINED mass. Origin SOURCE_STATED versus OWNER_DECLARED is checked against the referenced artifact role. No IDs or variants are derived from titles.

Every quote returns four independently gated operations: purchased-pack price, physical-item price, NET per100g and DRAINED per100g. Exact source price remains an unassigned price observation if identity/variant or same-offer linkage is unresolved; purchased-pack price and other denominator operations are unavailable with null exact/display/basis/denominator fields and explicit reasons. Purchased-pack price requires resolved offer linkage, but not a physical item count or homogeneous composition. Currency UNKNOWN prevents arithmetic but does not discard inventory. Price range/missing/non-exact states never choose a low or midpoint value. Unknown time alone does not stop single-quote arithmetic or imply a current price.

Positive exact physical count with explicit PHYSICAL_COUNT dimension, a compatible mapped unit and homogeneous same-offer pack are required for per-item arithmetic. Output pins `physicalCountUnitMappingRevision: physical-count-unit-v1`. That finite mapping accepts item/items, piece/pieces, pc/pcs, unit/units, jar/jars, bottle/bottles, can/cans, box/boxes, bag/bags, sachet/sachets, packet/packets, tube/tubes, tablet/tablets and capsule/capsules, plus the explicit count labels cái, lọ, chai, lon, hộp, túi, gói, ống and viên. Matching only trims, NFC-normalizes and lowercases the declared unit. It does not parse offer text, strip accents, expand dozen, infer dimension or infer a count from a label.

Unsupported/nonphysical units, including watt, hours and milliliters, retain their original unit/value/literal in inventory and gate physical-item arithmetic with `UNSUPPORTED_PHYSICAL_COUNT_UNIT`, even if the declaration labels them PHYSICAL_COUNT. OTHER/UNKNOWN dimensions independently gate arithmetic with `COUNT_UNIT_NOT_PHYSICAL`. Only compatible positive integer physical counts can become denominators; unsupported quantities never become physical denominators. Mixed bundles and gifts are not allocated. Each mass operation requires its explicit selected basis, matching linkage, homogeneous pack and exact MASS-dimension g/kg quantity. Per-item mass additionally requires compatible physical count; total purchased-pack mass is independent of count and never multiplies it. kg→g uses exact 1000; no ml→g or capacity/mAh/performance denominator. NET and DRAINED are neither inferred nor averaged. Owner-declared operands/basis remain SCENARIO. Selection of a source mass basis does not itself turn that mass into a declared measurement.

Price zero is valid. Under the approved business-review clarification v1.1, count zero/fractional values and mass zero remain raw inventory, not whole-input validation errors. `INVALID_COUNT_VALUE` blocks only physical-item price and mass operations declared PER_ITEM; linked purchased-pack price and a valid PER_PURCHASED_PACK mass remain available. `INVALID_MASS_VALUE` blocks only the NET or DRAINED operation using that zero quantity; other mass basis, unselected mass and other quotes do not suppress eligible arithmetic. NON_EXACT remains an independent exactness gate. No denominator is coerced or divided by zero. Negative price, malformed schema, impossible declaration states and source/lineage contradictions still reject input. Exact BigInt rational arithmetic is reduced; two-decimal display uses half-even `decimal-2-half-even-v1`. Existing tablet/economics helpers are private, so this new method has small private rational primitives without changing either legacy method. No ranking, equivalence, cost, margin, profit or unconditional-checkout claim is produced.

Mass-unit compatibility in contract v1 is canonical lowercase `g` or `kg`. Other spellings/casing remain raw inventory with `UNSUPPORTED_MASS_UNIT`; the method does not silently lowercase, convert or expand mass-unit aliases. This documents the existing contract, not a business-unit expansion. The unreleased method and schema remain version 1.0.0; v1.1 names the approved business clarification, and no persisted/public method artifacts require migration.

Bounds: 500 quotes, 1000 source declarations, 8 MiB input/output, finite bounded text/decimal/ref arrays enforced by AJV. Input order is frozen output order; no sorting by price or recency. Invalid digest/ref syntax, missing registered sources, role contradictions and impossible states reject input, while operation insufficiency keeps inventory plus reasons. No records/qualifiers are silently truncated.

## Changed paths and evidence

- `contracts/analysis/generic-quote-unit.schema.json` (canonical contract).
- `contracts/analysis/generic-quote-unit.generated.ts` (generated on Linux only; never hand-written).
- `scripts/generate-foundation-contract.mjs` (registration only).
- `src/modules/analysis/generic-quote-unit.ts` (method/replay boundary).
- `tests/unit/generic-quote-unit.test.ts` (five method-boundary tests).
- This handoff.

Test-audit authoring gate: fixtures are independent synthetic business examples, not outputs generated by the method. Tests protect exact fixture results, independent operation gates, scenario provenance, impossible/source-corrupt declarations, and semantic replay corruption despite a fresh output hash. Those are new method-boundary contracts not covered by legacy tablet tests; no test-only exports or lower-layer duplicate tests were added.

Business-audit corrections extend those existing primary owners: unresolved identity/variant/offer linkage cannot produce an AVAILABLE purchased-pack price, while missing count alone leaves a linked pack price available; unsupported count units retain raw inventory and block physical-item/per-item-mass arithmetic without blocking total-pack mass. Credible pre-fix regressions are the ignored linkage reasons and permissive unit blacklist. Cases use independent expected outcomes and no new production test seam.

The approved business-review clarification v1.1 explicitly supersedes the earlier whole-input assertions for count zero, fractional count and mass zero. Those three rejection cases were removed from the malformed/source-contradiction test and moved to four table-driven subcases at the existing independent-operation owner: count 0, count 1.5, NET mass 0 and DRAINED mass 0. Each verifies retained inventory, unavailable consumed operations with null arithmetic fields and explicit reasons, available independent operations/other quote, unchanged NON_EXACT gating and canonical replay. The pre-fix implementation failed all four with `INVALID_DENOMINATOR` on isolated Fedora Node 24.15.0; negative-price/source/lineage rejection coverage remains intact. No new production seam or lower-layer duplicate was added.

No Windows tests, typecheck, build or generation were run in this implementation lane. Linux coordinator commands:

```sh
npm run contracts:generate
npm run typecheck
node --import tsx --test tests/unit/generic-quote-unit.test.ts
git diff --check
```

## Open boundaries and next action

Linux contract generation, repository typecheck and all five method-boundary tests passed on 2026-10-02. Generated types were copied back without manual edits. Coordinator static review identified the physical-count dimension and parser-profile reference gaps before this run; both were corrected. This is implementation proof, not final-head CI or live quote acceptance.

The later business-audit linkage and compatible-unit corrections also passed
Linux regeneration and all five primary tests. Isolated loader negative controls
removed each production guard independently: an unknown identity incorrectly
returned AVAILABLE purchased-pack price; `watts` incorrectly returned AVAILABLE
physical-item price. Both failed the existing owning test for that exact reason.
The controls do not edit production files. An initial loader attempt failed to
match transpiled source and was discarded as invalid proof; the corrected
controls operate on the original TypeScript source before loading it.

Operation-local denominator clarification v1.1: targeted RED proof above is complete. On the isolated Fedora cache snapshot with Node 24.15.0, single-contract Linux generation, all nine focused cases (five existing parent tests plus four operation-local subcases), and repository typecheck passed. Only this contract's generated file was copied back; no Windows test/typecheck/build/generation was run. Static review confirmed count reasons enter only physical-item and PER_ITEM mass arithmetic, total-pack mass never consumes count, each mass-value reason stays in its own NET/DRAINED result, and nonempty reasons prevent division. Earlier repository-wide proof predates this correction and is not represented as current full-suite proof.

Source acquisition, exact-byte/pointer/parser replay admission, authority/activation, method registry/service/UI/report integration remain out of scope. A normalized source digest declaration alone cannot validate a payload. No synthetic fixture is acceptance of a live quote or a complete M08 section.
