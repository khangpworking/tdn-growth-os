> Trạng thái: **chủ đã duyệt làm bản chạy song song, chưa deploy**. Chủ quyết ngày 04/11/2026: F424, F427 (bộ lọc dùng cho mọi sản phẩm), F429, F430 (2 lượt Jev riêng, không có AI thứ hai khi chạy thật), «ok đồng ý làm» sau khi thống nhất Jev đọc database và lưu kết quả vào database.

## Why

Kết quả theo chủ đề đang lẫn rác và dòng lạc đề, ví dụ tin nhắn nhà mạng trong đánh giá kẽm. Lần thử 04/11 trên 445 dòng cho thấy một lượt Jev riêng phân biệt được rác mà không mất lời chê. Ngưỡng 0,70 được chọn trên chính dữ liệu thử, nên cần đo trên dòng mới trước khi được phép loại thật.

## What Changes

- **ADDED** vào capability `raw-db`: R-RF01 đến R-RF10.
- Migration `0072_raw_db_v1_review_filter.sql`: bảng mới `review_filter_assessment` (chỉ thêm, cấm sửa, cấm xoá) và cột mới `raw_db_autoload.filtering`.
- Module `src/modules/raw-db/review-filter.ts`: lượt lọc, cách quyết định, hỏi Jev.
- `src/modules/raw-db/autoload.ts`: chạy lượt lọc sau khi nạp nguồn, trước khi gán nhãn, khi cờ `TDN_RAW_DB_REVIEW_FILTER_ENABLED` là `true`.
- Lệnh `scripts/raw-db-load.ts`: `--source FILTER`.
- Cập nhật db-v1 trong `data/raw-sources/KHUON-CSDL.md`.

## Impact

- Cơ sở dữ liệu thêm 1 bảng. Bảng cũ không đổi dòng nào.
- Cờ mặc định tắt. Tắt cờ thì app chạy như cũ và không gọi thêm Jev.
- Bật cờ thì mỗi đánh giá có nội dung tốn thêm 1 lượt Jev.
- **Chế độ chạy song song:** số đếm, nhãn, báo cáo và MCP không đọc bảng mới. Kết quả chỉ để đo.

## Ngoài phạm vi

- Loại thật khỏi số đếm hoặc khỏi file đầu ra. Việc này cần chủ duyệt riêng, sau khi đo.
- Chọn bộ chủ đề theo từng sản phẩm.
- Bình luận TikTok, Kalodata, nội dung video, gợi ý Google, Google AI Overview.
- Sửa quy tắc RAC của lớp ý con (R-IM14).
- Deploy và bật cờ trên máy thật.
