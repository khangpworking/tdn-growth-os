# Handoff — NEXT-SOURCE-PRIVACY (U18)

Updated: 2026-10-08
Worktree/branch: `khangpworking/ultimate-source-privacy`, fresh base `22af557d326c2523c884fee81a129eb4b1bf96f2` after reviewed PR172 merge. Previous source branch preserved. Current dispatch `ctx_e20b386298b2` only; Sol/high launcher preserved.

Completed:

- Verified the current fixed actor `zen-studio/shopee-product-reviews-scraper` public README: **“Author: display name, user ID, avatar URL, loyalty tier … region, and anonymous flag.”** Its output separately names `authorId`, `author` and `authorPortrait`. Binding is documented `authorId`, never username, review/comment ID, display name or profile URL. No live actor run/dataset was read. This establishes documented field meaning, not runtime availability or independently verified people.
- Explicit `createShopeePrivateIntake({salt: Uint8Array, keyId: public UUID})` copies at least32 salt bytes into a private closure. Fixed HMAC-SHA256 domain `tdn:shopee.vn:author:v1`; numeric safe positive IDs and canonical positive digit strings hash identically. Invalid/sentinel/unsafe IDs and missing fields are distinct null states. No hash-to-raw map or salt is returned, retained or logged. Salt and keyId must differ; reject a key UUID equal to salt encodings. Rotate the public keyId with the private salt; there is no cross-capture aggregation operation here.
- Actual fixture and fake-provider collectors sanitize metadata before returned pages, returned-page journals and CAS retention. Provider free status messages are suppressed in the new path before `run.json` publication. New receipt2.0.0 and journal identity bind the fixed profile and public keyId; old default receipts/captures remain unchanged. Only closed evidence fields survive, with source comments verbatim. Invalid evidence scalars are null; no name/profile/avatar/unknown metadata survives.
- Owning Foundation `collectExact(..., {privacy:true}, signal)` calls the configured collector, validates fixed profile and closed rows with AJV, and publishes collection3.0.0 using exact request2.0.0 and existing table/CAS/lineage. `saveExact`/`readExact` opt-in overloads preserve old signatures. Failed, aborted, timed-out, incomplete, pre-cancelled or actively cancelled operations publish no Foundation collection; cancellation during retention can leave sanitized unregistered CAS objects but no committed ingestion/collection.
- Declared `PrivateShopeeCollectionReader` exposes explicit sanitized collection and projection reads. Reads verify exact retained page/packet bytes, manifests, lineage, selection and offsets; no provider call, salt, rehash, runtime write or erased raw-byte reconstruction. Projection retains every row and page/row/text locator, distinguishes selected/other/unresolved/empty text, and counts source-reported author hashes within one Shopee/key capture only. Distinct exact contents do not become people.
- Missing-ID projection includes exact wording `nguồn không có mã người viết` and requirement `>=5 distinct contents, chưa xác minh là 5 người`. Mixed identity coverage stays partial; no complete person count or persona eligibility decision is invented. Quotes may contain names, IDs or other personal data; metadata sanitization is explicitly not full free-text anonymization.
- Canonical JSON Schema/AJV/generated types cover the three exact privacy pairs. No existing canonical schema, migration, dependency manifest, central analysis/API/report/corpus file or runtime configuration was changed.

Changed paths:

- `contracts/foundation/shopee-private-{collection,rows,projection}.{schema.json,generated.ts}` and exact generator registrations.
- `src/platform/collectors/{apify-shopee,shopee-private-intake}.ts`.
- `src/modules/foundation/{shopee-collection-service,shopee-private-contracts,shopee-private-projection}.ts`.
- `tests/{unit,integration}/shopee-private-intake.test.ts`.
- This handoff only; shared status/docs are coordinator-owned.

Evidence (commands, results, relevant revision):

- Public documentation: https://apify.com/zen-studio/shopee-product-reviews-scraper, retrieved2026-10-08; exact public page SHA256 `798f1078e4b52991129ec29d34346cf3980495061fc14f0026c3fe4c0578d1c6`. Public actor metadata: https://api.apify.com/v2/acts/zen-studio~shopee-product-reviews-scraper, version0.0/latest, modifiedAt2026-10-07T17:03:40.847Z. `latest` is mutable; actual capture run/build metadata remains separately retained. Public example personal identifiers/prose were not copied to Git.
- Node24.15.0/npm11.12, synthetic fixtures/fake transport only, concurrency2. Initial private suite9/9 passed: real collector→Foundation→projection; no-extra-call retry/read; salt/raw-identity leak negatives across outputs/journals/artifacts; missing/invalid/unverified mapping; corrupted bytes; historical v2 replay/version conflict; all terminal failure modes; active/pre/retention cancellation; verbatim quotation privacy limit.
- `npm run contracts:generate` exit0 twice; all six privacy schema/generated digests reproduced exactly. No tracked existing contract changed. `npm run typecheck` exit0. `git diff --check` clean.
- Broader affected historical collector/Foundation/corpus/exact-run/report checks are running at this canonical checkpoint. Final results, exact pushed SHA, PR and hosted full check are recorded below when available. No full local suite is running.

Unresolved:

- New privacy path is explicit source-owner opt-in; no runtime salt/config activation, live acceptance or old evidence rewrite. Current application/corpus readers continue their historical version branches. An Insight literal/application bridge is a separately allocated dependency after its literal phase; `review-corpus.ts` was inspected only and remains Insight-owned. P9/TikTok privacy is a separate next task; no field mapping or cross-platform join is guessed.
- Historical native Dami/S27 reviewer identity remains unverified; absence of an actual author field differs from an unverified mapping. This fixed documented actor profile does not manufacture native author IDs.
- Humanizer-vi was not invoked: new Vietnamese strings are exact deterministic Ultimate fallback wording, no AI interpretation. No claim is made that a local or application humanizer ran.
- U11/U26/U32 material decisions and paid U40 remain blocked. No new human adoption gate, person-count release, business caps or automatic paid/provider call.

Next action:

Explicit durable canonical lease release follows the committed generation/typecheck/private-suite checkpoint. Complete historical/source boundary checks, coordinator independent review and exact-head full hosted `npm run check`; commit/push draft PR, never merge. Any new canonical changes after release require reacquisition. Coordinator owns placement/integration grants and final merge.

Business decisions pending:

No change to existing U11/U26/U32/U40 decisions. At least32 salt bytes is a HMAC-SHA256 key-engineering minimum. The existing5×500 row budget,25 pages,8MiB JSON reader and20000-character comment profile are inherited engineering bounds, not new business sampling defaults. Oversized text fails explicitly rather than being truncated; E4 distinct-content disclosure does not decide persona eligibility.
