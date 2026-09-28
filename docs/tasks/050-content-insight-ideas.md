# Task 050 — Content Studio Insight, Big Idea and Angle

Status: **050a (Insight) implemented on `feature/050-content-insight-ideas`**, from `main` `ff20bbb` (049 merged, ADR 0004 Accepted). This brief is **provisional**. The owner delegated the run ("continue your goal") and defaults are marked *(provisional)*; §6 collects them for one owner review. **050b (Big Idea and Angle) implemented on `feature/050b-content-ideas`**, stacked on 050a (§8–§12).
Lane: **Standard** for 050a. 050b uses the 049 Controlled path only through `CreativeAiGateway` with fake providers. No live provider call is made or authorized here (053).
Goal: step 1 of a campaign. The OWNER writes the Insight (customer, pain point, insight) or takes it from the linked product's locked STP, then locks it. If the campaign links a research product, the lock requires the effective B10 decision to be `APPROVE` and freezes that clearance into the lock (D26/D33). Big Idea and Angle (050b) will only start from a locked Insight.

Non-goals (050a): AI generation of any kind, prompt picker, Big Idea/Angle records, unlock of a locked Insight, catalog archive rules, deployment.

## 1. Split *(provisional)*

| Part | Scope | Migration |
|---|---|---|
| 050a | Insight revisions, Insight lock with B10 clearance, campaign pinning after lock, read/OWNER API, “Insight” screen | 0026 |
| 050b | Big Idea and Angle generation through `CreativeAiGateway` + 049 attempts, library/freestyle prompt picker (freestyle savable), codes A / A1, purpose tags incl. custom, develop/stop, soft delete + 30-day restore | 0027 |

Reason: 050a has no AI dependency and fixes the input every generation reads; landing it first keeps each PR reviewable.

## 2. Data (migration 0026)

- `flow_content_insight_revisions`: one row per version per campaign, sequential from 1 (trigger), immutable (no update/delete triggers), no insert after lock. Each row registers an artifact (`content-insight-artifact` schema) and the request hash for exact retry.
- `flow_content_insight_locks`: at most one per campaign, immutable. It must name the latest Insight version and the latest campaign version (triggers). When the campaign links a research product, the lock artifact (`content-insight-lock-artifact`) carries the B10 clearance: product workspace, locked STP, effective decision id/number, `APPROVE`.
- Merged migrations 0001–0025 are unchanged.

## 3. Rules

- **Content.** `customer` ≤ 500, `painPoint` ≤ 1000, `insight` ≤ 2000 characters, trimmed and non-empty. `source` is `TYPED` or `STP` with `lockedStpId`.
- **STP source.** Allowed only when the campaign links a research product and the id is that product's locked STP. The screen pre-fills only the customer (primary target segment label and description); pain point and insight are always typed, and the positioning statement is shown read-only beside the Insight field as a reference. Editing the pre-filled customer turns the source back to `TYPED` *(Q-I4, agreed in review debate; owner confirmation pending)*.
- **Revision.** `expectedVersion` must equal the latest version (0 for the first). Same request again → exact retry receipt, no new row. Same version with different content → 409. Revisions are refused after lock and on a deleted campaign.
- **Lock.** Names the Insight version and campaign version it saw; either drifting → 409. Deleted campaign → 409. Linked product without an effective B10 `APPROVE` → 409 with the Vietnamese reason shown on screen (`INSIGHT_GATE_NOT_APPROVED`). No link → no gate. Lock also re-checks that an STP-sourced revision still belongs to the campaign's current research product; a relinked or unlinked campaign → 409, save a new revision first. A lock cannot be undone *(provisional; see §6 Q-I3)*.
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
| Q-I3 | May the OWNER unlock an Insight (e.g. to fix a typo) once Big Ideas exist? | No unlock for launch; recovery before any Big Idea is delete + recreate the campaign. Unlock-before-first-Big-Idea (with lock history and a fresh B10 check) is a post-launch follow-up |
| Q-I4 | STP suggestion mapping | Customer = primary target segment label (+ description); pain point and insight typed; positioning shown read-only for reference |

## 7. Tests (owned and run by GPT on Linux CI)

Schema head 25 → 26 and the two new tables in table lists; service (sequential versions, exact retry, conflicts, lock drift, deleted campaign, gate required/not required, B10 clearance restore, integrity failure); campaign guard (pinned fields refused after lock, name/objective allowed); API (routes, exact keys, 400/404/409 mapping, receipts); frontend data source (strict loader, draft/source rules, demo gate) and routing (`campaign-insight`). The `.generated.ts` files in this branch are hand-written and regenerated by CI's `contracts:generate`.

## 8. 050b data (migration 0027)

