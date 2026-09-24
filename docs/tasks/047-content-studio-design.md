# Task 047 — Content Studio design (B11–B13)

Status: DONE (design only)
Lane: Standard
Owner/worktree: `feature/047-content-studio-design`
Goal: Record the owner-approved design for bringing Content Studio into TDN Growth OS as B11–B13, precisely enough that Tasks 048+ can be implemented without re-interviewing the owner.
Non-goals: Any code, migration, dependency, API, provider call, deployment, or change to the running Fedora operator or the Windows Content Studio.
Dependencies: [ADR 0003](../adr/0003-content-studio-b11-b13.md), INTENT D26/D33, `DESIGN.md`.
Owned paths: `docs/tasks/047-content-studio-design.md`, `docs/adr/0003-content-studio-b11-b13.md`, `docs/frontend/content-studio-blueprint.html`, `docs/handoffs/047-content-studio-design.md`, `INTENT.md` (D33), `docs/STATUS.md` (Task 047 entry).
Acceptance: Owner reviews this brief and the blueprint in the draft PR.
Minimum verification: Documentation only; no build or test impact.
Escalate when: An implementation task needs a decision not recorded here.

The visual reference is [`docs/frontend/content-studio-blueprint.html`](../frontend/content-studio-blueprint.html) (11 screens, synthetic data). UI copy is Vietnamese. Component names follow NameThatUI terms: Segmented Control, Stepper, Popover, Overflow Menu (“⋯”), Switch, Multi-select chips, Inspector (right-hand panel).

## 1. Product decisions (owner-approved)

| Topic | Decision |
|---|---|
| Home | Top-level navigation: Thị trường · Sản phẩm · **Nội dung** · **Thương hiệu** · **Thư viện prompt**. |
| Flow | Brand & catalog → Campaign → 1 Insight → 2 Big Idea → 3 Angle (+ purposes) → 4 Caption & Poster. **No Draft step. No video.** |
| Brands | Many brands. Each has a profile (logo, tagline, hotline, website, fanpage, address) and a catalog. |
| Catalog | Products and services per brand: type (physical / service), description, real photos, and **tiers** (“Gói / phiên bản”, e.g. Go/Plus/Pro, 30/60 viên) each with price and inclusions. |
| Campaign | One brand, one or more catalog items (optionally specific tiers), own objective, own Insight. Optional link to a research product. |
| Insight | Customer, pain point, insight are per campaign; typed freely or pre-filled from a research product's locked STP (copied, then editable), then locked. |
| Branching | Several Big Ideas and Angles can be developed at once. Codes: Big Idea **A, B…**; Angle **A1, A2, B1…**; package **A1·1…**. Every item shows its lineage. |
| Purpose | Set on Angles, **multiple per Angle**. Suggested: Giáo dục, Giải trí, Bán hàng, Niềm tin, Tương tác. Users add their own tags via “+”; custom tags are saved (“Của bạn”) and mapped to a suggested purpose for brand-display defaults (“như Giải trí”). |
| Prompts | Every generation step and the package: **library prompt or freestyle** (savable to the library). **Two layers**: user writes only the creative part; the system adds locked inputs, safety/fact rules and output format. |
| AI editing | Per item “Sửa bằng AI” → proposal (text diff / side-by-side image) → apply or discard → new version. “Tạo lại từ đầu” lives inside the same panel. Manual edit (“Sửa tay”) is always available. |
| Brand display | Per element Luôn / Tùy / Ẩn by purpose; contact details added by the system as a Caption footer; contact off Posters by default. See §5. |
| Style & length | Campaign default → batch (“Áp dụng cho tất cả” + per-row “Sửa riêng”) → per package; existing Captions never change automatically. |
| AI usage | No daily limits. Each action shows its call count before running. No automatic retries. |
| Delete | “⋯ → Xóa” on every Big Idea, Angle, package, prompt; cascades are stated up front; restorable for **30 days** in “Đã xóa gần đây”. |
| Scope limits | No social publishing; OWNER only; Codex CLI not used; old Windows Content Studio retired after the owner tests this one; fresh data. |
| D26 | Applies only to campaigns linked to a research product (INTENT D33). |

## 2. Routes and screens

