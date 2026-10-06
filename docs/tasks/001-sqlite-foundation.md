# Task 001 — SQLite foundation

Status: READY. Lane: Standard. Owner: một implementation agent trong worktree do Orca chỉ định.

## Mục tiêu

Tạo database local mới cho toàn hệ thống; bắt đầu bằng dữ liệu Box 1.
Một đường chạy: nguồn/manual input → raw artifact + metadata → product observation → truy vấn lineage.

## Đọc

- ARCHITECTURE.md, AGENTS.md, docs/PLAN_VI.md.
- references/data-warehouse-master-handoff.html: inventory field, không phải schema bắt buộc.
- Source cũ: <private path on the owner machine, withheld> và worktree Content Studio liên quan; đọc chọn lọc package, SQLite và migration code. Kiểm tra trạng thái source trước khi tái sử dụng; không suy ra source đang chạy từ branch.

## Owned paths

src/platform/db/, src/platform/artifacts/, src/modules/foundation/, migrations/, contracts/foundation/, tests/fixtures/, tests/integration/, scripts/, docs/.
Task này độc quyền migration/schema và package.json/lockfile khi cần dependencies.

## Implement

1. Kiểm tra SQLite driver, runner, module format, Node compatibility; ghi nhận reuse/adapter/rewrite và bằng chứng.
2. Viết data dictionary ngắn: source, ingestion run, artifact/evidence, product identity, observation grain.
3. Platform DB: một file SQLite mới cấu hình rõ; WAL, foreign keys, busy timeout, migration version.
4. Raw bytes ở artifact store theo SHA-256, metadata trong SQLite. Không mở SQL/shell cho model.
5. Schema tối thiểu cho nguồn, ingestion, artifact/evidence, product và observation với lineage; chỉ thêm dimensions mà fixture thực sự cần.
6. Giữ source ID theo namespace; không dùng product_name làm identity. Period revenue khác lifetime revenue; không ép mọi kỳ thành tuần.
7. Missing khác zero. VND số nguyên; lưu đơn vị/scale của phần trăm. Không xem Trends index là search volume.
8. Không cộng trùng observations cùng platform qua các nhà cung cấp. Evidence grade có căn cứ; không tự gán calibrated/verified vì tên nguồn.
9. Manual synthetic input và truy vấn lineage; JSON Schema/AJV tại biên input.
10. Data Pack, collectors, API và UI đi task sau.

## Nghiệm thu

- Khởi tạo database trống và chạy migration lần hai an toàn.
- Invalid FK/required data bị từ chối; transaction không để lại partial record khi lỗi.
- Nhập lại cùng identity theo quy tắc đã ghi không tạo trùng không chủ ý.
- Product observation truy về raw artifact hash, source, ingestion và kỳ quan sát.
- Payload/artifact đọc lại được và hash khớp; tiền không mất độ chính xác.
- Targeted tests bằng fixture synthetic; ghi lệnh và kết quả thực chạy.
- Cập nhật STATUS và handoff, nêu phần thiếu.

Không đụng DB/live artifact/credentials của hệ thống cũ. Không migration/backfill legacy.
Không gọi provider/deploy để chứng minh task database local. Chưa có schema SQL nào được tạo trong scaffold.

