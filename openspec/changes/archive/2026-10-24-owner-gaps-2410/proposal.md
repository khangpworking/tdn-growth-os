# Chốt 3 khoảng lệch giữa quy tắc và mã (24/10/2026)

> Trạng thái: chủ đã duyệt ngày 24/10/2026. Chỉ đổi quy tắc cho khớp mã đang chạy. Không đổi mã.

## Why

Khi chuyển quy tắc sang OpenSpec (PR #370), người review tìm ra 3 chỗ quy tắc nói khác mã. Ba chỗ này được ghi ở mục "Điểm chưa xác minh" của `report-pipeline`. Chủ đã chọn cách xử lý cho từng chỗ.

Câu của chủ (24/10/2026): «1. nới quy tắc 2. cái nào dễ hơn thì chọn cái đó 3. được».

## What Changes

- **MODIFIED** R-M10: thiếu ảnh bìa không chặn báo cáo Market. Ảnh bìa trỏ ra ngoài hoặc sai dạng vẫn làm lần dựng lỗi. Thiếu ảnh bìa, hoặc bìa không do AI tạo, chỉ để lại ghi chú cho người đọc soát (chủ chọn "nới quy tắc").
- **MODIFIED** R-P02 (sửa quyết định U-26): hủy lần chạy giữ dữ liệu đã thu và các dòng nhật ký chi phí, không xóa. Mã hiện nay đã làm như vậy. Chủ chọn cách dễ hơn, nên quy tắc đổi theo mã.
- **MODIFIED** R-M03, R-L01: file dấu vết kỹ thuật riêng được ở dạng HTML hoặc `.md`. Mã hiện nay giữ dấu vết dạng HTML (`traceHtml`, artifact ẩn).

## Impact

- Mã: không đổi. `market-14-rules.ts`, `service.ts`, `reports.ts` đã làm đúng như quy tắc mới.
- Tài liệu: `docs/business-spec/decisions/owner-decisions.md` thêm một dòng ngày 24/10/2026. Mục "Điểm chưa xác minh" của `report-pipeline` bỏ 3 dòng khoảng trống này.
- Kiểm thử: không đổi.
