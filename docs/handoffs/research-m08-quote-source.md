# Handoff — M08 exact structured quote source admission

Updated: 2026-10-04
Worktree/branch: work/research-automation-v1 on `fix/research-real-world-audit` (uncommitted; existing dirty work from other lanes preserved)

## Honest scope

This is **structured source intake**, not automatic extraction. The package must already contain
JSON quote records whose business fields are literally the GenericQuoteUnit declaration. Nothing
here reads arbitrary provider JSON, infers pack size or variant from titles, or relaxes the Kalodata
capture mapping (that mapping still has no variant/pack proof and remains inventory only). A passing
admission proves that the descriptor faithfully replays retained structured records. It does not prove
that those records correctly transcribe a listing, checkout or provider page.

## Completed

- `AutomationQuoteReportRevisionRequest` (`automation-quote-report-revision-v1`) is closed.
  - It has `requestKey` (UUID) and `previousPairId` (SHA-256).
  - `sources.metric` and `sources.nativeReview` accept only `{decision: KEEP}`.
  - `quoteMethods` is either `$defs/selection` (`USE_PACKAGE`, `packageId`, `manifestArtifactSha256`, `packageContentSha256`, `descriptorPath`) or `{decision: SKIP}`. The selection has the same shape as G.
- `AutomationQuoteMethodSnapshot` (`automation-quote-method-snapshot-v1`) is closed.
  - `binding` has the same five fields as G: `workspaceId`, `runId`, `startSha256`, `scopeSha256`, `previousPairId`.
  - `selection` refers to the revision `$defs/selection`.
  - It also carries `descriptorSha256`, and `output` refers to `generic-quote-unit.schema.json`. That is the existing contract, not a fork.
- Both schemas use the `https://research.local/...` `$id` host, the same host as `generic-quote-unit`:
  - The generator resolves `$ref`s by file path, and AJV resolves them by `$id`. Both agree only when the snapshot shares that host.
  - Because the revision schema cannot reference G's `tdn.local` keep definition, it carries its own one-line local `keep` definition and is self-contained.
- `quote-methods.ts` exports `buildAutomationQuoteMethods(selection, binding, reader)` and `verifyAutomationQuoteMethods(value, binding, selection, reader)`. Both return the generated `AutomationQuoteMethodSnapshot`.
  - **Validation and budget:** AJV strict validation runs on the selection, the binding and the final snapshot. The read budget matches G: 32 MiB per file, 128 MiB total. Each parsed JSON file is capped at 8 MiB, and the snapshot at 8 MiB (`MAX_JSON_ARTIFACT_BYTES`).
  - **Package identity:** the package ID, manifest artifact SHA-256 and content SHA-256 (from both the reader and the manifest) must equal the selection. Duplicate package paths are rejected.
  - **Descriptor:** the descriptor must be an exact `application/json` file at `descriptorPath`. If it contains its own `sourcePackage`, it is rejected (`QUOTE_METHOD_DESCRIPTOR_AUTHORED_PACKAGE_IDENTITY`). The module injects `{packageId, version, manifestArtifactSha256, packageContentSha256}` from the verified package. The input then goes through the unchanged `validateGenericQuoteUnitInput` and `buildGenericQuoteUnit`.
  - **Listed sources:** every listed source must be present in the package with the matching SHA-256. Its byte size and SHA-256 are recomputed from the bytes. It must be `application/json`, strict UTF-8, and valid JSON with no duplicate object keys at any depth. Anything else fails; nothing else is parsed. The descriptor itself, by path or hash, cannot be listed as a source.
  - **Literal profile:** `literal-structured-quote-v1` is enforced as described below.
  - **Replay:** `verify` AJV-checks the stored value, rebuilds it from the same exact package, and requires full `canonicalJson` equality.
- No database writes, filesystem intake, latest selection, clock, provider or model calls, migrations or live records. Exact rational math, missing/zero/conflict states, `acquiredAt` vs `observedAt`, and the absence of cost, margin, ranking or completion promotion are all inherited unchanged from the calculator.

