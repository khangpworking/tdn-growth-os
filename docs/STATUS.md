# Trạng thái hiện tại

## Research A43: wave 2 implementation, Linux verification pending

The A42 successor implements I01, I02, I04-I10 and I13 as bounded methods over
exact located declarations. It verifies retained source bytes and JSON-pointer
record text, preserves full context, distinguishes pending coding, and computes
corpus-only n/N when the frozen membership and coding are complete. I13 is
literal phrase inventory/counts only, without brand entity resolution or ranking.
Declared coding provenance does not become authenticated OWNER approval or
semantic truth merely because a quote resolves.

An optional `locatedInsightMethodsPath`, paired with `report-kit-v1`, connects
the new methods to existing report services and CLI. One retained bundle holds
the method output and exact descriptor/source/authority bytes, bound into report
semantic identity. Old requests omit the supplement and retain their behavior.
The initial web generation picker does not yet collect these coding inputs.

Three independent lanes covered the methods, counts and release audit. The
release audit then handed off to the section renderer. The audit found one
13-PR ancestry chain through #101, not independent changes ready for parallel
merge. Only migrations 0036 and 0037 differ from current main; the running
Fedora schema has not been inspected in this task. See
`docs/handoffs/research-a43-release-dependency-audit.md`.

Pending: final Linux checks, bounded rendered verification and independent
review. No Windows execution, merge, Fedora activation or provider call.

## Research A42: wave 1 implemented and Linux-verified, draft PR #101

The owner requested efficient implementation with the earliest usable web
release and confirmed Fedora localhost first, domain later. The detailed plan
is `docs/tasks/research-a42-live-report-delivery-plan.vi.md`: integrate the
existing research stack, expose retained reports, add web generation, and
deliver approved method families in parallel batches. Two owner-supplied HTML
designs have been received and mapped to a new opt-in report-kit renderer.
Three independent lanes have implemented the HTML presentation, OWNER web
generation from retained source packages, and M05/M06/M07/M09 source-bound
descriptive methods. Root integrated exact version selection, immutable
presentation dispatch, retained method evidence and content identity.
All 30 sections are visible, but missing inputs and unimplemented methods
remain explicit. The four-method descriptor is currently available through
the report request/CLI, not synthesized or selected by the initial web picker.
Linux check 36765488051 passed with 657 backend and 182 frontend tests,
typechecks, contract checks and build. Browser preview 36765488049 passed;
independent visual confirmation accepted the four scoped finish corrections.
Draft PR #101 remains dependent on #100. Live-input acceptance and the
remaining method waves are not complete. No Windows execution occurred.
GitHub main and open research PRs were inspected read-only on 2026-10-01.
No merge, runtime activation, production migration or provider call occurred.

## Research A41: scoped method configurations adopted 2026-10-01

Codex wrote the closure plan first and delegated the eight-file configuration
packet to GPT Luna xhigh. The packet under
`docs/research/method-configurations-v1/` contains 12 configuration groups,
47 classified parameters and a canonical 30-section matrix. Codex corrected
the integrated boundaries; Review marketing framework files read all eight
final files, verified their exact hashes and endorsed the scoped technical
methods with no remaining material blocker in that scope.

The owner accepted all four recommendations on 2026-10-01 and delegated routine
technical/business-method finalization to Codex and the business-method session.
The adoption is recorded in `docs/research/method-configurations-v1-adoption.md`:
source-bound market descriptions, located qualitative coding/corpus-only ratios,
optional retained AI candidate design, and deferral of advanced analyses.
This is scoped adoption, not code implementation, live-input readiness or
executed report evidence. No runtime or provider was activated. The exact A41
packet and A40 recipes remain unchanged; INTENT has a dated adoption note.
Read-only document, JSON, reference, hash and whitespace inspection passed;
no Windows tests/build/typecheck ran. Exact reviewed bytes and next steps are
recorded in `docs/handoffs/research-a41-method-configuration-closure.md`.

## Research A40: 30-section method specifications (drafting complete)

Owner requested plan-first method digitization, followed by Luna xhigh authoring.
The plan is in `docs/tasks/research-a40-thirty-section-method-specs.md`; the
business-method session found no material omission in the drafting approach.
All 30 concrete recipe drafts and a machine-readable method index are saved
under `docs/research/section-methods-v1/`. Luna xhigh authored the recipe bodies;
Codex integrated and reviewed them. The business-method session reviewed all
groups and final corrections for procedure shape and claim boundaries, not
owner approval of new decision policies. Static inspection confirms canonical
IDs/titles/order, an acyclic dependency graph and 30 matching authority-file
digests. No Windows tests/build/typecheck or runtime execution occurred.

Seven existing bounded submethods remain partial; 23 additional section recipes
are proposals. M10 separately lists its gate, evaluation template, unapproved
baseline example and blocked production forecast. AI candidates remain separate
from facts and user decisions. Twelve grouped policy/configuration topics remain
explicit in the historical proposal. A41's dated adoption resolves the four
recommended policy scopes; required run inputs and deferred advanced choices
still block only their respective operations. Production code,
operational catalog, report history and the existing preview are unchanged.

## Research A38/A39 integrated delivery (in progress)

Owner approved the 2026-09-30 acceleration revision. Two disjoint Claude lanes
implement prepared-report/A10 integration and assembly/HTML; Codex owns tests,
CI and review. The goal is one readable, retained partial report reusing the
seven bounded M02/M03/M04/M08-P4/M13/I03/I17 paths, with all 30 statuses explicit.
This supersedes the JSON-only A38 milestone, not historical replay guarantees.
After the Claude lanes reached quota, the owner explicitly authorized GPT to
take over the remaining production code. Exact selection, standard-reader
reopening, retained dependency bytes and the assembled HTML path were corrected.
The HTML keeps charts before expandable technical diagnostics. Independent
review findings for normalized-dataset binding and failed-attempt artifact
cleanup are corrected. Linux Check passed on code head `8ede53d`: 621/621
backend tests, 176/176 frontend tests, typechecks, contract generation and build.
Actual retained-report browser acceptance also passed at 1440 and 390 px,
including evidence navigation, downloads, disclosures, keyboard and contrast.
Draft PR #100 remains stacked on A37; nothing is merged or deployed. This is an
integrated partial-report delivery, not completion of all 30 business sections.
See `docs/handoffs/research-a38-integration-checkpoint.md` and the associated
design gate for exact evidence and remaining boundaries.

## Frontend CSP rule (PR #84, merged `1a4ae1f`) — read before any frontend change

The operator app serves the frontend with `script-src 'self'` (no `unsafe-eval`). Code that compiles JavaScript at runtime (`new Function`, `eval`, a browser-side Ajv `compile`/`addSchema`/`getSchema`) throws at import time and blanks every page, Content Studio included. Vite dev and preview send no CSP, so they do not show it. PR #84 moved `frontend/src/report-contract-validation.ts` to validators precompiled by `scripts/generate-report-validators.mjs` (Ajv standalone, run by `frontend:build`/`dev`/`typecheck`/`test`). To validate another schema in the browser, add it to that script and to `frontend/src/generated/report-validators.generated.d.ts`; never import `ajv` from `frontend/src`.

## Content AI provider model provenance (draft PR #68)

- Product model `gemini-3.5-flash-low` is routed to CLIProxy `gemini-3.8-flash-high`;
  the route table lives in `CREATIVE_MODEL_ROUTES` and only provider ids may change.
- Migration 0034 adds `flow_content_ai_attempts.provider_model`: required on every
  new attempt, immutable, NULL only for rows written before v34.
- Idea and GENERATED package-version artifacts carry `providerModel`, and it is part
  of their input-bundle digests. Replay uses the recorded value and requires the
  attempt row to match, so a later route change cannot reinterpret history.

## Research A22: deterministic M02 scope and method account (complete, merged PR #79)

- Upgrades the planning catalog to 0.2.0 only for M02 and emits one canonical
  method account from exact source-package bytes and normalized observations.
- Records scope, periods, source membership, locators, missing/zero and
  precision coverage, label coverage and the explicit UNKNOWN/WIDE policy.
- Binds the method artifact to the packet, semantic identity, immutable report
  version and exact-version readiness API. It adds no AI narrative, conclusion
  or human decision. Linux verification passed with 176/176 frontend tests,
  585/585 repository tests, contract generation, strict backend/frontend
  TypeScript, production build and research preview.

## Research A21: exact-version 30-section readiness matrix

- Adds a read-only exact-version route that replays the immutable report packet
  and projects every embedded catalog section with its real delivery state,
  prerequisites, blockers, claims, evidence pointers and trace identities.
- Adds an operator matrix under the selected report version with Market/Insight
  filters and progressive disclosure. It explicitly distinguishes catalog
  method metadata from deterministic output.
- This does not add a section method, chart, interpretation, provider call or
  human decision. Draft PR #78 is open; Linux verification passed with 176/176
  frontend tests, 583/583 repository tests, strict TypeScript, contract
  generation, production build and report preview.

## Research A20: review-target preparation and inspection UI

- Adds an explicit OWNER preparation form only after one report version and one
  retained interpretation are selected; intended use is required.
- Reads the returned A19 target through A18 before opening a stable exact-digest
  page that separates evidence, calculation, AI interpretation and human
  decision.
