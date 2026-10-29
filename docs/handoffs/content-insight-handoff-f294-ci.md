# Handoff — Content Insight F294 và sửa CI

Updated: 2026-10-29
Worktree/branch: `wp-content-insight-handoff` / `wp/content-insight-handoff`

Completed:
- Theo F294, bỏ R-C08: truy vấn bản duyệt mới hơn, hai trường trạng thái API, thông báo và nút chọn bản mới, các ca CIH-Q30–Q32. Đã thêm dòng ghi quyết định vào bảng hợp đồng bên ngoài Git.
- Bỏ cách chép dòng sổ báo cáo/lần chạy và sửa artifact trong fixture. Các báo cáo bổ sung nay đi qua dịch vụ Box 2, ở lần chạy riêng; nhiều bản chưa duyệt chỉ được dựng trước quyết định cuối.
- Giữ R-C07: bản gốc và dấu sửa, đọc lại không cần truy vấn nguồn; dữ liệu báo cáo của lần chạy khác không sửa đầu vào ý tưởng/caption đã lưu.
- Giữ nguyên `reader-publish.ts`, R-P10, migration 0062 và sổ quyết định duyệt một lần. Khoảng lệch R-C08 ghi ở handoff kiểm thử trước đã được chủ giải quyết bằng F294.
- Sửa các mốc kiểm migration theo mẫu commit `b7fbb800`: head/user_version 62, danh sách migration có 62, lần chạy thứ hai không áp dụng lại. Kiểm 0061 từ 60 áp dụng đúng `[61, 62]` và vẫn đọc được dữ liệu cũ.
- Kiểm kê có bảng `analysis_insight_report_statements` và ba trigger loại/không sửa/không xóa; số bảng trong kiểm đọc gói nguồn tăng 108→109. Lỗi này xảy ra trước kiểm byte, không phải lỗi xác thực manifest.

Changed paths:
- `src/modules/analysis/insight-report-statements.ts`, `src/api/content-api.ts`, `contracts/api/content-api.{schema.json,generated.ts}`.
- `frontend/src/{InsightPage.tsx,insight-data-source.ts}`, `frontend/tests/content-insight-handoff.test.ts`.
- `tests/helpers/content-insight-handoff-fixture.ts`, hai file kiểm handoff backend và 13 file kiểm migration/đọc gói nguồn có tên trong log CI.
- `openspec/changes/content-insight-handoff/tasks.md`: bỏ phần truy vấn bản mới hơn còn sót ở mục 2.4.

Evidence (Node 24.14.0, Linux):
- 16 file có tên trong phần lỗi của log CI: 131 ca, 123 đạt, 8 TODO có sẵn, 0 trượt/bỏ qua/hủy. Cả 14 lỗi thật của 13 file đã hết. Ba file TODO được chạy và giữ nguyên.
- Sáu file `.test.ts` của PR từ `git diff --name-only origin/main...HEAD -- tests frontend/tests`: 63/63 đạt, không TODO/bỏ qua/hủy (45 backend, 18 component).
- Tổng hai nhóm cuối: 22 file, 194 ca, 186 đạt, 8 TODO có sẵn, 0 trượt. Lượt chẩn đoán handoff trước đó: 29/29 đạt.
- `npm run contracts:generate`, `npm run frontend:validators`, `npm run typecheck`, `npm run frontend:typecheck`, `git diff --check`: đạt.
- Không chạy cả bộ trên máy, browser/E2E/load, AI/provider thật hoặc triển khai. Không truy cập dữ liệu runtime.

Unresolved: Chờ CI Linux tại SHA được đẩy; kết quả cuối và SHA nằm trong `fix-1.md` của lượt Stage 6.
Next action: Đẩy commit đã kiểm, đọc CI tại SHA đó; chỉ merge khi chủ đồng ý.
Business decisions pending: Không có quyết định chặn lượt sửa này.
