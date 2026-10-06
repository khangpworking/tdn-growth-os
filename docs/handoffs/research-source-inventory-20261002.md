# Independent source inventory and content-plan review

Date: 2026-10-02. Reviewer: GPT. Code checkpoint: `53538fc095ffd092e5f36647b2098ed9c11398bb`.

This work ran alongside Claude's content-acceptance preparation. It changes no
production code, source data or report. The private inspection helper and
receipts remain outside Git.

## What was checked

On Fedora, a small helper opened the original three-case audit database with
`readonly`, `fileMustExist`, `query_only=ON` and an explicit read transaction.
It read only capture references, referenced CAS bytes and collection metadata.
Every capture digest and embedded response digest/byte size was checked before
field names or types were summarized. No comment text, authors, tokens or source
payload values were exported.

| Original case | Verified captures / responses | Recorded operations | Retained review collections |
|---|---|---|---|
| Exact jelly | 7 / 7 | 2 balance, 1 rank, 4 detail | 0 |
| Thermos | 48 / 48 | 4 balance, 1 rank, 43 detail | 0 |
| Fan | 48 / 48 | 4 balance, 1 rank, 43 detail | 0 |

All 103 responses are Kalodata. The original audit database contains zero
Foundation source packages and zero Shopee collections. Later offline replay
packages in other stores are outside this statement.

Thermos and fan each requested 13 distinct collection windows from 2025-10-02
through 2026-10-01. These are request parameters, not proof of provider
measurement coverage, semantics, timezone or additive annual totals.
All 90 detail responses contain `revenue_trend: null`; none contains
`data.date_range`. Their key sets include review counts, not review text.
The observed `launch_date` shape does not establish a review creation date.

A separate read transaction inspected the specifically named legacy operator
database and its CAS, without asserting that it is the active runtime store.
It contains one live-mode Shopee collection with five selected listings and
one verified two-byte `[]` raw page. The exact jelly listing is not selected.
There is therefore no review text to reuse from that collection. Its mode
label alone does not establish successful collection or source quality.

The Task 016 raw digest was not found in either named CAS, or by exact filename
search under the Fedora `.nanobot/private` and `.nanobot/workspace` directories.
This is **NOT_VERIFIED**, not proof that no retained copy exists elsewhere.
No live review date field or its meaning has been established by this check.

## Private receipts

Local evidence directory: `artifacts/research-real-world-audit-20261002/`
(outside the repository checkout).

- `source-inventory-audit-20261002.json`: SHA-256
  `693a80036795862899a2068974518c926efa63256dc75803a09b7b0c9f33be31`
- `source-inventory-operator-20261002.json`: SHA-256
  `504c5ddd8ba5396afda256d8109a4aef3273d49ef32985a8220ac0fe75d155ba`

Fedora receipts were created with exclusive creation and mode `0600`. Source
databases were not backed up, migrated, seeded or opened through application
startup. No endpoint, provider or AI model was invoked by the inventory helper.
This is read-only inspection evidence, not a complete domain-reader replay or
a before/after byte-preservation test of a concurrently running database.

## Independent disposition of Claude's proposed next slice

The 30-section matrix is useful, but needs these amendments before code assignment:

1. **Review dates are an operation-specific prerequisite.** Keep date-unknown
   records as separately labelled qualitative context, excluded from annual
   claims. Category CORE/WIDE/UNKNOWN and date eligibility are separate
   dimensions; missing dates do not change category membership. Undated rows
   cannot support annual WIDE claims. A missing date field must not block the entire located
   coding pipeline. Do not guess `createdAt` from an old permissive schema, or
   substitute acquisition time. C1 date mapping remains gated by actual source
   field and semantic evidence; C2 can prepare the independent context path.
