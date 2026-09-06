# Task 003 — Multi-row JSON export ingestion

Status: READY. Lane: Standard. Owner: một implementation agent trong worktree do Orca chỉ định.

## Mục tiêu

Thêm một đường Box 1 hẹp nhưng thực tế hơn:

```text
synthetic provider-shaped JSON export bytes
 -> validate contract
 -> exact-byte artifact
 -> one ingestion + one evidence record
 -> many products/observations
 -> lineage back to the same source file
```

Fixture phải là dữ liệu tổng hợp dựa trên nhóm field Product Card của Metric.vn trong `references/data-warehouse-master-handoff.html`. Không dùng dữ liệu thật hoặc gọi provider.

## Đọc

- `AGENTS.md`
- `ARCHITECTURE.md` phần Data, Artifacts, Migrations và Testing
- `docs/STATUS.md`
- `docs/foundation-data-dictionary.md`
- Task 001 implementation và tests
- Chỉ phần Metric.vn Product Card field inventory trong reference handoff

## Owned paths

- `contracts/foundation/`
- `src/modules/foundation/`
- `scripts/`
- `tests/fixtures/`
- `tests/integration/`
- `docs/foundation-data-dictionary.md`
- `docs/STATUS.md`
- `docs/handoffs/003-json-export-ingestion.md`

Không thay migration/schema trừ khi có bằng chứng schema hiện tại không thể đáp ứng đường chạy này. Không sửa CI, dependency hoặc module Box khác.

## Contract tối thiểu

Tạo JSON Schema canonical và generated TypeScript type cho một export:

- `contractVersion: "1.0.0"`
- source: namespaced ID, display name, `sourceType: "provider_export"`
- ingestion: idempotency key, acquisition timestamp, `mediaType: "application/json"`, evidence grade + basis
- một period chung: start, end, grain, scope
- `rows`: ít nhất một product row

Mỗi row chỉ cần các field đã có business meaning trong foundation:

- `platform`
- `platformProductId`
- `productName`
- optional `periodRevenueVnd`
- optional `periodUnitsSold`
- optional `lifetimeRevenueVnd`
- optional scaled `revenueGrowth`

Mỗi row phải có ít nhất một metric. Không thêm price, rating, shop, brand, category hoặc image khi chưa có consumer.

## Behavior

1. CLI/service nhận exact file bytes, parse JSON và validate bằng AJV trước khi ghi artifact hoặc database.
2. Artifact digest và bytes phải là exact input bytes, kể cả whitespace; không canonicalize file trước khi lưu.
3. Một file tạo một ingestion, một evidence record và một artifact manifest; mọi observation của file nối lineage về cùng evidence.
4. Reuse product/observation identity và missing-vs-zero rules từ Task 001.
5. Dedupe các identity lặp trong cùng file nếu value/unit/scale giống nhau; reject toàn bộ import nếu cùng identity có value xung đột.
6. Reimport cùng `(source_id, idempotency_key)` và cùng exact bytes trả kết quả idempotent. Cùng key nhưng bytes khác phải reject.
7. Toàn bộ authoritative database write của file nằm trong một transaction. Artifact-before-database caveat hiện có vẫn được ghi rõ.
8. Giữ timestamp strings như input nhưng so sánh period bằng actual instants.
9. Không tự suy luận evidence grade từ source name.

## Nghiệm thu

Focused integration tests phải chứng minh:

- JSON không hợp lệ/contract invalid bị reject trước mọi write.
- Exact bytes round-trip và SHA-256 khớp.
- Một fixture có ít nhất hai products tạo đúng observations và cùng lineage file.
- Missing khác zero; integer VND giữ chính xác.
- Reimport same key/same bytes không tạo duplicate.
- Same key/different bytes bị reject.
- Duplicate identity cùng value được dedupe; conflicting value rollback không để partial authoritative state.
- Offset timestamp ordering hoạt động như Task 001.
- `npm run check` pass và GitHub PR gate xanh.
- Không còn runtime database, WAL/SHM, temp artifact, env hoặc credential file.

## Không thuộc scope

Real provider/API/browser, XLSX/CSV parser, scheduling, Data Pack, aggregation, UI, worker, backup/restore, retention execution và legacy migration.

## Business decision để lại

Mapping khi export không có stable platform product ID vẫn pending Data Owner. Fixture Task 003 phải cung cấp ID tổng hợp rõ ràng; không dùng `productName` làm identity.