- The page remains visibly unapproved and has no decision or reviewer control.
- Draft PR #77 is open and mergeable. Final Linux verification passed with
  174/174 frontend tests, 583/583 repository tests, strict TypeScript, contract
  generation and the production build.

## Research A19: OWNER review-target creation API

- Adds one authenticated local OWNER route for retaining an exact A16 target
  from an explicitly selected report version, interpretation and intended use.
- Creation delegates to A17; exact retry is mutation-free and every receipt is
  backed by verified replay before it is returned.
- This prepares a review packet only. It adds no human decision, reviewer,
  authority, approval state, publication right, UI, migration or provider call.
- Draft PR #76 is open; Linux verification passed with 171/171 frontend and
  583/583 repository tests, strict TypeScript, contract generation, production
  build and report preview.

## Research A18: exact review-target read API

- Draft PR #75 is open on `feature/research-a18-review-target-read-api`.
- Adds one read-only route for an explicitly named A17 review-target digest.
- Every response replays the retained target through the exact A10 report and
  A13 interpretation readers before returning the canonical A16 contract.
- There is no list or latest route, review state, decision, reviewer, OWNER
  mutation, UI, provider call, publication right or deployment in this slice.
- Linux verification passed with 171/171 frontend and 583/583 repository tests,
  strict TypeScript, contract generation, production build and report preview.

## Research A17: immutable review-target ledger

- Persists one canonical A16 target from a closed exact report/version,
  interpretation and intended-use request; exact retry is mutation-free.
- Verified replay rebuilds the target through A10/A13 and checks the immutable
  row, active manifest and content-addressed bytes.
- Migration 0033 adds only the target ledger. No decision, reviewer, UI/API,
  provider call, publication right or deployment is included.
- Draft PR #74 is open; Linux CI passed on implementation head `ad6109f` with
  171/171 frontend and 583/583 repository tests plus report preview.

## Research A16: exact report review target

- Composes one deterministic internal-review target from an explicitly named
  A10 report version and explicitly named A13 interpretation run; never latest.
- Binds full source/scope membership, exact calculation and interpretation
  identities, exact item/claim inventory, intended use and the exact verified
  `report.html` file the future reviewer sees.
- The target is internal and unapproved. It adds no human decision, reviewer,
  publication right, UI/API, migration, model call, data write or deployment.
- Draft PR #73 is open; Linux CI passed on implementation head `f1bdcea` with
  171/171 frontend and 581/581 repository tests plus the report preview.

## Research A14: exact-version interpretation read API

- Draft PR #71 is open on `feature/research-a14-interpretation-read-api`; the
  implementation-head Linux check passed.
- Adds list/detail read routes for saved A13 interpretations under one explicit
  report ID and version; no route infers the latest report or interpretation.
- Returns only safe generation identity and user-visible evidence-bound content;
  prompt material, provider request data, usage telemetry and storage metadata
  stay private.
- Adds no report write, model call, human decision, UI, migration, methodology,
  provider collection or deployment.

## Research A13: immutable report interpretation ledger (merged)

- Merged through PR #70 at `b6d2c1e`; exact-head Linux check and report preview
  passed.
- Retains every validated A8 interpretation against one explicit A10 report
  version; different model runs never overwrite each other.
- Replays exact report evidence, prompt bytes, model/configuration, safe
  user-visible reasoning, citations, assumptions and limitations on every read.
- Exact retry is mutation-free; reused identity with changed bytes fails closed.
- A13 adds no provider call, human decision, API/UI, report-method change, live
  import or deployment. Every retained interpretation remains unapproved.

## Research A12: exact normalized observations in SQLite

- Merged through PR #69 at `613d7e0`; exact-head Linux check and report preview
  passed before merge.
- Materializes an explicitly selected report version's exact normalized input
  into immutable queryable source and observation rows keyed by its digest.
- Preserves missing versus zero, exact integer strings, precision, displayed
  values, labels and evidence locators; every origin remains bound to the exact
  report and source-package lineage.
- The content-addressed artifact remains authoritative and every verified read
  reconstructs the same canonical bytes. No implicit latest selection exists.
- No new section method, AI interpretation, human decision, API/UI, provider
  call, live import or deployment is included.

## Research A10: immutable report-version ledger (merged)

- Persists one exact verified source-backed report bundle as an immutable report
  version with explicit source and artifact membership.
- Version history is sequential and requires the exact previous semantic content
  ID. Reads always name a version; no implicit latest selection exists.
- Replay reopens the exact source package and workspace through their owning
  readers, reruns deterministic calculations and compares every retained byte.
- Layer 3 remains `NONE` and layer 4 remains `UNREVIEWED`; framework approval is
  not treated as report-content approval.
- Migration 0030 follows the merged Content Studio migrations 0028–0029 on
  current `main`. Exact-head Linux check and report preview passed.
- No provider/AI call, fifth section, live import, dashboard mutation or real
  business decision is included. Linux release verification is still pending.

## Task 050b — Big Idea và Góc nội dung

- Bước 2–3 của chiến dịch: từ Insight đã khóa, tạo Big Idea (A, B, …) rồi Góc nội dung (A1, A2, …) cho Big Idea đang phát triển. Mỗi ý là một lần gọi AI qua `CreativeAiGateway`, ghi lại thành attempt 049; chọn prompt thư viện hoặc prompt tự do (lưu được vào thư viện) và mô hình.
- Phát triển/ngừng, xóa mềm và khôi phục trong 30 ngày, gắn mục đích cho Góc (5 mục đích sẵn có và mục đích riêng). Giới hạn 10 lần gọi mỗi prompt, 100 mỗi lượt (mặc định tạm thời, chờ chủ dự án).
- Migration 0027 (`flow_content_ideas`, `flow_content_idea_states`, `flow_content_purpose_tags`); `GET /api/content/campaigns/:id/ideas`; OWNER `…/campaigns/:id/ideas`, `…/ideas/:id/state`, `…/purpose-tags`; màn hình `#/content/:id/big-idea` và `#/content/:id/angle`. Chưa cấu hình AI thì OWNER API trả 503. Không gọi provider thật (053) ([brief](tasks/050-content-insight-ideas.md) §8–§13).

## Task 050a — Insight của chiến dịch

- Bước 1 của chiến dịch: nhập Khách hàng mục tiêu, Nỗi đau, Insight hoặc lấy gợi ý từ STP đã khóa của sản phẩm nghiên cứu liên kết; mỗi lần lưu là một phiên bản bất biến, gửi lại trùng không tạo bản mới.
- Khóa Insight: nếu chiến dịch liên kết sản phẩm nghiên cứu thì phải có quyết định B10 hiện hành `APPROVE`; khóa ghi lại quyết định đó (D26/D33). Sau khóa, sản phẩm/gói và liên kết nghiên cứu của chiến dịch cố định; tên và mục tiêu vẫn sửa được (mặc định tạm thời, chờ chủ dự án).
- Migration 0026 (`flow_content_insight_revisions`, `flow_content_insight_locks`); `GET /api/content/campaigns/:id/insight` và OWNER `…/insight/revisions`, `…/insight/lock`; màn hình `#/content/:id/insight`. Không gọi AI. Big Idea và Góc nội dung ở 050b ([brief](tasks/050-content-insight-ideas.md)).

## Research A9: deterministic M03/M04 diagnostic charts (draft PR #65; not deployed)

- The accepted four-layer framework remains authoritative; this slice deepens
  only deterministic layer-two display.
- M03 now exposes same-period membership sensitivity from ALL to WIDE/CORE with
  exact deltas, removed rows and Result pointers. It is explicitly not growth.
- M04 now exposes within-scope group composition and top-shop-removal
  sensitivity. Overlapping scopes are not additive, and removal is not a
  forecast or recommendation.
- Every diagnostic links to its exact Result digest, pointer and row membership;
  missing labels or denominators stay blocked/partial rather than becoming zero.
- The automated-section count remains 4/30 (M02, M03, M04, M13). No provider/AI
  call, fifth method, migration, API, approval or live data import is included.
- Linux full check passed with 486/486 repository tests and the desktop/mobile
  visual preview passed with no page error. Windows tests/build/typecheck were
  not run by policy. Research A1–A9 are merged on `main`; deployment and live
  evidence intake remain separate work.

## Research A8: evidence-bound interpretation contract (draft PR #64; not deployed)

- Added closed request, untrusted-output and application-owned artifact
  contracts for the third report layer in ADR 0005.
- Interpretation is permitted only for verified partial-draft sections with
  deterministic claims. The exact A3 packet is replayed from its pinned result
  and catalog before use. Model output chooses claim IDs; application code
  copies exact citation values, pointers and limitations from that replayed packet.
- Numeric literals, decision/action, regulated-authority or invented-provenance
  language, unsupported claim IDs and blocked or method-only sections fail
  closed. Hypotheses remain labelled and require explicit assumptions. Hidden
  chain-of-thought is not stored.
- Interpretation meaning has a stable content digest separate from provider
  telemetry, run identity, render bytes and future human decisions.
- This is offline contract/validator work with synthetic fixtures. No provider
  call, migration, SQLite row, API/UI, human decision or new section method is
  included. Linux full check and preview passed on the verified implementation
  head; no Windows tests/build/typecheck were run.

