# Trạng thái hiện tại

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
