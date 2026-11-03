> Trạng thái: **đề xuất, chờ chủ duyệt**. Mã viết trên nhánh `wp/raw-db-autoload`. Kiểm thử do lane Sol viết trên nhánh `wp/raw-db-autoload-tests`. Chủ quyết ngày 03/11/2026 (F368) và 04/11/2026 (F389): đánh giá TikTok Shop (S06) vào db-v1 và được gán chủ đề; sau mỗi lần chạy, app tự nạp cả 7 nguồn db-v1 của lần chạy đó rồi gán chủ đề, không còn là bước làm tay.

## Why

Sau change `raw-db-labels`, đánh giá chỉ vào db-v1 khi có người chạy `raw-db-load` bằng tay, và chỉ đánh giá Shopee (S05) được gán chủ đề. Chủ muốn bỏ hai giới hạn đó (F367): việc nạp phải tự chạy sau mỗi lần chạy, và đánh giá TikTok Shop (S06) cũng có nhãn. F389 mở rộng: cả 7 nguồn db-v1 (S05, S06, S07, S02b, S14, S19b, S29) đều tự nạp.

## What Changes

- **ADDED** vào capability `raw-db`: R-RA01 đến R-RA10.
- Module `src/modules/raw-db/tiktok-shop-reviews-loader.ts`: nạp S06 từ các lần gọi `kalodata.product.comment.insight` đã lưu của lần chạy; `raw-db-load --source S06 --run <id> [--dry-run]`.
- `review-labeller.ts`: đánh giá sản phẩm TikTok Shop cũng đủ điều kiện; yêu cầu gửi Jev mang nền tảng của chính đánh giá.
- Module `src/modules/raw-db/autoload.ts`: chuỗi tự nạp (S05, S06, S07, S02b, S14, S19b, S29, rồi gán) và `RawDbAutoloader` của app; `raw-db-load --source AUTOLOAD --run <id> [--dry-run]`.
- Điểm móc: `ResearchAutomationService` gọi `onCollectionFinal` khi bước `COLLECTION` xong với `SUCCEEDED` hoặc `PARTIAL` và lần chạy chuyển sang dựng báo cáo, sau khi giao dịch đó đã ghi. Máy chủ (`operator-app.ts`) nối móc này khi `TDN_RAW_DB_AUTOLOAD_ENABLED=true` và có quyền ghi OWNER, và chép bản chụp cơ sở dữ liệu app mỗi 10 phút.
- Migration `0070_raw_db_autoload.sql`: bảng `raw_db_autoload` (STRICT, chỉ thêm).
- `app-db-snapshot.ts`: `tryPublishAppDbSnapshot` (không ném lỗi) và `startAppDbSnapshotTimer`.
- Cập nhật db-v1 §3 (cột S06, quy tắc 7), §3.3 (đủ điều kiện), §5.0 (thứ tự nạp, tự nạp), §5 (SQL), TL;DR.

## Impact

- Cơ sở dữ liệu: thêm một bảng; bảng cũ không đổi. Kiểm thử ghim số migration đổi từ 69 sang 70; số bảng từ 122 lên 123.
- Không có cờ thì không có gì chạy tự động; lệnh CLI vẫn như cũ.
- Gọi Jev có trả tiền khi `TDN_RESEARCH_JEV_ENABLED=true` và có `TYPESAFE_API_KEY`; mỗi lượt gán gọi nhiều nhất `limits.maxCallsPerRun` lần.
- Lần chạy, bước và báo cáo không đổi: việc nạp chạy sau, trên kết nối riêng, mọi lỗi đều được bắt và ghi lại.

## Ngoài phạm vi

- `review_point` (ý khen, chê do AI của nguồn, §3.1).
- Nạp bù tự động cho lần chạy đã qua bước thu trước khi bật cờ hoặc khi app tắt giữa chừng (dùng `--source AUTOLOAD`).
- Đổi lời báo cáo, cờ có sẵn, nhãn nguồn; triển khai.