## Research A7 — semantic report version boundary (local implementation)

- A4 private export now separates a deterministic meaning-bearing identity from
  renderer/export bytes and from human review state.
- `semantic-content.json` binds the exact verified source package/envelope,
  normalized input, calculation Result, packet, catalog, chart and every section
  identity/state. `review-state.json` remains separately `UNREVIEWED`; AI
  interpretation is explicitly absent.
- HTML exposes the content ID and links the exact workspace/export manifest.
  No additional section method, report conclusion or approval is claimed.
- No migration is added while 0030 remains sequenced after pending Content
  migrations 0026–0029. Durable SQLite report history, AI interpretation,
  human-review API, dashboard and production PDF remain incomplete.
- Contract generation succeeded locally. Per project policy no Windows
  test/build/typecheck is run; Linux CI is the delivery gate.

## Research A3a — versioned report packet (draft PR #55; not deployed)

- CLI offline ghim result/catalog theo exact byte SHA-256, replay phép tính A1 trước khi đóng gói.
- Bản nháp có content identity, context/pointer/coverage rõ, 30 section metadata và blocker; không phải full Market/Insight Report.
- Chỉ quan sát FACT trong normalized input; không xác thực lại workbook/provider, không import hoặc sinh suy luận/giả thuyết. Maturity là của template lịch sử, không phải trạng thái report mới.
- Đã nối main sau Task 049; A1 #52 / A2 #54 vẫn chưa merge. Không Windows tests/build/typecheck; trạng thái Linux CI đúng head ghi trong PR #55 và handoff comment. Không DB/UI/AI/live intake/deploy.

## Research A2 — exact Metric source profile (draft PR #54, not deployed)

- Offline XLSX → A1 adapter cho đúng một profile Metric Shopee, dùng manifest scope/period/acquisition rõ ràng, kiểm exact header/hash/row range và ID từ URL.
- Giữ ô nguồn có kiểu dữ liệu, số nguyên chính xác, missing/zero, doanh thu theo kỳ tách tổng trọn đời; sidecar nhãn phải khớp toàn bộ dữ liệu đã đóng băng.
- Không có nhãn thì all có thể tính, wide/core bị chặn. Dữ liệu/nhãn lỗi bị từ chối toàn gói kèm locator; không tự sửa hoặc bỏ dòng.
- Chỉ synthetic acceptance; chưa có manifest thật/transfer Fedora. Không provider/AI/DB/UI/deployment. Xem `docs/tasks/research-a2-source-profile.md`.
- Implementation `7a3cd2a` đã PASS Linux CI; task nghiệp vụ không thấy material mapping mismatch. SHA cuối và CI tương ứng được ghi trong handoff PR #54. A1 (#52) vẫn là dependency chưa merge; technical independent review/owner merge còn chờ.

## Research A1 — deterministic normalized Metric draft (local implementation, not deployed)

- Có calculator Box 2 và CLI `research:metric:calculate`: tính all/wide/core, totals/coverage, shop/group concentration, scope sensitivity và top-shop removal bằng số nguyên chính xác; xuất draft JSON/Markdown có nguồn khai báo.
- Cùng bundle/input/method/profile: kiểm lại rồi tái sử dụng, không ghi đè; changed/corrupt/incomplete bundle bị từ chối. Không AI/provider/DB/migration/UI.
- Nghiệp vụ đã đối chiếu với task Review marketing framework files và fixture độc lập. Raw XLSX verification, source transfer, workspace-bound Results, Insight claims và duyệt bản chính thức chưa triển khai. Xem task/handoff `research-a1-deterministic-metric.md`.

## Task 049 — Hạ tầng AI cho Content Studio (Controlled; PR #53 đã merge)

- Cập nhật 2026-09-28: chủ dự án đã duyệt ADR 0004 và merge PR #53; R1/P2 đã đóng, code head `ddeebb94` PASS Linux (434 backend / 125 frontend). Commit ghi nhận phê duyệt cần CI trước merge; lịch sử PR là nguồn xác nhận merge. Chưa deploy/migrate live hoặc gọi provider thật.