## Literal profile `literal-structured-quote-v1`

The descriptor configuration must be exactly:
- `parserProfileId: generic-quote-unit-v1`, `parserRevision: 1.0.0`, `mappingRevision: literal-structured-quote-v1`.
- `parserProfileSha256` must equal the in-code pin `c07bb17b1d6efe0c41c983c255be9f2004e7060960b4ae0c3333c190d66b86f9`. That is the SHA-256 of the committed `generic-quote-unit.schema.json` bytes.
  - `parserProfileRef` must point to `/$id` in that file, and the retained file must canonically equal the executing schema.
  - Any schema change therefore needs a pin bump; until then the module fails closed.
- `configurationRef` must point to `.../mappingRevision` and resolve to the string `literal-structured-quote-v1`.

**How a ref resolves:** the source is identified by `locator = logicalPath + fieldPointer`, and that source's SHA-256 must equal `sourceSha256`. Pointer resolution is strict: own keys only, and canonical array indices only.

**What a ref must match:** every non-null ref must resolve to a value that canonically equals the business value it binds. Payload(x) means `x` with the keys `source`, `binding`, `basisBinding`, `checkoutBinding` and `massSelectionBinding` removed recursively. Because the records never carry their own digests, there are no self-hash cycles.

| Ref | Required pointer suffix | Must equal |
| --- | --- | --- |
| `quote.source` | any | payload(quote) — the whole record, including `quoteId`, `acquiredAt`, `observedAt` and the declared authentication/review states |
| `identity.binding` | `/identity` | payload(identity): state, platform, shop, listing, variant state/ID/attributes, linkage |
| `identity.variantAttributes[i].binding` | `/identity/variantAttributes/<n>` | `{name, literal}` |
| `price.binding` | `/price` | payload(price): state, value/range, currency, priceState, conditions, tax, shipping |
| `price.conditions[i].binding` | `/price/conditions/<n>` | `{literal}` |
| `price.checkoutBinding` | — | **rejected if non-null** (see Unresolved) |
| `pack.binding` | `/pack` | payload(pack): count, compositionState, linkage, components |
| `pack.count.binding` | `/pack/count` | payload(count): state, value, unit, dimension, origin, literal |
| `netMass.basisBinding` / `netMass.quantity.binding` | `/netMass` / `/netMass/quantity` | payload(netMass) / payload(quantity) |
| `drainedMass.basisBinding` / `drainedMass.quantity.binding` | `/drainedMass` / `/drainedMass/quantity` | same, for the drained basis |
| `massSelectionBinding` | `/selectedMassBases` | `selectedMassBases` |

- **Why suffixes matter:** they reject a pointer that resolves to an equal-looking but unrelated shape, such as a pack count bound to a mass quantity, or NET bound to DRAINED. A merely resolvable pointer, or one whose value differs, fails.
- **Roles are checked by the existing validator.** `SOURCE_STATED` quantities need a `SOURCE` file and `OWNER_DECLARED` quantities need an `OWNER_DECLARATION` file. A hash shared by sources with different roles fails as `QUOTE_METHOD_INPUT_INVALID:CONFLICTING_SOURCE_ROLE`.
- **Scenario basis:** owner-declared denominators remain `SCENARIO` through the calculator's existing rule.
- **Imported states stay declarations:** `authenticationState` and `reviewState` are retained only. No review, approval or authorization authority is created.

## Example literal package (synthetic shape)

```text
methods/quote-descriptor.json            <- selection.descriptorPath; not a source
profiles/generic-quote-unit.schema.json  <- exact pinned schema bytes (role SOURCE)
config/quote-mapping.json                {"mappingRevision":"literal-structured-quote-v1"}
sources/listing-a.json                   {"quotes":[ <record below> ]}
declarations/owner-mass.json             optional OWNER_DECLARATION records, same quote-shaped suffixes
```

