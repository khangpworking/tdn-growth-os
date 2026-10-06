# Parallel source-to-report integration v1

2026-10-02. Working-tree implementation, not a live release.

## Outcome and ownership

Connect the existing Market method implementations and exact Shopee collector to
the automated research run. Root owns scope/API/service/renderer integration;
independent lanes own the market bridge and generic raw corpus. Reuse Foundation
retention and the existing automation report ledger, with no new schema/framework.

One paired synthetic run must produce separate Market and Insight web/PDF files,
with real execution of the production method/corpus paths. Synthetic receipts
must never enter the live operator or be described as provider collection.

## UI direction contract

Preserve the approved application and report design; no new visual identity.
Scope confirmation is an operating form: the user confirms exact listing URLs,
separately from discovery cards and peers. Add one optional multiline input in
the existing scope form and show those links in its confirmation dialog.
Typing does not trigger paid collection. Duplicate/invalid URLs block submission.
Keep existing keyboard dialog, pending, retry-key and OWNER behavior.

Reports are reading surfaces. I03 shows raw coverage and I17 source quotes; M03
and M08 show source inventories where arithmetic cannot be admitted. Use tables
and quotes, not charts suggesting a denominator or time series we do not have.
Retain the approved report template. Final design acceptance belongs to the
designated Claude report-review session and then the owner, separately from tests.

## Boundaries

- Optional `exactShopeeUrls` in the closed v1 scope request: maximum five distinct
  full HTTPS Shopee listing URLs. Legacy scope snapshots preserve absence.
- Exact Foundation collection v2 preserves raw bytes and identity. At most 500
  rows per listing; missing/partial/ambiguous capture is visible, not silently
  substituted with a similar product. Query period is not review date coverage.
- Generic corpus keeps all captured rows, invalid-rating text, conflicts and
  quarantined identity mismatches; author metadata is not projected. Free text
  may still contain personal information. Coding state remains NOT_CODED.
- Market packages preserve literal period/value/price information. Unknown
  measurement semantics, additivity, pack/variant and denominator stay unknown.
- Saved report replay verifies original dependencies without recollecting or
  recomputing under a newer mapping. No current method-version substitution.
- Runtime review collection requires `TDN_APIFY_TOKEN` and explicit positive
  `TDN_RESEARCH_SHOPEE_MAX_CHARGE_USD` (maximum 10000). This is an operational
  per-actor cap, not a new owner budget. Merely having a token does not enable it.
- No live runtime restart, migrations, provider calls or real business writes
  are part of this isolated checkpoint.

## Validation ownership

Corpus tests own row conservation/identity. Market bridge tests own source
admission and frozen replay. Service integration owns scope → retained collection
→ two outputs, failure isolation, no paid retry and corruption rejection. One
mounted form test owns confirmation and field delivery; no source-string checks.
Run focused proof, build and paired browser/PDF acceptance on isolated Fedora.
Run the full Linux check once after review corrections. No Windows execution.

## Remaining work

Located coding and codebook admission; verified Metric attachment; source scope
membership; synthesis/remaining method adapters; meaningful content acceptance
for the three real cases. Inventory/quotes are progress, not 30/30 completion.

## Next bounded slice: I04 source-reported actions

Business-session recommendation received 2026-10-02, turn
`01a0fc9a-7498-7181-bc94-3bdfddbb0338`. This records the next implementation
contract, not an implemented parser or completed section.

Question, separate from scope definition:

> Trong phần chữ đọc được của các review thuộc listing đã chọn trong snapshot này,
> nguồn nêu hành động nào đã thử, đã thực hiện, đã hoàn tất hoặc rõ ràng chưa thực
> hiện liên quan đến chọn, mua, nhận, dùng hoặc xử lý sản phẩm? Hành động được gán
> cho ai, và có phủ định, điều kiện, nghe kể hoặc phản chứng nào?

Use the whole readable selected-listing corpus, not only matched sentences.
Missing native IDs or invalid ratings do not exclude text. Exact equal native-ID
duplicates share one unit with every source reference. Conflicting versions stay
unresolved; wrong/unknown listings and unreadable text stay in coverage with
reasons. No text-only deduplication or verified-person claim.

Reuse the existing located method, source-package verification and I04 renderer.
Retain corpus bytes, the adopted profile/adoption authority, parser revision,
input declarations and exact UTF-16 spans. A package-bound entry point must not
fabricate a Metric envelope. Keep full negation, conditional and attribution
context; provenance is DECLARED, never self-issued HUMAN_REVIEWED authority.

The initial closed literal rules need review and pinning before execution:

| Synthetic text | Expected declaration |
| --- | --- |
| Tôi đã dùng sản phẩm. | ACTION_REPORTED / SELF_REPORTED |
| Tôi thử đặt mua nhưng không đặt được. | ATTEMPT_REPORTED; retain failure as qualifier/counterevidence |
| Tôi đã dùng hết hộp. | COMPLETION_REPORTED of using the box, not desired effect |
| Tôi chưa dùng sản phẩm. | NO_ACTION_EXPLICIT; preserve “chưa” |
| Bạn tôi nói đã dùng sản phẩm. | ACTION_REPORTED / OTHER_REPORTED |
| Nếu mua, tôi sẽ dùng thử. | NOT_REPORTED only after full-sentence rule review; retain condition/future |

Out-of-pattern or ambiguous text is pending adjudication, not NOT_REPORTED or
zero. No verified buyer, demographics, motive, efficacy, sentiment from rating,
action date from capture date, or cross-review journey inference. Located-record
count is not people/actions/prevalence. Raw corpus stays NOT_CODED; any derived
partial coding receipt must expose matched and unresolved coverage separately.

Validation owner: one parser/located-method boundary table for literal mappings,
negation/hearsay/conditional near misses, full membership and exact spans; one
service test for retained-source binding, frozen replay and paired report output.
No new provider calls or dependencies. Root owns shared persistence/render wiring;
an independent coding lane may own the parser and its focused tests. Linux only.
