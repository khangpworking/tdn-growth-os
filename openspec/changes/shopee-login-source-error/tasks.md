## 0. Trước khi làm

- [x] 0.1 Đọc `DIAG-SHP.md` và luật của chủ 26/10/2026: lỗi mất đăng nhập là lỗi nguồn có tên; chỉ chủ sửa trên web, không qua MCP
- [x] 0.2 Bỏ trạng thái «chờ đăng nhập» của bản nháp; lần chạy tiếp tục như lỗi nguồn khác
- [x] 0.3 Lấy số R trống kế tiếp: R-P17 và R-P18 (R-P16 thuộc `provider-unavailable-stop-cause`)

## 1. Mã (một người viết mã)

- [x] 1.1 Thêm `ShopeePublicReviewSessionClient` và `checkPublicReviewSession`; tin `GET /session` chỉ khi mới, đã xác thực; nếu không thì một `POST /session/check`
- [x] 1.2 Kiểm phiên trước lần nộp job review đầu tiên; mỗi lượt thu kiểm tối đa một lần; không dùng `/health` để kết luận đã đăng nhập
- [x] 1.3 Ánh xạ `HEALTH_NOT_READY` sang `HUMAN_LOGIN_REQUIRED` / `HUMAN_VERIFICATION_REQUIRED`; sửa `humanBlocked`
- [x] 1.4 Thêm `SHOPEE_LOGIN_REQUIRED`, `SHOPEE_VERIFICATION_REQUIRED`, `SHOPEE_COLLECTOR_DOWN` vào kiểu kết quả, danh sách đóng, hợp đồng nguồn và API, nhãn giao diện
- [x] 1.5 Ghi câu tiếng Việt vào nhật ký/trạng thái nguồn và phần giới hạn báo cáo; không dùng câu chung `PROVIDER_BLOCKED` / `UNAVAILABLE`
- [x] 1.6 Thêm bảng sổ yêu cầu `research_automation_shopee_sessions` (0061)
- [x] 1.7 Thêm lệnh `shopee-session/login` và `shopee-session/confirm` trong `owner-api`; xác thực chủ, exact Origin, `requestKey` idempotent; chỉ nhận khi lần chạy có lỗi nguồn mới
- [x] 1.8 Trang lần chạy: câu lỗi nguồn và ba nút, chỉ cho chủ đã đăng nhập; không tự đăng nhập; token bộ thu chỉ ở máy chủ
- [x] 1.9 Không thêm công cụ MCP hoặc thay đổi MCP

## 2. Kiểm thử (phiên khác người viết mã)

- [x] 2.1 T1 `/health` ready nhưng `/session/check` `needs_login`: mã `SHOPEE_LOGIN_REQUIRED`, chưa nộp job, lần chạy vẫn dựng báo cáo (`tests/unit/shopee-session-source-error.test.ts` «SHP detection regression: restarted collector with stale ready cannot submit after needs_login», «SHP named source error needs_login continues to report without automatic login»)
- [x] 2.2 T2 `GET /session` mới và đã xác thực: không gọi `POST /session/check` (`tests/unit/shopee-session-source-error.test.ts` «SHP fresh authenticated ready age=… submits all products without a check or login»)
- [x] 2.3 T3 `needs_verification` và lỗi kết nối/5xx: đúng mã `SHOPEE_VERIFICATION_REQUIRED` / `SHOPEE_COLLECTOR_DOWN` (`tests/unit/shopee-session-source-error.test.ts` «SHP named source error needs_verification / network / HTTP 503 …»)
- [x] 2.4 T4 đối chứng âm: HTTP 422 và phản hồi sai cấu trúc vẫn là `PROVIDER_BLOCKED` (`tests/unit/shopee-public-reviews.test.ts` «S2 HTTP 422 stops without retry» và các ca `PROVIDER_BLOCKED`)
- [x] 2.5 T5 lệnh chủ: login trả `AWAITING_USER_LOGIN`; confirm `check ready` gọi `background` và trả `READY`; confirm chưa ready trả mã đã ánh xạ (`tests/integration/shopee-session-owner-api.test.ts` «SHP F2: owner login reservation and request journal are durable before dispatch and accepted afterward», «SHP confirm … never calls background or login»)
- [x] 2.6 T6 lặp `requestKey` không gọi bộ thu lần nữa; sai token/Origin bị từ chối (`tests/integration/shopee-session-owner-api.test.ts` «SHP owner request validation and conflicting request keys never repeat a collector action», «SHP owner routes enforce auth, exact Origin, owner writes and method before any collector call»)
- [x] 2.7 T7 token bộ thu không xuất hiện trong biên nhận hay log (`tests/integration/shopee-session-owner-api.test.ts` «SHP collector token echoes and thrown errors cannot reach responses, receipts or logs»)
- [x] 2.8 CI Linux xanh tại SHA cuối (PR #419, merge ngày 27/10/2026 → `30902d63`)

## 3. Sau khi gộp

- [ ] 3.1 Archive change này để R-P17 và R-P18 vào `openspec/specs/report-pipeline/spec.md`
- [ ] 3.2 Mở thay đổi riêng cho R-P19 «Thu lại đánh giá» khi có lược đồ lần thử: `runKey` có hậu tố, ràng buộc `run_key` duy nhất, mẫu hợp đồng, dùng lại journal đã xong