| # | Screen | Route |
|---|---|---|
| 1 | Brand catalog (products, services, tiers, photos) | `#/brands/:brand/products` |
| 2 | Campaign list (filter by brand; “Đã xóa gần đây”) | `#/content` |
| 3 | Insight (catalog items + tiers; free or from research; lock) | `#/content/:campaign/insight` |
| 4 | Big Idea (“Đang phát triển” / “Đề xuất khác”; create panel) | `#/content/:campaign/big-idea` |
| 5 | Angles grouped by Big Idea, purpose tags, “Tạo Caption & Poster cho N góc →” | `#/content/:campaign/angle` |
| 6 | Create Caption & Poster for one or many Angles | `#/content/:campaign/package/new?angles=A1,A2` |
| 7 | Package: Caption (+ system contact footer), Poster versions, brand-fact checklist, references used | `#/content/:campaign/package/:code` |
| 8 | Edit Caption with AI (diff, apply/discard, restore) | `…/package/:code?edit=caption` |
| 9 | Edit Poster with AI (side-by-side) | `…/package/:code?edit=poster` |
| 10 | Prompt Library (tabs per type; creative vs system layer; model; demo) | `#/prompts/:type/:prompt` |
| 11 | Brand profile + “Hiển thị thông tin theo mục đích” | `#/brands/:brand` |

Common layout: the existing dossier pattern (left navigation / content / right Inspector). The step indicator (4 steps) shows why a later step is unavailable. A top-bar tray (“Đang tạo · n”) lists running AI work across campaigns. The left panel on steps 3–4 is the branch list (grouped by Big Idea code, Angle rows with purpose dots, no connector lines).

**Create flow (single source of truth).** Screen 5's primary button opens screen 6 with the developed Angles preselected. Opening an Angle without a package from the branch list opens screen 6 with only that row. Screen 6 has one Inspector (“Áp dụng cho tất cả”: Caption prompt library/freestyle, style, length; Poster prompt library/freestyle, ratio, reference images; “Lưu làm mặc định cho chiến dịch”) and one row per Angle; “Sửa riêng” expands a row for its own style, length, reference images and brand display. Creating goes to screen 7.

**Selection.** Results show “Phát triển ý này” (not a checkbox). Developed items move to “Đang phát triển”; “Ngừng phát triển” is in the overflow menu.

## 3. Domain model (logical; tables prefixed `content_`)

- **Brand**, **BrandRevision** (immutable: name, logo media, tagline, hotline, website, fanpage, address, display rules). Packages reference the exact revision.
- **CatalogItem** (brand, type physical/service, name, description), **CatalogTier** (name, price text, inclusions), **CatalogMedia** (artifact digest, default-for-poster flag). Revisioned like brands.
- **PurposeTag** (suggested set seeded; custom tags with `display_like` pointing to a suggested purpose).
- **Campaign** (brand, name, objective, optional research product workspace link, frozen B10 decision when linked, defaults: prompts per step, style, length, ratio, reference media), **CampaignItem** (catalog item + optional tier subset).
- **Insight** (versions; editable until locked; source: typed / copied from research with source reference).
- **BigIdea**, **Angle** (code, parent, state developing/other/deleted, purpose tags) with **ItemVersion** (text/JSON, origin generated / ai_edit / manual, prompt version or freestyle text hash, model, input-bundle SHA-256, status active/proposed).
- **Package** (angle, brand revision, catalog snapshot, resolved display rules, style, length, ratio, reference media) with **CaptionVersion** and **PosterVersion** (image artifact, parent version).
- **Prompt**, **PromptVersion** (type big_idea/angle/caption/poster, creative text, description, recommended model, demo input/output reference, system flag, archived).
- **AiAttempt** (kind generate/edit, target, model, prompt version, input-bundle hash, state running/succeeded/failed/interrupted, error code, timestamps, call count).
- **Tombstone** for soft delete with 30-day expiry and cascade record.

All writes go through the owning service; closed JSON Schemas with generated types; exact version checks on every mutation (a stale screen gets 409 and reloads).

## 4. Generation and AI rules

