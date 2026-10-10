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

- Route test 1/1 exit 0 (`lanea-route-test.log`, real Chromium render ~4s): unknown→404,
  unconfigured→503, configured→200 with `%PDF-` bytes and revision filename.
- TikTok reader file 5/5 exit 0, 0 skipped (`lanea-tiktok-test.log`): retained TikTok HTML
  prints to a real PDF without rebuild.
- Backend + frontend typecheck exit 0; frontend builds exit 0 (`lanea-frontend-build.log`,
  lanea-frontend-build2.log).
- Mounted Shopee journey PASS (`lanea-mounted.log`, `shopee-attempt1/`): confirm → propose
  (1 dispatch) → evidence → build/retry → reader tab → PDF download (177652 bytes, %PDF) →
  visual check (9 print pages, desktop/phone PNGs) → decide → retry → reload reopen;
  1/1/1 durable counts, collections unchanged, `pageerror` empty, journey endpoints clean.
- Mounted TikTok journey PASS (`lanea-tiktok-mounted4.log`, `tiktok-attempt1/`): full owner
  flow with PDF download through the panel link (179028 bytes, %PDF), 1/1/1 durable counts,
  `pageerror` empty, TikTok/Reader journey endpoints clean. Its console-error record retains
  four Shopee-admission 409s (see failed cycles below) — not all-app-green.
- pdfinfo on both downloaded PDFs: `Báo cáo insight`, HeadlessChrome/Skia producer, tagged.

## Failed cycles — cause and recommendation (all raw preserved)

- TikTok mounted attempt 1 (`lanea-tiktok-mounted.log`): FAIL — my transient just-built
  “Mở bản đọc” link duplicated the existing saved-list link (strict-mode violation), and the
  global console-error assertion caught two Shopee-admission 409s.
- Attempt 2 (`lanea-tiktok-mounted2.log`): FAIL — exact panel link missing after reload:
  transient React state cannot survive reload by design. Transient links removed; the single
  export surface is now ReaderReportPanel latest/history (+ Shopee panel saved list).
- Attempt 3 (`lanea-tiktok-mounted3.log`): FAIL — the journey reopened successfully. The unchanged global console-error assertion failed on four Shopee-admission409 responses. Their URLs were retained.
- Attempt 4 (`lanea-tiktok-mounted4.log`): PASS with scoped TikTok/Reader endpoint assertions.
- 409 cause: Shopee panel admission reads (`samples`, `context`) against a TikTok-only run
  with no Shopee scope confirmation authentically refuse with `invalid_state` (409) —
  pre-existing service semantics predating Lane A (TikTok missing-admission conversely returns
  quiet 200-empty histories). Expected cross-family absence signals, not product regressions;
  the fourth run replaced the global console assertion with scoped owning endpoint checks.
  Console errors remain retained; that pass does not establish all-app error absence.
  Explicit409/invalid_state negative controls are prepared for fresh validation, not yet proven.
- Recommendation: keep 409 semantics unchanged in this lane; prove each family on its own
  admitted fixture; any 409→404 admission-semantics redesign is an owner decision for a later
  package. No third same-blocker cycle without new evidence.

## Pending validation (heavy slot required)

`9daed4f` saved-list source has NOT had fresh build/mounted after-reload PDF proof yet; prior
proof supports the unchanged API/render path only. Prepared (not executed): scoped panel/revision
PDF-link selectors, after-reload same-link download asserts, explicit 409 expected-negative
controls, `pageerror` retention — in `shopee-pdf-mounted-attempt1.mts` and
`tiktok-pdf-mounted-attempt1.mts` under `/tmp/ultimate-report-pdf-source-board-2026-10-10/`.

## Remaining gates

Fresh Sol6.1/high final-head review; hosted full/generated/web/readiness; current-main merge
compatibility; matching-head merge + postmerge. No merge by author.
