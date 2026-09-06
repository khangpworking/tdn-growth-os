# Trạng thái hiện tại

Cập nhật: 12/09/2026.

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
- Chưa triển khai: live provider calls, automatic selection, additional calculations, worker, API, frontend, approval/action AI, artifact reconciliation, backup/restore production và deployment.
- Repository GitHub riêng tư: `khangpworking/tdn-growth-os`.
- Các thư mục scaffold không chứng minh năng lực sản phẩm.

## Phần trăm

| Box | Ước tính lịch sử trong hệ thống cũ | Implementation được xác minh trong repo mới |
|---|---:|---|
| 1 — Data | 52% | Foundation, JSON export, finalized numeric Data Packs và exact-byte research document/Research Pack slice đã triển khai; chưa có collectors/automatic selection/production operations |
| 2 — Analysis | 43% | `market_snapshot_v1`, Research Evidence Index, bounded in-pack evidence audit, bounded interpretation và hai governed static skill adapters đã triển khai; chưa có global truth/live provider/business decisions |
| 3 — Orchestrator | 58% | Chưa triển khai |
| 4 — Flow | 62% | Chưa triển khai |
| 5 — Governance | 68% | Chưa triển khai |

Không chuyển nguyên phần trăm cũ sang repo mới. Chỉ cập nhật sau khi code được tái sử dụng, tích hợp và có bằng chứng nghiệm thu. Không tính cài tool hoặc tạo folder là hoàn thành Box.
