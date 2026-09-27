# Content Studio — Caption & Poster release plan

Updated: 2026-09-25 · Design: [Task 047](tasks/047-content-studio-design.md), [ADR 0003](adr/0003-content-studio-b11-b13.md), INTENT D33.

**Release milestone:** the OWNER can go through the in-app flow **Brand & catalog → Campaign & Insight → Big Idea → Angle → Caption + Poster**, inside TDN Growth OS on Fedora. There is no Draft step, no video, and no social publishing. Brand management on its own (Task 048) is **not** the milestone.

## 1. Reconciliation with merged code (main `28ab319`)

The original Task 047 §8 plan put the whole content foundation in Task 048. Only the brand slice was built and merged. That row is now split:

| Planned item (047 §8, row 048) | State on main | Slice |
|---|---|---|
| Brands: profile, contact facts, Luôn/Tùy/Ẩn display rules, versions, UI | **Merged** (PR #44 design, PR #45 code; migration 0021) | 048 |
| Brand logo (upload, validation, private storage, preview) | **Merged** (PR #46; migration 0022) | 048b |
| Catalog: products/services per brand, description, tiers (price text, inclusions), product photos with Poster default | **Merged** (PR #46; migration 0022) | 048b |
| Prompt Library: two-layer prompts, system prompts ported from the old Content Studio templates, freestyle saved to the library (no AI) | In progress on `feature/048c-content-prompt-library` (library, layers, user prompts); the picker and “save freestyle to library” move to 050 | 048c / 050 |
| Campaign list and create (brand, catalog items + tiers, objective, optional research link) | In progress on `feature/048d-content-campaigns` (list with client-side brand filter, create/revise, delete with 30-day restore; campaign defaults move to 051) | 048d / 051 |
| Top navigation “Nội dung” and “Thư viện prompt” | In progress: “Thư viện prompt” on the 048c branch, “Nội dung” on the 048d branch | 048c / 048d |
| Custom purpose tags (“Của bạn”, mapped “như …”) | Not built (the five suggested purposes are fixed in display rules) | 050 |

Row 049 of 047 §8 is implemented locally and in review; rows 050–053 have not started.

## 2. Remaining slices

| Slice | Scope | Depends on | Status |
|---|---|---|---|
| 048b | Brand catalog and reference media: catalog items, tiers, product photos, brand logo, image validation, private storage, safe preview, read/OWNER APIs, UI ([brief](tasks/048b-content-catalog-media.md)) | 048 | **Merged** (PR #46, `28ab319`) |
| 048c | Prompt Library: user prompt records and versions, duplicate, delete with 30-day restore, read-only system prompts and system layers ported from the old templates, “Thư viện prompt” page ([brief](tasks/048c-content-prompt-library.md)) | 048 | **Draft PR, awaiting review** |
| 048d | Campaigns: list with brand filter, create (brand, catalog items + tier subset, objective, optional research product link), delete with 30-day restore, “Nội dung” navigation; campaign defaults moved to 051 ([brief](tasks/048d-content-campaigns.md)) | 048c | **Draft PR, awaiting review** |
| 049 | AI plumbing (Controlled): `CreativeAiGateway` for creative text and images beside the unchanged analysis `AiGateway`, CLIProxy adapter, synchronous attempt records (migration 0025) with an executor-only startup sweep to `interrupted`, single-executor lock, call-count preview, AI status route, fake providers for tests ([brief](tasks/049-content-ai-plumbing.md), [ADR 0004](adr/0004-content-ai-synchronous-attempts.md)) | 047 | **Implemented locally, in review** (uncommitted; no PR yet) |
| 050 | Insight (typed, or copied from a locked STP; lock; D26 freeze when linked), Big Idea and Angle generation with the library/freestyle prompt picker (freestyle savable to the library), branch codes A / A1, purpose tags incl. custom, develop/stop, soft delete + 30-day restore | 048c, 048d, 049 | Pending |
| 051 | Caption & Poster for one or many Angles: Inspector (“Áp dụng cho tất cả” / “Sửa riêng”), style and length cascade, display-rule resolution, system contact footer, brand-fact checklist, Poster references (product photo first), package view with versions | 050 | Pending |
| 052 | AI edit proposals (text diff, side-by-side image), manual edit, version restore | 051 | **AI edit deferred to a later release** (owner, 2026-09-25); manual edit and version handling to be reconciled when 051 is briefed |
| 053 | Fedora live qualification (Controlled): owner-authorized first real calls, per-model multi-reference check, operator runbook, retire-Windows checklist | 051 | Pending |

Each slice follows AGENTS.md: its own branch, a task brief, focused tests, `npm run check`, a draft PR, and an owner merge.

## 3. Caption & Poster release acceptance criteria

The release is accepted when all of these hold on the Fedora operator with fresh data:

1. **Brand & catalog.** The OWNER creates a brand with a logo and display rules, plus at least one product or service with tiers and product photos. Every save creates an immutable, verified version.
2. **Campaign.** The OWNER creates a campaign for one brand with one or more catalog items (optionally specific tiers) and an objective. Linking a research product is optional; when it is linked, starting B11 freezes the effective B10 `APPROVE` (D26/D33).
3. **Insight.** Customer, pain point and insight are typed freely or copied from a locked STP, then edited and locked.
4. **Big Idea and Angle.** Generation uses a library or freestyle creative prompt. The system layer adds locked inputs, fact rules and output format. The call count is shown before running. Several Big Ideas and Angles can be developed at once (codes A, A1, A1·1). Angles carry one or more purpose tags.
5. **Caption & Poster.** Created for one or many Angles from one screen. Style and length follow the cascade. Display rules resolve with the highest level winning; “Ẩn” values never reach the model. The contact footer is appended by the system. The brand-fact checklist is shown. The Poster uses the ticked product photos and logo as references (product photo first if only one reference is accepted).
6. **Integrity.** Every package references the exact brand revision, catalog snapshot and prompt versions it used. Every AI call is an attempt record; a restart turns `running` into `interrupted`; nothing retries automatically.
7. **Safety and scope.** OWNER only; no social publishing, no video, no daily AI limits. Uploaded media is validated and only served back through safe preview headers. Deletes are soft and restorable for 30 days.
8. **Qualification.** Linux CI green on the release commit. Owner-authorized live checks on Fedora (053) pass for each selected text and image model, including the multi-reference check. The runbook covers migrations 0021+ and the startup sweep.

## 4. What blocks the release today

- 048c awaiting review and owner merge (migration 0023 must be applied before an operator build containing it starts). 048d is a draft PR stacked on 048c (migration 0024 must be applied before an operator build containing it starts). 049 is implemented locally and in review (uncommitted; migration 0025 must be applied before an operator build containing it starts; no live provider call was made). 050, 051 and 053 are not started. 053 needs Controlled-lane authorization for live calls.
- **Open, to reconcile when 051 is briefed:** manual editing (“Sửa tay”) and version history/restore of Caption and Poster are part of the accepted design and must not silently disappear with the AI-edit deferral.
- **Owner decision pending:** before the first live Poster calls (051/053), should reference photos have their metadata (EXIF, including location) stripped? 048b stores uploaded bytes unchanged in private storage. Orchestrator recommendation, not approved: keep the private originals and create a derived, metadata-stripped, orientation-corrected reference with explicit lineage.
- **Open design point:** catalog items cannot be archived or deleted; the accepted design does not define it. Campaigns pin catalog item versions, so a later archive rule cannot corrupt them. Do not invent it without a decision.

## 5. Decisions recorded

- 2026-09-25 (owner): AI editing (052 proposals: text diff, side-by-side image) is deferred to a later release and does not gate the first Caption & Poster release.
- 2026-09-25 (owner): reference-image uploads accept PNG and JPEG only, and must contain complete, decodable image data. WebP is rejected until a vetted decoder is chosen; users are asked to re-export as JPEG or PNG.