- **Input bundle** per call (no chat memory): the frozen upstream items (Insight, chosen Big Idea, Angle, purposes), campaign items/tiers, resolved brand elements, the creative prompt layer, and for edits the current version plus the instruction. Bundle hash stored with every version.
- **Attempt lifecycle:** write attempt `running` → call provider through the gateway → validate output schema (and for Captions the brand-fact check) → write version or proposal → close attempt. On startup, `running` attempts become `interrupted`. No automatic retry; the UI offers a manual retry.
- **Call count shown before running**, e.g. “2 × 2 Big Idea = 4 lượt AI”, “3 Caption + 3 Poster”.
- **Models.** Text: GPT-5.6 Sol, GPT-5.6 Luna, Gemini 3.5 Flash Low. Image: GPT Image 2, Gemini 3.1 Flash Image. Prompts carry a recommended model; the Inspector allows an override.
- **Caption length words**: Ngắn 80–120, Vừa 120–180, Dài 180–250. Style: Chuyên nghiệp / Thân thiện.
- **Brand-fact check** (ported from Content Studio I73, fixed): explicitly labelled brand claims must match the frozen brand revision; product prices/tier names must match the campaign items. Fix the known gaps before porting: hotline values starting with “(”, quoted taglines, unlabelled phone numbers. Shown as a checklist (“✓ Đúng hồ sơ”, “Không nhắc”, “Ẩn theo mục đích”).
- **Poster references:** logo and ticked product photos. If a model accepts only one reference, use the product photo first and ask for the logo as a small mark. Multi-reference support must be verified per model before relying on it.

## 5. Brand display rules

Elements: Identity (name, logo, tagline) and Contact (hotline, website/fanpage, address). Each element has **Luôn / Tùy / Ẩn** per purpose, stored in the brand revision. Defaults:

| Purpose | Name | Logo | Tagline | Hotline | Web/Fanpage | Address |
|---|---|---|---|---|---|---|
| Bán hàng | Luôn | Luôn | Tùy | Luôn | Luôn | Tùy |
| Niềm tin | Luôn | Luôn | Luôn | Tùy | Tùy | Ẩn |
| Giáo dục | Tùy | Luôn | Tùy | Ẩn | Tùy | Ẩn |
| Giải trí | Tùy | Luôn | Ẩn | Ẩn | Ẩn | Ẩn |
| Tương tác | Tùy | Luôn | Ẩn | Ẩn | Luôn (fanpage) | Ẩn |

Resolution: brand defaults → for multi-purpose Angles the **highest** level wins (Luôn > Tùy > Ẩn) → package override (Caption: 3-option Segmented Control; Poster: Switches). “Ẩn” values are not sent to the model. “Luôn” contact values are appended by the system as a fixed footer (“Khối liên hệ”) and are not editable by AI. Contact details are off Posters by default (image models misrender digits and diacritics).

## 6. States to design and test in each implementation task

Empty (no brand, no catalog item, no campaign, no Big Idea…), running (per row and in the tray), failed (safe Vietnamese message + manual retry), interrupted after restart, stale (409 → reload keeping the user's unsaved input), locked prerequisites (step indicator explains), deleted/restorable, OWNER locked (read-only with unlock guidance), demo/synthetic mode clearly marked.

## 7. Reuse inventory from Content Studio (`tdn-research-pipeline`, I73)

- Prompt templates: `docs/templates/content-studio-big-idea-v3.1.md`, `content-studio-angle-v3.md`, `content-studio-social-post-v3.md` (basis for the Caption creative layer), `poster-master-prompt-v2.md` — split each into creative vs system layers; they become read-only “Hệ thống” library prompts.
- Brand-fact cue lexicon and canonicalizers: `pipeline/content-automation-social-post-jobs-contract.mjs` (with the fixes in §4).
- Poster prompt assembly: `pipeline/content-studio/social-content-package-prompt.mjs`; PNG validation `pipeline/content-automation-poster-png.mjs`; upload inspection `pipeline/content-studio/logo-asset-inspect.mjs`.
- CLIProxy calls: `pipeline/content-automation-client.mjs`, `pipeline/content-automation-poster-jobs-runners.mjs` (GPT Image 2 / Gemini inline references).
- Lessons: every attempt state needs a restart/recovery test; v3 recovery gaps found in I73 (acceptance staging and attempt-2 repair) must not be reproduced.

Do not reuse: Express routes, preflight/remote-origin/Access code, the separate database and its schema fingerprint, root rotation, file job stores, maintenance control, Windows scripts.

## 8. Proposed implementation tasks

| Task | Scope | Lane | Depends on |
|---|---|---|---|
| 048 | Migrations + services + read/OWNER APIs + UI for Brands (profile, display rules), Catalog (tiers, media), Prompt Library (no AI), Campaign list and create | Standard | 047 |
| 049 | AI plumbing: generalize `AiGateway` for creative text and images, CLIProxy adapter, attempt records and startup sweep, zero-quota model discovery, fake providers | Controlled (provider boundary) | 047 |
| 050 | Insight step (free/research copy, lock, D33) + Big Idea + Angle generation, branching codes, purposes, develop/stop, delete/restore | Standard | 048, 049 |
| 051 | Caption & Poster creation (single/batch), display-rule resolution, contact footer, brand-fact checklist, reference images, package view | Standard | 050 |
| 052 | AI edit proposals (diff / side-by-side), manual edit, versions and restore for items, Caption, Poster | Standard | 051 |
| 053 | Fedora live qualification: owner-authorized first real calls, multi-reference image check per model, operator runbook, retire-Windows checklist | Controlled | 052 |

Each task follows AGENTS.md: dedicated branch/worktree, focused tests, `npm run check`, draft PR, owner merge.
