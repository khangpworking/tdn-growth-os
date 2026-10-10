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

TikTok revisions download through the same builder-agnostic route (proven at render level),
but the TikTok panel has no saved-list UI to host an export link — TikTok UI link pending,
not claimed. Visual acceptance needs the independent judge pass over the attached PNGs/PDF.

## Remaining gates

Fresh Sol6.1/high final-head review; hosted full/generated/web/readiness; current-main merge
compatibility; matching-head merge + postmerge. No merge by author.
