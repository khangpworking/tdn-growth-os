# Content Studio — Caption & Poster release plan

Updated: 2026-09-29 · Design: [Task 047](tasks/047-content-studio-design.md), [ADR 0003](adr/0003-content-studio-b11-b13.md), INTENT D33.

**Release milestone:** the OWNER can go through the in-app flow **Brand & catalog → Campaign & Insight → Big Idea → Angle → Caption + Poster**, inside TDN Growth OS on Fedora. There is no Draft step, no video, and no social publishing. Brand management on its own (Task 048) is **not** the milestone.

## 1. State on main (`2b208cd`, 2026-09-29)

Every build slice of the release is merged. Task 053 live qualification passed on Fedora at `2b208cd` with six real provider calls (2026-09-29). The operator was stopped after the run, and Windows retirement is still pending.

| Slice | PR | Merge | Migrations |
|---|---|---|---|
| 047 design | #44 | `8a38500` | — |
| 048 brands | #45 | `76c21aa` | 0021 |
| 048b catalog and reference media | #46 (fix #48 `122e4f5`) | `28ab319` | 0022 |
| 048c prompt library (+ 048c1 owner templates, #49 `5c95acb`) | #47 | `f133f12` | 0023 |
| 048d campaigns | #50 | `cfb234a` | 0024 |
| 049 AI plumbing | #53 | `ff20bbb` | 0025 |
| 050a Insight | #56 | `1ad3592` | 0026 |
| 050b Big Idea and Angle | #57 | `38681bf` | 0027, 0028 |
| 051 Caption & Poster | #58 | `e8ca79a` | 0029 |

Migrations 0030–0033 on main belong to the research track, not Content Studio. PR #68 (merged `45b5147`, migration 0034) routes Gemini 3.5 Flash Low to `gemini-3.8-flash-high` and records the provider model on every attempt. PR #84 (merged `1a4ae1f`) precompiles the research report validators so the frontend runs under the operator CSP; PR #83 (merged `2b208cd`) sets release criterion 8 to one Poster reference. No tests, typechecks or builds run on Windows.

## 2. Remaining slices

| Slice | Scope | Depends on | Status |
|---|---|---|---|
| 048b | Brand catalog and reference media: catalog items, tiers, product photos, brand logo, image validation, private storage, safe preview, read/OWNER APIs, UI ([brief](tasks/048b-content-catalog-media.md)) | 048 | **Merged** (PR #46, `28ab319`) |
| 048c | Prompt Library: user prompt records and versions, duplicate, delete with 30-day restore, read-only system prompts and system layers ported from the old templates, “Thư viện prompt” page ([brief](tasks/048c-content-prompt-library.md)) | 048 | **Merged** (PR #47, `f133f12`; 048c1 PR #49) |
| 048d | Campaigns: list with brand filter, create (brand, catalog items + tier subset, objective, optional research product link), delete with 30-day restore, “Nội dung” navigation; campaign defaults moved to 051 ([brief](tasks/048d-content-campaigns.md)) | 048c | **Merged** (PR #50, `cfb234a`) |
| 049 | AI plumbing (Controlled): `CreativeAiGateway` for creative text and images beside the unchanged analysis `AiGateway`, CLIProxy adapter, synchronous attempt records (migration 0025) with an executor-only startup sweep to `interrupted`, single-executor lock, call-count preview, AI status route, fake providers for tests ([brief](tasks/049-content-ai-plumbing.md), [ADR 0004](adr/0004-content-ai-synchronous-attempts.md)) | 047 | **Merged** (PR #53, `ff20bbb`); ADR 0004 Accepted 2026-09-28; not deployed |
| 050 | Insight (typed, or copied from a locked STP; lock; D26 freeze when linked), Big Idea and Angle generation with the library/freestyle prompt picker (freestyle savable to the library), branch codes A / A1, purpose tags incl. custom, develop/stop, soft delete + 30-day restore ([brief](tasks/050-content-insight-ideas.md)) | 048c, 048d, 049 | **Merged**: 050a PR #56 `1ad3592` (0026), 050b PR #57 `38681bf` (0027, 0028) |
| 051 | Caption & Poster for one or many Angles: Inspector (“Áp dụng cho tất cả” / “Sửa riêng”), style and length cascade, display-rule resolution, system contact footer, brand-fact checklist, Poster references (product photo first), package view with versions | 050 | **Merged** (PR #58, `e8ca79a`; 0029); manual edit and version restore included; C1–C7 approved by the owner 2026-09-29 ([brief](tasks/051-content-caption-poster.md) §0) |
| 052 | AI edit proposals (text diff, side-by-side image), manual edit, version restore | 051 | **AI edit deferred to a later release** (owner, 2026-09-25); manual edit and version restore for Caption and Poster shipped in 051 |
| 053 | Fedora live qualification (Controlled): owner-authorized first real calls, single-reference Poster check per image model (multi-reference needs a code PR first), operator runbook, retire-Windows checklist | 051 | Brief in PR #81; first run stopped before any call (blank UI, fixed by PR #84). **Passed at `2b208cd` on 2026-09-29**: 6 real calls (Big Idea, Angle, and 2 Caption + Poster packages covering both image models), all succeeded; schema v34, integrity ok (brief §8) |

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
8. **Qualification.** Linux CI green on the release commit. Owner-authorized live checks on Fedora (053) pass for each selected text and image model. Posters send one reference (the first ticked product photo); a multi-reference check waits for a later code PR that raises `POSTER_MAX_REFERENCES` (owner, 2026-09-29). The runbook covers migrations 0021+ and the startup sweep.

## 4. What blocks the release today

- All build slices are merged (§1). PR #68 merged on 2026-09-29 as `45b5147` (migration 0034, schema v34; Linux CI green on that SHA). The first 053 run (authorized against `45b5147`, [PR #81 comment](https://github.com/khangpworking/tdn-growth-os/pull/81#issuecomment-5885702572)) stopped before any provider call: the UI was blank under the operator CSP. PR #84 fixed it. Run 2 at `2b208cd` passed on 2026-09-29 (brief §8). What remains is the owner's retire-Windows checklist (brief §6) after an agreed period of real use on Fedora.
- **Reconciled in 051:** manual editing (“Sửa tay”) and version history/restore of Caption and Poster are built in 051 without AI edit.
- **Decided (owner, 2026-09-29):** reference photos keep their original bytes, EXIF included; nothing is stripped or derived. Consequence: any metadata in an uploaded photo (for example GPS location) is sent to the image provider with Poster references. Owners who do not want that should remove it before uploading.
- **Open design point:** catalog items cannot be archived or deleted; the accepted design does not define it. Campaigns pin catalog item versions, so a later archive rule cannot corrupt them. Do not invent it without a decision.

## 5. Decisions recorded

- 2026-09-25 (owner): AI editing (052 proposals: text diff, side-by-side image) is deferred to a later release and does not gate the first Caption & Poster release.
- 2026-09-29 (owner): 051 decisions C1–C7 approved as written in the [051 brief](tasks/051-content-caption-poster.md) §0.
- 2026-09-29 (owner): reference photos are kept and sent as uploaded, EXIF included; no stripping or derived copy.
- 2026-09-25 (owner): reference-image uploads accept PNG and JPEG only, and must contain complete, decodable image data. WebP is rejected until a vetted decoder is chosen; users are asked to re-export as JPEG or PNG.
- 2026-09-29 (owner): the Fedora CLIProxy key lives in `~/.config/tdn-growth-os/cliproxy.env` and the owner token in its owner-token file (both mode 600, outside the repository). The operator is started through a subshell that loads the key file. This replaces key option (a) of the 053 brief.
- 2026-09-29 (owner): the 053 live run used 6 calls instead of 7. Creating a package runs Caption and Poster together, and posters take one reference photo. So the live check is 2 packages (GPT Image 2 and Gemini 3.1 Flash Image, each with one product photo and the logo).
