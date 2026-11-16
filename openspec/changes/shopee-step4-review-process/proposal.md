> Trạng thái: **đề xuất, chờ chủ duyệt**. Chủ quyết ngày 16/11/2026: F577 đến F586 (bước 4 «Lưu và phân loại» tự chạy sau bước 3; lọc rồi mới gắn chủ đề; không hỏi xác nhận phí; thử lại tự động 3 lần). F583 (có gắn chủ đề cho dòng UNRESOLVED không) **chưa quyết**.

## Why

Bước 4 của app Shopee dùng kết quả lọc để chọn dòng được gắn chủ đề: chỉ dòng KEEP. Quy tắc R-RF09 (`openspec/changes/review-filter-shadow/specs/raw-db/spec.md`) đang nói: ngoài lượt lọc, không module nào đọc `review_filter_assessment`, và gắn nhãn cho cùng kết quả dù có dòng EXCLUDE. Bước 4 đổi điều này, nhưng chỉ cho luồng module Shopee. Mã đã làm theo quyết định của chủ; quy tắc chưa đổi, nên chủ cần duyệt bản này.

## What Changes

- **MODIFIED** R-RF09: thêm một ngoại lệ cho bước 4 của luồng module Shopee (bộ dữ liệu `module-m3:<lượt>:<nguồn>`).
- **ADDED** R-RF11: bước 4 chỉ gắn chủ đề cho dòng KEEP; thêm UNRESOLVED khi `labelUnresolved` trong `skills/tdn-shopee-flow/modules.json` là `true` (mặc định `false`).
- R-RL03 (dòng đủ điều kiện gắn nhãn) hẹp lại cho luồng này. Lượt nạp tự động của web app (R-RF08, R-RL06) không đổi.

## Impact

- Dòng EXCLUDE của bước 4 vẫn được lưu nhưng không được gắn chủ đề mới. Nhãn cũ không xoá được (bảng chỉ thêm); biên nhận báo `olderLabelsOnNotKept`.
- Lời chê trong dòng UNRESOLVED (sao thấp, không sao, có than phiền) không có chủ đề khi `labelUnresolved` là `false`. Biên nhận và thẻ bước 4 hiện số dòng này.
- Ngưỡng 0,70 mới đo trên thực phẩm chức năng.

## Ngoài phạm vi

- Lượt nạp tự động và báo cáo của web app.
- Ẩn nhãn cũ của dòng không KEEP trên trang kết quả.
- Quyết định F583 về UNRESOLVED.
