# Lỗi đăng nhập nguồn review Shopee là lỗi nguồn có tên, và chủ sửa trên web

> Trạng thái: **đề xuất từ phiên sửa lỗi ngày 26/10/2026**. Mã đã có trong nhánh sửa lỗi; chủ duyệt bản văn R-P17 và R-P18 mới khi gộp.

## Why

Ngày 26/10/2026, hai lần chạy `ef9271ec` và `3d37a21c` ghi 0 đánh giá sau khi máy khởi động lại. `/health` báo `browser: ready` dù phiên Shopee đã mất, nên ứng dụng chỉ phát hiện lỗi sau bước tốn tiền. Lỗi sau đó bị gộp thành `PROVIDER_BLOCKED` / `UNAVAILABLE`, không nói cho chủ biết phải đăng nhập lại.

Luật của chủ: «shopee mất đăng nhập thì chuyển về log báo lỗi nguồn, còn fix nguồn thì phải do web tôi chứ không phải mcp. User mcp sao fix nguồn được». Vì vậy bản này bỏ trạng thái «chờ đăng nhập» của bản nháp: lần chạy ghi một lỗi nguồn có tên rồi tiếp tục như các lỗi nguồn khác; chỉ chủ, trên trang lần chạy, mới mở và xác nhận phiên đăng nhập. Không có công cụ MCP nào mở hay sửa phiên.

## What Changes

- **ADDED** R-P17: trước lần nộp job review đầu tiên, lần chạy SHALL kiểm phiên bộ thu bằng `GET /session` (chỉ tin khi mới, đã xác thực, không quá 10 phút) hoặc một lần `POST /session/check`; SHALL NOT kết luận «đã đăng nhập» từ `/health`. Mỗi lượt thu gọi kiểm tối đa một lần. Phiên chưa sẵn sàng SHALL thành mã đích danh `SHOPEE_LOGIN_REQUIRED`, `SHOPEE_VERIFICATION_REQUIRED` hoặc `SHOPEE_COLLECTOR_DOWN`, có câu tiếng Việt trong nhật ký và trạng thái nguồn; SHALL NOT dùng câu chung `PROVIDER_BLOCKED` / `UNAVAILABLE`. Sản phẩm sau điểm dừng giữ `NOT_SUBMITTED`; lần chạy vẫn dựng báo cáo và báo phần review thiếu vì nguồn mất đăng nhập. `HEALTH_NOT_READY` với `browser` là `needs_login` / `awaiting_user_login` SHALL thành `HUMAN_LOGIN_REQUIRED`; `needs_verification` thành `HUMAN_VERIFICATION_REQUIRED`. Mã mới SHALL có trong mọi danh sách đóng của hợp đồng, kiểu dữ liệu và nhãn giao diện để không mã lạ nào hiện thô. API đọc (kể cả người gọi MCP) chỉ trả mã và câu, không có thao tác.
- **ADDED** R-P18: chỉ chủ đã đăng nhập trên web, qua `owner-api`, mới sửa được phiên. `POST …/runs/{id}/shopee-session/login` SHALL gọi `POST /session/login` và trả `AWAITING_USER_LOGIN`; `POST …/runs/{id}/shopee-session/confirm` SHALL gọi `POST /session/check`, và nếu `ready` thì gọi `POST /session/background`, rồi trả `READY` hoặc mã đã ánh xạ. Hai lệnh SHALL dùng cùng xác thực chủ và `requestKey` idempotent như `auto-run/retry`; một khóa đã nhận SHALL trả lại đúng biên nhận cũ mà không gọi bộ thu lần nữa. Lệnh SHALL chỉ nhận khi lần chạy đang có một trong ba lỗi nguồn mới. Trang lần chạy SHALL hiện lỗi nguồn và ba nút theo thứ tự «Đăng nhập Shopee», «Tôi đã đăng nhập xong», «Thu lại đánh giá», chỉ cho chủ đã đăng nhập. Ứng dụng SHALL NOT tự đăng nhập, nhập mật khẩu, giải xác minh, hay gọi `/session/login` khi chủ chưa bấm. Token bộ thu SHALL NOT xuất hiện trong phản hồi, trang hay log.
- Không thêm công cụ MCP hoặc thay đổi MCP nào.

## Impact

- Mã: `src/platform/collectors/shopee-public-reviews.ts` (`ShopeePublicReviewSessionClient`, `checkPublicReviewSession`); `src/modules/analysis/research-automation/exact-shopee-outcome.ts` (mã kết quả, câu, giới hạn nguồn); `public-shopee-bridge.ts`, `service.ts` (kiểm phiên trước khi nộp, nhật ký nguồn, `humanBlocked`, lệnh sửa phiên, sổ yêu cầu); `public-review-report.ts`, `test-review-sample.ts` (câu báo cáo); `contracts/foundation/shopee-public-collection.schema.json`, `contracts/api/research-automation-api.schema.json` và bản sinh; `src/api/research-automation-api.ts`; `frontend/src/research-automation/api.ts`, `run-status.ts`, `RunView.tsx`.
- Bảng: `research_automation_shopee_sessions` (0061, sổ yêu cầu của hai lệnh sửa phiên).
- Không đổi nguồn, không đổi cờ môi trường, không đổi dữ liệu đã lưu, không đổi cách thu hay chi phí.
- Không đổi dịch vụ bộ thu `~/apps/shopee-private-api`.

## Ngoài phạm vi

- R-P19 «Thu lại đánh giá» sau khi đăng nhập: nút thứ ba hiện bị tắt. Việc mở lần thử mới cần lược đồ lần thử (khóa `runKey` có hậu tố không qua được ràng buộc `run_key` duy nhất và mẫu hợp đồng, cùng immutable journal) nên là thay đổi riêng, có duyệt riêng.
- Mã `HEALTH_NOT_READY` của các lần chạy cũ không được ánh xạ hồi tố: giá trị `browser` của `/health` chưa từng được lưu, nên các lần chạy cũ giữ câu chung.
- Tự động đăng nhập, lưu mật khẩu, giải xác minh, hoặc bất kỳ đường MCP nào.
