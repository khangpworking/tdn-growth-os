# Task 048 — Content brands (profile, facts, display rules)

Status: DONE (pending review)
Lane: Standard
Owner/worktree: `feature/048-content-brands` (stacked on `feature/047-content-studio-design`)
Goal: First vertical slice of Content Studio (Task 047): OWNER can create brands and revise their profile, contact facts and per-purpose display rules; everything is immutable, versioned and readable through verified read paths and the React UI.
Non-goals: Logo/photo upload and media storage, catalog items/tiers, prompt library, campaigns, custom purpose tags, any AI/provider call, deployment. (Follow-up slices: 048b catalog + media, 048c prompt library, 048d campaigns.)
Dependencies: Task 047 brief §1/§5, ADR 0003.
Owned paths: `migrations/0021_flow_content_brands.sql`; `contracts/flow/content-brand-*.schema.json` (+ generated); `contracts/api/content-api.schema.json`, `contracts/api/owner-content-brand-api.schema.json` (+ generated); `scripts/generate-foundation-contract.mjs` (list only); `src/modules/flow/content-brand-service.ts`, `validation.ts` (brand validators), `index.ts` (exports); `src/api/content-api.ts`, `src/api/owner-http.ts`, `src/api/operator-app.ts` (routing only); `frontend/src/routing.ts`, `frontend/src/content-data-source.ts`, `frontend/src/BrandsPage.tsx`, `frontend/src/App.tsx` (nav + route only), `frontend/src/styles.css`; tests `tests/integration/content-{brand,api,operator-app}.test.ts`, `frontend/tests/content-brands.test.ts`; existing schema-version assertions (20 → 21) in `tests/integration/{sqlite-foundation,source-package-intake,shopee-file-research}.test.ts`; `docs/STATUS.md`, this brief, `docs/handoffs/048-content-brands.md`.
Acceptance: see §4.
Minimum verification: `npm run check` green on Linux CI; locally all new tests pass and no new failures beyond the known Windows-only baseline.
Escalate when: a change is needed outside the owned paths, or an existing test must be weakened.

## 1. Data and contracts

- Physical tables follow the Flow prefix: `flow_content_brands(brand_id, brand_key UNIQUE, created_at)` and `flow_content_brand_revisions(brand_id, version, brand_name, request_sha256, brand_artifact_sha256, created_at)`; immutable (no UPDATE/DELETE triggers) and sequential versions, exactly like `flow_product_candidate_revisions`.
- Profile: `brandName` (1–120), optional `tagline` (≤240), `hotline` (≤64), `website` (≤512), `fanpage` (≤512), `address` (≤1000); trimmed-text pattern as elsewhere.
- Display rules: closed object with the five suggested purposes `sales`, `trust`, `education`, `entertainment`, `engagement`; each maps the six elements `name`, `logo`, `tagline`, `hotline`, `web`, `address` to `ALWAYS | OPTIONAL | HIDDEN`. All 30 values are required (no implicit defaults in storage). The UI pre-fills the Task 047 §5 defaults.
- Brand artifact (canonical JSON in the content-addressed store): `contractVersion, brandId, brandKey, version, profile, displayRules, createdAt, requestSha256`. The request digest is recomputed on read (create request for v1, revision request for v>1) exactly like product candidates.

## 2. Service and APIs

- `ContentBrandService.createBrand(request)`, `.reviseBrand(request)`, `.readBrand(brandId, version?)`: same identity, retry, drift (409) and integrity rules as `ProductCandidateService`.
- Read (query-only DB): `GET /api/content/brands` → `{ contractVersion, brands: [{ brandId, brandKey, version, brandName, updatedAt }] }` ordered by creation; `GET /api/content/brands/:brandId` → `{ contractVersion, brand: <verified latest artifact>, history: [{ version, brandName, createdAt }] }`. Every row is verified through the service before it is returned; failures give the existing safe `500 integrity_error`.
- OWNER: `POST /owner-api/content/brands` (body: `contractVersion, brandKey, profile, displayRules`) and `POST /owner-api/content/brands/:brandId/revisions` (body: `contractVersion, expectedVersion, profile, displayRules`). Same origin/token/content-type/body-limit/preflight rules as the existing OWNER API; 201 created, 200 exact retry, 409 drift, 404 unknown brand. Artifacts are staged per request and published only after commit (`RequestScopedArtifactStore`).
- Operator app: `/api/content…` goes to the content read app, `/owner-api/content…` to the content OWNER app (only when OWNER writes are enabled; otherwise the existing 403).

## 3. UI

- Top bar gains “Thương hiệu”. Routes `#/brands` and `#/brands/:brandId`.
- Brand list (name, version, updated) with “+ Thêm thương hiệu”; empty state explains what a brand is used for.
- Brand profile form (name, tagline, hotline, website, fanpage, address) and “Hiển thị thông tin theo mục đích”: a purpose Segmented Control and a Luôn / Tùy / Ẩn control per element (Nhận diện / Liên hệ groups), defaults pre-filled.
- Saving creates v1 or the next version with the version the user saw (stale → reload message). OWNER lock/unavailable states reuse the existing unlock and blocker copy. Demo mode keeps synthetic brands in memory only.

## 4. Acceptance

1. Migration 0021 applies on top of 0020, reruns idempotently, and 0001–0020 bytes are unchanged; version assertions move from 20 to 21.
2. Create/revise/read: exact retry deduplicates (no mutation), changed content under the same key or version → conflict, revisions are sequential, rows and artifacts are immutable, tampered artifact → integrity error.
3. Validation rejects unknown fields, missing display-rule entries, invalid enum values, untrimmed or oversize text.
4. HTTP: read endpoints return closed, verified bodies; OWNER endpoints enforce auth/origin/content-type/body size, return 201/200/409/404/400 as above, and create no rows on rejected requests; operator routing reaches both apps and keeps disabled-mode 403.
5. Frontend: routing parses both routes; data-source validates responses and maps OWNER failures to the existing failure kinds; default display rules equal Task 047 §5; the page renders list, empty, form and conflict states.

## 5. Verification (local Windows, Node 24.15.0 / npm 11.12.1)

- Contracts regenerate without diff; strict backend typecheck, frontend typecheck and production build pass.
- New tests: 6 service (incl. v20→v21 upgrade and 0001–0020 byte identity), 4 HTTP (including exact-retry restoration of an unpublished artifact, mutation-checked), 2 operator-routing, 7 frontend — all pass.
- Frontend suite 64/64. Backend suite 298/314: the 16 failures are the 14 pre-existing Windows-only failures (POSIX permissions, signals, symlinks in Tasks 015/016/023/045) plus the 2 new operator-routing tests, which fail only at the same `frontend/dist` permission check and pass with a scratch permission shim. Linux CI is the authoritative run.
- Demo UI exercised in a browser at 1440 px and 390 px: create, revise (version history), unchanged-state blocker, no horizontal overflow.
