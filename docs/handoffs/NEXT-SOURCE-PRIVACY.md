# Handoff — NEXT-SOURCE-PRIVACY (U18)

Updated: 2026-10-08
Worktree/branch: `khangpworking/ultimate-source-privacy`, fresh base `22af557d326c2523c884fee81a129eb4b1bf96f2` after reviewed PR172 merge. Previous source branch preserved. Current dispatch `ctx_e20b386298b2` only; Sol/high launcher preserved.

Completed:

- Verified the current fixed actor `zen-studio/shopee-product-reviews-scraper` public README: **“Author: display name, user ID, avatar URL, loyalty tier … region, and anonymous flag.”** Its output separately names `authorId`, `author` and `authorPortrait`. Binding is documented `authorId`, never username, review/comment ID, display name or profile URL. No live actor run/dataset was read. This establishes documented field meaning, not runtime availability or independently verified people.
- Explicit `createShopeePrivateIntake({salt: Uint8Array, keyId: public UUID})` copies at least32 salt bytes into a private closure. Fixed HMAC-SHA256 domain `tdn:shopee.vn:author:v1`; numeric safe positive IDs and canonical positive digit strings hash identically. Invalid/sentinel/unsafe IDs and missing fields are distinct null states. No hash-to-raw map or salt is returned, retained or logged. Salt and keyId must differ; reject a key UUID equal to salt encodings. A domain-separated HMAC-SHA256 fixed-label key commitment binds the actual salt to journal/packet identity: same public keyId with changed salt fails before provider work or evidence reuse. Use a private randomly generated high-entropy salt, never a password; the opaque witness does not disclose key material. There is no cross-capture aggregation operation here.
- Actual fixture and fake-provider collectors sanitize metadata before returned pages, returned-page journals and CAS retention. Provider free status messages are suppressed in the new path before `run.json` publication. New receipt2.0.0 and journal identity bind the fixed profile and public keyId; old default receipts/captures remain unchanged. Only closed evidence fields survive, with source comments verbatim. Rating metadata preserves fieldPresent and ABSENT/MISSING/INVALID/VALID with safe finite numeric values; it never manufactures a raw rating field when absent. Other invalid evidence scalars are null; no name/profile/avatar/unknown metadata survives.
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
- Broader historical collector/Foundation/corpus/exact-run/report checks passed63/63 at the preliminary checkpoint; review corrections below affect the new opt-in only. No full local suite was run. Final exact SHA/PR and mandatory hosted full check follow below.

Unresolved:

- New privacy path is explicit source-owner opt-in; no runtime salt/config activation, live acceptance or old evidence rewrite. Current application/corpus readers continue their historical version branches. An Insight literal/application bridge is a separately allocated dependency after its literal phase; `review-corpus.ts` was inspected only and remains Insight-owned. P9/TikTok privacy is a separate next task; no field mapping or cross-platform join is guessed.
- Historical native Dami/S27 reviewer identity remains unverified; absence of an actual author field differs from an unverified mapping. This fixed documented actor profile does not manufacture native author IDs.
- Humanizer-vi was not invoked: new Vietnamese strings are exact deterministic Ultimate fallback wording, no AI interpretation. No claim is made that a local or application humanizer ran.
- U11/U26/U32 material decisions and paid U40 remain blocked. No new human adoption gate, person-count release, business caps or automatic paid/provider call.

Next action:

Explicit durable canonical lease release follows the committed generation/typecheck/private-suite checkpoint. Complete historical/source boundary checks, coordinator independent review and exact-head full hosted `npm run check`; commit/push draft PR, never merge. Any new canonical changes after release require reacquisition. Coordinator owns placement/integration grants and final merge.

Business decisions pending:

No change to existing U11/U26/U32/U40 decisions. At least32 salt bytes is a HMAC-SHA256 key-engineering minimum. The existing5×500 row budget,25 pages,8MiB JSON reader and20000-character comment profile are inherited engineering bounds, not new business sampling defaults. Oversized text fails explicitly rather than being truncated; E4 distinct-content disclosure does not decide persona eligibility.

## Coordinator review corrections and canonical release

Preliminary checkpoint `db083495d9e55057aa9e4fe18e54c490dcddd1c4` was not an approved completion. Coordinator review required rating-state preservation and actual salt continuity. The global canonical lease was explicitly reacquired for these exact corrections after the first durable checkpoint/release.

- New nested rating metadata distinguishes absent field, explicit null, invalid scalar/nested value and valid1–5 integer. Invalid safe numeric values (including0 and3.5) survive without arbitrary strings/nested personal data. Projection carries this same typed state; no absent raw rating field is invented.
- Opaque key commitment = `HMAC-SHA256(private salt, "tdn:shopee.vn:key-continuity:v1")`. This domain differs from author hashing; there are no author IDs in the commitment input. With a random high-entropy key it provides key continuity without key recovery. Journal and Foundation profile equality include it, so reusing the same public UUID with a changed salt cannot resume/reuse incompatible author hashes. No cross-key/platform aggregation API exists.
- Corrected private validation:12/12 passed, zero failures/skips, including same-UUID/different-salt journal+Foundation negatives, no extra provider calls, rating states and an incomplete paginated dataset retaining sanitized diagnostics while publishing no Foundation collection. All six corrected schema/generated digests reproduced exactly on repeat generation.

Canonical corrections are committed before explicit release; after release, further canonical edits require a new allocation. Central application/corpus integration remains the separately owned next dependency, not claimed complete by this source-owner roundtrip.

## Draft delivery

Draft PR: https://github.com/khangpworking/tdn-growth-os/pull/182.
Corrected implementation checkpoint: `0934fdd55234df9280ee7be323d65441dcbaffb3`; initial checkpoint `db083495d9e55057aa9e4fe18e54c490dcddd1c4` is explicitly preliminary. Final typecheck passed after all12 private tests were added. Canonical correction generation reproduced all six schema/generated files exactly. All shared canonical paths/generator were explicitly released through the current Orca dispatch at0934fdd; source-specific ownership continues only for independent review fixes. No code change follows this checkpoint in this handoff commit.

Full hosted Check on the independently reviewed final pushed head is pending and mandatory; a green focused suite is not a waived CI gate. Coordinator owns review and any merge. Application/corpus hooks require their own exact allocation, and P9 remains separate; no report or board readiness completion is claimed.