Record at `sources/listing-a.json#/quotes/0`. This is payload(quote) and must match it exactly:

```json
{"quoteId":"listing-a-6","acquiredAt":"2026-10-01T03:00:00Z","observedAt":null,
 "authenticationState":"UNKNOWN","reviewState":"UNKNOWN",
 "identity":{"state":"EXACT","platform":"example","shopId":"S1","listingId":"L1","variantState":"EXACT",
   "variantId":"V6","variantAttributes":[{"name":"Pack","literal":"6 jars"}],"linkage":"MATCHED"},
 "offerText":"6 jars x 500 g","packText":"6 jars",
 "price":{"state":"EXACT","value":"159000","range":null,"currency":"VND","priceState":"LISTED",
   "conditions":[],"tax":"UNKNOWN","shipping":"UNKNOWN"},
 "pack":{"count":{"state":"EXACT","value":"6","unit":"jars","dimension":"PHYSICAL_COUNT","origin":"SOURCE_STATED","literal":"6 jars"},
   "compositionState":"HOMOGENEOUS","linkage":"MATCHED","components":[]},
 "netMass":{"quantity":{"state":"EXACT","value":"500","unit":"g","dimension":"MASS","origin":"SOURCE_STATED","literal":"500 g"},
   "basis":"PER_ITEM","linkage":"MATCHED"},
 "drainedMass":{"quantity":{"state":"MISSING","value":null,"unit":null,"dimension":"MASS","origin":"UNKNOWN","literal":null},
   "basis":"UNKNOWN","linkage":"UNKNOWN"},
 "selectedMassBases":["NET"]}
```

The descriptor quote is that record plus its refs. For example, with `H` = SHA-256 of `sources/listing-a.json`:
- `"source": {"sourceSha256":"<H>","locator":"sources/listing-a.json/quotes/0","fieldPointer":"/quotes/0"}`
- `pack.count.binding` → `/quotes/0/pack/count`
- `netMass.basisBinding` → `/quotes/0/netMass`
- `massSelectionBinding` → `/quotes/0/selectedMassBases`
- `drainedMass.quantity.binding: null`
- `configuration.configurationRef` → `config/quote-mapping.json/mappingRevision`

The descriptor has no `sourcePackage`.

## Changed paths

- contracts/analysis/automation-quote-report-revision.schema.json (new)
- contracts/analysis/automation-quote-method-snapshot.schema.json (new)
- src/modules/analysis/research-automation/quote-methods.ts (new)
- docs/handoffs/research-m08-quote-source.md (new)

## Evidence

- Both schemas parse as JSON (`node` `JSON.parse`).
- The duplicate-key scanner logic was smoke-checked in a standalone `node -e` snippet with:
  - nested same-name keys (allowed)
  - a direct duplicate (rejected)
  - escaped quotes inside string values (allowed)
  - escape-equivalent duplicate keys (rejected)
- The schema pin was computed from the `HEAD` blob and the working file; both give `c07bb17b…`. The schema has no local modification.
- The worktree has no `node_modules`. No project tests, typecheck, build or generation were run on Windows, as instructed. Nothing was committed or pushed.

## Unresolved (stopped rather than invented)

1. **Checkout evidence.** Rejected as `QUOTE_METHOD_CHECKOUT_EVIDENCE_PROFILE_UNSUPPORTED`, so `OBSERVED_CHECKOUT` cannot be admitted under this profile.
   - The literal profile has no defined shape for checkout proof. It is undecided whether the proof must be a separate artifact (for example a checkout capture) or what fields must match.
   - Requiring it to equal payload(price) would let it point at the price record itself, which proves nothing beyond the price declaration.
   - Needs a business definition before a v2 profile.