- `flow_content_ideas`: one immutable row per generated Big Idea or Angle. It holds the campaign, kind, parent Big Idea (Angles only), a per-parent sequential ordinal (trigger), the Insight version it was generated from (must equal the campaign's locked version, trigger), the 049 attempt id (must be a text attempt targeting this idea, trigger), the request id for exact retry, and the `content-idea-artifact` hash. The artifact holds the locked input sent to the model, the prompt choice (library id/version or freestyle text), the model and the parsed output.
- `flow_content_idea_states`: append-only state log per idea (sequence from 1, trigger). Each row is the full state: developing, deleted with time, purposes. Purposes are allowed only on Angles (trigger).
- `flow_content_purpose_tags`: immutable custom purpose tags `{label, displayLike}`; the label is unique by case- and space-folded key.
- 0001–0026 are unchanged. 0026 is frozen once 050a merges.

## 9. 050b rules

- **Generate.** Needs a live campaign and a locked Insight. An Angle needs a Big Idea parent in the same campaign that is being developed and not deleted. One request = one AI call through `CreativeAiGateway`, recorded as a 049 attempt (target `content_big_idea` / `content_angle`). The model output must match the kind's strict schema (Big Idea `{concept, expression}`, Angle `{name, concept}`); anything else fails the attempt and stores no idea. Same `requestId` again returns the stored idea without a new call. An exact retry also re-verifies the original AI output bytes, manifest and digest (review R4).
- **Restart recovery** (review). The idea id is derived from the request id (UUID v8 layout over SHA-256), so the 049 attempt ledger for that target is durable across restarts: a running attempt → 409; a succeeded attempt without an idea → integrity error; failed/interrupted attempts must form one retry chain and the new call is recorded with `retry_of` the chain head; a different input bundle under the same request id → 409 (start a new request). The in-memory in-flight map only guards same-process races. 051 package parts use stable targets and already chain retries.
- **Prompt.** A library prompt (system or OWNER, by id + version) or a freestyle text of at most 12 000 characters. A freestyle prompt can be saved to the library from the screen (048c prompt route). The locked input (campaign facts, linked items/tiers, locked Insight, earlier ideas of the same parent, the parent Big Idea for Angles) is sent as `LOCKED_INPUT_JSON`; A Big Idea's `{concept, expression}` is at most 1000 characters in total.
- **Codes.** Big Ideas are lettered A, B, …, Z, AA; Angles take the parent letter plus a number (A1, A2). Deleting never renumbers.
- **State.** `DEVELOP`, `STOP`, `DELETE`, `RESTORE` and `PURPOSES` (Angles, up to 6 values from the five built-in purposes or `tag:<id>`), each with `expectedSequence`; stale sequence → 409, same request again → exact retry. Delete is soft; restore is possible for 30 days.
- **Derived deletion (Q6, debate-agreed default).** Deleting a Big Idea writes no rows for its Angles; an Angle is *effectively deleted* while its own state or its Big Idea is deleted. The list flags such Angles `hiddenByParent` with the earliest of the two deadlines, and drops them once either deadline passes. Any state change on an Angle whose Big Idea is deleted → 409 (restore the Big Idea first). Restoring the Big Idea brings back only the Angles hidden solely by it; an Angle deleted on its own stays deleted.
- **Screen limits** *(provisional)*. At most 10 calls per prompt and 100 per run; the run tray shows progress, lists calls that failed on bad output and continues; it stops on AI unavailable, conflicts or a lost connection, and after a lost connection it resumes from the same call with the same request id.
- **No AI configured.** Without a gateway the OWNER API answers 503 and the screen shows “AI chưa được cấu hình trên máy chủ này”. No live call is made or authorized in 050b (053).

## 10. 050b API

- `GET /api/content/campaigns/:id/ideas` → `ContentIdeaListResponse`: campaign name/deleted, `insightLocked`, `insightVersion`, every idea with code, texts, state, purposes, model, prompt label, plus the custom purpose tags. 404 for an unknown campaign. Reads verify every artifact hash.
- OWNER `POST /owner-api/content/campaigns/:id/ideas` `{contractVersion, requestId, kind, parentIdeaId?, prompt, model}` → idea receipt.
- OWNER `POST /owner-api/content/ideas/:id/state` `{contractVersion, expectedSequence, action, purposes?}` → state receipt.
- OWNER `POST /owner-api/content/purpose-tags` `{contractVersion, label, displayLike}` → tag receipt (an existing label returns the existing tag).
- Generation runs outside the database mutation mutex because the provider call can be long; state and tag writes use it.

## 11. 050b screens

`#/content/:id/big-idea` and `#/content/:id/angle`, reached from the Insight step indicator (after lock), the campaign detail steps and the list's progress column. Each shows the prompt picker (library prompts with a count, freestyle with save), the model choice, the call count, the run tray and the idea cards (develop/stop, delete/restore, purposes with custom tags on Angles). The Angle page is bound to a Big Idea through the route (`#/content/:id/angle/:bigIdeaId`, review R6); if that Big Idea is no longer being developed the page says so and does not fall back to another one. Leaving the page cancels a running batch before its next call (R5). A deleted Big Idea card shows how many Angles it hides; hidden Angles show  generates deterministic ideas in page memory without any AI call.

## 12. 050b owner decisions *(provisional)*

| # | Question | Provisional default |
|---|---|---|
| Q-B1 | Calls per prompt / per run | 10 / 100 |
| Q-B2 | Built-in purposes | Giáo dục, Giải trí, Bán hàng, Tạo niềm tin, Tương tác |
| Q-B3 | Models offered and default | GPT-5.6 Luna (default), GPT-5.6 Sol, Gemini 3.5 Flash Low |
| Q-B4 | Third code level (A1·1) | Not in 050b |
| Q-B5 | Restore window | 30 days |
| Q6 | Deleting a Big Idea | Derived: its Angles are hidden, no rows written; restore reveals only Angles hidden solely by it; earliest deadline wins *(agreed with GPT-6 Astra in debate, not owner-approved)* |

## 13. 050b tests (owned and run by GPT on Linux CI)

Schema head 26 → 27 and the three new tables in table lists; service (generation with a fake gateway, strict output, exact retry, parent rules, codes, state machine, restore window, purposes only on Angles, tag uniqueness, integrity); API (routes, exact keys, body limits, 400/404/409/503 mapping, receipts); read route; frontend data source (strict loader, run plan/blockers, demo generator), routing (`campaign-ideas`, including `angle/:bigIdeaId`) and the updated campaign step texts. Review follow-ups: R4 exact-retry integrity, R5 unmount cancel, R6 route-bound parent, restart recovery (deterministic id, running → 409, retry_of chain, mismatched input → 409), Q6 derived deletion. The `.generated.ts` files are hand-written and regenerated by CI's `contracts:generate`.
