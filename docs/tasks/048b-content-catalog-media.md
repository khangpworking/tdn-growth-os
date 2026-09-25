# Task 048b — Brand catalog and reference media

Status: DONE (pending review)
Lane: Standard
Owner/worktree: `feature/048b-content-catalog-media` (base `main` `76c21aa`)
Goal: Second Content Studio slice (Task 047 row 048, reconciled in [`docs/content-studio-release.md`](../content-studio-release.md)). The OWNER keeps products and services per brand, with description, tiers (price text, inclusions) and real product photos, plus the brand logo. Every record is immutable, versioned and verified, and is reachable through the read/OWNER APIs and the React UI.
Non-goals: Campaigns, prompt library, custom purpose tags, AI generation or editing, Poster reference assembly, image resizing or metadata stripping, delete/restore of catalog items, a general media library, deployment.
Dependencies: Task 048 (brands), Task 047 §1–§3, ADR 0003.
Owned paths: `migrations/0022_flow_content_catalog_media.sql`; `contracts/flow/content-catalog-item-*.schema.json`, `contracts/flow/content-brand-{revision-request,artifact}.schema.json` (optional logo), `contracts/api/content-api.schema.json`, `contracts/api/owner-content-brand-api.schema.json`, `contracts/api/owner-content-catalog-api.schema.json` (+ generated); `scripts/generate-foundation-contract.mjs` (list only); `src/modules/flow/content-{image,artifacts,media-service,catalog-service,brand-service}.ts`, `validation.ts`, `index.ts`; `src/api/content-api.ts`, `src/api/owner-http.ts`; `frontend/src/{routing.ts,App.tsx,BrandsPage.tsx,CatalogPanel.tsx,MediaUpload.tsx,catalog-data-source.ts,content-data-source.ts,draft-editor.ts,brand-editor.ts,styles.css}`; tests `tests/unit/content-image.test.ts`, `tests/helpers/content-images.ts`, `tests/integration/content-{catalog,catalog-api,brand,operator-app}.test.ts`, `frontend/tests/{content-catalog,brand-editor}.test.ts`; schema-version assertions 21 → 22 in `tests/integration/{sqlite-foundation,source-package-intake,shopee-file-research}.test.ts`; docs listed in the handoff.
Minimum verification: `npm run check` green on Linux CI; locally, all new tests pass and there are no failures beyond the known Windows-only set.
Escalate when: a change is needed outside the owned paths, or an existing assertion must be weakened.

## 1. Data

- Migration 0022 adds three tables, all immutable (triggers reject UPDATE and DELETE):
  - `flow_content_media`: brand-scoped reference images. Primary key `(brand_id, media_kind, media_sha256)`; kind `LOGO | PHOTO`; type PNG/JPEG/WebP; width, height and byte size checked by the database.
  - `flow_content_catalog_items`: `(brand_id, item_key)` is unique.
  - `flow_content_catalog_item_revisions`: sequential versions, following the brand pattern.
- Image bytes live in the existing private content-addressed store. They have an `artifact_manifests` row with the image media type, like every other artifact. Nothing is public; bytes are only served back through the verified preview route below.
- A catalog item artifact holds `itemType` (PHYSICAL/SERVICE), `name`, an optional `description`, and:
  - up to 8 `tiers`: a stable `tierKey` (for campaigns to reference later), `name`, optional `priceText`, and up to 12 `inclusions`;
  - up to 12 `photos`, each with a `mediaSha256` and a `posterDefault` flag.

  Photos must be registered `PHOTO` media of the same brand.
- A brand revision may carry `logoMediaSha256`. It must be a registered `LOGO` of that brand and is checked on every read. A logo can only be set on a revision, because media belongs to an existing brand.

## 2. Image validation

`src/modules/flow/content-image.ts` ports the original Content Studio PNG logo inspector (chunk CRCs, IHDR rules, full inflate and filter-byte check) and adds structural JPEG and WebP parsing:

- **Accepted:** PNG, JPEG (baseline and progressive) and WebP (lossy, lossless, extended still).
- **Rejected with a reason code:**
  - SVG, GIF, HEIC or AVIF: `unsupported_format`;
  - animation (APNG or animated WebP): `animated`;
  - arithmetic, lossless or hierarchical JPEG: `unsupported_format`;
  - unknown critical PNG chunks, or any structural damage: `invalid`;
  - data after the image ends, such as motion-photo trailers: `trailing_data`;
  - a declared type that doesn't match the bytes: `type_mismatch`.
- **Limits:**
  - Logo: 2 MiB (as in the blueprint). Photo: 8 MiB.
  - Each edge from 64 to 8192 px; at most 50 MP.
  - Decompressed PNG data at most 64 MiB.

Uploaded bytes are stored unchanged. Stripping metadata (EXIF, including location) before images are sent to image models is an owner decision recorded in the release plan.

## 3. APIs

Read endpoints (query-only; every row verified):

- `GET /api/content/brands/:brandId/catalog`: each item is read at the version captured by the list query.
- `GET /api/content/brands/:brandId/catalog/:itemId`: the item with its verified history. Returns 404 if the item belongs to another brand.
- `GET /api/content/brands/:brandId/media/:sha256`: serves only media registered to that brand. Digest, manifest and structure are re-verified on every request. Response headers:
  - `X-Content-Type-Options: nosniff`
  - `Content-Security-Policy: default-src 'none'; sandbox`
  - `Content-Disposition: inline`
  - `Cross-Origin-Resource-Policy: same-origin`
  - `Cache-Control: private, max-age=31536000, immutable`

  Non-media artifacts are never served.
