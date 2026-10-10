# Handoff — retained Reader → PDF export (Lane A)

Base: `origin/main` `dabb73d`. Branch: `khangpworking/ultimate-retained-report-pdf`.
Lane A only; Lane B (SourceStatusBoard) untouched. No migration, manifest, model or helper changes.

## Delivered flow

Exact saved Reader revision → `GET reader-reports/:revisionId/pdf` → verified retained HTML
bytes (existing `readReaderReport`, no rebuild) → local Chromium print via the existing
`pdfExecutablePath` renderer → `application/pdf` download with the revision in the filename.
Unknown/invalid/cross-workspace/mutated revisions fail closed in the read (404/integrity);
missing renderer or render failure returns truthful 503. No new AI/collection/coding/
consumption/revision, no latest-fallback, no approval backdoor. Historical HTML bytes,
renderer27 refusals and old versions untouched.

## Changed paths

- `src/api/research-automation-api.ts`: `reader-reports/:id/pdf` GET beside `readerHtml`
  (allowlist + handler only).
- `frontend/src/research-automation/reader-report-api.ts`: `readerReportPdfUrl()` helper.
- `frontend/src/research-automation/ShopeeReportPanel.tsx`: “Tải PDF” link beside “Mở bản đọc”.
- `frontend/src/research-automation/ReaderReportPanel.tsx`: “Tải PDF” links beside the latest
  and history “Mở bản đọc” anchors — the single saved-list export surface for TikTok/Shopee
  revisions, surviving reload. TikTokReportPanel transient just-built links reverted (they
  duplicated this surface and vanished on reload).
- `tests/integration/research-automation-api.test.ts`: unknown→404, unconfigured→503,
  configured→200 PDF assertions in the existing reader journey (helper gains optional
  `pdfExecutablePath` only).
- `tests/integration/research-tiktok-reader.test.ts`: retained TikTok HTML prints to a real
  PDF without rebuild (skips without Chromium, repo precedent).

## Proof (actual)

- Route test 1/1 exit 0 (`lanea-route-test.log`, real Chromium render ~4s).
- TikTok reader file 5/5 exit 0, 0 skipped (`lanea-tiktok-test.log`).
- Backend + frontend typecheck exit 0; frontend build exit 0 with the PDF link in the bundle.
- Mounted Shopee journey PASS (`lanea-mounted.log`, `shopee-attempt1/`): confirm → propose
  (1 dispatch) → evidence → build/retry → reader tab → PDF download (177652 bytes, %PDF) →
  visual check (9 print pages, desktop/phone PNGs) → decide → retry → reload reopen;
  1/1/1 durable counts, collections unchanged, no page/Shopee endpoint errors.

## Explicit partial scope

TikTok revisions download through the same builder-agnostic route (proven at render level)
and now through the shared saved-list UI. Visual acceptance needs the independent judge pass
over the attached PNGs/PDF.

## Failed cycles — cause and recommendation

- TikTok mounted attempts 1–2 failed for two SRL-classified causes, both preserved raw:
  (1) my transient TikTok just-built “Mở bản đọc” link duplicated the existing saved-list link
  and broke the harness strict-mode locator; it also could not survive reload by design —
  removed, single export surface is now ReaderReportPanel;
  (2) Shopee panel admission fetches (`samples`, `context`) return 409 `invalid_state` on a
  TikTok-only run with no Shopee scope confirmation — pre-existing service semantics that
  predate Lane A (TikTok missing-admission conversely returns quiet 200-empty histories).
  These 409s are expected cross-family absence signals on single-family fixtures, not product
  regressions, and were never filtered into green: the TikTok journey asserts only
  TikTok/Reader endpoint cleanliness plus `pageerror` emptiness.
- Recommendation: keep 409 semantics unchanged in this lane; prove each family on its own
  admitted fixture (done: TikTok 179028-byte PDF download, Shopee 177652-byte PDF + 9 pages);
  any 409→404 admission-semantics redesign is an owner decision for a later package, not
  asserted here. No third same-blocker cycle without new evidence.

## Remaining gates

Fresh Sol6.1/high final-head review; hosted full/generated/web/readiness; current-main merge
compatibility; matching-head merge + postmerge. No merge by author.
