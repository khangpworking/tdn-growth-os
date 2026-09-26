# Task 048d — Content Studio campaigns

Status: READY (owner approved P1–P4 on 2026-09-25; implementation starts after PR #47 merges)
Lane: Standard
Owner/worktree: `feature/048d-content-campaigns`, rebased onto `main` after the merge of #47 (048c).
Goal: “Nội dung” as designed in Task 047 §1–§3 and blueprint screen 2. The OWNER can list, filter, create and revise content campaigns and delete them with a 30-day restore. Each campaign has:
- one brand;
- one or more catalog items of that brand, each optionally limited to some of its tiers;
- a name and an objective;
- an optional link to a research product workspace.

No AI calls.
Non-goals:
- **Insight** (screen 3), the D26 freeze of the effective B10 `APPROVE` when a linked campaign starts B11, and the step contents. All belong to 050.
- **Campaign defaults** (prompts per step, style, length, ratio, reference media). See decision P1.
- **Progress counts** (“2 Big Idea · 4 góc · 3 gói”), which need 050/051 records.
- **Catalog archive/delete.** It is still undefined, and this slice does not invent it.
- The “Đang tạo · n” tray (049+), deployment.

Dependencies: Task 047 §1–§3 and §6, ADR 0003 decision 4, INTENT D26/D33, 048/048b (brands, catalog, shared editor), 048c (lifecycle pattern, “Thư viện prompt” navigation).
Owned paths:
- **Database:** `migrations/0024_flow_content_campaigns.sql`. The number is provisional; take the next free number from merged `main`.
- **Contracts:** `contracts/flow/content-campaign-{create,revision,lifecycle}-request.schema.json`, `contracts/flow/content-campaign-artifact.schema.json`, `contracts/api/owner-content-campaign-api.schema.json`, `contracts/api/content-api.schema.json` (campaign defs) and their generated files; `scripts/generate-foundation-contract.mjs` (list only).
- **Backend:** `src/modules/flow/content-campaign-service.ts`, `validation.ts`, `index.ts`; `src/api/content-api.ts`, and `src/api/operator-app.ts` only if wiring changes.
- **Frontend:** `frontend/src/{routing.ts,App.tsx,CampaignsPage.tsx,campaign-data-source.ts,styles.css}`.
- **Tests:** `tests/integration/content-campaign*.test.ts`, `frontend/tests/content-campaigns.test.ts`, and the schema-version assertions (23 → 24).
- **Docs:** `docs/STATUS.md`, `docs/content-studio-release.md`, this brief, `docs/handoffs/048d-content-campaigns.md`.

Minimum verification: `npm run check` green on Linux CI. Locally: all new tests pass, with no failures beyond the known Windows-only set. Codex pre-review of the branch before the independent review.
Escalate when:
- a change is needed outside the owned paths;
- an existing assertion must be weakened;
- the design needs catalog archive/delete, a D26 freeze, or campaign defaults.

## 0. Owner decisions (approved 2026-09-25)

The owner approved P1–P4 as written.

- **P1 — Move campaign defaults to 051.** The blueprint writes the defaults in one place only: “Lưu làm mặc định cho chiến dịch” on screen 6 (Caption & Poster create). Their values exist only there:
  - Caption style (Chuyên nghiệp / Thân thiện);
  - length (Ngắn / Vừa / Dài);
  - ratio (1:1, 4:5, 9:16, 16:9);
  - prompt per step, library or freestyle;
  - reference media.

  Storing them in 048d would fix a shape before 050/051 define how they are read. This matches how 048c moved the prompt picker to 050.
- **P2 — Include campaign delete and restore in 048d.** Screen 2 shows “Đã xóa gần đây”. The 048c lifecycle pattern applies unchanged: append-only DELETE/RESTORE, alternation, chronological dates and the 30-day window enforced by triggers, nothing physically deleted. In 048d nothing sits below a campaign, so there is no cascade yet. 050 adds the cascade statement (“Ẩn cả … bên dưới”) when Insight and later records exist.
- **P3 — Campaign items pin the exact catalog item version.** A campaign item records `{itemId, itemVersion, tierKeys?}`. `tierKeys` is omitted for “all tiers”, or is a non-empty unique subset validated against that version's tiers. Every item must belong to the campaign's brand. Items change only through a campaign revision, which may move an item to a newer catalog version. The item list is locked from the point 050 decides (Insight lock). 048d does not pre-empt that.
- **P4 — The research link is a verified reference only.** The optional `researchProductWorkspaceId` is checked through `ProductWorkspaceReader.readVerifiedProductWorkspace` when it is written. 048d records no B10 decision and freezes nothing. The link can change or be removed by revision until 050 defines when it locks.

## 1. Data (migration 0024)

Three immutable tables, whose triggers reject UPDATE and DELETE:
- **`flow_content_campaigns`:** `campaign_id` and `campaign_key` (unique); `brand_id` references `flow_content_brands` and is fixed at creation.
- **`flow_content_campaign_revisions`:** sequential versions with `request_sha256` and the artifact digest, following the brand and catalog pattern.
- **`flow_content_campaign_lifecycle`:** append-only `DELETE` / `RESTORE`. The migration copies 048c's alternation, chronology and 30-day triggers under campaign names.

Migrations 0001–0023 stay byte-identical. The v23→v24 upgrade is tested with 0023 pinned.

## 2. Campaign artifact

- **Identity:** `campaignId`, `campaignKey`, `brandId`, `version`.
- **Provenance:** `createdAt`, `requestSha256`.
- **Content:**
  - `name`: 1–120 characters, trimmed.
  - `objective`: 1–1000 characters.
  - `items`: 1–12 entries of `{itemId, itemVersion, tierKeys?}`, with unique `itemId`s. `tierKeys` has 1–8 unique keys, each present in that item version.
  - `researchProductWorkspaceId` (optional).

When writing, the service verifies:
- the brand;
- each referenced catalog item version and its brand;
- the tier keys;
- the product workspace.

A failed check writes nothing. Service rules follow the earlier content slices: exact retry does nothing new, drift or a stale `expectedVersion` returns 409, every read is verified, and an unpublished artifact is restored on exact retry. Revising a deleted campaign is a conflict.

## 3. APIs

- **Read:**
  - `GET /api/content/campaigns`: active and restorable campaigns of every brand (each read at its captured version). It takes no query string: the content read API rejects any `url.search`, as the other content reads do. The UI filters by brand and computes the per-brand counts on the client. (Amended during implementation; the proposal had `?brandId=` with server-side counts.)
  - `GET /api/content/campaigns/:campaignId`: the verified campaign, its history and lifecycle state, and the resolved item and tier names from the pinned catalog versions.
- **OWNER:**
  - `POST /owner-api/content/campaigns`: create.
  - `POST /owner-api/content/campaigns/:campaignId/revisions`, with `expectedVersion`.
  - `POST /owner-api/content/campaigns/:campaignId/lifecycle`, with `{contractVersion, action, expectedSequence}`.

  They follow the same token, origin, preflight and exact-key rules as the other content writes. Every write verifies the existing history first and writes nothing if verification fails.

## 4. UI

- **Top navigation:** add “Nội dung” in the Task 047 order, so it reads Thị trường · Nội dung · Thương hiệu · Thư viện prompt. A separate “Sản phẩm” entry is out of scope.
- **`#/content`** (blueprint screen 2):
  - brand filter with counts (“Tất cả”, one entry per brand);
  - a “Chiến dịch nội dung” table with the name, brand, items and tiers (e.g. “Tư vấn (Plus, Pro)”) and the update time. The progress column shows “Chưa có Insight” until 050.
  - “+ Tạo chiến dịch”;
  - an “Đã xóa gần đây” section with “Khôi phục”.
- **`#/content/new`** (create) and **`#/content/:campaign`** (detail and edit, using the shared editor):
  - pick a brand;
  - pick catalog items from that brand, with a tier Multi-select (chips) per item, where no selection means all tiers;
  - name and objective;
  - an optional “Liên kết sản phẩm nghiên cứu” picker.

  The detail page shows the four-step indicator with every step explained as unavailable (“Insight — có ở bước tiếp theo”). The “⋯” menu has Xóa, with an inline confirmation that states the 30-day window.
- **States (047 §6):**
  - empty: no brand, no catalog item, no campaign;
  - stale: 409 → reload while keeping the draft;
  - deleted/restorable;
  - OWNER locked: read-only;
  - demo mode: in-memory data, clearly marked.

## 5. Acceptance

1. Migration 0024 applies on top of 0023 and reruns idempotently; earlier migrations stay byte-identical. The lifecycle triggers enforce order, alternation, chronological dates and the 30-day window.
2. Create and revise verify the brand, catalog item versions, tiers and product workspace. A wrong brand, missing item, unknown tier, duplicate item or missing workspace is rejected with zero writes.
3. Exact retries do nothing new, drift gives 409, reads are verified, delete and restore work, and revising a deleted campaign is a conflict.
4. HTTP: closed bodies, boundary rules, zero writes on rejection, history verified before writing.
5. Frontend: routes, brand filter, validated reads, exact request bodies, conflict-safe drafts, locked while saving, delete and restore, no hard-coded origins.

## 6. Open points (not blocking 048d)

- `INTENT.md` has two headings numbered **D33**: line 92, the Content Studio decision cited by ADR 0003 and 047, and line 405, the OWNER B7 API/UI boundary. Renumbering needs an owner decision, and `INTENT.md` is outside this slice's owned paths.
- Catalog archive/delete is still undefined. Campaigns only reference catalog item versions, so a later archive rule cannot corrupt them.

## 7. Implementation notes

- **Division of work.** Claude wrote the plan; Codex implemented Tasks 1 and 3–5 from it; Claude wrote the contracts (Task 2) and these docs, reviewed each Codex diff against the plan, and committed.
- **Deviations from the plan:**
  - The campaign service detects "product workspace not found" through `FlowValidationError.details`, because `.message` carries the `Invalid flow input:` prefix.
  - The list read takes no query string (§3, amended).
  - `frontend/tests/content-prompts.test.ts` is outside the owned paths. Its demo-reset assertion was extended, not weakened, to include `campaigns: []` and `setDemoCampaigns`, because `seedDemoContent` now also seeds campaigns and “Đặt lại demo” resets them.
- **Evidence:** see `docs/handoffs/048d-content-campaigns.md`.