2. **Keep category discovery system-owned.** A missing thermos/fan review URL is
   first a discovery/identity/selection integration gap. Inspect available
   discovery and propose traceable exact listings under the established scope
   workflow. Ask the owner only for genuinely ambiguous scope or a required
   selection approval, not to perform provider research on the system's behalf.
   Do not silently convert TikTok identity into Shopee identity or self-approve
   an automatically discovered listing.
3. **M07 inventory is not the claimed peer comparison.** The current unranked
   auditor selection can be shown as bounded inventory. It does not satisfy
   the matrix's owner-declared-peer question. State that distinction in the
   tally as well as in the row.
4. **Business approval cannot supply absent source semantics.** The business
   reviewer can approve how an evidenced date/field is used; it cannot establish
   a provider field's meaning merely because provider documentation is silent.

The business session independently supported the date, discovery and M07
amendments (turn `01a0fccd-bb67-7091-8c6a-3370d2b8ccd9`). It recommended parallel
literal-rule preparation and source discovery, followed by the I02/I04/I05/I07/I08
bridge with I03/I17 trace. It did not approve unseen rule tables or certify source
mapping, real-content usefulness or 30/30 completion. Do not count model
agreement as source verification or human report approval.

## Published checkpoint

Draft PR #110 remains unmerged. Exact-head GitHub Linux CI passed for
`53538fc095ffd092e5f36647b2098ed9c11398bb`:
[run 37011129241](https://github.com/khangpworking/tdn-growth-os/actions/runs/37011129241).
This is engineering-checkpoint evidence, not 30-section content acceptance.
No new Windows tests, provider calls, deployment, restart or business writes
were performed for this inventory.

## Later controlled review acquisition (separate from the read-only inventory)

Two exact-jelly Actor starts were authorized under the owner's existing
adequate-data/cost-reporting authority. These operated in an isolated private
Fedora store, not the active operator database.

| Capture | Terminal status | Returned rows | Rows with text | Provider-reported USD |
|---|---|---|---|---|
| Zen exact-product Actor | FAILED | 0 | 0 | 0.008 |
| Dami shop-review Actor, filtered exact product URL | SUCCEEDED | 62 | 20 | 0.005 |

Total reported for these two starts: **USD 0.013**. The original three-case
Kalodata cost remains unknown; it is not included or estimated. Zen issued 45
HTTP requests and Dami 7; these are not 45/7 model calls or charged Actor starts.
The failed Zen capture was retained through the actual Foundation collection
service. FAILED plus zero returned rows must not become successful empty data.

Dami is a shop-sweep product subset, not full product-review history. All 62
observed rows have the exact requested shop/item fields and 20 have nonempty
comments. This is structural identity evidence, not authenticated authors,
semantic eligibility, representativeness or dates within the annual period.

The exact Dami request, start response, terminal response, dataset, notices and
receipt were retained in a **separate real SourcePackage**, with an exact-pointer
located input/output and adopted method-profile bytes. Provider responses are
marked `provider_reported`; operator declarations are unverified. No source
period was invented. No fake Zen collection or ResearchReviewCorpus was made.
The verified package preserved every byte and an exact retry had zero mutations.
It contains **zero semantic annotations** and is not wired into the live report.

Private evidence (Fedora, owner-only, outside Git):
`<private path on the test host, withheld>`.

- Raw dataset SHA-256: `d64c61171e6e15a5e103f342a7f37674dc399cbe88ed3781cedfd98a19da10a6`
- Capture receipt SHA-256: `a05c5a86dcc47d8940fc1ab445aaeca64b1b0887fa82ee4f2f839f6771c6a2ad`
- Package content SHA-256: `51a1130602a87de9923a83997130d9d4b6d81f80e9dc7c840e1a767bef8c4420`
- Manifest SHA-256: `d2053a97804c2e4bd58c4989ad7c63d23f98df0964f089410d96a501345c144e`
- Admission receipt SHA-256: `029e1966e1ebfcac7c032258dc8e8ee49a8a327259e19aaae85f9b4e67807567`

Official Actor scope: [Dami shop reviews](https://apify.com/dami_studio/shopee-shop-reviews-scraper).
The zero-row Zen failure and the successful alternative are both retained, not
overwritten. No active runtime restart, deployment or real business decision
was performed.

### Read-only actual-field follow-up

The retained Dami dataset was inspected without printing comment or author
values. Its actual fields include `shopid`, `itemid`, `cmtid`, `comment`,
`rating_star`, `review_date`, `ctime`, `collected_at`, `coverage_note` and
`model_name`. All 20 readable rows have 20 distinct native `cmtid` values;
this is not a count of unique people. `model_name` is null on all 62 rows,
so variant identity is still unresolved.

All 20 readable rows have a canonical ISO `review_date` matching `ctime`
when interpreted as Unix seconds. The Actor's documented output defines
those two fields as the same moment; `collected_at` is separate. This
supports a bounded **provider-reported** date mapping, not authenticated
dates, complete period coverage or automatic annual/category admission.
The existing package v1 deliberately has null normalized `timeText`; it is
immutable and will not be overwritten. A subsequent versioned adapter must
preserve these actual source date fields and locators rather than use the
run's acquisition/confirmation time or describe the source fields as absent.

The collection contract currently fixes the Zen Actor, so Dami must use a
SourcePackage-backed located-record adapter, not a fabricated Zen collection.
Production mapping must validate safe IDs and explicit object/string fields,
retain native run/dataset/request identity, bound JSON and preserve exclusions.
The existing private receipt has a run ID but **no dataset ID field**; do not
claim that missing receipt link was verified. Start and terminal responses do
agree on their dataset ID. Provider input was not independently retrieved,
so receipt/request agreement does not authenticate the provider's input.

### Private date-preserving package version 2

The actual date mapping was retained in a new version of the same private
package, without changing version 1 or the raw capture. Its descriptor keeps
the original `review_date` strings, and a mapping artifact binds their raw
locators and `ctime` agreement. Both explicit source limitations above remain.
All 20 included comments have agreeing date fields; no period/category
admission or semantic annotation is added. Verified replay matched exact
prepared bytes, and the immediate exact retry added zero mutations. No provider
was called for this admission.

- Package content SHA-256: `bb07f9911b94c88d3b5ab38a66d1601f9c4458e81828b98adbc64b214b069a6f`
- Manifest SHA-256: `c1013912325b686f193a6f80c8d4cd907d693ffd92d4b45b602118ed4220dcbe`
- Private v2 admission receipt SHA-256: `6d1c6f373ffb2efd05c7592d43b33ce126a4f7772f4577df573e3befa87677a7`

This is input-readiness evidence, not production automation wiring or a useful
30-section report. Raw author metadata remains private and is not projected.

### Private literal diagnostic retention from version 2

The genuine SourcePackage adapter prepared literal diagnostics directly from
the verified v2 descriptor and source bytes. No Zen collection/corpus identity
was created. A new private method package retains all original source files,
their roles, the exact v2 manifest dependency, rule/parser/adapter/brief/schema
bytes and the Located evidence bundle. The original source package remained
unchanged; an immediate retry of the method intake added zero mutations.

- Diagnostic package content SHA-256: `4ad1ac2ce3f8d2a1072adcbe13cc818413d482bf44e868fce723f5b965d838e1`
- Diagnostic manifest SHA-256: `a777b81f526a69866a9927e3f243f608ccdc6d3a4c09d01dfaf052cae385b65a`
- Coding artifact SHA-256: `7bee5d63d6f938f1d855976b2bda7bd729d2dec5cf875434b220e50c4445b9dd`
- Private summary receipt SHA-256: `a0cae49712dd8101b00ad51fc793197c534036eb39e490ce52438cfcc0315098`

There are 62 original records, 20 readable INCLUDED records and 42 declared
exclusions (star-only). All 20 included source date strings remain unchanged.
I04 has one candidate in a record with pending; I05 has three candidate spans
in two records, with 18 other records pending. I02/I07/I08 have no candidate,
not evidence of absence. Candidates remain `RULE_PROPOSAL_ONLY`; all report
annotation arrays are empty. These counts are diagnostic coverage, not accuracy,
customer prevalence, annual/category evidence or section completion.

This admission made zero provider calls and no live runtime writes. It did not
turn the captured shop-sweep subset into complete product history.

### Private production-mapped source version 3

The pure Dami mapper now validates digest/size/media type, bounded UTF-8 JSON,
exact review row type, safe shop/item IDs and actual comment pointers. It
preserves native cmtid, rating_star type, review_date, ctime, collected_at and
model_name metadata without replacing event time with acquisition. Conflicting
native IDs quarantine all affected rows; equal duplicates remain separate
located records, not unique people.

Three owner-boundary mapper tests and two existing SourcePackage adapter tests
passed on isolated Linux (5/5), and strict TypeScript passed. Actual source v3
retains the mapper's exact source bytes and the original v2 dependency. It
keeps 62 rows, 20 INCLUDED readable comments and original dates. Source v1/v2
remain unchanged; immediate v3 retry added zero mutations.

- Mapper SHA-256: `8533b496163822cc00be21bddad0ed1db9462f1de8c8bdba7c7907287507f94a`
- v3 content SHA-256: `95258666832aec9bedd7e7358e6dec21eaa4d515c88bbdfa3953ba207c361399`
- v3 manifest SHA-256: `5f22931c323f041b9f69c7b6994808696fbfab85badcabf679b7143d880d3da1`
- Mapping artifact SHA-256: `a654446f9c551f4816cc13df61b6c8d640c5272dd4fb5558d434907ee4ae3d12`
- Private receipt SHA-256: `28bf857b3ea2f3333240b11844bbab97aed35eb823fa47d77e1007f40b085360`

No new provider call, report annotation, annual/category admission or live
runtime write was made. This is transport mapping evidence, not source
authentication or completed Insight analysis.

### Source-bound declaration overlay from version 3

The separately versioned `literal-source-bound-v1` overlay was executed through
the production SourcePackage projection wrapper and retained by Foundation in
the isolated private acceptance store. It preserved original source v3 and the
proposal-only diagnostic artifact. Exact retry added zero mutations; replay
matched prepared bytes and the existing Located source verifier validated the
projected descriptor against original source pointers.

The adopted reading-scope gate admits one I04 declaration from one record and
three I05 declarations from two records. These are four source-bound candidate
readings across three records, not four completed analyses or unique people.
All 100 pending diagnostic items remain in the sidecar. Output is PARTIAL,
with no final ratios, authenticity, annual/category or final report approval.

- Policy SHA-256: `ba676c8e9e89f7ba0f05ec6157b82414524f6af48697900afe61ac7e0dc64f42`
- Overlay package content SHA-256: `4c0684cccf0e7bae3be0afd8aa661fb15f0dc842f55482dcb00befd529c93c06`
- Overlay manifest SHA-256: `ca558e9ca63bb97b95fc128591bacc52d5b84a23c7e9ac70e93626771d115f00`
- Overlay artifact SHA-256: `cbe5965a9aeacdb5ee5302e921fe7677d1c84346a47b6235187eedb49a1116a1`
- Private receipt SHA-256: `90b4f9ae3de6112af3af2f6b07ce215e9f58fab4bbfc51f53bc28341615ac33c`

Linux mapper/projection/SourcePackage owner-boundary proof passed 9/9 and strict
TypeScript passed. The policy is adopted; this exact implementation subsequently
received business ACCEPT in turn `01a0fd52-5299-78b2-9510-257b2636a5b9` and an
independent static code audit with no actionable finding. These reviews did not
read private raw data or rerun tests. No provider call or live-runtime write was
made. Automation run/UI wiring remains a separate integration step.
