# Handoff — Content Insight handoff, mã triển khai

Updated: 2026-10-29
Worktree/branch: `wp-content-insight-handoff` / `wp/content-insight-handoff`

Completed:
- Hoàn thành 14 mục nhóm 2–4; OpenSpec hiện 16/24 mục hoàn thành.
- Hợp đồng câu insight đóng, type sinh từ schema; migration 0062; dịch vụ lưu và giao diện truy vấn của Box 2.
- Box 4 nhận một câu đã duyệt, giữ bản gốc, xác nhận thay nháp, chặn bản đã chốt; tạo chiến dịch và Insight trong cùng giao dịch sau khi chuẩn bị artifact.
- API đọc/chọn/gửi; dropdown, thẻ câu, khung «Từ báo cáo», dấu sửa, thông báo bản mới; gửi từ trang bản đọc sang chiến dịch có sẵn hoặc biểu mẫu đầy đủ.
- Snapshot đi vào lớp khóa Big Idea và Angle; không sửa prompt chủ viết hoặc prompt sáng tạo.
- Theo câu trả lời F293: giữ nguyên biểu mẫu tạo chiến dịch và sổ quyết định một lần. Không thêm bỏ duyệt hoặc cảnh báo từ chối sau khi dùng.

Changed paths:
- `contracts/{analysis,flow,api}/`: hợp đồng và type liên quan.
- `migrations/0062_content_insight_handoff.sql`.
- `src/modules/analysis/insight-report-statements.ts`, export và hàm đọc scope đã xác minh trong `reader-report-revisions.ts`.
- `src/modules/flow/`: dịch vụ Insight, chuẩn bị tạo chiến dịch, lớp khóa ý tưởng, validation.
- `src/api/content-api.ts`; `frontend/src/`: chọn/gửi câu, biểu mẫu chiến dịch, trang Insight, trang bản đọc và routing.
- Hai script sinh hợp đồng/validator; `openspec/changes/content-insight-handoff/tasks.md`.

Evidence:
- Node 24.14.0; `npm ci` cho worktree này.
- Sinh hợp đồng, typecheck backend, typecheck frontend, build frontend và `git diff --check`: đạt.
- 31 file kiểm thử có sẵn: 300/306 ca đạt. Chạy lại 18 ca core sau sửa cuối: 18/18 đạt.
- Reader: 98/98; Content backend: 89/93; frontend chính: 80/82; frontend bổ sung: 33/33.
- Không chạy `npm run check`: brief chung cấm chạy cả bộ trên máy.
- Không viết/sửa kiểm thử; không gọi AI thật, nguồn trả phí hoặc triển khai; không truy cập dữ liệu runtime.

Unresolved:
- `tests/integration/content-insight-api.test.ts`: một ca AJV chưa đăng ký schema câu insight mới.
- `tests/integration/content-package-api.test.ts`: ba ca AJV cùng lỗi dependency. Worker của file này còn giữ tài nguyên sau lỗi; đã dừng đúng worker do lượt kiểm này tạo.
- Hai ca unmount trong `frontend/tests/content-insight-page.test.ts` chưa xử lý GET danh sách báo cáo mới trong hàng đợi fetch giả.
- Phiên tester cần thêm schema câu insight và API danh sách báo cáo vào registry AJV của các kiểm thử bị ảnh hưởng, xử lý GET mới, rồi chứng minh từng dòng hợp đồng bằng dữ liệu giả.
- Cần kiểm độc lập migration trên DB giả đã có lịch sử/khóa, rollback tạo chiến dịch, đầu vào prompt, snapshot và các đường gọi API trực tiếp. Các kiểm có sẵn không chứng minh toàn bộ tính năng mới.
- Tính đúng ngữ pháp/ngôi thứ ba của câu insight là tiêu chí người đọc; không thêm bộ phân loại ngữ nghĩa.

Next action: Phiên Sol tester riêng viết kiểm thử theo hợp đồng, sau đó phiên reviewer riêng rà soát. Chưa đủ điều kiện merge/deploy.
Business decisions pending: Không có quyết định chặn mã; bộ viết câu insight và chính sách bỏ duyệt tương lai ngoài phạm vi.
