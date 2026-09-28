# Task 051 — Content Studio Caption & Poster

Status: implemented on `feature/051-content-caption-poster`, a draft PR stacked on 050b (`feature/050b-content-ideas`). The C-decisions below are **provisional defaults** that the owner has not yet approved. They are batched for owner review.

Lane: Standard. Fake providers only; the first real calls are in 053.

Goal: Step 4 of Task 047 (blueprint screens 6–7). The OWNER:
- creates Caption and Poster packages for one or many Angles from one screen;
- sees each package with its versions, the brand-fact checklist and the references used.

This covers release criteria 5–7 in [`docs/content-studio-release.md`](../content-studio-release.md) §3.

Non-goals:
- AI edit proposals (052, deferred by the owner).
- Social publishing and video.
- Live provider calls, and anything on Fedora (053).
- Queues, background workers or a second runtime.

## 0. Decisions (provisional, owner review pending)

- **C1 — Campaign defaults.** “Lưu làm mặc định cho chiến dịch” appends an immutable **campaign defaults revision** (`flow_content_campaign_defaults`). This is not a campaign content revision, so it does not touch the Insight lock pin. A revision stores:
  - the Caption prompt, model, style and length;
  - the Poster prompt, model, ratio, ticked reference photos and the logo switch.
  
  The Inspector starts from the latest revision, or from built-in defaults.
- **C2 — Manual edit and versions.**
  - “Sửa tay” on a Caption appends a `MANUAL` Caption version.
  - “Khôi phục” appends a `RESTORE` version that copies an earlier version of the same part.
  - “Tạo lại” appends a `GENERATED` version.
  - Versions are append-only, and the highest version is the current one.
  - A Poster has no manual edit.
- **C3 — EXIF.** This is the owner decision still pending from the release doc §4. 051 sends stored reference bytes only to fake gateways. Stripping metadata (a derived reference with lineage) blocks 053, not 051.
- **C4 — Single-reference fallback.** A per-model `maxReferences` constant (`POSTER_MAX_REFERENCES`) is 1 for both image models until 053 verifies more.
  - Product photos come first, then the logo.
  - With one slot, only the first ticked product photo is sent.
  - The logo is then requested as a small text wordmark, never an invented symbol.
- **C5 — Package granularity.** One package per Angle per create action, coded `A1·1`, `A1·2`, …. The Caption and the Poster are separate attempts, and each can fail and be retried (`retryOf`) on its own. The Poster is generated from the current Caption version.
- **C6 — Purposes required.** An Angle needs at least one purpose tag before it can be packaged, so display resolution is always defined. The Angle must also not be deleted.
- **C7 — Brand-fact check warns, it does not block.** A failed row (“Sai hồ sơ”) is shown on the version, and the version is still stored.

## 1. Rules

### Display resolution (047 §5)

Resolution runs in this order:
1. Start from the brand revision's rules for each of the Angle's purposes. A custom tag uses its `displayLike`.
2. Where an element has more than one value, the highest wins: Luôn > Tùy > Ẩn.
3. Apply the package override.

The override works differently for each part:
- **Caption:** a 3-option segmented control per element (Luôn / Tùy / Ẩn).
  - Identity (name, tagline): Luôn and Tùy values are sent in `context.brand`. Luôn values are also listed in `context.brand.mention_required`.
  - Contact (hotline, website/fanpage, address): contact values are never sent to the model. Luôn values become the system footer (“Khối liên hệ”), which is appended after the post and is byte-identical for every version of the package. Tùy contact values are left out of the footer unless the OWNER switches them to Luôn.
  - The `web` rule covers both website and fanpage.
- **Poster:** a Switch per element. By default:
  - Luôn is on.
  - Tùy is on for identity (name, logo, tagline) and off for contact (047: contact is off Posters by default).
  - Ẩn is off.
  
  Only switched-on values reach the poster prompt.

Ẩn values never enter an input bundle unless the OWNER explicitly overrides them for this package.

### Style and length cascade