2. **Source role vs package provenance.**
   - `SOURCE` vs `OWNER_DECLARATION` is a descriptor declaration, checked only for consistency.
   - It is not derived from manifest `providerProvenance`; operator-authored structured records are typically `operator_supplied_unverified`.
   - Reports should show the manifest provenance alongside `SOURCED` results. Whether to forbid, for example, `synthetic` files from the `SOURCE` role is an open policy choice.
3. **`acquiredAt` vs manifest time.** `acquiredAt` is not compared to the manifest's `sourceAcquiredAt`, because one package may combine acquisitions from different times. Both times are retained as declared.
4. **Unlisted package files.** Files not listed in `sources` are neither parsed nor required. Same-hash duplicates with the same role are allowed, because the locator path disambiguates them.
5. **Error codes.**
   - Errors are `ReportMethodPacketsExtensionError`, the same class as G, with `QUOTE_METHOD_*` codes.
   - Calculator validation errors are wrapped as `QUOTE_METHOD_INPUT_INVALID:<code>` / `QUOTE_METHOD_OUTPUT_INVALID:<code>`.
   - Foundation reader errors propagate unchanged.
   - The coordinator maps all of these to safe boundary errors.

## Coordinator checkpoint, 2026-10-04

The checklist below is the earlier worker handoff, not current integration status.
The coordinator has registered/generated both contracts on Linux and integrated
the package through `ResearchAutomationService`, the existing OWNER revision API,
Market rendering and M13 evidence. Historical reads rebuild from the exact raw
package. KEEP retains the snapshot; SKIP removes it only from the new pair.
Insight content and retained I14 execution are unchanged by a quote-only revision.

The snapshot now includes exact manifest source metadata. The display distinguishes
structured source declarations from owner scenarios and does not assert provider
authenticity. Unsupported checkout evidence remains rejected.

Primary proof: `tests/integration/research-automation-quote-methods.test.ts` uses
real source-package intake and SQLite with synthetic inputs: exact pack/item/mass
arithmetic, a repeating fraction, owner scenario, unsupported range, invalid
field/profile/JSON admission, frozen revisions, exact retry and corrupted-source
replay. API acceptance and I14 preservation extend their existing primary owners.
Linux generation/typecheck passed. Affected six-file run: 49 PASS, 1 optional
Chromium PDF SKIP. Disabling only quote-source replay through an outside-repo
loader made the corrupt-source assertion fail with `Missing expected rejection`.
Final unmodified owner run: 1/1 PASS. Overlapping runs are not added together.

Remaining: source-native producer and UI intake, real three-case acceptance,
visual web/PDF verification and release checks. No data/provider/model call,
live mutation, commit, push, merge or deployment occurred in this checkpoint.

## Native-source check (04/10/2026)

Read-only inspection of the retained three-case audit confirmed 39 detail
responses each for thermos/fan, with unit/min/max prices but no structured
variant or pack field. These are repeated response observations, not 39 unique
products. Descriptions are blocks of text/image metadata; no pack quantity was
inferred from names or prose. The original jelly run has no collection capture.
The existing native bridge already preserves these values as NON_EXACT/RANGE
inventory; it cannot establish per-unit/per-mass arithmetic eligibility.

Candidate connector qualification, not a provider execution or adoption:

