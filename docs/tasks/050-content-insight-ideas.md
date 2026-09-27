# Task 050 — Content Studio Insight, Big Idea and Angle

Status: **050a (Insight) implemented on `feature/050-content-insight-ideas`**, from `main` `ff20bbb` (049 merged, ADR 0004 Accepted). This brief is **provisional**. The owner delegated the run ("continue your goal") and defaults are marked *(provisional)*; §6 collects them for one owner review. 050b (Big Idea and Angle generation) is the next PR.
Lane: **Standard** for 050a. 050b uses the 049 Controlled path only through `CreativeAiGateway` with fake providers. No live provider call is made or authorized here (053).
Goal: step 1 of a campaign. The OWNER writes the Insight (customer, pain point, insight) or takes it from the linked product's locked STP, then locks it. If the campaign links a research product, the lock requires the effective B10 decision to be `APPROVE` and freezes that clearance into the lock (D26/D33). Big Idea and Angle (050b) will only start from a locked Insight.

Non-goals (050a): AI generation of any kind, prompt picker, Big Idea/Angle records, unlock of a locked Insight, catalog archive rules, deployment.

## 1. Split *(provisional)*

| Part | Scope | Migration |
|---|---|---|
| 050a | Insight revisions, Insight lock with B10 clearance, campaign pinning after lock, read/OWNER API, “Insight” screen | 0026 |
| 050b | Big Idea and Angle generation through `CreativeAiGateway` + 049 attempts, library/freestyle prompt picker (freestyle savable), codes A / A1 / A1·1, purpose tags incl. custom, develop/stop, soft delete + 30-day restore | 0027 |

Reason: 050a has no AI dependency and fixes the input every generation reads; landing it first keeps each PR reviewable.

## 2. Data (migration 0026)

- `flow_content_insight_revisions`: one row per version per campaign, sequential from 1 (trigger), immutable (no update/delete triggers), no insert after lock. Each row registers an artifact (`content-insight-artifact` schema) and the request hash for exact retry.
- `flow_content_insight_locks`: at most one per campaign, immutable. It must name the latest Insight version and the latest campaign version (triggers). When the campaign links a research product, the lock artifact (`content-insight-lock-artifact`) carries the B10 clearance: product workspace, locked STP, effective decision id/number, `APPROVE`.
- Merged migrations 0001–0025 are unchanged.

## 3. Rules

- **Content.** `customer` ≤ 500, `painPoint` ≤ 1000, `insight` ≤ 2000 characters, trimmed and non-empty. `source` is `TYPED` or `STP` with `lockedStpId`.
- **STP source.** Allowed only when the campaign links a research product and the id is that product's locked STP. The screen suggests customer = primary target segment label, insight = positioning; the pain point is always typed. Editing the suggested customer or insight turns the source back to `TYPED`; editing the pain point keeps `STP` *(provisional)*.
- **Revision.** `expectedVersion` must equal the latest version (0 for the first). Same request again → exact retry receipt, no new row. Same version with different content → 409. Revisions are refused after lock and on a deleted campaign.
- **Lock.** Names the Insight version and campaign version it saw; either drifting → 409. Deleted campaign → 409. Linked product without an effective B10 `APPROVE` → 409 with the Vietnamese reason shown on screen (`INSIGHT_GATE_NOT_APPROVED`). No link → no gate. A lock cannot be undone in 050a *(provisional; see §6 Q-I3)*.
- **Campaign pinning after lock** *(provisional)*. Catalog items (with tiers) and the research product link can no longer change; the name and objective can. The lock records its own `campaignVersion`, so later name/objective revisions never change what the lock referenced.
- **Integrity.** Reads verify every artifact hash; a committed artifact that cannot be reconstructed fails closed. The lock artifact restore needs the B10 reader chain (B7→B10).

## 4. API

- `GET /api/content/campaigns/:id/insight` → `ContentInsightDetailResponse`: campaign version and deleted flag, latest Insight, history (version, source kind, time), lock (with B10 clearance), gate (`required`, `ready`, product id, effective decision, reason), STP suggestion when the linked product's STP is locked. 404 for an unknown campaign.
- OWNER `POST /owner-api/content/campaigns/:id/insight/revisions` `{contractVersion, expectedVersion, insight}` → revision receipt.
- OWNER `POST /owner-api/content/campaigns/:id/insight/lock` `{contractVersion, insightVersion, campaignVersion}` → lock receipt.
- Same token/origin/preflight/body-size rules as the other OWNER content routes. Exact key sets are enforced.

## 5. Screen

`#/content/:campaignId/insight`, reached from the campaign detail's first step and from the list's progress column. It shows a four-step indicator (Insight · Big Idea · Góc nội dung · Caption & Poster), the form with three fields, “Dùng gợi ý STP”, save (new version), lock with confirmation, the B10 blocked reason, locked/deleted/empty states and the version history. Unsaved text is kept on 409 and connection errors. Demo mode keeps Insights in page memory; the demo gate reads the demo products' effective B10 decision.

## 6. Owner decisions (batched for the end of the run)

| # | Question | Provisional default |
|---|---|---|
| Q-I1 | Split 050 into 050a (Insight) and 050b (Big Idea/Angle)? | Yes |
| Q-I2 | After lock, which campaign fields are pinned? | Items/tiers and research link pinned; name and objective editable |
| Q-I3 | May the OWNER unlock an Insight (e.g. to fix a typo) once Big Ideas exist? | No unlock in 050a; revisit in 050b if needed |
| Q-I4 | STP suggestion mapping | Customer = primary target segment label; insight = positioning; pain point typed |

## 7. Tests (owned and run by GPT on Linux CI)

Schema head 25 → 26 and the two new tables in table lists; service (sequential versions, exact retry, conflicts, lock drift, deleted campaign, gate required/not required, B10 clearance restore, integrity failure); campaign guard (pinned fields refused after lock, name/objective allowed); API (routes, exact keys, 400/404/409 mapping, receipts); frontend data source (strict loader, draft/source rules, demo gate) and routing (`campaign-insight`). The `.generated.ts` files in this branch are hand-written and regenerated by CI's `contracts:generate`.