- Đã mở [draft PR #53](https://github.com/khangpworking/tdn-growth-os/pull/53); chờ CI Linux ở đúng final head và review trước khi merge. Từ lần bàn giao này không chạy test/typecheck/build trên Windows. Không có lời gọi provider thật; kiểm thử dùng fake gateway và dữ liệu tổng hợp.
- `CreativeAiGateway` (anh em với `AiGateway` phân tích, không sửa `AiGateway`) cho văn bản và ảnh; adapter CLIProxy chỉ nhận địa chỉ loopback dạng số, bật khi đặt cả `TDN_CLIPROXY_BASE_URL` và `TDN_CLIPROXY_API_KEY`.
- Migration 0025: bảng `flow_content_ai_attempts` ghi mỗi lời gọi AI; service chạy đồng bộ, lưu và đăng ký đầu ra trước khi bên gọi ghi dữ liệu phụ thuộc ([ADR 0004](adr/0004-content-ai-synchronous-attempts.md)).
- Một executor cho mỗi database (`<db>.executor.lock`, gỡ thủ công theo runbook); chỉ executor chuyển attempt treo thành `interrupted` khi khởi động. `GET /api/content/ai/status` báo mô hình khả dụng.

## Task 048d — Chiến dịch nội dung (draft PR)

- Chiến dịch theo thương hiệu: tên, mục tiêu, 1–12 sản phẩm của thương hiệu, mỗi sản phẩm ghim đúng phiên bản danh mục và chọn gói (không chọn = tất cả gói), liên kết tùy chọn tới hồ sơ sản phẩm nghiên cứu (chỉ kiểm tra, không khóa gì).
- Sửa thành phiên bản mới, xóa và khôi phục trong 30 ngày (migration 0024; trigger kiểm tra thứ tự và hạn 30 ngày, như 048c). API đọc và OWNER kiểm tra toàn bộ lịch sử trước mỗi lần ghi.
- Giao diện “Nội dung” (`#/content`): danh sách lọc theo thương hiệu (lọc và đếm phía giao diện), tạo/sửa, chi tiết với bốn bước kế tiếp chưa mở (Insight ở 050), “Đã xóa gần đây”. Mặc định chiến dịch chuyển sang 051. Chưa có lời gọi AI.

## Task 048c — Thư viện prompt (draft PR)

- Bốn prompt hệ thống (Big Idea v3.1, Góc v3, Caption Facebook v3, Poster infographic B2B v2) tách từ template Content Studio cũ: phần sáng tạo là prompt “Hệ thống · Mặc định”, phần dữ liệu khóa/an toàn/định dạng kết quả là “Phần hệ thống · tự thêm”; mọi tệp được khóa bằng SHA-256.
- Prompt “Của tôi”: tạo, nhân bản (ghi nguồn), sửa thành phiên bản mới, xóa và khôi phục trong 30 ngày (migration 0023; trigger kiểm tra thứ tự và hạn 30 ngày). API đọc và OWNER đã xác minh; trang “Thư viện prompt” theo blueprint màn hình 10.
- Bộ chọn prompt thư viện/tự viết và “lưu prompt tự viết vào thư viện” chuyển sang 050, nơi có màn hình tạo nội dung. Chưa có lời gọi AI.

## Task 048b — Danh mục sản phẩm/dịch vụ và ảnh tham chiếu (draft PR)

- Migration 0022 (`flow_content_media`, `flow_content_catalog_items`, `flow_content_catalog_item_revisions`) bất biến; logo và ảnh sản phẩm phải là PNG hoặc JPEG giải mã được đầy đủ (không nhận WebP; logo ≤ 2 MB, ảnh ≤ 8 MB), lưu riêng tư trong kho artifact theo SHA-256 và chỉ xem lại qua route preview đã xác minh (nosniff, CSP sandbox).
- Sản phẩm/dịch vụ theo thương hiệu: loại, mô tả, gói (giá dạng chữ, “bao gồm”), ảnh có công tắc “Dùng cho Poster”; phiên bản bất biến, exact retry, xung đột 409, xác minh lịch sử và ảnh trước khi ghi. Hồ sơ thương hiệu có logo.
- Giao diện: tab “Sản phẩm & dịch vụ” cạnh hồ sơ thương hiệu; bản nháp được giữ khi 409. Chưa có chiến dịch, thư viện prompt hay AI. Chủ dự án hoãn “Sửa bằng AI” sang bản sau (25/09/2026). Kế hoạch còn lại và tiêu chí phát hành Caption & Poster: `docs/content-studio-release.md`.

## Task 048 — Content brands (hồ sơ, thông tin liên hệ, quy tắc hiển thị)

- Migration 0021 (`flow_content_brands`, `flow_content_brand_revisions`) bất biến, phiên bản tuần tự; `ContentBrandService` với exact retry, xung đột khi nội dung thay đổi, xác minh artifact và khôi phục artifact đã commit nhưng chưa publish khi retry chính xác.
- API: `GET /api/content/brands[/:id]` (query-only, đã xác minh) và OWNER `POST /owner-api/content/brands` · `/:id/revisions` với cùng quy tắc token/origin/preflight/kích thước body; operator app định tuyến cả hai.
- Giao diện: mục “Thương hiệu” trên thanh trên cùng, danh sách, hồ sơ, quy tắc hiển thị Luôn / Tùy / Ẩn theo mục đích, lịch sử phiên bản; demo chỉ trong bộ nhớ.
- Đã sửa 4 phát hiện của review độc lập: xác minh lịch sử trước khi tạo phiên bản mới, danh sách đọc đúng phiên bản đã chụp, contract OWNER đóng cho hồ sơ/quy tắc, bản nháp chưa lưu được giữ khi gặp 409 hoặc đang lưu (brief §6).
- Chưa có logo/ảnh, danh mục sản phẩm, thư viện prompt, chiến dịch hay lời gọi AI (các lát tiếp theo của Task 047).

## Task 047 — Content Studio design (B11–B13)

- Chỉ tài liệu thiết kế đã được chủ dự án duyệt: brief `docs/tasks/047-content-studio-design.md`, ADR 0003, INTENT D33 và blueprint tĩnh `docs/frontend/content-studio-blueprint.html` (dữ liệu minh họa).
- Chưa có code, migration, API, provider call hay giao diện Content Studio nào trong repository; Tasks 048–053 trong brief là kế hoạch triển khai.

## Task 045 — integrated Fedora-local operator runtime

- Tài liệu vận hành một process/origin đã có cho production frontend, verified read API, optional OWNER API và `/healthz`; mặc định canonical là `http://127.0.0.1:8787`, chỉ loopback và không dành cho LAN/internet.
- Runbook pin đúng Node `24.15.0`/npm `11.12.1`, dùng `npm ci`, migration CLI với database path positional, `npm run frontend:build`, export biến trong shell (không `.env`), ví dụ OWNER disabled/enabled chỉ bằng placeholder, start/health và Ctrl-C/SIGTERM.
- Normal mode đọc persisted data; chỉ `?mode=demo` dùng synthetic state trong memory. OWNER token là local development authorization cho một trusted operator, không phải public/production authentication.
- Acceptance được mô tả bằng full synthetic B3→B10 smoke, disabled read-only smoke, static/health/lifecycle, query-only reopen, owner-only permissions và residue/leak checks.
- Runtime, frontend health gating và deterministic disposable acceptance đã được triển khai; final full check, CI và final SHA sẽ được ghi ở handoff sau khi hoàn tất governed delivery. Không deploy và không tạo dữ liệu/quyết định thật.
- Systemd, reverse proxy, TLS, remote access, backup/restore và deployment để future work. Xem `docs/runbooks/fedora-local-operator-runtime.md`, task và handoff 045.

## Task 044 — explicit product workspace creation from exact B7 PASS

- Opt-in OWNER API có route riêng được scope bởi exact `workspaceId + basketId + decisionId`; closed body chỉ gồm contract version và hidden application-generated product-workspace key. Tạo mới trả 201, verified exact retry trả 200, còn changed PASS/key identity trả 409.
- Endpoint replay exact Task 027 decision, yêu cầu `PASS`, kiểm tra workspace/basket lineage và chỉ delegate mutation cho Task 028 `ProductWorkspaceService.createWorkspace()`; không ghi trực tiếp product-workspace SQL hoặc thay canonical Task 028 service/contract.
- B7 read projection chỉ liên kết product workspace bằng exact decision ID rồi replay và đối chiếu toàn bộ frozen workspace/basket/candidate/version/label/optional-summary/decision lineage. Safe summary không lộ hash, path, actor/policy internals; read API vẫn file-must-exist/query-only và bảo toàn database bytes.
- Real discovery UI chỉ hiện `Tạo workspace sản phẩm` cho frozen member có effective B7 PASS chưa có workspace; dùng OWNER unlock trong memory, hidden stable retry key, immutable confirmation snapshot, duplicate-submit guard, authoritative reload và exact receipt/projection verification. Demo chỉ mutate synthetic memory.
- Workspace mới là `ACTIVE` tại entry step `B8`, nhưng chỉ mang nghĩa sẵn sàng cho future B8 work. Task 044 không tự tạo workspace khi PASS, không tạo B8 decision/clearance, B9/B10 action, funding/supplier/claim approval, provider/AI/external action, migration, production auth, deployment hoặc real/private product workspace.
- Request-scoped staging chỉ publish committed digest; exact retry chỉ phục hồi canonical product-workspace artifact thực sự thiếu sau full request/row/PASS/lineage/manifest/digest/size/path verification, không scan/sweep/xóa artifact không liên quan.

## Task 043 — governed B7 candidate decisions and UI

- Read API có endpoint B7 riêng cho đúng workspace/basket, replay verified basket và effective Task 027 decision cho từng exact frozen member theo thứ tự snapshot; chỉ trả safe UI fields và giữ SQLite file-must-exist/query-only không đổi bytes.
- Opt-in OWNER API nhận closed body chỉ gồm contract version, candidate ID/version và PASS/HOLD/REJECT; URL sở hữu workspace/basket. Server sở hữu OWNER actor, capability, fixed policy, decision ID/time và chỉ delegate mutation cho `CandidateB7DecisionService.decide()`.
- Mỗi exact basket/member/version có tối đa một quyết định bất biến: retry exact trả 200, create trả 201, thay đổi quyết định trả 409; HOLD chỉ xem lại qua basket version tương lai. Không có reason/rationale/note/evidence/reviewer/AI field.
- Request-scoped staging chỉ publish digest của committed result; exact missing-artifact recovery kiểm tra toàn bộ row, basket/member, manifest/timestamps/digest/size/path và không scan/sweep/xóa artifact không liên quan.
- Real B3 history có ba nút `Đạt`/`Tạm giữ`/`Loại`, immutable confirmation snapshot, OWNER lock/double-submit guard, authoritative reload và post-decision copy. Demo chỉ mutate synthetic memory và không gọi OWNER API.
- PASS chỉ cấp eligibility cho action tạo product workspace riêng trong tương lai. Task 043 không tạo product workspace, B8–B10 record, external action, provider/AI operation, migration, auth infrastructure, deployment hoặc real decision.

## Task 042 — governed candidate-basket freeze and UI

- Read API có endpoint riêng cho các basket của đúng discovery workspace, replay từng basket qua verified Task 026 reader, sắp xếp deterministic theo basket key rồi version tăng dần, và chỉ trả identity/thời gian cùng exact frozen candidate fields an toàn. SQLite vẫn read-only, file-must-exist, query-only và bảo toàn bytes.
- Opt-in local OWNER API nhận closed request gồm basket key, version và ít nhất một cặp exact candidate ID/version; workspace ID chỉ đến từ URL. Mutation chỉ gọi `CandidateBasketService.freezeBasket()`, không ghi trực tiếp candidate-basket SQL; create mới trả 201 và verified exact retry trả 200.
- Mỗi basket version là snapshot bất biến, append-only của exact historical candidate revisions. Candidate sửa sau không đổi basket cũ; version basket sau có thể đổi membership hoặc dùng revision mới. Thứ tự deterministic không phải score, rank, recommendation, winner hay approval.
- Real discovery UI bắt đầu với selection trống, hiển thị candidate hiện tại cùng `EXPLORING` và exact version, hỗ trợ family mới hoặc next version, confirmation, hidden stable key, retry identity, no optimistic mutation, authoritative reload/conflict handling và immutable history. Demo vẫn synthetic.
- Request-owned staging của Task 040/041 được giữ nguyên: cleanup chỉ xóa private directory của request hiện tại; exact retry recovery chỉ phục hồi đúng canonical basket artifact thực sự thiếu sau full verification, không scan/xóa artifact root hay file không liên quan.
- Task 042 không thêm migration, candidate mutation, B7 PASS/HOLD/REJECT, product workspace, scoring/ranking/comparison, research/provider/AI, production auth, worker, deployment hoặc real/private basket data.

## Task 041 — OWNER product candidate create/revise UI

- Local OWNER API exposes closed create/revision paths inside one exact discovery workspace and delegates exclusively to Task 025 `ProductCandidateService`; revision membership is verified by candidate ID through the existing reader.
- Candidate versions remain append-only and independent. Duplicate labels are allowed under distinct hidden keys; revisions do not modify another candidate or any frozen basket, B7 decision, or product-workspace source snapshot.
- Real “Khám phá và rổ cơ hội” UI provides Vietnamese create/edit forms with memory-only OWNER unlock, stable generated create identity, exact expected versions, no optimistic mutation, authoritative reloads, and explicit stale-conflict handling. Demo remains synthetic.
- Task 040 request-owned artifact staging is reused. Cleanup is limited to a unique private staging directory; exact post-commit recovery is bounded to a fully matching missing canonical create/revision target.
- Task 041 adds no migration, score/rank/comparison, candidate relationship/state transition/delete/archive, basket/B7/product creation, provider/AI call, production authentication, deployment, or real/private candidate data.


## Frontend — Task 033 React workspace demo

- Prototype nhiều thị trường đã duyệt ở D31 được triển khai thành React 19 + Vite 8 + TypeScript 5.9 trong `frontend/`; `docs/frontend/workspace-prototype.html` vẫn là nguồn thiết kế đã duyệt. Không dùng các hướng Coinbase, Meta, Apple hoặc HP đã loại.
- Giữ ba cấp **tất cả thị trường → workspace khám phá thị trường → workspace sản phẩm độc lập**, route hash trực tiếp, back/forward, tìm kiếm, chuyển thị trường và tạo workspace nghiên cứu demo trống. Quan hệ dùng ID, không dùng tên; hai thị trường có thể trùng tên/từ khóa.
- Workspace thị trường hiển thị context khám phá, rổ ứng viên và danh sách sản phẩm. Workspace sản phẩm có B8 bốn lane độc lập, PASS/HOLD/REJECT không reason, lịch sử append-only trong bộ nhớ và snapshot clearance khi cả bốn lane PASS; snapshot lịch sử vẫn hiện nếu lane đổi sau đó.
- Có trạng thái normal, search-empty, workspace-empty, loading, error và invalid/malformed route; desktop/mobile responsive, focus rõ và reduced-motion. Nhãn synthetic luôn hiện; reload hoặc reset trở lại seed.
- B9/B10 chỉ là view thông tin. Không có STP form/lock, B10 execution, API, auth, database, provider, collection, quyết định thật hoặc deployment.
- Root `npm run check` bao gồm frontend typecheck, production build và focused state/routing tests bên cạnh toàn bộ backend checks hiện có. Handoff, commands, screenshotshots và API gaps: `docs/handoffs/033-react-workspace-ui.md`.

## Task 021 — offline Vietnamese Shopee evidence export

- Có command `research:shopee:export` chọn duy nhất một persisted Result bằng exact SHA-256; không chọn “latest”.
- Export mở database read-only/query-only, chỉ đọc artifact/lineage/summary đã xác minh, không gọi `analyze()`, Python/filter, provider, migration hoặc ghi database.
- V1 fail-closed chỉ hỗ trợ `shopee-calcium-v3-adapter3`; không rewrite artifact lịch sử hoặc thêm compatibility framework.
- Báo cáo deterministic gồm verified source/time/selection/coverage/counts/warnings, toàn bộ review được giữ theo sản phẩm, rating/signals/ambiguous flag và Result/raw-row references. Review text được quote và escape thành inert text; không xuất author identifier.
- Output bắt buộc ngoài Git, tạo mới `0600` và từ chối overwrite. Tests dùng persisted synthetic fixtures; private 3.354-row Markdown không được nhập vào collection model.

## Tasks 018 và 020 — filter adapter3 đã merge

- Task 018 merge `9abb426808cae601e142bbbab07f680262ba94db`: bảo toàn ambiguous final guided-field span và original review text; adapter2.
- Task 020 merge `f4275a40ed5b03b8392720fb1012a4031403ea0b`: thu hẹp eligibility vào concrete product-use attributes/effects, giữ hearsay attribution nhưng không coi là firsthand evidence; adapter3.
- Các so sánh private của Tasks 017–020, raw reviews và usernames vẫn ngoài Git. Retention/score không phải accuracy, sentiment, confidence, fact validation hoặc causation.

## Task 016 — bounded live Shopee smoke đã xác minh

- Đã reuse đúng Apify run `i6T1liAKkm9r2iNZs` / dataset `uGmehqbbdXCqBvjED`; không launch Actor run mới khi hoàn tất verification.
- Scope smoke được chủ dự án đổi từ 50/USD 0.30 thành 20/USD 0.10; production default/cap vẫn 500 reviews/listing.
- Application GET-only existing-run path: 20 fetched, 20 normalized, 2 kept, 18 removed, 0 invalid, 0 duplicate; raw artifact, provider lineage và deterministic replay PASS.
- Finalized provider usage USD 0.084. Metric login vẫn chưa triển khai; một listing văn phòng phẩm không phải bằng chứng thị trường canxi.
- Chi tiết: `docs/tasks/016-live-shopee-smoke.md` và `docs/handoffs/016-live-shopee-smoke.md`.

## Task 015 — file-input Shopee research đã hoàn thành Fedora validation

- Đã ghi quyết định phỏng vấn trong `INTENT.md` và chuẩn bị `docs/tasks/015-on-demand-shopee-research.md`.
- Scope đầu tiên: Metric Shopee → top 5 sản phẩm → 1 listing đại diện/sản phẩm → tối đa 500 comments/listing → raw + filter + cảnh báo thiếu dữ liệu.
- Đã implement và xác minh trên Fedora: file listing → selection → bounded Apify adapter → raw SQLite/artifacts → callable Python filter → collection summary và verified replay.
- Đã lưu baseline filter ở `references/reuse/shopee_review_filter.v3.py`; adapter đã được so sánh với baseline trên synthetic cases.
- Fedora validation: Node 24.15.0, npm 11.12.1, Python 3.14.3; 16 focused tests và full suite 97/97 PASS; CLI fixture smoke PASS; migration v10→v11/idempotency và prior-migration hashes PASS.
- Fedora permissions: database/WAL/SHM, request/raw/collection/result artifacts và local receipt probes đều giữ owner-only `0600` (`0700` cho receipt directories). Không chạy live provider, Metric login, paid API hoặc deployment.
- Metric login/extraction được hoãn theo yêu cầu; file-input là authoritative scope của Task 015. Live adapter vẫn cần authorization, credential và explicit budget riêng trước khi chạy.
- Handoff chi tiết: `docs/handoffs/015-on-demand-shopee-research.md`.
- Phần bên dưới giữ nguyên các kết quả lịch sử trước Task 015; không tính tài liệu là năng lực đã xây.

Cập nhật: 13/09/2026.

- Hoàn thành và đã merge: Task 001 — SQLite foundation local cho Box 1, merge commit `8f625015db170fb12e7ebf0895c3a2d542273f43`.
- Đã có: dependency/lockfile pin; strict TypeScript check; SQLite WAL + foreign keys + busy timeout; migration checksum/version; artifact SHA-256 atomic store; JSON Schema/AJV boundary; manual synthetic ingestion; product/observation identity; evidence lineage; 9 integration tests.
- Hoàn thành: Task 002 — minimal GitHub PR Check workflow.
- Hoàn thành: Task 003 — multi-row exact-byte JSON export ingestion.
- Hoàn thành: Task 004 — finalized versioned Data Pack freeze/replay.
- Hoàn thành: Task 005 — deterministic `market_snapshot_v1` Result.
- Hoàn thành: Task 006 — bounded provider-neutral AI interpretation.
- Hoàn thành: Task 007 — governed static Box 2 analysis-skill boundary.
- Hoàn thành: Task 008 — exact-byte research documents và finalized Research Packs.
- Hoàn thành: Task 009 — deterministic citation-ready Research Evidence Index.
- Hoàn thành: Task 010 — bounded Research Evidence Audit và governed Box 2 adapter thứ hai.
- Hoàn thành: Task 011 — immutable analysis-backed `PROPOSED` foundation cho Box 3.
- Hoàn thành thử nghiệm: Task 012 — governed Pi proposal adapter spike; verdict `REVISE`. Pi chưa được đưa vào production; đường ứng dụng trực tiếp của Task 011 vẫn là authoritative.
- Hoàn thành: Task 013 — Box 5 governed human proposal review với lịch sử quyết định immutable `APPROVE` / `REJECT` / `HOLD`; `APPROVED` chỉ cho phép future Box 4 intake xem xét, không thực thi hay xuất bản.
- Hoàn thành: Task 014 — minimal Box 4 approved-proposal intake tạo immutable `AUTHORIZED_PLAN` shell chỉ từ exact current verified `APPROVED` decision; không tạo task, worker hoặc external action.
- Inventory/reuse và data dictionary: `docs/foundation-data-dictionary.md`.
- Handoff Task 001: `docs/handoffs/001-sqlite-foundation.md`.
- Task 003 thêm contract/AJV boundary, exact-byte artifact, một ingestion/evidence dùng chung và nhiều product observations từ fixture tổng hợp dựa trên Metric.vn Product Card inventory.
- Task 004 thêm explicit selection, canonical lossless snapshot, immutable versioned pack/membership và verified artifact replay.
- Task 005 thêm declared read-only Box 1 Data Pack interface, exact BigInt market totals/coverage, immutable canonical Result artifact/row và verified replay.
- Task 006 thêm verified Result reader, injected provider-neutral AI gateway, versioned prompt/schema, bounded no-tool request, untrusted-output validation, immutable interpretation và verified replay; tests chỉ dùng fake gateway.
- Task 007 thêm contract và registry tĩnh fail-closed có đúng một Box 2 skill, adapter mỏng tái sử dụng Task 006 và typed receipt không tạo persistence mới.
- Task 008 thêm manual exact-byte UTF-8 `text/plain` research documents, explicit immutable Research Packs và verified read-only reader; chỉ dùng fixture tổng hợp, không fetch/parse/AI.
- Task 009 thêm deterministic non-empty physical-line segmentation với exact half-open byte ranges, stable hashes/JSON Pointer citations và immutable verified `research_evidence_index_v1` Result; không claim/verdict/AI/search.
- Task 010 thêm bounded provider-neutral evidence audit chỉ trong Research Pack, exact segment-citation validation, immutable replay và entry tĩnh `analysis:research-evidence-audit@1`; tests chỉ dùng fake gateway.
- Task 011 thêm closed Box 3 submission contract, claim/use validation từ verified audit, immutable versioned `PROPOSED` artifact/row và replay/reader; không AI, Pi, approval hay action.
- Task 013 thêm closed review request, trusted actor capability `governance:proposal-review`, fixed application policy, append-only immutable decision artifact/row và verified effective-decision reader; chỉ đọc proposal qua `AnalysisBackedProposalReader`, không mutate Box 3 hay tạo Box 4 action.
- Task 014 thêm closed approved-proposal intake, trusted Flow producer, immutable authorization-lineage plan artifact/row và verified reader; chỉ đọc Box 5 qua `GovernedProposalDecisionReader`. `AUTHORIZED_PLAN` chỉ đủ điều kiện cho future manual task definition.
- Chưa triển khai: production live collection beyond the bounded Task 016 smoke, Metric automatic selection/login, additional calculations, worker, API, frontend, approval/action AI, artifact reconciliation, backup/restore production và deployment.
- Repository GitHub riêng tư: `khangpworking/tdn-growth-os`.
- Các thư mục scaffold không chứng minh năng lực sản phẩm.

## Phần trăm

| Box | Ước tính lịch sử trong hệ thống cũ | Implementation được xác minh trong repo mới |
|---|---:|---|
| 1 — Data | 52% | Foundation, JSON export, finalized numeric Data Packs và exact-byte research document/Research Pack slice đã triển khai; chưa có collectors/automatic selection/production operations |
| 2 — Analysis | 43% | `market_snapshot_v1`, Research Evidence Index, bounded in-pack evidence audit, bounded interpretation và hai governed static skill adapters đã triển khai; chưa có global truth/live provider/business decisions |
| 3 — Orchestrator | 58% | Minimal analysis-backed immutable `PROPOSED` landing zone đã triển khai; Task 012 Pi spike đã hoàn thành với verdict `REVISE` nhưng chưa được adopt, nên Task 011 direct path vẫn authoritative; chưa có production Pi/runtime orchestration, scenario planning, approval hoặc action |
| 4 — Flow | 62% | Minimal immutable `AUTHORIZED_PLAN` intake shell đã triển khai; chưa có B0–B14 semantics, manual task records, scheduling, worker dispatch hoặc external actions |
| 5 — Governance | 68% | Minimal governed human proposal-review decision foundation đã triển khai; chưa có authentication route, staff-specific/multi-party policy, delegation, expiry, UI/API hoặc production approval operations |

Không chuyển nguyên phần trăm cũ sang repo mới. Chỉ cập nhật sau khi code được tái sử dụng, tích hợp và có bằng chứng nghiệm thu. Không tính cài tool hoặc tạo folder là hoàn thành Box.

## Research A4 — source-backed chart/export draft PR #60

Development now connects an exact retained Foundation package and verified
discovery workspace to A2 re-parsing, deterministic A3 calculations, evidence-linked
chart data and an internal HTML export. All four evidence layers are recorded in
INTENT.md. Linux checks passed at code head edf5bff (461 backend tests), and the
actual-CLI synthetic desktop/mobile/PDF preview passed, including evidence links,
files, keyboard and contrast. Fresh design review: ship. Antislop is applied
during design; the approved TDN system is preserved. No local Windows tests,
build or typecheck were run. No new migration is installed:
0026–0029 belong to the pending Content Studio stack, with 0030 reserved for
report persistence after integration. Normalized-row SQLite persistence, report
version/history, AI interpretation/review and operator dashboard integration are
not complete. Do not count 30 represented section states as 30 automated methods.

## Research A5 — conditional P3 calculation draft PR #61

An independent branch adds exact rational P3 contribution/threshold equations,
closed scenario contracts and a private offline calculation CLI. Null inputs
remain unavailable, fee bases are explicit, and Cmax/Mmax solve one variable
at a time. Outputs remain SCENARIO, UNREVIEWED and declared/unverified; no
seller applicability, optimal price, profitability or commercial conclusion is
inferred. Linux verification is recorded in the A5 handoff and final-head PR
checks; focused arithmetic review remains a release gate. P4, database
persistence, operator UI and AI interpretation are not included.

## Research A6 — single-quote tablet arithmetic draft

The next isolated slice adds M08/P4 per-quote VND/explicit-tablet-count
normalization, not a completed price-comparison section. It preserves declared
source, pack text, price state, time and identity flags; missing count remains
unavailable, with no title inference or equal-dose claims. A private offline
CLI uses the existing immutable publisher. Linux verification is a release
gate. No comparison groups, ranking, SQLite migration, operator UI, approval,
provider call or real-data import is included.

## Research A10 — immutable report-version ledger merged

PR #66 is merged on `main` at `3fa773446bfa116cdedda5b02885cab568658d5e`.
Migration 0030 persists immutable report series, explicit sequential versions,
exact artifact/source membership, semantic identity and an explicit
`NONE`/`UNREVIEWED` interpretation/review state. Replays rebuild and compare the
complete report bytes through verified readers. No live report, AI call, human
decision or deployment was created.

## Research A11 — verified report read API and operator UI merged

PR #67 is merged on `main` at `a7ae29809cb61345d2327c60fbb8787d5da145b3`. The bounded slice exposes
workspace report series, replay-verified explicit history and exact persisted
HTML/evidence members through the local query-only operator. The React workspace
requires explicit series and version choice and shows the current truth:
4/30 partial deterministic methods, no AI interpretation and no human review.
This task adds no method, report write, migration, provider call or deployment.
Normalized row-level SQLite persistence is handled separately by A12.

## Task 022 — combined Vietnamese market-and-review evidence report

Implemented a bounded offline composition/export path for an explicitly selected `market_snapshot_v1` Result and adapter3 Shopee review Result. It reuses verified Result/Data Pack/collection readers and Task 021 safe review rendering; performs no analysis/filter execution, provider calls, scraping, migrations, or database writes. Exact integer strings and missing-versus-zero semantics are preserved, while differing/unverified scopes, review date independence, and partial collection limits are explicit. Export is read-only, outside Git, owner-only, deterministic, and refuses overwrite. Acceptance is synthetic and persisted; no private review dataset or fabricated provider lineage is included.

## Task 023

Offline exact-byte source-package intake and immutable field-audit Results are implemented, including migration 0012, generated contracts, verified replay, and an owner-only Vietnamese report CLI. Only synthetic test data is tracked.

## Task 025 — Box 4 discovery workspace foundation

Minimum Box 4 discovery workspace and append-only product-candidate revision foundations are implemented without candidate relations, transitions, execution, providers, AI, governance, or UI. Task 024's owner-prepared B2 report methodology and format remain ongoing and are temporarily skipped; Task 025 does not provide a replacement report generator.

## Task 026 — versioned discovery candidate basket

Box 4 can freeze an explicit, deterministic, immutable set of exact historical candidate versions from one ACTIVE discovery workspace. Basket membership preserves verified candidate artifact digests and metadata, while adding no scoring, ranking, selection state, B7 decision, governance approval, product workspace, AI/provider behavior, worker, API, or UI.

## Task 027 — owner-only B7 candidate review

Box 5 implements immutable PASS/HOLD/REJECT decisions for an exact verified frozen basket member. Submission is owner-only with `governance:candidate-b7-review`, stores no rationale/reason, reads Box 4 only through the injected basket reader, and exposes an exact basket/candidate/version effective reader. PASS authorizes only future independent product-workspace creation; this task creates no workspace and approves no B8–B10 matter or external action.

## Task 028 — independent product workspace from exact B7 PASS

Box 4 can create one immutable independent `ACTIVE` product workspace at entry step `B8` from one exact verified Box 5 B7 `PASS` decision selected by decision ID. The closed request accepts only contract version, decision ID, and globally unique workspace key; all source identity, candidate title and optional summary, OWNER authorization, policy, and digests are copied into a frozen artifact. Exact retries make zero database mutations. `ACTIVE/B8` means readiness for future B8 work only: this task adds no B8 execution, transitions, candidate mutation, funding, supplier, legal, scientific, quality, publication, launch, provider, AI, worker, API, or UI authority.

## Task 029 — owner-operated B8 four-gate decisions

Box 5 supports append-only, immutable, button-only `PASS` / `HOLD` / `REJECT` histories for the independent `LEGAL`, `SCIENTIFIC`, `QUALITY`, and `FINANCE` B8 lanes of one exact verified `ACTIVE/B8` product workspace. Submission is OWNER-only with `governance:product-b8-review`, uses sequential optimistic versions, stores no reasons/evidence/reviewer/AI text, and reads Box 4 only through `ProductWorkspaceReader`. The deterministic status reader reports `readyForB9` only when all four latest verified lane decisions are `PASS`; Task 029 does not mutate the workspace, enter B9, create clearance/tasks/actions, or call providers.

## Task 030 — exact four-PASS B8 clearance

Box 4 can freeze one immutable `READY_FOR_B9` clearance for a product workspace from four explicitly supplied, exact, verified and currently effective B8 PASS decision IDs in deterministic LEGAL, SCIENTIFIC, QUALITY, FINANCE order. Creation reads Box 5 only through `ProductB8DecisionByIdReader` and `ProductB8StatusReader`; exact historical replay re-verifies the frozen decision artifacts without requiring them to remain current. The clearance is readiness evidence only: no product-workspace mutation, B9 implementation, task/action, AI, provider call, API, UI, or external authority is added.

## Task 031 — single STP working record and B9 lock

Each product workspace may have one mutable pre-lock STP working record and exactly one immutable official `LOCKED_STP`. Explicit segment order is preserved; primary and optional secondary targets must resolve to supplied unique segment keys. Saving identical canonical content deduplicates, changed pre-lock content updates the same row under a digest guard, and all writes fail after lock. OWNER-only locking verifies the exact product workspace and Task 030 `READY_FOR_B9` clearance through declared read-only interfaces and freezes their lineage with the exact current STP content. No B10, category approval, funding, scoring, ranking, AI/Pi, external action, reopening, repositioning, rollback, or multiple STP versions are introduced.

## Task 032 — combined B10 category-and-funding decision

B10 v1 records one combined OWNER button decision—`APPROVE`, `HOLD`, or `REJECT`—for category/portfolio approval and authorization to receive funding. It uses immutable append-only correction history bound to one exact verified `LOCKED_STP`; exact predecessor IDs provide optimistic concurrency, repeated effective states are rejected, and exact successful requests deduplicate. Narrow readers replay decisions by ID and report only the effective status, with `readyForB11` true only for effective `APPROVE`. No budget allocation, B11 state, Box 4 SQL/FK, AI/Pi, provider call, external action, UI/API, worker, scheduler, notification, or deployment is introduced.

## Task 034 — read-only workspace API and real-data frontend

The Task 033 React frontend is implemented. Task 034 connects its normal mode to verified persisted SQLite records through a narrow local read-only HTTP API. The API provides portfolio, discovery-workspace detail, and independent product-workspace detail GET views; the database is opened read-only/file-must-exist and placed in SQLite query-only mode, and relationships are composed by IDs after Box-owned verified replay. The frontend shows truthful loading, empty, not-found, integrity, and connection states without synthetic fallback. Synthetic state remains available only through explicit `?mode=demo`, with a visible warning. Real-data B8 controls are disabled; B9 and B10 remain informational.

Production API writes, authentication, deployment, mutable STP/B8/B9/B10 operations, and real business decisions are not implemented.


## Task 035 — read-only B9 and B10 product journey

The local read-only workspace API now exposes verified B9 STP and B10 decision views for one persisted product workspace. B9 truthfully reports NOT_STARTED, WORKING, or immutable LOCKED_STP content with ordered segments and targets. B10 reports no decision or the verified effective APPROVE/HOLD/REJECT state, B11 readiness, and sequential immutable correction history. The React frontend renders these views without save, lock, or decision controls; explicit labelled demo mode remains available. SQLite stays read-only/query-only, existing Task 034 endpoints remain compatible, and no migration, authentication, provider, AI/Pi, worker, external action, merge, or deployment is introduced.


## Task 036 — opt-in local OWNER B8 writes

A separate loopback-only, explicitly enabled local OWNER process now accepts one closed B8 decision mutation endpoint and delegates to the existing Task 029 service. The real React UI keeps the Task 034/035 read views, holds a local token only in page memory, submits exact lane versions through button-only PASS/HOLD/REJECT controls, and reloads authoritative read data after success or conflict. The read server remains separately connected, read-only/file-must-exist/query-only, and backward compatible. This is a local development authorization gate, not production authentication; no clearance, B9/B10/B11 write, migration, provider, AI/Pi, worker, deployment, private data, or real calcium decision is included.


## Task 037 — explicit exact four-PASS B8 clearance

The separate local OWNER server now exposes one explicit B8-clearance confirmation endpoint. It accepts exactly the four current verified PASS decision IDs and delegates solely to the existing Task 030 clearance service, preserving immutable single-clearance, exact-retry, concurrency, and historical-replay semantics. Real mode reuses the memory-only OWNER unlock, enables confirmation only for an exact complete four-PASS set with no prior clearance, requires a compact confirmation dialog, and reloads authoritative read data after success or conflict. Existing clearances remain historical even if current B8 changes, with a separate View B9 action and no automatic navigation. The read API remains separate and query-only; demo remains synthetic. No STP/B10/B11 writes, automatic/replacement clearance, migration, production auth/roles, reasons/notes, AI/Pi/providers, worker/deployment, private data, or real calcium action is included.


## Task 038 — OWNER B9 working STP editor and immutable lock

The opt-in loopback OWNER server now exposes explicit working-STP save/update and immutable lock endpoints backed exclusively by Task 031 `StpService`. Verified B9 reads include an opaque optimistic-concurrency revision for WORKING and LOCKED while NOT_STARTED omits it. Real mode provides a non-technical ordered segment editor with internally generated stable keys, explicit Save draft, no autosave, authoritative conflict reload, unsaved-navigation warnings, and irreversible lock confirmation. Locked content is read-only and links separately to B10 without creating a B10 decision or navigating automatically. Existing token/origin/body/server-owned-actor boundaries and the separate query-only read API remain intact; demo stays synthetic. No migration, canonical Task 031 change, multiple STP versions, unlock/reopen, AI generation, B10 write, B11, production roles, provider, worker/deployment, private data, or real calcium STP is included.


## Task 039 — OWNER combined B10 category-and-funding decision

The opt-in loopback OWNER server now exposes a closed B10 decision endpoint backed exclusively by Task 032 `ProductB10DecisionService`. First decisions and corrections append immutable, gapless, predecessor-linked history; exact retries are mutation-free and concurrent stale corrections fail closed. The real B10 panel uses exact verified locked-STP and effective-decision IDs, requires explicit confirmation, reloads authoritative reads after success/conflict, displays immutable chronological history and `readyForB11`, and explains that APPROVE authorizes funding eligibility without allocating, transferring, or spending money. The token remains only in React memory, the read API stays separate/query-only/byte-preserving, and demo mode remains synthetic. No B11, funding execution, free text, amount, reviewer, AI recommendation, STP mutation, migration, provider, worker, deployment, private data, or real calcium B10 decision is included.


## Task 040 — OWNER discovery workspace creation

The opt-in loopback OWNER API now exposes a closed `POST /owner-api/workspaces` endpoint backed exclusively by Task 025 `DiscoveryWorkspaceService.createWorkspace()`. The real portfolio can create an empty broad market-opportunity workspace using only title and optional description; a hidden Task 025-valid key remains stable for pending and ambiguous retries. Successful creation reloads authoritative query-only data and navigates only after the exact returned ID appears with zero candidates and zero product workspaces. Conflicts reload and fail closed, duplicate titles remain distinct by ID/key, and demo creation remains synthetic. This does not finalize or define B0, and creates no candidate, revision, basket, B7 decision, product workspace, collection, report, research run, provider action, AI/Pi action, migration, production role, worker, deployment, or real calcium workspace.


## Task 046 — B7–B10 frontend UX correction (pending review)

- Frontend panels are route-specific: B8 mutation/clearance controls remain only on B8; B9 and B10 expose their own guidance and actions.
- B9 now distinguishes not-started, saved draft, local dirty, and immutable locked states; Save/Lock blockers share the same predicates as their handlers and include OWNER/runtime, input, unsaved, pending, and business-prerequisite guidance.
- B7 HOLD can open the existing basket-version form pinned to the same basket family with an editable suggested candidate selection; opening performs no write.
- B7 workspace copy uses the verified projection, B8 historical-clearance copy distinguishes changed decision IDs from current lane outcomes, and B10 explains missing lock and future B11 status without changing policy.
- Shared confirmations provide initial focus, tab containment, Escape/cancel, and focus return. Mobile product navigation scrolls the active item into view and keeps reduced-motion behavior.
- Scope remains frontend-only: no migration, domain/API policy change, real OWNER write, active-runtime restart, provider call, deployment, or Windows backport.
- Base: exact fetched `origin/main` `ab099f33ba1634d60f2209efee9af9637c4ac458`. Verification and PR state are recorded in `docs/handoffs/046-b7-b10-ux-correction.md`.

## Research A15 — exact-version interpretation dashboard (complete, draft PR)

The local report workspace can inspect A13 interpretation overlays only after
the operator explicitly selects an exact report version and an exact saved
interpretation. The read-only view exposes evidence logic, resolved claim
citations/pointers, assumptions, limitations and safe generation identity,
while labelling every run unapproved and distinct from source evidence or a
human decision. No approval control, regeneration, provider call, report write,
migration or deployment is included. Final PR and Linux CI evidence remain
recorded in `docs/handoffs/research-a15-interpretation-dashboard.md`: draft PR
#72, verified implementation head `c3c2528e839c26d5eaff6e017e26e1cdb55901d0`,
Linux CI PASS with 171/171 frontend and 579/579 repository tests. No Windows
test, build or typecheck is release evidence.

## Research A23: M13 deterministic provenance appendix (complete, draft PR #80)

Catalog 0.3.0 gives M13 a canonical source-to-record provenance artifact. It
binds the exact finalized source package, selected file bytes, normalized input,
normalization receipt, deterministic calculation and every retained record
locator into the immutable report identity and visible HTML appendix. This is
traceability only: it does not authenticate a provider, establish market
completeness, create AI interpretation or record a human decision. Linux Check
passed with 176/176 frontend and 587/587 repository tests; the Linux report
preview also passed. Exact draft-PR evidence is recorded in
`docs/handoffs/research-a23-m13-provenance.md`.

## Research A24: bounded M08/P4 tablet-quote normalization (implementation)

Catalog 0.4.0 materializes the approved tablet-quote normalizer as one partial
M08/P4 artifact. It binds one raw quote source and one canonical quote input to
exact source-package bytes, retains arithmetic and trust limits, and renders a
single-quote evidence panel without comparison or ranking. Migration 0035 adds
a separate two-source supplemental ledger while leaving the original 2-3
Metric membership and historical rows unchanged. Executable deterministic
coverage is now 5/30 sections: M02, M03, M04, M08/P4 and M13. Linux CI and
preview remain release gates; no real quote, AI interpretation or human
approval is created by this task.

## Research A25: deterministic I03 research-method account (implementation)

Catalog 0.5.0 materializes I03 from one exact source package, its normalization
receipt and the M02/M13/calculation chain. The artifact makes selected sources,
profile, period, explicit denominators, missing/zero/non-exact counts, label
states and scope blockers visible and replayable. The HTML report shows blocked
WIDE/CORE as blocked rather than as zero membership. Executable deterministic
coverage becomes 6/30 sections: M02, M03, M04, M08/P4, M13 and I03. This remains
an unreviewed method account and creates no market finding, insight,
recommendation, AI output or human decision. Linux CI and preview remain the
release gates.

## Research A26: directional I17 evidence trace (implementation)

Catalog 0.6.0 materializes I17 as a canonical index over the exact source
package, M02/M08/M13/I03 method artifacts and M03/M04 quantitative claims. Each
entry resolves the owning artifact and JSON pointer while preserving scope,
membership, denominator, coverage, missing/zero/UNKNOWN and precision states.
The final packet binds I17; I17 does not embed the final packet or semantic ID,
so identity remains directional. Executable deterministic coverage becomes
7/30 sections: M02, M03, M04, M08/P4, M13, I03 and I17. This is traceability,
not source authentication, proof, AI interpretation or human approval. Linux
CI and preview remain release gates; a closed visual ChartSpec is the next
separate chart-layer increment.

## Research A27: evidence-bound ChartSpec (implementation)

A closed canonical ChartSpec now sits between deterministic ChartData and the
report renderer. Its exact fourteen M03/M04 views freeze chart type, axis,
scale, unit, zero baseline, ordering, relationship and missing/zero/UNKNOWN
semantics. Every visible mark binds exact ChartData and Result/evidence
pointers; supporting counts are materialized before presentation. The HTML
renderer validates the complete view set and exposes the contract as a visible,
downloadable, unreviewed artifact. High-cardinality group visuals fail closed
above 100 categories rather than truncating or ranking silently. This task adds
no business section, calculation, AI interpretation or human decision, so
executable deterministic coverage remains 7/30. Linux CI and preview remain
release gates.

## Research A28: exact-input readiness gate (implementation)

The exact-version 30-section matrix now evaluates every catalog prerequisite
under the closed `report-input-readiness-v1` profile. Each ordered check is
`PRESENT`, `ABSENT` or `INVALID`, distinguishes optional absence from a blocker,
and points to the exact replayed packet, report record or artifact digest when
evidence exists. Artifact bytes and method-artifact identities must agree;
unknown future input IDs fail closed. M08 readiness reads the verified method
artifact so unknown observation time and an absent optional OWNER tablet count
are not falsely reported as present. The read API and Vietnamese operator UI
expose this without a new route, write, provider call, AI call, owner action or
section. Deterministic coverage remains 7/30; Linux CI and report preview are
the release gates.

## Research A29: readiness requires the exact SQLite projection (implementation)

The A28 `normalized-metric-rows` prerequisite now depends on A12's verified,
row-queryable SQLite projection for the exact report ID/version. Artifact bytes
alone no longer make that input present. A missing dataset origin is `ABSENT`;
projection, membership, lineage or byte drift is `INVALID`; a valid result
cites both `normalized-input.json` and its exact dataset-origin record. The
existing A12 schema and store remain authoritative, so A29 adds no migration,
second ledger or duplicate row store. Deterministic coverage remains 7/30 and
no new calculation, section, chart, AI interpretation or human decision is
created.

## Research A30: pre-report normalized Metric preparation (implementation)

An exact workspace/source-package/file selection can now be normalized and
materialized into the existing A12 SQLite observation projection before any
calculation or report exists. The immutable preparation binds the verified
workspace snapshot, package manifest/content identity, selected workbook,
manifest and optional labels, canonical normalized input, normalization receipt
and replayable result artifact. Missing, observed zero, observed value,
`UNKNOWN` and the version-bound WIDE policy remain distinct. Migration 0036
adds only the preparation lineage row; normalized rows continue to have one A12
owner. This task runs no M03 calculation, section recipe, chart, AI,
interpretation, review or report creation. It does not yet gate the older direct
calculation/report commands; downstream enforcement is a later slice. Linux CI
is the release gate.

## Research A31: preparation-bound 30-section readiness (implementation)

One exact A30 preparation and exact catalog bytes now produce a deterministic,
closed readiness result before calculation. Every distinct catalog input is
classified as present, absent or invalid with exact evidence references, and
all 30 sections are classified as ready to calculate, blocked or invalid.
Complete frozen labels may retain `UNKNOWN`; the preparation's WIDE policy is
not changed or executed. In the synthetic owner test, only M02, M03, M04 and
M13 are ready for a future calculation. A31 adds no calculation, report,
database mutation, AI interpretation, human review, API or UI.

## Research A32: closed M03 recipe and verified metric set (draft)

A32 is the first calculation consumer gated by A30 preparation and A31
readiness. It produces a deterministic M03 metric set with exact source,
membership, completeness, policy and method lineage. Future chart and narrative
consumers must bind to the same `metricSetSha256`. It adds no chart, AI, report
version, human decision, migration or database write.

## Research A33: M03 chart bundle from exact metric-set identity (draft)

A33 projects one verified A32 metric set into three fixed chart-data specs for
observed revenue, observed units and membership sensitivity. It never reopens
source data or recalculates values. Null remains missing, overlapping scopes are
not additive, and sensitivity is not growth. Rendering and narrative remain
future consumers.

## Research A34: citation-only M03 narrative evidence (draft)

A34 binds exact A32 metric and A33 chart identities into sixteen structured
facts for a future narrative. Every fact carries an exact value or missing
state, coverage, membership, pointer and chart reference. No AI or prose runs;
the envelope only defines what a later author may cite and which unsupported
claims are forbidden.

## Research A35: deterministic M03 factual narrative (draft)

A35 converts the exact A34 claims into six fixed Vietnamese paragraphs. Every
numeric token must copy a cited claim value; missing remains missing and observed
zero remains zero. The output is a deterministic draft, not an AI interpretation
or OWNER-approved conclusion.

## Research A36: deterministic M03 section artifact (draft PR #98)

A36 composes the exact A32 metric set, A33 chart bundle, A34 evidence
envelope and A35 factual narrative into one self-contained Vietnamese HTML
section artifact. Every dependency is verified via its own verifier with
exact lineage; the renderer adds no interpretation beyond what those
dependencies already contain. The result is a closed, versioned receipt
binding the renderer profile, exact dependency digests, and the HTML's
SHA-256/byte size, with a verifier that can replay the full chain from exact
dependencies. Draft PR #98 is open; Linux CI passed on implementation head
`86dd803a49a6dafe444068b7f3851529349296f0` with 176/176 frontend tests,
612/612 repository tests, contract generation, strict TypeScript, production
build and the research report preview (no page error). Windows tests, build
and typecheck were not run by policy.

## Research A37: immutable M03 section-artifact retention ledger (draft PR #99)

A37 retains one exact, verified A36 section artifact as immutable, replayable
application state, keyed by its own `artifactSha256`, together with
deterministic membership for the exact six artifacts required to replay it
(A32 metric set, A33 chart bundle, A34 evidence envelope, A35 factual
narrative, A36 receipt and HTML). Before any durable registration it parses
and verifies every JSON contract, verifies exact digests, replays the full
A32-A36 chain via the existing verifiers/renderer, and compares exact HTML
bytes. Exact retries of identical bytes/identity are mutation-free; reuse of
the identity with changed bytes or metadata fails closed, and failed writes
leave no finalized row, member, active manifest or orphan canonical artifact.
Membership is immutable after finalization via the same repository/trigger
patterns already used elsewhere in the codebase. The one offline CLI takes
explicit database, artifact-root and dependency file paths plus their
declared digests; it never infers "latest", never calculates or calls AI/
provider, and its printed receipt never includes local file paths. This is
layer-two retention only: it does not create a report version,
interpretation, review target, human approval, PDF, UI/API or deployment.
Tests were authored by Codex under the test-audit gate: one service/
integration owner test and one distinct CLI/filesystem-boundary owner test,
neither performing any AI or provider call. Draft PR #99 is open (temporarily
retargeted to `main` to trigger Linux checks; stacked logically on A36 draft
PR #98). Linux CI passed on the final implementation-and-test head
`30d51032229061fa3decf05897605666d910525c`:
[Check](https://github.com/khangpworking/tdn-growth-os/actions/runs/36708237214)
(176/176 frontend tests, 615/615 repository tests, contract generation,
strict TypeScript, production build) and
[Research report preview](https://github.com/khangpworking/tdn-growth-os/actions/runs/36708237136)
(no page error). Windows tests, build and typecheck were not run by policy.