- Brand detail now includes `logoMediaSha256` when set.

OWNER endpoints use the same token, origin and preflight rules as Task 048:

- `POST …/brands/:brandId/media/logo` and `…/media/photo` take the raw image body with its image `Content-Type`. They return a receipt: 201 when new, 200 on an exact retry. Rejections return `400` with `error.reason`.
- `POST …/brands/:brandId/catalog` and `…/catalog/:itemId/revisions` take a 64 KiB JSON body with an exact key set. They return 201, 200 on an exact retry, 409 on drift or a stale version, 404 for an unknown brand or an item of another brand, and 400 for invalid input or unregistered photos.
- Brand revisions accept an optional `logoMediaSha256`.

Before anything is staged, a write verifies the brand history, the item history (for revisions) and the stored bytes of every referenced photo or logo. A failure returns `500 integrity_error` and writes nothing: no rows, no manifests, no files.

## 4. UI

- **Brand tabs.** A brand now has two tabs: “Hồ sơ thương hiệu” (profile) and “Sản phẩm & dịch vụ” (products & services). Routes are `#/brands/:id/products` and `#/brands/:id/products/:itemId`.
- **Catalog list.** Cards follow blueprint screen 1: type badge, name, tier names, photo count and version, plus a “+ Thêm” (add) button.
- **Catalog editor:**
  - type segmented control (Sản phẩm vật lý / Dịch vụ), name, general description;
  - tiers table (Gói / Giá / Bao gồm, one inclusion per line);
  - photo grid with a “Dùng cho Poster” (use for Poster) switch per photo (on by default for new uploads), plus remove;
  - version history.
- **Brand profile.** Adds a logo field: preview, upload or change, remove. The logo is saved with the next profile version. A new brand gets its logo after its first save.
- **Editing behaviour.** Both editors share `draft-editor.ts` (the Task 048 review fix, generalized):
  - unsaved input survives a 409 and is rebased with a notice and a discard choice;
  - fields are locked while a save is running;
  - uploads that finish late merge into the current draft.
- **Uploads.** Type and size are checked in the browser; server rejections are explained in Vietnamese.
- **Demo mode.** One synthetic catalog item. Images stay in memory as `data:` URLs, which the existing CSP (`img-src 'self' data:`) allows.

## 5. Acceptance

1. Migration 0022 applies on top of 0021, reruns idempotently, and 0001–0021 are byte-identical. Version assertions move from 21 to 22.
2. Media: valid images are registered once per brand and kind, with exact retry and no mutation on rejection. Tampered bytes fail on read.
3. Catalog: create, revise and read with exact retry, drift and stale conflicts, immutability, and verified history. Photos must be registered photos of the same brand.
4. Brand logo: only a registered logo of the same brand; verified on read and before a revision.
5. HTTP:
   - closed, verified read bodies;
   - safe preview headers; only registered media is served;
   - OWNER boundary rules and statuses as above;
   - zero writes on any rejection or integrity failure;
   - operator routing reaches all new paths.
6. Frontend:
   - routes;
   - validated reads and receipts;
   - exact request bodies and raw uploads;
   - Vietnamese rejection messages;
   - drafts survive conflicts;
   - fields locked while saving;
   - no hard-coded origins.

## 6. Verification (local Windows, Node 24.15.0 / npm 11.12.1)

- **Static checks.** Contracts regenerate with no diff. The strict backend typecheck (temporary tsconfig workaround), the frontend typecheck and the production build all pass.
- **New tests.** Image validator 4. Catalog and media services and migration 7. Catalog HTTP 6. Operator routing extended. Frontend: catalog 9 and brand-editor 1.
  - Five HTTP guarantees were mutation-checked: history verification, photo byte verification, preview CSP, registered-only preview, and the logo check.
- **Real encoder outputs pass the validator:** Pillow baseline, progressive and EXIF JPEG; RGB, RGBA, palette and grayscale PNG; lossy, lossless and alpha WebP; and Windows sample images.
- **Suites.** Frontend 79/79. Backend 320/336; the 16 failures are the same set as on `main` (Windows-only: POSIX permissions, signals and symlinks in Tasks 015/016/023/045, plus the operator tests' `frontend/dist` permission check). The operator content test passes with the scratch permission shim.
- **End to end.** A local operator ran on a disposable synthetic database, with the Windows shim, on port 18911.
  - Seeded through the real OWNER API: brand, logo, logo revision, two photos, two catalog items. The SVG was rejected with `unsupported_format`.
  - Through the UI: unlock, edit, save (item version 2), and a real logo upload from the file input followed by a brand save (version 3). An SVG was blocked with a Vietnamese message.
- **Screenshots** (headless Chrome, exact viewports): [`catalog-desktop.png`](../frontend/screenshots/task-048b/catalog-desktop.png) (1440), [`brand-logo-desktop.png`](../frontend/screenshots/task-048b/brand-logo-desktop.png) (1440), [`catalog-phone.png`](../frontend/screenshots/task-048b/catalog-phone.png) (390).
  - At 390 px only the tiers table scrolls, inside its own container.
  - The product photos and logo are synthetic images generated for this test.