The cascade is: campaign defaults → batch Inspector (“Áp dụng cho tất cả”) → row (“Sửa riêng”).
- Style is Chuyên nghiệp (`PROFESSIONAL`) or Thân thiện (`FRIENDLY`).
- Length is Ngắn 80–120, Vừa 120–180 or Dài 180–250 words.
- Settings are pinned in the package, so existing Captions never change.

### Brand-fact check

The check is a pure function over the post (the footer is excluded). It produces one row per element: `name`, `tagline`, `hotline`, `website`, `fanpage`, `address` and `price`. Each row has one of these states:

| State | Label |
|---|---|
| `MATCH` | “✓ Đúng hồ sơ” |
| `NOT_MENTIONED` | “Không nhắc” |
| `HIDDEN` | “Ẩn theo mục đích” |
| `MISMATCH` | “Sai hồ sơ” |

It fixes these gaps from I73:
- hotline values that start with “(”;
- quoted taglines, with straight or curly quotes;
- unlabelled phone numbers: any phone-like number that is not the brand hotline is a mismatch.

Money amounts must equal a price of the campaign's pinned tiers. For example, `1.290.000đ`, `1,29 triệu` and `1290k` are all the same amount.

### Integrity (release criterion 6)

Each package artifact pins:
- the brand revision;
- the campaign version and its catalog items, with item versions and tier keys;
- the locked Insight version;
- the Angle and its purposes;
- the prompts (library version or freestyle text), models, style, length and ratio;
- the resolved display for each part;
- the footer;
- the reference media digests in send order.

Each generated version records its attempt, its input-bundle digest and its output digest. Reads re-verify all of them and fail closed.

## 2. Scope

- **Migration** `0028_flow_content_packages.sql`:
  - `flow_content_packages`
  - `flow_content_package_versions`
  - `flow_content_package_states`
  - `flow_content_campaign_defaults`
  
  All four are append-only, with sequential numbering and attempt-match triggers. For attempts, `target_type` is `content_caption` (text) or `content_poster` (image), and `target_id` is the package id.
- **Pure modules:**
  - `content-display-rules.ts` (resolver and footer);
  - `content-brand-fact-check.ts`;
  - `content-poster-prompt.ts` (poster layer v1 placeholders, layout profiles and the logo/reference instruction).
- **Service** `content-package-service.ts`: create (no AI), generate part, manual/restore version, delete/restore package, campaign defaults, list and read.
- **APIs:**
  - OWNER:
    - `POST /owner-api/content/campaigns/:id/packages`
    - `POST /owner-api/content/packages/:id/generate`
    - `POST /owner-api/content/packages/:id/versions`
    - `POST /owner-api/content/packages/:id/state`
    - `POST /owner-api/content/campaigns/:id/defaults`
  - Read:
    - `GET /api/content/campaigns/:id/packages` (list, Angles and defaults)
    - `GET /api/content/packages/:id` (detail)
    - `GET /api/content/packages/:id/posters/:version` (Poster preview bytes, served with safe preview headers)
- **UI:**
  - Screen 6, `#/content/:campaign/package/new?angles=A1,A2`: the Inspector, one row per Angle with “Sửa riêng”, and the call count (“3 Caption + 3 Poster”).
  - Screen 7, `#/content/:campaign/package/:code`: the Caption with its footer, Poster versions, the checklist, references used, “Sửa tay”, “Khôi phục”, “Tạo lại” and “Thử lại”.
  - Demo mode for both screens.

## 3. Acceptance

1. The display resolver matches every cell of the 047 §5 defaults and the highest-wins rule. Ẩn values are absent from every input bundle unless overridden.
2. The footer is built by the system and is byte-identical across regenerations, manual versions and restores.
3. The fact-check fixtures cover the three I73 gaps and the price check.
4. A batch of N Angles gives exactly N packages. Generating both parts makes exactly 2N attempts. A failure affects only its own attempt, and retry links to it with `retryOf`.
5. A package pins every input from §1. After a restart, packages show interrupted attempts and never partial versions.
6. Release criteria 5–7 can be demonstrated with fakes.
