# Exact Shopee URL intake v2

2026-10-02. Implemented prerequisite, not activated in automation or the operator.

## Why this path exists

The requested Thạch dừa listing is shop `78085196`, item `17678138164`.
The old v1 request selects revenue-ranked representatives from declared product
groups. An owner URL does not supply period revenue or grouping, and must not
invent either to enter that path. The v2 request accepts one to five explicit
owner URLs; it is not a claim that a provider verified those listings.

## Boundaries

- New canonical request/collection schemas use version `2.0.0` and
  `OWNER_EXACT_URL`. Actor and raw-page schemas reference unchanged v1 fields.
- Submitted URLs and order remain in the evidence. The transport URL uses exact
  decimal-string shop/item IDs. Tracking and variant query parameters are not
  sent to the review actor. These are listing-level reviews, not proof of the
  selected variant or reviews within a requested market-measurement period.
- Invalid authorities, credentials, fragments, missing IDs and duplicate listing
  aliases reject the request. No similar TikTok fallback or title-based identity.
- `saveExact`, `readExact`, and `existingExact` reuse the existing collection
  storage and verification. The v1 reader/service signatures and calcium filter
  remain separate. A v1 consumer rejects exact v2 collections.
- Raw rows, including malformed or unselected rows, remain unchanged. Intake is
  not review admission, deduplication, coding, sentiment or analytical completion.
- Exact saves freeze input before the existing database mutation mutex. Reordered
  or changed request bytes are not treated as the same retry. In-process exact
  saves serialize; this does not claim cross-process exactly-once execution.
- Domain request/packet and ingestion metadata use version 2. The shared JSON
  artifact registration contract remains version 1, allowing identical raw-page
  bytes to reuse existing manifests. No migration or second collection ledger.

## Collector reuse and cancellation

Transport now needs only platform, URL, shop ID and item ID, not ranking fields.
An optional caller signal reaches fetch, timeout composition and polling waits.
An already-cancelled call performs no request. A cancelled paid POST retains its
durable start intent and refuses automatic POST retry. A known run can resume by
GET using the same journal identity. Completed dataset pages survive cancellation
of a later page, with explicit partial-read and local-cancellation warnings.

Local cancellation does not stop or refund a remote actor. The provider status
and reported USD usage remain unchanged. The future automation adapter must
preserve these receipts, reconcile unknown paid outcomes, and distinguish local
cancellation from provider ABORTED. No remote abort endpoint was added.

Automation can opt into `retainReturnedPages` on the Apify collector. Before a
return, the existing owner-only run journal stores exact digest-addressed page
bytes and an `UNVERIFIED` receipt binding request SHA, run key, offsets and actor
metadata. This protects completed pages when Foundation subsequently rejects
metadata or a later page is cancelled; it does not admit a collection. The same
option applies to verified `existingRun` reads. One snapshot per run is allowed,
bounded by 25 pages of at most 8 MiB each. A further attempt stops before provider
work and requires manual reconciliation; there is no automatic replay or paid
retry. Interrupted page-only writes verify identical bytes, preserve differing
digest files, and reject corrupt collisions without overwrite. No migration or
second evidence ledger is added.

## Verification

Linux Node 24 generation/typecheck and the owning Shopee suite passed 27/27,
including the historical v1 fixture/filter/CLI cases. The new tests exercise
exact URL selection, concurrent exact save/replay, zero-write retry, immutable
raw bytes, safe rejection, v1/v2 separation and corruption rejection. The
collector's four cancellation timings passed. Restoring the old collector in
an isolated scratch checkout made the cancellation regression fail; the fixed
source was restored afterward. No Windows execution or provider call occurred.

## Next integration

Bind exact source selection to the frozen automation scope, retain each provider's
own request/cost receipt, create the generic raw-review corpus and connect located
Insight methods. The existing automation UI still selects discovery-card IDs;
this document does not claim that exact URLs are already runnable through it.
Paid collection and live report acceptance are separate from these synthetic tests.