- [gio21 detail](https://apify.com/gio21/shopee-product-detail) documents exact-URL
  detail, optional reviews and model-level prices. It also documents mock output
  on free plans and cached/embedded fallbacks, more common in Vietnam. A probe
  must reject mock records and distinguish cached/unknown from live evidence.
  Its sample models lack an explicit variant ID; a model name must not silently
  become a verified ID or pack size.
- [Zen Studio product scraper](https://apify.com/zen-studio/shopee-product-scraper)
  advertises eight markets, but documents full variant enrichment for Brazil and
  Indonesia only. It is not presently a justified Vietnam variant-source choice.
- [Xtracto all-in-one](https://apify.com/xtracto/shopee-scraper) documents that
  models/attributes/variants are no longer returned by its HTTP detail path.
  Do not install it as a fix for this missing-input boundary.

Planned bounded source step (executed below): one exact-URL Vietnam detail probe using the existing
authorized Apify channel, retaining raw response/build/run/charged cost before
designing a producer. Stop if only mock, cache, identity-ambiguous or blocked
output is available. Never substitute a discovered unrelated listing or infer
pack count one to turn an unavailable method into a passing result. Existing
price inventory and structured-package reader remain unchanged in this check.

## Exact-URL qualification result (04/10/2026)

One authorized Apify detail run was executed, without touching the operator,
application database, reports or source-package registry:

- Actor `gio21/shopee-product-detail`, run `xc1u0LlfghxCrERIH`, build
  `l3Y2TFtvprtop7Qxd`; terminal `SUCCEEDED`.
- Started `2026-10-04T10:16:23.316Z`, finished `2026-10-04T10:18:27.728Z`
  (124.412 seconds). One exact URL, reviews disabled, charge cap USD 1.
- Provider-reported `usageTotalUsd`: `0.020050000000000002` (about USD 0.02005).
  This is the run usage field, not an independently reconciled invoice.
- Exact dataset SHA-256:
  `e844187bf425b92d5cdb2a686b00d2d9b063cf1e8f82f99d334ca45bc395131f`.
- Returned shop/item IDs match `78085196` / `17678138164`. Source says
  `embedded_html`; `_mock` is not set. This does not prove live offer validity.
- `price` and `priceMax` are null, `priceAvailable` and `availabilityVerified`
  are false. One model has an empty name and null price/stock/sold/availability;
  it has no verified variant ID. The two attributes give shelf life and origin,
  not purchased-pack quantity or mass.
- The returned title says 500g whereas the owner's earlier URL title says 1kg.
  Titles alone cannot resolve variant identity or mass. Neither is parsed into
  a denominator or a selected variant.

Conclusion: the actor completed, but this record cannot supply exact M08
arithmetic operands. No production connector was adopted from this probe, and
no analytical section was marked complete. Do not repeat the same request to
manufacture a passing source or substitute an unrelated discovered listing.

Private raw request, HTTP receipts, responses and terminal summary are retained
under `~/.cache/tdn-m08-probe-20261004-gio21`, mode 0700/0600. The
probe wrote its intent before its only billable POST; polling reused the same
run ID. The API key stayed in memory and was not included in URLs or artifacts.

Next: finish explicit supplemental JSON source intake for R1 while continuing
native-source qualification only where a candidate has evidence it can supply
the missing fields. R1 intake is not R2 automatic collection, and declared data
must not become authenticated provider evidence.

## Earlier worker next-action checklist (integration superseded above)

1. Register both contracts in `scripts/generate-foundation-contract.mjs`.
   - Generate them; the service already imports both `.generated.js` files.
   - Confirm that `generate-report-validators.mjs` handles the self-contained `research.local` revision schema, if the frontend needs it.
2. Confirm the pin with `sha256sum contracts/analysis/generic-quote-unit.schema.json`. Then run `npm run contracts:generate`, `npm run typecheck`, the new focused tests and `git diff --check`.
3. Add focused tests on synthetic packages.
   - **Positive:** one fully linked quote with available pack, item and NET results, plus an `OWNER_DECLARED` count that yields `SCENARIO`.
   - **Negatives:**
     - descriptor that authors `sourcePackage`
     - count ref pointing to an equal mass quantity (suffix)
     - value mismatch
     - non-JSON media type
     - duplicate key
     - non-null `checkoutBinding`
     - wrong `mappingRevision`
     - unpinned profile bytes
     - descriptor listed as a source
     - locator/path mismatch
     - conflicting same-hash roles
     - replay of a mutated snapshot
4. Report rendering of the quote output, with provenance, limitations and operation reasons.
5. A separate, authorized producer lane that authors structured records (owner/operator transcription) before any live case.
