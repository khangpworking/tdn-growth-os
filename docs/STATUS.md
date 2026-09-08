# Trạng thái hiện tại

## Task 015 — file-input implementation, chờ Fedora validation

- Đã ghi quyết định phỏng vấn trong `INTENT.md` và chuẩn bị `docs/tasks/015-on-demand-shopee-research.md`.
- Scope đầu tiên: Metric Shopee → top 5 sản phẩm → 1 listing đại diện/sản phẩm → tối đa 500 comments/listing → raw + filter + cảnh báo thiếu dữ liệu.
- Đã implement local file listing → selection → bounded Apify adapter → raw SQLite/artifacts → callable Python filter → collection summary. Chưa coi là DONE.
- Đã lưu baseline filter ở `references/reuse/shopee_review_filter.v3.py`; adapter đã được so sánh với baseline trên synthetic cases.
- Chỉ xác minh local: 11 focused tests + 9 foundation tests PASS ở lần chạy cuối; typecheck PASS trước khi trả typecheck launcher về bản Linux gốc. Full suite cuối còn lỗi kỳ vọng migration version 10; đã sửa thành 11 nhưng chưa rerun toàn bộ suite sau đó.
- Fedora là môi trường chạy/lưu dữ liệu mục tiêu. Chưa Fedora validation, GitHub CI hoặc live calls. Metric login/extraction được hoãn theo yêu cầu; không cần login Metric để tiếp tục file-input task. Paid smoke sau này cần credentials và budget riêng.
- Handoff chi tiết: `docs/handoffs/015-on-demand-shopee-research.md`.
- Phần bên dưới giữ nguyên trạng thái baseline sau Task 014; không tính tài liệu là năng lực đã xây.

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
- Chưa triển khai: live provider calls, automatic selection, additional calculations, worker, API, frontend, approval/action AI, artifact reconciliation, backup/restore production và deployment.
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
